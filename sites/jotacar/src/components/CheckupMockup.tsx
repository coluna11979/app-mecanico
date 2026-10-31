import { useMemo, useState } from 'react';
import { CONFIG, track, wa } from '../config';

/* ---------------------------------------------------------------------
   Mockup "Check-up Jota Car" com visual iOS — e funcional de verdade:
   • Sintomas: toggles → mensagem pronta no WhatsApp ("Vim pelo site")
   • Luzes: toca na luz → o que pode ser, o que fazer e a urgência
   --------------------------------------------------------------------- */

const SINTOMAS = [
  { id: 'barulho ao frear', label: 'Barulho ao frear' },
  { id: 'luz acesa no painel', label: 'Luz acesa no painel' },
  { id: 'motor falhando', label: 'Motor falhando' },
  { id: 'perdendo força', label: 'Perdendo força' },
  { id: 'barulho na suspensão', label: 'Barulho na suspensão' },
  { id: 'demora para dar partida', label: 'Demora para pegar' },
  { id: 'vazamento', label: 'Vazamento' },
  { id: 'volante tremendo / puxando', label: 'Volante tremendo' },
  { id: 'revisão / troca de óleo', label: 'Revisão ou troca de óleo' },
];

type Nivel = 1 | 2 | 3;
const NIVEL: Record<Nivel, { label: string; dot: string; text: string }> = {
  1: { label: 'Agende logo', dot: 'bg-[#FFB000]', text: 'text-[#FFB000]' },
  2: { label: 'Atenção imediata', dot: 'bg-[#FF9F0A]', text: 'text-[#FF9F0A]' },
  3: { label: 'Pare o carro', dot: 'bg-[#FF453A]', text: 'text-[#FF453A]' },
};

const LUZES: { id: string; nome: string; nivel: Nivel; icon: JSX.Element; causa: string; fazer: string }[] = [
  { id: 'oleo', nome: 'Óleo', nivel: 3, icon: <path d="M6 22h6l4-4h8l3 3h4l9-5 3 2-12 13H12a6 6 0 0 1-6-6v-3ZM16 18v-4h8" />,
    causa: 'Pressão do óleo baixa: nível baixo, vazamento ou problema na bomba de óleo.',
    fazer: 'Pare em local seguro e desligue o motor. Não siga viagem: fale com a oficina e, se precisar tirar o carro do lugar, prefira o guincho.' },
  { id: 'temperatura', nome: 'Temperatura', nivel: 3, icon: <path d="M24 6v20M28 11h6M28 17h6M28 23h4M5 40c3-2 5 2 8 0s5 2 8 0 5 2 8 0 5 2 8 0 5 2 6 1M24 26a5 5 0 1 0 0 10a5 5 0 0 0 0-10Z" />,
    causa: 'Motor esquentando: falta de água/aditivo, vazamento, ventoinha ou válvula termostática.',
    fazer: 'Pare em local seguro e desligue o motor. Não abra o reservatório nem jogue água com o motor quente: há risco de queimadura.' },
  { id: 'freio', nome: 'Freio', nivel: 3, icon: <path d="M24 12a12 12 0 1 0 0 24a12 12 0 0 0 0-24ZM9 12a18 18 0 0 0 0 24M39 12a18 18 0 0 1 0 24M24 17v9M24 30.5v1" />,
    causa: 'Freio de mão puxado, fluido de freio baixo ou problema no sistema de freio.',
    fazer: 'Parado em local seguro, confira se o freio de mão está solto. Se a luz continuar acesa, não continue rodando: fale com a oficina e prefira o guincho.' },
  { id: 'bateria', nome: 'Bateria', nivel: 2, icon: <path d="M9 14h30a3 3 0 0 1 3 3v18a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V17a3 3 0 0 1 3-3ZM13 14v-4h6v4M29 14v-4h6v4M13 26h7M32 22.5v7M28.5 26h7" />,
    causa: 'O carro não está carregando direito: alternador, correia ou a própria bateria.',
    fazer: 'O carro pode apagar a qualquer momento. Desligue o que puder e siga só até um lugar seguro ou até a oficina. Se acender com a de temperatura, pare.' },
  { id: 'injecao', nome: 'Injeção', nivel: 1, icon: <path d="M8 20h4v-4h6v-4h12v4h4l4 4h4v14h-4l-4 4H16l-4-4H8V20ZM4 22v10M18 12h12" />,
    causa: 'A central registrou uma falha: sensor, vela, bobina, bico injetor, entre outros.',
    fazer: 'Luz fixa: rode com cuidado e agende o diagnóstico. Piscando: reduza e evite rodar, porque pode danificar o motor e o catalisador.' },
  { id: 'abs', nome: 'ABS', nivel: 1, icon: <path d="M24 12a12 12 0 1 0 0 24a12 12 0 0 0 0-24ZM9 12a18 18 0 0 0 0 24M39 12a18 18 0 0 1 0 24M18.5 28l2.2-8 2.2 8M19.2 25.5h3M25 20v8h2.5a2 2 0 0 0 0-4H25M25 24h2a2 2 0 0 0 0-4h-2" />,
    causa: 'Falha no ABS, geralmente em sensor de roda. O freio comum funciona, mas sem antitravamento.',
    fazer: 'Dirija com mais distância do carro da frente, principalmente na chuva, e agende uma avaliação.' },
];

/** Switch estilo iOS */
function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onChange} className="flex min-h-[48px] w-full items-center justify-between gap-4 px-4 text-left">
      <span className="text-[16px] tracking-tight text-white">{label}</span>
      <span className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-300 ease-apple ${on ? 'bg-gold' : 'bg-white/[0.16]'}`}>
        <span className={`absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-sm transition-transform duration-300 ease-apple ${on ? 'translate-x-[22px]' : 'translate-x-[2px]'}`} />
      </span>
    </button>
  );
}

export default function CheckupMockup() {
  const [aba, setAba] = useState<'sintomas' | 'luzes'>('sintomas');
  const [marcados, setMarcados] = useState<string[]>([]);
  const [modelo, setModelo] = useState('');
  const [luzId, setLuzId] = useState('injecao');
  const luz = LUZES.find((l) => l.id === luzId)!;

  const mensagem = useMemo(() => {
    const linhas: string[] = [CONFIG.mensagens.triagemBase];
    if (modelo.trim()) linhas.push(`Carro: ${modelo.trim()}.`);
    if (marcados.length) linhas.push(`O que está acontecendo: ${marcados.join(', ')}.`);
    linhas.push(CONFIG.mensagens.triagemFim);
    return linhas.join('\n');
  }, [marcados, modelo]);

  const toggle = (id: string) => setMarcados((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  const linkSintomas = wa(mensagem);
  const linkLuz = wa(`Olá, Jota Car! Vim pelo site. Acendeu a luz de ${luz.nome.toLowerCase()} no painel do meu carro e quero orientação.`);

  return (
    <div className="mx-auto w-full max-w-[400px] rounded-[48px] bg-gradient-to-b from-white/[0.14] to-white/[0.04] p-[10px] shadow-[0_40px_120px_-40px_rgba(245,197,24,0.18)]">
      <div className="overflow-hidden rounded-[40px] bg-[#0B0B0C] ring-1 ring-white/[0.06]">
        {/* barra de status */}
        <div className="flex items-center justify-between px-7 pb-1 pt-4 text-[13px] font-semibold text-white">
          <span>9:41</span>
          <span className="h-[22px] w-[86px] rounded-full bg-black ring-1 ring-white/[0.06]" aria-hidden="true" />
          <span className="flex gap-1" aria-hidden="true"><span className="h-2.5 w-4 rounded-sm bg-white/80" /></span>
        </div>

        <div className="px-4 pb-6 pt-4">
          <p className="px-1 text-[13px] font-medium text-mist">Jota Car</p>
          <h3 className="px-1 text-[30px] font-bold tracking-tight text-white">Check-up</h3>

          {/* controle segmentado */}
          <div role="tablist" aria-label="Ferramentas" className="mt-4 grid grid-cols-2 rounded-[10px] bg-white/[0.08] p-[2px]">
            {(['sintomas', 'luzes'] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={aba === t}
                type="button"
                onClick={() => setAba(t)}
                className={`h-8 rounded-[8px] text-[13px] font-semibold tracking-tight transition-all duration-300 ease-apple ${aba === t ? 'bg-white/[0.2] text-white shadow-sm' : 'text-white/60'}`}
              >
                {t === 'sintomas' ? 'Sintomas' : 'Luzes do painel'}
              </button>
            ))}
          </div>

          {aba === 'sintomas' ? (
            <div role="tabpanel" aria-label="Sintomas">
              <p className="mt-5 px-1 text-[13px] uppercase tracking-wide text-mist">O que o carro está fazendo?</p>
              <div className="mt-2 divide-y divide-white/[0.08] overflow-hidden rounded-2xl bg-white/[0.06] backdrop-blur-xl">
                {SINTOMAS.map((s) => (
                  <Toggle key={s.id} label={s.label} on={marcados.includes(s.id)} onChange={() => toggle(s.id)} />
                ))}
              </div>

              <label htmlFor="modelo" className="mt-5 block px-1 text-[13px] uppercase tracking-wide text-mist">Modelo e ano (opcional)</label>
              <input
                id="modelo"
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
                maxLength={60}
                placeholder="Ex.: Onix 2019"
                autoComplete="off"
                className="mt-2 h-12 w-full rounded-2xl bg-white/[0.06] px-4 text-[16px] text-white placeholder:text-white/30 outline-none ring-1 ring-transparent transition focus:ring-gold/60"
              />

              <p className="mt-5 px-1 text-[13px] uppercase tracking-wide text-mist">Sua mensagem</p>
              <p aria-live="polite" className="mt-2 whitespace-pre-line rounded-2xl bg-white/[0.06] px-4 py-3 text-[14px] leading-relaxed text-white/80">{mensagem}</p>

              <a
                href={linkSintomas}
                target="_blank"
                rel="noopener"
                onClick={() => track('wa_triagem', linkSintomas)}
                className="mt-5 flex h-[52px] w-full items-center justify-center rounded-2xl bg-gold text-[17px] font-semibold tracking-tight text-black transition-transform duration-200 active:scale-[0.98]"
              >
                {marcados.length ? `Enviar ${marcados.length} ${marcados.length === 1 ? 'sintoma' : 'sintomas'} para a oficina` : 'Enviar para a oficina'}
              </a>
            </div>
          ) : (
            <div role="tabpanel" aria-label="Luzes do painel">
              <p className="mt-5 px-1 text-[13px] uppercase tracking-wide text-mist">Toque na luz que acendeu</p>
              <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Luzes do painel">
                {LUZES.map((l) => {
                  const ativo = l.id === luzId;
                  const cor = l.nivel === 3 ? '#FF453A' : '#FFB000';
                  return (
                    <button
                      key={l.id}
                      type="button"
                      role="radio"
                      aria-checked={ativo}
                      onClick={() => setLuzId(l.id)}
                      className={`flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-2xl transition-all duration-300 ease-apple ${ativo ? 'bg-white/[0.12]' : 'bg-white/[0.05] hover:bg-white/[0.08]'}`}
                    >
                      <svg viewBox="0 0 48 48" className="h-9 w-9 transition-all duration-300" style={{ color: ativo ? cor : 'rgba(255,255,255,.45)', filter: ativo ? `drop-shadow(0 0 8px ${cor})` : 'none' }} aria-hidden="true">
                        <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">{l.icon}</g>
                      </svg>
                      <span className={`text-[12px] font-medium ${ativo ? 'text-white' : 'text-white/60'}`}>{l.nome}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 divide-y divide-white/[0.08] overflow-hidden rounded-2xl bg-white/[0.06]" aria-live="polite">
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-[16px] font-semibold text-white">Luz de {luz.nome.toLowerCase()}</span>
                  <span className={`flex items-center gap-2 text-[13px] font-semibold ${NIVEL[luz.nivel].text}`}>
                    <span className={`h-2 w-2 rounded-full ${NIVEL[luz.nivel].dot}`} />{NIVEL[luz.nivel].label}
                  </span>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[12px] uppercase tracking-wide text-mist">O que pode ser</p>
                  <p className="mt-1 text-[14px] leading-relaxed text-white/85">{luz.causa}</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[12px] uppercase tracking-wide text-mist">O que fazer agora</p>
                  <p className="mt-1 text-[14px] leading-relaxed text-white/85">{luz.fazer}</p>
                </div>
              </div>

              <a
                href={linkLuz}
                target="_blank"
                rel="noopener"
                onClick={() => track('wa_painel', linkLuz)}
                className="mt-5 flex h-[52px] w-full items-center justify-center rounded-2xl bg-gold text-[17px] font-semibold tracking-tight text-black transition-transform duration-200 active:scale-[0.98]"
              >
                Falar sobre essa luz
              </a>
              <p className="mt-3 px-1 text-[12px] leading-relaxed text-mist">Orientação geral. Não substitui o diagnóstico profissional. Com freio, temperatura ou óleo, na dúvida, não rode.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
