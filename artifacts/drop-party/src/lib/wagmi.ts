import { createConfig, http } from "wagmi";
import { metaMask, injected } from "wagmi/connectors";
import { arcTestnet } from "./contracts";

export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  connectors: [
    injected(), // Catches MetaMask, Coinbase Wallet, any injected provider
    metaMask(),
  ],
  transports: {
    [arcTestnet.id]: http("https://rpc.testnet.arc.network"),
  },
});
