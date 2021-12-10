//
// Copyright 2021 Vulcanize, Inc.
//

export const MAX_REORG_DEPTH = 16;

export const QUEUE_BLOCK_PROCESSING = 'block-processing';
export const QUEUE_EVENT_PROCESSING = 'event-processing';
export const QUEUE_CHAIN_PRUNING = 'chain-pruning';
export const QUEUE_BLOCK_CHECKPOINT = 'block-checkpoint';
export const QUEUE_HOOKS = 'hooks';
export const QUEUE_IPFS = 'ipfs';

export const JOB_KIND_INDEX = 'index';
export const JOB_KIND_PRUNE = 'prune';

export const JOB_KIND_EVENTS = 'events';
export const JOB_KIND_CONTRACT = 'contract';

export const DEFAULT_CONFIG_PATH = 'environments/local.toml';

export const UNKNOWN_EVENT_NAME = '__unknown__';

export const KIND_ACTIVE = 'active';
export const KIND_LAZY = 'lazy';

export const STATE_KIND_INIT = 'init';
export const STATE_KIND_DIFF_STAGED = 'diff_staged';
export const STATE_KIND_DIFF = 'diff';
export const STATE_KIND_CHECKPOINT = 'checkpoint';
