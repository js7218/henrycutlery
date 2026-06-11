import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(scryptCallback);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${key.toString('hex')}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, salt, keyHex] = storedHash.split(':');
  if (algorithm !== 'scrypt' || !salt || !keyHex) return false;

  const expected = Buffer.from(keyHex, 'hex');
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;

  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
