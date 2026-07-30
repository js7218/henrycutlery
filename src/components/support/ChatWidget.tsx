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
/*  Static data — FAQ rewritten as real knife questions in Adam's voice */
/* ------------------------------------------------------------------ */

const faqLinks = [
  {
    question: "What's the difference between D2 and Damascus steel?",
    answer:
      "D2 is a high-carbon tool steel — tough, holds an edge really well, and it's what we use on most of our folders. Damascus is layered steel, folded over and over, so you get that wavy pattern on the blade. It's gorgeous and performs great too, but it's more about the look and the craftsmanship. If you want rugged everyday use, D2's your steel. If you want something that turns heads, go Damascus.",
  },
  {
    question: 'Can I get my logo on the knives?',
    answer:
      "Absolutely. We do laser engraving and etching on blades and handles, plus custom packaging if you want the full branding treatment. For most folders it starts around 300 pieces, but it depends on the model. Tell me what you've got in mind and I'll figure out the details.",
  },
  {
    question: 'How sharp are the knives when they arrive?',
    answer:
      "Every knife leaves here sharp enough to use right away — we hone them before they ship. The kitchen knives especially; we grind a single-sided 11-degree edge on the Damascus and VG-10 ones, so they're scary sharp out of the box. Just keep them honed and they'll stay that way.",
  },
  {
    question: "What's the lead time on a bulk order?",
    answer:
      "Depends on the size and whether it's custom. Stock items we can usually turn around in a week or two. A full custom run — say, your own steel and handle with an engraved logo — is more like 30 to 45 days since we're making them from scratch. I can give you a proper estimate once I know the quantity.",
  },
  {
    question: 'Do you make kitchen knife sets?',
    answer:
      "We do. Our Damascus Rose set is a four-piece — hand-forged seamless Damascus with sandalwood handles and copper mosaic pins. We also do individual chef, boning, sashimi, and vegetable knives if you'd rather build your own set piece by piece.",
  },
  {
    question: "What's your best knife for a gift?",
    answer:
      "Honestly, it depends who it's for. For a foodie, the Damascus chef knife or the sashimi knife is gorgeous and practical. For a collector or someone who appreciates fine work, our M390 collection piece with the mammoth molar handle is the one — it comes in a brocade box and feels like an heirloom. Tell me about the recipient and I'll point you the right way.",
  },
];

const businessHours = [
  { day: 'Monday - Friday', hours: '9:00 AM - 6:00 PM EST' },
  { day: 'Saturday', hours: '10:00 AM - 4:00 PM EST' },
  { day: 'Sunday', hours: 'Closed' },
];

/* ------------------------------------------------------------------ */
/*  Rule-based response engine — rewritten in Adam's voice              */
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
  'How do I order?',
];

/* Human touches — occasionally prepended to "lookup" answers so Adam
   sounds like he's actually thinking, not just firing back a script. */
const HUMAN_FILLERS = [
  'Let me think for a second... ',
  'From what I know, ',
  'Let me check... ',
];

const withFiller = (text: string): string => {
  if (Math.random() < 0.35) {
    const filler = HUMAN_FILLERS[Math.floor(Math.random() * HUMAN_FILLERS.length)];
    return filler + text.charAt(0).toLowerCase() + text.slice(1);
  }
  return text;
};

function getBotResponse(input: string): BotReply {
  const q = input.toLowerCase().trim();
  const has = (...keywords: string[]) => keywords.some((k) => q.includes(k));
  const greeting = /\b(hi|hello|hey|howdy|greetings|good\s*(morning|afternoon|evening))\b/;

  /* 1. Greeting */
  if (greeting.test(q) && !has('moq', 'ship', 'pay', 'order', 'price')) {
    return {
      text: "Hey there, Adam here. Looking for something in particular, or just browsing?",
      quickReplies: DEFAULT_QUICK_REPLIES,
    };
  }

  /* 2. Thanks */
  if (has('thank', 'thanks', 'thx', 'appreciate')) {
    return {
      text: "Anytime! Anything else I can help with — maybe a specific knife, or walking you through the order?",
      quickReplies: ['Show me knives', 'How do I order?', "What's your MOQ?"],
    };
  }

  /* 3. Product categories */
  if (has('folding', 'fold', 'ball bearing', 'ball-bearing', 'edc', 'pocket')) {
    return {
      text: "Ah, folding knives — that's our bread and butter. We do everything from budget D2 and G10 EDC folders up to CNC titanium and Damascus pieces. Let me pull a few popular ones for you.",
      products: pickByCategory('folding'),
      quickReplies: ['Show kitchen knives', "What's your MOQ?", 'Can you do custom?'],
    };
  }

  if (has('kitchen', 'chef', 'cooking', 'vegetable', 'sashimi', 'fish head', 'boning', 'culinary')) {
    return {
      text: "Kitchen knives? Great choice. We hand-forge Damascus chef sets, plus boning, sashimi, and vegetable knives — VG-10 and Damascus options in there. Here are a few I'd recommend.",
      products: pickByCategory('kitchen'),
      quickReplies: ['Show me folding knives', "What's your MOQ?", 'How do I order?'],
    };
  }

  if (has('hunting', 'outdoor', 'fixed blade', 'fixed-blade', 'survival', 'camp', 'bushcraft')) {
    return {
      text: "Outdoor and hunting — we've got a solid lineup of fixed blades. D2 or 5Cr15 steel, full-tang G10 or wood handles, and they come with leather or Kydex sheaths. Take a look at these.",
      products: pickByCategory('hunting'),
      quickReplies: ['Show me folding knives', "What's your MOQ?", "How's shipping work?"],
    };
  }

  if (has('collection', 'collect', 'collector', 'high-end', 'luxury', 'heirloom')) {
    return {
      text: "Now if you're after something special, our flagship piece is a real heirloom. Austrian M390 powder steel, mammoth molar and ebony handle, hand-carved, and it comes in an Italian vegetable-tanned leather sheath. Best part is you can order just one. Here it is.",
      products: pickByCategory('collection'),
      quickReplies: ["What's your MOQ?", 'Can you do custom?', 'How do I order?'],
    };
  }

  if (has('damascus')) {
    return {
      text: "Damascus — yeah, we do a fair bit of that, across folding, kitchen, and our collection line. These are a few standouts from what we've got.",
      products: pickDamascus(),
      quickReplies: ['Show me folding knives', 'Show kitchen knives', "What's your MOQ?"],
    };
  }

  /* 4. MOQ */
  if (has('moq', 'minimum', 'min order', 'how many', 'quantity', 'how much can i order')) {
    return {
      text: withFiller(
        "Most of our folding knives start at 100 pieces, and kitchen knives can go up to 1200 since they're produced in larger batches. Collection pieces are the exception — you can order just one of those. What type are you looking at?"
      ),
      quickReplies: ['Show me folding knives', 'Show kitchen knives', 'How do I order?'],
    };
  }

  /* 5. OEM / ODM */
  if (has('oem', 'odm', 'custom', 'customize', 'customization', 'logo', 'branding', 'engrav', 'private label')) {
    return {
      text: "Custom work — yeah, we do a lot of that. You can pick your blade steel (D2, M390, VG-10, Damascus, 440), your handle material (titanium, G10, wood, sandalwood), and we'll do logo engraving and custom packaging too. We even take small batches — our titanium alloy folder, for instance, you can customize from 300 pieces. Got something specific in mind? Drop the details in the Contact tab and we'll work it out.",
      quickReplies: ["What's your MOQ?", 'Show me folding knives', 'How do I order?'],
    };
  }

  /* 6. Shipping */
  if (has('ship', 'deliver', 'freight', 'tracking', 'express', 'dhl', 'fedex', 'ups', 'lead time')) {
    return {
      text: withFiller(
        "Shipping-wise, we send things out worldwide. Most orders get processed in a day or two, then it's express via DHL, FedEx, or UPS — usually 3 to 7 business days to your door. For big bulk orders we go sea freight, which is more like 15 to 35 days but a lot cheaper. Either way, you'll get a tracking number by email the moment it leaves us. Want a real quote for a specific quantity? Ping us through the Contact tab."
      ),
      quickReplies: ['How do I pay?', 'How do I order?', "What's your MOQ?"],
    };
  }

  /* 7. Payment */
  if (has('pay', 'payment', 'bank', 'hsbc', 'transfer', 'deposit', 't/t', 'wire', 'invoice', 'pi ')) {
    return {
      text: withFiller(
        "For payment, we go through HSBC bank transfer in USD — pretty standard for B2B. It's 30% deposit to lock in the order, then the 70% balance before we ship. You'll get a Proforma Invoice for everything so it's all above board. Keeps it simple and secure."
      ),
      quickReplies: ['How do I order?', "How's shipping work?", "What's your MOQ?"],
    };
  }

  /* 8. Order process */
  if (has('how to order', 'place order', 'how to buy', 'purchase', 'order process', 'ordering') ||
      (has('order') && !has('moq', 'quantity', 'tracking'))) {
    return {
      text: "Ordering's pretty straightforward. You browse and pick what you like, or just tell us what you're after. We'll confirm the specs, quantity, and MOQ together, then I'll send you a Proforma Invoice. From there it's a 30% deposit via HSBC to kick off production, and the 70% balance before we ship. Ready to get started? Drop your details in the Contact tab.",
      quickReplies: ['How do I pay?', "How's shipping work?", "What's your MOQ?"],
    };
  }

  /* 9. Pricing */
  if (has('price', 'cost', 'how much', 'quote', 'pricing', 'expensive', 'cheap')) {
    return {
      text: withFiller(
        "Pricing depends a lot on the model and materials — every product page shows the unit price. Just to give you a feel, our EDC folders start around $6.50, CNC titanium folders run $86 to $96, kitchen knives are $30 to $75, and the collection pieces start at $1,200. If you're buying in bulk, tell us your target quantity and we'll get you a proper quote through the Contact tab."
      ),
      quickReplies: ['Show me folding knives', 'Show kitchen knives', "What's your MOQ?"],
    };
  }

  /* 10. Contact */
  if (has('contact', 'email', 'phone', 'whatsapp', 'reach you', 'reach us', 'talk to')) {
    return {
      text: "Easiest way is email — support@adamcutlery.com — or give us a ring at +1 (800) 555-0199. You can also just use the Contact tab right here to send a message straight through. We usually get back to you within a business day.",
      quickReplies: ['When are you open?', 'How do I order?', "How's shipping work?"],
    };
  }

  /* 11. Business hours */
  if (has('hour', 'open', 'close', 'business', 'when can')) {
    return {
      text: withFiller(
        "We're around Monday to Friday, 9 to 6 EST, and Saturdays 10 to 4. Sundays we're closed, but leave a message anytime and we'll pick it up when we're back in."
      ),
      quickReplies: ['How do I order?', 'How do I reach you?', "What's your MOQ?"],
    };
  }

  /* 12. General product / catalog browse */
  if (has('product', 'catalog', 'knife', 'knives', 'show me', 'what do you', 'browse', 'recommend')) {
    return {
      text: "We make four main kinds of knives — folding and ball-bearing folders, kitchen knives, hunting and outdoor fixed blades, and a collection line for the really special stuff. Here are a few featured pieces to get you started.",
      products: featuredOverview,
      quickReplies: ['Show me folding knives', 'Show kitchen knives', "What's your MOQ?"],
    };
  }

  /* 13. Fallback */
  return {
    text: "Hmm, I'm not sure I caught that. But hey, I'm here — I can help you find the right knife, walk you through MOQ and pricing, custom work, shipping, that sort of thing. What would you like to know?",
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
  text: "Hey there, Adam here. Looking for something in particular, or just browsing?",
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

    // Work out the reply up front so the "thinking" pause can scale with
    // how long the answer is — feels more like real typing.
    const reply = getBotResponse(text);
    const typingDelay = Math.min(2200, 600 + reply.text.length * 12) + Math.random() * 250;

    window.setTimeout(() => {
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
    }, typingDelay);
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
                <h3 className="text-[#1a1a1a] font-semibold text-lg leading-tight">Adam</h3>
                <p className="text-[#1a1a1a]/70 text-xs flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-600/80" />
                  online now
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
                    placeholder="Ask me anything — knives, MOQ, shipping…"
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
