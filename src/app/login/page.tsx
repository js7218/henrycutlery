'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, Eye, EyeOff, LogIn, Phone, ShieldCheck, KeyRound } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { getSafeReturnPathFromBrowser } from '@/lib/safeNavigation';

// ============================================================================
// SECURITY: Input Sanitization & Validation
// ============================================================================

// SQL Injection blacklist - 严格禁止的SQL关键字和特殊字符
const SQL_BLACKLIST = [
  'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER', 'TRUNCATE',
  'EXEC', 'EXECUTE', 'UNION', 'UNION ALL', 'WAITFOR', 'DELAY', 'BENCHMARK',
  'SLEEP', 'PG_SLEEP', 'LOAD_FILE', 'INTO OUTFILE', 'INTO DUMPFILE',
  'INFORMATION_SCHEMA', 'SYS.DATABASES', 'SYS.OBJECTS', 'SYS.TABLES',
  'MYSQL.USER', 'PG_CATALOG', 'MASTER..XP_CMDSHELL',
  'OR 1=1', 'OR 1 = 1', 'OR 1=2', 'AND 1=1', 'AND 1 = 1',
  'OR TRUE', 'OR FALSE', 'AND TRUE', 'AND FALSE',
  "' OR '", '" OR "', "' AND '", '" AND "',
  '--', '/*', '*/', ';--', ';%00', 'CHAR(', 'CONCAT(', 'GROUP_CONCAT',
  '0x', '0X', 'HEX(', 'UNHEX(', 'ASCII(', 'ORD(',
  'SCRIPT', 'ALERT', 'DOCUMENT.COOKIE', 'WINDOW.LOCATION',
];

// XSS blacklist
const XSS_BLACKLIST = [
  '<SCRIPT', '</SCRIPT', 'JAVASCRIPT:', 'VBSCRIPT:', 'DATA:',
  'ONERROR=', 'ONLOAD=', 'ONCLICK=', 'ONMOUSEOVER=', 'ONFOCUS=',
  '<IFRAME', '<OBJECT', '<EMBED', '<APPLET', '<SVG', '<FORM',
  'EVAL(', 'EXECSCRIPT', 'EXPRESSION(', 'STYLE=', 'BEHAVIOR:',
];

// Command injection blacklist
const CMD_BLACKLIST = [
  ';', '|', '&&', '||', '`', '$(', '${', '>', '<', '>>',
  'CAT ', 'LS ', 'DIR ', 'RM ', 'DEL ', 'ECHO ', 'WGET ', 'CURL ',
  'NC ', 'NETCAT ', 'PYTHON ', 'PERL ', 'RUBY ', 'BASH ', 'SH ',
  'POWERSHELL ', 'CMD.EXE ', 'COMMAND.COM ',
  '../', '..\\', '/ETC/', '/PROC/', '/VAR/',
];

// Dangerous characters that could be used for injection
const DANGEROUS_CHARS = /[;'"`\|&$<>{}\[\]\(\)\*\?\^\~\!\#\%\@]/;

// Email validation regex (strict)
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// Phone validation regex
const PHONE_REGEX = /^\+[1-9]\d{0,3}\s?[0-9][0-9\s().-]{5,30}$/;

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const LOGIN_ATTEMPTS_KEY = 'login_attempts_v2';
const OLD_LOGIN_ATTEMPTS_KEY = 'login_attempts';

const COUNTRY_CODES = [
  { code: '+86', label: 'China +86' },
  { code: '+1', label: 'US/Canada +1' },
  { code: '+44', label: 'UK +44' },
  { code: '+61', label: 'Australia +61' },
  { code: '+49', label: 'Germany +49' },
  { code: '+33', label: 'France +33' },
  { code: '+39', label: 'Italy +39' },
  { code: '+34', label: 'Spain +34' },
  { code: '+81', label: 'Japan +81' },
  { code: '+82', label: 'Korea +82' },
  { code: '+65', label: 'Singapore +65' },
  { code: '+60', label: 'Malaysia +60' },
  { code: '+66', label: 'Thailand +66' },
  { code: '+971', label: 'UAE +971' },
  { code: '+966', label: 'Saudi Arabia +966' },
  { code: '+91', label: 'India +91' },
  { code: '+52', label: 'Mexico +52' },
  { code: '+55', label: 'Brazil +55' },
  { code: '+27', label: 'South Africa +27' },
];

interface SecurityError {
  field: string;
  message: string;
  code: string;
}

// ============================================================================
// SECURITY: Input Sanitization Function
// ============================================================================
function sanitizeInput(input: string, fieldName: string): { sanitized: string; errors: SecurityError[] } {
  const errors: SecurityError[] = [];

  if (typeof input !== 'string') {
    return { sanitized: '', errors: [{ field: fieldName, message: 'Invalid input type', code: 'TYPE_ERROR' }] };
  }

  let sanitized = input.trim();

  // Check for null bytes (null byte injection)
  if (sanitized.includes('\0') || sanitized.includes('\x00')) {
    errors.push({ field: fieldName, message: 'Null byte detected', code: 'NULL_BYTE' });
    sanitized = sanitized.replace(/\0|\x00/g, '');
  }

  // Check length (prevent buffer overflow / DoS)
  if (sanitized.length > 255) {
    errors.push({ field: fieldName, message: 'Input too long (max 255 characters)', code: 'LENGTH_EXCEEDED' });
    sanitized = sanitized.substring(0, 255);
  }

  const isFreeFormField = ['email', 'password', 'identifier', 'code'].includes(fieldName);
  if (!isFreeFormField && DANGEROUS_CHARS.test(sanitized)) {
    errors.push({ field: fieldName, message: 'Dangerous characters detected', code: 'DANGEROUS_CHARS' });
    sanitized = sanitized.replace(DANGEROUS_CHARS, '');
  }

  const skipPatternScan = ['password', 'confirmPassword'].includes(fieldName);

  // Check SQL injection keywords (case-insensitive)
  const upperInput = sanitized.toUpperCase();
  if (!skipPatternScan) {
    for (const keyword of SQL_BLACKLIST) {
      if (upperInput.includes(keyword)) {
        errors.push({ field: fieldName, message: `SQL injection pattern detected: ${keyword}`, code: 'SQL_INJECTION' });
        // Remove the dangerous keyword
        const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        sanitized = sanitized.replace(regex, '');
      }
    }

    // Check XSS patterns
    for (const pattern of XSS_BLACKLIST) {
      if (upperInput.includes(pattern)) {
        errors.push({ field: fieldName, message: `XSS pattern detected: ${pattern}`, code: 'XSS_ATTEMPT' });
        const regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        sanitized = sanitized.replace(regex, '');
      }
    }

    // Check command injection
    for (const cmd of CMD_BLACKLIST) {
      if (upperInput.includes(cmd)) {
        errors.push({ field: fieldName, message: `Command injection detected: ${cmd}`, code: 'CMD_INJECTION' });
        const regex = new RegExp(cmd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        sanitized = sanitized.replace(regex, '');
      }
    }
  }

  if (!isFreeFormField) {
    sanitized = sanitized
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  return { sanitized, errors };
}

// ============================================================================
// SECURITY: Validation Functions
// ============================================================================
function validateEmailStrict(email: string): { valid: boolean; error?: string } {
  if (!email || email.trim() === '') {
    return { valid: false, error: 'Email is required' };
  }

  if (email.length > 254) {
    return { valid: false, error: 'Email too long' };
  }

  if (!EMAIL_REGEX.test(email)) {
    return { valid: false, error: 'Invalid email format' };
  }

  // Check for common attack patterns in email
  const upperEmail = email.toUpperCase();
  if (upperEmail.includes('OR 1=1') || upperEmail.includes('DROP') || upperEmail.includes('SELECT')) {
    return { valid: false, error: 'Email contains invalid characters' };
  }

  return { valid: true };
}

function validatePasswordStrict(password: string): { valid: boolean; error?: string } {
  if (!password) {
    return { valid: false, error: 'Password is required' };
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    return { valid: false, error: `Password must not exceed ${PASSWORD_MAX_LENGTH} characters` };
  }

  return { valid: true };
}

function validateIdentifier(identifier: string): { valid: boolean; type: 'email' | 'phone'; error?: string } {
  if (!identifier || identifier.trim() === '') {
    return { valid: false, type: 'email', error: 'Please enter email or phone number' };
  }

  if (identifier.length > 254) {
    return { valid: false, type: 'email', error: 'Input too long' };
  }

  // Check if it's an email
  if (EMAIL_REGEX.test(identifier)) {
    const upper = identifier.toUpperCase();
    if (upper.includes('OR 1=1') || upper.includes('DROP') || upper.includes('SELECT')) {
      return { valid: false, type: 'email', error: 'Email contains invalid characters' };
    }
    return { valid: true, type: 'email' };
  }

  // Check if it's a phone number
  if (PHONE_REGEX.test(identifier)) {
    return { valid: true, type: 'phone' };
  }

  return { valid: false, type: 'email', error: 'Please enter a valid email or phone number' };
}

function validateCode(code: string): { valid: boolean; error?: string } {
  if (!code || code.trim() === '') {
    return { valid: false, error: 'Verification code is required' };
  }

  if (!/^\d{6}$/.test(code)) {
    return { valid: false, error: 'Please enter a 6-digit verification code' };
  }

  return { valid: true };
}

// ============================================================================
// SECURITY: Rate Limiting (client-side helper)
// ============================================================================
interface LoginAttempt {
  count: number;
  firstAttempt: number;
  lastAttempt: number;
  lockedUntil: number | null;
  timestamps: number[]; // 记录每次失败的时间戳，用于检测爆破工具
  lockDate: string | null; // 记录锁定日期，用于每日解封
}

function getLoginAttempts(): LoginAttempt {
  localStorage.removeItem(OLD_LOGIN_ATTEMPTS_KEY);
  const stored = localStorage.getItem(LOGIN_ATTEMPTS_KEY);
  if (stored) {
    const parsed = JSON.parse(stored);
    // 每日解封：如果是新的一天，自动解封
    const today = new Date().toISOString().split('T')[0];
    if (parsed.lockDate && parsed.lockDate !== today) {
      return { count: 0, firstAttempt: Date.now(), lastAttempt: 0, lockedUntil: null, timestamps: [], lockDate: null };
    }
    return parsed;
  }
  return { count: 0, firstAttempt: Date.now(), lastAttempt: 0, lockedUntil: null, timestamps: [], lockDate: null };
}

function getActiveLoginLock(): number | null {
  const attempts = getLoginAttempts();
  return attempts.lockedUntil && Date.now() < attempts.lockedUntil ? attempts.lockedUntil : null;
}

function recordLoginFailure(): { allowed: boolean; lockedUntil?: number; attemptsLeft: number; reason?: string } {
  const now = Date.now();
  const attempts = getLoginAttempts();
  const today = new Date().toISOString().split('T')[0];

  // Check if locked
  if (attempts.lockedUntil && now < attempts.lockedUntil) {
    return { allowed: false, lockedUntil: attempts.lockedUntil, attemptsLeft: 0, reason: 'Account is locked' };
  }

  // Reset if lock expired
  if (attempts.lockedUntil && now >= attempts.lockedUntil) {
    attempts.count = 0;
    attempts.lockedUntil = null;
    attempts.timestamps = [];
  }

  // Reset count if more than 15 minutes since first attempt (normal user behavior)
  if (now - attempts.firstAttempt > 15 * 60 * 1000) {
    attempts.count = 0;
    attempts.firstAttempt = now;
    attempts.timestamps = [];
  }

  // Record this attempt timestamp
  attempts.timestamps.push(now);
  attempts.lastAttempt = now;
  attempts.count++;

  // Keep only last 10 timestamps for analysis
  if (attempts.timestamps.length > 10) {
    attempts.timestamps = attempts.timestamps.slice(-10);
  }

  let isBotAttack = false;
  if (attempts.timestamps.length >= 3) {
    const recentTimestamps = attempts.timestamps.slice(-5);
    let consecutiveFastRequests = 0;
    const gaps: number[] = [];
    for (let i = 1; i < recentTimestamps.length; i++) {
      const gap = recentTimestamps[i] - recentTimestamps[i - 1];
      gaps.push(gap);
      if (gap < 800) {
        consecutiveFastRequests++;
      }
    }
    const avgGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
    const variance = gaps.reduce((sum, gap) => sum + Math.pow(gap - avgGap, 2), 0) / gaps.length;
    const stdDev = Math.sqrt(variance);
    const fixedRhythmAttack = gaps.length >= 4 && avgGap >= 1000 && avgGap <= 15000 && stdDev < 350;

    if (consecutiveFastRequests >= 2 || fixedRhythmAttack) {
      isBotAttack = true;
    }
  }

  // 第 11 次登录尝试触发人机验证
  const HUMAN_VERIFICATION_THRESHOLD = 10;

  if (attempts.count > HUMAN_VERIFICATION_THRESHOLD) {
    localStorage.setItem(LOGIN_ATTEMPTS_KEY, JSON.stringify(attempts));
    localStorage.setItem('human_verification_required', 'true');
    window.dispatchEvent(new Event('human-verification-required'));
    return {
      allowed: false,
      attemptsLeft: 0,
      reason: isBotAttack
        ? 'Dictionary or brute-force behavior detected. Please complete human verification.'
        : 'Please complete human verification before continuing.',
    };
  }

  // Lock thresholds
  const LOCK_THRESHOLD = 20; // 人机验证后仍连续失败才进入锁定

  if (attempts.count >= LOCK_THRESHOLD) {
    if (isBotAttack) {
      // 爆破工具/字典攻击：锁定1小时
      attempts.lockedUntil = now + 60 * 60 * 1000;
      attempts.lockDate = today;
      localStorage.setItem(LOGIN_ATTEMPTS_KEY, JSON.stringify(attempts));
      return {
        allowed: false,
        lockedUntil: attempts.lockedUntil,
        attemptsLeft: 0,
        reason: 'Automated attack detected. Locked for 1 hour.'
      };
    } else {
      // 正常人：锁定15分钟
      attempts.lockedUntil = now + 15 * 60 * 1000;
      attempts.lockDate = today;
      localStorage.setItem(LOGIN_ATTEMPTS_KEY, JSON.stringify(attempts));
      return {
        allowed: false,
        lockedUntil: attempts.lockedUntil,
        attemptsLeft: 0,
        reason: 'Too many failed attempts. Locked for 15 minutes.'
      };
    }
  }

  localStorage.setItem(LOGIN_ATTEMPTS_KEY, JSON.stringify(attempts));
  return { allowed: true, attemptsLeft: Math.max(0, HUMAN_VERIFICATION_THRESHOLD - attempts.count) };
}

function resetLoginAttempts(): void {
  localStorage.removeItem(OLD_LOGIN_ATTEMPTS_KEY);
  localStorage.removeItem(LOGIN_ATTEMPTS_KEY);
}

// ============================================================================
// Main Login Page Component
// ============================================================================
export default function LoginPage() {
  const router = useRouter();
  const { login, sendVerificationCode, loginWithCode } = useApp();

  // Tab state
  const [activeTab, setActiveTab] = useState<'password' | 'code'>('password');

  // Password login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Code login state
  const [identifier, setIdentifier] = useState('');
  const [countryCode, setCountryCode] = useState('+86');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [codeSending, setCodeSending] = useState(false);

  // Shared state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [securityErrors, setSecurityErrors] = useState<SecurityError[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [lockCountdown, setLockCountdown] = useState(0);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const identifierRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);

  // Check lock status on mount
  useEffect(() => {
    resetLoginAttempts();
    setIsLocked(false);
    setLockCountdown(0);
  }, []);

  // Countdown timer for lock
  useEffect(() => {
    if (!isLocked) return;
    const interval = setInterval(() => {
      const attempts = getLoginAttempts();
      if (attempts.lockedUntil) {
        const remaining = Math.ceil((attempts.lockedUntil - Date.now()) / 1000);
        if (remaining <= 0) {
          setIsLocked(false);
          setLockCountdown(0);
          clearInterval(interval);
        } else {
          setLockCountdown(remaining);
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  });

  // Countdown timer for verification code
  useEffect(() => {
    if (countdown <= 0) return;
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [countdown]);

  const formatCountdown = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // ============================================================================
  // Password Login Handler
  // ============================================================================
  const handlePasswordSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current || isLoading) return;

    setError('');
    setSecurityErrors([]);

    resetLoginAttempts();

    // SECURITY: Sanitize inputs
    const emailSanitized = sanitizeInput(email, 'email');
    const passwordSanitized = sanitizeInput(password, 'password');

    const allErrors = [...emailSanitized.errors, ...passwordSanitized.errors];
    if (allErrors.length > 0) {
      setSecurityErrors(allErrors);
      setError('Security violation detected. Please check your input.');
      return;
    }

    const cleanEmail = emailSanitized.sanitized;
    const cleanPassword = passwordSanitized.sanitized;

    // SECURITY: Validate email format
    const emailValidation = validateEmailStrict(cleanEmail);
    if (!emailValidation.valid) {
      setError(emailValidation.error!);
      return;
    }

    // SECURITY: Validate password
    const passwordValidation = validatePasswordStrict(cleanPassword);
    if (!passwordValidation.valid) {
      setError(passwordValidation.error!);
      return;
    }

    // SECURITY: Check for empty sanitized inputs
    if (!cleanEmail || !cleanPassword) {
      setError('Please enter valid email and password');
      return;
    }

    setIsLoading(true);
    submittingRef.current = true;

    try {
      const success = await login(cleanEmail, cleanPassword);

      if (success) {
        // SECURITY: Reset attempts on successful login
        resetLoginAttempts();
        router.push(getSafeReturnPathFromBrowser() || '/profile');
      } else {
        setError('Incorrect email or password');
      }
    } catch (err) {
      setError('An error occurred during login. Please try again.');
    } finally {
      setIsLoading(false);
      submittingRef.current = false;
    }
  }, [email, password, login, router, isLoading]);

  // ============================================================================
  // Send Verification Code Handler
  // ============================================================================
  const handleSendCode = useCallback(async () => {
    if (codeSending || countdown > 0) return;

    setError('');
    setSecurityErrors([]);

    // SECURITY: Sanitize identifier
    const identifierSanitized = sanitizeInput(identifier, 'identifier');
    if (identifierSanitized.errors.length > 0) {
      setSecurityErrors(identifierSanitized.errors);
      setError('Security violation detected. Please check your input.');
      return;
    }

    const cleanIdentifier = identifierSanitized.sanitized;

    // Determine if email or phone
    const validation = validateIdentifier(cleanIdentifier);
    if (!validation.valid) {
      setError(validation.error!);
      return;
    }

    let finalIdentifier = cleanIdentifier;
    if (validation.type === 'phone') {
      // If user didn't include country code, prepend the selected one
      if (!cleanIdentifier.startsWith('+')) {
        finalIdentifier = `${countryCode} ${cleanIdentifier}`;
      }
    }

    setCodeSending(true);

    try {
      const result = await sendVerificationCode(validation.type, finalIdentifier);
      if (result.success) {
        setCountdown(60);
        setError('');
      } else {
        setError(result.error || 'Failed to send, please try again');
      }
    } catch {
      setError('Network error, please try again');
    } finally {
      setCodeSending(false);
    }
  }, [identifier, countryCode, countdown, codeSending, sendVerificationCode]);

  // ============================================================================
  // Code Login Handler
  // ============================================================================
  const handleCodeSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current || isLoading) return;

    setError('');
    setSecurityErrors([]);

    resetLoginAttempts();

    // SECURITY: Sanitize inputs
    const identifierSanitized = sanitizeInput(identifier, 'identifier');
    const codeSanitized = sanitizeInput(code, 'code');

    const allErrors = [...identifierSanitized.errors, ...codeSanitized.errors];
    if (allErrors.length > 0) {
      setSecurityErrors(allErrors);
      setError('Security violation detected. Please check your input.');
      return;
    }

    const cleanIdentifier = identifierSanitized.sanitized;
    const cleanCode = codeSanitized.sanitized;

    // SECURITY: Validate identifier
    const identifierValidation = validateIdentifier(cleanIdentifier);
    if (!identifierValidation.valid) {
      setError(identifierValidation.error!);
      return;
    }

    // SECURITY: Validate code
    const codeValidation = validateCode(cleanCode);
    if (!codeValidation.valid) {
      setError(codeValidation.error!);
      return;
    }

    let finalIdentifier = cleanIdentifier;
    if (identifierValidation.type === 'phone' && !cleanIdentifier.startsWith('+')) {
      finalIdentifier = `${countryCode} ${cleanIdentifier}`;
    }

    setIsLoading(true);
    submittingRef.current = true;

    try {
      const success = await loginWithCode(identifierValidation.type, finalIdentifier, cleanCode);

      if (success) {
        // SECURITY: Reset attempts on successful login
        resetLoginAttempts();
        router.push(getSafeReturnPathFromBrowser() || '/profile');
      } else {
        setError('Incorrect verification code');
      }
    } catch (err) {
      setError('An error occurred during login. Please try again.');
    } finally {
      setIsLoading(false);
      submittingRef.current = false;
    }
  }, [identifier, code, countryCode, loginWithCode, router, isLoading]);

  // ============================================================================
  // Render
  // ============================================================================
  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gold-gradient mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
            Welcome Back
          </h1>
          <p className="text-gray-400">Sign in to your Adam Cutlery account</p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-8">
          {/* Tabs */}
          <div className="flex mb-6 bg-surfaceLight rounded-lg p-1 border border-border">
            <button
              type="button"
              onClick={() => {
                setActiveTab('password');
                setError('');
                setSecurityErrors([]);
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'password'
                  ? 'bg-gold text-background'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <KeyRound className="w-4 h-4" />
              Password Login
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('code');
                setError('');
                setSecurityErrors([]);
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'code'
                  ? 'bg-gold text-background'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              Code Login
            </button>
          </div>

          {/* Lockout Warning */}
          {isLocked && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-400 font-medium">
                Account temporarily locked
              </p>
              <p className="text-xs text-red-400 mt-1">
                Please wait {formatCountdown(lockCountdown)} before trying again
              </p>
            </div>
          )}

          {/* General Error */}
          {error && !isLocked && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Security Errors Detail */}
          {securityErrors.length > 0 && (
            <div className="mb-6 p-4 bg-orange-500/10 border border-orange-500/30 rounded-lg">
              <p className="text-xs text-orange-400 font-medium mb-2">Security violations detected:</p>
              {securityErrors.map((err, idx) => (
                <p key={idx} className="text-xs text-orange-400">
                  • {err.field}: {err.message} ({err.code})
                </p>
              ))}
            </div>
          )}

          {/* Password Login Form */}
          {activeTab === 'password' && (
            <form onSubmit={handlePasswordSubmit}>
              {/* Email */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    ref={emailRef}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    maxLength={254}
                    autoComplete="email"
                    disabled={isLocked || isLoading}
                    className="w-full pl-12 pr-4 py-3 bg-surfaceLight border border-border rounded-lg text-foreground placeholder:text-gray-500 focus:outline-none focus:border-gold transition-colors disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    ref={passwordRef}
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    maxLength={128}
                    autoComplete="current-password"
                    disabled={isLocked || isLoading}
                    className="w-full pl-12 pr-12 py-3 bg-surfaceLight border border-border rounded-lg text-foreground placeholder:text-gray-500 focus:outline-none focus:border-gold transition-colors disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isLocked || isLoading}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gold transition-colors disabled:opacity-50"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Remember & Forgot */}
              <div className="flex items-center justify-between mb-8">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={isLocked || isLoading}
                    className="w-4 h-4 rounded border-gray-600 bg-surfaceLight text-gold focus:ring-gold focus:ring-offset-0 disabled:opacity-50"
                  />
                  <span className="text-sm text-gray-400">Remember me</span>
                </label>
                <Link href="/forgot-password" className="text-sm text-gold hover:underline">
                  Forgot password?
                </Link>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading || isLocked}
                className="w-full py-4 bg-gold text-background font-medium rounded-lg hover:bg-goldLight transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <span className="w-5 h-5 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                ) : (
                  <>
                    <LogIn className="w-5 h-5" />
                    Sign In
                  </>
                )}
              </button>
            </form>
          )}

          {/* Code Login Form */}
          {activeTab === 'code' && (
            <form onSubmit={handleCodeSubmit}>
              {/* Identifier (Email or Phone) */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Email or Phone Number
                </label>
                <div className="grid grid-cols-[150px_1fr] gap-2">
                  <select
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    disabled={isLocked || isLoading}
                    className="w-full px-3 py-3 bg-surfaceLight border border-border rounded-lg text-foreground focus:outline-none focus:border-gold transition-colors disabled:opacity-50"
                  >
                    {COUNTRY_CODES.map((item) => (
                      <option key={item.code} value={item.code}>{item.label}</option>
                    ))}
                  </select>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                    <input
                      ref={identifierRef}
                      type="text"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="your@email.com or 13800138000"
                      maxLength={254}
                      autoComplete="email"
                      disabled={isLocked || isLoading}
                      className="w-full pl-12 pr-4 py-3 bg-surfaceLight border border-border rounded-lg text-foreground placeholder:text-gray-500 focus:outline-none focus:border-gold transition-colors disabled:opacity-50"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Enter email directly, or select country code and enter phone number.
                </p>
              </div>

              {/* Verification Code */}
              <div className="mb-8">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Verification Code
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                    <input
                      ref={codeRef}
                      type="text"
                      inputMode="numeric"
                      value={code}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                        setCode(val);
                      }}
                      placeholder="6-digit code"
                      maxLength={6}
                      autoComplete="one-time-code"
                      disabled={isLocked || isLoading}
                      className="w-full pl-12 pr-4 py-3 bg-surfaceLight border border-border rounded-lg text-foreground placeholder:text-gray-500 focus:outline-none focus:border-gold transition-colors disabled:opacity-50"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSendCode}
                    disabled={countdown > 0 || codeSending || isLocked || isLoading}
                    className="px-4 py-3 bg-surfaceLight border border-gold text-gold rounded-lg hover:bg-gold/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap text-sm font-medium"
                  >
                    {codeSending ? (
                      <span className="w-4 h-4 border-2 border-gold/30 border-t-gold rounded-full animate-spin inline-block" />
                    ) : countdown > 0 ? (
                      `${countdown}s`
                    ) : (
                      'Send Code'
                    )}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading || isLocked}
                className="w-full py-4 bg-gold text-background font-medium rounded-lg hover:bg-goldLight transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <span className="w-5 h-5 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                ) : (
                  <>
                    <LogIn className="w-5 h-5" />
                    Sign In
                  </>
                )}
              </button>
            </form>
          )}

          {/* Register Link */}
          <p className="text-center mt-6 text-gray-400">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="text-gold hover:underline">
              Register now
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
