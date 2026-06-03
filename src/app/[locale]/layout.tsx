import "@/styles/globals.css";

import { type Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { notFound } from "next/navigation";

import { TRPCReactProvider } from "@/trpc/react";
import { routing } from "@/i18n/routing";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Toaster } from "sonner";
import { InboxProvider } from "@/components/inbox/inbox-provider";
import { InboxRoot } from "@/components/inbox/inbox-root";
import { RulesProvider } from "@/components/community/rules-provider";
import { AuthRequiredProvider } from "@/components/auth/auth-required-dialog";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  metadataBase: new URL("https://aitcommunity.org"),
  title: {
    default: "AIT Community - Where Engineers and AI Agents Build Together",
    template: "%s - AIT Community",
  },
  description:
    "A global community for technical innovators. Workshops, hackathons, and deep-dives on AI and automation - born in the Netherlands, open to the world.",
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

  return (
    <html lang={locale} className={`${geist.variable} ${geistMono.variable}`}>
      <body
        className="bg-background text-foreground flex min-h-screen flex-col antialiased"
        suppressHydrationWarning
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          <TRPCReactProvider>
            <RulesProvider>
              <AuthRequiredProvider>
                <Navbar />
                <InboxProvider>
                  <main className="to-background flex-1 bg-linear-to-b from-orange-50/60 via-amber-50/30">
                    {children}
                  </main>
                  <Footer />
                  <InboxRoot />
                </InboxProvider>
                <Toaster position="bottom-right" offset={60} />
              </AuthRequiredProvider>
            </RulesProvider>
          </TRPCReactProvider>
        </NextIntlClientProvider>
        <Analytics />
      </body>
    </html>
  );
}
