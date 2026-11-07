import { Link } from 'react-router-dom';
import { Logo } from '@/components/Logo';

/**
 * Entrada simplificada do cadastro — pensada pra ser destino direto de anúncio
 * (Facebook, Google, etc.). O público escolhe o tipo e cai no formulário completo
 * que já existe. Sem menu, sem rodapé, sem nada que desvie da conversão.
 *
 * Os links carregam utm_content separado por público pra o admin conseguir medir
 * cliques de oficina × mecânico em marketing_attributions.
 */
export default function SignupChooser() {
  return (
    <div className="min-h-screen bg-steel-900 text-white flex flex-col">
      {/* Logo discreta no topo — identidade sem roubar atenção */}
      <header className="px-6 pt-8 sm:px-10 sm:pt-10">
        <Logo light size={36} />
      </header>

      {/* Conteúdo centralizado vertical e horizontalmente */}
      <main className="flex-1 flex items-center justify-center px-6 pb-16">
        <div className="w-full max-w-3xl text-center">
          <h1 className="font-display font-bold tracking-tight leading-[1.1] text-[clamp(1.75rem,4.5vw,3.25rem)]">
            Sua oficina precisa de <span className="text-brand-500">mão de obra?</span>
            <br />
            Ou você é mecânico e busca <span className="text-brand-500">novas oportunidades?</span>
          </h1>

          <p className="mt-6 text-steel-400 text-base sm:text-lg">
            Escolha como deseja utilizar o MecânicoApp.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/cadastro/oficina?utm_source=facebook&utm_medium=signup-chooser&utm_content=oficina"
              className="inline-flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 active:scale-[0.99] transition rounded-full px-7 py-4 font-bold text-base sm:text-lg min-h-[56px] shadow-brand"
            >
              Cadastrar minha oficina
              <span aria-hidden>→</span>
            </Link>

            <Link
              to="/cadastro/mecanico?utm_source=facebook&utm_medium=signup-chooser&utm_content=mecanico"
              className="inline-flex items-center justify-center gap-2 bg-white text-steel-900 hover:bg-steel-100 active:scale-[0.99] transition rounded-full px-7 py-4 font-bold text-base sm:text-lg min-h-[56px]"
            >
              Quero ser mecânico
              <span aria-hidden>→</span>
            </Link>
          </div>

          <Link
            to="/login"
            className="mt-10 inline-block text-sm text-steel-400 hover:text-white transition"
          >
            Já tenho conta → Entrar
          </Link>
        </div>
      </main>
    </div>
  );
}
