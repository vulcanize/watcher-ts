import 'dotenv/config';
import { task, HardhatUserConfig } from 'hardhat/config';
import '@nomiclabs/hardhat-waffle';

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task('accounts', 'Prints the list of accounts', async (args, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const config: HardhatUserConfig = {
  solidity: {
    version: '0.7.6',
    settings: {
      outputSelection: {
        '*': {
          '*': [
            'abi', 'storageLayout',
            'metadata', 'evm.bytecode', // Enable the metadata and bytecode outputs of every single contract.
            'evm.bytecode.sourceMap' // Enable the source map output of every single contract.
          ],
          '': [
            'ast' // Enable the AST output of every single file.
          ]
        }
      }
    }
  },
  paths: {
    sources: './test/contracts',
    tests: './src'
  },
  networks: {
    private: {
      url: process.env.ETH_RPC_URL
    }
  },
  mocha: {
    timeout: 50000
  }
};

export default config;
