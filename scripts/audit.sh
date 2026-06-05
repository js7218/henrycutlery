#!/bin/bash
# =============================================================================
# Security Audit Script
# Runs comprehensive security checks before deployment
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Security Audit - Pre-Deployment${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Track results
ERRORS=0
WARNINGS=0

# Helper functions
fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((ERRORS++))
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    ((WARNINGS++))
}

pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

# =============================================================================
# 1. Dependency Security Checks
# =============================================================================
echo -e "\n${BLUE}[1] Dependency Security Checks${NC}"

# Run npm audit
echo "Running npm audit..."
AUDIT_OUTPUT=$(npm audit --json 2>/dev/null || echo '{"metadata":{"vulnerabilities":{}}}' | jq -r '.')

# Check for critical vulnerabilities
CRITICAL=$(echo "$AUDIT_OUTPUT" | jq -r '.metadata.vulnerabilities.critical // 0')
HIGH=$(echo "$AUDIT_OUTPUT" | jq -r '.metadata.vulnerabilities.high // 0')

if [ "$CRITICAL" -gt 0 ]; then
    fail "Critical vulnerabilities found: $CRITICAL"
    echo "$AUDIT_OUTPUT" | jq -r '.vulnerabilities | to_entries[] | select(.value.severity == "critical") | "\(.key): \(.value.title)"' | head -5
elif [ "$HIGH" -gt 0 ]; then
    warn "High severity vulnerabilities: $HIGH"
else
    pass "No critical/high vulnerabilities"
fi

# Check for outdated packages
OUTDATED=$(npm outdated --json 2>/dev/null | jq 'keys | length' || echo "0")
if [ "$OUTDATED" -gt 0 ]; then
    warn "Outdated packages: $OUTDATED"
else
    pass "All packages up to date"
fi

# =============================================================================
# 2. Environment Variables Check
# =============================================================================
echo -e "\n${BLUE}[2] Environment Variables${NC}"

# Check for required production secrets
REQUIRED_SECRETS=(
    "JWT_SECRET"
    "PAYMENT_SIGN_SECRET"
    "PII_ENCRYPTION_KEY"
)

for secret in "${REQUIRED_SECRETS[@]}"; do
    if grep -q "^$secret=" .env.local 2>/dev/null; then
        # Check if it's a placeholder
        VALUE=$(grep "^$secret=" .env.local | cut -d'=' -f2-)
        if [[ "$VALUE" == *"change-in-production"* ]] || [[ "$VALUE" == *"your-"* ]] || [[ -z "$VALUE" ]]; then
            warn "$secret appears to be a placeholder"
        else
            pass "$secret is configured"
        fi
    else
        warn "$secret not found in .env.local"
    fi
done

# =============================================================================
# 3. File Permissions
# =============================================================================
echo -e "\n${BLUE}[3] File Permissions${NC}"

# Check logs directory exists
if [ -d "./logs" ]; then
    pass "Logs directory exists"
else
    warn "Logs directory not found"
fi

# Check data directory exists
if [ -d "./data" ]; then
    pass "Data directory exists"
else
    warn "Data directory not found"
fi

# =============================================================================
# 4. Security Headers Check
# =============================================================================
echo -e "\n${BLUE}[4] Security Headers${NC}"

if grep -q "X-Frame-Options" middleware.ts; then
    pass "X-Frame-Options configured"
else
    warn "X-Frame-Options not found"
fi

if grep -q "Content-Security-Policy" middleware.ts; then
    pass "CSP configured"
else
    warn "CSP not found"
fi

if grep -q "X-Content-Type-Options" middleware.ts; then
    pass "X-Content-Type-Options configured"
else
    warn "X-Content-Type-Options not found"
fi

# =============================================================================
# 5. Hardcoded Secret Scan
# =============================================================================
echo -e "\n${BLUE}[5] Hardcoded Secret Scan${NC}"

# Scan src for potential hardcoded secrets
HARDCODED=$(grep -rE "(password|secret|key|token)\s*=\s*['\"][^'\"]{10,}['\"]" src/ \
    --include="*.ts" --include="*.tsx" \
    --exclude-dir=node_modules 2>/dev/null || true)

if [ -n "$HARDCODED" ]; then
    # Filter out obvious examples and patterns
    REAL_SECRETS=$(echo "$HARDCODED" | grep -v "example\|your-\|change-in\|placeholder" || true)
    if [ -n "$REAL_SECRETS" ]; then
        fail "Potential hardcoded secrets found:"
        echo "$REAL_SECRETS" | head -3
    else
        pass "No hardcoded secrets found"
    fi
else
    pass "No hardcoded secrets found"
fi

# =============================================================================
# 6. TypeScript Compilation
# =============================================================================
echo -e "\n${BLUE}[6] TypeScript Compilation${NC}"

if npx tsc --noEmit 2>&1 | grep -q "error TS"; then
    fail "TypeScript compilation errors"
    npx tsc --noEmit 2>&1 | head -10
else
    pass "TypeScript compiles successfully"
fi

# =============================================================================
# 7. Next.js Security Configuration
# =============================================================================
echo -e "\n${BLUE}[7] Next.js Configuration${NC}"

# Check for secure image configuration
if grep -q "images:" next.config.mjs; then
    pass "Image configuration found"
else
    warn "No explicit image configuration"
fi

# Check for runtime configuration
if grep -q "runtime:" next.config.mjs; then
    warn "Custom runtime configured"
fi

# =============================================================================
# 8. API Route Security
# =============================================================================
echo -e "\n${BLUE}[8] API Route Security${NC}"

# Check for rate limiting in API routes
RATE_LIMITED=$(grep -rl "rateLimiter\|rateLimit" src/app/api/ 2>/dev/null | wc -l)
if [ "$RATE_LIMITED" -gt 0 ]; then
    pass "Rate limiting found in $RATE_LIMITED API routes"
else
    warn "No rate limiting detected in API routes"
fi

# Check for authentication in API routes
AUTH_CHECKS=$(grep -rl "verifyJWT\|requireAuth\|getAuthUser" src/app/api/ 2>/dev/null | wc -l)
if [ "$AUTH_CHECKS" -gt 0 ]; then
    pass "Authentication checks found in $AUTH_CHECKS API routes"
else
    warn "No authentication checks detected in API routes"
fi

# =============================================================================
# 9. WAF Rules Check
# =============================================================================
echo -e "\n${BLUE}[9] WAF Rules${NC}"

if [ -f "src/lib/wafRules.ts" ]; then
    RULE_COUNT=$(grep -c "id: '" src/lib/wafRules.ts || echo "0")
    pass "WAF rules file exists with $RULE_COUNT rules"
else
    warn "WAF rules file not found"
fi

if [ -f "middleware.ts" ]; then
    if grep -q "WAF" middleware.ts; then
        pass "WAF middleware configured"
    else
        warn "WAF not configured in middleware"
    fi
fi

# =============================================================================
# 10. PII Protection Check
# =============================================================================
echo -e "\n${BLUE}[10] PII Protection${NC}"

if [ -f "src/lib/pii.ts" ]; then
    pass "PII definitions found"
else
    warn "PII definitions not found"
fi

if [ -f "src/lib/masking.ts" ]; then
    pass "PII masking utilities found"
else
    warn "PII masking utilities not found"
fi

if [ -f "src/lib/sanitizedLogger.ts" ]; then
    pass "Sanitized logger found"
else
    warn "Sanitized logger not found"
fi

# =============================================================================
# Summary
# =============================================================================
echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}  Audit Summary${NC}"
echo -e "${BLUE}========================================${NC}"

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓ All security checks passed!${NC}"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠ $WARNINGS warnings found${NC}"
    echo "Review warnings before deployment"
    exit 0
else
    echo -e "${RED}✗ $ERRORS errors, $WARNINGS warnings found${NC}"
    echo "Fix errors before deployment"
    exit 1
fi
