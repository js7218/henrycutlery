'use client';

import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Clock, Mail, Phone, HelpCircle, Send, Bot } from 'lucide-react';
import { products } from '@/data/products';
import type { Product } from '@/types';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Sender = 'user' | 'bot';

interface ChatMessage {
  id: string;
  sender: Sender;
  text: string;
  timestamp: Date;
  products?: Product[];
  quickReplies?: string[];
}

interface BotReply {
  text: string;
  products?: Product[];
  quickReplies: string[];
}

/* ------------------------------------------------------------------ */
/*  Static data (FAQ / contact kept from the original widget)          */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Rule-based response engine                                         */
/* ------------------------------------------------------------------ */

const pickByCategory = (category: string, limit = 3): Product[] =>
  products.filter((p) => p.category === category).slice(0, limit);

const pickDamascus = (limit = 3): Product[] =>
  products
    .filter(
      (p) =>
        p.tags.includes('damascus') ||
        p.description.toLowerCase().includes('damascus')
    )
    .slice(0, limit);

const featuredOverview: Product[] = [
  products.find((p) => p.id === 'titanium-alloy-001'),
  products.find((p) => p.id === 'adam-001'),
  products.find((p) => p.id === 'buck-002'),
].filter(Boolean) as Product[];

const DEFAULT_QUICK_REPLIES = [
  'Show me folding knives',
  "What's your MOQ?",
  'How to order?',
];

function getBotResponse(input: string): BotReply {
  const q = input.toLowerCase().trim();
  const has = (...keywords: string[]) => keywords.some((k) => q.includes(k));
  const greeting = /\b(hi|hello|hey|howdy|greetings|good\s*(morning|afternoon|evening))\b/;

  /* 1. Greeting */
  if (greeting.test(q) && !has('moq', 'ship', 'pay', 'order', 'price')) {
    return {
      text:
        "Hi there! I'm Adam, your Adam Cutlery support assistant. I can help you find the right knives, explain MOQ & pricing, OEM/ODM customization, shipping, and payment. What would you like to know?",
      quickReplies: DEFAULT_QUICK_REPLIES,
    };
  }

  /* 2. Thanks */
  if (has('thank', 'thanks', 'thx', 'appreciate')) {
    return {
      text:
        "You're very welcome! Is there anything else I can help you with — maybe browsing knives or ordering details?",
      quickReplies: ['Show me knives', 'How to order?', "What's your MOQ?"],
    };
  }

  /* 3. Product categories */
  if (has('folding', 'fold', 'ball bearing', 'ball-bearing', 'edc', 'pocket')) {
    return {
      text:
        "We have a great selection of folding / ball-bearing knives — from CNC titanium & Damascus models to affordable D2 + G10 EDC folders. Here are a few popular ones:",
      products: pickByCategory('folding'),
      quickReplies: ['Show kitchen knives', "What's your MOQ?", 'OEM/ODM services'],
    };
  }

  if (has('kitchen', 'chef', 'cooking', 'vegetable', 'sashimi', 'fish head', 'boning', 'culinary')) {
    return {
      text:
        "Our kitchen knives include Damascus chef sets, boning, sashimi, and vegetable knives — hand-forged and VG-10 options available. Take a look:",
      products: pickByCategory('kitchen'),
      quickReplies: ['Show folding knives', "What's your MOQ?", 'How to order?'],
    };
  }

  if (has('hunting', 'outdoor', 'fixed blade', 'fixed-blade', 'survival', 'camp', 'bushcraft')) {
    return {
      text:
        "Our hunting & outdoor fixed-blade knives come with D2 or 5Cr15 blades, full-tang G10/wood handles, and leather or Kydex sheaths. Here are some options:",
      products: pickByCategory('hunting'),
      quickReplies: ['Show folding knives', "What's your MOQ?", 'Shipping info'],
    };
  }

  if (has('collection', 'collect', 'collector', 'high-end', 'luxury', 'heirloom')) {
    return {
      text:
        "For collectors, our flagship piece is a true heirloom — Austrian M390 powder steel, mammoth molar & ebony handle, and an Italian vegetable-tanned leather sheath. MOQ starts at just 1 piece:",
      products: pickByCategory('collection'),
      quickReplies: ["What's your MOQ?", 'OEM/ODM services', 'How to order?'],
    };
  }

  if (has('damascus')) {
    return {
      text:
        "We craft several Damascus knives across folding, kitchen, and collection lines. Here are some standout Damascus pieces:",
      products: pickDamascus(),
      quickReplies: ['Show folding knives', 'Show kitchen knives', "What's your MOQ?"],
    };
  }

  /* 4. MOQ */
  if (has('moq', 'minimum', 'min order', 'how many', 'quantity', 'how much can i order')) {
    return {
      text:
        "MOQ (Minimum Order Quantity) varies by product — every product lists its own MOQ. As a guide:\n• Collection knives: MOQ from 1 pc\n• Folding knives: 100–600 pcs\n• Kitchen knives: 100–1200 pcs\n• Hunting knives: typically 1200 pcs\nYou'll find the exact MOQ on each product page. Want me to show you some products?",
      quickReplies: ['Show folding knives', 'Show kitchen knives', 'How to order?'],
    };
  }

  /* 5. OEM / ODM */
  if (has('oem', 'odm', 'custom', 'customize', 'customization', 'logo', 'branding', 'engrav', 'private label')) {
    return {
      text:
        "Yes! We offer full OEM/ODM services:\n• Custom blade steel (D2, M390, VG-10, Damascus, 440)\n• Custom handles (titanium, G10, wood, sandalwood)\n• Logo engraving & custom packaging\n• Small-batch customization (e.g. our Titanium alloy folder accepts custom builds from 300 pcs)\nTell us your idea and we'll make it happen — you can also reach us via the Contact tab.",
      quickReplies: ["What's your MOQ?", 'Show folding knives', 'How to order?'],
    };
  }

  /* 6. Shipping */
  if (has('ship', 'deliver', 'freight', 'tracking', 'express', 'dhl', 'fedex', 'ups', 'lead time')) {
    return {
      text:
        "We ship worldwide! Here's what to expect:\n• Orders processed within 1–2 business days\n• Express: DHL / FedEx / UPS — 3–7 business days\n• Bulk orders: sea freight — 15–35 days\n• A tracking number is emailed once your order ships\nNeed a shipping quote for a specific quantity? Use the Contact tab.",
      quickReplies: ['Payment methods', 'How to order?', "What's your MOQ?"],
    };
  }

  /* 7. Payment */
  if (has('pay', 'payment', 'bank', 'hsbc', 'transfer', 'deposit', 't/t', 'wire', 'invoice', 'pi ')) {
    return {
      text:
        "We accept payment via HSBC bank transfer (T/T) in USD:\n• 30% deposit to confirm your order\n• 70% balance before shipment\n• A Proforma Invoice (PI) is provided for every order\nThis keeps things secure and simple for bulk / B2B orders.",
      quickReplies: ['How to order?', 'Shipping info', "What's your MOQ?"],
    };
  }

  /* 8. Order process */
  if (has('how to order', 'place order', 'how to buy', 'purchase', 'order process', 'ordering') ||
      (has('order') && !has('moq', 'quantity', 'tracking'))) {
    return {
      text:
        "Ordering is easy:\n1. Browse products and pick what you like (or tell us your needs)\n2. Confirm specs, quantity & MOQ with us\n3. We send a Proforma Invoice (PI)\n4. Pay 30% deposit via HSBC bank transfer\n5. Production begins\n6. Pay 70% balance, then we ship\nReady to start? Use the Contact tab to send details.",
      quickReplies: ['Payment methods', 'Shipping info', "What's your MOQ?"],
    };
  }

  /* 9. Pricing */
  if (has('price', 'cost', 'how much', 'quote', 'pricing', 'expensive', 'cheap')) {
    return {
      text:
        "Prices vary by model and material — every product page shows the unit price. For reference:\n• EDC folding knives: from $6.50\n• CNC titanium folders: $86–$96\n• Kitchen knives: $30–$75\n• Collection pieces: from $1,200\nFor bulk pricing, share your target quantity and we'll quote via the Contact tab.",
      quickReplies: ['Show folding knives', 'Show kitchen knives', "What's your MOQ?"],
    };
  }

  /* 10. Contact */
  if (has('contact', 'email', 'phone', 'whatsapp', 'reach you', 'reach us', 'talk to')) {
    return {
      text:
        "You can reach us here:\n• Email: support@adamcutlery.com\n• Phone: +1 (800) 555-0199\nOr use the Contact tab in this widget to send a message directly. We typically reply within one business day.",
      quickReplies: ['Business hours', 'How to order?', 'Shipping info'],
    };
  }

  /* 11. Business hours */
  if (has('hour', 'open', 'close', 'business', 'when can')) {
    return {
      text:
        "Our business hours:\n• Monday–Friday: 9:00 AM – 6:00 PM EST\n• Saturday: 10:00 AM – 4:00 PM EST\n• Sunday: Closed\nLeave a message anytime and we'll respond during business hours.",
      quickReplies: ['How to order?', 'Contact info', "What's your MOQ?"],
    };
  }

  /* 12. General product / catalog browse */
  if (has('product', 'catalog', 'knife', 'knives', 'show me', 'what do you', 'browse', 'recommend')) {
    return {
      text:
        "We carry four main categories:\n• Folding / Ball-bearing knives\n• Kitchen knives\n• Hunting & outdoor knives\n• Collection pieces\nHere are a few featured products to get you started:",
      products: featuredOverview,
      quickReplies: ['Show folding knives', 'Show kitchen knives', "What's your MOQ?"],
    };
  }

  /* 13. Fallback */
  return {
    text:
      "I'm not quite sure I caught that, but I'm here to help! I can assist with product recommendations, MOQ, OEM/ODM, shipping, payment, and ordering. Try one of these:",
    quickReplies: DEFAULT_QUICK_REPLIES,
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const formatTime = (date: Date): string =>
  date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const GREETING_MESSAGE: ChatMessage = {
  id: 'greeting',
  sender: 'bot',
  text:
    "Hi there! I'm Adam, your Adam Cutlery support assistant. I can help you find the right knives, explain MOQ & pricing, OEM/ODM customization, shipping, and payment. What would you like to know?",
  timestamp: new Date(),
  quickReplies: DEFAULT_QUICK_REPLIES,
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'faq' | 'contact'>('chat');
  const [selectedFaq, setSelectedFaq] = useState<number | null>(null);
  const [formData, setFormData] = useState({ name: '', email: '', message: '' });
  const [submitted, setSubmitted] = useState(false);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING_MESSAGE]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const idCounter = useRef(1);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const newId = () => `msg-${Date.now()}-${idCounter.current++}`;

  // Auto-scroll to the latest message / typing indicator
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, activeTab]);

  const sendMessage = (raw: string) => {
    const text = raw.trim();
    if (!text || isTyping) return;

    const userMsg: ChatMessage = {
      id: newId(),
      sender: 'user',
      text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    // Simulate the bot "thinking"
    const delay = 650 + Math.random() * 600;
    window.setTimeout(() => {
      const reply = getBotResponse(text);
      const botMsg: ChatMessage = {
        id: newId(),
        sender: 'bot',
        text: reply.text,
        timestamp: new Date(),
        products: reply.products,
        quickReplies: reply.quickReplies,
      };
      setMessages((prev) => [...prev, botMsg]);
      setIsTyping(false);
    }, delay);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setFormData({ name: '', email: '', message: '' });
    }, 3000);
  };

  // Last bot message drives the visible quick-reply buttons
  const lastBotMessage = [...messages].reverse().find((m) => m.sender === 'bot');
  const visibleQuickReplies =
    !isTyping && activeTab === 'chat' ? lastBotMessage?.quickReplies ?? [] : [];

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="chat-fab fixed right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-[#c9a962] to-[#d4b978] text-[#1a1a1a] flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 active:scale-90"
        aria-label="Open support chat"
      >
        {isOpen ? <X size={24} /> : <MessageCircle size={24} />}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-3 sm:right-6 z-50 w-[calc(100vw-1.5rem)] sm:w-96 max-w-[calc(100vw-3rem)] h-[70vh] sm:h-[560px] max-h-[calc(100vh-7rem)] flex flex-col bg-[#242424] border border-[#c9a962]/20 rounded-xl shadow-2xl overflow-hidden animate-chat-enter">
          {/* Header */}
          <div className="shrink-0 bg-gradient-to-r from-[#c9a962] to-[#d4b978] px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[#1a1a1a]/20 flex items-center justify-center ring-2 ring-[#1a1a1a]/30">
                <Bot size={20} className="text-[#1a1a1a]" />
              </div>
              <div className="flex-1">
                <h3 className="text-[#1a1a1a] font-semibold text-lg leading-tight">Customer Support</h3>
                <p className="text-[#1a1a1a]/70 text-xs flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-600/80" />
                  Adam assistant • online
                </p>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="shrink-0 flex border-b border-[#c9a962]/20">
            <button
              onClick={() => { setActiveTab('chat'); setSelectedFaq(null); }}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                activeTab === 'chat'
                  ? 'text-[#c9a962] border-b-2 border-[#c9a962]'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <Bot size={16} />
                Chat
              </span>
            </button>
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
          <div className="flex-1 min-h-0 overflow-hidden">
            {activeTab === 'chat' ? (
              <div className="flex flex-col h-full">
                {/* Messages */}
                <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
                  {messages.map((msg) => (
                    <MessageBubble key={msg.id} message={msg} />
                  ))}

                  {/* Typing indicator */}
                  {isTyping && (
                    <div className="flex items-end gap-2 animate-message-in">
                      <BotAvatar />
                      <div className="bg-[#1a1a1a]/70 border border-[#c9a962]/15 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-[#c9a962] animate-bounce-dot" style={{ animationDelay: '0s' }} />
                        <span className="w-2 h-2 rounded-full bg-[#c9a962] animate-bounce-dot" style={{ animationDelay: '0.2s' }} />
                        <span className="w-2 h-2 rounded-full bg-[#c9a962] animate-bounce-dot" style={{ animationDelay: '0.4s' }} />
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {/* Quick replies */}
                {visibleQuickReplies.length > 0 && (
                  <div className="shrink-0 px-3 pt-2 pb-1 flex flex-wrap gap-2 border-t border-[#c9a962]/10">
                    {visibleQuickReplies.map((reply) => (
                      <button
                        key={reply}
                        onClick={() => sendMessage(reply)}
                        className="text-xs px-3 py-1.5 rounded-full border border-[#c9a962]/40 text-[#c9a962] hover:bg-[#c9a962]/10 transition-colors"
                      >
                        {reply}
                      </button>
                    ))}
                  </div>
                )}

                {/* Input */}
                <form
                  onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
                  className="shrink-0 p-3 border-t border-[#c9a962]/20 flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage(input);
                      }
                    }}
                    placeholder="Ask about knives, MOQ, shipping…"
                    className="flex-1 bg-[#1a1a1a] border border-[#c9a962]/20 rounded-full px-4 py-2.5 text-sm text-gray-200 placeholder:text-gray-500 focus:outline-none focus:border-[#c9a962] transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || isTyping}
                    aria-label="Send message"
                    className="shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-[#c9a962] to-[#d4b978] text-[#1a1a1a] flex items-center justify-center hover:shadow-lg transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Send size={16} />
                  </button>
                </form>
              </div>
            ) : activeTab === 'faq' ? (
              <div className="h-full overflow-y-auto p-4 space-y-2">
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
              <div className="h-full overflow-y-auto p-4">
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

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function BotAvatar() {
  return (
    <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-[#c9a962] to-[#d4b978] p-[1.5px]">
      <div className="w-full h-full rounded-full bg-[#1a1a1a] flex items-center justify-center">
        <Bot size={16} className="text-[#c9a962]" />
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isBot = message.sender === 'bot';

  if (isBot) {
    return (
      <div className="flex items-end gap-2 animate-message-in">
        <BotAvatar />
        <div className="max-w-[78%]">
          <div className="bg-[#1a1a1a]/70 border border-[#c9a962]/15 rounded-2xl rounded-tl-sm px-4 py-2.5">
            <p className="text-sm text-gray-200 whitespace-pre-line leading-relaxed">{message.text}</p>

            {/* Product recommendations */}
            {message.products && message.products.length > 0 && (
              <div className="mt-2.5 space-y-2">
                {message.products.map((p) => (
                  <div
                    key={p.id}
                    className="flex gap-2.5 p-2 rounded-lg bg-[#242424] border border-[#c9a962]/15 hover:border-[#c9a962]/40 transition-colors"
                  >
                    <img
                      src={p.images[0]}
                      alt={p.name}
                      loading="lazy"
                      className="w-11 h-11 rounded-md object-cover bg-[#1a1a1a] shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-200 truncate">{p.name}</p>
                      <p className="text-xs text-gray-500 capitalize">{p.category}</p>
                      <p className="text-xs text-[#c9a962] mt-0.5">
                        ${p.price}
                        <span className="text-gray-500"> · MOQ {p.moq ?? '—'}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <span className="block text-[10px] text-gray-500 mt-1 ml-1">{formatTime(message.timestamp)}</span>
        </div>
      </div>
    );
  }

  // User message
  return (
    <div className="flex items-end justify-end gap-2 animate-message-in">
      <div className="max-w-[78%]">
        <div className="bg-gradient-to-br from-[#c9a962] to-[#d4b978] text-[#1a1a1a] rounded-2xl rounded-tr-sm px-4 py-2.5">
          <p className="text-sm leading-relaxed whitespace-pre-line">{message.text}</p>
        </div>
        <span className="block text-[10px] text-gray-500 mt-1 mr-1 text-right">{formatTime(message.timestamp)}</span>
      </div>
    </div>
  );
}
