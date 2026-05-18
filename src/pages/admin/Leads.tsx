import { useEffect, useMemo, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';

type Intent = 'mechanic' | 'workshop';
type Period = 'today' | 'week' | 'month' | 'all';

interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  intent: Intent;
  consent: boolean;
  user_agent: string | null;
  referrer: string | null;
  created_at: string;
}

export default function AdminLeads() {
  const [leads, setLeads]       = useState<Lead[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [intent, setIntent]     = useState<'all' | Intent>('all');
  const [period, setPeriod]     = useState<Period>('week');
  const [search, setSearch]     = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (err) setError(err.message);
    setLeads((data as Lead[]) ?? []);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const now = Date.now();
    const periodCutoff: Record<Period, number> = {
      today: now - 24 * 3600 * 1000,
      week:  now - 7  * 24 * 3600 * 1000,
      month: now - 30 * 24 * 3600 * 1000,
      all:   0,
    };
    const cutoff = periodCutoff[period];
    const q = search.trim().toLowerCase();
    return leads.filter(l => {
      if (intent !== 'all' && l.intent !== intent) return false;
      if (new Date(l.created_at).getTime() < cutoff) return false;
      if (q && !(l.name.toLowerCase().includes(q) ||
                 l.email.toLowerCase().includes(q) ||
                 l.phone.includes(q))) return false;
      return true;
    });
  }, [leads, intent, period, search]);

  const totals = useMemo(() => ({
    mecanico: leads.filter(l => l.intent === 'mechanic').length,
    oficina:  leads.filter(l => l.intent === 'workshop').length,
    hoje:     leads.filter(l => Date.now() - new Date(l.created_at).getTime() < 24 * 3600 * 1000).length,
    consent:  leads.filter(l => l.consent).length,
  }), [leads]);

  function formatPhone(p: string): string {
    const d = p.replace(/\D/g, '');
    if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
    return p;
  }

  function whatsappLink(phone: string, name: string, intent: Intent): string {
    const digits = phone.replace(/\D/g, '');
    const e164 = digits.startsWith('55') ? digits : `55${digits}`;
    const greeting = intent === 'mechanic'
      ? `Olá ${name.split(' ')[0]}! Aqui é da MecânicoApp. Vi que você se interessou pela plataforma como mecânico — posso te ajudar com o cadastro?`
      : `Olá ${name.split(' ')[0]}! Aqui é da MecânicoApp. Vi que você se interessou pela plataforma como oficina — posso te ajudar com o cadastro?`;
    return `https://wa.me/${e164}?text=${encodeURIComponent(greeting)}`;
  }

  function exportCSV() {
    const rows = [
      ['Data', 'Tipo', 'Nome', 'Email', 'Telefone', 'Consent'],
      ...filtered.map(l => [
        new Date(l.created_at).toLocaleString('pt-BR'),
        l.intent === 'mechanic' ? 'Mecânico' : 'Oficina',
        l.name,
        l.email,
        formatPhone(l.phone),
        l.consent ? 'Sim' : 'Não',
      ]),
    ];
    const csv = rows.map(r =>
      r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-steel-900">Leads</h1>
            <p className="text-sm text-steel-500 mt-1">
              Capturas da home antes do cadastro completo. Use o WhatsApp pra dar acompanhamento.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={load} className="btn-ghost text-sm">🔄 Atualizar</button>
            <button onClick={exportCSV} className="btn-primary text-sm" disabled={filtered.length === 0}>
              ⬇️ Exportar CSV
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Total mecânicos" value={totals.mecanico} icon="🔧" />
          <Kpi label="Total oficinas"  value={totals.oficina}  icon="🏪" />
          <Kpi label="Capturas hoje"   value={totals.hoje}     icon="🌟" />
          <Kpi label="Consentiram contato" value={`${totals.consent}/${leads.length}`} icon="✅" />
        </div>

        {/* Filtros */}
        <div className="bg-white border border-steel-200 rounded-2xl p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar nome, email ou telefone…"
            className="input flex-1"
          />
          <div className="flex gap-2">
            {(['all', 'mechanic', 'workshop'] as const).map(i => (
              <button
                key={i}
                onClick={() => setIntent(i)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition ${
                  intent === i ? 'bg-brand-500 text-white' : 'bg-steel-100 text-steel-700 hover:bg-steel-200'
                }`}
              >
                {i === 'all' ? 'Todos' : i === 'mechanic' ? '🔧 Mecânico' : '🏪 Oficina'}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {(['today', 'week', 'month', 'all'] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition ${
                  period === p ? 'bg-steel-900 text-white' : 'bg-steel-100 text-steel-700 hover:bg-steel-200'
                }`}
              >
                {p === 'today' ? 'Hoje' : p === 'week' ? '7 dias' : p === 'month' ? '30 dias' : 'Tudo'}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-alert-50 border border-alert-200 text-alert-700 rounded-xl px-4 py-3 text-sm">⚠️ {error}</div>
        )}

        {/* Tabela */}
        <div className="bg-white border border-steel-200 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="p-10 text-center text-steel-500">Carregando…</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-steel-500">
              {leads.length === 0 ? 'Nenhum lead capturado ainda.' : 'Nenhum resultado pros filtros aplicados.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-steel-50 text-[10px] uppercase tracking-widest text-steel-500 font-bold">
                  <tr>
                    <th className="text-left px-4 py-3">Quando</th>
                    <th className="text-left px-4 py-3">Tipo</th>
                    <th className="text-left px-4 py-3">Nome</th>
                    <th className="text-left px-4 py-3">Email</th>
                    <th className="text-left px-4 py-3">Telefone</th>
                    <th className="text-center px-4 py-3">LGPD</th>
                    <th className="text-right px-4 py-3">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-steel-100">
                  {filtered.map(l => (
                    <tr key={l.id} className="hover:bg-steel-50/60 transition">
                      <td className="px-4 py-3 text-xs text-steel-500 whitespace-nowrap">
                        {new Date(l.created_at).toLocaleString('pt-BR', {
                          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${
                          l.intent === 'mechanic'
                            ? 'bg-steel-900 text-white'
                            : 'bg-brand-100 text-brand-700'
                        }`}>
                          {l.intent === 'mechanic' ? '🔧 Mecânico' : '🏪 Oficina'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-steel-900">{l.name}</td>
                      <td className="px-4 py-3 text-steel-600">
                        <a href={`mailto:${l.email}`} className="hover:text-brand-600 hover:underline">{l.email}</a>
                      </td>
                      <td className="px-4 py-3 text-steel-600 font-mono text-xs">{formatPhone(l.phone)}</td>
                      <td className="px-4 py-3 text-center">
                        {l.consent
                          ? <span className="text-signal-600" title="Aceitou contato">✓</span>
                          : <span className="text-steel-400" title="Não aceitou">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <a
                          href={whatsappLink(l.phone, l.name, l.intent)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 bg-signal-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-signal-600 transition"
                        >
                          💬 WhatsApp
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!loading && filtered.length > 0 && (
            <div className="px-4 py-3 border-t border-steel-100 text-xs text-steel-500 bg-steel-50/60">
              {filtered.length} {filtered.length === 1 ? 'lead' : 'leads'} no filtro atual · {leads.length} no total
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

function Kpi({ label, value, icon }: { label: string; value: number | string; icon: string }) {
  return (
    <div className="bg-white border border-steel-200 rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <span className="text-2xl">{icon}</span>
      </div>
      <div className="text-3xl font-bold text-steel-900 font-display mt-2">{value}</div>
      <div className="text-[11px] text-steel-500 uppercase tracking-wider font-semibold mt-1">{label}</div>
    </div>
  );
}
