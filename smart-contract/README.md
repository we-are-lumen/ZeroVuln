# ZVContract (0G Galileo)
## Deploy
1) Masuk folder `smart-contract/`
2) Copy env:
   - `cp .env.example .env`
   - isi `PRIVATE_KEY` (wallet deployer) dan (optional) `RPC_URL`
3) Install deps:
   - `npm install`
4) Compile:
   - `npm run compile`
5) Deploy ke 0G Galileo:
   - `npm run deploy:galileo`

Output akan mencetak address ZVContract.

## Env untuk integrasi
Setelah deploy, simpan address contract ini ke:
- FE: `NEXT_PUBLIC_ZV_CONTRACT_ADDRESS=<address>`
- BE (Supabase Functions env): `ZV_CONTRACT_ADDRESS=<address>`

