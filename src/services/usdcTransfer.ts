import { Contract, JsonRpcProvider, Wallet, parseUnits } from "ethers";

const USDC_DECIMALS = 6;

/** USDC contract addresses (testnet only – Mural sandbox uses testnets). */
const USDC_ADDRESS: Record<string, string> = {
  ETHEREUM: "0x622333D6627BaE0a7e76F507f8E21aAed577Dd57", // Sepolia
  POLYGON: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582", // Amoy
  BASE: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia
};

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
];

function getRpcUrl(blockchain: string): string | undefined {
  const key = `RPC_URL_${blockchain}`;
  const url = process.env[key] ?? process.env.RPC_URL;
  return typeof url === "string" && url.length > 0 ? url : undefined;
}

/**
 * Send USDC from the configured sender wallet to the given address (testnet only).
 * Requires env: SENDER_PRIVATE_KEY and RPC_URL (or RPC_URL_<BLOCKCHAIN>).
 * Use testnet RPCs (e.g. Polygon Amoy, Ethereum Sepolia, Base Sepolia).
 * @returns Transaction hash if sent; undefined if transfer is disabled (missing config).
 */
export async function sendUsdc(
  toAddress: string,
  amountUsdc: number,
  blockchain: string
): Promise<string | undefined> {
  const privateKey = process.env.SENDER_PRIVATE_KEY;
  const rpcUrl = getRpcUrl(blockchain);

  if (!privateKey || !rpcUrl) {
    return undefined;
  }

  const chain = blockchain.toUpperCase();
  const usdcAddress = USDC_ADDRESS[chain];
  if (!usdcAddress) {
    throw new Error(`Unsupported blockchain for USDC transfer: ${blockchain}. Supported: ETHEREUM, POLYGON, BASE (testnet only).`);
  }

  const provider = new JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(privateKey.trim(), provider);
  const contract = new Contract(usdcAddress, ERC20_ABI, wallet);

  const amountWei = parseUnits(amountUsdc.toFixed(USDC_DECIMALS), USDC_DECIMALS);
  const tx = await contract.transfer(toAddress, amountWei);
  const receipt = await tx.wait();

  if (!receipt?.hash) {
    throw new Error("Transfer submitted but no transaction hash returned");
  }
  return receipt.hash;
}
