# WeDefiDaily Production Deployment Guide

This guide provides step-by-step instructions for deploying WeDefiDaily to production with proper security, monitoring, and reliability measures.

## Prerequisites

### System Requirements
- **Node.js**: Version 18.17.0 or higher
- **PostgreSQL**: Version 14 or higher (recommended: 15+)
- **Memory**: Minimum 2GB RAM, recommended 4GB+
- **Storage**: Minimum 20GB available space for database growth
- **Network**: Stable internet connection for external API calls

### Required API Keys
- **Alchemy API Key**: Production tier recommended (Scale or Enterprise)
- **CoinGecko API Key**: Optional but recommended for higher rate limits
- **External Protocol APIs**: Protocol-specific keys for Aerodrome, Thena, etc.

## Phase 1: Infrastructure Setup

### 1.1 Database Setup

#### PostgreSQL Installation and Configuration
```bash
# Install PostgreSQL (Ubuntu/Debian)
sudo apt update
sudo apt install postgresql postgresql-contrib

# Create production database
sudo -u postgres createdb wedefidaily_prod

# Create dedicated database user
sudo -u postgres createuser --interactive wedefidaily_user
sudo -u postgres psql -c "ALTER USER wedefidaily_user PASSWORD 'SECURE_PASSWORD_HERE';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE wedefidaily_prod TO wedefidaily_user;"
```

#### Database Security Configuration
```bash
# Edit PostgreSQL configuration
sudo nano /etc/postgresql/15/main/postgresql.conf

# Recommended settings:
# shared_buffers = 256MB
# effective_cache_size = 1GB
# maintenance_work_mem = 64MB
# wal_buffers = 16MB
# max_connections = 100

# Configure authentication
sudo nano /etc/postgresql/15/main/pg_hba.conf
# Add: local wedefidaily_prod wedefidaily_user md5
```

### 1.2 Application Server Setup

#### Environment Configuration
```bash
# Clone repository
git clone https://github.com/cjnemes/WeDefiDaily.git
cd WeDefiDaily

# Install dependencies
npm install

# Build application
npm run build
```

#### Environment Variables Setup
```bash
# Create production environment file
cp .env.example .env.production

# Configure required variables
nano .env.production
```

**Critical Environment Variables:**
```bash
# Database
DATABASE_URL="postgresql://wedefidaily_user:SECURE_PASSWORD@localhost:5432/wedefidaily_prod"

# API Keys
ALCHEMY_API_KEY="your_production_alchemy_key"
COINGECKO_API_KEY="your_coingecko_key"
GAMMASWAP_API_KEY="your_gammaswap_key"

# Security
NODE_ENV="production"
JWT_SECRET="your_secure_jwt_secret"
ENCRYPTION_KEY="your_32_character_encryption_key"

# Rate Limiting
ALCHEMY_TIER="scale"  # or "enterprise"
MAX_REQUESTS_PER_SECOND=100
MAX_COMPUTE_UNITS_PER_SECOND=2000

# Monitoring
LOG_LEVEL="info"
ENABLE_METRICS="true"
METRICS_PORT="9090"

# External Services
SMTP_HOST="your_smtp_host"
SMTP_USER="your_smtp_user"
SMTP_PASS="your_smtp_password"
```

## Phase 2: Database Migration and Optimization

### 2.1 Schema Deployment
```bash
# Generate Prisma client
npm run db:generate

# Apply database schema
npm run prisma:migrate:deploy

# Apply production indexes
psql -d wedefidaily_prod -f docs/database-production-indexes.sql
```

### 2.2 Database Performance Verification
```bash
# Run database validation
npm run db:validate

# Check index creation status
psql -d wedefidaily_prod -c "
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE tablename IN ('TokenBalance', 'PriceSnapshot', 'PortfolioSnapshot')
ORDER BY tablename, indexname;
"
```

## Phase 3: Application Deployment

### 3.1 Process Management Setup

#### Using PM2 (Recommended)
```bash
# Install PM2
npm install -g pm2

# Create PM2 ecosystem file
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [
    {
      name: 'wedefidaily-api',
      script: 'dist/index.js',
      cwd: './apps/api',
      instances: 2,
      exec_mode: 'cluster',
      env_production: {
        NODE_ENV: 'production',
        PORT: 4000
      },
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      log_file: './logs/api-combined.log',
      time: true,
      max_memory_restart: '1G',
      node_args: '--max-old-space-size=1024'
    },
    {
      name: 'wedefidaily-web',
      script: 'npm',
      args: 'start',
      cwd: './apps/web',
      instances: 1,
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './logs/web-error.log',
      out_file: './logs/web-out.log'
    }
  ]
};
EOF

# Start applications
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save
pm2 startup
```

### 3.2 Nginx Reverse Proxy Setup
```bash
# Install Nginx
sudo apt install nginx

# Create Nginx configuration
sudo nano /etc/nginx/sites-available/wedefidaily
```

**Nginx Configuration:**
```nginx
server {
    listen 80;
    server_name your-domain.com;

    # API proxy
    location /api {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # Web application
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://localhost:4000/health;
        access_log off;
    }

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/wedefidaily /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## Phase 4: SSL/TLS Setup

### 4.1 Let's Encrypt SSL Certificate
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Obtain SSL certificate
sudo certbot --nginx -d your-domain.com

# Verify auto-renewal
sudo certbot renew --dry-run
```

## Phase 5: Monitoring and Logging

### 5.1 Application Monitoring Setup

#### Health Check Endpoint
```bash
# Test application health
curl https://your-domain.com/health

# Expected response:
# {
#   "status": "healthy",
#   "database": "connected",
#   "timestamp": "2024-01-15T10:30:00.000Z",
#   "services": {
#     "alchemy": "healthy",
#     "coingecko": "healthy",
#     "database": "healthy"
#   }
# }
```

#### Metrics Collection
```bash
# Install Node Exporter for system metrics
wget https://github.com/prometheus/node_exporter/releases/download/v1.6.1/node_exporter-1.6.1.linux-amd64.tar.gz
tar xvfz node_exporter-1.6.1.linux-amd64.tar.gz
sudo mv node_exporter-1.6.1.linux-amd64/node_exporter /usr/local/bin/
sudo useradd --no-create-home --shell /bin/false node_exporter
sudo chown node_exporter:node_exporter /usr/local/bin/node_exporter

# Create systemd service
sudo nano /etc/systemd/system/node_exporter.service
```

### 5.2 Log Management
```bash
# Create log directories
sudo mkdir -p /var/log/wedefidaily
sudo chown -R $USER:$USER /var/log/wedefidaily

# Configure log rotation
sudo nano /etc/logrotate.d/wedefidaily
```

**Log Rotation Configuration:**
```
/var/log/wedefidaily/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
```

## Phase 6: Security Hardening

### 6.1 Firewall Configuration
```bash
# Configure UFW firewall
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

### 6.2 System Security
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Configure automatic security updates
sudo apt install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades

# Secure SSH
sudo nano /etc/ssh/sshd_config
# Set: PasswordAuthentication no
# Set: PermitRootLogin no
sudo systemctl restart ssh
```

### 6.3 Application Security
```bash
# Set proper file permissions
chmod 600 .env.production
chmod -R 755 apps/
chown -R $USER:$USER apps/

# Secure API keys in environment
sudo nano /etc/environment
# Add production environment variables
```

## Phase 7: Data Sync Job Setup

### 7.1 Cron Job Configuration
```bash
# Create sync script
cat > /home/$USER/wedefidaily-sync.sh << 'EOF'
#!/bin/bash
cd /path/to/WeDefiDaily
export NODE_ENV=production
source .env.production

# Run sync jobs in sequence
npm run sync:balances
npm run sync:governance
npm run sync:rewards
npm run sync:gammaswap
npm run sync:performance
npm run calculate:performance
npm run calculate:risk-analytics
npm run process:alerts

# Cleanup old data
npm run cleanup:data

# Generate digest
npm run generate:digest
EOF

chmod +x /home/$USER/wedefidaily-sync.sh

# Add to crontab
crontab -e
```

**Cron Schedule:**
```bash
# Run full sync every 4 hours
0 */4 * * * /home/$USER/wedefidaily-sync.sh >> /var/log/wedefidaily/sync.log 2>&1

# Run quick balance sync every hour
0 * * * * cd /path/to/WeDefiDaily && npm run sync:balances >> /var/log/wedefidaily/balances.log 2>&1

# Generate daily digest at 8 AM
0 8 * * * cd /path/to/WeDefiDaily && npm run generate:digest >> /var/log/wedefidaily/digest.log 2>&1

# Cleanup old logs weekly
0 0 * * 0 find /var/log/wedefidaily -name "*.log" -mtime +30 -delete
```

## Phase 8: Backup Strategy

### 8.1 Database Backup
```bash
# Create backup script
cat > /home/$USER/backup-database.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/backup/wedefidaily"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="wedefidaily_prod"

mkdir -p $BACKUP_DIR

# Create database backup
pg_dump -h localhost -U wedefidaily_user -d $DB_NAME > $BACKUP_DIR/db_backup_$DATE.sql

# Compress backup
gzip $BACKUP_DIR/db_backup_$DATE.sql

# Remove backups older than 30 days
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete

echo "Database backup completed: $BACKUP_DIR/db_backup_$DATE.sql.gz"
EOF

chmod +x /home/$USER/backup-database.sh

# Schedule daily backups
crontab -e
# Add: 0 2 * * * /home/$USER/backup-database.sh >> /var/log/wedefidaily/backup.log 2>&1
```

## Phase 9: Validation and Testing

### 9.1 Production Validation Checklist
```bash
# Follow validation runbook
./docs/validation-runbook.md

# Key validation steps:
# ✅ Database connection and schema
# ✅ API endpoints responding
# ✅ External API connectivity
# ✅ SSL certificate valid
# ✅ Monitoring systems active
# ✅ Backup systems working
# ✅ Log rotation configured
# ✅ Security measures in place
```

### 9.2 Performance Testing
```bash
# Load test API endpoints
sudo apt install apache2-utils

# Test portfolio endpoint
ab -n 100 -c 10 https://your-domain.com/api/v1/portfolio

# Test health endpoint
ab -n 1000 -c 20 https://your-domain.com/health

# Monitor system resources
htop
iotop
```

## Phase 10: Go-Live Checklist

### 10.1 Pre-Launch Verification
- [ ] All environment variables configured
- [ ] Database schema applied with indexes
- [ ] SSL certificate installed and valid
- [ ] Application processes running (PM2)
- [ ] Nginx proxy configured and running
- [ ] Firewall rules applied
- [ ] Monitoring systems active
- [ ] Backup systems tested
- [ ] Sync jobs scheduled
- [ ] Log rotation configured
- [ ] Health checks passing

### 10.2 Launch Day Tasks
1. **Final smoke test**: Run full validation runbook
2. **Monitor logs**: Watch application and system logs
3. **Check metrics**: Verify monitoring dashboards
4. **Test key workflows**: Portfolio loading, alerts, digest generation
5. **Verify sync jobs**: Ensure data sync jobs complete successfully

### 10.3 Post-Launch Monitoring
- Monitor application logs for errors
- Track API response times and error rates
- Watch database performance metrics
- Monitor disk space and memory usage
- Verify backup systems running daily
- Check SSL certificate expiry dates

## Troubleshooting Guide

### Common Issues

**Database Connection Failed**
```bash
# Check PostgreSQL status
sudo systemctl status postgresql
sudo journalctl -u postgresql

# Test connection
psql -h localhost -U wedefidaily_user -d wedefidaily_prod -c "SELECT 1;"
```

**API Key Issues**
```bash
# Verify environment variables
env | grep -E "(ALCHEMY|COINGECKO)"

# Test API connectivity
curl -H "Authorization: Bearer $ALCHEMY_API_KEY" \
  "https://base-mainnet.g.alchemy.com/v2/$ALCHEMY_API_KEY/health"
```

**High Memory Usage**
```bash
# Check PM2 processes
pm2 monit

# Restart if needed
pm2 restart wedefidaily-api
```

**Sync Job Failures**
```bash
# Check sync job logs
tail -f /var/log/wedefidaily/sync.log

# Run sync manually for debugging
cd /path/to/WeDefiDaily
NODE_ENV=production npm run sync:balances
```

## Maintenance Procedures

### Regular Maintenance Tasks

**Weekly:**
- Review application logs for errors
- Check disk space usage
- Verify backup integrity
- Update system packages

**Monthly:**
- Review and rotate API keys
- Analyze database performance
- Update SSL certificates if needed
- Review security logs

**Quarterly:**
- Full system security audit
- Performance optimization review
- Dependency updates
- Disaster recovery testing

---

## Support and Escalation

**Application Issues:**
- Check application logs: `/var/log/wedefidaily/`
- PM2 process status: `pm2 status`
- Database queries: Check slow query log

**Infrastructure Issues:**
- System logs: `journalctl -f`
- Nginx logs: `/var/log/nginx/`
- Database logs: `/var/log/postgresql/`

**Emergency Contacts:**
- Technical Lead: [Contact Information]
- Database Administrator: [Contact Information]
- DevOps Team: [Contact Information]

For additional support, refer to the project repository: https://github.com/cjnemes/WeDefiDaily
