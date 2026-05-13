import ky from "ky";

const STATIC_TOKEN = process.env.NEXT_PUBLIC_BEARER_TOKEN;
const DEFAULT_WALLET_ADDRESS = process.env.NEXT_PUBLIC_WALLET_ADDRESS;
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

function getWalletAddress(): string | undefined {
  if (typeof window === "undefined") return DEFAULT_WALLET_ADDRESS;
  return localStorage.getItem("walletAddress") || DEFAULT_WALLET_ADDRESS;
}

export const api = ky.create({
  prefix: API_BASE_URL,
  timeout: 150_000,
  hooks: {
    beforeRequest: [
      ({ request }) => {
        request.headers.set("Content-Type", "application/json");

        if (STATIC_TOKEN) {
          request.headers.set("Authorization", `Bearer ${STATIC_TOKEN}`);
        }

        const wallet = getWalletAddress();
        if (wallet) {
          request.headers.set("X-Wallet-Address", DEFAULT_WALLET_ADDRESS);
        }
      },
    ],
  },
});
