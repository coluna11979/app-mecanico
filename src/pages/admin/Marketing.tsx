import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminLayout from '@/components/layout/AdminLayout';
import Overview from '@/components/admin/marketing/Overview';
import Campaigns from '@/components/admin/marketing/Campaigns';
import Coupons from '@/components/admin/marketing/Coupons';
import EmailBlasts from '@/components/admin/marketing/EmailBlasts';
import Banners from '@/components/admin/marketing/Banners';
import Partners from '@/components/admin/marketing/Partners';
import Articles from '@/components/admin/marketing/Articles';
import Illustrations from '@/components/admin/marketing/Illustrations';

const TABS = [
  { v: 'geral',     label: 'Visão geral', emoji: '📊' },
  { v: 'campanhas', label: 'Campanhas',   emoji: '📣' },
  { v: 'cupons',    label: 'Cupons',      emoji: '🎟️' },
  { v: 'email',     label: 'E-mail',      emoji: '✉️' },
  { v: 'banners',   label: 'Banners nos painéis', emoji: '🪧' },
  { v: 'parceiros', label: 'Parceiros', emoji: '🤝' },
  { v: 'conteudo',  label: 'Conteúdo',  emoji: '📰' },
  { v: 'ilustracoes', label: 'Ilustrações', emoji: '🎨' },
] as const;
type Tab = typeof TABS[number]['v'];

const PERIODS = [
  { v: 7, label: '7 dias' },
  { v: 30, label: '30 dias' },
  { v: 90, label: '90 dias' },
  { v: 365, label: '12 meses' },
];

/** Painel de Marketing: funil de aquisição, campanhas com link rastreável, cupons e e-mail marketing. */
export default function AdminMarketing() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some(t => t.v === params.get('aba')) ? params.get('aba') : 'geral') as Tab;
  const [days, setDays] = useState(30);

  return (
    <AdminLayout>
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Marketing</h1>
          <p className="text-steel-500 text-sm mt-1">De onde vêm os cadastros, quanto custa cada um e o que fazer pra trazer mais.</p>
        </div>
        {tab === 'geral' && (
          <div className="inline-flex bg-steel-100 rounded-xl p-1 text-sm">
            {PERIODS.map(p => (
              <button key={p.v} onClick={() => setDays(p.v)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition ${days === p.v ? 'bg-white shadow text-steel-900' : 'text-steel-500 hover:text-steel-700'}`}>
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-1 border-b border-steel-200 mb-5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        {TABS.map(t => (
          <button key={t.v} onClick={() => setParams(t.v === 'geral' ? {} : { aba: t.v }, { replace: true })}
            className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition min-h-[44px] ${
              tab === t.v ? 'border-brand-500 text-brand-600' : 'border-transparent text-steel-500 hover:text-steel-800'}`}>
            {t.emoji} {t.label}
          </button>
        ))}
      </div>

      {tab === 'geral' && <Overview days={days} />}
      {tab === 'campanhas' && <Campaigns />}
      {tab === 'cupons' && <Coupons />}
      {tab === 'email' && <EmailBlasts />}
      {tab === 'banners' && <Banners />}
      {tab === 'parceiros' && <Partners />}
      {tab === 'conteudo' && <Articles />}
      {tab === 'ilustracoes' && <Illustrations />}
    </AdminLayout>
  );
}
