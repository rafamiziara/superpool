import { ethers } from 'ethers'
import { CreatePoolRequest } from '../functions/pools/createPool'

export interface ValidationResult {
  isValid: boolean
  errors: string[]
}

/**
 * Validate pool creation parameters
 */
export function validatePoolCreationParams(params: CreatePoolRequest): ValidationResult {
  const errors: string[] = []

  // Validate pool owner address
  if (!params.poolOwner) {
    errors.push('Pool owner address is required')
  } else if (!ethers.isAddress(params.poolOwner)) {
    errors.push('Pool owner must be a valid Ethereum address')
  }

  // Validate max loan amount
  if (!params.maxLoanAmount) {
    errors.push('Max loan amount is required')
  } else {
    try {
      const amount = ethers.parseEther(params.maxLoanAmount)
      if (amount <= 0) {
        errors.push('Max loan amount must be greater than 0')
      }
      // Check for reasonable upper bound (e.g., 1 million POL)
      if (amount > ethers.parseEther('1000000')) {
        errors.push('Max loan amount is too large (max: 1,000,000 POL)')
      }
    } catch {
      errors.push('Max loan amount must be a valid number')
    }
  }

  // Validate interest rate (basis points)
  if (params.interestRate === undefined || params.interestRate === null) {
    errors.push('Interest rate is required')
  } else if (typeof params.interestRate !== 'number' || isNaN(params.interestRate)) {
    errors.push('Interest rate is required')
  } else if (params.interestRate < 0) {
    errors.push('Interest rate cannot be negative')
  } else if (params.interestRate > 10000) {
    errors.push('Interest rate cannot exceed 100% (10000 basis points)')
  }

  // Validate loan duration (seconds)
  if (!params.loanDuration) {
    errors.push('Loan duration is required')
  } else if (typeof params.loanDuration !== 'number' || isNaN(params.loanDuration)) {
    errors.push('Loan duration is required')
  } else if (params.loanDuration < 3600) {
    errors.push('Loan duration must be at least 1 hour (3600 seconds)')
  } else if (params.loanDuration > 31536000) {
    errors.push('Loan duration cannot exceed 1 year (31536000 seconds)')
  }

  // Validate name
  if (!params.name) {
    errors.push('Pool name is required')
  } else if (params.name.length < 3) {
    errors.push('Pool name must be at least 3 characters long')
  } else if (params.name.length > 100) {
    errors.push('Pool name cannot exceed 100 characters')
  }

  // Validate description
  if (!params.description) {
    errors.push('Pool description is required')
  } else if (params.description.length < 10) {
    errors.push('Pool description must be at least 10 characters long')
  } else if (params.description.length > 1000) {
    errors.push('Pool description cannot exceed 1000 characters')
  }

  // Validate chain ID if provided
  if (params.chainId !== undefined) {
    const supportedChains = [80002, 137] // Polygon Amoy, Polygon Mainnet
    if (!supportedChains.includes(params.chainId)) {
      errors.push(`Unsupported chain ID: ${params.chainId}. Supported: ${supportedChains.join(', ')}`)
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  }
}

/**
 * Sanitize pool creation parameters
 */
export function sanitizePoolParams(params: CreatePoolRequest): Required<CreatePoolRequest> {
  return {
    poolOwner: params.poolOwner.toLowerCase(),
    maxLoanAmount: ethers.parseEther(params.maxLoanAmount).toString(),
    interestRate: Math.floor(params.interestRate), // Ensure integer
    loanDuration: Math.floor(params.loanDuration), // Ensure integer
    name: params.name.trim(),
    description: params.description.trim(),
    chainId: params.chainId || 80002 // Default to Polygon Amoy
  }
}

/**
 * Validate Ethereum address
 */
export function validateAddress(address: string): boolean {
  return ethers.isAddress(address)
}

/**
 * Validate transaction hash
 */
export function validateTransactionHash(hash: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(hash)
}

/**
 * Sanitize and validate numeric input
 */
export function sanitizeNumericInput(input: any, min?: number, max?: number): number {
  const num = Number(input)
  
  if (isNaN(num)) {
    throw new Error('Invalid numeric input')
  }
  
  if (min !== undefined && num < min) {
    throw new Error(`Value must be at least ${min}`)
  }
  
  if (max !== undefined && num > max) {
    throw new Error(`Value cannot exceed ${max}`)
  }
  
  return num
}

/**
 * Sanitize string input
 */
export function sanitizeStringInput(input: string, minLength?: number, maxLength?: number): string {
  if (typeof input !== 'string') {
    throw new Error('Input must be a string')
  }
  
  const sanitized = input.trim()
  
  if (minLength !== undefined && sanitized.length < minLength) {
    throw new Error(`String must be at least ${minLength} characters long`)
  }
  
  if (maxLength !== undefined && sanitized.length > maxLength) {
    throw new Error(`String cannot exceed ${maxLength} characters`)
  }
  
  return sanitized
}