'use client';

import Link from 'next/link';
import { Heart, Mail, Phone, MapPin } from 'lucide-react';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-surface border-t border-border">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          {/* Brand */}
          <div>
            <h3 className="text-2xl font-bold text-gold-gradient mb-4" style={{ fontFamily: 'Playfair Display, serif' }}>
              ADAM CUTLERY
            </h3>
            <p className="text-sm text-gray-400 leading-relaxed mb-6">
              Professional premium knife platform, featuring masterworks from top forgers worldwide.
            </p>
            <div className="flex space-x-4">
              <a href="#" className="w-10 h-10 bg-surfaceLight rounded-full flex items-center justify-center text-gray-400 hover:text-gold hover:bg-gold/10 transition-colors">
                <span className="text-sm">W</span>
              </a>
              <a href="#" className="w-10 h-10 bg-surfaceLight rounded-full flex items-center justify-center text-gray-400 hover:text-gold hover:bg-gold/10 transition-colors">
                <span className="text-sm">B</span>
              </a>
              <a href="#" className="w-10 h-10 bg-surfaceLight rounded-full flex items-center justify-center text-gray-400 hover:text-gold hover:bg-gold/10 transition-colors">
                <span className="text-sm">I</span>
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-sm font-semibold text-gold mb-4">Quick Links</h4>
            <ul className="space-y-3">
              <li><Link href="/products" className="text-sm text-gray-400 hover:text-gold transition-colors">All Products</Link></li>
              <li><Link href="/products?category=kitchen" className="text-sm text-gray-400 hover:text-gold transition-colors">Kitchen Knives</Link></li>
              <li><Link href="/products?category=folding" className="text-sm text-gray-400 hover:text-gold transition-colors">Folding Knives</Link></li>
              <li><Link href="/products?featured=true" className="text-sm text-gray-400 hover:text-gold transition-colors">Featured</Link></li>
            </ul>
          </div>

          {/* Customer Service */}
          <div>
            <h4 className="text-sm font-semibold text-gold mb-4">Customer Service</h4>
            <ul className="space-y-3">
              <li><Link href="#" className="text-sm text-gray-400 hover:text-gold transition-colors">Help Center</Link></li>
              <li><Link href="#" className="text-sm text-gray-400 hover:text-gold transition-colors">Shipping Info</Link></li>
              <li><Link href="#" className="text-sm text-gray-400 hover:text-gold transition-colors">Care Guide</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-sm font-semibold text-gold mb-4">Contact Us</h4>
            <ul className="space-y-4">
              <li className="flex items-start space-x-3">
                <MapPin className="w-4 h-4 text-steel mt-1 flex-shrink-0" />
                <span className="text-sm text-gray-400">No.42, Jianglang Road, Jiangcheng Town, Yangjiang City, Guangdong Province, PRC</span>
              </li>
              <li className="flex items-center space-x-3">
                <Phone className="w-4 h-4 text-steel flex-shrink-0" />
                <a href="tel:+8617303092105" className="text-sm text-gray-400 hover:text-gold transition-colors">+86 17303092105</a>
              </li>
              <li className="flex items-center space-x-3">
                <Mail className="w-4 h-4 text-steel flex-shrink-0" />
                <a href="mailto:rjyy_88@qq.com" className="text-sm text-gray-400 hover:text-gold transition-colors">rjyy_88@qq.com</a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-8 border-t border-border">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <p className="text-xs text-gray-500">
              © {currentYear} Adam Cutlery. All rights reserved.
            </p>
            <div className="flex space-x-6">
              <a href="#" className="text-xs text-gray-500 hover:text-gold transition-colors">Privacy Policy</a>
              <a href="#" className="text-xs text-gray-500 hover:text-gold transition-colors">Terms of Service</a>
              <a href="#" className="text-xs text-gray-500 hover:text-gold transition-colors">Sitemap</a>
            </div>
          </div>
          <p className="text-xs text-gray-600 text-center mt-4">
            Knives displayed on this website are for collection and legitimate use only. Purchasers must be 18 years or older.
          </p>
        </div>
      </div>
    </footer>
  );
}
