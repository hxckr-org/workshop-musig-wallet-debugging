import * as bitcoin from 'bitcoinjs-lib';
import * as bip39 from 'bip39';
import { AdvancedMultisigWallet } from './advanced-musig';

describe('AdvancedMultisigWallet', () => {
  describe('Wallet Creation', () => {
    it('should create a valid 2-of-3 multisig wallet', async () => {
      const wallet = new AdvancedMultisigWallet(2, 3);
      await wallet.generateWallet();
      
      const addresses = wallet.getAddresses();
      expect(addresses.p2sh).toBeTruthy();
      expect(addresses.p2wsh).toBeTruthy();
      expect(addresses.p2sh).toMatch(/^2/); // Testnet P2SH starts with 2
      expect(addresses.p2wsh).toMatch(/^tb1/); // Testnet P2WSH starts with tb1
    });

    it('should generate correct number of mnemonics', async () => {
      const wallet = new AdvancedMultisigWallet(2, 3);
      await wallet.generateWallet();
      
      const mnemonics = wallet.getMnemonics();
      expect(mnemonics).toHaveLength(3);
      mnemonics.forEach(mnemonic => {
        expect(mnemonic.split(' ')).toHaveLength(24); // 256-bit security
        expect(bip39.validateMnemonic(mnemonic)).toBe(true);
      });
    });

    it('should generate correct derivation paths', async () => {
      const wallet = new AdvancedMultisigWallet(2, 3);
      await wallet.generateWallet();
      
      const paths = wallet.getDerivationPaths();
      expect(paths).toHaveLength(3);
      paths.forEach((path, index) => {
        expect(path).toBe(`m/44'/0'/0'/0/${index}`);
      });
    });

    it('should throw error for invalid signature requirements', () => {
      expect(() => new AdvancedMultisigWallet(3, 2)).toThrow('Invalid signature requirements');
      expect(() => new AdvancedMultisigWallet(0, 3)).toThrow('Invalid signature requirements');
      expect(() => new AdvancedMultisigWallet(-1, 3)).toThrow('Invalid signature requirements');
    });
  });

  describe('Custom Configuration', () => {
    it('should accept custom network configuration', async () => {
      const wallet = new AdvancedMultisigWallet(2, 3, {
        network: bitcoin.networks.bitcoin // Mainnet
      });
      await wallet.generateWallet();
      
      const addresses = wallet.getAddresses();
      expect(addresses.p2sh).toMatch(/^3/); // Mainnet P2SH starts with 3
      expect(addresses.p2wsh).toMatch(/^bc1/); // Mainnet P2WSH starts with bc1
    });

    it('should accept custom derivation path', async () => {
      const customPath = "m/48'/0'/0'/2'"; // BIP48 multisig path
      const wallet = new AdvancedMultisigWallet(2, 3, {
        derivationPath: customPath
      });
      await wallet.generateWallet();
      
      const paths = wallet.getDerivationPaths();
      paths.forEach((path, index) => {
        expect(path).toBe(`${customPath}/${index}`);
      });
    });
  });

  describe('Mnemonic Recovery', () => {
    let wallet: AdvancedMultisigWallet;
    let originalMnemonics: string[];

    beforeEach(async () => {
      wallet = new AdvancedMultisigWallet(2, 3);
      await wallet.generateWallet();
      originalMnemonics = wallet.getMnemonics();
    });

    it('should recover correct key pair from mnemonic', async () => {
      const index = 0;
      const mnemonic = originalMnemonics[index];
      
      const recoveredKeyPair = await wallet.restoreFromMnemonic(mnemonic, index);
      
      expect(recoveredKeyPair.mnemonic).toBe(mnemonic);
      expect(recoveredKeyPair.path).toBe(`m/44'/0'/0'/0/${index}`);
      expect(recoveredKeyPair.publicKey).toBeTruthy();
      expect(recoveredKeyPair.privateKey).toBeTruthy();
    });

    it('should throw error for invalid mnemonic', async () => {
      const invalidMnemonic = 'invalid mnemonic phrase here';
      await expect(wallet.restoreFromMnemonic(invalidMnemonic, 0))
        .rejects
        .toThrow('Invalid mnemonic');
    });

    it('should throw error for invalid index', async () => {
      const mnemonic = originalMnemonics[0];
      await expect(async () => {
        await wallet.restoreFromMnemonic(mnemonic, 5);
      }).rejects.toThrow('Invalid signer index');
    });
  });

  describe('Wallet State', () => {
    it('should throw error when accessing addresses before initialization', () => {
      const wallet = new AdvancedMultisigWallet(2, 3);
      expect(() => wallet.getAddresses())
        .toThrow('Wallet not initialized. Call generateWallet() first.');
    });

    it('should maintain consistent addresses after initialization', async () => {
      const wallet = new AdvancedMultisigWallet(2, 3);
      await wallet.generateWallet();
      
      const addresses1 = wallet.getAddresses();
      const addresses2 = wallet.getAddresses();
      
      expect(addresses1).toEqual(addresses2);
    });
  });
}); 