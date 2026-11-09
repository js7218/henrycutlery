'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#0b0b0d', color: '#f5f5f5', fontFamily: 'Arial, sans-serif' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ maxWidth: '420px', textAlign: 'center' }}>
            <h1 style={{ fontSize: '24px', marginBottom: '12px' }}>Something went wrong</h1>
            <p style={{ color: '#9ca3af', marginBottom: '24px', lineHeight: 1.5 }}>
              The page could not be loaded. Please try again — if it keeps happening, contact us at
              sales@adamcutlery.com.
            </p>
            <button
              onClick={reset}
              style={{ padding: '12px 20px', borderRadius: '8px', border: 'none', background: '#c9a227', color: '#000', fontWeight: 600, cursor: 'pointer' }}
            >
              Try again
            </button>
            {error?.digest ? (
              <p style={{ marginTop: '24px', fontSize: '12px', color: '#6b7280' }}>Reference: {error.digest}</p>
            ) : null}
          </div>
        </div>
      </body>
    </html>
  );
}
