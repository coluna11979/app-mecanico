-- Peças já cadastradas: cubos e rolamentos saem de "Rodas e pneus"/"Outros"/"Suspensão" para as categorias novas (0192).
-- Disco/tambor de freio "com cubo" continua em Freios; rolamento de embreagem/câmbio/polia não é de roda.
update workshop_parts set category = 'cubo'
 where category in ('rodas', 'outros', 'suspensao') and name ~* '\mcubos?\M';

update workshop_parts set category = 'rolamento'
 where category in ('rodas', 'outros', 'suspensao') and name ~* 'rolamento'
   and name !~* 'embreag|colar|cambio|câmbio|polia|tensor|alternador';

-- Arrumação: cilindro de roda é de freio; homocinética é de transmissão
update workshop_parts set category = 'freios'
 where category = 'rodas' and name ~* 'cilindro';
update workshop_parts set category = 'transmissao'
 where category in ('rodas', 'suspensao') and name ~* 'homoc|homic';
