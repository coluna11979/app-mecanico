-- Formulário público de interesse do investidor (link /investir).
-- Coleta só perfil e contato: SEM CPF, RG ou endereço (dados pessoais completos só na hora do contrato).
-- Ninguém lê a tabela pela internet: o envio é por função com validação, honeypot e limite de envios.

create table if not exists public.investor_interests (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  name         text not null,
  email        text not null,
  phone        text not null,
  city         text,
  source       text,                                   -- de onde veio o link (?o=...)
  investor_type text check (investor_type in ('pessoa_fisica', 'empresa')),
  sector       text check (sector in ('dono_oficina', 'setor_automotivo', 'outro_setor')),
  experience   text[] not null default '{}',
  goal         text check (goal in ('retorno', 'apoiar', 'ambos')),
  amount_range text check (amount_range in ('20_25', '25_30', '30_40', 'outro')),
  amount       numeric(14,2) check (amount is null or (amount > 0 and amount <= 100000000)),
  instrument   text check (instrument in ('mutuo_conversivel', 'investidor_anjo', 'quero_entender')),
  horizon      text check (horizon in ('12', '24', '36', 'mais')),
  contact_pref text check (contact_pref in ('whatsapp', 'email', 'ligacao')),
  message      text,
  risk_ack     boolean not null default false,
  consent      boolean not null default false,
  status       text not null default 'novo' check (status in ('novo', 'contatado', 'conversando', 'convertido', 'descartado')),
  admin_note   text,
  converted_investor_id uuid references public.investors(id) on delete set null
);
create index if not exists investor_interests_created_idx on public.investor_interests(created_at desc);
create index if not exists investor_interests_email_idx on public.investor_interests(lower(email), created_at desc);

alter table public.investor_interests enable row level security;
drop policy if exists investor_interests_admin on public.investor_interests;
create policy investor_interests_admin on public.investor_interests for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
drop trigger if exists investor_interests_audit on public.investor_interests;
create trigger investor_interests_audit after insert or update or delete on public.investor_interests
  for each row execute function public.investor_audit();
grant select, insert, update, delete on public.investor_interests to authenticated;

/* ── Envio público (anon): valida, limita e grava ─────────────────────── */
create or replace function public.investor_interest_submit(p jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_name  text := left(trim(coalesce(p->>'name', '')), 120);
  v_email text := lower(left(trim(coalesce(p->>'email', '')), 160));
  v_phone text := left(trim(coalesce(p->>'phone', '')), 30);
  v_amount numeric;
  v_exp   text[];
begin
  -- Campo-isca: robô preenche, pessoa não. Finge sucesso e não grava.
  if coalesce(p->>'website', '') <> '' then return true; end if;

  if length(v_name) < 3 then raise exception 'Informe seu nome.'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Informe um e-mail válido.'; end if;
  if length(regexp_replace(v_phone, '\D', '', 'g')) < 10 then raise exception 'Informe um WhatsApp com DDD.'; end if;
  if coalesce(p->>'consent', 'false') <> 'true' then raise exception 'É preciso autorizar o uso dos seus dados para o contato.'; end if;
  if coalesce(p->>'risk_ack', 'false') <> 'true' then raise exception 'Confirme que leu o aviso de riscos.'; end if;

  begin
    v_amount := nullif(trim(coalesce(p->>'amount', '')), '')::numeric;
  exception when others then
    raise exception 'Valor de investimento inválido.';
  end;

  if (select count(*) from public.investor_interests where lower(email) = v_email and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'Recebemos seu interesse. Aguarde nosso contato.';
  end if;
  if (select count(*) from public.investor_interests where created_at > now() - interval '1 hour') >= 200 then
    raise exception 'Muitos envios agora. Tente novamente mais tarde.';
  end if;

  select coalesce(array_agg(left(x, 40)), '{}') into v_exp
    from (select jsonb_array_elements_text(coalesce(p->'experience', '[]'::jsonb)) x limit 8) t;

  insert into public.investor_interests (name, email, phone, city, source, investor_type, sector, experience, goal, amount_range,
                                         amount, instrument, horizon, contact_pref, message, risk_ack, consent)
  values (v_name, v_email, v_phone, nullif(left(trim(coalesce(p->>'city', '')), 80), ''),
          nullif(left(trim(coalesce(p->>'source', '')), 60), ''),
          nullif(p->>'investor_type', ''), nullif(p->>'sector', ''), v_exp, nullif(p->>'goal', ''), nullif(p->>'amount_range', ''),
          v_amount, nullif(p->>'instrument', ''), nullif(p->>'horizon', ''), nullif(p->>'contact_pref', ''),
          nullif(left(trim(coalesce(p->>'message', '')), 1500), ''), true, true);
  return true;
end $$;

revoke all on function public.investor_interest_submit(jsonb) from public;
grant execute on function public.investor_interest_submit(jsonb) to anon, authenticated;
