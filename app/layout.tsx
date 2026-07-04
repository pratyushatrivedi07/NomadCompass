import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Nomad's Compass: AI-powered tourist itinerary planner",
  description:
    "Plan a multi-day trip in seconds. Tell Nomad's Compass your city, budget and style — get a mapped itinerary.",
  openGraph: {
    title: "Nomad's Compass: AI itinerary planner",
    description: "AI-built day-by-day itineraries with maps and transit.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;

  return (
    <html lang="en">
      <head>
        {/* CookieYes consent banner — must load before other scripts */}
        <Script
          id="cookieyes"
          src="https://cdn-cookieyes.com/client_data/4438de03e2a541b89e3046e7/script.js"
          strategy="beforeInteractive"
        />

        {/* Google Analytics with Consent Mode (works with CookieYes) */}
        {gaId && (
          <>
            {/* Default to denied only for regions where consent is legally
                required (EEA + UK + CH). Everywhere else, gtag implicitly
                treats storage as granted since no default is set for it.
                CookieYes sends a consent update when an EEA/UK/CH visitor
                responds to the banner. */}
            <Script id="google-consent-default" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('consent', 'default', {
                  analytics_storage: 'denied',
                  ad_storage: 'denied',
                  ad_user_data: 'denied',
                  ad_personalization: 'denied',
                  region: [
                    'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE',
                    'GR','HU','IS','IE','IT','LV','LI','LT','LU','MT','NL',
                    'NO','PL','PT','RO','SK','SI','ES','SE','GB','CH'
                  ]
                });
              `}
            </Script>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${gaId}');
              `}
            </Script>
          </>
        )}

        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Roboto:wght@300;400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
        {children}
        <Toaster />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}