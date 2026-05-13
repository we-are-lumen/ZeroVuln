import ky from "ky";

const STATIC_TOKEN = process.env.NEXT_PUBLIC_BEARER_TOKEN;
const DEFAULT_WALLET_ADDRESS = process.env.NEXT_PUBLIC_WALLET_ADDRESS;
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

function getWalletAddress(): string | undefined {
  // Saat SSR, localStorage tidak tersedia → pakai default env saja.
  if (typeof window === "undefined") return DEFAULT_WALLET_ADDRESS;
  return localStorage.getItem("walletAddress") || DEFAULT_WALLET_ADDRESS;
}

export const api = ky.create({
  // ky v2: `prefixUrl` diganti jadi `prefix`
  // (lihat error: "The `prefixUrl` option has been renamed `prefix` in v2")
  prefix: API_BASE_URL,
  timeout: 10000,
  hooks: {
    beforeRequest: [
      ({ request }) => {
        // ky v2: beforeRequest menerima object {request, options, retryCount}
        request.headers.set("Content-Type", "application/json");

        if (STATIC_TOKEN) {
          request.headers.set("Authorization", `Bearer ${STATIC_TOKEN}`);
        }

        const wallet = getWalletAddress();
        if (wallet) {
          request.headers.set("X-Wallet-Address", wallet);
        }
      },
    ],
  },
});
