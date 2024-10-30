// import * as bitcoin from 'bitcoinjs-lib';
// import { ECPairFactory } from 'ecpair';
// import * as tinysecp from 'tiny-secp256k1';

// const ECPair = ECPairFactory(tinysecp);
// const network = bitcoin.networks.testnet;

// interface UTXO {
//     txid: string;
//     vout: number;
//     value: number;
//     scriptPubKey: string;
// }

// interface Output {
//     address: string;
//     value: number;
// }

// class BrokenMultisigWallet {
//     private m: number;                    // Required signatures
//     private n: number;                    // Total signers
//     private pubkeys: Buffer[];            // Ordered public keys
//     private redeemScript: Buffer;
//     private p2shAddress: string;
//     private p2wshAddress: string;

//     constructor(
//         requiredSigs: number,
//         publicKeys: Buffer[],
//     ) {
//         // BUG 1: Missing validation of m <= n
//         this.m = requiredSigs;
//         this.n = publicKeys.length;
//         this.pubkeys = publicKeys;

//         // BUG 2: Incorrect redeem script creation - not sorting pubkeys
//         this.redeemScript = this.createRedeemScript();
        
//         // BUG 3: Incorrect P2SH derivation
//         const p2sh = bitcoin.payments.p2sh({
//             redeem: {
//                 output: this.redeemScript,
//                 network
//             },
//             network
//         });
        
//         // BUG 4: Incorrect P2WSH creation - using wrong witness program
//         const p2wsh = bitcoin.payments.p2wsh({
//             redeem: {
//                 output: this.redeemScript,
//                 network
//             },
//             network
//         });

//         this.p2shAddress = p2sh.address!;
//         this.p2wshAddress = p2wsh.address!;
//     }

//     private createRedeemScript(): Buffer {
//         // BUG 5: Incorrect OP_M implementation
//         const script = bitcoin.script.compile([
//             bitcoin.script.number.encode(this.m),
//             ...this.pubkeys,
//             bitcoin.script.number.encode(this.n),
//             bitcoin.opcodes.OP_CHECKMULTISIG
//         ]);
//         return script;
//     }

//     public getAddresses() {
//         return {
//             p2sh: this.p2shAddress,
//             p2wsh: this.p2wshAddress
//         };
//     }

//     public createTransaction(utxos: UTXO[], outputs: Output[], fee: number) {
//         // BUG 6: Missing input amount validation
//         const psbt = new bitcoin.Psbt({ network });
        
//         // Add inputs
//         utxos.forEach(utxo => {
//             // BUG 7: Incorrect input script handling
//             psbt.addInput({
//                 hash: utxo.txid,
//                 index: utxo.vout,
//                 witnessUtxo: {
//                     script: Buffer.from(utxo.scriptPubKey, 'hex'),
//                     value: utxo.value,
//                 },
//                 redeemScript: this.redeemScript
//             });
//         });

//         // Add outputs
//         outputs.forEach(output => {
//             psbt.addOutput({
//                 address: output.address,
//                 value: output.value,
//             });
//         });

//         return psbt;
//     }

//     public signTransaction(psbt: bitcoin.Psbt, keyPair: bitcoin.ECPairInterface, inputIndex: number) {
//         // BUG 8: No validation if signer is part of multisig
//         try {
//             // BUG 9: Wrong sighash type
//             psbt.signInput(inputIndex, keyPair, [bitcoin.Transaction.SIGHASH_NONE]);
//             return true;
//         } catch (error) {
//             console.error('Signing error:', error);
//             return false;
//         }
//     }

//     public finalizeTransaction(psbt: bitcoin.Psbt): string {
//         try {
//             // BUG 10: No validation of signature count
//             // BUG 11: No validation of duplicate signatures
//             psbt.finalizeAllInputs();
            
//             const tx = psbt.extractTransaction();
//             return tx.toHex();
//         } catch (error) {
//             throw new Error(`Transaction finalization failed: ${error}`);
//         }
//     }

//     // Helper to verify transaction (broken implementation)
//     public verifyTransaction(psbt: bitcoin.Psbt): boolean {
//         // BUG 12: Incorrect signature verification
//         const inputs = psbt.data.inputs;
//         let sigCount = 0;

//         inputs.forEach(input => {
//             if (input.partialSig) {
//                 // BUG 13: Counting signatures without verifying them
//                 sigCount += input.partialSig.length;
//             }
//         });

//         // BUG 14: Wrong signature threshold check
//         return sigCount >= this.m - 1;
//     }
// }

// // Example usage and test setup
// function createTestWallet() {
//     const keyPairs = [
//         ECPair.makeRandom({ network }),
//         ECPair.makeRandom({ network }),
//         ECPair.makeRandom({ network })
//     ];

//     const pubkeys = keyPairs.map(kp => kp.publicKey);
    
//     // BUG 15: Allowing more required signatures than signers
//     const wallet = new BrokenMultisigWallet(4, pubkeys);
    
//     return {
//         wallet,
//         keyPairs
//     };
// }

// export { BrokenMultisigWallet, createTestWallet };