'use client';

import { CheckCircle } from 'lucide-react';

interface Step {
  id: number;
  name: string;
  status: 'complete' | 'current' | 'upcoming';
}

interface CheckoutStepsProps {
  currentStep: number;
}

export default function CheckoutSteps({ currentStep }: CheckoutStepsProps) {
  const steps: Step[] = [
    { id: 1, name: 'Cart', status: currentStep === 1 ? 'current' : currentStep > 1 ? 'complete' : 'upcoming' },
    { id: 2, name: 'Confirm Order', status: currentStep === 2 ? 'current' : currentStep > 2 ? 'complete' : 'upcoming' },
    { id: 3, name: 'Payment', status: currentStep === 3 ? 'current' : currentStep > 3 ? 'complete' : 'upcoming' },
    { id: 4, name: 'Complete', status: currentStep === 4 ? 'current' : 'upcoming' },
  ];

  return (
    <div className="mb-8">
      <div className="flex items-center justify-center">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center">
            {/* Step Circle */}
            <div className="flex flex-col items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                  step.status === 'complete'
                    ? 'bg-gold text-background'
                    : step.status === 'current'
                    ? 'bg-gold/20 text-gold border-2 border-gold'
                    : 'bg-surface text-gray-500 border-2 border-border'
                }`}
              >
                {step.status === 'complete' ? (
                  <CheckCircle className="w-5 h-5" />
                ) : (
                  step.id
                )}
              </div>
              <span
                className={`mt-2 text-xs ${
                  step.status === 'current' ? 'text-gold' : 'text-gray-500'
                }`}
              >
                {step.name}
              </span>
            </div>

            {/* Connector Line */}
            {index < steps.length - 1 && (
              <div
                className={`w-16 sm:w-24 h-0.5 mx-2 ${
                  step.status === 'complete' ? 'bg-gold' : 'bg-border'
                }`}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
