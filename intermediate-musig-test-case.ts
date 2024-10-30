import * as bitcoin from "bitcoinjs-lib";
import { ECPairFactory } from "ecpair";
import * as tinysecp from "tiny-secp256k1";
import { MultisigWallet } from "./intermediate-musig-solution";

const ECPair = ECPairFactory(tinysecp);
const network = bitcoin.networks.testnet;

async function runTests() {
  console.log("Starting MultisigWallet Tests...\n");

  // Test 1: Create Wallet
  console.log("Test 1: Creating 2-of-3 Multisig Wallet");
  const keyPairs = [
    ECPair.makeRandom({ network }),
    ECPair.makeRandom({ network }),
    ECPair.makeRandom({ network }),
  ];
  const pubkeys = keyPairs.map((kp) => Buffer.from(kp.publicKey));

  try {
    const wallet = new MultisigWallet(2, pubkeys);
    const addresses = wallet.getAddresses();
    console.log("✓ Wallet created successfully");
    console.log("P2SH Address:", addresses.p2sh);
    console.log("P2WSH Address:", addresses.p2wsh);
    console.log("");

    // Test 2: Create Transaction
    console.log("Test 2: Creating Transaction");
    console.log(
      "redeemScript",
      Buffer.from(wallet.getRedeemScript()).toString("hex")
    );
    // Create a proper scriptPubKey for the test UTXO
    const p2wsh = bitcoin.payments.p2wsh({
      redeem: {
        output: wallet.getRedeemScript(),
        network,
      },
      network,
    });

    const utxos = [
      {
        txid: "7ea75da574ebdc8b399d96dd7c1b70742f58c86b52594d0e0a1a1c494652a447",
        vout: 0,
        value: BigInt(100000), // Convert to BigInt
        scriptPubKey: Buffer.from(p2wsh.output!).toString("hex"), // Convert Buffer to hex string
      },
    ];
    console.log("utxos", utxos);

    const outputs = [
      {
        address: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
        value: BigInt(50000), // Convert to BigInt
      },
    ];

    console.log("outputs", outputs);

    const fee = 1000; // This stays as number since we convert it in createTransaction

    const psbt = wallet.createTransaction(utxos, outputs, fee);
    console.log("psbt", psbt);
    console.log("✓ Transaction created successfully");
    console.log("");

    // Test 3: Sign Transaction
    console.log("Test 3: Signing Transaction");
    // Sign with first key
    const signed1 = wallet.signTransaction(psbt, keyPairs[0], 0);
    console.log("✓ First signature added:", signed1);

    // Sign with second key
    const signed2 = wallet.signTransaction(psbt, keyPairs[1], 0);
    console.log("✓ Second signature added:", signed2);
    console.log("");

    // Test 4: Verify and Finalize Transaction
    console.log("Test 4: Verifying and Finalizing Transaction");
    const isValid = wallet.verifyTransaction(psbt);
    console.log("✓ Transaction verification:", isValid);

    if (isValid) {
      const finalTx = wallet.finalizeTransaction(psbt);
      console.log("✓ Transaction finalized successfully");
      console.log("Final transaction hex:", finalTx);
    }
    console.log("");

    // Test 5: Error Cases
    console.log("Test 5: Testing Error Cases");
    try {
      // Try to sign with same key twice
      wallet.signTransaction(psbt, keyPairs[0], 0);
      console.log("✗ Expected error for duplicate signing");
    } catch (error) {
      console.log(
        "✓ Correctly caught duplicate signing error:",
        error instanceof Error ? error.message : error
      );
    }

    try {
      // Try to create wallet with more signatures than keys
      new MultisigWallet(4, pubkeys);
      console.log("✗ Expected error for invalid m-of-n configuration");
    } catch (error) {
      console.log(
        "✓ Correctly caught invalid m-of-n error:",
        error instanceof Error ? error.message : error
      );
    }
  } catch (error) {
    console.error("Test failed:", error);
  }
}

// Helper function to get testnet coins (for documentation)
function getTestnetCoins(address: string) {
  console.log(`
To fund the test wallet:
1. Save the P2WSH address: ${address}
2. Get testnet coins from a faucet:
   - https://testnet-faucet.mempool.co/
   - https://bitcoinfaucet.uo1.net/
   - https://coinfaucet.eu/en/btc-testnet/
3. Wait for transaction confirmation
4. Get UTXO information from:
   - https://blockstream.info/testnet/
   - https://mempool.space/testnet/
`);
}

// Run all tests
runTests()
  .then(() => {
    console.log("All tests completed!");
  })
  .catch((error) => {
    console.error("Test suite failed:", error);
  });

// Export for use in other files
export { runTests, getTestnetCoins };
