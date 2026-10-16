# Relatório de Análise — MecânicoApp
**Data:** 11/05/2026  
**App:** www.mecanicoapp.com.br  
**Stack:** React 18 + TypeScript + Vite 5 + Supabase + Stripe + Mapbox GL + Vercel

---

## Score Geral

| Categoria | Score | Resumo |
|-----------|-------|--------|
| 🔒 Segurança | **C** | 2 bugs críticos de autenticação, headers ausentes |
| 🐛 Bugs | **D** | 2 tabelas/funções faltando em produção |
| ⚡ Performance | **B** | Bundle bem configurado, mas gaps pontuais |
| 🏗️ Código | **B+** | Arquitetura sólida, alguns pontos de atenção |

---

## 🚨 CRÍTICO — Corrigir Antes do Próximo Deploy

### 1. `workshop_members` table não existe nas migrations

**Arquivo afetado:** `src/contexts/AuthContext.tsx:66`  
**Problema:** O `AuthContext` faz query em `workshop_members` mas essa tabela nunca foi criada em nenhuma migration (0001–0004). Em produção, qualquer usuário com role `workshop` recebe erro silencioso e `workshops: []` no contexto — o painel da oficina fica inacessível.

```ts
// AuthContext.tsx linha 65-66 — faz query numa tabela que não existe
const memQuery = supabase
  .from('workshop_members')    // ❌ tabela não existe nas migrations
  .select('workshop_id')
  .eq('profile_id', uid);
```

**Fix — criar a migration `0005_create_workshop_members.sql`:**
```sql
create table if not exists public.workshop_members (
  id          uuid primary key default uuid_generate_v4(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  role        text not null default 'owner',
  created_at  timestamptz not null default now(),
  unique (workshop_id, profile_id)
);

alter table public.workshop_members enable row level security;

create policy workshop_members_read on public.workshop_members for select
  using (profile_id = auth.uid() or public.is_admin(auth.uid()));

create policy workshop_members_owner_write on public.workshop_members for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- Ao criar oficina, inserir o dono automaticamente
create or replace function public.add_workshop_owner()
returns trigger language plpgsql security definer as $$
begin
  insert into public.workshop_members (workshop_id, profile_id, role)
  values (new.id, new.profile_id, 'owner');
  return new;
end;
$$;

create trigger workshops_add_owner
  after insert on public.workshops
  for each row execute function public.add_workshop_owner();

-- Migrar donos existentes
insert into public.workshop_members (workshop_id, profile_id, role)
select id, profile_id, 'owner' from public.workshops
on conflict do nothing;
```

---

### 2. `public_stripe_config` RPC não existe no banco

**Arquivo afetado:** `src/lib/stripeConfig.ts:19`  
**Problema:** `stripeConfig.ts` chama `supabase.rpc('public_stripe_config')` mas essa função nunca foi criada em nenhuma migration. Qualquer fluxo de pagamento (cobrança de multa de cancelamento em `PendingFeesGate.tsx`) retorna erro.

```ts
// stripeConfig.ts linha 19 — RPC que não existe
const { data, error } = await supabase.rpc('public_stripe_config'); // ❌
```

**Fix — criar a migration `0006_stripe_config_rpc.sql`:**
```sql
-- Adicionar settings de Stripe na tabela app_settings
insert into public.app_settings (key, value, description) values
  ('stripe_mode',            'test', 'Modo Stripe: test ou live'),
  ('stripe_publishable_key', '',     'Stripe publishable key (test)'),
  ('stripe_publishable_key_live', '', 'Stripe publishable key (live)')
on conflict (key) do nothing;

-- RPC pública que retorna apenas a publishable key (nunca a secret)
create or replace function public.public_stripe_config()
returns json language sql stable security definer as $$
  select json_build_object(
    'mode', (select value from public.app_settings where key = 'stripe_mode'),
    'publishable_key', (
      select case
        when (select value from public.app_settings where key = 'stripe_mode') = 'live'
        then (select value from public.app_settings where key = 'stripe_publishable_key_live')
        else (select value from public.app_settings where key = 'stripe_publishable_key')
      end
    )
  );
$$;

grant execute on function public.public_stripe_config() to authenticated;
```

---

### 3. `app_settings` expõe configurações sensíveis a qualquer usuário autenticado

**Arquivo afetado:** `supabase/migrations/0001_initial_schema.sql:243`, `src/lib/settings.ts`  
**Problema:** A política `settings_read` permite que **qualquer usuário autenticado** (mecânico, oficina) leia TODOS os `app_settings`, incluindo `pix_client_id` e `pix_client_secret` (credenciais do provedor PIX). Um mecânico pode chamar `getSetting('pix_client_secret')` e obter as credenciais do sistema de pagamento.

```sql
-- migration 0001 linha 243 — leitura irrestrita para qualquer autenticado
create policy settings_read on public.app_settings for select
  using (auth.uid() is not null);  -- ❌ qualquer autenticado lê tudo
```

**Fix — separar settings públicas e privadas:**
```sql
-- 0007_fix_settings_rls.sql
alter table public.app_settings add column if not exists is_public boolean not null default true;

-- Marcar configurações sensíveis como privadas
update public.app_settings set is_public = false
where key in ('pix_client_secret', 'pix_client_id', 'stripe_publishable_key_live',
              'stripe_secret_key', 'resend_api_key');

-- Atualizar policy: usuários comuns só leem settings públicas
drop policy if exists settings_read on public.app_settings;
create policy settings_read on public.app_settings for select
  using (
    (is_public = true and auth.uid() is not null)
    or public.is_admin(auth.uid())
  );
```

---

## ⚠️ CUIDADO — Corrigir em Breve

### 4. Headers de segurança HTTP ausentes no Vercel

**Arquivo afetado:** `vercel.json`  
**Problema:** O `vercel.json` não configura nenhum header de segurança. Isso significa:
- Sem `X-Frame-Options` → o app pode ser embedado em iframes (ataque de clickjacking)
- Sem `X-Content-Type-Options` → browsers podem inferir MIME type incorreto
- Sem `Referrer-Policy` → URL do app vaza em requests externos

**Fix:**
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "geolocation=(self), camera=(), microphone=()" },
        { "key": "X-XSS-Protection", "value": "1; mode=block" }
      ]
    },
    {
      "source": "/sw.js",
      "headers": [
        { "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" }
      ]
    }
  ],
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

---

### 5. Canal Broadcast do GPS não tem proteção de acesso

**Arquivo afetado:** `src/hooks/useGeoBroadcast.ts`, `src/hooks/useMechanicLive.ts`  
**Problema:** O canal `tracking:${jobId}` usa Supabase Broadcast — que **não passa por RLS**. Qualquer usuário autenticado que descobrir o `jobId` pode assinar `tracking:${jobId}` e receber a localização GPS em tempo real do mecânico, mesmo não sendo parte do job.

```ts
// qualquer autenticado pode fazer isso e rastrear o mecânico
const ch = supabase.channel('tracking:UUID_DO_JOB');
ch.on('broadcast', { event: 'position' }, ({ payload }) => {
  console.log('Localização do mecânico:', payload); // ← sem controle
}).subscribe();
```

**Impacto:** Baixo por agora (poucos usuários), mas cresce com a plataforma.

**Fix recomendado:** Adicionar um token de acesso derivado do jobId + sessão do usuário, validado via Edge Function ou via Supabase Realtime com `postgres_changes` (que tem RLS).

---

### 6. `useNewJobAlert` — todos os mecânicos recebem todos os jobs sem filtro

**Arquivo afetado:** `src/hooks/useNewJobAlert.ts:21`  
**Problema:** O hook assina `INSERT` na tabela `jobs` sem nenhum filtro. Com 100 mecânicos online, todos recebem notificação de cada novo job — sem considerar localização, habilidades ou disponibilidade. Além do problema de performance, isso é um vazamento de informação (mecânicos recebem dados de jobs que podem não ser para eles).

```ts
// useNewJobAlert.ts — sem filtro de localidade ou habilidade
{ event: 'INSERT', schema: 'public', table: 'jobs' }  // ❌ todos os jobs
```

---

### 7. `useNewJobAlert` — bug de stale closure (`onNewJob` fora das dependências)

**Arquivo afetado:** `src/hooks/useNewJobAlert.ts:20`  
**Problema:** O `useEffect` lista apenas `[enabled]` como dependências, mas usa `onNewJob` internamente. Se `onNewJob` mudar (por exemplo, capturar estado novo via closure), o hook continuará usando a versão antiga da função — resultando em comportamento inesperado no Dashboard do mecânico.

```ts
useEffect(() => {
  if (!enabled) return;
  const ch = supabase.channel('mechanic:job_alerts')
    .on('postgres_changes', {...}, payload => {
      onNewJob(job); // ← onNewJob pode estar desatualizado
    }).subscribe();
  return () => { supabase.removeChannel(ch); };
}, [enabled]); // ❌ falta: onNewJob
```

**Fix:**
```ts
const onNewJobRef = useRef(onNewJob);
useEffect(() => { onNewJobRef.current = onNewJob; }, [onNewJob]);

useEffect(() => {
  if (!enabled) return;
  const ch = supabase.channel('mechanic:job_alerts')
    .on('postgres_changes', {...}, payload => {
      onNewJobRef.current(job); // ✅ sempre usa versão atual
    }).subscribe();
  return () => { supabase.removeChannel(ch); };
}, [enabled]);
```

---

## 💡 DICAS — Melhorias Recomendadas

### 8. Mapbox token sem restrição de domínio

O token `VITE_MAPBOX_TOKEN` está embutido no bundle JS de produção (arquivo `dist/assets/index-BKMRp7i0.js`). Isso é esperado para tokens de frontend, mas sem restrição de domínio no dashboard do Mapbox, qualquer pessoa que inspecionar o bundle pode usar o token e consumir sua cota.

**Fix:** No [dashboard do Mapbox](https://account.mapbox.com/access-tokens/), adicionar restrição de URL ao token: `https://www.mecanicoapp.com.br/*`.

---

### 9. Stripe em modo teste com chave no bundle

A `VITE_STRIPE_PUBLISHABLE_KEY` (modo `pk_test_...`) está no bundle. Isso é OK para desenvolvimento, mas confirme que:
- O Vercel tem as variáveis de ambiente corretas configuradas (não o `.env` local)
- Quando mudar para `live`, a chave live NUNCA vai para o `.env` local — configure diretamente no Vercel

---

### 10. Lazy loading do Mapbox GL (performance)

**Arquivo afetado:** `vite.config.ts`  
O Mapbox GL (chunk `mapbox-Dyyi5T2h.js`) é pesado (~3.7MB minified) e está em chunk separado (bom!), mas é carregado para TODOS os usuários, incluindo oficinas e admins que nunca usam o mapa.

**Fix — lazy import nas páginas de mapa:**
```tsx
// src/pages/mecanico/Mapa.tsx
const MapView = lazy(() => import('@/components/maps/MapView'));
```

---

### 11. Polling agressivo no chat (4 segundos)

**Arquivo afetado:** `src/hooks/useMessages.ts:64`  
O fallback de polling no chat dispara a cada 4 segundos. Com 50 conversas simultâneas, são 750 queries/minuto só de fallback. O Realtime do Supabase é confiável na maior parte do tempo — considere aumentar o intervalo de polling para 15-30 segundos.

---

### 12. Nenhuma paginação nas mensagens do chat

**Arquivo afetado:** `src/hooks/useMessages.ts:21`  
```ts
const { data } = await supabase
  .from('messages')
  .select('*')        // ← sem limite
  .eq('job_id', jobId)
  .order('created_at', { ascending: true });
```
Jobs antigos com centenas de mensagens carregarão tudo de uma vez. Adicione `.limit(100)` e paginação regressiva.

---

### 13. Type assertion insegura no AuthContext

**Arquivo afetado:** `src/contexts/AuthContext.tsx:43`  
```ts
const result = await withTimeout(
  query as unknown as Promise<{ data: Profile | null; error: ... }>, // ← as unknown as
  ...
```
O padrão `as unknown as X` desliga a checagem de tipos do TypeScript. Isso pode esconder erros de runtime. Considere tipar `withTimeout` com generics adequados.

---

## Resumo dos Findings

| # | Tipo | Severity | Status |
|---|------|----------|--------|
| 1 | Tabela `workshop_members` ausente | 🚨 Crítico | Requer migration |
| 2 | RPC `public_stripe_config` ausente | 🚨 Crítico | Requer migration |
| 3 | `app_settings` expõe dados sensíveis | 🚨 Crítico | Requer migration |
| 4 | Headers HTTP ausentes (Vercel) | ⚠️ Cuidado | Editar `vercel.json` |
| 5 | GPS Broadcast sem proteção de acesso | ⚠️ Cuidado | Refactor planejado |
| 6 | `useNewJobAlert` sem filtro | ⚠️ Cuidado | Refactor recomendado |
| 7 | Stale closure em `useNewJobAlert` | ⚠️ Bug | Fix simples |
| 8 | Mapbox token sem restrição de domínio | 💡 Dica | Config externa |
| 9 | Stripe chave em bundle | 💡 Info | Verificar config Vercel |
| 10 | Mapbox não lazy-loaded | 💡 Performance | Lazy import |
| 11 | Polling chat agressivo | 💡 Performance | Aumentar intervalo |
| 12 | Sem paginação nas mensagens | 💡 Performance | Adicionar `.limit()` |
| 13 | `as unknown as` no AuthContext | 💡 Código | Tipar corretamente |

---

## Pontos Positivos ✅

- **RLS habilitado em todas as tabelas** — excelente base de segurança
- **Nenhuma `service_role` key no frontend** — chave mais perigosa está protegida
- **`.env` e `.mcp.json` no `.gitignore`** — nunca foram commitados
- **ProtectedRoute bem implementado** — verifica autenticação E role E status de aprovação
- **Auth com grace period** — evita logout espúrio de drops temporários do SDK
- **Chunks separados no Vite** — mapbox, supabase e react em bundles distintos
- **PWA configurado** — service worker, manifest, offline support
- **TypeScript strict mode** — catch de erros em compile time
- **Cleanup de channels realtime** — sem memory leaks nos hooks
- **Stripe via RPC** — arquitetura correta (busca config do banco, não hardcoded)

---

*Relatório gerado em 11/05/2026. Válido para o estado atual do código.*
