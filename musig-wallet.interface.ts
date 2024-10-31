export interface IMultisigWallet {
  generateWallet(): Promise<void>;
  getAddresses(): { p2sh: string; p2wsh: string };
  getMnemonics(): string[];
  getDerivationPaths(): string[];
  restoreFromMnemonic(mnemonic: string, index: number): Promise<any>;
} 