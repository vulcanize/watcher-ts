//
// Copyright 2021 Vulcanize, Inc.
//

import 'reflect-metadata';
import debug from 'debug';
import path from 'path';
import fs from 'fs';
import { ContractInterface } from 'ethers';

import { ResultObject } from '@vulcanize/assemblyscript/lib/loader';

import { createEvent, getSubgraphConfig } from './utils';
import { instantiate } from './loader';

const log = debug('vulcanize:graph-watcher');

export class GraphWatcher {
  _subgraphPath: string;
  _dataSources: any[] = []
  _instanceMap: { [key: string]: ResultObject & { exports: any } } = {};

  constructor (subgraphPath: string) {
    this._subgraphPath = subgraphPath;
  }

  async init () {
    const { dataSources } = await getSubgraphConfig(this._subgraphPath);
    this._dataSources = dataSources;

    const instancePromises = this._dataSources.map(async (dataSource: any) => {
      const { source: { address }, mapping } = dataSource;
      const { abis, file } = mapping;

      const data = {
        abis: abis.reduce((acc: {[key: string]: ContractInterface}, abi: any) => {
          const { name, file } = abi;
          const abiFilePath = path.join(this._subgraphPath, file);
          acc[name] = JSON.parse(fs.readFileSync(abiFilePath).toString());
          return acc;
        }, {}),
        dataSource: {
          address
        }
      };

      const filePath = path.join(this._subgraphPath, file);
      return instantiate(filePath, data);
    }, {});

    const instances = await Promise.all(instancePromises);

    this._instanceMap = this._dataSources.reduce((acc: { [key: string]: ResultObject & { exports: any } }, dataSource: any, index: number) => {
      const instance = instances[index];

      // Important to call _start for built subgraphs on instantiation!
      // TODO: Check api version https://github.com/graphprotocol/graph-node/blob/6098daa8955bdfac597cec87080af5449807e874/runtime/wasm/src/module/mod.rs#L533
      instance.exports._start();

      const { source: { address } } = dataSource;
      acc[address] = instance;

      return acc;
    }, {});
  }

  async handleEvent (eventData: any) {
    const { contract, event } = eventData;

    const dataSource = this._dataSources.find(dataSource => dataSource.source.address === contract);

    if (!dataSource) {
      log(`Subgraph doesnt have configuration for contract ${contract}`);
      return;
    }

    // TODO: Call instance methods based on event signature.
    // value should contain event signature.

    const [{ handler }] = dataSource.mapping.eventHandlers;
    const { exports } = this._instanceMap[contract];

    // TODO: Create event params based on abi to be passed to handler.
    const eventParamsData = [
      {
        name: 'param1',
        value: event.param1,
        kind: 'string'
      },
      {
        name: 'param2',
        value: event.param2,
        kind: 'unsignedBigInt'
      }
    ];

    const ethereumEvent = await createEvent(exports, contract, eventParamsData);

    await exports[handler](ethereumEvent);
  }
}