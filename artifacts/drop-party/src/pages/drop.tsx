import { useEffect, useState, useRef } from "react";
import { Layout } from "@/components/layout";
import { useWallet } from "@/lib/wallet";
import { shortenAddress } from "@/lib/utils";
import { isValidToken } from "@/lib/drops-store";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useLocation, useParams } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Zap, Share2, Lock, XCircle, Copy, Check } from "lucide-react";
import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useAccount } from "wagmi";
import {
  DROP_PARTY_ADDRESS,
  DROP_PARTY_ABI,
  formatUsdc,
  arcTestnet,
} from "@/lib/contracts";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export function DropPage() {
  const { dropId: dropIdStr, token } = useParams<{ dropId: string; token: string }>();
  const { address: walletAddress, connect } = useWallet();
  const { address: wagmiAddress } = useAccount();
  const effectiveAddress = wagmiAddress ?? walletAddress;
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // Token verification: null = checking, true = ok, false = rejected
  const [tokenVerified, setTokenVerified] = useState<null | boolean>(null);
  const verifyCalledRef = useRef(false);

  const dropId = dropIdStr !== undefined ? BigInt(dropIdStr) : undefined;
  const tokenOk = isValidToken(token);

  // ── Server-side token verification ─────────────────────────────────────────
  // Verifies that SHA-256(token) matches what was stored when the drop was created.
  // This prevents someone from bypassing the UI gate with any random 32-char hex string.
  useEffect(() => {
    if (!tokenOk || !dropIdStr || verifyCalledRef.current) return;
    verifyCalledRef.current = true;

    const contractKey = `${DROP_PARTY_ADDRESS}:${dropIdStr}`;
    const encodedKey = encodeURIComponent(contractKey);

    fetch(`${API_BASE}/api/drops/${encodedKey}/verify-token?token=${token}`)
      .then((res) => {
        setTokenVerified(res.ok);
      })
      .catch(() => {
        // Network failure → allow access (fail open so a missing API doesn't
        // break the entire app; the contract is the real security boundary).
        setTokenVerified(true);
      });
  }, [tokenOk, dropIdStr, token]);

  // ── Read drop info ──────────────────────────────────────────────────────────
  const {
    data: dropData,
    isLoading: isLoadingDrop,
    refetch: refetchDrop,
  } = useReadContract({
    address: DROP_PARTY_ADDRESS,
    abi: DROP_PARTY_ABI,
    functionName: "getDrop",
    args: dropId !== undefined ? [dropId] : undefined,
    query: {
      enabled: tokenVerified === true && dropId !== undefined,
      refetchInterval: 5000,
    },
  });

  // ── Check if user has claimed ───────────────────────────────────────────────
  const { data: hasClaimed, refetch: refetchHasClaimed } = useReadContract({
    address: DROP_PARTY_ADDRESS,
    abi: DROP_PARTY_ABI,
    functionName: "hasClaimed",
    args: dropId !== undefined && effectiveAddress
      ? [dropId, effectiveAddress as `0x${string}`]
      : undefined,
    query: {
      enabled: tokenVerified === true && dropId !== undefined && !!effectiveAddress,
      refetchInterval: 5000,
    },
  });

  // ── Claim ───────────────────────────────────────────────────────────────────
  const {
    writeContract: writeClaim,
    data: claimTxHash,
    isPending: isClaimPending,
    error: claimWriteError,
  } = useWriteContract();

  const { isLoading: isClaimConfirming, isSuccess: isClaimConfirmed } =
    useWaitForTransactionReceipt({ hash: claimTxHash });

  useEffect(() => {
    if (isClaimConfirmed) {
      refetchDrop();
      refetchHasClaimed();

      // Record claim in the API (best-effort, non-blocking).
      // Sends X-Drop-Token so the server can verify this came from someone
      // who legitimately had the share link.
      if (effectiveAddress && claimTxHash && dropData) {
        const contractKey = `${DROP_PARTY_ADDRESS}:${dropIdStr}`;
        const encodedKey = encodeURIComponent(contractKey);
        const amount = formatUsdc(dropData[2]);

        fetch(`${API_BASE}/api/drops/${encodedKey}/claims`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Drop-Token": token ?? "",
          },
          body: JSON.stringify({
            claimerAddress: effectiveAddress,
            amount,
            txHash: claimTxHash,
          }),
        }).catch(() => {});
      }

      setLocation(`/drop/${dropIdStr}/${token}/claimed`);
    }
  }, [isClaimConfirmed]);

  useEffect(() => {
    if (claimWriteError) {
      toast({
        title: "Claim failed",
        description: claimWriteError.message.slice(0, 150),
        variant: "destructive",
      });
    }
  }, [claimWriteError]);

  // ── Cancel Drop ─────────────────────────────────────────────────────────────
  const {
    writeContract: writeCancel,
    data: cancelTxHash,
    isPending: isCancelPending,
    error: cancelWriteError,
  } = useWriteContract();

  const { isLoading: isCancelConfirming, isSuccess: isCancelConfirmed } =
    useWaitForTransactionReceipt({ hash: cancelTxHash });

  useEffect(() => {
    if (isCancelConfirmed) {
      refetchDrop();
      setShowCancelDialog(false);
      toast({
        title: "Drop cancelled",
        description: "Your remaining USDC has been returned to your wallet.",
      });
    }
  }, [isCancelConfirmed]);

  useEffect(() => {
    if (cancelWriteError) {
      setShowCancelDialog(false);
      toast({
        title: "Cancel failed",
        description: cancelWriteError.message.slice(0, 150),
        variant: "destructive",
      });
    }
  }, [cancelWriteError]);

  const handleClaim = () => {
    if (!effectiveAddress) { connect(); return; }
    if (dropId === undefined) return;
    writeClaim({
      address: DROP_PARTY_ADDRESS,
      abi: DROP_PARTY_ABI,
      functionName: "claim",
      args: [dropId],
      chainId: arcTestnet.id,
    });
  };

  const handleCancelConfirm = () => {
    if (dropId === undefined) return;
    writeCancel({
      address: DROP_PARTY_ADDRESS,
      abi: DROP_PARTY_ABI,
      functionName: "cancelDrop",
      args: [dropId],
      chainId: arcTestnet.id,
    });
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  // ── Gate: invalid token format ──────────────────────────────────────────────
  if (!tokenOk) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex flex-col items-center justify-center text-center gap-6 max-w-md mx-auto">
          <Lock className="w-16 h-16 text-primary/40" />
          <h1 className="text-3xl font-black font-mono uppercase tracking-tight">Link Required</h1>
          <p className="font-mono text-muted-foreground text-sm">
            This drop is private. You need the creator's share link to claim.
          </p>
        </div>
      </Layout>
    );
  }

  // ── Gate: verifying token against server ────────────────────────────────────
  if (tokenVerified === null) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[50vh]">
          <Loader2 className="w-12 h-12 text-primary animate-spin" />
          <p className="mt-4 font-mono text-muted-foreground uppercase tracking-widest">
            Verifying access...
          </p>
        </div>
      </Layout>
    );
  }

  // ── Gate: server rejected the token ────────────────────────────────────────
  if (tokenVerified === false) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex flex-col items-center justify-center text-center gap-6 max-w-md mx-auto">
          <Lock className="w-16 h-16 text-destructive/40" />
          <h1 className="text-3xl font-black font-mono uppercase tracking-tight text-destructive">
            Invalid Link
          </h1>
          <p className="font-mono text-muted-foreground text-sm">
            This link is not valid for this drop. Only the original share link works.
          </p>
        </div>
      </Layout>
    );
  }

  if (isLoadingDrop) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[50vh]">
          <Loader2 className="w-12 h-12 text-primary animate-spin" />
          <p className="mt-4 font-mono text-muted-foreground uppercase tracking-widest">
            Loading from Chain...
          </p>
        </div>
      </Layout>
    );
  }

  if (!dropData || !dropData[0] || dropData[0] === "0x0000000000000000000000000000000000000000") {
    return (
      <Layout>
        <div className="text-center py-20 font-mono text-xl text-destructive uppercase">
          Drop not found on-chain
        </div>
      </Layout>
    );
  }

  const [
    creator,
    title,
    amountPerClaimRaw,
    maxClaims,
    claimedCount,
    active,
    expiresAt,
    remainingSlots,
    totalAmount,
  ] = dropData;

  const amountDisplay     = formatUsdc(amountPerClaimRaw);
  const totalDisplay      = formatUsdc(totalAmount);
  const refundableAmount  = formatUsdc(remainingSlots * amountPerClaimRaw);
  const isFinished        = !active || claimedCount >= maxClaims;
  const percent           = maxClaims > 0n ? Math.min(100, Math.round(Number((claimedCount * 100n) / maxClaims))) : 0;
  const isExpired         = expiresAt > 0n && BigInt(Math.floor(Date.now() / 1000)) > expiresAt;

  const isCreator =
    effectiveAddress &&
    creator.toLowerCase() === effectiveAddress.toLowerCase();

  const shareUrl      = typeof window !== "undefined" ? window.location.href : "";
  const shareText     = `just dropped $${totalDisplay} USDC on DropParty — first come first serve 👇`;
  const twitterIntent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;

  const isClaiming    = isClaimPending || isClaimConfirming;
  const isCancelling  = isCancelPending || isCancelConfirming;

  return (
    <Layout>
      <div className="max-w-3xl mx-auto flex flex-col gap-12">

        {/* ── Creator control panel ───────────────────────────────────────── */}
        {isCreator && active && !isExpired && (
          <div className="p-4 rounded border border-primary/20 bg-primary/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-xs text-primary uppercase font-bold">Your Drop</span>
              <span className="font-mono text-xs text-muted-foreground">
                You can cancel anytime and recover <span className="text-foreground font-bold">${refundableAmount} USDC</span> remaining
              </span>
            </div>
            <Button
              variant="outline"
              onClick={() => setShowCancelDialog(true)}
              className="shrink-0 font-mono text-sm border-destructive/40 text-destructive hover:bg-destructive/10 hover:border-destructive"
            >
              <XCircle className="w-4 h-4 mr-2" />
              Cancel Drop
            </Button>
          </div>
        )}

        {/* ── Main Drop Area ───────────────────────────────────────────────── */}
        <div className="flex flex-col items-center text-center gap-6">
          <div className="flex flex-col gap-1 items-center">
            <div className="inline-block px-4 py-1 rounded bg-black border border-primary/30 font-mono text-xs text-muted-foreground">
              DROP #{dropIdStr} · BY {shortenAddress(creator)}
            </div>
            {active && !isExpired && (
              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-primary/10 border border-primary/20">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                <span className="font-mono text-xs text-primary">LIVE</span>
              </div>
            )}
            {!active && (
              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-muted/30 border border-muted/20">
                <span className="font-mono text-xs text-muted-foreground">CLOSED</span>
              </div>
            )}
            {isExpired && active && (
              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-yellow-500/10 border border-yellow-500/20">
                <span className="font-mono text-xs text-yellow-400">EXPIRED</span>
              </div>
            )}
          </div>

          <h1 className="text-3xl sm:text-5xl font-black font-mono uppercase tracking-tight text-foreground">
            {title}
          </h1>

          <div className="text-7xl sm:text-9xl font-black font-mono text-primary text-glow my-4">
            ${amountDisplay}
          </div>

          <div className="w-full max-w-md flex flex-col gap-2 mt-4">
            <div className="flex justify-between font-mono text-sm uppercase">
              <span className="text-primary font-bold">{claimedCount.toString()} CLAIMED</span>
              <span className="text-muted-foreground">{maxClaims.toString()} TOTAL</span>
            </div>
            <Progress
              value={percent}
              className="h-4 bg-black border border-primary/30"
              indicatorClassName="bg-primary shadow-[0_0_15px_rgba(20,255,100,0.6)]"
            />
            <div className="text-center font-mono text-xs text-muted-foreground">
              {remainingSlots.toString()} slots remaining · ${totalDisplay} USDC total
            </div>
          </div>

          <div className="mt-8 w-full max-w-md flex flex-col gap-3">
            {/* Claim button */}
            <Button
              onClick={handleClaim}
              disabled={isFinished || !!hasClaimed || isClaiming || isExpired || !active}
              className={`w-full h-20 text-3xl font-black font-mono uppercase tracking-widest transition-all
                ${isFinished || isExpired || !active
                  ? "bg-secondary text-muted-foreground border-secondary opacity-50"
                  : hasClaimed
                    ? "bg-primary/20 text-primary border-primary"
                    : "bg-primary text-black electric-glow hover:bg-primary/90 hover:scale-105 active:scale-95"
                }
              `}
            >
              {isClaiming ? (
                <div className="flex items-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  {isClaimConfirming ? "Confirming..." : "Confirm in wallet..."}
                </div>
              ) : !active ? (
                "Drop Closed"
              ) : isFinished ? (
                "Drop Finished ⚡"
              ) : isExpired ? (
                "Drop Expired"
              ) : hasClaimed ? (
                "Already Claimed ✓"
              ) : !effectiveAddress ? (
                "Connect to Claim"
              ) : (
                "CLAIM NOW"
              )}
            </Button>

            {/* Share row */}
            <div className="flex gap-2 w-full">
              <button
                onClick={handleCopyLink}
                className="flex-1 flex items-center justify-center gap-2 h-12 font-mono text-sm border border-primary/30 rounded hover:bg-primary/10 transition-colors"
              >
                {linkCopied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
                {linkCopied ? "LINK COPIED" : "COPY LINK"}
              </button>
              <a
                href={twitterIntent}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1"
              >
                <Button
                  variant="outline"
                  className="w-full h-12 font-mono text-sm border-primary/30 hover:bg-primary/10"
                >
                  <Share2 className="w-4 h-4 mr-2" />
                  SHARE TO X
                </Button>
              </a>
            </div>
          </div>
        </div>

        {/* ── On-Chain Info ─────────────────────────────────────────────────── */}
        <div className="border-t border-primary/20 pt-8 flex flex-col gap-3">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="text-primary w-5 h-5" />
            <h2 className="text-2xl font-bold font-mono uppercase">On-Chain Info</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: "Contract", value: `${DROP_PARTY_ADDRESS.slice(0, 10)}...${DROP_PARTY_ADDRESS.slice(-6)}` },
              { label: "Drop ID", value: `#${dropIdStr}` },
              { label: "Creator", value: shortenAddress(creator) },
              { label: "Status", value: !active ? "Closed" : isFinished ? "Finished" : isExpired ? "Expired" : "Active" },
              { label: "Per Claim", value: `$${amountDisplay} USDC` },
              { label: "Total Pool", value: `$${totalDisplay} USDC` },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between items-center p-3 bg-black border border-primary/10 rounded font-mono text-sm">
                <span className="text-muted-foreground uppercase text-xs">{label}</span>
                <span className="text-foreground font-bold">{value}</span>
              </div>
            ))}
          </div>

          <a
            href={`https://testnet.arcscan.app/address/${DROP_PARTY_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary/60 hover:text-primary font-mono text-xs text-center mt-2 transition-colors"
          >
            View on ArcScan ↗
          </a>
        </div>
      </div>

      {/* ── Cancel confirmation dialog ──────────────────────────────────────── */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent className="bg-black border-destructive/30 font-mono max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive uppercase tracking-wide text-xl font-black">
              Cancel Drop?
            </DialogTitle>
            <DialogDescription className="text-muted-foreground pt-2 space-y-2">
              <p>
                This will immediately close the drop and return your remaining USDC to your wallet.
              </p>
              <div className="mt-4 p-4 rounded border border-primary/20 bg-primary/5 text-center">
                <div className="text-xs text-muted-foreground uppercase mb-1">You will receive back</div>
                <div className="text-4xl font-black text-primary text-glow">${refundableAmount}</div>
                <div className="text-xs text-muted-foreground mt-1">USDC · {remainingSlots.toString()} unclaimed slots</div>
              </div>
              <p className="text-xs text-muted-foreground pt-2">
                {Number(claimedCount)} people have already claimed ${formatUsdc(claimedCount * amountPerClaimRaw)} and keep their USDC.
                This action cannot be undone.
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setShowCancelDialog(false)}
              disabled={isCancelling}
              className="flex-1 border-primary/30 font-mono"
            >
              Keep Running
            </Button>
            <Button
              onClick={handleCancelConfirm}
              disabled={isCancelling}
              className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90 font-mono font-bold"
            >
              {isCancelling ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {isCancelConfirming ? "Confirming..." : "Confirm in wallet..."}
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 mr-2" />
                  Cancel & Refund
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
