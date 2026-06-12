export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;

  const normalized = email.trim().toLowerCase();
  const configured = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return configured.includes(normalized) || normalized === 'admin@adamcutlery.com';
}
