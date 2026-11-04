/**
 * Prueba si el token de Claude de una cuenta acepta herramientas propias, en
 * streaming y dos vueltas: el modelo pide la herramienta, se le devuelve el
 * resultado y responde. Es lo que necesita el chat para investigar y pedir piezas.
 *
 *   npx tsx --env-file=.env.local scripts/probar-herramientas.ts [slug-o-id-de-cuenta]
 *
 * Gasta muy poco: dos llamadas cortas por modelo. No escribe nada en la base.
 */
import { tokenClaude } from "../src/engine/claude/messages"
import { supabaseAdmin } from "../src/engine/supabase-admin"

const URL_API = "https://api.anthropic.com/v1/messages"
const IDENTIDAD = "You are Claude Code, Anthropic's official CLI for Claude."

const HERRAMIENTA = {
  name: "buscar_web",
  description: "Busca en internet. Úsala cuando la persona pida información actual.",
  strict: true,
  input_schema: {
    type: "object",
    properties: { consulta: { type: "string", description: "Lo que hay que buscar." } },
    required: ["consulta"],
    additionalProperties: false,
  },
}

type Bloque = Record<string, unknown>

/** Lee el stream y devuelve los bloques tal cual, con el motivo de corte. */
async function leer(res: Response): Promise<{ bloques: Bloque[]; corte: string | null }> {
  const bloques: (Bloque & { _json?: string })[] = []
  let corte: string | null = null
  const texto = await res.text()
  for (const linea of texto.split("\n")) {
    if (!linea.startsWith("data:")) continue
    const e = JSON.parse(linea.slice(5).trim())
    if (e.type === "content_block_start") bloques[e.index] = { ...e.content_block }
    else if (e.type === "content_block_delta") {
      const b = bloques[e.index]
      if (e.delta.type === "text_delta") b.text = `${b.text ?? ""}${e.delta.text}`
      else if (e.delta.type === "input_json_delta") b._json = `${b._json ?? ""}${e.delta.partial_json}`
      else if (e.delta.type === "thinking_delta") b.thinking = `${b.thinking ?? ""}${e.delta.thinking}`
      else if (e.delta.type === "signature_delta") b.signature = `${b.signature ?? ""}${e.delta.signature}`
    } else if (e.type === "message_delta") corte = e.delta?.stop_reason ?? corte
  }
  for (const b of bloques) {
    if (b?._json !== undefined) {
      b.input = JSON.parse(b._json || "{}")
      delete b._json
    }
  }
  return { bloques, corte }
}

async function vuelta(token: string, modelo: string, messages: unknown[]) {
  const esOpus = modelo.includes("opus-5-5")
  const res = await fetch(URL_API, {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "anthropic-beta": "oauth-2025-04-20",
    },
    body: JSON.stringify({
      model: modelo,
      max_tokens: esOpus ? 8000 : 1500,
      ...(esOpus ? { output_config: { effort: "low" } } : { thinking: { type: "between_tools" } }),
      system: [
        { type: "text", text: IDENTIDAD },
        { type: "text", text: "Eres un agente de prueba. Si te piden buscar, usa la herramienta. Responde en una frase." },
      ],
      stream: true,
      tools: [HERRAMIENTA],
      messages,
    }),
    signal: AbortSignal.timeout(120_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`)
  return leer(res)
}

async function probar(token: string, modelo: string) {
  const inicio = [{ role: "user", content: "Busca el precio del café hoy." }]
  const primera = await vuelta(token, modelo, inicio)
  const pedida = primera.bloques.find((b) => b?.type === "tool_use")
  console.log(`  1ª vuelta: corte=${primera.corte} bloques=${primera.bloques.map((b) => b?.type).join(",")}`)
  if (!pedida) throw new Error("El modelo no pidió la herramienta.")
  console.log(`  pidió: ${JSON.stringify(pedida.input)}`)
  const segunda = await vuelta(token, modelo, [
    ...inicio,
    { role: "assistant", content: primera.bloques },
    {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: pedida.id, content: "El café está a 3,20 USD la libra según la fuente de prueba." }],
    },
  ])
  const texto = segunda.bloques.filter((b) => b?.type === "text").map((b) => b.text).join("")
  console.log(`  2ª vuelta: corte=${segunda.corte} texto="${texto.slice(0, 120)}"`)
  if (segunda.corte !== "end_turn" || !texto) throw new Error("La segunda vuelta no terminó con texto.")
}

async function main() {
  const quien = process.argv[2]
  const supabase = supabaseAdmin()
  const { data } = await supabase.from("accounts").select("id, slug").order("created_at").limit(50)
  const cuentas = (data ?? []) as { id: string; slug: string }[]
  const cuenta = quien ? cuentas.find((c) => c.id === quien || c.slug === quien) : cuentas[0]
  if (!cuenta) throw new Error("No encontré la cuenta.")
  const token = await tokenClaude(cuenta.id)
  if (!token) throw new Error(`La cuenta ${cuenta.slug} no tiene token de Claude.`)
  console.log(`Cuenta: ${cuenta.slug} · token de tipo ${token.startsWith("sk-ant-api") ? "API key" : "suscripción"}`)

  let fallos = 0
  for (const modelo of ["claude-sonnet-5-5", "claude-opus-5-5"]) {
    console.log(`\n${modelo}`)
    try {
      await probar(token, modelo)
      console.log("  OK")
    } catch (e) {
      fallos++
      console.log(`  FALLÓ: ${e instanceof Error ? e.message : e}`)
    }
  }
  process.exit(fallos ? 1 : 0)
}

void main()
