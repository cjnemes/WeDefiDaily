# Aerodrome Finance Integration

## Overview

Aerodrome Finance is a next-generation AMM designed to serve as the central liquidity hub on Base. WeDefiDaily integrates with Aerodrome's governance system to track veAERO (vote-escrowed AERO) positions and bribe opportunities.

## Protocol Information

- **Protocol**: Aerodrome Finance
- **Chain**: Base (8453)
- **Website**: https://aerodrome.finance
- **Documentation**: https://docs.aerodrome.finance

## Contract Addresses (Base)

- **AERO Token**: `0x940181a94A35A4569E4529A3CDfB74e38FD98631`
- **veAERO**: Vote escrow contract for AERO locking
- **Voter Contract**: Handles gauge voting and bribe distribution

## Integration Architecture

### Governance Locks (veAERO)

**Data Source**: Aerodrome REST API
**Endpoint**: `https://aerodrome.finance/api/v1/locks/{address}`

**Fetcher Function**: `fetchAerodromeLock()` in `apps/api/src/services/governance.ts`

**Implementation Pattern**:
```typescript
export async function fetchAerodromeLock(apiUrl: string, walletAddress: string): Promise<NormalizedLock | null> {
  const response = await fetch(`${apiUrl}/locks/${walletAddress}`);
  const data = await response.json();

  return {
    address: walletAddress,
    lockAmount: new Decimal(data.amount),
    votingPower: new Decimal(data.voting_power),
    boostMultiplier: new Decimal(data.voting_power).div(data.amount),
    lockEndsAt: new Date(data.lock_end * 1000),
    protocolSlug: 'aerodrome',
  };
}
```

**Key Features**:
- Time-based voting power decay
- 4-year max lock duration
- Vote escrow model (veAERO balance decreases over time)
- Boost multiplier calculated from voting power / locked amount ratio

### Bribes

**Data Source**: Aerodrome REST API
**Endpoint**: `https://aerodrome.finance/api/v1/bribes`

**Fetcher Function**: `fetchAerodromeBribes()` in `apps/api/src/services/governance.ts`

**Bribe Data Structure**:
- Epoch information (weekly cycles)
- Gauge details (pool being incentivized)
- Reward token and amount
- Total votes received
- ROI percentage per veAERO

**Sync Schedule**: Configured via `GOVERNANCE_REFRESH_INTERVAL_MINUTES` (default: 30 minutes)

## Database Schema

### Protocol Record
```typescript
{
  slug: 'aerodrome',
  name: 'Aerodrome',
  chainId: 8453,
  website: 'https://aerodrome.finance'
}
```

### Governance Lock
- Links wallet to protocol
- Stores lock amount, voting power, boost multiplier
- Tracks lock expiration date
- Updated on each sync

### Vote Epochs
- Weekly cycles starting Thursday 00:00 UTC
- Snapshot time for vote weight calculations
- Links to bribes and gauge activity

### Gauges
- Represents liquidity pools receiving votes
- Tracks gauge address and name
- Links to bribes for each epoch

### Bribes
- Per-epoch, per-gauge, per-token reward tracking
- ROI calculations for optimization
- Sponsor address tracking

## Configuration

In `apps/api/src/jobs/sync-governance.ts`:

```typescript
{
  slug: 'aerodrome',
  name: 'Aerodrome',
  chainId: 8453,
  apiUrl: env.AERODROME_API_URL,
  lockFetcher: env.AERODROME_API_URL ? fetchAerodromeLock : undefined,
  bribeFetcher: env.AERODROME_API_URL ? fetchAerodromeBribes : undefined,
}
```

**Environment Variables**:
- `AERODROME_API_URL`: Base URL for Aerodrome API (e.g., `https://aerodrome.finance/api/v1`)
- `GOVERNANCE_REFRESH_INTERVAL_MINUTES`: Sync frequency (optional, defaults to 30)

## Usage

### Manual Sync
```bash
npm run sync:governance
```

### API Endpoints
```bash
# Get all governance positions including Aerodrome
GET /v1/governance

# Response includes:
{
  "locks": [
    {
      "protocol": "aerodrome",
      "lockAmount": "1000.0",
      "votingPower": "985.5",
      "boostMultiplier": "0.9855",
      "lockEndsAt": "2025-12-31T00:00:00.000Z"
    }
  ],
  "bribes": [...]
}
```

## Maintenance Notes

### API Rate Limits
- Aerodrome API does not enforce strict rate limits currently
- Implement exponential backoff on 429 responses

### Data Freshness
- Lock data updates in real-time via API
- Bribe data updates weekly on epoch rollover (Thursday)
- Vote snapshots captured at epoch end

### Known Limitations
- API may not reflect pending transactions
- Voting power decay calculated by API, not on-chain
- Historical bribe data may have limited retention

## Testing

Test lock fetching:
```bash
# Using real API
curl "https://aerodrome.finance/api/v1/locks/0xYourWalletAddress"
```

Verify sync:
```bash
npm run sync:governance
# Check logs for: "✓ Synced aerodrome lock for 0x..."
```

## Related Documentation

- [Governance System Overview](../governance.md)
- [Thena Integration](./thena-integration.md)
- [Moonwell Integration](./moonwell-integration.md)
- [MAMO Integration](./mamo-integration.md)

## References

- [Aerodrome Docs](https://docs.aerodrome.finance)
- [veNFT Model Explained](https://docs.aerodrome.finance/governance/venft)
- [Bribe Guide](https://docs.aerodrome.finance/governance/bribes)
