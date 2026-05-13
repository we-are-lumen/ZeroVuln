const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) {
    throw new Error(
      "Deployer account tidak ditemukan. Pastikan PRIVATE_KEY sudah di-set (via .env atau environment variable)."
    );
  }
  console.log("Deploying with:", deployer.address);

  const ZVContract = await hre.ethers.getContractFactory("ZVContract");
  const zv = await ZVContract.deploy();
  await zv.waitForDeployment();

  const address = await zv.getAddress();
  console.log("ZVContract deployed to:", address);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
