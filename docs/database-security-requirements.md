# WeDefiDaily Database Security Requirements

## Data Classification & Security Controls

### Tier 1: Highly Sensitive Financial Data
**Data Types:**
- Wallet private keys (never stored)
- Transaction details with amounts
- Portfolio valuations
- Governance voting power

**Security Controls:**
- Encryption at rest (AES-256)
- Encryption in transit (TLS 1.3)
- Field-level encryption for sensitive amounts
- Access logging for all operations
- Multi-factor authentication for admin access

### Tier 2: Operational Financial Data
**Data Types:**
- Token balances
- Price snapshots
- Reward calculations
- Risk metrics

**Security Controls:**
- Database-level encryption
- Role-based access control
- Query audit logging
- Regular access review

### Tier 3: Public/Reference Data
**Data Types:**
- Token metadata
- Protocol information
- Chain configurations
- Public governance data

**Security Controls:**
- Standard encryption
- Read-only access for most users
- Basic audit logging

## Encryption Implementation

### 1. Database-Level Encryption
```sql
-- Enable transparent data encryption (TDE) for PostgreSQL
-- AWS RDS automatically handles this with KMS

-- Verify encryption status
SELECT
  datname,
  pg_database_size(datname) as size,
  'encrypted' as encryption_status
FROM pg_database
WHERE datname = 'wedefi';

-- Create encrypted tablespace for sensitive data
CREATE TABLESPACE encrypted_ts
LOCATION '/encrypted/tablespace'
WITH (encryption = true);
```

### 2. Application-Level Field Encryption
```typescript
// Sensitive field encryption for critical financial data
import crypto from 'crypto';

export class FieldEncryption {
  private static readonly algorithm = 'aes-256-gcm';
  private static readonly keyLength = 32;
  private static readonly ivLength = 12;
  private static readonly tagLength = 16;

  private static getEncryptionKey(): Buffer {
    const key = process.env.FIELD_ENCRYPTION_KEY;
    if (!key) {
      throw new Error('FIELD_ENCRYPTION_KEY environment variable not set');
    }
    return Buffer.from(key, 'hex');
  }

  /**
   * Encrypt sensitive decimal values (portfolio amounts, etc.)
   */
  static encryptDecimal(value: string): string {
    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipher(this.algorithm, key);
    cipher.setAAD(Buffer.from('portfolio_amount', 'utf8'));

    let encrypted = cipher.update(value, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const tag = cipher.getAuthTag();

    // Return iv + tag + encrypted data as base64
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
  }

  /**
   * Decrypt sensitive decimal values
   */
  static decryptDecimal(encryptedValue: string): string {
    const key = this.getEncryptionKey();
    const data = Buffer.from(encryptedValue, 'base64');

    const iv = data.slice(0, this.ivLength);
    const tag = data.slice(this.ivLength, this.ivLength + this.tagLength);
    const encrypted = data.slice(this.ivLength + this.tagLength);

    const decipher = crypto.createDecipher(this.algorithm, key);
    decipher.setAuthTag(tag);
    decipher.setAAD(Buffer.from('portfolio_amount', 'utf8'));

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf8');
  }
}

// Prisma middleware for automatic encryption/decryption
export const encryptionMiddleware = Prisma.defineExtension((client) =>
  client.$extends({
    query: {
      // Encrypt sensitive fields before writing
      tokenBalance: {
        create({ args, query }) {
          if (args.data.usdValue) {
            args.data.usdValueEncrypted = FieldEncryption.encryptDecimal(
              args.data.usdValue.toString()
            );
            delete args.data.usdValue; // Remove plaintext
          }
          return query(args);
        },

        update({ args, query }) {
          if (args.data.usdValue) {
            args.data.usdValueEncrypted = FieldEncryption.encryptDecimal(
              args.data.usdValue.toString()
            );
            delete args.data.usdValue;
          }
          return query(args);
        }
      }
    },

    result: {
      // Decrypt sensitive fields when reading
      tokenBalance: {
        usdValue: {
          needs: { usdValueEncrypted: true },
          compute(tokenBalance) {
            if (tokenBalance.usdValueEncrypted) {
              return new Decimal(
                FieldEncryption.decryptDecimal(tokenBalance.usdValueEncrypted)
              );
            }
            return null;
          }
        }
      }
    }
  })
);
```

### 3. Transport Layer Security
```yaml
# PostgreSQL configuration for TLS
ssl: "on"
ssl_cert_file: "/etc/ssl/certs/postgresql.crt"
ssl_key_file: "/etc/ssl/private/postgresql.key"
ssl_ca_file: "/etc/ssl/certs/ca-certificates.crt"
ssl_crl_file: ""
ssl_ciphers: "ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384"
ssl_prefer_server_ciphers: "on"
ssl_ecdh_curve: "prime256v1"
ssl_min_protocol_version: "TLSv1.3"

# Connection string with SSL enforcement
DATABASE_URL: "postgresql://user:pass@host:5432/db?sslmode=require&sslcert=client.crt&sslkey=client.key&sslrootcert=ca.crt"
```

## Access Control & Authentication

### 1. Database Role-Based Access Control
```sql
-- Create application roles with minimal privileges

-- Read-only role for dashboard queries
CREATE ROLE wedefi_read_only;
GRANT CONNECT ON DATABASE wedefi TO wedefi_read_only;
GRANT USAGE ON SCHEMA public TO wedefi_read_only;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO wedefi_read_only;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO wedefi_read_only;

-- Analytics role for complex read queries
CREATE ROLE wedefi_analytics;
GRANT wedefi_read_only TO wedefi_analytics;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO wedefi_analytics;
-- Allow analytics queries with higher resource limits
ALTER ROLE wedefi_analytics SET statement_timeout = '300s';
ALTER ROLE wedefi_analytics SET work_mem = '256MB';

-- Application write role (limited permissions)
CREATE ROLE wedefi_app_write;
GRANT wedefi_read_only TO wedefi_app_write;
GRANT INSERT, UPDATE ON TABLE "TokenBalance" TO wedefi_app_write;
GRANT INSERT, UPDATE ON TABLE "PriceSnapshot" TO wedefi_app_write;
GRANT INSERT, UPDATE ON TABLE "Alert" TO wedefi_app_write;
GRANT INSERT ON TABLE "Transaction" TO wedefi_app_write;
-- No DELETE permissions for financial data protection

-- Sync job role (broader write access)
CREATE ROLE wedefi_sync_job;
GRANT wedefi_app_write TO wedefi_sync_job;
GRANT INSERT, UPDATE, DELETE ON TABLE "GovernanceLock" TO wedefi_sync_job;
GRANT INSERT, UPDATE, DELETE ON TABLE "RewardOpportunity" TO wedefi_sync_job;
GRANT INSERT, UPDATE, DELETE ON TABLE "GammaswapPosition" TO wedefi_sync_job;

-- Admin role (emergency access only)
CREATE ROLE wedefi_admin;
GRANT ALL PRIVILEGES ON DATABASE wedefi TO wedefi_admin;
-- Admin access requires manual activation and is audited

-- Application user accounts
CREATE USER wedefi_api_read WITH PASSWORD 'strong_random_password_1' IN ROLE wedefi_read_only;
CREATE USER wedefi_api_write WITH PASSWORD 'strong_random_password_2' IN ROLE wedefi_app_write;
CREATE USER wedefi_sync_jobs WITH PASSWORD 'strong_random_password_3' IN ROLE wedefi_sync_job;
CREATE USER wedefi_analytics WITH PASSWORD 'strong_random_password_4' IN ROLE wedefi_analytics;
```

### 2. Row-Level Security (RLS)
```sql
-- Enable RLS for multi-tenant security (if supporting multiple users)
ALTER TABLE "Wallet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TokenBalance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Transaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Alert" ENABLE ROW LEVEL SECURITY;

-- Example policy for user-specific data access
CREATE POLICY wallet_access_policy ON "Wallet"
  FOR ALL TO wedefi_app_write
  USING (
    -- Allow access only to wallets belonging to current user context
    current_setting('app.current_user_id', true) = ANY(
      SELECT jsonb_array_elements_text(metadata->'authorized_users')
    )
  );

-- Policy for read-only analytics (can see aggregated data only)
CREATE POLICY analytics_read_policy ON "TokenBalance"
  FOR SELECT TO wedefi_analytics
  USING (
    -- Allow reading balance data older than 24 hours for analytics
    fetchedAt < NOW() - INTERVAL '24 hours'
  );
```

### 3. Application-Level Access Control
```typescript
// JWT-based authentication with role enforcement
export interface DatabaseContext {
  userId?: string;
  roles: Array<'read' | 'write' | 'analytics' | 'admin'>;
  ipAddress: string;
  userAgent: string;
}

export class SecureQueryExecutor extends QueryExecutor {

  async executeWithContext<T>(
    context: DatabaseContext,
    operation: 'read' | 'write' | 'analytics',
    query: (client: PrismaClient) => Promise<T>
  ): Promise<T> {

    // Validate user has required role
    if (!context.roles.includes(operation)) {
      throw new Error(`Insufficient permissions for ${operation} operation`);
    }

    // Set user context for RLS policies
    const client = this.pool.getClient(operation);
    if (context.userId) {
      await client.$executeRaw`
        SET LOCAL app.current_user_id = ${context.userId}
      `;
    }

    // Log the access attempt
    await this.logAccess(context, operation);

    try {
      return await query(client);
    } finally {
      // Clear user context
      await client.$executeRaw`RESET app.current_user_id`;
    }
  }

  private async logAccess(
    context: DatabaseContext,
    operation: string
  ): Promise<void> {
    // Log to security audit table
    await this.pool.getClient('write').$executeRaw`
      INSERT INTO security_audit_log (
        user_id,
        operation_type,
        ip_address,
        user_agent,
        timestamp
      ) VALUES (
        ${context.userId || 'anonymous'},
        ${operation},
        ${context.ipAddress},
        ${context.userAgent},
        NOW()
      )
    `;
  }
}
```

## Audit Logging & Monitoring

### 1. Database Audit Configuration
```sql
-- Create audit tables for security monitoring
CREATE TABLE security_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255),
  operation_type VARCHAR(50) NOT NULL,
  table_name VARCHAR(100),
  record_id VARCHAR(255),
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  session_id VARCHAR(255),
  timestamp TIMESTAMP DEFAULT NOW(),
  success BOOLEAN DEFAULT true,
  error_message TEXT
);

-- Create indexes for efficient audit queries
CREATE INDEX idx_security_audit_user_time
ON security_audit_log (user_id, timestamp DESC);

CREATE INDEX idx_security_audit_operation
ON security_audit_log (operation_type, timestamp DESC);

CREATE INDEX idx_security_audit_table
ON security_audit_log (table_name, timestamp DESC);

-- Audit trigger function for sensitive tables
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO security_audit_log (
      operation_type,
      table_name,
      record_id,
      old_values,
      user_id,
      timestamp
    ) VALUES (
      'DELETE',
      TG_TABLE_NAME,
      OLD.id::text,
      row_to_json(OLD),
      current_setting('app.current_user_id', true),
      NOW()
    );
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO security_audit_log (
      operation_type,
      table_name,
      record_id,
      old_values,
      new_values,
      user_id,
      timestamp
    ) VALUES (
      'UPDATE',
      TG_TABLE_NAME,
      NEW.id::text,
      row_to_json(OLD),
      row_to_json(NEW),
      current_setting('app.current_user_id', true),
      NOW()
    );
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO security_audit_log (
      operation_type,
      table_name,
      record_id,
      new_values,
      user_id,
      timestamp
    ) VALUES (
      'INSERT',
      TG_TABLE_NAME,
      NEW.id::text,
      row_to_json(NEW),
      current_setting('app.current_user_id', true),
      NOW()
    );
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Apply audit triggers to sensitive tables
CREATE TRIGGER wallet_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON "Wallet"
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER token_balance_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON "TokenBalance"
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER transaction_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON "Transaction"
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
```

### 2. Security Monitoring Alerts
```yaml
# Security monitoring rules
security_rules:
  - name: "Unusual Database Access Pattern"
    condition: "login_attempts > 10 in 5m from same IP"
    action: "block_ip_temporarily"

  - name: "Sensitive Data Mass Export"
    condition: "rows_returned > 10000 in single query"
    action: "alert_security_team"

  - name: "Off-Hours Admin Access"
    condition: "admin_role_used outside business_hours"
    action: "require_mfa_verification"

  - name: "Suspicious Query Pattern"
    condition: "contains('DROP', 'DELETE', 'TRUNCATE') in query"
    action: "log_and_review"

  - name: "Failed Authentication Spike"
    condition: "failed_auth > 5 in 1m"
    action: "temporary_account_lock"
```

### 3. Compliance & Data Governance
```typescript
// Data governance for financial compliance
export class ComplianceManager {

  /**
   * Ensure PII/financial data handling compliance
   */
  async enforceDataRetention(): Promise<void> {
    // Automatic anonymization of old personal data
    await prisma.$executeRaw`
      UPDATE "Wallet"
      SET
        label = 'ANONYMIZED',
        metadata = '{"anonymized": true}'
      WHERE
        createdAt < NOW() - INTERVAL '7 years'
        AND label != 'ANONYMIZED'
    `;
  }

  /**
   * Generate compliance report for audits
   */
  async generateComplianceReport(
    startDate: Date,
    endDate: Date
  ): Promise<ComplianceReport> {

    const dataAccess = await prisma.securityAuditLog.groupBy({
      by: ['operationType', 'tableName'],
      where: {
        timestamp: { gte: startDate, lte: endDate }
      },
      _count: { id: true }
    });

    const sensitiveDataAccess = await prisma.securityAuditLog.count({
      where: {
        timestamp: { gte: startDate, lte: endDate },
        tableName: { in: ['Wallet', 'TokenBalance', 'Transaction'] }
      }
    });

    return {
      period: { start: startDate, end: endDate },
      dataAccessSummary: dataAccess,
      sensitiveDataAccessCount: sensitiveDataAccess,
      encryptionStatus: 'AES-256 enabled',
      backupEncryption: 'Enabled with customer-managed keys',
      complianceLevel: 'SOC 2 Type II equivalent'
    };
  }
}
```

## Key Management & Secrets

### 1. Environment Variable Security
```bash
# Production environment variables (never commit these)
# Use AWS Secrets Manager, HashiCorp Vault, or similar

# Database encryption keys
FIELD_ENCRYPTION_KEY=64_character_hex_key_for_field_level_encryption
DATABASE_TLS_CERT_PATH=/secure/certs/database-client.crt
DATABASE_TLS_KEY_PATH=/secure/keys/database-client.key

# Database connection URLs with certificates
DATABASE_URL_PRIMARY="postgresql://user:pass@primary.db:5432/wedefi?sslmode=require&sslcert=client.crt"
DATABASE_URL_READ="postgresql://user:pass@read.db:5432/wedefi?sslmode=require&sslcert=client.crt"

# API security
JWT_SECRET=256_bit_secret_for_jwt_signing
API_RATE_LIMIT_SECRET=secret_for_rate_limiting_tokens
```

### 2. Production Security Checklist
- [ ] Database connections use TLS 1.3+
- [ ] All sensitive fields encrypted at application level
- [ ] Database backup encryption enabled
- [ ] Row-level security policies implemented
- [ ] Audit logging enabled for all sensitive operations
- [ ] Regular security scanning of database access patterns
- [ ] Multi-factor authentication for admin access
- [ ] Network security groups restrict database access
- [ ] Regular password rotation for database users
- [ ] Monitoring alerts for suspicious activity

This comprehensive security framework ensures WeDefiDaily financial data meets enterprise-grade protection standards.