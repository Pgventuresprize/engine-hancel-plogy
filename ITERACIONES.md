# Iteraciones posibles

Lo que se aparcó **por orden, no por falta de valor**: todo esto sirve, pero
había algo antes. Cada punto dice qué es, por qué esperó y cuándo tiene sentido
retomarlo. Lo descartado porque no funcionaba no está aquí.

Al retomar uno, se detalla como bloque antes de construir.

---

## Prompts y agentes

### Herramienta "consultar documento"
- **Qué es:** el agente, mientras escribe, pide una sección de un documento de la
  marca ("dame Anglicismos del sistema narrativo") en vez de recibirlo entero.
  Hasta 3 consultas por pieza, anotadas en la receta.
- **Por qué esperó:** la prueba de la pieza 004 (2026-10-20) mostró que el
  documento entero en el prompt funciona y cabe. Entero es más seguro: el agente
  no puede olvidarse de abrir una sección.
- **Cuándo:** cuando los documentos de una marca no quepan juntos (los cuatro del
  kit de Plogy son unos 90.000 caracteres; un catálogo de servicios o de casos
  lo empujaría más).

### Partir los documentos por secciones con "cuándo entra"
- **Qué es:** que de un documento largo entre solo la sección que aplica (la
  densidad del pilar de la pieza, la audiencia de la pieza).
- **Por qué esperó:** el sistema narrativo entero dio la mejor nota; partirlo
  podría perder calidad.
- **Cuándo:** solo si una prueba como la de la 004 demuestra que partido no pierde.

### Opus para LinkedIn
- **Qué es:** el mismo cambio de modelo que se hizo en Instagram.
- **Por qué esperó:** la prueba fue solo de carruseles.
- **Cuándo:** con una prueba igual sobre un post de LinkedIn de referencia.

### Estadística de avisos por bloque del prompt
- **Qué es:** contar qué avisos del revisor salen en las piezas que llevaban cada
  bloque, para saber qué bloque está fallando.
- **Cuándo:** cuando haya receta guardada en suficientes piezas (después del 1D-6b).

### Un agente por skill
- **Qué es:** separar narrativa, caption y CTA en agentes distintos.
- **Por qué esperó:** el texto es uno solo y tiene que ser coherente (el caption
  pide lo mismo que el cierre); cuatro llamadas cuestan y tardan cuatro veces más.
  Los agentes aparte se reservan para trabajos distintos (analizar, angular,
  escribir, revisar).
- **Cuándo:** si una prueba muestra que un agente especializado escribe mejor una
  parte concreta sin romper la coherencia.

## Revisor y corrección

### "Corregir" en segundo plano
- **Qué es:** que "Corregir" encole el trabajo en vez de esperar en la petición.
- **Por qué esperó:** en local no hay problema; en Vercel la corrección de un
  carrusel (Claude + redibujo) ronda los 40 a 50 s y la acción tiene un minuto.
- **Cuándo:** al subir a producción, si se pasa del tiempo.

### Corregir una pieza solo de Facebook redibuja la portada
- **Qué es:** hoy, si un carrusel se generó solo para Facebook, corregirlo cambia
  el texto pero no vuelve a dibujar la portada.
- **Cuándo:** si alguna marca usa Facebook sin Instagram.

### Revisor en las piezas del Estudio (recetas)
- **Qué es:** el mismo revisor automático para las piezas que salen de recetas y
  capas, no solo las del tablero.
- **Cuándo:** cuando el Estudio vuelva a usarse para publicar.

### Editor del texto de las láminas
- **Qué es:** editar a mano el titular o el cuerpo de una lámina y redibujar.
- **Por qué esperó:** hoy se corrige con "Corregir" (el agente) o regenerando.
- **Cuándo:** cuando se quiera retocar una pieza sin pasar por el agente.

## Entrada (lo que el agente lee)

### Lector de páginas que cargan con JavaScript
- **Qué es:** leer fichas y documentaciones que no traen el texto en el HTML.
- **Por qué esperó:** el problema es de la entrada, no del escritor. En la prueba
  de la 004 el lector sacó 909 caracteres de la ficha de gpt-6-luna; el kit leyó
  la ficha entera y por eso ganó en evidencia.
- **Cuándo:** después del 1D-6, como bloque propio de entrada.

### Serper como alternativa a Composio
- **Qué es:** otra búsqueda web para el análisis, por si Composio falla o se
  encarece.
- **Cuándo:** si Composio da problemas.

## Producto y operación

### Programador automático (scheduler)
- **Qué es:** que el motor corra solo por horario. pg_cron no está instalado;
  hoy todo se lanza a mano. Pasos y cautelas en la memoria del proyecto.
- **Cuándo:** cuando la calidad de las piezas permita dejarlas correr sin mirar.

### Marcas personales
- **Qué es:** las marcas de Luciano y Juan Francisco como cuentas hijas de Plogy.
  Plan completo en `MARCAS.md`, sin construir.
- **Cuándo:** después de cerrar el paso 1.

### Biblioteca de skills de plataforma
- **Qué es:** skills base que las empresas copian y adaptan.
- **Cuándo:** cuando haya más de una marca usando Hancel en serio.

### Flujo de CTA con reporte por DM
- **Qué es:** "Comenta PALABRA", DM en dos mensajes y un reporte web, como en
  las piezas 003 a 005 del kit. Documentado, sin construir.
- **Cuándo:** solo si Luciano lo pide.

### Futuro local
- **Qué es:** que el análisis y la generación usen el CLI de Claude y corran en
  el computador. Exploración en `FUTURO-LOCAL.md`, sin implementar.
- **Cuándo:** si el token de Claude en la base vuelve a dar problemas.

### Preset opcional "Agro Colombia"
- **Qué es:** guardar como preset lo de agro que salió de la fábrica neutra.
- **Cuándo:** si entra una marca de ese sector.

### Limpieza de código
- **Qué es:** quitar `news.ts`, que ya no se usa, y rehacer `schema.sql` desde cero
  con todas las migraciones.
- **Cuándo:** antes de que entre otra persona a trabajar en el código.
