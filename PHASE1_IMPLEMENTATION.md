# Phase 1 Implementation Guide

## Progress Tracker

### Issue #58: PrismaClient Dependency Injection

#### Services to Refactor
- [x] `/apps/api/src/services/performance.ts` - Started (4/5 functions updated)
- [ ] `/apps/api/src/services/risk-analytics.ts`
- [ ] `/apps/api/src/services/governance.ts`
- [ ] `/apps/api/src/services/alchemy.ts`
- [ ] `/apps/api/src/services/coingecko.ts`
- [ ] `/apps/api/src/services/gammaswap.ts`
- [ ] `/apps/api/src/services/rewards.ts`
- [ ] `/apps/api/src/services/alert-delivery.ts`
- [ ] `/apps/api/src/services/intelligence-alerts.ts`
- [ ] `/apps/api/src/services/digest.ts`

#### Routes to Update
- [ ] `/apps/api/src/routes/performance.ts`
- [ ] `/apps/api/src/routes/risk-analytics.ts`
- [ ] `/apps/api/src/routes/governance.ts`
- [ ] `/apps/api/src/routes/portfolio.ts`
- [ ] `/apps/api/src/routes/rewards.ts`
- [ ] `/apps/api/src/routes/gammaswap.ts`
- [ ] `/apps/api/src/routes/alerts.ts`
- [ ] `/apps/api/src/routes/digest.ts`

### Issue #59: Fix N+1 Query Problem
- [ ] Batch fetch implementation in correlation matrix
- [ ] Batch fetch implementation in volatility calculations
- [ ] Performance benchmarks

### Issue #60: Structured Error Logging
- [ ] Create `/apps/api/src/lib/logger.ts`
- [ ] Create `/apps/api/src/lib/api-client.ts`
- [ ] Update all external API services

### Issue #61: Request Timeouts
- [ ] Create `/apps/api/src/lib/fetch-with-timeout.ts`
- [ ] Create `/apps/api/src/lib/errors.ts`
- [ ] Update all fetch calls

### Issue #62: P&L Calculations
- [ ] Create `/apps/api/src/lib/fifo-cost-basis.ts`
- [ ] Implement realized P&L calculation
- [ ] Implement unrealized P&L calculation
- [ ] Unit tests

## Implementation Notes

### Performance Service Refactoring Pattern

**Before**:
```typescript
const prisma = new PrismaClient();

export async function calculatePerformanceMetrics(
  walletId: string | null,
  timeframe: string
): Promise<PerformanceData> {
  const data = await prisma.portfolioSnapshot.findMany(...);
  return processData(data);
}
```

**After**:
```typescript
export async function calculatePerformanceMetrics(
  prisma: PrismaClient,
  walletId: string | null,
  timeframe: string
): Promise<PerformanceData> {
  const data = await prisma.portfolioSnapshot.findMany(...);
  return processData(data);
}
```

### Route Update Pattern

**Before**:
```typescript
app.get('/metrics', async (request, reply) => {
  const metrics = await calculatePerformanceMetrics(walletId, timeframe);
  return { data: metrics };
});
```

**After**:
```typescript
app.get('/metrics', async (request, reply) => {
  const metrics = await calculatePerformanceMetrics(app.prisma, walletId, timeframe);
  return { data: metrics };
});
```

## Testing Strategy

1. **Unit Tests**: Mock PrismaClient for each service function
2. **Integration Tests**: Use test database with real Prisma client
3. **Performance Tests**: Benchmark API response times before/after

## Deployment Checklist

- [ ] All services refactored
- [ ] All routes updated
- [ ] All tests passing
- [ ] No `new PrismaClient()` in service layer
- [ ] Performance benchmarks show improvement
- [ ] PR created and reviewed
- [ ] Merged to main
- [ ] Update roadmap-issue-tracker.md
