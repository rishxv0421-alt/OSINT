import asyncio
import html
import json
import logging
from typing import Any
from urllib.parse import quote

import aiohttp
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.request import HTTPXRequest
from telegram.ext import (
    Application,
    CommandHandler,
    CallbackQueryHandler,
    ContextTypes,
)

# ============================================================
# ALL CONFIGURATION IS HERE
# ============================================================

BOT_TOKEN = "8869144072:AAHekrXEnH_MOrL3Mxx3zKM6AqVPo02UqGc"

# Admin Telegram user IDs
ADMIN_IDS = {8560410437}

OWNER = "@unkownkeshav"
AUTO_DELETE_SECONDS = 20
JOIN_MESSAGE_DELETE_SECONDS = 60

REQUIRED_GROUP_LINK = "https://t.me/+8ZnZ6hnmwediYzFl"
REQUIRED_CHANNEL_LINK = "https://t.me/+jVYz4p708_RhNDVl"
REQUIRED_CHANNEL_ID = -1004383096722
REQUIRED_GROUP_ID = -1004304689015

# Yahan aap future me aur bhi APIs add kar sakte hain:
APIS = {
    "number1": {"title": "MOBILE NUMBER INFO", "url": "https://infonumapi.anandk11an.workers.dev/?num={}", "sensitive": False},
    "query": {"title": "MOBILE NUMBER INFO 2", "url": "https://numapi.anandk11an.workers.dev/?query={}", "sensitive": False},
    "tg1": {"title": "TELEGRAM ID INFO", "url": "https://telegramapi.anandk11an.workers.dev/?q={}", "sensitive": False},
    "tg2": {"title": "TELEGRAM ID INFO 2", "url": "https://hostmyhosting.site/api/teleinfo.php?username=={}", "sensitive": False},
    "aadhaar": {"title": "AADHAAR INFO", "url": "https://adhar.anandk11an.workers.dev/?q={}", "sensitive": False},
    "ration": {"title": "RATION INFO", "url": "https://rationinfo.anandk11an.workers.dev/?q={}", "sensitive": False},
    "ff1": {"title": "FREE FIRE INDIA INFO", "url": "https://freefireapi.anandk11an.workers.dev/?q={}", "sensitive": False},
    "ff2": {"title": "FREE FIRE INDIA INFO 2", "url": "https://ffindiakey.anandk11an.workers.dev/?uid={}", "sensitive": False},
    "ifsc": {"title": "IFSC INFO", "url": "https://ifcapi.anandk11an.workers.dev/?q={}", "sensitive": False},
    "insta": {"title": "INSTAGRAM INFO", "url": "https://instagramapi.anandk11an.workers.dev/?q={}", "sensitive": False},
    "pan": {"title": "PAN INFO", "url": "https://panapi.anandk11an.workers.dev/?q={}", "sensitive": True},
    "leak": {"title": "DATA LEAK INFO", "url": "https://leakapi.anandk11an.workers.dev/?q={}", "sensitive": False},
    
    # --- NEW APIs ADDED BELOW ---
    "ip": {"title": "IP INFO", "url": "https://ipinfo.io/{}/geo", "sensitive": False},
    "postoffice": {"title": "POST OFFICE INFO", "url": "https://api.postalpincode.in/postoffice/{}", "sensitive": False},
    "pincode": {"title": "PIN CODE INFO", "url": "https://api.postalpincode.in/pincode/{}", "sensitive": False},
    "country": {"title": "COUNTRY/UNIVERSITY INFO", "url": "http://universities.hipolabs.com/search?country={}", "sensitive": False},
}

# ============================================================
# LOGGING
# ============================================================

logging.basicConfig(
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    level=logging.INFO,
)
log = logging.getLogger("king-cobra-command-bot")

# ============================================================
# REDACTION & HELPERS
# ============================================================

SENSITIVE_KEYS = (
    "aadhaar", "aadhar", "uid", "address", "full_address",
    "father", "father_name", "mother", "mother_name",
    "mobile", "phone", "msisdn", "email", "dob", "date_of_birth",
    "account", "account_number", "pan", "passport",
    "otp", "password", "token", "secret",
)

def mask_number(value: Any, keep_last: int = 4) -> str:
    s = "".join(ch for ch in str(value) if ch.isdigit())
    if len(s) <= keep_last:
        return "[hidden]"
    return "X" * (len(s) - keep_last) + s[-keep_last:]

def redact_sensitive(obj: Any) -> Any:
    if isinstance(obj, dict):
        out = {}
        for key, value in obj.items():
            k = str(key).lower().strip()
            if any(s in k for s in ("aadhaar", "aadhar", "uid")):
                out[key] = mask_number(value)
            elif any(s in k for s in ("mobile", "phone", "msisdn")):
                out[key] = mask_number(value)
            elif any(s in k for s in SENSITIVE_KEYS):
                out[key] = "[hidden]"
            else:
                out[key] = redact_sensitive(value)
        return out
    if isinstance(obj, list):
        return [redact_sensitive(x) for x in obj]
    return obj

def raw_output(data: Any, sensitive: bool = False) -> str:
    if sensitive:
        data = redact_sensitive(data)
    if isinstance(data, (dict, list)):
        return json.dumps(data, ensure_ascii=False, indent=2)[:3500]
    return str(data)[:3500]

async def delete_message_later(message, delay: int = AUTO_DELETE_SECONDS):
    await asyncio.sleep(delay)
    try:
        await message.delete()
    except Exception:
        pass

def schedule_delete(message, delay: int = AUTO_DELETE_SECONDS):
    if message:
        asyncio.create_task(delete_message_later(message, delay))

def join_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("JOIN GROUP", url=REQUIRED_GROUP_LINK)],
        [InlineKeyboardButton("JOIN CHANNEL", url=REQUIRED_CHANNEL_LINK)],
        [InlineKeyboardButton("I HAVE JOINED - CHECK", callback_data="check_join")],
    ])

async def is_member(bot, chat_id, user_id: int) -> bool:
    try:
        member = await bot.get_chat_member(chat_id=chat_id, user_id=user_id)
        status = getattr(member, "status", "")
        if status in ("member", "administrator", "creator", "owner"):
            return True
        if status == "restricted":
            return bool(getattr(member, "is_member", False))
        return False
    except Exception as exc:
        log.warning("Membership check failed chat=%s user=%s: %s", chat_id, user_id, exc)
        return False

async def get_join_state(bot, user_id: int):
    if user_id in ADMIN_IDS:
        return True, True, None
    group_ok, channel_ok = await asyncio.gather(
        is_member(bot, REQUIRED_GROUP_ID, user_id),
        is_member(bot, REQUIRED_CHANNEL_ID, user_id),
    )
    return group_ok, channel_ok, None

async def send_join_required(update: Update, context: ContextTypes.DEFAULT_TYPE, setup_error=None):
    text = (
        "BOT LOCKED\n\n"
        "Bot use karne ke liye pehle Group aur Channel dono join karo.\n\n"
        "1. JOIN GROUP\n"
        "2. JOIN CHANNEL\n"
        "3. Join ke baad I HAVE JOINED - CHECK dabao."
    )
    if setup_error:
        text += f"\n\n{html.escape(setup_error)}"
    if update.effective_message:
        sent = await update.effective_message.reply_text(
            text, parse_mode="HTML", reply_markup=join_keyboard(), disable_web_page_preview=True
        )
        schedule_delete(sent, JOIN_MESSAGE_DELETE_SECONDS)

async def check_membership_access(update: Update, context: ContextTypes.DEFAULT_TYPE) -> bool:
    user = update.effective_user
    if not user:
        return False
    if user.id in ADMIN_IDS:
        return True
    group_ok, channel_ok, setup_error = await get_join_state(context.bot, user.id)
    if setup_error:
        await send_join_required(update, context, setup_error)
        return False
    if group_ok and channel_ok:
        return True
    await send_join_required(update, context)
    return False

# ============================================================
# JOIN CHECK CALLBACK
# ============================================================

async def check_join_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    if not query:
        return
    await query.answer("Checking membership...")
    user = query.from_user
    if user.id in ADMIN_IDS:
        await query.edit_message_text("ACCESS GRANTED\n\nAdmin access active.", parse_mode="HTML")
        schedule_delete(query.message)
        return
    group_ok, channel_ok, setup_error = await get_join_state(context.bot, user.id)
    if setup_error:
        await query.edit_message_text(f"SETUP REQUIRED\n\n{html.escape(setup_error)}", parse_mode="HTML", reply_markup=join_keyboard())
        return
    if group_ok and channel_ok:
        await query.edit_message_text("ACCESS GRANTED\n\nGroup + Channel membership verified.\nAb aap bot commands use kar sakte ho.\n\nCommands: /help", parse_mode="HTML")
        schedule_delete(query.message)
        return
    missing = []
    if not group_ok: missing.append("Group")
    if not channel_ok: missing.append("Channel")
    await query.edit_message_text(
        "JOIN NOT VERIFIED\n\n"
        f"Abhi join verify nahi hua: {html.escape(' + '.join(missing))}\n\n"
        "Required chats join karo aur phir dobara CHECK button dabao.",
        parse_mode="HTML", reply_markup=join_keyboard(), disable_web_page_preview=True,
    )

# ============================================================
# /CHATID
# ============================================================

async def chatid_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    message = update.effective_message
    chat = update.effective_chat
    user = update.effective_user
    if not message or not chat or not user:
        return
    if user.id not in ADMIN_IDS:
        deny = await message.reply_text("Admin only.")
        schedule_delete(message)
        schedule_delete(deny)
        return
    result = await message.reply_text(f"CHAT ID\n{chat.id}\n\nIs ID ko REQUIRED_GROUP_ID me set karo.", parse_mode="HTML")
    schedule_delete(message)
    schedule_delete(result, 60)

# ============================================================
# API REQUEST
# ============================================================

async def call_api(url_template: str, query: str):
    if not url_template: 
        return False, "API URL configure nahi hai."
    if "{}" not in url_template: 
        return False, "API URL me {} placeholder hona chahiye."
    
    url = url_template.format(quote(query.strip(), safe=""))
    timeout = aiohttp.ClientTimeout(total=30, connect=15, sock_connect=15, sock_read=25)
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(url, headers={"User-Agent": "KingCobra-TelegramBot/10.0", "Accept": "application/json,text/plain,*/*"}) as resp:
                raw = await resp.text()
                if resp.status != 200:
                    return False, f"HTTP {resp.status}\n{raw[:900]}"
                try:
                    return True, json.loads(raw)
                except json.JSONDecodeError:
                    return True, raw
    except asyncio.TimeoutError:
        return False, "API timeout. Thodi der baad try karo."
    except aiohttp.ClientError as exc:
        return False, f"Network error: {exc}"
    except Exception as exc:
        log.exception("API request failed")
        return False, f"{type(exc).__name__}: {exc}"

# ============================================================
# COMMANDS
# ============================================================

COMMAND_TEXT = """Pikachu Official Osint BOT

Commands:
/number1 VALUE
/query VALUE
/tg1 VALUE
/tg2 VALUE
/aadhaar VALUE
/ration VALUE
/ff1 VALUE
/ff2 VALUE
/ifsc VALUE
/insta VALUE
/ip VALUE
/pan VALUE
/leak VALUE
/postoffice VALUE
/pincode VALUE
/country VALUE

Examples:
/number1 9876543210
/ip 8.8.8.8
/pincode 110001
/postoffice New Delhi
/country India

Search command aur result dono 20 seconds me auto-delete honge.

Owner: {owner}
"""

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    message = update.effective_message
    if not message: return
    schedule_delete(message)
    if not await check_membership_access(update, context): return
    result = await message.reply_text(COMMAND_TEXT.format(owner=OWNER), parse_mode="HTML")
    schedule_delete(result)

async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await start(update, context)

async def run_tool_command(update: Update, context: ContextTypes.DEFAULT_TYPE, tool_key: str):
    message = update.effective_message
    if not message: return
    schedule_delete(message)
    
    if not await check_membership_access(update, context): return
    
    if tool_key not in APIS:
        err = await message.reply_text("Unknown command.")
        schedule_delete(err)
        return
        
    query = " ".join(context.args).strip()
    if not query:
        usage = await message.reply_text(f"Usage:\n/{tool_key} VALUE")
        schedule_delete(usage)
        return
        
    tool = APIS[tool_key]
    wait_msg = await message.reply_text(f"{tool['title']}\n\nSearching...")
    ok, result_data = await call_api(tool["url"], query)
    
    if not ok:
        try:
            await wait_msg.edit_text(f"API ERROR\n\n<pre>{html.escape(str(result_data))}</pre>", parse_mode="HTML")
        finally:
            schedule_delete(wait_msg)
        return 
        
    # Send to mask helper if sensitive 
    result = raw_output(result_data, sensitive=tool["sensitive"]) 
    try: 
        await wait_msg.edit_text( 
            f"<b>{html.escape(tool['title'])}</b>\n\n" 
            f"<pre>{html.escape(result)}</pre>\n\n" 
            f"BOT MADE BY: {html.escape(OWNER)}\n" 
            f"Auto delete: {AUTO_DELETE_SECONDS}s", 
            parse_mode="HTML", 
        ) 
    finally: 
        schedule_delete(wait_msg) 

def make_tool_handler(tool_key: str):
    async def handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
        await run_tool_command(update, context, tool_key)
    return handler

# ============================================================
# ERROR HANDLER
# ============================================================

async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE):
    log.error("Unhandled error: %s", context.error, exc_info=context.error)

# ============================================================
# MAIN
# ============================================================

def main():
    if not BOT_TOKEN or BOT_TOKEN == "PASTE_YOUR_BOT_TOKEN_HERE" or ":" not in BOT_TOKEN:
        raise RuntimeError("BOT_TOKEN set nahi hai. File ke top me BOT_TOKEN = 'YOUR_NEW_TOKEN' set karo.")
        
    bot_request = HTTPXRequest(connect_timeout=60.0, read_timeout=60.0, write_timeout=60.0, pool_timeout=60.0, connection_pool_size=8, http_version="1.1")
    updates_request = HTTPXRequest(connect_timeout=60.0, read_timeout=90.0, write_timeout=60.0, pool_timeout=60.0, connection_pool_size=8, http_version="1.1")

    app = Application.builder().token(BOT_TOKEN).request(bot_request).get_updates_request(updates_request).build() 
    
    app.add_handler(CommandHandler("start", start)) 
    app.add_handler(CommandHandler("help", help_command)) 
    app.add_handler(CommandHandler("chatid", chatid_command)) 
    app.add_handler(CallbackQueryHandler(check_join_callback, pattern=r"^check_join$")) 
    
    # Dynamically register all commands based on APIS dictionary keys
    for command_name in APIS: 
        app.add_handler(CommandHandler(command_name, make_tool_handler(command_name))) 
        
    app.add_error_handler(error_handler) 
    
    print("KING COBRA COMMAND BOT STARTING...") 
    print("Mandatory join system enabled.") 
    print(f"Required channel: {REQUIRED_CHANNEL_ID}") 
    print(f"Required group ID: {REQUIRED_GROUP_ID}") 
    print(f"Auto-delete: {AUTO_DELETE_SECONDS} seconds.") 
    
    app.run_polling(drop_pending_updates=True, bootstrap_retries=-1, close_loop=False, allowed_updates=Update.ALL_TYPES) 

if __name__ == "__main__":
    main()
