'use client';

import React, { useState } from 'react';
import { MessageCircle, X, Clock, Mail, Phone, HelpCircle, Send } from 'lucide-react';

const faqLinks = [
  { question: 'What is your shipping policy?', answer: 'We offer worldwide shipping. Orders are processed within 1-2 business days. Delivery times vary by location.' },
  { question: 'How do I track my order?', answer: 'Once your order ships, you will receive an email with a tracking number and link.' },
  { question: 'What is your return policy?', answer: 'We accept returns within 30 days of delivery. Items must be unused and in original packaging.' },
  { question: 'Do you offer wholesale pricing?', answer: 'Yes, we offer wholesale pricing for bulk orders. Please contact us for more information.' },
];

const businessHours = [
  { day: 'Monday - Friday', hours: '9:00 AM - 6:00 PM EST' },
  { day: 'Saturday', hours: '10:00 AM - 4:00 PM EST' },
  { day: 'Sunday', hours: 'Closed' },
];

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'faq' | 'contact'>('faq');
  const [selectedFaq, setSelectedFaq] = useState<number | null>(null);
  const [formData, setFormData] = useState({ name: '', email: '', message: '' });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setFormData({ name: '', email: '', message: '' });
    }, 3000);
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-[#c9a962] to-[#d4b978] text-[#1a1a1a] flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
        aria-label="Open support chat"
      >
        {isOpen ? <X size={24} /> : <MessageCircle size={24} />}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-96 max-w-[calc(100vw-3rem)] bg-[#242424] border border-[#c9a962]/20 rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
          {/* Header */}
          <div className="bg-gradient-to-r from-[#c9a962] to-[#d4b978] px-6 py-4">
            <h3 className="text-[#1a1a1a] font-semibold text-lg">Customer Support</h3>
            <p className="text-[#1a1a1a]/70 text-sm">We are here to help you</p>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-[#c9a962]/20">
            <button
              onClick={() => { setActiveTab('faq'); setSelectedFaq(null); }}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                activeTab === 'faq'
                  ? 'text-[#c9a962] border-b-2 border-[#c9a962]'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <HelpCircle size={16} />
                FAQ
              </span>
            </button>
            <button
              onClick={() => setActiveTab('contact')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                activeTab === 'contact'
                  ? 'text-[#c9a962] border-b-2 border-[#c9a962]'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <Mail size={16} />
                Contact
              </span>
            </button>
          </div>

          {/* Content */}
          <div className="max-h-96 overflow-y-auto">
            {activeTab === 'faq' ? (
              <div className="p-4 space-y-2">
                {faqLinks.map((faq, index) => (
                  <div key={index} className="border border-[#c9a962]/10 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setSelectedFaq(selectedFaq === index ? null : index)}
                      className="w-full px-4 py-3 text-left text-sm font-medium text-gray-200 hover:bg-[#c9a962]/5 transition-colors flex items-center justify-between"
                    >
                      {faq.question}
                      <span className={`transform transition-transform ${selectedFaq === index ? 'rotate-180' : ''}`}>
                        ▼
                      </span>
                    </button>
                    {selectedFaq === index && (
                      <div className="px-4 py-3 text-sm text-gray-400 bg-[#1a1a1a]/50 border-t border-[#c9a962]/10">
                        {faq.answer}
                      </div>
                    )}
                  </div>
                ))}

                {/* Business Hours */}
                <div className="mt-4 p-4 bg-[#1a1a1a]/50 rounded-lg border border-[#c9a962]/10">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock size={16} className="text-[#c9a962]" />
                    <span className="text-sm font-medium text-gray-200">Business Hours</span>
                  </div>
                  <div className="space-y-2">
                    {businessHours.map((item, index) => (
                      <div key={index} className="flex justify-between text-sm">
                        <span className="text-gray-400">{item.day}</span>
                        <span className="text-gray-300">{item.hours}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4">
                {submitted ? (
                  <div className="text-center py-8">
                    <div className="w-12 h-12 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center mx-auto mb-3">
                      <Send size={20} />
                    </div>
                    <p className="text-gray-200 font-medium">Message Sent!</p>
                    <p className="text-gray-400 text-sm mt-1">We will get back to you soon.</p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-3">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Name</label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full bg-[#1a1a1a] border border-[#c9a962]/20 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-[#c9a962] transition-colors"
                        placeholder="Your name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Email</label>
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full bg-[#1a1a1a] border border-[#c9a962]/20 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-[#c9a962] transition-colors"
                        placeholder="your@email.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Message</label>
                      <textarea
                        required
                        rows={4}
                        value={formData.message}
                        onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                        className="w-full bg-[#1a1a1a] border border-[#c9a962]/20 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-[#c9a962] transition-colors resize-none"
                        placeholder="How can we help you?"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full bg-gradient-to-r from-[#c9a962] to-[#d4b978] text-[#1a1a1a] font-medium py-2.5 rounded-lg hover:shadow-lg transition-all duration-300 flex items-center justify-center gap-2"
                    >
                      <Send size={16} />
                      Send Message
                    </button>

                    {/* Contact Info */}
                    <div className="pt-3 border-t border-[#c9a962]/10 space-y-2">
                      <a href="mailto:support@adamcutlery.com" className="flex items-center gap-2 text-sm text-gray-400 hover:text-[#c9a962] transition-colors">
                        <Mail size={14} />
                        support@adamcutlery.com
                      </a>
                      <a href="tel:+18005550199" className="flex items-center gap-2 text-sm text-gray-400 hover:text-[#c9a962] transition-colors">
                        <Phone size={14} />
                        +1 (800) 555-0199
                      </a>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
