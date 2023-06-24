const { network, getNamedAccounts, deployments, ethers } = require("hardhat");
const { developmentChains, networkConfig } = require("../../helper-hardhat-config");
const { assert, expect } = require("chai");

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle unit test", function () {
        let raffle, vrfCoordinatorV2Mock, raffleEntranceFee, deployer, interval;

        const chainId = network.config.chainId;

        beforeEach(async () => {
            accounts = await ethers.getSigners();
            deployer = (await getNamedAccounts()).deployer;
            await deployments.fixture("all");
            raffle = await ethers.getContract("Raffle", deployer);
            vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer);
            raffleEntranceFee = await raffle.getEntranceFee();
            interval = await raffle.getInterval();
        });

        describe("constructor", function () {
            it("Initializes the raffle correctly", async () => {
                const raffleState = await raffle.getRaffleState();
                assert.equal(raffleState.toString(), "0");
                assert.equal(interval.toString(), networkConfig[chainId]["keepersUpdateInterval"]);
            });
        });

        describe("enterRaffle", function () {
            it("reverts when you don't pay enough", async () => {
                await expect(raffle.enterRaffle()).to.be.revertedWith("Raffle__NotEnoughETHEntered");
            });
            it("records players when they enter", async () => {
                await raffle.enterRaffle({ value: raffleEntranceFee });
                const playerFromContract = await raffle.getPlayer(0);
                assert.equal(playerFromContract, deployer);
            });
            it("emits an event", async () => {
                await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.emit(raffle, "RaffleEnter");
            });
            it("doesn't allow entrance when raffle is calculating", async () => {
                await raffle.enterRaffle({ value: raffleEntranceFee });
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                await network.provider.send("evm_mine", []);
                //we pretend to be a chainLink keeper
                await raffle.performUpkeep([]);
                await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.be.revertedWith("Raffle__NotOpen");
            });
        });

        describe("checkUpkeep", function () {
            it("returns false if people haven't sent any ETH", async () => {
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                await network.provider.send("evm_mine", []);
                const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]);
                assert(!upkeepNeeded);
            });
            it("returns false if raffle isn't open", async () => {
                await raffle.enterRaffle({ value: raffleEntranceFee });
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                await network.provider.send("evm_mine", []);
                await raffle.performUpkeep([]);
                const raffleState = await raffle.getRaffleState();
                console.log(raffleState);
                const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]);
                // we have only two members for raffleState enum (either 0 or 1) so we can do following
                // assert(!upkeepNeeded && raffleState.toString());
                // but if we have more than two members (0,1,2,3...) than we have to do like below
                assert(!upkeepNeeded && raffleState.toString() == "1");
            });
            it("returns false if enough time hasn't passed", async () => {
                await raffle.enterRaffle({ value: raffleEntranceFee });
                await network.provider.send("evm_increaseTime", [interval.toNumber() - 5]);
                await network.provider.request({ method: "evm_mine", params: [] });
                const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x"); // "0x" == []
                assert(!upkeepNeeded);
            });
            it("returns true if enough time has passed, has players, has enough eth, and is open", async () => {
                await raffle.enterRaffle({ value: raffleEntranceFee });
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                await network.provider.request({ method: "evm_mine", params: [] });
                const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x");
                assert(upkeepNeeded);
            });
        });

        describe("performUpkeep", function () {
            it("it can only run if checkUpkeep is true", async () => {
                await raffle.enterRaffle({ value: raffleEntranceFee });
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                await network.provider.send("evm_mine", []);
                const tx = await raffle.performUpkeep([]);
                assert(tx);
            });
            it("reverts if checkup is false", async () => {
                await expect(raffle.performUpkeep("0x")).to.be.revertedWith("Raffle__UpkeepNotNeeded");
            });
            it("updates the raffle state and emits a requestId", async () => {
                await raffle.enterRaffle({ value: raffleEntranceFee });
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                await network.provider.request({ method: "evm_mine", params: [] });
                const txResponse = await raffle.performUpkeep("0x"); // emits requestId
                const txReceipt = await txResponse.wait(1); // waits 1 block
                const raffleState = await raffle.getRaffleState(); // updates state
                const requestId = txReceipt.events[1].args.requestId;
                assert(requestId.toNumber() > 0 && raffleState);
            });
        });

        describe("fulfillRandomWords", function () {
            beforeEach(async () => {
                await raffle.enterRaffle({ value: raffleEntranceFee });
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                await network.provider.request({ method: "evm_mine", params: [] });
            });
            it("can only be called after performupkeep", async () => {
                await expect(vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)).to.be.revertedWith("nonexistent request");
                await expect(vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address)).to.be.revertedWith("nonexistent request");
            });
            it("picks a winner, resets, and sends money", async () => {
                const additionalEntrances = 3;
                const startingIndex = 2;
                for (let i = startingIndex; i < startingIndex + additionalEntrances; i++) {
                    const accountConnectedRaffle = raffle.connect(accounts[i]); // Returns a new instance of the Raffle contract connected to player
                    await accountConnectedRaffle.enterRaffle({ value: raffleEntranceFee });
                }
                const startingTimeStamp = await raffle.getLastTimeStamp(); // stores starting timestamp (before we fire our event)

                // This will be more important for our staging tests...
                await new Promise(async (resolve, reject) => {
                    raffle.once("WinnerPicked", async () => { // event listener for WinnerPicked
                        console.log("WinnerPicked event triggered!");
                        // assert throws an error if it fails, so we need to wrap
                        // it in a try/catch so that the promise returns event if it fails.
                        try {
                            // Now lets get the ending values...
                            const recentWinner = await raffle.getRecentWinner();
                            const raffleState = await raffle.getRaffleState();
                            const winnerBalance = await accounts[2].getBalance();
                            const endingTimeStamp = await raffle.getLastTimeStamp();
                            await expect(raffle.getPlayer(0)).to.be.reverted;
                            // Comparisons to check if our ending values are correct:
                            assert.equal(recentWinner.toString(), accounts[2].address);
                            assert.equal(raffleState, 0);
                            assert.equal(
                                winnerBalance.toString(),
                                startingBalance.add(raffleEntranceFee.mul(additionalEntrances).add(raffleEntranceFee))
                                    .toString());
                            assert(endingTimeStamp > startingTimeStamp);
                            resolve();
                        } catch (e) {
                            reject(e);
                        }
                    });

                    // kicking off the event by mocking the chainlink keepers and vrf coordinator
                    const tx = await raffle.performUpkeep("0x");
                    const txReceipt = await tx.wait(1);
                    const startingBalance = await accounts[2].getBalance();
                    await vrfCoordinatorV2Mock.fulfillRandomWords(txReceipt.events[1].args.requestId, raffle.address);
                });
            });
        });
    });
