import * as bitcoin from "bitcoinjs-lib";
import * as bip39 from "bip39";
import * as ecc from "tiny-secp256k1";
import { AdvancedMultisigWallet } from "./advanced-musig";
import { BrokenMultisigWallet } from "./broken-musig";

// You can switch between implementations here
const MultisigWallet = AdvancedMultisigWallet; // Solution
// const MultisigWallet = BrokenMultisigWallet; // Broken version to fix

describe("Multisig Wallet Tests", () => {
  describe("Wallet Creation", () => {
    it("should create a valid 2-of-3 multisig wallet", async () => {
      const wallet = new MultisigWallet(2, 3);
      await wallet.generateWallet();

      const addresses = wallet.getAddresses();
      expect(addresses?.p2sh).toBeTruthy();
      expect(addresses?.p2wsh).toBeTruthy();
      expect(addresses?.p2sh).toMatch(/^2/); // Testnet P2SH starts with 2
      expect(addresses?.p2wsh).toMatch(/^tb1/); // Testnet P2WSH starts with tb1
    });

    it("should generate correct number of mnemonics with proper entropy", async () => {
      const wallet = new MultisigWallet(2, 3);
      await wallet.generateWallet();

      const mnemonics = wallet.getMnemonics();
      expect(mnemonics).toHaveLength(3);
      mnemonics.forEach((mnemonic) => {
        expect(mnemonic.split(" ")).toHaveLength(24); // 256-bit security
        expect(bip39.validateMnemonic(mnemonic)).toBe(true);
      });
    });

    it("should use correct BIP48 derivation path for multisig", async () => {
      const wallet = new MultisigWallet(2, 3);
      await wallet.generateWallet();

      const paths = wallet.getDerivationPaths();
      expect(paths).toHaveLength(3);
      paths.forEach((path, index) => {
        expect(path).toBe(`m/48'/0'/0'/2'/${index}`);
      });
    });

    it("should validate signature requirements", () => {
      expect(() => new MultisigWallet(3, 2)).toThrow();
      expect(() => new MultisigWallet(0, 3)).toThrow();
      expect(() => new MultisigWallet(-1, 3)).toThrow();
    });
  });

  describe("Script Creation", () => {
    let wallet: typeof MultisigWallet.prototype;

    beforeEach(async () => {
      wallet = new MultisigWallet(2, 3);
      await wallet.generateWallet();
    });

    it("should create proper P2MS base script", () => {
      const redeemScript = wallet.getRedeemScript();
      const decodedScript = bitcoin.script.decompile(redeemScript);
      
      // Check script structure without decoding numbers
      const publicKeys = wallet.getPublicKeys();
      
      // Check script format: <m> <pubkey1> <pubkey2> <pubkey3> <n> OP_CHECKMULTISIG
      expect(decodedScript).toBeTruthy();
      expect(decodedScript!.length).toBe(publicKeys.length + 3); // m + pubkeys + n + OP_CHECKMULTISIG
      
      // Check that public keys are in the middle of the script
      for (let i = 0; i < publicKeys.length; i++) {
        expect(Buffer.isBuffer(decodedScript![i + 1])).toBe(true);
        expect(decodedScript![i + 1]).toEqual(publicKeys[i]);
      }
      
      // Check that the last opcode is OP_CHECKMULTISIG
      expect(decodedScript![decodedScript!.length - 1]).toBe(
        bitcoin.opcodes.OP_CHECKMULTISIG
      );
    });

    it("should create valid P2SH address", () => {
      const addresses = wallet.getAddresses();
      expect(addresses?.p2sh).toMatch(/^2/); // Testnet P2SH

      // Verify P2SH structure
      const p2sh = bitcoin.payments.p2sh({
        redeem: { output: wallet.getRedeemScript() },
        network: bitcoin.networks.testnet,
      });
      expect(addresses?.p2sh).toBe(p2sh.address);
    });

    it("should create valid P2WSH address", () => {
      const addresses = wallet.getAddresses();
      expect(addresses?.p2wsh).toMatch(/^tb1/); // Testnet P2WSH

      // Verify P2WSH structure
      const p2wsh = bitcoin.payments.p2wsh({
        redeem: { output: wallet.getRedeemScript() },
        network: bitcoin.networks.testnet,
      });
      expect(addresses?.p2wsh).toBe(p2wsh.address);
    });
  });

  describe("Key Management", () => {
    let wallet: typeof MultisigWallet.prototype;

    beforeEach(async () => {
      wallet = new MultisigWallet(2, 3);
      await wallet.generateWallet();
    });

    it("should generate valid public keys", () => {
      const publicKeys = wallet.getPublicKeys();
      publicKeys.forEach((pubKey) => {
        expect(ecc.isPoint(pubKey)).toBe(true);
        expect(pubKey.length).toBe(33); // Compressed public key
      });
    });

    it("should sort public keys for deterministic addresses", () => {
      const publicKeys = wallet.getPublicKeys();
      const sortedKeys = [...publicKeys].sort(Buffer.compare);
      expect(publicKeys).toEqual(sortedKeys);
    });
  });

  describe("Network Configuration", () => {
    it("should handle mainnet configuration", async () => {
      const wallet = new MultisigWallet(2, 3, {
        network: bitcoin.networks.bitcoin,
      });
      await wallet.generateWallet();

      const addresses = wallet.getAddresses();
      expect(addresses?.p2sh).toMatch(/^3/); // Mainnet P2SH
      expect(addresses?.p2wsh).toMatch(/^bc1/); // Mainnet P2WSH
    });
  });
});
