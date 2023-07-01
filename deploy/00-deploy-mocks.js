const { network, ethers } = require("hardhat");
const { developmentChains } = require("../helper-hardhat-config");
const BASE_FEE = "250000000000000000"; // 0.25 is this the premium in LINK?
const GAS_PRICE_LINK = 1e9; // link per gas, is this the gas lane? // 0.000000001 LINK per gas

module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy, log } = deployments;
    const { deployer } = await getNamedAccounts();
    const _args = [BASE_FEE, GAS_PRICE_LINK];
    if (developmentChains.includes(network.name)) {
        log("Local network detected! Deploying mocks");
        await deploy("VRFCoordinatorV2Mock", {
            from: deployer,
            args: _args,
            log: true,
            waitConfirmations: network.config.blockConfirmations || 1,
        });
        log("Mocks deployed!");
    }
};

module.exports.tags = ["all", "mocks"];
