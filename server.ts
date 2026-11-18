import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import {
  runAadhaarImageOcr,
  runUpiOsintLookup,
  runUsernameToNumberRecon,
} from './src/server/advancedModules.ts';
import {
  addTokens,
  clearMediaCache,
  getAllSettings,
  getGlobalStats,
  getSetting,
  listRecentLogs,
  listUsers,
  logQuery,
  setBanned,
  setSetting,
  upsertUser,
} from './src/server/db.ts';
import {
  cleanIndianNumber,
  formatDossierPlainText,
  runAdvancedNumberOsint,
  runGatewayPingTest,
  runInstagramOsint,
  runPhotoEditApi,
} from './src/server/osintEngine.ts';
import { generatePythonCyberBotSource } from './src/server/pythonExporter.ts';
import {
  broadcastToAllUsers,
  getTelegramBotStatus,
  renderIntroMessage,
  startTelegramBotPolling,
  stopTelegramBotPolling,
} from './src/server/telegramBot.ts';
import {
  listActiveWelcomeVideos,
  PromoAspect,
  PromoDurationMode,
  PromoTheme,
  renderRisxavPromoVideo,
} from './src/server/videoPromoEngine.ts';

dotenv.config();

const PORT = 3000;
const DEFAULT_TOKEN = '8762163633:AAHnjq1QW_0_yj41jo2xT81m6Ks5RrstxhE';

const videoUpload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 150 * 1024 * 1024 },
});

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // Serve extracted welcome MP4 videos & OCR sample cards statically
  app.use('/welcome_videos', express.static(path.resolve(process.cwd(), 'public', 'welcome_videos')));
  app.use('/ocr_samples', express.static(path.resolve(process.cwd(), 'public', 'ocr_samples')));

  startTelegramBotPolling().catch((err) => {
    console.error('Telegram Bot initial boot error:', err);
  });

  // 1. Live Bot & Global Telemetry Overview
  app.get('/api/bot/overview', (_req, res) => {
    const botStatus = getTelegramBotStatus();
    const stats = getGlobalStats();
    const settings = getAllSettings();
    const previewIntro = renderIntroMessage(
      { id: 8158526050, first_name: 'Operator', username: 'RISXAVHAXXKBOT' },
      100
    );

    res.json({
      botStatus,
      stats,
      settings,
      previewIntro,
    });
  });

  // 2. Restart / Toggle Telegram Bot Polling
  app.post('/api/bot/control', async (req, res) => {
    const { action } = req.body as { action?: 'start' | 'stop' | 'restart' };
    if (action === 'stop') {
      stopTelegramBotPolling();
    } else if (action === 'restart') {
      stopTelegramBotPolling();
      await new Promise((r) => setTimeout(r, 600));
      await startTelegramBotPolling();
    } else {
      await startTelegramBotPolling();
    }
    res.json({ ok: true, botStatus: getTelegramBotStatus() });
  });

  // 3. Update Bot Welcome Message, Video Selection & Operational Settings
  app.post('/api/bot/settings', (req, res) => {
    const body = req.body as Record<string, unknown>;
    const allowedKeys = [
      'intro_msg',
      'owner_contact',
      'force_channel',
      'force_group',
      'force_join',
      'welcome_video_enabled',
      'welcome_video_mode',
    ];
    for (const key of allowedKeys) {
      if (typeof body[key] === 'string') {
        setSetting(key, body[key] as string);
      }
    }
    const settings = getAllSettings();
    const previewIntro = renderIntroMessage(
      { id: 8158526050, first_name: 'Operator', username: 'RISXAVHAXXKBOT' },
      100
    );
    res.json({ ok: true, settings, previewIntro });
  });

  // 3b. Render Holographic Promo Video (Upload Custom Anime MP4 or Re-Edit Base Clip)
  app.post('/api/bot/render-promo-video', videoUpload.single('video'), async (req, res) => {
    const uploadedFile = req.file;
    const {
      baseClip,
      theme = 'sukuna_crimson',
      aspect = 'auto',
      durationMode = 'welcome_12s',
      botHandle = '@RISXAVHAXXKBOT',
      ownerHandle = '@RHXVM',
      setAsWelcome = 'true',
    } = req.body as Record<string, string>;

    let inputVideoPath = uploadedFile?.path || '';
    if (!inputVideoPath && baseClip) {
      const safeClip = path.basename(baseClip);
      const candidate = path.resolve(process.cwd(), 'data', 'base_anime_clips', safeClip);
      if (fs.existsSync(candidate)) {
        inputVideoPath = candidate;
      }
    }

    if (!inputVideoPath || !fs.existsSync(inputVideoPath)) {
      res.status(400).json({ error: 'Upload an MP4 video file or choose a base anime clip.' });
      return;
    }

    try {
      const outFilename = `risxav_edit_${Date.now()}.mp4`;
      const rendered = await renderRisxavPromoVideo({
        inputVideoPath,
        outputFilename: outFilename,
        botHandle,
        ownerHandle,
        theme: theme as PromoTheme,
        aspect: aspect as PromoAspect,
        durationMode: durationMode as PromoDurationMode,
      });

      clearMediaCache(rendered.filename);
      if (setAsWelcome === 'true') {
        setSetting('welcome_video_mode', rendered.filename);
        setSetting('welcome_video_enabled', '1');
      }

      res.json({
        ok: true,
        rendered,
        welcomeVideos: listActiveWelcomeVideos(),
        settings: getAllSettings(),
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to render promo video.',
      });
    } finally {
      if (uploadedFile?.path) {
        fs.rmSync(uploadedFile.path, { force: true });
      }
    }
  });

  // 3c. Delete a Welcome Video from Deck
  app.delete('/api/bot/welcome-video/:filename', (req, res) => {
    const safe = path.basename(req.params.filename || '');
    if (!safe.endsWith('.mp4')) {
      res.status(400).json({ error: 'Invalid video filename.' });
      return;
    }
    const target = path.resolve(process.cwd(), 'public', 'welcome_videos', safe);
    if (fs.existsSync(target)) {
      fs.rmSync(target, { force: true });
    }
    clearMediaCache(safe);
    const remaining = listActiveWelcomeVideos();
    if (getSetting('welcome_video_mode') === safe) {
      setSetting('welcome_video_mode', remaining[0] || 'random');
    }
    res.json({ ok: true, welcomeVideos: remaining, settings: getAllSettings() });
  });

  // 4. Advance Number Info + RHXVM PRO OSINT Lookup
  app.post('/api/osint/number', async (req, res) => {
    const { query } = req.body as { query?: string };
    if (!query || cleanIndianNumber(query).length < 7) {
      res.status(400).json({ error: 'Please enter a valid 10-digit mobile number.' });
      return;
    }

    const dossier = await runAdvancedNumberOsint(query);
    logQuery({
      source: 'web',
      userId: 0,
      username: 'RISXAV_Operator',
      service: 'rhxvm_pro',
      query: dossier.clean10Digit || query,
      status: dossier.apiSourceStatus === 'live' ? 'ok' : dossier.apiSourceStatus,
      recordsFound: dossier.advRecords.length,
      durationMs: dossier.durationMs,
    });

    res.json({
      ...dossier,
      plainTextReport: formatDossierPlainText(dossier),
    });
  });

  // 5. NEW: UPI ID OSINT Lookup (35-Handle NPCI Taxonomy + Subscriber Correlation)
  app.post('/api/osint/upi', async (req, res) => {
    const { query } = req.body as { query?: string };
    if (!query || !query.trim()) {
      res.status(400).json({ error: 'Enter a 10-digit mobile number or UPI VPA (e.g. 9876543210@ybl).' });
      return;
    }
    const dossier = await runUpiOsintLookup(query);
    logQuery({
      source: 'web',
      userId: 0,
      username: 'RISXAV_Operator',
      service: 'upi_osint',
      query: dossier.query,
      status: 'ok',
      recordsFound: dossier.vpaCandidates.length,
      durationMs: dossier.durationMs,
    });
    res.json(dossier);
  });

  // 6. NEW: Aadhaar Card Vision OCR (Base64 Image or Local Sample Path or URL)
  app.post('/api/osint/aadhaar-ocr', async (req, res) => {
    const { imageBase64, sampleFile, imageUrl } = req.body as {
      imageBase64?: string;
      sampleFile?: string;
      imageUrl?: string;
    };

    let source: Buffer | string | null = null;
    if (imageBase64 && imageBase64.includes('base64,')) {
      const b64 = imageBase64.split('base64,')[1];
      source = Buffer.from(b64, 'base64');
    } else if (sampleFile && ['aadhaar_front_example.png', 'aadhaar_back_example.png'].includes(sampleFile)) {
      source = path.resolve(process.cwd(), 'public', 'ocr_samples', sampleFile);
    } else if (imageUrl && imageUrl.startsWith('http')) {
      source = imageUrl;
    }

    if (!source) {
      res.status(400).json({ error: 'Upload an Aadhaar card image or choose a sample card.' });
      return;
    }

    const ocrResult = await runAadhaarImageOcr(source);
    logQuery({
      source: 'web',
      userId: 0,
      username: 'RISXAV_Operator',
      service: 'aadhaar_ocr',
      query: ocrResult.extractedAadhaar || 'Card Image',
      status: ocrResult.ok ? 'ok' : 'error',
      recordsFound: ocrResult.extractedAadhaar ? 1 : 0,
      durationMs: ocrResult.durationMs,
    });
    res.json(ocrResult);
  });

  // 7. NEW: Username ➔ Number & Telegram Profile Recon
  app.post('/api/osint/username-number', async (req, res) => {
    const { handle } = req.body as { handle?: string };
    if (!handle || !handle.trim()) {
      res.status(400).json({ error: 'Enter a Telegram @username or t.me link.' });
      return;
    }
    const dossier = await runUsernameToNumberRecon(handle);
    logQuery({
      source: 'web',
      userId: 0,
      username: 'RISXAV_Operator',
      service: 'username_num',
      query: `@${dossier.handle}`,
      status: dossier.liveTelegramProfile.exists ? 'ok' : 'empty',
      recordsFound: dossier.extractedPhonesFromBio.length + 1,
      durationMs: dossier.durationMs,
    });
    res.json(dossier);
  });

  // 8. Gateway Stress Diagnostics
  app.post('/api/osint/bomber', async (req, res) => {
    const { query } = req.body as { query?: string };
    const clean10 = cleanIndianNumber(query || '');
    if (clean10.length !== 10) {
      res.status(400).json({ error: 'Enter a valid 10-digit mobile number.' });
      return;
    }
    const t0 = Date.now();
    const outcome = await runGatewayPingTest(clean10);
    logQuery({
      source: 'web',
      userId: 0,
      username: 'RISXAV_Operator',
      service: 'gateway_stress',
      query: clean10,
      status: outcome.ok ? 'ok' : 'error',
      recordsFound: outcome.success,
      durationMs: Date.now() - t0,
    });
    res.json(outcome);
  });

  // 9. Instagram Recon Lookup
  app.post('/api/osint/instagram', async (req, res) => {
    const { username } = req.body as { username?: string };
    if (!username || !username.trim()) {
      res.status(400).json({ error: 'Please provide an Instagram username.' });
      return;
    }
    const t0 = Date.now();
    const result = await runInstagramOsint(username);
    logQuery({
      source: 'web',
      userId: 0,
      username: 'RISXAV_Operator',
      service: 'instagram',
      query: result.username,
      status: result.ok ? 'ok' : 'error',
      recordsFound: result.ok ? 1 : 0,
      durationMs: Date.now() - t0,
    });
    res.json(result);
  });

  // 10. AI Photo Lab Proxy
  app.post('/api/osint/photo', async (req, res) => {
    const { imageUrl } = req.body as { imageUrl?: string };
    if (!imageUrl || !imageUrl.startsWith('http')) {
      res.status(400).json({ error: 'Please provide a valid http/https image URL.' });
      return;
    }
    const t0 = Date.now();
    const result = await runPhotoEditApi(imageUrl);
    logQuery({
      source: 'web',
      userId: 0,
      username: 'RISXAV_Operator',
      service: 'photo_edit',
      query: imageUrl.slice(0, 60),
      status: result.ok ? 'ok' : 'error',
      recordsFound: result.ok ? 1 : 0,
      durationMs: Date.now() - t0,
    });
    res.json(result);
  });

  // 11. Users & Query Activity Logs
  app.get('/api/bot/users', (_req, res) => {
    res.json({
      users: listUsers(100),
      logs: listRecentLogs(50),
    });
  });

  // 12. Admin User Actions
  app.post('/api/bot/users/action', (req, res) => {
    const { userId, action, amount } = req.body as {
      userId?: number;
      action?: 'add_tokens' | 'ban' | 'unban';
      amount?: number;
    };
    if (!userId || Number.isNaN(Number(userId))) {
      res.status(400).json({ error: 'Valid numeric userId required.' });
      return;
    }
    const uid = Number(userId);
    upsertUser(uid, '', '');
    if (action === 'add_tokens') {
      addTokens(uid, Number(amount || 0));
    } else if (action === 'ban') {
      setBanned(uid, true);
    } else if (action === 'unban') {
      setBanned(uid, false);
    }
    res.json({ ok: true, users: listUsers(100) });
  });

  // 13. Broadcast Alert to All Telegram Users
  app.post('/api/bot/broadcast', async (req, res) => {
    const { message } = req.body as { message?: string };
    if (!message || !message.trim()) {
      res.status(400).json({ error: 'Broadcast message cannot be empty.' });
      return;
    }
    const outcome = await broadcastToAllUsers(message.trim());
    res.json({ ok: true, ...outcome });
  });

  // 14. Export Standalone Python Script (RISXAV_HAXKK_PRO_BOT.py)
  app.get('/api/bot/export-python', (_req, res) => {
    const botStatus = getTelegramBotStatus();
    const pythonCode = generatePythonCyberBotSource({
      botToken: process.env.BOT_TOKEN || DEFAULT_TOKEN,
      botUsername: botStatus.bot?.username || 'RISXAVHAXXKBOT',
      ownerContact: getSetting('owner_contact', '@RHXVM'),
      forceChannel: getSetting('force_channel', 'RISXAVHAXXK'),
      forceGroup: getSetting('force_group', 'RHXVM_PRO_OSINT'),
      introTemplate: getSetting('intro_msg'),
    });
    res.json({
      filename: 'RISXAV_HAXKK_PRO_BOT.py',
      requirements: 'python-telegram-bot==21.6\naiohttp==3.10.5\n',
      code: pythonCode,
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`RISXAV HAXKK !! — RHXVM PRO OSINT Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
