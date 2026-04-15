import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Link, useParams } from "wouter";
import { Share2, ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useReadContract } from "wagmi";
import { DROP_PARTY_ADDRESS, DROP_PARTY_ABI, formatUsdc } from "@/lib/contracts";

export function ClaimedPage() {
  const { dropId: dropIdStr } = useParams<{ dropId: string }>();
  const [showConfetti, setShowConfetti] = useState(true);

  const dropId = dropIdStr !== undefined ? BigInt(dropIdStr) : undefined;

  const { data: dropData } = useReadContract({
    address: DROP_PARTY_ADDRESS,
    abi: DROP_PARTY_ABI,
    functionName: "getDrop",
    args: dropId !== undefined ? [dropId] : undefined,
    query: { enabled: dropId !== undefined },
  });

  useEffect(() => {
    const timer = setTimeout(() => setShowConfetti(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  const amountDisplay = dropData ? formatUsdc(dropData[2]) : "0";
  const dropTitle = dropData ? dropData[1] : "Drop";

  const shareText = `I just grabbed $${amountDisplay} USDC from "${dropTitle}" on DropParty ⚡`;
  const shareUrl =
    typeof window !== "undefined"
      ? window.location.href.replace("/claimed", "")
      : "";
  const twitterIntent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;

  return (
    <Layout>
      {/* Confetti particles */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          {Array.from({ length: 50 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 md:w-3 md:h-3 rounded-sm bg-primary animate-slide-down"
              style={{
                left: `${Math.random() * 100}%`,
                top: `-20px`,
                animationDuration: `${1 + Math.random() * 2}s`,
                animationDelay: `${Math.random() * 0.5}s`,
                transform: `rotate(${Math.random() * 360}deg)`,
                opacity: 0.8,
              }}
            />
          ))}
        </div>
      )}

      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center gap-8 max-w-2xl mx-auto">
        <div className="space-y-4">
          <h1 className="text-5xl md:text-7xl font-black font-mono uppercase text-glow tracking-tighter">
            LFG! ⚡
          </h1>
          <p className="text-xl font-mono text-muted-foreground uppercase">
            Transaction Confirmed
          </p>
        </div>

        <div className="p-8 border-2 border-primary bg-primary/5 rounded-xl flex flex-col items-center gap-4 w-full">
          <span className="font-mono text-muted-foreground uppercase">You grabbed</span>
          <span className="text-7xl md:text-9xl font-black font-mono text-primary text-glow drop-shadow-[0_0_30px_rgba(20,255,100,0.5)]">
            ${amountDisplay}
          </span>
          <span className="font-mono text-sm bg-black px-3 py-1 rounded border border-primary/30 mt-4">
            Testnet USDC on Arc Network
          </span>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 w-full mt-4">
          <a
            href={twitterIntent}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1"
          >
            <Button className="w-full h-14 font-bold font-mono text-lg electric-glow bg-primary text-black hover:bg-primary/90">
              <Share2 className="w-5 h-5 mr-2" />
              BRAG ON X
            </Button>
          </a>
          <Link href={`/drop/${dropIdStr}`} className="flex-1">
            <Button
              variant="outline"
              className="w-full h-14 font-bold font-mono text-lg border-primary/30 hover:bg-primary/10"
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              BACK TO DROP
            </Button>
          </Link>
        </div>
      </div>
    </Layout>
  );
}
