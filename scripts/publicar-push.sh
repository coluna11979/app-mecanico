#!/usr/bin/env bash
# Publica o push de nova demanda no Supabase de produção (passos 1–4).
# Uso:  bash scripts/publicar-push.sh <caminho do vapid.json>
# Não imprime nenhum segredo. Pode rodar de novo sem problema.
set -euo pipefail

cd "$(dirname "$0")/.."
REF=qpwdwjzbgasjsnzpgcyo
API="https://api.supabase.com/v1/projects/$REF"
MCP_JSON="$(git rev-parse --path-format=absolute --git-common-dir)/../.mcp.json"
TOKEN=$(grep -oE 'sbp_[A-Za-z0-9]+' "$MCP_JSON" | head -1)
VAPID_FILE="${1:?informe o caminho do vapid.json}"

[ -n "$TOKEN" ] || { echo "token do Supabase não encontrado em $MCP_JSON"; exit 1; }

sql() {
  node -e "process.stdout.write(JSON.stringify({query: require('fs').readFileSync(0,'utf8')}))" \
    | curl -sf -X POST "$API/database/query" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @-
}

PUB=$(node -e "console.log(require(process.argv[1]).publicKey)" "$VAPID_FILE")
PRIV=$(node -e "console.log(require(process.argv[1]).privateKey)" "$VAPID_FILE")
NOTIFY_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
FN_URL="https://$REF.supabase.co/functions/v1/notify-new-job"

echo "1/4 Migração 0112..."
{ cat supabase/migrations/0112_push_subscriptions.sql
  echo "insert into supabase_migrations.schema_migrations(version, name) values ('20261016030000', '0112_push_subscriptions') on conflict do nothing;"
} | sql > /dev/null

echo "2/4 Secrets da função..."
node -e "process.stdout.write(JSON.stringify([
  {name:'VAPID_PUBLIC_KEY', value:process.argv[1]},
  {name:'VAPID_PRIVATE_KEY', value:process.argv[2]},
  {name:'PUSH_NOTIFY_SECRET', value:process.argv[3]}]))" "$PUB" "$PRIV" "$NOTIFY_SECRET" \
  | curl -sf -X POST "$API/secrets" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @- > /dev/null

echo "3/4 Publicando a função notify-new-job..."
( cd supabase/functions && curl -sf -X POST "$API/functions/deploy?slug=notify-new-job" \
    -H "Authorization: Bearer $TOKEN" \
    -F 'metadata={"entrypoint_path":"notify-new-job/index.ts","name":"notify-new-job","verify_jwt":false}' \
    -F "file=@notify-new-job/index.ts;filename=notify-new-job/index.ts" > /dev/null )

echo "4/4 Segredos do gatilho no Vault..."
sql > /dev/null <<SQL
delete from vault.secrets where name in ('push_notify_url', 'push_notify_secret');
select vault.create_secret('$FN_URL', 'push_notify_url');
select vault.create_secret('$NOTIFY_SECRET', 'push_notify_secret');
SQL

echo "Conferindo..."
sql <<'SQL'
select to_regclass('public.push_subscriptions') is not null as tabela,
       exists(select 1 from pg_trigger where tgname = 'jobs_notify_push') as gatilho,
       exists(select 1 from pg_extension where extname = 'pg_net') as pg_net,
       (select count(*) from vault.secrets where name in ('push_notify_url','push_notify_secret')) as vault
SQL
echo
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$FN_URL" -H 'Content-Type: application/json' -d '{}')
echo "Função responde sem senha com HTTP $code (o esperado é 401)"
echo "Pronto."
