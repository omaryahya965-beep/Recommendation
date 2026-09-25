import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef1ee" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1319" },
  ],
};

// IBM Plex Sans Arabic is the one UI typeface: 400 body, 500 labels and
// navigation, 600 buttons and emphasis, 700 headings. Its Arabic faces are
// preloaded because every first screen renders them; font preloads compete
// for bandwidth with the login hero (that page's LCP), so nothing else is.
// Plex Mono (record IDs, dates, counts) and the Latin faces download only when
// text on the page uses them. All faces use font-display: swap.
const plex = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-plex-mono",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  // Application name first, institution second — never the other way round.
  title: "رقيب | RAQEEB — بلدية البيرة",
  description:
    "منصة متابعة توصيات الرقابة الداخلية في بلدية البيرة — Internal Audit Recommendation Follow-up Platform, Al-Bireh Municipality",
  applicationName: "RAQEEB",
  appleWebApp: {
    capable: true,
    title: "رقيب",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The font variables live on <html>: Tailwind declares the theme tokens
    // (--font-body, --font-heading, --font-mono) on :root, and a token that
    // references a variable defined only further down (e.g. on <body>) is
    // invalid, which silently dropped every page to the system font.
    <html lang="ar" dir="rtl" className={`${plex.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var l=localStorage.getItem('audit_locale');if(l==='en'){document.documentElement.lang='en';document.documentElement.dir='ltr';}else{document.documentElement.lang='ar';document.documentElement.dir='rtl';}var t=localStorage.getItem('audit_theme');var dark=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',dark?'dark':'light');document.documentElement.style.colorScheme=dark?'dark':'light';}catch(e){}})();",
          }}
        />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
