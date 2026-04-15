# DropParty

Viral onchain USDC giveaway platform built on Arc Testnet. Create a funded drop, share the link, and let anyone with it claim their share instantly.

## How it works

1. **Create** — Set a title, USDC amount per claim, max number of claimants, and an optional expiry date. The total USDC (`amountPerClaim × maxClaims`) is pulled from your wallet into the smart contract.
2. **Share** — A unique link is generated with a 128-bit random token in the URL. Only people with the link can see the claim button.
3. **Claim** — Anyone with the link connects their wallet and claims their USDC in one click. Funds transfer directly on-chain.
4. **Finalize** — Once all slots are filled the drop closes automatically. Creators can cancel at any time to recover remaining funds. Expired drops can be refunded by anyone.

## Tech stack

| Layer | Tools |
|---|---|
| Frontend | React, Vite, Tailwind CSS, Shadcn/Radix UI, Framer Motion |
| Web3 | Wagmi, Viem, TanStack Query |
| Backend | Express 5, TypeScript, Node.js 24 |
| Database | PostgreSQL, Drizzle ORM |
| Contracts | Solidity 0.8.20, Foundry |
| Monorepo | pnpm workspaces |

## Smart contract

| | |
|---|---|
| Network | Arc Testnet (Chain ID: `5042002`) |
| RPC | `https://rpc.testnet.arc.network` |
| Explorer | [arcscan.app](https://testnet.arcscan.app) |
| DropParty | `0x8017c01FFbDB22E6170dDD420355f497f3229A0D` |
| USDC | `0x3600000000000000000000000000000000000000` |

## Monorepo structure

```
/
├── artifacts/
│   ├── drop-party/       # React + Vite frontend
│   └── api-server/       # Express 5 REST API
├── contracts/            # Solidity contracts (Foundry)
├── lib/
│   └── db/               # Drizzle schema + migrations
└── pnpm-workspace.yaml
```

## Local development

**Prerequisites:** Node.js 24, pnpm 10, PostgreSQL

```bash
# Install dependencies
pnpm install

# Set environment variables
# Create .env in artifacts/api-server with:
# DATABASE_URL=postgresql://...
# ALLOWED_ORIGIN=http://localhost:22153

# Push database schema
pnpm --filter @workspace/db run push

# Start API server (port 8080)
pnpm --filter @workspace/api-server run dev

# Start frontend (port 22153)
pnpm --filter @workspace/drop-party run dev
```

## Deployment

The project deploys as two separate Vercel projects:

### Frontend

- **Root Directory:** leave blank (repo root)
- **Build Command:** leave blank (uses `vercel.json`)
- **Environment Variables:**
  - `VITE_API_URL` — URL of the deployed API

### API Server

- **Root Directory:** `artifacts/api-server`
- **Build Command:** leave blank (uses `vercel.json`)
- **Environment Variables:**
  - `DATABASE_URL` — Neon (or any external) PostgreSQL connection string
  - `ALLOWED_ORIGIN` — Frontend URL for CORS

After deploying the API, run the schema migration:

```bash
DATABASE_URL="your-neon-string" pnpm --filter @workspace/db run push
```

## API routes

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/drops` | List all active drops |
| `GET` | `/api/drops/:id` | Get a single drop |
| `POST` | `/api/drops` | Index a new drop |
| `GET` | `/api/drops/:id/claims` | List claims for a drop |
| `POST` | `/api/drops/:id/claims` | Record a claim |
