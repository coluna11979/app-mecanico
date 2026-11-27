-- Quadro de melhorias: vários quadros (um por área + quadros criados pelo admin).
create table if not exists public.admin_melhorias_quadros (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  emoji      text not null default '📌',
  cor        text not null default 'steel',
  posicao    double precision not null default extract(epoch from now()),
  criado_em  timestamptz not null default now()
);

alter table public.admin_melhorias_quadros enable row level security;
drop policy if exists admin_all_melhorias_quadros on public.admin_melhorias_quadros;
create policy admin_all_melhorias_quadros on public.admin_melhorias_quadros for all to authenticated
  using      (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'::public.user_role))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'::public.user_role));

-- Quadros iniciais = as áreas que já existiam
insert into public.admin_melhorias_quadros (nome, emoji, cor, posicao)
select v.nome, v.emoji, v.cor, v.pos
from (values
  ('Mecânico',   '🔧', 'brand',   1),
  ('Oficina',    '🏪', 'blue',    2),
  ('Admin',      '🛠️', 'violet',  3),
  ('Pagamentos', '💳', 'emerald', 4),
  ('Marketing',  '📣', 'rose',    5),
  ('Site/Blog',  '🌐', 'cyan',    6),
  ('Agentes IA', '🤖', 'amber',   7),
  ('Geral',      '📌', 'steel',   8)
) as v(nome, emoji, cor, pos)
where not exists (select 1 from public.admin_melhorias_quadros);

alter table public.admin_melhorias
  add column if not exists quadro_id uuid references public.admin_melhorias_quadros(id) on delete cascade;

-- Cartões existentes vão para o quadro da área (sem área/"Outro" → Geral)
update public.admin_melhorias m
   set quadro_id = q.id
  from public.admin_melhorias_quadros q
 where m.quadro_id is null
   and q.nome = case when m.area is null or m.area = 'Outro' then 'Geral' else m.area end;

create index if not exists idx_admin_melhorias_quadro on public.admin_melhorias(quadro_id, status, posicao);
