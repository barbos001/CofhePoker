import hre from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const network = hre.network.name;
  console.log(`\nDeploying CofhePokerPvP to ${network}...`);

  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address))} ETH\n`);

  const PvP = await hre.ethers.getContractFactory("CofhePokerPvP");
  const pvp = await PvP.deploy();
  await pvp.waitForDeployment();

  const address = await pvp.getAddress();
  console.log(`✅  CofhePokerPvP deployed at: ${address}`);

  const deploymentDir  = path.join(__dirname, "..", "deployments");
  const deploymentFile = path.join(deploymentDir, `${network}-pvp.json`);
  const configFile     = path.join(__dirname, "..", "src", "config", "contractPvP.ts");

  if (!fs.existsSync(deploymentDir)) fs.mkdirSync(deploymentDir, { recursive: true });

  const deployment = {
    CofhePokerPvP: address,
    chainId:        (await hre.ethers.provider.getNetwork()).chainId.toString(),
    deployer:       deployer.address,
    timestamp:      new Date().toISOString(),
  };
  fs.writeFileSync(deploymentFile, JSON.stringify(deployment, null, 2));
  console.log(`\nSaved deployment to deployments/${network}-pvp.json`);

  if (fs.existsSync(configFile)) {
    let content = fs.readFileSync(configFile, "utf-8");
    content = content.replace(
      /PVP_CONTRACT_ADDRESS\s*=\s*\(?[^)]*'0x[0-9a-fA-F]*'/,
      `PVP_CONTRACT_ADDRESS = (\n  import.meta.env.VITE_PVP_CONTRACT_ADDRESS || '${address}'`
    );
    fs.writeFileSync(configFile, content);
    console.log(`Updated src/config/contractPvP.ts with deployed address`);
  }

  console.log(`\nNext steps:`);
  console.log(`  1. Set VITE_PVP_CONTRACT_ADDRESS=${address} in .env`);
  console.log(`  2. Verify: npx hardhat verify --network eth-sepolia ${address}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
