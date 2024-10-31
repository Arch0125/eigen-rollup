export const tokenStorage = {
    balances: {},
    name: "TestToken",
    symbol: "TT",
    decimals: 18
}

export function mint(address:string, amount:number, tokenStorage:any) {
    if (tokenStorage.balances[address]) {
        tokenStorage.balances[address] += amount;
    } else {
        tokenStorage.balances[address] = amount;
    }
    return tokenStorage;
}

export function transfer(from:string, to:string, amount:number, tokenStorage:any) {
    if (tokenStorage.balances[from] >= amount) {
        tokenStorage.balances[from] -= amount;
        if (tokenStorage.balances[to]) {
            tokenStorage.balances[to] += amount;
        } else {
            tokenStorage.balances[to] = amount;
        }
    }
    return tokenStorage;
}

export function balanceOf(address:string, tokenStorage:any) {
    return tokenStorage.balances[address];
}