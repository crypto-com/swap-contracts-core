const CropSwapFactory = artifacts.require("CropSwapFactory");

module.exports = function(deployer, network, accounts) {
	console.log("Deploying to Address[0]:", accounts[0], typeof accounts[0]);
	deployer.deploy(CropSwapFactory, accounts[0].toString());
};
