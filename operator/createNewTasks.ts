import { ethers } from "ethers";
import * as dotenv from "dotenv";
const fs = require('fs');
const path = require('path');
dotenv.config();

// Setup env variables
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
/// TODO: Hack
let chainId = 31337;

const avsDeploymentData = JSON.parse(fs.readFileSync(path.resolve(__dirname, `../contracts/deployments/hello-world/${chainId}.json`), 'utf8'));
const helloWorldServiceManagerAddress = '0xf3cf5bf9ab547d629315723f16830b5ed574f79a';
const helloWorldServiceManagerABI = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../abis/HelloWorldServiceManager.json'), 'utf8'));
// Initialize contract objects from ABIs
const helloWorldServiceManager = new ethers.Contract(helloWorldServiceManagerAddress, helloWorldServiceManagerABI, wallet);


// Function to generate random names
function generateRandomName(): string {
  const adjectives = ['Quick', 'Lazy', 'Sleepy', 'Noisy', 'Hungry'];
  const nouns = ['Fox', 'Dog', 'Cat', 'Mouse', 'Bear'];
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const randomName = `${adjective}${noun}${Math.floor(Math.random() * 1000)}`;
  return randomName;
}

async function createNewTask(taskName: string) {
  try {
    // Send a transaction to the createNewTask function
    const tx = await helloWorldServiceManager.createNewTask(taskName);

    // Wait for the transaction to be mined
    const receipt = await tx.wait();

    console.log(`Transaction successful with hash: ${receipt.hash}`);
  } catch (error) {
    console.error('Error sending transaction:', error);
  }
}

// Function to create a new task with a random name every 15 seconds
async function startCreatingTasks() {
  const tx = await helloWorldServiceManager.createNewTask("mint", JSON.stringify({ address: "0x123", amount: 100 }), "0x");
  console.log("Tx hash: ", tx.hash);
}

// Start the process
startCreatingTasks();