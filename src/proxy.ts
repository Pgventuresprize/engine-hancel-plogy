import { updateSession } from "@insforge/sdk/ssr/middleware"
import { NextResponse, type NextRequest } from "next/server"

/**
 * La puerta del dashboard.
 *
 * En Next 16 esto se llama `proxy.ts` — es el antiguo `middleware.ts`, renombrado
 * y ya en runtime de Node por defecto.
 *
 * Hace dos cosas en la misma pasada, y las dos hacen falta:
 *
 *   1. Refresca la sesion. Los tokens de InsForge caducan en una hora; si nadie
 *      los renueva, la sesion se muere sola aunque el usuario este trabajando.
 *      Renovarlos aqui es lo que hace que las cookies lleguen frescas a todo lo
 *      que corra despues.
 *   2. Manda a /login a quien no tenga sesion.
 *
 * `getUser()` valida el token contra InsForge en cada peticion. Es una llamada
 * de red por peticion, que para un panel interno es un precio razonable a cambio
 * de que la puerta no dependa de una cookie que el navegador manda tal cual.
 */

/** Lo que se atraviesa sin sesion, y por que. */
const ABIERTAS = [
  // La propia pagina de login, o no habria forma de entrar.
  "/login",
  // Los dispara Postgres con `INGEST_SECRET`, no un navegador: pedirles sesion
  // romperia los crons. Tienen su propia autorizacion en `lib/api-auth.ts`.
  "/api/ingest",
  "/api/content/tick",
  "/api/studio/tick",
  "/api/videos/tick",
  "/api/redaccion/tick",
  "/api/publicacion/tick",
  // Canva importa de aqui el HTML de cada pieza del Estudio, sin sesion.
  "/api/studio/html",
]

function esAbierta(pathname: string): boolean {
  return ABIERTAS.some((ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`))
}

export async function proxy(request: NextRequest) {
  // La respuesta se crea antes de hablar con Supabase porque `setAll` escribe en
  // ella las cookies renovadas. Si se creara despues, se perderian.
  const response = NextResponse.next({ request })

  const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL
  const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY

  // Sin credenciales no se puede comprobar nada. Se deja pasar en vez de tapiar
  // la aplicacion: el fallo es de configuracion y ya se ve en cuanto algo lee la
  // base, mientras que un redirect infinito a /login no explicaria nada.
  if (!baseUrl || !anonKey) return response

  // Refresca el token si esta por vencer y deja las cookies frescas en la
  // peticion y en la respuesta. Sin token valido no hay sesion.
  const sesion = await updateSession({
    baseUrl,
    anonKey,
    requestCookies: request.cookies,
    responseCookies: response.cookies,
  }).catch(() => null)
  const user = sesion?.accessToken ? true : null

  const { pathname, search } = request.nextUrl

  if (!user && !esAbierta(pathname)) {
    const login = request.nextUrl.clone()
    login.pathname = "/login"
    // Para volver a donde iba una vez dentro.
    login.search = pathname === "/" ? "" : `?destino=${encodeURIComponent(pathname + search)}`
    return NextResponse.redirect(login)
  }

  // Con sesion, /login no tiene nada que ofrecer.
  if (user && pathname === "/login") {
    const inicio = request.nextUrl.clone()
    inicio.pathname = "/"
    inicio.search = ""
    return NextResponse.redirect(inicio)
  }

  return response
}

export const config = {
  /**
   * Todo menos los estaticos.
   *
   * Se listan por extension y no por carpeta porque los assets de Next viven en
   * `_next` pero el icono y el resto salen de rutas normales, y pasar imagenes
   * por una llamada de red a Supabase seria absurdo.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
