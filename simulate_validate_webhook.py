"""
Simulates the validateWebhookUrl() function from
/repos/aitcom/src/server/agent/validate-webhook-url.ts

Key difference from naive Python urlparse:
  Node.js `new URL()` normalises IPv4-mapped IPv6 addresses to pure hex form.
  e.g. `[::ffff:169.254.169.254]` -> `[::ffff:a9fe:a9fe]`

  Python's ipaddress module does the OPPOSITE: it prefers the dotted-decimal
  form for IPv4-mapped addresses (`::ffff:169.254.169.254`).

  We replicate the Node.js direction explicitly: extract the IPv4 octets from
  an IPv4-mapped address and format them as two hex groups.
"""

import ipaddress
import re
from urllib.parse import urlparse


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _to_nodejs_ipv6_hostname(raw_hostname: str) -> str:
    """
    Given a hostname string (with or without brackets), normalise any
    IPv6 address to the same form that Node.js `new URL()` produces.

    Node.js rule for IPv4-mapped IPv6:
      ::ffff:<ipv4-dotted>  →  ::ffff:<hex-group1>:<hex-group2>
      e.g.  ::ffff:169.254.169.254  →  ::ffff:a9fe:a9fe

    For all other IPv6 addresses the ipaddress compressed form is used,
    which matches Node.js behaviour.
    """
    stripped = raw_hostname.lstrip("[").rstrip("]")
    try:
        addr = ipaddress.ip_address(stripped)
    except ValueError:
        return raw_hostname   # not an IP literal – return as-is

    if not isinstance(addr, ipaddress.IPv6Address):
        return raw_hostname   # plain IPv4 – no change needed

    # Check for IPv4-mapped (::ffff:x.x.x.x)
    # ipaddress exposes this via .ipv4_mapped
    if addr.ipv4_mapped is not None:
        ipv4 = addr.ipv4_mapped
        # Convert each octet pair to a 16-bit hex group (no leading zeros)
        packed = ipv4.packed          # 4 bytes
        hi = (packed[0] << 8) | packed[1]
        lo = (packed[2] << 8) | packed[3]
        normalised = f"[::ffff:{hi:x}:{lo:x}]"
    else:
        # Non-mapped IPv6: use Python's compressed form, which matches Node.js
        normalised = f"[{str(addr)}]"

    return normalised.lower()


def _parse_url_like_nodejs(raw: str):
    """
    Parse a URL and return (protocol, hostname) where hostname is normalised
    to the form that Node.js `new URL()` produces.

    Returns None if the URL is unparseable.
    """
    try:
        parsed = urlparse(raw)
        if not parsed.scheme or not parsed.netloc:
            return None

        protocol = parsed.scheme + ":"   # e.g. "https:"
        netloc    = parsed.netloc         # e.g. "[::ffff:a9fe:a9fe]:443" or "host:80"

        # Extract the host part (without port), preserving brackets for IPv6
        bracket_match = re.match(r"^\[([^\]]+)\](?::\d+)?$", netloc)
        if bracket_match:
            raw_host = f"[{bracket_match.group(1)}]"
        else:
            raw_host = netloc.split(":")[0]

        hostname = _to_nodejs_ipv6_hostname(raw_host).lower()
        return protocol, hostname

    except Exception:
        return None


# ---------------------------------------------------------------------------
# Exact translation of isPrivateHostname()
# ---------------------------------------------------------------------------

def is_private_hostname(hostname: str) -> bool:
    """Direct Python translation of the TypeScript isPrivateHostname()."""
    # Match raw IPv4 addresses against private ranges
    ipv4_match = re.fullmatch(
        r"(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})", hostname
    )
    if ipv4_match:
        a, b = int(ipv4_match.group(1)), int(ipv4_match.group(2))
        if a == 10:                              return True   # 10.0.0.0/8
        if a == 172 and 16 <= b <= 31:           return True   # 172.16.0.0/12
        if a == 192 and b == 168:                return True   # 192.168.0.0/16
        if a == 169 and b == 254:                return True   # 169.254.0.0/16 link-local
        if a == 100 and 64 <= b <= 127:          return True   # 100.64.0.0/10 CGNAT
        if a == 0:                               return True   # 0.0.0.0/8

    # Block IPv6 private ranges embedded in bracket notation
    stripped = hostname.lstrip("[").rstrip("]")
    if (stripped.startswith("fc") or
            stripped.startswith("fd") or
            stripped.startswith("fe80")):
        return True

    return False


# ---------------------------------------------------------------------------
# Exact translation of validateWebhookUrl()
# ---------------------------------------------------------------------------

def validate_webhook_url(raw: str) -> dict:
    """Direct Python translation of the TypeScript validateWebhookUrl()."""
    parsed = _parse_url_like_nodejs(raw)
    if parsed is None:
        return {"ok": False, "reason": "Invalid URL"}

    protocol, hostname = parsed

    if protocol != "https:":
        return {"ok": False, "reason": "Webhook URL must use HTTPS"}

    # Block localhost / loopback
    if hostname in ("localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"):
        return {"ok": False, "reason": "Webhook URL must not point to localhost"}

    # Block private/internal IP ranges
    if is_private_hostname(hostname):
        return {
            "ok": False,
            "reason": "Webhook URL must not point to a private/internal address",
        }

    # Block common cloud metadata endpoints
    if hostname in ("169.254.169.254", "metadata.google.internal", "metadata.internal"):
        return {
            "ok": False,
            "reason": "Webhook URL must not point to cloud metadata services",
        }

    return {"ok": True}


# ---------------------------------------------------------------------------
# Test runner
# ---------------------------------------------------------------------------

TEST_CASES = [
    (
        "https://[::ffff:169.254.169.254]/latest/meta-data/",
        "IPv4-mapped IPv6 dotted-decimal form\n"
        "             Node.js normalises to [::ffff:a9fe:a9fe]",
    ),
    (
        "https://[::ffff:a9fe:a9fe]/latest/meta-data/",
        "IPv4-mapped IPv6 hex form (already Node.js canonical)",
    ),
    (
        "https://169.254.169.254/test",
        "Plain IPv4 link-local – should be BLOCKED",
    ),
    (
        "https://httpbin.org/redirect-to?url=http://169.254.169.254/",
        "Open-redirect – metadata IP lives in query string, not hostname\n"
        "             Should PASS the validator",
    ),
]

SEP = "=" * 72

print(SEP)
print("Simulating validateWebhookUrl()  (TypeScript logic replicated in Python)")
print(SEP)

for url, description in TEST_CASES:
    parsed = _parse_url_like_nodejs(url)
    node_hostname = parsed[1] if parsed else "(unparseable)"
    result = validate_webhook_url(url)

    verdict = "*** BLOCKED ***" if not result["ok"] else "PASSES (not blocked)"
    reason  = result.get("reason", "—")

    print(f"\nInput URL    : {url}")
    print(f"Description  : {description}")
    print(f"Node hostname: {node_hostname}  <- what the validator actually checks")
    print(f"Verdict      : {verdict}")
    if not result["ok"]:
        print(f"Block reason : {reason}")

print(f"\n{SEP}")
print("Node.js hostname normalisation (confirmed by `node -e` output above)")
print(SEP)
print("  https://[::ffff:169.254.169.254]/  ->  hostname: [::ffff:a9fe:a9fe]")
print("  https://[::ffff:a9fe:a9fe]/        ->  hostname: [::ffff:a9fe:a9fe]")
print("  https://169.254.169.254/           ->  hostname: 169.254.169.254")
print("  https://httpbin.org/...            ->  hostname: httpbin.org")

print(f"\n{SEP}")
print("Security Analysis")
print(SEP)
print("""
URL 1 & 2 – IPv4-mapped IPv6 BYPASS:
  Both URLs encode the AWS/Azure/GCP link-local metadata address
  (169.254.169.254) as an IPv6 literal.  Node.js normalises both to
  [::ffff:a9fe:a9fe].

  The validator's isPrivateHostname() strips brackets and tests whether
  the result starts with "fc", "fd", or "fe80".  The string
  "::ffff:a9fe:a9fe" matches none of those prefixes.
  The IPv4 regex cannot match an IPv6 literal.
  The explicit cloud-metadata check uses the bare string "169.254.169.254",
  which does not match the bracketed form either.

  RESULT: BOTH BYPASS the validator.  This is a real SSRF gap.

URL 3 – Plain IPv4 169.254.169.254:
  The IPv4 regex matches; a==169, b==254 triggers the link-local rule in
  isPrivateHostname().
  RESULT: Correctly BLOCKED.

URL 4 – Open redirect via httpbin.org:
  The validator inspects only the parsed hostname of the supplied URL
  ("httpbin.org").  The inner URL embedded in the query parameter is never
  examined.  If the HTTP client follows the redirect, it will reach
  http://169.254.169.254/ at request-time, well after validation.
  RESULT: PASSES the validator (open-redirect SSRF is not caught at
  validation time).
""")
