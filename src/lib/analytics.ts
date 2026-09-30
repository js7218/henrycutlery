/**
 * Google Analytics 4 衡量 ID。
 * 优先取构建时注入的 NEXT_PUBLIC_GA_ID；未配置时回退到站点自己的衡量 ID。
 * 衡量 ID 会出现在页面 HTML 中，属公开值，不是机密。
 */
export const GA_MEASUREMENT_ID = (() => {
  const fromEnv = process.env.NEXT_PUBLIC_GA_ID;
  if (fromEnv && fromEnv !== 'G-XXXXXXXXXX') return fromEnv;
  return 'G-9RLWDNXENM';
})();

export function trackEvent(eventName: string, params?: Record<string, unknown>) {
  if (typeof window !== 'undefined' && (window as any).gtag) {
    (window as any).gtag('event', eventName, params);
  }
}
