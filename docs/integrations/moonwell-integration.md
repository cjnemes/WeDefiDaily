# Moonwell Integration

## Overview

Moonwell is a decentralized lending and borrowing protocol on Base, Optimism, Moonbeam, and Moonriver. WeDefiDaily integrates with Moonwell's Safety Module to track stkWELL (staked WELL) governance positions.

## Protocol Information

- **Protocol**: Moonwell
- **Chain**: Base (8453)
- **Website**: https://moonwell.fi
- **Documentation**: https://docs.moonwell.fi

## Contract Addresses (Base)

- **WELL Token**: `0xA88594D404727625A9437C3f886C7643872296AE`
- **stkWELL (Safety Module)**: `0xe66E3A37C3274Ac24FE8590f7D84A2427194DC17`
- **Temporal Governor**: `0x8b621804a7637b781e2BbD58e256a591F2dF7d51`
- **Comptroller**: `0xfBb21d0380beE3312B33c4353c8936a0F13EF26C`

## Integration Architecture

### Governance Locks (stkWELL)

**Data Source**: On-chain Base data via Alchemy RPC
**Contract**: stkWELL (ERC-20 staking token)

**Fetcher Function**: `fetchMoonwellLock()` in `apps/api/src/services/governance.ts`

**Implementation Pattern**:
```typescript
export async function fetchMoonwellLock(
  rpcUrl: string,
  walletAddress: string
): Promise<NormalizedLock | null> {
  try {
    const { ethers } = await import('ethers');
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    const stkWellAddress = '0xe66E3A37C3274Ac24FE8590f7D84A2427194DC17';
    const erc20Abi = ['function balanceOf(address account) view returns (uint256)'];

    const stkWellContract = new ethers.Contract(stkWellAddress, erc20Abi, provider);
    const balance = await stkWellContract.balanceOf(walletAddress);

    const balanceDecimal = new Decimal(balance.toString()).div(new Decimal(10).pow(18));

    if (balanceDecimal.isZero()) {
      return null;
    }

    return {
      address: walletAddress,
      lockAmount: balanceDecimal,
      votingPower: balanceDecimal,
      boostMultiplier: new Decimal(1),
      lockEndsAt: undefined,
      protocolSlug: 'moonwell',
    };
  } catch (error) {
    console.error(`Failed to fetch Moonwell lock for ${walletAddress}:`, error);
    throw error;
  }
}
```

**Key Features**:
- Simple 1:1 voting power model (no time decay)
- Perpetual staking (no lock expiration)
- ERC-20 token balance query
- No boost multiplier (always 1.0)
- Direct on-chain queries via ethers.js

### Governance Model

**Staking Mechanism**:
- Users stake WELL tokens to receive stkWELL
- 1 stkWELL = 1 voting power (no decay over time)
- Unstaking has a cooldown period (safety module design)
- No maximum lock duration

**Voting Power**:
- Proportional to stkWELL balance
- Used in Moonwell governance proposals
- No time-locking or vote escrow mechanics

### Rewards

**Note**: Moonwell does not use traditional bribes like Aerodrome/Thena. Instead:
- Safety Module earns protocol fees
- stkWELL holders earn yield from protocol revenue
- Rewards distributed via Reserve Auctions
- Integration does NOT track bribes for Moonwell

## Database Schema

### Protocol Record
```typescript
{
  slug: 'moonwell',
  name: 'Moonwell',
  chainId: 8453,
  website: 'https://moonwell.fi',
  metadata: {
    type: 'lending',
    governance: 'stkWELL',
    contracts: {
      well: '0xA88594D404727625A9437C3f886C7643872296AE',
      stkWELL: '0xe66E3A37C3274Ac24FE8590f7D84A2427194DC17',
      temporalGovernor: '0x8b621804a7637b781e2BbD58e256a591F2dF7d51',
      comptroller: '0xfBb21d0380beE3312B33c4353c8936a0F13EF26C',
    },
  },
}
```

### Governance Lock
- Links wallet to protocol
- `lockAmount`: User's stkWELL balance
- `votingPower`: Equal to lockAmount (1:1 ratio)
- `boostMultiplier`: Always 1.0
- `lockEndsAt`: NULL (perpetual staking)
- Updated on each sync

### Token Records
- **WELL Token**: Native governance token
- **stkWELL Token**: Staked WELL, represents safety module shares

## Configuration

In `apps/api/src/jobs/sync-governance.ts`:

```typescript
{
  slug: 'moonwell',
  name: 'Moonwell',
  chainId: 8453,
  rpcUrl: env.ALCHEMY_BASE_RPC_URL,
  rpcLockFetcher: env.ALCHEMY_BASE_RPC_URL ? fetchMoonwellLock : undefined,
  // No bribeFetcher - Moonwell doesn't use bribes
}
```

**Environment Variables**:
- `ALCHEMY_BASE_RPC_URL`: Alchemy Base RPC endpoint (required)
- `GOVERNANCE_REFRESH_INTERVAL_MINUTES`: Sync frequency (optional, defaults to 30)

## Usage

### Manual Sync
```bash
npm run sync:governance
```

### API Endpoints
```bash
# Get all governance positions including Moonwell
GET /v1/governance

# Response includes:
{
  "locks": [
    {
      "protocol": "moonwell",
      "lockAmount": "172340.02",
      "votingPower": "172340.02",
      "boostMultiplier": "1.0",
      "lockEndsAt": null
    }
  ],
  "bribes": []  // Moonwell doesn't provide bribes
}
```

## Setup Instructions

### 1. Database Migration

Run the setup script to add Moonwell protocol and tokens:

```bash
DATABASE_URL=postgresql://user@localhost:5432/wedefi \
  npx tsx apps/api/src/scripts/add-moonwell-protocol.ts
```

This creates:
- Moonwell protocol record
- WELL token record
- stkWELL token record
- Base chain record (if missing)

### 2. Environment Configuration

Add to `.env`:
```bash
ALCHEMY_BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY
```

### 3. Verify Integration

```bash
npm run sync:governance
# Should output: "✓ Synced moonwell lock for 0x... : X locked, X voting power"
```

## Maintenance Notes

### RPC Provider Requirements
- Requires Base chain RPC access
- Alchemy Base recommended for reliability
- Standard JSON-RPC calls (no archive required)

### Data Freshness
- Lock data is real-time on-chain
- Balance updates immediately after staking/unstaking
- No epoch-based snapshots

### Known Limitations
- Does not track pending unstake requests
- Cooldown period not monitored
- Multi-chain Moonwell deployments not integrated (only Base)

### Future Enhancements
- Track unstake cooldown status
- Monitor pending withdrawal amounts
- Integrate Optimism Moonwell deployment
- Track Safety Module APY

## Testing

Test stkWELL balance query:
```bash
# Check balance on BaseScan
# Visit: https://basescan.org/token/0xe66E3A37C3274Ac24FE8590f7D84A2427194DC17
# Enter your wallet address
```

Verify sync:
```bash
npm run sync:governance
# Check logs for: "✓ Synced moonwell lock for 0x..."
```

Test via curl:
```bash
# Using ethers.js RPC call
curl -X POST https://base-mainnet.g.alchemy.com/v2/YOUR_KEY \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "eth_call",
    "params": [{
      "to": "0xe66E3A37C3274Ac24FE8590f7D84A2427194DC17",
      "data": "0x70a08231000000000000000000000000YOUR_ADDRESS"
    }, "latest"],
    "id": 1
  }'
```

## Architecture Comparison

| Aspect | Moonwell | Aerodrome | Thena |
|--------|----------|-----------|-------|
| **Chain** | Base | Base | BSC |
| **Lock Model** | Perpetual Staking | veNFT (time-locked) | veNFT (time-locked) |
| **Voting Power** | 1:1 (no decay) | Decays over time | Decays over time |
| **Data Source** | On-chain RPC | REST API | On-chain RPC |
| **Bribes** | No (Reserve Auctions) | Yes (weekly) | Yes (weekly) |
| **Boost Multiplier** | Always 1.0 | Time-based | Time-based |
| **Lock Expiration** | None | Yes (max 4 years) | Yes (max 4 years) |

## Related Documentation

- [Governance System Overview](../governance.md)
- [Aerodrome Integration](./aerodrome-integration.md)
- [Thena Integration](./thena-integration.md)
- [MAMO Integration](./mamo-integration.md)

## References

- [Moonwell Docs](https://docs.moonwell.fi)
- [Safety Module Explained](https://docs.moonwell.fi/governance/safety-module)
- [stkWELL Contract (BaseScan)](https://basescan.org/address/0xe66E3A37C3274Ac24FE8590f7D84A2427194DC17)
- [WELL Token (BaseScan)](https://basescan.org/address/0xA88594D404727625A9437C3f886C7643872296AE)
- [Governance Overview](https://docs.moonwell.fi/governance/overview)
