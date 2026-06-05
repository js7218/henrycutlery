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
              BLADE
            </h3>
            <p className="text-sm text-gray-400 leading-relaxed mb-6">
              专注于高端刀具的专业电商平台，汇集全球顶级锻造大师作品，为您呈现极致的刃艺之美。
            </p>
            <div className="flex space-x-4">
              <a href="#" className="w-10 h-10 bg-surfaceLight rounded-full flex items-center justify-center text-gray-400 hover:text-gold hover:bg-gold/10 transition-colors">
                <span className="text-sm">微</span>
              </a>
              <a href="#" className="w-10 h-10 bg-surfaceLight rounded-full flex items-center justify-center text-gray-400 hover:text-gold hover:bg-gold/10 transition-colors">
                <span className="text-sm">博</span>
              </a>
              <a href="#" className="w-10 h-10 bg-surfaceLight rounded-full flex items-center justify-center text-gray-400 hover:text-gold hover:bg-gold/10 transition-colors">
                <span className="text-sm">知</span>
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-sm font-semibold text-gold mb-4">快速链接</h4>
            <ul className="space-y-3">
              <li><Link href="/products" className="text-sm text-gray-400 hover:text-gold transition-colors">全部商品</Link></li>
              <li><Link href="/products?category=kitchen" className="text-sm text-gray-400 hover:text-gold transition-colors">厨刀系列</Link></li>
              <li><Link href="/products?category=damascus" className="text-sm text-gray-400 hover:text-gold transition-colors">大马士革钢</Link></li>
              <li><Link href="/products?featured=true" className="text-sm text-gray-400 hover:text-gold transition-colors">精选推荐</Link></li>
            </ul>
          </div>

          {/* Customer Service */}
          <div>
            <h4 className="text-sm font-semibold text-gold mb-4">客户服务</h4>
            <ul className="space-y-3">
              <li><Link href="#" className="text-sm text-gray-400 hover:text-gold transition-colors">帮助中心</Link></li>
              <li><Link href="#" className="text-sm text-gray-400 hover:text-gold transition-colors">配送说明</Link></li>
              <li><Link href="#" className="text-sm text-gray-400 hover:text-gold transition-colors">退换政策</Link></li>
              <li><Link href="#" className="text-sm text-gray-400 hover:text-gold transition-colors">保养指南</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-sm font-semibold text-gold mb-4">联系我们</h4>
            <ul className="space-y-4">
              <li className="flex items-start space-x-3">
                <MapPin className="w-4 h-4 text-steel mt-1 flex-shrink-0" />
                <span className="text-sm text-gray-400">北京市朝阳区建国路88号现代城大厦</span>
              </li>
              <li className="flex items-center space-x-3">
                <Phone className="w-4 h-4 text-steel flex-shrink-0" />
                <span className="text-sm text-gray-400">400-888-9999</span>
              </li>
              <li className="flex items-center space-x-3">
                <Mail className="w-4 h-4 text-steel flex-shrink-0" />
                <span className="text-sm text-gray-400">contact@blademaster.com</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-8 border-t border-border">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <p className="text-xs text-gray-500">
              © {currentYear} BLADE 刃艺精选. All rights reserved.
            </p>
            <div className="flex space-x-6">
              <a href="#" className="text-xs text-gray-500 hover:text-gold transition-colors">隐私政策</a>
              <a href="#" className="text-xs text-gray-500 hover:text-gold transition-colors">使用条款</a>
              <a href="#" className="text-xs text-gray-500 hover:text-gold transition-colors">网站地图</a>
            </div>
          </div>
          <p className="text-xs text-gray-600 text-center mt-4">
            本网站所展示的刀具仅供收藏与正当用途使用，购买需年满18周岁。
          </p>
        </div>
      </div>
    </footer>
  );
}
