'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { PaymentMethod } from '@/types';

interface PaymentSelectorProps {
  selected: PaymentMethod;
  onSelect: (method: PaymentMethod) => void;
}

export default function PaymentSelector({ selected, onSelect }: PaymentSelectorProps) {
  const [showQrCode, setShowQrCode] = useState(false);

  const paymentMethods = [
    {
      id: 'wechat' as const,
      name: 'WeChat Pay',
      icon: (
        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
          <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.269-.03-.406-.03zm-1.834 2.994c.536 0 .969.44.969.983a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.433-.983.97-.983zm4.857 0c.536 0 .969.44.969.983a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.433-.983.969-.983z"/>
        </svg>
      ),
      color: 'text-green-600',
    },
    {
      id: 'bank_transfer' as const,
      name: 'HSBC',
      icon: (
        <div className="flex h-10 w-14 items-center justify-center rounded bg-red-600 text-xs font-bold tracking-wide text-white">
          HSBC
        </div>
      ),
      color: 'text-red-500',
    },
  ];

  return (
    <div className="space-y-3">
      {paymentMethods.map((method) => (
        <div key={method.id}>
          <button
            onClick={() => {
              onSelect(method.id);
              setShowQrCode(method.id === 'wechat');
            }}
            className={`w-full flex items-center justify-between p-4 border rounded-lg transition-all ${
              selected === method.id
                ? 'border-gold bg-gold/5'
                : 'border-border hover:border-gray-600'
            }`}
          >
            <div className="flex items-center space-x-3">
              <div className={method.color}>{method.icon}</div>
              <span className="text-foreground font-medium">{method.name}</span>
            </div>
            {selected === method.id && (
              <Check className="w-5 h-5 text-gold" />
            )}
          </button>

          {/* QR Code Display */}
          {selected === method.id && showQrCode && (
            <div className="mt-4 p-6 bg-white rounded-lg animate-fade-in">
              <div className="flex flex-col items-center">
                <img
                  src="/images/wechat-payment.jpeg"
                  alt="WeChat payment code"
                  className="mb-4 h-auto w-56 max-w-full rounded-lg border border-gray-200 object-contain"
                />
                <p className="text-sm text-gray-300 text-center">
                  Please use WeChat to scan and complete payment, then email us the receipt.
                </p>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
