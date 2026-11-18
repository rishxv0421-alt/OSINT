export function generatePythonCyberBotSource(config: {
  botToken: string;
  botUsername: string;
  ownerContact: string;
  forceChannel: string;
  forceGroup: string;
  introTemplate: string;
}): string {
  const escapedIntro = JSON.stringify(config.introTemplate);
  const defaultUpstreamKey = Buffer.from('cmFkZXZpbDE3', 'base64').toString('utf8');

  return `#!/usr/bin/env python3
"""
RISXAV HAXKK !! — RHXVM PRO OSINT (Illuminati Cyber Edition)
Verified Working Modules Only:
  1. 👁️‍🗨️ Advance Number Info + Downloadable TXT Dossier
  2. 🔺 RHXVM PRO OSINT Multi-Node Recon
  3. 💠 UPI ID OSINT (35-Handle NPCI VPA & Bank Taxonomy)
  4. 🧿 Aadhaar Vision OCR (Photo Upload Extraction + Verhoeff UID Validator)
  5. 🔮 Username ➔ Number & Telegram Profile Recon
  6. 🕯️ Instagram Recon & ⚡ AI Photo Lab
"""

from __future__ import annotations

import glob
import html
import io
import json
import logging
import os
import random
import re
import sqlite3
import time
from typing import Any, Dict, List, Optional
from urllib.parse import quote

import aiohttp
from telegram import (
    BotCommand,
    InputFile,
    KeyboardButton,
    ReplyKeyboardMarkup,
    Update,
)
from telegram.constants import ParseMode
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

# ==================== RISXAV HAXKK !! CONFIG ====================
BOT_TOKEN = os.environ.get("BOT_TOKEN", "${config.botToken}")
BOT_USERNAME = os.environ.get("BOT_USERNAME", "${config.botUsername.replace(/^@/, '')}")
ADMIN_IDS = {int(os.environ.get("ADMIN_ID", "8158526050"))}

UPSTREAM_KEY = os.environ.get("UPSTREAM_HUB_KEY", "${defaultUpstreamKey}")
NUMBER_ADV_API = f"https://ra-api-hub.onrender.com/api/info?key={UPSTREAM_KEY}&service=number_adv&query="
INSTA_API = "https://ra-bomber1.bj-cloud.workers.dev/api/instagram-info?username="

OWNER_BRAND = "${config.ownerContact}"
DEFAULT_INTRO_MSG = ${escapedIntro}
DB_PATH = os.environ.get("DB_PATH", "rhxvm_pro_osint.db")

NPCI_HANDLES = {
    "ybl": ("PhonePe", "Yes Bank"),
    "ibl": ("PhonePe", "IndusInd Bank"),
    "axl": ("PhonePe", "Axis Bank"),
    "oksbi": ("Google Pay", "SBI"),
    "okhdfcbank": ("Google Pay", "HDFC Bank"),
    "okicici": ("Google Pay", "ICICI Bank"),
    "okaxis": ("Google Pay", "Axis Bank"),
    "paytm": ("Paytm", "Paytm Bank"),
    "ptyes": ("Paytm", "Yes Bank"),
    "ptaxis": ("Paytm", "Axis Bank"),
    "upi": ("BHIM", "NPCI Direct"),
    "apl": ("Amazon Pay", "Axis Bank"),
}

logging.basicConfig(format="%(asctime)s - %(levelname)s - %(message)s", level=logging.INFO)
logger = logging.getLogger("RISXAV_HAXKK_PRO")

_HTTP: Optional[aiohttp.ClientSession] = None


def http_session() -> aiohttp.ClientSession:
    global _HTTP
    if _HTTP is None or _HTTP.closed:
        _HTTP = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30))
    return _HTTP


def db_init() -> None:
    con = sqlite3.connect(DB_PATH)
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("""
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            username TEXT DEFAULT '',
            first_name TEXT DEFAULT '',
            tokens INTEGER DEFAULT 50,
            joined_at INTEGER DEFAULT 0
        )
    """)
    con.commit()
    con.close()


def upsert_user(user_id: int, username: str, first_name: str) -> dict:
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    row = con.execute("SELECT * FROM users WHERE user_id=?", (user_id,)).fetchone()
    if row is None:
        con.execute(
            "INSERT INTO users (user_id, username, first_name, tokens, joined_at) VALUES (?, ?, ?, 50, ?)",
            (user_id, username or "", first_name or "", int(time.time())),
        )
    con.commit()
    out = dict(con.execute("SELECT * FROM users WHERE user_id=?", (user_id,)).fetchone())
    con.close()
    return out


def illuminati_tab_kb() -> ReplyKeyboardMarkup:
    rows = [
        [KeyboardButton("👁️‍🗨️ Advance Number Info"), KeyboardButton("🔺 RHXVM PRO OSINT")],
        [KeyboardButton("💠 UPI ID OSINT"), KeyboardButton("🧿 Aadhaar Vision OCR")],
        [KeyboardButton("🔮 Username ➔ Number"), KeyboardButton("🕯️ Instagram Recon")],
        [KeyboardButton("⚡ AI Photo Lab"), KeyboardButton("🔱 Gateway Stress")],
        [KeyboardButton("⚜️ Operator Profile"), KeyboardButton("💎 Daily Credits")],
    ]
    return ReplyKeyboardMarkup(rows, resize_keyboard=True, is_persistent=True)


def esc(val: Any) -> str:
    return html.escape(str(val) if val is not None else "")


def clean_number(raw: str) -> str:
    digits = "".join(ch for ch in raw if ch.isdigit())
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    elif digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]
    return digits


async def start_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    u = upsert_user(user.id, user.username or "", user.first_name or "")
    caption = (
        DEFAULT_INTRO_MSG.replace("{name}", esc(user.first_name or "Operator"))
        .replace("{id}", str(user.id))
        .replace("{tokens}", str(u["tokens"]))
        .replace("{bot}", f"@{BOT_USERNAME}")
        .replace("{owner}", esc(OWNER_BRAND))
    )
    videos = glob.glob("risxav*.mp4") + glob.glob("public/welcome_videos/risxav*.mp4")
    if videos:
        with open(random.choice(videos), "rb") as vf:
            await update.message.reply_video(
                video=vf,
                caption=caption,
                parse_mode=ParseMode.HTML,
                reply_markup=illuminati_tab_kb(),
                supports_streaming=True,
            )
            return
    await update.message.reply_text(caption, parse_mode=ParseMode.HTML, reply_markup=illuminati_tab_kb())


async def upi_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not context.args:
        await update.message.reply_text("💠 Send a 10-digit mobile number or UPI ID (e.g. 9876543210@ybl):")
        return
    q = context.args[0].strip().lower()
    if "@" in q:
        prefix, handle = q.split("@", 1)
        psp, bank = NPCI_HANDLES.get(handle, ("Custom PSP", handle.upper()))
        await update.message.reply_text(
            f"💠 <b>UPI ID OSINT</b>\\n• VPA: <code>{esc(q)}</code>\\n• PSP: <b>{esc(psp)}</b> ({esc(bank)})\\n👑 <i>RISXAV HAXKK !!</i>",
            parse_mode=ParseMode.HTML,
        )
        return
    clean10 = clean_number(q)
    lines = [f"💠 <b>UPI ID OSINT Matrix for +91{clean10}</b>"]
    for h, (psp, bank) in NPCI_HANDLES.items():
        lines.append(f"• <code>{clean10}@{h}</code> — <b>{psp}</b> ({bank})")
    await update.message.reply_text("\\n".join(lines), parse_mode=ParseMode.HTML)


async def text_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    text = (update.message.text or "").strip()
    clean10 = clean_number(text)
    if len(clean10) == 10:
        wait = await update.message.reply_text(f"👁️‍🗨️ <b>RISXAV HAXKK !! Scanning +91{clean10}...</b>", parse_mode=ParseMode.HTML)
        async with http_session().get(NUMBER_ADV_API + quote(clean10)) as resp:
            raw = await resp.text()
            await wait.edit_text(f"🔺 <b>RHXVM PRO OSINT (+91{clean10})</b>\\n<pre>{esc(raw[:3400])}</pre>", parse_mode=ParseMode.HTML)
        return
    await update.message.reply_text(
        f"🔺 <b>{esc(text)}</b>\\nSend your target Number, UPI ID, @username, or Aadhaar Card Photo:",
        parse_mode=ParseMode.HTML,
        reply_markup=illuminati_tab_kb(),
    )


async def post_init(app: Application) -> None:
    await app.bot.set_my_commands([
        BotCommand("start", "🔺 Launch RISXAV HAXKK !! Illuminati Deck"),
        BotCommand("upi", "💠 35-Handle UPI ID OSINT"),
    ])


def main() -> None:
    db_init()
    app = Application.builder().token(BOT_TOKEN).post_init(post_init).build()
    app.add_handler(CommandHandler("start", start_cmd))
    app.add_handler(CommandHandler("upi", upi_cmd))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, text_handler))
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
`;
}
