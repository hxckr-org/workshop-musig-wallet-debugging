import * as bitcoin from "bitcoinjs-lib";
import { ECPairFactory, ECPairInterface } from "ecpair";
import * as tinysecp from "tiny-secp256k1";
import {
  validate,
  Network as ValidatorNetwork,
} from "bitcoin-address-validation";

const ECPair = ECPairFactory(tinysecp);
const network = bitcoin.networks.testnet;

interface UTXO {
  txid: string;
  vout: number;
  value: bigint;
  scriptPubKey: string;
}

interface Output {
  address: string;
  value: bigint;
}

// We are using either P2SH or P2WSH for the wallet addresses.
// P2SH is the standard multisig address format
// P2WSH is the SegWit version of the multisig address
// We don't want to use P2MS becuase it is not common to find
// P2MS scripts in the blockchain, as most multisig transactions
// are wrapped inside P2SH or P2WSH instead.

/* The `WalletAddresses` interface is defining a structure
    for representing wallet addresses in a
    multisig setup. It has two properties: 
    1. p2sh: string - The Pay to Script Hash address
    2. p2wsh: string - The Pay to Witness Script Hash address
*/
interface WalletAddresses {
  p2sh: string;
  p2wsh: string;
}

/* The `MultisigWallet` class is a representation of a multisig wallet.
    It is initialized with the required number of signatures and the public keys of the signers.
    It creates the redeem script and the P2SH and P2WSH addresses and returns a wallet instance
    that has the following properties:
    1. m: number - The required signatures
    2. n: number - The total signers
    3. pubkeys: Buffer[] - The ordered public keys
    4. redeemScript: Buffer - The redeem script
    5. p2shAddress: string - The Pay to Script Hash address
    6. p2wshAddress: string - The Pay to Witness Script Hash address
    7. usedSigners: Set<string> - Track unique signers
*/
class MultisigWallet {
  private m: number; // Required signatures
  private n: number; // Total signers
  private pubkeys: Buffer[]; // Ordered public keys
  private redeemScript: Buffer;
  private p2shAddress: string;
  private p2wshAddress: string;
  private usedSigners: Set<string>; // Track unique signers

  constructor(requiredSigs: number, publicKeys: Buffer[]) {
    // Validate inputs
    if (!Number.isInteger(requiredSigs) || requiredSigs <= 0) {
      throw new Error("Required signatures must be a positive integer");
    }
    if (!Array.isArray(publicKeys) || publicKeys.length === 0) {
      throw new Error("Public keys array cannot be empty");
    }
    if (requiredSigs > publicKeys.length) {
      throw new Error(
        "Required signatures cannot exceed number of public keys"
      );
    }

    // Validate each public key
    publicKeys.forEach((pubkey, index) => {
      if (!Buffer.isBuffer(pubkey) || !tinysecp.isPoint(pubkey)) {
        throw new Error(`Invalid public key at index ${index}`);
      }
    });

    this.m = requiredSigs;
    this.n = publicKeys.length;
    // Sort public keys for consistent script generation
    this.pubkeys = [...publicKeys].sort((a, b) => a.compare(b));
    this.usedSigners = new Set<string>();

    // Create redeem script and addresses
    this.redeemScript = this.createRedeemScript();

    // Create proper P2SH
    const p2sh = bitcoin.payments.p2sh({
      redeem: {
        output: this.redeemScript,
        network,
      },
      network,
    });

    // Create proper P2WSH
    const p2wsh = bitcoin.payments.p2wsh({
      redeem: {
        output: this.redeemScript,
        network,
      },
      network,
    });

    if (!p2sh.address || !p2wsh.address) {
      throw new Error("Failed to generate addresses");
    }

    this.p2shAddress = p2sh.address;
    this.p2wshAddress = p2wsh.address;
  }

  private createRedeemScript(): Buffer {
    // Create proper multisig redeem script
    const script = bitcoin.script.compile([
      // OP_M
      bitcoin.script.number.encode(this.m),
      // Sorted public keys
      ...this.pubkeys,
      // OP_N
      bitcoin.script.number.encode(this.n),
      // OP_CHECKMULTISIG
      bitcoin.opcodes.OP_CHECKMULTISIG,
    ]);

    // Convert Uint8Array to Buffer
    return Buffer.from(script);
  }

  public getAddresses(): WalletAddresses {
    return {
      p2sh: this.p2shAddress,
      p2wsh: this.p2wshAddress,
    };
  }

  public getRedeemScript(): Buffer {
    return this.redeemScript;
  }

  public createTransaction(
    utxos: UTXO[],
    outputs: Output[],
    fee: number
  ): bitcoin.Psbt {
    // Validate inputs
    if (!Array.isArray(utxos) || utxos.length === 0) {
      throw new Error("UTXOs array cannot be empty");
    }
    if (!Array.isArray(outputs) || outputs.length === 0) {
      throw new Error("Outputs array cannot be empty");
    }
    if (fee < 0) {
      throw new Error("Fee cannot be negative");
    }

    // Calculate total input amount (convert fee to bigint for comparison)
    const totalInput = utxos.reduce((sum, utxo) => sum + utxo.value, BigInt(0));

    // Calculate total output amount
    const totalOutput = outputs.reduce(
      (sum, output) => sum + output.value,
      BigInt(0)
    );

    // Validate amounts (convert fee to bigint)
    if (totalInput < totalOutput + BigInt(fee)) {
      throw new Error("Insufficient funds for transaction");
    }

    // Create new PSBT
    const psbt = new bitcoin.Psbt({ network });

    // Add inputs with proper script handling
    utxos.forEach((utxo) => {
      const inputData: any = {
        hash: utxo.txid,
        index: utxo.vout,
        redeemScript: this.redeemScript,
        witnessScript: this.redeemScript, // Add witnessScript for P2WSH
      };

      // Handle both legacy and SegWit inputs
      if (utxo.scriptPubKey.startsWith("0020")) {
        // P2WSH
        inputData.witnessUtxo = {
          script: Buffer.from(utxo.scriptPubKey, "hex"),
          value: utxo.value,
        };
      } else {
        // P2SH
        inputData.nonWitnessUtxo = Buffer.from(utxo.scriptPubKey, "hex");
      }

      psbt.addInput(inputData);
    });

    // Add outputs (modify to handle BigInt properly)
    outputs.forEach((output) => {
      const validatorNetwork =
        network === bitcoin.networks.testnet ? "testnet" : "mainnet";
      if (!validate(output.address, validatorNetwork as ValidatorNetwork)) {
        throw new Error(`Invalid address: ${output.address}`);
      }
      if (output.value <= BigInt(0)) {
        throw new Error("Output value must be positive");
      }
      psbt.addOutput({
        address: output.address,
        value: output.value,
      });
    });

    return psbt;
  }

  public signTransaction(
    psbt: bitcoin.Psbt,
    keyPair: ECPairInterface,
    inputIndex: number
  ): boolean {
    // Validate signer
    const pubkey = Buffer.from(keyPair.publicKey).toString("hex");
    if (!this.pubkeys.some((p) => Buffer.from(p).toString("hex") === pubkey)) {
      throw new Error("Signer is not part of the multisig setup");
    }

    // Check for duplicate signers
    if (this.usedSigners.has(pubkey)) {
      throw new Error("This key has already signed");
    }

    try {
      // Sign with SIGHASH_ALL
      psbt.signInput(inputIndex, keyPair, [bitcoin.Transaction.SIGHASH_ALL]);
      this.usedSigners.add(pubkey);
      return true;
    } catch (error) {
      console.error("Signing error:", error);
      return false;
    }
  }

  public finalizeTransaction(psbt: bitcoin.Psbt): string {
    if (!this.verifyTransaction(psbt)) {
      throw new Error("Transaction verification failed");
    }

    try {
      psbt.finalizeAllInputs();
      const tx = psbt.extractTransaction();
      return tx.toHex();
    } catch (error) {
      throw new Error(`Transaction finalization failed: ${error}`);
    }
  }

  public verifyTransaction(psbt: bitcoin.Psbt): boolean {
    const inputs = psbt.data.inputs;

    for (const input of inputs) {
      // Verify we have enough signatures
      if (!input.partialSig || input.partialSig.length < this.m) {
        return false;
      }

      // Verify signatures are from unique signers
      const signers = new Set<string>();
      for (const sig of input.partialSig) {
        const pubkeyHex = Buffer.from(sig.pubkey).toString("hex");
        if (signers.has(pubkeyHex)) {
          return false;
        }
        signers.add(pubkeyHex);

        // Verify signer is authorized
        if (
          !this.pubkeys.some(
            (p) => Buffer.from(p).toString("hex") === pubkeyHex
          )
        ) {
          return false;
        }
      }
    }

    return true;
  }

  // Helper method to reset used signers tracking
  public resetSigners(): void {
    this.usedSigners.clear();
  }
}

// Test helper function
function createTestWallet(m: number = 2): {
  wallet: MultisigWallet;
  keyPairs: ECPairInterface[];
} {
  const keyPairs = [
    ECPair.makeRandom({ network }),
    ECPair.makeRandom({ network }),
    ECPair.makeRandom({ network }),
  ];

  const pubkeys = keyPairs.map((kp) => Buffer.from(kp.publicKey));

  const wallet = new MultisigWallet(m, pubkeys);

  return {
    wallet,
    keyPairs,
  };
}

export { MultisigWallet, createTestWallet };
