import { ethers } from 'ethers';
import { Decimal } from 'decimal.js';

/**
 * Aerodrome Finance veAERO (Vote Escrow) Contract Service
 *
 * Provides live blockchain integration for fetching veAERO NFT position data
 * directly from the Base chain, replacing stale subgraph dependencies.
 */

export interface VeAeroPosition {
  tokenId: string;
  owner: string;
  locked: {
    amount: Decimal;
    end: number; // Unix timestamp
  };
  votingPower: Decimal;
  delegatedTo?: string;
  isPermanent: boolean;
}

export interface AggregatedVeAeroData {
  totalLockAmount: Decimal;
  totalVotingPower: Decimal;
  nextExpiration?: Date;
  boostMultiplier: Decimal;
  positionCount: number;
  positions: VeAeroPosition[];
}

export interface VeAeroContractHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  details: {
    responseTimeMs: number;
    blockNumber?: number;
    contractAddress: string;
    error?: string;
  };
}

// Standard VotingEscrow ABI based on veNFT implementations (Velodrome/Aerodrome pattern)
const VEAERO_ABI = [
  // ERC-721 standard methods
  {
    "inputs": [{"type": "address", "name": "owner"}],
    "name": "balanceOf",
    "outputs": [{"type": "uint256", "name": ""}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"type": "address", "name": "owner"}, {"type": "uint256", "name": "index"}],
    "name": "tokenOfOwnerByIndex",
    "outputs": [{"type": "uint256", "name": ""}],
    "stateMutability": "view",
    "type": "function"
  },
  // VotingEscrow specific methods
  {
    "inputs": [{"type": "uint256", "name": "tokenId"}],
    "name": "locked",
    "outputs": [
      {"type": "int128", "name": "amount"},
      {"type": "uint256", "name": "end"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"type": "uint256", "name": "tokenId"}],
    "name": "balanceOfNFT",
    "outputs": [{"type": "uint256", "name": ""}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"type": "address", "name": "account"}],
    "name": "getVotes",
    "outputs": [{"type": "uint256", "name": ""}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"type": "uint256", "name": "tokenId"}],
    "name": "ownerOf",
    "outputs": [{"type": "address", "name": ""}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"type": "uint256", "name": "tokenId"}],
    "name": "delegates",
    "outputs": [{"type": "address", "name": ""}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"type": "uint256", "name": "tokenId"}],
    "name": "isPermanentLocked",
    "outputs": [{"type": "bool", "name": ""}],
    "stateMutability": "view",
    "type": "function"
  }
];

export class VeAeroContractService {
  private readonly contract: ethers.Contract;
  private readonly provider: ethers.JsonRpcProvider;
  private readonly VEAERO_CONTRACT_ADDRESS = '0xebf418fe2512e7e6bd9b87a8f0f294acdc67e6b4';
  private readonly AERO_DECIMALS = 18;

  constructor(rpcUrl: string) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.contract = new ethers.Contract(
      this.VEAERO_CONTRACT_ADDRESS,
      VEAERO_ABI,
      this.provider
    );
  }

  /**
   * Get aggregated veAERO data for a user address
   * This is the main method that replaces the subgraph integration
   */
  async getAggregatedVeAeroData(userAddress: string): Promise<{
    success: boolean;
    data?: AggregatedVeAeroData;
    error?: string;
  }> {
    try {
      const startTime = Date.now();

      // Validate address format and handle edge cases
      if (!userAddress || userAddress === ethers.ZeroAddress) {
        return {
          success: true,
          data: {
            totalLockAmount: new Decimal(0),
            totalVotingPower: new Decimal(0),
            boostMultiplier: new Decimal(0),
            positionCount: 0,
            positions: []
          }
        };
      }

      // Ensure valid ethereum address format
      if (!ethers.isAddress(userAddress)) {
        return {
          success: false,
          error: `Invalid ethereum address format: ${userAddress}`
        };
      }

      // Get all NFT token IDs owned by the user
      const balance = await this.contract.balanceOf(userAddress);
      const tokenCount = parseInt(balance.toString());

      if (tokenCount === 0) {
        return {
          success: true,
          data: {
            totalLockAmount: new Decimal(0),
            totalVotingPower: new Decimal(0),
            boostMultiplier: new Decimal(0),
            positionCount: 0,
            positions: []
          }
        };
      }

      // Fetch all positions in parallel for efficiency
      const positionPromises: Promise<VeAeroPosition>[] = [];

      for (let i = 0; i < tokenCount; i++) {
        positionPromises.push(this.getPositionByIndex(userAddress, i));
      }

      const positions = await Promise.all(positionPromises);
      const validPositions = positions.filter(p => p.locked.amount.greaterThan(0));

      // Aggregate data
      const aggregated = this.aggregatePositions(validPositions);

      const responseTime = Date.now() - startTime;
      console.log(`✓ Fetched veAERO data for ${userAddress}: ${aggregated.totalLockAmount.toString()} AERO locked (${responseTime}ms)`);

      return {
        success: true,
        data: aggregated
      };

    } catch (error) {
      console.error(`Failed to fetch veAERO data for ${userAddress}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get a specific veAERO position by user address and index
   */
  private async getPositionByIndex(userAddress: string, index: number): Promise<VeAeroPosition> {
    try {
      const tokenId = await this.contract.tokenOfOwnerByIndex(userAddress, index);
      const tokenIdStr = tokenId.toString();

      // Fetch position data in parallel with error handling
      const [lockedData, votingPower, delegatedTo, isPermanent] = await Promise.all([
        this.contract.locked(tokenId),
        this.contract.balanceOfNFT(tokenId),
        this.contract.delegates(tokenId).catch(() => ethers.ZeroAddress),
        this.contract.isPermanentLocked(tokenId).catch(() => false)
      ]);

      // Parse locked data with proper type handling
      const lockedAmount = new Decimal(lockedData.amount.toString()).div(new Decimal(10).pow(this.AERO_DECIMALS));
      const lockEnd = parseInt(lockedData.end.toString());
      const votingPowerDecimal = new Decimal(votingPower.toString()).div(new Decimal(10).pow(this.AERO_DECIMALS));

      return {
        tokenId: tokenIdStr,
        owner: userAddress,
        locked: {
          amount: lockedAmount,
          end: lockEnd
        },
        votingPower: votingPowerDecimal,
        delegatedTo: delegatedTo !== ethers.ZeroAddress ? delegatedTo : undefined,
        isPermanent: isPermanent
      };
    } catch (error) {
      console.warn(`Failed to fetch veAERO position ${index} for ${userAddress}:`, error);
      // Return empty position on error
      return {
        tokenId: '0',
        owner: userAddress,
        locked: {
          amount: new Decimal(0),
          end: 0
        },
        votingPower: new Decimal(0),
        delegatedTo: undefined,
        isPermanent: false
      };
    }
  }

  /**
   * Aggregate multiple veAERO positions into summary data
   */
  private aggregatePositions(positions: VeAeroPosition[]): AggregatedVeAeroData {
    let totalLockAmount = new Decimal(0);
    let totalVotingPower = new Decimal(0);
    let nextExpiration: Date | undefined;

    for (const position of positions) {
      totalLockAmount = totalLockAmount.add(position.locked.amount);
      totalVotingPower = totalVotingPower.add(position.votingPower);

      // Find the earliest expiration (most urgent)
      if (position.locked.end > 0 && !position.isPermanent) {
        const expirationDate = new Date(position.locked.end * 1000);
        if (!nextExpiration || expirationDate < nextExpiration) {
          nextExpiration = expirationDate;
        }
      }
    }

    // Calculate boost multiplier (voting power / locked amount)
    const boostMultiplier = totalLockAmount.greaterThan(0)
      ? totalVotingPower.div(totalLockAmount)
      : new Decimal(0);

    return {
      totalLockAmount,
      totalVotingPower,
      nextExpiration,
      boostMultiplier,
      positionCount: positions.length,
      positions
    };
  }

  /**
   * Perform health check on the veAERO contract service
   */
  async healthCheck(): Promise<VeAeroContractHealth> {
    try {
      const startTime = Date.now();

      // Test basic contract connectivity by checking current block
      const [blockNumber, contractCode] = await Promise.all([
        this.provider.getBlockNumber(),
        this.provider.getCode(this.VEAERO_CONTRACT_ADDRESS)
      ]);

      const responseTime = Date.now() - startTime;

      // Verify contract exists (has code)
      if (contractCode === '0x') {
        return {
          status: 'unhealthy',
          details: {
            responseTimeMs: responseTime,
            contractAddress: this.VEAERO_CONTRACT_ADDRESS,
            error: 'veAERO contract not found at address'
          }
        };
      }

      // Test a simple contract call
      await this.contract.balanceOf(ethers.ZeroAddress);

      return {
        status: 'healthy',
        details: {
          responseTimeMs: responseTime,
          blockNumber,
          contractAddress: this.VEAERO_CONTRACT_ADDRESS
        }
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          responseTimeMs: Date.now(),
          contractAddress: this.VEAERO_CONTRACT_ADDRESS,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  /**
   * Get detailed voting power for a specific address (includes delegation)
   */
  async getVotingPower(userAddress: string): Promise<Decimal> {
    try {
      const votes = await this.contract.getVotes(userAddress);
      return new Decimal(votes.toString()).div(new Decimal(10).pow(this.AERO_DECIMALS));
    } catch (error) {
      console.warn(`Failed to get voting power for ${userAddress}:`, error);
      return new Decimal(0);
    }
  }

  /**
   * Check if the service is properly configured with live RPC
   */
  isLiveIntegration(): boolean {
    // Check if we're using a demo/mock RPC URL
    const rpcUrl = this.provider._getConnection().url;
    return !rpcUrl.includes('demo') && !rpcUrl.includes('mock');
  }

  /**
   * Get the current block number for data freshness validation
   */
  async getCurrentBlock(): Promise<number> {
    return await this.provider.getBlockNumber();
  }
}

/**
 * Singleton instance for the application
 */
let veAeroService: VeAeroContractService | null = null;

export function createVeAeroContractService(rpcUrl: string): VeAeroContractService {
  return new VeAeroContractService(rpcUrl);
}

export function getVeAeroContractService(): VeAeroContractService | null {
  return veAeroService;
}

export function initializeVeAeroService(rpcUrl: string): void {
  veAeroService = new VeAeroContractService(rpcUrl);
}