# WeDefiDaily End-to-End Validation Runbook

This runbook provides step-by-step instructions for validating WeDefiDaily functionality with real wallet addresses and API keys before production deployment.

## Prerequisites

### Environment Setup
- [ ] PostgreSQL database running (Docker: `npm run db:up`)
- [ ] Database schema applied (`npm run db:push`)
- [ ] Environment variables configured in `.env`

### Required API Keys
- [ ] **Alchemy API Key**: For blockchain data (required)
- [ ] **CoinGecko API Key**: For price data (optional, has free tier)
- [ ] **Test Wallet Addresses**: At least 2 addresses with small DeFi positions

### Safety Considerations
⚠️ **IMPORTANT**: Use test wallets with minimal funds only. This system is read-only but always verify before adding production wallets.

## Phase 1: Core Infrastructure Validation

### 1.1 Database Connectivity
```bash
# Test database connection
npm run db:validate
npm run db:studio
```
**Expected Result**: Prisma Studio opens without errors, all tables visible

### 1.2 API Server Health
```bash
# Start API server
npm run dev:api

# Test health endpoint
curl http://localhost:4000/health
```
**Expected Result**: `{"status": "healthy", "database": "connected"}`

### 1.3 Web Frontend Connectivity
```bash
# Start web server
npm run dev:web

# Open browser
open http://localhost:3000
```
**Expected Result**: Dashboard loads without errors, shows "No data" states

## Phase 2: External API Integration Validation

### 2.1 Alchemy API Testing
```bash
# Test wallet balance fetching
curl "http://localhost:4000/v1/wallets" \
  -H "Content-Type: application/json" \
  -d '{"address": "YOUR_TEST_WALLET_ADDRESS", "chainId": 8453, "label": "Test Wallet"}'
```
**Expected Result**: Wallet created successfully

### 2.2 Portfolio Sync Validation
```bash
# Run balance sync
npm run sync:balances

# Check results
curl "http://localhost:4000/v1/portfolio"
```
**Expected Result**: Portfolio shows test wallet with real token balances and USD values

### 2.3 Price Data Validation
```bash
# Check price snapshots table
npm run db:studio
# Navigate to PriceSnapshot table
```
**Expected Result**: Recent price data for tokens in test wallet

## Phase 3: Feature-Specific Validation

### 3.1 Governance Module Testing
```bash
# Sync governance data
npm run sync:governance

# Check governance endpoint
curl "http://localhost:4000/v1/governance"
```
**Expected Result**: Vote escrow locks and bribe data if test wallet has veAERO/veTHE

### 3.2 Rewards Tracking Testing
```bash
# Sync rewards
npm run sync:rewards

# Check rewards endpoint
curl "http://localhost:4000/v1/rewards"
```
**Expected Result**: Claimable rewards listed with USD values and gas estimates

### 3.3 Gammaswap Integration Testing
```bash
# Sync Gammaswap positions
npm run sync:gammaswap

# Check positions
curl "http://localhost:4000/v1/gammaswap"
```
**Expected Result**: LP/borrow positions with health ratios (if test wallet has Gammaswap positions)

### 3.4 Performance Analytics Testing
```bash
# Sync performance data
npm run sync:performance

# Calculate metrics
npm run calculate:performance

# Check metrics
curl "http://localhost:4000/v1/performance/metrics?timeframe=24h"
```
**Expected Result**: Portfolio performance metrics (returns, volatility, Sharpe ratio)

### 3.5 Risk Analytics Testing
```bash
# Calculate risk analytics
npm run calculate:risk-analytics

# Check correlation matrix
curl "http://localhost:4000/v1/risk-analytics/correlation-matrix"

# Check protocol exposure
curl "http://localhost:4000/v1/risk-analytics/protocol-exposure"
```
**Expected Result**: Correlation data and protocol exposure analysis

## Phase 4: Alert and Digest System Validation

### 4.1 Alert Processing
```bash
# Process alerts
npm run process:alerts

# Check generated alerts
curl "http://localhost:4000/v1/alerts"
```
**Expected Result**: Alerts generated based on portfolio conditions

### 4.2 Daily Digest Generation
```bash
# Generate digest
npm run generate:digest

# Check digest files
ls -la digests/
```
**Expected Result**: Markdown and CSV digest files with portfolio summary

## Phase 5: Frontend Integration Testing

### 5.1 Dashboard Validation
- [ ] Navigate to http://localhost:3000
- [ ] Verify portfolio displays test wallet data
- [ ] Check USD values match external sources (±5%)
- [ ] Confirm all navigation links work

### 5.2 Performance Dashboard
- [ ] Navigate to /performance
- [ ] Verify charts display with real data
- [ ] Check metric calculations are reasonable
- [ ] Test timeframe switching

### 5.3 Risk Analytics Dashboard
- [ ] Navigate to /risk-analytics
- [ ] Verify correlation matrix displays
- [ ] Check protocol exposure charts
- [ ] Confirm volatility metrics

### 5.4 Governance Dashboard
- [ ] Navigate to /governance
- [ ] Verify lock information displays
- [ ] Check bribe data is current
- [ ] Test vote power calculations

## Phase 6: Error Handling and Edge Cases

### 6.1 API Failure Simulation
```bash
# Temporarily set invalid API key
export ALCHEMY_API_KEY="invalid_key"
npm run sync:balances
```
**Expected Result**: Graceful error handling, clear error messages

### 6.2 Invalid Wallet Address Testing
```bash
curl "http://localhost:4000/v1/wallets" \
  -H "Content-Type: application/json" \
  -d '{"address": "invalid_address", "chainId": 8453, "label": "Invalid"}'
```
**Expected Result**: Validation error with helpful message

### 6.3 Database Connection Loss
- [ ] Stop database container while app is running
- [ ] Test API endpoints
- [ ] Restart database
- [ ] Verify recovery

**Expected Result**: Clear error messages during outage, automatic recovery after restart

## Phase 7: Performance and Load Testing

### 7.1 Large Portfolio Testing
- [ ] Add wallet with 20+ token positions
- [ ] Run full sync cycle
- [ ] Measure execution times
- [ ] Check memory usage

**Acceptance Criteria**:
- Balance sync: < 30 seconds
- Performance calculation: < 45 seconds
- Risk analytics: < 60 seconds
- Memory usage: < 1GB

### 7.2 Historical Data Testing
- [ ] Run sync jobs multiple times to build history
- [ ] Test historical endpoints with date ranges
- [ ] Verify data consistency over time

## Validation Checklist

### Critical Success Criteria
- [ ] All API endpoints return valid data
- [ ] Portfolio USD values accurate within 5%
- [ ] All sync jobs complete without errors
- [ ] Frontend displays real data correctly
- [ ] Error handling works for common failures
- [ ] Performance meets acceptable thresholds

### Data Accuracy Verification
- [ ] Compare Alchemy balances with block explorer
- [ ] Verify CoinGecko prices match market rates
- [ ] Cross-check governance data with protocol websites
- [ ] Validate reward calculations against protocol UIs

### User Experience Testing
- [ ] Dashboard loads in < 3 seconds
- [ ] Navigation is intuitive and responsive
- [ ] Error states provide clear guidance
- [ ] Mobile responsiveness acceptable

## Troubleshooting Guide

### Common Issues

**"Database connection failed"**
- Check PostgreSQL is running: `docker ps`
- Verify DATABASE_URL in .env
- Restart database: `npm run db:down && npm run db:up`

**"Alchemy API key invalid"**
- Verify ALCHEMY_API_KEY in .env
- Check API key permissions on Alchemy dashboard
- Ensure key supports required chains

**"No portfolio data"**
- Verify wallet address is valid
- Check chain ID matches wallet's chain
- Run balance sync: `npm run sync:balances`

**"Price data missing"**
- CoinGecko free tier may have rate limits
- Check COINGECKO_API_KEY configuration
- Verify token IDs in database

### Support Resources
- [Alchemy Documentation](https://docs.alchemy.com/)
- [CoinGecko API Docs](https://www.coingecko.com/en/api)
- [WeDefiDaily GitHub Issues](https://github.com/cjnemes/WeDefiDaily/issues)

## Production Readiness Sign-off

**Validation Completed By**: ___________________
**Date**: ___________________
**Environment**: [ ] Development [ ] Staging [ ] Pre-Production

**Approvals Required**:
- [ ] Technical Lead - Core functionality validated
- [ ] DevOps - Infrastructure and monitoring ready
- [ ] Security - API key management and data protection verified
- [ ] Product - User experience meets requirements

**Ready for Production Deployment**: [ ] Yes [ ] No

**If No, blocking issues**:
1. ___________________
2. ___________________
3. ___________________

---

**Next Steps**: Once validation is complete, proceed to production deployment following the deployment guide in `/docs/production-deployment.md`.