import { renderToString } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import fr from "../../../../../messages/fr.json";
import { SignUpForm } from "./signup-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/fr/auth/signup",
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("@/server/better-auth/client", () => ({
  authClient: {
    useSession: () => ({ data: null }),
    signIn: { social: vi.fn() },
    signUp: { email: vi.fn() },
  },
}));

vi.mock("@/trpc/react", () => ({
  api: {
    members: {
      getAuthProviders: {
        useQuery: (_input: unknown, options: { initialData?: unknown }) => ({
          data: options?.initialData,
        }),
      },
    },
  },
}));

describe("SignUpForm French tagline", () => {
  it("server-renders Rejoignez AIT. Community", () => {
    const html = renderToString(
      <NextIntlClientProvider locale="fr" messages={fr}>
        <SignUpForm
          oauthProviders={{ google: false, github: false, linkedin: false }}
        />
      </NextIntlClientProvider>,
    );
    expect(html).toContain("Rejoignez AIT");
    expect(html).toContain('class="text-primary"');
    expect(html).toContain(">.</span> Community");
    expect(html).not.toContain("Join AIT");
  });
});
