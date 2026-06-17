import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import ClientLayout from "./ClientLayout";

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
  alternates: {
    canonical: "/",
  },
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
        <link rel="canonical" href="https://adamcutlery.com" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        <script async src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID || 'G-XXXXXXXXXX'}`}></script>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${process.env.NEXT_PUBLIC_GA_ID || 'G-XXXXXXXXXX'}');
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
