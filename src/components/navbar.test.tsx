// The top navigation: every destination is a link in the menu, and each
// one-letter shortcut opens its page. Group menus keep those links in the
// server HTML even while they are closed.
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../messages/en.json";
import nl from "../../messages/nl.json";
import { JOIN_HREF, NAV_BAR } from "./site-nav";

const router = vi.hoisted(() => ({ push: vi.fn() }));
const path = vi.hoisted(() => ({ value: "/" }));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => path.value,
  useRouter: () => router,
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/auth/session-provider", () => ({
  useInitialAuthUser: () => null,
}));
vi.mock("@/server/better-auth/client", () => ({
  authClient: { useSession: () => ({ data: null }), signOut: vi.fn() },
}));
vi.mock("@/server/better-auth/hub-session", () => ({
  documentAuthUser: () => null,
}));
vi.mock("./language-switcher", () => ({ LanguageSwitcher: () => null }));

import { Navbar } from "./navbar";

const HEADER_HREFS = [
  "/communities",
  "/members",
  "/agents",
  "/forum",
  "/ideas",
  "/events",
  "/news",
  "/magazines",
  "/investigations",
  "/blog",
  "/startups",
  "/startups/ai-tools-list",
  "/launchpad",
  "/jobs",
  "/roles",
  JOIN_HREF,
] as const;

function renderNavbar(locale: "en" | "nl" = "en") {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : nl}
    >
      <Navbar />
    </NextIntlClientProvider>,
  );
}

function mainNav() {
  return screen.getByRole("navigation", { name: en.nav.primaryNav });
}

function pointerEvent(
  target: Element,
  type: "pointerover" | "pointerout",
  pointerType = "mouse",
  relatedTarget: EventTarget | null = null,
) {
  const event = new MouseEvent(type, { bubbles: true, relatedTarget });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  fireEvent(target, event);
}

beforeEach(() => {
  router.push.mockReset();
  path.value = "/";
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Navbar", () => {
  it.each(["COMMUNITY", "READ", "STARTUPS", "WORK"])(
    "opens %s on mouse hover without moving focus",
    (name) => {
      renderNavbar();
      const trigger = within(mainNav()).getByRole("button", { name });
      const focused = document.activeElement;
      pointerEvent(trigger, "pointerover");
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      expect(document.activeElement).toBe(focused);
      fireEvent.keyDown(document, { key: "Escape" });
      expect(trigger).toHaveAttribute("aria-expanded", "false");
    },
  );

  it("stays open while crossing into the panel, then closes on leaving", () => {
    vi.useFakeTimers();
    renderNavbar();
    const trigger = within(mainNav()).getByRole("button", { name: "READ" });
    pointerEvent(trigger, "pointerover");
    const panel = within(mainNav()).getByRole("group", { name: "READ" });

    pointerEvent(trigger, "pointerout");
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    pointerEvent(panel, "pointerover");
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    const news = within(panel).getByRole("link", { name: /\[N\] NEWS/ });
    pointerEvent(panel, "pointerout", "mouse", news);
    pointerEvent(news, "pointerover", "mouse", panel);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    pointerEvent(panel, "pointerout");
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("switches groups without a pending close dismissing the new group", () => {
    vi.useFakeTimers();
    renderNavbar();
    const community = within(mainNav()).getByRole("button", {
      name: "COMMUNITY",
    });
    const read = within(mainNav()).getByRole("button", { name: "READ" });
    pointerEvent(community, "pointerover");
    pointerEvent(community, "pointerout");
    pointerEvent(read, "pointerover");
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(community).toHaveAttribute("aria-expanded", "false");
    expect(read).toHaveAttribute("aria-expanded", "true");
    fireEvent.mouseDown(document.body);
    expect(read).toHaveAttribute("aria-expanded", "false");
  });

  it("preserves keyboard focus when the pointer leaves and closes on focus leaving", () => {
    vi.useFakeTimers();
    renderNavbar();
    const read = within(mainNav()).getByRole("button", { name: "READ" });
    fireEvent.keyDown(read, { key: "ArrowDown" });
    const news = within(mainNav()).getByRole("link", { name: /\[N\] NEWS/ });
    pointerEvent(news, "pointerout");
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(read).toHaveAttribute("aria-expanded", "true");
    expect(news).toHaveFocus();
    act(() =>
      within(mainNav())
        .getByRole("link", { name: /EVENTS/ })
        .focus(),
    );
    expect(read).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps a hovered menu open when focus moves from another group's trigger", () => {
    renderNavbar();
    const community = within(mainNav()).getByRole("button", {
      name: "COMMUNITY",
    });
    const read = within(mainNav()).getByRole("button", { name: "READ" });
    act(() => community.focus());
    pointerEvent(community, "pointerover");
    pointerEvent(community, "pointerout");
    pointerEvent(read, "pointerover");
    expect(community).toHaveFocus();
    const news = within(mainNav()).getByRole("link", { name: /\[N\] NEWS/ });
    act(() => news.focus());
    expect(read).toHaveAttribute("aria-expanded", "true");
    expect(news).toHaveFocus();
    fireEvent.click(news);
    expect(read).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps touch and mobile navigation click-operated", () => {
    renderNavbar();
    const read = within(mainNav()).getByRole("button", { name: "READ" });
    pointerEvent(read, "pointerover", "touch");
    expect(read).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(read);
    expect(read).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(read);
    expect(read).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(
      screen.getByRole("button", { name: "Open navigation menu" }),
    );
    const mobileRead = within(screen.getByRole("dialog")).getByRole("button", {
      name: "READ",
    });
    pointerEvent(mobileRead, "pointerover");
    expect(mobileRead).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(mobileRead);
    expect(mobileRead).toHaveAttribute("aria-expanded", "true");
  });

  it("server-renders every header link in the HTML while menus are closed", () => {
    const html = renderToString(
      <NextIntlClientProvider locale="en" messages={en}>
        <Navbar />
      </NextIntlClientProvider>,
    );

    expect(html).toContain('aria-expanded="false"');
    for (const href of HEADER_HREFS) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(html).toContain('href="/forum"');
    expect(html).not.toContain('href="/communities/ait/forum"');
    expect(html).not.toContain('href="/sponsors"');
    expect(html).not.toContain(">MORE<");
    expect(html).toContain(en.nav.descriptions.explore);
    expect(html).toContain(en.nav.descriptions.roles);
  });

  it("server-renders Dutch menu copy", () => {
    const html = renderToString(
      <NextIntlClientProvider locale="nl" messages={nl}>
        <Navbar />
      </NextIntlClientProvider>,
    );
    expect(html).toContain(nl.nav.groups.read.toUpperCase());
    expect(html).toContain(nl.nav.descriptions.explore);
    expect(html).toContain(nl.nav.descriptions.jobs);
    expect(html).toContain('href="/forum"');
    expect(html).not.toContain('href="/communities/ait/forum"');
    expect(html).toContain('href="/auth/signup"');
  });

  it("orders the bar Community, Events, Read, Startups, Work", () => {
    renderNavbar();
    const text = mainNav().textContent ?? "";
    const at = (label: string) => text.indexOf(label);
    expect(at("COMMUNITY")).toBeGreaterThanOrEqual(0);
    expect(at("COMMUNITY")).toBeLessThan(at("EVENTS"));
    expect(at("EVENTS")).toBeLessThan(at("READ"));
    expect(at("READ")).toBeLessThan(at("STARTUPS"));
    expect(at("STARTUPS")).toBeLessThan(at("WORK"));
    expect(
      screen.queryByRole("button", { name: /more/i }),
    ).not.toBeInTheDocument();
  });

  it("opens a group with a button, a description, and arrow keys", () => {
    renderNavbar();
    const community = within(mainNav()).getByRole("button", {
      name: "COMMUNITY",
    });
    expect(community).toHaveAttribute("aria-expanded", "false");
    expect(community).toHaveAttribute("aria-controls");

    fireEvent.keyDown(community, { key: "ArrowDown" });
    expect(community).toHaveAttribute("aria-expanded", "true");
    const explore = within(mainNav()).getByRole("link", {
      name: /\[C\] EXPLORE/,
    });
    expect(explore).toHaveAttribute("href", "/communities");
    expect(explore).toHaveFocus();
    expect(
      within(mainNav()).getByText(en.nav.descriptions.explore),
    ).toBeInTheDocument();

    fireEvent.keyDown(explore, { key: "ArrowDown" });
    const members = within(mainNav()).getByRole("link", {
      name: /\[M\] MEMBERS/,
    });
    expect(members).toHaveFocus();
    expect(members).toHaveAttribute("href", "/members");

    fireEvent.keyDown(members, { key: "Escape" });
    expect(community).toHaveAttribute("aria-expanded", "false");
    expect(community).toHaveFocus();
  });

  it("shows Dutch descriptions in the open menu", () => {
    renderNavbar("nl");
    const nav = screen.getByRole("navigation", { name: nl.nav.primaryNav });
    fireEvent.click(within(nav).getByRole("button", { name: "LEZEN" }));
    expect(within(nav).getByText(nl.nav.descriptions.news)).toBeInTheDocument();
    expect(
      within(nav).getByRole("link", { name: /\[G\] MAGAZINES/ }),
    ).toHaveAttribute("href", "/magazines");
  });

  it("has a Magazines link", () => {
    renderNavbar();
    fireEvent.click(
      screen.getByRole("button", { name: "Open navigation menu" }),
    );
    const menu = screen.getByRole("dialog");
    const read = within(menu).getByRole("button", { name: "READ" });
    expect(read).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(read);
    expect(read).toHaveAttribute("aria-expanded", "true");
    expect(
      within(menu).getByRole("link", { name: /\[G\] MAGAZINES/ }),
    ).toHaveAttribute("href", "/magazines");
  });

  it("moves through the mobile menu with the keyboard", () => {
    renderNavbar();
    const opener = screen.getByRole("button", { name: "Open navigation menu" });
    fireEvent.click(opener);
    expect(opener).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByRole("dialog");
    const read = within(menu).getByRole("button", { name: "READ" });
    fireEvent.keyDown(read, { key: "ArrowDown" });
    expect(read).toHaveAttribute("aria-expanded", "true");
    expect(
      within(menu).getByRole("link", { name: /\[N\] NEWS/ }),
    ).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(read).toHaveAttribute("aria-expanded", "false");
    expect(read).toHaveFocus();
  });

  it("takes desktop and mobile Join controls directly to the account form", () => {
    renderNavbar();
    const joins = screen.getAllByRole("link", { name: /\[J\] JOIN/ });
    expect(joins.length).toBeGreaterThan(0);
    for (const link of joins) {
      expect(link).toHaveAttribute("href", "/auth/signup");
    }
  });

  it("opens Magazines with the G shortcut and Sponsors with S", () => {
    renderNavbar();
    fireEvent.keyDown(window, { key: "g" });
    expect(router.push).toHaveBeenCalledWith("/magazines");
    fireEvent.keyDown(window, { key: "s" });
    expect(router.push).toHaveBeenCalledWith("/sponsors");
    fireEvent.keyDown(window, { key: "j" });
    expect(router.push).toHaveBeenCalledWith("/auth/signup");
    fireEvent.keyDown(window, { key: "w" });
    expect(router.push).toHaveBeenCalledWith("/jobs");
    fireEvent.keyDown(window, { key: "r" });
    expect(router.push).toHaveBeenCalledWith("/roles");
    fireEvent.keyDown(window, { key: "o" });
    expect(router.push).toHaveBeenCalledWith("/forum");
    fireEvent.keyDown(window, { key: "f" });
    expect(router.push).toHaveBeenCalledWith("/ideas");
    fireEvent.keyDown(window, { key: "k" });
    expect(router.push).toHaveBeenCalledWith("/startups/ai-tools-list");
  });

  it("keeps both Jobs and Roles, and leaves Sponsors out of the header", () => {
    renderNavbar();
    expect(
      screen.queryByRole("link", { name: /sponsors/i }),
    ).not.toBeInTheDocument();
    const work = within(mainNav()).getByRole("button", { name: "WORK" });
    fireEvent.click(work);
    expect(
      within(mainNav()).getByRole("link", { name: /\[W\] JOBS/ }),
    ).toHaveAttribute("href", "/jobs");
    expect(
      within(mainNav()).getByRole("link", { name: /\[R\] ROLES/ }),
    ).toHaveAttribute("href", "/roles");
    expect(NAV_BAR.map((entry) => entry.key)).toEqual([
      "community",
      "events",
      "read",
      "startups",
      "work",
    ]);
  });

  it("puts Forum and Ideas in Community, and AI tools in Startups", () => {
    renderNavbar();
    const communityButton = within(mainNav()).getByRole("button", {
      name: "COMMUNITY",
    });
    fireEvent.click(communityButton);
    expect(
      within(mainNav()).getByRole("link", { name: /\[O\] FORUM/ }),
    ).toHaveAttribute("href", "/forum");
    expect(
      within(mainNav()).getByRole("link", { name: /\[F\] IDEAS/ }),
    ).toHaveAttribute("href", "/ideas");
    expect(
      within(mainNav()).getByText(en.nav.descriptions.forum),
    ).toBeInTheDocument();

    fireEvent.click(communityButton);
    fireEvent.click(
      within(mainNav()).getByRole("button", { name: "STARTUPS" }),
    );
    const startups = document.getElementById("site-nav-desktop-startups");
    expect(startups).not.toBeNull();
    expect(
      within(startups!).getByRole("link", { name: /\[K\] AI TOOLS/ }),
    ).toHaveAttribute("href", "/startups/ai-tools-list");
    expect(
      within(startups!).getByText(en.nav.descriptions.aiTools),
    ).toBeInTheDocument();
    expect(
      within(startups!).queryByRole("link", { name: /\[F\] IDEAS/ }),
    ).not.toBeInTheDocument();
  });

  it("lights the longer destination when two nav paths nest", () => {
    path.value = "/startups/ai-tools-list";
    const onTools = renderNavbar();
    fireEvent.click(
      within(mainNav()).getByRole("button", { name: "STARTUPS" }),
    );
    expect(
      within(mainNav()).getByRole("link", { name: /\[K\] AI TOOLS/ }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(mainNav()).getByRole("link", { name: /\[U\] STARTUPS/ }),
    ).not.toHaveAttribute("aria-current");
    onTools.unmount();

    path.value = "/forum";
    renderNavbar();
    fireEvent.click(
      within(mainNav()).getByRole("button", { name: "COMMUNITY" }),
    );
    expect(
      within(mainNav()).getByRole("link", { name: /\[O\] FORUM/ }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(mainNav()).getByRole("link", { name: /\[C\] EXPLORE/ }),
    ).not.toHaveAttribute("aria-current");
  });
});
