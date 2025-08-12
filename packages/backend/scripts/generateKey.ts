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

try {
  // Save the private key string to a .pem file
  fs.writeFileSync(privateKeyPath, privateKey, { encoding: 'utf8' })
  console.log(`✅ Private key saved to: ${privateKeyPath}`)

  // Save the public key string to a .pem file
  fs.writeFileSync(publicKeyPath, publicKey, { encoding: 'utf8' })
  console.log(`✅ Public key saved to: ${publicKeyPath}`)

  console.log('\n-----------------------------------------')
  console.log('         DUMMY KEY PAIR GENERATED        ')
  console.log('-----------------------------------------')
  console.log('Address:   ', newWallet.address)
  console.log('Public Key:', newWallet.publicKey)
  console.log('Private Key:', newWallet.privateKey)
  console.log('-----------------------------------------')
} catch (error) {
  console.error('❌ An error occurred while writing key files:', error)
}
