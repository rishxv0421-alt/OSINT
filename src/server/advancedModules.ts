import crypto from 'node:crypto';
import * as cheerio from 'cheerio';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import Tesseract from 'tesseract.js';
import {
  cleanIndianNumber,
  DorkEntry,
  runAdvancedNumberOsint,
} from './osintEngine.ts';

// ============================================================================
// 1. UPI ID OSINT ENGINE (35-Handle NPCI Taxonomy + Razorpay/PayU Validation)
// ============================================================================

export interface NpciHandleMeta {
  psp: string;
  bank: string;
  tier: 1 | 2 | 3;
}

export const NPCI_HANDLES: Record<string, NpciHandleMeta> = {
  ybl: { psp: 'PhonePe', bank: 'Yes Bank', tier: 1 },
  ibl: { psp: 'PhonePe', bank: 'IndusInd Bank', tier: 1 },
  axl: { psp: 'PhonePe', bank: 'Axis Bank', tier: 1 },
  oksbi: { psp: 'Google Pay', bank: 'State Bank of India', tier: 1 },
  okhdfcbank: { psp: 'Google Pay', bank: 'HDFC Bank', tier: 1 },
  okicici: { psp: 'Google Pay', bank: 'ICICI Bank', tier: 1 },
  okaxis: { psp: 'Google Pay', bank: 'Axis Bank', tier: 1 },
  paytm: { psp: 'Paytm', bank: 'Paytm Payments Bank', tier: 1 },
  ptyes: { psp: 'Paytm', bank: 'Yes Bank', tier: 1 },
  ptaxis: { psp: 'Paytm', bank: 'Axis Bank', tier: 1 },
  ptsbi: { psp: 'Paytm', bank: 'State Bank of India', tier: 1 },
  pthdfc: { psp: 'Paytm', bank: 'HDFC Bank', tier: 1 },
  upi: { psp: 'BHIM', bank: 'NPCI Direct', tier: 1 },
  apl: { psp: 'Amazon Pay', bank: 'Axis Bank', tier: 2 },
  yapl: { psp: 'Amazon Pay', bank: 'Yes Bank', tier: 2 },
  rapl: { psp: 'Amazon Pay', bank: 'RBL Bank', tier: 2 },
  waicici: { psp: 'WhatsApp Pay', bank: 'ICICI Bank', tier: 2 },
  waaxis: { psp: 'WhatsApp Pay', bank: 'Axis Bank', tier: 2 },
  wahdfcbank: { psp: 'WhatsApp Pay', bank: 'HDFC Bank', tier: 2 },
  wasbi: { psp: 'WhatsApp Pay', bank: 'State Bank of India', tier: 2 },
  sbi: { psp: 'SBI Pay', bank: 'State Bank of India', tier: 3 },
  icici: { psp: 'iMobile Pay', bank: 'ICICI Bank', tier: 3 },
  hdfcbank: { psp: 'HDFC Pay', bank: 'HDFC Bank', tier: 3 },
  axisbank: { psp: 'Axis Pay', bank: 'Axis Bank', tier: 3 },
  kotak: { psp: 'Kotak 811', bank: 'Kotak Mahindra Bank', tier: 3 },
  cred: { psp: 'CRED', bank: 'Axis Bank (Sponsor)', tier: 3 },
  fam: { psp: 'FamPay', bank: 'IDFC First Bank', tier: 3 },
  slice: { psp: 'Slice', bank: 'Sponsor Bank', tier: 3 },
  jio: { psp: 'MyJio', bank: 'Jio Payments Bank', tier: 3 },
  airtel: { psp: 'Airtel Thanks', bank: 'Airtel Payments Bank', tier: 3 },
  navi: { psp: 'Navi', bank: 'RBL Sponsor Bank', tier: 3 },
  timepay: { psp: 'TimePay (NPST)', bank: 'NPST Sponsor', tier: 3 },
  yespop: { psp: 'Yes Pop', bank: 'Yes Bank', tier: 3 },
  superpay: { psp: 'Super.money', bank: 'Sponsor Bank', tier: 3 },
  timecosmos: { psp: 'TimeCosmos', bank: 'Cosmos Bank', tier: 3 },
};

export interface UpiVpaCandidate {
  vpa: string;
  prefix: string;
  handle: string;
  psp: string;
  bank: string;
  tier: number;
  verifiedStatus: 'verified_active' | 'verified_inactive' | 'candidate';
  holderName: string | null;
  deepPayUri: string;
}

export interface UpiOsintDossier {
  brand: string;
  query: string;
  inputType: 'vpa' | 'phone';
  normalizedPhone: string | null;
  subscriberCorrelatedName: string | null;
  subscriberCircle: string | null;
  liveGatewayConfigured: boolean;
  primaryPsp: string | null;
  vpaCandidates: UpiVpaCandidate[];
  dorks: DorkEntry[];
  fetchedAt: string;
  durationMs: number;
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 10000): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

async function validateRazorpayVpa(keyId: string, vpa: string): Promise<{ active: boolean | null; name: string | null }> {
  try {
    const res = await fetchWithTimeout(
      `https://api.razorpay.com/v1/payments/validate/account?key_id=${encodeURIComponent(keyId)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: 'vpa', value: vpa }),
      },
      7000
    );
    if (res.ok) {
      const data = (await res.json()) as { success?: boolean; customer_name?: string };
      if (typeof data.success === 'boolean') {
        return {
          active: data.success,
          name: data.customer_name || null,
        };
      }
    }
  } catch {
    // ignore
  }
  return { active: null, name: null };
}

async function validatePayuVpa(
  key: string,
  salt: string,
  vpa: string
): Promise<{ active: boolean | null; name: string | null }> {
  try {
    const hash = crypto.createHash('sha512').update(`${key}|validateVPA|${vpa}|${salt}`).digest('hex');
    const body = new URLSearchParams({
      key,
      command: 'validateVPA',
      hash,
      var1: vpa,
    });
    const res = await fetchWithTimeout(
      'https://secure.payu.in/merchant/postservice?form=2',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      },
      8000
    );
    if (res.ok) {
      const data = (await res.json()) as { isVPAValid?: number; payerAccountName?: string };
      if (data.isVPAValid === 1) {
        return { active: true, name: data.payerAccountName || null };
      }
      if (data.isVPAValid === 0) {
        return { active: false, name: null };
      }
    }
  } catch {
    // ignore
  }
  return { active: null, name: null };
}

export async function runUpiOsintLookup(rawInput: string): Promise<UpiOsintDossier> {
  const startedAt = Date.now();
  const trimmed = rawInput.trim().toLowerCase();
  const isDirectVpa = /^[a-z0-9._-]{2,256}@[a-z][a-z0-9]{1,63}$/i.test(trimmed);

  const rzpKey = process.env.RAZORPAY_KEY_ID || '';
  const payuKey = process.env.PAYU_KEY || '';
  const payuSalt = process.env.PAYU_SALT || '';
  const liveGatewayConfigured = Boolean(rzpKey || (payuKey && payuSalt));

  let normalizedPhone: string | null = null;
  let subscriberCorrelatedName: string | null = null;
  let subscriberCircle: string | null = null;
  let handleKeysToTest: string[] = [];
  let prefix = '';

  if (isDirectVpa) {
    const [vpaPrefix, vpaHandle] = trimmed.split('@');
    prefix = vpaPrefix;
    handleKeysToTest = [vpaHandle];
    const maybe10 = cleanIndianNumber(vpaPrefix);
    if (maybe10.length === 10) {
      normalizedPhone = maybe10;
    }
  } else {
    const clean10 = cleanIndianNumber(trimmed);
    if (clean10.length === 10) {
      normalizedPhone = clean10;
      prefix = clean10;
      // Enumerate Tier 1 & Tier 2 top handles
      handleKeysToTest = Object.entries(NPCI_HANDLES)
        .filter(([, meta]) => meta.tier <= 2)
        .map(([h]) => h);
    } else {
      prefix = trimmed.replace(/[^a-z0-9._-]/g, '') || 'unknown';
      handleKeysToTest = ['ybl', 'oksbi', 'okhdfcbank', 'okicici', 'paytm', 'upi'];
    }
  }

  // Parallel: if we have a 10-digit phone, correlate subscriber identity from Advance Number Engine
  const subscriberPromise = normalizedPhone
    ? runAdvancedNumberOsint(normalizedPhone).catch(() => null)
    : Promise.resolve(null);

  const vpaPromises = handleKeysToTest.map(async (h): Promise<UpiVpaCandidate> => {
    const meta = NPCI_HANDLES[h] || { psp: 'Custom / Bank PSP', bank: `@${h.toUpperCase()} Handle`, tier: 3 as const };
    const candidateVpa = `${prefix}@${h}`;
    let verifiedStatus: UpiVpaCandidate['verifiedStatus'] = 'candidate';
    let holderName: string | null = null;

    if (rzpKey) {
      const r = await validateRazorpayVpa(rzpKey, candidateVpa);
      if (r.active === true) {
        verifiedStatus = 'verified_active';
        holderName = r.name;
      } else if (r.active === false) {
        verifiedStatus = 'verified_inactive';
      }
    }

    if (payuKey && payuSalt && verifiedStatus !== 'verified_inactive') {
      const p = await validatePayuVpa(payuKey, payuSalt, candidateVpa);
      if (p.active === true) {
        verifiedStatus = 'verified_active';
        holderName = p.name || holderName;
      } else if (p.active === false && verifiedStatus === 'candidate') {
        verifiedStatus = 'verified_inactive';
      }
    }

    return {
      vpa: candidateVpa,
      prefix,
      handle: h,
      psp: meta.psp,
      bank: meta.bank,
      tier: meta.tier,
      verifiedStatus,
      holderName,
      deepPayUri: `upi://pay?pa=${encodeURIComponent(candidateVpa)}&cu=INR`,
    };
  });

  const [subDossier, candidates] = await Promise.all([subscriberPromise, Promise.all(vpaPromises)]);

  if (subDossier && subDossier.advRecords.length > 0) {
    subscriberCorrelatedName = subDossier.advRecords[0].name;
    subscriberCircle = subDossier.advRecords[0].circle || null;
  }

  // Populate correlated name on candidate handles if bank name wasn't unmasked
  const enrichedCandidates = candidates.map((c) => ({
    ...c,
    holderName: c.holderName || subscriberCorrelatedName,
  }));

  const activeList = enrichedCandidates.filter((c) => c.verifiedStatus === 'verified_active');
  const primaryPsp = activeList.length > 0 ? activeList[0].psp : enrichedCandidates[0]?.psp || null;

  const targetDorkToken = isDirectVpa ? trimmed : normalizedPhone || prefix;
  const dorks: DorkEntry[] = [
    {
      platform: 'upi_mentions',
      label: 'Public VPA & QR Mentions',
      query: `"${targetDorkToken}@ybl" OR "${targetDorkToken}@oksbi" OR "${targetDorkToken}@paytm" OR "${trimmed}"`,
      url: `https://www.google.com/search?q=${encodeURIComponent(
        `"${targetDorkToken}@ybl" OR "${targetDorkToken}@oksbi" OR "${targetDorkToken}@paytm" OR "${trimmed}"`
      )}`,
    },
    {
      platform: 'donation_pages',
      label: 'Crowdfunding / Merchant Footprints',
      query: `"${targetDorkToken}" ("upi" OR "gpay" OR "phonepe" OR "paytm")`,
      url: `https://www.google.com/search?q=${encodeURIComponent(
        `"${targetDorkToken}" ("upi" OR "gpay" OR "phonepe" OR "paytm")`
      )}`,
    },
  ];

  return {
    brand: 'RISXAV HAXKK !! — RHXVM PRO OSINT',
    query: rawInput.trim(),
    inputType: isDirectVpa ? 'vpa' : 'phone',
    normalizedPhone,
    subscriberCorrelatedName,
    subscriberCircle,
    liveGatewayConfigured,
    primaryPsp,
    vpaCandidates: enrichedCandidates,
    dorks,
    fetchedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
  };
}

// ============================================================================
// 2. AADHAAR CARD VISION OCR ENGINE (Tesseract.js + Verhoeff UID Checksum)
// ============================================================================

const verhoeffD = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const verhoeffP = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

export function verifyAadhaarChecksum(digits12: string): boolean {
  if (!/^\d{12}$/.test(digits12) || ['0', '1'].includes(digits12[0])) return false;
  let c = 0;
  const inv = digits12.split('').reverse().map(Number);
  for (let i = 0; i < inv.length; i++) {
    c = verhoeffD[c][verhoeffP[i % 8][inv[i]]];
  }
  return c === 0;
}

export interface AadhaarOcrResult {
  brand: string;
  ok: boolean;
  extractedName: string | null;
  extractedDob: string | null;
  extractedGender: string | null;
  extractedMobile: string | null;
  extractedAadhaar: string | null;
  aadhaarChecksumValid: boolean;
  extractedAddress: string | null;
  rawText: string;
  confidence: number;
  durationMs: number;
  error?: string;
}

function parseAadhaarOcrText(rawText: string) {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(/[|_~`]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 1);

  // 1. Aadhaar 12-digit pattern: XXXX XXXX XXXX
  const aadhaarMatch = rawText.match(/\b([2-9]\d{3})\s*(\d{4})\s*(\d{4})\b/);
  const extractedAadhaar = aadhaarMatch ? `${aadhaarMatch[1]} ${aadhaarMatch[2]} ${aadhaarMatch[3]}` : null;
  const aadhaarDigits = extractedAadhaar ? extractedAadhaar.replace(/\s+/g, '') : '';
  const aadhaarChecksumValid = aadhaarDigits.length === 12 ? verifyAadhaarChecksum(aadhaarDigits) : false;

  // 2. Gender pattern
  const genderMatch = rawText.match(/\b(FEMALE|MALE|TRANSGENDER)\b/i);
  const extractedGender = genderMatch ? genderMatch[1].toUpperCase() : null;

  // 3. DOB or Year of Birth
  const dobFull = rawText.match(/\b(\d{2}[/-]\d{2}[/-]\d{4})\b/);
  const yobMatch = rawText.match(/(?:Year of Birth|YOB|DOB)\s*[:.-]?\s*(\d{4})/i);
  const extractedDob = dobFull ? dobFull[1] : yobMatch ? yobMatch[1] : null;

  // 4. 10-digit Mobile
  const mobileMatches = rawText.match(/\b([6-9]\d{9})\b/g) || [];
  const extractedMobile =
    mobileMatches.find((m) => !aadhaarDigits.includes(m)) || null;

  // 5. Name heuristic: Line directly above DOB line, or clean Title-Case Person line excluding Gov headers
  const skipHeaderRegex =
    /government|india|unique|identification|authority|aadhaar|enrollment|address|father|husband|dob|birth|male|female|www|help|uidai/i;

  let extractedName: string | null = null;
  const dobLineIdx = lines.findIndex((l) => /dob|birth|\d{2}[/-]\d{2}[/-]\d{4}/i.test(l));
  if (dobLineIdx > 0) {
    for (let idx = dobLineIdx - 1; idx >= 0; idx--) {
      const candidate = lines[idx].replace(/[^A-Za-z\s.]/g, '').trim();
      if (candidate.length >= 3 && !skipHeaderRegex.test(candidate)) {
        extractedName = candidate;
        break;
      }
    }
  }
  if (!extractedName) {
    for (const l of lines) {
      const cleanAlpha = l.replace(/[^A-Za-z\s]/g, '').trim();
      if (
        /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}$/.test(cleanAlpha) &&
        !skipHeaderRegex.test(cleanAlpha)
      ) {
        extractedName = cleanAlpha;
        break;
      }
    }
  }

  // 6. Address extraction (if back side or full letter)
  let extractedAddress: string | null = null;
  const addrMatch = rawText.match(/Address\s*[:.-]?\s*([\s\S]{15,320})/i);
  if (addrMatch) {
    const cleanedAddr = addrMatch[1]
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s && !/\b[2-9]\d{3}\s*\d{4}\s*\d{4}\b/.test(s) && !/www\.|uidai|1947/i.test(s))
      .slice(0, 5)
      .join(', ');
    if (cleanedAddr.length > 8) {
      extractedAddress = cleanedAddr;
    }
  } else {
    // Check if there is a 6-digit Indian PIN code in the image (back card cropped without "Address:" word)
    const pinIdx = lines.findIndex((l) => /\b[1-8]\d{5}\b/.test(l));
    if (pinIdx !== -1) {
      const start = Math.max(0, pinIdx - 3);
      extractedAddress = lines
        .slice(start, pinIdx + 1)
        .filter((l) => !skipHeaderRegex.test(l))
        .join(', ');
    }
  }

  return {
    extractedName,
    extractedDob,
    extractedGender,
    extractedMobile,
    extractedAadhaar,
    aadhaarChecksumValid,
    extractedAddress,
  };
}

export async function runAadhaarImageOcr(imageSource: Buffer | string): Promise<AadhaarOcrResult> {
  const t0 = Date.now();
  try {
    const result = await Tesseract.recognize(imageSource, 'eng');
    const rawText = result.data.text || '';
    const confidence = Math.round(result.data.confidence || 0);
    const parsed = parseAadhaarOcrText(rawText);

    return {
      brand: 'RISXAV HAXKK !! — RHXVM PRO OSINT',
      ok: true,
      ...parsed,
      rawText: rawText.trim(),
      confidence,
      durationMs: Date.now() - t0,
    };
  } catch (err) {
    return {
      brand: 'RISXAV HAXKK !! — RHXVM PRO OSINT',
      ok: false,
      extractedName: null,
      extractedDob: null,
      extractedGender: null,
      extractedMobile: null,
      extractedAadhaar: null,
      aadhaarChecksumValid: false,
      extractedAddress: null,
      rawText: '',
      confidence: 0,
      durationMs: Date.now() - t0,
      error: err instanceof Error ? err.message : 'OCR engine failed to process image',
    };
  }
}

// ============================================================================
// 3. USERNAME TO NUMBER & PROFILE RECON (Live Telegram t.me Scrape + Prefix Matrix)
// ============================================================================

export interface PrefixCarrierSeries {
  country: string;
  dialCode: string;
  operator: string;
  prefixes: string[];
  sampleGenerated: string[];
}

export interface UsernameReconDossier {
  brand: string;
  handle: string;
  profileUrl: string;
  liveTelegramProfile: {
    exists: boolean;
    displayName: string | null;
    bio: string | null;
    avatarUrl: string | null;
    membersOrSubscribers: string | null;
  };
  extractedPhonesFromBio: string[];
  extractedLinksFromBio: string[];
  prefixGeneratorMatrix: PrefixCarrierSeries[];
  crossPlatformLinks: Array<{ platform: string; url: string }>;
  dorks: DorkEntry[];
  fetchedAt: string;
  durationMs: number;
}

const PREFIX_SERIES_MATRIX: Array<{
  country: string;
  dialCode: string;
  operator: string;
  prefixes: string[];
  remainingDigits: number;
}> = [
  {
    country: 'India (+91)',
    dialCode: '+91',
    operator: 'Reliance Jio / Airtel / Vi Primary Series',
    prefixes: ['98', '99', '97', '96', '95', '93', '91', '90', '88', '89', '70', '63'],
    remainingDigits: 8,
  },
  {
    country: 'Iran (+98)',
    dialCode: '+98',
    operator: 'MCI (Hamrah Aval) / Irancell / Rightel Weighted Series',
    prefixes: ['912', '910', '919', '935', '936', '937', '938', '939', '920', '921', '990'],
    remainingDigits: 7,
  },
];

function generateWeightedSampleNumbers(dialCode: string, prefixes: string[], remLen: number, count = 4): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const p = prefixes[i % prefixes.length];
    let tail = '';
    for (let d = 0; d < remLen; d++) {
      tail += String(Math.floor(Math.random() * 10));
    }
    out.push(`${dialCode}${p}${tail}`);
  }
  return out;
}

export async function runUsernameToNumberRecon(rawHandle: string): Promise<UsernameReconDossier> {
  const startedAt = Date.now();
  const cleanHandle = rawHandle
    .trim()
    .replace(/^https?:\/\/(www\.)?t\.me\//i, '')
    .replace(/^@/, '')
    .split(/[/?#]/)[0]
    .trim();

  const profileUrl = `https://t.me/${cleanHandle}`;
  let exists = false;
  let displayName: string | null = null;
  let bio: string | null = null;
  let avatarUrl: string | null = null;
  let membersOrSubscribers: string | null = null;

  try {
    const res = await fetchWithTimeout(
      profileUrl,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'text/html,application/xhtml+xml',
        },
      },
      9000
    );

    if (res.ok) {
      const html = await res.text();
      const $ = cheerio.load(html);
      const pageTitle = $('.tgme_page_title span').first().text().trim();
      const pageDesc = $('.tgme_page_description').first().text().trim();
      const pageExtra = $('.tgme_page_extra').first().text().trim();
      const imgSrc = $('.tgme_page_photo_image').first().attr('src') || null;

      if (pageTitle) {
        exists = true;
        displayName = pageTitle;
        bio = pageDesc || null;
        avatarUrl = imgSrc;
        membersOrSubscribers = pageExtra || null;
      }
    }
  } catch {
    // ignore network failure
  }

  // Extract any phone numbers or URLs directly embedded in the Telegram Bio
  const extractedPhonesFromBio: string[] = [];
  const extractedLinksFromBio: string[] = [];
  if (bio) {
    const phoneRegex = /(?:\+?\d{1,3}[\s-]?)?(?:\d[\s-]?){9,12}/g;
    const rawMatches = bio.match(phoneRegex) || [];
    for (const m of rawMatches) {
      const parsed = parsePhoneNumberFromString(m.startsWith('+') ? m : `+91${cleanIndianNumber(m)}`, 'IN');
      if (parsed?.isValid()) {
        extractedPhonesFromBio.push(parsed.formatInternational());
      } else if (m.replace(/\D/g, '').length >= 10) {
        extractedPhonesFromBio.push(m.trim());
      }
    }
    const urlMatches = bio.match(/https?:\/\/[^\s]+/g) || [];
    extractedLinksFromBio.push(...urlMatches);
  }

  const prefixGeneratorMatrix: PrefixCarrierSeries[] = PREFIX_SERIES_MATRIX.map((row) => ({
    country: row.country,
    dialCode: row.dialCode,
    operator: row.operator,
    prefixes: row.prefixes,
    sampleGenerated: generateWeightedSampleNumbers(row.dialCode, row.prefixes, row.remainingDigits, 4),
  }));

  const crossPlatformLinks = [
    { platform: 'Telegram Profile', url: `https://t.me/${cleanHandle}` },
    { platform: 'Instagram Handle', url: `https://www.instagram.com/${cleanHandle}/` },
    { platform: 'GitHub Account', url: `https://github.com/${cleanHandle}` },
    { platform: 'X / Twitter', url: `https://x.com/${cleanHandle}` },
  ];

  const dorks: DorkEntry[] = [
    {
      platform: 'phone_correlation',
      label: 'Username + Phone Number Leak Correlation',
      query: `"${cleanHandle}" ("+91" OR "+98" OR "whatsapp" OR "wa.me" OR "call" OR "mobile")`,
      url: `https://www.google.com/search?q=${encodeURIComponent(
        `"${cleanHandle}" ("+91" OR "+98" OR "whatsapp" OR "wa.me" OR "call" OR "mobile")`
      )}`,
    },
    {
      platform: 'tg_mentions',
      label: 'Public Telegram Directories & Forums',
      query: `"t.me/${cleanHandle}" OR "@${cleanHandle}"`,
      url: `https://www.google.com/search?q=${encodeURIComponent(`"t.me/${cleanHandle}" OR "@${cleanHandle}"`)}`,
    },
    {
      platform: 'paste_breach',
      label: 'Database & Paste Handle Mentions',
      query: `"${cleanHandle}" (site:pastebin.com OR site:github.com OR filetype:txt OR filetype:csv)`,
      url: `https://www.google.com/search?q=${encodeURIComponent(
        `"${cleanHandle}" (site:pastebin.com OR site:github.com OR filetype:txt OR filetype:csv)`
      )}`,
    },
  ];

  return {
    brand: 'RISXAV HAXKK !! — RHXVM PRO OSINT',
    handle: cleanHandle,
    profileUrl,
    liveTelegramProfile: {
      exists,
      displayName,
      bio,
      avatarUrl,
      membersOrSubscribers,
    },
    extractedPhonesFromBio: Array.from(new Set(extractedPhonesFromBio)),
    extractedLinksFromBio: Array.from(new Set(extractedLinksFromBio)),
    prefixGeneratorMatrix,
    crossPlatformLinks,
    dorks,
    fetchedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
  };
}
