# MAMO.BOT Integration

## ⚠️ Status: Partial Integration

**Current Status:** Registry lookup working, balance detection incomplete
**Reason:** MAMO's personalized vault architecture requires additional contract interface discovery

## Overview

MAMO.BOT is an AI-powered DeFi yield optimization platform on Base that offers automated strategy management and revenue sharing. This integration aims to track deposited MAMO tokens in the MAMO Account (staking vault).

## Protocol Information

- **Protocol**: MAMO.BOT
- **Chain**: Base (8453)
- **Website**: https://mamo.bot
- **Documentation**: https://docs.mamo.bot

## Contract Addresses (Base)

- **MAMO Token**: `0x7300B37DfdfAb110d83290A29DfB31B1740219fE`
- **MamoStrategyRegistry**: `0x46a5624C2ba92c08aBA4B206297052EDf14baa92`
- **MAMO Staking Factory**: `0xd034Bf87003A216F9A451A55A2f4f7176AAE23C8`
- **USDC Strategy Factory**: `0x1Eeb3FD8C8302dAf6BC265a6B8a5C397d89DE286`
- **cbBTC Strategy Factory**: `0x20C444BEd40faFee49222eE9A480937b825282DC`

## Integration Architecture

### Governance Locks (MAMO Staking)

**Data Source**: On-chain Base data via Alchemy RPC
**Contracts**:
1. MamoStrategyRegistry (to find user strategies)
2. User's personal strategy contracts (to query balances)

**Fetcher Function**: `fetchMamoStakingLock()` in `apps/api/src/services/governance.ts`

**Implementation Pattern**:
```typescript
export async function fetchMamoStakingLock(
  rpcUrl: string,
  walletAddress: string
): Promise<NormalizedLock | null> {
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

    return {
      address: walletAddress,
      lockAmount: totalStaked,
      votingPower: totalStaked,
      boostMultiplier: new Decimal(1),
      lockEndsAt: undefined,
      protocolSlug: 'mamo',
    };
  } catch (error) {
    console.error(`Failed to fetch MAMO staking lock for ${walletAddress}:`, error);
    throw error;
  }
}
```

**Key Features**:
- Personalized strategy contracts (each user has unique vaults)
- 1:1 voting power model (no time decay)
- Flexible deposit/withdrawal (no lock period)
- Registry pattern for discovering user positions
- Supports multiple strategy types (MAMO, USDC, cbBTC)

### MAMO Account System

**Architecture**:
- Each user gets dedicated smart contract vaults
- Strategy contracts are deployed via StrategyFactory
- MamoStrategyRegistry tracks all user strategies
- MAMO Agent manages positions within user-approved contracts

**Revenue Model**:
- MAMO Account earns share of platform revenue
- Revenue comes from Aerodrome trading fees
- Weekly distributions via "The Mamo Drop"
- Auto-compounding or cbBTC rewards options

**Staking Benefits**:
- Earn 100% of platform revenue from trading fees
- No lock-up periods or time commitments
- Auto-compounding by default
- Optional cbBTC reward routing to Bitcoin Account

### Governance Model

**Voting Power**:
- 1 MAMO staked = 1 voting power
- No time-locking or vote escrow mechanics
- Proportional to total MAMO in account
- Used in MAMO platform governance

**Withdrawal**:
- Instant withdrawals at any time
- No cooldown periods
- Maintain full custody throughout

## Database Schema

### Protocol Record
```typescript
{
  slug: 'mamo',
  name: 'MAMO',
  chainId: 8453,
  website: 'https://mamo.bot',
  metadata: {
    type: 'yield-aggregator',
    governance: 'MAMO',
    contracts: {
      mamoToken: '0x7300B37DfdfAb110d83290A29DfB31B1740219fE',
      registry: '0x46a5624C2ba92c08aBA4B206297052EDf14baa92',
      mamoStakingFactory: '0xd034Bf87003A216F9A451A55A2f4f7176AAE23C8',
      usdcStrategyFactory: '0x1Eeb3FD8C8302dAf6BC265a6B8a5C397d89DE286',
      cbBTCStrategyFactory: '0x20C444BEd40faFee49222eE9A480937b825282DC',
    },
  },
}
```

### Governance Lock
- Links wallet to protocol
- `lockAmount`: Total MAMO across all user strategies
- `votingPower`: Equal to lockAmount (1:1 ratio)
- `boostMultiplier`: Always 1.0
- `lockEndsAt`: NULL (no lock period)
- Updated on each sync

### Token Records
- **MAMO Token**: Platform governance and revenue-sharing token

## Configuration

In `apps/api/src/jobs/sync-governance.ts`:

```typescript
{
  slug: 'mamo',
  name: 'MAMO',
  chainId: 8453,
  rpcUrl: env.ALCHEMY_BASE_RPC_URL,
  rpcLockFetcher: env.ALCHEMY_BASE_RPC_URL ? fetchMamoStakingLock : undefined,
  // No bribeFetcher - MAMO uses revenue sharing, not bribes
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
# Get all governance positions including MAMO
GET /v1/governance

# Response includes:
{
  "locks": [
    {
      "protocol": "mamo",
      "lockAmount": "5000.0",
      "votingPower": "5000.0",
      "boostMultiplier": "1.0",
      "lockEndsAt": null
    }
  ],
  "bribes": []  // MAMO doesn't use bribes
}
```

## Setup Instructions

### 1. Database Migration

Run the setup script to add MAMO protocol and tokens:

```bash
DATABASE_URL=postgresql://user@localhost:5432/wedefi \
  npx tsx apps/api/src/scripts/add-mamo-protocol.ts
```

This creates:
- MAMO protocol record
- MAMO token record
- Base chain record (if missing)

### 2. Environment Configuration

Add to `.env`:
```bash
ALCHEMY_BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY
```

### 3. Verify Integration

```bash
npm run sync:governance
# Should output: "✓ Synced mamo lock for 0x... : X locked, X voting power"
```

## Maintenance Notes

### RPC Provider Requirements
- Requires Base chain RPC access
- Alchemy Base recommended for reliability
- Standard JSON-RPC calls (no archive required)

### Data Freshness
- Lock data is real-time on-chain
- Balance updates immediately after deposits/withdrawals
- No epoch-based snapshots

### Known Limitations

**Critical:**
- ❌ **Balance detection incomplete** - Cannot currently read MAMO positions from vault contracts
- ❌ **Vault interface unknown** - Personalized vaults don't expose standard ERC-20 or ERC-4626 interfaces
- ⚠️ **Registry lookup works** - Can find user's vault contracts via MamoStrategyRegistry
- ⚠️ **Asset type unknown** - Cannot determine which vaults hold MAMO vs USDC/cbBTC

**Minor:**
- Only attempts to track MAMO staking (not USDC or cbBTC accounts)
- Does not monitor pending rewards
- Auto-compounding status not tracked
- Multiple strategies aggregated (no per-strategy breakdown)

### Required Fixes

**Priority 1 - Critical:**
1. **Discover vault contract interface** - Need actual ABI for user vault contracts
2. **Implement balance queries** - Find correct function to query user's deposited amount
3. **Asset type detection** - Identify which vaults hold MAMO vs other assets
4. **Test with real positions** - Verify detection works with actual staked MAMO

**Possible Solutions:**
- Contact MAMO team for contract documentation/ABI
- Reverse engineer deployed vault contracts on BaseScan
- Check if MAMO provides API for querying user positions
- Analyze MAMO.BOT frontend to see how they query balances

### Future Enhancements
- Track all account types (USDC, cbBTC, MAMO)
- Monitor pending revenue distributions
- Track auto-compound vs manual settings
- Calculate effective APY from revenue share
- Display cbBTC reward routing status

### Security Notes
- Contracts audited by Halborn and Certora
- $250K Code4rena bug bounty active
- Self-custody maintained throughout
- Chainlink oracles for price verification

## Testing

Test MAMO staking query:
```bash
# 1. Check if user has strategies
curl -X POST https://base-mainnet.g.alchemy.com/v2/YOUR_KEY \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "eth_call",
    "params": [{
      "to": "0x46a5624C2ba92c08aBA4B206297052EDf14baa92",
      "data": "0x6f77ab44000000000000000000000000YOUR_ADDRESS"
    }, "latest"],
    "id": 1
  }'

# 2. For each strategy, check MAMO balance
curl -X POST https://base-mainnet.g.alchemy.com/v2/YOUR_KEY \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "eth_call",
    "params": [{
      "to": "0x7300B37DfdfAb110d83290A29DfB31B1740219fE",
      "data": "0x70a08231000000000000000000000000STRATEGY_ADDRESS"
    }, "latest"],
    "id": 1
  }'
```

Verify sync:
```bash
npm run sync:governance
# Check logs for: "✓ Synced mamo lock for 0x..."
```

## Architecture Comparison

| Aspect | MAMO | Moonwell | Aerodrome | Thena |
|--------|------|----------|-----------|-------|
| **Chain** | Base | Base | Base | BSC |
| **Lock Model** | Flexible Staking | Perpetual Staking | veNFT (time-locked) | veNFT (time-locked) |
| **Account Model** | Personalized Vaults | Global Contract | Global Contract | NFT-based |
| **Voting Power** | 1:1 (no decay) | 1:1 (no decay) | Decays over time | Decays over time |
| **Data Source** | Registry + RPC | On-chain RPC | REST API | On-chain RPC |
| **Rewards** | Revenue Share | Reserve Auctions | Weekly Bribes | Weekly Bribes |
| **Lock Period** | None | None | Max 4 years | Max 4 years |
| **Discovery** | Registry Lookup | Direct Balance | Direct Balance | NFT Enumeration |

## Related Documentation

- [Governance System Overview](../governance.md)
- [Aerodrome Integration](./aerodrome-integration.md)
- [Thena Integration](./thena-integration.md)
- [Moonwell Integration](./moonwell-integration.md)

## References

- [MAMO Docs](https://docs.mamo.bot)
- [MAMO Account Guide](https://docs.mamo.bot/grow/mamo)
- [Contract Repository](https://github.com/moonwell-fi/mamo-contracts)
- [Security Audits](https://www.halborn.com/audits/moonwell/mamo-contracts-369efe)
- [MAMO Token (BaseScan)](https://basescan.org/token/0x7300B37DfdfAb110d83290A29DfB31B1740219fE)
- [MamoStrategyRegistry (BaseScan)](https://basescan.org/address/0x46a5624C2ba92c08aBA4B206297052EDf14baa92)
