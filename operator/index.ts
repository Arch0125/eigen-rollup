import { ethers } from "ethers";
import * as dotenv from "dotenv";
import fs from "fs";
import path from "path";
import axios from "axios";
import { mint, transfer } from "./token/operations";
import { getData, postData } from "./da/relayer";
import { executeMethod } from "./token/executor";
import logger from "node-color-log";

dotenv.config();

if (!Object.keys(process.env).length) {
    throw new Error("process.env object is empty");
}

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
let chainId = 31337;

const avsDeploymentData = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, `../contracts/deployments/hello-world/${chainId}.json`), "utf8")
);
const coreDeploymentData = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, `../contracts/deployments/core/${chainId}.json`), "utf8")
);

// const helloWorldServiceManagerAddress = avsDeploymentData.addresses.helloWorldServiceManager;
const helloWorldServiceManagerABI = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../abis/HelloWorldServiceManager.json"), "utf8")
);

const helloWorldServiceManager = new ethers.Contract(
    '0xf3cf5bf9ab547d629315723f16830b5ed574f79a',
    helloWorldServiceManagerABI,
    wallet
);

let requestID =
    "5f352cc9d5a54715e1e919a6cc0bb5eca00c6beb5595ec83a6d7512b869cb58b-313733303232323236303839323335373731302f302f33332f312f33332fe3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

const delegationManagerAddress = '0xA44151489861Fe9e3055d95adC98FbD462B948e7'; // todo: reminder to fix the naming of this contract in the deployment file, change to delegationManager
const avsDirectoryAddress = '0x055733000064333CaDDbC92763c58BF0192fFeBf';
const ecdsaStakeRegistryAddress = '0x71064Ab622D2d5f8aAF037c5eFe0D84AD1467cC4';



// Load ABIs
const delegationManagerABI = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../abis/IDelegationManager.json'), 'utf8'));
const ecdsaRegistryABI = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../abis/ECDSAStakeRegistry.json'), 'utf8'));
const avsDirectoryABI = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../abis/IAVSDirectory.json'), 'utf8'));

// Initialize contract objects from ABIs
const delegationManager = new ethers.Contract(delegationManagerAddress, delegationManagerABI, wallet);
const ecdsaRegistryContract = new ethers.Contract(ecdsaStakeRegistryAddress, ecdsaRegistryABI, wallet);
const avsDirectory = new ethers.Contract(avsDirectoryAddress, avsDirectoryABI, wallet);

// Task Queue to manage tasks in FIFO order
// class TaskQueue {
//     private queue: Array<{ taskIndex: number; task: any }>;
//     private processing: boolean;

//     constructor() {
//         this.queue = [];
//         this.processing = false;
//     }

//     enqueue(taskIndex: number, task: any) {
//         this.queue.push({ taskIndex, task });
//         this.processNext(); // Start processing the next task if not already processing
//     }

//     private async processNext() {
//         if (this.processing || this.queue.length === 0) return;

//         this.processing = true;
//         const { taskIndex, task } = this.queue.shift()!; // Get the next task

//         try {
//             console.log(`Processing task: ${task.name}`);
//             await signAndRespondToTask(taskIndex, task.taskCreatedBlock, task.name, task.taskMetadata);
//         } catch (error) {
//             console.error(`Error processing task ${task.name}:`, error);
//         } finally {
//             this.processing = false;
//             this.processNext(); // Process the next task in the queue
//         }
//     }
// }

// Create a TaskQueue instance
// const taskQueue = new TaskQueue();

const registerOperator = async () => {

    // Registers as an Operator in EigenLayer.
    try {
        const tx1 = await delegationManager.registerAsOperator({
            __deprecated_earningsReceiver: await wallet.address,
            delegationApprover: "0x0000000000000000000000000000000000000000",
            stakerOptOutWindowBlocks: 0
        }, "");
        await tx1.wait();
        console.log("Operator registered to Core EigenLayer contracts");
    } catch (error) {
        console.error("Error in registering as operator:", error);
    }

    const salt = ethers.hexlify(ethers.randomBytes(32));
    const expiry = Math.floor(Date.now() / 1000) + 3600; // Example expiry, 1 hour from now

    // Define the output structure
    let operatorSignatureWithSaltAndExpiry = {
        signature: "",
        salt: salt,
        expiry: expiry
    };

    // Calculate the digest hash, which is a unique value representing the operator, avs, unique value (salt) and expiration date.
    const operatorDigestHash = await avsDirectory.calculateOperatorAVSRegistrationDigestHash(
        wallet.address,
        await helloWorldServiceManager.getAddress(),
        salt,
        expiry
    );
    console.log(operatorDigestHash);

    // Sign the digest hash with the operator's private key
    console.log("Signing digest hash with operator's private key");
    const operatorSigningKey = new ethers.SigningKey(process.env.PRIVATE_KEY!);
    const operatorSignedDigestHash = operatorSigningKey.sign(operatorDigestHash);

    // Encode the signature in the required format
    operatorSignatureWithSaltAndExpiry.signature = ethers.Signature.from(operatorSignedDigestHash).serialized;

    console.log("Registering Operator to AVS Registry contract");


    // Register Operator to AVS
    // Per release here: https://github.com/Layr-Labs/eigenlayer-middleware/blob/v0.2.1-mainnet-rewards/src/unaudited/ECDSAStakeRegistry.sol#L49
    const tx2 = await ecdsaRegistryContract.registerOperatorWithSignature(
        operatorSignatureWithSaltAndExpiry,
        wallet.address
    );
    await tx2.wait();
    console.log("Operator registered on AVS successfully");
};

const signAndRespondToTask = async (taskIndex: number, taskCreatedBlock: number, taskName: string, taskMetadata: string) => {
    const message = `Hello, ${taskName}`;
    const messageHash = ethers.solidityPackedKeccak256(["string"], [message]);
    const messageBytes = ethers.getBytes(messageHash);
    const signature = await wallet.signMessage(messageBytes);

    console.log(`Signing and responding to task ${taskIndex}`);
    // console.log("Fetching prev state from EigenDA...");
    logger.color('white').bold().append('EigenDA Handler || ').info("Fetching previous state from EigenDA ...", requestID);
    const prevState = await getData(requestID);
    const prevReqID = requestID;
    logger.color('white').bold().append('EigenDA Handler || ').info("Previous State:");
    console.log(prevState);

    // Execute the task
    logger.color('white').bold().append('Executor || ').info("Executing task:");
    console.log(taskMetadata);
    let parsedMetadata = JSON.parse(taskMetadata);
    let updatedState: any;
    updatedState = executeMethod(taskName, parsedMetadata, prevState);
    logger.color('white').bold().append('Executor || ').info("Updated state after executing task:");
    console.log(updatedState)
    logger.color('white').bold().append('Confirmation Handler || ').info("Soft Confirmation by sequencer reached");

    logger.color('white').bold().append('EigenDA Handler || ').info("Posting updated state to EigenDA...");
    const reqID = await postData(updatedState);
    logger.color('white').bold().append('EigenDA Handler || ').info("New State Request ID: ", reqID);
    requestID = reqID;
    logger.color('white').bold().append('Confirmation Handler || ').info("Medium Confirmation by DA Layer reached");

    const operators = [await wallet.getAddress()];
    const signatures = [signature];
    const signedTask = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address[]", "bytes[]", "uint32"],
        [operators, signatures, ethers.toBigInt(await provider.getBlockNumber() - 1)]
    );

    const tx = await helloWorldServiceManager.respondToTask(
        { name: taskName, taskCreatedBlock: taskCreatedBlock, taskMetadata: JSON.stringify(parsedMetadata), reqID : "0x" },
        taskIndex,
        signature,
        prevReqID,
        reqID
    );
    await tx.wait();
    logger.color('white').bold().append('L1 Handler || ').info(`Responded to task with L1 Tx Hash : ${tx.hash}`);
    logger.color('white').bold().append('Confirmation Handler || ').info("Hard Confirmation by L1 reached");

};

const monitorNewTasks = async () => {



    let processedTaskIndices = new Set<number>();

    helloWorldServiceManager.on("NewTaskCreated", async (taskIndex: number, task: any) => {
        if (processedTaskIndices.has(taskIndex)) {
            console.log(`Task ${taskIndex} already processed, skipping...`);
            return;
        }

        console.log(task)
        console.log(`New task detected: Hello, ${task.name}`);
        signAndRespondToTask(taskIndex, task.taskCreatedBlock, task.name, task[2]);
        processedTaskIndices.add(taskIndex);
    });

    console.log(`
                                                   
 _____         _____ _____     _____ _       _     
|  _  |___ ___|  |  |   __|___|     | |_ ___|_|___ 
|     | . | . |  |  |__   |___|   --|   | .'| |   |
|__|__|  _|  _| ___/|_____|   |_____|_|_|__,|_|_|_|
      |_| |_|                                      
`)
    console.log("Monitoring for new tasks...");
};

const main = async () => {
    try {
        // console.log(`Creating new task "EigenWorld"`);
        // const tx = await helloWorldServiceManager.createNewTask("mint",JSON.stringify({ address: "0x123", amount: 100 }),"0x");
        // console.log("Tx hash: ", tx.hash);
        // await registerOperator();
        monitorNewTasks();
    } catch (error) {
        console.error("Error monitoring tasks:", error);
    }
};

main().catch((error) => {
    console.error("Error in main function:", error);
});
