# DropParty

> Fund a pool. Share a link. Watch the chaos unfold.

DropParty is a viral, on-chain USDC giveaway platform on the **Arc Network**. Anyone can fund a drop, share the link, and let the first N people who claim split the pool — with the smart contract holding the funds, escrowing the rules, and settling claims atomically.

No backend custody. No off-chain promises. Just a contract, a wallet, and a link.

---

## The idea

Most onchain "airdrops" are either too complicated (Merkle proofs, claim windows, KYC) or too dumb (faucet that gets botted to zero in 30 seconds). DropParty sits in the middle:

- A creator deposits `amountPerClaim × maxClaims` USDC into the contract in one transaction.
- A 128-bit random token is generated client-side and appended to the share URL. Without that token in the URL, the UI won't show the claim button — meaning bots scraping the contract can't reasonably guess valid links.
- First N wallets to hit the link and click claim get the USDC. One claim per wallet, enforced on-chain.
- If the drop expires unclaimed, anyone can trigger a refund back to the creator.
- Creator can cancel at any time and pull back the unclaimed remainder.

That's it. Nothing fancier than what the contract enforces.

---

## Stack

| | |
|---|---|
| **Frontend** | React 19, Vite 7, Tailwind v4, Shadcn (Radix), Framer Motion, Wouter |
| **Web3** | Wagmi v3, Viem, TanStack Query |
| **Backend** | Express 5, Node.js 24, TypeScript |
| **Database** | PostgreSQL + Drizzle ORM |
| **Contracts** | Solidity 0.8.20, Foundry |
| **Validation** | Zod end-to-end, OpenAPI spec → Orval-generated typed client |
| **Monorepo** | pnpm workspaces |

The backend is intentionally thin — it indexes drops and claims for fast list/feed queries. **All authoritative state lives on the contract.** If the API died tomorrow, every drop would still be claimable directly via the contract.

---

## Live contract

| | |
|---|---|
| Network | Arc Testnet |
| Chain ID | `5042002` |
| RPC | `https://rpc.testnet.arc.network` |
| Explorer | https://testnet.arcscan.app |
| **DropParty** | [`0x8017c01FFbDB22E6170dDD420355f497f3229A0D`](https://testnet.arcscan.app/address/0x8017c01FFbDB22E6170dDD420355f497f3229A0D) |
| **USDC** | `0x3600000000000000000000000000000000000000` |

---

## Repository layout

```
.
├── artifacts/
│   ├── drop-party/         # React + Vite frontend (the dapp)
│   └── api-server/         # Express 5 REST API (indexer)
├── contracts/              # Solidity sources + Foundry tests
├── lib/
│   ├── db/                 # Drizzle schema, migrations, client
│   ├── api-spec/           # OpenAPI spec (source of truth)
│   └── api-client-react/   # Generated TanStack Query hooks
├── pnpm-workspace.yaml
└── vercel.json
```

---

## Local development

**Prereqs:** Node.js 24, pnpm 10, a local or hosted PostgreSQL.

```bash
# 1. Install
pnpm install

# 2. Configure the API
# Create artifacts/api-server/.env:
#   DATABASE_URL=postgresql://user:pass@host:5432/dropparty
#   ALLOWED_ORIGIN=http://localhost:22153

# 3. Push the schema
pnpm --filter @workspace/db run push

# 4. Run both services (in two terminals)
pnpm --filter @workspace/api-server run dev    # :8080
pnpm --filter @workspace/drop-party run dev    # :22153
```

Then point your browser at `http://localhost:22153` and connect a wallet on Arc Testnet.

### Working on the contract

```bash
cd contracts
forge build
forge test -vvv
```

The deployed address is hardcoded in `artifacts/drop-party/src/lib/contracts.ts`. If you redeploy, update it there.

---

## Deployment

DropParty deploys as **two separate Vercel projects** sharing the same repo. This keeps the static frontend cacheable on the edge and the API on its own scalable runtime.

### Frontend project

| Setting | Value |
|---|---|
| Root Directory | *(blank — repo root)* |
| Build Command | *(blank — uses `vercel.json`)* |
| Output Directory | `artifacts/drop-party/dist/public` |
| Env vars | `VITE_API_URL` → URL of the API project |

### API project

| Setting | Value |
|---|---|
| Root Directory | `artifacts/api-server` |
| Build Command | *(blank — uses `vercel.json`)* |
| Env vars | `DATABASE_URL` (e.g. Neon), `ALLOWED_ORIGIN` (frontend URL) |

After the API is live, push the schema to the production database:

```bash
DATABASE_URL="postgresql://..." pnpm --filter @workspace/db run push
```

---

## API reference

All routes are JSON. The OpenAPI spec lives in `lib/api-spec/openapi.yaml` and the typed React client is regenerated from it on every build.

| Method | Path | Description |
|---|---|---|
| `GET`  | `/api/drops`              | Paginated list of indexed drops |
| `GET`  | `/api/drops/:id`          | Single drop with current claim count |
| `POST` | `/api/drops`              | Index a newly created drop (called after on-chain tx confirms) |
| `GET`  | `/api/drops/:id/claims`   | Claim feed for a drop |
| `POST` | `/api/drops/:id/claims`   | Record a claim (called after on-chain tx confirms) |
| `GET`  | `/api/health`             | Health check |

The API is an indexer, not a source of truth. Every write is verified against the on-chain transaction before being persisted.

---

## Security notes

- **Share-link gating is UX, not security.** The 128-bit URL token prevents the casual frontend from showing "claim" to randos browsing the contract — but a determined bot calling the contract directly can still race claims. Treat drops as first-come-first-serve, period.
- `pnpm-workspace.yaml` enforces a 24-hour `minimumReleaseAge` on every npm dependency to mitigate supply-chain attacks. Don't disable it.
- The contract has been audited internally; an external audit is on the roadmap before mainnet.

---

## License

MIT. Go wild.
