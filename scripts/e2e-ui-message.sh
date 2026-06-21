#!/usr/bin/env bash
# Send an agentSendMessage with a uiResource over real HTTP (superjson batch),
# print the new messageId. Usage: e2e-ui-message.sh <API_KEY>
#
# The View HTML speaks the MCP Apps guest protocol (spec 2026-01-26):
#   ui/initialize -> ui/notifications/initialized -> ui/message on click.
set -euo pipefail
API_KEY="${1:?usage: e2e-ui-message.sh <API_KEY>}"
BASE="${BASE:-http://localhost:3000}"

read -r -d '' HTML <<'HTMLDOC' || true
<!doctype html><html><body style="font-family:system-ui,sans-serif;padding:20px">
<h3 style="margin:0 0 12px">Dev Agent widget</h3>
<p id="status" style="color:#666;margin:0 0 12px">initializing…</p>
<button id="say" style="padding:8px 14px;font-size:14px;cursor:pointer">Say hi</button>
<script>
  var nextId = 1;
  function send(method, params) {
    window.parent.postMessage({ jsonrpc: "2.0", id: nextId++, method: method, params: params }, "*");
  }
  function notify(method, params) {
    window.parent.postMessage({ jsonrpc: "2.0", method: method, params: params }, "*");
  }
  function reportSize() {
    var h = Math.ceil(document.documentElement.getBoundingClientRect().height);
    notify("ui/notifications/size-changed", { height: h });
  }
  var initId = nextId;
  send("ui/initialize", {
    appInfo: { name: "Dev Widget", version: "1.0.0" },
    appCapabilities: {},
    protocolVersion: "2026-01-26"
  });
  window.addEventListener("message", function (e) {
    if (e.data && e.data.id === initId && e.data.result) {
      notify("ui/notifications/initialized", {});
      document.getElementById("status").textContent = "ready — click the button";
      reportSize();
    }
  });
  if (window.ResizeObserver) new ResizeObserver(reportSize).observe(document.documentElement);
  window.addEventListener("load", reportSize);
  document.getElementById("say").addEventListener("click", function () {
    send("ui/message", { role: "user", content: [{ type: "text", text: "hello from the iframe" }] });
  });
</script>
</body></html>
HTMLDOC

# superjson input wrapper + httpBatchLink envelope
BODY=$(HTML="$HTML" node -e '
  const html = process.env.HTML;
  const input = { content: "E2E: interactive widget",
    uiResource: { uri: "ui://dev/widget", mimeType: "text/html;profile=mcp-app",
      encoding: "text", content: html,
      csp: { connectDomains: ["api.example.com"], resourceDomains: ["cdn.example.com"], frameDomains: ["embed.example.com"] } } };
  process.stdout.write(JSON.stringify({ "0": { json: input } }));
')

curl -s -X POST "$BASE/api/trpc/inbox.agentSendMessage?batch=1" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  --data "$BODY"
echo
