import assert from 'assert';
import debug from 'debug';
import { Client as UniClient } from '@vulcanize/uni-watcher';
import { Client as ERC20Client } from '@vulcanize/erc20-watcher';
import { BigNumber } from 'ethers';

import { Database } from './database';
import { findEthPerToken, getEthPriceInUSD, WHITELIST_TOKENS } from './utils/pricing';
import { updatePoolDayData, updatePoolHourData, updateTokenDayData, updateTokenHourData, updateUniswapDayData } from './utils/interval-updates';
import { Token } from './entity/Token';
import { convertTokenToDecimal, loadTransaction } from './utils';
import { loadTick } from './utils/tick';

const log = debug('vulcanize:events');

interface PoolCreatedEvent {
  __typename: 'PoolCreatedEvent';
  token0: string;
  token1: string;
  fee: bigint;
  tickSpacing: bigint;
  pool: string;
}

interface InitializeEvent {
  __typename: 'InitializeEvent';
  sqrtPriceX96: bigint;
  tick: bigint;
}

interface MintEvent {
  __typename: 'MintEvent';
  sender: string;
  owner: string;
  tickLower: bigint;
  tickUpper: bigint;
  amount: bigint;
  amount0: bigint;
  amount1: bigint;
}

interface BurnEvent {
  __typename: 'BurnEvent';
  owner: string;
  tickLower: bigint;
  tickUpper: bigint;
  amount: bigint;
  amount0: bigint;
  amount1: bigint;
}

interface Block {
  number: number;
  hash: string;
  timestamp: number;
}

interface Transaction {
  hash: string;
  from: string;
}

interface ResultEvent {
  block: Block;
  tx: Transaction;
  contract: string;
  event: PoolCreatedEvent | InitializeEvent | MintEvent | BurnEvent;
  proof: {
    data: string;
  }
}

export class EventWatcher {
  _db: Database
  _subscription?: ZenObservable.Subscription
  _uniClient: UniClient
  _erc20Client: ERC20Client

  constructor (db: Database, uniClient: UniClient, erc20Client: ERC20Client) {
    assert(db);

    this._db = db;
    this._uniClient = uniClient;
    this._erc20Client = erc20Client;
  }

  async start (): Promise<void> {
    assert(!this._subscription, 'subscription already started');
    log('Started watching upstream events...');
    this._subscription = await this._uniClient.watchEvents(this._handleEvents.bind(this));
  }

  async stop (): Promise<void> {
    if (this._subscription) {
      log('Stopped watching upstream events');
      this._subscription.unsubscribe();
    }
  }

  async _handleEvents ({ block, tx, contract, event }: ResultEvent): Promise<void> {
    // TODO: Process proof (proof.data) in event.
    const { __typename: eventType } = event;

    switch (eventType) {
      case 'PoolCreatedEvent':
        log('Factory PoolCreated event', contract);
        this._handlePoolCreated(block, contract, tx, event as PoolCreatedEvent);
        break;

      case 'InitializeEvent':
        log('Pool Initialize event', contract);
        this._handleInitialize(block, contract, tx, event as InitializeEvent);
        break;

      case 'MintEvent':
        log('Pool Mint event', contract);
        this._handleMint(block, contract, tx, event as MintEvent);
        break;

      case 'BurnEvent':
        log('Pool Burn event', contract);
        this._handleBurn(block, contract, tx, event as BurnEvent);
        break;

      default:
        break;
    }
  }

  async _handlePoolCreated (block: Block, contractAddress: string, tx: Transaction, poolCreatedEvent: PoolCreatedEvent): Promise<void> {
    const { number: blockNumber, hash: blockHash } = block;
    const { token0: token0Address, token1: token1Address, fee, pool: poolAddress } = poolCreatedEvent;

    // Load factory.
    const factory = await this._db.loadFactory({ blockNumber, id: contractAddress });

    // Update Factory.
    let factoryPoolCount = BigNumber.from(factory.poolCount);
    factoryPoolCount = factoryPoolCount.add(1);
    factory.poolCount = BigInt(factoryPoolCount.toHexString());

    // Get Tokens.
    let [token0, token1] = await Promise.all([
      this._db.getToken({ blockNumber, id: token0Address }),
      this._db.getToken({ blockNumber, id: token1Address })
    ]);

    // Create Tokens if not present.
    if (!token0) {
      token0 = await this._createToken(blockHash, blockNumber, token0Address);
    }

    if (!token1) {
      token1 = await this._createToken(blockHash, blockNumber, token1Address);
    }

    // Create new Pool entity.
    // Skipping adding createdAtTimestamp field as it is not queried in frontend subgraph.
    const pool = await this._db.loadPool({
      blockNumber,
      id: poolAddress,
      token0: token0,
      token1: token1,
      feeTier: BigInt(fee)
    });

    // Update white listed pools.
    if (WHITELIST_TOKENS.includes(token0.id)) {
      token1.whitelistPools.push(pool);
      await this._db.saveToken(token1, blockNumber);
    }

    if (WHITELIST_TOKENS.includes(token1.id)) {
      token0.whitelistPools.push(pool);
      await this._db.saveToken(token0, blockNumber);
    }

    // Save entities to DB.
    await this._db.saveFactory(factory, blockNumber);
  }

  /**
   * Create new Token.
   * @param tokenAddress
   */
  async _createToken (blockHash: string, blockNumber: number, tokenAddress: string): Promise<Token> {
    const { value: symbol } = await this._erc20Client.getSymbol(blockHash, tokenAddress);
    const { value: name } = await this._erc20Client.getName(blockHash, tokenAddress);
    const { value: totalSupply } = await this._erc20Client.getTotalSupply(blockHash, tokenAddress);

    // TODO: Decimals not implemented by erc20-watcher.
    // const { value: decimals } = await this._erc20Client.getDecimals(blockHash, tokenAddress);

    return this._db.loadToken({
      blockNumber,
      id: tokenAddress,
      symbol,
      name,
      totalSupply
    });
  }

  async _handleInitialize (block: Block, contractAddress: string, tx: Transaction, initializeEvent: InitializeEvent): Promise<void> {
    const { number: blockNumber, timestamp: blockTimestamp } = block;
    const { sqrtPriceX96, tick } = initializeEvent;
    const pool = await this._db.getPool({ id: contractAddress, blockNumber });
    assert(pool, `Pool ${contractAddress} not found.`);

    // Update Pool.
    pool.sqrtPrice = BigInt(sqrtPriceX96);
    pool.tick = BigInt(tick);
    this._db.savePool(pool, blockNumber);

    // Update ETH price now that prices could have changed.
    const bundle = await this._db.loadBundle({ id: '1', blockNumber });
    bundle.ethPriceUSD = await getEthPriceInUSD(this._db);
    this._db.saveBundle(bundle, blockNumber);

    await updatePoolDayData(this._db, { contractAddress, blockNumber, blockTimestamp });
    await updatePoolHourData(this._db, { contractAddress, blockNumber, blockTimestamp });

    const [token0, token1] = await Promise.all([
      this._db.getToken({ id: pool.token0.id, blockNumber }),
      this._db.getToken({ id: pool.token1.id, blockNumber })
    ]);

    assert(token0 && token1, 'Pool tokens not found.');

    // Update token prices.
    token0.derivedETH = await findEthPerToken(token0);
    token1.derivedETH = await findEthPerToken(token1);

    await Promise.all([
      this._db.saveToken(token0, blockNumber),
      this._db.saveToken(token1, blockNumber)
    ]);
  }

  async _handleMint (block: Block, contractAddress: string, tx: Transaction, mintEvent: MintEvent): Promise<void> {
    const { number: blockNumber, timestamp: blockTimestamp } = block;
    const { hash: txHash } = tx;
    const bundle = await this._db.loadBundle({ id: '1', blockNumber });
    const poolAddress = contractAddress;
    const pool = await this._db.loadPool({ id: poolAddress, blockNumber });

    // TODO: In subgraph factory is fetched by hardcoded factory address.
    // Currently fetching first factory in database as only one exists.
    const [factory] = await this._db.getFactories({ blockNumber }, { limit: 1 });

    const token0 = pool.token0;
    const token1 = pool.token1;
    const amount0 = convertTokenToDecimal(mintEvent.amount0, BigInt(token0.decimals));
    const amount1 = convertTokenToDecimal(mintEvent.amount1, BigInt(token1.decimals));

    const amountUSD = amount0
      .times(token0.derivedETH.times(bundle.ethPriceUSD))
      .plus(amount1.times(token1.derivedETH.times(bundle.ethPriceUSD)));

    // Reset tvl aggregates until new amounts calculated.
    factory.totalValueLockedETH = factory.totalValueLockedETH.minus(pool.totalValueLockedETH);

    // Update globals.
    factory.txCount = BigInt(factory.txCount) + BigInt(1);

    // Update token0 data.
    token0.txCount = BigInt(token0.txCount) + BigInt(1);
    token0.totalValueLocked = token0.totalValueLocked.plus(amount0);
    token0.totalValueLockedUSD = token0.totalValueLocked.times(token0.derivedETH.times(bundle.ethPriceUSD));

    // Update token1 data.
    token1.txCount = BigInt(token1.txCount) + BigInt(1);
    token1.totalValueLocked = token1.totalValueLocked.plus(amount1);
    token1.totalValueLockedUSD = token1.totalValueLocked.times(token1.derivedETH.times(bundle.ethPriceUSD));

    // Pool data.
    pool.txCount = BigInt(pool.txCount) + BigInt(1);

    // Pools liquidity tracks the currently active liquidity given pools current tick.
    // We only want to update it on mint if the new position includes the current tick.
    if (pool.tick !== null) {
      if (
        BigInt(mintEvent.tickLower) <= BigInt(pool.tick) &&
        BigInt(mintEvent.tickUpper) > BigInt(pool.tick)
      ) {
        pool.liquidity = BigInt(pool.liquidity) + mintEvent.amount;
      }
    }

    pool.totalValueLockedToken0 = pool.totalValueLockedToken0.plus(amount0);
    pool.totalValueLockedToken1 = pool.totalValueLockedToken1.plus(amount1);

    pool.totalValueLockedETH = pool.totalValueLockedToken0.times(token0.derivedETH)
      .plus(pool.totalValueLockedToken1.times(token1.derivedETH));

    pool.totalValueLockedUSD = pool.totalValueLockedETH.times(bundle.ethPriceUSD);

    // Reset aggregates with new amounts.
    factory.totalValueLockedETH = factory.totalValueLockedETH.plus(pool.totalValueLockedETH);
    factory.totalValueLockedUSD = factory.totalValueLockedETH.times(bundle.ethPriceUSD);

    const transaction = await loadTransaction(this._db, { txHash, blockNumber, blockTimestamp });

    await this._db.loadMint({
      id: transaction.id + '#' + pool.txCount.toString(),
      blockNumber,
      transaction,
      timestamp: transaction.timestamp,
      pool,
      token0: pool.token0,
      token1: pool.token1,
      owner: mintEvent.owner,
      sender: mintEvent.sender,

      // TODO: Assign origin with Transaction from address.
      // origin: event.transaction.from

      amount: mintEvent.amount,
      amount0: amount0,
      amount1: amount1,
      amountUSD: amountUSD,
      tickLower: mintEvent.tickLower,
      tickUpper: mintEvent.tickUpper
    });

    // Tick entities.
    const lowerTickIdx = mintEvent.tickLower;
    const upperTickIdx = mintEvent.tickUpper;

    const lowerTickId = poolAddress + '#' + mintEvent.tickLower.toString();
    const upperTickId = poolAddress + '#' + mintEvent.tickUpper.toString();

    const lowerTick = await loadTick(this._db, lowerTickId, lowerTickIdx, pool, blockNumber);
    const upperTick = await loadTick(this._db, upperTickId, upperTickIdx, pool, blockNumber);

    const amount = mintEvent.amount;
    lowerTick.liquidityGross = lowerTick.liquidityGross + amount;
    lowerTick.liquidityNet = lowerTick.liquidityNet + amount;
    upperTick.liquidityGross = upperTick.liquidityGross + amount;
    upperTick.liquidityNet = upperTick.liquidityNet + amount;

    // TODO: Update Tick's volume, fees, and liquidity provider count.
    // Computing these on the tick level requires reimplementing some of the swapping code from v3-core.

    await updateUniswapDayData(this._db, { blockNumber, contractAddress, blockTimestamp });
    await updatePoolDayData(this._db, { blockNumber, contractAddress, blockTimestamp });
    await updatePoolHourData(this._db, { blockNumber, contractAddress, blockTimestamp });
    await updateTokenDayData(this._db, token0, { blockNumber, blockTimestamp });
    await updateTokenDayData(this._db, token1, { blockNumber, blockTimestamp });
    await updateTokenHourData(this._db, token0, { blockNumber, blockTimestamp });
    await updateTokenHourData(this._db, token1, { blockNumber, blockTimestamp });

    await Promise.all([
      this._db.saveToken(token0, blockNumber),
      this._db.saveToken(token1, blockNumber)
    ]);

    await this._db.savePool(pool, blockNumber);
    await this._db.saveFactory(factory, blockNumber);

    await Promise.all([
      await this._db.saveTick(lowerTick, blockNumber),
      await this._db.saveTick(upperTick, blockNumber)
    ]);

    // Skipping update inner tick vars and tick day data as they are not queried.
  }

  async _handleBurn (block: Block, contractAddress: string, tx: Transaction, burnEvent: BurnEvent): Promise<void> {
    const { number: blockNumber, timestamp: blockTimestamp } = block;
    const { hash: txHash } = tx;
    const bundle = await this._db.loadBundle({ id: '1', blockNumber });
    const poolAddress = contractAddress;
    const pool = await this._db.loadPool({ id: poolAddress, blockNumber });

    // TODO: In subgraph factory is fetched by hardcoded factory address.
    // Currently fetching first factory in database as only one exists.
    const [factory] = await this._db.getFactories({ blockNumber }, { limit: 1 });

    const token0 = pool.token0;
    const token1 = pool.token1;
    const amount0 = convertTokenToDecimal(burnEvent.amount0, token0.decimals);
    const amount1 = convertTokenToDecimal(burnEvent.amount1, token1.decimals);

    const amountUSD = amount0
      .times(token0.derivedETH.times(bundle.ethPriceUSD))
      .plus(amount1.times(token1.derivedETH.times(bundle.ethPriceUSD)));

    // Reset tvl aggregates until new amounts calculated.
    factory.totalValueLockedETH = factory.totalValueLockedETH.minus(pool.totalValueLockedETH);

    // Update globals.
    factory.txCount = factory.txCount + BigInt(1);

    // Update token0 data.
    token0.txCount = token0.txCount + BigInt(1);
    token0.totalValueLocked = token0.totalValueLocked.minus(amount0);
    token0.totalValueLockedUSD = token0.totalValueLocked.times(token0.derivedETH.times(bundle.ethPriceUSD));

    // Update token1 data.
    token1.txCount = token1.txCount + BigInt(1);
    token1.totalValueLocked = token1.totalValueLocked.minus(amount1);
    token1.totalValueLockedUSD = token1.totalValueLocked.times(token1.derivedETH.times(bundle.ethPriceUSD));

    // Pool data.
    pool.txCount = pool.txCount + BigInt(1);

    // Pools liquidity tracks the currently active liquidity given pools current tick.
    // We only want to update it on burn if the position being burnt includes the current tick.
    if (
      pool.tick !== null &&
      burnEvent.tickLower <= pool.tick &&
      burnEvent.tickUpper > pool.tick
    ) {
      pool.liquidity = pool.liquidity - burnEvent.amount;
    }

    pool.totalValueLockedToken0 = pool.totalValueLockedToken0.minus(amount0);
    pool.totalValueLockedToken1 = pool.totalValueLockedToken1.minus(amount1);

    pool.totalValueLockedETH = pool.totalValueLockedToken0
      .times(token0.derivedETH)
      .plus(pool.totalValueLockedToken1.times(token1.derivedETH));

    pool.totalValueLockedUSD = pool.totalValueLockedETH.times(bundle.ethPriceUSD);

    // Reset aggregates with new amounts.
    factory.totalValueLockedETH = factory.totalValueLockedETH.plus(pool.totalValueLockedETH);
    factory.totalValueLockedUSD = factory.totalValueLockedETH.times(bundle.ethPriceUSD);

    // Burn entity.
    const transaction = await loadTransaction(this._db, { txHash, blockNumber, blockTimestamp });

    await this._db.loadBurn({
      id: transaction.id + '#' + pool.txCount.toString(),
      blockNumber,
      transaction,
      timestamp: transaction.timestamp,
      pool,
      token0: pool.token0,
      token1: pool.token1,
      owner: burnEvent.owner,

      // TODO: Assign origin with Transaction from address.
      // origin: event.transaction.from

      amount: burnEvent.amount,
      amount0,
      amount1,
      amountUSD,
      tickLower: burnEvent.tickLower,
      tickUpper: burnEvent.tickUpper
    });

    // Tick entities.
    const lowerTickId = poolAddress + '#' + (burnEvent.tickLower).toString();
    const upperTickId = poolAddress + '#' + (burnEvent.tickUpper).toString();
    const lowerTick = await this._db.loadTick({ id: lowerTickId, blockNumber });
    const upperTick = await this._db.loadTick({ id: upperTickId, blockNumber });
    const amount = burnEvent.amount;
    lowerTick.liquidityGross = lowerTick.liquidityGross - amount;
    lowerTick.liquidityNet = lowerTick.liquidityNet - amount;
    upperTick.liquidityGross = upperTick.liquidityGross - amount;
    upperTick.liquidityNet = upperTick.liquidityNet + amount;

    await updateUniswapDayData(this._db, { blockNumber, contractAddress, blockTimestamp });
    await updatePoolDayData(this._db, { blockNumber, contractAddress, blockTimestamp });
    await updatePoolHourData(this._db, { blockNumber, contractAddress, blockTimestamp });
    await updateTokenDayData(this._db, token0, { blockNumber, blockTimestamp });
    await updateTokenDayData(this._db, token0, { blockNumber, blockTimestamp });
    await updateTokenHourData(this._db, token0, { blockNumber, blockTimestamp });
    await updateTokenHourData(this._db, token0, { blockNumber, blockTimestamp });

    // Skipping update Tick fee and Tick day data as they are not queried.

    await Promise.all([
      await this._db.saveTick(lowerTick, blockNumber),
      await this._db.saveTick(upperTick, blockNumber)
    ]);

    await Promise.all([
      this._db.saveToken(token0, blockNumber),
      this._db.saveToken(token1, blockNumber)
    ]);

    await this._db.savePool(pool, blockNumber);
    await this._db.saveFactory(factory, blockNumber);
  }
}