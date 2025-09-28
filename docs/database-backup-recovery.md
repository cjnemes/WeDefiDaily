# WeDefiDaily Database Backup & Disaster Recovery Plan

## Recovery Objectives
- **RTO (Recovery Time Objective):** 15 minutes for critical portfolio data
- **RPO (Recovery Point Objective):** 5 minutes maximum data loss
- **Availability Target:** 99.9% (43.8 minutes downtime/month)

## Backup Strategy

### 1. Multi-Tier Backup Architecture

#### Tier 1: Real-Time Replication (Hot Standby)
```yaml
# PostgreSQL Streaming Replication
primary:
  server: wedefi-prod-primary
  location: us-west-2a

standby:
  server: wedefi-prod-standby
  location: us-west-2b
  replication: streaming
  lag_target: < 100MB

# Monitoring
monitoring:
  lag_threshold: 50MB
  alert_channels: ["console", "pagerduty"]
```

#### Tier 2: Automated Backups
```bash
#!/bin/bash
# Production backup script: /opt/wedefi/backup-production.sh

# Full backup daily at 2 AM UTC
0 2 * * * /usr/bin/pg_dump \
  --host=wedefi-prod-primary \
  --username=backup_user \
  --dbname=wedefi \
  --format=custom \
  --compress=9 \
  --file="/backup/wedefi-full-$(date +%Y%m%d).backup"

# WAL archiving for point-in-time recovery
archive_command = 'aws s3 cp %p s3://wedefi-wal-archive/%f'
archive_mode = on
wal_level = replica
```

#### Tier 3: Cross-Region Backup
```bash
# Daily cross-region backup sync
aws s3 sync /backup/ s3://wedefi-backup-dr-east/ \
  --storage-class STANDARD_IA \
  --delete

# Weekly backup to Glacier for long-term retention
aws s3 cp /backup/wedefi-full-weekly.backup \
  s3://wedefi-backup-glacier/ \
  --storage-class GLACIER
```

### 2. Backup Validation & Testing

#### Automated Backup Verification
```sql
-- Backup integrity test script
-- Run on restored backup to verify data consistency

-- Portfolio data integrity
SELECT
  COUNT(*) as wallet_count,
  COUNT(DISTINCT tb.walletId) as wallets_with_balances,
  SUM(tb.usdValue) as total_portfolio_value
FROM "Wallet" w
LEFT JOIN "TokenBalance" tb ON w.id = tb.walletId;

-- Time-series data completeness
SELECT
  DATE(recordedAt) as date,
  COUNT(*) as price_snapshots,
  COUNT(DISTINCT tokenId) as tokens_tracked
FROM "PriceSnapshot"
WHERE recordedAt >= NOW() - INTERVAL '7 days'
GROUP BY DATE(recordedAt)
ORDER BY date DESC;

-- Alert system data integrity
SELECT
  status,
  severity,
  COUNT(*) as count
FROM "Alert"
WHERE triggerAt >= NOW() - INTERVAL '24 hours'
GROUP BY status, severity;
```

#### Monthly DR Testing
```bash
#!/bin/bash
# Monthly disaster recovery test

# 1. Restore backup to DR environment
pg_restore --clean --if-exists \
  --host=wedefi-dr-test \
  --dbname=wedefi_dr_test \
  /backup/latest/wedefi-full.backup

# 2. Run application smoke tests
npm run test:dr-validation

# 3. Performance benchmark comparison
npm run benchmark:dr-environment

# 4. Generate DR test report
npm run generate:dr-report
```

### 3. Point-in-Time Recovery Procedures

#### WAL-E Configuration for Production
```ini
# postgresql.conf settings for PITR
wal_level = replica
archive_mode = on
archive_command = 'wal-e wal-push %p'
archive_timeout = 60  # Force WAL switch every minute

# Recovery settings
restore_command = 'wal-e wal-fetch "%f" "%p"'
recovery_target_timeline = 'latest'
```

#### PITR Recovery Process
```bash
# Emergency PITR recovery procedure

# 1. Stop application services
sudo systemctl stop wedefi-api
sudo systemctl stop wedefi-worker

# 2. Create recovery configuration
cat > /var/lib/postgresql/12/main/recovery.conf << EOF
restore_command = 'wal-e wal-fetch "%f" "%p"'
recovery_target_time = '2024-01-15 14:30:00 UTC'
recovery_target_inclusive = false
EOF

# 3. Restore base backup
wal-e backup-fetch /var/lib/postgresql/12/main LATEST

# 4. Start PostgreSQL in recovery mode
sudo systemctl start postgresql

# 5. Verify recovery target reached
sudo -u postgres psql -c "SELECT pg_is_in_recovery();"

# 6. Promote to primary when ready
sudo -u postgres psql -c "SELECT pg_promote();"
```

## Data Classification & Retention

### Critical Data (Tier 1)
- **Portfolio balances:** Indefinite retention, encrypted backups
- **Transaction history:** 7-year retention for tax compliance
- **Governance locks:** Until lock expiry + 1 year
- **Alert configurations:** Indefinite retention

### Operational Data (Tier 2)
- **Price snapshots:** 2-year hot storage, archive beyond
- **Performance metrics:** 1-year detailed, summary beyond
- **Risk analytics:** 1-year detailed data
- **System logs:** 90-day retention

### Ephemeral Data (Tier 3)
- **Alert deliveries:** 30-day retention
- **Digest runs:** 6-month retention
- **Temporary calculations:** 7-day cleanup

### Retention Implementation
```sql
-- Automated data retention jobs
-- Run via cron: 0 1 * * 0 (weekly at 1 AM Sunday)

-- Clean old alert deliveries (30 days)
DELETE FROM "AlertDelivery"
WHERE createdAt < NOW() - INTERVAL '30 days';

-- Archive old price snapshots (2 years)
INSERT INTO "PriceSnapshotArchive"
SELECT * FROM "PriceSnapshot"
WHERE recordedAt < NOW() - INTERVAL '2 years';

DELETE FROM "PriceSnapshot"
WHERE recordedAt < NOW() - INTERVAL '2 years';

-- Clean old digest runs (6 months)
DELETE FROM "DigestRun"
WHERE generatedAt < NOW() - INTERVAL '6 months';
```

## Security & Compliance

### Backup Encryption
```bash
# Encrypt backups before storage
gpg --cipher-algo AES256 \
    --compress-algo 1 \
    --s2k-mode 3 \
    --s2k-digest-algo SHA512 \
    --s2k-count 65536 \
    --symmetric \
    --output wedefi-backup.gpg \
    wedefi-backup.sql

# Encrypted S3 storage
aws s3 cp wedefi-backup.gpg \
  s3://wedefi-secure-backup/ \
  --server-side-encryption AES256 \
  --storage-class STANDARD_IA
```

### Access Controls
```yaml
# Backup access roles
backup_operator:
  permissions:
    - s3:GetObject (backup buckets)
    - s3:PutObject (backup buckets)
    - rds:CreateDBSnapshot
    - rds:DescribeDBSnapshots

recovery_operator:
  permissions:
    - s3:GetObject (backup buckets)
    - rds:RestoreDBInstanceFromDBSnapshot
    - ec2:CreateInstance (DR environment)

# Emergency break-glass access
dr_admin:
  permissions: "*"
  conditions:
    - emergency_declared: true
    - multi_person_approval: required
```

### Audit & Compliance
```sql
-- Backup audit log
CREATE TABLE backup_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_type VARCHAR(50) NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  status VARCHAR(20) NOT NULL,
  size_bytes BIGINT,
  checksum VARCHAR(128),
  operator_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Recovery audit log
CREATE TABLE recovery_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recovery_type VARCHAR(50) NOT NULL,
  target_time TIMESTAMP,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  status VARCHAR(20) NOT NULL,
  operator_id VARCHAR(100) NOT NULL,
  justification TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Monitoring & Alerting

### Backup Health Monitoring
```yaml
# Prometheus metrics for backup monitoring
metrics:
  - backup_duration_seconds
  - backup_size_bytes
  - backup_success_total
  - backup_failure_total
  - replication_lag_bytes
  - recovery_test_success_rate

alerts:
  - name: BackupFailed
    condition: backup_failure_total > 0
    severity: critical

  - name: ReplicationLagHigh
    condition: replication_lag_bytes > 100MB
    severity: warning

  - name: BackupAge
    condition: time() - backup_last_success > 86400
    severity: critical
```

### DR Test Automation
```bash
#!/bin/bash
# Automated DR test execution
# Runs monthly with full validation

DR_TEST_RESULT=$(
  # Test backup restoration
  restore_latest_backup_to_dr &&

  # Validate data integrity
  run_data_integrity_checks &&

  # Test application startup
  test_application_connectivity &&

  # Performance benchmarking
  run_performance_tests &&

  echo "DR_TEST_SUCCESS"
)

if [[ "$DR_TEST_RESULT" == "DR_TEST_SUCCESS" ]]; then
  echo "DR test passed - system ready for production failover"
  aws sns publish --topic-arn arn:aws:sns:us-west-2:account:dr-success
else
  echo "DR test failed - immediate investigation required"
  aws sns publish --topic-arn arn:aws:sns:us-west-2:account:dr-failure
fi
```
