import React, { createContext, useContext, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface WalletContextType {
  address: string | null;
  connect: () => void;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [inputAddress, setInputAddress] = useState('');

  // Load from local storage
  useEffect(() => {
    const saved = localStorage.getItem('drop-party-wallet');
    if (saved) setAddress(saved);
  }, []);

  const handleConnect = (addr: string) => {
    if (!addr.startsWith('0x') || addr.length < 10) return;
    setAddress(addr);
    localStorage.setItem('drop-party-wallet', addr);
    setIsModalOpen(false);
  };

  const connect = () => {
    setIsModalOpen(true);
  };

  const disconnect = () => {
    setAddress(null);
    localStorage.removeItem('drop-party-wallet');
  };

  return (
    <WalletContext.Provider value={{ address, connect, disconnect }}>
      {children}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md border-primary/20 bg-background/95 backdrop-blur">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold font-mono tracking-tighter text-primary text-glow">CONNECT WALLET</DialogTitle>
            <DialogDescription className="font-mono text-xs">
              Arc Testnet is active. Enter your wallet address to connect.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <Input 
              placeholder="0x..." 
              value={inputAddress} 
              onChange={(e) => setInputAddress(e.target.value)}
              className="font-mono bg-black border-primary/50 text-primary h-12"
            />
            <Button 
              onClick={() => handleConnect(inputAddress)} 
              className="w-full electric-glow font-bold tracking-widest bg-primary text-black hover:bg-primary/90 h-12"
            >
              INITIALIZE CONNECTION
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
