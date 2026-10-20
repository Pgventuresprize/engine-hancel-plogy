-- La clasificacion de cada angulo: pilar (y secundario), audiencia, vertical,
-- objetivo y CTA. La decide el agente de angulo con las listas de la marca y
-- viaja a los agentes que escriben.
--
-- Se guarda como foto ({"pilar": {"id", "nombre"}, ...}) y no como claves
-- foraneas: la ficha de una pieza tiene que seguir diciendo de que pilar era
-- aunque ese pilar se renombre o se borre despues. Null en los angulos de antes.
--
-- Solo anade una columna que admite null: no toca ninguna fila existente.

alter table public.content_angles add column if not exists clasificacion jsonb;
