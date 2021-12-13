//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import { ethers } from 'ethers';
import { sha256 } from 'multiformats/hashes/sha2';
import { CID } from 'multiformats/cid';
import _ from 'lodash';

import { EthClient } from '@vulcanize/ipld-eth-client';
import * as codec from '@ipld/dag-cbor';

import {
  IPLDDatabaseInterface,
  IndexerInterface,
  BlockProgressInterface,
  IPLDBlockInterface,
  HookStatusInterface
} from './types';
import { Indexer } from './indexer';
import { ServerConfig } from './config';
import { IPFSClient } from './ipfs';
import {
  STATE_KIND_INIT,
  STATE_KIND_DIFF_STAGED,
  STATE_KIND_DIFF,
  STATE_KIND_CHECKPOINT
} from './constants';
import { JobQueue } from './job-queue';

export class IPLDIndexer extends Indexer {
  _serverConfig: ServerConfig;
  _ipldDb: IPLDDatabaseInterface;
  _ipfsClient: IPFSClient;

  constructor (
    serverConfig: ServerConfig,
    ipldDb: IPLDDatabaseInterface,
    ethClient: EthClient,
    postgraphileClient: EthClient,
    ethProvider: ethers.providers.BaseProvider,
    jobQueue: JobQueue,
    ipfsClient: IPFSClient
  ) {
    super(ipldDb, ethClient, postgraphileClient, ethProvider, jobQueue);

    this._serverConfig = serverConfig;
    this._ipldDb = ipldDb;
    this._ipfsClient = ipfsClient;
  }

  getIPLDData (ipldBlock: IPLDBlockInterface): any {
    return codec.decode(Buffer.from(ipldBlock.data));
  }

  async pushToIPFS (data: any): Promise<void> {
    await this._ipfsClient.push(data);
  }

  isIPFSConfigured (): boolean {
    const ipfsAddr = this._serverConfig.ipfsApiAddr;

    // Return false if ipfsAddr is undefined | null | empty string.
    return (ipfsAddr !== undefined && ipfsAddr !== null && ipfsAddr !== '');
  }

  async getLatestHooksProcessedBlock (hookStatus: HookStatusInterface): Promise<BlockProgressInterface> {
    const blocksAtHeight = await this.getBlocksAtHeight(hookStatus.latestProcessedBlockNumber, false);

    // There can exactly one block at hookStatus.latestProcessedBlockNumber height.
    assert(blocksAtHeight.length === 1);

    return blocksAtHeight[0];
  }

  async processCheckpoint (indexer: IndexerInterface, blockHash: string, checkpointInterval: number): Promise<void> {
    // Get all the contracts.
    assert(this._ipldDb.getContracts);
    const contracts = await this._ipldDb.getContracts();

    // For each contract, merge the diff till now to create a checkpoint.
    for (const contract of contracts) {
      // Check if contract has checkpointing on.
      if (contract.checkpoint) {
        await this.createCheckpoint(indexer, contract.address, blockHash, null, checkpointInterval);
      }
    }
  }

  async processCLICheckpoint (indexer: IndexerInterface, contractAddress: string, blockHash?: string): Promise<string | undefined> {
    const checkpointBlockHash = await this.createCheckpoint(indexer, contractAddress, blockHash);
    assert(checkpointBlockHash);

    // Push checkpoint to IPFS if configured.
    if (this.isIPFSConfigured()) {
      const block = await this.getBlockProgress(checkpointBlockHash);
      const checkpointIPLDBlocks = await this._ipldDb.getIPLDBlocks({ block, contractAddress, kind: STATE_KIND_CHECKPOINT });

      // There can be at most one IPLDBlock for a (block, contractAddress, kind) combination.
      assert(checkpointIPLDBlocks.length <= 1);
      const checkpointIPLDBlock = checkpointIPLDBlocks[0];

      const checkpointData = this.getIPLDData(checkpointIPLDBlock);
      await this.pushToIPFS(checkpointData);
    }

    return checkpointBlockHash;
  }

  async createInit (
    indexer: IndexerInterface,
    blockHash: string,
    blockNumber: number
  ): Promise<void> {
    // Get all the contracts.
    assert(this._ipldDb.getContracts);
    const contracts = await this._ipldDb.getContracts();

    // Create an initial state for each contract.
    for (const contract of contracts) {
      // Check if contract has checkpointing on.
      if (contract.checkpoint) {
        // Check if a 'diff' | 'checkpoint' ipldBlock already exists or blockNumber is < to startingBlock.
        const existingIpldBlock = await this._ipldDb.getLatestIPLDBlock(contract.address, null);

        if (existingIpldBlock || blockNumber < contract.startingBlock) {
          continue;
        }

        // Call initial state hook.
        assert(indexer.createInitialState);
        const stateData = await indexer.createInitialState(contract.address, blockHash);

        const block = await this.getBlockProgress(blockHash);
        assert(block);

        const ipldBlock = await this.prepareIPLDBlock(block, contract.address, stateData, STATE_KIND_INIT);
        await this.saveOrUpdateIPLDBlock(ipldBlock);

        // Push initial state to IPFS if configured.
        if (this.isIPFSConfigured()) {
          const ipldData = this.getIPLDData(ipldBlock);
          await this.pushToIPFS(ipldData);
        }
      }
    }
  }

  async createDiffStaged (contractAddress: string, blockHash: string, data: any): Promise<void> {
    const block = await this.getBlockProgress(blockHash);
    assert(block);

    // Create a staged diff block.
    const ipldBlock = await this.prepareIPLDBlock(block, contractAddress, data, STATE_KIND_DIFF_STAGED);
    await this.saveOrUpdateIPLDBlock(ipldBlock);
  }

  async finalizeDiffStaged (blockHash: string): Promise<void> {
    const block = await this.getBlockProgress(blockHash);
    assert(block);

    // Get all the staged diff blocks for the given blockHash.
    const stagedBlocks = await this._ipldDb.getIPLDBlocks({ block, kind: STATE_KIND_DIFF_STAGED });

    // For each staged block, create a diff block.
    for (const stagedBlock of stagedBlocks) {
      const data = codec.decode(Buffer.from(stagedBlock.data));
      await this.createDiff(stagedBlock.contractAddress, stagedBlock.block.blockHash, data);
    }

    // Remove all the staged diff blocks for current blockNumber.
    await this.removeIPLDBlocks(block.blockNumber, STATE_KIND_DIFF_STAGED);
  }

  async createDiff (contractAddress: string, blockHash: string, data: any): Promise<void> {
    const block = await this.getBlockProgress(blockHash);
    assert(block);

    // Fetch the latest checkpoint for the contract.
    const checkpoint = await this._ipldDb.getLatestIPLDBlock(contractAddress, STATE_KIND_CHECKPOINT);

    // There should be an initial state at least.
    if (!checkpoint) {
      // Fetch the initial state for the contract.
      const initState = await this._ipldDb.getLatestIPLDBlock(contractAddress, STATE_KIND_INIT);
      assert(initState, 'No initial state found');
    } else {
      // Check if the latest checkpoint is in the same block.
      assert(checkpoint.block.blockHash !== block.blockHash, 'Checkpoint already created for the block hash');
    }

    const ipldBlock = await this.prepareIPLDBlock(block, contractAddress, data, STATE_KIND_DIFF);
    await this.saveOrUpdateIPLDBlock(ipldBlock);
  }

  async createCheckpoint (indexer: IndexerInterface, contractAddress: string, blockHash?: string, data?: any, checkpointInterval?: number): Promise<string | undefined> {
    // Get current hookStatus.
    const hookStatus = await this._ipldDb.getHookStatus();
    assert(hookStatus);

    // Getting the current block.
    let currentBlock;

    if (blockHash) {
      currentBlock = await this.getBlockProgress(blockHash);
    } else {
      // In case of empty blockHash from checkpoint CLI, get the latest processed block from hookStatus for the checkpoint.
      currentBlock = await this.getLatestHooksProcessedBlock(hookStatus);
    }

    assert(currentBlock);

    // Data is passed in case of checkpoint hook.
    if (data) {
      // Create a checkpoint from the hook data without being concerned about diffs.
      const ipldBlock = await this.prepareIPLDBlock(currentBlock, contractAddress, data, STATE_KIND_CHECKPOINT);
      await this.saveOrUpdateIPLDBlock(ipldBlock);

      return;
    }

    // If data is not passed, create from previous 'checkpoint' | 'init' and diffs after that.

    // Make sure the block is marked complete.
    assert(currentBlock.isComplete, 'Block for a checkpoint should be marked as complete');

    // Make sure the hooks have been processed for the block.
    assert(currentBlock.blockNumber <= hookStatus.latestProcessedBlockNumber, 'Block for a checkpoint should have hooks processed');

    // Call state checkpoint hook and check if default checkpoint is disabled.
    assert(indexer.createStateCheckpoint);
    const disableDefaultCheckpoint = await indexer.createStateCheckpoint(contractAddress, currentBlock.blockHash);

    if (disableDefaultCheckpoint) {
      // Return if default checkpoint is disabled.
      // Return block hash for checkpoint CLI.
      return currentBlock.blockHash;
    }

    // Fetch the latest 'checkpoint' | 'init' for the contract.
    let prevNonDiffBlock: IPLDBlockInterface;
    let getDiffBlockNumber: number;
    const checkpointBlock = await this._ipldDb.getLatestIPLDBlock(contractAddress, STATE_KIND_CHECKPOINT, currentBlock.blockNumber);

    if (checkpointBlock) {
      prevNonDiffBlock = checkpointBlock;
      getDiffBlockNumber = checkpointBlock.block.blockNumber;

      // Check (only if checkpointInterval is passed) if it is time for a new checkpoint.
      if (checkpointInterval && checkpointBlock.block.blockNumber > (currentBlock.blockNumber - checkpointInterval)) {
        return;
      }
    } else {
      // There should be an initial state at least.
      const initBlock = await this._ipldDb.getLatestIPLDBlock(contractAddress, STATE_KIND_INIT);
      assert(initBlock, 'No initial state found');

      prevNonDiffBlock = initBlock;
      // Take block number previous to initial state block to get diffs after that.
      getDiffBlockNumber = initBlock.block.blockNumber - 1;
    }

    // Fetching all diff blocks after the latest 'checkpoint' | 'init'.
    const diffBlocks = await this._ipldDb.getDiffIPLDBlocksByBlocknumber(contractAddress, getDiffBlockNumber);

    const prevNonDiffBlockData = codec.decode(Buffer.from(prevNonDiffBlock.data)) as any;
    data = {
      state: prevNonDiffBlockData.state
    };

    for (const diffBlock of diffBlocks) {
      const diff = codec.decode(Buffer.from(diffBlock.data)) as any;
      data.state = _.merge(data.state, diff.state);
    }

    const ipldBlock = await this.prepareIPLDBlock(currentBlock, contractAddress, data, STATE_KIND_CHECKPOINT);
    await this.saveOrUpdateIPLDBlock(ipldBlock);

    return currentBlock.blockHash;
  }

  async prepareIPLDBlock (block: BlockProgressInterface, contractAddress: string, data: any, kind: string):Promise<any> {
    assert(_.includes([
      STATE_KIND_INIT,
      STATE_KIND_DIFF_STAGED,
      STATE_KIND_DIFF,
      STATE_KIND_CHECKPOINT
    ], kind));

    // Get an existing 'init' | 'diff' | 'diff_staged' | 'checkpoint' IPLDBlock for current block, contractAddress.
    const currentIPLDBlocks = await this._ipldDb.getIPLDBlocks({ block, contractAddress, kind });

    // There can be at most one IPLDBlock for a (block, contractAddress, kind) combination.
    assert(currentIPLDBlocks.length <= 1);
    const currentIPLDBlock = currentIPLDBlocks[0];

    // Update currentIPLDBlock of same kind if it exists.
    let ipldBlock;

    if (currentIPLDBlock) {
      ipldBlock = currentIPLDBlock;

      // Update the data field.
      const oldData = codec.decode(Buffer.from(currentIPLDBlock.data));
      data = _.merge(oldData, data);
    } else {
      ipldBlock = this._ipldDb.getNewIPLDBlock();

      // Fetch the parent IPLDBlock.
      const parentIPLDBlock = await this._ipldDb.getLatestIPLDBlock(contractAddress, null, block.blockNumber);

      // Setting the meta-data for an IPLDBlock (done only once per block).
      data.meta = {
        id: contractAddress,
        kind,
        parent: {
          '/': parentIPLDBlock ? parentIPLDBlock.cid : null
        },
        ethBlock: {
          cid: {
            '/': block.cid
          },
          num: block.blockNumber
        }
      };
    }

    // Encoding the data using dag-cbor codec.
    const bytes = codec.encode(data);

    // Calculating sha256 (multi)hash of the encoded data.
    const hash = await sha256.digest(bytes);

    // Calculating the CID: v1, code: dag-cbor, hash.
    const cid = CID.create(1, codec.code, hash);

    // Update ipldBlock with new data.
    ipldBlock = Object.assign(ipldBlock, {
      block,
      contractAddress,
      cid: cid.toString(),
      kind: data.meta.kind,
      data: Buffer.from(bytes)
    });

    return ipldBlock;
  }

  async getIPLDBlocksByHash (blockHash: string): Promise<IPLDBlockInterface[]> {
    const block = await this.getBlockProgress(blockHash);
    assert(block);

    return this._ipldDb.getIPLDBlocks({ block });
  }

  async getIPLDBlockByCid (cid: string): Promise<IPLDBlockInterface | undefined> {
    const ipldBlocks = await this._ipldDb.getIPLDBlocks({ cid });

    // There can be only one IPLDBlock with a particular cid.
    assert(ipldBlocks.length <= 1);

    return ipldBlocks[0];
  }

  async saveOrUpdateIPLDBlock (ipldBlock: IPLDBlockInterface): Promise<IPLDBlockInterface> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._ipldDb.saveOrUpdateIPLDBlock(dbTx, ipldBlock);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async removeIPLDBlocks (blockNumber: number, kind: string): Promise<void> {
    const dbTx = await this._db.createTransactionRunner();

    try {
      await this._ipldDb.removeIPLDBlocks(dbTx, blockNumber, kind);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }
}