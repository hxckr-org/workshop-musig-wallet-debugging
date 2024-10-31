import * as bitcoin from "bitcoinjs-lib";
import * as bip39 from "bip39";
import { BrokenMultisigWallet } from "./broken-musig";
import { ECPairFactory } from "ecpair";
import * as ecc from "tiny-secp256k1";

const ECPair = ECPairFactory(ecc);

describe("BrokenMultisigWallet Cryptographic Tests", () => {
  describe("BIP Path and Key Derivation", () => {
    it("should use correct BIP48 path for multisig", async () => {
      const wallet = new BrokenMultisigWallet(2, 3);
      await wallet.generateWallet();
      const paths = wallet.getDerivationPaths();

      // Bug 1: Should fail because using BIP49 instead of BIP48
      paths.forEach((path) => {
        expect(path).toMatch(/^m\/48'\/0'\/0'\/2'\/\d+$/);
      });
    });

    it("should validate public keys for multisig compatibility", async () => {
      const wallet = new BrokenMultisigWallet(2, 3);
      await wallet.generateWallet();

      // Bug 2: Should check if public keys are valid for multisig
      const publicKeys = wallet.getPublicKeys(); // You'll need to add this method
      publicKeys.forEach((pubKey) => {
        expect(ecc.isPoint(pubKey)).toBe(true);
        // Should also check if key is compressed
        expect(pubKey.length).toBe(33);
      });
    });
  });

  describe("Multisig Script Creation", () => {
    it("should create correct P2MS script", () => {
      const wallet = new BrokenMultisigWallet(2, 3);

      // Bug 3: Should fail because using P2PKH instead of P2MS
      const script = wallet.createInsecureMultisig();
      const decodedScript = bitcoin.script.decompile(script);

      expect(decodedScript![0]).toBe(bitcoin.script.number.encode(2)); // m
      expect(decodedScript![decodedScript!.length - 2]).toBe(
        bitcoin.script.number.encode(3)
      ); // n
      expect(decodedScript![decodedScript!.length - 1]).toBe(
        bitcoin.opcodes.OP_CHECKMULTISIG
      );
    });

    it("should create proper P2SH wrapping", async () => {
      const wallet = new BrokenMultisigWallet(2, 3);
      await wallet.generateWallet();
      const addresses = wallet.getAddresses();

      // Bug 4: Should fail because of incorrect P2SH script structure
      expect(addresses?.p2sh).toMatch(/^2/); // Testnet P2SH
      // Additional checks for script structure could be added
    });
  });

  describe("Witness Program Creation", () => {
    it("should create correct witness program for P2WSH", async () => {
      const wallet = new BrokenMultisigWallet(2, 3);
      await wallet.generateWallet();

      // Bug 5: Should fail because of incorrect witness program
      const witness = wallet.createWitness([
        Buffer.alloc(64),
        Buffer.alloc(64),
      ]);
      expect(witness[0]).toBeInstanceOf(Buffer); // Expecting 0x00 as first element
      expect(witness.length).toBe(4); // 0x00, redeem script, and two signatures
    });
  });

  describe("Transaction Signing", () => {
    let wallet: BrokenMultisigWallet;
    const mockTxHex = "020000000001..."; // Add proper mock transaction

    beforeEach(async () => {
      wallet = new BrokenMultisigWallet(2, 3);
      await wallet.generateWallet();
    });

    it("should use correct signature hash type", async () => {
      // Bug 7: Should fail because using SIGHASH_NONE
      const keyPair = await wallet.generateKeyPair(0);
      const signedTx = await wallet.signTransaction(mockTxHex, 0, keyPair);
      const tx = bitcoin.Transaction.fromHex(signedTx);

      // Check if signature uses SIGHASH_ALL
      const sigHash = tx.ins[0].script[tx.ins[0].script.length - 1];
      expect(sigHash).toBe(bitcoin.Transaction.SIGHASH_ALL);
    });

    it("should create proper witness structure", () => {
      // Bug 8: Should fail because of incorrect witness structure
      const signatures = [Buffer.alloc(64), Buffer.alloc(64)];
      const witness = wallet.createWitness(signatures);

      expect(witness[0].length).toBe(0); // Empty for witness version 0
      expect(witness[1]).toEqual(wallet.getRedeemScript()); // You'll need to add this method
      expect(witness.length).toBe(signatures.length + 2); // Scripts + signatures
    });
  });

  describe("BIP32 Path Validation", () => {
    it("should validate hardened derivation", () => {
      const wallet = new BrokenMultisigWallet(2, 3);

      // Bug 9: Should fail because missing hardened derivation check
      const validPath = "m/48'/0'/0'/2'/0";
      const invalidPath = "m/48/0/0/2/0";

      expect(wallet.validatePath(validPath)).toBe(true);
      expect(wallet.validatePath(invalidPath)).toBe(false);
    });
  });

  describe("Multisig Script Validation", () => {
    it("should properly validate multisig script structure", async () => {
      const wallet = new BrokenMultisigWallet(2, 3);
      await wallet.generateWallet();

      // Bug 10: Should fail because of incorrect script validation
      const script = wallet.createInsecureMultisig();
      expect(wallet.validateMultisigScript(script)).toBe(false);

      // Create a correct script for comparison
      const correctScript = bitcoin.payments.p2ms({
        m: 2,
        pubkeys: wallet.getPublicKeys(),
        network: bitcoin.networks.testnet,
      }).output;

      expect(wallet.validateMultisigScript(correctScript!)).toBe(true);
    });
  });
});
