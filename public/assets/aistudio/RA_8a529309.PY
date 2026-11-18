from __future__ import annotations

import asyncio
import html
import json
import logging
import os
import random
import sqlite3
import tempfile
import time
from typing import Any, List, Optional, Tuple
from urllib.parse import quote

import aiohttp
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, InputFile
from telegram.constants import ParseMode
from telegram.error import TelegramError
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    CallbackQueryHandler,
    ContextTypes,
    ConversationHandler,
    filters,
)

# ============ CONFIG ============
BOT_TOKEN = os.environ.get("BOT_TOKEN", "8665483784:AAFvqwvKmTPWZ6SB_Om37vzLXt60n-7A8GE")
ADMIN_ID = int(os.environ.get("ADMIN_ID", "8158526050"))
BOT_USERNAME = os.environ.get("BOT_USERNAME", "YourBotUsername")

NUM_API = ""
AADHAR_API = ""
INSTA_API = "https://ra-bomber1.bj-cloud.workers.dev/api/instagram-info?username="
SMS_API = ""
PHOTO_API = "https://ra-api-hub.onrender.com/api/info?key=radevil17&service=photo+eidt&query={url}"
VIDEO_API = ""

BOMB_API_1 = ""
BOMB_API_2 = ""
BOMB_API_3 = "https://ra-number-info.bj-cloud.workers.dev/?num="

FORCE_CHANNEL = "rapro17"
FORCE_CHANNEL_LINK = "https://t.me/rapro17"
FORCE_GROUP = "ra_halp"
FORCE_GROUP_LINK = "https://t.me/ra_halp"
OWNER_CONTACT = "@radevil17"

AUTO_DELETE_SECONDS = 5
PHOTO_AUTO_DELETE_SECONDS = 10
VIDEO_AUTO_DELETE_SECONDS = 600  # 10 min

SMS_FREE_24H = 24 * 3600
PHOTO_LIMIT_PER_24H = 2
TOKENS_DAILY_MIN = 10
TOKENS_DAILY_MAX = 50

# Defaults; overridable via settings table at runtime.
DEFAULT_VIDEO_COST = 1
DEFAULT_DAILY_VIDEO_LIMIT = 10
DEFAULT_FORCE_JOIN = 1

DB_PATH = os.environ.get("DB_PATH", "/app/data/bot.db")
# ================================

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

SMS_MSG, SMS_COUNT, SMS_NUMBER = range(3)
PHOTO_WAIT_URL = 10

STRIP_KEYS = {
    "API_Developer", "developer", "Credits", "credits",
    "api_developer", "owner", "Telegram", "Developer_Signature",
    "client_ip", "request_method",
}

_HTTP: Optional[aiohttp.ClientSession] = None


def http_session() -> aiohttp.ClientSession:
    global _HTTP
    if _HTTP is None or _HTTP.closed:
        timeout = aiohttp.ClientTimeout(total=45)
        _HTTP = aiohttp.ClientSession(timeout=timeout)
    return _HTTP


# ============ DATABASE ============

def db_init() -> None:
    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            username TEXT,
            first_name TEXT,
            tokens INTEGER DEFAULT 0,
            referred_by INTEGER DEFAULT NULL,
            referral_count INTEGER DEFAULT 0,
            joined_at INTEGER,
            first_start_rewarded INTEGER DEFAULT 0,
            last_daily_claim INTEGER DEFAULT 0,
            age_verified INTEGER DEFAULT 0,
            banned INTEGER DEFAULT 0,
            daily_video_limit INTEGER DEFAULT NULL
        )
    """)
    cur.execute("PRAGMA table_info(users)")
    cols = {r[1] for r in cur.fetchall()}
    for col, ddl in (
        ("age_verified", "INTEGER DEFAULT 0"),
        ("banned", "INTEGER DEFAULT 0"),
        ("daily_video_limit", "INTEGER DEFAULT NULL"),
    ):
        if col not in cols:
            cur.execute(f"ALTER TABLE users ADD COLUMN {col} {ddl}")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS actions (
            user_id INTEGER, action TEXT, value INTEGER, last_used INTEGER,
            PRIMARY KEY (user_id, action)
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS referrals (
            referrer_id INTEGER, referred_id INTEGER UNIQUE,
            rewarded INTEGER DEFAULT 0, created_at INTEGER
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY, value TEXT
        )
    """)
    con.commit(); con.close()


def db_conn() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH, timeout=30)
    con.row_factory = sqlite3.Row
    return con


def db_setting_get(key: str, default: str = "") -> str:
    con = db_conn(); cur = con.cursor()
    cur.execute("SELECT value FROM settings WHERE key=?", (key,))
    row = cur.fetchone(); con.close()
    return row["value"] if row else default


def db_setting_set(key: str, value: str) -> None:
    con = db_conn(); cur = con.cursor()
    cur.execute("""
        INSERT INTO settings (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value
    """, (key, value))
    con.commit(); con.close()


def setting_video_cost() -> int:
    try:
        return int(db_setting_get("video_cost", str(DEFAULT_VIDEO_COST)))
    except ValueError:
        return DEFAULT_VIDEO_COST


def setting_daily_video_limit() -> int:
    try:
        return int(db_setting_get("daily_video_limit", str(DEFAULT_DAILY_VIDEO_LIMIT)))
    except ValueError:
        return DEFAULT_DAILY_VIDEO_LIMIT


def setting_force_join() -> bool:
    return db_setting_get("force_join", str(DEFAULT_FORCE_JOIN)) == "1"


def db_get_user(user_id: int) -> Optional[sqlite3.Row]:
    con = db_conn(); cur = con.cursor()
    cur.execute("SELECT * FROM users WHERE user_id = ?", (user_id,))
    row = cur.fetchone(); con.close(); return row


def db_upsert_user(user_id: int, username: str, first_name: str) -> sqlite3.Row:
    con = db_conn(); cur = con.cursor()
    cur.execute("SELECT user_id FROM users WHERE user_id = ?", (user_id,))
    if cur.fetchone() is None:
        cur.execute(
            "INSERT INTO users (user_id, username, first_name, tokens, joined_at) VALUES (?, ?, ?, 0, ?)",
            (user_id, username or "", first_name or "", int(time.time())),
        )
    else:
        cur.execute("UPDATE users SET username=?, first_name=? WHERE user_id=?",
                    (username or "", first_name or "", user_id))
    con.commit()
    cur.execute("SELECT * FROM users WHERE user_id = ?", (user_id,))
    row = cur.fetchone(); con.close(); return row


def db_add_tokens(user_id: int, amount: int) -> None:
    con = db_conn(); cur = con.cursor()
    cur.execute("UPDATE users SET tokens = COALESCE(tokens,0) + ? WHERE user_id=?",
                (amount, user_id))
    con.commit(); con.close()


def db_use_tokens(user_id: int, amount: int) -> bool:
    if amount <= 0:
        return True
    con = db_conn(); cur = con.cursor()
    cur.execute(
        "UPDATE users SET tokens = tokens - ? WHERE user_id=? AND COALESCE(tokens,0) >= ?",
        (amount, user_id, amount),
    )
    ok = cur.rowcount == 1
    con.commit(); con.close(); return ok


def db_action_get(user_id: int, action: str) -> Optional[sqlite3.Row]:
    con = db_conn(); cur = con.cursor()
    cur.execute("SELECT * FROM actions WHERE user_id=? AND action=?", (user_id, action))
    row = cur.fetchone(); con.close(); return row


def db_action_set(user_id: int, action: str, value: int) -> None:
    con = db_conn(); cur = con.cursor()
    cur.execute("""
        INSERT INTO actions (user_id, action, value, last_used) VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, action) DO UPDATE SET value=excluded.value, last_used=excluded.last_used
    """, (user_id, action, value, int(time.time())))
    con.commit(); con.close()


def db_action_clear(user_id: int, action: Optional[str] = None) -> None:
    con = db_conn(); cur = con.cursor()
    if action:
        cur.execute("DELETE FROM actions WHERE user_id=? AND action=?", (user_id, action))
    else:
        cur.execute("DELETE FROM actions WHERE user_id=?", (user_id,))
    con.commit(); con.close()


def db_set_first_start(user_id: int) -> None:
    con = db_conn(); cur = con.cursor()
    cur.execute("UPDATE users SET first_start_rewarded=1 WHERE user_id=?", (user_id,))
    con.commit(); con.close()


def db_set_daily_claim(user_id: int) -> None:
    con = db_conn(); cur = con.cursor()
    cur.execute("UPDATE users SET last_daily_claim=? WHERE user_id=?",
                (int(time.time()), user_id))
    con.commit(); con.close()


def db_set_age_verified(user_id: int, value: int = 1) -> None:
    con = db_conn(); cur = con.cursor()
    cur.execute("UPDATE users SET age_verified=? WHERE user_id=?", (value, user_id))
    con.commit(); con.close()


def db_set_banned(user_id: int, value: int) -> None:
    con = db_conn(); cur = con.cursor()
    cur.execute("UPDATE users SET banned=? WHERE user_id=?", (value, user_id))
    con.commit(); con.close()


def db_set_user_video_limit(user_id: int, value: Optional[int]) -> None:
    con = db_conn(); cur = con.cursor()
    cur.execute("UPDATE users SET daily_video_limit=? WHERE user_id=?", (value, user_id))
    con.commit(); con.close()


def db_register_referral(referrer_id: int, referred_id: int) -> bool:
    if referrer_id == referred_id:
        return False
    con = db_conn(); cur = con.cursor()
    try:
        cur.execute("SELECT referred_id FROM referrals WHERE referred_id=?", (referred_id,))
        if cur.fetchone() is not None:
            return False
        cur.execute(
            "INSERT INTO referrals (referrer_id, referred_id, rewarded, created_at) VALUES (?,?,0,?)",
            (referrer_id, referred_id, int(time.time())),
        )
        cur.execute(
            "UPDATE users SET tokens=COALESCE(tokens,0)+10, "
            "referral_count=COALESCE(referral_count,0)+1 WHERE user_id=?",
            (referrer_id,),
        )
        cur.execute("UPDATE referrals SET rewarded=1 WHERE referred_id=?", (referred_id,))
        con.commit()
        return True
    except sqlite3.Error as e:
        con.rollback(); logger.warning("referral err: %s", e); return False
    finally:
        con.close()


def db_set_referred_by(user_id: int, referrer_id: int) -> None:
    con = db_conn(); cur = con.cursor()
    cur.execute("UPDATE users SET referred_by=? WHERE user_id=?", (referrer_id, user_id))
    con.commit(); con.close()


def db_video_used_today(user_id: int) -> int:
    act = db_action_get(user_id, "video")
    if not act:
        return 0
    elapsed = int(time.time()) - int(act["last_used"] or 0)
    if elapsed >= 24 * 3600:
        return 0
    return int(act["value"] or 0)


def db_video_bump(user_id: int) -> int:
    act = db_action_get(user_id, "video")
    now = int(time.time())
    if act:
        elapsed = now - int(act["last_used"] or 0)
        value = 1 if elapsed >= 24 * 3600 else int(act["value"] or 0) + 1
    else:
        value = 1
    db_action_set(user_id, "video", value)
    return value


def db_user_video_limit(user_id: int) -> int:
    u = db_get_user(user_id)
    if u is not None and u["daily_video_limit"] is not None:
        try:
            return int(u["daily_video_limit"])
        except (TypeError, ValueError):
            pass
    return setting_daily_video_limit()


def db_list_users(limit: int = 20, offset: int = 0) -> List[sqlite3.Row]:
    con = db_conn(); cur = con.cursor()
    cur.execute(
        "SELECT user_id, username, first_name, tokens, banned, age_verified, joined_at "
        "FROM users ORDER BY joined_at DESC LIMIT ? OFFSET ?",
        (limit, offset),
    )
    rows = cur.fetchall(); con.close(); return list(rows)


def db_count_users() -> int:
    con = db_conn(); cur = con.cursor()
    cur.execute("SELECT COUNT(*) as c FROM users"); c = cur.fetchone()["c"]; con.close(); return c


# ============ HELPERS ============

def is_admin(user_id: int) -> bool:
    return user_id == ADMIN_ID


def esc(s: Any) -> str:
    return html.escape(str(s) if s is not None else "")


async def is_channel_member(context: ContextTypes.DEFAULT_TYPE, user_id: int) -> bool:
    try:
        m = await context.bot.get_chat_member(chat_id=f"@{FORCE_CHANNEL}", user_id=user_id)
        return m.status in ("member", "administrator", "creator")
    except TelegramError as e:
        logger.warning("Channel check: %s", e); return False


async def is_group_member(context: ContextTypes.DEFAULT_TYPE, user_id: int) -> bool:
    try:
        m = await context.bot.get_chat_member(chat_id=f"@{FORCE_GROUP}", user_id=user_id)
        return m.status in ("member", "administrator", "creator")
    except TelegramError as e:
        logger.warning("Group check: %s", e); return False


async def check_joins(context: ContextTypes.DEFAULT_TYPE, user_id: int) -> bool:
    if not setting_force_join():
        return True
    if is_admin(user_id):
        return True
    return await is_channel_member(context, user_id) and await is_group_member(context, user_id)


def is_banned(user_id: int) -> bool:
    u = db_get_user(user_id)
    return bool(u and (u["banned"] or 0))


def join_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("📢 Join Channel", url=FORCE_CHANNEL_LINK),
         InlineKeyboardButton("👥 Join Group", url=FORCE_GROUP_LINK)],
        [InlineKeyboardButton("✅ Verify", callback_data="verify_join")],
    ])


def main_menu_kb(is_admin_user: bool = False) -> InlineKeyboardMarkup:
    buttons = [
        [InlineKeyboardButton("🔍 Number Search", callback_data="menu_num"),
         InlineKeyboardButton("📸 Instagram", callback_data="menu_insta")],
        [InlineKeyboardButton("🆔 Aadhaar", callback_data="menu_aadhar"),
         InlineKeyboardButton("💣 Bomber", callback_data="menu_bom")],
        [InlineKeyboardButton("💬 Custom SMS", callback_data="menu_sms"),
         InlineKeyboardButton("🖼️ Photo Editor", callback_data="menu_photo")],
        [InlineKeyboardButton("🎬 +18 Video", callback_data="menu_video"),
         InlineKeyboardButton("🎁 Refer & Earn", callback_data="menu_refer")],
        [InlineKeyboardButton("💰 Daily Tokens", callback_data="menu_daily"),
         InlineKeyboardButton("📊 My Stats", callback_data="menu_stats")],
        [InlineKeyboardButton("❓ Help", callback_data="menu_help")],
    ]
    if is_admin_user:
        buttons.append([InlineKeyboardButton("🛠️ Admin Panel", callback_data="admin_panel")])
    return InlineKeyboardMarkup(buttons)


def admin_panel_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("📊 Global Stats", callback_data="admin_stats"),
         InlineKeyboardButton("👥 Users (last 20)", callback_data="admin_users")],
        [InlineKeyboardButton("🔍 User Lookup", callback_data="admin_lookup"),
         InlineKeyboardButton("🎁 Add Tokens", callback_data="admin_addtokens")],
        [InlineKeyboardButton("🎬 Video Cost", callback_data="admin_videocost"),
         InlineKeyboardButton("📅 Daily Limit", callback_data="admin_dailylimit")],
        [InlineKeyboardButton("🔞 Reset Age Gate", callback_data="admin_resetage"),
         InlineKeyboardButton("🔓 Reset Limits", callback_data="admin_resetlimit")],
        [InlineKeyboardButton("🚫 Ban User", callback_data="admin_ban"),
         InlineKeyboardButton("✅ Unban User", callback_data="admin_unban")],
        [InlineKeyboardButton("📢 Broadcast", callback_data="admin_broadcast"),
         InlineKeyboardButton("🧲 Force-Join", callback_data="admin_forcejoin")],
        [InlineKeyboardButton("🔙 Main Menu", callback_data="back_main")],
    ])


def cancel_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("❌ Cancel", callback_data="back_main")],
    ])


def age_gate_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("✅ I am 18+", callback_data="age_confirm"),
         InlineKeyboardButton("❌ I am under 18", callback_data="age_deny")],
    ])


def video_actions_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("🎲 Another Video", callback_data="video_next")],
        [InlineKeyboardButton("🔙 Main Menu", callback_data="back_main")],
    ])


def clean_number(raw: str) -> str:
    n = "".join(ch for ch in raw if ch.isdigit())
    if n.startswith("91") and len(n) == 12: n = n[2:]
    elif n.startswith("0") and len(n) == 11: n = n[1:]
    return n


def human_time(seconds: int) -> str:
    if seconds <= 0: return "now"
    h, rem = divmod(seconds, 3600); m, s = divmod(rem, 60)
    p = []
    if h: p.append(f"{h}h")
    if m: p.append(f"{m}m")
    if s or not p: p.append(f"{s}s")
    return " ".join(p)


def cooldown_text(seconds: int) -> str:
    return (
        f"⏳ You've reached the 24h limit.\n"
        f"Next use in: <code>{human_time(seconds)}</code>\n"
        f"Contact owner :- {OWNER_CONTACT}"
    )


def welcome_text(user, tokens: int) -> str:
    return (
        f"👋 Hello <b>{esc(user.first_name)}</b> Welcome to My RA Pro Bot..👀\n"
        f"💳 Tokens: <b>{tokens}</b> 👀\n"
        f"YOU,R CHAT ID <code>{user.id}</code> ☺\n"
        f"Owner : {OWNER_CONTACT}\n\n"
        f"Full enjoy 💫"
    )


async def schedule_delete(context: ContextTypes.DEFAULT_TYPE, chat_id: int, message_id: int, seconds: int) -> None:
    async def _job():
        await asyncio.sleep(seconds)
        try:
            await context.bot.delete_message(chat_id=chat_id, message_id=message_id)
        except TelegramError:
            pass
    context.application.create_task(_job())


def _strip_meta(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {k: _strip_meta(v) for k, v in obj.items() if k not in STRIP_KEYS}
    if isinstance(obj, list):
        return [_strip_meta(x) for x in obj]
    return obj


def _unwrap(data: Any) -> Any:
    if not isinstance(data, dict):
        return _strip_meta(data)
    result = data.get("result")
    if isinstance(result, dict) and "Main_Records" in result:
        records = result.get("Main_Records")
        if isinstance(records, list) and records:
            return _strip_meta(records[0]) if len(records) == 1 else _strip_meta(records)
    if isinstance(result, list) and result:
        return _strip_meta(result[0]) if len(result) == 1 else _strip_meta(result)
    for key in ("data", "Main_Records"):
        v = data.get(key)
        if isinstance(v, list) and v:
            return _strip_meta(v[0]) if len(v) == 1 else _strip_meta(v)
    return _strip_meta(data)


async def fetch_json(url: str, retries: int = 3, backoff: float = 2.0) -> Optional[Any]:
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            session = http_session()
            async with session.get(url) as resp:
                raw = await resp.text()
                logger.info("Attempt %d | %s | %d | len=%d",
                            attempt, url[:80], resp.status, len(raw))
                if resp.status == 200:
                    try:
                        return json.loads(raw)
                    except json.JSONDecodeError:
                        last_err = "bad json"
                else:
                    last_err = f"HTTP {resp.status}"
        except Exception as e:
            last_err = str(e); logger.error("Fetch err %d: %s", attempt, e)
        if attempt < retries:
            await asyncio.sleep(backoff * attempt)
    logger.error("All attempts failed for %s: %s", url[:80], last_err)
    return None


# ============ SPIN ANIMATION ============

async def spin_and_reward(context: ContextTypes.DEFAULT_TYPE, chat_id: int, message_id: int,
                          user_id: int, tokens_amount: int, header: str) -> None:
    frames = ["◐", "◓", "◑", "◒"]
    for i in range(6):
        f = frames[i % 4]
        try:
            await context.bot.edit_message_text(
                chat_id=chat_id, message_id=message_id,
                text=f"{header}\n\n{f} Rolling... {f}",
                parse_mode=ParseMode.HTML)
        except TelegramError: pass
        await asyncio.sleep(0.35)
    db_add_tokens(user_id, tokens_amount)
    u = db_get_user(user_id); total = u["tokens"] if u else tokens_amount
    try:
        await context.bot.edit_message_text(
            chat_id=chat_id, message_id=message_id,
            text=(f"{header}\n\n🎉 You got <b>{tokens_amount} tokens</b>!\n"
                  f"💳 Total tokens: <code>{total}</code>"),
            parse_mode=ParseMode.HTML)
    except TelegramError: pass


# ============ BOMBER ============

def _bomber_urls(number: str, count: int = 200) -> List[str]:
    return [
        BOMB_API_1 + number, BOMB_API_1 + number,
        BOMB_API_2 + f"{number}|{count}", BOMB_API_2 + f"{number}|{count}",
        BOMB_API_3 + number, BOMB_API_3 + number,
    ]


async def run_bomber(context: ContextTypes.DEFAULT_TYPE, chat_id: int, message_id: int, number: str) -> None:
    rounds = 3; total_ok = total_fail = 0
    header = f"💣 <b>Bomber Running</b>\n\n🎯 <code>{esc(number)}</code>\n🔁 Rounds: <code>{rounds}</code>\n"
    try:
        await context.bot.edit_message_text(chat_id=chat_id, message_id=message_id,
                                            text=header, parse_mode=ParseMode.HTML)
    except TelegramError: pass
    for rnd in range(1, rounds + 1):
        for u in _bomber_urls(number):
            data = await fetch_json(u, retries=2, backoff=1.0)
            if data is None: total_fail += 1; continue
            if isinstance(data, dict) and data.get("status") == "completed":
                try:
                    total_ok += int(data.get("successful_requests", 0))
                    total_fail += int(data.get("failed_requests", 0))
                except (TypeError, ValueError):
                    total_ok += 1
            else:
                total_ok += 1
        try:
            await context.bot.edit_message_text(
                chat_id=chat_id, message_id=message_id,
                text=(header + f"\n✅ Round {rnd}/{rounds}"
                      f"\n📊 OK: <code>{total_ok}</code> | FAIL: <code>{total_fail}</code>"),
                parse_mode=ParseMode.HTML)
        except TelegramError: pass
        await asyncio.sleep(2)
    try:
        await context.bot.edit_message_text(
            chat_id=chat_id, message_id=message_id,
            text=(header + f"\n🏁 <b>Finished</b>\n📊 OK: <code>{total_ok}</code> | FAIL: <code>{total_fail}</code>"),
            parse_mode=ParseMode.HTML)
    except TelegramError: pass
    await schedule_delete(context, chat_id, message_id, AUTO_DELETE_SECONDS)


# ============ LOOKUPS ============

async def do_num_lookup(update: Update, context: ContextTypes.DEFAULT_TYPE, number: str) -> None:
    msg = await update.message.reply_text("🔎 Searching...")
    data = await fetch_json(NUM_API + quote(number))
    payload = {"error": "no response", "query": number} if data is None else _unwrap(data)
    pretty = json.dumps(payload, indent=2, ensure_ascii=False)
    if len(pretty) > 3500: pretty = pretty[:3500] + "\n..."
    text = f"<pre>{esc(pretty)}</pre>"
    try: await msg.edit_text(text, parse_mode=ParseMode.HTML)
    except TelegramError: await msg.edit_text(text[:4000])
    try: await update.message.delete()
    except TelegramError: pass
    await schedule_delete(context, msg.chat_id, msg.message_id, AUTO_DELETE_SECONDS)


async def do_aadhar_lookup(update: Update, context: ContextTypes.DEFAULT_TYPE, a: str) -> None:
    msg = await update.message.reply_text("🔎 Searching...")
    data = await fetch_json(AADHAR_API + quote(a))
    payload = {"error": "no response", "query": a} if data is None else _unwrap(data)
    pretty = json.dumps(payload, indent=2, ensure_ascii=False)
    if len(pretty) > 3500: pretty = pretty[:3500] + "\n..."
    text = f"<pre>{esc(pretty)}</pre>"
    try: await msg.edit_text(text, parse_mode=ParseMode.HTML)
    except TelegramError: await msg.edit_text(text[:4000])
    try: await update.message.delete()
    except TelegramError: pass
    await schedule_delete(context, msg.chat_id, msg.message_id, AUTO_DELETE_SECONDS)


async def do_insta_lookup(update: Update, context: ContextTypes.DEFAULT_TYPE, username: str) -> None:
    msg = await update.message.reply_text("🔎 Fetching Instagram info...")
    data = await fetch_json(INSTA_API + quote(username))
    if data is None:
        await msg.edit_text("❌ No response.")
        return await schedule_delete(context, msg.chat_id, msg.message_id, AUTO_DELETE_SECONDS)
    clean = _strip_meta(data)
    pretty = json.dumps(clean, indent=2, ensure_ascii=False)
    safe_name = f"RA INSTAGRAM {username}.txt".replace("/", "_").replace("\\", "_")
    tmp = os.path.join(tempfile.gettempdir(), safe_name)
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(pretty)
        with open(tmp, "rb") as f:
            await context.bot.send_document(
                chat_id=update.effective_chat.id,
                document=InputFile(f, filename=safe_name),
                caption=f"📸 <b>Instagram Info</b>\n👤 <code>@{esc(username)}</code>",
                parse_mode=ParseMode.HTML)
        await msg.delete()
    except Exception as e:
        logger.error("insta err: %s", e); await msg.edit_text("❌ Failed to send file.")
    finally:
        try: os.remove(tmp)
        except OSError: pass
    try: await update.message.delete()
    except TelegramError: pass


async def do_bomber(update: Update, context: ContextTypes.DEFAULT_TYPE, number: str) -> None:
    msg = await update.message.reply_text("💣 Launching bomber...")
    try: await update.message.delete()
    except TelegramError: pass
    context.application.create_task(run_bomber(context, msg.chat_id, msg.message_id, number))


# ============ +18 VIDEO — SINGLE RANDOM DIRECT ============

def _pick_playable(item: dict) -> Tuple[Optional[str], Optional[str], str, str]:
    """
    Returns (direct_url, embed_url, title, created_at).
    direct_url: an mp4/m3u8 URL the bot can try send_video(url=...)
    embed_url: fallback for inline button / preview
    """
    title = (item.get("title") or "Untitled").strip()
    created = (item.get("createdAt") or "").strip()
    candidates_direct = []
    candidates_embed = []
    for key in ("videoUrl", "fileUrl", "directUrl", "mp4", "hls", "url", "video"):
        v = item.get(key)
        if isinstance(v, str) and v.startswith(("http://", "https://")):
            if v.endswith((".mp4", ".m3u8")) or "video" in key.lower() or "file" in key.lower() or "direct" in key.lower():
                candidates_direct.append(v)
            else:
                candidates_embed.append(v)
    for key in ("embedUrl", "embed", "iframe", "player"):
        v = item.get(key)
        if isinstance(v, str) and v.startswith(("http://", "https://")):
            candidates_embed.append(v)
    direct = candidates_direct[0] if candidates_direct else None
    embed = candidates_embed[0] if candidates_embed else None
    return direct, embed, title, created


async def _fetch_video_pool() -> List[dict]:
    """Fetch a page and return a list of items with title/createdAt + URLs."""
    # try up to 3 (page, limit) combos, pick the first non-empty
    tries = [(30, random.randint(1, 5)), (30, random.randint(1, 5)), (20, random.randint(1, 5))]
    for limit, page in tries:
        url = VIDEO_API.format(limit=limit, page=page)
        data = await fetch_json(url, retries=2, backoff=1.5)
        if data is None:
            continue
        candidates: Optional[List[Any]] = None
        if isinstance(data, list):
            candidates = data
        elif isinstance(data, dict):
            for key in ("data", "videos", "result", "items"):
                v = data.get(key)
                if isinstance(v, list):
                    candidates = v; break
        if not candidates:
            continue
        cleaned: List[dict] = []
        for it in candidates:
            if not isinstance(it, dict):
                continue
            direct, embed, title, created = _pick_playable(it)
            if not direct and not embed:
                continue
            cleaned.append({
                "direct": direct,
                "embed": embed,
                "title": title,
                "createdAt": created,
            })
        if cleaned:
            return cleaned
    return []


async def send_one_video(chat_id: int, context: ContextTypes.DEFAULT_TYPE, user_id: int,
                          reply_to_message_id: Optional[int] = None) -> None:
    """Fetch one random video, charge token, send direct if possible."""
    u = db_get_user(user_id)
    if not u:
        return
    cost = setting_video_cost()
    limit = db_user_video_limit(user_id)
    used = db_video_used_today(user_id)
    if used >= limit:
        await context.bot.send_message(
            chat_id=chat_id,
            text=(f"⏳ You've watched <b>{used}/{limit}</b> videos in the last 24h.\n"
                  f"Try again later."),
            parse_mode=ParseMode.HTML, reply_markup=main_menu_kb(is_admin(user_id)))
        return
    if (u["tokens"] or 0) < cost:
        await context.bot.send_message(
            chat_id=chat_id,
            text=(f"💳 You need <b>{cost} token</b> per video.\n"
                  f"Your balance: <code>{u['tokens'] or 0}</code>.\n"
                  f"Use /daily or /refer to earn more."),
            parse_mode=ParseMode.HTML, reply_markup=main_menu_kb(is_admin(user_id)))
        return

    wait = await context.bot.send_message(chat_id=chat_id, text="🎬 Picking a random video...")
    pool = await _fetch_video_pool()
    if not pool:
        try:
            await wait.edit_text("❌ No videos available right now. Try again.")
        except TelegramError:
            pass
        return
    item = random.choice(pool)
    title = esc(item["title"])
    created = esc(item["createdAt"])
    direct = item.get("direct")
    embed = item.get("embed")

    # Deduct tokens atomically AFTER we know we have a video to deliver.
    if not db_use_tokens(user_id, cost):
        try:
            await wait.edit_text("❌ Not enough tokens.")
        except TelegramError:
            pass
        return

    # Try direct video send first
    delivered = False
    if direct:
        try:
            await context.bot.send_video(
                chat_id=chat_id, video=direct,
                caption=f"🎬 <b>{title}</b>" + (f"\n<i>{created}</i>" if created else ""),
                parse_mode=ParseMode.HTML,
                supports_streaming=True,
                reply_markup=video_actions_kb(),
            )
            delivered = True
        except TelegramError as e:
            logger.warning("direct send_video failed: %s", e)

    # Fallback: download and re-upload as InputFile
    if not delivered and direct:
        tmp_path = None
        try:
            session = http_session()
            async with session.get(direct) as resp:
                if resp.status == 200:
                    fd, tmp_path = tempfile.mkstemp(suffix=".mp4")
                    with os.fdopen(fd, "wb") as f:
                        async for chunk in resp.content.iter_chunked(64 * 1024):
                            f.write(chunk)
                    with open(tmp_path, "rb") as f:
                        await context.bot.send_video(
                            chat_id=chat_id,
                            video=InputFile(f, filename="video.mp4"),
                            caption=f"🎬 <b>{title}</b>" + (f"\n<i>{created}</i>" if created else ""),
                            parse_mode=ParseMode.HTML,
                            supports_streaming=True,
                            reply_markup=video_actions_kb(),
                        )
                    delivered = True
        except Exception as e:
            logger.warning("download send_video failed: %s", e)
        finally:
            if tmp_path:
                try: os.remove(tmp_path)
                except OSError: pass

    # Last resort: send embed URL as a button + link preview
    if not delivered and embed:
        kb_rows = [[InlineKeyboardButton("▶️ Play Video", url=embed)]]
        kb_rows.append([InlineKeyboardButton("🎲 Another Video", callback_data="video_next")])
        kb_rows.append([InlineKeyboardButton("🔙 Main Menu", callback_data="back_main")])
        await context.bot.send_message(
            chat_id=chat_id,
            text=f"🎬 <b>{title}</b>" + (f"\n<i>{created}</i>" if created else ""),
            parse_mode=ParseMode.HTML,
            reply_markup=InlineKeyboardMarkup(kb_rows),
            disable_web_page_preview=False,
        )
        delivered = True

    if not delivered:
        # Refund the cost — nothing got delivered.
        db_add_tokens(user_id, cost)
        try:
            await wait.edit_text("❌ Could not deliver the video. Token refunded.")
        except TelegramError:
            pass
        return

    # Count it, delete spinner, schedule auto-delete on the video message.
    try:
        await wait.delete()
    except TelegramError:
        pass
    db_video_bump(user_id)
    # Auto-delete tracked on the *last* sent message — we re-get it via reply.
    # Simpler: send a small footer with a self-delete timer.
    footer = await context.bot.send_message(
        chat_id=chat_id,
        text="⏳ This video will auto-delete in <b>10 minutes</b>.",
        parse_mode=ParseMode.HTML,
    )
    await schedule_delete(context, chat_id, footer.message_id, VIDEO_AUTO_DELETE_SECONDS)


async def video_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    if is_banned(user.id):
        return await update.message.reply_text("🚫 You are banned.")
    if not await check_joins(context, user.id):
        return await update.message.reply_text("🔒 Join Required.", reply_markup=join_kb())
    u = db_get_user(user.id)
    if not u or not (u["age_verified"] or 0):
        await update.message.reply_text(
            "🔞 <b>Age Verification</b>\n\n"
            "You must be <b>18 years or older</b> to view this content.\n"
            "Tap ✅ to confirm, ❌ to cancel.",
            parse_mode=ParseMode.HTML, reply_markup=age_gate_kb())
        return
    await send_one_video(update.effective_chat.id, context, user.id)


# ============ START / WELCOME ============

async def send_welcome(context: ContextTypes.DEFAULT_TYPE, chat_id: int, user, is_edit: bool = False, msg_obj=None) -> None:
    u = db_get_user(user.id); tokens = u["tokens"] if u else 0
    text = welcome_text(user, tokens)
    if is_edit and msg_obj:
        try:
            await msg_obj.edit_text(text, parse_mode=ParseMode.HTML,
                                     reply_markup=main_menu_kb(is_admin(user.id)))
            return
        except TelegramError: pass
    await context.bot.send_message(chat_id=chat_id, text=text,
                                    parse_mode=ParseMode.HTML,
                                    reply_markup=main_menu_kb(is_admin(user.id)))


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    if is_banned(user.id):
        return await update.message.reply_text("🚫 You are banned from using this bot.")

    if context.args:
        try:
            referrer_id = int(context.args[0])
            if referrer_id != user.id:
                existing = db_get_user(user.id)
                if existing is None:
                    db_upsert_user(user.id, user.username or "", user.first_name or "")
                    db_set_referred_by(user.id, referrer_id)
                    if db_register_referral(referrer_id, user.id):
                        try:
                            await context.bot.send_message(
                                referrer_id,
                                "🎉 <b>New referral!</b>\n\nYou earned <code>10 tokens</code>.",
                                parse_mode=ParseMode.HTML)
                        except TelegramError: pass
        except ValueError: pass

    user_row = db_upsert_user(user.id, user.username or "", user.first_name or "")

    if not await check_joins(context, user.id):
        await update.message.reply_text(
            "🔒 <b>Join Required</b>\n\nJoin our <b>channel</b> and <b>group</b> first.",
            parse_mode=ParseMode.HTML, reply_markup=join_kb())
        return

    if not (user_row["first_start_rewarded"] or 0):
        amount = random.randint(TOKENS_DAILY_MIN, TOKENS_DAILY_MAX)
        msg = await update.message.reply_text(
            "🎁 <b>Welcome Gift!</b>\n\n◐ Rolling... ◐", parse_mode=ParseMode.HTML)
        db_set_first_start(user.id)
        await spin_and_reward(context, msg.chat_id, msg.message_id, user.id, amount,
                              "🎁 <b>Welcome Gift!</b>")
        await asyncio.sleep(1)
        try: await msg.delete()
        except TelegramError: pass

    await send_welcome(context, update.effective_chat.id, user)


# ============ HELP ============

HELP_TEXT = (
    "🔎 <b>Commands</b>\n\n"
    "• <code>/num 1234567890</code> — number info\n"
    "• <code>/aadhar 535576293330</code> — aadhaar info\n"
    "• <code>/insta username</code> — instagram info\n"
    "• <code>/bom 1234567890</code> — bomber\n"
    "• <code>/sms</code> — custom SMS\n"
    "• <code>/photo</code> — photo editor (2/24h)\n"
    "• <code>/video</code> — +18 random video (18+, token per view)\n"
    "• <code>/refer</code> — earn tokens\n"
    "• <code>/daily</code> — daily random tokens\n"
    "• <code>/stope 1234567890</code> — stop spam\n\n"
    f"Owner : {OWNER_CONTACT}"
)


async def help_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if is_banned(update.effective_user.id):
        return await update.message.reply_text("🚫 You are banned.")
    if not await check_joins(context, update.effective_user.id):
        return await update.message.reply_text("🔒 Join Required.", reply_markup=join_kb())
    await update.message.reply_text(HELP_TEXT, parse_mode=ParseMode.HTML,
                                     reply_markup=main_menu_kb(is_admin(update.effective_user.id)))


# ============ COMMANDS ============

async def num_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if is_banned(update.effective_user.id):
        return await update.message.reply_text("🚫 You are banned.")
    if not await check_joins(context, update.effective_user.id):
        return await update.message.reply_text("🔒 Join Required.", reply_markup=join_kb())
    if not context.args:
        m = await update.message.reply_text("⚠️ Usage: <code>/num 1234567890</code>", parse_mode=ParseMode.HTML)
        return await schedule_delete(context, m.chat_id, m.message_id, AUTO_DELETE_SECONDS)
    n = clean_number(context.args[0])
    if len(n) != 10:
        m = await update.message.reply_text("⚠️ 10-digit only.", parse_mode=ParseMode.HTML)
        return await schedule_delete(context, m.chat_id, m.message_id, AUTO_DELETE_SECONDS)
    await do_num_lookup(update, context, n)


async def aadhar_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if is_banned(update.effective_user.id):
        return await update.message.reply_text("🚫 You are banned.")
    if not await check_joins(context, update.effective_user.id):
        return await update.message.reply_text("🔒 Join Required.", reply_markup=join_kb())
    if not context.args:
        m = await update.message.reply_text("⚠️ Usage: <code>/aadhar 535576293330</code>", parse_mode=ParseMode.HTML)
        return await schedule_delete(context, m.chat_id, m.message_id, AUTO_DELETE_SECONDS)
    a = "".join(ch for ch in context.args[0] if ch.isdigit())
    if len(a) != 12:
        m = await update.message.reply_text("⚠️ 12-digit only.", parse_mode=ParseMode.HTML)
        return await schedule_delete(context, m.chat_id, m.message_id, AUTO_DELETE_SECONDS)
    await do_aadhar_lookup(update, context, a)


async def insta_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if is_banned(update.effective_user.id):
        return await update.message.reply_text("🚫 You are banned.")
    if not await check_joins(context, update.effective_user.id):
        return await update.message.reply_text("🔒 Join Required.", reply_markup=join_kb())
    if not context.args:
        m = await update.message.reply_text("⚠️ Usage: <code>/insta radevil17</code>", parse_mode=ParseMode.HTML)
        return await schedule_delete(context, m.chat_id, m.message_id, AUTO_DELETE_SECONDS)
    username = context.args[0].strip().lstrip("@")
    await do_insta_lookup(update, context, username)


async def bom_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if is_banned(update.effective_user.id):
        return await update.message.reply_text("🚫 You are banned.")
    if not await check_joins(context, update.effective_user.id):
        return await update.message.reply_text("🔒 Join Required.", reply_markup=join_kb())
    if not context.args:
        m = await update.message.reply_text("⚠️ Usage: <code>/bom 1234567890</code>", parse_mode=ParseMode.HTML)
        return await schedule_delete(context, m.chat_id, m.message_id, AUTO_DELETE_SECONDS)
    n = clean_number(context.args[0])
    if len(n) != 10:
        m = await update.message.reply_text("⚠️ 10-digit only.", parse_mode=ParseMode.HTML)
        return await schedule_delete(context, m.chat_id, m.message_id, AUTO_DELETE_SECONDS)
    await do_bomber(update, context, n)


# ============ CUSTOM SMS ============

async def sms_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    user = update.effective_user
    if is_banned(user.id):
        await update.message.reply_text("🚫 You are banned.")
        return ConversationHandler.END
    if not await check_joins(context, user.id):
        await update.message.reply_text("🔒 Join Required.", reply_markup=join_kb())
        return ConversationHandler.END

    u = db_get_user(user.id); tokens = u["tokens"] if u else 0
    act = db_action_get(user.id, "sms")
    left = 0
    if act:
        left = max(0, SMS_FREE_24H - (int(time.time()) - act["last_used"]))
    free_available = (act is None) or (left == 0)

    if not free_available and tokens <= 0:
        m = await update.message.reply_text(
            cooldown_text(left) + "\n\n💡 No tokens left for extra SMS.",
            parse_mode=ParseMode.HTML, reply_markup=main_menu_kb(is_admin(user.id)))
        await schedule_delete(context, m.chat_id, m.message_id, AUTO_DELETE_SECONDS)
        return ConversationHandler.END

    context.user_data["sms_use_token"] = (not free_available)

    if free_available:
        max_count = 200
        mode_line = f"Mode: <b>FREE</b> (24h)\nCount: <code>1-{max_count}</code>"
    else:
        max_count = min(tokens, 200)
        mode_line = (f"Mode: <b>TOKEN</b>\n"
                     f"💳 Tokens: <code>{tokens}</code>\n"
                     f"Count: <code>1-{max_count}</code>")

    context.user_data["sms_max_count"] = max_count
    await update.message.reply_text(
        f"💬 <b>Custom SMS</b>\n{mode_line}\n\n"
        f"Step 1/3 — Send the <b>message</b>.",
        parse_mode=ParseMode.HTML, reply_markup=cancel_kb())
    return SMS_MSG


async def sms_get_msg(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    msg = (update.message.text or "").strip()
    if not msg:
        await update.message.reply_text("⚠️ Message can't be empty."); return SMS_MSG
    if len(msg) > 300: msg = msg[:300]
    context.user_data["sms_msg"] = msg
    max_c = context.user_data.get("sms_max_count", 200)
    await update.message.reply_text(
        f"Step 2/3 — Send the <b>count</b> (1-{max_c}).",
        parse_mode=ParseMode.HTML, reply_markup=cancel_kb())
    return SMS_COUNT


async def sms_get_count(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    try: count = int((update.message.text or "").strip())
    except ValueError:
        await update.message.reply_text("⚠️ Send a number."); return SMS_COUNT

    max_c = context.user_data.get("sms_max_count", 200)
    use_token = context.user_data.get("sms_use_token", False)

    if count < 1 or count > max_c:
        await update.message.reply_text(f"⚠️ Count must be 1-{max_c}.", reply_markup=cancel_kb())
        return SMS_COUNT

    if use_token:
        user = update.effective_user
        u = db_get_user(user.id); tokens_now = u["tokens"] if u else 0
        if count > tokens_now:
            await update.message.reply_text(
                f"⚠️ You only have <code>{tokens_now}</code> tokens.",
                parse_mode=ParseMode.HTML, reply_markup=cancel_kb())
            return SMS_COUNT

    context.user_data["sms_count"] = count
    await update.message.reply_text("Step 3/3 — Send the <b>target number</b> (10 digits).",
                                     parse_mode=ParseMode.HTML, reply_markup=cancel_kb())
    return SMS_NUMBER


async def sms_get_number(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    number = clean_number((update.message.text or "").strip())
    if len(number) != 10:
        await update.message.reply_text("⚠️ Invalid number.", reply_markup=cancel_kb())
        return SMS_NUMBER

    user = update.effective_user
    msg_text = context.user_data.get("sms_msg", "")
    count = context.user_data.get("sms_count", 1)
    use_token = context.user_data.get("sms_use_token", False)

    if use_token:
        if not db_use_tokens(user.id, count):
            await update.message.reply_text("❌ Not enough tokens.")
            return ConversationHandler.END
    else:
        db_action_set(user.id, "sms", 1)

    wait = await update.message.reply_text("📤 Sending SMS...")
    url = SMS_API.format(count=count, msg=quote(msg_text, safe=""), number=number)
    data = await fetch_json(url, retries=3, backoff=2.0)
    if data is None:
        await wait.edit_text("❌ No response from SMS API.")
        return ConversationHandler.END

    pretty = json.dumps(_strip_meta(data), indent=2, ensure_ascii=False)
    if len(pretty) > 3500: pretty = pretty[:3500] + "\n..."

    u = db_get_user(user.id); tokens_now = u["tokens"] if u else 0
    info = (
        f"✅ <b>SMS sent</b>\n\n"
        f"📱 <code>{esc(number)}</code>\n"
        f"🔢 Count: <code>{count}</code>\n"
        f"💳 Used: <code>{count if use_token else 'free 24h'}</code>\n"
        f"💳 Tokens left: <code>{tokens_now}</code>\n\n"
        f"<pre>{esc(pretty)}</pre>"
    )
    try: await wait.edit_text(info, parse_mode=ParseMode.HTML)
    except TelegramError: await wait.edit_text(info[:4000])
    await schedule_delete(context, wait.chat_id, wait.message_id, AUTO_DELETE_SECONDS)
    context.user_data.clear()
    return ConversationHandler.END


async def sms_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data.clear()
    await update.message.reply_text("❌ Cancelled.")
    return ConversationHandler.END


# ============ /stope ============

async def stope_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if is_banned(update.effective_user.id):
        return await update.message.reply_text("🚫 You are banned.")
    if not await check_joins(context, update.effective_user.id):
        return await update.message.reply_text("🔒 Join Required.", reply_markup=join_kb())
    if not context.args:
        m = await update.message.reply_text(
            "⚠️ Usage: <code>/stope 1234567890</code>", parse_mode=ParseMode.HTML)
        return await schedule_delete(context, m.chat_id, m.message_id, AUTO_DELETE_SECONDS)
    n = clean_number(context.args[0])
    if len(n) != 10:
        m = await update.message.reply_text("⚠️ 10-digit only.", parse_mode=ParseMode.HTML)
        return await schedule_delete(context, m.chat_id, m.message_id, AUTO_DELETE_SECONDS)
    m = await update.message.reply_text(
        f"🛑 <b>Stop signal</b> sent for <code>{esc(n)}</code>.",
        parse_mode=ParseMode.HTML)
    await schedule_delete(context, m.chat_id, m.message_id, AUTO_DELETE_SECONDS)


# ============ PHOTO ============

async def photo_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    user = update.effective_user
    if is_banned(user.id):
        await update.message.reply_text("🚫 You are banned.")
        return ConversationHandler.END
    if not await check_joins(context, user.id):
        await update.message.reply_text("🔒 Join Required.", reply_markup=join_kb())
        return ConversationHandler.END

    act = db_action_get(user.id, "photo")
    used = 0
    if act:
        elapsed = int(time.time()) - act["last_used"]
        used = 0 if elapsed >= 24 * 3600 else (act["value"] or 0)

    if used >= PHOTO_LIMIT_PER_24H:
        elapsed = int(time.time()) - act["last_used"]
        left = max(0, 24 * 3600 - elapsed)
        m = await update.message.reply_text(cooldown_text(left),
                                             parse_mode=ParseMode.HTML,
                                             reply_markup=main_menu_kb(is_admin(user.id)))
        await schedule_delete(context, m.chat_id, m.message_id, AUTO_DELETE_SECONDS)
        return ConversationHandler.END

    await update.message.reply_text(
        f"🖼️ <b>Photo Editor</b>\n"
        f"Limit: <b>{PHOTO_LIMIT_PER_24H} per 24h</b> — used <b>{used}/{PHOTO_LIMIT_PER_24H}</b>\n\n"
        f"Send me the URL of the photo you want to edit.",
        parse_mode=ParseMode.HTML, reply_markup=cancel_kb())
    return PHOTO_WAIT_URL


async def photo_get_url(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    user = update.effective_user
    url = (update.message.text or "").strip()
    if not url.startswith(("http://", "https://")):
        await update.message.reply_text("⚠️ Send a valid URL.", reply_markup=cancel_kb())
        return PHOTO_WAIT_URL

    wait = await update.message.reply_text(
        "🖼️ Processing...\n"
        "⏳ Image URL will appear for only <b>10 seconds</b>.\n"
        f"Contact owner :- {OWNER_CONTACT}",
        parse_mode=ParseMode.HTML)

    api_url = PHOTO_API.format(url=quote(url, safe=""))
    data = await fetch_json(api_url, retries=3, backoff=2.5)
    if data is None:
        await wait.edit_text("❌ No response from Photo API.")
        return ConversationHandler.END

    edited_url = None
    if isinstance(data, dict):
        for key in ("result", "url", "image_url", "output", "edited_url", "image"):
            v = data.get(key)
            if isinstance(v, str) and v.startswith("http"):
                edited_url = v; break
            if isinstance(v, dict):
                for kk in ("url", "image_url", "image", "output"):
                    vv = v.get(kk)
                    if isinstance(vv, str) and vv.startswith("http"):
                        edited_url = vv; break
                if edited_url: break

    if not edited_url:
        pretty = json.dumps(_strip_meta(data), indent=2, ensure_ascii=False)
        if len(pretty) > 3000: pretty = pretty[:3000] + "..."
        await wait.edit_text(f"❌ No image URL in response:\n<pre>{esc(pretty)}</pre>",
                              parse_mode=ParseMode.HTML)
        return ConversationHandler.END

    act = db_action_get(user.id, "photo")
    used_now = 0
    if act:
        elapsed = int(time.time()) - act["last_used"]
        used_now = 1 if elapsed >= 24 * 3600 else (act["value"] or 0) + 1
    else:
        used_now = 1
    db_action_set(user.id, "photo", used_now)

    caption = (
        f"🖼️ <b>Edited Photo</b>\n\n"
        f"🔗 <code>{esc(edited_url)}</code>\n\n"
        f"⚠️ Auto-delete in <b>10 seconds</b>.\n"
        f"Contact owner :- {OWNER_CONTACT}"
    )
    try:
        await wait.edit_text(caption, parse_mode=ParseMode.HTML, disable_web_page_preview=True)
    except TelegramError:
        await wait.edit_text(caption[:4000], disable_web_page_preview=True)
    await schedule_delete(context, wait.chat_id, wait.message_id, PHOTO_AUTO_DELETE_SECONDS)
    try: await update.message.delete()
    except TelegramError: pass
    return ConversationHandler.END


async def photo_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("❌ Photo editor cancelled.")
    return ConversationHandler.END


# ============ REFER / DAILY / STATS ============

async def refer_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    if is_banned(user.id):
        return await update.message.reply_text("🚫 You are banned.")
    if not await check_joins(context, user.id):
        return await update.message.reply_text("🔒 Join Required.", reply_markup=join_kb())
    u = db_get_user(user.id); tokens = u["tokens"] if u else 0
    refs = u["referral_count"] if u else 0
    link = f"https://t.me/{BOT_USERNAME}?start={user.id}"
    await update.message.reply_text(
        f"🎁 <b>Refer & Earn</b>\n\n10 tokens per referral.\n\n"
        f"🔗 <code>{link}</code>\n\n"
        f"📊 Referrals: <code>{refs}</code>\n💳 Tokens: <code>{tokens}</code>",
        parse_mode=ParseMode.HTML)


async def daily_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    if is_banned(user.id):
        return await update.message.reply_text("🚫 You are banned.")
    if not await check_joins(context, user.id):
        return await update.message.reply_text("🔒 Join Required.", reply_markup=join_kb())
    u = db_get_user(user.id)
    last_claim = u["last_daily_claim"] if u else 0
    elapsed = int(time.time()) - (last_claim or 0)
    if elapsed < 24 * 3600 and last_claim:
        m = await update.message.reply_text(cooldown_text(24 * 3600 - elapsed),
                                             parse_mode=ParseMode.HTML)
        return await schedule_delete(context, m.chat_id, m.message_id, AUTO_DELETE_SECONDS)
    amount = random.randint(TOKENS_DAILY_MIN, TOKENS_DAILY_MAX)
    msg = await update.message.reply_text(
        "💰 <b>Daily Reward</b>\n\n◐ Rolling... ◐", parse_mode=ParseMode.HTML)
    db_set_daily_claim(user.id)
    await spin_and_reward(context, msg.chat_id, msg.message_id, user.id, amount,
                          "💰 <b>Daily Reward</b>")


async def stats_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    if is_banned(user.id):
        return await update.message.reply_text("🚫 You are banned.")
    if not await check_joins(context, user.id):
        return await update.message.reply_text("🔒 Join Required.", reply_markup=join_kb())
    u = db_get_user(user.id); tokens = u["tokens"] if u else 0
    refs = u["referral_count"] if u else 0
    total = db_count_users()
    used = db_video_used_today(user.id)
    limit = db_user_video_limit(user.id)
    await update.message.reply_text(
        f"📊 <b>Your Stats</b>\n\n"
        f"👤 ID: <code>{user.id}</code>\n"
        f"💳 Tokens: <code>{tokens}</code>\n"
        f"🎁 Referrals: <code>{refs}</code>\n"
        f"🎬 Videos today: <code>{used}/{limit}</code>\n"
        f"🌐 Total Users: <code>{total}</code>",
        parse_mode=ParseMode.HTML)


# ============ ADMIN COMMANDS ============

async def admin_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_admin(update.effective_user.id):
        return await update.message.reply_text("❌ Admin only.")
    await update.message.reply_text("🛠️ <b>Admin Panel</b>",
                                     parse_mode=ParseMode.HTML, reply_markup=admin_panel_kb())


async def broadcast_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_admin(update.effective_user.id):
        return await update.message.reply_text("❌ Admin only.")
    if not context.args:
        return await update.message.reply_text("Usage: /broadcast message")
    msg = " ".join(context.args)
    con = db_conn(); cur = con.cursor()
    cur.execute("SELECT user_id FROM users"); rows = cur.fetchall(); con.close()
    sem = asyncio.Semaphore(20)
    ok = fail = 0

    async def _one(uid: int) -> None:
        nonlocal ok, fail
        async with sem:
            try:
                await context.bot.send_message(uid, f"📢 <b>Announcement</b>\n\n{msg}",
                                                parse_mode=ParseMode.HTML)
                ok += 1
            except TelegramError:
                fail += 1

    await asyncio.gather(*[_one(r["user_id"]) for r in rows])
    await update.message.reply_text(f"✅ Sent: {ok}\n❌ Failed: {fail}")


async def addtokens_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_admin(update.effective_user.id):
        return await update.message.reply_text("❌ Admin only.")
    if len(context.args) < 2:
        return await update.message.reply_text("Usage: /addtokens USER_ID AMOUNT")
    try: target = int(context.args[0]); amt = int(context.args[1])
    except ValueError: return await update.message.reply_text("❌ Invalid args.")
    db_upsert_user(target, "", "")
    db_add_tokens(target, amt)
    await update.message.reply_text(f"✅ Added <code>{amt}</code> tokens to <code>{target}</code>",
                                     parse_mode=ParseMode.HTML)


async def resetlimit_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_admin(update.effective_user.id):
        return await update.message.reply_text("❌ Admin only.")
    if not context.args:
        return await update.message.reply_text("Usage: /resetlimit USER_ID [photo|sms|video|all]")
    try: target = int(context.args[0])
    except ValueError: return await update.message.reply_text("❌ Invalid ID")
    which = context.args[1] if len(context.args) > 1 else "all"
    if which == "all":
        db_action_clear(target)
    elif which in ("photo", "sms", "video"):
        db_action_clear(target, which)
    else:
        return await update.message.reply_text("❌ action must be photo|sms|video|all")
    await update.message.reply_text(
        f"🔓 Reset <code>{which}</code> limits for <code>{target}</code>.", parse_mode=ParseMode.HTML)


async def resetage_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_admin(update.effective_user.id):
        return await update.message.reply_text("❌ Admin only.")
    if not context.args:
        return await update.message.reply_text("Usage: /resetage USER_ID")
    try: target = int(context.args[0])
    except ValueError: return await update.message.reply_text("❌ Invalid ID")
    db_set_age_verified(target, 0)
    await update.message.reply_text(
        f"🔞 Age gate reset for <code>{target}</code>.", parse_mode=ParseMode.HTML)


async def setcost_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_admin(update.effective_user.id):
        return await update.message.reply_text("❌ Admin only.")
    if not context.args:
        return await update.message.reply_text(f"Current video cost: {setting_video_cost()}\nUsage: /setcost N")
    try: n = int(context.args[0])
    except ValueError: return await update.message.reply_text("❌ Must be a number")
    if n < 0: return await update.message.reply_text("❌ Must be >= 0")
    db_setting_set("video_cost", str(n))
    await update.message.reply_text(f"🎬 Video cost set to <code>{n}</code> token(s).",
                                     parse_mode=ParseMode.HTML)


async def setdaily_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_admin(update.effective_user.id):
        return await update.message.reply_text("❌ Admin only.")
    if not context.args:
        return await update.message.reply_text(
            f"Global daily video limit: {setting_daily_video_limit()}\nUsage: /setdaily N")
    try: n = int(context.args[0])
    except ValueError: return await update.message.reply_text("❌ Must be a number")
    if n < 0: return await update.message.reply_text("❌ Must be >= 0")
    db_setting_set("daily_video_limit", str(n))
    await update.message.reply_text(f"📅 Global daily video limit set to <code>{n}</code>.",
                                     parse_mode=ParseMode.HTML)


async def setuserlimit_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_admin(update.effective_user.id):
        return await update.message.reply_text("❌ Admin only.")
    if len(context.args) < 2:
        return await update.message.reply_text("Usage: /setuserlimit USER_ID N (or 0 to remove override)")
    try:
        target = int(context.args[0]); n = int(context.args[1])
    except ValueError:
        return await update.message.reply_text("❌ Invalid args")
    if n <= 0:
        db_set_user_video_limit(target, None)
        await update.message.reply_text(f"♻️ Cleared override for <code>{target}</code>.",
                                         parse_mode=ParseMode.HTML)
    else:
        db_set_user_video_limit(target, n)
        await update.message.reply_text(f"📅 Set daily video limit for <code>{target}</code> to <code>{n}</code>.",
                                         parse_mode=ParseMode.HTML)


async def ban_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_admin(update.effective_user.id):
        return await update.message.reply_text("❌ Admin only.")
    if not context.args:
        return await update.message.reply_text("Usage: /ban USER_ID")
    try: target = int(context.args[0])
    except ValueError: return await update.message.reply_text("❌ Invalid ID")
    db_upsert_user(target, "", "")
    db_set_banned(target, 1)
    await update.message.reply_text(f"🚫 Banned <code>{target}</code>.", parse_mode=ParseMode.HTML)


async def unban_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_admin(update.effective_user.id):
        return await update.message.reply_text("❌ Admin only.")
    if not context.args:
        return await update.message.reply_text("Usage: /unban USER_ID")
    try: target = int(context.args[0])
    except ValueError: return await update.message.reply_text("❌ Invalid ID")
    db_set_banned(target, 0)
    await update.message.reply_text(f"✅ Unbanned <code>{target}</code>.", parse_mode=ParseMode.HTML)


async def userinfo_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_admin(update.effective_user.id):
        return await update.message.reply_text("❌ Admin only.")
    if not context.args:
        return await update.message.reply_text("Usage: /userinfo USER_ID")
    try: target = int(context.args[0])
    except ValueError: return await update.message.reply_text("❌ Invalid ID")
    u = db_get_user(target)
    if u is None:
        return await update.message.reply_text("❌ User not found.")
    limit = db_user_video_limit(target)
    used = db_video_used_today(target)
    await update.message.reply_text(
        f"👤 <b>User Info</b>\n\n"
        f"ID: <code>{u['user_id']}</code>\n"
        f"Name: {esc(u['first_name'] or '')}\n"
        f"Username: @{esc(u['username'] or '')}\n"
        f"Tokens: <code>{u['tokens'] or 0}</code>\n"
        f"Referrals: <code>{u['referral_count'] or 0}</code>\n"
        f"Age verified: <code>{u['age_verified'] or 0}</code>\n"
        f"Banned: <code>{u['banned'] or 0}</code>\n"
        f"Video today: <code>{used}/{limit}</code>\n"
        f"Override limit: <code>{u['daily_video_limit'] if u['daily_video_limit'] is not None else '—'}</code>",
        parse_mode=ParseMode.HTML)


async def users_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_admin(update.effective_user.id):
        return await update.message.reply_text("❌ Admin only.")
    rows = db_list_users(20)
    lines = ["👥 <b>Last 20 Users</b>\n"]
    for r in rows:
        b = "🚫" if (r["banned"] or 0) else ""
        lines.append(f"<code>{r['user_id']}</code> {esc(r['first_name'] or '')} {b}")
    await update.message.reply_text("\n".join(lines), parse_mode=ParseMode.HTML)


async def forcejoin_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_admin(update.effective_user.id):
        return await update.message.reply_text("❌ Admin only.")
    cur = setting_force_join()
    db_setting_set("force_join", "0" if cur else "1")
    await update.message.reply_text(f"🧲 Force-join set to <code>{'OFF' if cur else 'ON'}</code>.",
                                     parse_mode=ParseMode.HTML)


# ============ CALLBACKS ============

async def callback_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    q = update.callback_query
    user = q.from_user
    data = q.data

    if data == "verify_join":
        ch = await is_channel_member(context, user.id)
        gr = await is_group_member(context, user.id)
        if ch and gr:
            await q.answer("✅ Verified!", show_alert=True)
            try: await q.message.delete()
            except TelegramError: pass
            u = db_get_user(user.id); tokens = u["tokens"] if u else 0
            await context.bot.send_message(
                chat_id=user.id,
                text=welcome_text(user, tokens),
                parse_mode=ParseMode.HTML,
                reply_markup=main_menu_kb(is_admin(user.id)))
        else:
            missing = []
            if not ch: missing.append("channel")
            if not gr: missing.append("group")
            await q.answer(f"❌ Join {' and '.join(missing)} first.", show_alert=True)
        return

    if data == "age_confirm":
        await q.answer("✅ Age verified.", show_alert=False)
        db_upsert_user(user.id, user.username or "", user.first_name or "")
        db_set_age_verified(user.id)
        try: await q.message.delete()
        except TelegramError: pass
        await send_one_video(user.id, context, user.id)
        return

    if data == "age_deny":
        await q.answer("🔞 Access denied.", show_alert=True)
        try: await q.message.delete()
        except TelegramError: pass
        await context.bot.send_message(
            chat_id=user.id,
            text="🔞 <b>Access Denied</b>\n\nThis section is only for users 18 and older.",
            parse_mode=ParseMode.HTML, reply_markup=main_menu_kb(is_admin(user.id)))
        return

    if data == "video_next":
        await q.answer()
        if is_banned(user.id):
            return
        await send_one_video(user.id, context, user.id)
        return

    await q.answer()

    if not await check_joins(context, user.id):
        await q.edit_message_text("🔒 Join Required.", reply_markup=join_kb())
        return

    if data == "menu_num":
        await q.edit_message_text(
            "🔍 <b>Number Search</b>\n\nSend me a 10-digit mobile number.",
            parse_mode=ParseMode.HTML, reply_markup=cancel_kb())
        context.user_data["awaiting"] = "num"
        return
    elif data == "menu_insta":
        await q.edit_message_text(
            "📸 <b>Instagram Info</b>\n\nSend me an Instagram username.",
            parse_mode=ParseMode.HTML, reply_markup=cancel_kb())
        context.user_data["awaiting"] = "insta"
        return
    elif data == "menu_aadhar":
        await q.edit_message_text(
            "🆔 <b>Aadhaar Info</b>\n\nSend me a 12-digit Aadhaar number.",
            parse_mode=ParseMode.HTML, reply_markup=cancel_kb())
        context.user_data["awaiting"] = "aadhar"
        return
    elif data == "menu_bom":
        await q.edit_message_text(
            "💣 <b>Bomber</b>\n\nSend me a 10-digit target number.",
            parse_mode=ParseMode.HTML, reply_markup=cancel_kb())
        context.user_data["awaiting"] = "bom"
        return
    elif data == "menu_sms":
        await q.edit_message_text(
            "💬 <b>Custom SMS</b>\n\nType <code>/sms</code> to start.",
            parse_mode=ParseMode.HTML, reply_markup=main_menu_kb(is_admin(user.id)))
        return
    elif data == "menu_photo":
        await q.edit_message_text(
            "🖼️ <b>Photo Editor</b>\n\nType <code>/photo</code> to start.",
            parse_mode=ParseMode.HTML, reply_markup=main_menu_kb(is_admin(user.id)))
        return
    elif data == "menu_video":
        u = db_get_user(user.id)
        if not u or not (u["age_verified"] or 0):
            await q.edit_message_text(
                "🔞 <b>Age Verification</b>\n\n"
                "You must be <b>18 years or older</b> to view this content.\n"
                "Tap ✅ to confirm, ❌ to cancel.",
                parse_mode=ParseMode.HTML, reply_markup=age_gate_kb())
            return
        try: await q.message.delete()
        except TelegramError: pass
        await send_one_video(user.id, context, user.id)
        return
    elif data == "menu_refer":
        u = db_get_user(user.id); tokens = u["tokens"] if u else 0
        refs = u["referral_count"] if u else 0
        link = f"https://t.me/{BOT_USERNAME}?start={user.id}"
        await q.edit_message_text(
            f"🎁 <b>Refer & Earn</b>\n\n10 tokens per referral.\n\n"
            f"🔗 <code>{link}</code>\n\n"
            f"📊 Referrals: <code>{refs}</code>\n💳 Tokens: <code>{tokens}</code>",
            parse_mode=ParseMode.HTML, reply_markup=main_menu_kb(is_admin(user.id)))
        return
    elif data == "menu_daily":
        u = db_get_user(user.id)
        last_claim = u["last_daily_claim"] if u else 0
        elapsed = int(time.time()) - (last_claim or 0)
        if elapsed < 24 * 3600 and last_claim:
            await q.edit_message_text(cooldown_text(24 * 3600 - elapsed),
                                       parse_mode=ParseMode.HTML,
                                       reply_markup=main_menu_kb(is_admin(user.id)))
        else:
            await q.edit_message_text("💰 Type <code>/daily</code> to claim.",
                                       parse_mode=ParseMode.HTML,
                                       reply_markup=main_menu_kb(is_admin(user.id)))
        return
    elif data == "menu_stats":
        u = db_get_user(user.id); tokens = u["tokens"] if u else 0
        refs = u["referral_count"] if u else 0
        used = db_video_used_today(user.id)
        limit = db_user_video_limit(user.id)
        await q.edit_message_text(
            f"📊 <b>Your Stats</b>\n\n"
            f"👤 ID: <code>{user.id}</code>\n"
            f"💳 Tokens: <code>{tokens}</code>\n"
            f"🎁 Referrals: <code>{refs}</code>\n"
            f"🎬 Videos today: <code>{used}/{limit}</code>",
            parse_mode=ParseMode.HTML, reply_markup=main_menu_kb(is_admin(user.id)))
        return
    elif data == "menu_help":
        await q.edit_message_text(HELP_TEXT, parse_mode=ParseMode.HTML,
                                   reply_markup=main_menu_kb(is_admin(user.id)))
        return
    elif data == "back_main":
        u = db_get_user(user.id); tokens = u["tokens"] if u else 0
        await q.edit_message_text(
            welcome_text(user, tokens),
            parse_mode=ParseMode.HTML,
            reply_markup=main_menu_kb(is_admin(user.id)))
        return

    # ---- Admin callbacks ----
    if data.startswith("admin_"):
        if not is_admin(user.id):
            await q.answer("❌", show_alert=False); return
        if data == "admin_panel":
            await q.edit_message_text("🛠️ <b>Admin Panel</b>",
                                       parse_mode=ParseMode.HTML, reply_markup=admin_panel_kb())
            return
        if data == "admin_stats":
            con = db_conn(); cur = con.cursor()
            cur.execute("SELECT COUNT(*) as c FROM users"); users = cur.fetchone()["c"]
            cur.execute("SELECT COALESCE(SUM(tokens),0) as t FROM users"); tokens = cur.fetchone()["t"]
            cur.execute("SELECT COUNT(*) as c FROM users WHERE banned=1"); banned = cur.fetchone()["c"]
            con.close()
            await q.edit_message_text(
                f"📊 <b>Global Stats</b>\n\n"
                f"🌐 Users: <code>{users}</code>\n"
                f"💳 Tokens: <code>{tokens}</code>\n"
                f"🚫 Banned: <code>{banned}</code>\n"
                f"🎬 Video cost: <code>{setting_video_cost()}</code>\n"
                f"📅 Daily limit: <code>{setting_daily_video_limit()}</code>\n"
                f"🧲 Force join: <code>{'ON' if setting_force_join() else 'OFF'}</code>",
                parse_mode=ParseMode.HTML, reply_markup=admin_panel_kb())
            return
        if data == "admin_users":
            rows = db_list_users(20)
            lines = ["👥 <b>Last 20 Users</b>\n"]
            for r in rows:
                b = "🚫" if (r["banned"] or 0) else ""
                lines.append(f"<code>{r['user_id']}</code> {esc(r['first_name'] or '')} {b}")
            await q.edit_message_text("\n".join(lines), parse_mode=ParseMode.HTML,
                                       reply_markup=admin_panel_kb())
            return
        if data == "admin_lookup":
            await q.edit_message_text(
                "🔍 Send:\n<code>/userinfo USER_ID</code>",
                parse_mode=ParseMode.HTML, reply_markup=admin_panel_kb())
            return
        if data == "admin_addtokens":
            await q.edit_message_text("🎁 Send:\n<code>/addtokens USER_ID AMOUNT</code>",
                                       parse_mode=ParseMode.HTML, reply_markup=admin_panel_kb())
            return
        if data == "admin_videocost":
            await q.edit_message_text(
                f"🎬 Current cost: <code>{setting_video_cost()}</code>\n"
                f"Send: <code>/setcost N</code>",
                parse_mode=ParseMode.HTML, reply_markup=admin_panel_kb())
            return
        if data == "admin_dailylimit":
            await q.edit_message_text(
                f"📅 Current global limit: <code>{setting_daily_video_limit()}</code>\n"
                f"Send: <code>/setdaily N</code>\n"
                f"Per-user: <code>/setuserlimit USER_ID N</code>",
                parse_mode=ParseMode.HTML, reply_markup=admin_panel_kb())
            return
        if data == "admin_resetage":
            await q.edit_message_text("🔞 Send:\n<code>/resetage USER_ID</code>",
                                       parse_mode=ParseMode.HTML, reply_markup=admin_panel_kb())
            return
        if data == "admin_resetlimit":
            await q.edit_message_text("🔓 Send:\n<code>/resetlimit USER_ID [photo|sms|video|all]</code>",
                                       parse_mode=ParseMode.HTML, reply_markup=admin_panel_kb())
            return
        if data == "admin_ban":
            await q.edit_message_text("🚫 Send:\n<code>/ban USER_ID</code>",
                                       parse_mode=ParseMode.HTML, reply_markup=admin_panel_kb())
            return
        if data == "admin_unban":
            await q.edit_message_text("✅ Send:\n<code>/unban USER_ID</code>",
                                       parse_mode=ParseMode.HTML, reply_markup=admin_panel_kb())
            return
        if data == "admin_broadcast":
            await q.edit_message_text("📢 Send:\n<code>/broadcast message</code>",
                                       parse_mode=ParseMode.HTML, reply_markup=admin_panel_kb())
            return
        if data == "admin_forcejoin":
            cur_state = setting_force_join()
            db_setting_set("force_join", "0" if cur_state else "1")
            await q.edit_message_text(
                f"🧲 Force-join now <b>{'OFF' if cur_state else 'ON'}</b>.",
                parse_mode=ParseMode.HTML, reply_markup=admin_panel_kb())
            return


# ============ AWAITING INPUT ============

async def awaiting_input_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    text = (update.message.text or "").strip()

    if is_banned(user.id):
        return await update.message.reply_text("🚫 You are banned.")

    if not await check_joins(context, user.id):
        return await update.message.reply_text("🔒 Join Required.", reply_markup=join_kb())

    awaiting = context.user_data.get("awaiting")

    if awaiting == "num":
        n = clean_number(text)
        if len(n) != 10:
            return await update.message.reply_text("⚠️ Send 10-digit number.", parse_mode=ParseMode.HTML)
        context.user_data.pop("awaiting", None)
        return await do_num_lookup(update, context, n)

    if awaiting == "aadhar":
        a = "".join(ch for ch in text if ch.isdigit())
        if len(a) != 12:
            return await update.message.reply_text("⚠️ Send 12-digit Aadhaar.", parse_mode=ParseMode.HTML)
        context.user_data.pop("awaiting", None)
        return await do_aadhar_lookup(update, context, a)

    if awaiting == "insta":
        username = text.lstrip("@").strip()
        if not username:
            return await update.message.reply_text("⚠️ Send a username.", parse_mode=ParseMode.HTML)
        context.user_data.pop("awaiting", None)
        return await do_insta_lookup(update, context, username)

    if awaiting == "bom":
        n = clean_number(text)
        if len(n) != 10:
            return await update.message.reply_text("⚠️ Send 10-digit number.", parse_mode=ParseMode.HTML)
        context.user_data.pop("awaiting", None)
        return await do_bomber(update, context, n)

    n = clean_number(text)
    if len(n) == 10:
        return await do_num_lookup(update, context, n)

    await update.message.reply_text(
        "🤷 I didn't catch that. Use /help to see commands.",
        parse_mode=ParseMode.HTML)


# ============ MAIN ============

async def _post_shutdown(application: Application) -> None:
    global _HTTP
    if _HTTP and not _HTTP.closed:
        await _HTTP.close()


def main() -> None:
    db_init()
    app = Application.builder().token(BOT_TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_cmd))
    app.add_handler(CommandHandler("num", num_cmd))
    app.add_handler(CommandHandler("aadhar", aadhar_cmd))
    app.add_handler(CommandHandler("insta", insta_cmd))
    app.add_handler(CommandHandler("bom", bom_cmd))
    app.add_handler(CommandHandler("video", video_cmd))
    app.add_handler(CommandHandler("stats", stats_cmd))
    app.add_handler(CommandHandler("refer", refer_cmd))
    app.add_handler(CommandHandler("daily", daily_cmd))
    app.add_handler(CommandHandler("stope", stope_cmd))

    # Admin
    app.add_handler(CommandHandler("admin", admin_cmd))
    app.add_handler(CommandHandler("broadcast", broadcast_cmd))
    app.add_handler(CommandHandler("addtokens", addtokens_cmd))
    app.add_handler(CommandHandler("resetlimit", resetlimit_cmd))
    app.add_handler(CommandHandler("resetage", resetage_cmd))
    app.add_handler(CommandHandler("setcost", setcost_cmd))
    app.add_handler(CommandHandler("setdaily", setdaily_cmd))
    app.add_handler(CommandHandler("setuserlimit", setuserlimit_cmd))
    app.add_handler(CommandHandler("ban", ban_cmd))
    app.add_handler(CommandHandler("unban", unban_cmd))
    app.add_handler(CommandHandler("userinfo", userinfo_cmd))
    app.add_handler(CommandHandler("users", users_cmd))
    app.add_handler(CommandHandler("forcejoin", forcejoin_cmd))

    sms_conv = ConversationHandler(
        entry_points=[CommandHandler("sms", sms_cmd)],
        states={
            SMS_MSG: [MessageHandler(filters.TEXT & ~filters.COMMAND, sms_get_msg)],
            SMS_COUNT: [MessageHandler(filters.TEXT & ~filters.COMMAND, sms_get_count)],
            SMS_NUMBER: [MessageHandler(filters.TEXT & ~filters.COMMAND, sms_get_number)],
        },
        fallbacks=[CommandHandler("cancel", sms_cancel)],
        allow_reentry=True, per_message=False,
    )
    app.add_handler(sms_conv)

    photo_conv = ConversationHandler(
        entry_points=[CommandHandler("photo", photo_cmd)],
        states={PHOTO_WAIT_URL: [MessageHandler(filters.TEXT & ~filters.COMMAND, photo_get_url)]},
        fallbacks=[CommandHandler("cancel", photo_cancel)],
        allow_reentry=True, per_message=False,
    )
    app.add_handler(photo_conv)

    app.add_handler(CallbackQueryHandler(callback_handler))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, awaiting_input_handler))

    app.post_shutdown = _post_shutdown  # type: ignore[assignment]

    logger.info("Bot started...")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()