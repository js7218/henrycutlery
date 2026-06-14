'use client';

import { useEffect, useState, ReactNode } from 'react';
import { useApp } from '@/context/AppContext';
import { AlertTriangle, Check } from 'lucide-react';

export default function AgeVerification({ children }: { children?: ReactNode }) {
  const { state, dispatch } = useApp();
  const [showModal, setShowModal] = useState(true);

  useEffect(() => {
    if (!state.isAgeVerified) {
      setShowModal(true);
    }
  }, [state.isAgeVerified]);

  const handleVerify = (isAdult: boolean) => {
    if (isAdult) {
      dispatch({ type: 'SET_AGE_VERIFIED', verified: true });
      setShowModal(false);
    } else {
      // 不跳转到外部 referrer，避免开放重定向风险。
      if (window.history.length > 1) {
        window.history.back();
        return;
      }

      window.location.replace('about:blank');
    }
  };

  if (state.isAgeVerified) {
    return <>{children}</>;
  }

  return (
    <>
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-xl p-8 max-w-md w-full mx-4 animate-slide-up shadow-2xl">
            {/* Logo */}
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gold-gradient mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
                ADAM CUTLERY
              </h1>
              <p className="text-sm text-gray-400">Premium Knives & Cutlery</p>
            </div>

            {/* Warning Icon */}
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 bg-gold/10 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-10 h-10 text-gold" />
              </div>
            </div>

            {/* Content */}
            <div className="text-center mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-3">
                Age Verification
              </h2>
              <p className="text-sm text-gray-400 leading-relaxed">
                You must be 18 years or older to purchase knives.
                <br />
                Please confirm your age:
              </p>
            </div>

            {/* Options */}
            <div className="space-y-4">
              <button
                onClick={() => handleVerify(true)}
                className="w-full py-3 px-6 bg-gold text-background font-medium rounded-lg hover:bg-goldLight transition-colors flex items-center justify-center space-x-2"
              >
                <Check className="w-5 h-5" />
                <span>I am 18 or older</span>
              </button>

              <button
                onClick={() => handleVerify(false)}
                className="w-full py-3 px-6 border border-border text-gray-400 rounded-lg hover:border-red-500 hover:text-red-400 transition-colors"
              >
                I am under 18
              </button>
            </div>

            {/* Disclaimer */}
            <p className="text-xs text-gray-500 text-center mt-6">
              By clicking &ldquo;I am 18 or older&rdquo; you agree to our
              <a href="#" className="text-gold hover:underline ml-1">Terms of Service</a>
              and
              <a href="#" className="text-gold hover:underline ml-1">Purchase Policy</a>
            </p>
          </div>
        </div>
      )}
    </>
  );
}
