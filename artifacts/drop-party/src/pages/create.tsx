import { useState } from "react";
import { Layout } from "@/components/layout";
import { useWallet } from "@/lib/wallet";
import { useCreateDrop } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertCircle } from "lucide-react";

export function Create() {
  const { address, connect } = useWallet();
  const [title, setTitle] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [maxClaims, setMaxClaims] = useState("");
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const createDrop = useCreateDrop();

  const amountPerClaim = totalAmount && maxClaims && Number(maxClaims) > 0 
    ? (Number(totalAmount) / Number(maxClaims)).toFixed(2) 
    : "0.00";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!address) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet to deploy a drop.",
        variant: "destructive"
      });
      return;
    }

    if (!title || !totalAmount || !maxClaims || Number(maxClaims) <= 0 || Number(totalAmount) <= 0) {
      toast({
        title: "Invalid input",
        description: "Please fill out all fields with valid numbers.",
        variant: "destructive"
      });
      return;
    }

    // Generate mock contract address for testnet
    const mockContractAddress = `0x${Array.from({length: 40}, () => Math.floor(Math.random()*16).toString(16)).join('')}`;

    createDrop.mutate({
      data: {
        title,
        totalAmount,
        maxClaims: Number(maxClaims),
        amountPerClaim: amountPerClaim,
        contractAddress: mockContractAddress,
        creatorAddress: address,
        txHash: `0x${Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join('')}`
      }
    }, {
      onSuccess: (drop) => {
        toast({
          title: "Drop deployed!",
          description: "Your contract is live on Arc Testnet.",
        });
        setLocation(`/drop/${drop.contractAddress}`);
      },
      onError: () => {
        toast({
          title: "Deployment failed",
          description: "There was an error creating your drop.",
          variant: "destructive"
        });
      }
    });
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto flex flex-col gap-8">
        <div>
          <h1 className="text-4xl font-black font-mono tracking-tighter uppercase text-glow mb-2">Deploy a Drop</h1>
          <p className="text-muted-foreground font-mono">Create a viral USDC giveaway pool on Arc Testnet.</p>
        </div>

        {!address ? (
          <Card className="bg-black border-primary/20 border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 gap-4 text-center">
              <AlertCircle className="w-12 h-12 text-primary opacity-50" />
              <div className="font-mono text-lg">Connect wallet to deploy contracts</div>
              <Button onClick={connect} className="mt-2 electric-glow bg-primary text-black hover:bg-primary/90 font-bold font-mono">
                CONNECT WALLET
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-black border-primary/30">
            <CardHeader>
              <CardTitle className="font-mono text-xl uppercase text-primary">Drop Parameters</CardTitle>
              <CardDescription className="font-mono">
                Arc Testnet utilizes mock USDC. Contracts are tracked via indexer.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                <div className="space-y-2">
                  <Label htmlFor="title" className="font-mono text-xs uppercase text-muted-foreground">Drop Title</Label>
                  <Input 
                    id="title" 
                    placeholder="e.g. Weekend Pizza Money" 
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    className="font-mono text-lg bg-background border-primary/30 focus-visible:ring-primary h-12"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="total" className="font-mono text-xs uppercase text-muted-foreground">Total Pool (USDC)</Label>
                    <div className="relative">
                      <span className="absolute left-4 top-3 font-mono text-primary font-bold">$</span>
                      <Input 
                        id="total" 
                        type="number"
                        min="1"
                        step="0.01"
                        placeholder="100.00" 
                        value={totalAmount}
                        onChange={e => setTotalAmount(e.target.value)}
                        className="font-mono text-lg pl-8 bg-background border-primary/30 focus-visible:ring-primary h-12"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="claims" className="font-mono text-xs uppercase text-muted-foreground">Number of Winners</Label>
                    <Input 
                      id="claims" 
                      type="number"
                      min="1"
                      step="1"
                      placeholder="10" 
                      value={maxClaims}
                      onChange={e => setMaxClaims(e.target.value)}
                      className="font-mono text-lg bg-background border-primary/30 focus-visible:ring-primary h-12"
                      required
                    />
                  </div>
                </div>

                <div className="p-4 bg-primary/5 border border-primary/20 rounded flex flex-col items-center justify-center gap-1">
                  <span className="text-sm font-mono text-muted-foreground uppercase">Each Winner Receives</span>
                  <span className="text-4xl font-black font-mono text-primary text-glow">${amountPerClaim}</span>
                </div>

                <Button 
                  type="submit" 
                  disabled={createDrop.isPending}
                  className="w-full h-14 text-lg font-bold font-mono electric-glow bg-primary text-black hover:bg-primary/90 mt-4 uppercase tracking-widest"
                >
                  {createDrop.isPending ? (
                    <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Deploying Contract...</>
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
