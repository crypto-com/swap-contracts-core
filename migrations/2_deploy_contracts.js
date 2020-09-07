const CroDefiSwapFactory = artifacts.require("CroDefiSwapFactory");

module.exports = function(deployer, network, accounts) {
	console.log("Deploying to Address[0]:", accounts[0], typeof accounts[0]);
	deployer.deploy(CroDefiSwapFactory, accounts[0].toString(), 30, 5);
};
