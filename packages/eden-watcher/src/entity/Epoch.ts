//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column } from 'typeorm';
import Decimal from 'decimal.js';

import { bigintTransformer, decimalTransformer } from '@vulcanize/util';

@Entity()
export class Epoch {
  @PrimaryColumn('varchar')
  id!: string;

  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('boolean')
  finalized!: boolean;

  @Column('numeric', { transformer: bigintTransformer })
  epochNumber!: bigint;

  @Column('varchar', { nullable: true })
  startBlock!: string;

  @Column('varchar', { nullable: true })
  endBlock!: string;

  @Column('numeric', { transformer: bigintTransformer })
  producerBlocks!: bigint;

  @Column('numeric', { transformer: bigintTransformer })
  allBlocks!: bigint;

  @Column('numeric', { default: 0, transformer: decimalTransformer })
  producerBlocksRatio!: Decimal;
}
