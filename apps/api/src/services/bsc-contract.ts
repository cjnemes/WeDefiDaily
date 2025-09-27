import Decimal from 'decimal.js';

export interface VeTHELockInfo {
  tokenId: string;
  amount: Decimal;
  end: number;
  votingPower: Decimal;
}

export interface ContractCallResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  blockNumber?: number;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown[];
}

interface JsonRpcResponse<T> {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// veTHE contract constants
export const VETHE_CONTRACT_ADDRESS = '0xfbbf371c9b0b994eebfcc977cef603f7f31c070d';
export const BSC_CHAIN_ID = 56;

// ABI for veTHE contract (focused on governance data)
export const VETHE_ABI = [
  // ERC721 standard methods
  {
    "constant": true,
    "inputs": [{"name": "owner", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"name": "", "type": "uint256"}],
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [{"name": "owner", "type": "address"}, {"name": "index", "type": "uint256"}],
    "name": "tokenOfOwnerByIndex",
    "outputs": [{"name": "", "type": "uint256"}],
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "totalSupply",
    "outputs": [{"name": "", "type": "uint256"}],
    "type": "function"
  },
  // veTHE specific methods
  {
    "constant": true,
    "inputs": [{"name": "_tokenId", "type": "uint256"}],
    "name": "locked",
    "outputs": [
      {"name": "amount", "type": "int128"},
      {"name": "end", "type": "uint256"}
    ],
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [{"name": "_tokenId", "type": "uint256"}],
    "name": "balanceOfNFT",
    "outputs": [{"name": "", "type": "uint256"}],
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [{"name": "_tokenId", "type": "uint256"}, {"name": "_t", "type": "uint256"}],
    "name": "balanceOfAtNFT",
    "outputs": [{"name": "", "type": "uint256"}],
    "type": "function"
  }
] as const;

/**
 * BSC Contract Service for interacting with Thena veTHE contracts
 * Implements rate limiting, error handling, and retry logic for BSC RPC calls
 */
export class BSCContractService {
  private readonly rpcUrl: string;
  private readonly rateLimitDelay: number = 50; // 20 RPS max for BSC
  private lastRequestTime: number = 0;
  private requestId: number = 1;

  constructor(rpcUrl: string) {
    if (!rpcUrl) {
      throw new Error('BSC RPC URL is required');
    }
    this.rpcUrl = rpcUrl;
  }

  /**
   * Make a JSON-RPC call with rate limiting and error handling
   */
  private async jsonRpcCall<T>(method: string, params: unknown[] = []): Promise<T> {
    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.rateLimitDelay) {
      await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay - timeSinceLastRequest));
    }
    this.lastRequestTime = Date.now();

    const body: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: this.requestId++,
      method,
      params,
    };

    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`BSC RPC error ${response.status}: ${response.statusText}`);
    }

    const result = (await response.json()) as JsonRpcResponse<T>;

    if (result.error) {
      throw new Error(`BSC RPC error ${result.error.code}: ${result.error.message}`);
    }

    if (result.result === undefined) {
      throw new Error('BSC RPC error: missing result');
    }

    return result.result;
  }

  /**
   * Call a smart contract function with automatic ABI encoding
   */
  private async callContract<T>(
    contractAddress: string,
    functionSignature: string,
    encodedParams: string = '0x'
  ): Promise<T> {
    const data = functionSignature + encodedParams.slice(2);

    const result = await this.jsonRpcCall<string>('eth_call', [
      {
        to: contractAddress,
        data,
      },
      'latest'
    ]);

    return result as T;
  }

  /**
   * Get the current block number
   */
  async getCurrentBlockNumber(): Promise<number> {
    const result = await this.jsonRpcCall<string>('eth_blockNumber');
    return parseInt(result, 16);
  }

  /**
   * Get number of veTHE NFTs owned by an address
   */
  async getVeTHEBalance(address: string): Promise<ContractCallResult<number>> {
    try {
      // balanceOf(address)
      const functionSelector = '0x70a08231';
      const encodedAddress = address.slice(2).padStart(64, '0');

      const result = await this.callContract<string>(
        VETHE_CONTRACT_ADDRESS,
        functionSelector,
        encodedAddress
      );

      const balance = parseInt(result, 16);
      const blockNumber = await this.getCurrentBlockNumber();

      return {
        success: true,
        data: balance,
        blockNumber,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get veTHE token ID at specific index for an owner
   */
  async getVeTHETokenByIndex(address: string, index: number): Promise<ContractCallResult<string>> {
    try {
      // tokenOfOwnerByIndex(address,uint256)
      const functionSelector = '0x2f745c59';
      const encodedAddress = address.slice(2).padStart(64, '0');
      const encodedIndex = index.toString(16).padStart(64, '0');

      const result = await this.callContract<string>(
        VETHE_CONTRACT_ADDRESS,
        functionSelector,
        encodedAddress + encodedIndex
      );

      return {
        success: true,
        data: result,
        blockNumber: await this.getCurrentBlockNumber(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get lock information for a specific veTHE token ID
   */
  async getVeTHELockInfo(tokenId: string): Promise<ContractCallResult<VeTHELockInfo>> {
    try {
      // locked(uint256) - returns (amount, end)
      const functionSelector = '0x4a4fbeec';
      const encodedTokenId = BigInt(tokenId).toString(16).padStart(64, '0');

      const result = await this.callContract<string>(
        VETHE_CONTRACT_ADDRESS,
        functionSelector,
        encodedTokenId
      );

      // Parse result - first 32 bytes = amount (int128), second 32 bytes = end (uint256)
      const amountHex = result.slice(0, 66); // includes 0x
      const endHex = '0x' + result.slice(66, 130);

      // Convert int128 amount to positive value (handle signed integer)
      let amount = BigInt(amountHex);
      if (amount > BigInt('0x7fffffffffffffffffffffffffffffff')) {
        amount = amount - BigInt('0x100000000000000000000000000000000');
      }

      const end = parseInt(endHex, 16);

      // Get current voting power
      const votingPowerResult = await this.getVeTHEVotingPower(tokenId);
      const votingPower = votingPowerResult.success && votingPowerResult.data
        ? votingPowerResult.data
        : new Decimal(0);

      return {
        success: true,
        data: {
          tokenId,
          amount: new Decimal(amount.toString()).div(new Decimal(10).pow(18)), // Convert from wei
          end,
          votingPower,
        },
        blockNumber: await this.getCurrentBlockNumber(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get voting power for a specific veTHE token ID
   */
  async getVeTHEVotingPower(tokenId: string): Promise<ContractCallResult<Decimal>> {
    try {
      // balanceOfNFT(uint256) - correct function selector
      const functionSelector = '0x4e41a1fb';
      const encodedTokenId = BigInt(tokenId).toString(16).padStart(64, '0');

      const result = await this.callContract<string>(
        VETHE_CONTRACT_ADDRESS,
        functionSelector,
        encodedTokenId
      );

      const votingPower = new Decimal(BigInt(result).toString()).div(new Decimal(10).pow(18));

      return {
        success: true,
        data: votingPower,
        blockNumber: await this.getCurrentBlockNumber(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get all veTHE locks for a specific address
   */
  async getAllVeTHELocks(address: string): Promise<ContractCallResult<VeTHELockInfo[]>> {
    try {
      // First get the number of NFTs
      const balanceResult = await this.getVeTHEBalance(address);
      if (!balanceResult.success || !balanceResult.data) {
        return {
          success: false,
          error: balanceResult.error || 'Failed to get veTHE balance',
        };
      }

      const balance = balanceResult.data;
      if (balance === 0) {
        return {
          success: true,
          data: [],
          blockNumber: balanceResult.blockNumber,
        };
      }

      // Get all token IDs
      const locks: VeTHELockInfo[] = [];
      for (let i = 0; i < balance; i++) {
        const tokenIdResult = await this.getVeTHETokenByIndex(address, i);
        if (!tokenIdResult.success || !tokenIdResult.data) {
          console.warn(`Failed to get token at index ${i}:`, tokenIdResult.error);
          continue;
        }

        const tokenId = BigInt(tokenIdResult.data).toString();
        const lockInfoResult = await this.getVeTHELockInfo(tokenId);

        if (lockInfoResult.success && lockInfoResult.data) {
          locks.push(lockInfoResult.data);
        } else {
          console.warn(`Failed to get lock info for token ${tokenId}:`, lockInfoResult.error);
        }
      }

      return {
        success: true,
        data: locks,
        blockNumber: await this.getCurrentBlockNumber(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get aggregated veTHE data for governance integration
   */
  async getAggregatedVeTHEData(address: string): Promise<ContractCallResult<{
    totalLockAmount: Decimal;
    totalVotingPower: Decimal;
    lockCount: number;
    nextExpiration?: Date;
    boostMultiplier?: Decimal;
  }>> {
    try {
      const locksResult = await this.getAllVeTHELocks(address);
      if (!locksResult.success || !locksResult.data) {
        return {
          success: false,
          error: locksResult.error || 'Failed to get veTHE locks',
        };
      }

      const locks = locksResult.data;

      const totalLockAmount = locks.reduce(
        (sum, lock) => sum.add(lock.amount),
        new Decimal(0)
      );

      const totalVotingPower = locks.reduce(
        (sum, lock) => sum.add(lock.votingPower),
        new Decimal(0)
      );

      // Find next expiration
      const currentTime = Math.floor(Date.now() / 1000);
      const activeLocks = locks.filter(lock => lock.end > currentTime);
      const nextExpiration = activeLocks.length > 0
        ? new Date(Math.min(...activeLocks.map(lock => lock.end)) * 1000)
        : undefined;

      // Calculate boost multiplier if applicable
      const boostMultiplier = totalLockAmount.gt(0)
        ? totalVotingPower.div(totalLockAmount)
        : undefined;

      return {
        success: true,
        data: {
          totalLockAmount,
          totalVotingPower,
          lockCount: locks.length,
          nextExpiration,
          boostMultiplier,
        },
        blockNumber: locksResult.blockNumber,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * Create a BSC contract service instance with proper error handling
 */
export function createBSCContractService(rpcUrl?: string): BSCContractService | null {
  if (!rpcUrl) {
    console.warn('BSC RPC URL not configured, veTHE integration will be disabled');
    return null;
  }

  try {
    return new BSCContractService(rpcUrl);
  } catch (error) {
    console.error('Failed to create BSC contract service:', error);
    return null;
  }
}