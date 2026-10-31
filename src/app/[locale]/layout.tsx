import "@/styles/globals.css";

import { type Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { notFound } from "next/navigation";

import { TRPCReactProvider } from "@/trpc/react";
import { routing } from "@/i18n/routing";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { FooterGate } from "@/components/footer-gate";
import { Toaster } from "sonner";
import { InboxProvider } from "@/components/inbox/inbox-provider";
import { SpaceWindowProvider } from "@/components/communities/explore/space-window-provider";
import { SessionChrome } from "@/components/session-chrome";
import { SiteChromeGate } from "@/components/site-chrome-gate";
import { RulesProvider } from "@/components/community/rules-provider";
import { AuthRequiredProvider } from "@/components/auth/auth-required-dialog";
import { SessionProvider } from "@/components/auth/session-provider";
import { ConfirmProvider } from "@/components/confirm-dialog";
import { Analytics } from "@vercel/analytics/next";
import { siteLayoutMetadata } from "@/lib/site-metadata";
import { CANONICAL_PRODUCTION_ORIGIN } from "@/server/better-auth/base-url";
import { loadHubAuthSeed } from "@/server/better-auth/hub-session-server";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    metadataBase: new URL(CANONICAL_PRODUCTION_ORIGIN),
    ...siteLayoutMetadata(locale),
    icons: [
      { rel: "icon", url: "/icon.svg", type: "image/svg+xml" },
      { rel: "icon", url: "/favicon.ico", sizes: "32x32" },
    ],
    alternates: {
      types: {
        "application/rss+xml": "/feed.xml",
      },
    },
  };
}

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const messagesModule = (await import(`../../../messages/${locale}.json`)) as {
    default: Record<string, unknown>;
  };
  const messages = messagesModule.default;
  const { initialUser } = await loadHubAuthSeed();

  return (
    <html lang={locale} className={`${geist.variable} ${geistMono.variable}`}>
      <head>
        <Script
          src="https://analytics.ahrefs.com/analytics.js"
          data-key="oeVpx7mDaVnimLgu0ewixg"
          strategy="beforeInteractive"
        />
      </head>
      <body
        className="bg-background text-foreground flex min-h-screen flex-col antialiased"
        suppressHydrationWarning
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          <TRPCReactProvider>
            <RulesProvider>
              <AuthRequiredProvider>
                <ConfirmProvider>
                  <SessionProvider initialUser={initialUser}>
                    <SiteChromeGate>
                      <Navbar initialUser={initialUser} />
                    </SiteChromeGate>
                    <InboxProvider>
                      <SpaceWindowProvider>
                        <main className="flex-1">{children}</main>
                        <SiteChromeGate>
                          <FooterGate>
                            <Footer />
                          </FooterGate>
                        </SiteChromeGate>
                        <SiteChromeGate>
                          <SessionChrome initialUser={initialUser} />
                        </SiteChromeGate>
                      </SpaceWindowProvider>
                    </InboxProvider>
                    <Toaster position="bottom-right" offset={60} />
                  </SessionProvider>
                </ConfirmProvider>
              </AuthRequiredProvider>
            </RulesProvider>
          </TRPCReactProvider>
        </NextIntlClientProvider>
        <Analytics />
      </body>
    </html>
  );
}
