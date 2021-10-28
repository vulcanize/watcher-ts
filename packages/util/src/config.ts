//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import fs from 'fs-extra';
import path from 'path';
import toml from 'toml';
import debug from 'debug';
import { ConnectionOptions } from 'typeorm';

import { Config as CacheConfig, getCache } from '@vulcanize/cache';
import { EthClient } from '@vulcanize/ipld-eth-client';
import { BaseProvider } from '@ethersproject/providers';

import { getCustomProvider } from './misc';

const log = debug('vulcanize:config');

export interface JobQueueConfig {
  dbConnectionString: string;
  maxCompletionLagInSecs: number;
  jobDelayInMilliSecs?: number;
}

export interface ServerConfig {
  host: string;
  port: number;
  mode: string;
  kind: string;
  checkpointing: boolean;
  checkpointInterval: number;
  ipfsApiAddr: string;
  subgraphPath: string;
}

export interface UpstreamConfig {
  cache: CacheConfig,
  ethServer: {
    gqlApiEndpoint: string;
    gqlPostgraphileEndpoint: string;
    rpcProviderEndpoint: string;
    blockDelayInMilliSecs: number;
  }
  traceProviderEndpoint: string;
  uniWatcher: {
    gqlEndpoint: string;
    gqlSubscriptionEndpoint: string;
  };
  tokenWatcher: {
    gqlEndpoint: string;
    gqlSubscriptionEndpoint: string;
  }
}

export interface Config {
  server: ServerConfig;
  database: ConnectionOptions;
  upstream: UpstreamConfig,
  jobQueue: JobQueueConfig
}

export const getConfig = async (configFile: string): Promise<Config> => {
  const configFilePath = path.resolve(configFile);
  const fileExists = await fs.pathExists(configFilePath);
  if (!fileExists) {
    throw new Error(`Config file not found: ${configFilePath}`);
  }

  const config = toml.parse(await fs.readFile(configFilePath, 'utf8'));
  log('config', JSON.stringify(config, null, 2));

  return config;
};

export const initClients = async (config: Config): Promise<{
  ethClient: EthClient,
  postgraphileClient: EthClient,
  ethProvider: BaseProvider
}> => {
  const { database: dbConfig, upstream: upstreamConfig, server: serverConfig } = config;

  assert(serverConfig, 'Missing server config');
  assert(dbConfig, 'Missing database config');
  assert(upstreamConfig, 'Missing upstream config');

  const { ethServer: { gqlApiEndpoint, gqlPostgraphileEndpoint, rpcProviderEndpoint }, cache: cacheConfig } = upstreamConfig;

  assert(gqlApiEndpoint, 'Missing upstream ethServer.gqlApiEndpoint');
  assert(gqlPostgraphileEndpoint, 'Missing upstream ethServer.gqlPostgraphileEndpoint');
  assert(rpcProviderEndpoint, 'Missing upstream ethServer.rpcProviderEndpoint');

  const cache = await getCache(cacheConfig);

  const ethClient = new EthClient({
    gqlEndpoint: gqlApiEndpoint,
    gqlSubscriptionEndpoint: gqlPostgraphileEndpoint,
    cache
  });

  const postgraphileClient = new EthClient({
    gqlEndpoint: gqlPostgraphileEndpoint,
    cache
  });

  const ethProvider = getCustomProvider(rpcProviderEndpoint);

  return {
    ethClient,
    postgraphileClient,
    ethProvider
  };
};
