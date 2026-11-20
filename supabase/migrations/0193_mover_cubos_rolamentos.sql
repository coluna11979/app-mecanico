-- Peças já cadastradas: cubos e rolamentos saem de "Rodas e pneus"/"Outros" para as categorias novas (0192).
-- Disco/tambor de freio "com cubo" continua em Freios; rolamento de embreagem continua em Embreagem e câmbio.
update workshop_parts set category = 'cubo'
 where category in ('rodas', 'outros', 'suspensao') and name ~* '\mcubos?\M';

update workshop_parts set category = 'rolamento'
 where category in ('rodas', 'outros', 'suspensao') and name ~* 'rolamento' and name !~* 'embreag|colar';
