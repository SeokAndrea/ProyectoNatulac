# ============================================================
# SQL MAESTRO — copia completa de la base (estructura + datos)
# ============================================================
# Saca un solo archivo .sql con TODO lo que hay en el esquema public
# de la base de Supabase en vivo: tablas, datos, funciones (RPC),
# triggers, vistas, policies y permisos para anon/authenticated.
#
# El destino es un PostgreSQL normal (sin Supabase), así que el
# archivo trae primero lo que Supabase ya da hecho:
#   * los roles anon / authenticated / service_role (sin login: solo
#     para que valgan los GRANT y las policies)
#   * pgcrypto en el esquema "extensions" (las claves usan
#     extensions.crypt / extensions.gen_salt)
#   * auth.uid(): lo usan los triggers de auditoría; acá devuelve null,
#     igual que hoy, porque la app no usa Supabase Auth
# y se sacan los GRANT a roles internos de Supabase (supabase_admin...).
# Al final, cada uno solo si la base nueva lo tiene:
#   * el bucket "actas" de Storage y sus policies (solo Supabase)
#   * los jobs de pg_cron (cerrar-turnos-vencidos, relevo-de-respaldo)
# Si no hay pg_cron, el archivo carga igual y lo avisa con un NOTICE.
#
# Lo que NO va en el archivo: los PDF de las actas guardados en
# Storage. Hay que copiar esos archivos aparte.
#
# El archivo tiene usuarios y hashes de claves: no subirlo a GitHub
# ni mandarlo por un canal abierto. Por defecto se guarda FUERA del
# repo, en Documentos\natulac-respaldos.
#
# Requisito: pg_dump 17 o más nuevo (Supabase corre Postgres 17).
# Viene con el instalador de PostgreSQL para Windows
# (https://www.enterprisedb.com/downloads/postgres-postgresql-downloads):
# alcanza con marcar solo "Command Line Tools".
#
# Uso (desde la carpeta ProyectoNatulac):
#   powershell -ExecutionPolicy Bypass -File scripts\generar-sql-maestro.ps1
# Pide la cadena de conexión y la clave de la base. La cadena sale de
# Supabase > botón "Connect" > "Session pooler" (puerto 5432). La
# "Direct connection" (db.xxx.supabase.co) solo anda por IPv6.
#
# Para cargarlo en la base nueva (vacía):
#   createdb -U postgres natulac
#   psql -U postgres -d natulac --single-transaction -v ON_ERROR_STOP=1 -f <archivo>.sql
# ============================================================

param(
  [string]$Url = $env:NATULAC_DB_URL,
  [string]$Salida
)

$ErrorActionPreference = 'Stop'

# ------------------------------------------------------------
# 1. Buscar pg_dump (PATH o la instalación de PostgreSQL)
# ------------------------------------------------------------
$pgDump = $null
$enPath = Get-Command pg_dump -ErrorAction SilentlyContinue
if ($enPath) { $pgDump = $enPath.Source }
if (-not $pgDump) {
  $candidatos = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\pg_dump.exe' -ErrorAction SilentlyContinue |
    Sort-Object { [int]$_.Directory.Parent.Name } -Descending
  if ($candidatos) { $pgDump = $candidatos[0].FullName }
}
if (-not $pgDump) {
  Write-Host ''
  Write-Host 'No encontré pg_dump en esta PC.' -ForegroundColor Red
  Write-Host 'Instalar PostgreSQL 17 para Windows marcando solo "Command Line Tools":'
  Write-Host '  https://www.enterprisedb.com/downloads/postgres-postgresql-downloads'
  Write-Host 'Después volver a correr este script.'
  exit 1
}

$versionTexto = & $pgDump --version
$major = 0
if ($versionTexto -match '(\d+)\.') { $major = [int]$Matches[1] }
Write-Host "Usando $versionTexto ($pgDump)"
if ($major -lt 17) {
  Write-Host 'Ese pg_dump es más viejo que la base (Postgres 17) y no va a poder leerla. Instalar la versión 17.' -ForegroundColor Red
  exit 1
}

# ------------------------------------------------------------
# 2. Cadena de conexión y clave
# ------------------------------------------------------------
if (-not $Url) {
  Write-Host ''
  Write-Host 'Pegá la cadena de conexión (Supabase > Connect > Session pooler).'
  Write-Host 'Ejemplo: postgresql://postgres.abcd1234:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres'
  $Url = (Read-Host 'Cadena').Trim()
}
if (-not $Url) { Write-Host 'Falta la cadena de conexión.' -ForegroundColor Red; exit 1 }

# Si la cadena trae el marcador [YOUR-PASSWORD] o no trae clave, la
# clave se pide aparte y va por PGPASSWORD: así no hay que escapar
# caracteres raros (@, #, /) dentro de la URL.
$Url = $Url -replace ':\[YOUR-PASSWORD\]@', '@'
$traeClave = $Url -match '^postgres(ql)?://[^/@]*:[^/@]+@'
if (-not $traeClave) {
  $segura = Read-Host 'Clave de la base' -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura)
  try { $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

# Para el encabezado: la cadena sin la clave.
$origen = $Url -replace '(://[^/@:]+):[^/@]+@', '$1:***@'

# ------------------------------------------------------------
# 3. Volcado del esquema public (estructura + datos)
# ------------------------------------------------------------
# --inserts (en vez de COPY) para que el archivo también se pueda
# correr en el SQL Editor de Supabase y no solo con psql.
# --no-owner: en la base nueva todo queda del usuario que lo carga.
# Los GRANT a anon/authenticated SÍ van: sin ellos la app no puede
# llamar a las RPC.
$fecha = Get-Date -Format 'yyyyMMdd-HHmm'
if (-not $Salida) {
  $carpeta = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'natulac-respaldos'
  New-Item -ItemType Directory -Force $carpeta | Out-Null
  $Salida = Join-Path $carpeta "natulac-maestro-$fecha.sql"
}
$temporal = Join-Path ([IO.Path]::GetTempPath()) "natulac-dump-$fecha.sql"

Write-Host ''
Write-Host 'Volcando la base (puede tardar un par de minutos)...'
& $pgDump --dbname="$Url" --schema=public --no-owner --inserts --rows-per-insert=500 --encoding=UTF8 --file="$temporal"
$codigo = $LASTEXITCODE
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
if ($codigo -ne 0) {
  Remove-Item $temporal -ErrorAction SilentlyContinue
  Write-Host 'pg_dump falló (ver el mensaje de arriba). Revisar la cadena, la clave y que sea el Session pooler.' -ForegroundColor Red
  exit $codigo
}

# ------------------------------------------------------------
# 4. Armar el archivo maestro
# ------------------------------------------------------------
$utf8 = New-Object System.Text.UTF8Encoding($false)  # sin BOM: psql no lo acepta
$w = New-Object System.IO.StreamWriter($Salida, $false, $utf8)
try {
  $w.WriteLine('-- ============================================================')
  $w.WriteLine('-- NATULAC ASÉPTICO — SQL MAESTRO (estructura + datos)')
  $w.WriteLine('-- ============================================================')
  $w.WriteLine("-- Generado: $(Get-Date -Format 'yyyy-MM-dd HH:mm') con $versionTexto")
  $w.WriteLine("-- Origen:   $origen")
  $w.WriteLine('-- Destino:  PostgreSQL 17 (sirve también para otro Supabase).')
  $w.WriteLine('-- Cargar:   createdb -U postgres natulac')
  $w.WriteLine('--           psql -U postgres -d natulac --single-transaction -v ON_ERROR_STOP=1 -f <este archivo>')
  $w.WriteLine('-- Ojo:      tiene usuarios y hashes de claves. Los PDF de las actas')
  $w.WriteLine('--           (Storage, bucket "actas") NO están acá: se copian aparte.')
  $w.WriteLine('-- ============================================================')
  $w.WriteLine('')
  $w.Write(@'
-- 0. Lo que Supabase ya trae hecho y un Postgres normal no.
-- Roles sin login: solo para que valgan los GRANT y las policies.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- auth.uid() lo usan los triggers de auditoría. La app no usa
-- Supabase Auth, así que en Supabase también da null.
create schema if not exists auth;
do $$
begin
  if to_regprocedure('auth.uid()') is null then
    create function auth.uid() returns uuid language sql stable as $f$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $f$;
  end if;
end $$;

'@)

  # Limpieza de lo que pg_dump escribe y no carga en un Postgres normal:
  #   * \restrict / \unrestrict (pg_dump 17.6+): comandos de psql que
  #     rompen el SQL Editor
  #   * SET transaction_timeout: no existe antes de Postgres 17
  #   * GRANT/REVOKE/ALTER DEFAULT PRIVILEGES a roles internos de
  #     Supabase, y las publicaciones de Realtime: allá no existen
  $rolesSupabase = '\b(supabase_\w+|authenticator|dashboard_user|pgbouncer|pgsodium\w*)\b'
  $sacadas = 0
  $lector = New-Object System.IO.StreamReader($temporal, $utf8)
  try {
    while ($null -ne ($linea = $lector.ReadLine())) {
      if ($linea -match '^\\(un)?restrict ') { continue }
      if ($linea -match '^SET transaction_timeout') { continue }
      if ($linea -match '^COMMENT ON SCHEMA public ') { continue }
      if ($linea -match '^ALTER PUBLICATION ') { $sacadas++; continue }
      if ($linea -match '^(GRANT|REVOKE|ALTER DEFAULT PRIVILEGES) ' -and $linea -match $rolesSupabase) { $sacadas++; continue }
      if ($linea -eq 'CREATE SCHEMA public;') { $linea = 'CREATE SCHEMA IF NOT EXISTS public;' }
      $w.WriteLine($linea)
    }
  } finally { $lector.Close() }

  $w.Write(@'

-- ============================================================
-- Fuera de public: Storage y pg_cron, cada uno solo si existe
-- ============================================================
SET search_path = public, extensions;

-- Bucket público "actas" (ver 20260948090000_actas_pdf.sql). Solo
-- existe en Supabase; en un Postgres normal se salta.
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'Sin Storage (no es Supabase): se salta el bucket "actas".';
    return;
  end if;
  insert into storage.buckets (id, name, public) values ('actas', 'actas', true) on conflict (id) do nothing;
  drop policy if exists "actas_insert" on storage.objects;
  create policy "actas_insert" on storage.objects for insert to anon, authenticated with check (bucket_id = 'actas');
  drop policy if exists "actas_select" on storage.objects;
  create policy "actas_select" on storage.objects for select to anon, authenticated using (bucket_id = 'actas');
end $$;

-- Jobs cada 5 minutos (ver 20260944090000 y 20261080090000): cierran
-- los turnos vencidos y hacen el relevo de respaldo. Si la base no
-- tiene pg_cron, hay que programar esas dos llamadas por otro lado.
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'Sin pg_cron (%): programar cada 5 minutos "select cerrar_turnos_vencidos(); select relevo_de_respaldo();"', sqlerrm;
    return;
  end;
  perform cron.schedule('cerrar-turnos-vencidos', '*/5 * * * *', 'select cerrar_turnos_vencidos();');
  perform cron.schedule('relevo-de-respaldo', '*/5 * * * *', 'select relevo_de_respaldo();');
end $$;

'@)
} finally { $w.Close() }

Remove-Item $temporal -ErrorAction SilentlyContinue

# ------------------------------------------------------------
# 5. Resumen
# ------------------------------------------------------------
$tablas = (Select-String -Path $Salida -Pattern '^CREATE TABLE ' -Encoding UTF8).Count
$funciones = (Select-String -Path $Salida -Pattern '^CREATE FUNCTION ' -Encoding UTF8).Count
$inserts = (Select-String -Path $Salida -Pattern '^INSERT INTO ' -Encoding UTF8).Count
$mb = [math]::Round((Get-Item $Salida).Length / 1MB, 1)

Write-Host ''
Write-Host 'Listo.' -ForegroundColor Green
Write-Host "  Archivo:   $Salida ($mb MB)"
Write-Host "  Tablas:    $tablas"
Write-Host "  Funciones: $funciones"
Write-Host "  Bloques de datos (INSERT de hasta 500 filas): $inserts"
Write-Host "  Líneas sacadas por ser solo de Supabase: $sacadas"
