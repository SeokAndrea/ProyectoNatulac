# ============================================================
# SQL MAESTRO — copia completa de la base (estructura + datos)
# ============================================================
# Saca un solo archivo .sql con TODO lo que hay en el esquema public
# de la base de Supabase en vivo: tablas, datos, funciones (RPC),
# triggers, vistas, policies y permisos para anon/authenticated. Al
# final le agrega lo que vive fuera de public y la app necesita:
#   * pgcrypto en el esquema "extensions" (las claves usan
#     extensions.crypt / extensions.gen_salt)
#   * el bucket "actas" de Storage y sus policies
#   * los jobs de pg_cron (cerrar-turnos-vencidos, relevo-de-respaldo)
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
# Para cargarlo en la base nueva (otro proyecto de Supabase, vacío):
#   psql --single-transaction -v ON_ERROR_STOP=1 -f <archivo>.sql "<cadena de la base nueva>"
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
  $w.WriteLine('-- Destino:  un proyecto de Supabase NUEVO y vacío (usa los roles')
  $w.WriteLine('--           anon/authenticated y los esquemas storage y cron).')
  $w.WriteLine('-- Cargar:   psql --single-transaction -v ON_ERROR_STOP=1 -f <este archivo> "<cadena de la base nueva>"')
  $w.WriteLine('-- Ojo:      tiene usuarios y hashes de claves. Los PDF de las actas')
  $w.WriteLine('--           (Storage, bucket "actas") NO están acá: se copian aparte.')
  $w.WriteLine('-- ============================================================')
  $w.WriteLine('')
  $w.WriteLine('-- 0. Extensiones que usa la app')
  $w.WriteLine('create schema if not exists extensions;')
  $w.WriteLine('create extension if not exists pgcrypto with schema extensions;')
  $w.WriteLine('create extension if not exists pg_cron;')
  $w.WriteLine('')

  # pg_dump 17.6+ escribe \restrict / \unrestrict: son comandos de psql
  # y rompen el SQL Editor. El esquema public ya existe en Supabase.
  $lector = New-Object System.IO.StreamReader($temporal, $utf8)
  try {
    while ($null -ne ($linea = $lector.ReadLine())) {
      if ($linea -match '^\\(un)?restrict ') { continue }
      if ($linea -match '^COMMENT ON SCHEMA public ') { continue }
      if ($linea -eq 'CREATE SCHEMA public;') { $linea = 'CREATE SCHEMA IF NOT EXISTS public;' }
      $w.WriteLine($linea)
    }
  } finally { $lector.Close() }

  $w.WriteLine('')
  $w.WriteLine('-- ============================================================')
  $w.WriteLine('-- Fuera de public: Storage y pg_cron')
  $w.WriteLine('-- ============================================================')
  $w.WriteLine('SET search_path = public, extensions;')
  $w.WriteLine('')
  $w.WriteLine('-- Bucket público "actas" (ver 20260948090000_actas_pdf.sql)')
  $w.WriteLine("insert into storage.buckets (id, name, public) values ('actas', 'actas', true) on conflict (id) do nothing;")
  $w.WriteLine('drop policy if exists "actas_insert" on storage.objects;')
  $w.WriteLine("create policy `"actas_insert`" on storage.objects for insert to anon, authenticated with check (bucket_id = 'actas');")
  $w.WriteLine('drop policy if exists "actas_select" on storage.objects;')
  $w.WriteLine("create policy `"actas_select`" on storage.objects for select to anon, authenticated using (bucket_id = 'actas');")
  $w.WriteLine('')
  $w.WriteLine('-- Jobs de pg_cron (ver 20260944090000 y 20261080090000)')
  $w.WriteLine("select cron.schedule('cerrar-turnos-vencidos', '*/5 * * * *', `$`$select cerrar_turnos_vencidos();`$`$);")
  $w.WriteLine("select cron.schedule('relevo-de-respaldo', '*/5 * * * *', `$`$select relevo_de_respaldo();`$`$);")
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
