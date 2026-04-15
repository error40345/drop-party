import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, dropsTable, claimsTable } from "@workspace/db";
import {
  CreateDropBody,
  GetDropParams,
  ListDropClaimsParams,
  RecordClaimParams,
  RecordClaimBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/drops", async (req, res): Promise<void> => {
  const drops = await db
    .select()
    .from(dropsTable)
    .orderBy(desc(dropsTable.createdAt));
  req.log.info({ count: drops.length }, "Listed drops");
  res.json(drops.map(serializeDrop));
});

router.post("/drops", async (req, res): Promise<void> => {
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
      isActive: true,
    })
    .returning();

  req.log.info({ dropId: drop.id }, "Created drop");
  res.status(201).json(serializeDrop(drop));
});

router.get("/drops/stats/recent", async (req, res): Promise<void> => {
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

router.get("/drops/stats/summary", async (req, res): Promise<void> => {
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

router.get("/drops/:contractAddress", async (req, res): Promise<void> => {
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

router.get("/drops/:contractAddress/claims", async (req, res): Promise<void> => {
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

router.post("/drops/:contractAddress/claims", async (req, res): Promise<void> => {
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

  if (!drop.isActive) {
    res.status(400).json({ error: "Drop is no longer active" });
    return;
  }

  if (drop.claimedCount >= drop.maxClaims) {
    res.status(400).json({ error: "Drop is fully claimed" });
    return;
  }

  const [existingClaim] = await db
    .select()
    .from(claimsTable)
    .where(
      eq(claimsTable.dropId, drop.id)
    )
    .limit(1);

  // Check for duplicate claimer
  const allClaims = await db
    .select()
    .from(claimsTable)
    .where(eq(claimsTable.dropId, drop.id));

  const alreadyClaimed = allClaims.some(
    (c) => c.claimerAddress.toLowerCase() === body.data.claimerAddress.toLowerCase()
  );

  if (alreadyClaimed) {
    res.status(400).json({ error: "Address has already claimed from this drop" });
    return;
  }

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
});

function serializeDrop(drop: typeof dropsTable.$inferSelect) {
  return {
    ...drop,
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
