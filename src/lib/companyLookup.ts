/**
 * Advisory company verification for bulk inquiries.
 *
 * A search API (Serper or Tavily) gathers a handful of public results, then
 * DeepSeek judges whether they describe the same company. The verdict is
 * advisory only and must never block or reject an inquiry: every network call
 * is time-boxed and every failure falls back to a local heuristic.
 *
 * Environment variables:
 *   SERPER_API_KEY    —— preferred search provider
 *   TAVILY_API_KEY    —— fallback search provider
 *   DEEPSEEK_API_KEY  —— judge (same names as src/lib/seo/llm.ts)
 *   DEEPSEEK_BASE_URL —— optional, default https://api.deepseek.com
 *   DEEPSEEK_MODEL    —— optional, default deepseek-chat
 */
import { z } from 'zod';

export type CompanyCheckStatus = 'verified' | 'uncertain' | 'not_found' | 'skipped';

export interface CompanyCheck {
  status: CompanyCheckStatus;
  note: string;
  sources: string[];
}

const TIMEOUT_MS = 5000;
const MAX_RESULTS = 6;
const MAX_SOURCES = 3;
const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_MODEL = 'deepseek-chat';

interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

async function searchWithSerper(name: string): Promise<SearchResult[]> {
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': process.env.SERPER_API_KEY || '',
    },
    body: JSON.stringify({ q: `"${name}" company`, num: MAX_RESULTS }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Serper request failed (${res.status})`);
  }

  const data = (await res.json()) as {
    organic?: Array<{ title?: string; snippet?: string; link?: string }>;
  };

  if (!Array.isArray(data.organic)) return [];

  return data.organic
    .slice(0, MAX_RESULTS)
    .map((item) => ({
      title: clean(item.title, 200),
      snippet: clean(item.snippet, 400),
      url: clean(item.link, 500),
    }))
    .filter((item) => item.url);
}

async function searchWithTavily(name: string): Promise<SearchResult[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query: `${name} company`,
      max_results: MAX_RESULTS,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Tavily request failed (${res.status})`);
  }

  const data = (await res.json()) as {
    results?: Array<{ title?: string; content?: string; url?: string }>;
  };

  if (!Array.isArray(data.results)) return [];

  return data.results
    .slice(0, MAX_RESULTS)
    .map((item) => ({
      title: clean(item.title, 200),
      snippet: clean(item.content, 400),
      url: clean(item.url, 500),
    }))
    .filter((item) => item.url);
}

function getSearchProvider(): ((name: string) => Promise<SearchResult[]>) | null {
  if (process.env.SERPER_API_KEY) return searchWithSerper;
  if (process.env.TAVILY_API_KEY) return searchWithTavily;
  return null;
}

const verdictSchema = z.object({
  status: z.enum(['verified', 'uncertain', 'not_found']),
  note: z.string().trim().min(1).max(300),
});

async function judgeCompany(
  name: string,
  results: SearchResult[]
): Promise<z.infer<typeof verdictSchema>> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not configured');
  }

  const baseUrl = (process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const model = process.env.DEEPSEEK_MODEL || DEFAULT_MODEL;

  const resultLines = results
    .slice(0, MAX_RESULTS)
    .map(
      (item, index) =>
        `${index + 1}. ${item.title || '(untitled)'}\n   Snippet: ${item.snippet || '(none)'}\n   URL: ${item.url}`
    )
    .join('\n');

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'You verify companies against web search results. Reply with strict JSON only.',
        },
        {
          role: 'user',
          content: [
            `Company name: ${name}`,
            '',
            'Search results:',
            resultLines,
            '',
            'Decide whether these results describe the same company:',
            '- "verified": the results clearly describe the same company (official site, business registry, news, or directory listing).',
            '- "uncertain": a plausible but not conclusive match.',
            '- "not_found": nothing really matches.',
            '',
            'Reply with strict JSON: {"status":"verified"|"uncertain"|"not_found","note":"one short English sentence"}.',
          ].join('\n'),
        },
      ],
      temperature: 0,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`DeepSeek request failed (${res.status})`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;

  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('DeepSeek returned empty content');
  }

  return verdictSchema.parse(JSON.parse(content));
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function heuristicVerdict(
  name: string,
  results: SearchResult[]
): { status: CompanyCheckStatus; note: string } {
  if (results.length === 0) {
    return { status: 'not_found', note: 'No relevant public results found.' };
  }

  const target = normalize(name);
  const matched =
    target.length > 0 &&
    results.some((item) => normalize(`${item.title} ${item.snippet}`).includes(target));

  if (matched) {
    return {
      status: 'uncertain',
      note: 'Search results mention the company but could not be confirmed.',
    };
  }

  return { status: 'not_found', note: 'No result clearly matches the company.' };
}

/**
 * Look the company up on the web. Never throws: a missing key yields
 * "skipped", and any network/parse failure degrades to a heuristic verdict.
 */
export async function checkCompany(name: string): Promise<CompanyCheck> {
  const company = typeof name === 'string' ? name.trim() : '';

  if (company.length < 2) {
    return { status: 'skipped', note: 'Company name too short', sources: [] };
  }

  const search = getSearchProvider();
  if (!search) {
    return { status: 'skipped', note: 'Company check not configured', sources: [] };
  }

  let results: SearchResult[] = [];
  try {
    results = await search(company);
  } catch (err) {
    console.error(
      '[companyLookup] search failed:',
      err instanceof Error ? err.message : 'Unknown error'
    );
    return { status: 'not_found', note: 'Company search failed.', sources: [] };
  }

  const sources = results.map((item) => item.url).slice(0, MAX_SOURCES);

  if (results.length === 0) {
    return { status: 'not_found', note: 'No relevant public results found.', sources };
  }

  try {
    const verdict = await judgeCompany(company, results);
    return { status: verdict.status, note: verdict.note, sources };
  } catch (err) {
    console.error(
      '[companyLookup] judge failed:',
      err instanceof Error ? err.message : 'Unknown error'
    );
    return { ...heuristicVerdict(company, results), sources };
  }
}
