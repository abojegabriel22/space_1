
import { createAppKit } from '@reown/appkit/react';
import { EthersAdapter } from '@reown/appkit-adapter-ethers';
import { mainnet } from '@reown/appkit/networks';

const projectId = import.meta.env.VITE_REOWN_PROJECT_ID;

if (!projectId) {
  throw new Error('Missing Reown Project ID');
}

const metadata = {
  name: 'SPCX Token Dashboard',
  description: 'SPCX Token Administration Dashboard',
  url: window.location.origin,
  icons: [`${window.location.origin}/favicon.ico`],
};

createAppKit({
  adapters: [new EthersAdapter()],
  networks: [mainnet],
  projectId,
  metadata,
  features: {
    analytics: true,
  },
});
