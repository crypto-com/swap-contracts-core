const UniswapV2Factory = artifacts.require("UniswapV2Factory");

module.exports = function(deployer, network, accounts) {
	console.log("Deploying to Address[0]:", accounts[0], typeof accounts[0]);
	deployer.deploy(UniswapV2Factory, accounts[0].toString());
};
