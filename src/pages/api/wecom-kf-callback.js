const TOKEN = 'rDlass26cqmA4o';
const ENCODING_AES_KEY = 'u6rQqzPhqmSes2PZux0ynL2Gwsfiz6OqkGWrhQG3bku';

/**
 * 企业微信客服回调 URL 验证 + 消息接收
 *
 * GET   → URL 验证（签名校验 + AES 解密 echostr）
 * POST  → 接收消息事件（暂不处理，回 200 避免重试）
 */

// ---- 工具函数：AES-256-CBC 解密 ----
function decode(encryptedBase64) {
  const crypto = require('crypto');

  const aesKey = Buffer.from(ENCODING_AES_KEY, 'base64');        // 32 bytes
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
function verifySignature(timestamp, nonce, encrypted, signature) {
  const crypto = require('crypto');
  const expected = crypto
    .createHash('sha1')
    .update([TOKEN, timestamp, nonce, encrypted].sort().join(''))
    .digest('hex');
  return expected === signature;
}

// ---- 路由 ----
export default async function handler(req, res) {
  // GET：URL 验证
  if (req.method === 'GET') {
    const { timestamp = '', nonce = '', echostr = '', msg_signature = '' } = req.query;

    if (!verifySignature(timestamp, nonce, echostr, msg_signature)) {
      res.status(403).send('verify fail');
      return;
    }

    try {
      const plain = decode(echostr);
      res.status(200).send(plain);
    } catch (err) {
      console.error('[wecom-kf] decrypt error:', err.message);
      res.status(403).send('decrypt fail');
    }
    return;
  }

  // POST：事件推送（暂不做业务处理，回 200 避免企业微信重试）
  res.status(200).send('');
}