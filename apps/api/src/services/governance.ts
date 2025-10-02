import Decimal from 'decimal.js';
import { z } from 'zod';
import { BSCContractService, createBSCContractService } from './bsc-contract.js';
import { createVeAeroContractService, VeAeroContractService } from './veaero-contract.js';
import { env } from '../config.js';

export interface NormalizedLock {
  address: string;
  lockAmount: Decimal;
  votingPower: Decimal;
  boostMultiplier?: Decimal;
  lockEndsAt?: Date;
  protocolSlug: string;
}

export interface NormalizedEpoch {
  protocolSlug: string;
  epochNumber?: number;
  startsAt: Date;
  endsAt: Date;
  snapshotAt?: Date;
}

export interface NormalizedGauge {
  protocolSlug: string;
  chainId: number;
  address: string;
  name?: string;
}

export interface NormalizedBribe {
  gauge: NormalizedGauge;
  epoch: NormalizedEpoch;
  rewardToken: {
    chainId: number;
    address: string;
    symbol: string;
    name: string;
    decimals: number;
  };
  rewardAmount: Decimal;
  rewardValueUsd?: Decimal;
  totalVotes?: Decimal;
  roiPercentage?: Decimal;
  sponsorAddress?: string;
  source?: string;
}

const lockSchema = z.object({
  address: z.string(),
  lockAmount: z.string(),
  votingPower: z.string(),
  unlockTimestamp: z.number().optional(),
  boostMultiplier: z.number().optional(),
});

const bribeTokenSchema = z.object({
  address: z.string(),
  symbol: z.string(),
  name: z.string().optional(),
  decimals: z.number().nonnegative().max(36),
});

const bribeSchema = z.object({
  gaugeAddress: z.string(),
  gaugeName: z.string().optional(),
  chainId: z.number().int(),
  epochNumber: z.number().int().optional(),
  epochStart: z.string().datetime(),
  epochEnd: z.string().datetime(),
  snapshotAt: z.string().datetime().optional(),
  rewardToken: bribeTokenSchema,
  rewardAmount: z.string(),
  rewardValueUsd: z.string().optional(),
  totalVotes: z.string().optional(),
  roiPercentage: z.string().optional(),
  sponsorAddress: z.string().optional(),
  source: z.string().optional(),
});

const bribeResponseSchema = z.object({
  bribes: z.array(bribeSchema),
});

async function safeFetchJson(url: string): Promise<unknown> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

function decimalFromString(value: string | undefined): Decimal | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const parsed = new Decimal(value);
    if (!parsed.isFinite()) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

/**
 * Execute GraphQL query against The Graph Protocol subgraph
 */
async function executeGraphQLQuery(
  subgraphUrl: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<unknown> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add The Graph API key if configured
    if (env.THE_GRAPH_API_KEY) {
      headers['Authorization'] = `Bearer ${env.THE_GRAPH_API_KEY}`;
    }

    const response = await fetch(subgraphUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query,
        variables,
      }),
    });

    if (!response.ok) {
      console.warn(`GraphQL request failed: ${response.status} ${response.statusText}`);
      return null;
    }

    const result = await response.json() as any;

    if (result.errors) {
      console.warn('GraphQL errors:', result.errors);
      return null;
    }

    return result.data;
  } catch (error) {
    console.warn('GraphQL query execution failed:', error);
    return null;
  }
}

/**
 * Data Source Authentication for governance data
 */
export interface GovernanceDataSource {
  source: 'live' | 'fallback' | 'mock' | 'unknown';
  timestamp: Date;
  apiEndpoint?: string;
  confidence: 'high' | 'medium' | 'low';
  rateLimited?: boolean;
  errorDetails?: string;
  responseTimeMs?: number;
}

export interface AuthenticatedGovernanceData<T> {
  data: T | null;
  metadata: GovernanceDataSource;
  validationChecks: {
    isFreshData: boolean;
    isRealisticData: boolean;
    hasLiveCharacteristics: boolean;
  };
}

/**
 * Enhanced Aerodrome lock fetcher using live veAERO contract integration
 * Implements rigorous data source authentication and replaces stale subgraph dependency
 */
export async function fetchAerodromeLock(
  apiUrl: string,
  address: string
): Promise<NormalizedLock | null> {
  const authenticatedResult = await fetchAerodromeLockAuthenticated(apiUrl, address);

  // Only return data if it's confirmed live
  if (authenticatedResult.metadata.source === 'live' && authenticatedResult.data) {
    return authenticatedResult.data;
  }

  // Log when we're rejecting fallback data as per rigorous testing standards
  if (authenticatedResult.metadata.source === 'fallback') {
    console.warn(`❌ Rejecting Aerodrome fallback data for ${address} - not live integration`);
  }

  return null;
}

/**
 * Authenticated Aerodrome lock fetcher with live veAERO contract integration
 * Replaces stale subgraph dependency with direct blockchain calls
 */
export async function fetchAerodromeLockAuthenticated(
  apiUrl: string,
  address: string
): Promise<AuthenticatedGovernanceData<NormalizedLock>> {
  const startTime = Date.now();

  try {
    // Validate that we have Base RPC URL configured
    if (!env.ALCHEMY_BASE_RPC_URL) {
      return {
        data: null,
        metadata: {
          source: 'fallback',
          timestamp: new Date(),
          confidence: 'low',
          rateLimited: false,
          errorDetails: 'ALCHEMY_BASE_RPC_URL not configured for live veAERO integration',
          responseTimeMs: Date.now() - startTime,
        },
        validationChecks: {
          isFreshData: false,
          isRealisticData: false,
          hasLiveCharacteristics: false,
        },
      };
    }

    // Initialize live veAERO contract service
    const veAeroService = createVeAeroContractService(env.ALCHEMY_BASE_RPC_URL);

    // Perform health check first to validate live connectivity
    const healthCheck = await veAeroService.healthCheck();

    if (healthCheck.status === 'unhealthy') {
      return {
        data: null,
        metadata: {
          source: 'fallback',
          timestamp: new Date(),
          confidence: 'low',
          rateLimited: false,
          errorDetails: `veAERO contract unhealthy: ${healthCheck.details.error}`,
          responseTimeMs: Date.now() - startTime,
        },
        validationChecks: {
          isFreshData: false,
          isRealisticData: false,
          hasLiveCharacteristics: false,
        },
      };
    }

    // Ensure we're using live integration, not demo/mock
    if (!veAeroService.isLiveIntegration()) {
      return {
        data: null,
        metadata: {
          source: 'fallback',
          timestamp: new Date(),
          confidence: 'low',
          rateLimited: false,
          errorDetails: 'veAERO service configured with demo/mock RPC, not live integration',
          responseTimeMs: Date.now() - startTime,
        },
        validationChecks: {
          isFreshData: false,
          isRealisticData: false,
          hasLiveCharacteristics: false,
        },
      };
    }

    // Fetch live veAERO data from contract
    const result = await veAeroService.getAggregatedVeAeroData(address);
    const responseTime = Date.now() - startTime;

    if (!result.success) {
      return {
        data: null,
        metadata: {
          source: 'fallback',
          timestamp: new Date(),
          confidence: 'low',
          rateLimited: false,
          errorDetails: `veAERO contract call failed: ${result.error}`,
          responseTimeMs: responseTime,
        },
        validationChecks: {
          isFreshData: false,
          isRealisticData: false,
          hasLiveCharacteristics: false,
        },
      };
    }

    const veAeroData = result.data!;

    // Validate data freshness - live contract calls should take reasonable time
    const isFreshData = validateContractResponseFreshness(responseTime);
    const hasRealisticData = validateGovernanceDataRealism(veAeroData.totalLockAmount, veAeroData.totalVotingPower);

    // Return null if no positions (but mark as successful live call)
    if (veAeroData.totalLockAmount.eq(0) && veAeroData.totalVotingPower.eq(0)) {
      return {
        data: null,
        metadata: {
          source: 'live',
          timestamp: new Date(),
          confidence: 'high',
          rateLimited: false,
          apiEndpoint: `veAERO contract ${healthCheck.details.contractAddress}`,
          responseTimeMs: responseTime,
        },
        validationChecks: {
          isFreshData: isFreshData,
          isRealisticData: true, // No positions is realistic
          hasLiveCharacteristics: true,
        },
      };
    }

    // Transform veAERO data to NormalizedLock format
    const lockData: NormalizedLock = {
      address,
      lockAmount: veAeroData.totalLockAmount,
      votingPower: veAeroData.totalVotingPower,
      boostMultiplier: veAeroData.boostMultiplier,
      lockEndsAt: veAeroData.nextExpiration,
      protocolSlug: 'aerodrome',
    };

    return {
      data: lockData,
      metadata: {
        source: 'live',
        timestamp: new Date(),
        apiEndpoint: `veAERO contract ${healthCheck.details.contractAddress}`,
        confidence: hasRealisticData ? 'high' : 'medium',
        rateLimited: false,
        responseTimeMs: responseTime,
      },
      validationChecks: {
        isFreshData: isFreshData,
        isRealisticData: hasRealisticData,
        hasLiveCharacteristics: true,
      },
    };

  } catch (error) {
    return {
      data: null,
      metadata: {
        source: 'fallback',
        timestamp: new Date(),
        confidence: 'low',
        rateLimited: false,
        errorDetails: error instanceof Error ? error.message : 'Unknown error',
        responseTimeMs: Date.now() - startTime,
      },
      validationChecks: {
        isFreshData: false,
        isRealisticData: false,
        hasLiveCharacteristics: false,
      },
    };
  }
}

/**
 * Validate that contract response represents fresh, live data
 * Contract calls should take reasonable time indicating live blockchain interaction
 */
function validateContractResponseFreshness(responseTimeMs: number): boolean {
  // Response should take reasonable time (not cached/mock)
  if (responseTimeMs < 50) {
    return false; // Too fast = likely cached/mock data
  }

  // Response should not be extremely slow
  if (responseTimeMs > 30000) {
    return false; // Too slow = likely degraded service or rate limited
  }

  return true;
}

/**
 * Validate that GraphQL response represents fresh, live data
 * @deprecated - Use validateContractResponseFreshness for live contract calls
 */
function validateGraphQLResponseFreshness(data: any, responseTimeMs: number): boolean {
  // Response should take reasonable time (not cached)
  if (responseTimeMs < 100) {
    return false; // Suspiciously fast = likely cached
  }

  // Response should not be from very old data
  if (responseTimeMs > 10000) {
    return false; // Too slow = likely degraded service
  }

  return true;
}

/**
 * Validate that governance data shows realistic characteristics
 */
function validateGovernanceDataRealism(lockAmount: Decimal, votingPower: Decimal): boolean {
  // Check for unrealistic values that indicate mock data
  if (lockAmount.gt(0) && votingPower.eq(0)) {
    return false; // Locked but no voting power is unrealistic
  }

  // Check for suspiciously round numbers (mock data indicators)
  if (lockAmount.gt(0) && lockAmount.mod(1000).eq(0) && lockAmount.lt(100000)) {
    return false; // Perfect thousands below 100K = likely mock
  }

  return true;
}

export async function fetchThenaLock(
  apiUrl: string,
  address: string
): Promise<NormalizedLock | null> {
  const payload = await safeFetchJson(`${apiUrl.replace(/\/$/, '')}/locks?address=${address}`);
  if (!payload) {
    return null;
  }

  const parsedArray = z.array(lockSchema).safeParse(payload);
  const parsedObject = lockSchema.safeParse(payload);
  const data = parsedArray.success
    ? parsedArray.data.find((lock) => lock.address.toLowerCase() === address.toLowerCase())
    : parsedObject.success
      ? parsedObject.data
      : null;

  if (!data) {
    return null;
  }

  const lockAmount = decimalFromString(data.lockAmount);
  const votingPower = decimalFromString(data.votingPower);

  if (!lockAmount || !votingPower) {
    return null;
  }

  return {
    address,
    lockAmount,
    votingPower,
    boostMultiplier: data.boostMultiplier ? new Decimal(data.boostMultiplier) : undefined,
    lockEndsAt: data.unlockTimestamp ? new Date(data.unlockTimestamp * 1000) : undefined,
    protocolSlug: 'thena',
  } satisfies NormalizedLock;
}

/**
 * Fetch veTHE lock data directly from BSC smart contracts
 * This is the primary method for getting accurate on-chain veTHE data
 */
export async function fetchVeTHELockOnChain(
  bscRpcUrl: string,
  address: string
): Promise<NormalizedLock | null> {
  const bscService = createBSCContractService(bscRpcUrl);
  if (!bscService) {
    console.warn('BSC contract service not available, skipping veTHE on-chain fetch');
    return null;
  }

  try {
    const result = await bscService.getAggregatedVeTHEData(address);

    if (!result.success || !result.data) {
      console.warn(`Failed to fetch veTHE data for ${address}:`, result.error);
      return null;
    }

    const { totalLockAmount, totalVotingPower, nextExpiration, boostMultiplier } = result.data;

    // Only return data if there are active locks
    if (totalLockAmount.eq(0) && totalVotingPower.eq(0)) {
      return null;
    }

    return {
      address,
      lockAmount: totalLockAmount,
      votingPower: totalVotingPower,
      boostMultiplier,
      lockEndsAt: nextExpiration,
      protocolSlug: 'thena',
    } satisfies NormalizedLock;

  } catch (error) {
    console.error(`Error fetching veTHE data for ${address}:`, error);
    return null;
  }
}

/**
 * Enhanced Thena lock fetcher that prioritizes on-chain data over API
 * Falls back to API method if on-chain fails
 */
export async function fetchThenaLockEnhanced(
  apiUrl: string,
  bscRpcUrl: string | undefined,
  address: string
): Promise<NormalizedLock | null> {
  // First try on-chain data (most accurate)
  if (bscRpcUrl) {
    const onChainResult = await fetchVeTHELockOnChain(bscRpcUrl, address);
    if (onChainResult) {
      console.log(`✓ Fetched veTHE data on-chain for ${address}: ${onChainResult.lockAmount.toString()} THE locked`);
      return onChainResult;
    }
  }

  // Fallback to API method
  console.log(`Falling back to API method for veTHE data: ${address}`);
  return fetchThenaLock(apiUrl, address);
}

export async function fetchAerodromeBribes(apiUrl: string): Promise<NormalizedBribe[]> {
  const payload = await safeFetchJson(`${apiUrl.replace(/\/$/, '')}/bribes`);
  if (!payload) {
    return [];
  }

  const parsed = bribeResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return [];
  }

  const results: NormalizedBribe[] = [];

  parsed.data.bribes.forEach((bribe) => {
    const rewardAmount = decimalFromString(bribe.rewardAmount);
    if (!rewardAmount) {
      return;
    }

    const rewardValue = decimalFromString(bribe.rewardValueUsd);
    const totalVotes = decimalFromString(bribe.totalVotes);
    const roi = decimalFromString(bribe.roiPercentage);

    results.push({
      gauge: {
        protocolSlug: 'aerodrome',
        chainId: bribe.chainId,
        address: bribe.gaugeAddress.toLowerCase(),
        name: bribe.gaugeName,
      },
      epoch: {
        protocolSlug: 'aerodrome',
        epochNumber: bribe.epochNumber,
        startsAt: new Date(bribe.epochStart),
        endsAt: new Date(bribe.epochEnd),
        snapshotAt: bribe.snapshotAt ? new Date(bribe.snapshotAt) : undefined,
      },
      rewardToken: {
        chainId: bribe.chainId,
        address: bribe.rewardToken.address.toLowerCase(),
        symbol: bribe.rewardToken.symbol,
        name: bribe.rewardToken.name ?? bribe.rewardToken.symbol,
        decimals: bribe.rewardToken.decimals,
      },
      rewardAmount,
      rewardValueUsd: rewardValue,
      totalVotes,
      roiPercentage: roi,
      sponsorAddress: bribe.sponsorAddress?.toLowerCase(),
      source: bribe.source ?? 'aerodrome-api',
    });
  });

  return results;
}

/**
 * Fetch Moonwell stkWELL balance for a wallet
 * Moonwell uses a simple staking model: 1 stkWELL = 1 voting power (no decay)
 */
export async function fetchMoonwellLock(rpcUrl: string, walletAddress: string): Promise<NormalizedLock | null> {
  try {
    const { ethers } = await import('ethers');
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    // stkWELL contract address on Base
    const stkWellAddress = '0xe66E3A37C3274Ac24FE8590f7D84A2427194DC17';

    // ERC-20 ABI for balanceOf
    const erc20Abi = [
      'function balanceOf(address account) view returns (uint256)',
    ];

    const stkWellContract = new ethers.Contract(stkWellAddress, erc20Abi, provider);
    const balance = await stkWellContract.balanceOf(walletAddress);

    // Convert from Wei to human-readable (18 decimals)
    const balanceDecimal = new Decimal(balance.toString()).div(new Decimal(10).pow(18));

    // No balance = no lock
    if (balanceDecimal.isZero()) {
      return null;
    }

    // Moonwell staking is simple: 1 stkWELL = 1 voting power (no time decay)
    return {
      address: walletAddress,
      lockAmount: balanceDecimal,
      votingPower: balanceDecimal, // 1:1 ratio
      boostMultiplier: new Decimal(1), // No boost in Moonwell
      lockEndsAt: undefined, // No lock expiration - staking is perpetual
      protocolSlug: 'moonwell',
    };
  } catch (error) {
    console.error(`Failed to fetch Moonwell lock for ${walletAddress}:`, error);
    throw error;
  }
}

/**
 * Fetch MAMO staking balance for a wallet
 * MAMO uses personalized strategy contracts - need to query registry first
 */
export async function fetchMamoStakingLock(rpcUrl: string, walletAddress: string): Promise<NormalizedLock | null> {
  try {
    const { ethers } = await import('ethers');
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    // Step 1: Query MamoStrategyRegistry for user's strategy contracts
    const registryAddress = '0x46a5624C2ba92c08aBA4B206297052EDf14baa92';
    const registryAbi = [
      'function getUserStrategies(address user) external view returns (address[])',
    ];

    const registry = new ethers.Contract(registryAddress, registryAbi, provider);
    const userStrategies: string[] = await registry.getUserStrategies(walletAddress);

    if (userStrategies.length === 0) {
      return null;
    }

    // Step 2: Query each strategy for MAMO token balance
    const mamoTokenAddress = '0x7300B37DfdfAb110d83290A29DfB31B1740219fE';
    const erc20Abi = ['function balanceOf(address account) view returns (uint256)'];
    const mamoToken = new ethers.Contract(mamoTokenAddress, erc20Abi, provider);

    let totalStaked = new Decimal(0);

    // Check MAMO balance in each strategy contract
    for (const strategyAddress of userStrategies) {
      const balance = await mamoToken.balanceOf(strategyAddress);
      const balanceDecimal = new Decimal(balance.toString()).div(new Decimal(10).pow(18));
      totalStaked = totalStaked.plus(balanceDecimal);
    }

    if (totalStaked.isZero()) {
      return null;
    }

    // MAMO staking is simple: 1 MAMO = 1 voting power (no time decay)
    return {
      address: walletAddress,
      lockAmount: totalStaked,
      votingPower: totalStaked, // 1:1 ratio
      boostMultiplier: new Decimal(1), // No boost in MAMO
      lockEndsAt: undefined, // No lock expiration - staking is flexible
      protocolSlug: 'mamo',
    };
  } catch (error) {
    console.error(`Failed to fetch MAMO staking lock for ${walletAddress}:`, error);
    throw error;
  }
}

export async function fetchThenaBribes(apiUrl: string): Promise<NormalizedBribe[]> {
  const payload = await safeFetchJson(`${apiUrl.replace(/\/$/, '')}/bribes`);
  if (!payload) {
    return [];
  }

  const parsed = bribeResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return [];
  }

  const results: NormalizedBribe[] = [];

  parsed.data.bribes.forEach((bribe) => {
    const rewardAmount = decimalFromString(bribe.rewardAmount);
    if (!rewardAmount) {
      return;
    }

    const rewardValue = decimalFromString(bribe.rewardValueUsd);
    const totalVotes = decimalFromString(bribe.totalVotes);
    const roi = decimalFromString(bribe.roiPercentage);

    results.push({
      gauge: {
        protocolSlug: 'thena',
        chainId: bribe.chainId,
        address: bribe.gaugeAddress.toLowerCase(),
        name: bribe.gaugeName,
      },
      epoch: {
        protocolSlug: 'thena',
        epochNumber: bribe.epochNumber,
        startsAt: new Date(bribe.epochStart),
        endsAt: new Date(bribe.epochEnd),
        snapshotAt: bribe.snapshotAt ? new Date(bribe.snapshotAt) : undefined,
      },
      rewardToken: {
        chainId: bribe.chainId,
        address: bribe.rewardToken.address.toLowerCase(),
        symbol: bribe.rewardToken.symbol,
        name: bribe.rewardToken.name ?? bribe.rewardToken.symbol,
        decimals: bribe.rewardToken.decimals,
      },
      rewardAmount,
      rewardValueUsd: rewardValue,
      totalVotes,
      roiPercentage: roi,
      sponsorAddress: bribe.sponsorAddress?.toLowerCase(),
      source: bribe.source ?? 'thena-api',
    });
  });

  return results;
}

