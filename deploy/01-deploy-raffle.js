const { network, ethers } = require("hardhat");
const {
    developmentChains,
    networkConfig,
    VERIFICATION_BLOCK_CONFIRMATIONS,
} = require("../helper-hardhat-config");
const { verify } = require("../utils/verify");

const FUND_AMOUNT = ethers.utils.parseEther("1");

module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy, log } = deployments;
    const { deployer } = await getNamedAccounts();
    const chainId = network.config.chainId;
    let vrfCoordinatorV2Address, subscriptionId, vrfCoordinatorV2Mock;

    if (chainId == 31337) {
        // create VRFV2 Subscription
        vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock");
        vrfCoordinatorV2Address = vrfCoordinatorV2Mock.address;
        const transactionResponse =
            await vrfCoordinatorV2Mock.createSubscription();
        const transactionReceipt = await transactionResponse.wait();
        subscriptionId = transactionReceipt.events[0].args.subId;
        // Fund the subscription
        // Our mock makes it so we don't actually have to worry about sending fund
        await vrfCoordinatorV2Mock.fundSubscription(subscriptionId, FUND_AMOUNT);
    } else {
        vrfCoordinatorV2Address = networkConfig[chainId]["vrfCoordinatorV2"];
        subscriptionId = networkConfig[chainId]["subscriptionId"];
    }

    log("----------------------------------------------------");

    const waitBlockConfirmations = developmentChains.includes(network.name)
        ? 1
        : VERIFICATION_BLOCK_CONFIRMATIONS;

    const arguments = [
        vrfCoordinatorV2Address,
        subscriptionId,
        networkConfig[chainId]["gasLane"],
        networkConfig[chainId]["keepersUpdateInterval"],
        networkConfig[chainId]["raffleEntranceFee"],
        networkConfig[chainId]["callbackGasLimit"],
    ];
    const raffle = await deploy("Raffle", {
        from: deployer,
        args: arguments,
        log: true,
        waitConfirmations: waitBlockConfirmations,
    });

    if (chainId == 31337) {
        await vrfCoordinatorV2Mock.addConsumer(subscriptionId.toNumber(), raffle.address);
    }

    if (!developmentChains.includes(network.name)) {
        log("Verifyig...");
        await verify(raffle.address, arguments);
    }
};

module.exports.tags = ["all", "raffle"];
