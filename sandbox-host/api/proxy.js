// MCP-Apps sandbox proxy, served with a per-request Content-Security-Policy
// header derived from the `?csp=` query param (set by @mcp-ui/client AppFrame).
//
// Why a function and not a static file: the CSP MUST be an HTTP header, not a
// <meta> tag. A meta CSP on the doc.write'd View is bypassable (the guest can
// document.write a fresh, CSP-less document); a header is bound to the response
// and is inherited by the inner about:blank iframe, so it is tamper-proof. This
// mirrors the official reference (ext-apps examples/basic-host/serve.ts).
//
// The host app (src/components/inbox/ui-message.tsx) only forwards declared
// domains for trust tiers that earn them, so by the time `?csp=` arrives it is
// already trust-filtered; untrusted tiers send nothing → restrictive default.

// Reject domain entries containing characters that could break out of a CSP
// directive (`;`, newlines), inject CSP keywords (quotes), or smuggle multiple
// sources (space). Verbatim from the reference builder.
function sanitizeCspDomains(domains) {
  if (!Array.isArray(domains)) return [];
  return domains.filter((d) => typeof d === "string" && !/[;\r\n'" ]/.test(d));
}

function buildCspHeader(csp) {
  const resourceDomains = sanitizeCspDomains(csp && csp.resourceDomains).join(
    " ",
  );
  const connectDomains = sanitizeCspDomains(csp && csp.connectDomains).join(
    " ",
  );
  const frameDomains =
    sanitizeCspDomains(csp && csp.frameDomains).join(" ") || null;
  const baseUriDomains =
    sanitizeCspDomains(csp && csp.baseUriDomains).join(" ") || null;

  return [
    "default-src 'self' 'unsafe-inline'",
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data: ${resourceDomains}`.trim(),
    `style-src 'self' 'unsafe-inline' blob: data: ${resourceDomains}`.trim(),
    `img-src 'self' data: blob: ${resourceDomains}`.trim(),
    `font-src 'self' data: blob: ${resourceDomains}`.trim(),
    `media-src 'self' data: blob: ${resourceDomains}`.trim(),
    `connect-src 'self' ${connectDomains}`.trim(),
    `worker-src 'self' blob: ${resourceDomains}`.trim(),
    frameDomains ? `frame-src ${frameDomains}` : "frame-src 'none'",
    "object-src 'none'",
    baseUriDomains ? `base-uri ${baseUriDomains}` : "base-uri 'none'",
  ].join("; ");
}

// The sandbox proxy relay. Implements the MCP Apps proxy protocol (spec
// 2026-01-26): sandbox-proxy-ready -> sandbox-resource-ready{html} -> doc.write,
// then bidirectional JSON-RPC relay between host and the inner View iframe.
// Host origins allowed to embed this proxy (add the production app origin here).
const PROXY_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>MCP-UI Sandbox Proxy</title>
    <style>
      html, body { margin: 0; height: 100vh; width: 100vw; }
      body { display: flex; flex-direction: column; }
      * { box-sizing: border-box; }
      iframe { background-color: transparent; border: 0 none transparent; padding: 0; overflow: hidden; flex-grow: 1; }
    </style>
  </head>
  <body>
    <script>
      var ALLOWED_HOST_ORIGIN = [
        /^https?:\\/\\/(localhost|127\\.0\\.0\\.1)(:\\d+)?$/,
        /^https:\\/\\/([a-z0-9-]+\\.)*vercel\\.app$/,
      ];

      if (window.self === window.top) throw new Error("iframe-only");
      if (!document.referrer) throw new Error("No referrer");

      var EXPECTED_HOST_ORIGIN = new URL(document.referrer).origin;
      var OWN_ORIGIN = new URL(window.location.href).origin;

      if (!ALLOWED_HOST_ORIGIN.some(function (re) { return re.test(EXPECTED_HOST_ORIGIN); })) {
        throw new Error("Embedding origin not allowed: " + EXPECTED_HOST_ORIGIN);
      }

      try {
        window.top.alert("If you see this, the sandbox is not setup securely.");
        throw "FAIL";
      } catch (e) {
        if (e === "FAIL") throw new Error("The sandbox is not setup securely.");
      }

      var RESOURCE_READY = "ui/notifications/sandbox-resource-ready";
      var PROXY_READY = "ui/notifications/sandbox-proxy-ready";

      var inner = document.createElement("iframe");
      inner.style = "width:100%; height:100%; border:none;";
      inner.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms");
      document.body.appendChild(inner);

      function writeHtml(markup) {
        try {
          var doc = inner.contentDocument || (inner.contentWindow && inner.contentWindow.document);
          if (doc) { doc.open(); doc.write(markup); doc.close(); return; }
        } catch (e) {}
        inner.srcdoc = markup;
      }

      window.addEventListener("message", function (event) {
        if (event.source === window.parent) {
          if (event.origin !== EXPECTED_HOST_ORIGIN) return;
          if (event.data && event.data.method === RESOURCE_READY) {
            var p = event.data.params || {};
            if (typeof p.sandbox === "string") inner.setAttribute("sandbox", p.sandbox);
            if (p.permissions && typeof p.permissions === "object") {
              var allow = Object.keys(p.permissions).filter(function (k) { return p.permissions[k]; }).join("; ");
              if (allow) inner.setAttribute("allow", allow);
            }
            if (typeof p.html === "string") writeHtml(p.html);
            return;
          }
          if (inner.contentWindow) inner.contentWindow.postMessage(event.data, "*");
        } else if (event.source === inner.contentWindow) {
          if (event.origin !== OWN_ORIGIN && event.origin !== "null") return;
          window.parent.postMessage(event.data, EXPECTED_HOST_ORIGIN);
        }
      });

      window.parent.postMessage({ jsonrpc: "2.0", method: PROXY_READY, params: {} }, EXPECTED_HOST_ORIGIN);
    </script>
  </body>
</html>`;

module.exports = (req, res) => {
  let csp;
  const raw = req.query && req.query.csp;
  if (typeof raw === "string") {
    try {
      csp = JSON.parse(raw);
    } catch (e) {
      // ignore malformed csp param → restrictive default
    }
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Security-Policy", buildCspHeader(csp));
  res.setHeader("X-Content-Type-Options", "nosniff");
  // CSP varies per ?csp= → never cache.
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send(PROXY_HTML);
};
