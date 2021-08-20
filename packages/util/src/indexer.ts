//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import { DeepPartial } from 'typeorm';
import debug from 'debug';

import { EthClient } from '@vulcanize/ipld-eth-client';

import { BlockProgressInterface, DatabaseInterface, EventInterface, SyncStatusInterface } from './types';

const log = debug('vulcanize:indexer');

export class Indexer {
  _db: DatabaseInterface;
  _ethClient: EthClient;

  constructor (db: DatabaseInterface, ethClient: EthClient) {
    this._db = db;
    this._ethClient = ethClient;
  }

  async getSyncStatus (): Promise<SyncStatusInterface | undefined> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.getSyncStatus(dbTx);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async updateSyncStatusIndexedBlock (blockHash: string, blockNumber: number): Promise<SyncStatusInterface> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.updateSyncStatusIndexedBlock(dbTx, blockHash, blockNumber);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async updateSyncStatusChainHead (blockHash: string, blockNumber: number): Promise<SyncStatusInterface> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.updateSyncStatusChainHead(dbTx, blockHash, blockNumber);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async updateSyncStatusCanonicalBlock (blockHash: string, blockNumber: number): Promise<SyncStatusInterface> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.updateSyncStatusCanonicalBlock(dbTx, blockHash, blockNumber);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async getBlock (blockHash: string): Promise<any> {
    const { block } = await this._ethClient.getLogs({ blockHash });
    return block;
  }

  async getBlockProgress (blockHash: string): Promise<BlockProgressInterface | undefined> {
    return this._db.getBlockProgress(blockHash);
  }

  async getBlocksAtHeight (height: number, isPruned: boolean): Promise<BlockProgressInterface[]> {
    return this._db.getBlocksAtHeight(height, isPruned);
  }

  async blockIsAncestor (ancestorBlockHash: string, blockHash: string, maxDepth: number): Promise<boolean> {
    assert(maxDepth > 0);

    let depth = 0;
    let currentBlockHash = blockHash;
    let currentBlock;

    // TODO: Use a hierarchical query to optimize this.
    while (depth < maxDepth) {
      depth++;

      currentBlock = await this._db.getBlockProgress(currentBlockHash);
      if (!currentBlock) {
        break;
      } else {
        if (currentBlock.parentHash === ancestorBlockHash) {
          return true;
        }

        // Descend the chain.
        currentBlockHash = currentBlock.parentHash;
      }
    }

    return false;
  }

  async markBlockAsPruned (block: BlockProgressInterface): Promise<BlockProgressInterface> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.markBlockAsPruned(dbTx, block);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async updateBlockProgress (blockHash: string, lastProcessedEventIndex: number): Promise<void> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.updateBlockProgress(dbTx, blockHash, lastProcessedEventIndex);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async getEvent (id: string): Promise<EventInterface | undefined> {
    return this._db.getEvent(id);
  }

  async getOrFetchBlockEvents (block: DeepPartial<BlockProgressInterface>, fetchAndSaveEvents: (block: DeepPartial<BlockProgressInterface>) => Promise<void>): Promise<Array<EventInterface>> {
    assert(block.blockHash);
    const blockProgress = await this._db.getBlockProgress(block.blockHash);
    if (!blockProgress) {
      // Fetch and save events first and make a note in the event sync progress table.
      log(`getBlockEvents: db miss, fetching from upstream server ${block.blockHash}`);
      await fetchAndSaveEvents(block);
    }

    const events = await this._db.getBlockEvents(block.blockHash);
    log(`getBlockEvents: db hit, ${block.blockHash} num events: ${events.length}`);

    return events;
  }

  async getBlockEvents (blockHash: string): Promise<Array<EventInterface>> {
    return this._db.getBlockEvents(blockHash);
  }
}