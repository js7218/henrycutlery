#!/usr/bin/env node
/**
 * 威胁情报自动同步脚本
 *
 * 从多个情报源拉取最新的：
 * 1. 恶意爬虫/扫描器 User-Agent 列表
 * 2. WAF 攻击模式（从 OWASP CRS 提取）
 * 3. 新兴威胁特征
 *
 * 运行方式：node scripts/sync-threats.js
 * 定时运行：GitHub Actions 每天自动执行
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const CONFIG_PATH = path.join(__dirname, '..', 'src', 'config', 'threat-intel.json');

// =============================================================
// 情报源
// =============================================================
const SOURCES = {
  // OWASP CRS 扫描器 UA 数据文件（最权威的恶意 UA 列表）
  owaspScannerUAs: 'https://raw.githubusercontent.com/coreruleset/coreruleset/main/rules/scanners-user-agents.data',

  // OWASP CRS SQL 注入规则
  owaspSqli: 'https://raw.githubusercontent.com/coreruleset/coreruleset/main/rules/REQUEST-942-APPLICATION-ATTACK-SQLI.conf',

  // OWASP CRS XSS 规则
  owaspXss: 'https://raw.githubusercontent.com/coreruleset/coreruleset/main/rules/REQUEST-941-APPLICATION-ATTACK-XSS.conf',

  // OWASP CRS PHP 攻击规则
  owaspPhp: 'https://raw.githubusercontent.com/coreruleset/coreruleset/main/rules/REQUEST-933-APPLICATION-ATTACK-PHP.conf',

  // 新兴威胁 Feed（CISA 已知漏洞）
  cisaVuln: 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json',
};

// =============================================================
// HTTP 工具
// =============================================================
function fetch(url, maxRedirects = 3) {
  return new Promise((resolve, reject) => {
    // 支持代理（沙箱环境需要，GitHub Actions 不需要）
    const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;

    const doRequest = (targetUrl, remaining) => {
      const parsed = new URL(targetUrl);

      // 如果有代理，用 HTTP CONNECT 隧道
      if (proxyUrl) {
        const proxy = new URL(proxyUrl);
        const proxyReq = http.request({
          host: proxy.hostname,
          port: proxy.port,
          method: 'CONNECT',
          path: `${parsed.hostname}:443`,
          timeout: 30000,
        });

        proxyReq.on('connect', (res, socket) => {
          if (res.statusCode !== 200) {
            reject(new Error(`Proxy CONNECT ${res.statusCode} for ${targetUrl}`));
            return;
          }
          const tlsReq = https.request({
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            method: 'GET',
            headers: { 'User-Agent': 'ThreatSync/1.0 (security-automation)' },
            socket: socket,
            agent: false,
            timeout: 30000,
          }, (res) => {
            if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && remaining > 0) {
              const nextUrl = new URL(res.headers.location, targetUrl).toString();
              res.resume();
              return doRequest(nextUrl, remaining - 1);
            }
            if (res.statusCode !== 200) {
              res.resume();
              return reject(new Error(`HTTP ${res.statusCode} for ${targetUrl}`));
            }
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(data));
          });
          tlsReq.on('error', reject);
          tlsReq.on('timeout', () => reject(new Error(`Timeout fetching ${targetUrl}`)));
          tlsReq.end();
        });

        proxyReq.on('error', reject);
        proxyReq.on('timeout', () => reject(new Error(`Proxy timeout for ${targetUrl}`)));
        proxyReq.end();
      } else {
        // 直连（GitHub Actions 环境）
        https.get(targetUrl, {
          headers: { 'User-Agent': 'ThreatSync/1.0 (security-automation)' },
          timeout: 30000,
        }, (res) => {
          if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && remaining > 0) {
            const nextUrl = new URL(res.headers.location, targetUrl).toString();
            res.resume();
            return doRequest(nextUrl, remaining - 1);
          }
          if (res.statusCode !== 200) {
            res.resume();
            return reject(new Error(`HTTP ${res.statusCode} for ${targetUrl}`));
          }
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => resolve(data));
        }).on('error', reject).on('timeout', () => {
          reject(new Error(`Timeout fetching ${targetUrl}`));
        });
      }
    };
    doRequest(url, maxRedirects);
  });
}

// =============================================================
// 解析器：从各情报源提取模式
// =============================================================

/**
 * 从纯文本 UA 列表提取（每行一个 UA）
 */
function parsePlainUAList(text) {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && line.length >= 3)
    // 转义正则特殊字符
    .map(ua => ua.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    // 只取 UA 关键词部分（避免太长）
    .map(ua => {
      // 提取核心标识词
      const match = ua.match(/([A-Za-z][A-Za-z0-9_-]{2,30})/);
      return match ? match[1].toLowerCase() : null;
    })
    .filter(Boolean)
    .filter(ua => ua.length >= 3 && !['mozilla', 'applewebkit', 'chrome', 'safari', 'gecko', 'khtml', 'windows', 'linux', 'macintosh', 'android', 'iphone', 'mobile'].includes(ua));
}

/**
 * 从 OWASP CRS 配置提取 UA 模式
 * 格式: SecRule REQUEST_HEADERS:User-Agent "@rx /pattern/i"
 */
function parseOWASPUserAgents(text) {
  const patterns = new Set();
  const regex = /@rx\s+["']?(.+?)["']?\s*[id][")\s]/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    let p = match[1].trim();
    // 去掉 OWASP 变量引用
    if (p.includes('%{') || p.includes('$(')) continue;
    // 提取核心词
    const wordMatch = p.match(/([a-z][a-z0-9_-]{2,30})/i);
    if (wordMatch) {
      const word = wordMatch[1].toLowerCase();
      if (word.length >= 3 && !['mozilla', 'applewebkit', 'chrome', 'safari'].includes(word)) {
        patterns.add(word);
      }
    }
  }
  return [...patterns];
}

/**
 * 从 OWASP CRS SQLi 规则提取攻击模式
 */
function parseOWASPSqli(text) {
  const patterns = new Set();
  // 提取 @rx 后面的正则模式
  const regex = /@rx\s+"(.+?)"/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    let p = match[1];
    // 过滤太复杂的 OWASP 变量引用
    if (p.includes('%{') || p.includes('$(')) continue;
    // 只取简洁有效的模式
    if (p.length >= 5 && p.length <= 200) {
      patterns.add(p);
    }
  }
  return [...patterns].slice(0, 30); // 限制数量
}

/**
 * 从 OWASP CRS XSS 规则提取攻击模式
 */
function parseOWASPXss(text) {
  const patterns = new Set();
  const regex = /@rx\s+"(.+?)"/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    let p = match[1];
    if (p.includes('%{') || p.includes('$(')) continue;
    if (p.length >= 3 && p.length <= 200) {
      patterns.add(p);
    }
  }
  return [...patterns].slice(0, 30);
}

/**
 * 从 OWASP CRS PHP 攻击规则提取模式
 */
function parseOWASPPHp(text) {
  const patterns = new Set();
  const regex = /@rx\s+"(.+?)"/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    let p = match[1];
    if (p.includes('%{') || p.includes('$(')) continue;
    if (p.length >= 3 && p.length <= 200) {
      patterns.add(p);
    }
  }
  return [...patterns].slice(0, 30);
}

// =============================================================
// 主流程
// =============================================================
async function main() {
  console.log('=== 威胁情报同步开始 ===');
  console.log(`时间: ${new Date().toISOString()}\n`);

  // 读取当前配置
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const oldUACount = config.blocked_user_agents.length;
  const oldWafCount = Object.values(config.waf_patterns).flat().length;

  const newUAs = new Set(config.blocked_user_agents);
  const newSqliPatterns = new Set(config.waf_patterns.sql_injection || []);
  const newXssPatterns = new Set(config.waf_patterns.xss || []);
  const newPhpPatterns = new Set(config.waf_patterns.php_malicious || []);

  let changelog = [];

  // 1. 拉取 OWASP CRS 扫描器 UA 数据文件
  try {
    console.log('[owaspScannerUAs] 拉取中...');
    const text = await fetch(SOURCES.owaspScannerUAs);
    // scanners-user-agents.data 是纯文本，每行一个 UA 关键词
    const uas = parsePlainUAList(text);
    let added = 0;
    for (const ua of uas) {
      if (!newUAs.has(ua)) {
        newUAs.add(ua);
        added++;
      }
    }
    console.log(`[owaspScannerUAs] 获取 ${uas.length} 个，新增 ${added} 个`);
    if (added > 0) changelog.push(`+${added} 个扫描器 UA (OWASP CRS)`);
  } catch (err) {
    console.error(`[owaspScannerUAs] 失败: ${err.message}`);
  }

  // 3. 拉取 OWASP CRS SQLi 模式
  try {
    console.log('\n[owaspSqli] 拉取中...');
    const text = await fetch(SOURCES.owaspSqli);
    const patterns = parseOWASPSqli(text);
    let added = 0;
    for (const p of patterns) {
      if (!newSqliPatterns.has(p)) {
        newSqliPatterns.add(p);
        added++;
      }
    }
    console.log(`[owaspSqli] 获取 ${patterns.length} 个模式，新增 ${added} 个`);
    if (added > 0) changelog.push(`+${added} 个 SQL 注入模式 (OWASP CRS)`);
  } catch (err) {
    console.error(`[owaspSqli] 失败: ${err.message}`);
  }

  // 4. 拉取 OWASP CRS XSS 模式
  try {
    console.log('\n[owaspXss] 拉取中...');
    const text = await fetch(SOURCES.owaspXss);
    const patterns = parseOWASPXss(text);
    let added = 0;
    for (const p of patterns) {
      if (!newXssPatterns.has(p)) {
        newXssPatterns.add(p);
        added++;
      }
    }
    console.log(`[owaspXss] 获取 ${patterns.length} 个模式，新增 ${added} 个`);
    if (added > 0) changelog.push(`+${added} 个 XSS 模式 (OWASP CRS)`);
  } catch (err) {
    console.error(`[owaspXss] 失败: ${err.message}`);
  }

  // 5. 拉取 OWASP CRS PHP 攻击模式
  try {
    console.log('\n[owaspPhp] 拉取中...');
    const text = await fetch(SOURCES.owaspPhp);
    const patterns = parseOWASPPHp(text);
    let added = 0;
    for (const p of patterns) {
      if (!newPhpPatterns.has(p)) {
        newPhpPatterns.add(p);
        added++;
      }
    }
    console.log(`[owaspPhp] 获取 ${patterns.length} 个模式，新增 ${added} 个`);
    if (added > 0) changelog.push(`+${added} 个 PHP 攻击模式 (OWASP CRS)`);
  } catch (err) {
    console.error(`[owaspPhp] 失败: ${err.message}`);
  }

  // 6. 检查 CISA 已知漏洞（记录高危 CVE，不自动加规则，供人工审核）
  try {
    console.log('\n[cisaVuln] 拉取中...');
    const text = await fetch(SOURCES.cisaVuln);
    const data = JSON.parse(text);
    const recentCount = data.vulnerabilities?.length || 0;
    console.log(`[cisaVuln] ${recentCount} 个已知漏洞`);
    changelog.push(`CISA: ${recentCount} 个已知漏洞已记录`);
  } catch (err) {
    console.error(`[cisaVuln] 失败: ${err.message}`);
  }

  // =============================================================
  // 限制 UA 列表大小（避免无限膨胀）
  // =============================================================
  const MAX_UAS = 200;
  const uaArray = [...newUAs];
  let finalUAs = uaArray;
  if (uaArray.length > MAX_UAS) {
    // 保留原始的 + 新增的按字母排序取前 MAX_UAS 个
    finalUAs = uaArray.slice(0, MAX_UAS);
    console.log(`\nUA 列表超过 ${MAX_UAS}，截断`);
  }

  // 限制 WAF 模式大小
  const MAX_PATTERNS = 50;
  const limitPatterns = (set) => {
    const arr = [...set];
    return arr.length > MAX_PATTERNS ? arr.slice(0, MAX_PATTERNS) : arr;
  };

  // 更新配置
  config.blocked_user_agents = finalUAs;
  config.waf_patterns.sql_injection = limitPatterns(newSqliPatterns);
  config.waf_patterns.xss = limitPatterns(newXssPatterns);
  config.waf_patterns.php_malicious = limitPatterns(newPhpPatterns);
  config.last_updated = new Date().toISOString();
  config.version += 1;

  if (changelog.length > 0) {
    config.changelog = [
      {
        date: new Date().toISOString().split('T')[0],
        changes: changelog,
        version: config.version,
      },
      ...(config.changelog || []),
    ].slice(0, 30); // 保留最近 30 条记录
  }

  // 统计
  const newWafCount = Object.values(config.waf_patterns).flat().length;
  console.log('\n=== 同步完成 ===');
  console.log(`UA 规则: ${oldUACount} → ${finalUAs.length} (+${finalUAs.length - oldUACount})`);
  console.log(`WAF 模式: ${oldWafCount} → ${newWafCount} (+${newWafCount - oldWafCount})`);
  console.log(`变更: ${changelog.length} 项`);
  if (changelog.length > 0) {
    changelog.forEach(c => console.log(`  ${c}`));
  }

  // 写入文件
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf8');
  console.log(`\n配置已写入: ${CONFIG_PATH}`);

  // 如果有变更，输出标记供 CI 检测
  if (changelog.length > 0) {
    console.log('\n::CHANGES_DETECTED::');
    // 写入变更标记文件供 GitHub Actions 检测
    fs.writeFileSync(path.join(__dirname, '.threat-changed'), new Date().toISOString());
  } else {
    console.log('\n无新变更');
  }
}

main().catch(err => {
  console.error('同步失败:', err);
  process.exit(1);
});
