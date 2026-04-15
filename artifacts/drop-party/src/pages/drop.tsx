import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { useWallet, shortenAddress } from "@/lib/wallet";
import { useGetDrop, useListDropClaims, useRecordClaim } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useLocation, useParams } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Zap, Clock, Share2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export function DropPage() {
  const { contractAddress } = useParams<{ contractAddress: string }>();
  const { address, connect } = useWallet();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: drop, isLoading: isLoadingDrop } = useGetDrop(contractAddress!, {
    query: { 
      enabled: !!contractAddress, 
      refetchInterval: 3000 // Poll every 3s
    }
  });

  const { data: claims, isLoading: isLoadingClaims } = useListDropClaims(contractAddress!, {
    query: { 
      enabled: !!contractAddress,
      refetchInterval: 3000
    }
  });

  const recordClaim = useRecordClaim();

  // Check if current wallet has already claimed
  const hasClaimed = claims?.some(c => c.claimerAddress.toLowerCase() === address?.toLowerCase());
  const isFinished = drop && drop.claimedCount >= drop.maxClaims;

  const handleClaim = () => {
    if (!address) {
      connect();
      return;
    }

    if (hasClaimed) {
      toast({ title: "Already claimed", description: "You can only claim once per drop.", variant: "destructive" });
      return;
    }

    if (!drop || isFinished) return;

    recordClaim.mutate({
      contractAddress: contractAddress!,
      data: {
        claimerAddress: address,
        amount: drop.amountPerClaim,
        txHash: `0x${Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join('')}`
      }
    }, {
      onSuccess: () => {
        setLocation(`/drop/${contractAddress}/claimed`);
      },
      onError: (err) => {
        toast({
          title: "Claim failed",
          description: err.error?.error || "Transaction failed.",
          variant: "destructive"
        });
      }
    });
  };

  const shareText = drop ? `just dropped ${drop.totalAmount} USDC on DropParty — first come first serve 👇` : "Check out this DropParty";
  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
  const twitterIntent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;

  if (isLoadingDrop) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[50vh]">
          <Loader2 className="w-12 h-12 text-primary animate-spin" />
          <p className="mt-4 font-mono text-muted-foreground uppercase tracking-widest">Loading Contract...</p>
        </div>
      </Layout>
    );
  }

  if (!drop) {
    return (
      <Layout>
        <div className="text-center py-20 font-mono text-xl text-destructive uppercase">Drop not found</div>
      </Layout>
    );
  }

  const percent = Math.min(100, Math.round((drop.claimedCount / drop.maxClaims) * 100));

  return (
    <Layout>
      <div className="max-w-3xl mx-auto flex flex-col gap-12">
        {/* Main Drop Area */}
        <div className="flex flex-col items-center text-center gap-6">
          <div className="inline-block px-4 py-1 rounded bg-black border border-primary/30 font-mono text-xs text-muted-foreground mb-2">
            CONTRACT: {shortenAddress(drop.contractAddress)}
          </div>
          
          <h1 className="text-3xl sm:text-5xl font-black font-mono uppercase tracking-tight text-foreground">
            {drop.title}
          </h1>

          <div className="text-7xl sm:text-9xl font-black font-mono text-primary text-glow my-4">
            ${drop.amountPerClaim}
          </div>
          
          <div className="w-full max-w-md flex flex-col gap-2 mt-4">
            <div className="flex justify-between font-mono text-sm uppercase">
              <span className="text-primary font-bold">{drop.claimedCount} CLAIMED</span>
              <span className="text-muted-foreground">{drop.maxClaims} TOTAL</span>
            </div>
            <Progress 
              value={percent} 
              className="h-4 bg-black border border-primary/30" 
              indicatorClassName="bg-primary shadow-[0_0_15px_rgba(20,255,100,0.6)]" 
            />
          </div>

          <div className="mt-8 w-full max-w-md flex flex-col gap-4">
            <Button 
              onClick={handleClaim}
              disabled={isFinished || hasClaimed || recordClaim.isPending}
              className={`w-full h-20 text-3xl font-black font-mono uppercase tracking-widest transition-all
                ${isFinished 
                  ? "bg-secondary text-muted-foreground border-secondary opacity-50" 
                  : hasClaimed 
                    ? "bg-primary/20 text-primary border-primary" 
                    : "bg-primary text-black electric-glow hover:bg-primary/90 hover:scale-105 active:scale-95"
                }
              `}
            >
              {recordClaim.isPending ? <Loader2 className="w-8 h-8 animate-spin" /> : 
               isFinished ? "Drop Finished ⚡" : 
               hasClaimed ? "Already Claimed" : 
               !address ? "Connect to Claim" : 
               "CLAIM NOW"}
            </Button>

            <a href={twitterIntent} target="_blank" rel="noopener noreferrer" className="w-full">
              <Button variant="outline" className="w-full h-12 font-mono text-sm border-primary/30 hover:bg-primary/10">
                <Share2 className="w-4 h-4 mr-2" />
                SHARE TO X
              </Button>
            </a>
          </div>
        </div>

        {/* Claims Feed */}
        <div className="flex flex-col gap-4 border-t border-primary/20 pt-8">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="text-primary w-5 h-5" />
            <h2 className="text-2xl font-bold font-mono uppercase">Live Claims</h2>
            {isLoadingClaims && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground ml-auto" />}
          </div>

          <div className="flex flex-col gap-3">
            {!claims || claims.length === 0 ? (
              <div className="py-8 text-center font-mono text-muted-foreground border border-dashed border-primary/20 bg-black/50 rounded">
                Waiting for the first claim...
              </div>
            ) : (
              claims.map((claim, idx) => (
                <div 
                  key={claim.id} 
                  className="animate-slide-down flex justify-between items-center p-4 bg-black border border-primary/10 rounded"
                  style={{ animationDelay: `${idx * 0.05}s` }}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center border border-primary/30">
                      <Zap className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex flex-col">
                      <span className="font-mono font-bold">{shortenAddress(claim.claimerAddress)}</span>
                      <span className="font-mono text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDistanceToNow(new Date(claim.claimedAt), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  <div className="font-mono font-black text-xl text-primary">
                    +${claim.amount}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
