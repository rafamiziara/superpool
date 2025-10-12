import { ethers } from 'ethers'
import fs from 'fs'
import path from 'path'

// Generate a new random wallet
const newWallet = ethers.Wallet.createRandom()

// Get the private key string
const privateKey = newWallet.privateKey

// Get the public key. The 'publicKey' property is the uncompressed public key.
const publicKey = newWallet.publicKey

// The public key in PEM format is usually derived from the private key.
// ethers.js provides the full public key, but for signature verification,
// we often just need the raw public key string.
// Let's save the public key in a format that our backend can use.

const privateKeyPath = path.join(__dirname, 'privateKey.pem')
const publicKeyPath = path.join(__dirname, 'publicKey.pem')
const walletInfoPath = path.join(__dirname, 'wallet-info.json')

try {
  // Save the private key string to a .pem file
  fs.writeFileSync(privateKeyPath, privateKey, { encoding: 'utf8' })
  console.log(`✅ Private key saved to: ${privateKeyPath}`)

  // Save the public key string to a .pem file
  fs.writeFileSync(publicKeyPath, publicKey, { encoding: 'utf8' })
  console.log(`✅ Public key saved to: ${publicKeyPath}`)

  // Save all wallet information to scripts directory
  const walletInfo = {
    address: newWallet.address,
    publicKey: newWallet.publicKey,
    privateKey: newWallet.privateKey,
    mnemonic: newWallet.mnemonic?.phrase || null,
    generatedAt: new Date().toISOString(),
    network: 'polygon-amoy-testnet',
  }

  fs.writeFileSync(walletInfoPath, JSON.stringify(walletInfo, null, 2), { encoding: 'utf8' })
  console.log(`✅ Wallet info saved to: ${walletInfoPath}`)

  console.log('\n-----------------------------------------')
  console.log('   BACKEND TESTING WALLET GENERATED    ')
  console.log('-----------------------------------------')
  console.log('Address:       ', newWallet.address)
  console.log('Public Key:    ', newWallet.publicKey)
  console.log('Private Key:   ', newWallet.privateKey)
  console.log('Mnemonic:      ', newWallet.mnemonic?.phrase || 'N/A')
  console.log('Generated:     ', new Date().toISOString())
  console.log('\n📋 READY FOR BACKEND TESTING!')
  console.log('✅ Keys saved to backend/scripts/')
  console.log('✅ Use "pnpm signMessage <nonce> <timestamp>" to sign test messages')
  console.log('\n💰 GET TESTNET FUNDS (if needed):')
  console.log('🔗 https://faucet.polygon.technology/')
  console.log('📍 Send POL to:', newWallet.address)
  console.log('-----------------------------------------')
} catch (error) {
  console.error('❌ An error occurred while writing key files:', error)
}
