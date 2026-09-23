-- ============================================================
-- PARADAS: A3 Flex vuelve a aplicar en toda la Línea 1
-- ============================================================
-- La migración 20261069 limitó el catálogo de fallas de A3 Flex (Línea 1) a
-- 500 ml (A3_FLEX_1..57) y agregó un segundo juego, A3_FLEX_1000_1..41 (el que
-- subió Javier), limitado a 1000 ml (1 L). Resultado: en cualquier otra
-- presentación de la Línea 1 (330, 200...) ningún supervisor podía registrar
-- una falla de A3 Flex, y el juego de 1000 ml quedó como un duplicado a medias
-- del original (41 de 57 ítems, con nombres re-tipeados).
--
-- Se revierte: el catálogo original vuelve a aplicar en TODAS las
-- presentaciones de la Línea 1 (se quita el límite en vez de duplicarlo por
-- presentación) y se borra el juego duplicado de 1000 ml — no tiene paradas
-- registradas, así que no queda nada huérfano.
--
-- Cuando el dueño confirme en qué presentaciones aplica cada falla de A3
-- Flex de verdad, esa delimitación entra en una migración nueva (no se edita
-- esta ni la 20261069).
-- ============================================================

update paradas_tipos_lineas tl
set presentaciones = null
from paradas_tipos t
where tl.tipo_id = t.id
  and t.codigo ~ '^A3_FLEX_[0-9]+$';

delete from paradas_tipos
where codigo ~ '^A3_FLEX_1000_[0-9]+$'
  and id not in (select tipo_id from paradas where tipo_id is not null);
