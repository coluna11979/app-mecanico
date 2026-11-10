import { Link } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { toast } from '@/components/ui/Toast';
import FunnelView from '@/components/checkup/FunnelView';

/* Demonstração pública do Funil de vendas do Check-up (para apresentar a oficinas).
   Sem login e sem banco: os check-ups são fictícios, gerados na tela. */
export default function CheckupFunnelDemo() {
  const info = () => toast.info('Isto é uma demonstração. No sistema, este botão abre o check-up ou o WhatsApp do cliente.');
  return (
    <div className="min-h-screen bg-steel-50">
      <header className="bg-steel-900 text-white">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Logo light />
          <Link to="/" className="text-sm font-semibold text-steel-300 hover:text-white">Conhecer o MecânicoApp →</Link>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">🩺 Funil de vendas do Check-up</h1>
          <p className="text-sm text-steel-500 mt-1 max-w-2xl">
            Cada check-up vira uma oportunidade. Veja em que etapa o cliente parou, quanto está esperando aprovação
            e o que fazer para fechar mais serviço. Toque nas etapas do funil.
          </p>
        </div>
        <FunnelView list={[]} demo onOpen={info} onWhatsapp={info} />
      </main>
    </div>
  );
}
