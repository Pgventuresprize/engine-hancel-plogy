-- Importador de kits (Paso 4.2), 2026-10-22.
--
-- La persona sube su kit (carpeta o zip) y el importador lo convierte en el
-- kit de la marca: lee lo exacto (colores, fuentes, logos), dibuja las laminas
-- de referencia, Claude arma el catalogo y escribe una plantilla por tipo, y
-- cada plantilla se compara con su original antes de pasar a revision.
--
-- La importacion avanza por pasos que dispara la pantalla abierta; su estado
-- vive en brand_kits.importacion para poder retomarla. La copia que se sube
-- para importar va a <account>/<kit>/importacion/ y se borra al terminar: del
-- kit solo se quedan fuentes, logos, referencias y las pruebas.
--
-- Solo agrega. Idempotente.

alter table public.brand_kits add column if not exists importacion jsonb not null default '{}'::jsonb;

-- 'importando': el kit se esta armando desde lo que subio la persona.
alter table public.brand_kits drop constraint if exists brand_kits_estado_check;
alter table public.brand_kits add constraint brand_kits_estado_check
  check (estado in ('importando', 'borrador', 'revision', 'activo', 'archivado'));

-- El bucket acepta tambien lo que trae un kit para importarlo: HTML, CSS,
-- textos, JSON y PDF. Tope de 25 MB por archivo, por los manuales de marca.
update storage.buckets
   set file_size_limit = 26214400,
       allowed_mime_types = array[
         'font/ttf', 'font/otf', 'font/woff', 'font/woff2',
         'image/svg+xml', 'image/png', 'image/jpeg', 'image/webp',
         'text/html', 'text/css', 'text/plain', 'text/markdown', 'application/json', 'application/pdf'
       ]
 where id = 'marca-kits';

alter table public.brand_kit_archivos drop constraint if exists brand_kit_archivos_bytes_check;
alter table public.brand_kit_archivos add constraint brand_kit_archivos_bytes_check
  check (bytes > 0 and bytes <= 26214400);

-- 'prueba': lo que dibujo la comprobacion de cada plantilla (con el texto de su
-- referencia y con textos al limite), para que la persona lo vea al revisar.
alter table public.brand_kit_archivos drop constraint if exists brand_kit_archivos_tipo_check;
alter table public.brand_kit_archivos add constraint brand_kit_archivos_tipo_check
  check (tipo in ('fuente', 'logo', 'imagen', 'referencia', 'prueba'));
