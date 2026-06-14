'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

/**
 * OEM / ODM Manufacturing card.
 *
 * - The card itself is a button (not an <a>), so it can never be turned into
 *   an open redirect or a phishing target.
 * - The expanded content is rendered as a list of plain-text paragraphs/bullets
 *   via React text nodes only. No dangerouslySetInnerHTML, no user input, no
 *   external URLs, no inline event strings -> no stored / reflected / DOM XSS.
 * - The modal is closed on Escape or backdrop click, and locks body scroll
 *   while open; nothing is persisted to cookies / localStorage.
 */

const SUMMARY_BULLETS: readonly string[] = [
  'OEM knife production with your design, logo and packaging.',
  'Quality inspection as your on-site agent in China.',
  'Sourcing of daily consumer goods on your behalf.',
  'Factory tour planning across Guangdong as your broker.',
  'Consulting for investing in China: finance, operations, legal, market.',
];

const INTRO_PARAGRAPH =
  'We are working for many projects as below.';

const PROJECT_LIST: readonly string[] = [
  'We produce all knives OEM order;',
  'We carry on the knife quality inspection as your agent;',
  'We help you to source the daily consumer goods;',
  'We can be your broker to plan a factory tour in Guangdong.',
  'We provide consulting service such aspects as financial management, enterprise operation management, legal consultation, business development plan and market development etc. if you will like to invest to China.',
];

const DETAIL_PARAGRAPHS: readonly string[] = [
  'All OEM projects & exclusive designs are acceptable to be working as a Special Progress.',
  'It is certain that your specific design is always welcome and their copyright is protected well. We are focusing on manufacturing all kinds of knives; ensuring overseas clients get their hassle free, products on time, in desired quantity and quality.',
  'Our philosophy of a knife is to save the lives of men, special operators, law enforcement officers, professional adventurers and father-to-son collection.',
  'Our customers are mostly brand operators, retailers, exporters, agents, foreign customers and producers. And we will ship all our knives by sea or air to you.',
  'Please send us your blueprint, drawing design and samples if possible to build this progress. If you place your knife orders to us with your design paper and logo, we will be fast to make a knife sample for your approval.',
  'Our payment term is to be T/T to Bank of China (Hong Kong). And we may request deposit, project fee or mould charge to start your program.',
  'Accordingly, we supply you with high quality knife, low cost and delivery in a safe way.',
  'Are you still looking for a good knife factory? Do not hesitate to contact us now.',
  'We will have a good solution and project for your market!',
];

export default function OemOdmCard() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="text-left p-5 bg-background rounded-xl border border-border hover:border-gold/60 transition-colors focus:outline-none focus:ring-2 focus:ring-gold/60"
      >
        <h3 className="text-gold font-semibold mb-2">OEM / ODM Manufacturing</h3>
        <ul className="text-sm text-gray-400 list-disc pl-5 space-y-1">
          {SUMMARY_BULLETS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-gold/80">Click to view full OEM / ODM details</p>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="oem-odm-title"
          className="fixed inset-0 z-[120] flex items-center justify-center px-4"
        >
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-3xl max-h-[85vh] overflow-y-auto bg-background border border-gold/30 rounded-2xl shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between px-6 py-4 bg-background/95 backdrop-blur border-b border-border">
              <h3
                id="oem-odm-title"
                className="text-xl font-semibold text-gold"
                style={{ fontFamily: 'Playfair Display, serif' }}
              >
                OEM / ODM Manufacturing
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="p-2 rounded-md text-gray-300 hover:text-gold hover:bg-surface focus:outline-none focus:ring-2 focus:ring-gold/60"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4 text-sm md:text-base text-gray-300 leading-relaxed">
              <p>{INTRO_PARAGRAPH}</p>
              <ol className="list-decimal pl-6 space-y-2">
                {PROJECT_LIST.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
              {DETAIL_PARAGRAPHS.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
