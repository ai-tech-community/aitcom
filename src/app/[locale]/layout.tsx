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

export const metadata: Metadata = {
  title: "AIT Community — AI Tech Community Netherlands",
  description:
    "A community for technical innovators in the Netherlands. Workshops, hackathons, and deep-dives on AI and automation.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
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

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const messages = (await import(`../../../messages/${locale}.json`)).default as Record<string, unknown>;

  return (
    <html lang={locale} className={`${geist.variable} ${geistMono.variable}`}>
      <body className="bg-background text-foreground antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <TRPCReactProvider>
            <Navbar />
            <main className="min-h-screen">{children}</main>
            <Footer />
            <Toaster position="bottom-right" />
          </TRPCReactProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
