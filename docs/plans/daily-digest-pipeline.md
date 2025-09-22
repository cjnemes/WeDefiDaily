# Plan: Phase 3a – Daily Digest Pipeline (Issue #28)

## Goals
- Generate a consolidated digest (markdown/plaintext) summarising portfolio, governance, rewards, gammaswap risk, and alerts for the last run.
- Provide CLI job (e.g., `npm run generate:digest`) producing an artifact saved to `storage/digests/<timestamp>.md`.
- Allow optional email/slack delivery later; for now focus on accurate data aggregation and markdown formatting.

## Data Sources
- Portfolio: `tokenBalance`, `wallet`, `token` tables (`sync:balances`).
- Governance: `governanceLock`, `voteEpoch`, `bribe` tables (`sync:governance`).
- Rewards: `rewardOpportunity` (post `sync:rewards`).
- Gammaswap: `gammaswapPosition` risk metrics (`sync:gammaswap`).
- Alerts: `/process:alerts` output / `Alert` table.

## Outline
1. **Digest Builder Service (`src/services/digest.ts`)**
   - Aggregate data with Prisma.
   - Provide typed interfaces for sections (portfolio summary, governance snapshot, top rewards, alert stats).
   - Expose `buildDigest()` returning `{ meta, sections }`.

2. **Markdown Renderer (`src/jobs/generate-digest.ts`)**
   - Reuse existing job runner but refactor to call new service.
   - Format sections with tables/bullets for readability.
   - Save to timestamped file (ensure directory exists).

3. **CLI Enhancements**
   - Accept `--output=` path override.
   - Optionally print summary to stdout when `--stdout` flag passed.

4. **Tests**
   - Unit tests for `buildDigest()` (mock Prisma client).
   - Snapshot test for markdown output.

5. **Docs**
   - Update runbook (`docs/runbooks/daily-digest.md`) with usage instructions.
   - Note location of generated files and how to share them.

## Risks / Questions
- Data volume for token balances could be large; may need to limit to top N tokens per wallet.
- Markdown tables might need escaping; consider a helper.

## Next Steps
- Implement data service + markdown renderer.
- Add tests and CLI options.
- Update docs and dotenv example if new env vars needed (e.g., output directory).
