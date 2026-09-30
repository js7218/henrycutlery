import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import ClientLayout from "./ClientLayout";
import { GA_MEASUREMENT_ID } from "@/lib/analytics";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#0f0f0f",
};

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: "swap",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Adam Cutlery - Premium Knife E-commerce Platform",
  description: "A professional e-commerce platform specializing in premium knives, featuring works from world-class master smiths.",
  metadataBase: new URL("https://adamcutlery.com"),
  // 注意：不要在这里设置 alternates.canonical。根 layout 的 canonical 会套用到
  // 所有未自行覆写的路由，使 /products、/cart 等页面都声明 canonical 指向首页，
  // 被 Google 判定为重复内容而无法收录。canonical 交给各页面自行声明。
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://adamcutlery.com",
    siteName: "Adam Cutlery",
    title: "Adam Cutlery - Premium Knife E-commerce Platform",
    description: "A professional e-commerce platform specializing in premium knives, featuring works from world-class master smiths.",
    images: [
      {
        url: "https://adamcutlery.com/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Adam Cutlery - Premium Knives",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@adamcutlery",
    creator: "@adamcutlery",
    title: "Adam Cutlery - Premium Knife E-commerce Platform",
    description: "A professional e-commerce platform specializing in premium knives, featuring works from world-class master smiths.",
    images: ["https://adamcutlery.com/og-image.jpg"],
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Adam Cutlery",
  url: "https://adamcutlery.com",
  logo: "https://adamcutlery.com/logo.png",
  description: "A professional e-commerce platform specializing in premium knives, featuring works from world-class master smiths.",
  sameAs: [
    "https://twitter.com/adamcutlery",
    "https://facebook.com/adamcutlery",
    "https://instagram.com/adamcutlery",
  ],
  contactPoint: {
    "@type": "ContactPoint",
    telephone: "+1-800-555-0199",
    contactType: "Customer Service",
    availableLanguage: ["English", "Chinese", "Japanese", "German"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        {GA_MEASUREMENT_ID && (
          <>
            <script async src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} />
            <script
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments);}
                  gtag('js', new Date());
                  gtag('config', '${GA_MEASUREMENT_ID}');
                `,
              }}
            />
          </>
        )}
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* Inline script: add age-verified class BEFORE paint for returning visitors.
            This prevents FOUC and ensures animations start immediately for verified users. */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            try {
              if (sessionStorage.getItem('age_verified') === 'true') {
                document.body.classList.add('age-verified');
              }
            } catch(e) {}
            // Fallback: if age-verified class not added within 6 seconds, add it anyway.
            // This prevents permanently hidden content if AgeVerification component fails.
            setTimeout(function() {
              if (!document.body.classList.contains('age-verified')) {
                document.body.classList.add('age-verified');
              }
            }, 6000);
          })();
        `}} />
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
