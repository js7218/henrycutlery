'use client';

import { useState } from 'react';

interface NegotiationChatProps {
  items: { productId: string; quantity: number }[];
  countryCode: string;
  quoteUsd: number;
  onQuote: (result: { amountUsd: number; token: string } | null) => void;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function NegotiationChat({
  items,
  countryCode,
  quoteUsd,
  onQuote,
}: NegotiationChatProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [offer, setOffer] = useState<number | null>(null);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;

    const next = [...messages, { role: 'user' as const, content: text }].slice(-12);
    setMessages(next);
    setInput('');
    setBusy(true);
    setError('');

    try {
      const res = await fetch('/api/chat/negotiation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, countryCode, messages: next }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Something went wrong. Please try again.');
      }

      const reply = typeof data.reply === 'string' ? data.reply : '';
      if (reply) {
        setMessages((prev) => [...prev, { role: 'assistant' as const, content: reply }].slice(-12));
      }

      if (typeof data.offerUsd === 'number' && typeof data.token === 'string') {
        setOffer(data.offerUsd);
        onQuote({ amountUsd: data.offerUsd, token: data.token });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        className="mt-2 inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-gold hover:border-gold"
      >
        Shipping seems high? Chat with us
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Shipping negotiation"
      className="fixed bottom-4 left-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col rounded-lg border border-border bg-surface shadow-xl"
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <p className="text-sm font-medium text-gold">Shipping negotiation</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close negotiation chat"
          className="text-gray-400 hover:text-foreground"
        >
          ×
        </button>
      </div>

      <div className="max-h-64 space-y-2 overflow-auto p-3 text-sm">
        <p className="text-xs text-gray-500">
          Current shipping quote: ${quoteUsd.toFixed(2)}
        </p>
        {messages.map((message, index) => (
          <div
            key={index}
            className={
              message.role === 'user'
                ? 'ml-auto max-w-[85%] rounded-lg bg-gold/15 px-2 py-1 text-foreground'
                : 'mr-auto max-w-[85%] rounded-lg bg-background px-2 py-1 text-gray-300'
            }
          >
            {message.content}
          </div>
        ))}
        {busy && <p className="text-xs text-gray-500">Thinking...</p>}
        {offer !== null && (
          <p className="text-xs text-gold">
            Shipping fee we agreed on: ${offer.toFixed(2)}
          </p>
        )}
      </div>

      {error && <p className="px-3 pb-2 text-xs text-red-400">{error}</p>}

      <div className="flex gap-2 border-t border-border p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void send();
            }
          }}
          aria-label="Message about shipping"
          placeholder="Can you lower the shipping?"
          className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy || !input.trim()}
          className="rounded bg-gold px-3 py-1 text-sm font-medium text-background disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
