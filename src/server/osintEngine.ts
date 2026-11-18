import * as cheerio from 'cheerio';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

export interface AdvTelecomRecord {
  mobile: string;
  name: string;
  fatherOrGuardian: string;
  address: string;
  alternateNumber: string;
  circle: string;
  documentId: string;
  email: string;
}

export interface DorkEntry {
  platform: string;
  label: string;
  query: string;
  url: string;
}

export interface SocialPresence {
  whatsapp: {
    reachable: boolean | null;
    chatUrl: string;
    apiUrl: string;
  };
  truecallerWeb: {
    found: boolean;
    name: string | null;
    searchUrl: string;
    description: string | null;
  };
  telegramUrl: string;
  viberDeepLink: string;
  skypeSearchUrl: string;
}

export interface CyberNumberDossier {
  brand: string;
  engine: string;
  query: string;
  clean10Digit: string;
  internationalFormat: string;
  nationalFormat: string;
  countryCode: string;
  carrierMeta: {
    valid: boolean;
    type: string;
    country: string;
  };
  advRecords: AdvTelecomRecord[];
  uniqueNames: string[];
  uniqueCircles: string[];
  uniqueEmails: string[];
  uniqueAddresses: string[];
  socialPresence: SocialPresence;
  dorks: DorkEntry[];
  fetchedAt: string;
  durationMs: number;
  apiSourceStatus: 'live' | 'empty' | 'error';
  errorMessage?: string;
}

export interface UniversalModuleReport {
  brand: string;
  moduleId: string;
  moduleTitle: string;
  query: string;
  validFormat: boolean;
  validationDetail: string;
  decodedFields: Array<{ label: string; value: string }>;
  dorks: DorkEntry[];
  directLinks: Array<{ label: string; url: string }>;
  fetchedAt: string;
}

const DEFAULT_UPSTREAM_KEY = Buffer.from('cmFkZXZpbDE3', 'base64').toString('utf8');
const UPSTREAM_KEY = process.env.UPSTREAM_HUB_KEY || DEFAULT_UPSTREAM_KEY;

const NUMBER_ADV_API = `https://ra-api-hub.onrender.com/api/info?key=${encodeURIComponent(UPSTREAM_KEY)}&service=number_adv&query=`;
const INSTA_API = 'https://ra-bomber1.bj-cloud.workers.dev/api/instagram-info?username=';
const PHOTO_API = `https://ra-api-hub.onrender.com/api/info?key=${encodeURIComponent(UPSTREAM_KEY)}&service=photo+eidt&query=`;
const BOMBER_STRESS_API = 'https://ra-number-info.bj-cloud.workers.dev/?num=';

const STRIP_META_KEYS = new Set([
  'API_Developer',
  'developer',
  'Credits',
  'credits',
  'api_developer',
  'owner',
  'Telegram',
  'Developer_Signature',
  'client_ip',
  'request_method',
  'author',
  'powered_by',
]);

export function cleanIndianNumber(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0') && digits.length === 11) {
    digits = digits.slice(1);
  }
  return digits;
}

export function stripMeta(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(stripMeta);
  }
  if (obj && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (!STRIP_META_KEYS.has(k)) {
        out[k] = stripMeta(v);
      }
    }
    return out;
  }
  return obj;
}

function cleanAddressText(raw: unknown): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .split('!')
    .map((part) => part.replace(/^["'\s]+|["'\s]+$/g, '').trim())
    .filter(Boolean)
    .join(', ');
}

function cleanField(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  return String(raw).replace(/^["'\s!]+|["'\s!]+$/g, '').trim();
}

function extractMainRecords(data: unknown): Record<string, unknown>[] {
  if (!data || typeof data !== 'object') return [];
  const obj = data as Record<string, unknown>;

  if (Array.isArray(obj.Main_Records)) {
    return obj.Main_Records as Record<string, unknown>[];
  }
  if (Array.isArray(obj.data)) {
    return obj.data as Record<string, unknown>[];
  }

  for (const key of ['result', 'response', 'payload']) {
    if (obj[key] && typeof obj[key] === 'object') {
      const nested = extractMainRecords(obj[key]);
      if (nested.length > 0) return nested;
    }
  }

  if (Array.isArray(data)) {
    return data as Record<string, unknown>[];
  }

  return [];
}

function normalizeAdvRecords(rawRecords: Record<string, unknown>[], fallbackMobile: string): AdvTelecomRecord[] {
  const seen = new Set<string>();
  const normalized: AdvTelecomRecord[] = [];

  for (const r of rawRecords) {
    const nameRaw = cleanField(r.name || r.full_name || r.subscriber_name);
    const fnameRaw = cleanField(r.fname || r.father_name || r.f_name);
    const addressRaw = cleanAddressText(r.address || r.addr || r.local_address);
    const circleRaw = cleanAddressText(r.circle || r.operator || r.state);
    const altRaw = cleanField(r.alt || r.alt_mobile || r.alternate_number);
    const idRaw = cleanField(r.id || r.id_number || r.aadhar || r.doc_id);
    const emailRaw = cleanField(r.email);
    const mobileRaw = cleanField(r.mobile || r.number) || fallbackMobile;

    let finalName = nameRaw;
    let finalFather = fnameRaw;
    let finalAddress = addressRaw;
    let finalCircle = circleRaw;
    let finalAlt = altRaw;

    const upperName = nameRaw.toUpperCase();
    if (
      (upperName.includes('VODAFONE') ||
        upperName.includes('AIRTEL') ||
        upperName.includes('JIO') ||
        upperName.includes('BSNL') ||
        upperName.includes('IDEA')) &&
      circleRaw.length > 20
    ) {
      finalCircle = nameRaw;
      finalAlt = /^\d{10,12}$/.test(fnameRaw) ? fnameRaw : altRaw;
      finalName = addressRaw;
      finalFather = /^\d+$/.test(altRaw) ? '' : altRaw;
      finalAddress = circleRaw;
    }

    const dedupeKey = `${finalName.toLowerCase()}|${finalFather.toLowerCase()}|${finalAddress.toLowerCase()}|${finalCircle.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    normalized.push({
      mobile: mobileRaw,
      name: finalName || 'Unknown Subscriber',
      fatherOrGuardian: finalFather,
      address: finalAddress,
      alternateNumber: finalAlt,
      circle: finalCircle,
      documentId: idRaw,
      email: emailRaw,
    });
  }

  return normalized;
}

export function buildGoogleDorks(e164: string, clean10: string): DorkEntry[] {
  const target = clean10 || e164.replace(/\D/g, '');
  const dorkDefs: Array<{ platform: string; label: string; query: string }> = [
    { platform: 'caller_index', label: 'Caller ID Mentions', query: `"${target}" OR "+91${target}"` },
    { platform: 'facebook', label: 'Facebook Footprint', query: `site:facebook.com "${target}"` },
    { platform: 'instagram', label: 'Instagram Bio / Posts', query: `site:instagram.com "${target}"` },
    { platform: 'linkedin', label: 'LinkedIn Profiles', query: `site:linkedin.com "${target}"` },
    { platform: 'twitter', label: 'X / Twitter Mentions', query: `(site:x.com OR site:twitter.com) "${target}"` },
    {
      platform: 'documents',
      label: 'Public PDF / Excel Docs',
      query: `"${target}" (filetype:pdf OR filetype:xlsx OR filetype:csv OR filetype:doc)`,
    },
    {
      platform: 'pastes',
      label: 'Paste & Breach Indexes',
      query: `(site:pastebin.com OR site:paste.ee OR "leak" OR "database") "${target}"`,
    },
    {
      platform: 'classifieds',
      label: 'Classifieds & Directories',
      query: `(site:olx.in OR site:justdial.com OR site:indiamart.com) "${target}"`,
    },
  ];

  return dorkDefs.map((d) => ({
    ...d,
    url: `https://www.google.com/search?q=${encodeURIComponent(d.query)}`,
  }));
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 18000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

async function checkTruecallerWeb(clean10: string): Promise<SocialPresence['truecallerWeb']> {
  const searchUrl = `https://www.truecaller.com/search/in/${clean10}`;
  try {
    const resp = await fetchWithTimeout(
      searchUrl,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'text/html,application/xhtml+xml',
        },
      },
      6000
    );
    if (resp.ok) {
      const html = await resp.text();
      const $ = cheerio.load(html);
      const ogTitle = $('meta[property="og:title"]').attr('content') || '';
      const ogDesc = $('meta[property="og:description"]').attr('content') || null;
      if (ogTitle && !ogTitle.toLowerCase().includes('truecaller') && ogTitle.trim().length > 1) {
        return {
          found: true,
          name: ogTitle.trim(),
          searchUrl,
          description: ogDesc,
        };
      }
    }
  } catch {
    // Non-fatal OSINT enrichment
  }
  return {
    found: false,
    name: null,
    searchUrl,
    description: null,
  };
}

async function checkWhatsAppLink(e164Digits: string): Promise<boolean | null> {
  try {
    const resp = await fetchWithTimeout(
      `https://api.whatsapp.com/send?phone=${e164Digits}`,
      {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
      },
      5000
    );
    if (resp.ok) {
      const txt = await resp.text();
      if (txt.toLowerCase().includes('phone number shared via url is invalid')) {
        return false;
      }
      return true;
    }
  } catch {
    // ignore
  }
  return null;
}

export async function runAdvancedNumberOsint(rawInput: string): Promise<CyberNumberDossier> {
  const startedAt = Date.now();
  const clean10 = cleanIndianNumber(rawInput);
  const fullWithCode =
    clean10.length === 10
      ? `+91${clean10}`
      : rawInput.startsWith('+')
      ? rawInput
      : `+${rawInput.replace(/\D/g, '')}`;

  const parsed = parsePhoneNumberFromString(fullWithCode, 'IN');
  const e164Digits = (parsed?.number || fullWithCode).replace(/\D/g, '');

  const carrierMeta = {
    valid: parsed ? parsed.isValid() : clean10.length === 10,
    type: parsed?.getType() || 'MOBILE',
    country: parsed?.country || 'IN',
  };

  let advRecords: AdvTelecomRecord[] = [];
  let apiSourceStatus: 'live' | 'empty' | 'error' = 'empty';
  let errorMessage: string | undefined;

  const [advResult, waReachable, tcWeb] = await Promise.all([
    (async () => {
      const queryTarget = clean10.length === 10 ? clean10 : rawInput.replace(/\D/g, '');
      const url = `${NUMBER_ADV_API}${encodeURIComponent(queryTarget)}`;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const res = await fetchWithTimeout(url, {}, 22000);
          if (res.ok) {
            const json = await res.json();
            return { ok: true, json };
          }
          errorMessage = `Upstream HTTP ${res.status}`;
        } catch (err) {
          errorMessage = err instanceof Error ? err.message : 'Timeout contacting Advance Number Engine';
        }
      }
      return { ok: false, json: null };
    })(),
    checkWhatsAppLink(e164Digits),
    checkTruecallerWeb(clean10),
  ]);

  if (advResult.ok && advResult.json) {
    const rawRecords = extractMainRecords(advResult.json);
    advRecords = normalizeAdvRecords(rawRecords, clean10);
    apiSourceStatus = advRecords.length > 0 ? 'live' : 'empty';
  } else {
    apiSourceStatus = 'error';
  }

  const uniqueNames = Array.from(
    new Set(advRecords.map((r) => r.name).filter((n) => n && n !== 'Unknown Subscriber'))
  );
  const uniqueCircles = Array.from(new Set(advRecords.map((r) => r.circle).filter(Boolean)));
  const uniqueEmails = Array.from(new Set(advRecords.map((r) => r.email).filter(Boolean)));
  const uniqueAddresses = Array.from(new Set(advRecords.map((r) => r.address).filter(Boolean)));

  const dorks = buildGoogleDorks(fullWithCode, clean10);

  return {
    brand: 'RISXAV HAXKK !!',
    engine: 'RHXVM PRO OSINT',
    query: rawInput,
    clean10Digit: clean10,
    internationalFormat: parsed ? parsed.formatInternational() : `+91 ${clean10}`,
    nationalFormat: parsed ? parsed.formatNational() : clean10,
    countryCode: parsed?.countryCallingCode ? `+${parsed.countryCallingCode}` : '+91',
    carrierMeta,
    advRecords,
    uniqueNames,
    uniqueCircles,
    uniqueEmails,
    uniqueAddresses,
    socialPresence: {
      whatsapp: {
        reachable: waReachable,
        chatUrl: `https://wa.me/${e164Digits}`,
        apiUrl: `https://api.whatsapp.com/send?phone=${e164Digits}`,
      },
      truecallerWeb: tcWeb,
      telegramUrl: `https://t.me/+${e164Digits}`,
      viberDeepLink: `viber://chat?number=%2B${e164Digits}`,
      skypeSearchUrl: `https://www.skype.com/en/directory/search/?query=${encodeURIComponent(clean10)}`,
    },
    dorks,
    fetchedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    apiSourceStatus,
    errorMessage,
  };
}

export function formatDossierPlainText(dossier: CyberNumberDossier): string {
  const lines: string[] = [
    '====================================================',
    '        RISXAV HAXKK !! — RHXVM PRO OSINT           ',
    '           ADVANCE NUMBER INFO DOSSIER              ',
    '====================================================',
    `Target Number : ${dossier.internationalFormat}`,
    `Carrier Meta  : ${dossier.carrierMeta.country} | ${dossier.carrierMeta.type}`,
    `Records Found : ${dossier.advRecords.length}`,
    `Scan Latency  : ${dossier.durationMs} ms`,
    `Generated At  : ${dossier.fetchedAt}`,
    '====================================================',
    '',
  ];

  if (dossier.advRecords.length === 0) {
    lines.push('No subscriber records returned for this target.');
  } else {
    dossier.advRecords.forEach((rec, i) => {
      lines.push(`[RECORD #${i + 1}]`);
      lines.push(`  Subscriber Name : ${rec.name}`);
      if (rec.fatherOrGuardian) lines.push(`  Father/Guardian : ${rec.fatherOrGuardian}`);
      if (rec.circle) lines.push(`  Telecom Circle  : ${rec.circle}`);
      if (rec.alternateNumber) lines.push(`  Alternate No    : ${rec.alternateNumber}`);
      if (rec.email) lines.push(`  Email Address   : ${rec.email}`);
      if (rec.documentId) lines.push(`  Document/Ref ID : ${rec.documentId}`);
      if (rec.address) lines.push(`  Address         : ${rec.address}`);
      lines.push('----------------------------------------------------');
    });
  }

  lines.push('');
  lines.push('[SOCIAL & OSINT ENDPOINTS]');
  lines.push(`  WhatsApp   : ${dossier.socialPresence.whatsapp.chatUrl}`);
  lines.push(`  Telegram   : ${dossier.socialPresence.telegramUrl}`);
  lines.push(`  Truecaller : ${dossier.socialPresence.truecallerWeb.searchUrl}`);
  lines.push('');
  lines.push('Generated Exclusively by RISXAV HAXKK !! — RHXVM PRO OSINT');
  return lines.join('\n');
}

// Verhoeff Checksum Validator for 12-digit Aadhaar Numbers
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

function validateVerhoeff(numStr: string): boolean {
  if (!/^\d{12}$/.test(numStr)) return false;
  let c = 0;
  const inverted = numStr.split('').reverse().map(Number);
  for (let i = 0; i < inverted.length; i++) {
    c = verhoeffD[c][verhoeffP[i % 8][inverted[i]]];
  }
  return c === 0;
}

const RTO_STATES: Record<string, string> = {
  AN: 'Andaman and Nicobar Islands',
  AP: 'Andhra Pradesh',
  AR: 'Arunachal Pradesh',
  AS: 'Assam',
  BR: 'Bihar',
  CH: 'Chandigarh',
  CG: 'Chhattisgarh',
  DD: 'Dadra and Nagar Haveli and Daman and Diu',
  DL: 'Delhi NCT',
  GA: 'Goa',
  GJ: 'Gujarat',
  HR: 'Haryana',
  HP: 'Himachal Pradesh',
  JK: 'Jammu and Kashmir',
  JH: 'Jharkhand',
  KA: 'Karnataka',
  KL: 'Kerala',
  LA: 'Ladakh',
  MP: 'Madhya Pradesh',
  MH: 'Maharashtra',
  MN: 'Manipur',
  ML: 'Meghalaya',
  MZ: 'Mizoram',
  NL: 'Nagaland',
  OD: 'Odisha',
  OR: 'Odisha',
  PY: 'Puducherry',
  PB: 'Punjab',
  RJ: 'Rajasthan',
  SK: 'Sikkim',
  TN: 'Tamil Nadu',
  TS: 'Telangana',
  TG: 'Telangana',
  TR: 'Tripura',
  UP: 'Uttar Pradesh',
  UK: 'Uttarakhand',
  WB: 'West Bengal',
};

const PAN_ENTITY_TYPES: Record<string, string> = {
  P: 'Individual / Person',
  C: 'Company',
  H: 'Hindu Undivided Family (HUF)',
  F: 'Partnership Firm / LLP',
  A: 'Association of Persons (AOP)',
  T: 'Trust',
  B: 'Body of Individuals (BOI)',
  L: 'Local Authority',
  J: 'Artificial Juridical Person',
  G: 'Government Agency',
};

export function runUniversalOsintModule(moduleId: string, rawQuery: string): UniversalModuleReport {
  const q = rawQuery.trim();

  if (moduleId === 'aadhaar') {
    const digits = q.replace(/\D/g, '');
    const formatOk = /^\d{12}$/.test(digits) && !['0', '1'].includes(digits[0]);
    const checksumOk = formatOk && validateVerhoeff(digits);
    return {
      brand: 'RISXAV HAXKK !! — RHXVM PRO OSINT',
      moduleId,
      moduleTitle: 'Adhaar Search & UID Verifier',
      query: digits || q,
      validFormat: checksumOk,
      validationDetail: checksumOk
        ? 'Valid 12-Digit UID Structure & Verhoeff Checksum Verified'
        : formatOk
        ? '12-Digit UID Entered — Verhoeff Checksum Mismatch'
        : 'Invalid UID Format (Must be 12 digits starting with 2–9)',
      decodedFields: [
        { label: 'UID Number', value: digits ? `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8, 12)}` : q },
        { label: 'Starting Digit Check', value: !['0', '1'].includes(digits[0] || '') ? 'Passed (2–9)' : 'Failed' },
        { label: 'Verhoeff Checksum', value: checksumOk ? 'Cryptographically Valid' : 'Failed' },
      ],
      dorks: [
        {
          platform: 'docs',
          label: 'Public Document Mentions',
          query: `"${digits}" (filetype:pdf OR filetype:xlsx OR filetype:doc)`,
          url: `https://www.google.com/search?q=${encodeURIComponent(`"${digits}" (filetype:pdf OR filetype:xlsx OR filetype:doc)`)}`,
        },
      ],
      directLinks: [
        { label: 'UIDAI Official Verification Portal', url: 'https://myaadhaar.uidai.gov.in/CheckAadhaarValidity' },
      ],
      fetchedAt: new Date().toISOString(),
    };
  }

  if (moduleId === 'vehicle' || moduleId === 'adv_vehicle') {
    const rc = q.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const match = rc.match(/^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{1,4})$/);
    const stateCode = match ? match[1] : rc.slice(0, 2);
    const rtoZone = match ? `${match[1]}-${match[2].padStart(2, '0')}` : 'Unknown RTO';
    const stateName = RTO_STATES[stateCode] || 'Unrecognized State Code';

    return {
      brand: 'RISXAV HAXKK !! — RHXVM PRO OSINT',
      moduleId,
      moduleTitle: moduleId === 'adv_vehicle' ? 'Advance Vehicle Info' : 'Vehicle to Owner Recon',
      query: rc || q,
      validFormat: Boolean(match),
      validationDetail: match
        ? `Valid Indian Registration Plate (${stateName})`
        : 'Non-standard registration format (Expected e.g. DL01AB1234)',
      decodedFields: [
        { label: 'Registration Number', value: rc },
        { label: 'Registered State / UT', value: stateName },
        { label: 'RTO Jurisdiction Code', value: rtoZone },
        { label: 'Series & Serial', value: match ? `${match[3] || '—'} / ${match[4]}` : '—' },
      ],
      dorks: [
        {
          platform: 'challan_docs',
          label: 'Public RC / Challan Mentions',
          query: `"${rc}" (challan OR vahan OR insurance OR registration)`,
          url: `https://www.google.com/search?q=${encodeURIComponent(`"${rc}" (challan OR vahan OR insurance OR registration)`)}`,
        },
        {
          platform: 'classifieds',
          label: 'Resale / Listing Footprint',
          query: `"${rc}" (site:olx.in OR site:cars24.com OR site:spinny.com OR site:cardekho.com)`,
          url: `https://www.google.com/search?q=${encodeURIComponent(`"${rc}" (site:olx.in OR site:cars24.com OR site:spinny.com)`)}`,
        },
      ],
      directLinks: [
        { label: 'Parivahan Know Your Vehicle Details', url: 'https://parivahan.gov.in/rcdlstatus/' },
        { label: 'eChallan Official Status', url: 'https://echallan.parivahan.gov.in/index/accused-challan' },
      ],
      fetchedAt: new Date().toISOString(),
    };
  }

  if (moduleId === 'pan') {
    const pan = q.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const match = pan.match(/^([A-Z]{3})([A-Z])([A-Z])(\d{4})([A-Z])$/);
    const entityChar = match ? match[2] : '';
    const surnameInitial = match ? match[3] : '';
    const entityLabel = PAN_ENTITY_TYPES[entityChar] || 'Unknown Category';

    return {
      brand: 'RISXAV HAXKK !! — RHXVM PRO OSINT',
      moduleId,
      moduleTitle: 'PAN Search & Entity Decoder',
      query: pan || q,
      validFormat: Boolean(match),
      validationDetail: match
        ? `Valid 10-Character Income Tax PAN (${entityLabel})`
        : 'Invalid PAN Structure (Expected format: ABCDE1234F)',
      decodedFields: [
        { label: 'PAN Identifier', value: pan },
        { label: 'Holder Category (4th Char)', value: entityChar ? `${entityChar} — ${entityLabel}` : '—' },
        { label: 'Last Name / Entity Initial (5th Char)', value: surnameInitial || '—' },
        { label: 'Sequential Series', value: match ? match[4] : '—' },
      ],
      dorks: [
        {
          platform: 'corp_filings',
          label: 'Corporate / Tender / PDF Filings',
          query: `"${pan}" (filetype:pdf OR filetype:xlsx OR "GST" OR "PAN")`,
          url: `https://www.google.com/search?q=${encodeURIComponent(`"${pan}" (filetype:pdf OR filetype:xlsx OR "GST" OR "PAN")`)}`,
        },
      ],
      directLinks: [
        { label: 'Income Tax e-Filing Verify PAN', url: 'https://eportal.incometax.gov.in/iec/foservices/#/pre-login/verifyYourPAN' },
      ],
      fetchedAt: new Date().toISOString(),
    };
  }

  if (moduleId === 'tg_to_num') {
    const cleanHandle = q.replace(/^@/, '').replace(/^https?:\/\/t\.me\//i, '').trim();
    const isNumericId = /^\d{5,15}$/.test(cleanHandle);
    return {
      brand: 'RISXAV HAXKK !! — RHXVM PRO OSINT',
      moduleId,
      moduleTitle: 'Telegram To Number & Handle OSINT',
      query: cleanHandle,
      validFormat: cleanHandle.length >= 3,
      validationDetail: isNumericId
        ? 'Numeric Telegram User ID Detected'
        : `Telegram Handle @${cleanHandle} Indexed`,
      decodedFields: [
        { label: 'Target Identifier', value: isNumericId ? cleanHandle : `@${cleanHandle}` },
        { label: 'Identifier Type', value: isNumericId ? 'Telegram Numeric UID' : 'Public Username' },
      ],
      dorks: [
        {
          platform: 'tg_cross',
          label: 'Cross-Platform Handle Reuse',
          query: `"${cleanHandle}" (site:t.me OR site:github.com OR site:instagram.com OR site:x.com)`,
          url: `https://www.google.com/search?q=${encodeURIComponent(`"${cleanHandle}" (site:t.me OR site:github.com OR site:instagram.com OR site:x.com)`)}`,
        },
        {
          platform: 'tg_phone_leak',
          label: 'Linked Phone / Bio Mentions',
          query: `"${cleanHandle}" ("+91" OR "whatsapp" OR "contact" OR "call")`,
          url: `https://www.google.com/search?q=${encodeURIComponent(`"${cleanHandle}" ("+91" OR "whatsapp" OR "contact")`)}`,
        },
      ],
      directLinks: isNumericId
        ? [{ label: 'Open tg://user Deep Link', url: `tg://user?id=${cleanHandle}` }]
        : [{ label: `Open t.me/${cleanHandle}`, url: `https://t.me/${cleanHandle}` }],
      fetchedAt: new Date().toISOString(),
    };
  }

  // Live Location / Tower & IP Geo-Trace
  const clean10 = cleanIndianNumber(q);
  const parsed = parsePhoneNumberFromString(clean10.length === 10 ? `+91${clean10}` : q, 'IN');
  return {
    brand: 'RISXAV HAXKK !! — RHXVM PRO OSINT',
    moduleId: 'live_location',
    moduleTitle: 'Live Location & Telecom Circle Geo-Trace',
    query: q,
    validFormat: Boolean(parsed?.isValid()) || clean10.length === 10,
    validationDetail: 'Telecom Region & Country Prefix Resolved',
    decodedFields: [
      { label: 'Normalized Target', value: parsed ? parsed.formatInternational() : q },
      { label: 'ISO Country Jurisdiction', value: parsed?.country || 'IN' },
      { label: 'Line Classification', value: parsed?.getType() || 'MOBILE' },
      { label: 'Time Zone Grid', value: 'Asia/Kolkata (UTC+05:30)' },
    ],
    dorks: [
      {
        platform: 'geo_address',
        label: 'Address & Pin Code Mentions',
        query: `"${clean10 || q}" ("pin" OR "sector" OR "road" OR "nagar" OR "india")`,
        url: `https://www.google.com/search?q=${encodeURIComponent(`"${clean10 || q}" ("pin" OR "sector" OR "road" OR "nagar")`)}`,
      },
    ],
    directLinks: [
      { label: 'Google Maps Telecom Circle Search', url: `https://www.google.com/maps/search/${encodeURIComponent(clean10 || q)}` },
    ],
    fetchedAt: new Date().toISOString(),
  };
}

export async function runInstagramOsint(username: string): Promise<{
  ok: boolean;
  username: string;
  data: Record<string, unknown> | null;
  error?: string;
}> {
  const cleanUser = username.trim().replace(/^@/, '');
  try {
    const res = await fetchWithTimeout(`${INSTA_API}${encodeURIComponent(cleanUser)}`, {}, 18000);
    if (!res.ok) {
      return { ok: false, username: cleanUser, data: null, error: `HTTP ${res.status}` };
    }
    const raw = await res.json();
    const cleaned = stripMeta(raw) as Record<string, unknown>;
    return { ok: true, username: cleanUser, data: cleaned };
  } catch (err) {
    return {
      ok: false,
      username: cleanUser,
      data: null,
      error: err instanceof Error ? err.message : 'Failed to fetch Instagram info',
    };
  }
}

export async function runPhotoEditApi(imageUrl: string): Promise<{
  ok: boolean;
  editedUrl: string | null;
  raw: unknown;
  error?: string;
}> {
  try {
    const apiUrl = `${PHOTO_API}${encodeURIComponent(imageUrl)}`;
    const res = await fetchWithTimeout(apiUrl, {}, 25000);
    if (!res.ok) {
      return { ok: false, editedUrl: null, raw: null, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as Record<string, unknown>;
    let editedUrl: string | null = null;
    for (const key of ['result', 'url', 'image_url', 'output', 'edited_url', 'image']) {
      const val = data[key];
      if (typeof val === 'string' && val.startsWith('http')) {
        editedUrl = val;
        break;
      }
      if (val && typeof val === 'object') {
        for (const subK of ['url', 'image_url', 'image', 'output']) {
          const subV = (val as Record<string, unknown>)[subK];
          if (typeof subV === 'string' && subV.startsWith('http')) {
            editedUrl = subV;
            break;
          }
        }
        if (editedUrl) break;
      }
    }
    return { ok: Boolean(editedUrl), editedUrl, raw: stripMeta(data) };
  } catch (err) {
    return {
      ok: false,
      editedUrl: null,
      raw: null,
      error: err instanceof Error ? err.message : 'Photo API request failed',
    };
  }
}

export async function runGatewayPingTest(number: string): Promise<{
  ok: boolean;
  target: string;
  total: number;
  success: number;
  failed: number;
  successRate: number;
}> {
  const clean10 = cleanIndianNumber(number);
  try {
    const res = await fetchWithTimeout(`${BOMBER_STRESS_API}${encodeURIComponent(clean10)}`, {}, 20000);
    if (res.ok) {
      const data = (await res.json()) as Record<string, unknown>;
      return {
        ok: true,
        target: clean10,
        total: Number(data.total || 0),
        success: Number(data.success || 0),
        failed: Number(data.failed || 0),
        successRate: Number(data.success_rate || 0),
      };
    }
  } catch {
    // ignore
  }
  return { ok: false, target: clean10, total: 0, success: 0, failed: 0, successRate: 0 };
}
