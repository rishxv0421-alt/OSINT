import React, { useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Film,
  Play,
  RefreshCw,
  Save,
  Send,
  Square,
  Trash2,
  Upload,
} from 'lucide-react';
import { BotOverviewResponse } from '../types.ts';

interface BotCommandStudioViewProps {
  overview: BotOverviewResponse | null;
  onRefresh: () => void;
}

const DEFAULT_VIDEOS = [
  'risxav_vertical_promo.mp4',
  'risxav_cyber_promo.mp4',
  'risxav_sukuna_crimson.mp4',
  'risxav_illuminati_edit.mp4',
];

const TAB_KEYBOARD_PREVIEW = [
  ['👁️‍🗨️ Advance Number Info', '🔺 RHXVM PRO OSINT'],
  ['💠 UPI ID OSINT', '🧿 Aadhaar Vision OCR'],
  ['🔮 Username ➔ Number', '🕯️ Instagram Recon'],
  ['⚡ AI Photo Lab', '🔱 Gateway Stress'],
  ['⚜️ Operator Profile', '💎 Daily Credits'],
];

export const BotCommandStudioView: React.FC<BotCommandStudioViewProps> = ({
  overview,
  onRefresh,
}) => {
  const [introMsg, setIntroMsg] = useState(overview?.settings.intro_msg || '');
  const [ownerContact, setOwnerContact] = useState(
    overview?.settings.owner_contact || '@RHXVM'
  );
  const [forceChannel, setForceChannel] = useState(
    overview?.settings.force_channel || 'RISXAVHAXXK'
  );
  const [forceGroup, setForceGroup] = useState(
    overview?.settings.force_group || 'RHXVM_PRO_OSINT'
  );
  const [forceJoin, setForceJoin] = useState(overview?.settings.force_join === '1');
  const [welcomeVideoEnabled, setWelcomeVideoEnabled] = useState(
    overview?.settings.welcome_video_enabled !== '0'
  );
  const [welcomeVideoMode, setWelcomeVideoMode] = useState(
    overview?.settings.welcome_video_mode || 'risxav_vertical_promo.mp4'
  );
  const [previewVideoFile, setPreviewVideoFile] = useState('risxav_vertical_promo.mp4');

  // Custom Anime / Sukuna Promo Video Editor state
  const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null);
  const [promoTheme, setPromoTheme] = useState<'sukuna_crimson' | 'hologram_cyan' | 'illuminati_emerald'>('sukuna_crimson');
  const [promoAspect, setPromoAspect] = useState<'auto' | 'vertical' | 'landscape'>('auto');
  const [promoDurationMode, setPromoDurationMode] = useState<'welcome_12s' | 'full'>('welcome_12s');
  const [renderingVideo, setRenderingVideo] = useState(false);
  const [renderStatus, setRenderStatus] = useState<string | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [botControlLoading, setBotControlLoading] = useState(false);

  const [broadcastText, setBroadcastText] = useState('');
  const [broadcastStatus, setBroadcastStatus] = useState<string | null>(null);

  const [pythonExport, setPythonExport] = useState<{
    filename: string;
    code: string;
    requirements: string;
  } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  React.useEffect(() => {
    if (overview?.settings) {
      setIntroMsg(overview.settings.intro_msg || '');
      setOwnerContact(overview.settings.owner_contact || '@RHXVM');
      setForceChannel(overview.settings.force_channel || 'RISXAVHAXXK');
      setForceGroup(overview.settings.force_group || 'RHXVM_PRO_OSINT');
      setForceJoin(overview.settings.force_join === '1');
      setWelcomeVideoEnabled(overview.settings.welcome_video_enabled !== '0');
      const mode = overview.settings.welcome_video_mode || 'risxav_vertical_promo.mp4';
      setWelcomeVideoMode(mode);
      if (mode !== 'random') {
        setPreviewVideoFile(mode);
      }
    }
  }, [overview?.settings]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveNotice(null);
    try {
      const res = await fetch('/api/bot/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intro_msg: introMsg,
          owner_contact: ownerContact,
          force_channel: forceChannel,
          force_group: forceGroup,
          force_join: forceJoin ? '1' : '0',
          welcome_video_enabled: welcomeVideoEnabled ? '1' : '0',
          welcome_video_mode: welcomeVideoMode,
        }),
      });
      if (res.ok) {
        setSaveNotice('Saved live to @RISXAVHAXXKBOT · Owner: @RHXVM.');
        onRefresh();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleRenderCustomPromoVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVideoFile) {
      setRenderStatus('Please choose an MP4 video file first (e.g. your Sukuna anime edit).');
      return;
    }

    setRenderingVideo(true);
    setRenderStatus('Compositing Holographic @RISXAVHAXXKBOT + @RHXVM + 6 OSINT Feature HUDs onto your video...');

    try {
      const form = new FormData();
      form.append('video', selectedVideoFile);
      form.append('theme', promoTheme);
      form.append('aspect', promoAspect);
      form.append('durationMode', promoDurationMode);
      form.append('botHandle', `@${botUsername}`);
      form.append('ownerHandle', ownerContact || '@RHXVM');
      form.append('setAsWelcome', 'true');

      const res = await fetch('/api/bot/render-promo-video', {
        method: 'POST',
        body: form,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setRenderStatus(data.error || 'Video render failed.');
      } else {
        const fname = data.rendered.filename as string;
        setPreviewVideoFile(fname);
        setWelcomeVideoMode(fname);
        setSelectedVideoFile(null);
        if (videoInputRef.current) videoInputRef.current.value = '';
        setRenderStatus(`Rendered ${fname} (${data.rendered.durationSec.toFixed(1)}s) & locked as active /start Welcome Video!`);
        onRefresh();
      }
    } catch {
      setRenderStatus('Network error uploading/rendering promo video.');
    } finally {
      setRenderingVideo(false);
    }
  };

  const handleDeleteWelcomeVideo = async (vidName: string) => {
    try {
      const res = await fetch(`/api/bot/welcome-video/${encodeURIComponent(vidName)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        onRefresh();
      }
    } catch {
      // ignore
    }
  };

  const handleBotControl = async (action: 'start' | 'stop' | 'restart') => {
    setBotControlLoading(true);
    try {
      await fetch('/api/bot/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      onRefresh();
    } finally {
      setBotControlLoading(false);
    }
  };

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastText.trim()) return;
    setBroadcastStatus('Sending broadcast...');
    try {
      const res = await fetch('/api/bot/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: broadcastText }),
      });
      const data = await res.json();
      if (res.ok) {
        setBroadcastStatus(`Delivered to ${data.sent} operator(s) · Failed: ${data.failed}`);
        setBroadcastText('');
      } else {
        setBroadcastStatus(data.error || 'Broadcast failed.');
      }
    } catch {
      setBroadcastStatus('Network error during broadcast.');
    }
  };

  const handleLoadPythonExport = async () => {
    const res = await fetch('/api/bot/export-python');
    if (res.ok) {
      const data = await res.json();
      setPythonExport(data);
    }
  };

  const handleDownloadPython = () => {
    if (!pythonExport) return;
    const blob = new Blob([pythonExport.code], { type: 'text/x-python' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = pythonExport.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const botUsername = overview?.botStatus.bot?.username || 'RISXAVHAXXKBOT';
  const botDisplayName = 'RISXAV HAXKK !!';
  const isRunning = overview?.botStatus.running ?? false;
  const availableVideos =
    overview?.botStatus.welcomeVideos && overview.botStatus.welcomeVideos.length > 0
      ? overview.botStatus.welcomeVideos
      : DEFAULT_VIDEOS;

  const activePreviewVideo = availableVideos.includes(previewVideoFile)
    ? previewVideoFile
    : availableVideos[0] || 'risxav_vertical_promo.mp4';

  const liveRenderedIntro = introMsg
    .replace(/\{name\}/g, 'Operator')
    .replace(/\{id\}/g, '8158526050')
    .replace(/\{tokens\}/g, '100')
    .replace(/\{owner\}/g, ownerContact || '@RHXVM')
    .replace(/\{bot\}/g, `@${botUsername}`);

  return (
    <div className="space-y-8">
      {/* Live Bot Connection Control */}
      <section className="bg-[#111827] border border-slate-800 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
              RISXAV HAXKK !! — Holographic Video & Bot Studio
            </h1>
            <p className="text-sm text-slate-400">
              Official Bot: <span className="font-mono text-emerald-400">@{botUsername}</span> ·
              Supreme Owner: <span className="font-mono text-amber-400">{ownerContact || '@RHXVM'}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <a
              href={`https://t.me/${botUsername}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg transition-colors whitespace-nowrap"
            >
              Launch @{botUsername}
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            {isRunning ? (
              <button
                type="button"
                disabled={botControlLoading}
                onClick={() => handleBotControl('stop')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 text-amber-400" />
                Pause Polling
              </button>
            ) : (
              <button
                type="button"
                disabled={botControlLoading}
                onClick={() => handleBotControl('start')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 text-emerald-400" />
                Start Polling
              </button>
            )}

            <button
              type="button"
              disabled={botControlLoading}
              onClick={() => handleBotControl('restart')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Restart Bot
            </button>
          </div>
        </div>
      </section>

      {/* Holographic Promo Video Deck + Custom Sukuna / Anime MP4 Uploader */}
      <section className="bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              RISXAV Holographic Promo Video Deck (Zero Third-Party Videos)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              All Gautam videos removed. Every video features <span className="font-mono text-emerald-400">@{botUsername}</span>, <span className="font-mono text-amber-400">{ownerContact}</span>, and the 6 verified OSINT modules.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={welcomeVideoEnabled}
                onChange={(e) => setWelcomeVideoEnabled(e.target.checked)}
                className="w-4 h-4 accent-emerald-500 rounded"
              />
              Send Video on /start
            </label>

            <select
              value={welcomeVideoMode}
              onChange={(e) => {
                setWelcomeVideoMode(e.target.value);
                if (e.target.value !== 'random') {
                  setPreviewVideoFile(e.target.value);
                }
              }}
              className="px-3 py-1.5 bg-[#0B1120] border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="random">Rotate All RISXAV Promo Videos</option>
              {availableVideos.map((vf) => (
                <option key={vf} value={vf}>
                  Lock /start to {vf}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Active RISXAV Promo Videos Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {availableVideos.map((vid) => {
            const active = activePreviewVideo === vid;
            return (
              <div
                key={vid}
                className={`p-3 rounded-xl border transition-colors flex flex-col justify-between gap-2.5 ${
                  active
                    ? 'bg-emerald-500/10 border-emerald-500 text-slate-100'
                    : 'bg-[#0B1120] border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setPreviewVideoFile(vid)}
                  className="text-left space-y-1 cursor-pointer"
                >
                  <div className="flex items-center gap-1.5 text-xs font-mono truncate">
                    <Film className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="truncate">{vid}</span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {welcomeVideoMode === vid
                      ? 'Locked for /start'
                      : active
                      ? 'Previewing below'
                      : 'Click to preview'}
                  </div>
                </button>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                  <a
                    href={`/welcome_videos/${vid}`}
                    download={vid}
                    className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300"
                  >
                    <Download className="w-3 h-3" />
                    Download MP4
                  </a>
                  {availableVideos.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleDeleteWelcomeVideo(vid)}
                      className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-red-400 cursor-pointer"
                      title="Remove video"
                    >
                      <Trash2 className="w-3 h-3" />
                      Remove
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Custom Sukuna / Anime MP4 Holographic HUD Editor */}
        <form
          onSubmit={handleRenderCustomPromoVideo}
          className="pt-5 border-t border-slate-800 space-y-4"
        >
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              Upload Your Sukuna / Custom Anime MP4 — Auto-Burn RISXAV Holographic Feature HUD
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Uploads your video (or send it directly to <span className="font-mono text-slate-200">@{botUsername}</span> on Telegram), overlays the 4-scene holographic <span className="font-mono text-emerald-400">@{botUsername}</span> + <span className="font-mono text-amber-400">{ownerContact}</span> feature showcase, covers any corner watermark, preserves music audio, and locks it for <span className="font-mono text-slate-200">/start</span>.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <input
                ref={videoInputRef}
                type="file"
                accept="video/mp4,video/*"
                onChange={(e) => setSelectedVideoFile(e.target.files?.[0] || null)}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2.5 text-xs font-medium text-slate-100 bg-[#0B1120] hover:bg-slate-900 border border-slate-700 rounded-lg transition-colors truncate cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate">
                  {selectedVideoFile ? selectedVideoFile.name : 'Choose Anime MP4 File'}
                </span>
              </button>
            </div>

            <select
              value={promoTheme}
              onChange={(e) =>
                setPromoTheme(e.target.value as 'sukuna_crimson' | 'hologram_cyan' | 'illuminati_emerald')
              }
              className="px-3 py-2 bg-[#0B1120] border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="sukuna_crimson">Theme: Sukuna Crimson & Gold</option>
              <option value="hologram_cyan">Theme: Hologram Cyan & Gold</option>
              <option value="illuminati_emerald">Theme: Illuminati Emerald</option>
            </select>

            <select
              value={promoDurationMode}
              onChange={(e) => setPromoDurationMode(e.target.value as 'welcome_12s' | 'full')}
              className="px-3 py-2 bg-[#0B1120] border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="welcome_12s">12s Fast /start Welcome Cut</option>
              <option value="full">Full Video Length (Up to 2m)</option>
            </select>

            <div className="flex gap-2">
              <select
                value={promoAspect}
                onChange={(e) => setPromoAspect(e.target.value as 'auto' | 'vertical' | 'landscape')}
                className="w-28 px-2.5 py-2 bg-[#0B1120] border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="auto">Auto Ratio</option>
                <option value="landscape">16:9 HD</option>
                <option value="vertical">9:16 Reel</option>
              </select>

              <button
                type="submit"
                disabled={renderingVideo}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                {renderingVideo ? 'Editing...' : 'Render MP4'}
              </button>
            </div>
          </div>

          {renderStatus && (
            <div className="text-xs text-emerald-400 font-medium">{renderStatus}</div>
          )}
        </form>
      </section>

      {/* Split Editor + Live Telegram Video & Tab Keyboard Simulator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <form
          onSubmit={handleSaveSettings}
          className="lg:col-span-7 bg-[#111827] border border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-5"
        >
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                Welcome Message & Brand Configuration
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Branded exclusively for <span className="text-slate-200 font-medium">@{botUsername}</span> & <span className="text-amber-400 font-medium">{ownerContact}</span>. Variables:{' '}
                <span className="font-mono text-slate-300">{'{name}'}</span>,{' '}
                <span className="font-mono text-slate-300">{'{id}'}</span>,{' '}
                <span className="font-mono text-slate-300">{'{tokens}'}</span>,{' '}
                <span className="font-mono text-slate-300">{'{bot}'}</span>,{' '}
                <span className="font-mono text-slate-300">{'{owner}'}</span>
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Welcome / Intro Message HTML (/start)
              </label>
              <textarea
                rows={11}
                value={introMsg}
                onChange={(e) => setIntroMsg(e.target.value)}
                className="w-full p-3.5 bg-[#0B1120] border border-slate-800 focus:border-emerald-500 focus:outline-none rounded-lg text-xs font-mono text-slate-200 leading-relaxed"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Supreme Owner Handle
                </label>
                <input
                  type="text"
                  value={ownerContact}
                  onChange={(e) => setOwnerContact(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0B1120] border border-slate-800 focus:border-emerald-500 focus:outline-none rounded-lg text-xs font-mono text-slate-200"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Official Channel (@)
                </label>
                <input
                  type="text"
                  value={forceChannel}
                  onChange={(e) => setForceChannel(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0B1120] border border-slate-800 focus:border-emerald-500 focus:outline-none rounded-lg text-xs font-mono text-slate-200"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Official Group (@)
                </label>
                <input
                  type="text"
                  value={forceGroup}
                  onChange={(e) => setForceGroup(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0B1120] border border-slate-800 focus:border-emerald-500 focus:outline-none rounded-lg text-xs font-mono text-slate-200"
                />
              </div>
            </div>

            <label className="flex items-center gap-2.5 text-sm text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={forceJoin}
                onChange={(e) => setForceJoin(e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 bg-slate-900 accent-emerald-500"
              />
              Require Channel & Group membership before lookup commands
            </label>
          </div>

          <div className="pt-2 flex items-center justify-between gap-4">
            <span className="text-xs text-emerald-400">{saveNotice || ''}</span>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : 'Save Live Bot Config'}
            </button>
          </div>
        </form>

        {/* Live Telegram Simulator with Holographic MP4 Video + 2-Column Illuminati Keyboard */}
        <div className="lg:col-span-5 bg-[#111827] border border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              Live Telegram /start Preview
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Holographic Promo Video + Feature Caption + 10-Button Illuminati Tab Deck
            </p>
          </div>

          <div className="bg-[#0B1120] rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-emerald-400">{botDisplayName}</span>
              <span className="font-mono text-slate-400">{activePreviewVideo}</span>
            </div>

            {welcomeVideoEnabled && (
              <video
                key={activePreviewVideo}
                src={`/welcome_videos/${activePreviewVideo}`}
                autoPlay
                loop
                muted
                playsInline
                controls
                className="w-full max-h-72 object-contain rounded-lg bg-slate-950"
              />
            )}

            <div
              className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed"
              dangerouslySetInnerHTML={{ __html: liveRenderedIntro }}
            />

            {/* Persistent Reply Keyboard Preview */}
            <div className="pt-2 border-t border-slate-800/90 space-y-1.5">
              {TAB_KEYBOARD_PREVIEW.map((pair, rIdx) => (
                <div key={rIdx} className="grid grid-cols-2 gap-1.5">
                  {pair.map((label) => (
                    <div
                      key={label}
                      className="py-1.5 px-2 bg-[#1B2436] text-center text-[11px] font-medium text-slate-100 rounded-lg truncate"
                    >
                      {label}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Broadcast Box */}
          <form onSubmit={handleBroadcast} className="pt-2 border-t border-slate-800 space-y-2">
            <label className="block text-xs font-medium text-slate-300">
              Broadcast Alert to All Operators
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={broadcastText}
                onChange={(e) => setBroadcastText(e.target.value)}
                placeholder="Enter RISXAV HAXKK !! announcement..."
                className="flex-1 px-3 py-2 bg-[#0B1120] border border-slate-800 focus:border-emerald-500 focus:outline-none rounded-lg text-xs text-slate-200"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                Send
              </button>
            </div>
            {broadcastStatus && <p className="text-xs text-slate-400">{broadcastStatus}</p>}
          </form>
        </div>
      </div>

      {/* Standalone Python Cyber Bot Source Export */}
      <section className="bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              Export Standalone Python Bot (RISXAV_HAXKK_PRO_BOT.py)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Clean @{botUsername} & {ownerContact} Python source with Holographic Welcome Video support, Illuminati Tab Keyboard, and TXT Dossier export
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!pythonExport ? (
              <button
                type="button"
                onClick={handleLoadPythonExport}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                Generate RISXAV Python Code
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(pythonExport.code);
                    setCopiedCode(true);
                    setTimeout(() => setCopiedCode(false), 1600);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedCode ? 'Copied' : 'Copy Code'}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadPython}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download {pythonExport.filename}
                </button>
              </>
            )}
          </div>
        </div>

        {pythonExport && (
          <pre className="p-4 bg-[#0B1120] border border-slate-800 rounded-lg text-xs font-mono text-slate-300 overflow-x-auto max-h-96">
            {pythonExport.code}
          </pre>
        )}
      </section>
    </div>
  );
};
