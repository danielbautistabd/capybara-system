#!/usr/bin/env bash
# Levanta Capybara Control completo para desarrollo, en una máquina Linux con PostgreSQL 16:
#   PostgreSQL local (puerto 5433) · semilla · Alegra simulado (8098) · backend + interfaz (8099).
# Uso:  bash tools/dev-local.sh          (arranca o reanuda; se puede repetir)
#       bash tools/dev-local.sh stop     (detiene backend y Alegra simulado)
# Las credenciales de Alegra que crea son de PRUEBA y apuntan al simulado. Nunca uses este .env en producción.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API="$ROOT/api"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
PGDATA="${PGDATA:-/var/lib/postgresql/capybara-dev}"
PGPORT="${PGPORT:-5433}"
LOGS="$API/uploads"
mkdir -p "$LOGS"

stop() {
  pkill -f "node src/server.js" 2>/dev/null || true
  pkill -f "tools/fake-alegra.mjs" 2>/dev/null || true
  echo "Backend y Alegra simulado detenidos (PostgreSQL sigue corriendo)."
}
if [ "${1:-}" = "stop" ]; then stop; exit 0; fi

as_pg() { if [ "$(id -u)" = "0" ]; then su postgres -c "$*"; else bash -c "$*"; fi; }

# 1) PostgreSQL
[ -n "$PGBIN" ] || { echo "No encontré PostgreSQL (instala postgresql-16)."; exit 1; }
if [ ! -f "$PGDATA/PG_VERSION" ]; then
  echo "Creando la base de datos local en $PGDATA…"
  as_pg "mkdir -p '$PGDATA' && '$PGBIN/initdb' -D '$PGDATA' -A trust -U postgres >/dev/null"
fi
if ! as_pg "'$PGBIN/pg_ctl' -D '$PGDATA' status" >/dev/null 2>&1; then
  as_pg "'$PGBIN/pg_ctl' -D '$PGDATA' -l '$PGDATA/log.txt' -o '-p $PGPORT -k /tmp' start" >/dev/null
  sleep 2
fi
psql -h /tmp -p "$PGPORT" -U postgres -tc "select 1 from pg_database where datname='capybara_control'" | grep -q 1 \
  || psql -h /tmp -p "$PGPORT" -U postgres -c "create database capybara_control" >/dev/null

# 2) Variables de desarrollo (solo si no existen)
if [ ! -f "$API/.env" ]; then
  cat > "$API/.env" <<EOF
PORT=8099
NODE_ENV=development
PUBLIC_URL=http://localhost:8099
CORS_ORIGINS=http://localhost:8099
JWT_SECRET=solo-desarrollo-local-$(head -c 12 /dev/urandom | od -An -tx1 | tr -d ' \n')
TZ=America/Bogota
CURRENCY=COP
DATABASE_URL=postgresql://postgres@localhost:$PGPORT/capybara_control?schema=public&host=/tmp
STORAGE_DRIVER=local
UPLOAD_DIR=./uploads
AUTO_APPLY_CONFIDENCE=0.85
AUTO_APPLY_ENABLED=false
DUPLICATE_WINDOW_HOURS=12
# Alegra SIMULADO (tools/fake-alegra.mjs). Para el Alegra real, borra ALEGRA_BASE_URL y pon tus credenciales.
ALEGRA_BASE_URL=http://127.0.0.1:8098/api/v1
ALEGRA_EMAIL=pruebas@capybarahostel.com
ALEGRA_TOKEN=token-de-prueba
ALEGRA_DEFAULT_CLIENT_ID=1
ALEGRA_DEFAULT_CATEGORY_ID=5135
ALEGRA_BANK_ACCOUNT_ID=1
ALEGRA_TAX_IVA19_ID=3
ALEGRA_TAX_INC8_ID=4
ALEGRA_SYNC_CRON=0 0 1 1 *
EOF
  echo "Creé api/.env de desarrollo (Alegra simulado)."
fi

# 3) Dependencias, esquema y semilla
cd "$API"
[ -d node_modules ] || npm ci --no-audit --no-fund
npx prisma generate >/dev/null
npx prisma db push --skip-generate >/dev/null
npm run --silent db:seed

# 4) Interfaz compilada
node "$ROOT/web/build.mjs" >/dev/null

# 5) Alegra simulado y backend (en segundo plano)
stop >/dev/null
nohup node "$ROOT/tools/fake-alegra.mjs" > "$LOGS/fake-alegra.log" 2>&1 &
nohup node src/server.js > "$LOGS/api.log" 2>&1 &
for i in $(seq 1 20); do curl -fs http://127.0.0.1:8099/health >/dev/null 2>&1 && break; sleep 0.5; done
curl -fs http://127.0.0.1:8099/health >/dev/null || { echo "El backend no arrancó; revisa api/uploads/api.log"; exit 1; }
cat <<EOF

Capybara Control corriendo:
  App y API      http://localhost:8099   (admin@capybarahostel.com / CambiaEsta2026!)
  Alegra simulado http://localhost:8098   (llamadas en api/uploads/alegra-simulado.json)
  PostgreSQL     localhost:$PGPORT, base capybara_control
  Registros      api/uploads/api.log
Para detener: bash tools/dev-local.sh stop
EOF
