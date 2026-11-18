#!/usr/bin/env python3
"""
InstaReporter - a safe, phone-friendly Instagram report helper.

This app does NOT log in to Instagram, collect passwords/cookies, automate
reports, mass-report accounts, or submit anything to Instagram. It helps you
organize a concern and opens Instagram so you can review and use its official
in-app reporting flow yourself.

Run on Android with Pydroid 3 or Termux:
    python insta_reporter.py
Then open http://127.0.0.1:8765 in your phone browser.
Stop with Ctrl+C in the Python app.
"""

from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs
from html import escape
from datetime import datetime
from pathlib import Path
import csv
import json
import webbrowser

HOST = "127.0.0.1"
PORT = 8765
DATA_DIR = Path(__file__).resolve().parent
LOG_FILE = DATA_DIR / "report_notes.csv"

REASONS = [
    "Bullying or harassment",
    "Impersonation",
    "Scam or fraud",
    "Spam",
    "Hate or abusive content",
    "Something else",
]

PAGE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>InstaReporter — Report Helper</title>
<style>
:root{color-scheme:dark;--bg:#101018;--panel:#1b1b28;--muted:#aaaabd;--accent:#b58cff;--line:#343448}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:#f6f4fb;font:16px system-ui,Arial}
main{max-width:720px;margin:auto;padding:22px 16px 44px}
h1{font-size:27px;margin:0 0 6px}p{line-height:1.5}.muted{color:var(--muted);font-size:14px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:17px;margin:16px 0}
label{display:block;font-weight:650;margin:13px 0 7px}
input,select,textarea{width:100%;padding:12px;border-radius:10px;border:1px solid var(--line);background:#11111a;color:white;font:inherit}
textarea{min-height:95px;resize:vertical}
button,.button{display:inline-block;border:0;border-radius:11px;padding:12px 16px;background:var(--accent);color:#171020;font-weight:750;text-decoration:none;margin-top:14px;cursor:pointer}
.secondary{background:#333247;color:white}.notice{border-left:4px solid var(--accent);padding:10px 12px;background:#242236;border-radius:8px}
.item{border-top:1px solid var(--line);padding:12px 0}.item:first-child{border:0}
small{color:var(--muted)}.actions{display:flex;gap:10px;flex-wrap:wrap}
a{color:#d4baff}
</style>
</head>
<body><main>
<h1>InstaReporter</h1>
<p class="muted">A simple, phone-friendly helper to organize a genuine Instagram safety report.</p>
<div class="card notice"><b>Important:</b> This tool does not submit reports or contact Instagram automatically.
It never asks for your Instagram password, OTP, or cookies. Review the content and submit
a report yourself through Instagram's official app if it genuinely breaks the rules.</div>
<div class="card">
<h2>New report note</h2>
<form method="post" action="/save">
<label for="url">Instagram profile or post link</label>
<input id="url" name="url" type="url" placeholder="https://www.instagram.com/..." required>
<label for="reason">Concern type</label>
<select id="reason" name="reason">__REASONS__</select>
<label for="details">What happened? (brief factual notes)</label>
<textarea id="details" name="details" placeholder="Describe only what you personally observed. Avoid sharing private information."></textarea>
<button type="submit">Save note on this phone</button>
</form>
</div>
<div class="card">
<h2>Official reporting steps</h2>
<ol>
<li>Open the profile, post, comment, or message in Instagram.</li>
<li>Tap the three-dot menu or the relevant report option.</li>
<li>Choose the closest accurate reason and follow Instagram's prompts.</li>
<li>Do not report content just because you disagree with someone.</li>
</ol>
<div class="actions">
<a class="button" href="https://help.instagram.com/" target="_blank" rel="noopener">Instagram Help Centre</a>
<a class="button secondary" href="https://www.instagram.com/" target="_blank" rel="noopener">Open Instagram</a>
</div>
</div>
<div class="card">
<h2>Saved notes</h2>
<p class="muted">Stored locally in report_notes.csv beside this Python file.</p>
__LOGS__
</div>
<p class="muted">Privacy: notes stay in this app's local CSV file. Do not record passwords, OTPs,
private addresses, or other sensitive personal details.</p>
</main></body></html>"""

def read_rows():
    if not LOG_FILE.exists():
        return []
    try:
        with LOG_FILE.open("r", newline="", encoding="utf-8") as f:
            return list(csv.DictReader(f))
    except (OSError, csv.Error):
        return []

def page():
    options = "".join(
        f'<option value="{escape(r)}">{escape(r)}</option>' for r in REASONS
    )
    rows = read_rows()
    if rows:
        items = []
        for row in reversed(rows[-20:]):
            items.append(
                '<div class="item"><b>' + escape(row.get("reason", "")) +
                '</b><br><a href="' + escape(row.get("url", ""), quote=True) +
                '" target="_blank" rel="noopener">Open saved link</a><br><small>' +
                escape(row.get("created", "")) + '</small><p>' +
                escape(row.get("details", "")) + '</p></div>'
            )
        logs = "".join(items)
    else:
        logs = '<p class="muted">No notes saved yet.</p>'
    return PAGE.replace("__REASONS__", options).replace("__LOGS__", logs)

class Handler(BaseHTTPRequestHandler):
    def send_html(self, body, status=200):
        data = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/":
            self.send_html(page())
        else:
            self.send_html("<h1>Not found</h1>", 404)

    def do_POST(self):
        if self.path != "/save":
            self.send_html("<h1>Not found</h1>", 404)
            return
        length = min(int(self.headers.get("Content-Length", "0")), 20000)
        fields = parse_qs(self.rfile.read(length).decode("utf-8", "replace"))
        url = fields.get("url", [""])[0].strip()
        reason = fields.get("reason", ["Something else"])[0].strip()
        details = fields.get("details", [""])[0].strip()[:3000]

        # Accept only Instagram links; never fetch them from the server.
        if not (url.startswith("https://www.instagram.com/") or
                url.startswith("https://instagram.com/")):
            self.send_html("<p>Enter a valid https://www.instagram.com/ link.</p><p><a href='/'>Go back</a></p>", 400)
            return
        if reason not in REASONS:
            reason = "Something else"

        new_file = not LOG_FILE.exists()
        try:
            with LOG_FILE.open("a", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=["created", "url", "reason", "details"])
                if new_file:
                    writer.writeheader()
                writer.writerow({
                    "created": datetime.now().astimezone().isoformat(timespec="minutes"),
                    "url": url,
                    "reason": reason,
                    "details": details,
                })
        except OSError:
            self.send_html("<p>Could not save the note. Check file permissions.</p><p><a href='/'>Go back</a></p>", 500)
            return
        self.send_response(303)
        self.send_header("Location", "/")
        self.end_headers()

    def log_message(self, fmt, *args):
        # Keep the phone console tidy; no submitted form contents are logged.
        pass

def main():
    server = HTTPServer((HOST, PORT), Handler)
    print("InstaReporter helper is running.")
    print(f"Open this address in your phone browser: http://{HOST}:{PORT}")
    print(f"Notes file: {LOG_FILE}")
    print("This app does not submit reports or access Instagram accounts.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()

if __name__ == "__main__":
    main()
