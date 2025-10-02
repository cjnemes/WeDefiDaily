# Thena Integration

## Overview

Thena is a decentralized exchange on BNB Smart Chain (BSC) that implements a ve(3,3) tokenomics model. WeDefiDaily integrates with Thena's governance system to track veTHE (vote-escrowed THE) positions and bribe opportunities.

## Protocol Information

- **Protocol**: Thena
- **Chain**: BNB Smart Chain (56)
- **Website**: https://thena.fi
- **Documentation**: https://docs.thena.fi

## Contract Addresses (BSC)

- **THE Token**: `0xF4C8E32EaDEC4BFe97E0F595AdD0f4450a863a11`
- **veTHE (Vote Escrow)**: `0xfBBF371C9B0B994EebFcC977CEf603F7f31c070D`
- **Voter Contract**: `0x3A1D0952809F4948d15EBCe8d345962A282C4fCb`

## Integration Architecture

### Governance Locks (veTHE)

**Data Source**: On-chain BSC data via Alchemy RPC
**Contract**: veTHE (Vote Escrow NFT)

**Fetcher Function**: `fetchThenaLockEnhanced()` in `apps/api/src/services/governance.ts`

**Implementation Pattern**:
```typescript
export async function fetchThenaLockEnhanced(
  apiUrl: string,
  bscRpcUrl: string | undefined,
  walletAddress: string
): Promise<NormalizedLock | null> {
  if (!bscRpcUrl) {
    throw new Error('BSC RPC URL required for Thena integration');
  }

  const { ethers } = await import('ethers');
  const provider = new ethers.JsonRpcProvider(bscRpcUrl);

  const veTHEAddress = '0xfBBF371C9B0B994EebFcC977CEf603F7f31c070D';
  const veTHEAbi = [
    'function balanceOfNFT(uint256 tokenId) external view returns (uint256)',
    'function locked(uint256 tokenId) external view returns (uint256 amount, uint256 end)',
    'function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)',
    'function balanceOf(address owner) external view returns (uint256)',
  ];

  const veTHEContract = new ethers.Contract(veTHEAddress, veTHEAbi, provider);

  // Get user's NFT count
  const nftBalance = await veTHEContract.balanceOf(walletAddress);

  if (nftBalance === 0n) {
    return null;
  }

  // Get first NFT (most users have one veNFT)
  const tokenId = await veTHEContract.tokenOfOwnerByIndex(walletAddress, 0);
  const votingPower = await veTHEContract.balanceOfNFT(tokenId);
  const locked = await veTHEContract.locked(tokenId);

  const lockAmount = new Decimal(locked.amount.toString()).div(new Decimal(10).pow(18));
  const votingPowerDecimal = new Decimal(votingPower.toString()).div(new Decimal(10).pow(18));

  return {
    address: walletAddress,
    lockAmount,
    votingPower: votingPowerDecimal,
    boostMultiplier: lockAmount.isZero() ? new Decimal(0) : votingPowerDecimal.div(lockAmount),
    lockEndsAt: new Date(Number(locked.end) * 1000),
    protocolSlug: 'thena',
  };
}
```

**Key Features**:
- NFT-based vote escrow (each lock is an NFT)
- Time-based voting power decay
- 4-year max lock duration
- Multiple NFTs per wallet supported (we track first one)
- Direct on-chain queries via ethers.js

### Bribes

**Data Source**: Thena Subgraph (The Graph)
**Endpoint**: `https://api.thegraph.com/subgraphs/name/thenaursa/thena-v1`

**Fetcher Function**: `fetchThenaBribes()` in `apps/api/src/services/governance.ts`

**GraphQL Query**:
```graphql
query {
  bribes(first: 100, orderBy: timestamp, orderDirection: desc) {
    id
    gauge {
      address
      pool {
        name
      }
    }
    rewardToken {
      address
      symbol
      name
      decimals
    }
    amount
    timestamp
  }
}
```

**Bribe Data Structure**:
- Epoch information (weekly cycles)
- Gauge details (pool being incentivized)
- Reward token and amount
- Timestamp for epoch tracking

**Sync Schedule**: Configured via `GOVERNANCE_REFRESH_INTERVAL_MINUTES` (default: 30 minutes)

## Database Schema

### Protocol Record
```typescript
{
  slug: 'thena',
  name: 'Thena',
  chainId: 56,
  website: 'https://thena.fi'
}
```

### Governance Lock
- Links wallet to protocol
- Stores lock amount, voting power, boost multiplier
- Tracks lock expiration date
- Supports multiple NFTs (currently tracks primary)
- Updated on each sync

### Vote Epochs
- Weekly cycles
- Snapshot time for vote weight calculations
- Links to bribes and gauge activity

### Gauges
- Represents liquidity pools receiving votes
- Tracks gauge address and pool name
- Links to bribes for each epoch

### Bribes
- Per-epoch, per-gauge, per-token reward tracking
- Subgraph-sourced data
- Historical bribe tracking

## Configuration

In `apps/api/src/jobs/sync-governance.ts`:

```typescript
{
  slug: 'thena',
  name: 'Thena',
  chainId: 56,
  apiUrl: null, // Thena doesn't have REST API
  bscRpcUrl: env.ALCHEMY_BSC_RPC_URL || env.BSC_RPC_URL,
  enhancedLockFetcher: fetchThenaLockEnhanced,
  bribeFetcher: fetchThenaBribes,
}
```

**Environment Variables**:
- `ALCHEMY_BSC_RPC_URL`: Alchemy BSC RPC endpoint (preferred)
- `BSC_RPC_URL`: Alternative BSC RPC endpoint
- `GOVERNANCE_REFRESH_INTERVAL_MINUTES`: Sync frequency (optional, defaults to 30)

## Usage

### Manual Sync
```bash
npm run sync:governance
```

### API Endpoints
```bash
# Get all governance positions including Thena
GET /v1/governance

# Response includes:
{
  "locks": [
    {
      "protocol": "thena",
      "lockAmount": "5000.0",
      "votingPower": "4850.25",
      "boostMultiplier": "0.970",
      "lockEndsAt": "2026-01-15T00:00:00.000Z"
    }
  ],
  "bribes": [...]
}
```

## Maintenance Notes

### RPC Provider Requirements
- Requires full archive node for historical queries
- Alchemy BSC recommended for reliability
- Free tier RPC may hit rate limits

### NFT Handling
- Users can have multiple veNFT positions
- Current implementation tracks first NFT only
- Future enhancement: aggregate all user NFTs

### Subgraph Reliability
- The Graph hosted service has rate limits
- Consider implementing caching layer
- Fallback to empty bribes array on errors

### Data Freshness
- Lock data is real-time on-chain
- Bribe data updated when subgraph indexes new blocks
- Vote snapshots captured at epoch end (weekly)

### Known Limitations
- Only tracks first veNFT per wallet
- Subgraph may lag blockchain by several blocks
- Cross-chain queries require BSC RPC access

## Testing

Test lock fetching:
```bash
# Check veTHE balance on-chain
# Visit: https://bscscan.com/address/0xfBBF371C9B0B994EebFcC977CEf603F7f31c070D#readContract
# Call: balanceOf(yourAddress)
```

Verify sync:
```bash
npm run sync:governance
# Check logs for: "✓ Synced thena lock for 0x..."
```

Test subgraph:
```bash
# Query The Graph directly
curl -X POST https://api.thegraph.com/subgraphs/name/thenaursa/thena-v1 \
  -H "Content-Type: application/json" \
  -d '{"query": "{ bribes(first: 5) { id gauge { address } } }"}'
```

## Architecture Differences from Aerodrome

| Aspect | Aerodrome | Thena |
|--------|-----------|-------|
| **Chain** | Base (8453) | BSC (56) |
| **Lock Data Source** | REST API | On-chain RPC |
| **Bribe Data Source** | REST API | Subgraph |
| **Lock Model** | veNFT | veNFT |
| **RPC Required** | No | Yes (BSC) |
| **External Dependencies** | Aerodrome API | Alchemy + The Graph |

## Related Documentation

- [Governance System Overview](../governance.md)
- [Aerodrome Integration](./aerodrome-integration.md)
- [Moonwell Integration](./moonwell-integration.md)
- [MAMO Integration](./mamo-integration.md)

## References

- [Thena Docs](https://docs.thena.fi)
- [veTHE Contract (BSCScan)](https://bscscan.com/address/0xfBBF371C9B0B994EebFcC977CEf603F7f31c070D)
- [Thena Subgraph](https://thegraph.com/hosted-service/subgraph/thenaursa/thena-v1)
- [ve(3,3) Model Explained](https://docs.thena.fi/governance/vethe)
