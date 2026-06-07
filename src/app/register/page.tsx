'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, Eye, EyeOff, User, Phone, UserPlus } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { validateEmail, validatePhone } from '@/lib/utils';

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name || !email || !password || !confirmPassword) {
      setError('Please fill in all required fields');
      return;
    }

    if (!validateEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!agreeTerms) {
      setError('Please agree to the Terms of Service and Privacy Policy');
      return;
    }

    setIsLoading(true);
    const success = await register(name, email, password);
    setIsLoading(false);

    if (success) {
      router.push('/profile');
    } else {
      setError('Registration failed, please try again');
    }
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
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
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
                className="w-full pl-12 pr-4 py-3 bg-surfaceLight border border-border rounded-lg text-foreground placeholder:text-gray-500 focus:outline-none focus:border-gold transition-colors"
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
                className="w-full pl-12 pr-4 py-3 bg-surfaceLight border border-border rounded-lg text-foreground placeholder:text-gray-500 focus:outline-none focus:border-gold transition-colors"
              />
            </div>
          </div>

          {/* Phone (Optional) */}
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
                className="w-full pl-12 pr-4 py-3 bg-surfaceLight border border-border rounded-lg text-foreground placeholder:text-gray-500 focus:outline-none focus:border-gold transition-colors"
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
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="w-full pl-12 pr-12 py-3 bg-surfaceLight border border-border rounded-lg text-foreground placeholder:text-gray-500 focus:outline-none focus:border-gold transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gold transition-colors"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
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
                className="w-full pl-12 pr-4 py-3 bg-surfaceLight border border-border rounded-lg text-foreground placeholder:text-gray-500 focus:outline-none focus:border-gold transition-colors"
              />
            </div>
          </div>

          {/* Terms */}
          <div className="mb-8">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-gray-600 bg-surfaceLight text-gold focus:ring-gold focus:ring-offset-0"
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
            disabled={isLoading}
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
