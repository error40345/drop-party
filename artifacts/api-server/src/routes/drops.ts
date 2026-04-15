import { Router, type IRouter } from "express";
import { eq, desc, sql, and } from "drizzle-orm";
import { createHash } from "crypto";
import rateLimit from "express-rate-limit";
import { db, dropsTable, claimsTable } from "@workspace/db";
import {
  CreateDropBody,
  GetDropParams,
  ListDropClaimsParams,
  RecordClaimParams,
  RecordClaimBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

// ── Rate limiters ───────────────────────────────────────────────────────────

const readLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

const verifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many verification attempts, slow down" },
});

// ── Utility ─────────────────────────────────────────────────────────────────

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

function isValidRawToken(t: unknown): t is string {
  return typeof t === "string" && /^[0-9a-f]{32}$/.test(t);
}

// ── Routes ──────────────────────────────────────────────────────────────────

router.get("/drops", readLimiter, async (req, res): Promise<void> => {
  const drops = await db
    .select()
    .from(dropsTable)
    .orderBy(desc(dropsTable.createdAt));
  req.log.info({ count: drops.length }, "Listed drops");
  res.json(drops.map(serializeDrop));
});

router.post("/drops", writeLimiter, async (req, res): Promise<void> => {
  const parsed = CreateDropBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid create drop body");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;

  const [drop] = await db
    .insert(dropsTable)
    .values({
      contractAddress: data.contractAddress,
      creatorAddress: data.creatorAddress,
      title: data.title,
      totalAmount: data.totalAmount,
      amountPerClaim: data.amountPerClaim,
      maxClaims: data.maxClaims,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      txHash: data.txHash ?? null,
      tokenHash: data.tokenHash ?? null,
      isActive: true,
    })
    .returning();

  req.log.info({ dropId: drop.id }, "Created drop");
  res.status(201).json(serializeDrop(drop));
});

router.get("/drops/stats/recent", readLimiter, async (req, res): Promise<void> => {
  const recent = await db
    .select({
      claimerAddress: claimsTable.claimerAddress,
      amount: claimsTable.amount,
      dropTitle: dropsTable.title,
      contractAddress: dropsTable.contractAddress,
      claimedAt: claimsTable.claimedAt,
    })
    .from(claimsTable)
    .innerJoin(dropsTable, eq(claimsTable.dropId, dropsTable.id))
    .orderBy(desc(claimsTable.claimedAt))
    .limit(20);

  res.json(
    recent.map((r) => ({
      ...r,
      claimedAt: r.claimedAt.toISOString(),
    }))
  );
});

router.get("/drops/stats/summary", readLimiter, async (req, res): Promise<void> => {
  const [dropsStats] = await db
    .select({
      totalDropsCount: sql<number>`count(*)::int`,
      activeDropsCount: sql<number>`sum(case when ${dropsTable.isActive} then 1 else 0 end)::int`,
      totalDropped: sql<string>`coalesce(sum(${dropsTable.totalAmount}::numeric), 0)::text`,
    })
    .from(dropsTable);

  const [claimsStats] = await db
    .select({
      totalClaims: sql<number>`count(*)::int`,
    })
    .from(claimsTable);

  res.json({
    totalDropped: dropsStats?.totalDropped ?? "0",
    totalClaims: claimsStats?.totalClaims ?? 0,
    activeDropsCount: dropsStats?.activeDropsCount ?? 0,
    totalDropsCount: dropsStats?.totalDropsCount ?? 0,
  });
});

/**
 * Verify that a raw token matches the stored hash for a drop.
 * Rate-limited to prevent brute-force enumeration attempts.
 * Returns 200 { valid: true } on match, 403 on mismatch, 404 if drop not found.
 * Drops created before token hashing was introduced (no tokenHash stored)
 * are treated as open: anyone with the correct drop ID path can see them.
 */
router.get(
  "/drops/:contractAddress/verify-token",
  verifyLimiter,
  async (req, res): Promise<void> => {
    const params = GetDropParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const rawToken = req.query["token"];
    if (!isValidRawToken(rawToken)) {
      res.status(400).json({ error: "Invalid token format" });
      return;
    }

    const [drop] = await db
      .select({ tokenHash: dropsTable.tokenHash })
      .from(dropsTable)
      .where(eq(dropsTable.contractAddress, params.data.contractAddress));

    if (!drop) {
      res.status(404).json({ error: "Drop not found" });
      return;
    }

    if (!drop.tokenHash) {
      res.json({ valid: true, legacy: true });
      return;
    }

    const computedHash = hashToken(rawToken);
    if (computedHash !== drop.tokenHash) {
      res.status(403).json({ error: "Invalid token" });
      return;
    }

    res.json({ valid: true });
  }
);

router.get("/drops/:contractAddress", readLimiter, async (req, res): Promise<void> => {
  const params = GetDropParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [drop] = await db
    .select()
    .from(dropsTable)
    .where(eq(dropsTable.contractAddress, params.data.contractAddress));

  if (!drop) {
    res.status(404).json({ error: "Drop not found" });
    return;
  }

  res.json(serializeDrop(drop));
});

router.get("/drops/:contractAddress/claims", readLimiter, async (req, res): Promise<void> => {
  const params = ListDropClaimsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [drop] = await db
    .select()
    .from(dropsTable)
    .where(eq(dropsTable.contractAddress, params.data.contractAddress));

  if (!drop) {
    res.status(404).json({ error: "Drop not found" });
    return;
  }

  const claims = await db
    .select()
    .from(claimsTable)
    .where(eq(claimsTable.dropId, drop.id))
    .orderBy(desc(claimsTable.claimedAt));

  res.json(claims.map(serializeClaim));
});

/**
 * Record an on-chain claim.
 * Requires X-Drop-Token header matching the drop's stored token hash.
 * Duplicate claims are rejected at the DB level via a unique constraint on
 * (drop_id, claimer_address), eliminating race conditions.
 */
router.post("/drops/:contractAddress/claims", writeLimiter, async (req, res): Promise<void> => {
  const params = RecordClaimParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = RecordClaimBody.safeParse(req.body);
  if (!body.success) {
    req.log.warn({ errors: body.error.message }, "Invalid claim body");
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [drop] = await db
    .select()
    .from(dropsTable)
    .where(eq(dropsTable.contractAddress, params.data.contractAddress));

  if (!drop) {
    res.status(404).json({ error: "Drop not found" });
    return;
  }

  // ── Token verification ────────────────────────────────────────────────────
  if (drop.tokenHash) {
    const rawToken = req.headers["x-drop-token"];
    if (!isValidRawToken(rawToken)) {
      res.status(401).json({ error: "Missing or invalid X-Drop-Token header" });
      return;
    }
    const computedHash = hashToken(rawToken);
    if (computedHash !== drop.tokenHash) {
      res.status(403).json({ error: "Invalid drop token" });
      return;
    }
  }

  if (!drop.isActive) {
    res.status(400).json({ error: "Drop is no longer active" });
    return;
  }

  if (drop.claimedCount >= drop.maxClaims) {
    res.status(400).json({ error: "Drop is fully claimed" });
    return;
  }

  try {
    const [claim] = await db
      .insert(claimsTable)
      .values({
        dropId: drop.id,
        claimerAddress: body.data.claimerAddress,
        amount: body.data.amount,
        txHash: body.data.txHash ?? null,
      })
      .returning();

    const newClaimedCount = drop.claimedCount + 1;
    await db
      .update(dropsTable)
      .set({
        claimedCount: newClaimedCount,
        isActive: newClaimedCount < drop.maxClaims,
      })
      .where(eq(dropsTable.id, drop.id));

    req.log.info({ claimId: claim.id, dropId: drop.id }, "Claim recorded");
    res.status(201).json(serializeClaim(claim));
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr?.code === "23505") {
      res.status(409).json({ error: "Address has already claimed from this drop" });
      return;
    }
    throw err;
  }
});

function serializeDrop(drop: typeof dropsTable.$inferSelect) {
  const { tokenHash: _omit, ...rest } = drop;
  return {
    ...rest,
    expiresAt: drop.expiresAt ? drop.expiresAt.toISOString() : null,
    createdAt: drop.createdAt.toISOString(),
    updatedAt: undefined,
  };
}

function serializeClaim(claim: typeof claimsTable.$inferSelect) {
  return {
    ...claim,
    claimedAt: claim.claimedAt.toISOString(),
  };
}

export default router;
