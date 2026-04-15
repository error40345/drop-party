import React, { createContext, useContext } from 'react';
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
  useChainId,
} from 'wagmi';
import { arcTestnet } from './contracts';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { AlertTriangle } from 'lucide-react';

interface WalletContextType {
  address: string | undefined;
  connect: () => void;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { address, isConnected } = useAccount();
  const { connect: wagmiConnect, connectors } = useConnect();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const isWrongNetwork = isConnected && chainId !== arcTestnet.id;

  const connect = () => {
    const injectedConnector = connectors.find(c => c.id === 'injected') ?? connectors[0];
    if (injectedConnector) {
      wagmiConnect({ connector: injectedConnector });
    }
  };

  const disconnect = () => {
    wagmiDisconnect();
  };

  return (
    <WalletContext.Provider value={{ address, connect, disconnect }}>
      {children}

      {/* Wrong network dialog - blocks interaction until switched */}
      <Dialog open={isWrongNetwork} onOpenChange={() => {}}>
        <DialogContent
          className="sm:max-w-md border-primary/30 bg-background/95 backdrop-blur"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader className="flex flex-col items-center text-center gap-2 pt-2">
            <div className="w-14 h-14 rounded-full bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center mb-2">
              <AlertTriangle className="w-7 h-7 text-yellow-400" />
            </div>
            <DialogTitle className="text-2xl font-bold font-mono tracking-tighter text-primary">
              WRONG NETWORK
            </DialogTitle>
            <DialogDescription className="font-mono text-sm text-center">
              DropParty is deployed on{' '}
              <span className="text-primary font-bold">Arc Testnet</span>.<br />
              Your wallet is on a different network.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-4">
            <div className="p-3 rounded bg-black border border-primary/20 flex flex-col gap-1 font-mono text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Network</span>
                <span className="text-primary font-bold">Arc Testnet</span>
              </div>
              <div className="flex justify-between">
                <span>Chain ID</span>
                <span className="text-primary font-bold">{arcTestnet.id}</span>
              </div>
              <div className="flex justify-between">
                <span>RPC</span>
                <span className="text-foreground/60 truncate ml-2">rpc.testnet.arc.network</span>
              </div>
            </div>

            <Button
              onClick={() => switchChain({ chainId: arcTestnet.id })}
              disabled={isSwitching}
              className="w-full electric-glow font-bold tracking-widest bg-primary text-black hover:bg-primary/90 h-12 font-mono"
            >
              {isSwitching ? 'SWITCHING...' : 'SWITCH TO ARC TESTNET'}
            </Button>

            <Button
              variant="outline"
              onClick={disconnect}
              className="font-mono border-primary/20 text-xs hover:bg-primary/5 h-10"
            >
              DISCONNECT WALLET
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error('useWallet must be used within WalletProvider');
  return context;
}

export function shortenAddress(address: string) {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
