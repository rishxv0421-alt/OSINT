import React, { useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Search,
  Upload,
} from 'lucide-react';
import {
  AadhaarOcrResult,
  UpiOsintDossier,
  UsernameReconDossier,
} from '../types.ts';

interface ReconToolsViewProps {
  onLookupComplete?: () => void;
}

type SubModule = 'upi' | 'ocr' | 'username' | 'social';

export const ReconToolsView: React.FC<ReconToolsViewProps> = ({ onLookupComplete }) => {
  const [subModule, setSubModule] = useState<SubModule>('upi');

  // 1. UPI OSINT state
  const [upiInput, setUpiInput] = useState('9876543210');
  const [upiLoading, setUpiLoading] = useState(false);
  const [upiResult, setUpiResult] = useState<UpiOsintDossier | null>(null);
  const [upiError, setUpiError] = useState<string | null>(null);
  const [copiedVpa, setCopiedVpa] = useState<string | null>(null);

  // 2. Aadhaar Vision OCR state
  const [ocrUrlInput, setOcrUrlInput] = useState('');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState<AadhaarOcrResult | null>(null);
  const [ocrPreview, setOcrPreview] = useState<string | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // 3. Username -> Number state
  const [userHandle, setUserHandle] = useState('@RISXAVHAXXKBOT');
  const [userLoading, setUserLoading] = useState(false);
  const [userResult, setUserResult] = useState<UsernameReconDossier | null>(null);
  const [userError, setUserError] = useState<string | null>(null);

  // 4. Instagram & Photo Lab state
  const [instaUser, setInstaUser] = useState('');
  const [instaLoading, setInstaLoading] = useState(false);
  const [instaResult, setInstaResult] = useState<Record<string, unknown> | null>(null);
  const [instaError, setInstaError] = useState<string | null>(null);

  const [photoUrl, setPhotoUrl] = useState('');
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoEditedUrl, setPhotoEditedUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const handleUpiLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!upiInput.trim()) return;
    setUpiLoading(true);
    setUpiError(null);
    setUpiResult(null);
    try {
      const res = await fetch('/api/osint/upi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: upiInput }),
      });
      const data = await res.json();
      if (!res.ok) setUpiError(data.error || 'UPI ID lookup failed.');
      else {
        setUpiResult(data as UpiOsintDossier);
        onLookupComplete?.();
      }
    } catch {
      setUpiError('Network error contacting RISXAV UPI OSINT engine.');
    } finally {
      setUpiLoading(false);
    }
  };

  const handleUploadOcrImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrLoading(true);
    setOcrError(null);
    setOcrResult(null);
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result || '');
      setOcrPreview(dataUrl);
      try {
        const res = await fetch('/api/osint/aadhaar-ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: dataUrl }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) setOcrError(data.error || 'Aadhaar OCR extraction failed.');
        else {
          setOcrResult(data as AadhaarOcrResult);
          onLookupComplete?.();
        }
      } catch {
        setOcrError('Network error during Aadhaar Vision OCR.');
      } finally {
        setOcrLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSampleOcr = async (sampleFile: 'aadhaar_front_example.png' | 'aadhaar_back_example.png') => {
    setOcrLoading(true);
    setOcrError(null);
    setOcrResult(null);
    setOcrPreview(`/ocr_samples/${sampleFile}`);
    try {
      const res = await fetch('/api/osint/aadhaar-ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sampleFile }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) setOcrError(data.error || 'Sample OCR failed.');
      else {
        setOcrResult(data as AadhaarOcrResult);
        onLookupComplete?.();
      }
    } catch {
      setOcrError('Network error during sample OCR.');
    } finally {
      setOcrLoading(false);
    }
  };

  const handleUrlOcr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ocrUrlInput.trim()) return;
    setOcrLoading(true);
    setOcrError(null);
    setOcrResult(null);
    setOcrPreview(ocrUrlInput.trim());
    try {
      const res = await fetch('/api/osint/aadhaar-ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: ocrUrlInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) setOcrError(data.error || 'Image URL OCR failed.');
      else {
        setOcrResult(data as AadhaarOcrResult);
        onLookupComplete?.();
      }
    } catch {
      setOcrError('Network error fetching image URL for OCR.');
    } finally {
      setOcrLoading(false);
    }
  };

  const handleUsernameRecon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userHandle.trim()) return;
    setUserLoading(true);
    setUserError(null);
    setUserResult(null);
    try {
      const res = await fetch('/api/osint/username-number', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: userHandle }),
      });
      const data = await res.json();
      if (!res.ok) setUserError(data.error || 'Username recon failed.');
      else {
        setUserResult(data as UsernameReconDossier);
        onLookupComplete?.();
      }
    } catch {
      setUserError('Network error contacting RISXAV Username Recon engine.');
    } finally {
      setUserLoading(false);
    }
  };

  const handleInstaLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instaUser.trim()) return;
    setInstaLoading(true);
    setInstaError(null);
    setInstaResult(null);
    try {
      const res = await fetch('/api/osint/instagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: instaUser }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setInstaError(data.error || 'Instagram profile lookup failed.');
      } else {
        setInstaResult(data.data);
        onLookupComplete?.();
      }
    } catch {
      setInstaError('Network error contacting Instagram OSINT engine.');
    } finally {
      setInstaLoading(false);
    }
  };

  const handlePhotoProcess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!photoUrl.trim().startsWith('http')) {
      setPhotoError('Enter a valid http:// or https:// image URL.');
      return;
    }
    setPhotoLoading(true);
    setPhotoError(null);
    setPhotoEditedUrl(null);
    try {
      const res = await fetch('/api/osint/photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: photoUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok || !data.editedUrl) {
        setPhotoError(data.error || 'Photo pipeline returned no processed image URL.');
      } else {
        setPhotoEditedUrl(data.editedUrl);
        onLookupComplete?.();
      }
    } catch {
      setPhotoError('Network error contacting RISXAV Photo Pipeline.');
    } finally {
      setPhotoLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
            RISXAV HAXKK !! — Specialized OSINT Engines
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Dedicated workspace for UPI VPA Intelligence, Aadhaar Vision OCR, Telegram Username ➔ Number Recon, and Social Media Tools
          </p>
        </div>

        {/* Interactive Segmented Tab Selector */}
        <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-[#111827] border border-slate-800 rounded-xl shrink-0">
          {(
            [
              ['upi', '💠 UPI ID OSINT'],
              ['ocr', '🧿 Aadhaar Vision OCR'],
              ['username', '🔮 Username ➔ Number'],
              ['social', '🕯️ Social & Photo Lab'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSubModule(id)}
              className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                subModule === id
                  ? 'bg-emerald-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* MODULE 1: UPI ID OSINT */}
      {subModule === 'upi' && (
        <section className="bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">
              💠 UPI ID & NPCI Bank Handle Intelligence
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Maps 35+ NPCI PSP handles (PhonePe, Google Pay, Paytm, BHIM, Amazon Pay, WhatsApp Pay) and correlates telecom subscriber ownership
            </p>
          </div>

          <form onSubmit={handleUpiLookup} className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={upiInput}
              onChange={(e) => setUpiInput(e.target.value)}
              placeholder="Enter 10-digit phone or UPI ID (e.g. 9876543210 or 9876543210@ybl)"
              className="flex-1 px-4 py-2.5 bg-[#0B1120] border border-slate-800 focus:border-emerald-500 focus:outline-none rounded-lg text-sm font-mono text-slate-100 placeholder:text-slate-500"
            />
            <button
              type="submit"
              disabled={upiLoading}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold text-slate-950 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Search className="w-4 h-4" />
              {upiLoading ? 'Mapping VPAs...' : 'Scan UPI Handles'}
            </button>
          </form>

          {upiError && (
            <div className="p-3.5 rounded-lg bg-red-950/40 border border-red-900/60 text-xs text-red-300">
              {upiError}
            </div>
          )}

          {upiResult && (
            <div className="space-y-5 pt-2 border-t border-slate-800">
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                <span>
                  Correlated Subscriber:{' '}
                  <strong className="text-emerald-400">
                    {upiResult.subscriberCorrelatedName || 'Unlisted'}
                  </strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>Circle: {upiResult.subscriberCircle || 'NPCI Direct'}</span>
                <span aria-hidden="true">·</span>
                <span>Mapped Handles: {upiResult.vpaCandidates.length}</span>
                <span aria-hidden="true">·</span>
                <span>{upiResult.durationMs} ms</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {upiResult.vpaCandidates.map((item) => (
                  <div
                    key={item.vpa}
                    className="bg-[#0B1120] rounded-lg p-3.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-mono font-semibold text-slate-100 truncate">
                        {item.vpa}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">
                        {item.psp} · {item.bank}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(item.vpa);
                        setCopiedVpa(item.vpa);
                        setTimeout(() => setCopiedVpa(null), 1500);
                      }}
                      className="p-1.5 text-slate-400 hover:text-slate-100 rounded hover:bg-slate-800 cursor-pointer shrink-0"
                      title="Copy UPI ID"
                    >
                      {copiedVpa === item.vpa ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* MODULE 2: AADHAAR VISION OCR */}
      {subModule === 'ocr' && (
        <section className="bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">
                🧿 Aadhaar Card Vision OCR & Verhoeff UID Validator
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Upload front or back Aadhaar card image to extract Name, DOB, Gender, 12-Digit UID, Mobile, and Address
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handleUploadOcrImage}
                className="hidden"
              />
              <button
                type="button"
                disabled={ocrLoading}
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                Upload Card Photo
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-400">Try Bundled Sample Cards:</span>
            <button
              type="button"
              disabled={ocrLoading}
              onClick={() => handleSampleOcr('aadhaar_front_example.png')}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              Scan Front Sample
            </button>
            <button
              type="button"
              disabled={ocrLoading}
              onClick={() => handleSampleOcr('aadhaar_back_example.png')}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              Scan Back Address Sample
            </button>
          </div>

          <form onSubmit={handleUrlOcr} className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={ocrUrlInput}
              onChange={(e) => setOcrUrlInput(e.target.value)}
              placeholder="Or paste direct https:// card image URL"
              className="flex-1 px-4 py-2.5 bg-[#0B1120] border border-slate-800 focus:border-emerald-500 focus:outline-none rounded-lg text-sm font-mono text-slate-100 placeholder:text-slate-500"
            />
            <button
              type="submit"
              disabled={ocrLoading}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              {ocrLoading ? 'Running Vision OCR...' : 'Scan Image URL'}
            </button>
          </form>

          {ocrError && (
            <div className="p-3.5 rounded-lg bg-red-950/40 border border-red-900/60 text-xs text-red-300">
              {ocrError}
            </div>
          )}

          {ocrLoading && (
            <div className="h-28 bg-slate-800/50 rounded-xl animate-pulse" />
          )}

          {!ocrLoading && ocrResult && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-4 border-t border-slate-800">
              {ocrPreview && (
                <div className="lg:col-span-5 bg-[#0B1120] rounded-xl p-4 flex items-center justify-center">
                  <img
                    src={ocrPreview}
                    alt="Scanned Card"
                    referrerPolicy="no-referrer"
                    className="max-h-60 rounded-lg object-contain"
                  />
                </div>
              )}

              <div className={`${ocrPreview ? 'lg:col-span-7' : 'lg:col-span-12'} space-y-3`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-400">
                    Extracted OCR Dossier ({ocrResult.confidence}% Confidence)
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
                      a.download = `risxav_aadhaar_ocr_${Date.now()}.json`;
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
                  <div className="py-2.5 flex justify-between gap-4">
                    <span className="text-slate-400">Holder Name</span>
                    <span className="font-mono text-slate-100">{ocrResult.extractedName || 'Not detected'}</span>
                  </div>
                  <div className="py-2.5 flex justify-between gap-4">
                    <span className="text-slate-400">DOB / Year of Birth</span>
                    <span className="font-mono text-slate-100">{ocrResult.extractedDob || 'Not detected'}</span>
                  </div>
                  <div className="py-2.5 flex justify-between gap-4">
                    <span className="text-slate-400">Gender</span>
                    <span className="font-mono text-slate-100">{ocrResult.extractedGender || 'Not detected'}</span>
                  </div>
                  <div className="py-2.5 flex justify-between gap-4">
                    <span className="text-slate-400">12-Digit Aadhaar UID</span>
                    <span className="font-mono font-semibold text-emerald-400">
                      {ocrResult.extractedAadhaar || 'Not detected'}
                    </span>
                  </div>
                  <div className="py-2.5 flex justify-between gap-4">
                    <span className="text-slate-400">Verhoeff Checksum</span>
                    <span className="font-mono text-slate-200">
                      {ocrResult.extractedAadhaar
                        ? ocrResult.aadhaarChecksumValid
                          ? 'Cryptographically Valid'
                          : 'Checksum Mismatch'
                        : '—'}
                    </span>
                  </div>
                  {ocrResult.extractedAddress && (
                    <div className="py-2.5 space-y-1">
                      <div className="text-slate-400">Address</div>
                      <div className="font-mono text-slate-200">{ocrResult.extractedAddress}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* MODULE 3: USERNAME -> NUMBER RECON */}
      {subModule === 'username' && (
        <section className="bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">
              🔮 Telegram Username ➔ Number & Profile Recon
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Scrapes live public Telegram handle metadata, extracts embedded phone numbers/links, and generates weighted carrier prefix candidates
            </p>
          </div>

          <form onSubmit={handleUsernameRecon} className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={userHandle}
              onChange={(e) => setUserHandle(e.target.value)}
              placeholder="Enter Telegram @username (e.g. @RISXAVHAXXKBOT)"
              className="flex-1 px-4 py-2.5 bg-[#0B1120] border border-slate-800 focus:border-emerald-500 focus:outline-none rounded-lg text-sm font-mono text-slate-100 placeholder:text-slate-500"
            />
            <button
              type="submit"
              disabled={userLoading}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold text-slate-950 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Search className="w-4 h-4" />
              {userLoading ? 'Scanning Handle...' : 'Run Username Recon'}
            </button>
          </form>

          {userError && (
            <div className="p-3.5 rounded-lg bg-red-950/40 border border-red-900/60 text-xs text-red-300">
              {userError}
            </div>
          )}

          {userResult && (
            <div className="space-y-5 pt-4 border-t border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-base font-semibold text-slate-100">
                    @{userResult.handle}
                  </div>
                  <div className="text-xs text-slate-400">
                    {userResult.liveTelegramProfile.exists
                      ? `Active Telegram Profile · ${userResult.liveTelegramProfile.displayName || ''}`
                      : 'Handle unclaimed or private'}
                  </div>
                </div>
                <a
                  href={userResult.profileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg"
                >
                  Open t.me/{userResult.handle}
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              {userResult.liveTelegramProfile.bio && (
                <div className="p-4 bg-[#0B1120] rounded-lg text-xs text-slate-300">
                  {userResult.liveTelegramProfile.bio}
                </div>
              )}

              {userResult.extractedPhonesFromBio.length > 0 && (
                <div className="text-xs font-mono text-emerald-400">
                  Extracted Bio Phone(s): {userResult.extractedPhonesFromBio.join(' · ')}
                </div>
              )}

              <div className="divide-y divide-slate-800 text-xs">
                {userResult.prefixGeneratorMatrix.map((row) => (
                  <div key={row.country} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="font-semibold text-slate-200">{row.country}</span>{' '}
                      <span className="text-slate-400">({row.operator})</span>
                    </div>
                    <div className="font-mono text-slate-300">
                      {row.sampleGenerated.join(' · ')}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                {userResult.dorks.map((d) => (
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
        </section>
      )}

      {/* MODULE 4: INSTAGRAM & AI PHOTO LAB */}
      {subModule === 'social' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <section className="bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-100">🕯️ Instagram Username Recon</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Fetches account metadata via the RISXAV HAXKK !! Instagram OSINT endpoint
              </p>
            </div>

            <form onSubmit={handleInstaLookup} className="flex gap-2.5">
              <input
                type="text"
                value={instaUser}
                onChange={(e) => setInstaUser(e.target.value)}
                placeholder="Enter Instagram @username"
                className="flex-1 px-3.5 py-2 bg-[#0B1120] border border-slate-800 focus:border-emerald-500 focus:outline-none rounded-lg text-sm font-mono text-slate-200 placeholder:text-slate-500"
              />
              <button
                type="submit"
                disabled={instaLoading}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-950 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                <Search className="w-3.5 h-3.5" />
                {instaLoading ? 'Fetching...' : 'Lookup'}
              </button>
            </form>

            {instaError && (
              <div className="p-3 rounded-lg bg-red-950/40 border border-red-900/60 text-xs text-red-300">
                {instaError}
              </div>
            )}

            {instaResult && (
              <pre className="p-4 bg-[#0B1120] rounded-lg text-xs font-mono text-slate-300 overflow-x-auto max-h-80">
                {JSON.stringify(instaResult, null, 2)}
              </pre>
            )}
          </section>

          <section className="bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-100">⚡ RISXAV AI Photo Lab</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Processes direct image URLs via the RHXVM PRO OSINT media pipeline
              </p>
            </div>

            <form onSubmit={handlePhotoProcess} className="flex gap-2.5">
              <input
                type="text"
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                placeholder="https://example.com/photo.jpg"
                className="flex-1 px-3.5 py-2 bg-[#0B1120] border border-slate-800 focus:border-emerald-500 focus:outline-none rounded-lg text-sm font-mono text-slate-200 placeholder:text-slate-500"
              />
              <button
                type="submit"
                disabled={photoLoading}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-950 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                {photoLoading ? 'Processing...' : 'Process URL'}
              </button>
            </form>

            {photoError && (
              <div className="p-3 rounded-lg bg-red-950/40 border border-red-900/60 text-xs text-red-300">
                {photoError}
              </div>
            )}

            {photoEditedUrl && (
              <div className="p-4 bg-[#0B1120] rounded-lg space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-emerald-400">Processed Output URL</span>
                  <a
                    href={photoEditedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-slate-300 hover:text-white"
                  >
                    Open Full Image
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
                <div className="text-xs font-mono text-slate-400 break-all">{photoEditedUrl}</div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
