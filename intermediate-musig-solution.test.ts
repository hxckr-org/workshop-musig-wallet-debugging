import * as bitcoin from "bitcoinjs-lib";
import { ECPairFactory } from "ecpair";
import * as tinysecp from "tiny-secp256k1";
import {
  MultisigWallet,
  createTestWallet,
  UTXO,
} from "./intermediate-musig-solution";

const ECPair = ECPairFactory(tinysecp);
const network = bitcoin.networks.testnet;

describe("MultisigWallet", () => {
  describe("Constructor and Basic Properties", () => {
    it("should create a valid multisig wallet with correct parameters", () => {
      const { wallet } = createTestWallet(2);
      const addresses = wallet.getAddresses();

      expect(addresses.p2sh).toBeTruthy();
      expect(addresses.p2wsh).toBeTruthy();
      expect(addresses.p2sh).toMatch(/^2/); // P2SH testnet addresses start with 2
      expect(addresses.p2wsh).toMatch(/^tb1/); // P2WSH testnet addresses start with tb1
    });

    it("should throw error when required signatures exceed number of public keys", () => {
      const keyPair = ECPair.makeRandom({ network });
      expect(() => {
        new MultisigWallet(2, [Buffer.from(keyPair.publicKey)]);
      }).toThrow("Required signatures cannot exceed number of public keys");
    });

    it("should throw error with invalid required signatures", () => {
      const keyPair = ECPair.makeRandom({ network });
      expect(() => {
        new MultisigWallet(0, [Buffer.from(keyPair.publicKey)]);
      }).toThrow("Required signatures must be a positive integer");
    });

    it("should throw error with empty public keys array", () => {
      expect(() => {
        new MultisigWallet(1, []);
      }).toThrow("Public keys array cannot be empty");
    });
  });

  describe("Transaction Creation and Signing", () => {
    let wallet: MultisigWallet;
    let keyPairs: any[];
    let mockUTXO: UTXO;

    beforeEach(() => {
      const testWallet = createTestWallet(2);
      wallet = testWallet.wallet;
      keyPairs = testWallet.keyPairs;

      // Create proper P2WSH scriptPubKey
      const payment = bitcoin.payments.p2wsh({
        redeem: {
          output: wallet.getRedeemScript(),
          network,
        },
        network,
      });

      mockUTXO = {
        txid: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        vout: 0,
        value: BigInt(100000),
        scriptPubKey: payment.output!.toString("hex"),
      };
    });

    it("should create a valid transaction", () => {
      const outputs = [
        {
          address: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
          value: BigInt(50000),
        },
      ];

      const psbt = wallet.createTransaction([mockUTXO], outputs, 1000);
      expect(psbt).toBeInstanceOf(bitcoin.Psbt);
      expect(psbt.data.inputs.length).toBe(1);
      expect(psbt.data.outputs.length).toBe(1);

      // Additional verification
      const output = psbt.txOutputs[0];
      expect(output.value).toBe(50000); // Verify the value is a number
    });

    it("should sign transaction with valid signers", () => {
      const outputs = [
        {
          address: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
          value: BigInt(50000),
        },
      ];

      const psbt = wallet.createTransaction([mockUTXO], outputs, 1000);

      // Sign with first key
      const success1 = wallet.signTransaction(psbt, keyPairs[0], 0);
      expect(success1).toBe(true);

      // Sign with second key
      const success2 = wallet.signTransaction(psbt, keyPairs[1], 0);
      expect(success2).toBe(true);
    });

    it("should prevent duplicate signatures from same key", () => {
      const outputs = [
        {
          address: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
          value: BigInt(50000),
        },
      ];

      const psbt = wallet.createTransaction([mockUTXO], outputs, 1000);

      // Sign with first key
      wallet.signTransaction(psbt, keyPairs[0], 0);

      // Attempt to sign again with same key
      expect(() => {
        wallet.signTransaction(psbt, keyPairs[0], 0);
      }).toThrow("This key has already signed");
    });
  });

  describe("Transaction Verification and Finalization", () => {
    let wallet: MultisigWallet;
    let keyPairs: any[];
    const mockUTXO = {
      txid: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      vout: 0,
      value: BigInt(100000),
      scriptPubKey: "0020" + "00".repeat(32), // Mock P2WSH script
    };

    beforeEach(() => {
      const testWallet = createTestWallet(2);
      wallet = testWallet.wallet;
      keyPairs = testWallet.keyPairs;
    });

    it("should verify transaction with sufficient signatures", () => {
      const outputs = [
        {
          address: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
          value: BigInt(50000),
        },
      ];

      const psbt = wallet.createTransaction([mockUTXO], outputs, 1000);

      wallet.signTransaction(psbt, keyPairs[0], 0);
      wallet.signTransaction(psbt, keyPairs[1], 0);

      expect(wallet.verifyTransaction(psbt)).toBe(true);
    });

    it("should fail verification with insufficient signatures", () => {
      const outputs = [
        {
          address: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
          value: BigInt(50000),
        },
      ];

      const psbt = wallet.createTransaction([mockUTXO], outputs, 1000);

      wallet.signTransaction(psbt, keyPairs[0], 0);

      expect(wallet.verifyTransaction(psbt)).toBe(false);
    });

    it("should reset signers tracking", () => {
      const outputs = [
        {
          address: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
          value: BigInt(50000),
        },
      ];

      const psbt = wallet.createTransaction([mockUTXO], outputs, 1000);

      wallet.signTransaction(psbt, keyPairs[0], 0);
      wallet.resetSigners();

      // Should be able to sign with the same key again after reset
      expect(() => {
        wallet.signTransaction(psbt, keyPairs[0], 0);
      }).not.toThrow();
    });
  });
});
