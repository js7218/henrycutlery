/**
 * Lightweight, dependency-free spam / abuse classifier for product reviews.
 *
 * The goal is NOT to be a perfect filter; it's to:
 *   1. Auto-approve obviously safe reviews so customers don't wait.
 *   2. Auto-reject obvious spam, malware payloads and abuse.
 *   3. Send anything in between to admin review.
 *
 * Returns:
 *   status:   'approved' | 'pending' | 'rejected'
 *   score:    0 - 100, higher = more suspicious
 *   reason:   short human readable reason (also stored in DB for the admin UI)
 */
export type ReviewClassification = {
  status: 'approved' | 'pending' | 'rejected';
  score: number;
  reason: string;
};

const ATTACK_PATTERNS: { regex: RegExp; weight: number; label: string }[] = [
  { regex: /<\s*script\b/i,                 weight: 100, label: 'script-tag' },
  { regex: /\bon\w+\s*=\s*["']/i,           weight: 100, label: 'inline-event-handler' },
  { regex: /javascript\s*:/i,               weight: 100, label: 'javascript-uri' },
  { regex: /\b(union\s+select|drop\s+table|insert\s+into|delete\s+from)\b/i, weight: 100, label: 'sql-injection' },
  { regex: /\.\.\/\.\.\//,                  weight: 100, label: 'path-traversal' },
];

const SPAM_PATTERNS: { regex: RegExp; weight: number; label: string }[] = [
  { regex: /https?:\/\//gi,                 weight: 25, label: 'external-link' },
  { regex: /\b(viagra|casino|porn|escort|crypto airdrop|\b1xbet\b)\b/i, weight: 60, label: 'spam-keyword' },
  { regex: /telegram[:\s]|whatsapp[:\s]|wechat[:\s]/i, weight: 35, label: 'contact-channel' },
  { regex: /[A-Z\s!]{30,}/,                 weight: 15, label: 'shouting' },
  { regex: /(.)\1{6,}/,                     weight: 20, label: 'character-flood' },
  { regex: /\b(fuck|shit|bitch|asshole|cunt)\b/i, weight: 40, label: 'profanity' },
];

export function classifyReview(input: { content: string; rating: number }): ReviewClassification {
  const content = (input.content || '').trim();
  if (!content) {
    return { status: 'rejected', score: 100, reason: 'Empty content' };
  }
  if (content.length > 2000) {
    return { status: 'rejected', score: 100, reason: 'Content too long' };
  }
  if (input.rating < 1 || input.rating > 5) {
    return { status: 'rejected', score: 100, reason: 'Rating out of range' };
  }

  // Hard-block attacks first.
  for (const p of ATTACK_PATTERNS) {
    if (p.regex.test(content)) {
      return { status: 'rejected', score: 100, reason: `Attack pattern: ${p.label}` };
    }
  }

  let score = 0;
  const labels: string[] = [];
  for (const p of SPAM_PATTERNS) {
    const matches = content.match(p.regex);
    if (matches) {
      score += p.weight * Math.min(matches.length, 3);
      labels.push(p.label);
    }
  }

  // Very short reviews look like dummy text. Bump score slightly.
  if (content.length < 8) {
    score += 15;
    labels.push('too-short');
  }

  if (score >= 70) {
    return { status: 'rejected', score, reason: labels.join(',') };
  }
  if (score >= 25) {
    return { status: 'pending', score, reason: labels.join(',') };
  }
  return { status: 'approved', score, reason: labels.join(',') || 'clean' };
}
