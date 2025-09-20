import Decimal from 'decimal.js';
import { z } from 'zod';

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

export async function fetchAerodromeLock(
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
