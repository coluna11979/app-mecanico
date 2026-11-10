# MecânicoApp

Marketplace B2B brasileiro que liga oficinas que precisam de mão de obra a mecânicos da região, com rastreio ao vivo e pagamento pela plataforma.

- **Oficinas** → cadastro gratuito, sem mensalidade; pagam só a demanda contratada
- **Plataforma** → taxa de 20% sobre cada demanda (o mecânico vê só o valor líquido, 80%)
- **Admin** → painel com as configurações editáveis

Regras de negócio atuais (demanda, pagamento, cancelamento, módulos): [`docs/regras-gerais.md`](docs/regras-gerais.md).
Tom e palavras proibidas em comunicação: [`docs/marca/dna-marca.md`](docs/marca/dna-marca.md).

## Stack

React 18 · Vite · TypeScript · Tailwind · Supabase (Auth + DB + Realtime) · Mapbox GL JS

## Identidade visual

- **Brand orange `#FF5C0A`** — calor da forja, energia, ação, Brasil
- **Steel `#0B1117`–`#F5F7FA`** — confiança, profissionalismo, neutralidade técnica
- **Verde-sinal**, **vermelho-alerta**, **amarelo-pendente** — semântica clara
- Fonte display: **Space Grotesk**; corpo: **Inter**
- Dois temas: **dark** (mecânico mobile) e **light** (oficina desktop)

📖 **Brandbook completo**: [mecanicoapp.com.br/brandbook](https://mecanicoapp.com.br/brandbook) (fonte: [`public/brandbook/`](public/brandbook/))

## Setup local

```bash
npm install
npm run dev
```

O `.env` já vem preenchido com as credenciais do projeto.

## Banco de dados

Aplique a migration em `supabase/migrations/0001_initial_schema.sql` no SQL Editor do Supabase. Ela cria:

- 8 tabelas (`profiles`, `workshops`, `mechanics`, `jobs`, `job_locations`, `transactions`, `app_settings`, `notifications`)
- Enums e índices
- **Row Level Security** ativado em todas as tabelas, com policies por papel
- Realtime habilitado nas tabelas críticas para tracking
- Seed inicial de `app_settings` (`platform_fee_percent` hoje é 20, ajustado na migração 0106)

### Criando o primeiro admin

Após sign-up via Supabase Auth, rode no SQL Editor:

```sql
insert into public.profiles (id, role, full_name, status)
values ('<UUID-DO-AUTH-USER>', 'admin', 'Admin', 'approved');
```

## Estrutura

```
src/
  pages/
    public/     Landing, Login, Cadastros, PendingApproval
    mecanico/   Dashboard, JobDetail, Tracking, Profile  (mobile, dark)
    oficina/    Dashboard, Search, Tracking, Profile     (desktop, light)
    admin/      Dashboard, Approvals, Mechanics, Workshops, Jobs, Settings
  components/
    layout/     MechanicLayout, WorkshopLayout, AdminLayout
    maps/       MapView (Mapbox)
    Logo.tsx, ProtectedRoute.tsx
  contexts/     AuthContext
  hooks/        useGeoBroadcast, useMechanicLive
  lib/          supabase, settings (cache + getter/setter)
  types/        database.ts
  styles/       globals.css (Tailwind + componentes utilitários)
```

## Tracking ao vivo

1. Mecânico aceita o job → status `assigned`
2. `useGeoBroadcast` lê o GPS via `watchPosition`
3. A cada 5s grava em `mechanics.current_lat/lng` e insere histórico em `job_locations`
4. Tela da oficina escuta via Supabase Realtime (`useMechanicLive`)
5. Mapbox atualiza marcador com ping animado

## Deploy

`vercel.json` já configurado. Defina as variáveis de ambiente no painel da Vercel:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_MAPBOX_TOKEN`

## Próximos passos (fase 2)

- Integração PIX (campos já preparados em `app_settings` e `transactions`)
- Upload de avatares/logos via Supabase Storage
- Notificações push (Web Push API)
- Geocodificação automática do endereço da oficina (Mapbox Geocoding)
- Sistema de avaliações pós-job
