//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import 'reflect-metadata';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import debug from 'debug';

import { Client as ERC20Client } from '@vulcanize/erc20-watcher';
import { Client as UniClient } from '@vulcanize/uni-watcher';

import {
  getConfig,
  Config,
  JobQueue,
  QUEUE_BLOCK_PROCESSING,
  QUEUE_EVENT_PROCESSING,
  JobRunner as BaseJobRunner,
  JobQueueConfig,
  DEFAULT_CONFIG_PATH,
  initClients
} from '@vulcanize/util';

import { Indexer } from './indexer';
import { Database } from './database';

const log = debug('vulcanize:job-runner');

export class JobRunner {
  _indexer: Indexer
  _jobQueue: JobQueue
  _baseJobRunner: BaseJobRunner
  _jobQueueConfig: JobQueueConfig

  constructor (jobQueueConfig: JobQueueConfig, indexer: Indexer, jobQueue: JobQueue) {
    this._jobQueueConfig = jobQueueConfig;
    this._indexer = indexer;
    this._jobQueue = jobQueue;
    this._baseJobRunner = new BaseJobRunner(this._jobQueueConfig, this._indexer, this._jobQueue);
  }

  async start (): Promise<void> {
    await this.subscribeBlockProcessingQueue();
    await this.subscribeEventProcessingQueue();
  }

  async subscribeBlockProcessingQueue (): Promise<void> {
    await this._jobQueue.subscribe(QUEUE_BLOCK_PROCESSING, async (job) => {
      await this._baseJobRunner.processBlock(job);
    });
  }

  async subscribeEventProcessingQueue (): Promise<void> {
    await this._jobQueue.subscribe(QUEUE_EVENT_PROCESSING, async (job) => {
      await this._baseJobRunner.processEvent(job);
    });
  }
}

export const main = async (): Promise<any> => {
  const argv = await yargs(hideBin(process.argv))
    .option('f', {
      alias: 'config-file',
      demandOption: true,
      describe: 'configuration file path (toml)',
      type: 'string',
      default: DEFAULT_CONFIG_PATH
    })
    .argv;

  const config: Config = await getConfig(argv.f);
  const { ethClient, postgraphileClient, ethProvider } = await initClients(config);

  const db = new Database(config.database);
  await db.init();

  const {
    uniWatcher,
    tokenWatcher
  } = config.upstream;

  const uniClient = new UniClient(uniWatcher);
  const erc20Client = new ERC20Client(tokenWatcher);

  const jobQueueConfig = config.jobQueue;
  assert(jobQueueConfig, 'Missing job queue config');

  const { dbConnectionString, maxCompletionLagInSecs } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });
  await jobQueue.start();

  const indexer = new Indexer(db, uniClient, erc20Client, ethClient, postgraphileClient, ethProvider, jobQueue, config.server.mode);

  const jobRunner = new JobRunner(jobQueueConfig, indexer, jobQueue);
  await jobRunner.start();
};

main().then(() => {
  log('Starting job runner...');
}).catch(err => {
  log(err);
});

process.on('uncaughtException', err => {
  log('uncaughtException', err);
});

process.on('SIGINT', () => {
  log(`Exiting process ${process.pid} with code 0`);
  process.exit(0);
});
