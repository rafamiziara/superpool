/**
 * Manual mock for ethers.js module
 *
 * This mock provides ethers.js functionality for testing using the centralized
 * EthersMock system. It exports all the mocked utilities and functions.
 */

// Create mock functions that behave like the actual ethers functions
// Note: jest is available globally in the test environment, so we don't need to import it

const isAddress = (address) => {
  return /^0x[a-fA-F0-9]{40}$/.test(address)
}

const parseEther = (value) => {
  return BigInt(Math.floor(parseFloat(value) * 1e18))
}

const getAddress = (address) => {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error('Invalid address')
  }
  return address.toLowerCase()
}

const formatEther = (value) => {
  return (Number(value) / 1e18).toString()
}

const parseUnits = (value, decimals) => {
  const decimalsNum = typeof decimals === 'string' ? 18 : decimals
  return BigInt(Math.floor(parseFloat(value) * Math.pow(10, decimalsNum)))
}

const formatUnits = (value, decimals) => {
  return (Number(value) / Math.pow(10, decimals)).toString()
}

// Export all ethers utilities with proper mocking
// The module exports both named exports and an ethers object
module.exports = {
  // Named exports for direct usage
  isAddress,
  parseEther,
  getAddress,
  formatEther,
  parseUnits,
  formatUnits,

  // Provider and contract constructors
  JsonRpcProvider: function () {
    return {}
  },
  Wallet: function () {
    return {}
  },
  Contract: function () {
    return {}
  },

  // The main ethers object (for destructured imports like { ethers })
  ethers: {
    isAddress,
    parseEther,
    getAddress,
    formatEther,
    parseUnits,
    formatUnits,
    JsonRpcProvider: function () {
      return {}
    },
    Wallet: function () {
      return {}
    },
    Contract: function () {
      return {}
    },
  },

  // Version for compatibility
  version: '6.15.0',
}
