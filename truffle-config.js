const HDWalletProvider = require("@truffle/hdwallet-provider");

const dotenv = require('dotenv');
dotenv.config();

const infuraProvider = (network) => {
  return new HDWalletProvider(
   process.env.MNEMONIC,
   `https://${network}.infura.io/v3/${process.env.INFURA_API_KEY}`
  )
}

module.exports = {
  // Uncommenting the defaults below
  // provides for an easier quick-start with Ganache.
  // You can also follow this format for other networks;
  // see <http://truffleframework.com/docs/advanced/configuration>
  // for more details on how to specify configuration options!
  //
  networks: {
    development: {
      host: "127.0.0.1",
      port: 8545,
      network_id: "*"
    },
    ropsten: {
      provider: infuraProvider("ropsten"),
      network_id: "3",
      gas: 6000000,
      gasPrice: 5000000000, // in wei
    },
    mainnet: {
      provider: infuraProvider("mainnet"),
      network_id: "1",
      gas: 6000000,
      gasPrice: 125000000000, // in wei
    }
  },
  //
  compilers: {
    solc: {
      version: "0.5.16",
      settings: {
        optimizer: {
          enabled: true,
          runs: 999999
        },
        evmVersion: "istanbul"
      }
    }
  }
};
