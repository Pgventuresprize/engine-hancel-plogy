import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Las fuentes del carrusel se leen del disco en tiempo de ejecucion, y el
  // trazado automatico de Vercel no las ve porque nadie las importa: solo se
  // referencian por ruta. Sin esto, el render falla en produccion y funciona en
  // local, que es la peor forma de enterarse.
  outputFileTracingIncludes: {
    "/api/**": ["./src/engine/render/fonts/**"],
    // El Chromium de @sparticuz va comprimido en bin/ y se lee por ruta: el
    // trazado no lo ve solo. Marca > Kit de diseño dibuja con el, y los
    // carruseles de una marca con kit activo tambien: los hace el tick y se
    // redibujan desde el tablero (la pagina de inicio).
    "/marca": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/api/content/tick": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  // Marca salio de Configuracion a su propia seccion: los enlaces viejos
  // (marcadores, avisos ya enviados) siguen llegando, con su ?tab=.
  async redirects() {
    return [{ source: "/configuracion/marca", destination: "/marca", permanent: false }]
  },
};

export default nextConfig;
