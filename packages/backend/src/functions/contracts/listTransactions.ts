import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import { createContractService } from '../../services/ContractService'
import { handleError } from '../../utils/errorHandling'

export interface ListTransactionsRequest {
  status?: string
  page?: number
  limit?: number
  createdBy?: string
  chainId?: number
}

export interface TransactionSummary {
  transactionId: string
  status: string
  currentSignatures: number
  requiredSignatures: number
  readyToExecute: boolean
  description: string
  createdAt: string
  updatedAt: string
  executedAt?: string
  createdBy?: string
  metadata?: any
}

export interface ListTransactionsResponse {
  success: boolean
  transactions: TransactionSummary[]
  totalCount: number
  page: number
  limit: number
  hasNextPage: boolean
  hasPreviousPage: boolean
  message: string
}

/**
 * Cloud Function to list Safe transactions with filtering and pagination
 *
 * @param request - The callable request with filtering options
 * @returns Paginated list of transactions
 */
export const listTransactions = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true,
    region: 'us-central1',
  },
  async (request: CallableRequest<ListTransactionsRequest>): Promise<ListTransactionsResponse> => {
    const functionName = 'listTransactions'
    logger.info(`${functionName}: Listing Safe transactions`, {
      uid: request.auth?.uid,
      params: request.data,
    })

    try {
      // 1. Authentication check (optional - public read access)
      // Note: Some organizations may want to restrict this to authenticated users only

      // 2. Parse and validate parameters
      const page = Math.max(1, request.data.page || 1)
      const limit = Math.min(50, Math.max(1, request.data.limit || 20))
      const status = request.data.status
      const createdBy = request.data.createdBy
      const chainId = request.data.chainId || 80002

      // Validate status filter if provided
      const validStatuses = ['pending_signatures', 'ready_to_execute', 'executing', 'completed', 'failed', 'expired']
      if (status && !validStatuses.includes(status)) {
        throw new HttpsError('invalid-argument', `Invalid status filter. Valid values: ${validStatuses.join(', ')}`)
      }

      // 3. Initialize ContractService
      const contractService = createContractService(chainId)

      // 4. Build query options
      const options = {
        status,
        limit,
        offset: (page - 1) * limit,
        createdBy,
      }

      // 5. Get transactions
      const { transactions, total } = await contractService.listTransactions(options)

      // 6. Format transactions for response
      const formattedTransactions: TransactionSummary[] = transactions.map((tx) => ({
        transactionId: tx.id,
        status: tx.status,
        currentSignatures: tx.currentSignatures,
        requiredSignatures: tx.requiredSignatures,
        readyToExecute: tx.currentSignatures >= tx.requiredSignatures && tx.status === 'ready_to_execute',
        description: tx.description,
        createdAt: tx.createdAt.toISOString(),
        updatedAt: tx.updatedAt.toISOString(),
        executedAt: tx.executedAt?.toISOString(),
        metadata: tx.metadata,
      }))

      // 7. Calculate pagination metadata
      const hasNextPage = (page - 1) * limit + transactions.length < total
      const hasPreviousPage = page > 1

      logger.info(`${functionName}: Transactions retrieved`, {
        count: transactions.length,
        totalCount: total,
        page,
        limit,
        status,
      })

      return {
        success: true,
        transactions: formattedTransactions,
        totalCount: total,
        page,
        limit,
        hasNextPage,
        hasPreviousPage,
        message: `Retrieved ${transactions.length} transaction(s) from ${total} total`,
      }
    } catch (error) {
      logger.error(`${functionName}: Error listing transactions`, {
        error: error instanceof Error ? error.message : String(error),
        uid: request.auth?.uid,
      })

      return handleError(error, functionName)
    }
  }
)
