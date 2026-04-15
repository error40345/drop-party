import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Link } from "wouter";
import { useGetDropsSummary } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { loadMyDrops, StoredDrop } from "@/lib/drops-store";
import { Zap, ExternalLink, Copy, Check } from "lucide-react";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 text-xs font-mono text-primary/60 hover:text-primary transition-colors ml-2"
      title="Copy share link"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

export function Home() {
  const { data: summary } = useGetDropsSummary({ query: { refetchInterval: 5000 } });
  const [myDrops, setMyDrops] = useState<StoredDrop[]>([]);

  useEffect(() => {
    setMyDrops(loadMyDrops());
  }, []);

  const getShareLink = (drop: StoredDrop) =>
    `${window.location.origin}${import.meta.env.BASE_URL?.replace(/\/$/, "")}/drop/${drop.dropId}/${drop.token}`;

  return (
    <Layout>
      <div className="flex flex-col gap-12">
        {/* Hero Section */}
        <section className="flex flex-col items-center text-center gap-6 py-12 border-b border-primary/10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/40 bg-primary/10 text-primary font-mono text-sm mb-4">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            LIVE ON ARC TESTNET
          </div>
          <h1 className="text-5xl sm:text-7xl font-black font-mono tracking-tighter text-glow uppercase leading-none">
            The Fastest Way to <br className="hidden sm:block" />
            <span className="text-primary">Airdrop USDC</span>
          </h1>
          <p className="text-lg text-muted-foreground font-mono max-w-2xl">
            Fund a pool. Share the link. Watch the chaos unfold. First come, first serve onchain giveaways.
          </p>
          <div className="flex gap-4 mt-4">
            <Link href="/create" className="inline-flex items-center justify-center h-14 px-8 text-lg font-bold font-mono bg-primary text-black hover:bg-primary/90 electric-glow uppercase transition-transform hover:scale-105 active:scale-95 rounded-sm">
              <Zap className="mr-2 h-5 w-5" />
              Create a Drop
            </Link>
          </div>
        </section>

        {/* Stats */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-black border-primary/20">
            <CardContent className="p-6 flex flex-col gap-1">
              <span className="text-sm font-mono text-muted-foreground">TOTAL DROPPED</span>
              <span className="text-4xl font-black font-mono text-primary text-glow">
                ${summary?.totalDropped ? parseFloat(summary.totalDropped).toLocaleString() : '0'}
              </span>
            </CardContent>
          </Card>
          <Card className="bg-black border-primary/20">
            <CardContent className="p-6 flex flex-col gap-1">
              <span className="text-sm font-mono text-muted-foreground">TOTAL CLAIMS</span>
              <span className="text-4xl font-black font-mono text-foreground">
                {summary?.totalClaims?.toLocaleString() || '0'}
              </span>
            </CardContent>
          </Card>
          <Card className="bg-black border-primary/20">
            <CardContent className="p-6 flex flex-col gap-1">
              <span className="text-sm font-mono text-muted-foreground">ACTIVE DROPS</span>
              <span className="text-4xl font-black font-mono text-foreground">
                {summary?.activeDropsCount?.toLocaleString() || '0'}
              </span>
            </CardContent>
          </Card>
        </section>

        {/* My Drops (creator's private dashboard) */}
        <section className="flex flex-col gap-6">
          <div className="flex items-center gap-2 border-b border-primary/20 pb-2">
            <Zap className="text-primary h-5 w-5" />
            <h2 className="text-2xl font-bold font-mono uppercase tracking-tight">My Drops</h2>
          </div>

          {myDrops.length === 0 ? (
            <div className="p-10 text-center border border-dashed border-primary/20 rounded bg-black/50 flex flex-col items-center gap-4">
              <p className="text-muted-foreground font-mono">You haven't created any drops on this device yet.</p>
              <Link href="/create">
                <Button className="font-mono electric-glow bg-primary text-black hover:bg-primary/90 font-bold uppercase">
                  <Zap className="w-4 h-4 mr-2" />
                  Create Your First Drop
                </Button>
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {myDrops.map(drop => (
                <Link key={drop.dropId} href={`/drop/${drop.dropId}/${drop.token}`}>
                  <Card className="group border-primary/30 bg-black hover:border-primary transition-colors cursor-pointer relative overflow-hidden">
                    <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <CardContent className="p-5 flex flex-col gap-3 relative z-10">
                      <div className="flex justify-between items-start">
                        <div className="flex flex-col gap-0.5">
                          <h3 className="text-xl font-bold font-mono uppercase">{drop.title}</h3>
                          <span className="text-xs font-mono text-muted-foreground">Drop #{drop.dropId}</span>
                        </div>
                        <ExternalLink className="w-4 h-4 text-primary/40 group-hover:text-primary transition-colors mt-1" />
                      </div>
                      {/* Private share link */}
                      <div className="flex items-center gap-2 p-2 rounded bg-primary/5 border border-primary/20">
                        <span className="font-mono text-xs text-muted-foreground truncate flex-1">
                          {getShareLink(drop)}
                        </span>
                        <CopyButton text={getShareLink(drop)} />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}
