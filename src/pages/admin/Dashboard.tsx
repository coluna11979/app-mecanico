import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import { useAdminBadges } from '@/hooks/useAdminBadges';

interface KPIs {
  volumeHoje:   number;
  volumeOntem:  number;
  volumeMes:    number;
  volumeMesAnt: number;
  gmv:          number;
  receitaMes:   number;
  jobsMes:      number;
  totalMechanics: number;
  totalWorkshops: number;
  feePercent:   number;
}

interface SparkPoint { label: string; v: number; }

interface Activity {
  ts: Date;
  kind: 'cadastro' | 'lead_quente' | 'job_aceito' | 'job_concluido' | 'repasse';
  text: string;
  href?: string;
}

export default function AdminDashboard() {
  const [kpis, setKpis]       = useState<KPIs | null>(null);
  const [spark, setSpark]     = useState<SparkPoint[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const { badges } = useAdminBadges();

  useEffect(() => { load(); }, []);

  async function load() {
    const now = new Date();
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
    const todayStart   = startOfDay(now);
    const yesterdayDt  = new Date(now); yesterdayDt.setDate(yesterdayDt.getDate() - 1);
    const yStart       = startOfDay(yesterdayDt);
    const monthStart   = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const monthAntDt   = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const monthAntStart= monthAntDt.toISOString();
    const monthAntEnd  = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const d30Ago       = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const d1Ago        = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    const [
      { count: mech },
      { count: shop },
      { data: all },
      { data: hoje },
      { data: ontem },
      { data: mes },
      { data: mesAnt },
      { data: mes30 },
      { data: feeRow },
      { data: cadastros24h },
      { data: leadsQuentes },
      { data: jobsRecentes },
    ] = await Promise.all([
      supabase.from('mechanics').select('*', { count: 'exact', head: true }),
      supabase.from('workshops').select('*', { count: 'exact', head: true }),
      supabase.from('jobs').select('price').eq('status', 'completed'),
      supabase.from('jobs').select('price').eq('status', 'completed').gte('completed_at', todayStart),
      supabase.from('jobs').select('price').eq('status', 'completed').gte('completed_at', yStart).lt('completed_at', todayStart),
      supabase.from('jobs').select('price').eq('status', 'completed').gte('completed_at', monthStart),
      supabase.from('jobs').select('price').eq('status', 'completed').gte('completed_at', monthAntStart).lt('completed_at', monthAntEnd),
      supabase.from('jobs').select('price,completed_at').eq('status', 'completed').gte('completed_at', d30Ago),
      supabase.from('app_settings').select('value').eq('key', 'platform_fee_percent').single(),
      // atividade: últimos cadastros
      supabase.from('profiles').select('id, full_name, role, created_at').gte('created_at', d1Ago).neq('role', 'admin').order('created_at', { ascending: false }).limit(5),
      // leads quentes recentes
      supabase.from('leads').select('id, name, status, last_contact_at, created_at').in('status', ['interessado', 'cadastro_iniciado']).order('last_contact_at', { ascending: false, nullsFirst: false }).limit(5),
      // jobs com movimento
      supabase.from('jobs').select('id, status, price, updated_at').gte('updated_at', d1Ago).order('updated_at', { ascending: false }).limit(8),
    ]);

    const feePercent = parseFloat((feeRow as any)?.value ?? '15') / 100;
    const volumeHoje   = sum(hoje);
    const volumeOntem  = sum(ontem);
    const volumeMes    = sum(mes);
    const volumeMesAnt = sum(mesAnt);

    setKpis({
      volumeHoje, volumeOntem, volumeMes, volumeMesAnt,
      gmv: sum(all),
      receitaMes: volumeMes * feePercent,
      jobsMes: mes?.length ?? 0,
      totalMechanics: mech ?? 0,
      totalWorkshops: shop ?? 0,
      feePercent,
    });

    // Sparkline — últimos 30 dias
    const buckets: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const k = `${d.getDate()}/${d.getMonth() + 1}`;
      buckets[k] = 0;
    }
    (mes30 ?? []).forEach(j => {
      const d = new Date((j as any).completed_at);
      const k = `${d.getDate()}/${d.getMonth() + 1}`;
      if (buckets[k] !== undefined) buckets[k] += (j as any).price ?? 0;
    });
    setSpark(Object.entries(buckets).map(([label, v]) => ({ label, v })));

    // Atividade — merge últimas 24h
    const acts: Activity[] = [];
    (cadastros24h ?? []).forEach((p: any) => {
      acts.push({
        ts: new Date(p.created_at),
        kind: 'cadastro',
        text: `${p.full_name} se cadastrou como ${p.role === 'mechanic' ? 'mecânico' : 'oficina'}`,
        href: `/admin/usuario/${p.id}`,
      });
    });
    (leadsQuentes ?? []).forEach((l: any) => {
      const ts = l.last_contact_at ? new Date(l.last_contact_at) : new Date(l.created_at);
      if (ts > new Date(d1Ago)) {
        acts.push({
          ts, kind: 'lead_quente',
          text: `Lead quente: ${l.name} ${l.status === 'cadastro_iniciado' ? 'iniciou o cadastro' : 'demonstrou interesse'}`,
          href: '/admin/leads',
        });
      }
    });
    (jobsRecentes ?? []).forEach((j: any) => {
      const kind = j.status === 'completed' ? 'job_concluido' : j.status === 'assigned' ? 'job_aceito' : null;
      if (!kind) return;
      acts.push({
        ts: new Date(j.updated_at), kind,
        text: kind === 'job_concluido'
          ? `Job #${String(j.id).slice(0, 6)} concluído — R$ ${fmt(j.price)}`
          : `Job #${String(j.id).slice(0, 6)} foi aceito`,
        href: `/admin/jobs`,
      });
    });
    acts.sort((a, b) => b.ts.getTime() - a.ts.getTime());
    setActivity(acts.slice(0, 10));
  }

  const diffHojeOntem = kpis ? pct(kpis.volumeHoje, kpis.volumeOntem) : null;
  const diffMes       = kpis ? pct(kpis.volumeMes, kpis.volumeMesAnt) : null;

  return (
    <AdminLayout>
      {/* ── Header + Hero stat ── */}
      <div className="flex items-start justify-between gap-6 mb-4 flex-wrap">
        <div>
          <div className="admin-label mb-1">{formatDate(new Date())}</div>
          <h1 className="admin-h1">Hoje</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <QuickAction href="/admin/leads"      label="Pipeline"     tone="brand" />
          <QuickAction href="/admin/aprovacoes" label="Aprovações"   count={badges.aprovacoesPendentes} />
          <QuickAction href="/admin/repasses"   label="Repasses"     count={badges.repassesPendentes} />
        </div>
      </div>

      {/* ── Hero: volume do dia com delta ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="admin-card p-5 lg:col-span-1">
          <div className="admin-label mb-1">Volume hoje</div>
          <div className="admin-num text-4xl font-bold text-steel-900">
            {kpis ? `R$ ${fmt(kpis.volumeHoje)}` : <Skel />}
          </div>
          {diffHojeOntem !== null && (
            <div className="mt-1.5 flex items-center gap-2 text-xs">
              <Delta value={diffHojeOntem} />
              <span className="text-steel-400">vs ontem (R$ {fmt(kpis!.volumeOntem)})</span>
            </div>
          )}
        </div>

        <div className="admin-card p-5">
          <div className="admin-label mb-1">Volume do mês</div>
          <div className="admin-num text-4xl font-bold text-steel-900">
            {kpis ? `R$ ${fmt(kpis.volumeMes)}` : <Skel />}
          </div>
          {diffMes !== null && (
            <div className="mt-1.5 flex items-center gap-2 text-xs">
              <Delta value={diffMes} />
              <span className="text-steel-400">vs mês anterior (R$ {fmt(kpis!.volumeMesAnt)})</span>
            </div>
          )}
        </div>

        <div className="admin-card p-5">
          <div className="admin-label mb-1">Receita da plataforma (mês)</div>
          <div className="admin-num text-4xl font-bold text-brand-600">
            {kpis ? `R$ ${fmt(kpis.receitaMes)}` : <Skel />}
          </div>
          <div className="mt-1.5 text-xs text-steel-400">
            {kpis ? `${(kpis.feePercent * 100).toFixed(0)}% do volume · ${kpis.jobsMes} jobs no mês` : <Skel />}
          </div>
        </div>
      </div>

      {/* ── Pills de contexto ── */}
      <div className="flex flex-wrap gap-2 mb-6">
        <ContextPill label="Jobs rodando"       value={badges.jobsAtivos}             tone="warn" href="/admin/jobs" />
        <ContextPill label="Leads em pipeline"  value={badges.leadsEmPipeline}        tone="neutral" href="/admin/leads" />
        <ContextPill label="Mecânicos"          value={kpis?.totalMechanics ?? '—'}   tone="neutral" href="/admin/mecanicos" />
        <ContextPill label="Oficinas"           value={kpis?.totalWorkshops ?? '—'}   tone="neutral" href="/admin/oficinas" />
        <ContextPill label="GMV acumulado"      value={kpis ? `R$ ${fmt(kpis.gmv)}` : '—'} tone="neutral" />
      </div>

      {/* ── 30d sparkline + atividade live ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="admin-card p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="admin-h2">Volume — últimos 30 dias</h2>
            <span className="admin-label">R$ por dia</span>
          </div>
          <BigSpark data={spark} />
        </div>

        <div className="admin-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="admin-h2">Últimas 24h</h2>
            <span className="admin-dot bg-signal-500 animate-pulse" />
          </div>
          {activity.length === 0 ? (
            <p className="text-sm text-steel-400 italic py-4">Nada nas últimas 24h.</p>
          ) : (
            <ul className="space-y-2.5">
              {activity.map((a, i) => (
                <li key={i}>
                  <ActivityRow a={a} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

/* ─────────────── Partials ─────────────── */

function QuickAction({ href, label, count, tone }: { href: string; label: string; count?: number; tone?: 'brand' }) {
  const base = tone === 'brand'
    ? 'bg-brand-500 text-white hover:bg-brand-600'
    : 'bg-white border border-steel-200 text-steel-700 hover:bg-steel-50';
  return (
    <Link to={href} className={`${base} inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition`}>
      {label}
      {count !== undefined && count > 0 && (
        <span className={`text-[10px] font-bold rounded-full px-1.5 min-w-[18px] text-center ${
          tone === 'brand' ? 'bg-white/20' : 'bg-alert-500 text-white'
        }`}>
          {count}
        </span>
      )}
    </Link>
  );
}

function ContextPill({ label, value, tone, href }: {
  label: string; value: string | number; tone: 'warn' | 'neutral'; href?: string;
}) {
  const cls = tone === 'warn' ? 'admin-pill-warn' : 'admin-pill-neutral';
  const inner = (
    <span className={cls}>
      <span className="text-steel-500 font-medium">{label}:</span>
      <span className="admin-num font-bold">{value}</span>
    </span>
  );
  return href ? <Link to={href}>{inner}</Link> : inner;
}

function Delta({ value }: { value: number }) {
  const up = value >= 0;
  const cls = up ? 'text-signal-600' : 'text-alert-600';
  const arrow = up ? '↑' : '↓';
  return (
    <span className={`admin-num font-bold ${cls}`}>
      {arrow} {Math.abs(value).toFixed(0)}%
    </span>
  );
}

function Skel() { return <span className="inline-block h-6 w-20 bg-steel-100 rounded animate-pulse" />; }

function BigSpark({ data }: { data: SparkPoint[] }) {
  if (!data.length) return <div className="h-28 bg-steel-50 rounded animate-pulse" />;
  const max = Math.max(1, ...data.map(d => d.v));
  const W = 600, H = 110, PAD = 8;
  const stepX = (W - PAD * 2) / Math.max(1, data.length - 1);
  const pts = data.map((d, i) => {
    const x = PAD + i * stepX;
    const y = H - PAD - (d.v / max) * (H - PAD * 2);
    return [x, y] as const;
  });
  const path  = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area  = path + ` L${pts[pts.length - 1][0].toFixed(1)},${H - PAD} L${pts[0][0].toFixed(1)},${H - PAD} Z`;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-28" preserveAspectRatio="none">
        <defs>
          <linearGradient id="sparkFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%"  stopColor="#FF5C0A" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#FF5C0A" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#sparkFill)" />
        <path d={path} fill="none" stroke="#FF5C0A" strokeWidth={2} />
        {pts.map(([x, y], i) => (
          <circle key={i} cx={x.toFixed(1)} cy={y.toFixed(1)} r={1.5} fill="#FF5C0A" />
        ))}
      </svg>
      <div className="flex justify-between mt-1 text-[10px] text-steel-400">
        <span>{data[0]?.label}</span>
        <span>{data[Math.floor(data.length / 2)]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

const KIND_META: Record<Activity['kind'], { emoji: string; cls: string }> = {
  cadastro:      { emoji: '👤', cls: 'text-steel-700' },
  lead_quente:   { emoji: '🔥', cls: 'text-alert-700' },
  job_aceito:    { emoji: '✓',  cls: 'text-pending-700' },
  job_concluido: { emoji: '●',  cls: 'text-signal-700' },
  repasse:       { emoji: '$',  cls: 'text-brand-700' },
};

function ActivityRow({ a }: { a: Activity }) {
  const meta = KIND_META[a.kind];
  const inner = (
    <div className="flex items-start gap-2.5 text-sm hover:bg-steel-50 -mx-1 px-1 py-1 rounded">
      <span className={`shrink-0 w-5 text-center ${meta.cls}`}>{meta.emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="text-steel-700 truncate">{a.text}</div>
        <div className="text-[11px] text-steel-400 admin-num">{timeAgo(a.ts)}</div>
      </div>
    </div>
  );
  return a.href ? <Link to={a.href}>{inner}</Link> : inner;
}

/* ─────────────── Utils ─────────────── */
function sum(rows: { price?: number }[] | null) {
  return (rows ?? []).reduce((a, j) => a + ((j as any).price ?? 0), 0);
}
function fmt(v?: number) {
  return (v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function pct(a: number, b: number): number {
  if (b === 0) return a === 0 ? 0 : 100;
  return ((a - b) / b) * 100;
}
function timeAgo(d: Date): string {
  const min = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (min < 1)  return 'agora';
  if (min < 60) return `${min} min atrás`;
  const h = Math.floor(min / 60);
  if (h < 24)  return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}
function formatDate(d: Date): string {
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
}
