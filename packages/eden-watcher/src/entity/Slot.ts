//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column } from 'typeorm';
import Decimal from 'decimal.js';

import { bigintTransformer, decimalTransformer } from '@vulcanize/util';

@Entity()
export class Slot {
  @PrimaryColumn('varchar')
  id!: string;

  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('varchar')
  owner!: string;

  @Column('varchar')
  delegate!: string;

  @Column('numeric', { transformer: bigintTransformer })
  winningBid!: bigint;

  @Column('numeric', { transformer: bigintTransformer })
  oldBid!: bigint;

  @Column('numeric', { transformer: bigintTransformer })
  startTime!: bigint;

  @Column('numeric', { transformer: bigintTransformer })
  expirationTime!: bigint;

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  taxRatePerDay!: Decimal;
}
