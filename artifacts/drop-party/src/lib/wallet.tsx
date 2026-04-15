import React, { createContext, useContext, useState } from 'react';
import {
  useAccount,
  useConnect,
  useDisconnect,
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

const ARC_CHAIN_HEX = `0x${arcTestnet.id.toString(16)}`;

const ARC_CHAIN_PARAMS = {
  chainId: ARC_CHAIN_HEX,
  chainName: 'Arc Testnet',
  nativeCurrency: arcTestnet.nativeCurrency,
  rpcUrls: ['https://rpc.testnet.arc.network'],
  blockExplorerUrls: ['https://testnet.arcscan.app'],
};

export function WalletProvider({ children }: { children: React.ReactNode }) {
  // chainId from useAccount() reflects the wallet's actual connected chain,
  // unlike useChainId() which returns the wagmi config's default chain.
  const { address, isConnected, chainId: walletChainId } = useAccount();
  const { connect: wagmiConnect, connectors } = useConnect();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const [isSwitching, setIsSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const isWrongNetwork = isConnected && walletChainId !== arcTestnet.id;

  const connect = () => {
    const injectedConnector = connectors.find(c => c.id === 'injected') ?? connectors[0];
    if (injectedConnector) {
      wagmiConnect({ connector: injectedConnector });
    }
  };

  const disconnect = () => {
    wagmiDisconnect();
  };

  const handleSwitchChain = async () => {
    const ethereum = (window as any).ethereum;
    if (!ethereum) return;

    setIsSwitching(true);
    setSwitchError(null);

    try {
      // First try to switch (works if chain is already in wallet)
      await ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: ARC_CHAIN_HEX }],
      });
    } catch (switchErr: any) {
      // 4902 = chain not added to wallet yet → add it
      if (switchErr?.code === 4902 || switchErr?.code === -32603) {
        try {
          await ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [ARC_CHAIN_PARAMS],
          });
        } catch (addErr: any) {
          setSwitchError(addErr?.message?.slice(0, 100) ?? 'Failed to add network');
        }
      } else {
        setSwitchError(switchErr?.message?.slice(0, 100) ?? 'Failed to switch network');
      }
    } finally {
      setIsSwitching(false);
    }
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
              DropParty runs on{' '}
              <span className="text-primary font-bold">Arc Testnet</span>.<br />
              Switch networks to continue.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-4">
            {/* Network info */}
            <div className="p-3 rounded bg-black border border-primary/20 flex flex-col gap-1.5 font-mono text-xs text-muted-foreground">
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
                <span className="text-foreground/60">rpc.testnet.arc.network</span>
              </div>
              <div className="flex justify-between">
                <span>Explorer</span>
                <span className="text-foreground/60">testnet.arcscan.app</span>
              </div>
            </div>

            {switchError && (
              <p className="text-xs font-mono text-destructive text-center px-2">{switchError}</p>
            )}

            {/* Add / Switch button — calls wallet_addEthereumChain if not present */}
            <Button
              onClick={handleSwitchChain}
              disabled={isSwitching}
              className="w-full electric-glow font-bold tracking-widest bg-primary text-black hover:bg-primary/90 h-12 font-mono"
            >
              {isSwitching ? 'CHECK YOUR WALLET...' : 'ADD / SWITCH TO ARC TESTNET'}
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

