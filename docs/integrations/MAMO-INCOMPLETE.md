# MAMO Integration - Incomplete Implementation

## Issue Summary

The MAMO.BOT governance integration was partially implemented but **cannot currently detect user positions** due to MAMO's unique personalized vault architecture.

## What Works ✅

1. **Registry Lookup** - Successfully queries `MamoStrategyRegistry.getUserStrategies(wallet)`
2. **Vault Discovery** - Finds user's personalized vault contract addresses
3. **Database Setup** - Protocol and token records created
4. **Sync Infrastructure** - Job configured and runs without errors

## What Doesn't Work ❌

1. **Balance Detection** - Cannot read deposited amounts from vault contracts
2. **Asset Type Identification** - Cannot determine which vaults hold MAMO vs USDC/cbBTC
3. **Voting Power Calculation** - No balance means no voting power detected
4. **User Experience** - MAMO positions won't appear in governance dashboard

## Technical Root Cause

MAMO uses **personalized vault contracts** for each user, not standard ERC-20 or ERC-4626 tokens:

```
User Wallet (0x7fb...)
  └─ MamoStrategyRegistry
       └─ getUserStrategies(wallet) ✅ WORKS
            └─ Returns: [vault1, vault2, vault3, vault4]
                  └─ vault.balanceOf(wallet) ❌ FAILS - not a standard interface
                  └─ vault.asset() ❌ FAILS - function doesn't exist
                  └─ vault.totalAssets() ❌ FAILS - function doesn't exist
                  └─ MAMO_TOKEN.balanceOf(vault) ✅ Works but returns 0
                       (tokens are wrapped/deposited, not held directly)
```

### Test Results

```bash
$ node test-mamo-integration.js

✓ Found 4 strategy contract(s)
  [0] 0x51a4F8157f937F18E562557B13FB01Ec6AFEbAA8
  [1] 0xF95bE4E776d4A3Ec11f4c4fAccEC7c2cd79ABFF6
  [2] 0xB7E50686f143bE3A475A7276D2D164a16e11cF41
  [3] 0x0638EA54a2a25B9Bbb7a77492187F0f36a51845c

❌ Cannot query vault balances - missing interface
❌ Cannot identify asset types
❌ User has MAMO + cbBTC staked but integration doesn't detect it
```

## Next Steps to Complete

### Option 1: Get Official Documentation
- Contact MAMO team via Discord/Twitter
- Request vault contract ABI/interface
- Ask about recommended integration approach
- Check if they provide API for position queries

### Option 2: Reverse Engineer
- Use BaseScan to inspect deployed vault contracts
- Look for `Read Contract` functions on one vault
- Identify functions for:
  - Querying user's deposited balance
  - Getting underlying asset type
  - Converting shares to asset amounts

### Option 3: Analyze MAMO Frontend
- Inspect MAMO.BOT web app network calls
- See how their frontend queries positions
- Replicate their contract interaction pattern
- Use same RPC calls they use

### Option 4: Alternative Approaches
- Check if MAMO has subgraph with position data
- Look for events emitted on deposit (could reconstruct balance)
- Use Alchemy's `getTokenBalances` with vault addresses
- Query Moonwell contracts directly (MAMO built on Moonwell)

## Recommended Approach

**Best:** Option 1 (Official Documentation)
- Most reliable and maintainable
- Will work as MAMO updates contracts
- Shows proper integration patterns

**Fastest:** Option 3 (Analyze Frontend)
- Can implement immediately
- Proven to work (they use it)
- May break if they change implementation

## Testing Checklist

When implementation is complete, verify:

- [ ] Detects MAMO Account deposits correctly
- [ ] Detects cbBTC Account deposits correctly
- [ ] Detects USDC Account deposits correctly
- [ ] Returns 0 for empty vaults
- [ ] Calculates correct voting power for MAMO
- [ ] Displays in governance dashboard UI
- [ ] Sync job runs without errors
- [ ] Real user positions show up correctly

## References

- [MAMO Contracts Repo](https://github.com/moonwell-fi/mamo-contracts)
- [MamoStrategyRegistry](https://basescan.org/address/0x46a5624C2ba92c08aBA4B206297052EDf14baa92)
- [MAMO Token](https://basescan.org/token/0x7300B37DfdfAb110d83290A29DfB31B1740219fE)
- [Test Wallet with Positions](https://basescan.org/address/0x7fb6936e97054768073376c4a7a6b0676babb5a5)

## Related Issues

- Issue #66: Add MAMO.BOT staking governance integration
- Issue #[TBD]: Complete MAMO vault balance detection
