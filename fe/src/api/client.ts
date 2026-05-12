import ky from 'ky';

const STATIC_TOKEN = process.env.NEXT_PUBLIC_BEARER_TOKEN;

// !TODO get from wallet sign-in
const WALLET_ADDRESS = process.env.NEXT_PUBLIC_WALLET_ADDRESS;

export const api = ky.create({
    baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${STATIC_TOKEN}`,
        'X-Wallet-Address': WALLET_ADDRESS,
    },
});

console.log(process.env.NEXT_PUBLIC_API_BASE_URL)