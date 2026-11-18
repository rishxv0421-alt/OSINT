import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Search,
  Upload,
} from 'lucide-react';
import {
  AadhaarOcrResult,
  BotOverviewResponse,
  CyberNumberDossier,
  UpiOsintDossier,
  UsernameReconDossier,
} from '../types.ts';
import { HyperCore4DScene } from './HyperCore4DScene.tsx';

interface RhxvmProOsintViewProps {
  overview: BotOverviewResponse | null;
  onLookupComplete?: () => void;
}

type IlluminatiToolId =
  | 'adv_num'
  | 'pro_osint'
  | 'upi_osint'
  | 'aadhaar_ocr'
  | 'username_num'
  | 'insta'
  | 'photo_lab'
  | 'bomber'
  | 'profile'
  | 'daily_credits';

interface IlluminatiCardDef {
  id: IlluminatiToolId;
  symbol: string;
  label: string;
  subtitle: string;
  placeholder: string;
  defaultSample: string;
}

const ILLUMINATI_DECK: IlluminatiCardDef[] = [
  {
    id: 'adv_num',
    symbol: '👁️‍🗨️',
    label: 'Advance Number Info',
    subtitle: 'Live telecom subscriber records + downloadable .TXT dossier',
    placeholder: 'Enter 10-digit mobile number (e.g. 9876543210)',
    defaultSample: '9876543210',
  },
  {
    id: 'pro_osint',
    symbol: '🔺',
    label: 'RHXVM PRO OSINT',
    subtitle: 'Full Telecom + WhatsApp + Truecaller Index + OSINT Dorks',
    placeholder: 'Enter 10-digit mobile number (e.g. 9876543210)',
    defaultSample: '9876543210',
  },
  {
    id: 'upi_osint',
    symbol: '💠',
    label: 'UPI ID OSINT',
    subtitle: '35-Handle NPCI VPA & Bank mapper (PhonePe, GPay, Paytm, BHIM)',
    placeholder: 'Enter 10-digit phone or UPI VPA (e.g. 9876543210 or 9876543210@ybl)',
    defaultSample: '9876543210',
  },
  {
    id: 'aadhaar_ocr',
    symbol: '🧿',
    label: 'Aadhaar Vision OCR',
    subtitle: 'Upload card image to extract Name, DOB, Gender, 12-Digit UID & Address',
    placeholder: 'Or paste direct https:// card image URL',
    defaultSample: '',
  },
  {
    id: 'username_num',
    symbol: '🔮',
    label: 'Username ➔ Number',
    subtitle: 'Live Telegram profile scraper, bio phone extractor & carrier prefix matrix',
    placeholder: 'Enter Telegram @username (e.g. @RISXAVHAXXKBOT)',
    defaultSample: '@RISXAVHAXXKBOT',
  },
  {
    id: 'insta',
    symbol: '🕯️',
    label: 'Instagram Recon',
    subtitle: 'Extract Instagram account metadata & JSON profile dossier',
    placeholder: 'Enter Instagram @username',
    defaultSample: 'instagram',
  },
  {
    id: 'photo_lab',
    symbol: '⚡',
    label: 'AI Photo Lab',
    subtitle: 'Process direct image URLs via the RISXAV media pipeline',
    placeholder: 'Enter direct https:// image URL',
    defaultSample: '',
  },
  {
    id: 'bomber',
    symbol: '🔱',
    label: 'Gateway Stress',
    subtitle: 'Multi-gateway OTP delivery stress diagnostics',
    placeholder: 'Enter 10-digit mobile number',
    defaultSample: '9876543210',
  },
  {
    id: 'profile',
    symbol: '⚜️',
    label: 'Operator Profile',
    subtitle: 'View live RISXAV HAXKK !! order telemetry & bot status',
    placeholder: '',
    defaultSample: '',
  },
  {
    id: 'daily_credits',
    symbol: '💎',
    label: 'Daily Credits',
    subtitle: 'Claim free daily operator credits & referral rewards',
    placeholder: '',
    defaultSample: '',
  },
];

export const RhxvmProOsintView: React.FC<RhxvmProOsintViewProps> = ({
  overview,
  onLookupComplete,
}) => {
  const [selectedTool, setSelectedTool] = useState<IlluminatiToolId>('upi_osint');
  const [queryInput, setQueryInput] = useState('9876543210');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Module result states
  const [numberDossier, setNumberDossier] = useState<CyberNumberDossier | null>(null);
  const [upiDossier, setUpiDossier] = useState<UpiOsintDossier | null>(null);
  const [ocrResult, setOcrResult] = useState<AadhaarOcrResult | null>(null);
  const [ocrPreviewSrc, setOcrPreviewSrc] = useState<string | null>(null);
  const [usernameDossier, setUsernameDossier] = useState<UsernameReconDossier | null>(null);
  const [instaData, setInstaData] = useState<Record<string, unknown> | null>(null);
  const [photoEditedUrl, setPhotoEditedUrl] = useState<string | null>(null);
  const [bomberReport, setBomberReport] = useState<{
    target: string;
    total: number;
    success: number;
    failed: number;
    successRate: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeDef = ILLUMINATI_DECK.find((t) => t.id === selectedTool) || ILLUMINATI_DECK[0];
  const botUsername = overview?.botStatus.bot?.username || 'RISXAVHAXXKBOT';

  const resetResults = () => {
    setError(null);
    setNumberDossier(null);
    setUpiDossier(null);
    setOcrResult(null);
    setUsernameDossier(null);
    setInstaData(null);
    setPhotoEditedUrl(null);
    setBomberReport(null);
  };

  const selectTabCard = (card: IlluminatiCardDef) => {
    setSelectedTool(card.id);
    resetResults();
    setQueryInput(card.defaultSample);
  };

  const handleCopy = (key: string, val: string) => {
    navigator.clipboard.writeText(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const handleDownloadTxt = () => {
    if (!numberDossier?.plainTextReport) return;
    const ts = Math.floor(Date.now() / 1000);
    const blob = new Blob([numberDossier.plainTextReport], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `advance_number_info_+91${numberDossier.clean10Digit}_${ts}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleOcrFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    resetResults();

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result || '');
      setOcrPreviewSrc(dataUrl);
      try {
        const res = await fetch('/api/osint/aadhaar-ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: dataUrl }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setError(data.error || 'Vision OCR failed to read card.');
        } else {
          setOcrResult(data as AadhaarOcrResult);
          onLookupComplete?.();
        }
      } catch {
        setError('Network error during Aadhaar Vision OCR.');
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRunSampleOcr = async (sampleFile: 'aadhaar_front_example.png' | 'aadhaar_back_example.png') => {
    setLoading(true);
    resetResults();
    setOcrPreviewSrc(`/ocr_samples/${sampleFile}`);
    try {
      const res = await fetch('/api/osint/aadhaar-ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sampleFile }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'Sample OCR failed.');
      } else {
        setOcrResult(data as AadhaarOcrResult);
        onLookupComplete?.();
      }
    } catch {
      setError('Network error running sample Aadhaar OCR.');
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteTool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryInput.trim()) return;

    setLoading(true);
    resetResults();

    try {
      if (selectedTool === 'adv_num' || selectedTool === 'pro_osint') {
        const res = await fetch('/api/osint/number', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: queryInput }),
        });
        const data = await res.json();
        if (!res.ok) setError(data.error || 'Number lookup failed.');
        else {
          setNumberDossier(data as CyberNumberDossier);
          onLookupComplete?.();
        }
      } else if (selectedTool === 'upi_osint') {
        const res = await fetch('/api/osint/upi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: queryInput }),
        });
        const data = await res.json();
        if (!res.ok) setError(data.error || 'UPI OSINT lookup failed.');
        else {
          setUpiDossier(data as UpiOsintDossier);
          onLookupComplete?.();
        }
      } else if (selectedTool === 'aadhaar_ocr') {
        setOcrPreviewSrc(queryInput.trim());
        const res = await fetch('/api/osint/aadhaar-ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl: queryInput.trim() }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) setError(data.error || 'Could not OCR image URL.');
        else {
          setOcrResult(data as AadhaarOcrResult);
          onLookupComplete?.();
        }
      } else if (selectedTool === 'username_num') {
        const res = await fetch('/api/osint/username-number', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ handle: queryInput }),
        });
        const data = await res.json();
        if (!res.ok) setError(data.error || 'Username recon failed.');
        else {
          setUsernameDossier(data as UsernameReconDossier);
          onLookupComplete?.();
        }
      } else if (selectedTool === 'insta') {
        const res = await fetch('/api/osint/instagram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: queryInput }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) setError(data.error || 'Instagram lookup failed.');
        else {
          setInstaData(data.data);
          onLookupComplete?.();
        }
      } else if (selectedTool === 'photo_lab') {
        const res = await fetch('/api/osint/photo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl: queryInput.trim() }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok || !data.editedUrl) setError(data.error || 'Photo processing failed.');
        else {
          setPhotoEditedUrl(data.editedUrl);
          onLookupComplete?.();
        }
      } else if (selectedTool === 'bomber') {
        const res = await fetch('/api/osint/bomber', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: queryInput }),
        });
        const data = await res.json();
        if (!res.ok) setError(data.error || 'Gateway stress failed.');
        else {
          setBomberReport(data);
          onLookupComplete?.();
        }
      }
    } catch {
      setError('Network error executing RHXVM PRO OSINT module.');
    } finally {
      setLoading(false);
    }
  };

  const isStaticPanel = selectedTool === 'profile' || selectedTool === 'daily_credits';

  return (
    <div className="space-y-8">
      {/* 3D & 4D Interactive HyperCore Hero */}
      <HyperCore4DScene />

      {/* Main Split: Clean Illuminati 2-Column Tab Deck (10 Working Tabs) + Active Module Console */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 5 Columns: Clean Illuminati Tab Deck */}
        <section className="lg:col-span-5 bg-[#111827] border border-slate-800 rounded-2xl p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              🔺 Illuminati Cyber Tab Deck
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              100% live verified engines synced with @{botUsername}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5 perspective-[900px]">
            {ILLUMINATI_DECK.map((card) => {
              const isSelected = selectedTool === card.id;
              return (
                <motion.button
                  key={card.id}
                  type="button"
                  whileHover={{ scale: 1.025, rotateX: 4, rotateY: -4 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ duration: 0.14 }}
                  onClick={() => selectTabCard(card)}
                  className={`flex items-center justify-start gap-2.5 px-3.5 py-3.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap truncate ${
                    isSelected
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-sm'
                      : 'bg-[#172033] hover:bg-[#1E2940] text-slate-100 border-slate-800'
                  }`}
                >
                  <span className="text-base leading-none shrink-0">{card.symbol}</span>
                  <span className="truncate">{card.label}</span>
                </motion.button>
              );
            })}
          </div>
        </section>

        {/* Right 7 Columns: Active Module Workspace */}
        <section className="lg:col-span-7 bg-[#111827] border border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <div className="text-xs font-medium text-emerald-400">
                RISXAV HAXKK !! · VERIFIED LIVE ENGINE
              </div>
              <h2 className="text-xl font-semibold text-slate-100 mt-0.5">
                {activeDef.symbol} {activeDef.label}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">{activeDef.subtitle}</p>
            </div>

            {numberDossier && (
              <button
                type="button"
                onClick={handleDownloadTxt}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                Save .TXT Dossier
              </button>
            )}
          </div>

          {/* Dedicated Upload Bar for Aadhaar Vision OCR */}
          {selectedTool === 'aadhaar_ocr' && (
            <div className="bg-[#0B1120] rounded-xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-100">
                    Upload Aadhaar Card Image (Front or Back)
                  </div>
                  <div className="text-xs text-slate-400">
                    Runs local Tesseract Vision OCR + Verhoeff 12-Digit UID Checksum Verification
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleOcrFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Upload Card Photo
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/80 text-xs">
                <span className="text-slate-400">Quick Test with Bundled Sample Cards:</span>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleRunSampleOcr('aadhaar_front_example.png')}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  Scan Sample Front Card
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleRunSampleOcr('aadhaar_back_example.png')}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  Scan Sample Back Address
                </button>
              </div>
            </div>
          )}

          {/* Operator Profile / Credits Info */}
          {selectedTool === 'profile' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-[#0B1120] border border-slate-800 rounded-xl p-4">
                <div className="text-xs text-slate-400">Supreme Order</div>
                <div className="mt-1 text-sm font-semibold text-emerald-400">RISXAV HAXKK !!</div>
              </div>
              <div className="bg-[#0B1120] border border-slate-800 rounded-xl p-4">
                <div className="text-xs text-slate-400">Initiated Operators</div>
                <div className="mt-1 text-lg font-mono font-semibold text-slate-100 tabular-nums">
                  {overview?.stats.totalUsers ?? 1}
                </div>
              </div>
              <div className="bg-[#0B1120] border border-slate-800 rounded-xl p-4">
                <div className="text-xs text-slate-400">Executed Scans</div>
                <div className="mt-1 text-lg font-mono font-semibold text-slate-100 tabular-nums">
                  {overview?.stats.totalQueries ?? 0}
                </div>
              </div>
            </div>
          )}

          {selectedTool === 'daily_credits' && (
            <div className="bg-[#0B1120] border border-slate-800 rounded-xl p-5 space-y-3">
              <div className="text-sm font-semibold text-slate-100">
                💎 Operator Supply & Referral Protocol
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Every operator receives 50 initial credits on <span className="font-mono text-slate-200">/start</span>, +30 daily bonus credits, and +25 credits per referred operator inside <span className="font-mono text-emerald-400">@{botUsername}</span>.
              </p>
              <a
                href={`https://t.me/${botUsername}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg transition-colors"
              >
                Open @{botUsername} on Telegram
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}

          {/* Input Search Form */}
          {!isStaticPanel && (
            <form onSubmit={handleExecuteTool} className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={queryInput}
                  onChange={(e) => setQueryInput(e.target.value)}
                  placeholder={activeDef.placeholder}
                  className="w-full pl-10 pr-4 py-2.5 bg-[#0B1120] border border-slate-800 focus:border-emerald-500 focus:outline-none rounded-xl text-sm font-mono text-slate-100 placeholder:text-slate-500 tabular-nums"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold text-slate-950 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Search className="w-4 h-4" />
                {loading ? 'Scanning...' : 'Run Scan'}
              </button>
            </form>
          )}

          {error && (
            <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-900/60 text-xs text-red-300">
              {error}
            </div>
          )}

          {loading && (
            <div className="space-y-3">
              <div className="h-12 bg-slate-800/60 rounded-xl animate-pulse" />
              <div className="h-28 bg-slate-800/40 rounded-xl animate-pulse" />
            </div>
          )}

          {/* 1. UPI ID OSINT RESULT VIEW */}
          {!loading && upiDossier && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-[#0B1120] border border-slate-800 rounded-xl p-3.5">
                  <div className="text-[11px] text-slate-400">Correlated Holder</div>
                  <div className="mt-1 text-sm font-semibold text-emerald-400 truncate">
                    {upiDossier.subscriberCorrelatedName || 'Unlisted'}
                  </div>
                </div>
                <div className="bg-[#0B1120] border border-slate-800 rounded-xl p-3.5">
                  <div className="text-[11px] text-slate-400">Telecom Circle</div>
                  <div className="mt-1 text-xs font-mono text-slate-200 truncate">
                    {upiDossier.subscriberCircle || 'NPCI Direct'}
                  </div>
                </div>
                <div className="bg-[#0B1120] border border-slate-800 rounded-xl p-3.5">
                  <div className="text-[11px] text-slate-400">Mapped NPCI Handles</div>
                  <div className="mt-1 text-sm font-mono font-semibold text-slate-100 tabular-nums">
                    {upiDossier.vpaCandidates.length} VPAs
                  </div>
                </div>
              </div>

              <div className="bg-[#0B1120] border border-slate-800 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200">
                    NPCI VPA Handle & Sponsor Bank Matrix
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    {upiDossier.durationMs} ms
                  </span>
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/80 text-xs">
                  {upiDossier.vpaCandidates.map((c) => (
                    <div
                      key={c.vpa}
                      className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-800/30"
                    >
                      <div className="min-w-0">
                        <div className="font-mono font-medium text-slate-100 truncate">
                          {c.vpa}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {c.psp} · {c.bank}
                          {c.holderName ? ` · ${c.holderName}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCopy(c.vpa, c.vpa)}
                          className="p-1.5 text-slate-400 hover:text-slate-100 rounded hover:bg-slate-800 cursor-pointer"
                          title="Copy VPA"
                        >
                          {copiedKey === c.vpa ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 2. AADHAAR VISION OCR RESULT VIEW */}
          {!loading && ocrResult && (
            <div className="space-y-4">
              {ocrPreviewSrc && (
                <div className="bg-[#0B1120] border border-slate-800 rounded-xl p-3">
                  <img
                    src={ocrPreviewSrc}
                    alt="Scanned Aadhaar Card"
                    referrerPolicy="no-referrer"
                    className="max-h-48 mx-auto rounded-lg object-contain"
                  />
                </div>
              )}

              <div className="bg-[#0B1120] border border-slate-800 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <span className="text-xs font-semibold text-emerald-400">
                    🧿 Extracted Card Fields ({ocrResult.confidence}% OCR Confidence)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const blob = new Blob([JSON.stringify(ocrResult, null, 2)], {
                        type: 'application/json',
                      });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `aadhaar_ocr_${Date.now()}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="inline-flex items-center gap-1 text-xs text-slate-300 hover:text-white cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export JSON
                  </button>
                </div>

                <div className="divide-y divide-slate-800 text-xs">
                  <div className="py-2 flex justify-between gap-4">
                    <span className="text-slate-400">Holder Name</span>
                    <span className="font-mono text-slate-100">{ocrResult.extractedName || 'Not detected'}</span>
                  </div>
                  <div className="py-2 flex justify-between gap-4">
                    <span className="text-slate-400">DOB / Year of Birth</span>
                    <span className="font-mono text-slate-100">{ocrResult.extractedDob || 'Not detected'}</span>
                  </div>
                  <div className="py-2 flex justify-between gap-4">
                    <span className="text-slate-400">Gender</span>
                    <span className="font-mono text-slate-100">{ocrResult.extractedGender || 'Not detected'}</span>
                  </div>
                  <div className="py-2 flex justify-between gap-4">
                    <span className="text-slate-400">12-Digit Aadhaar UID</span>
                    <span className="font-mono font-semibold text-emerald-400">
                      {ocrResult.extractedAadhaar || 'Not detected'}
                    </span>
                  </div>
                  <div className="py-2 flex justify-between gap-4">
                    <span className="text-slate-400">Verhoeff Checksum</span>
                    <span className="font-mono text-slate-200">
                      {ocrResult.extractedAadhaar
                        ? ocrResult.aadhaarChecksumValid
                          ? 'Cryptographically Valid'
                          : 'Checksum Mismatch'
                        : '—'}
                    </span>
                  </div>
                  <div className="py-2 flex justify-between gap-4">
                    <span className="text-slate-400">Mobile Number</span>
                    <span className="font-mono text-slate-100">{ocrResult.extractedMobile || '—'}</span>
                  </div>
                  {ocrResult.extractedAddress && (
                    <div className="py-2 space-y-1">
                      <div className="text-slate-400">Extracted Address</div>
                      <div className="font-mono text-slate-200 leading-relaxed">
                        {ocrResult.extractedAddress}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 3. USERNAME ➔ NUMBER & PROFILE RECON RESULT VIEW */}
          {!loading && usernameDossier && (
            <div className="space-y-4">
              <div className="bg-[#0B1120] border border-slate-800 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-100">
                      @{usernameDossier.handle}
                    </div>
                    <div className="text-xs text-slate-400">
                      {usernameDossier.liveTelegramProfile.exists
                        ? `Active Telegram Entity · ${
                            usernameDossier.liveTelegramProfile.displayName || ''
                          }`
                        : 'Handle unclaimed or private'}
                    </div>
                  </div>
                  <a
                    href={usernameDossier.profileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg"
                  >
                    Open t.me
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                {usernameDossier.liveTelegramProfile.bio && (
                  <div className="p-3 bg-slate-900/70 border border-slate-800 rounded-lg text-xs text-slate-300">
                    {usernameDossier.liveTelegramProfile.bio}
                  </div>
                )}

                {usernameDossier.extractedPhonesFromBio.length > 0 && (
                  <div className="text-xs text-emerald-400 font-mono">
                    Extracted Bio Phone(s): {usernameDossier.extractedPhonesFromBio.join(', ')}
                  </div>
                )}
              </div>

              <div className="bg-[#0B1120] border border-slate-800 rounded-xl p-5 space-y-3">
                <div className="text-xs font-semibold text-slate-200">
                  Weighted Carrier Prefix Candidate Generator
                </div>
                <div className="divide-y divide-slate-800 text-xs">
                  {usernameDossier.prefixGeneratorMatrix.map((row) => (
                    <div key={row.country} className="py-2.5 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-200">{row.country}</span>
                        <span className="text-slate-400">{row.operator}</span>
                      </div>
                      <div className="font-mono text-slate-300">
                        Sample Candidates: {row.sampleGenerated.join(' · ')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {usernameDossier.dorks.map((d) => (
                  <a
                    key={d.platform}
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg"
                  >
                    {d.label}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* 4. ADVANCE NUMBER / PRO OSINT RESULT VIEW */}
          {!loading && numberDossier && (
            <div className="space-y-4">
              {numberDossier.advRecords.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 bg-[#0B1120] border border-slate-800 rounded-xl">
                  Zero subscriber records found for this mobile number.
                </div>
              ) : (
                <div className="space-y-3">
                  {numberDossier.advRecords.map((rec, idx) => {
                    const rk = `adv-${idx}`;
                    return (
                      <div
                        key={rk}
                        className="bg-[#0B1120] border border-slate-800 rounded-xl p-4 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-100">
                            {idx + 1}. {rec.name}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopy(
                                rk,
                                `${rec.name} | ${rec.fatherOrGuardian} | ${rec.circle} | ${rec.address}`
                              )
                            }
                            className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                          >
                            {copiedKey === rk ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            Copy
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-slate-300 font-mono">
                          {rec.fatherOrGuardian && <div>Father/Rel: {rec.fatherOrGuardian}</div>}
                          {rec.circle && <div>Circle: {rec.circle}</div>}
                          {rec.alternateNumber && <div>Alt Mobile: {rec.alternateNumber}</div>}
                          {rec.email && <div>Email: {rec.email}</div>}
                        </div>

                        {rec.address && (
                          <div className="text-xs text-slate-400 pt-1 border-t border-slate-800/80">
                            Address: {rec.address}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 5. INSTAGRAM / PHOTO / STRESS OUTPUTS */}
          {!loading && instaData && (
            <pre className="p-4 bg-[#0B1120] border border-slate-800 rounded-xl text-xs font-mono text-slate-300 overflow-x-auto max-h-80">
              {JSON.stringify(instaData, null, 2)}
            </pre>
          )}

          {!loading && photoEditedUrl && (
            <div className="p-4 bg-[#0B1120] border border-slate-800 rounded-xl space-y-2">
              <div className="text-xs font-semibold text-emerald-400">Processed Image Ready</div>
              <a
                href={photoEditedUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-200 underline break-all"
              >
                {photoEditedUrl}
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              </a>
            </div>
          )}

          {!loading && bomberReport && (
            <div className="bg-[#0B1120] border border-slate-800 rounded-xl p-5 grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-xs text-slate-400">OK Gateways</div>
                <div className="mt-1 text-lg font-mono font-semibold text-emerald-400 tabular-nums">
                  {bomberReport.success}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Failed Gateways</div>
                <div className="mt-1 text-lg font-mono font-semibold text-slate-300 tabular-nums">
                  {bomberReport.failed}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Success Rate</div>
                <div className="mt-1 text-lg font-mono font-semibold text-slate-100 tabular-nums">
                  {bomberReport.successRate}%
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
