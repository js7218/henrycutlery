'use client';

import { useEffect } from 'react';

function hideUrlPath() {
  if (typeof window === 'undefined') return;

  const hasVisiblePath =
    window.location.pathname !== '/' ||
    window.location.search !== '' ||
    window.location.hash !== '';

  if (hasVisiblePath) {
    window.history.replaceState(window.history.state, document.title, '/');
  }
}

export default function UrlPathHider() {
  useEffect(() => {
    hideUrlPath();

    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    window.history.pushState = function pushState(...args) {
      const result = originalPushState.apply(this, args);
      window.setTimeout(hideUrlPath, 0);
      return result;
    };

    window.history.replaceState = function replaceState(...args) {
      const result = originalReplaceState.apply(this, args);
      window.setTimeout(hideUrlPath, 0);
      return result;
    };

    const handleRouteChange = () => window.setTimeout(hideUrlPath, 0);

    window.addEventListener('popstate', handleRouteChange);
    window.addEventListener('hashchange', handleRouteChange);

    return () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      window.removeEventListener('popstate', handleRouteChange);
      window.removeEventListener('hashchange', handleRouteChange);
    };
  }, []);

  return null;
}
