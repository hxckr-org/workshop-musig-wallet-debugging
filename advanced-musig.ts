import * as bitcoin from "bitcoinjs-lib";
import { BIP32Factory } from "bip32";
import * as ecc from "tiny-secp256k1";
import * as bip39 from "bip39";

// Initialize cryptographic libraries
const bip32 = BIP32Factory(ecc);
bitcoin.initEccLib(ecc);

// Add a simple logging utility
const log = {
  info: (message: string, data?: any) => {
    console.log(`[INFO] ${message}`, data ? data : "");
  },
  warn: (message: string) => {
    console.warn(`[WARN] ${message}`);
  },
};

/**
 * Configuration options for the multisig wallet
 * @property network - Bitcoin network (mainnet/testnet)
 * @property derivationPath - Custom BIP32 derivation path
 */
interface WalletConfig {
  network?: bitcoin.Network;
  derivationPath?: string;
}

/**
 * Information about a key pair in the multisig wallet
 * @property mnemonic - BIP39 mnemonic phrase for key recovery
 * @property path - Full derivation path including index
 * @property publicKey - Public key buffer
 * @property privateKey - Optional private key buffer
 */
interface KeyPairInfo {
  mnemonic: string;
  path: string;
  publicKey: Buffer;
  privateKey?: Buffer;
}

/**
 * Advanced Multisig Wallet implementation with HD wallet support
 * Implements BIP32 for hierarchical deterministic wallets
 * Implements BIP39 for mnemonic backup
 * Supports both P2SH and P2WSH (native SegWit) addresses
 */
export class AdvancedMultisigWallet {
  private requiredSignatures: number; // Number of signatures required (m)
  private totalSigners: number; // Total number of signers (n)
  private network: bitcoin.Network; // Bitcoin network configuration
  private derivationPath: string; // Base derivation path
  private keyPairs: KeyPairInfo[]; // Array of key pair information
  private redeemScript?: Buffer; // Multisig redeem script
  private addresses?: {
    // Wallet addresses
    p2sh: string; // Legacy P2SH address
    p2wsh: string; // Native SegWit P2WSH address
  };

  /**
   * Creates a new multisig wallet
   * @param requiredSignatures - Number of required signatures (m)
   * @param totalSigners - Total number of signers (n)
   * @param config - Optional wallet configuration
   */
  constructor(
    requiredSignatures: number,
    totalSigners: number,
    config: WalletConfig = {}
  ) {
    // Validate m-of-n requirements
    if (
      requiredSignatures <= 0 ||
      totalSigners <= 0 ||
      requiredSignatures > totalSigners
    ) {
      throw new Error("Invalid signature requirements");
    }

    this.requiredSignatures = requiredSignatures;
    this.totalSigners = totalSigners;
    this.network = config.network || bitcoin.networks.testnet;
    this.derivationPath = config.derivationPath || "m/48'/0'/0'/2'"; // BIP48 multisig path
    this.keyPairs = [];

    log.info(
      `Initializing ${requiredSignatures}-of-${totalSigners} multisig wallet`,
      {
        network:
          this.network === bitcoin.networks.bitcoin ? "mainnet" : "testnet",
        basePath: this.derivationPath,
      }
    );
  }

  /**
   * Generates a complete wallet with all key pairs
   * Creates both P2SH and P2WSH addresses
   */
  public async generateWallet(): Promise<void> {
    log.info("Starting wallet generation...");

    for (let i = 0; i < this.totalSigners; i++) {
      const keyPair = await this.generateKeyPair(i);
      this.keyPairs.push(keyPair);
      log.info(`Generated key pair ${i + 1}/${this.totalSigners}`, {
        path: keyPair.path,
      });
    }

    this.createMultisigAddresses();
    log.info("Wallet generation complete", {
      addresses: this.addresses,
    });
  }

  /**
   * Generates a single key pair with mnemonic backup
   * @param index - Index of the key pair in the wallet
   * @returns KeyPairInfo containing the generated keys and backup info
   */
  private async generateKeyPair(index: number): Promise<KeyPairInfo> {
    // Generate mnemonic with 256-bit entropy (24 words)
    const mnemonic = bip39.generateMnemonic(256);
    const seed = await bip39.mnemonicToSeed(mnemonic);

    // Derive master node and child key
    const root = bip32.fromSeed(seed, this.network);
    const path = `${this.derivationPath}/${index}`;
    const child = root.derivePath(path);

    if (!child.privateKey) {
      log.warn("Failed to generate private key");
      throw new Error("Failed to generate private key");
    }

    return {
      mnemonic,
      path,
      publicKey: Buffer.from(child.publicKey),
      privateKey: Buffer.from(child.privateKey),
    };
  }

  /**
   * Creates P2SH and P2WSH addresses from public keys
   * Uses sorted public keys for deterministic address generation
   */
  private createMultisigAddresses(): void {
    log.info("Creating multisig addresses...");

    // Sort public keys for deterministic script creation
    const publicKeys = this.keyPairs
      .map((kp) => kp.publicKey)
      .sort((a, b) => a.compare(b));

    // Create multisig redeem script
    const redeemScript = bitcoin.payments.p2ms({
      m: this.requiredSignatures,
      pubkeys: publicKeys,
      network: this.network,
    }).output;

    if (!redeemScript) {
      log.warn("Failed to create redeem script");
      throw new Error("Failed to create redeem script");
    }

    this.redeemScript = redeemScript;
    log.info("Created redeem script", {
      scriptHex: redeemScript.toString("hex").slice(0, 32) + "...",
    });

    // Generate legacy P2SH address
    const p2sh = bitcoin.payments.p2sh({
      redeem: { output: redeemScript, network: this.network },
      network: this.network,
    });

    // Generate native SegWit P2WSH address
    const p2wsh = bitcoin.payments.p2wsh({
      redeem: { output: redeemScript, network: this.network },
      network: this.network,
    });

    if (!p2sh.address || !p2wsh.address) {
      log.warn("Failed to generate addresses");
      throw new Error("Failed to generate addresses");
    }

    this.addresses = {
      p2sh: p2sh.address,
      p2wsh: p2wsh.address,
    };
  }

  // Getter methods
  public getAddresses() {
    if (!this.addresses) {
      throw new Error("Wallet not initialized. Call generateWallet() first.");
    }
    return this.addresses;
  }

  public getMnemonics(): string[] {
    return this.keyPairs.map((kp) => kp.mnemonic);
  }

  public getDerivationPaths(): string[] {
    return this.keyPairs.map((kp) => kp.path);
  }

  public getRedeemScript(): Buffer {
    if (!this.redeemScript) {
      throw new Error(
        "Redeem script not initialized. Call generateWallet() first."
      );
    }
    return this.redeemScript;
  }

  public getPublicKeys(): Buffer[] {
    return this.keyPairs.map((kp) => kp.publicKey).sort((a, b) => a.compare(b));
  }

  /**
   * Restores a key pair from a mnemonic phrase
   * @param mnemonic - BIP39 mnemonic phrase
   * @param index - Index of the key pair to restore
   * @returns Restored key pair information
   */
  public restoreFromMnemonic(
    mnemonic: string,
    index: number
  ): Promise<KeyPairInfo> {
    log.info(`Attempting to restore key pair at index ${index}`);

    if (index < 0 || index >= this.totalSigners) {
      log.warn(`Invalid signer index: ${index}`);
      throw new Error("Invalid signer index");
    }
    return this.recoverKeyPair(mnemonic, index);
  }

  /**
   * Internal method to recover a key pair from a mnemonic
   * @param mnemonic - BIP39 mnemonic phrase
   * @param index - Derivation index
   * @returns Recovered key pair information
   */
  private async recoverKeyPair(
    mnemonic: string,
    index: number
  ): Promise<KeyPairInfo> {
    if (!bip39.validateMnemonic(mnemonic)) {
      log.warn("Invalid mnemonic provided");
      throw new Error("Invalid mnemonic");
    }

    const seed = await bip39.mnemonicToSeed(mnemonic);
    const root = bip32.fromSeed(seed, this.network);
    const path = `${this.derivationPath}/${index}`;
    const child = root.derivePath(path);

    if (!child.privateKey) {
      log.warn("Failed to recover private key");
      throw new Error("Failed to recover private key");
    }

    log.info(`Successfully recovered key pair at index ${index}`, {
      path,
    });

    return {
      mnemonic,
      path,
      publicKey: Buffer.from(child.publicKey),
      privateKey: Buffer.from(child.privateKey),
    };
  }
}
