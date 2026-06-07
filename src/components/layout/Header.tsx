'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  ShoppingCart,
  User,
  Menu,
  X,
  Search,
  Heart,
  LogOut,
  Package,
  MapPin
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { cn } from '@/lib/utils';

export default function Header() {
  const { state, cartCount, logout } = useApp();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const navLinks = [
    { href: '/', label: 'Home' },
    { href: '/products', label: 'All Products' },
    { href: '/products?category=kitchen', label: 'Kitchen' },
    { href: '/products?category=folding', label: 'Folding' },
    { href: '/products?category=fixed', label: 'Fixed' },
    { href: '/products?category=hunting', label: 'Hunting' },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            <span className="text-2xl font-bold text-gold-gradient" style={{ fontFamily: 'Playfair Display, serif' }}>
              ADAM CUTLERY
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center space-x-8">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-gray-300 hover:text-gold transition-colors duration-300"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right Actions */}
          <div className="flex items-center space-x-4">
            {/* Search */}
            <Link href="/products" className="p-2 text-gray-400 hover:text-gold transition-colors">
              <Search className="w-5 h-5" />
            </Link>

            {/* Favorites */}
            {state.user && (
              <Link href="/profile?tab=favorites" className="p-2 text-gray-400 hover:text-gold transition-colors">
                <Heart className="w-5 h-5" />
              </Link>
            )}

            {/* Cart */}
            <Link href="/cart" className="relative p-2 text-gray-400 hover:text-gold transition-colors">
              <ShoppingCart className="w-5 h-5" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-gold text-background text-xs font-bold rounded-full flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </Link>

            {/* User Menu */}
            <div className="relative">
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="p-2 text-gray-400 hover:text-gold transition-colors"
              >
                <User className="w-5 h-5" />
              </button>

              {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-surface border border-border rounded-lg shadow-xl overflow-hidden animate-fade-in">
                  {state.user ? (
                    <>
                      <div className="px-4 py-3 border-b border-border">
                        <p className="text-sm font-medium">{state.user.name}</p>
                        <p className="text-xs text-gray-400">{state.user.email}</p>
                      </div>
                      <Link
                        href="/profile"
                        className="flex items-center px-4 py-2 text-sm text-gray-300 hover:bg-surfaceLight transition-colors"
                        onClick={() => setIsUserMenuOpen(false)}
                      >
                        <User className="w-4 h-4 mr-2" />
                        Profile
                      </Link>
                      <Link
                        href="/profile?tab=orders"
                        className="flex items-center px-4 py-2 text-sm text-gray-300 hover:bg-surfaceLight transition-colors"
                        onClick={() => setIsUserMenuOpen(false)}
                      >
                        <Package className="w-4 h-4 mr-2" />
                        My Orders
                      </Link>
                      <Link
                        href="/profile?tab=addresses"
                        className="flex items-center px-4 py-2 text-sm text-gray-300 hover:bg-surfaceLight transition-colors"
                        onClick={() => setIsUserMenuOpen(false)}
                      >
                        <MapPin className="w-4 h-4 mr-2" />
                        Addresses
                      </Link>
                      <button
                        onClick={() => {
                          logout();
                          setIsUserMenuOpen(false);
                        }}
                        className="w-full flex items-center px-4 py-2 text-sm text-red-400 hover:bg-surfaceLight transition-colors"
                      >
                        <LogOut className="w-4 h-4 mr-2" />
                        Logout
                      </button>
                    </>
                  ) : (
                    <>
                      <Link
                        href="/login"
                        className="block px-4 py-2 text-sm text-gray-300 hover:bg-surfaceLight transition-colors"
                        onClick={() => setIsUserMenuOpen(false)}
                      >
                        Login
                      </Link>
                      <Link
                        href="/register"
                        className="block px-4 py-2 text-sm text-gold hover:bg-surfaceLight transition-colors"
                        onClick={() => setIsUserMenuOpen(false)}
                      >
                        Register
                      </Link>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="lg:hidden p-2 text-gray-400 hover:text-gold transition-colors"
            >
              {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <nav className="lg:hidden py-4 border-t border-border animate-fade-in">
            <div className="flex flex-col space-y-2">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="px-4 py-2 text-sm text-gray-300 hover:text-gold hover:bg-surfaceLight rounded transition-colors"
                  onClick={() => setIsMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
