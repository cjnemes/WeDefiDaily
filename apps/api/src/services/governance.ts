import Decimal from 'decimal.js';
import { z } from 'zod';
import { BSCContractService, createBSCContractService } from './bsc-contract.js';
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

export async function fetchAerodromeLock(
  apiUrl: string,
  address: string
): Promise<NormalizedLock | null> {
  // Use subgraph instead of deprecated REST API
  const subgraphUrl = env.AERODROME_SUBGRAPH_URL;
  if (!subgraphUrl) {
    console.warn('Aerodrome subgraph URL not configured, falling back to mock data');
    return null;
  }

  const query = `
    query GetVeNFTs($owner: String!) {
      veNFTs(
        where: { owner: $owner }
        orderBy: votingPower
        orderDirection: desc
      ) {
        id
        locked
        lockEnd
        votingPower
        owner
      }
    }
  `;

  const data = await executeGraphQLQuery(subgraphUrl, query, {
    owner: address.toLowerCase(),
  });

  if (!data || !(data as any).veNFTs || (data as any).veNFTs.length === 0) {
    return null;
  }

  const veNFTs = (data as any).veNFTs;

  // Aggregate all veNFT positions for this address
  let totalLockAmount = new Decimal(0);
  let totalVotingPower = new Decimal(0);
  let latestLockEnd = 0;

  for (const veNFT of veNFTs) {
    if (veNFT.locked) {
      totalLockAmount = totalLockAmount.add(new Decimal(veNFT.locked).div(1e18));
    }
    if (veNFT.votingPower) {
      totalVotingPower = totalVotingPower.add(new Decimal(veNFT.votingPower).div(1e18));
    }
    if (veNFT.lockEnd && parseInt(veNFT.lockEnd) > latestLockEnd) {
      latestLockEnd = parseInt(veNFT.lockEnd);
    }
  }

  if (totalLockAmount.eq(0) && totalVotingPower.eq(0)) {
    return null;
  }

  return {
    address,
    lockAmount: totalLockAmount,
    votingPower: totalVotingPower,
    boostMultiplier: totalLockAmount.gt(0) ? totalVotingPower.div(totalLockAmount) : undefined,
    lockEndsAt: latestLockEnd > 0 ? new Date(latestLockEnd * 1000) : undefined,
    protocolSlug: 'aerodrome',
  } satisfies NormalizedLock;
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

