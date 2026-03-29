import hre from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const network = hre.network.name;
  console.log(`\nDeploying CofheHoldem to ${network}...`);

  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address))} ETH\n`);

  const CofheHoldem = await hre.ethers.getContractFactory("CofheHoldem");
  const holdem = await CofheHoldem.deploy();
  await holdem.waitForDeployment();

  const address = await holdem.getAddress();
  console.log(`✅  CofheHoldem deployed at: ${address}`);

  const deploymentDir  = path.join(__dirname, "..", "deployments");
  const deploymentFile = path.join(deploymentDir, `${network}-holdem.json`);
  const configFile     = path.join(__dirname, "..", "src", "config", "contractHoldem.ts");

  if (!fs.existsSync(deploymentDir)) fs.mkdirSync(deploymentDir, { recursive: true });

  const deployment = {
    CofheHoldem: address,
    chainId:      (await hre.ethers.provider.getNetwork()).chainId.toString(),
    deployer:     deployer.address,
    timestamp:    new Date().toISOString(),
  };
  fs.writeFileSync(deploymentFile, JSON.stringify(deployment, null, 2));
  console.log(`\nSaved deployment to deployments/${network}-holdem.json`);

  if (fs.existsSync(configFile)) {
    let content = fs.readFileSync(configFile, "utf-8");
    content = content.replace(
      /HOLDEM_CONTRACT_ADDRESS\s*=\s*'0x[0-9a-fA-F]*'/,
      `HOLDEM_CONTRACT_ADDRESS = '${address}'`
    );
    fs.writeFileSync(configFile, content);
    console.log(`Updated src/config/contractHoldem.ts with deployed address`);
  }

  console.log(`\nNext steps:`);
  console.log(`  1. Set VITE_HOLDEM_CONTRACT_ADDRESS=${address} in .env`);
  console.log(`  2. Verify on Etherscan: npx hardhat verify --network eth-sepolia ${address}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
