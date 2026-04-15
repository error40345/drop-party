# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Project: DropParty

Viral onchain USDC giveaway platform built on Arc Network (Chain ID: 5042002, Arc Testnet).

### How it works
- Creator funds a USDC pool, sets number of claimants, and shares a link
- First N people to visit the link and claim get instant USDC
- Live progress bar, real-time claim feed, share-to-X button for virality

### Architecture
- **Frontend**: `artifacts/drop-party/` — React + Vite, dark neon-green design
  - `/` — Landing page with live stats and active drops list
  - `/create` — Create a new drop (simulated wallet connect)
  - `/drop/:contractAddress` — Live drop claim page with polling
  - `/drop/:contractAddress/claimed` — Post-claim celebration
- **API**: `artifacts/api-server/` — Express 5, `/api` prefix
  - Routes: `src/routes/drops.ts` — Full CRUD + stats endpoints
- **Database**: PostgreSQL via Drizzle ORM
  - Tables: `drops`, `claims` (see `lib/db/src/schema/`)

### Unique Share Links & Security Model

- When a drop is created, a **128-bit cryptographically random token** is generated in the browser using `crypto.getRandomValues`
- The token is embedded in the share URL: `/drop/:dropId/:token` (e.g. `/drop/42/a3f9c8...`)
- The token is **never stored on-chain** — it lives only in the creator's `localStorage` and in the URL they share
- The drop page requires a valid 32-char hex token in the URL to render; without it, users see a "Link Required" lock screen
- **Security level**: The token has 2^128 possible values — impossible to guess by brute force
- **Important caveat**: The smart contract itself does not enforce the token. A technically sophisticated person *could* call the contract directly, bypassing the UI gate. For a testnet giveaway app this is an acceptable trade-off. For production, token enforcement would need to move on-chain (e.g. a Merkle proof or signature scheme).

### Vercel Deployment

#### Frontend (Vercel Project #1)
The `vercel.json` at the repo root configures this automatically:
- **Build command**: `pnpm --filter @workspace/api-client-react build && pnpm --filter @workspace/drop-party build`
- **Output directory**: `artifacts/drop-party/dist/public`
- **SPA routing**: all routes rewire to `/index.html`
- **Env var to set on Vercel**: `VITE_API_URL=https://your-api.vercel.app`

#### API (Vercel Project #2 — deploy from `artifacts/api-server/`)
- Uses `api/index.ts` as the Vercel serverless entry point
- `vercel.json` in `artifacts/api-server/` handles routing and build
- **Env vars to set on Vercel**: `DATABASE_URL`, `ALLOWED_ORIGIN=https://your-frontend.vercel.app`
- Recommended: use **Neon** or **Supabase** for PostgreSQL (they have built-in connection poolers for serverless)

### Arc Network Details
- **Network**: Arc Testnet
- **Chain ID**: 5042002
- **RPC**: `https://rpc.testnet.arc.network`
- **Gas token**: USDC (18 decimals)
- **Explorer**: `https://testnet.arcscan.app`
- **Faucet**: `https://faucet.circle.com`

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
