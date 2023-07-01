const { frontEndContractsFile, frontEndAbiFile } = require("../helper-hardhat-config");
const fs = require("fs");
const { network } = require("hardhat");

module.exports = async () => {
    if (process.env.UPDATE_FRONTEND) {
        console.log("Writing to front end...");
        await updateContractAddresses();
        await updateAbi();
        console.log("Front end written!");
    }
};

async function updateAbi() {
    const raffle = await ethers.getContract("Raffle");
    fs.writeFileSync(frontEndAbiFile, raffle.interface.format(ethers.utils.FormatTypes.json));
}

async function updateContractAddresses() {
    const raffle = await ethers.getContract("Raffle");
    const contractAddresses = JSON.parse(fs.readFileSync(frontEndContractsFile, "utf8"));
    const chainId = network.config.chainId.toString();
    if (chainId in contractAddresses) {
        if (!contractAddresses[chainId].includes(raffle.address)) {
            contractAddresses[chainId].push(raffle.address);
        }
    } else {
        contractAddresses[chainId] = [raffle.address];
    }
    fs.writeFileSync(frontEndContractsFile, JSON.stringify(contractAddresses));
}
module.exports.tags = ["all", "frontend"];