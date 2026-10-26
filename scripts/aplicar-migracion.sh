#!/usr/bin/env bash
# Aplica migraciones a la base de PRODUCCIÓN (Postgres de planta) con los datos
# de .env.local (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD), sin
# escribir la clave. Cada archivo va en una sola transacción: si algo falla,
# no se aplica nada de ese archivo y el script se detiene. Al final recarga
# PostgREST para que la app vea las funciones nuevas.
#
# Uso, en el servidor, desde la carpeta del proyecto:
#   bash scripts/aplicar-migracion.sh supabase/migrations/20261112150000_origen_paradas_por_quien_registra.sql
# Varios archivos: se aplican en el orden dado.
set -euo pipefail

cd "$(dirname "$0")/.."
if [ ! -f .env.local ]; then
  echo "No está .env.local en $(pwd)." >&2
  exit 1
fi
if [ "$#" -eq 0 ]; then
  echo "Uso: bash scripts/aplicar-migracion.sh <archivo.sql> [otro.sql ...]" >&2
  exit 1
fi

# .env.local puede venir de Windows (CRLF): se quita el \r antes de leerlo, y las comillas si las tiene.
leer() { sed 's/\r$//' .env.local | grep -E "^$1=" | tail -1 | cut -d= -f2- | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"; }
export PGHOST="$(leer DB_HOST)" PGPORT="$(leer DB_PORT)" PGDATABASE="$(leer DB_NAME)" PGUSER="$(leer DB_USER)" PGPASSWORD="$(leer DB_PASSWORD)"

if command -v psql >/dev/null 2>&1; then
  correr() { psql -v ON_ERROR_STOP=1 "$@"; }
else
  echo "(sin psql en el servidor: se usa la imagen postgres:16 de Docker)"
  correr() {
    docker run --rm -i --network host -e PGHOST -e PGPORT -e PGDATABASE -e PGUSER -e PGPASSWORD \
      -v "$(pwd)":/w -w /w postgres:16 psql -v ON_ERROR_STOP=1 "$@"
  }
fi

echo "Base: $PGDATABASE en $PGHOST:$PGPORT (usuario $PGUSER)"
for archivo in "$@"; do
  echo "→ $archivo"
  correr -1 -f "$archivo"
done
correr -c "NOTIFY pgrst, 'reload schema';"
echo "Listo. Revisa con scripts/revisar-migraciones-pendientes.sql."
