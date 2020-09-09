const CroDefiSwapFactory = artifacts.require('CroDefiSwapFactory')

module.exports = async function(deployer, network, accounts) {
  let feeSetter
  if (network === 'mainnet') {
    feeSetter = '0x3459e5cb6be361b4f52dA94173Dc8d216013C57a'
  } else {
    feeSetter = accounts[0].toString()
  }
  await deployer.deploy(CroDefiSwapFactory, feeSetter, 30, 5)
  console.log(`Deployed CroDefiSwapFactory on network ${network} with ${feeSetter} as feeSetter`)
}
