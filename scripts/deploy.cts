import hre from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const network = hre.network.name;
  console.log(`\nDeploying CofhePoker to ${network}...`);

  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address))} ETH\n`);

  const CofhePoker = await hre.ethers.getContractFactory("CofhePoker");
  const poker = await CofhePoker.deploy();
  await poker.waitForDeployment();

  const address = await poker.getAddress();
  console.log(`✅  CofhePoker deployed at: ${address}`);

  // ── Save deployment info ──────────────────────────────────────────
  const deploymentDir  = path.join(__dirname, "..", "deployments");
  const deploymentFile = path.join(deploymentDir, `${network}.json`);
  const configFile     = path.join(__dirname, "..", "src", "config", "contract.ts");

  if (!fs.existsSync(deploymentDir)) fs.mkdirSync(deploymentDir, { recursive: true });

  const deployment = {
    CofhePoker: address,
    chainId:     (await hre.ethers.provider.getNetwork()).chainId.toString(),
    deployer:    deployer.address,
    timestamp:   new Date().toISOString(),
  };
  fs.writeFileSync(deploymentFile, JSON.stringify(deployment, null, 2));
  console.log(`\nSaved deployment to deployments/${network}.json`);

  // ── Update src/config/contract.ts ────────────────────────────────
  // Read the current contract.ts and replace the placeholder address
  if (fs.existsSync(configFile)) {
    let content = fs.readFileSync(configFile, "utf-8");
    content = content.replace(
      /CONTRACT_ADDRESS\s*=\s*'0x[0-9a-fA-F]*'/,
      `CONTRACT_ADDRESS = '${address}'`
    );
    fs.writeFileSync(configFile, content);
    console.log(`Updated src/config/contract.ts with deployed address`);
  }

  console.log(`\nNext steps:`);
  console.log(`  1. Set VITE_CONTRACT_ADDRESS=${address} in .env`);
  console.log(`  2. Verify on Etherscan: npx hardhat verify --network eth-sepolia ${address}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
