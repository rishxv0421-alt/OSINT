import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DB_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = path.join(DB_DIR, 'cyber_bot.db');
const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    username TEXT DEFAULT '',
    first_name TEXT DEFAULT '',
    tokens INTEGER DEFAULT 50,
    referred_by INTEGER DEFAULT NULL,
    referral_count INTEGER DEFAULT 0,
    joined_at INTEGER DEFAULT 0,
    first_start_rewarded INTEGER DEFAULT 0,
    last_daily_claim INTEGER DEFAULT 0,
    banned INTEGER DEFAULT 0,
    total_queries INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS actions (
    user_id INTEGER,
    action TEXT,
    value INTEGER DEFAULT 0,
    last_used INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, action)
  );

  CREATE TABLE IF NOT EXISTS referrals (
    referrer_id INTEGER,
    referred_id INTEGER UNIQUE,
    rewarded INTEGER DEFAULT 0,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS query_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT,
    user_id INTEGER,
    username TEXT,
    service TEXT,
    query TEXT,
    status TEXT,
    records_found INTEGER DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS media_cache (
    filename TEXT PRIMARY KEY,
    file_id TEXT,
    updated_at INTEGER
  );
`);

export interface BotUser {
  user_id: number;
  username: string;
  first_name: string;
  tokens: number;
  referred_by: number | null;
  referral_count: number;
  joined_at: number;
  first_start_rewarded: number;
  last_daily_claim: number;
  banned: number;
  total_queries: number;
}

export interface QueryLog {
  id: number;
  source: string;
  user_id: number;
  username: string;
  service: string;
  query: string;
  status: string;
  records_found: number;
  duration_ms: number;
  created_at: number;
}

export const EXCLUSIVE_BRAND_INTRO =
  '🔺 <b>RISXAV HAXKK !! — RHXVM PRO OSINT</b> 👁️‍🗨️\n\n' +
  '⚜️ Welcome <b>{name}</b> | Agent ID: <code>{id}</code> | Credits: <code>{tokens}</code>\n' +
  '━━━━━━━━━━━━━━━━━━━━━━\n' +
  '👁️‍🗨️ <b>Advance Number Info</b> (.TXT Dossier)\n' +
  '🔺 <b>RHXVM PRO OSINT</b> (WhatsApp · Truecaller · Dorks)\n' +
  '💠 <b>UPI ID OSINT</b> (35-Bank NPCI VPA Matrix)\n' +
  '🧿 <b>Aadhaar Vision OCR</b> (Card Photo Extractor)\n' +
  '🔮 <b>Username ➔ Number</b> (Telegram Recon)\n' +
  '🕯️ <b>Instagram Recon & AI Photo Lab</b>\n' +
  '━━━━━━━━━━━━━━━━━━━━━━\n' +
  '⚡ <b>FAST · SECURE · POWERFUL</b>\n' +
  '🤖 <b>Official Bot:</b> {bot}\n' +
  '👑 <b>Owner:</b> {owner}';

const defaultSettings: Record<string, string> = {
  force_join: '0',
  intro_msg: EXCLUSIVE_BRAND_INTRO,
  owner_contact: '@RHXVM',
  force_channel: 'RISXAVHAXXK',
  force_group: 'RHXVM_PRO_OSINT',
  welcome_video_enabled: '1',
  welcome_video_mode: 'risxav_vertical_promo.mp4',
};

for (const [k, v] of Object.entries(defaultSettings)) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(k) as { value: string } | undefined;
  if (!row) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(k, v);
  }
}

// Auto-sanitize any legacy third-party strings in persisted DB settings
const bannedLegacyPattern = /radevil|rapro|ra_halp|skillx|gautam|shobha|thetracex|wasdac|sobhan|welcome10/i;
const currentAll = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
for (const item of currentAll) {
  if (bannedLegacyPattern.test(item.value)) {
    const cleanDefault = defaultSettings[item.key] || '@RHXVM';
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(cleanDefault, item.key);
  }
}

// Upgrade owner_contact & intro_msg to @RHXVM + full feature showcase
const curOwner = db.prepare('SELECT value FROM settings WHERE key = ?').get('owner_contact') as
  | { value: string }
  | undefined;
if (curOwner && curOwner.value === 'RISXAV HAXKK !!') {
  db.prepare('UPDATE settings SET value = ? WHERE key = ?').run('@RHXVM', 'owner_contact');
}

const existingIntro = db.prepare('SELECT value FROM settings WHERE key = ?').get('intro_msg') as
  | { value: string }
  | undefined;
if (
  existingIntro &&
  (existingIntro.value.includes('Select any tool from the Tab Menu') ||
    existingIntro.value.includes('Order Core:'))
) {
  db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(EXCLUSIVE_BRAND_INTRO, 'intro_msg');
}

const curVideoMode = db.prepare('SELECT value FROM settings WHERE key = ?').get('welcome_video_mode') as
  | { value: string }
  | undefined;
if (curVideoMode && /^welcome\d+\.mp4$/i.test(curVideoMode.value)) {
  db.prepare('UPDATE settings SET value = ? WHERE key = ?').run('risxav_vertical_promo.mp4', 'welcome_video_mode');
}

// Purge all old Gautam / unedited welcome*.mp4 cached Telegram file_ids
db.prepare("DELETE FROM media_cache WHERE filename LIKE 'welcome%.mp4'").run();

export function getSetting(key: string, fallback = ''): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? row.value : fallback;
}

export function setSetting(key: string, value: string): void {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

export function getAllSettings(): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export function getCachedMediaFileId(filename: string): string | null {
  const row = db.prepare('SELECT file_id FROM media_cache WHERE filename = ?').get(filename) as
    | { file_id: string }
    | undefined;
  return row ? row.file_id : null;
}

export function setCachedMediaFileId(filename: string, fileId: string): void {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(`
    INSERT INTO media_cache (filename, file_id, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(filename) DO UPDATE SET file_id = excluded.file_id, updated_at = excluded.updated_at
  `).run(filename, fileId, now);
}

export function clearMediaCache(filename?: string): void {
  if (filename) {
    db.prepare('DELETE FROM media_cache WHERE filename = ?').run(filename);
  } else {
    db.prepare('DELETE FROM media_cache').run();
  }
}

export function getUser(userId: number): BotUser | undefined {
  return db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId) as BotUser | undefined;
}

export function upsertUser(userId: number, username: string, firstName: string): BotUser {
  const existing = getUser(userId);
  const now = Math.floor(Date.now() / 1000);
  if (!existing) {
    db.prepare(`
      INSERT INTO users (user_id, username, first_name, tokens, joined_at)
      VALUES (?, ?, ?, 50, ?)
    `).run(userId, username || '', firstName || '', now);
  } else {
    db.prepare(`
      UPDATE users SET username = ?, first_name = ? WHERE user_id = ?
    `).run(username || existing.username, firstName || existing.first_name, userId);
  }
  return getUser(userId)!;
}

export function addTokens(userId: number, amount: number): void {
  db.prepare('UPDATE users SET tokens = MAX(0, COALESCE(tokens, 0) + ?) WHERE user_id = ?').run(amount, userId);
}

export function useTokens(userId: number, amount: number): boolean {
  if (amount <= 0) return true;
  const u = getUser(userId);
  if (!u || u.tokens < amount) return false;
  db.prepare('UPDATE users SET tokens = tokens - ? WHERE user_id = ?').run(amount, userId);
  return true;
}

export function incrementUserQueries(userId: number): void {
  db.prepare('UPDATE users SET total_queries = COALESCE(total_queries, 0) + 1 WHERE user_id = ?').run(userId);
}

export function setFirstStartRewarded(userId: number): void {
  db.prepare('UPDATE users SET first_start_rewarded = 1 WHERE user_id = ?').run(userId);
}

export function setDailyClaim(userId: number): void {
  const now = Math.floor(Date.now() / 1000);
  db.prepare('UPDATE users SET last_daily_claim = ? WHERE user_id = ?').run(now, userId);
}

export function setBanned(userId: number, banned: boolean): void {
  db.prepare('UPDATE users SET banned = ? WHERE user_id = ?').run(banned ? 1 : 0, userId);
}

export function registerReferral(referrerId: number, referredId: number): boolean {
  if (referrerId === referredId) return false;
  const existing = db.prepare('SELECT referred_id FROM referrals WHERE referred_id = ?').get(referredId);
  if (existing) return false;
  const now = Math.floor(Date.now() / 1000);
  db.prepare('INSERT INTO referrals (referrer_id, referred_id, rewarded, created_at) VALUES (?, ?, 1, ?)').run(
    referrerId,
    referredId,
    now
  );
  db.prepare(`
    UPDATE users
    SET tokens = COALESCE(tokens, 0) + 25,
        referral_count = COALESCE(referral_count, 0) + 1
    WHERE user_id = ?
  `).run(referrerId);
  db.prepare('UPDATE users SET referred_by = ? WHERE user_id = ?').run(referrerId, referredId);
  return true;
}

export function logQuery(entry: {
  source: 'telegram' | 'web';
  userId: number;
  username: string;
  service: string;
  query: string;
  status: 'ok' | 'empty' | 'error';
  recordsFound: number;
  durationMs: number;
}): void {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(`
    INSERT INTO query_logs (source, user_id, username, service, query, status, records_found, duration_ms, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.source,
    entry.userId,
    entry.username,
    entry.service,
    entry.query,
    entry.status,
    entry.recordsFound,
    entry.durationMs,
    now
  );
}

export function listUsers(limit = 50): BotUser[] {
  return db
    .prepare('SELECT * FROM users ORDER BY joined_at DESC LIMIT ?')
    .all(limit) as unknown as BotUser[];
}

export function listRecentLogs(limit = 40): QueryLog[] {
  return db
    .prepare('SELECT * FROM query_logs ORDER BY id DESC LIMIT ?')
    .all(limit) as unknown as QueryLog[];
}

export function getGlobalStats() {
  const totalUsers = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  const bannedUsers = (db.prepare('SELECT COUNT(*) as c FROM users WHERE banned = 1').get() as { c: number }).c;
  const totalTokens = (db.prepare('SELECT COALESCE(SUM(tokens), 0) as t FROM users').get() as { t: number }).t;
  const totalQueries = (db.prepare('SELECT COUNT(*) as c FROM query_logs').get() as { c: number }).c;
  const advQueries = (
    db
      .prepare("SELECT COUNT(*) as c FROM query_logs WHERE service IN ('number_adv', 'deep_osint', 'rhxvm_pro')")
      .get() as { c: number }
  ).c;
  return {
    totalUsers,
    bannedUsers,
    totalTokens,
    totalQueries,
    advQueries,
  };
}
