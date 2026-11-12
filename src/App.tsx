import { useCallback, useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { DOGE1_ABI, DOGE1_CONTRACT_ADDRESS } from './contractConfig';
import './App.css';

type FieldKind = 'address' | 'amount' | 'integer' | 'boolean';
type FormValues = Record<string, string | boolean>;
type ActionField = {
  key: string;
  label: string;
  placeholder?: string;
  kind: FieldKind;
};
type ActionSpec = {
  method: string;
  title: string;
  description: string;
  fields: ActionField[];
  ownerOnly?: boolean;
  danger?: boolean;
  confirmMessage?: string;
  submitLabel?: string;
  getArgs: (values: FormValues, decimals: number) => unknown[];
};
type Feedback = { kind: 'success' | 'error' | 'pending'; message: string };
type TokenInfo = {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  owner: string;
  balance: string | null;
  whitelisted: boolean | null;
};

declare global {
  interface Window {
    ethereum?: ethers.Eip1193Provider & {
      on: (event: string, listener: (...args: unknown[]) => void) => void;
      removeListener: (event: string, listener: (...args: unknown[]) => void) => void;
    };
  }
}

const addressField = (key: string, label: string, placeholder = '0x...'): ActionField => ({
  key,
  label,
  placeholder,
  kind: 'address',
});

const amountField = (key: string, label: string): ActionField => ({
  key,
  label,
  placeholder: '0.00',
  kind: 'amount',
});

function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const details = error as { shortMessage?: string; reason?: string; message?: string };
    return details.shortMessage ?? details.reason ?? details.message ?? 'An unexpected error occurred.';
  }
  return typeof error === 'string' ? error : 'An unexpected error occurred.';
}

function parseAddress(value: string | boolean, label: string): string {
  if (typeof value !== 'string' || !ethers.isAddress(value)) {
    throw new Error(`Enter a valid ${label.toLowerCase()} address.`);
  }
  return ethers.getAddress(value);
}

function parseAmount(value: string | boolean, decimals: number): bigint {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Enter a token amount.');
  }
  try {
    const amount = ethers.parseUnits(value.trim(), decimals);
    if (amount <= 0n) throw new Error('Amount must be greater than zero.');
    return amount;
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Enter a valid token amount.');
  }
}

// Complete public actions mapping transfer, approve, and transferFrom
const publicActions: ActionSpec[] = [
  {
    method: 'transfer',
    title: 'Transfer tokens',
    description: 'Send SPCX tokens from your connected wallet to another address.',
    fields: [addressField('to', 'Recipient address'), amountField('amount', 'Amount')],
    getArgs: (values, decimals) => [
      parseAddress(values.to, 'recipient'),
      parseAmount(values.amount, decimals),
    ],
  },
  {
    method: 'approve',
    title: 'Approve spender',
    description: 'Set custom whitelist-secured allowance for a spender address.',
    fields: [addressField('spender', 'Spender address'), amountField('amount', 'Allowance')],
    getArgs: (values, decimals) => [
      parseAddress(values.spender, 'spender'),
      parseAmount(values.amount, decimals),
    ],
  },
  {
    method: 'transferFrom',
    title: 'Transfer from',
    description: 'Move tokens from an address that has approved your wallet.',
    fields: [
      addressField('from', 'From address'),
      addressField('to', 'Recipient address'),
      amountField('amount', 'Amount'),
    ],
    getArgs: (values, decimals) => [
      parseAddress(values.from, 'source'),
      parseAddress(values.to, 'recipient'),
      parseAmount(values.amount, decimals),
    ],
  },
];

// Complete owner-only actions mapping mintMore, burn, recoverERC20, setApprovalWhitelist, transferOwnership, renounceOwnership, withdrawETH
const ownerActions: ActionSpec[] = [
  {
    method: 'mintMore',
    title: 'Mint tokens',
    description: 'Owner-only function to create new SPCX tokens and send them to a recipient.',
    ownerOnly: true,
    fields: [addressField('to', 'Recipient address'), amountField('amount', 'Amount to mint')],
    getArgs: (values, decimals) => [
      parseAddress(values.to, 'recipient'),
      parseAmount(values.amount, decimals),
    ],
  },
  {
    method: 'burn',
    title: 'Burn tokens',
    description: 'Owner-only function to permanently remove tokens from a specified address.',
    ownerOnly: true,
    danger: true,
    fields: [addressField('from', 'Address to burn from'), amountField('amount', 'Amount to burn')],
    getArgs: (values, decimals) => [
      parseAddress(values.from, 'source'),
      parseAmount(values.amount, decimals),
    ],
  },
  {
    method: 'setApprovalWhitelist',
    title: 'Approval whitelist manager',
    description: 'Enable or disable approval whitelist status for custom trading security.',
    ownerOnly: true,
    fields: [
      addressField('account', 'Wallet address'),
      { key: 'status', label: 'Whitelisted status', kind: 'boolean' },
    ],
    getArgs: (values) => [parseAddress(values.account, 'wallet'), values.status === true],
  },
  {
    method: 'recoverERC20',
    title: 'Recover stuck ERC-20',
    description: 'Rescue stray ERC-20 tokens sent to this contract address.',
    ownerOnly: true,
    fields: [
      addressField('tokenAddress', 'ERC-20 contract address'),
      {
        key: 'tokenAmount',
        label: 'Amount in base units',
        placeholder: 'e.g. 1000000',
        kind: 'integer',
      },
    ],
    getArgs: (values) => {
      const amount = values.tokenAmount;
      if (typeof amount !== 'string' || !/^\d+$/.test(amount.trim())) {
        throw new Error('Enter a whole number of base units.');
      }
      return [parseAddress(values.tokenAddress, 'token'), BigInt(amount.trim())];
    },
  },
  {
    method: 'withdrawETH',
    title: 'Withdraw contract ETH',
    description: 'Withdraw native ETH balance accumulated inside the contract to the owner.',
    ownerOnly: true,
    fields: [],
    getArgs: () => [],
  },
  {
    method: 'transferOwnership',
    title: 'Transfer ownership',
    description: 'Assign full contract administrative ownership to a new address.',
    ownerOnly: true,
    danger: true,
    fields: [addressField('newOwner', 'New owner address')],
    getArgs: (values) => [parseAddress(values.newOwner, 'new owner')],
  },
  {
    method: 'renounceOwnership',
    title: 'Renounce ownership',
    description: 'Permanently remove the owner. Leaves owner-only functions permanently locked.',
    ownerOnly: true,
    danger: true,
    confirmMessage: 'Warning: Renouncing ownership is irreversible and will permanently disable minting and admin controls. Proceed?',
    submitLabel: 'Renounce ownership',
    fields: [],
    getArgs: () => [],
  },
];

function ActionCard({
  action,
  decimals: _decimals,
  disabled,
  onSubmit,
}: {
  action: ActionSpec;
  decimals: number;
  disabled: boolean;
  onSubmit: (action: ActionSpec, values: FormValues) => Promise<void>;
}) {
  const [values, setValues] = useState<FormValues>({});

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (action.confirmMessage && !window.confirm(action.confirmMessage)) return;
    await onSubmit(action, values);
    setValues({});
  };

  return (
    <article className={`action-card${action.danger ? ' action-card--danger' : ''}`}>
      <div className="card-heading">
        <div>
          <h3>{action.title}</h3>
          <p>{action.description}</p>
        </div>
        {action.ownerOnly && <span className="role-tag">Owner</span>}
      </div>
      <form className="action-form" onSubmit={submit}>
        {action.fields.map((field) => (
          <label className={field.kind === 'boolean' ? 'toggle-field' : 'field'} key={field.key}>
            {field.kind === 'boolean' ? (
              <>
                <input
                  type="checkbox"
                  checked={values[field.key] === true}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [field.key]: event.target.checked }))
                  }
                  disabled={disabled}
                />
                <span>{field.label}</span>
              </>
            ) : (
              <>
                <span>{field.label}</span>
                <input
                  type={field.kind === 'integer' ? 'text' : field.kind}
                  inputMode={field.kind === 'integer' || field.kind === 'amount' ? 'decimal' : undefined}
                  autoComplete="off"
                  placeholder={field.placeholder}
                  value={(values[field.key] as string) || ''}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [field.key]: event.target.value }))
                  }
                  required
                  disabled={disabled}
                />
              </>
            )}
          </label>
        ))}
        <button className={`button${action.danger ? ' button--danger' : ''}`} disabled={disabled}>
          {action.submitLabel ?? action.title}
        </button>
      </form>
    </article>
  );
}

export default function App() {
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [token, setToken] = useState<TokenInfo | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);

  // Allowance Lookup State
  const [allowanceOwner, setAllowanceOwner] = useState('');
  const [allowanceSpender, setAllowanceSpender] = useState('');
  const [allowanceResult, setAllowanceResult] = useState<string | null>(null);
  const [allowanceError, setAllowanceError] = useState<string | null>(null);

  // Whitelist Lookup State for Any Address
  const [checkWhitelistAddr, setCheckWhitelistAddr] = useState('');
  const [queriedWhitelistStatus, setQueriedWhitelistStatus] = useState<string | null>(null);

  const isOwner = Boolean(
    account && token?.owner && account.toLowerCase() === token.owner.toLowerCase(),
  );

  const loadTokenData = useCallback(async (activeProvider: ethers.BrowserProvider, activeAccount: string) => {
    try {
      const contract = new ethers.Contract(DOGE1_CONTRACT_ADDRESS, DOGE1_ABI, activeProvider);
      const [name, symbol, decimalsValue, totalSupply, owner, balance, whitelisted] =
        await Promise.all([
          contract.getFunction('name')(),
          contract.getFunction('symbol')(),
          contract.getFunction('decimals')(),
          contract.getFunction('totalSupply')(),
          contract.getFunction('owner')(),
          contract.getFunction('balanceOf')(activeAccount),
          contract.getFunction('approvalWhitelist')(activeAccount),
        ]);
      const decimals = Number(decimalsValue);
      if (!Number.isSafeInteger(decimals) || decimals < 0) {
        throw new Error('The contract returned an invalid decimals value.');
      }
      setToken({
        name: String(name),
        symbol: String(symbol),
        decimals,
        totalSupply: ethers.formatUnits(totalSupply, decimals),
        owner: String(owner),
        balance: ethers.formatUnits(balance, decimals),
        whitelisted: Boolean(whitelisted),
      });
    } catch (error) {
      setFeedback({ kind: 'error', message: `Could not read contract data: ${errorMessage(error)}` });
    }
  }, []);

  useEffect(() => {
    if (provider && account) void loadTokenData(provider, account);
  }, [provider, account, loadTokenData]);

  useEffect(() => {
    const wallet = window.ethereum;
    if (!wallet) return;

    const handleAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0];
      const nextAccount = Array.isArray(accounts) && typeof accounts[0] === 'string'
        ? accounts[0]
        : null;
      setAccount(nextAccount);
      setToken(null);
      setFeedback(null);
    };
    const handleChainChanged = () => {
      setProvider(new ethers.BrowserProvider(wallet));
      setToken(null);
      setFeedback(null);
    };

    wallet.on('accountsChanged', handleAccountsChanged);
    wallet.on('chainChanged', handleChainChanged);
    return () => {
      wallet.removeListener('accountsChanged', handleAccountsChanged);
      wallet.removeListener('chainChanged', handleChainChanged);
    };
  }, []);

  const connectWallet = async () => {
    if (!window.ethereum) {
      setFeedback({ kind: 'error', message: 'Install a browser wallet such as MetaMask to continue.' });
      return;
    }
    try {
      const nextProvider = new ethers.BrowserProvider(window.ethereum);
      const accounts = (await nextProvider.send('eth_requestAccounts', [])) as string[];
      if (!accounts[0]) throw new Error('No wallet account was returned.');
      setProvider(nextProvider);
      setAccount(ethers.getAddress(accounts[0]));
      setFeedback(null);
    } catch (error) {
      setFeedback({ kind: 'error', message: `Wallet connection failed: ${errorMessage(error)}` });
    }
  };

  const executeAction = async (action: ActionSpec, values: FormValues) => {
    if (!provider || !account || !token) {
      setFeedback({ kind: 'error', message: 'Connect your wallet and load contract data first.' });
      return;
    }
    if (action.ownerOnly && !isOwner) {
      setFeedback({ kind: 'error', message: 'This action is available to the current contract owner only.' });
      return;
    }
    setBusy(true);
    try {
      const args = action.getArgs(values, token.decimals);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(DOGE1_CONTRACT_ADDRESS, DOGE1_ABI, signer);
      const transaction = await contract.getFunction(action.method)(...args);
      setFeedback({
        kind: 'pending',
        message: `Transaction submitted: ${transaction.hash}. Waiting for confirmation…`,
      });
      await transaction.wait();
      setFeedback({ kind: 'success', message: `${action.title} completed successfully.` });
      await loadTokenData(provider, account);
    } catch (error) {
      setFeedback({ kind: 'error', message: `${action.title} failed: ${errorMessage(error)}` });
    } finally {
      setBusy(false);
    }
  };

  const readAllowance = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAllowanceError(null);
    setAllowanceResult(null);
    if (!provider || !token) {
      setAllowanceError('Connect your wallet to read the allowance.');
      return;
    }
    try {
      const contract = new ethers.Contract(DOGE1_CONTRACT_ADDRESS, DOGE1_ABI, provider);
      const amount = await contract.getFunction('allowance')(
        parseAddress(allowanceOwner, 'owner'),
        parseAddress(allowanceSpender, 'spender'),
      );
      setAllowanceResult(`${ethers.formatUnits(amount, token.decimals)} ${token.symbol}`);
    } catch (error) {
      setAllowanceError(errorMessage(error));
    }
  };

  const checkWhitelistStatus = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!provider) return;
    try {
      const contract = new ethers.Contract(DOGE1_CONTRACT_ADDRESS, DOGE1_ABI, provider);
      const status = await contract.getFunction('approvalWhitelist')(parseAddress(checkWhitelistAddr, 'account'));
      setQueriedWhitelistStatus(status ? 'Whitelisted for approval' : 'Not whitelisted');
    } catch (error) {
      setQueriedWhitelistStatus(`Error: ${errorMessage(error)}`);
    }
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Token control home">
          <span className="brand-mark">D</span>
          <span>SPCX Token Dashboard</span>
        </a>
        <div className="topbar-actions">
          {account && (
            <span className="network-pill">
              <span className="status-dot" />
              Mainnet Connected
            </span>
          )}
          <button className="button button--connect" onClick={connectWallet}>
            {account ? `${account.slice(0, 6)}…${account.slice(-4)}` : 'Connect wallet'}
          </button>
        </div>
      </header>

      <section className="page-intro">
        <div>
          <p className="eyebrow">Ethereum Mainnet Administration</p>
          <h1>{token?.name ?? 'Doge1 / SPCX Console'}</h1>
          <p className="intro-copy">
            Manage your custom whitelisted ERC-20 token contract interface securely via MetaMask.
          </p>
        </div>
        <div className="contract-address">
          <span>Contract address</span>
          <code title={DOGE1_CONTRACT_ADDRESS}>{DOGE1_CONTRACT_ADDRESS}</code>
        </div>
      </section>

      {!account && (
        <section className="connect-banner">
          <div className="connect-icon">↗</div>
          <div>
            <h2>Connect your wallet to get started</h2>
            <p>Read contract data, review token balances, and execute administrative operations.</p>
          </div>
          <button className="button" onClick={connectWallet}>Connect wallet</button>
        </section>
      )}

      {account && (
        <>
          <section className="overview-grid" aria-label="Token overview">
            <article className="metric-card metric-card--primary">
              <span className="metric-label">Your balance</span>
              <strong>{token?.balance ?? 'Loading…'}</strong>
              <span className="metric-foot">{token?.symbol ?? 'SPCX'}</span>
            </article>
            <article className="metric-card">
              <span className="metric-label">Total supply</span>
              <strong>{token?.totalSupply ?? 'Loading…'}</strong>
              <span className="metric-foot">{token?.symbol ?? 'SPCX'}</span>
            </article>
            <article className="metric-card">
              <span className="metric-label">Decimals</span>
              <strong>{token?.decimals ?? '—'}</strong>
              <span className="metric-foot">Token precision</span>
            </article>
            <article className="metric-card">
              <span className="metric-label">Your role</span>
              <strong className="role-value">{isOwner ? 'Contract Owner' : 'Standard Wallet'}</strong>
              <span className="metric-foot">
                {token?.whitelisted === null || token?.whitelisted === undefined
                  ? 'Whitelist status unavailable'
                  : token.whitelisted ? 'Approval whitelisted' : 'Not approval whitelisted'}
              </span>
            </article>
          </section>

          {/* Public Token Operations */}
          <section className="section-block">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Standard ERC-20 Actions</p>
                <h2>Token operations</h2>
              </div>
              <span className="section-note">Amounts use {token?.decimals ?? '18'} decimals</span>
            </div>
            <div className="actions-grid">
              {publicActions.map((action) => (
                <ActionCard
                  key={action.method}
                  action={action}
                  decimals={token?.decimals ?? 18}
                  disabled={busy || !token}
                  onSubmit={executeAction}
                />
              ))}
            </div>
          </section>

          {/* Read Lookups Section */}
          <section className="section-block">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Read-only queries</p>
                <h2>Contract lookups</h2>
              </div>
            </div>
            <div className="actions-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
              {/* Allowance Lookup Card */}
              <article className="lookup-card">
                <h3>Allowance lookup</h3>
                <p>Check how many tokens an owner has approved a spender to transfer.</p>
                <form className="lookup-form" onSubmit={readAllowance}>
                  <label className="field">
                    <span>Token owner</span>
                    <input
                      value={allowanceOwner}
                      onChange={(event) => setAllowanceOwner(event.target.value)}
                      placeholder="0x..."
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Approved spender</span>
                    <input
                      value={allowanceSpender}
                      onChange={(event) => setAllowanceSpender(event.target.value)}
                      placeholder="0x..."
                      required
                    />
                  </label>
                  <button className="button button--secondary" disabled={!token}>Check allowance</button>
                </form>
                {allowanceResult && <p className="lookup-result">Allowance: <strong>{allowanceResult}</strong></p>}
                {allowanceError && <p className="inline-error">{allowanceError}</p>}
              </article>

              {/* Whitelist Status Lookup Card */}
              <article className="lookup-card">
                <h3>Whitelist checker</h3>
                <p>Verify if any specific address is approved for custom contract interactions.</p>
                <form className="lookup-form" onSubmit={checkWhitelistStatus}>
                  <label className="field">
                    <span>Account address</span>
                    <input
                      value={checkWhitelistAddr}
                      onChange={(event) => setCheckWhitelistAddr(event.target.value)}
                      placeholder="0x..."
                      required
                    />
                  </label>
                  <button className="button button--secondary" disabled={!token}>Check whitelist</button>
                </form>
                {queriedWhitelistStatus && <p className="lookup-result">Status: <strong>{queriedWhitelistStatus}</strong></p>}
              </article>
            </div>
          </section>

          {/* Owner-Only Administrative Controls */}
          {isOwner && (
            <section className="section-block owner-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Restricted access</p>
                  <h2>Owner administrative controls</h2>
                </div>
                <span className="owner-badge">Owner verified</span>
              </div>
              <div className="actions-grid">
                {ownerActions.map((action) => (
                  <ActionCard
                    key={action.method}
                    action={action}
                    decimals={token?.decimals ?? 18}
                    disabled={busy || !token}
                    onSubmit={executeAction}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {feedback && (
        <div className={`feedback feedback--${feedback.kind}`} role="status" aria-live="polite">
          <span className="feedback-mark" aria-hidden="true">
            {feedback.kind === 'success' ? '✓' : feedback.kind === 'error' ? '!' : '…'}
          </span>
          <span>{feedback.message}</span>
          <button aria-label="Dismiss message" onClick={() => setFeedback(null)}>×</button>
        </div>
      )}

      <footer className="footer">
        <span>{token?.symbol ?? 'SPCX'} contract controls • Mainnet</span>
        <span>Transactions require confirmation in MetaMask.</span>
      </footer>
    </main>
  );
}