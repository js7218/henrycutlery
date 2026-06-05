# Security Changes Documentation

This document records all security enhancements made to the henrycutlery project.

## Date: 2024

---

## 1. Middleware Security Enhancements

### 1.1 WebShell & RCE Detection
- Added detection for common一句话木马 patterns:
  - `eval(`, `base64_decode(`, `system(`, `exec(`, `passthru`, `shell_exec(`, `assert(`
  - `preg_replace` with `/e` modifier, `call_user_func`, `create_function`
  - Server-side file inclusion: `include(`, `require(`

### 1.2 WebShell File Upload Detection
- Blocking malicious file extensions:
  - PHP variants: `.php`, `.php3-5`, `.phtml`, `.phar`, `.phpt`
  - Java: `.jsp`, `.jspx`, `.jspf`
  - ASP: `.asp`, `.aspx`, `.cer`, `.cgi`
  - Scripts: `.pl`, `.py`, `.rb`, `.sh`, `.bash`, `.hta`
  - Executables: `.exe`, `.bat`, `.cmd`, `.msi`, `.jar`, `.war`, `.pif`, `.vbs`

### 1.3 Command Injection Detection (Enhanced)
- Detects command injection attempts:
  - Pipe operators: `|`, `&&`, `||`
  - Command substitution: `$()`, backticks, `${}`
  - Path traversal in commands: `./`, `../`

### 1.4 Malicious Redirect Detection
- Blocking dangerous redirect schemes:
  - `javascript:`, `vbscript:`, `data:`, `mhtml:`
  - Meta refresh redirects

### 1.5 Path Traversal Detection (Encoding Variants)
- Basic traversal: `../`, `../../`
- URL encoding: `%2e%2e`, `%252e%252e`
- Double URL encoding: `%2e%2e%2f`, `%2e%2e%5c`
- Unicode/UTF encoding: `%c0%ae%c0%ae` (dot-dot-slash)

### 1.6 SSRF Detection
- Blocking internal network addresses:
  - 127.x.x.x (localhost)
  - 10.x.x.x (private)
  - 172.16-31.x.x (private)
  - 192.168.x.x (private)
  - 169.254.x.x (link-local)
  - `[::1]`, `0.0.0.0`, `localhost`
  - Cloud metadata endpoints: `metadata.google`, `metadata.internal`

### 1.7 Sensitive File Protection
- Blocking access to:
  - Configuration: `.env`, `.env.*`
  - Version control: `.git/config`, `.git/HEAD`, `/logs/`
  - Database: `.sqlite`, `.db`, `.bak`, `.backup`
  - Credentials: `.pem`, `.key`, `.crt`, `.cert`
  - Infrastructure: `Dockerfile`, `docker-compose.yml`, `package.json`, `tsconfig.json`
  - Admin panels: `wp-admin`, `phpmyadmin`, `mysql`
  - Web server: `.htaccess`, `.htpasswd`
  - Log files: `.log`, `access.log`, `error.log`, `debug.log`

### 1.8 SQL Injection Detection (Enhanced)
- SQL keywords: `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `DROP`, `CREATE`, `ALTER`, `TRUNCATE`, `EXEC`
- Union-based: `UNION`, `UNION ALL`
- Time-based: `SLEEP`, `BENCHMARK`, `WAITFOR`
- Functions: `CONCAT()`, `SUBSTRING()`, `SUBSTR()`, `CHAR()`, `HEX()`, `UNHEX()`
- XML functions: `EXTRACTVALUE()`, `UPDATEXML()`
- Boolean-based: `' OR '1'='1`, `" OR "1"="1`
- System tables: `information_schema`, `sys.databases`, `mysql.user`, `pg_catalog`

### 1.9 Honeypot Path Protection
- Added honeypot paths that trigger immediate blocking:
  - `/api/admin`, `/api/phpmyadmin`, `/api/database`
  - `/wp-login.php`, `/xmlrpc.php`
  - `/console`, `/terminal`, `/shell`, `/cmd`
  - Common admin paths

### 1.10 Enhanced Anti-Scraping Measures
- Blocking tool User-Agents:
  - Python requests, Go HTTP client, Axios
  - Curl, Wget, Scrapy
  - Security scanners: SQLmap, Nikto, Nmap, Burp, Metasploit
  - All requests without User-Agent header

---

## 2. Rate Limiting (Tiered)

### 2.1 Rate Limit Tiers
| Endpoint Type | Window | Max Requests | Block Duration |
|---------------|--------|--------------|---------------|
| Global | 10 sec | 500 | 5 min |
| /api/ | 10 sec | 100 | 5 min |
| /login or /register | 1 min | 5 | 15 min |
| /admin | 1 min | 30 | 5 min |
| /checkout | 1 min | 10 | 5 min |

---

## 3. Brute Force Protection

### 3.1 Login Attempt Thresholds
| Failures | Block Duration |
|----------|---------------|
| 5 | 3 hours |
| 10 | 24 hours |
| 20 | 7 days |

---

## 4. Security Headers

### 4.1 Existing Headers
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `X-Download-Options: noopen`
- `X-Permitted-Cross-Domain-Policies: none`
- `Referrer-Policy: strict-origin-when-cross-origin`

### 4.2 New Enhanced Headers
- **Permissions-Policy**: `accelerometer=(), camera=(), microphone=(), geolocation=(), payment=(), display-capture=()`
- **Cross-Origin-Opener-Policy**: `same-origin`
- **Cross-Origin-Resource-Policy**: `same-origin`
- **Cross-Origin-Embedder-Policy**: `require-corp`
- **Content-Security-Policy**: Strict policy with whitelist for trusted sources

### 4.3 Headers Removed
- `X-Powered-By`
- `Server`
- `X-AspNet-Version`
- `X-AspNetMvc-Version`

---

## 5. HTTP Method Restrictions

### 5.1 Allowed Methods
- `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `OPTIONS`, `HEAD`

### 5.2 Response for Invalid Methods
- Returns `405 Method Not Allowed`

---

## 6. Information Disclosure Prevention

### 6.1 Sensitive Path Response
- Returns `404 Not Found` instead of `403 Forbidden`
- Prevents path enumeration attacks

---

## 7. Admin Page Role Verification

### 7.1 Access Control
- Added role-based access control to `/admin` page
- Users must have `role: 'admin'` to access admin dashboard
- Unauthorized users see "Access Denied" page
- Loading state during verification

---

## 8. User Role System

### 8.1 Role Detection in Login
- Admin email detection:
  - Contains `admin@` (e.g., `admin@example.com`)
  - Starts with `admin` (e.g., `adminuser`)
- New registrations default to `role: 'user'`

---

## 9. Products Data Update

### 9.1 Real Product Information
- 35 products with authentic brand data
- Brands: Buck, Benchmade, Spyderco, Kershaw, Cold Steel, Victorinox, Gerber, Zero Tolerance, CRKT, Microtech, SOG, Emerson, Ontario, Mercer Culinary, Miyabi
- Price range: $27.95 - $324.99
- Real specifications including blade steel, hardness, dimensions

---

## 10. .gitignore Updates

### 10.1 New Exclusions
- Log files: `*.log`, `/logs/`, `/temp/`, `/tmp/`
- Database files: `*.sqlite`, `*.sqlite3`, `*.db`
- Uploads: `/uploads/`, `/public/uploads/`
- Backups: `*.bak`, `*.backup`, `*_backup_*`
- Credentials: `*.key`, `*.pem`, `*.crt`, `/secrets/`
- Build artifacts: `*.tgz`, `*.tar.gz`, `dist/`, `*.zip`

---

## 11. Environment Configuration

### 11.1 .env.example Created
Comprehensive environment variable template including:
- Application settings
- JWT/Authentication secrets
- Database configuration
- Payment gateway (Stripe)
- Email/SMTP settings
- File upload settings
- Rate limiting (Redis)
- Security headers
- Feature flags

---

## 12. Edge Runtime Compatibility

All security modules are designed for Next.js Edge Runtime:
- No Node.js-specific APIs (fs, path, etc.)
- Compatible with Vercel Edge Functions
- Compatible with Cloudflare Workers
- Memory-efficient for serverless environments

---

## Testing Recommendations

1. **WAF Testing**
   - Test each detection pattern with safe inputs
   - Verify blocking behavior for malicious payloads
   - Test encoding bypass attempts

2. **Rate Limiting**
   - Verify limits are enforced correctly
   - Test IP-based tracking
   - Verify block duration timing

3. **Brute Force**
   - Test multiple failed login attempts
   - Verify automatic unblocking after duration
   - Test across different IPs

4. **Security Headers**
   - Use browser DevTools to verify headers
   - Test CSP with unsafe-inline/unsafe-eval

5. **Role Verification**
   - Test admin page access with different roles
   - Verify loading and error states

---

## Emergency Response

If a security incident occurs:

1. **Immediate Actions**
   - Block attacking IP at firewall level
   - Review logs for scope of attack
   - Enable additional monitoring

2. **Recovery**
   - Rotate affected credentials
   - Clear rate limit stores
   - Review and patch vulnerable code

3. **Post-Incident**
   - Document timeline
   - Update WAF rules if needed
   - Add new detection patterns

---

## Security Contact

For security vulnerabilities, please contact:
- Email: security@example.com
- Or report via GitHub Issues (mark as private)

---

*Last Updated: 2024*
*Version: 1.0*
