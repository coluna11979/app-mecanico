-- De onde a peça veio: 'planilha' (cadastro importado do sistema antigo) ou null (cadastro normal).
-- Aplicada em produção; marca as 2.367 peças da planilha da Jota Car (21/10/2026).
alter table public.workshop_parts add column if not exists origin text;

update public.workshop_parts set origin = 'planilha'
 where workshop_id = '69408e90-6119-4d33-b73d-b91c24ed44de'
   and created_at >= '2026-10-21 15:35:00+00' and created_at < '2026-10-21 15:37:00+00';
