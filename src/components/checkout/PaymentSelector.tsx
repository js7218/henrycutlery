'use client';

import { useState } from 'react';
import { QrCode, CreditCard, Check } from 'lucide-react';
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
      id: 'alipay' as const,
      name: 'Alipay',
      icon: (
        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
          <path d="M12.39 1.199c-3.223-.05-6.063 1.532-7.323 4.084C3.818 6.912 3 9.13 3 11.538c0 3.237 1.86 6.09 4.638 7.41.33.158.738-.024.738-.329V17.16c0-.13.096-.225.225-.225h.825c.117 0 .217.085.232.2l.054.468c.009.086-.016.172-.07.235l-2.52 2.9c-.18.208-.014.525.28.525h3.81c.14 0 .256-.112.256-.249v-.393c0-.137.116-.25.256-.25h3.256c.205 0 .377-.164.377-.364 0-.105-.047-.203-.123-.268l-3.982-3.35a.522.522 0 0 1-.103-.205c0-.057.023-.11.063-.147l.14-.127c.158-.147.394-.235.631-.235h.805c.393 0 .726-.305.764-.697.003-.04.001-.08-.005-.12l-.36-3.58c-.043-.429.284-.805.713-.805h.33c.393 0 .718.313.718.703v2.927c0 .14.113.253.253.253h.253c.139 0 .253-.113.253-.253v-1.253a.258.258 0 0 0-.016-.092l-.37-2.28c-.06-.37-.374-.63-.744-.63h-3.256a.753.753 0 0 0-.744.608l-.54 2.58c-.058.278-.305.48-.59.48h-.81c-.393 0-.726-.305-.764-.697l-.21-2.1c-.018-.18-.14-.335-.31-.4l-3.24-1.23c-.15-.058-.25-.2-.25-.355 0-.18.13-.33.31-.368l.37-.08z"/>
        </svg>
      ),
      color: 'text-blue-600',
    },
    {
      id: 'card' as const,
      name: 'Bank Card',
      icon: <CreditCard className="w-6 h-6" />,
      color: 'text-steel',
    },
    {
      id: 'bank_transfer' as const,
      name: 'HSBC',
      icon: (
        <div className="flex h-8 w-12 items-center justify-center rounded bg-red-600 text-[10px] font-bold tracking-wide text-white">
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
              if (method.id === 'wechat' || method.id === 'alipay') {
                setShowQrCode(true);
              } else {
                setShowQrCode(false);
              }
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
                {method.id === 'wechat' ? (
                  <img
                    src="/images/wechat-payment.jpeg"
                    alt="WeChat payment code"
                    className="mb-4 h-auto w-56 max-w-full rounded-lg border border-gray-200 object-contain"
                  />
                ) : (
                  <div className="w-48 h-48 bg-gray-100 rounded-lg flex items-center justify-center mb-4">
                    <QrCode className="w-32 h-32 text-gray-800" />
                  </div>
                )}
                <p className="text-sm text-gray-600 text-center">
                  Please use {method.id === 'wechat' ? 'WeChat' : 'Alipay'} to scan and complete payment
                </p>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
