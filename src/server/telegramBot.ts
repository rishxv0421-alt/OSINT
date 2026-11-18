import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  runAadhaarImageOcr,
  runUpiOsintLookup,
  runUsernameToNumberRecon,
} from './advancedModules.ts';
import {
  addTokens,
  clearMediaCache,
  getCachedMediaFileId,
  getGlobalStats,
  getSetting,
  getUser,
  incrementUserQueries,
  listUsers,
  logQuery,
  registerReferral,
  setBanned,
  setCachedMediaFileId,
  setDailyClaim,
  setFirstStartRewarded,
  setSetting,
  upsertUser,
} from './db.ts';
import {
  cleanIndianNumber,
  CyberNumberDossier,
  formatDossierPlainText,
  runAdvancedNumberOsint,
  runGatewayPingTest,
  runInstagramOsint,
  runPhotoEditApi,
} from './osintEngine.ts';
import {
  listActiveWelcomeVideos,
  renderRisxavPromoVideo,
} from './videoPromoEngine.ts';

const DEFAULT_BOT_TOKEN = '8762163633:AAHnjq1QW_0_yj41jo2xT81m6Ks5RrstxhE';
const ADMIN_IDS = new Set<number>([Number(process.env.ADMIN_ID || 8158526050)]);

interface TgUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

interface TgPhotoSize {
  file_id: string;
  width: number;
  height: number;
  file_size?: number;
}

interface TgDocument {
  file_id: string;
  file_name?: string;
  mime_type?: string;
}

interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: { id: number; type: string };
  text?: string;
  caption?: string;
  photo?: TgPhotoSize[];
  document?: TgDocument;
  video?: { file_id: string };
}

interface TgCallbackQuery {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
}

interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

type AwaitingMode =
  | 'num_adv'
  | 'deep_osint'
  | 'upi_osint'
  | 'aadhaar_ocr'
  | 'username_num'
  | 'insta'
  | 'photo_lab'
  | 'bomber'
  | 'promo_video'
  | 'admin_intro'
  | 'admin_broadcast';

const awaitingState = new Map<number, AwaitingMode>();
const lastDossierCache = new Map<string, CyberNumberDossier>();

let botRunning = false;
let pollAbortController: AbortController | null = null;
let botIdentity: { id: number; first_name: string; username: string } | null = null;
let lastPollTimestamp = 0;
let lastBotError: string | null = null;
let processedUpdatesCount = 0;

function getBotToken(): string {
  return process.env.BOT_TOKEN || DEFAULT_BOT_TOKEN;
}

function tgApiUrl(method: string): string {
  return `https://api.telegram.org/bot${getBotToken()}/${method}`;
}

function tgFileDownloadUrl(filePath: string): string {
  return `https://api.telegram.org/file/bot${getBotToken()}/${filePath}`;
}

function esc(val: unknown): string {
  const s = val === null || val === undefined ? '' : String(val);
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isAdmin(userId: number): boolean {
  return ADMIN_IDS.has(userId);
}

// Clean Illuminati / Cyber-Occult Tab Grid — ONLY 100% Working Live Modules
export function replyTabGridKeyboard(userId: number) {
  const keyboard: Array<Array<{ text: string }>> = [
    [{ text: '👁️‍🗨️ Advance Number Info' }, { text: '🔺 RHXVM PRO OSINT' }],
    [{ text: '💠 UPI ID OSINT' }, { text: '🧿 Aadhaar Vision OCR' }],
    [{ text: '🔮 Username ➔ Number' }, { text: '🕯️ Instagram Recon' }],
    [{ text: '⚡ AI Photo Lab' }, { text: '🔱 Gateway Stress' }],
    [{ text: '⚜️ Operator Profile' }, { text: '💎 Daily Credits' }],
  ];
  if (isAdmin(userId)) {
    keyboard.push([{ text: '👑 RISXAV Admin Core' }]);
  }
  return {
    keyboard,
    resize_keyboard: true,
    is_persistent: true,
  };
}

function cancelInlineMarkup() {
  return {
    inline_keyboard: [[{ text: '🔺 Return to Illuminati Deck', callback_data: 'back_main' }]],
  };
}

function adminMarkup() {
  const forceJoinOn = getSetting('force_join', '0') === '1';
  const videoOn = getSetting('welcome_video_enabled', '1') === '1';
  return {
    inline_keyboard: [
      [
        { text: '👁️‍🗨️ Global Telemetry', callback_data: 'admin_stats' },
        { text: '⚜️ Recent Operators', callback_data: 'admin_users' },
      ],
      [
        { text: '✏️ Edit Welcome Message', callback_data: 'admin_edit_intro' },
        { text: '📢 Broadcast Alert', callback_data: 'admin_broadcast' },
      ],
      [
        { text: '🎬 Upload & Auto-Edit Video', callback_data: 'admin_upload_video' },
        { text: `🎬 Video: ${videoOn ? 'ON' : 'OFF'}`, callback_data: 'admin_toggle_video' },
      ],
      [
        { text: `🛡️ Force-Join: ${forceJoinOn ? 'ON' : 'OFF'}`, callback_data: 'admin_toggle_forcejoin' },
        { text: '🔺 Main Terminal', callback_data: 'back_main' },
      ],
    ],
  };
}

async function tgCall<T = unknown>(method: string, payload: Record<string, unknown> = {}): Promise<T | null> {
  try {
    const res = await fetch(tgApiUrl(method), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = (await res.json()) as { ok: boolean; result?: T };
    if (!json.ok) return null;
    return json.result ?? null;
  } catch {
    return null;
  }
}

async function downloadTelegramFileBuffer(fileId: string): Promise<Buffer | null> {
  try {
    const fileMeta = await tgCall<{ file_path?: string }>('getFile', { file_id: fileId });
    if (!fileMeta?.file_path) return null;
    const res = await fetch(tgFileDownloadUrl(fileMeta.file_path));
    if (!res.ok) return null;
    const arr = await res.arrayBuffer();
    return Buffer.from(arr);
  } catch {
    return null;
  }
}

async function sendText(
  chatId: number,
  text: string,
  replyMarkup?: Record<string, unknown>
): Promise<TgMessage | null> {
  return tgCall<TgMessage>('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

async function editText(
  chatId: number,
  messageId: number,
  text: string,
  replyMarkup?: Record<string, unknown>
): Promise<void> {
  await tgCall('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

async function sendDocumentBuffer(
  chatId: number,
  filename: string,
  content: string,
  caption: string,
  mimeType = 'text/plain'
): Promise<void> {
  try {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    form.append('caption', caption);
    form.append('parse_mode', 'HTML');
    const blob = new Blob([content], { type: mimeType });
    form.append('document', blob, filename);

    await fetch(tgApiUrl('sendDocument'), {
      method: 'POST',
      body: form,
    });
  } catch {
    // ignore upload failure
  }
}

async function sendWelcomeVideoWithCaption(
  chatId: number,
  captionHtml: string,
  replyMarkup: Record<string, unknown>
): Promise<boolean> {
  if (getSetting('welcome_video_enabled', '1') !== '1') {
    return false;
  }

  const activeVideos = listActiveWelcomeVideos();
  if (activeVideos.length === 0) {
    return false;
  }

  const mode = getSetting('welcome_video_mode', 'risxav_vertical_promo.mp4');
  const chosenFile =
    mode && mode !== 'random' && activeVideos.includes(mode)
      ? mode
      : activeVideos[Math.floor(Math.random() * activeVideos.length)];

  const cachedFileId = getCachedMediaFileId(chosenFile);
  if (cachedFileId) {
    const sent = await tgCall<TgMessage>('sendVideo', {
      chat_id: chatId,
      video: cachedFileId,
      caption: captionHtml,
      parse_mode: 'HTML',
      supports_streaming: true,
      reply_markup: replyMarkup,
    });
    if (sent) return true;
  }

  const videoPath = path.resolve(process.cwd(), 'public', 'welcome_videos', chosenFile);
  if (!fs.existsSync(videoPath)) {
    return false;
  }

  try {
    const fileBuf = fs.readFileSync(videoPath);
    const form = new FormData();
    form.append('chat_id', String(chatId));
    form.append('caption', captionHtml);
    form.append('parse_mode', 'HTML');
    form.append('supports_streaming', 'true');
    form.append('reply_markup', JSON.stringify(replyMarkup));
    form.append('video', new Blob([fileBuf], { type: 'video/mp4' }), chosenFile);

    const res = await fetch(tgApiUrl('sendVideo'), {
      method: 'POST',
      body: form,
    });
    const json = (await res.json()) as { ok: boolean; result?: TgMessage };
    if (json.ok && json.result) {
      if (json.result.video?.file_id) {
        setCachedMediaFileId(chosenFile, json.result.video.file_id);
      }
      return true;
    }
  } catch {
    // fallback to text
  }
  return false;
}

export function renderIntroMessage(
  user: { id: number; first_name: string; username?: string },
  tokens: number
): string {
  const template = getSetting('intro_msg');
  const owner = getSetting('owner_contact', '@RHXVM');
  const botHandle = botIdentity?.username ? `@${botIdentity.username}` : '@RISXAVHAXXKBOT';

  return template
    .replace(/\{name\}/g, esc(user.first_name || 'Operator'))
    .replace(/\{id\}/g, String(user.id))
    .replace(/\{username\}/g, esc(user.username ? `@${user.username}` : 'Operator'))
    .replace(/\{tokens\}/g, String(tokens))
    .replace(/\{owner\}/g, esc(owner))
    .replace(/\{bot\}/g, esc(botHandle));
}

function formatDossierTelegramHtml(dossier: CyberNumberDossier, includeDeepOsint: boolean): string {
  const lines: string[] = [];
  lines.push(`🔺 <b>RISXAV HAXKK !! — RHXVM PRO OSINT</b>`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`👁️‍🗨️ <b>Target:</b> <code>${esc(dossier.internationalFormat)}</code>`);
  lines.push(
    `📡 <b>Carrier Meta:</b> <code>${esc(dossier.carrierMeta.country)}</code> · <code>${esc(
      dossier.carrierMeta.type
    )}</code> · <code>${dossier.durationMs}ms</code>`
  );
  lines.push(`🗂️ <b>Matched Records:</b> <code>${dossier.advRecords.length}</code>`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);

  if (dossier.advRecords.length === 0) {
    lines.push(`⚠️ <i>No subscriber records returned for this target.</i>`);
  } else {
    const topRecords = dossier.advRecords.slice(0, 5);
    topRecords.forEach((rec, idx) => {
      lines.push(`\n🔺 <b>RECORD #${idx + 1}</b>`);
      lines.push(`├ ⚜️ <b>Name:</b> <code>${esc(rec.name)}</code>`);
      if (rec.fatherOrGuardian) {
        lines.push(`├ 🧬 <b>Father/Rel:</b> <code>${esc(rec.fatherOrGuardian)}</code>`);
      }
      if (rec.circle) {
        lines.push(`├ 📡 <b>Circle/Op:</b> <code>${esc(rec.circle)}</code>`);
      }
      if (rec.alternateNumber) {
        lines.push(`├ 📞 <b>Alt Mobile:</b> <code>${esc(rec.alternateNumber)}</code>`);
      }
      if (rec.email) {
        lines.push(`├ 📧 <b>Email:</b> <code>${esc(rec.email)}</code>`);
      }
      if (rec.documentId) {
        lines.push(`├ 🧿 <b>Doc/Ref ID:</b> <code>${esc(rec.documentId)}</code>`);
      }
      if (rec.address) {
        lines.push(`└ 📍 <b>Address:</b> <code>${esc(rec.address)}</code>`);
      }
    });
  }

  if (includeDeepOsint) {
    lines.push(`\n━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`👁️‍🗨️ <b>RHXVM PRO OSINT FOOTPRINT</b>`);
    const waStatus =
      dossier.socialPresence.whatsapp.reachable === true
        ? 'Active Endpoint'
        : dossier.socialPresence.whatsapp.reachable === false
        ? 'Unregistered'
        : 'Direct Link Ready';
    lines.push(
      `├ 💬 <b>WhatsApp:</b> <a href="${dossier.socialPresence.whatsapp.chatUrl}">${waStatus} (wa.me)</a>`
    );
    lines.push(
      `├ ✈️ <b>Telegram:</b> <a href="${dossier.socialPresence.telegramUrl}">Open t.me/+91${esc(dossier.clean10Digit)}</a>`
    );
    if (dossier.socialPresence.truecallerWeb.found && dossier.socialPresence.truecallerWeb.name) {
      lines.push(`├ 🔍 <b>Truecaller Web:</b> <code>${esc(dossier.socialPresence.truecallerWeb.name)}</code>`);
    } else {
      lines.push(
        `├ 🔍 <b>Truecaller Web:</b> <a href="${dossier.socialPresence.truecallerWeb.searchUrl}">Directory Lookup</a>`
      );
    }
    const topDorks = dossier.dorks.slice(0, 4);
    const dorkLinks = topDorks.map((d) => `<a href="${d.url}">${esc(d.label)}</a>`).join(' · ');
    lines.push(`└ 🔎 <b>OSINT Dorks:</b> ${dorkLinks}`);
  }

  lines.push(`\n👑 <i>RISXAV HAXKK !! — RHXVM PRO OSINT</i>`);
  const result = lines.join('\n');
  return result.length > 3950 ? result.slice(0, 3950) + '\n...' : result;
}

function dossierActionMarkup(clean10: string, deepShown: boolean) {
  const buttons: Array<Array<Record<string, unknown>>> = [];
  if (!deepShown) {
    buttons.push([{ text: '🔺 Expand Full OSINT Footprint', callback_data: `osint_${clean10}` }]);
  }
  buttons.push([
    { text: '📄 Download .TXT', callback_data: `txt_${clean10}` },
    { text: '💠 Scan UPI VPAs', callback_data: `upi_${clean10}` },
  ]);
  return { inline_keyboard: buttons };
}

async function executeTelegramNumberLookup(
  chatId: number,
  user: TgUser,
  rawQuery: string,
  deepMode: boolean
): Promise<void> {
  const clean10 = cleanIndianNumber(rawQuery);
  if (clean10.length !== 10) {
    await sendText(
      chatId,
      `⚠️ <b>Invalid Number Format</b>\nSend a valid 10-digit mobile number (e.g. <code>9876543210</code>).`
    );
    return;
  }

  const waitMsg = await sendText(
    chatId,
    `👁️‍🗨️ <b>RISXAV HAXKK !! — Scanning Telecom & OSINT Matrix...</b>\n🎯 Target: <code>+91 ${clean10}</code>`
  );

  const dossier = await runAdvancedNumberOsint(clean10);
  lastDossierCache.set(clean10, dossier);

  incrementUserQueries(user.id);
  logQuery({
    source: 'telegram',
    userId: user.id,
    username: user.username || user.first_name || String(user.id),
    service: deepMode ? 'rhxvm_pro' : 'number_adv',
    query: clean10,
    status: dossier.apiSourceStatus === 'live' ? 'ok' : dossier.apiSourceStatus,
    recordsFound: dossier.advRecords.length,
    durationMs: dossier.durationMs,
  });

  const htmlReport = formatDossierTelegramHtml(dossier, deepMode);
  if (waitMsg) {
    await editText(chatId, waitMsg.message_id, htmlReport, dossierActionMarkup(clean10, deepMode));
  } else {
    await sendText(chatId, htmlReport, dossierActionMarkup(clean10, deepMode));
  }

  if (dossier.advRecords.length > 0) {
    const ts = Math.floor(Date.now() / 1000);
    await sendDocumentBuffer(
      chatId,
      `advance_number_info_+91${clean10}_${ts}.txt`,
      formatDossierPlainText(dossier),
      `📄 <b>Advance Number Info</b> result for <code>+91${clean10}</code>\n👑 <i>RISXAV HAXKK !! — RHXVM PRO OSINT</i>`,
      'text/plain'
    );
  }
}

async function executeTelegramUpiLookup(chatId: number, user: TgUser, rawInput: string): Promise<void> {
  const wait = await sendText(
    chatId,
    `💠 <b>RISXAV HAXKK !! — Enumerating 35-Handle NPCI UPI Taxonomy...</b>\n🎯 Query: <code>${esc(rawInput)}</code>`
  );

  const dossier = await runUpiOsintLookup(rawInput);
  incrementUserQueries(user.id);
  logQuery({
    source: 'telegram',
    userId: user.id,
    username: user.username || user.first_name || String(user.id),
    service: 'upi_osint',
    query: dossier.query,
    status: 'ok',
    recordsFound: dossier.vpaCandidates.length,
    durationMs: dossier.durationMs,
  });

  const lines: string[] = [
    `💠 <b>UPI ID OSINT — NPCI VPA & BANK MATRIX</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `🎯 <b>Input:</b> <code>${esc(dossier.query)}</code> (${dossier.inputType.toUpperCase()})`,
  ];

  if (dossier.subscriberCorrelatedName) {
    lines.push(`⚜️ <b>Correlated Holder:</b> <code>${esc(dossier.subscriberCorrelatedName)}</code>`);
  }
  if (dossier.subscriberCircle) {
    lines.push(`📡 <b>Telecom Circle:</b> <code>${esc(dossier.subscriberCircle)}</code>`);
  }
  lines.push(`⏱️ <b>Latency:</b> <code>${dossier.durationMs}ms</code>`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`🏦 <b>Mapped NPCI VPA Handles (Top 12):</b>`);

  for (const c of dossier.vpaCandidates.slice(0, 12)) {
    const stateTag =
      c.verifiedStatus === 'verified_active'
        ? '✅ ACTIVE'
        : c.verifiedStatus === 'verified_inactive'
        ? '❌ INACTIVE'
        : '🔹 MAPPED';
    lines.push(
      `• <code>${esc(c.vpa)}</code> — <b>${esc(c.psp)}</b> (${esc(c.bank)}) [${stateTag}]`
    );
  }

  if (dossier.dorks.length > 0) {
    const dlinks = dossier.dorks.map((d) => `<a href="${d.url}">${esc(d.label)}</a>`).join(' · ');
    lines.push(`\n🔎 <b>UPI Dorks:</b> ${dlinks}`);
  }
  lines.push(`\n👑 <i>RISXAV HAXKK !! — RHXVM PRO OSINT</i>`);

  if (wait) {
    await editText(chatId, wait.message_id, lines.join('\n').slice(0, 3950));
  } else {
    await sendText(chatId, lines.join('\n').slice(0, 3950));
  }
}

async function executeTelegramUsernameRecon(chatId: number, user: TgUser, rawHandle: string): Promise<void> {
  const wait = await sendText(
    chatId,
    `🔮 <b>RISXAV HAXKK !! — Resolving Username & Prefix Matrix...</b>\n🎯 Handle: <code>${esc(rawHandle)}</code>`
  );

  const recon = await runUsernameToNumberRecon(rawHandle);
  incrementUserQueries(user.id);
  logQuery({
    source: 'telegram',
    userId: user.id,
    username: user.username || user.first_name || String(user.id),
    service: 'username_num',
    query: `@${recon.handle}`,
    status: recon.liveTelegramProfile.exists ? 'ok' : 'empty',
    recordsFound: recon.extractedPhonesFromBio.length + 1,
    durationMs: recon.durationMs,
  });

  const lines: string[] = [
    `🔮 <b>USERNAME ➔ NUMBER & PROFILE RECON</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `🎯 <b>Handle:</b> <code>@${esc(recon.handle)}</code>`,
    `📡 <b>Telegram Profile:</b> ${
      recon.liveTelegramProfile.exists ? '✅ Active on Telegram' : '⚠️ Unclaimed / Private'
    }`,
  ];

  if (recon.liveTelegramProfile.displayName) {
    lines.push(`⚜️ <b>Display Name:</b> <code>${esc(recon.liveTelegramProfile.displayName)}</code>`);
  }
  if (recon.liveTelegramProfile.membersOrSubscribers) {
    lines.push(`👥 <b>Meta:</b> <code>${esc(recon.liveTelegramProfile.membersOrSubscribers)}</code>`);
  }
  if (recon.liveTelegramProfile.bio) {
    lines.push(`📝 <b>Bio:</b> <i>${esc(recon.liveTelegramProfile.bio.slice(0, 220))}</i>`);
  }

  if (recon.extractedPhonesFromBio.length > 0) {
    lines.push(`\n📞 <b>Extracted Bio Phone(s):</b> <code>${esc(recon.extractedPhonesFromBio.join(', '))}</code>`);
  }

  lines.push(`\n🧬 <b>Weighted Carrier Prefix Candidates:</b>`);
  for (const row of recon.prefixGeneratorMatrix) {
    lines.push(`• <b>${esc(row.country)}:</b> <code>${esc(row.sampleGenerated.slice(0, 2).join(', '))}</code>`);
  }

  const dlinks = recon.dorks.map((d) => `<a href="${d.url}">${esc(d.label)}</a>`).join(' · ');
  lines.push(`\n🔎 <b>Leak & Phone Dorks:</b> ${dlinks}`);
  lines.push(`\n👑 <i>RISXAV HAXKK !! — RHXVM PRO OSINT</i>`);

  if (wait) {
    await editText(chatId, wait.message_id, lines.join('\n').slice(0, 3950));
  } else {
    await sendText(chatId, lines.join('\n').slice(0, 3950));
  }
}

async function executeTelegramAadhaarOcr(chatId: number, user: TgUser, imageSource: Buffer | string): Promise<void> {
  const wait = await sendText(
    chatId,
    `🧿 <b>RISXAV HAXKK !! — Running Vision OCR & Verhoeff UID Extraction...</b>\n⏳ Reading card fields (Name, DOB, Gender, UID, Mobile, Address)...`
  );

  const ocr = await runAadhaarImageOcr(imageSource);
  incrementUserQueries(user.id);
  logQuery({
    source: 'telegram',
    userId: user.id,
    username: user.username || user.first_name || String(user.id),
    service: 'aadhaar_ocr',
    query: ocr.extractedAadhaar || 'Card Image',
    status: ocr.ok ? 'ok' : 'error',
    recordsFound: ocr.extractedAadhaar ? 1 : 0,
    durationMs: ocr.durationMs,
  });

  if (!ocr.ok) {
    if (wait) {
      await editText(chatId, wait.message_id, `❌ <b>OCR Error:</b> ${esc(ocr.error || 'Could not parse image')}`);
    }
    return;
  }

  const lines: string[] = [
    `🧿 <b>AADHAAR VISION OCR REPORT</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `⚜️ <b>Holder Name:</b> <code>${esc(ocr.extractedName || 'Not detected')}</code>`,
    `📅 <b>DOB / YOB:</b> <code>${esc(ocr.extractedDob || 'Not detected')}</code>`,
    `⚧️ <b>Gender:</b> <code>${esc(ocr.extractedGender || 'Not detected')}</code>`,
    `🆔 <b>Aadhaar UID:</b> <code>${esc(ocr.extractedAadhaar || 'Not detected')}</code>`,
    `🛡️ <b>Verhoeff Checksum:</b> <code>${
      ocr.extractedAadhaar ? (ocr.aadhaarChecksumValid ? 'VALID UID' : 'CHECKSUM MISMATCH') : 'N/A'
    }</code>`,
    `📞 <b>Mobile No:</b> <code>${esc(ocr.extractedMobile || 'Not printed on side')}</code>`,
  ];

  if (ocr.extractedAddress) {
    lines.push(`📍 <b>Address:</b> <code>${esc(ocr.extractedAddress)}</code>`);
  }
  lines.push(`🎯 <b>OCR Confidence:</b> <code>${ocr.confidence}%</code> · <code>${ocr.durationMs}ms</code>`);
  lines.push(`\n👑 <i>RISXAV HAXKK !! — RHXVM PRO OSINT</i>`);

  if (wait) {
    await editText(chatId, wait.message_id, lines.join('\n').slice(0, 3950));
  } else {
    await sendText(chatId, lines.join('\n').slice(0, 3950));
  }

  const jsonPayload = JSON.stringify(ocr, null, 2);
  await sendDocumentBuffer(
    chatId,
    `aadhaar_ocr_${Math.floor(Date.now() / 1000)}.json`,
    jsonPayload,
    `🧿 Full Structured Aadhaar OCR JSON — <b>RISXAV HAXKK !!</b>`,
    'application/json'
  );
}

async function handleReplyButtonTrigger(chatId: number, user: TgUser, text: string): Promise<boolean> {
  const t = text.trim();

  if (t === '👁️‍🗨️ Advance Number Info') {
    awaitingState.set(user.id, 'num_adv');
    await sendText(
      chatId,
      `👁️‍🗨️ <b>Advance Number Info — RHXVM PRO OSINT</b>\n\nSend any <b>10-digit mobile number</b> to extract full subscriber identity records + downloadable TXT dossier:\n<i>Example: 9876543210</i>`
    );
    return true;
  }

  if (t === '🔺 RHXVM PRO OSINT') {
    awaitingState.set(user.id, 'deep_osint');
    await sendText(
      chatId,
      `🔺 <b>RHXVM PRO OSINT — Deep Multi-Node Matrix</b>\n\nSend a <b>10-digit mobile number</b> for full Subscriber Records + WhatsApp Endpoint + Truecaller Index + Google Dorks + TXT Report:`
    );
    return true;
  }

  if (t === '💠 UPI ID OSINT') {
    awaitingState.set(user.id, 'upi_osint');
    await sendText(
      chatId,
      `💠 <b>UPI ID OSINT — 35-Handle NPCI Scanner</b>\n\nSend either:\n• A <b>10-digit mobile number</b> (e.g. <code>9876543210</code>) to map PhonePe, GPay, Paytm, BHIM & Amazon Pay VPAs\n• Or a direct <b>UPI ID</b> (e.g. <code>9876543210@ybl</code>):`
    );
    return true;
  }

  if (t === '🧿 Aadhaar Vision OCR') {
    awaitingState.set(user.id, 'aadhaar_ocr');
    await sendText(
      chatId,
      `🧿 <b>Aadhaar Card Vision OCR</b>\n\nUpload a <b>Photo / Image</b> of an Aadhaar Card (Front or Back) directly in this chat, or send a direct <code>https://</code> image URL to extract Name, DOB, Gender, 12-Digit UID & Address:`
    );
    return true;
  }

  if (t === '🔮 Username ➔ Number') {
    awaitingState.set(user.id, 'username_num');
    await sendText(
      chatId,
      `🔮 <b>Username ➔ Number & Profile Recon</b>\n\nSend any Telegram <code>@username</code> (or <code>t.me/username</code>) to inspect live profile metadata, extract bio phone numbers, and generate weighted carrier prefix candidates:`
    );
    return true;
  }

  if (t === '🕯️ Instagram Recon') {
    awaitingState.set(user.id, 'insta');
    await sendText(
      chatId,
      `🕯️ <b>Instagram OSINT Recon</b>\n\nSend the target Instagram <code>@username</code> to extract account intelligence:`
    );
    return true;
  }

  if (t === '⚡ AI Photo Lab') {
    awaitingState.set(user.id, 'photo_lab');
    await sendText(
      chatId,
      `⚡ <b>RISXAV AI Photo Lab</b>\n\nSend a direct <code>https://</code> image URL to process:`
    );
    return true;
  }

  if (t === '🔱 Gateway Stress') {
    awaitingState.set(user.id, 'bomber');
    await sendText(
      chatId,
      `🔱 <b>OTP Gateway Stress Diagnostics</b>\n\nSend a <b>10-digit mobile number</b> to run multi-gateway stress diagnostics:`
    );
    return true;
  }

  if (t === '⚜️ Operator Profile') {
    const dbU = getUser(user.id)!;
    const global = getGlobalStats();
    const handle = botIdentity?.username || 'RISXAVHAXXKBOT';
    await sendText(
      chatId,
      `⚜️ <b>ILLUMINATI OPERATOR DOSSIER</b>\n━━━━━━━━━━━━━━━━━━━━━━\n🆔 <b>Agent ID:</b> <code>${user.id}</code>\n👤 <b>Handle:</b> <code>${esc(
        user.first_name
      )}</code>\n💎 <b>Credits:</b> <code>${dbU.tokens}</code>\n🔎 <b>Scans Executed:</b> <code>${
        dbU.total_queries
      }</code>\n🎁 <b>Recruited Agents:</b> <code>${dbU.referral_count}</code>\n🌐 <b>Active Order:</b> <code>${
        global.totalUsers
      } Operators</code>\n\n🔗 <b>Recruit Link (+25 Cr):</b>\n<code>https://t.me/${handle}?start=${user.id}</code>`
    );
    return true;
  }

  if (t === '💎 Daily Credits') {
    const dbU = getUser(user.id)!;
    const now = Math.floor(Date.now() / 1000);
    const elapsed = now - (dbU.last_daily_claim || 0);
    if (dbU.last_daily_claim && elapsed < 86400) {
      const remHrs = Math.ceil((86400 - elapsed) / 3600);
      await sendText(chatId, `⏳ <b>Cooldown Active:</b> Next daily supply unlocks in <code>${remHrs}h</code>.`);
      return true;
    }
    const reward = 30;
    addTokens(user.id, reward);
    setDailyClaim(user.id);
    const updated = getUser(user.id)!;
    await sendText(
      chatId,
      `💎 <b>Daily Cyber Credits Claimed!</b>\n➕ Earned: <code>+${reward} Credits</code>\n⚜️ Balance: <code>${updated.tokens} Credits</code>`
    );
    return true;
  }

  if (t === '👑 RISXAV Admin Core' && isAdmin(user.id)) {
    await sendText(chatId, `👑 <b>RISXAV HAXKK !! — Supreme Admin Core</b>`, adminMarkup());
    return true;
  }

  return false;
}

async function handleIncomingMessage(msg: TgMessage): Promise<void> {
  const user = msg.from;
  if (!user) return;
  const chatId = msg.chat.id;

  const dbUser = upsertUser(user.id, user.username || '', user.first_name || '');
  if (dbUser.banned && !isAdmin(user.id)) {
    await sendText(chatId, '🚫 <b>Access Suspended</b>');
    return;
  }

  // Handle Uploaded Video (MP4) -> Burn RISXAV HAXKK !! + @RISXAVHAXXKBOT + @RHXVM Holographic HUD!
  const incomingVideoFileId =
    msg.video?.file_id ||
    (msg.document && msg.document.mime_type?.startsWith('video/') ? msg.document.file_id : null);

  if (incomingVideoFileId) {
    const prevMode = awaitingState.get(user.id);
    awaitingState.delete(user.id);
    const capLower = (msg.caption || '').toLowerCase();
    const wait = await sendText(
      chatId,
      `🎬 <b>RISXAV HAXKK !! — Rendering Holographic Promo Edit...</b>\n` +
        `🤖 Bot: <code>@RISXAVHAXXKBOT</code> · 👑 Owner: <code>@RHXVM</code>\n` +
        `⏳ Compositing 6 OSINT Feature Cards + Audio...`
    );

    const buf = await downloadTelegramFileBuffer(incomingVideoFileId);
    if (!buf) {
      if (wait) {
        await editText(
          chatId,
          wait.message_id,
          `⚠️ Telegram Bot API limits direct downloads to 20MB. For larger 100MB+ edits, upload your MP4 inside the <b>Welcome & Bot Studio</b> web panel!`
        );
      }
      return;
    }

    const tmpIn = path.join(os.tmpdir(), `tg_in_${Date.now()}.mp4`);
    fs.writeFileSync(tmpIn, buf);
    try {
      const outName = `risxav_custom_${Date.now()}.mp4`;
      const rendered = await renderRisxavPromoVideo({
        inputVideoPath: tmpIn,
        outputFilename: outName,
        botHandle: botIdentity?.username ? `@${botIdentity.username}` : '@RISXAVHAXXKBOT',
        ownerHandle: getSetting('owner_contact', '@RHXVM'),
        theme: capLower.includes('crimson') || capLower.includes('sukuna') ? 'sukuna_crimson' : 'hologram_cyan',
        aspect: capLower.includes('vertical') ? 'vertical' : 'auto',
        durationMode: capLower.includes('full') ? 'full' : 'welcome_12s',
      });

      const shouldSetWelcome =
        isAdmin(user.id) || prevMode === 'promo_video' || capLower.includes('welcome');
      if (shouldSetWelcome) {
        clearMediaCache(rendered.filename);
        setSetting('welcome_video_mode', rendered.filename);
        setSetting('welcome_video_enabled', '1');
      }

      const outBuf = fs.readFileSync(rendered.outputPath);
      const form = new FormData();
      form.append('chat_id', String(chatId));
      form.append(
        'caption',
        `🔺 <b>RISXAV HAXKK !! — Custom Promo Video Ready</b>\n` +
          `🤖 <b>Bot:</b> @${botIdentity?.username || 'RISXAVHAXXKBOT'}\n` +
          `👑 <b>Owner:</b> ${esc(getSetting('owner_contact', '@RHXVM'))}` +
          (shouldSetWelcome ? `\n✅ <i>Locked as active /start Welcome Video!</i>` : '')
      );
      form.append('parse_mode', 'HTML');
      form.append('supports_streaming', 'true');
      form.append('video', new Blob([outBuf], { type: 'video/mp4' }), rendered.filename);

      const sentRes = await fetch(tgApiUrl('sendVideo'), { method: 'POST', body: form });
      const sentJson = (await sentRes.json()) as { ok: boolean; result?: TgMessage };
      if (sentJson.ok && sentJson.result?.video?.file_id) {
        setCachedMediaFileId(rendered.filename, sentJson.result.video.file_id);
      }
      if (wait) {
        await editText(chatId, wait.message_id, `✅ <b>Holographic Promo Video Rendered (${rendered.durationSec.toFixed(1)}s)!</b>`);
      }
    } catch {
      if (wait) {
        await editText(chatId, wait.message_id, `❌ Failed to composite video.`);
      }
    } finally {
      fs.rmSync(tmpIn, { force: true });
    }
    return;
  }

  // Handle Photo or Image Document directly for Aadhaar Vision OCR!
  if (msg.photo && msg.photo.length > 0) {
    awaitingState.delete(user.id);
    const largestPhoto = msg.photo[msg.photo.length - 1];
    const buf = await downloadTelegramFileBuffer(largestPhoto.file_id);
    if (!buf) {
      await sendText(chatId, `❌ Failed to download photo from Telegram servers.`);
      return;
    }
    await executeTelegramAadhaarOcr(chatId, user, buf);
    return;
  }

  if (msg.document && msg.document.mime_type?.startsWith('image/')) {
    awaitingState.delete(user.id);
    const buf = await downloadTelegramFileBuffer(msg.document.file_id);
    if (!buf) {
      await sendText(chatId, `❌ Failed to download image document.`);
      return;
    }
    await executeTelegramAadhaarOcr(chatId, user, buf);
    return;
  }

  const text = (msg.text || msg.caption || '').trim();
  if (!text) return;

  // 1. Check Clean Illuminati Tab Buttons
  if (await handleReplyButtonTrigger(chatId, user, text)) {
    return;
  }

  // 2. Slash Commands
  if (text.startsWith('/')) {
    awaitingState.delete(user.id);
    const parts = text.split(/\s+/);
    const cmd = parts[0].toLowerCase().split('@')[0];
    const args = parts.slice(1);

    if (cmd === '/start') {
      if (args[0]) {
        const refId = Number(args[0]);
        if (!Number.isNaN(refId) && refId !== user.id) {
          if (registerReferral(refId, user.id)) {
            await sendText(
              refId,
              `🔺 <b>New Operator Initiated!</b>\nYou earned <code>+25</code> credits in <b>RISXAV HAXKK !!</b>`
            );
          }
        }
      }

      let freshUser = getUser(user.id)!;
      if (!freshUser.first_start_rewarded) {
        addTokens(user.id, 25);
        setFirstStartRewarded(user.id);
        freshUser = getUser(user.id)!;
      }

      const introHtml = renderIntroMessage(user, freshUser.tokens);
      const replyKb = replyTabGridKeyboard(user.id);

      const sentVideo = await sendWelcomeVideoWithCaption(chatId, introHtml, replyKb);
      if (!sentVideo) {
        await sendText(chatId, introHtml, replyKb);
      }
      return;
    }

    if (cmd === '/num' || cmd === '/osint') {
      if (!args[0]) {
        awaitingState.set(user.id, 'deep_osint');
        await sendText(chatId, `👁️‍🗨️ Send a <b>10-digit mobile number</b> for RHXVM PRO OSINT lookup:`);
        return;
      }
      await executeTelegramNumberLookup(chatId, user, args.join(''), true);
      return;
    }

    if (cmd === '/upi') {
      if (!args[0]) {
        awaitingState.set(user.id, 'upi_osint');
        await sendText(chatId, `💠 Send a <b>10-digit number</b> or <b>UPI VPA</b> (e.g. <code>9876543210@ybl</code>):`);
        return;
      }
      await executeTelegramUpiLookup(chatId, user, args.join(''));
      return;
    }

    if (cmd === '/user' || cmd === '/username') {
      if (!args[0]) {
        awaitingState.set(user.id, 'username_num');
        await sendText(chatId, `🔮 Send a Telegram <code>@username</code> to scan:`);
        return;
      }
      await executeTelegramUsernameRecon(chatId, user, args[0]);
      return;
    }

    if (cmd === '/ocr') {
      awaitingState.set(user.id, 'aadhaar_ocr');
      await sendText(chatId, `🧿 Send a <b>Photo</b> of an Aadhaar card to extract Name, DOB, UID & Address:`);
      return;
    }

    if (cmd === '/editvideo') {
      awaitingState.set(user.id, 'promo_video');
      await sendText(
        chatId,
        `🎬 <b>RISXAV Promo Video Studio</b>\nSend any <b>MP4 Anime / Edit Video</b> (up to 20MB on Telegram, or 120MB on Web) and I will burn the holographic <code>@RISXAVHAXXKBOT</code> + <code>Owner: @RHXVM</code> + 6 OSINT Features HUD onto it!\n<i>Tip: Add caption <code>crimson full</code> for Sukuna Crimson full-length mode.</i>`
      );
      return;
    }

    if (cmd === '/admin' && isAdmin(user.id)) {
      await sendText(chatId, `👑 <b>RISXAV HAXKK !! — Admin Core</b>`, adminMarkup());
      return;
    }

    if (cmd === '/help') {
      await sendText(
        chatId,
        `🔺 <b>RISXAV HAXKK !! — ILLUMINATI COMMAND MATRIX</b>\n\n` +
          `• <code>/num 9876543210</code> — Advance Number Info + TXT\n` +
          `• <code>/upi 9876543210</code> — 35-Handle UPI ID OSINT\n` +
          `• <code>/user @username</code> — Username ➔ Number Recon\n` +
          `• <code>/ocr</code> — Send Aadhaar Photo for Vision OCR\n\n` +
          `<i>Or tap any module in the Illuminati Tab Deck below!</i>`,
        replyTabGridKeyboard(user.id)
      );
      return;
    }
  }

  // 3. Handle Awaiting Module State
  const mode = awaitingState.get(user.id);
  if (mode) {
    awaitingState.delete(user.id);

    if (mode === 'num_adv' || mode === 'deep_osint') {
      await executeTelegramNumberLookup(chatId, user, text, true);
      return;
    }

    if (mode === 'upi_osint') {
      await executeTelegramUpiLookup(chatId, user, text);
      return;
    }

    if (mode === 'username_num') {
      await executeTelegramUsernameRecon(chatId, user, text);
      return;
    }

    if (mode === 'aadhaar_ocr') {
      if (text.startsWith('http')) {
        await executeTelegramAadhaarOcr(chatId, user, text);
      } else {
        await sendText(chatId, `🧿 Please upload a <b>Photo</b> of the card or send a valid <code>https://</code> image URL.`);
      }
      return;
    }

    if (mode === 'insta') {
      const wait = await sendText(chatId, `🕯️ <b>Scanning Instagram Handle...</b>`);
      const res = await runInstagramOsint(text);
      if (!res.ok || !res.data) {
        if (wait) await editText(chatId, wait.message_id, `❌ Lookup failed: ${esc(res.error || 'Unavailable')}`);
        return;
      }
      const pretty = JSON.stringify(res.data, null, 2);
      if (wait) {
        await editText(
          chatId,
          wait.message_id,
          `🕯️ <b>Instagram Recon: @${esc(res.username)}</b>\n\n<pre>${esc(pretty.slice(0, 3200))}</pre>`
        );
      }
      return;
    }

    if (mode === 'photo_lab') {
      const wait = await sendText(chatId, `⚡ <b>Processing Image...</b>`);
      const res = await runPhotoEditApi(text);
      if (wait) {
        await editText(
          chatId,
          wait.message_id,
          res.ok && res.editedUrl
            ? `⚡ <b>AI Photo Output Ready:</b>\n<code>${esc(res.editedUrl)}</code>`
            : `❌ Could not process image URL.`
        );
      }
      return;
    }

    if (mode === 'bomber') {
      const clean10 = cleanIndianNumber(text);
      if (clean10.length !== 10) {
        await sendText(chatId, `⚠️ Enter a valid 10-digit number.`);
        return;
      }
      const wait = await sendText(chatId, `🔱 <b>Running Gateway Stress Diagnostics on +91${clean10}...</b>`);
      const res = await runGatewayPingTest(clean10);
      if (wait) {
        await editText(
          chatId,
          wait.message_id,
          `🔱 <b>Gateway Stress Cycle Complete</b>\n🎯 Target: <code>+91${clean10}</code>\n✅ OK: <code>${res.success}</code> | ❌ Failed: <code>${res.failed}</code> | 📊 Rate: <code>${res.successRate}%</code>\n👑 <i>RISXAV HAXKK !!</i>`
        );
      }
      return;
    }

    if (mode === 'admin_intro' && isAdmin(user.id)) {
      setSetting('intro_msg', text);
      await sendText(chatId, `✅ <b>Welcome Message Updated!</b> Send /start to preview.`, adminMarkup());
      return;
    }

    if (mode === 'admin_broadcast' && isAdmin(user.id)) {
      const result = await broadcastToAllUsers(text);
      await sendText(
        chatId,
        `📢 <b>Broadcast Complete</b>\n✅ Sent: <code>${result.sent}</code> | ❌ Failed: <code>${result.failed}</code>`,
        adminMarkup()
      );
      return;
    }
  }

  // 4. Smart Auto-Detection (UPI VPA, @username, or 10-digit Phone)
  if (/^[a-z0-9._-]{2,256}@[a-z][a-z0-9]{1,63}$/i.test(text)) {
    await executeTelegramUpiLookup(chatId, user, text);
    return;
  }

  if (text.startsWith('@') && text.length > 3 && !text.includes(' ')) {
    await executeTelegramUsernameRecon(chatId, user, text);
    return;
  }

  const cleaned = cleanIndianNumber(text);
  if (cleaned.length === 10 && /^\d{10}$/.test(cleaned)) {
    await executeTelegramNumberLookup(chatId, user, cleaned, true);
    return;
  }

  await sendText(
    chatId,
    `🔺 <b>RISXAV HAXKK !! — RHXVM PRO OSINT</b>\nSelect a live module from the Illuminati Tab Deck below, send a <b>10-digit number</b>, a <b>UPI ID</b>, a <b>@username</b>, or upload an <b>Aadhaar Photo</b>:`,
    replyTabGridKeyboard(user.id)
  );
}

async function handleCallback(cb: TgCallbackQuery): Promise<void> {
  const user = cb.from;
  const data = cb.data || '';
  const chatId = cb.message?.chat.id || user.id;
  const msgId = cb.message?.message_id;

  await tgCall('answerCallbackQuery', { callback_query_id: cb.id });
  const dbUser = upsertUser(user.id, user.username || '', user.first_name || '');

  if (data === 'back_main') {
    awaitingState.delete(user.id);
    await sendText(chatId, renderIntroMessage(user, dbUser.tokens), replyTabGridKeyboard(user.id));
    return;
  }

  if (data.startsWith('osint_')) {
    const clean10 = data.replace('osint_', '');
    const dossier = lastDossierCache.get(clean10) || (await runAdvancedNumberOsint(clean10));
    lastDossierCache.set(clean10, dossier);
    if (msgId) {
      await editText(chatId, msgId, formatDossierTelegramHtml(dossier, true), dossierActionMarkup(clean10, true));
    }
    return;
  }

  if (data.startsWith('upi_')) {
    const clean10 = data.replace('upi_', '');
    await executeTelegramUpiLookup(chatId, user, clean10);
    return;
  }

  if (data.startsWith('txt_')) {
    const clean10 = data.replace('txt_', '');
    const dossier = lastDossierCache.get(clean10) || (await runAdvancedNumberOsint(clean10));
    lastDossierCache.set(clean10, dossier);
    const ts = Math.floor(Date.now() / 1000);
    await sendDocumentBuffer(
      chatId,
      `advance_number_info_+91${clean10}_${ts}.txt`,
      formatDossierPlainText(dossier),
      `📄 <b>Advance Number Info</b> result for <code>+91${clean10}</code>`,
      'text/plain'
    );
    return;
  }

  if (data.startsWith('admin_') && isAdmin(user.id)) {
    if (data === 'admin_panel') {
      if (msgId) await editText(chatId, msgId, `👑 <b>RISXAV HAXKK !! — Admin Core</b>`, adminMarkup());
      return;
    }
    if (data === 'admin_stats') {
      const st = getGlobalStats();
      if (msgId) {
        await editText(
          chatId,
          msgId,
          `👁️‍🗨️ <b>RISXAV HAXKK !! TELEMETRY</b>\n⚜️ Operators: <code>${st.totalUsers}</code>\n💎 Credits: <code>${st.totalTokens}</code>\n🔎 Total Scans: <code>${st.totalQueries}</code>`,
          adminMarkup()
        );
      }
      return;
    }
    if (data === 'admin_users') {
      const users = listUsers(15);
      const list = users
        .map((u) => `• <code>${u.user_id}</code> — ${esc(u.first_name || 'Operator')} (${u.tokens} cr)`)
        .join('\n');
      if (msgId) await editText(chatId, msgId, `⚜️ <b>Recent Operators</b>\n\n${list || 'None'}`, adminMarkup());
      return;
    }
    if (data === 'admin_edit_intro') {
      awaitingState.set(user.id, 'admin_intro');
      await sendText(
        chatId,
        `✏️ Send new Welcome Message HTML template (supports <code>{name}</code>, <code>{id}</code>, <code>{tokens}</code>, <code>{bot}</code>):`,
        cancelInlineMarkup()
      );
      return;
    }
    if (data === 'admin_broadcast') {
      awaitingState.set(user.id, 'admin_broadcast');
      await sendText(chatId, `📢 Send announcement text to broadcast to all operators:`, cancelInlineMarkup());
      return;
    }
    if (data === 'admin_upload_video') {
      awaitingState.set(user.id, 'promo_video');
      await sendText(
        chatId,
        `🎬 Send any <b>MP4 Video</b> now — it will be edited with the <b>RISXAV HAXKK !!</b> (<code>@RISXAVHAXXKBOT</code> · <code>@RHXVM</code>) holographic feature showcase and set as your live <code>/start</code> video:`,
        cancelInlineMarkup()
      );
      return;
    }
    if (data === 'admin_toggle_video') {
      const cur = getSetting('welcome_video_enabled', '1') === '1';
      setSetting('welcome_video_enabled', cur ? '0' : '1');
      if (msgId) await editText(chatId, msgId, `🎬 Welcome Video is now <b>${cur ? 'OFF' : 'ON'}</b>`, adminMarkup());
      return;
    }
    if (data === 'admin_toggle_forcejoin') {
      const cur = getSetting('force_join', '0') === '1';
      setSetting('force_join', cur ? '0' : '1');
      if (msgId) await editText(chatId, msgId, `🛡️ Force-Join is now <b>${cur ? 'OFF' : 'ON'}</b>`, adminMarkup());
      return;
    }
  }
}

export async function broadcastToAllUsers(messageHtml: string): Promise<{ sent: number; failed: number }> {
  const users = listUsers(1000);
  let sent = 0;
  let failed = 0;
  for (const u of users) {
    const res = await sendText(u.user_id, `🔺 <b>RISXAV HAXKK !! TRANSMISSION</b>\n\n${messageHtml}`);
    if (res) sent++;
    else failed++;
  }
  return { sent, failed };
}

export async function startTelegramBotPolling(): Promise<void> {
  if (botRunning) return;
  botRunning = true;
  lastBotError = null;

  await tgCall('deleteWebhook', { drop_pending_updates: false });

  const me = await tgCall<{ id: number; first_name: string; username: string }>('getMe');
  if (me) {
    botIdentity = me;
    await tgCall('setMyCommands', {
      commands: [
        { command: 'start', description: '🔺 Launch RISXAV HAXKK !! Illuminati Deck' },
        { command: 'num', description: '👁️‍🗨️ Advance Number Info + TXT' },
        { command: 'upi', description: '💠 35-Handle UPI ID OSINT' },
        { command: 'user', description: '🔮 Username ➔ Number Recon' },
        { command: 'ocr', description: '🧿 Aadhaar Card Vision OCR' },
        { command: 'help', description: '⚡ Command Matrix' },
      ],
    });
  } else {
    lastBotError = 'Could not authenticate Telegram Bot token via getMe';
  }

  let offset = 0;
  pollAbortController = new AbortController();

  const loop = async () => {
    while (botRunning) {
      try {
        lastPollTimestamp = Date.now();
        const res = await fetch(tgApiUrl('getUpdates'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            offset,
            timeout: 20,
            allowed_updates: ['message', 'callback_query'],
          }),
          signal: pollAbortController?.signal,
        });

        if (!res.ok) {
          lastBotError = `getUpdates HTTP ${res.status}`;
          await new Promise((r) => setTimeout(r, 4000));
          continue;
        }

        const payload = (await res.json()) as {
          ok: boolean;
          result?: TgUpdate[];
          description?: string;
        };

        if (!payload.ok) {
          lastBotError = payload.description || 'Telegram polling error';
          await new Promise((r) => setTimeout(r, 4000));
          continue;
        }

        lastBotError = null;
        const updates = payload.result || [];
        for (const upd of updates) {
          offset = upd.update_id + 1;
          processedUpdatesCount++;
          if (upd.message) {
            handleIncomingMessage(upd.message).catch(() => {});
          } else if (upd.callback_query) {
            handleCallback(upd.callback_query).catch(() => {});
          }
        }
      } catch (err) {
        if (!botRunning) break;
        lastBotError = err instanceof Error ? err.message : 'Polling connection interrupted';
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  };

  loop();
}

export function stopTelegramBotPolling(): void {
  botRunning = false;
  if (pollAbortController) {
    pollAbortController.abort();
    pollAbortController = null;
  }
}

export function getTelegramBotStatus() {
  return {
    running: botRunning,
    bot: botIdentity,
    lastPollTimestamp,
    processedUpdatesCount,
    lastError: lastBotError,
    tokenMasked: `${getBotToken().slice(0, 10)}...${getBotToken().slice(-5)}`,
    welcomeVideos: listActiveWelcomeVideos(),
  };
}
