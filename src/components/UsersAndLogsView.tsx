import React, { useEffect, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { BotUserRow, QueryLogRow } from '../types.ts';

export const UsersAndLogsView: React.FC = () => {
  const [users, setUsers] = useState<BotUserRow[]>([]);
  const [logs, setLogs] = useState<QueryLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [targetUserId, setTargetUserId] = useState('');
  const [tokenDelta, setTokenDelta] = useState('50');

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/bot/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
        setLogs(data.logs || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleUserAction = async (userId: number, action: 'add_tokens' | 'ban' | 'unban', amount?: number) => {
    const res = await fetch('/api/bot/users/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, action, amount }),
    });
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users || []);
    }
  };

  const handleQuickCreditGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    const uid = Number(targetUserId);
    const amt = Number(tokenDelta);
    if (!uid || Number.isNaN(uid) || Number.isNaN(amt)) return;
    await handleUserAction(uid, 'add_tokens', amt);
    setTargetUserId('');
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
            Bot Operators & Query Ledger
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Manage Telegram user credits, access status, and inspect real-time lookups across Telegram and Web
          </p>
        </div>

        <button
          type="button"
          onClick={fetchData}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Ledger
        </button>
      </div>

      {/* Quick Token Grant Bar */}
      <form
        onSubmit={handleQuickCreditGrant}
        className="bg-[#111827] border border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-end gap-4"
      >
        <div className="flex-1">
          <label className="block text-xs font-medium text-slate-300 mb-1">
            Telegram User ID
          </label>
          <input
            type="text"
            value={targetUserId}
            onChange={(e) => setTargetUserId(e.target.value)}
            placeholder="e.g. 8158526050"
            className="w-full px-3.5 py-2 bg-[#0B1120] border border-slate-800 focus:border-emerald-500 focus:outline-none rounded-lg text-xs font-mono text-slate-200 tabular-nums"
          />
        </div>
        <div className="w-full sm:w-44">
          <label className="block text-xs font-medium text-slate-300 mb-1">
            Credits to Grant
          </label>
          <input
            type="number"
            value={tokenDelta}
            onChange={(e) => setTokenDelta(e.target.value)}
            className="w-full px-3.5 py-2 bg-[#0B1120] border border-slate-800 focus:border-emerald-500 focus:outline-none rounded-lg text-xs font-mono text-slate-200 tabular-nums"
          />
        </div>
        <button
          type="submit"
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Credits
        </button>
      </form>

      {/* Telegram Users Table */}
      <section className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800">
          <h2 className="text-base font-semibold text-slate-100">Registered Telegram Bot Users</h2>
        </div>

        {loading ? (
          <div className="p-6 space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-slate-800/50 rounded animate-pulse" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            No Telegram users have sent <span className="font-mono text-slate-300">/start</span> yet. Open your bot on Telegram and send <span className="font-mono text-slate-300">/start</span> to populate this table.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-xs font-medium text-slate-400 bg-slate-900/40">
                  <th className="py-3 px-4">User ID</th>
                  <th className="py-3 px-4">Name / Handle</th>
                  <th className="py-3 px-4 text-right">Credits</th>
                  <th className="py-3 px-4 text-right">Queries</th>
                  <th className="py-3 px-4 text-right">Referrals</th>
                  <th className="py-3 px-4">Access State</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-sm">
                {users.map((u) => (
                  <tr key={u.user_id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-200 tabular-nums">
                      {u.user_id}
                    </td>
                    <td className="py-2.5 px-4 text-slate-200">
                      {u.first_name || 'Operator'}{' '}
                      {u.username ? (
                        <span className="text-xs font-mono text-slate-400">@{u.username}</span>
                      ) : null}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-emerald-400 tabular-nums">
                      {u.tokens}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-slate-300 tabular-nums">
                      {u.total_queries}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-slate-300 tabular-nums">
                      {u.referral_count}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-300">
                      {u.banned ? 'Suspended' : 'Active'}
                    </td>
                    <td className="py-2.5 px-4 text-right space-x-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleUserAction(u.user_id, 'add_tokens', 25)}
                        className="px-2.5 py-1 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded transition-colors cursor-pointer"
                      >
                        +25 Cr
                      </button>
                      {u.banned ? (
                        <button
                          type="button"
                          onClick={() => handleUserAction(u.user_id, 'unban')}
                          className="px-2.5 py-1 text-xs font-medium text-emerald-300 bg-slate-800 hover:bg-slate-700 rounded transition-colors cursor-pointer"
                        >
                          Unban
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleUserAction(u.user_id, 'ban')}
                          className="px-2.5 py-1 text-xs font-medium text-red-300 bg-slate-800 hover:bg-slate-700 rounded transition-colors cursor-pointer"
                        >
                          Ban
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Recent OSINT Query Log */}
      <section className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800">
          <h2 className="text-base font-semibold text-slate-100">Recent Intelligence Queries</h2>
        </div>

        {logs.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            No lookups recorded yet. Run a scan in the Number Scanner or via Telegram to log activity.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-xs font-medium text-slate-400 bg-slate-900/40">
                  <th className="py-3 px-4">Channel</th>
                  <th className="py-3 px-4">Operator</th>
                  <th className="py-3 px-4">Module</th>
                  <th className="py-3 px-4">Target Query</th>
                  <th className="py-3 px-4 text-right">Records</th>
                  <th className="py-3 px-4 text-right">Latency</th>
                  <th className="py-3 px-4 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-xs">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 px-4 text-slate-300 capitalize">{log.source}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-300">{log.username}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-300">{log.service}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-100 tabular-nums">{log.query}</td>
                    <td className="py-2.5 px-4 text-right font-mono text-emerald-400 tabular-nums">
                      {log.records_found}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-slate-400 tabular-nums">
                      {log.duration_ms} ms
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-slate-400 tabular-nums">
                      {new Date(log.created_at * 1000).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
