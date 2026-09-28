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
 * 正常 UA 样本 —— 准入测试用。
 * 任何新规则只要命中其中任意一条，即判定为"可能误伤"，整条拒绝。
 * 保守策略：宁缺毋滥。
 */
const BENIGN_UA_SAMPLES = [
  // 主流浏览器
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  // 国内浏览器
  'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36 QIHU 360SE',
  'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36 QIHU 360EE',
  'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.25 Safari/537.36 Core/1.70.3877.400 QQBrowser/10.8.4494.400',
  // 微信 / 企业微信
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36 MicroMessenger/7.0.20',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.40',
  // 主流搜索引擎（中间件已放行，绝不能被新规则命中）
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)',
  'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)',
  'Mozilla/5.0 (compatible; DuckDuckBot/1.0; +http://duckduckgo.com/duckduckbot.html)',
  'Sogou web spider/4.0(+http://www.sogou.com/docs/help/webmasters.htm#07)',
  'Mozilla/5.0 (compatible; Applebot/0.1; +http://www.apple.com/go/applebot)',
  // 社交预览 / 监控
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  'Twitterbot/1.0',
  'Pingdom.com_bot_version_1.4',
  'Mozilla/5.0 (compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)',
];

/**
 * 准入校验（保守策略）
 * 一条新规则必须全部通过以下检查才允许入库，否则整条丢弃：
 *  1. 长度 4~100
 *  2. 必须是合法正则
 *  3. 不能有 ReDoS 风险的嵌套量词
 *  4. 绝不能命中任何正常 UA 样本（防误伤）
 */
function validateCandidate(regexStr) {
  if (!regexStr || regexStr.length < 4) return { ok: false, reason: '太短' };
  if (regexStr.length > 100) return { ok: false, reason: '太长' };

  let re;
  try {
    re = new RegExp(regexStr, 'i');
  } catch {
    return { ok: false, reason: '非法正则' };
  }

  // ReDoS 启发式：嵌套量词 / 连续通配
  if (/(\.\*|\.\+|\[[^\]]*\][*+])[*+]/i.test(regexStr) || /\([^)]*[*+][^)]*\)[*+]/i.test(regexStr)) {
    return { ok: false, reason: '疑似 ReDoS' };
  }

  // 误伤测试：命中任一正常 UA 即拒绝
  for (const sample of BENIGN_UA_SAMPLES) {
    if (re.test(sample)) {
      return { ok: false, reason: `会误伤正常 UA: ${sample.slice(0, 50)}...` };
    }
  }
  return { ok: true };
}

/**
 * 从纯文本 UA 列表提取（每行一个 UA，整行作为一个子串匹配）
 * 注意：OWASP 的设计就是"整行匹配"，不能截断成第一个单词，
 * 否则 "fuzz faster" → "fuzz" 这类会被放大成过宽规则。
 */
function parsePlainUAList(text) {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && line.length >= 4)
    // 转义正则特殊字符，作为字面量匹配
    .map(line => line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
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
  // 大小写不敏感去重表（正则匹配本就是 case-insensitive，避免 BFAC/bfac 之类的重复堆积）
  const newUAsLower = new Set([...newUAs].map(u => u.toLowerCase()));
  const newSqliPatterns = new Set(config.waf_patterns.sql_injection || []);
  const newXssPatterns = new Set(config.waf_patterns.xss || []);
  const newPhpPatterns = new Set(config.waf_patterns.php_malicious || []);

  let changelog = [];

  // 1. 拉取 OWASP CRS 扫描器 UA 数据文件
  try {
    console.log('[owaspScannerUAs] 拉取中...');
    const text = await fetch(SOURCES.owaspScannerUAs);
    // scanners-user-agents.data 是纯文本，每行一个 UA（整行匹配）
    const uas = parsePlainUAList(text);
    let added = 0;
    let rejected = 0;
    for (const ua of uas) {
      const key = ua.toLowerCase();
      if (newUAsLower.has(key)) continue;
      // 保守策略：新规则必须先通过准入校验，否则整条丢弃
      const verdict = validateCandidate(ua);
      if (!verdict.ok) {
        rejected++;
        console.log(`  拒绝 "${ua}"（${verdict.reason}）`);
        continue;
      }
      newUAs.add(ua);
      newUAsLower.add(key);
      added++;
    }
    console.log(`[owaspScannerUAs] 获取 ${uas.length} 个，新增 ${added} 个，拒绝 ${rejected} 个`);
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

  // 6. 检查 CISA 已知漏洞（仅记录数量变化，不自动加规则，供人工审核）
  try {
    console.log('\n[cisaVuln] 拉取中...');
    const text = await fetch(SOURCES.cisaVuln);
    const data = JSON.parse(text);
    const recentCount = data.vulnerabilities?.length || 0;
    console.log(`[cisaVuln] ${recentCount} 个已知漏洞`);
    // 只有数量变化时才记入 changelog，避免每天都产生"变更"
    if (config.cisa_known_vulns !== recentCount) {
      changelog.push(`CISA 已知漏洞库: ${config.cisa_known_vulns ?? '未知'} → ${recentCount}`);
      config.cisa_known_vulns = recentCount;
    }
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

  // 只有真正新增了规则/模式时才记版本号和变更历史
  // 否则不产生 diff，就不会有"每天都提交"的噪音
  const hasRealChanges = changelog.length > 0;
  if (hasRealChanges) {
    config.last_updated = new Date().toISOString();
    config.version += 1;
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
  if (hasRealChanges) {
    console.log('\n::CHANGES_DETECTED::');
    // 写入变更标记文件供 GitHub Actions 检测
    fs.writeFileSync(path.join(__dirname, '.threat-changed'), new Date().toISOString());
  } else {
    console.log('\n无新变更（不提交、不部署）');
  }
}

main().catch(err => {
  console.error('同步失败:', err);
  process.exit(1);
});
