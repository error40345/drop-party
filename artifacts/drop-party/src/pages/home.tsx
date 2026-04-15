import { Layout } from "@/components/layout";
import { Link } from "wouter";
import { useGetDropsSummary, useListDrops, useGetRecentActivity } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { shortenAddress } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { Zap, Activity, Clock } from "lucide-react";

export function Home() {
  const { data: summary } = useGetDropsSummary({ query: { refetchInterval: 5000 } });
  const { data: drops } = useListDrops({ query: { refetchInterval: 5000 } });
  const { data: activity } = useGetRecentActivity({ query: { refetchInterval: 3000 } });

  const activeDrops = drops?.filter(d => d.isActive && d.claimedCount < d.maxClaims) || [];

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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Active Drops */}
          <section className="lg:col-span-2 flex flex-col gap-6">
            <div className="flex items-center gap-2 border-b border-primary/20 pb-2">
              <Zap className="text-primary h-5 w-5" />
              <h2 className="text-2xl font-bold font-mono uppercase tracking-tight">Active Drops</h2>
            </div>
            
            <div className="flex flex-col gap-4">
              {activeDrops.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-primary/20 rounded bg-black/50">
                  <p className="text-muted-foreground font-mono">No active drops right now.</p>
                </div>
              ) : (
                activeDrops.map(drop => {
                  const percent = Math.min(100, Math.round((drop.claimedCount / drop.maxClaims) * 100));
                  return (
                    <Link key={drop.id} href={`/drop/${drop.contractAddress}`}>
                      <Card className="group border-primary/30 bg-black hover:border-primary transition-colors cursor-pointer relative overflow-hidden">
                        <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <CardContent className="p-5 flex flex-col gap-4 relative z-10">
                          <div className="flex justify-between items-start">
                            <div>
                              <h3 className="text-xl font-bold font-mono uppercase">{drop.title}</h3>
                              <p className="text-sm text-muted-foreground font-mono mt-1">By {shortenAddress(drop.creatorAddress)}</p>
                            </div>
                            <div className="text-right">
                              <div className="text-xl font-black font-mono text-primary">${drop.amountPerClaim} <span className="text-sm text-muted-foreground">EACH</span></div>
                              <div className="text-sm font-mono text-muted-foreground mt-1">${drop.totalAmount} TOTAL</div>
                            </div>
                          </div>
                          
                          <div className="flex flex-col gap-2">
                            <div className="flex justify-between text-xs font-mono">
                              <span className="text-primary">{drop.claimedCount} CLAIMED</span>
                              <span>{drop.maxClaims} TOTAL</span>
                            </div>
                            <Progress value={percent} className="h-2 bg-primary/20" indicatorClassName="bg-primary shadow-[0_0_10px_rgba(20,255,100,0.5)]" />
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })
              )}
            </div>
          </section>

          {/* Live Feed */}
          <section className="flex flex-col gap-6">
            <div className="flex items-center justify-between border-b border-primary/20 pb-2">
              <div className="flex items-center gap-2">
                <Activity className="text-primary h-5 w-5 animate-pulse" />
                <h2 className="text-2xl font-bold font-mono uppercase tracking-tight">Live Feed</h2>
              </div>
            </div>
            
            <div className="flex flex-col gap-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
              {!activity || activity.length === 0 ? (
                <div className="p-4 text-center border border-dashed border-primary/20 rounded bg-black/50">
                  <p className="text-muted-foreground font-mono text-sm">Quiet... too quiet.</p>
                </div>
              ) : (
                activity.map((item, i) => (
                  <div key={`${item.contractAddress}-${item.claimerAddress}-${i}`} className="animate-slide-down flex flex-col gap-1 p-3 rounded bg-black border border-primary/10 hover:border-primary/30 transition-colors">
                    <div className="flex justify-between items-center">
                      <span className="font-mono font-bold text-sm text-primary">{shortenAddress(item.claimerAddress)}</span>
                      <span className="font-mono text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDistanceToNow(new Date(item.claimedAt), { addSuffix: true })}
                      </span>
                    </div>
                    <div className="font-mono text-sm">
                      grabbed <span className="font-bold text-foreground">${item.amount}</span> in <Link href={`/drop/${item.contractAddress}`} className="text-primary hover:underline">{item.dropTitle}</Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </Layout>
  );
}
