const GA_ID = process.env.NEXT_PUBLIC_GA_ID;
const GA_ENABLED = !!GA_ID && GA_ID !== 'G-XXXXXXXXXX';

export function trackEvent(eventName: string, params?: Record<string, unknown>) {
  if (GA_ENABLED && typeof window !== 'undefined' && (window as any).gtag) {
    (window as any).gtag('event', eventName, params);
  }
}
