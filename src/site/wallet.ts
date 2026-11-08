import { toHex } from './siwe';

/** Injected EIP-1193 provider (MetaMask, Rabby, Coinbase Wallet extension, ...). No SDKs. */
interface Eip1193 { request(args: { method: string; params?: unknown[] }): Promise<unknown> }
declare global { interface Window { ethereum?: Eip1193 } }

export interface WalletPort {
  requestAddress(): Promise<string>;
  signMessage(address: string, message: string): Promise<string>;
}

export class WalletError extends Error {}

function explain(error: unknown): WalletError {
  const code = (error as { code?: number } | null)?.code;
  if (code === 4001) return new WalletError('The request was rejected in your wallet.');
  if (code === -32002) return new WalletError('Your wallet already has a pending request. Open it and finish or cancel it.');
  return new WalletError('The wallet request failed. Please try again.');
}

export class InjectedWallet implements WalletPort {
  constructor(private readonly provider: Eip1193 | undefined = typeof window === 'undefined' ? undefined : window.ethereum) {}

  async requestAddress(): Promise<string> {
    if (!this.provider) throw new WalletError('No browser wallet found. Install a wallet extension such as MetaMask, then reload this page.');
    let accounts: unknown;
    try { accounts = await this.provider.request({ method: 'eth_requestAccounts' }); } catch (error) { throw explain(error); }
    const address = Array.isArray(accounts) ? accounts[0] : undefined;
    if (typeof address !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(address)) throw new WalletError('The wallet did not return an account.');
    return address;
  }

  /** personal_sign: an off-chain signature. No transaction, no gas, no network switch needed. */
  async signMessage(address: string, message: string): Promise<string> {
    if (!this.provider) throw new WalletError('No browser wallet found.');
    let signature: unknown;
    try { signature = await this.provider.request({ method: 'personal_sign', params: [toHex(message), address] }); } catch (error) { throw explain(error); }
    if (typeof signature !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(signature)) throw new WalletError('The wallet returned an unexpected signature.');
    return signature;
  }
}
