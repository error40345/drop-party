import { Link } from "wouter";
import { useWallet, shortenAddress } from "@/lib/wallet";
import { Button } from "@/components/ui/button";
import { Coins } from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const { address, connect, disconnect } = useWallet();

  return (
    <div className="min-h-[100dvh] flex flex-col crt">
      <header className="sticky top-0 z-40 w-full border-b border-primary/20 bg-background/80 backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 transition-transform hover:scale-105 active:scale-95">
            <div className="bg-primary text-black p-1.5 rounded-sm">
              <Coins size={20} className="stroke-[2.5]" />
            </div>
            <span className="font-mono font-black text-xl tracking-tighter uppercase text-glow hidden sm:inline-block">
              DROP_PARTY
            </span>
          </Link>
          
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/5">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-xs font-mono text-primary/80">Arc Testnet</span>
            </div>
            
            {address ? (
              <div className="flex items-center gap-2">
                <div className="px-3 py-1.5 border border-primary/30 rounded bg-black font-mono text-sm text-primary">
                  {shortenAddress(address)}
                </div>
                <Button variant="outline" size="sm" onClick={disconnect} className="font-mono border-primary/30 text-xs hover:bg-primary/10">
                  DISCONNECT
                </Button>
              </div>
            ) : (
              <Button onClick={connect} className="font-mono font-bold electric-glow bg-primary text-black hover:bg-primary/90">
                CONNECT WALLET
              </Button>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1 container py-8">
        {children}
      </main>
      <footer className="border-t border-primary/10 py-6 bg-black">
        <div className="container flex flex-col sm:flex-row justify-between items-center gap-4 text-xs font-mono text-muted-foreground">
          <p>POWERED BY ARC NETWORK (TESTNET)</p>
          <p>USDC IS TEST TOKENS ONLY</p>
        </div>
      </footer>
    </div>
  );
}
