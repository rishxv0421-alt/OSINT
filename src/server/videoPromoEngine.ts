import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { Resvg } from '@resvg/resvg-js';

const execFileAsync = promisify(execFile);

export type PromoTheme = 'hologram_cyan' | 'sukuna_crimson' | 'illuminati_emerald';
export type PromoAspect = 'auto' | 'landscape' | 'vertical';
export type PromoDurationMode = 'welcome_12s' | 'full';

export interface RenderPromoOptions {
  inputVideoPath: string;
  outputFilename: string;
  botHandle?: string;
  ownerHandle?: string;
  brandTitle?: string;
  theme?: PromoTheme;
  aspect?: PromoAspect;
  durationMode?: PromoDurationMode;
}

export interface RenderPromoResult {
  filename: string;
  outputPath: string;
  publicUrl: string;
  width: number;
  height: number;
  durationSec: number;
}

interface Palette {
  primary: string;
  secondary: string;
  gold: string;
  glow: string;
  panelBg: string;
}

const PALETTES: Record<PromoTheme, Palette> = {
  hologram_cyan: {
    primary: '#38BDF8',
    secondary: '#10B981',
    gold: '#FBBF24',
    glow: '#0EA5E9',
    panelBg: '#060D1A',
  },
  sukuna_crimson: {
    primary: '#F43F5E',
    secondary: '#FB923C',
    gold: '#FBBF24',
    glow: '#E11D48',
    panelBg: '#0F060B',
  },
  illuminati_emerald: {
    primary: '#10B981',
    secondary: '#38BDF8',
    gold: '#FBBF24',
    glow: '#059669',
    panelBg: '#06110E',
  },
};

const FONT_FILES = [
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf',
].filter((f) => fs.existsSync(f));

function escXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderSvgToPng(svg: string): Buffer {
  const resvg = new Resvg(svg, {
    font: {
      fontFiles: FONT_FILES,
      loadSystemFonts: FONT_FILES.length === 0,
      defaultFontFamily: 'Liberation Sans',
    },
  });
  return resvg.render().asPng();
}

async function probeVideo(filePath: string): Promise<{ width: number; height: number; duration: number }> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height:format=duration',
      '-of',
      'json',
      filePath,
    ]);
    const parsed = JSON.parse(stdout) as {
      streams?: Array<{ width?: number; height?: number }>;
      format?: { duration?: string };
    };
    const w = parsed.streams?.[0]?.width || 1280;
    const h = parsed.streams?.[0]?.height || 720;
    const d = parseFloat(parsed.format?.duration || '12') || 12;
    return { width: w, height: h, duration: d };
  } catch {
    return { width: 1280, height: 720, duration: 12 };
  }
}

function buildPersistentHudSvg(
  w: number,
  h: number,
  pal: Palette,
  brandTitle: string,
  botHandle: string,
  ownerHandle: string
): string {
  const isVert = h > w;
  const badgeW = isVert ? 330 : 390;
  const badgeH = isVert ? 66 : 68;
  const bx = w - badgeW - (isVert ? 20 : 28);
  const by = h - badgeH - (isVert ? 36 : 26);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      <linearGradient id="edgeGlow" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${pal.primary}" stop-opacity="0.95"/>
        <stop offset="100%" stop-color="${pal.secondary}" stop-opacity="0.95"/>
      </linearGradient>
    </defs>

    <!-- Top-Left Illuminati Tactical Tag -->
    <g transform="translate(${isVert ? 22 : 28}, ${isVert ? 28 : 24})">
      <rect x="0" y="0" width="${isVert ? 270 : 300}" height="42" rx="10" fill="${pal.panelBg}" fill-opacity="0.86" stroke="url(#edgeGlow)" stroke-width="1.8"/>
      <polygon points="24,10 12,31 36,31" fill="none" stroke="${pal.primary}" stroke-width="2.2"/>
      <circle cx="24" cy="24" r="3.2" fill="${pal.gold}"/>
      <text x="48" y="26" fill="#F8FAFC" font-family="Liberation Sans" font-weight="bold" font-size="15" letter-spacing="1">${escXml(brandTitle)}</text>
    </g>

    <!-- Bottom-Right Solid Watermark Shield & Official Handle Plate -->
    <g transform="translate(${bx}, ${by})">
      <rect x="0" y="0" width="${badgeW}" height="${badgeH}" rx="12" fill="${pal.panelBg}" fill-opacity="0.96" stroke="url(#edgeGlow)" stroke-width="2"/>
      <text x="18" y="27" fill="${pal.primary}" font-family="Liberation Mono" font-weight="bold" font-size="${isVert ? 15 : 16}">BOT: ${escXml(botHandle)}</text>
      <text x="18" y="50" fill="${pal.gold}" font-family="Liberation Mono" font-weight="bold" font-size="${isVert ? 14 : 15}">OWNER: ${escXml(ownerHandle)}</text>
    </g>
  </svg>`;
}

function buildScene1IntroSvg(
  w: number,
  h: number,
  pal: Palette,
  brandTitle: string,
  botHandle: string,
  ownerHandle: string
): string {
  const cx = w / 2;
  const cy = h / 2;
  const isVert = h > w;
  const cardW = isVert ? 640 : 820;
  const cardH = isVert ? 470 : 380;
  const x0 = cx - cardW / 2;
  const y0 = cy - cardH / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      <linearGradient id="holoBorder" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${pal.primary}"/>
        <stop offset="50%" stop-color="#FFFFFF"/>
        <stop offset="100%" stop-color="${pal.secondary}"/>
      </linearGradient>
    </defs>

    <rect x="${x0}" y="${y0}" width="${cardW}" height="${cardH}" rx="26" fill="${pal.panelBg}" fill-opacity="0.78" stroke="url(#holoBorder)" stroke-width="3"/>
    <rect x="${x0 + 12}" y="${y0 + 12}" width="${cardW - 24}" height="${cardH - 24}" rx="18" fill="none" stroke="${pal.primary}" stroke-opacity="0.35" stroke-width="1.5"/>

    <!-- Hologram Telegram Plane + Illuminati Pyramid Emblem -->
    <g transform="translate(${cx}, ${y0 + (isVert ? 108 : 92)})">
      <circle cx="0" cy="0" r="54" fill="${pal.primary}" fill-opacity="0.16" stroke="${pal.primary}" stroke-width="2.5"/>
      <circle cx="0" cy="0" r="40" fill="none" stroke="${pal.secondary}" stroke-width="1.5" stroke-dasharray="6 4"/>
      <path d="M-24,2 L26,-20 L10,24 L-2,10 Z" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linejoin="round"/>
      <line x1="26" y1="-20" x2="-2" y2="10" stroke="${pal.primary}" stroke-width="2.5"/>
    </g>

    <text x="${cx}" y="${y0 + (isVert ? 225 : 196)}" text-anchor="middle" fill="#FFFFFF" font-family="Liberation Sans" font-weight="bold" font-size="${isVert ? 48 : 56}" letter-spacing="2">${escXml(brandTitle)}</text>
    <text x="${cx}" y="${y0 + (isVert ? 275 : 244)}" text-anchor="middle" fill="${pal.primary}" font-family="Liberation Sans" font-weight="bold" font-size="${isVert ? 28 : 32}" letter-spacing="3">RHXVM PRO OSINT</text>
    <text x="${cx}" y="${y0 + (isVert ? 318 : 282)}" text-anchor="middle" fill="#CBD5E1" font-family="Liberation Sans" font-size="${isVert ? 19 : 20}">Ultimate Telegram Cyber Intelligence Suite</text>

    <!-- Bottom Handle Strip inside Scene 1 -->
    <g transform="translate(${cx - 250}, ${y0 + (isVert ? 356 : 306)})">
      <rect x="0" y="0" width="500" height="50" rx="14" fill="#0F172A" fill-opacity="0.92" stroke="${pal.primary}" stroke-width="1.8"/>
      <text x="250" y="32" text-anchor="middle" fill="${pal.gold}" font-family="Liberation Mono" font-weight="bold" font-size="20">${escXml(botHandle)}  ·  ${escXml(ownerHandle)}</text>
    </g>
  </svg>`;
}

function buildScene2FeaturesSvg(w: number, h: number, pal: Palette): string {
  const cx = w / 2;
  const cy = h / 2;
  const isVert = h > w;
  const panelW = isVert ? 630 : 780;
  const rowH = isVert ? 78 : 62;
  const gap = isVert ? 14 : 10;

  const features = [
    ['01', 'Advance Number Info (.TXT Dossier)'],
    ['02', 'RHXVM PRO OSINT Multi-Node'],
    ['03', 'UPI ID & 35-Bank VPA OSINT'],
    ['04', 'Aadhaar Card Vision OCR'],
    ['05', 'Telegram Username to Number'],
    ['06', 'Instagram Recon & AI Photo Lab'],
  ];

  const totalH = 92 + features.length * (rowH + gap) + 16;
  const x0 = cx - panelW / 2;
  const y0 = cy - totalH / 2 - (isVert ? 20 : 10);

  const rowsXml = features
    .map(([num, label], idx) => {
      const ry = y0 + 86 + idx * (rowH + gap);
      const accent = idx % 2 === 0 ? pal.primary : pal.secondary;
      return `
      <g transform="translate(${x0 + 26}, ${ry})">
        <rect x="0" y="0" width="${panelW - 52}" height="${rowH}" rx="14" fill="#0B1324" fill-opacity="0.90" stroke="${accent}" stroke-width="2"/>
        <rect x="14" y="${rowH / 2 - 18}" width="48" height="36" rx="9" fill="${accent}" fill-opacity="0.22" stroke="${accent}" stroke-width="1.5"/>
        <text x="38" y="${rowH / 2 + 7}" text-anchor="middle" fill="#FFFFFF" font-family="Liberation Mono" font-weight="bold" font-size="18">${num}</text>
        <text x="80" y="${rowH / 2 + 8}" fill="#F8FAFC" font-family="Liberation Sans" font-weight="bold" font-size="${isVert ? 23 : 24}">${escXml(label)}</text>
        <path d="M${panelW - 92},${rowH / 2 - 9} L${panelW - 80},${rowH / 2} L${panelW - 92},${rowH / 2 + 9}" fill="none" stroke="${pal.gold}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      </g>`;
    })
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect x="${x0}" y="${y0}" width="${panelW}" height="${totalH}" rx="26" fill="${pal.panelBg}" fill-opacity="0.80" stroke="${pal.primary}" stroke-width="3"/>
    <text x="${cx}" y="${y0 + 54}" text-anchor="middle" fill="${pal.primary}" font-family="Liberation Sans" font-weight="bold" font-size="${isVert ? 28 : 30}" letter-spacing="2">VERIFIED ILLUMINATI OSINT MODULES</text>
    ${rowsXml}
  </svg>`;
}

function buildScene3BotOwnerPowerSvg(
  w: number,
  h: number,
  pal: Palette,
  botHandle: string,
  ownerHandle: string
): string {
  const cx = w / 2;
  const cy = h / 2;
  const isVert = h > w;

  if (isVert) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <!-- Bot Card -->
      <g transform="translate(${cx - 300}, ${cy - 310})">
        <rect x="0" y="0" width="600" height="135" rx="22" fill="${pal.panelBg}" fill-opacity="0.88" stroke="${pal.primary}" stroke-width="3"/>
        <circle cx="72" cy="68" r="38" fill="${pal.primary}" fill-opacity="0.2" stroke="${pal.primary}" stroke-width="2.5"/>
        <rect x="52" y="50" width="40" height="32" rx="8" fill="none" stroke="#FFFFFF" stroke-width="2.8"/>
        <circle cx="64" cy="65" r="4" fill="${pal.primary}"/>
        <circle cx="80" cy="65" r="4" fill="${pal.primary}"/>
        <text x="132" y="55" fill="${pal.primary}" font-family="Liberation Sans" font-weight="bold" font-size="22" letter-spacing="2">OFFICIAL CYBER BOT</text>
        <text x="132" y="96" fill="#FFFFFF" font-family="Liberation Mono" font-weight="bold" font-size="30">${escXml(botHandle)}</text>
      </g>

      <!-- Owner Crown Card -->
      <g transform="translate(${cx - 300}, ${cy - 150})">
        <rect x="0" y="0" width="600" height="135" rx="22" fill="${pal.panelBg}" fill-opacity="0.88" stroke="${pal.gold}" stroke-width="3"/>
        <circle cx="72" cy="68" r="38" fill="${pal.gold}" fill-opacity="0.18" stroke="${pal.gold}" stroke-width="2.5"/>
        <polygon points="50,82 54,54 66,68 72,48 78,68 90,54 94,82" fill="none" stroke="${pal.gold}" stroke-width="2.8" stroke-linejoin="round"/>
        <text x="132" y="55" fill="${pal.gold}" font-family="Liberation Sans" font-weight="bold" font-size="22" letter-spacing="2">SUPREME OWNER</text>
        <text x="132" y="96" fill="#FFFFFF" font-family="Liberation Mono" font-weight="bold" font-size="34">${escXml(ownerHandle)}</text>
      </g>

      <!-- Power Core Attributes -->
      <g transform="translate(${cx - 300}, ${cy + 20})">
        <rect x="0" y="0" width="600" height="250" rx="24" fill="${pal.panelBg}" fill-opacity="0.84" stroke="${pal.secondary}" stroke-width="2.5"/>
        <circle cx="300" cy="125" r="92" fill="none" stroke="${pal.primary}" stroke-opacity="0.35" stroke-width="2" stroke-dasharray="10 6"/>
        <text x="300" y="68" text-anchor="middle" fill="${pal.gold}" font-family="Liberation Sans" font-weight="bold" font-size="34" letter-spacing="3">FAST  ·  SECURE</text>
        <text x="300" y="132" text-anchor="middle" fill="#FFFFFF" font-family="Liberation Sans" font-weight="bold" font-size="42" letter-spacing="3">POWERFUL</text>
        <text x="300" y="198" text-anchor="middle" fill="${pal.primary}" font-family="Liberation Sans" font-weight="bold" font-size="24" letter-spacing="2">PREMIUM CYBER EXPERIENCE</text>
      </g>
    </svg>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <!-- Left Hologram Card: BOT -->
    <g transform="translate(${cx - 520}, ${cy - 185})">
      <rect x="0" y="0" width="495" height="165" rx="22" fill="${pal.panelBg}" fill-opacity="0.88" stroke="${pal.primary}" stroke-width="3"/>
      <circle cx="74" cy="82" r="42" fill="${pal.primary}" fill-opacity="0.2" stroke="${pal.primary}" stroke-width="2.5"/>
      <rect x="52" y="62" width="44" height="36" rx="8" fill="none" stroke="#FFFFFF" stroke-width="2.8"/>
      <circle cx="66" cy="80" r="4.5" fill="${pal.primary}"/>
      <circle cx="82" cy="80" r="4.5" fill="${pal.primary}"/>
      <text x="136" y="68" fill="${pal.primary}" font-family="Liberation Sans" font-weight="bold" font-size="20" letter-spacing="2">OFFICIAL CYBER BOT</text>
      <text x="136" y="112" fill="#FFFFFF" font-family="Liberation Mono" font-weight="bold" font-size="27">${escXml(botHandle)}</text>
    </g>

    <!-- Right Gold Hologram Card: OWNER -->
    <g transform="translate(${cx + 25}, ${cy - 185})">
      <rect x="0" y="0" width="495" height="165" rx="22" fill="${pal.panelBg}" fill-opacity="0.88" stroke="${pal.gold}" stroke-width="3"/>
      <circle cx="74" cy="82" r="42" fill="${pal.gold}" fill-opacity="0.2" stroke="${pal.gold}" stroke-width="2.5"/>
      <polygon points="50,98 55,66 67,82 74,58 81,82 93,66 98,98" fill="none" stroke="${pal.gold}" stroke-width="3" stroke-linejoin="round"/>
      <text x="136" y="68" fill="${pal.gold}" font-family="Liberation Sans" font-weight="bold" font-size="20" letter-spacing="2">SUPREME OWNER</text>
      <text x="136" y="112" fill="#FFFFFF" font-family="Liberation Mono" font-weight="bold" font-size="34">${escXml(ownerHandle)}</text>
    </g>

    <!-- Bottom Wide Power Banner -->
    <g transform="translate(${cx - 520}, ${cy + 12})">
      <rect x="0" y="0" width="1040" height="158" rx="22" fill="${pal.panelBg}" fill-opacity="0.86" stroke="${pal.secondary}" stroke-width="2.8"/>
      <text x="520" y="68" text-anchor="middle" fill="#FFFFFF" font-family="Liberation Sans" font-weight="bold" font-size="38" letter-spacing="4">FAST   ·   SECURE   ·   POWERFUL</text>
      <text x="520" y="122" text-anchor="middle" fill="${pal.primary}" font-family="Liberation Sans" font-weight="bold" font-size="24" letter-spacing="3">PREMIUM RHXVM PRO OSINT EXPERIENCE</text>
    </g>
  </svg>`;
}

function buildScene4OutroSvg(
  w: number,
  h: number,
  pal: Palette,
  brandTitle: string,
  botHandle: string,
  ownerHandle: string
): string {
  const cx = w / 2;
  const cy = h / 2;
  const isVert = h > w;
  const boxW = isVert ? 620 : 820;
  const boxH = isVert ? 520 : 420;
  const x0 = cx - boxW / 2;
  const y0 = cy - boxH / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect x="${x0}" y="${y0}" width="${boxW}" height="${boxH}" rx="28" fill="${pal.panelBg}" fill-opacity="0.86" stroke="${pal.primary}" stroke-width="3.5"/>
    <rect x="${x0 + 14}" y="${y0 + 14}" width="${boxW - 28}" height="${boxH - 28}" rx="20" fill="none" stroke="${pal.gold}" stroke-opacity="0.5" stroke-width="1.5"/>

    <text x="${cx}" y="${y0 + (isVert ? 95 : 86)}" text-anchor="middle" fill="#FFFFFF" font-family="Liberation Sans" font-weight="bold" font-size="${isVert ? 48 : 54}" letter-spacing="2">${escXml(brandTitle)}</text>
    <text x="${cx}" y="${y0 + (isVert ? 140 : 128)}" text-anchor="middle" fill="${pal.primary}" font-family="Liberation Sans" font-weight="bold" font-size="${isVert ? 24 : 26}" letter-spacing="3">RHXVM PRO OSINT BOT</text>

    <!-- Bot Handle Pill -->
    <g transform="translate(${cx - (isVert ? 250 : 280)}, ${y0 + (isVert ? 178 : 158)})">
      <rect x="0" y="0" width="${isVert ? 500 : 560}" height="68" rx="18" fill="#0F172A" stroke="${pal.primary}" stroke-width="2.5"/>
      <text x="${isVert ? 250 : 280}" y="44" text-anchor="middle" fill="#FFFFFF" font-family="Liberation Mono" font-weight="bold" font-size="${isVert ? 27 : 30}">${escXml(botHandle)}</text>
    </g>

    <!-- Owner Handle Pill -->
    <g transform="translate(${cx - (isVert ? 250 : 280)}, ${y0 + (isVert ? 268 : 244)})">
      <rect x="0" y="0" width="${isVert ? 500 : 560}" height="64" rx="18" fill="#0F172A" stroke="${pal.gold}" stroke-width="2.5"/>
      <text x="${isVert ? 250 : 280}" y="42" text-anchor="middle" fill="${pal.gold}" font-family="Liberation Mono" font-weight="bold" font-size="${isVert ? 25 : 28}">Owner: ${escXml(ownerHandle)}</text>
    </g>

    <!-- JOIN NOW Action Banner -->
    <g transform="translate(${cx - 190}, ${y0 + (isVert ? 378 : 332)})">
      <rect x="0" y="0" width="380" height="66" rx="16" fill="${pal.primary}"/>
      <text x="190" y="45" text-anchor="middle" fill="#020617" font-family="Liberation Sans" font-weight="bold" font-size="32" letter-spacing="4">JOIN NOW</text>
    </g>
  </svg>`;
}

export async function renderRisxavPromoVideo(opts: RenderPromoOptions): Promise<RenderPromoResult> {
  const botHandle = (opts.botHandle || '@RISXAVHAXXKBOT').startsWith('@')
    ? opts.botHandle || '@RISXAVHAXXKBOT'
    : `@${opts.botHandle}`;
  const ownerHandle = (opts.ownerHandle || '@RHXVM').startsWith('@')
    ? opts.ownerHandle || '@RHXVM'
    : `@${opts.ownerHandle}`;
  const brandTitle = opts.brandTitle || 'RISXAV HAXKK !!';
  const theme: PromoTheme = opts.theme || 'hologram_cyan';
  const pal = PALETTES[theme] || PALETTES.hologram_cyan;
  const durationMode = opts.durationMode || 'welcome_12s';

  const meta = await probeVideo(opts.inputVideoPath);

  let targetW = 1280;
  let targetH = 720;
  if (opts.aspect === 'vertical' || (opts.aspect !== 'landscape' && meta.height > meta.width)) {
    targetW = 720;
    targetH = 1280;
  }

  const targetDuration =
    durationMode === 'welcome_12s'
      ? Math.max(8, Math.min(12.5, meta.duration))
      : Math.max(6, Math.min(120, meta.duration));

  const outDir = path.resolve(process.cwd(), 'public/welcome_videos');
  fs.mkdirSync(outDir, { recursive: true });

  const safeName = opts.outputFilename.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.mp4$/i, '') + '.mp4';
  const outputPath = path.join(outDir, safeName);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'risxav_promo_'));

  try {
    const p0 = path.join(tmpDir, 'hud0.png');
    const p1 = path.join(tmpDir, 's1.png');
    const p2 = path.join(tmpDir, 's2.png');
    const p3 = path.join(tmpDir, 's3.png');
    const p4 = path.join(tmpDir, 's4.png');

    fs.writeFileSync(p0, renderSvgToPng(buildPersistentHudSvg(targetW, targetH, pal, brandTitle, botHandle, ownerHandle)));
    fs.writeFileSync(p1, renderSvgToPng(buildScene1IntroSvg(targetW, targetH, pal, brandTitle, botHandle, ownerHandle)));
    fs.writeFileSync(p2, renderSvgToPng(buildScene2FeaturesSvg(targetW, targetH, pal)));
    fs.writeFileSync(p3, renderSvgToPng(buildScene3BotOwnerPowerSvg(targetW, targetH, pal, botHandle, ownerHandle)));
    fs.writeFileSync(p4, renderSvgToPng(buildScene4OutroSvg(targetW, targetH, pal, brandTitle, botHandle, ownerHandle)));

    // Compute scene windows
    const d = targetDuration;
    let s1Start = 0.25;
    let s1End = +(d * 0.24).toFixed(2);
    let s2Start = +(d * 0.25).toFixed(2);
    let s2End = +(d * 0.55).toFixed(2);
    let s3Start = +(d * 0.56).toFixed(2);
    let s3End = +(d * 0.80).toFixed(2);
    let s4Start = +(d * 0.81).toFixed(2);
    let s4End = +(d - 0.08).toFixed(2);

    if (d > 22) {
      // Long edit (e.g. 1:42 Sukuna AMV): show crisp intro showcase in first 22s and epic outro in final 6s while keeping persistent corner shield active throughout!
      s1Start = 0.4;
      s1End = 5.2;
      s2Start = 5.5;
      s2End = 13.5;
      s3Start = 13.8;
      s3End = 20.5;
      s4Start = +(d - 6.0).toFixed(2);
      s4End = +(d - 0.1).toFixed(2);
    }

    const fadeDur = 0.32;

    const filterComplex = [
      `[0:v]scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH},eq=contrast=1.06:saturation=1.12,format=yuv420p[base]`,
      `[base][1:v]overlay=0:0[v0]`,
      `[2:v]format=rgba,fade=t=in:st=${s1Start}:d=${fadeDur}:alpha=1,fade=t=out:st=${(s1End - fadeDur).toFixed(2)}:d=${fadeDur}:alpha=1[s1]`,
      `[v0][s1]overlay=0:0:enable='between(t,${s1Start},${s1End})'[v1]`,
      `[3:v]format=rgba,fade=t=in:st=${s2Start}:d=${fadeDur}:alpha=1,fade=t=out:st=${(s2End - fadeDur).toFixed(2)}:d=${fadeDur}:alpha=1[s2]`,
      `[v1][s2]overlay=0:0:enable='between(t,${s2Start},${s2End})'[v2]`,
      `[4:v]format=rgba,fade=t=in:st=${s3Start}:d=${fadeDur}:alpha=1,fade=t=out:st=${(s3End - fadeDur).toFixed(2)}:d=${fadeDur}:alpha=1[s3]`,
      `[v2][s3]overlay=0:0:enable='between(t,${s3Start},${s3End})'[v3]`,
      `[5:v]format=rgba,fade=t=in:st=${s4Start}:d=${fadeDur}:alpha=1,fade=t=out:st=${(s4End - fadeDur).toFixed(2)}:d=${fadeDur}:alpha=1[s4]`,
      `[v3][s4]overlay=0:0:enable='between(t,${s4Start},${s4End})',format=yuv420p[vout]`,
    ].join(';');

    const ffArgs = [
      '-y',
      '-i',
      opts.inputVideoPath,
      '-loop',
      '1',
      '-t',
      String(d),
      '-i',
      p0,
      '-loop',
      '1',
      '-t',
      String(d),
      '-i',
      p1,
      '-loop',
      '1',
      '-t',
      String(d),
      '-i',
      p2,
      '-loop',
      '1',
      '-t',
      String(d),
      '-i',
      p3,
      '-loop',
      '1',
      '-t',
      String(d),
      '-i',
      p4,
      '-filter_complex',
      filterComplex,
      '-map',
      '[vout]',
      '-map',
      '0:a?',
      '-t',
      String(d),
      '-r',
      '30',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '22',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      outputPath,
    ];

    await execFileAsync('ffmpeg', ffArgs, { maxBuffer: 20 * 1024 * 1024 });

    return {
      filename: safeName,
      outputPath,
      publicUrl: `/welcome_videos/${safeName}`,
      width: targetW,
      height: targetH,
      durationSec: d,
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export function listActiveWelcomeVideos(): string[] {
  const dir = path.resolve(process.cwd(), 'public/welcome_videos');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.mp4') && !/gautam|welcome10/i.test(f))
    .sort();
}
