//
// Copyright 2021 Vulcanize, Inc.
//

import { ethers } from 'ethers';
import path from 'path';

import { instantiate } from './index';
import { createEvent } from './utils';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

describe('eden wasm loader tests', () => {
  describe('EdenNetwork wasm', () => {
    let exports: any;

    // EdenNetwork contract address string.
    const contractAddress = '0x9E3382cA57F4404AC7Bf435475EAe37e87D1c453';

    it('should load the subgraph network wasm', async () => {
      const filePath = path.resolve(__dirname, '../test/subgraph/eden/EdenNetwork/EdenNetwork.wasm');
      ({ exports } = await instantiate(filePath));
      const { _start } = exports;
      _start();
    });

    xit('should call the slotClaimed handler', async () => {
      const {
        slotClaimed
      } = exports;

      // Create dummy SlotClaimedEvent params.
      const eventParamsData = [
        {
          name: 'slot',
          kind: 'i32',
          value: 0
        },
        {
          name: 'owner',
          kind: 'address',
          value: ZERO_ADDRESS
        },
        {
          name: 'delegate',
          kind: 'address',
          value: ZERO_ADDRESS
        },
        {
          name: 'newBidAmount',
          kind: 'unsignedBigInt',
          value: BigInt(1)
        },
        {
          name: 'oldBidAmount',
          kind: 'unsignedBigInt',
          value: BigInt(1)
        },
        {
          name: 'taxNumerator',
          kind: 'i32',
          value: 1
        },
        {
          name: 'taxDenominator',
          kind: 'i32',
          value: 1
        }
      ];

      // Create dummy SlotClaimedEvent to be passed to handler.
      const slotClaimedEvent = await createEvent(exports, contractAddress, eventParamsData);

      await slotClaimed(slotClaimedEvent);
    });

    it('should call the slotDelegateUpdated handler', async () => {
      const {
        slotDelegateUpdated
      } = exports;

      // Create dummy SlotDelegateUpdatedEvent params.
      const eventParamsData = [
        {
          name: 'slot',
          kind: 'i32',
          value: 0
        },
        {
          name: 'owner',
          kind: 'address',
          value: ZERO_ADDRESS
        },
        {
          name: 'newDelegate',
          kind: 'address',
          value: ZERO_ADDRESS
        },
        {
          name: 'oldDelegate',
          kind: 'address',
          value: ZERO_ADDRESS
        }
      ];

      // Create dummy SlotDelegateUpdatedEvent to be passed to handler.
      const slotClaimedEvent = await createEvent(exports, contractAddress, eventParamsData);

      await slotDelegateUpdated(slotClaimedEvent);
    });

    xit('should call the stake handler', async () => {
      const {
        stake
      } = exports;

      // Create dummy StakeEvent params.
      const eventParamsData = [
        {
          name: 'staker',
          kind: 'address',
          value: ZERO_ADDRESS
        },
        {
          name: 'stakeAmount',
          kind: 'unsignedBigInt',
          value: BigInt(1)
        }
      ];

      // Create dummy StakeEvent to be passed to handler.
      const stakeEvent = await createEvent(exports, contractAddress, eventParamsData);

      await stake(stakeEvent);
    });

    xit('should call the unstake handler', async () => {
      const {
        unstake
      } = exports;

      // Create dummy UnstakeEvent params.
      const eventParamsData = [
        {
          name: 'staker',
          kind: 'address',
          value: ZERO_ADDRESS
        },
        {
          name: 'unstakedAmount',
          kind: 'unsignedBigInt',
          value: BigInt(1)
        }
      ];

      // Create dummy UnstakeEvent to be passed to handler.
      const unstakeEvent = await createEvent(exports, contractAddress, eventParamsData);

      await unstake(unstakeEvent);
    });
  });

  describe('EdenNetworkDistribution wasm', () => {
    let exports: any;

    // EdenNetwork contract address string.
    const contractAddress = '0x2Ae0f92498346B9e011ED15d8C98142DCF62F774';

    it('should load the subgraph network distribution wasm', async () => {
      const filePath = path.resolve(__dirname, '../test/subgraph/eden/EdenNetworkDistribution/EdenNetworkDistribution.wasm');
      ({ exports } = await instantiate(filePath));
      const { _start } = exports;
      _start();
    });

    it('should call the claimed handler', async () => {
      const {
        claimed
      } = exports;

      // Create dummy ClaimedEvent params.
      const eventParamsData = [
        {
          name: 'index',
          kind: 'unsignedBigInt',
          value: BigInt(1)
        },
        {
          name: 'totalEarned',
          kind: 'unsignedBigInt',
          value: BigInt(1)
        },
        {
          name: 'account',
          kind: 'address',
          value: ZERO_ADDRESS
        },
        {
          name: 'claimed',
          kind: 'unsignedBigInt',
          value: BigInt(1)
        }
      ];

      // Create dummy ClaimedEvent to be passed to handler.
      const claimedEvent = await createEvent(exports, contractAddress, eventParamsData);

      await claimed(claimedEvent);
    });

    it('should call the slashed handler', async () => {
      const {
        slashed
      } = exports;

      // Create dummy SlashedEvent params.
      const eventParamsData = [
        {
          name: 'account',
          kind: 'address',
          value: ZERO_ADDRESS
        },
        {
          name: 'slashed',
          kind: 'unsignedBigInt',
          value: BigInt(1)
        }
      ];

      // Create dummy SlashedEvent to be passed to handler.
      const slashedEvent = await createEvent(exports, contractAddress, eventParamsData);

      await slashed(slashedEvent);
    });

    it('should call the merkleRootUpdated handler', async () => {
      const {
        merkleRootUpdated
      } = exports;

      // Create dummy MerkleRootUpdatedEvent params.
      const eventParamsData = [
        {
          name: 'merkleRoot',
          kind: 'bytes',
          value: ethers.utils.hexlify(ethers.utils.randomBytes(32))
        },
        {
          name: 'distributionNumber',
          kind: 'unsignedBigInt',
          value: BigInt(1)
        },
        {
          name: 'metadataURI',
          kind: 'string',
          value: 'abc'
        }
      ];

      // Create dummy MerkleRootUpdatedEvent to be passed to handler.
      const merkleRootUpdatedEvent = await createEvent(exports, contractAddress, eventParamsData);

      await merkleRootUpdated(merkleRootUpdatedEvent);
    });

    it('should call the accountUpdated handler', async () => {
      const {
        accountUpdated
      } = exports;

      // Create dummy AccountUpdatedEvent params.
      const eventParamsData = [
        {
          name: 'account',
          kind: 'address',
          value: ZERO_ADDRESS
        },
        {
          name: 'totalClaimed',
          kind: 'unsignedBigInt',
          value: BigInt(1)
        },
        {
          name: 'totalSlashed',
          kind: 'unsignedBigInt',
          value: BigInt(1)
        }
      ];

      // Create dummy AccountUpdatedEvent to be passed to handler.
      const accountUpdatedEvent = await createEvent(exports, contractAddress, eventParamsData);

      await accountUpdated(accountUpdatedEvent);
    });
  });

  it('should load the subgraph network distribution wasm', async () => {
    const filePath = path.resolve(__dirname, '../test/subgraph/eden/EdenNetworkDistribution/EdenNetworkDistribution.wasm');
    const { exports: { _start } } = await instantiate(filePath);
    _start();
  });

  it('should load the subgraph network governance wasm', async () => {
    const filePath = path.resolve(__dirname, '../test/subgraph/eden/EdenNetworkGovernance/EdenNetworkGovernance.wasm');
    const { exports: { _start } } = await instantiate(filePath);
    _start();
  });
});