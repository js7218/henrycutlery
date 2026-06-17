/** @type {import('next').NextConfig} */
const nextConfig = {
  // Performance
  compress: true,
  staticPageGenerationTimeout: 120,
  distDir: '.next',

  // Security: Disable unnecessary features
  poweredByHeader: false,
  generateEtags: false,

  // Security: Disable source maps in production
  productionBrowserSourceMaps: false,

  // Security: Strict image handling
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
      },
    ],
    // Performance: Enable WebP and responsive image sizes
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 604800,
    dangerouslyAllowSVG: false,
    contentDispositionType: 'attachment',
  },
  
  // Security: Disable x-powered-by and other headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'accelerometer=(), camera=(), microphone=(), geolocation=(), payment=(), display-capture=()',
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Resource-Policy',
            value: 'same-origin',
          },
          {
            key: 'X-Download-Options',
            value: 'noopen',
          },
          {
            key: 'X-Permitted-Cross-Domain-Policies',
            value: 'none',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' https://www.googletagmanager.com",
              "style-src 'self'",
              "font-src 'self'",
              "img-src 'self' data: https:",
              "connect-src 'self' https://vitals.vercel-insights.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "upgrade-insecure-requests",
            ].join('; '),
          },
        ],
      },
      // Block access to sensitive file patterns
      {
        source: '/:path*(.env|.git|config|log|debug|backup|sql|db|pem|key|crt)',
        headers: [
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow',
          },
        ],
      },
    ];
  },
  
  // Security: Rewrites to block sensitive paths
  async rewrites() {
    return {
      beforeFiles: [
        // Block access to sensitive files - return 404
        {
          source: '/.env',
          destination: '/404',
        },
        {
          source: '/.env.local',
          destination: '/404',
        },
        {
          source: '/.env.production',
          destination: '/404',
        },
        {
          source: '/.env.development',
          destination: '/404',
        },
        {
          source: '/.git/:path*',
          destination: '/404',
        },
        {
          source: '/.gitignore',
          destination: '/404',
        },
        {
          source: '/package.json',
          destination: '/404',
        },
        {
          source: '/package-lock.json',
          destination: '/404',
        },
        {
          source: '/tsconfig.json',
          destination: '/404',
        },
        {
          source: '/next.config.mjs',
          destination: '/404',
        },
        {
          source: '/postcss.config.mjs',
          destination: '/404',
        },
        {
          source: '/tailwind.config.ts',
          destination: '/404',
        },
        {
          source: '/.eslintrc.json',
          destination: '/404',
        },
        {
          source: '/README.md',
          destination: '/404',
        },
        {
          source: '/SECURITY.md',
          destination: '/404',
        },
        {
          source: '/DEPLOYMENT.md',
          destination: '/404',
        },
        {
          source: '/:path*.log',
          destination: '/404',
        },
        {
          source: '/:path*.sql',
          destination: '/404',
        },
        {
          source: '/:path*.db',
          destination: '/404',
        },
        {
          source: '/:path*.sqlite',
          destination: '/404',
        },
        {
          source: '/:path*.bak',
          destination: '/404',
        },
        {
          source: '/:path*.backup',
          destination: '/404',
        },
        {
          source: '/:path*.pem',
          destination: '/404',
        },
        {
          source: '/:path*.key',
          destination: '/404',
        },
        {
          source: '/:path*.crt',
          destination: '/404',
        },
        {
          source: '/:path*.cert',
          destination: '/404',
        },
        {
          source: '/docker-compose/:path*',
          destination: '/404',
        },
        {
          source: '/docker-compose',
          destination: '/404',
        },
        {
          source: '/Dockerfile',
          destination: '/404',
        },
        {
          source: '/.dockerignore',
          destination: '/404',
        },
        {
          source: '/scripts/:path*',
          destination: '/404',
        },
        {
          source: '/data/:path*',
          destination: '/404',
        },
        {
          source: '/logs/:path*',
          destination: '/404',
        },
        {
          source: '/temp/:path*',
          destination: '/404',
        },
        {
          source: '/tmp/:path*',
          destination: '/404',
        },
        {
          source: '/cache/:path*',
          destination: '/404',
        },
        {
          source: '/uploads/:path*',
          destination: '/404',
        },
        {
          source: '/secrets/:path*',
          destination: '/404',
        },
        {
          source: '/credentials/:path*',
          destination: '/404',
        },
        {
          source: '/config/:path*',
          destination: '/404',
        },
        {
          source: '/settings/:path*',
          destination: '/404',
        },
        {
          source: '/wp-admin/:path*',
          destination: '/404',
        },
        {
          source: '/wp-login.php',
          destination: '/404',
        },
        {
          source: '/wp-config.php',
          destination: '/404',
        },
        {
          source: '/phpmyadmin/:path*',
          destination: '/404',
        },
        {
          source: '/adminer.php',
          destination: '/404',
        },
        {
          source: '/xmlrpc.php',
          destination: '/404',
        },
        {
          source: '/.well-known/security.txt',
          destination: '/404',
        },
      ],
    };
  },
  
  // Security: Redirects
  async redirects() {
    return [
      // Force HTTPS (when deployed)
      // {
      //   source: '/:path*',
      //   has: [{ type: 'header', key: 'x-forwarded-proto', value: 'http' }],
      //   destination: 'https://:path*',
      //   permanent: true,
      // },
    ];
  },
  
  // Security: Experimental features
  experimental: {
    // Disable unnecessary features
    optimizePackageImports: ['lucide-react'],
  },
  
  // Security: Compiler options
  compiler: {
    // Remove console logs in production
    removeConsole: process.env.NODE_ENV === 'production',
  },
  // Security: Trailing slash handling
  trailingSlash: false,
  
  // Security: Strict mode
  reactStrictMode: true,
};

export default nextConfig;
