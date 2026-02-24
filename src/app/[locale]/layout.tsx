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
import { NotebookPanel } from "@/components/notebook-panel";

export const metadata: Metadata = {
  metadataBase: new URL("https://aitcommunity.org"),
  title: {
    default: "AIT Community — AI Tech Community Netherlands",
    template: "%s — AIT Community",
  },
  description:
    "A community for technical innovators in the Netherlands. Workshops, hackathons, and deep-dives on AI and automation.",
  icons: [
    { rel: "icon", url: "/icon.svg", type: "image/svg+xml" },
    { rel: "icon", url: "/favicon.ico", sizes: "32x32" },
  ],
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
      <body className="bg-background text-foreground antialiased" suppressHydrationWarning>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <TRPCReactProvider>
            <Navbar />
            <main className="min-h-screen to-background bg-linear-to-b from-orange-50/60 via-amber-50/30">{children}</main>
            <Footer />
            <NotebookPanel />
            <Toaster position="bottom-right" offset={60} />
          </TRPCReactProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
