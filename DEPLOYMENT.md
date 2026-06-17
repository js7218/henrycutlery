# Deployment Security Guide

## Overview

This document outlines the security requirements and best practices for deploying the Knife E-commerce platform.

## Server Security Requirements

### 1. System Hardening

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Enable automatic security updates
sudo apt install unattended-upgrades
sudo dpkg-reconfigure unattended-upgrades

# Configure automatic security updates
sudo nano /etc/apt/apt.conf.d/50unattended-upgrades
# Enable: "${distro_id}:${distro_codename}-security";
```

### 2. Kernel Security

```bash
# Enable ASLR
echo 2 | sudo tee /proc/sys/kernel/randomize_va_space

# Disable core dumps
echo "* hard core 0" | sudo tee -a /etc/security/limits.conf

# Network hardening
echo 1 | sudo tee /proc/sys/net/ipv4/tcp_syncookies
echo 0 | sudo tee /proc/sys/net/ipv4/ip_forward
```

### 3. SSH Security

```bash
# Use SSH key authentication only
# Edit /etc/ssh/sshd_config
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
ClientAliveInterval 300

# Restart SSH
sudo systemctl restart sshd
```

## Application Security

### 1. Environment Variables

All sensitive environment variables MUST be set in production:

```bash
# Required secrets (generate with: openssl rand -base64 32)
JWT_SECRET=your-32-char-secret
PAYMENT_SIGN_SECRET=your-32-char-secret  
PII_ENCRYPTION_KEY=your-32-char-secret
ADMIN_SECRET=your-32-char-secret

# Database
DATABASE_URL=postgresql://user:pass@host:5432/db

# Payment Gateway
STRIPE_SECRET_KEY=sk_live_...
ALIPAY_APP_ID=...
ALIPAY_PRIVATE_KEY=...
```

### 2. HTTPS Configuration

```bash
# Redirect HTTP to HTTPS
sudo nano /etc/nginx/sites-available/default
# Add: return 301 https://$server_name$request_uri;
```

### 3. CSP Configuration

The Content-Security-Policy header is configured in `middleware.ts`. Review and adjust for your CDN and external services.

## Database Security

### 1. Connection Security

```sql
-- Use SSL connections
ALTER USER postgres WITH SSL ON;

-- Create application user with limited privileges
CREATE USER app_user WITH PASSWORD 'strong_password';
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
```

### 2. Never Expose Database Publicly

```bash
# Bind to localhost only
# In postgresql.conf
listen_addresses = 'localhost'

# Firewall rule
sudo ufw deny from any to any port 5432
```

## CDN/WAF Integration

### Recommended: Cloudflare

1. Enable Cloudflare in proxy mode (orange cloud)
2. Configure page rules for sensitive paths
3. Enable Cloudflare WAF rules:
   - SQL Injection Protection
   - XSS Protection
   - Rate Limiting

### Custom WAF

The application includes a built-in WAF in `middleware.ts`. For production:

```bash
# Block known attack patterns
# Monitor logs at logs/waf-events-*.jsonl
```

## Monitoring & Logging

### 1. Log Management

```bash
# Rotate logs daily
sudo nano /etc/logrotate.d/knife-ecommerce
/path/to/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
}
```

### 2. Security Monitoring

```bash
# Watch for attack patterns
tail -f logs/waf-events-*.jsonl | jq 'select(.action == "blocked")'

# Watch for PII leaks
tail -f logs/security-*.jsonl | jq 'select(.type | contains("PII"))'
```

## Backup Security

### 1. Encrypted Backups

```bash
# Create encrypted backup
pg_dump -U postgres knife_ecommerce | gzip | openssl enc -aes-256-cbc -salt > backup.gz

# Decrypt backup
openssl enc -aes-256-cbc -d -in backup.gz | gunzip | psql
```

### 2. Backup Location

Never store backups in web-accessible directories.

## Incident Response

### 1. If Compromised

1. Isolate the server immediately
2. Revoke all active sessions
3. Rotate all secrets
4. Review logs for breach scope
5. Restore from clean backup if necessary

### 2. Emergency Contacts

```
Security Team: security@example.com
On-call: +1-xxx-xxx-xxxx
```

## Compliance Checklist

- [ ] HTTPS enforced
- [ ] Security headers configured
- [ ] Rate limiting enabled
- [ ] WAF active
- [ ] Database not publicly accessible
- [ ] Secrets not in version control
- [ ] Logs being monitored
- [ ] Backups encrypted
- [ ] SSH keys only authentication
- [ ] Auto security updates enabled
- [ ] Kernel hardened

## Security Audit

Run the security audit before deployment:

```bash
chmod +x scripts/audit.sh
./scripts/audit.sh
```

## Version Updates

Subscribe to security advisories:

- Node.js Security: https://nodejs.org/en/security/
- npm Security: https://www.npmjs.com/advisories
- Next.js Security: https://nextjs.org/blog/cve

Update dependencies regularly:

```bash
npm audit fix
npm update
```
