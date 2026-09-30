/**
 * DeepSeek LLM 适配器（OpenAI 兼容协议）。
 *
 * 需要的环境变量：
 *   DEEPSEEK_API_KEY   —— 必填，未配置时调用方应走 dry-run
 *   DEEPSEEK_BASE_URL  —— 可选，默认 https://api.deepseek.com
 *   DEEPSEEK_MODEL     —— 可选，默认 deepseek-chat
 */

const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_MODEL = 'deepseek-chat';

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export function isLlmConfigured(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

export function llmModelName(): string {
  return process.env.DEEPSEEK_MODEL || DEFAULT_MODEL;
}

/**
 * 请求模型并返回 JSON 字符串。使用 json_object 响应格式，
 * 由调用方负责解析与校验。
 */
export async function chatJson(messages: ChatMessage[]): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not configured');
  }

  const baseUrl = (process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: llmModelName(),
      messages,
      temperature: 0.7,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DeepSeek request failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;

  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('DeepSeek returned empty content');
  }

  return content;
}