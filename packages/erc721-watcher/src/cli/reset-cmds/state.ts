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

import { SupportsInterface } from '../../entity/SupportsInterface';
import { BalanceOf } from '../../entity/BalanceOf';
import { OwnerOf } from '../../entity/OwnerOf';
import { GetApproved } from '../../entity/GetApproved';
import { IsApprovedForAll } from '../../entity/IsApprovedForAll';
import { Name } from '../../entity/Name';
import { Symbol } from '../../entity/Symbol';
import { TokenURI } from '../../entity/TokenURI';
import { _Name } from '../../entity/_Name';
import { _Symbol } from '../../entity/_Symbol';
import { _Owners } from '../../entity/_Owners';
import { _Balances } from '../../entity/_Balances';
import { _TokenApprovals } from '../../entity/_TokenApprovals';
import { _OperatorApprovals } from '../../entity/_OperatorApprovals';

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

  const jobQueueConfig = config.jobQueue;
  assert(jobQueueConfig, 'Missing job queue config');

  const { dbConnectionString, maxCompletionLagInSecs } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });
  await jobQueue.start();

  const indexer = new Indexer(config.server, db, ethClient, ethProvider, jobQueue);
  await indexer.init();

  const blockProgresses = await indexer.getBlocksAtHeight(argv.blockNumber, false);
  assert(blockProgresses.length, `No blocks at specified block number ${argv.blockNumber}`);
  assert(!blockProgresses.some(block => !block.isComplete), `Incomplete block at block number ${argv.blockNumber} with unprocessed events`);
  const [blockProgress] = blockProgresses;

  const dbTx = await db.createTransactionRunner();

  try {
    const entities = [BlockProgress, SupportsInterface, BalanceOf, OwnerOf, GetApproved, IsApprovedForAll, Name, Symbol, TokenURI, _Name, _Symbol, _Owners, _Balances, _TokenApprovals, _OperatorApprovals];

    const removeEntitiesPromise = entities.map(async entityClass => {
      return db.removeEntities<any>(dbTx, entityClass, { blockNumber: MoreThan(argv.blockNumber) });
    });

    await Promise.all(removeEntitiesPromise);

    const syncStatus = await indexer.getSyncStatus();
    assert(syncStatus, 'Missing syncStatus');

    if (syncStatus.latestIndexedBlockNumber > blockProgress.blockNumber) {
      await indexer.updateSyncStatusIndexedBlock(blockProgress.blockHash, blockProgress.blockNumber, true);
    }

    if (syncStatus.latestCanonicalBlockNumber > blockProgress.blockNumber) {
      await indexer.updateSyncStatusCanonicalBlock(blockProgress.blockHash, blockProgress.blockNumber, true);
    }

    const ipldStatus = await indexer.getIPLDStatus();

    if (ipldStatus) {
      if (ipldStatus.latestHooksBlockNumber > blockProgress.blockNumber) {
        await indexer.updateIPLDStatusHooksBlock(blockProgress.blockNumber, true);
      }

      if (ipldStatus.latestCheckpointBlockNumber > blockProgress.blockNumber) {
        await indexer.updateIPLDStatusCheckpointBlock(blockProgress.blockNumber, true);
      }

      if (ipldStatus.latestIPFSBlockNumber > blockProgress.blockNumber) {
        await indexer.updateIPLDStatusIPFSBlock(blockProgress.blockNumber, true);
      }
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
