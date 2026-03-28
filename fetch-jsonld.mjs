// fetch-jsonld.mjs
// Fetches a page and extracts all <script type="application/ld+json"> tags
// Also reports security-relevant response headers.

const TARGET_URL =
  "https://www.aitcommunity.org/en/blog/i-can-now-produce-draft-statutory-accounts-in-1-hour-instead-of-1-week-1774430505323";

async function main() {
  console.log(`Fetching: ${TARGET_URL}\n`);

  const response = await fetch(TARGET_URL, {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; SecurityTest/1.0; +https://example.com)",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  console.log(`HTTP Status: ${response.status} ${response.statusText}`);
  console.log("=".repeat(60));

  // ── Security headers ──────────────────────────────────────────
  const SECURITY_HEADERS = [
    "content-security-policy",
    "content-security-policy-report-only",
    "x-frame-options",
    "x-content-type-options",
    "strict-transport-security",
    "referrer-policy",
    "permissions-policy",
    "cross-origin-opener-policy",
    "cross-origin-embedder-policy",
    "cross-origin-resource-policy",
    "x-xss-protection",
  ];

  console.log("\n── Security Headers ──────────────────────────────────");
  let foundAny = false;
  for (const header of SECURITY_HEADERS) {
    const value = response.headers.get(header);
    if (value !== null) {
      console.log(`${header}: ${value}`);
      foundAny = true;
    } else {
      console.log(`${header}: *** NOT PRESENT ***`);
    }
  }

  // Dump ALL response headers for completeness
  console.log("\n── All Response Headers ──────────────────────────────");
  for (const [name, value] of response.headers.entries()) {
    console.log(`${name}: ${value}`);
  }

  // ── Extract JSON-LD ───────────────────────────────────────────
  const html = await response.text();
  console.log(`\nHTML length: ${html.length} characters`);

  // Regex that captures everything between the opening and closing tags,
  // including newlines (s flag).
  const jsonLdRegex =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  const matches = [...html.matchAll(jsonLdRegex)];

  console.log(
    `\n── JSON-LD Script Tags Found: ${matches.length} ───────────────`
  );

  if (matches.length === 0) {
    console.log("No <script type=\"application/ld+json\"> tags found.");
  }

  for (let i = 0; i < matches.length; i++) {
    const rawContent = matches[i][1].trim();
    console.log(`\n[Tag ${i + 1}] Raw content:\n${"─".repeat(50)}`);
    console.log(rawContent);
    console.log("─".repeat(50));

    // Try to pretty-print and surface author.name
    try {
      const parsed = JSON.parse(rawContent);
      console.log(`\n[Tag ${i + 1}] Parsed (pretty):\n${"─".repeat(50)}`);
      console.log(JSON.stringify(parsed, null, 2));

      // Check for author.name
      const authorName = extractAuthorName(parsed);
      if (authorName !== null) {
        console.log(`\n  --> author.name found: "${authorName}"`);
      } else {
        console.log(
          "\n  --> No author.name property found in this JSON-LD block."
        );
      }
    } catch (e) {
      console.log(`[Tag ${i + 1}] Could not parse as JSON: ${e.message}`);
    }
  }

  // ── Final author.name verdict ─────────────────────────────────
  console.log("\n── Author.name Verdict ───────────────────────────────");
  let authorNamesFound = [];
  for (const match of matches) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const name = extractAuthorName(parsed);
      if (name) authorNamesFound.push(name);
    } catch (_) {}
  }

  if (authorNamesFound.length > 0) {
    console.log(
      `author.name appears verbatim in JSON-LD: YES → [${authorNamesFound.join(", ")}]`
    );
  } else {
    console.log("author.name appears verbatim in JSON-LD: NO");
  }
}

/**
 * Recursively search a parsed JSON object for an `author` key
 * that contains a `name` string (handles arrays too).
 */
function extractAuthorName(obj) {
  if (typeof obj !== "object" || obj === null) return null;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      const result = extractAuthorName(item);
      if (result !== null) return result;
    }
    return null;
  }

  if ("author" in obj) {
    const author = obj.author;
    if (typeof author === "object" && author !== null && "name" in author) {
      return author.name;
    }
    if (Array.isArray(author)) {
      for (const a of author) {
        if (typeof a === "object" && a !== null && "name" in a) return a.name;
      }
    }
  }

  // Recurse into all values
  for (const value of Object.values(obj)) {
    const result = extractAuthorName(value);
    if (result !== null) return result;
  }

  return null;
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
