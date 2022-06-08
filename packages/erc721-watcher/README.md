# erc721-watcher

## Setup

* Run the following command to install required packages:

  ```bash
  yarn
  ```

* Create a postgres12 database for the watcher:

  ```bash
  sudo su - postgres
  createdb erc721-watcher
  ```

* If the watcher is an `active` watcher:

  Create database for the job queue and enable the `pgcrypto` extension on them (https://github.com/timgit/pg-boss/blob/master/docs/usage.md#intro):

  ```
  createdb erc721-watcher-job-queue
  ```

  ```
  postgres@tesla:~$ psql -U postgres -h localhost erc721-watcher-job-queue
  Password for user postgres:
  psql (12.7 (Ubuntu 12.7-1.pgdg18.04+1))
  SSL connection (protocol: TLSv1.3, cipher: TLS_AES_256_GCM_SHA384, bits: 256, compression: off)
  Type "help" for help.

  erc721-watcher-job-queue=# CREATE EXTENSION pgcrypto;
  CREATE EXTENSION
  erc721-watcher-job-queue=# exit
  ```

* The following core services should be setup and running on localhost:
  
  * `vulcanize/go-ethereum` [v1.10.18-statediff-3.2.2](https://github.com/vulcanize/go-ethereum/releases/tag/v1.10.18-statediff-3.2.2) on port 8545
  
  * `vulcanize/ipld-eth-server` [v3.2.2](https://github.com/vulcanize/ipld-eth-server/releases/tag/v3.2.2) with native GQL API enabled, on port 8082

* In the [config file](./environments/local.toml):

  * Update the database connection settings.

  * Update the `upstream` config and provide the `ipld-eth-server` GQL API endpoint.

## Demo

* Deploy an ERC721 token:

  ```bash
  yarn nft:deploy
  # NFT deployed to: NFT_ADDRESS
  ```

  Export the address of the deployed token to a shell variable for later use:

  ```bash
  export NFT_ADDRESS="<NFT_ADDRESS>"
  ```

* Open `http://localhost:3006/graphql` (GraphQL Playground) in a browser window

* Connect MetaMask to `http://localhost:8545` (with chain ID `41337`)

* Add a second account to Metamask and export the account address to a shell variable for later use:

  ```bash
  export RECIPIENT_ADDRESS="<RECIPIENT_ADDRESS>"
  ```

* To get the current block hash at any time, run:

  ```bash
  yarn block:latest
  ```

* Run the following GQL query (`eth_call`) in generated watcher graphql endpoint http://127.0.0.1:3006/graphql

  ```graphql
  query {
    name(
      blockHash: "LATEST_BLOCK_HASH"
      contractAddress: "NFT_ADDRESS"
    ) {
      value
      proof {
        data
      }
    }
    symbol(
      blockHash: "LATEST_BLOCK_HASH"
      contractAddress: "NFT_ADDRESS"
    ) {
      value
      proof {
        data
      }
    }
    balanceOf(
      blockHash: "LATEST_BLOCK_HASH"
      contractAddress: "NFT_ADDRESS"
      owner: "0xDC7d7A8920C8Eecc098da5B7522a5F31509b5Bfc"
    ) {
      value
      proof {
        data
      }
    }
  }
  ```

* Run the following GQL query (`storage`) in generated watcher graphql endpoint http://127.0.0.1:3006/graphql

  ```graphql
  query {
    _name(
      blockHash: "LATEST_BLOCK_HASH"
      contractAddress: "NFT_ADDRESS"
    ) {
      value
      proof {
        data
      }
    }
    _symbol(
      blockHash: "LATEST_BLOCK_HASH"
      contractAddress: "NFT_ADDRESS"
    ) {
      value
      proof {
        data
      }
    }
    _balances(
      blockHash: "LATEST_BLOCK_HASH"
      contractAddress: "NFT_ADDRESS"
      key0: "0xDC7d7A8920C8Eecc098da5B7522a5F31509b5Bfc"
    ) {
      value
      proof {
        data
      }
    }
  }
  ```

* Mint token

  ```bash
  yarn nft:mint --nft $NFT_ADDRESS --to 0xDC7d7A8920C8Eecc098da5B7522a5F31509b5Bfc --token-id 1
  ```

* Get the latest blockHash and run the following query for `balanceOf` and `ownerOf` (`eth_call`):

  ```graphql
  query {
    fromBalanceOf: balanceOf(
      blockHash: "LATEST_BLOCK_HASH"
      contractAddress: "NFT_ADDRESS"
      owner: "0xDC7d7A8920C8Eecc098da5B7522a5F31509b5Bfc"
    ) {
      value
      proof {
        data
      }
    }
    toBalanceOf: balanceOf(
      blockHash: "LATEST_BLOCK_HASH"
      contractAddress: "NFT_ADDRESS"
      owner: "RECIPIENT_ADDRESS"
    ) {
      value
      proof {
        data
      }
    }
    ownerOf(
      blockHash: "LATEST_BLOCK_HASH"
      contractAddress: "NFT_ADDRESS"
      tokenId: 1
    ) {
      value
      proof {
        data
      }
    }
  }
  ```

  * Transfer token

    ```bash
    yarn nft:transfer --nft $NFT_ADDRESS --from 0xDC7d7A8920C8Eecc098da5B7522a5F31509b5Bfc --to $RECIPIENT_ADDRESS --token-id 1
    ```

  * Get the latest blockHash and replace the blockHash in the above query. The result should be different and the token should be transferred to the recipient.

## Customize

* Indexing on an event:

  * Edit the custom hook function `handleEvent` (triggered on an event) in [hooks.ts](./src/hooks.ts) to perform corresponding indexing using the `Indexer` object.

  * While using the indexer storage methods for indexing, pass `diff` as true if default state is desired to be generated using the state variables being indexed.

* Generating state:

  * Edit the custom hook function `createInitialState` (triggered if the watcher passes the start block, checkpoint: `true`) in [hooks.ts](./src/hooks.ts) to save an initial state `IPLDBlock` using the `Indexer` object.

  * Edit the custom hook function `createStateDiff` (triggered on a block) in [hooks.ts](./src/hooks.ts) to save the state in a `diff` `IPLDBlock` using the `Indexer` object. The default state (if exists) is updated.

  * Edit the custom hook function `createStateCheckpoint` (triggered just before default and CLI checkpoint) in [hooks.ts](./src/hooks.ts) to save the state in a `checkpoint` `IPLDBlock` using the `Indexer` object.

## Run

* Run the watcher:

  ```bash
  yarn server
  ```

GQL console: http://localhost:3006/graphql

* If the watcher is an `active` watcher:

  * Run the job-runner:

    ```bash
    yarn job-runner
    ```

  * To watch a contract:

    ```bash
    yarn watch:contract --address <contract-address> --kind <contract-kind> --checkpoint <true | false> --starting-block [block-number]
    ```

    * `address`: Address or identifier of the contract to be watched.
    * `kind`: Kind of the contract.
    * `checkpoint`: Turn checkpointing on (`true` | `false`).
    * `starting-block`: Starting block for the contract (default: `1`).

    Examples:

    Watch a contract with its address and checkpointing on:

    ```bash
    yarn watch:contract --address 0x1F78641644feB8b64642e833cE4AFE93DD6e7833 --kind ERC721 --checkpoint true
    ```

    Watch a contract with its identifier and checkpointing on:

    ```bash
    yarn watch:contract --address MyProtocol --kind protocol --checkpoint true
    ```

  * To fill a block range:

    ```bash
    yarn fill --start-block <from-block> --end-block <to-block>
    ```

    * `start-block`: Block number to start filling from.
    * `end-block`: Block number till which to fill.

  * To create a checkpoint for a contract:

    ```bash
    yarn checkpoint --address <contract-address> --block-hash [block-hash]
    ```

    * `address`: Address or identifier of the contract for which to create a checkpoint.
    * `block-hash`: Hash of a block (in the pruned region) at which to create the checkpoint (default: latest canonical block hash).

  * To reset the watcher to a previous block number:

    * Reset state:

      ```bash
      yarn reset state --block-number <previous-block-number>
      ```

    * Reset job-queue:

      ```bash
      yarn reset job-queue --block-number <previous-block-number>
      ```

    * `block-number`: Block number to which to reset the watcher.

  * To export and import the watcher state:

    * In source watcher, export watcher state:

      ```bash
      yarn export-state --export-file [export-file-path]
      ```

      * `export-file`: Path of JSON file to which to export the watcher data.

    * In target watcher, run job-runner:

      ```bash
      yarn job-runner
      ```

    * Import watcher state:

      ```bash
      yarn import-state --import-file <import-file-path>
      ```

      * `import-file`: Path of JSON file from which to import the watcher data.

    * Run fill:

      ```bash
      yarn fill --start-block <snapshot-block> --end-block <to-block>
      ```

      * `snapshot-block`: Block number at which the watcher state was exported.

    * Run server:

      ```bash
      yarn server
      ```

  * To inspect a CID:

    ```bash
    yarn inspect-cid --cid <cid>
    ```

    * `cid`: CID to be inspected.