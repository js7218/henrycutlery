import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, createHash } from 'crypto';
import nodemailer from 'nodemailer';

const attempts: Record<string, { count: number; resetAt: number }> = {};
const RESET_WINDOW_MS = 15 * 60 * 1000;
const RESET_MAX_ATTEMPTS = 3;

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function isValidPhone(phone: string) {
  return /^[0-9+\-\s()]{6,20}$/.test(phone);
}

function clientKey(request: NextRequest, email: string) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  return createHash('sha256').update(`${ip}:${email.toLowerCase()}`).digest('hex');
}

function rateLimited(key: string) {
  const now = Date.now();
  const record = attempts[key];

  if (!record || now > record.resetAt) {
    attempts[key] = { count: 1, resetAt: now + RESET_WINDOW_MS };
    return false;
  }

  record.count += 1;
  return record.count > RESET_MAX_ATTEMPTS;
}

function smtpReady() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

async function sendRecoveryEmail(email: string, recoveryCode: string) {
  if (!smtpReady()) return;

  const port = Number(process.env.SMTP_PORT || '587');
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject: 'Adam Cutlery Password Reset',
    text: [
      'You requested a password reset for Adam Cutlery.',
      '',
      `Verification code: ${recoveryCode}`,
      'This code expires in 15 minutes.',
      '',
      'If you did not request this, ignore this message and contact support.',
      'For security reasons, Adam Cutlery will never send your original password in plain text.',
    ].join('\n'),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';

    const genericResponse = NextResponse.json({
      success: true,
      message: 'If the email and phone match a customer account, password reset instructions will be sent.',
    });
    genericResponse.headers.set('Cache-Control', 'no-store');

    if (!isValidEmail(email) || !isValidPhone(phone)) {
      return genericResponse;
    }

    const key = clientKey(request, email);
    if (rateLimited(key)) {
      return genericResponse;
    }

    const recoveryCode = randomBytes(3).toString('hex').toUpperCase();
    await sendRecoveryEmail(email, recoveryCode);

    return genericResponse;
  } catch {
    const response = NextResponse.json({
      success: true,
      message: 'If the email and phone match a customer account, password reset instructions will be sent.',
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
