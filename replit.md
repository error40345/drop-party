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

### Arc Network Details
- **Network**: Arc Testnet
- **Chain ID**: 5042002
- **RPC**: `https://rpc.testnet.arc.network`
- **Gas token**: USDC (18 decimals)
- **Explorer**: `https://testnet.arcscan.app`
- **Faucet**: `https://faucet.circle.com`

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
