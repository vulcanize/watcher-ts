//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import { Connection, ConnectionOptions, DeepPartial, FindConditions, QueryRunner, FindManyOptions } from 'typeorm';
import path from 'path';

import { IPLDDatabase as BaseDatabase, IPLDDatabaseInterface, QueryOptions, StateKind, Where } from '@vulcanize/util';

import { Contract } from './entity/Contract';
import { Event } from './entity/Event';
import { SyncStatus } from './entity/SyncStatus';
import { IpldStatus } from './entity/IpldStatus';
import { BlockProgress } from './entity/BlockProgress';
import { IPLDBlock } from './entity/IPLDBlock';

export class Database implements IPLDDatabaseInterface {
  _config: ConnectionOptions;
  _conn!: Connection;
  _baseDatabase: BaseDatabase;

  constructor (config: ConnectionOptions) {
    assert(config);

    this._config = {
      ...config,
      entities: [path.join(__dirname, 'entity/*')]
    };

    this._baseDatabase = new BaseDatabase(this._config);
  }

  async init (): Promise<void> {
    this._conn = await this._baseDatabase.init();
  }

  async close (): Promise<void> {
    return this._baseDatabase.close();
  }

  getNewIPLDBlock (): IPLDBlock {
    return new IPLDBlock();
  }

  async getIPLDBlocks (where: FindConditions<IPLDBlock>): Promise<IPLDBlock[]> {
    const repo = this._conn.getRepository(IPLDBlock);

    return this._baseDatabase.getIPLDBlocks(repo, where);
  }

  async getLatestIPLDBlock (contractAddress: string, kind: StateKind | null, blockNumber?: number): Promise<IPLDBlock | undefined> {
    const repo = this._conn.getRepository(IPLDBlock);

    return this._baseDatabase.getLatestIPLDBlock(repo, contractAddress, kind, blockNumber);
  }

  async getPrevIPLDBlock (blockHash: string, contractAddress: string, kind?: string): Promise<IPLDBlock | undefined> {
    const repo = this._conn.getRepository(IPLDBlock);

    return this._baseDatabase.getPrevIPLDBlock(repo, blockHash, contractAddress, kind);
  }

  // Fetch all diff IPLDBlocks after the specified block number.
  async getDiffIPLDBlocksByBlocknumber (contractAddress: string, blockNumber: number): Promise<IPLDBlock[]> {
    const repo = this._conn.getRepository(IPLDBlock);

    return this._baseDatabase.getDiffIPLDBlocksByBlocknumber(repo, contractAddress, blockNumber);
  }

  async saveOrUpdateIPLDBlock (dbTx: QueryRunner, ipldBlock: IPLDBlock): Promise<IPLDBlock> {
    const repo = dbTx.manager.getRepository(IPLDBlock);

    return this._baseDatabase.saveOrUpdateIPLDBlock(repo, ipldBlock);
  }

  async removeIPLDBlocks (dbTx: QueryRunner, blockNumber: number, kind: string): Promise<void> {
    const repo = dbTx.manager.getRepository(IPLDBlock);

    await this._baseDatabase.removeIPLDBlocks(repo, blockNumber, kind);
  }

  async getIPLDStatus (): Promise<IpldStatus | undefined> {
    const repo = this._conn.getRepository(IpldStatus);

    return this._baseDatabase.getIPLDStatus(repo);
  }

  async updateIPLDStatusHooksBlock (queryRunner: QueryRunner, blockNumber: number, force?: boolean): Promise<IpldStatus> {
    const repo = queryRunner.manager.getRepository(IpldStatus);

    return this._baseDatabase.updateIPLDStatusHooksBlock(repo, blockNumber, force);
  }

  async updateIPLDStatusCheckpointBlock (queryRunner: QueryRunner, blockNumber: number, force?: boolean): Promise<IpldStatus> {
    const repo = queryRunner.manager.getRepository(IpldStatus);

    return this._baseDatabase.updateIPLDStatusCheckpointBlock(repo, blockNumber, force);
  }

  async updateIPLDStatusIPFSBlock (queryRunner: QueryRunner, blockNumber: number, force?: boolean): Promise<IpldStatus> {
    const repo = queryRunner.manager.getRepository(IpldStatus);

    return this._baseDatabase.updateIPLDStatusIPFSBlock(repo, blockNumber, force);
  }

  async getContracts (): Promise<Contract[]> {
    const repo = this._conn.getRepository(Contract);

    return this._baseDatabase.getContracts(repo);
  }

  async createTransactionRunner (): Promise<QueryRunner> {
    return this._baseDatabase.createTransactionRunner();
  }

  async getProcessedBlockCountForRange (fromBlockNumber: number, toBlockNumber: number): Promise<{ expected: number, actual: number }> {
    const repo = this._conn.getRepository(BlockProgress);

    return this._baseDatabase.getProcessedBlockCountForRange(repo, fromBlockNumber, toBlockNumber);
  }

  async getEventsInRange (fromBlockNumber: number, toBlockNumber: number): Promise<Array<Event>> {
    const repo = this._conn.getRepository(Event);

    return this._baseDatabase.getEventsInRange(repo, fromBlockNumber, toBlockNumber);
  }

  async saveEventEntity (queryRunner: QueryRunner, entity: Event): Promise<Event> {
    const repo = queryRunner.manager.getRepository(Event);
    return this._baseDatabase.saveEventEntity(repo, entity);
  }

  async getBlockEvents (blockHash: string, where: Where, queryOptions: QueryOptions): Promise<Event[]> {
    const repo = this._conn.getRepository(Event);

    return this._baseDatabase.getBlockEvents(repo, blockHash, where, queryOptions);
  }

  async saveEvents (queryRunner: QueryRunner, block: DeepPartial<BlockProgress>, events: DeepPartial<Event>[]): Promise<BlockProgress> {
    const blockRepo = queryRunner.manager.getRepository(BlockProgress);
    const eventRepo = queryRunner.manager.getRepository(Event);

    return this._baseDatabase.saveEvents(blockRepo, eventRepo, block, events);
  }

  async saveContract (queryRunner: QueryRunner, address: string, kind: string, checkpoint: boolean, startingBlock: number): Promise<Contract> {
    const repo = queryRunner.manager.getRepository(Contract);

    return this._baseDatabase.saveContract(repo, address, kind, checkpoint, startingBlock);
  }

  async updateSyncStatusIndexedBlock (queryRunner: QueryRunner, blockHash: string, blockNumber: number, force = false): Promise<SyncStatus> {
    const repo = queryRunner.manager.getRepository(SyncStatus);

    return this._baseDatabase.updateSyncStatusIndexedBlock(repo, blockHash, blockNumber, force);
  }

  async updateSyncStatusCanonicalBlock (queryRunner: QueryRunner, blockHash: string, blockNumber: number, force = false): Promise<SyncStatus> {
    const repo = queryRunner.manager.getRepository(SyncStatus);

    return this._baseDatabase.updateSyncStatusCanonicalBlock(repo, blockHash, blockNumber, force);
  }

  async updateSyncStatusChainHead (queryRunner: QueryRunner, blockHash: string, blockNumber: number, force = false): Promise<SyncStatus> {
    const repo = queryRunner.manager.getRepository(SyncStatus);

    return this._baseDatabase.updateSyncStatusChainHead(repo, blockHash, blockNumber, force);
  }

  async getSyncStatus (queryRunner: QueryRunner): Promise<SyncStatus | undefined> {
    const repo = queryRunner.manager.getRepository(SyncStatus);

    return this._baseDatabase.getSyncStatus(repo);
  }

  async getEvent (id: string): Promise<Event | undefined> {
    const repo = this._conn.getRepository(Event);

    return this._baseDatabase.getEvent(repo, id);
  }

  async getBlocksAtHeight (height: number, isPruned: boolean): Promise<BlockProgress[]> {
    const repo = this._conn.getRepository(BlockProgress);

    return this._baseDatabase.getBlocksAtHeight(repo, height, isPruned);
  }

  async markBlocksAsPruned (queryRunner: QueryRunner, blocks: BlockProgress[]): Promise<void> {
    const repo = queryRunner.manager.getRepository(BlockProgress);

    return this._baseDatabase.markBlocksAsPruned(repo, blocks);
  }

  async getBlockProgress (blockHash: string): Promise<BlockProgress | undefined> {
    const repo = this._conn.getRepository(BlockProgress);
    return this._baseDatabase.getBlockProgress(repo, blockHash);
  }

  async getBlockProgressEntities (where: FindConditions<BlockProgress>, options: FindManyOptions<BlockProgress>): Promise<BlockProgress[]> {
    const repo = this._conn.getRepository(BlockProgress);

    return this._baseDatabase.getBlockProgressEntities(repo, where, options);
  }

  async updateBlockProgress (queryRunner: QueryRunner, block: BlockProgress, lastProcessedEventIndex: number): Promise<BlockProgress> {
    const repo = queryRunner.manager.getRepository(BlockProgress);

    return this._baseDatabase.updateBlockProgress(repo, block, lastProcessedEventIndex);
  }

  async removeEntities<Entity> (queryRunner: QueryRunner, entity: new () => Entity, findConditions?: FindManyOptions<Entity> | FindConditions<Entity>): Promise<void> {
    return this._baseDatabase.removeEntities(queryRunner, entity, findConditions);
  }

  async getAncestorAtDepth (blockHash: string, depth: number): Promise<string> {
    return this._baseDatabase.getAncestorAtDepth(blockHash, depth);
  }

  _getPropertyColumnMapForEntity (entityName: string): Map<string, string> {
    return this._conn.getMetadata(entityName).ownColumns.reduce((acc, curr) => {
      return acc.set(curr.propertyName, curr.databaseName);
    }, new Map<string, string>());
  }
}
