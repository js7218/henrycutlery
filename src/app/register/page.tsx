'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, Eye, EyeOff, User, Phone, UserPlus, Check, X } from 'lucide-react';
import { useApp } from '@/context/AppContext';

// ============================================================================
// SECURITY: Input Sanitization & Validation (Same as Login)
// ============================================================================

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

const XSS_BLACKLIST = [
  '<SCRIPT', '</SCRIPT', 'JAVASCRIPT:', 'VBSCRIPT:', 'DATA:',
  'ONERROR=', 'ONLOAD=', 'ONCLICK=', 'ONMOUSEOVER=', 'ONFOCUS=',
  '<IFRAME', '<OBJECT', '<EMBED', '<APPLET', '<SVG', '<FORM',
  'EVAL(', 'EXECSCRIPT', 'EXPRESSION(', 'STYLE=', 'BEHAVIOR:',
];

const CMD_BLACKLIST = [
  ';', '|', '&&', '||', '`', '$(', '${', '>', '<', '>>',
  'CAT ', 'LS ', 'DIR ', 'RM ', 'DEL ', 'ECHO ', 'WGET ', 'CURL ',
  'NC ', 'NETCAT ', 'PYTHON ', 'PERL ', 'RUBY ', 'BASH ', 'SH ',
  'POWERSHELL ', 'CMD.EXE ', 'COMMAND.COM ',
  '../', '..\\', '/ETC/', '/PROC/', '/VAR/',
];

const DANGEROUS_CHARS = /[;'"`\|&$<>{}\[\]\(\)\*\?\^\~\!\#\%\@]/;

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const PHONE_REGEX = /^[0-9+\-\s()]{6,20}$/;

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 50;

interface SecurityError {
  field: string;
  message: string;
  code: string;
}

function sanitizeInput(input: string, fieldName: string): { sanitized: string; errors: SecurityError[] } {
  const errors: SecurityError[] = [];
  
  if (typeof input !== 'string') {
    return { sanitized: '', errors: [{ field: fieldName, message: 'Invalid input type', code: 'TYPE_ERROR' }] };
  }
  
  let sanitized = input.trim();
  
  if (sanitized.includes('\0') || sanitized.includes('\x00')) {
    errors.push({ field: fieldName, message: 'Null byte detected', code: 'NULL_BYTE' });
    sanitized = sanitized.replace(/\0|\x00/g, '');
  }
  
  if (sanitized.length > 255) {
    errors.push({ field: fieldName, message: 'Input too long (max 255 characters)', code: 'LENGTH_EXCEEDED' });
    sanitized = sanitized.substring(0, 255);
  }
  
  const isFreeFormField = ['email', 'password', 'confirmPassword', 'phone'].includes(fieldName);
  if (!isFreeFormField && DANGEROUS_CHARS.test(sanitized)) {
    errors.push({ field: fieldName, message: 'Dangerous characters detected', code: 'DANGEROUS_CHARS' });
    sanitized = sanitized.replace(DANGEROUS_CHARS, '');
  }
  
  const upperInput = sanitized.toUpperCase();
  for (const keyword of SQL_BLACKLIST) {
    if (upperInput.includes(keyword)) {
      errors.push({ field: fieldName, message: `SQL injection pattern detected`, code: 'SQL_INJECTION' });
      const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      sanitized = sanitized.replace(regex, '');
    }
  }
  
  for (const pattern of XSS_BLACKLIST) {
    if (upperInput.includes(pattern)) {
      errors.push({ field: fieldName, message: `XSS pattern detected`, code: 'XSS_ATTEMPT' });
      const regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      sanitized = sanitized.replace(regex, '');
    }
  }
  
  for (const cmd of CMD_BLACKLIST) {
    if (upperInput.includes(cmd)) {
      errors.push({ field: fieldName, message: `Command injection detected`, code: 'CMD_INJECTION' });
      const regex = new RegExp(cmd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      sanitized = sanitized.replace(regex, '');
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

function getSafeReturnPath() {
  const nextPath = new URLSearchParams(window.location.search).get('next');
  if (nextPath && nextPath.startsWith('/') && !nextPath.startsWith('//')) return nextPath;

  try {
    const referrer = new URL(document.referrer);
    if (referrer.origin === window.location.origin && !['/login', '/register', '/forgot-password'].includes(referrer.pathname)) {
      return `${referrer.pathname}${referrer.search}`;
    }
  } catch {
    return null;
  }

  return null;
}

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
  const upperEmail = email.toUpperCase();
  if (upperEmail.includes('OR 1=1') || upperEmail.includes('DROP') || upperEmail.includes('SELECT')) {
    return { valid: false, error: 'Email contains invalid characters' };
  }
  return { valid: true };
}

function validatePasswordStrict(password: string): { valid: boolean; error?: string; strength: number } {
  let strength = 0;
  
  if (!password) {
    return { valid: false, error: 'Password is required', strength: 0 };
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { valid: false, error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`, strength: 0 };
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return { valid: false, error: `Password must not exceed ${PASSWORD_MAX_LENGTH} characters`, strength: 0 };
  }
  
  // Calculate strength
  if (password.length >= 12) strength += 1;
  if (/[a-z]/.test(password)) strength += 1;
  if (/[A-Z]/.test(password)) strength += 1;
  if (/[0-9]/.test(password)) strength += 1;
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) strength += 1;
  
  const weakPasswords = ['12345678', 'password', 'qwerty', 'admin123', 'letmein', '123456789', 'abc123', 'password1'];
  if (weakPasswords.includes(password.toLowerCase())) {
    return { valid: false, error: 'Password is too common, please choose a stronger one', strength: 0 };
  }
  
  if (strength < 3) {
    return { valid: false, error: 'Password is too weak. Use uppercase, lowercase, numbers and special characters.', strength };
  }
  
  return { valid: true, strength };
}

function validateName(name: string): { valid: boolean; error?: string } {
  if (!name || name.trim() === '') {
    return { valid: false, error: 'Name is required' };
  }
  if (name.length < NAME_MIN_LENGTH) {
    return { valid: false, error: `Name must be at least ${NAME_MIN_LENGTH} characters` };
  }
  if (name.length > NAME_MAX_LENGTH) {
    return { valid: false, error: `Name must not exceed ${NAME_MAX_LENGTH} characters` };
  }
  // Only allow letters, numbers, spaces, and common name characters
  if (!/^[\u4e00-\u9fa5a-zA-Z0-9\s._-]+$/.test(name)) {
    return { valid: false, error: 'Name contains invalid characters' };
  }
  return { valid: true };
}

function validatePhoneStrict(phone: string): { valid: boolean; error?: string } {
  if (!phone) {
    return { valid: true }; // Phone is optional
  }
  if (!PHONE_REGEX.test(phone)) {
    return { valid: false, error: 'Invalid phone number format' };
  }
  return { valid: true };
}

// ============================================================================
// SECURITY: Rate Limiting for Registration
// ============================================================================
interface RegisterAttempt {
  count: number;
  firstAttempt: number;
  lastAttempt: number;
  lockedUntil: number | null;
  timestamps: number[]; // 记录每次失败的时间戳，用于检测自动化工具
  lockDate: string | null; // 记录锁定日期，用于每日解封
}

function getRegisterAttempts(): RegisterAttempt {
  const stored = localStorage.getItem('register_attempts');
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

function getActiveRegisterLock(): number | null {
  const attempts = getRegisterAttempts();
  return attempts.lockedUntil && Date.now() < attempts.lockedUntil ? attempts.lockedUntil : null;
}

function recordRegisterFailure(): { allowed: boolean; lockedUntil?: number; attemptsLeft: number; reason?: string } {
  const now = Date.now();
  const attempts = getRegisterAttempts();
  const today = new Date().toISOString().split('T')[0];
  
  if (attempts.lockedUntil && now < attempts.lockedUntil) {
    return { allowed: false, lockedUntil: attempts.lockedUntil, attemptsLeft: 0, reason: 'Registration is locked' };
  }
  
  if (attempts.lockedUntil && now >= attempts.lockedUntil) {
    attempts.count = 0;
    attempts.lockedUntil = null;
    attempts.timestamps = [];
  }
  
  // Reset count if more than 1 hour since first attempt
  if (now - attempts.firstAttempt > 60 * 60 * 1000) {
    attempts.count = 0;
    attempts.firstAttempt = now;
    attempts.timestamps = [];
  }
  
  // Record this attempt timestamp
  attempts.timestamps.push(now);
  attempts.lastAttempt = now;
  attempts.count++;
  
  // Keep only last 10 timestamps
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
  
  // Lock thresholds
  const LOCK_THRESHOLD = 8;
  
  if (attempts.count >= LOCK_THRESHOLD) {
    if (isBotAttack) {
      // 自动化工具：锁定1小时
      attempts.lockedUntil = now + 60 * 60 * 1000;
      attempts.lockDate = today;
      localStorage.setItem('register_attempts', JSON.stringify(attempts));
      return { 
        allowed: false, 
        lockedUntil: attempts.lockedUntil, 
        attemptsLeft: 0, 
        reason: 'Automated registration detected. Locked for 1 hour.' 
      };
    } else {
      // 普通连续失败：锁定15分钟
      attempts.lockedUntil = now + 15 * 60 * 1000;
      attempts.lockDate = today;
      localStorage.setItem('register_attempts', JSON.stringify(attempts));
      return { 
        allowed: false, 
        lockedUntil: attempts.lockedUntil, 
        attemptsLeft: 0, 
        reason: 'Too many registration failures. Locked for 15 minutes.' 
      };
    }
  }
  
  localStorage.setItem('register_attempts', JSON.stringify(attempts));
  return { allowed: true, attemptsLeft: LOCK_THRESHOLD - attempts.count };
}

// ============================================================================
// Password Strength Indicator
// ============================================================================
function PasswordStrength({ strength }: { strength: number }) {
  const labels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
  const colors = ['bg-red-500', 'bg-red-400', 'bg-yellow-400', 'bg-yellow-300', 'bg-green-400', 'bg-green-500'];
  
  return (
    <div className="mt-2">
      <div className="flex gap-1 mb-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full ${i < strength ? colors[strength] : 'bg-gray-700'}`}
          />
        ))}
      </div>
      <p className={`text-xs ${strength >= 4 ? 'text-green-400' : strength >= 2 ? 'text-yellow-400' : 'text-red-400'}`}>
        {strength > 0 ? labels[strength] : ''}
      </p>
    </div>
  );
}

function PasswordRequirement({ met, label }: { met: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-1 text-xs ${met ? 'text-green-400' : 'text-gray-500'}`}>
      {met ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      <span>{label}</span>
    </div>
  );
}

function PasswordRequirements({ password }: { password: string }) {
  return (
    <div className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
      <PasswordRequirement met={password.length >= 8} label="At least 8 characters" />
      <PasswordRequirement met={/[a-z]/.test(password)} label="Lowercase letter" />
      <PasswordRequirement met={/[A-Z]/.test(password)} label="Uppercase letter" />
      <PasswordRequirement met={/[0-9]/.test(password)} label="Number" />
      <PasswordRequirement met={/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)} label="Special character" />
      <PasswordRequirement met={validatePasswordStrict(password).valid} label="Password strength qualified" />
    </div>
  );
}

// ============================================================================
// Main Register Page Component
// ============================================================================
export default function RegisterPage() {
  const router = useRouter();
  const { register } = useApp();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [securityErrors, setSecurityErrors] = useState<SecurityError[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [lockCountdown, setLockCountdown] = useState(0);
  const [passwordStrength, setPasswordStrength] = useState(0);
  
  const submittingRef = useRef(false);

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    const result = validatePasswordStrict(value);
    setPasswordStrength(result.strength);
  };

  useEffect(() => {
    const activeLock = getActiveRegisterLock();
    if (activeLock) {
      setIsLocked(true);
      setLockCountdown(Math.ceil((activeLock - Date.now()) / 1000));
    }
  }, []);

  useEffect(() => {
    if (!isLocked) return;
    const interval = setInterval(() => {
      const activeLock = getActiveRegisterLock();
      if (!activeLock) {
        setIsLocked(false);
        setLockCountdown(0);
        clearInterval(interval);
      } else {
        setLockCountdown(Math.ceil((activeLock - Date.now()) / 1000));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isLocked]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current || isLoading) return;

    setError('');
    setSecurityErrors([]);

    const activeLock = getActiveRegisterLock();
    if (activeLock) {
      setIsLocked(true);
      setLockCountdown(Math.ceil((activeLock - Date.now()) / 1000));
      setError('Registration is temporarily locked. Please try again later.');
      return;
    }

    // SECURITY: Sanitize all inputs
    const nameSanitized = sanitizeInput(name, 'name');
    const emailSanitized = sanitizeInput(email, 'email');
    const phoneSanitized = sanitizeInput(phone, 'phone');
    const passwordSanitized = sanitizeInput(password, 'password');
    const confirmSanitized = sanitizeInput(confirmPassword, 'confirmPassword');
    
    const allErrors = [
      ...nameSanitized.errors,
      ...emailSanitized.errors,
      ...phoneSanitized.errors,
      ...passwordSanitized.errors,
      ...confirmSanitized.errors,
    ];
    
    if (allErrors.length > 0) {
      setSecurityErrors(allErrors);
      setError('Security violation detected. Please check your input.');
      return;
    }
    
    const cleanName = nameSanitized.sanitized;
    const cleanEmail = emailSanitized.sanitized;
    const cleanPhone = phoneSanitized.sanitized;
    const cleanPassword = passwordSanitized.sanitized;
    const cleanConfirm = confirmSanitized.sanitized;
    
    // SECURITY: Validate all fields
    const nameValidation = validateName(cleanName);
    if (!nameValidation.valid) {
      setError(nameValidation.error!);
      return;
    }
    
    const emailValidation = validateEmailStrict(cleanEmail);
    if (!emailValidation.valid) {
      setError(emailValidation.error!);
      return;
    }
    
    const phoneValidation = validatePhoneStrict(cleanPhone);
    if (!phoneValidation.valid) {
      setError(phoneValidation.error!);
      return;
    }
    
    const passwordValidation = validatePasswordStrict(cleanPassword);
    if (!passwordValidation.valid) {
      setError(passwordValidation.error!);
      return;
    }
    
    if (cleanPassword !== cleanConfirm) {
      setError('Passwords do not match');
      return;
    }
    
    if (!agreeTerms) {
      setError('Please agree to the Terms of Service and Privacy Policy');
      return;
    }
    
    // SECURITY: Check for empty sanitized inputs
    if (!cleanName || !cleanEmail || !cleanPassword) {
      setError('Please fill in all required fields');
      return;
    }

    setIsLoading(true);
    submittingRef.current = true;
    
    try {
      const success = await register(cleanName, cleanEmail, cleanPassword, cleanPhone);
      
      if (success) {
        localStorage.removeItem('register_attempts');
        router.push(getSafeReturnPath() || '/profile');
      } else {
        const rateCheck = recordRegisterFailure();
        if (!rateCheck.allowed) {
          setIsLocked(true);
          setLockCountdown(Math.ceil((rateCheck.lockedUntil! - Date.now()) / 1000));
          setError(rateCheck.reason || 'Too many registration failures.');
        } else {
          setError(`Registration failed. ${rateCheck.attemptsLeft} attempts remaining.`);
        }
      }
    } catch (err) {
      setError('An error occurred during registration. Please try again.');
    } finally {
      setIsLoading(false);
      submittingRef.current = false;
    }
  }, [name, email, phone, password, confirmPassword, agreeTerms, register, router, isLoading]);

  const formatCountdown = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gold-gradient mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
            Create Account
          </h1>
          <p className="text-gray-400">Join Adam Cutlery</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-xl p-8">
          {/* Lockout Warning */}
          {isLocked && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-400 font-medium">Registration temporarily locked</p>
              <p className="text-xs text-red-400 mt-1">
                Please wait {formatCountdown(lockCountdown)} before trying again
              </p>
            </div>
          )}

          {/* Error */}
          {error && !isLocked && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Security Errors */}
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

          {/* Name */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Username <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your username"
                maxLength={50}
                disabled={isLocked || isLoading}
                className="w-full pl-12 pr-4 py-3 bg-surfaceLight border border-border rounded-lg text-foreground placeholder:text-gray-500 focus:outline-none focus:border-gold transition-colors disabled:opacity-50"
              />
            </div>
          </div>

          {/* Email */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Email Address <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                maxLength={254}
                disabled={isLocked || isLoading}
                className="w-full pl-12 pr-4 py-3 bg-surfaceLight border border-border rounded-lg text-foreground placeholder:text-gray-500 focus:outline-none focus:border-gold transition-colors disabled:opacity-50"
              />
            </div>
          </div>

          {/* Phone */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Phone Number <span className="text-gray-500">(Optional)</span>
            </label>
            <div className="relative">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="138****8888"
                maxLength={11}
                disabled={isLocked || isLoading}
                className="w-full pl-12 pr-4 py-3 bg-surfaceLight border border-border rounded-lg text-foreground placeholder:text-gray-500 focus:outline-none focus:border-gold transition-colors disabled:opacity-50"
              />
            </div>
          </div>

          {/* Password */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Password <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => handlePasswordChange(e.target.value)}
                placeholder="At least 8 characters"
                maxLength={128}
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
            <PasswordStrength strength={passwordStrength} />
            <PasswordRequirements password={password} />
          </div>

          {/* Confirm Password */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Confirm Password <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Enter password again"
                maxLength={128}
                disabled={isLocked || isLoading}
                className="w-full pl-12 pr-4 py-3 bg-surfaceLight border border-border rounded-lg text-foreground placeholder:text-gray-500 focus:outline-none focus:border-gold transition-colors disabled:opacity-50"
              />
            </div>
            {confirmPassword && (
              <div className="flex items-center gap-1 mt-1">
                {password === confirmPassword ? (
                  <>
                    <Check className="w-3 h-3 text-green-400" />
                    <span className="text-xs text-green-400">Passwords match</span>
                  </>
                ) : (
                  <>
                    <X className="w-3 h-3 text-red-400" />
                    <span className="text-xs text-red-400">Passwords do not match</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Terms */}
          <div className="mb-8">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                disabled={isLocked || isLoading}
                className="w-4 h-4 mt-0.5 rounded border-gray-600 bg-surfaceLight text-gold focus:ring-gold focus:ring-offset-0 disabled:opacity-50"
              />
              <span className="text-sm text-gray-400">
                I have read and agree to the{' '}
                <a href="#" className="text-gold hover:underline">Terms of Service</a>
                {' '}and{' '}
                <a href="#" className="text-gold hover:underline">Privacy Policy</a>
              </span>
            </label>
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
                <UserPlus className="w-5 h-5" />
                Register
              </>
            )}
          </button>

          {/* Login Link */}
          <p className="text-center mt-6 text-gray-400">
            Already have an account?{' '}
            <Link href="/login" className="text-gold hover:underline">
              Sign In
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
