import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { BotCommandStudioView } from './components/BotCommandStudioView.tsx';
import { NumberScannerView } from './components/NumberScannerView.tsx';
import { ReconToolsView } from './components/ReconToolsView.tsx';
import { RhxvmProOsintView } from './components/RhxvmProOsintView.tsx';
import { UsersAndLogsView } from './components/UsersAndLogsView.tsx';
import { BotOverviewResponse } from './types.ts';

type ActiveTab = 'rhxvm_pro' | 'scanner' | 'bot_studio' | 'recon_tools' | 'users_logs';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('rhxvm_pro');
  const [overview, setOverview] = useState<BotOverviewResponse | null>(null);

  const fetchOverview = useCallback(async () => {
    try {
      const res = await fetch('/api/bot/overview');
      if (res.ok) {
        const data = (await res.json()) as BotOverviewResponse;
        setOverview(data);
      }
    } catch {
      // ignore transient error
    }
  }, []);

  useEffect(() => {
    fetchOverview();
    const interval = setInterval(fetchOverview, 12000);
    return () => clearInterval(interval);
  }, [fetchOverview]);

  const botUsername = overview?.botStatus.bot?.username || 'RISXAVHAXXKBOT';

  return (
    <div className="min-h-screen bg-[#0B1120] text-slate-100 flex flex-col">
      {/* Strict 3-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-[#0B1120] border-b border-slate-800/90">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-8 px-6 py-4">
          {/* Zone 1: Single-Line Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('rhxvm_pro')}
            className="text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0 cursor-pointer font-display"
          >
            RISXAV HAXKK !!
          </button>

          {/* Zone 2: 5 Concise Single-Line Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
            <button
              type="button"
              onClick={() => setActiveTab('rhxvm_pro')}
              className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer pb-0.5 ${
                activeTab === 'rhxvm_pro'
                  ? 'text-slate-100 underline underline-offset-8 decoration-emerald-400 decoration-2'
                  : 'hover:text-slate-200'
              }`}
            >
              RHXVM PRO OSINT
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('scanner')}
              className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer pb-0.5 ${
                activeTab === 'scanner'
                  ? 'text-slate-100 underline underline-offset-8 decoration-emerald-400 decoration-2'
                  : 'hover:text-slate-200'
              }`}
            >
              Advance Number
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('bot_studio')}
              className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer pb-0.5 ${
                activeTab === 'bot_studio'
                  ? 'text-slate-100 underline underline-offset-8 decoration-emerald-400 decoration-2'
                  : 'hover:text-slate-200'
              }`}
            >
              Welcome & Bot
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('recon_tools')}
              className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer pb-0.5 ${
                activeTab === 'recon_tools'
                  ? 'text-slate-100 underline underline-offset-8 decoration-emerald-400 decoration-2'
                  : 'hover:text-slate-200'
              }`}
            >
              UPI · OCR · User
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('users_logs')}
              className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer pb-0.5 ${
                activeTab === 'users_logs'
                  ? 'text-slate-100 underline underline-offset-8 decoration-emerald-400 decoration-2'
                  : 'hover:text-slate-200'
              }`}
            >
              Operators
            </button>
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="flex items-center shrink-0">
            <a
              href={`https://t.me/${botUsername}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Open @{botUsername}
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </header>

      {/* Mobile Segmented Navigation */}
      <div className="md:hidden border-b border-slate-800 bg-[#0F172A] px-4 py-2.5 overflow-x-auto">
        <div className="flex items-center gap-1.5 min-w-max">
          {(
            [
              ['rhxvm_pro', 'RHXVM PRO OSINT'],
              ['scanner', 'Advance Number'],
              ['bot_studio', 'Welcome & Bot'],
              ['recon_tools', 'UPI · OCR · User'],
              ['users_logs', 'Operators'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === id
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Unboxed Clean Metadata Strip */}
      <div className="border-b border-slate-800/80 bg-[#0F172A]/60">
        <div className="max-w-7xl mx-auto px-6 py-3 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-200">RISXAV HAXKK !!</span>
            <span aria-hidden="true">·</span>
            <span>Bot: @{botUsername}</span>
            <span aria-hidden="true">·</span>
            <span>Owner: {overview?.settings.owner_contact || '@RHXVM'}</span>
            <span aria-hidden="true">·</span>
            <span>Polling: {overview?.botStatus.running ? 'Active' : 'Paused'}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 font-mono tabular-nums">
            <span>Operators: {overview?.stats.totalUsers ?? 0}</span>
            <span aria-hidden="true">·</span>
            <span>Scans: {overview?.stats.totalQueries ?? 0}</span>
            <span aria-hidden="true">·</span>
            <span>Bot Events: {overview?.botStatus.processedUpdatesCount ?? 0}</span>
          </div>
        </div>
      </div>

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        {activeTab === 'rhxvm_pro' && (
          <RhxvmProOsintView overview={overview} onLookupComplete={fetchOverview} />
        )}
        {activeTab === 'scanner' && (
          <NumberScannerView onLookupComplete={fetchOverview} />
        )}
        {activeTab === 'bot_studio' && (
          <BotCommandStudioView overview={overview} onRefresh={fetchOverview} />
        )}
        {activeTab === 'recon_tools' && <ReconToolsView onLookupComplete={fetchOverview} />}
        {activeTab === 'users_logs' && <UsersAndLogsView />}
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-800/80 py-5 px-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>RISXAV HAXKK !! — RHXVM PRO OSINT Cyber Suite</span>
          <span>Official Bot: @{botUsername} · Owner: {overview?.settings.owner_contact || '@RHXVM'}</span>
        </div>
      </footer>
    </div>
  );
}
