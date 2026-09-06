const TOKEN = '044df401e801ef824363f868c9d17d22';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { timestamp = '', nonce = '', echostr = '', msg_signature = '' } = req.query;
    const crypto = await import('crypto');
    const expected = crypto
      .createHash('sha1')
      .update([TOKEN, timestamp, nonce, echostr].sort().join(''))
      .digest('hex');
    if (expected === msg_signature) {
      res.status(200).send(echostr);
    } else {
      res.status(403).send('verify fail');
    }
    return;
  }
  res.status(200).send(''); // POST 事件忽略，回 200
}