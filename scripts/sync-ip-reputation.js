/**
 * 每日拉取黑产/黑客基础设施 IP 情报，写入 threat-intel.json 的 blocked_ips。
 *
 * 数据源：
 *   - Tor 出口节点（匿名代理，黑产常用）
 *   - abuse.ch Feodo Tracker（僵尸网络 C2）
 *   - Spamhaus DROP（被劫持/恶意网段）
 *
 * 只收集精确 IPv4 与被劫持网段；数量设上限，避免中间件体积失控。
 * 拉取失败时跳过该源并保留上一版数据，不会清空已有名单。
 */
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'src', 'config', 'threat-intel.json');
const MARKER = path.join(__dirname, '.threat-changed');

const MAX_EXACT_IPS = 4000;
const MAX_CIDRS = 3000;

const SOURCES = [
  { name: 'tor-exit', url: 'https://check.torproject.org/torbulkexitlist', type: 'ip' },
  { name: 'feodo-c2', url: 'https://feodotracker.abuse.ch/downloads/ipblocklist.txt', type: 'ip' },
  { name: 'spamhaus-drop', url: 'https://www.spamhaus.org/drop/drop.txt', type: 'cidr' },
];

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const CIDR = /^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/;

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'AdamCutlery-ThreatSync/1.0' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function parseFeed(text, type) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    // Spamhaus 行格式: "1.2.3.0/24 ; SBL123"
    const token = line.split(/[;,]/)[0].trim();
    if (type === 'ip' && IPV4.test(token)) out.push(token);
    if (type === 'cidr' && CIDR.test(token)) out.push(token);
  }
  return out;
}

function dedupeSortCap(list, cap) {
  return Array.from(new Set(list)).sort().slice(0, cap);
}

async function syncIpReputation() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const prev = config.blocked_ips || { exact: [], cidrs: [] };

  const exact = [];
  const cidrs = [];
  let ok = 0;

  for (const src of SOURCES) {
    try {
      const items = parseFeed(await fetchText(src.url), src.type);
      if (src.type === 'ip') exact.push(...items);
      else cidrs.push(...items);
      ok += 1;
      console.log(`[ok] ${src.name}: ${items.length}`);
    } catch (e) {
      console.log(`[skip] ${src.name}: ${e.message}`);
    }
  }

  // 所有源都失败时保留上一版，避免把防护清空
  if (ok === 0) {
    console.log('[abort] all sources failed, keeping previous list');
    return;
  }

  const next = {
    exact: dedupeSortCap(exact, MAX_EXACT_IPS),
    cidrs: dedupeSortCap(cidrs, MAX_CIDRS),
  };

  const before = JSON.stringify({ exact: prev.exact || [], cidrs: prev.cidrs || [] });
  const after = JSON.stringify(next);

  if (before !== after) {
    config.blocked_ips = next;
    config.last_updated = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
    fs.writeFileSync(MARKER, 'changed');
    console.log(`[updated] exact=${next.exact.length} cidrs=${next.cidrs.length}`);
  } else {
    console.log('[unchanged]');
  }
}

if (require.main === module) {
  syncIpReputation().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { syncIpReputation };
