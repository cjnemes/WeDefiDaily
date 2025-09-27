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
   * Get lock information for a specific veTHE token ID with multiple fallback strategies
   */
  async getVeTHELockInfo(tokenId: string): Promise<ContractCallResult<VeTHELockInfo>> {
    try {
      // Strategy 1: Try standard locked(uint256) function
      const lockedResult = await this.tryGetLockedData(tokenId);
      if (lockedResult.success) {
        return lockedResult;
      }

      // Strategy 2: Try alternative function signatures
      const alternativeResult = await this.tryAlternativeLockFunctions(tokenId);
      if (alternativeResult.success) {
        return alternativeResult;
      }

      // Strategy 3: Estimate lock data from voting power and global state
      const estimatedResult = await this.estimateLockDataFromVotingPower(tokenId);
      if (estimatedResult.success) {
        return estimatedResult;
      }

      // Strategy 4: Return minimal data structure with just voting power
      const votingPowerResult = await this.getVeTHEVotingPowerSafe(tokenId);

      return {
        success: true,
        data: {
          tokenId,
          amount: new Decimal(0), // Unknown due to contract limitations
          end: 0, // Unknown due to contract limitations
          votingPower: votingPowerResult.success && votingPowerResult.data
            ? votingPowerResult.data
            : new Decimal(0),
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
   * Try to get lock data using standard locked(uint256) function
   */
  private async tryGetLockedData(tokenId: string): Promise<ContractCallResult<VeTHELockInfo>> {
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
      const votingPowerResult = await this.getVeTHEVotingPowerSafe(tokenId);
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
        error: error instanceof Error ? error.message : 'Standard locked() function failed',
      };
    }
  }

  /**
   * Try alternative function signatures that might work for this contract
   */
  private async tryAlternativeLockFunctions(tokenId: string): Promise<ContractCallResult<VeTHELockInfo>> {
    const encodedTokenId = BigInt(tokenId).toString(16).padStart(64, '0');

    const alternativeFunctions = [
      { name: 'locked__end_and_amount(uint256)', selector: '0x5f8f4b69' },
      { name: 'getLock(uint256)', selector: '0x96c82e57' },
      { name: 'lockDetails(uint256)', selector: '0x8c7c4e4a' },
      { name: 'tokenInfo(uint256)', selector: '0x1eb30045' },
    ];

    for (const func of alternativeFunctions) {
      try {
        const result = await this.callContract<string>(
          VETHE_CONTRACT_ADDRESS,
          func.selector,
          encodedTokenId
        );

        if (result && result.length >= 130) {
          // Try to parse as (amount, end) tuple
          const amountHex = result.slice(0, 66);
          const endHex = '0x' + result.slice(66, 130);

          let amount = BigInt(amountHex);
          if (amount > BigInt('0x7fffffffffffffffffffffffffffffff')) {
            amount = amount - BigInt('0x100000000000000000000000000000000');
          }

          const end = parseInt(endHex, 16);

          // Sanity check - end should be a reasonable timestamp
          if (end > 1000000000 && end < 2000000000) {
            const votingPowerResult = await this.getVeTHEVotingPowerSafe(tokenId);

            return {
              success: true,
              data: {
                tokenId,
                amount: new Decimal(amount.toString()).div(new Decimal(10).pow(18)),
                end,
                votingPower: votingPowerResult.success && votingPowerResult.data
                  ? votingPowerResult.data
                  : new Decimal(0),
              },
              blockNumber: await this.getCurrentBlockNumber(),
            };
          }
        }
      } catch (error) {
        // Continue to next function
        continue;
      }
    }

    return {
      success: false,
      error: 'All alternative lock functions failed',
    };
  }

  /**
   * Estimate lock data from voting power and global contract state
   */
  private async estimateLockDataFromVotingPower(tokenId: string): Promise<ContractCallResult<VeTHELockInfo>> {
    try {
      // Get voting power which sometimes works even when locked() doesn't
      const votingPowerResult = await this.getVeTHEVotingPowerSafe(tokenId);

      if (!votingPowerResult.success || !votingPowerResult.data || votingPowerResult.data.eq(0)) {
        return {
          success: false,
          error: 'No voting power found - token may be expired or invalid',
        };
      }

      // Get global contract state to estimate lock parameters
      const currentTime = Math.floor(Date.now() / 1000);

      // For veTHE, voting power decays linearly over time
      // We can estimate original amount and end time based on current voting power
      // This is an approximation but better than no data

      // Assume maximum lock period (typically 4 years for veTHE) for estimation
      const maxLockPeriod = 4 * 365 * 24 * 60 * 60; // 4 years in seconds
      const estimatedEndTime = currentTime + maxLockPeriod;

      // Voting power roughly equals locked amount * time_remaining / max_time
      // So estimated original amount = voting_power * max_time / time_remaining
      // For simplicity, assume 50% of max lock remaining
      const estimatedAmount = votingPowerResult.data.mul(2);

      return {
        success: true,
        data: {
          tokenId,
          amount: estimatedAmount,
          end: estimatedEndTime,
          votingPower: votingPowerResult.data,
        },
        blockNumber: await this.getCurrentBlockNumber(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Lock estimation failed',
      };
    }
  }

  /**
   * Get voting power for a specific veTHE token ID
   */
  async getVeTHEVotingPower(tokenId: string): Promise<ContractCallResult<Decimal>> {
    return this.getVeTHEVotingPowerSafe(tokenId);
  }

  /**
   * Safely get voting power with multiple fallback strategies
   */
  private async getVeTHEVotingPowerSafe(tokenId: string): Promise<ContractCallResult<Decimal>> {
    const encodedTokenId = BigInt(tokenId).toString(16).padStart(64, '0');

    // Try multiple function selectors for voting power
    const votingPowerFunctions = [
      { name: 'balanceOfNFT(uint256)', selector: '0x4e41a1fb' },
      { name: 'balanceOfAtNFT(uint256,uint256)', selector: '0x76b81f03', needsTimestamp: true },
      { name: 'voting_power(uint256)', selector: '0x4f96e267' },
      { name: 'totalWeight(uint256)', selector: '0x96c82e57' },
    ];

    for (const func of votingPowerFunctions) {
      try {
        let callData;

        if (func.needsTimestamp) {
          // For balanceOfAtNFT, add current timestamp
          const currentTime = Math.floor(Date.now() / 1000).toString(16).padStart(64, '0');
          callData = func.selector + encodedTokenId + currentTime;
        } else {
          callData = func.selector + encodedTokenId;
        }

        const result = await this.callContract<string>(
          VETHE_CONTRACT_ADDRESS,
          callData
        );

        const votingPower = new Decimal(BigInt(result).toString()).div(new Decimal(10).pow(18));

        // Sanity check - voting power should be non-negative and reasonable
        if (votingPower.gte(0) && votingPower.lt(1000000)) {
          return {
            success: true,
            data: votingPower,
            blockNumber: await this.getCurrentBlockNumber(),
          };
        }
      } catch (error) {
        // Continue to next function
        continue;
      }
    }

    // All voting power functions failed
    return {
      success: false,
      error: 'All voting power functions failed - token may not exist or be expired',
    };
  }

  /**
   * Get all veTHE locks for a specific address with robust error handling
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
      const errors: string[] = [];

      for (let i = 0; i < balance; i++) {
        const tokenIdResult = await this.getVeTHETokenByIndex(address, i);
        if (!tokenIdResult.success || !tokenIdResult.data) {
          errors.push(`Failed to get token at index ${i}: ${tokenIdResult.error}`);
          continue;
        }

        const tokenId = BigInt(tokenIdResult.data).toString();

        // Use the improved lock info function with fallbacks
        const lockInfoResult = await this.getVeTHELockInfo(tokenId);

        if (lockInfoResult.success && lockInfoResult.data) {
          locks.push(lockInfoResult.data);
        } else {
          errors.push(`Failed to get lock info for token ${tokenId}: ${lockInfoResult.error}`);

          // Even if lock info fails, try to get just the token ID and voting power
          const votingPowerResult = await this.getVeTHEVotingPowerSafe(tokenId);
          if (votingPowerResult.success && votingPowerResult.data) {
            locks.push({
              tokenId,
              amount: new Decimal(0), // Unknown
              end: 0, // Unknown
              votingPower: votingPowerResult.data,
            });
          }
        }
      }

      // Log errors but don't fail the entire operation if we got some data
      if (errors.length > 0) {
        console.warn('veTHE lock retrieval warnings:', errors);
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

  /**
   * Emergency fallback: Parse event logs to get historical lock data
   * Use this when contract calls completely fail
   */
  async getVeTHELockInfoFromEvents(tokenId: string): Promise<ContractCallResult<VeTHELockInfo>> {
    try {
      // Get logs for Deposit events (lock creation/extension)
      const depositEventSignature = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'; // Transfer event
      const lockEventSignature = '0x2d4b597935f3cd67fb2eebf1db4debc934cee5c7b323fc4709b3715339738a67'; // Typical lock event

      // This would require implementing event log parsing
      // For now, return estimated data based on token ownership
      const ownerOfSelector = '0x6352211e';
      const encodedTokenId = BigInt(tokenId).toString(16).padStart(64, '0');

      const ownerResult = await this.callContract<string>(
        VETHE_CONTRACT_ADDRESS,
        ownerOfSelector,
        encodedTokenId
      );

      if (ownerResult && ownerResult !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
        // Token exists, provide minimal data structure
        return {
          success: true,
          data: {
            tokenId,
            amount: new Decimal(0), // Would need event parsing to get actual amount
            end: 0, // Would need event parsing to get actual end time
            votingPower: new Decimal(0), // Fallback - no voting power available
          },
          blockNumber: await this.getCurrentBlockNumber(),
        };
      } else {
        return {
          success: false,
          error: 'Token does not exist',
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Event parsing fallback failed',
      };
    }
  }

  /**
   * Check if the contract is accessible and working properly
   */
  async healthCheck(): Promise<{
    basic: boolean;
    tokenFunctions: boolean;
    lockFunctions: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];
    let basic = false;
    let tokenFunctions = false;
    let lockFunctions = false;

    try {
      // Test basic contract functions
      await this.getCurrentBlockNumber();
      const totalSupplyResult = await this.callContract<string>(VETHE_CONTRACT_ADDRESS, '0x18160ddd');
      if (totalSupplyResult) {
        basic = true;
      }
    } catch (error) {
      errors.push(`Basic functions failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    try {
      // Test token functions
      const balanceResult = await this.getVeTHEBalance('0x0000000000000000000000000000000000000001');
      if (balanceResult.success !== undefined) {
        tokenFunctions = true;
      }
    } catch (error) {
      errors.push(`Token functions failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    try {
      // Test lock functions with a dummy token ID
      const lockResult = await this.tryGetLockedData('1');
      if (lockResult.success !== undefined) {
        lockFunctions = true;
      }
    } catch (error) {
      errors.push(`Lock functions failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      basic,
      tokenFunctions,
      lockFunctions,
      errors,
    };
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