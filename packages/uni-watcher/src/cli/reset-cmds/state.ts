//
// Copyright 2021 Vulcanize, Inc.
//

import debug from 'debug';
import { MoreThan } from 'typeorm';
import assert from 'assert';

import { getConfig, initClients, resetJobs, JobQueue } from '@vulcanize/util';

import { Database } from '../../database';
import { Indexer } from '../../indexer';
import { BlockProgress } from '../../entity/BlockProgress';

const log = debug('vulcanize:reset-state');

export const command = 'state';

export const desc = 'Reset state to block number';

export const builder = {
  blockNumber: {
    type: 'number'
  }
};

export const handler = async (argv: any): Promise<void> => {
  const config = await getConfig(argv.configFile);
  await resetJobs(config);
  const { ethClient, ethProvider } = await initClients(config);

  // Initialize database.
  const db = new Database(config.database);
  await db.init();

  assert(config.jobQueue, 'Missing job queue config');

  const { dbConnectionString, maxCompletionLagInSecs } = config.jobQueue;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });

  const indexer = new Indexer(config.server, db, ethClient, ethProvider, jobQueue);

  const syncStatus = await indexer.getSyncStatus();
  assert(syncStatus, 'Missing syncStatus');

  const blockProgresses = await indexer.getBlocksAtHeight(argv.blockNumber, false);
  assert(blockProgresses.length, `No blocks at specified block number ${argv.blockNumber}`);
  assert(!blockProgresses.some(block => !block.isComplete), `Incomplete block at block number ${argv.blockNumber} with unprocessed events`);
  const [blockProgress] = blockProgresses;

  const dbTx = await db.createTransactionRunner();

  try {
    await db.removeEntities(dbTx, BlockProgress, { blockNumber: MoreThan(blockProgress.blockNumber) });

    if (syncStatus.latestIndexedBlockNumber > blockProgress.blockNumber) {
      await indexer.updateSyncStatusIndexedBlock(blockProgress.blockHash, blockProgress.blockNumber, true);
    }

    if (syncStatus.latestCanonicalBlockNumber > blockProgress.blockNumber) {
      await indexer.updateSyncStatusCanonicalBlock(blockProgress.blockHash, blockProgress.blockNumber, true);
    }

    await indexer.updateSyncStatusChainHead(blockProgress.blockHash, blockProgress.blockNumber, true);

    dbTx.commitTransaction();
  } catch (error) {
    await dbTx.rollbackTransaction();
    throw error;
  } finally {
    await dbTx.release();
  }

  log('Reset state successfully');
};
