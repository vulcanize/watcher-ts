//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';
import { In } from 'typeorm';

import { JobQueueConfig } from './config';
import {
  JOB_KIND_INDEX,
  JOB_KIND_PRUNE,
  JOB_KIND_EVENTS,
  JOB_KIND_CONTRACT,
  MAX_REORG_DEPTH,
  QUEUE_BLOCK_PROCESSING,
  QUEUE_EVENT_PROCESSING
} from './constants';
import { JobQueue } from './job-queue';
import { EventInterface, IndexerInterface, IPLDIndexerInterface, SyncStatusInterface } from './types';
import { wait } from './misc';
import { createPruningJob, processBatchEvents } from './common';
import { lastBlockNumEvents, lastBlockProcessDuration, lastProcessedBlockNumber } from './metrics';

const log = debug('vulcanize:job-runner');

export class JobRunner {
  _indexer: IndexerInterface | IPLDIndexerInterface
  _jobQueue: JobQueue
  _jobQueueConfig: JobQueueConfig
  _blockProcessStartTime?: Date
  _endBlockProcessTimer?: () => void

  constructor (jobQueueConfig: JobQueueConfig, indexer: IndexerInterface, jobQueue: JobQueue) {
    this._indexer = indexer;
    this._jobQueue = jobQueue;
    this._jobQueueConfig = jobQueueConfig;
  }

  async processBlock (job: any): Promise<void> {
    const { data: { kind } } = job;

    const syncStatus = await this._indexer.getSyncStatus();
    assert(syncStatus);

    switch (kind) {
      case JOB_KIND_INDEX:
        await this._indexBlock(job, syncStatus);
        break;

      case JOB_KIND_PRUNE:
        await this._pruneChain(job, syncStatus);
        break;

      default:
        log(`Invalid Job kind ${kind} in QUEUE_BLOCK_PROCESSING.`);
        break;
    }
  }

  async processEvent (job: any): Promise<EventInterface | void> {
    const { data: { kind } } = job;

    switch (kind) {
      case JOB_KIND_EVENTS:
        await this._processEvents(job);
        break;

      case JOB_KIND_CONTRACT:
        await this._updateWatchedContracts(job);
        break;

      default:
        log(`Invalid Job kind ${kind} in QUEUE_EVENT_PROCESSING.`);
        break;
    }

    await this._jobQueue.markComplete(job);
  }

  async _pruneChain (job: any, syncStatus: SyncStatusInterface): Promise<void> {
    const { pruneBlockHeight } = job.data;

    log(`Processing chain pruning at ${pruneBlockHeight}`);

    // Assert we're at a depth where pruning is safe.
    assert(syncStatus.latestIndexedBlockNumber >= (pruneBlockHeight + MAX_REORG_DEPTH));

    // Check that we haven't already pruned at this depth.
    if (syncStatus.latestCanonicalBlockNumber >= pruneBlockHeight) {
      log(`Already pruned at block height ${pruneBlockHeight}, latestCanonicalBlockNumber ${syncStatus.latestCanonicalBlockNumber}`);
    } else {
      // Check how many branches there are at the given height/block number.
      const blocksAtHeight = await this._indexer.getBlocksAtHeight(pruneBlockHeight, false);

      // Should be at least 1.
      assert(blocksAtHeight.length);

      let newCanonicalBlockHash;
      // We have more than one node at this height, so prune all nodes not reachable from indexed block at max reorg depth from prune height.
      // This will lead to orphaned nodes, which will get pruned at the next height.
      if (blocksAtHeight.length > 1) {
        const [indexedBlock] = await this._indexer.getBlocksAtHeight(pruneBlockHeight + MAX_REORG_DEPTH, false);

        // Get ancestor blockHash from indexed block at prune height.
        const ancestorBlockHash = await this._indexer.getAncestorAtDepth(indexedBlock.blockHash, MAX_REORG_DEPTH);
        newCanonicalBlockHash = ancestorBlockHash;

        const blocksToBePruned = blocksAtHeight.filter(block => ancestorBlockHash !== block.blockHash);

        if (blocksToBePruned.length) {
          // Mark blocks pruned which are not the ancestor block.
          await this._indexer.markBlocksAsPruned(blocksToBePruned);
        }
      } else {
        newCanonicalBlockHash = blocksAtHeight[0].blockHash;
      }

      // Update the canonical block in the SyncStatus.
      await this._indexer.updateSyncStatusCanonicalBlock(newCanonicalBlockHash, pruneBlockHeight);
    }
  }

  async _indexBlock (job: any, syncStatus: SyncStatusInterface): Promise<void> {
    const { data: { cid, blockHash, blockNumber, parentHash, priority, timestamp } } = job;

    const indexBlockStartTime = new Date();

    // Log time taken to complete processing of previous block.
    if (this._blockProcessStartTime) {
      const blockProcessDuration = indexBlockStartTime.getTime() - this._blockProcessStartTime.getTime();
      log(`time:job-runner#_indexBlock-process-block-${blockNumber - 1}: ${blockProcessDuration}ms`);
      log(`Total block process time (${blockNumber - 1}): ${blockProcessDuration}ms`);
    }

    this._blockProcessStartTime = indexBlockStartTime;
    log(`Processing block number ${blockNumber} hash ${blockHash} `);

    // Check if chain pruning is caught up.
    if ((syncStatus.latestIndexedBlockNumber - syncStatus.latestCanonicalBlockNumber) > MAX_REORG_DEPTH) {
      await createPruningJob(this._jobQueue, syncStatus.latestCanonicalBlockNumber, priority);

      const message = `Chain pruning not caught up yet, latest canonical block number ${syncStatus.latestCanonicalBlockNumber} and latest indexed block number ${syncStatus.latestIndexedBlockNumber}`;
      log(message);
      throw new Error(message);
    }

    let [parentBlock, blockProgress] = await this._indexer.getBlockProgressEntities(
      {
        blockHash: In([parentHash, blockHash])
      },
      {
        order: {
          blockNumber: 'ASC'
        }
      }
    );

    // Check if parent block has been processed yet, if not, push a high priority job to process that first and abort.
    // However, don't go beyond the `latestCanonicalBlockHash` from SyncStatus as we have to assume the reorg can't be that deep.
    if (blockHash !== syncStatus.latestCanonicalBlockHash) {
      // Create a higher priority job to index parent block and then abort.
      // We don't have to worry about aborting as this job will get retried later.
      const newPriority = (priority || 0) + 1;

      if (!parentBlock || parentBlock.blockHash !== parentHash) {
        const blocks = await this._indexer.getBlocks({ blockHash: parentHash });

        if (!blocks.length) {
          const message = `No blocks at parentHash ${parentHash}, aborting`;
          log(message);

          throw new Error(message);
        }

        const [{ cid: parentCid, blockNumber: parentBlockNumber, parentHash: grandparentHash, timestamp: parentTimestamp }] = blocks;

        await this._jobQueue.pushJob(QUEUE_BLOCK_PROCESSING, {
          kind: JOB_KIND_INDEX,
          cid: parentCid,
          blockHash: parentHash,
          blockNumber: parentBlockNumber,
          parentHash: grandparentHash,
          timestamp: parentTimestamp,
          priority: newPriority
        }, { priority: newPriority });

        const message = `Parent block number ${parentBlockNumber} hash ${parentHash} of block number ${blockNumber} hash ${blockHash} not fetched yet, aborting`;
        log(message);

        throw new Error(message);
      }

      if (!parentBlock.isComplete) {
        // Parent block indexing needs to finish before this block can be indexed.
        const message = `Indexing incomplete for parent block number ${parentBlock.blockNumber} hash ${parentHash} of block number ${blockNumber} hash ${blockHash}, aborting`;
        log(message);

        await this._jobQueue.pushJob(QUEUE_BLOCK_PROCESSING, {
          kind: JOB_KIND_INDEX,
          cid: parentBlock.cid,
          blockHash: parentHash,
          blockNumber: parentBlock.blockNumber,
          parentHash: parentBlock.parentHash,
          timestamp: parentBlock.blockTimestamp,
          priority: newPriority
        }, { priority: newPriority });

        throw new Error(message);
      } else {
        // Remove the unknown events of the parent block if it is marked complete.
        await this._indexer.removeUnknownEvents(parentBlock);
      }
    } else {
      blockProgress = parentBlock;
    }

    if (!blockProgress) {
      const { jobDelayInMilliSecs = 0 } = this._jobQueueConfig;

      // Delay required to process block.
      await wait(jobDelayInMilliSecs);
      blockProgress = await this._indexer.fetchBlockEvents({ cid, blockHash, blockNumber, parentHash, blockTimestamp: timestamp });
    }

    if (this._indexer.processBlock) {
      await this._indexer.processBlock(blockHash, blockNumber);
    }

    // Push job to event processing queue.
    // Block with all events processed or no events will not be processed again due to check in _processEvents.
    await this._jobQueue.pushJob(QUEUE_EVENT_PROCESSING, { kind: JOB_KIND_EVENTS, blockHash: blockProgress.blockHash, publish: true });

    const indexBlockDuration = new Date().getTime() - indexBlockStartTime.getTime();
    log(`time:job-runner#_indexBlock: ${indexBlockDuration}ms`);
  }

  async _processEvents (job: any): Promise<void> {
    const { blockHash } = job.data;

    console.time('time:job-runner#_processEvents-get-block-progress');
    const block = await this._indexer.getBlockProgress(blockHash);
    console.timeEnd('time:job-runner#_processEvents-get-block-progress');
    assert(block);

    console.time('time:job-runner#_processEvents-events');

    await processBatchEvents(this._indexer, block, this._jobQueueConfig.eventsInBatch);

    console.timeEnd('time:job-runner#_processEvents-events');

    // Update metrics
    lastProcessedBlockNumber.set(block.blockNumber);
    lastBlockNumEvents.set(block.numEvents);

    if (this._endBlockProcessTimer) {
      this._endBlockProcessTimer();
    }

    this._endBlockProcessTimer = lastBlockProcessDuration.startTimer();
  }

  async _updateWatchedContracts (job: any): Promise<void> {
    const { data: { contract } } = job;

    assert(this._indexer.cacheContract);
    this._indexer.cacheContract(contract);

    const ipldIndexer = this._indexer as IPLDIndexerInterface;
    if (ipldIndexer.updateIPLDStatusMap) {
      ipldIndexer.updateIPLDStatusMap(contract.address, {});
    }
  }
}
