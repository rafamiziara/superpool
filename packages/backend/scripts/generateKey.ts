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
const contractsEnvPath = path.join(__dirname, '../../contracts/.env')

function updateContractsEnv(newPrivateKey: string): boolean {
  try {
    let envContent = ''
    
    // Check if .env file exists, if not create from template
    if (fs.existsSync(contractsEnvPath)) {
      envContent = fs.readFileSync(contractsEnvPath, 'utf8')
    } else {
      const templatePath = path.join(__dirname, '../../contracts/.env.template')
      if (fs.existsSync(templatePath)) {
        envContent = fs.readFileSync(templatePath, 'utf8')
        console.log('📋 Created .env from template')
      } else {
        throw new Error('Neither .env nor .env.template found in contracts package')
      }
    }

    // Remove 0x prefix from private key for .env
    const cleanPrivateKey = newPrivateKey.startsWith('0x') ? newPrivateKey.slice(2) : newPrivateKey

    // Update or add PRIVATE_KEY line
    const privateKeyRegex = /^PRIVATE_KEY=.*$/m
    if (privateKeyRegex.test(envContent)) {
      // Replace existing PRIVATE_KEY line
      envContent = envContent.replace(privateKeyRegex, `PRIVATE_KEY=${cleanPrivateKey}`)
    } else {
      // Add PRIVATE_KEY line after the warning comment or at the beginning
      const lines = envContent.split('\n')
      const insertIndex = lines.findIndex(line => line.includes('WARNING:')) + 1 || 0
      lines.splice(insertIndex, 0, `PRIVATE_KEY=${cleanPrivateKey}`)
      envContent = lines.join('\n')
    }

    // Write updated content back to .env file
    fs.writeFileSync(contractsEnvPath, envContent, 'utf8')
    return true
  } catch (error) {
    console.error('❌ Failed to update contracts .env file:', error)
    return false
  }
}

try {
  // Save the private key string to a .pem file
  fs.writeFileSync(privateKeyPath, privateKey, { encoding: 'utf8' })
  console.log(`✅ Private key saved to: ${privateKeyPath}`)

  // Save the public key string to a .pem file
  fs.writeFileSync(publicKeyPath, publicKey, { encoding: 'utf8' })
  console.log(`✅ Public key saved to: ${publicKeyPath}`)

  // Update contracts .env file
  const envUpdated = updateContractsEnv(privateKey)
  if (envUpdated) {
    console.log(`✅ Contracts .env updated: ${contractsEnvPath}`)
  }

  console.log('\n-----------------------------------------')
  console.log('      DEPLOYMENT WALLET GENERATED       ')
  console.log('-----------------------------------------')
  console.log('Address:       ', newWallet.address)
  console.log('Public Key:    ', newWallet.publicKey)
  console.log('Private Key:   ', newWallet.privateKey)
  console.log('\n📋 READY FOR CONTRACT DEPLOYMENT!')
  console.log('✅ Private key automatically added to contracts/.env')
  console.log('\n💰 GET TESTNET FUNDS:')
  console.log('🔗 https://faucet.polygon.technology/')
  console.log('📍 Send MATIC to:', newWallet.address)
  console.log('\n🚀 DEPLOY CONTRACTS:')
  console.log('cd packages/contracts && pnpm deploy:amoy')
  console.log('-----------------------------------------')
} catch (error) {
  console.error('❌ An error occurred while writing key files:', error)
}