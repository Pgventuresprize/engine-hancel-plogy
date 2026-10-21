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

### Marca › Documentos (tabla `brand_documentos`)
- **Qué es:** una pantalla para subir o pegar documentos largos de la marca; la
  app los parte por títulos y cada sección queda "fuera", "por regla" o
  "consultable". Es la base de los dos puntos siguientes.
- **Por qué esperó:** el sistema narrativo de Plogy ya entra entero como tres
  skills (1D-6a), así que hoy la pantalla repetiría lo que hacen las skills.
  Se sacó del 1D-6b el 2026-10-20.
- **Cuándo:** con la herramienta de consulta, o cuando una marca tenga un
  documento que no tenga sentido pegar como skill (catálogo, casos, glosario).

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

### Lector de páginas que cargan con JavaScript o bloquean
- **Qué es:** leer fichas y documentaciones que no traen el texto en el HTML, y
  las páginas que bloquean a los lectores automáticos (HTTP 429 o 403), con un
  navegador de verdad o un servicio de lectura.
- **Por qué esperó:** el problema es de la entrada, no del escritor. En la prueba
  de la 004 el lector sacó 909 caracteres de la ficha de gpt-6-luna; el kit leyó
  la ficha entera y por eso ganó en evidencia. Desde 2026-10-20 el análisis lee
  también las fuentes que cita la búsqueda, y eso cubre casi siempre la página
  bloqueada (en la noticia de Basis, wboc.com respondía 429 y el comunicado
  original entró por las citas). Las notas del análisis dicen ahora el motivo.
- **Cuándo:** si las notas del análisis muestran a menudo "bloquea la lectura
  automática" y ninguna fuente citada que la sustituya.

### Serper como alternativa a Composio
- **Qué es:** otra búsqueda web para el análisis, por si Composio falla o se
  encarece.
- **Cuándo:** si Composio da problemas.

## Marca desde las referencias

### Importar la marca entera desde una carpeta
- **Qué es:** adjuntar la carpeta de referencias de una marca (para Plogy,
  `PLOGY\plogy carruseles`: el kit de agentes, el brand kit, las fotos de
  `assets refference`, las skills y los PDF) y que la app extraiga todo lo que
  necesita para armarla: identidad, voz, editorial y CTA, colores, tipografías,
  logos, imágenes, ejemplos, y cómo se diseña cada carrusel (layout, estética,
  tipos de lámina). Como el importador de ejemplos: Claude propone, el código
  comprueba contra los archivos y la persona revisa campo por campo antes de
  guardar. Es el Paso 2 del roadmap, ampliado.
- **Por qué esperó:** el importador de ejemplos (2026-10-20) resolvió primero lo
  que mejora el texto. Lo visual necesita antes la biblioteca de imágenes
  (Paso 3) y una plantilla que dibuje esos tipos de lámina (Paso 4).
- **Cuándo:** después de los Pasos 3 y 4. Reutiliza el flujo del importador de
  ejemplos (subir, extraer, comprobar, revisar, guardar).

### Carruseles de Plogy como los del visor del kit
- **Qué es:** que los carruseles de Plogy salgan visualmente como los de
  `PLOGY_Carousel_Agent_Kit\piezas\visor.html`, tal cual: su estética, su
  layout, sus láminas de dato, listas, tablas, citas y cierre de vidrio sobre
  foto. El texto sigue con lo que ya tiene Hancel (revisor, receta, ejemplos,
  CTA por pieza). Es la meta del Paso 4 (plantilla editorial).
- **Cómo (decidido 2026-10-20):** no se configura a mano. La plantilla "plogy"
  de hoy no sirve. El importador analiza las piezas que la marca ya tiene
  (sus carruseles, su brand kit, sus fotos) y genera el design system y las
  plantillas de cada tipo de lámina a partir de ellas. Una marca que ya tiene
  plantillas no tiene que configurar nada; una que no tiene, parte de las
  neutras.
- **Por qué esperó:** se pidió anotarlo y cerrar antes el Paso 1.
- **Cuándo:** Paso 4, junto con "Importar la marca entera desde una carpeta".
  Los ejemplos ya guardan el tipo de cada lámina y una línea de lo visual, que
  es lo que la plantilla necesitará para elegir el diseño.

### Guardar las imágenes de las láminas en los ejemplos
- **Qué es:** subir las capturas o el `carrusel.html` de una pieza y que queden
  junto a su ejemplo (la opción C del importador).
- **Por qué esperó:** el agente que escribe no dibuja, así que hoy las imágenes
  solo servirían para mirarlas en Marca › Ejemplos.
- **Cuándo:** con el Paso 4, cuando un agente elija el diseño de cada lámina y
  las use de referencia. Se cruza con la biblioteca de imágenes (Paso 3).

### Importar ejemplos desde .html, PDF o Word
- **Qué es:** que el importador de ejemplos lea también el `carrusel.html` del
  kit, un PDF o un .docx, y no solo .md y .txt.
- **Cuándo:** con "Importar la marca entera desde una carpeta", que los necesita.

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
