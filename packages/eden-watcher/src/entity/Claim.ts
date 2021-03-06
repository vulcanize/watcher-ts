//
// Copyright 2021 Vulcanize, Inc.
//

import { Entity, PrimaryColumn, Column } from 'typeorm';

import { bigintTransformer } from '@vulcanize/util';

@Entity()
export class Claim {
  @PrimaryColumn('varchar')
  id!: string;

  @PrimaryColumn('varchar', { length: 66 })
  blockHash!: string;

  @Column('integer')
  blockNumber!: number;

  @Column('numeric', { transformer: bigintTransformer })
  timestamp!: bigint;

  @Column('numeric', { transformer: bigintTransformer })
  index!: bigint;

  @Column('varchar')
  account!: string;

  @Column('numeric', { transformer: bigintTransformer })
  totalEarned!: bigint;

  @Column('numeric', { transformer: bigintTransformer })
  claimed!: bigint;
}
