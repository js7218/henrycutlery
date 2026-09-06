import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const TOKEN = '844df401e88lef824363f868c9d17d22';
const ENCODING_AES_KEY = 'u6rQqzPhqmSes2PZux0ynL2Gwsfiz6OqkGWrhQG3bku';

/**
 * 企业微信客服回调 URL 验证 + 消息接收
 *
 * GET   → URL 验证（签名校验 + AES 解密 echostr）
 * POST  → 接收消息事件（暂不处理，回 200 避免重试）
 */

// ---- 工具函数：AES-256-CBC 解密 ----
function decode(encryptedBase64: string): string {
  const aesKey = Buffer.from(ENCODING_AES_KEY, 'base64'); // 32 bytes
  const encrypted = Buffer.from(encryptedBase64, 'base64');
  const iv = aesKey.subarray(0, 16);

  const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, iv);
  decipher.setAutoPadding(false);

  let buf = Buffer.concat([decipher.update(encrypted), decipher.final()]);

  // 去掉 PKCS#7 padding
  const padLen = buf[buf.length - 1];
  buf = buf.subarray(0, buf.length - padLen);

  // 解析结构: 16 字节随机数 + 4 字节长度(大端) + 消息 + CorpID
  const msgLen = buf.readUInt32BE(16);
  return buf.subarray(20, 20 + msgLen).toString('utf8');
}

// ---- 签名校验 ----
function verifySignature(
  timestamp: string,
  nonce: string,
  encrypted: string,
  signature: string
): boolean {
  const expected = crypto
    .createHash('sha1')
    .update([TOKEN, timestamp, nonce, encrypted].sort().join(''))
    .digest('hex');
  return expected === signature;
}

// ---- GET：URL 验证 ----
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const timestamp = searchParams.get('timestamp') || '';
  const nonce = searchParams.get('nonce') || '';
  const echostr = searchParams.get('echostr') || '';
  const msg_signature = searchParams.get('msg_signature') || '';

  if (!verifySignature(timestamp, nonce, echostr, msg_signature)) {
    return new NextResponse('verify fail', { status: 403 });
  }

  try {
    const plain = decode(echostr);
    return new NextResponse(plain, { status: 200 });
  } catch (err) {
    console.error('[wecom-kf] decrypt error:', (err as Error).message);
    return new NextResponse('decrypt fail', { status: 403 });
  }
}

// ---- POST：事件推送（暂不做业务处理，回 200 避免企业微信重试） ----
export async function POST() {
  return new NextResponse('', { status: 200 });
}