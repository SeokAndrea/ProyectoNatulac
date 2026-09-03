-- ============================================================
-- sabor_display(): Selecto muestra "35%", no "(Selecto)"
-- ============================================================
-- La familia Selecto es el "35%". En vez de "Manzana (Selecto)" —
-- largo y redundante — se muestra "Manzana 35%": más corto y ya
-- desambigua contra el Clásico igual. Si el nombre del sabor YA tiene
-- "35%" (varios se cargaron así), se deja tal cual.
--
-- Clásicos y Especiales siguen sin sufijo; el resto (Jucosa, Premium)
-- siguen con " (Familia)".
-- ============================================================

create or replace function sabor_display(p_nombre text, p_familia text)
returns text
language sql
immutable
as $$
  select case
    when p_nombre is null then null
    when p_familia is null then p_nombre
    when p_familia in ('Clasicos', 'Clásicos', 'Especiales') then p_nombre
    when p_familia = 'Selecto' then
      case when p_nombre ~* '35\s*%' then p_nombre else p_nombre || ' 35%' end
    else p_nombre || ' (' || p_familia || ')'
  end;
$$;

grant execute on function sabor_display(text, text) to anon, authenticated;
