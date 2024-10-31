import { executeMethod } from "./executor"

const tokenStorage = {
    balances: {}
}

const res = executeMethod("mint", { address: "0x123", amount: 100 }, tokenStorage);
console.log(res);