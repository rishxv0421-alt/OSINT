import React, { useState } from 'react';
import {
  Copy,
  Check,
  Download,
  ExternalLink,
  Search,
  RotateCcw,
} from 'lucide-react';
import { CyberNumberDossier } from '../types.ts';

interface NumberScannerViewProps {
  onLookupComplete?: () => void;
}

export const NumberScannerView: React.FC<NumberScannerViewProps> = ({ onLookupComplete }) => {
  const [phoneInput, setPhoneInput] = useState('9876543210');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dossier, setDossier] = useState<CyberNumberDossier | null>(null);
  const [recordFilter, setRecordFilter] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleaned = phoneInput.replace(/\D/g, '');
    if (cleaned.length < 7) {
      setError('Enter a valid 10-digit mobile number (e.g. 9876543210).');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/osint/number', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: phoneInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Number intelligence query failed.');
      } else {
        setDossier(data as CyberNumberDossier);
        onLookupComplete?.();
      }
    } catch {
      setError('Network error while contacting number_adv intelligence endpoint.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(key);
    setTimeout(() => setCopiedId(null), 1600);
  };

  const handleDownloadJson = () => {
    if (!dossier) return;
    const blob = new Blob([JSON.stringify(dossier, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CYBER_DOSSIER_${dossier.clean10Digit}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredRecords = (dossier?.advRecords || []).filter((r) => {
    if (!recordFilter.trim()) return true;
    const q = recordFilter.toLowerCase();
    return (
      r.name.toLowerCase().includes(q) ||
      r.fatherOrGuardian.toLowerCase().includes(q) ||
      r.address.toLowerCase().includes(q) ||
      r.circle.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-8">
      {/* Search Bar Section */}
      <section className="bg-[#111827] border border-slate-800 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="space-y-1.5 max-w-2xl">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
              RISXAV HAXKK !! — Advance Number Intelligence
            </h1>
            <p className="text-sm text-slate-400">
              High-speed subscriber records, circle verification, WhatsApp endpoint status, Truecaller index, and targeted Google OSINT dorks powered by <span className="font-medium text-slate-200">RHXVM PRO OSINT</span>.
            </p>
          </div>
          {dossier && (
            <div className="flex items-center gap-2 shrink-0">
              {dossier.plainTextReport && (
                <button
                  type="button"
                  onClick={() => {
                    const ts = Math.floor(Date.now() / 1000);
                    const blob = new Blob([dossier.plainTextReport!], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `advance_number_info_+91${dossier.clean10Digit}_${ts}.txt`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download .TXT
                </button>
              )}
              <button
                type="button"
                onClick={handleDownloadJson}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Export .JSON
              </button>
            </div>
          )}
        </div>

        <form onSubmit={handleSearch} className="mt-6 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              placeholder="Enter 10-digit mobile number (e.g. 9876543210 or +919876543210)"
              className="w-full pl-10 pr-4 py-2.5 bg-[#0B1120] border border-slate-800 focus:border-emerald-500 focus:outline-none rounded-lg text-sm font-mono text-slate-100 placeholder:text-slate-500 tabular-nums"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-slate-950 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Search className="w-4 h-4" />
            {loading ? 'Scanning Nodes...' : 'Run Number Lookup'}
          </button>
          <button
            type="button"
            onClick={() => {
              setPhoneInput('');
              setDossier(null);
              setError(null);
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-300 bg-slate-800/70 hover:bg-slate-800 border border-slate-700/80 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            Clear
          </button>
        </form>

        {error && (
          <div className="mt-4 p-3.5 rounded-lg bg-red-950/40 border border-red-900/60 text-sm text-red-300">
            {error}
          </div>
        )}
      </section>

      {/* Loading Skeleton */}
      {loading && (
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-4">
          <div className="h-5 w-56 bg-slate-800 rounded animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-16 bg-slate-800/60 rounded-lg animate-pulse" />
            ))}
          </div>
          <div className="space-y-2 pt-2">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-11 bg-slate-800/50 rounded animate-pulse" />
            ))}
          </div>
        </div>
      )}

      {/* Empty Initial State */}
      {!loading && !dossier && (
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-10 text-center space-y-3">
          <h2 className="text-base font-medium text-slate-200">
            Ready for Subscriber & OSINT Verification
          </h2>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            Submit any 10-digit mobile number above or send it directly to <span className="font-mono text-slate-200">@RISXAVHAXXKBOT</span> on Telegram to generate a full telecom and social intelligence dossier.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => handleSearch()}
              className="px-4 py-2 text-xs font-medium text-slate-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg transition-colors cursor-pointer"
            >
              Scan Sample Number (9876543210)
            </button>
          </div>
        </div>
      )}

      {/* Populated Dossier View */}
      {!loading && dossier && (
        <>
          {/* Summary Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#111827] border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400">Target Number</div>
              <div className="mt-1 text-lg font-semibold font-mono text-slate-100 tabular-nums">
                {dossier.internationalFormat}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {dossier.carrierMeta.country} · {dossier.carrierMeta.type}
              </div>
            </div>

            <div className="bg-[#111827] border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400">Matched Telecom Records</div>
              <div className="mt-1 text-lg font-semibold font-mono text-emerald-400 tabular-nums">
                {dossier.advRecords.length}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {dossier.uniqueNames.length} distinct subscriber name(s)
              </div>
            </div>

            <div className="bg-[#111827] border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400">Detected Circles</div>
              <div className="mt-1 text-sm font-medium text-slate-200 truncate">
                {dossier.uniqueCircles.length > 0 ? dossier.uniqueCircles.join(' · ') : 'Not listed'}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {dossier.uniqueEmails.length} associated email(s)
              </div>
            </div>

            <div className="bg-[#111827] border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400">Query Response Time</div>
              <div className="mt-1 text-lg font-semibold font-mono text-slate-100 tabular-nums">
                {dossier.durationMs} ms
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Source: {dossier.apiSourceStatus === 'live' ? 'Records Verified' : dossier.apiSourceStatus === 'empty' ? 'Zero Matches' : 'Upstream Error'}
              </div>
            </div>
          </div>

          {/* Subscriber Records Table */}
          <section className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-100">
                  Subscriber Identity Records (number_adv)
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Normalized and deduplicated telecom records with address formatting
                </p>
              </div>
              <input
                type="text"
                value={recordFilter}
                onChange={(e) => setRecordFilter(e.target.value)}
                placeholder="Filter by name, circle, or city..."
                className="px-3 py-1.5 bg-[#0B1120] border border-slate-800 focus:border-emerald-500 focus:outline-none rounded-lg text-xs text-slate-200 placeholder:text-slate-500 w-full sm:w-64"
              />
            </div>

            {filteredRecords.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400">
                No subscriber records matched this query or filter.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-xs font-medium text-slate-400 bg-slate-900/40">
                      <th className="py-3 px-4">Subscriber Name</th>
                      <th className="py-3 px-4">Father / Guardian</th>
                      <th className="py-3 px-4">Telecom Circle</th>
                      <th className="py-3 px-4">Alt / Doc ID / Email</th>
                      <th className="py-3 px-4">Registered Address</th>
                      <th className="py-3 px-4 text-right">Copy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 text-sm">
                    {filteredRecords.map((rec, idx) => {
                      const rowKey = `rec-${idx}`;
                      return (
                        <tr key={rowKey} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-3 px-4 font-medium text-slate-100 whitespace-nowrap">
                            {rec.name}
                          </td>
                          <td className="py-3 px-4 text-slate-300 whitespace-nowrap">
                            {rec.fatherOrGuardian || '—'}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-slate-300 whitespace-nowrap">
                            {rec.circle || '—'}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-slate-300 space-y-0.5">
                            {rec.alternateNumber && <div>Alt: {rec.alternateNumber}</div>}
                            {rec.documentId && <div>ID: {rec.documentId}</div>}
                            {rec.email && <div>Email: {rec.email}</div>}
                            {!rec.alternateNumber && !rec.documentId && !rec.email && '—'}
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-300 max-w-md leading-relaxed">
                            {rec.address || '—'}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                handleCopy(
                                  rowKey,
                                  `${rec.name} | Father: ${rec.fatherOrGuardian} | Circle: ${rec.circle} | Address: ${rec.address}`
                                )
                              }
                              className="inline-flex items-center justify-center p-1.5 text-slate-400 hover:text-slate-100 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                              title="Copy record"
                            >
                              {copiedId === rowKey ? (
                                <Check className="w-4 h-4 text-emerald-400" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* OSINT & Social Cross-Links Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Direct Messaging & Caller Endpoints */}
            <section className="bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-4">
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  Direct Platform Endpoints (Phone_Trace OSINT)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Cross-platform account verification links for +91 {dossier.clean10Digit}
                </p>
              </div>

              <div className="divide-y divide-slate-800 text-sm">
                <div className="py-3 flex items-center justify-between gap-4">
                  <div>
                    <div className="font-medium text-slate-200">WhatsApp Endpoint</div>
                    <div className="text-xs text-slate-400">
                      Status:{' '}
                      {dossier.socialPresence.whatsapp.reachable === true
                        ? 'Reachable Endpoint'
                        : dossier.socialPresence.whatsapp.reachable === false
                        ? 'Unregistered'
                        : 'Ready for Verification'}
                    </div>
                  </div>
                  <a
                    href={dossier.socialPresence.whatsapp.chatUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    Open wa.me
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                <div className="py-3 flex items-center justify-between gap-4">
                  <div>
                    <div className="font-medium text-slate-200">Telegram Direct Resolver</div>
                    <div className="text-xs text-slate-400 font-mono">
                      {dossier.socialPresence.telegramUrl}
                    </div>
                  </div>
                  <a
                    href={dossier.socialPresence.telegramUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    Open Telegram
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                <div className="py-3 flex items-center justify-between gap-4">
                  <div>
                    <div className="font-medium text-slate-200">Truecaller Web Directory</div>
                    <div className="text-xs text-slate-400">
                      {dossier.socialPresence.truecallerWeb.found && dossier.socialPresence.truecallerWeb.name
                        ? `Matched Name: ${dossier.socialPresence.truecallerWeb.name}`
                        : 'Public directory web lookup'}
                    </div>
                  </div>
                  <a
                    href={dossier.socialPresence.truecallerWeb.searchUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    Search Truecaller
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                <div className="py-3 flex items-center justify-between gap-4">
                  <div>
                    <div className="font-medium text-slate-200">Skype Public Directory</div>
                    <div className="text-xs text-slate-400">Check linked Microsoft / Skype handle</div>
                  </div>
                  <a
                    href={dossier.socialPresence.skypeSearchUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    Search Skype
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </section>

            {/* Google Dorks Matrix */}
            <section className="bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-4">
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  Google OSINT Search Dorks
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Pre-compiled search operators for public documents, social bios, and paste indexes
                </p>
              </div>

              <div className="divide-y divide-slate-800 text-sm">
                {dossier.dorks.map((dork) => (
                  <div key={dork.platform} className="py-2.5 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-200">{dork.label}</div>
                      <div className="text-xs font-mono text-slate-500 truncate">{dork.query}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleCopy(dork.platform, dork.query)}
                        className="p-1.5 text-slate-400 hover:text-slate-100 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Copy dork query"
                      >
                        {copiedId === dork.platform ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <a
                        href={dork.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded transition-colors whitespace-nowrap"
                      >
                        Launch
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
};
