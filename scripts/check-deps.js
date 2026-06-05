#!/usr/bin/env node
/**
 * Pre-install dependency check
 * Warns about known vulnerable packages
 */

const { execSync } = require('child_process');
const crypto = require('crypto');

console.log('[Pre-install] Checking dependencies...');

try {
  // Run npm audit with minimal output
  const auditOutput = execSync('npm audit --json 2>/dev/null', { encoding: 'utf8' });
  const audit = JSON.parse(auditOutput);
  
  const critical = audit.metadata?.vulnerabilities?.critical || 0;
  const high = audit.metadata?.vulnerabilities?.high || 0;
  
  if (critical > 0) {
    console.error(`[WARNING] ${critical} critical vulnerabilities found`);
    console.error('[WARNING] Run: npm audit fix or update vulnerable packages');
    console.error('[WARNING] DO NOT deploy with critical vulnerabilities');
  }
  
  if (high > 0) {
    console.warn(`[WARNING] ${high} high severity vulnerabilities found`);
  }
  
} catch (error) {
  // Audit might fail if no issues or network error
  if (error.status !== 0) {
    console.log('[Pre-install] Could not run security audit');
  }
}

// Check for development dependencies in production
if (process.env.NODE_ENV === 'production') {
  console.log('[Pre-install] Skipping dev dependency check in production');
}

console.log('[Pre-install] Done');
