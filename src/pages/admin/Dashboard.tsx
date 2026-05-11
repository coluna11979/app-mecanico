import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';

interface KPIs {
  pendingProfiles: number;
  repassesPendentes: number;
  repassesValor: number;
  volumeHoje: number;
  volumeMes: number;
  gmv: number;
  receitaMes: number;
  jobsAtivos: number;
  jobsMes: number;
  totalMechanics: number;
  totalWorkshops: number;
  feePercent: number;
}

interface WeeklyPoint { week: string; jobs: number; revenue: number; }
interface TopItem { name: string; total_jobs: number; rating: number; }

export default function AdminDashboard() {
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [weekly, setWeekly] = useState<WeeklyPoint[]>([]);
  const [topMechanics, setTopMechanics] = useState<TopItem[]>([]);
  const [topWorkshops, setTopWorkshops] = useState<TopItem[]>([]);

  useEffect(() => { load(); }, []);

  async function load() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const eightWeeksAgo = new Date(now.getTime() - 56 * 24 * 60 * 60 * 1000).toISOString();

    const [
      { count: pending },
      { count: active },
      { count: mech },
      { count: shop },
      { data: allCompleted },
      { data: monthCompleted },
      { data: todayCompleted },
      { data: weeklyJobs },
      { data: repassesPendingData },
      { data: feeRow },
      { data: mechanicsTop },
      { data: workshopsTop },
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('jobs').select('*', { count: 'exact', head: true }).in('status', ['assigned', 'in_progress']),
      supabase.from('mechanics').select('*', { count: 'exact', head: true }),
      supabase.from('workshops').select('*', { count: 'exact', head: true }),
      supabase.from('jobs').select('price').eq('status', 'completed'),
      supabase.from('jobs').select('price').eq('status', 'completed').gte('completed_at', monthStart),
      supabase.from('jobs').select('price').eq('status', 'completed').gte('completed_at', todayStart),
      supabase.from('jobs').select('price,completed_at').eq('status', 'completed').gte('completed_at', eightWeeksAgo),
      supabase.from('jobs').select('price').eq('status', 'completed').is('repasse_pago_at', null).not('workshop_confirmed_at', 'is', null),
      supabase.from('app_settings').select('value').eq('key', 'platform_fee_percent').single(),
      supabase.from('mechanics').select('profile:profiles(full_name), total_jobs, rating').order('total_jobs', { ascending: false }).limit(3),
      supabase.from('workshops').select('business_name, total_jobs, rating').order('total_jobs', { ascending: false }).limit(3),
    ]);

    const feePercent = parseFloat((feeRow as any)?.value ?? '15') / 100;
    const gmv = sum(allCompleted);
    const volumeMes = sum(monthCompleted);
    const volumeHoje = sum(todayCompleted);
    const repassesValor = sum(repassesPendingData) * (1 - feePercent);

    setKpis({
      pendingProfiles: pending ?? 0,
      repassesPendentes: repassesPendingData?.length ?? 0,
      repassesValor,
      volumeHoje,
      volumeMes,
      gmv,
      receitaMes: volumeMes * feePercent,
      jobsAtivos: active ?? 0,
      jobsMes: monthCompleted?.length ?? 0,
      totalMechanics: mech ?? 0,
      totalWorkshops: shop ?? 0,
      feePercent,
    });

    // Build 8-week sparkline buckets
    const buckets: { jobs: number; revenue: number }[] = Array.from({ length: 8 }, () => ({ jobs: 0, revenue: 0 }));
    (weeklyJobs ?? []).forEach(j => {
      const msAgo = now.getTime() - new Date((j as any).completed_at).getTime();
      const idx = 7 - Math.min(7, Math.floor(msAgo / (7 * 24 * 60 * 60 * 1000)));
      if (idx >= 0 && idx < 8) {
        buckets[idx].jobs++;
        buckets[idx].revenue += (j as any).price ?? 0;
      }
    });
    setWeekly(Array.from({ length: 8 }, (_, i) => {
      const d = new Date(now.getTime() - (7 - i) * 7 * 24 * 60 * 60 * 1000);
      return { week: `${d.getDate()}/${d.getMonth() + 1}`, ...buckets[i] };
    }));

    setTopMechanics((mechanicsTop ?? []).map(m => ({
      name: ((m as any).profile as any)?.full_name ?? '—',
      total_jobs: (m as any).total_jobs ?? 0,
      rating: (m as any).rating ?? 0,
    })));
    setTopWorkshops((workshopsTop ?? []).map(w => ({
      name: (w as any).business_name ?? '—',
      total_jobs: (w as any).total_jobs ?? 0,
      rating: (w as any).rating ?? 0,
    })));
  }

  return (
    <AdminLayout>
      <h1 className="text-3xl font-bold tracking-tight mb-1">Dashboard</h1>
      <p className="text-steel-500 mb-6">Torre de controle da plataforma</p>

      {/* Alert Bar */}
      {kpis && (kpis.pendingProfiles > 0 || kpis.repassesPendentes > 0) && (
        <div className="flex flex-wrap gap-3 mb-6">
          {kpis.pendingProfiles > 0 && (
            <Link
              to="/admin/aprovacoes"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold hover:bg-red-100 transition"
            >
              <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              {kpis.pendingProfiles} aprovação{kpis.pendingProfiles !== 1 ? 'ões' : ''} aguardando
            </Link>
          )}
          {kpis.repassesPendentes > 0 && (
            <Link
              to="/admin/repasses"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm font-semibold hover:bg-amber-100 transition"
            >
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              R$ {fmt(kpis.repassesValor)} em repasses pendentes ({kpis.repassesPendentes} job{kpis.repassesPendentes !== 1 ? 's' : ''})
            </Link>
          )}
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard label="Volume hoje" value={`R$ ${fmt(kpis?.volumeHoje)}`} sub="jobs concluídos hoje" />
        <KpiCard label="Volume mês" value={`R$ ${fmt(kpis?.volumeMes)}`} sub="jobs concluídos no mês" accent="signal" />
        <KpiCard label="GMV acumulado" value={`R$ ${fmt(kpis?.gmv)}`} sub="total histórico" />
        <KpiCard
          label="Receita plataforma"
          value={`R$ ${fmt(kpis?.receitaMes)}`}
          sub={`${((kpis?.feePercent ?? 0.15) * 100).toFixed(0)}% do volume mês`}
          accent="brand"
        />
        <KpiCard label="Jobs ativos agora" value={kpis?.jobsAtivos ?? '—'} sub="em andamento / atribuídos" />
        <KpiCard label="Jobs concluídos mês" value={kpis?.jobsMes ?? '—'} sub="no mês corrente" />
        <KpiCard label="Mecânicos" value={kpis?.totalMechanics ?? '—'} sub="cadastrados" />
        <KpiCard label="Oficinas" value={kpis?.totalWorkshops ?? '—'} sub="cadastradas" />
      </div>

      {/* Sparklines + Top Performers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <SparkCard
            title="Jobs concluídos — últimas 8 semanas"
            data={weekly.map(w => w.jobs)}
            labels={weekly.map(w => w.week)}
            color="#FF5C0A"
            unit=""
          />
          <SparkCard
            title="Receita da plataforma — últimas 8 semanas (R$)"
            data={weekly.map(w => w.revenue * (kpis?.feePercent ?? 0.15))}
            labels={weekly.map(w => w.week)}
            color="#22c55e"
            unit="R$"
          />
        </div>
        <div className="space-y-4">
          <TopCard title="🔧 Top mecânicos" items={topMechanics} />
          <TopCard title="🏭 Top oficinas" items={topWorkshops} />
        </div>
      </div>
    </AdminLayout>
  );
}

function sum(rows: { price: number }[] | null) {
  return (rows ?? []).reduce((a, j) => a + ((j as any).price ?? 0), 0);
}

function fmt(v?: number) {
  return (v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function KpiCard({ label, value, sub, accent }: {
  label: string; value: string | number; sub?: string; accent?: 'brand' | 'signal';
}) {
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wider text-steel-500 mb-1">{label}</div>
      <div className={`text-3xl font-bold font-display leading-none ${
        accent === 'brand' ? 'text-brand-500' : accent === 'signal' ? 'text-signal-500' : ''
      }`}>{value}</div>
      {sub && <div className="text-[11px] text-steel-400 mt-1.5">{sub}</div>}
    </div>
  );
}

function SparkCard({ title, data, labels, color, unit }: {
  title: string; data: number[]; labels: string[]; color: string; unit: string;
}) {
  const max = Math.max(...data, 1);
  const W = 300, H = 52, PAD = 6;
  const pts = data.map((v, i) => {
    const x = PAD + (i / (data.length - 1)) * (W - PAD * 2);
    const y = H - PAD - (v / max) * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const peak = Math.max(...data);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-steel-600">{title}</div>
        <div className="text-xs text-steel-400">
          pico: {unit}{unit === 'R$' ? fmt(peak) : peak}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: 52 }}>
        <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
        {data.map((v, i) => {
          const x = PAD + (i / (data.length - 1)) * (W - PAD * 2);
          const y = H - PAD - (v / max) * (H - PAD * 2);
          return <circle key={i} cx={x.toFixed(1)} cy={y.toFixed(1)} r={3} fill={color} />;
        })}
      </svg>
      <div className="flex justify-between mt-1.5">
        {labels.map((l, i) => (
          <span key={i} className="text-[9px] text-steel-400">{l}</span>
        ))}
      </div>
    </div>
  );
}

function TopCard({ title, items }: { title: string; items: TopItem[] }) {
  return (
    <div className="card">
      <div className="text-xs font-semibold text-steel-600 mb-3">{title}</div>
      {items.length === 0
        ? <p className="text-xs text-steel-400 py-2">Nenhum dado ainda</p>
        : items.map((item, i) => (
          <div key={i} className="flex items-center justify-between py-2 border-b border-steel-100 last:border-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-steel-400 w-3">{i + 1}</span>
              <span className="text-sm font-medium truncate max-w-[130px]">{item.name}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-steel-500 shrink-0">
              <span>{item.total_jobs} jobs</span>
              {item.rating > 0 && <span className="text-amber-500 font-semibold">★{item.rating.toFixed(1)}</span>}
            </div>
          </div>
        ))
      }
    </div>
  );
}
