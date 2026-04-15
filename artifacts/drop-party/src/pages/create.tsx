import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { useWallet } from "@/lib/wallet";
import { useCreateDrop } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
  useAccount,
} from "wagmi";
import {
  USDC_ADDRESS,
  DROP_PARTY_ADDRESS,
  DROP_PARTY_ABI,
  USDC_ABI,
  parseUsdc,
  formatUsdc,
  arcTestnet,
} from "@/lib/contracts";
import { decodeEventLog } from "viem";

type Step = "idle" | "approving" | "approved" | "creating" | "done";

export function Create() {
  const { address, connect } = useWallet();
  const { address: wagmiAddress } = useAccount();
  const effectiveAddress = wagmiAddress ?? address;

  const [title, setTitle] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [maxClaims, setMaxClaims] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const amountPerClaim =
    totalAmount && maxClaims && Number(maxClaims) > 0
      ? (Number(totalAmount) / Number(maxClaims)).toFixed(6)
      : "0.000000";

  const amountPerClaimDisplay =
    totalAmount && maxClaims && Number(maxClaims) > 0
      ? (Number(totalAmount) / Number(maxClaims)).toFixed(2)
      : "0.00";

  const totalAmountBigInt =
    totalAmount && Number(totalAmount) > 0 ? parseUsdc(totalAmount) : 0n;
  const amountPerClaimBigInt =
    amountPerClaim !== "0.000000" ? parseUsdc(amountPerClaim) : 0n;
  const maxClaimsInt = Number(maxClaims) || 0;

  // Read USDC balance
  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: effectiveAddress ? [effectiveAddress as `0x${string}`] : undefined,
    query: { enabled: !!effectiveAddress, refetchInterval: 10000 },
  });

  const balanceDisplay = usdcBalance !== undefined ? formatUsdc(usdcBalance) : null;

  // Read current USDC allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "allowance",
    args: effectiveAddress ? [effectiveAddress as `0x${string}`, DROP_PARTY_ADDRESS] : undefined,
    query: { enabled: !!effectiveAddress },
  });

  const hasEnoughAllowance = allowance !== undefined && allowance >= totalAmountBigInt && totalAmountBigInt > 0n;

  // Approve USDC
  const {
    writeContract: writeApprove,
    data: approveTxHash,
    isPending: isApprovePending,
    error: approveWriteError,
  } = useWriteContract();

  const { isLoading: isApproveConfirming, isSuccess: isApproveConfirmed } =
    useWaitForTransactionReceipt({ hash: approveTxHash });

  // Create Drop
  const {
    writeContract: writeCreateDrop,
    data: createDropTxHash,
    isPending: isCreateDropPending,
    error: createDropWriteError,
  } = useWriteContract();

  const {
    isLoading: isCreateDropConfirming,
    isSuccess: isCreateDropConfirmed,
    data: createDropReceipt,
  } = useWaitForTransactionReceipt({ hash: createDropTxHash });

  // API recording
  const createDropApi = useCreateDrop();

  // After approval confirmed → proceed to createDrop
  useEffect(() => {
    if (isApproveConfirmed && step === "approving") {
      setStep("approved");
      refetchAllowance();
      submitCreateDrop();
    }
  }, [isApproveConfirmed]);

  // After createDrop tx confirmed → record to API and navigate
  useEffect(() => {
    if (isCreateDropConfirmed && createDropReceipt && step === "creating") {
      setStep("done");

      // Parse dropId from DropCreated event logs
      let dropId: bigint | undefined;
      for (const log of createDropReceipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: DROP_PARTY_ABI,
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === "DropCreated") {
            dropId = (decoded.args as { dropId: bigint }).dropId;
            break;
          }
        } catch {
          // not the right log, continue
        }
      }

      const dropIdStr = dropId !== undefined ? dropId.toString() : "0";

      // Record to API server for the home page feed
      createDropApi.mutate(
        {
          data: {
            title,
            totalAmount: totalAmount,
            maxClaims: maxClaimsInt,
            amountPerClaim: amountPerClaimDisplay,
            contractAddress: `${DROP_PARTY_ADDRESS}:${dropIdStr}`,
            creatorAddress: effectiveAddress ?? "",
            txHash: createDropTxHash ?? "",
          },
        },
        {
          onSettled: () => {
            toast({
              title: "Drop deployed!",
              description: `Drop #${dropIdStr} is live on Arc Testnet.`,
            });
            setLocation(`/drop/${dropIdStr}`);
          },
        }
      );
    }
  }, [isCreateDropConfirmed]);

  // Handle write errors
  useEffect(() => {
    if (approveWriteError) {
      setStep("idle");
      toast({
        title: "Approval failed",
        description: approveWriteError.message.slice(0, 120),
        variant: "destructive",
      });
    }
  }, [approveWriteError]);

  useEffect(() => {
    if (createDropWriteError) {
      setStep("idle");
      toast({
        title: "Create drop failed",
        description: createDropWriteError.message.slice(0, 120),
        variant: "destructive",
      });
    }
  }, [createDropWriteError]);

  const submitCreateDrop = () => {
    setStep("creating");
    writeCreateDrop({
      address: DROP_PARTY_ADDRESS,
      abi: DROP_PARTY_ABI,
      functionName: "createDrop",
      args: [title, amountPerClaimBigInt, BigInt(maxClaimsInt), 0n],
      chainId: arcTestnet.id,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!effectiveAddress) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet to deploy a drop.",
        variant: "destructive",
      });
      return;
    }

    if (!title || !totalAmount || !maxClaims || maxClaimsInt <= 0 || Number(totalAmount) <= 0) {
      toast({
        title: "Invalid input",
        description: "Please fill out all fields with valid numbers.",
        variant: "destructive",
      });
      return;
    }

    if (maxClaimsInt > 10000) {
      toast({ title: "Too many claims", description: "Max 10,000 winners.", variant: "destructive" });
      return;
    }

    if (usdcBalance !== undefined && totalAmountBigInt > usdcBalance) {
      toast({ title: "Insufficient USDC", description: "You don't have enough USDC in your wallet.", variant: "destructive" });
      return;
    }

    if (hasEnoughAllowance) {
      // Skip approval step
      submitCreateDrop();
    } else {
      // Step 1: Approve USDC
      setStep("approving");
      writeApprove({
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: "approve",
        args: [DROP_PARTY_ADDRESS, totalAmountBigInt],
        chainId: arcTestnet.id,
      });
    }
  };

  const isLoading =
    step !== "idle" && step !== "done" ||
    isApprovePending ||
    isApproveConfirming ||
    isCreateDropPending ||
    isCreateDropConfirming;

  const getStepLabel = () => {
    if (isApprovePending || (step === "approving" && !isApproveConfirming)) return "Confirm in wallet...";
    if (isApproveConfirming) return "Approving USDC...";
    if (isCreateDropPending || (step === "approved" && !isCreateDropConfirming)) return "Confirm in wallet...";
    if (isCreateDropConfirming) return "Deploying contract...";
    return "Deploy Drop";
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto flex flex-col gap-8">
        <div>
          <h1 className="text-4xl font-black font-mono tracking-tighter uppercase text-glow mb-2">
            Deploy a Drop
          </h1>
          <p className="text-muted-foreground font-mono">
            Create a viral USDC giveaway pool on Arc Testnet.
          </p>
        </div>

        {!effectiveAddress ? (
          <Card className="bg-black border-primary/20 border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 gap-4 text-center">
              <AlertCircle className="w-12 h-12 text-primary opacity-50" />
              <div className="font-mono text-lg">Connect wallet to deploy contracts</div>
              <Button
                onClick={connect}
                className="mt-2 electric-glow bg-primary text-black hover:bg-primary/90 font-bold font-mono"
              >
                CONNECT WALLET
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-black border-primary/30">
            <CardHeader>
              <CardTitle className="font-mono text-xl uppercase text-primary">
                Drop Parameters
              </CardTitle>
              <CardDescription className="font-mono">
                USDC will be pulled from your wallet on Arc Testnet when the drop is created.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                <div className="space-y-2">
                  <Label htmlFor="title" className="font-mono text-xs uppercase text-muted-foreground">
                    Drop Title
                  </Label>
                  <Input
                    id="title"
                    placeholder="e.g. Weekend Pizza Money"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="font-mono text-lg bg-background border-primary/30 focus-visible:ring-primary h-12"
                    required
                    disabled={isLoading}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="total" className="font-mono text-xs uppercase text-muted-foreground">
                        Total Pool (USDC)
                      </Label>
                      {balanceDisplay !== null && (
                        <button
                          type="button"
                          onClick={() => !isLoading && setTotalAmount(balanceDisplay)}
                          className="font-mono text-xs text-primary/70 hover:text-primary transition-colors flex items-center gap-1 disabled:opacity-40"
                          disabled={isLoading}
                        >
                          BAL: <span className="font-bold">${balanceDisplay}</span>
                          <span className="ml-1 px-1 py-0.5 rounded border border-primary/30 text-[10px] hover:bg-primary/10">MAX</span>
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <span className="absolute left-4 top-3 font-mono text-primary font-bold z-10">$</span>
                      <Input
                        id="total"
                        type="text"
                        inputMode="decimal"
                        placeholder="100.00"
                        value={totalAmount}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (/^\d*\.?\d*$/.test(val)) setTotalAmount(val);
                        }}
                        className="font-mono text-lg pl-8 bg-background border-primary/30 focus-visible:ring-primary h-12"
                        disabled={isLoading}
                      />
                    </div>
                    {usdcBalance !== undefined && totalAmountBigInt > usdcBalance && (
                      <p className="text-xs font-mono text-destructive">Insufficient USDC balance</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="claims" className="font-mono text-xs uppercase text-muted-foreground">
                      Number of Winners
                    </Label>
                    <Input
                      id="claims"
                      type="text"
                      inputMode="numeric"
                      placeholder="10"
                      value={maxClaims}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (/^\d*$/.test(val)) setMaxClaims(val);
                      }}
                      className="font-mono text-lg bg-background border-primary/30 focus-visible:ring-primary h-12"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <div className="p-4 bg-primary/5 border border-primary/20 rounded flex flex-col items-center justify-center gap-1">
                  <span className="text-sm font-mono text-muted-foreground uppercase">
                    Each Winner Receives
                  </span>
                  <span className="text-4xl font-black font-mono text-primary text-glow">
                    ${amountPerClaimDisplay}
                  </span>
                  <span className="text-xs font-mono text-muted-foreground mt-1">USDC</span>
                </div>

                {/* Step indicators */}
                {step !== "idle" && step !== "done" && (
                  <div className="flex gap-2 items-center p-3 rounded bg-black border border-primary/20">
                    <div className="flex gap-3 items-center flex-1">
                      <div className={`flex items-center gap-1.5 font-mono text-xs ${step === "approving" || isApproveConfirming ? "text-primary" : step === "approved" || step === "creating" || step === "done" ? "text-primary/50" : "text-muted-foreground"}`}>
                        {isApproveConfirmed || hasEnoughAllowance ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : (
                          <div className={`w-4 h-4 rounded-full border-2 ${step === "approving" ? "border-primary animate-pulse" : "border-muted-foreground"}`} />
                        )}
                        1. APPROVE
                      </div>
                      <div className="flex-1 h-px bg-primary/20" />
                      <div className={`flex items-center gap-1.5 font-mono text-xs ${step === "creating" || isCreateDropConfirming ? "text-primary" : "text-muted-foreground"}`}>
                        {isCreateDropConfirmed ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : (
                          <div className={`w-4 h-4 rounded-full border-2 ${step === "creating" ? "border-primary animate-pulse" : "border-muted-foreground"}`} />
                        )}
                        2. DEPLOY
                      </div>
                    </div>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-14 text-lg font-bold font-mono electric-glow bg-primary text-black hover:bg-primary/90 mt-4 uppercase tracking-widest"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      {getStepLabel()}
                    </>
                  ) : (
                    "Deploy Drop"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
