import "server-only"
import { CampaignActionError } from "./action-result"
import { randomUUID, createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import { supabaseAdmin } from "../supabase-admin"
import { perfilDe } from "../marca/perfil"
import { ejemplosDe } from "../marca/ejemplos"
import { secretosDe } from "../secretos"
import { validateBrief, planPieces, type Brand, type Brief, type Campaign, type CampaignView, type PieceRow } from "./model"

export const SETUP_MESSAGE = "Campañas de video todavía necesita su almacenamiento aislado. Aplica la migración vc2 incluida en el repositorio; el resto de Plogy sigue funcionando."
export async function configured(): Promise<boolean> {
  try { const r = await supabaseAdmin().from("vc2_campaigns").select("id").limit(0); if (r.error) { if (["PGRST205","42P01"].includes(r.error.code)) return false; throw r.error } return true } catch (e) { if (e instanceof Error && e.message.includes("Faltan SUPABASE")) return false; throw e }
}
export async function brandSnapshot(accountId: string): Promise<Brand> {
  const [p, examples] = await Promise.all([perfilDe(accountId), ejemplosDe(accountId)])
  return { name: p.nombre || "La marca", language: p.idioma || "es", identity: [p.que_hace,p.mensaje_central].filter(Boolean).join("\n"), voice: p.voz_si, avoid: p.voz_no, rules: [p.reglas,p.frases_prohibidas.join("; "),p.temas_vetados].filter(Boolean).join("\n"), examples: examples.filter(x=>x.activo).slice(0,3).map(x=>({text:x.texto.slice(0,6000),why:x.por_que})) }
}
export async function listCampaigns(accountId: string): Promise<Campaign[]> {
  const r = await supabaseAdmin().from("vc2_campaigns").select("id,account_id,config,brand,paused,created_at,runs_started").eq("account_id",accountId).order("created_at",{ascending:false}).limit(30)
  if(r.error) throw new Error(r.error.message); return r.data as Campaign[]
}
export async function campaignView(accountId: string, id: string): Promise<CampaignView> {
  const db=supabaseAdmin()
  const [c,p]=await Promise.all([db.from("vc2_campaigns").select("id,account_id,config,brand,paused,created_at,runs_started").eq("id",id).eq("account_id",accountId).maybeSingle(),db.from("vc2_pieces").select("*").eq("campaign_id",id).eq("account_id",accountId)])
  if(c.error||p.error)throw new Error(c.error?.message||p.error?.message)
  if(!c.data)throw new CampaignActionError("No existe esa campaña en la cuenta activa.")
  return {...c.data as Campaign,pieces:(p.data as PieceRow[]).sort((a,b)=>a.payload.order-b.payload.order)}
}
export async function createCampaign(accountId: string, id: string, input: unknown): Promise<string> {
  const b=validateBrief(input), brand=await brandSnapshot(accountId), pieces=planPieces(b,id,randomUUID)
  const r=await supabaseAdmin().rpc("vc2_create",{p_id:id,p_account:accountId,p_config:b,p_brand:brand,p_pieces:pieces})
  if(r.error)throw new Error(r.error.message);return id
}
export async function getPiece(accountId: string,id: string): Promise<PieceRow> {
  const r=await supabaseAdmin().from("vc2_pieces").select("*").eq("id",id).eq("account_id",accountId).maybeSingle()
  if(r.error)throw new Error(r.error.message);if(!r.data)throw new CampaignActionError("No existe esa pieza en la cuenta activa.");return r.data as PieceRow
}
export async function editPiece(row: PieceRow, payload: PieceRow["payload"], queue: boolean): Promise<void> {
  const r=await supabaseAdmin().rpc("vc2_edit",{p_piece:row.id,p_account:row.account_id,p_revision:row.revision,p_payload:payload,p_phase:payload.phase,p_queue:queue})
  if(r.error)throw new Error(r.error.message);if(!r.data)throw new CampaignActionError("La pieza está trabajando o cambió. Actualiza antes de editar.")
}
function cipherKey(): Buffer {
  const secret=process.env.VIDEO_CAMPAIGN_ENCRYPTION_KEY||process.env.INGEST_SECRET
  if(!secret)throw new CampaignActionError("Falta una clave del servidor para cifrar la conexión Apify.")
  return createHash("sha256").update("vc2:"+secret).digest()
}
export async function saveApify(accountId: string, token: string): Promise<void> {
  if(!token.trim()||token.length>500)throw new CampaignActionError("Revisa la clave de Apify.")
  const iv=randomBytes(12), c=createCipheriv("aes-256-gcm",cipherKey(),iv)
  const data=Buffer.concat([c.update(token.trim(),"utf8"),c.final()])
  const encrypted=[iv,c.getAuthTag(),data].map(x=>x.toString("base64")).join(".")
  const r=await supabaseAdmin().from("vc2_settings").upsert({account_id:accountId,apify_ciphertext:encrypted,updated_at:new Date().toISOString()})
  if(r.error)throw new CampaignActionError("No se pudo guardar la conexión de Apify.")
}
export async function apifyToken(accountId: string): Promise<string> {
  const r=await supabaseAdmin().from("vc2_settings").select("apify_ciphertext").eq("account_id",accountId).maybeSingle()
  if(r.error)throw new Error(r.error.message)
  if(r.data?.apify_ciphertext){const [iv,tag,data]=String(r.data.apify_ciphertext).split(".").map(x=>Buffer.from(x,"base64"));const c=createDecipheriv("aes-256-gcm",cipherKey(),iv);c.setAuthTag(tag);return Buffer.concat([c.update(data),c.final()]).toString("utf8")}
  if(process.env.APIFY_TOKEN)return process.env.APIFY_TOKEN
  throw new Error("Conecta Apify en los ajustes de Campañas de video o pega una transcripción para continuar.")
}
export async function connections(accountId: string): Promise<{ apify: boolean; claude: boolean }> {
  const [r,s]=await Promise.all([supabaseAdmin().from("vc2_settings").select("account_id").eq("account_id",accountId).maybeSingle(),secretosDe(accountId)])
  return {apify:Boolean(r.data||process.env.APIFY_TOKEN),claude:Boolean(s.claude_oauth_token||process.env.ANTHROPIC_API_KEY)}
}
export async function pauseCampaign(accountId: string,id: string,paused: boolean): Promise<void> {
  const r=await supabaseAdmin().from("vc2_campaigns").update({paused}).eq("id",id).eq("account_id",accountId)
  if(r.error)throw new Error(r.error.message)
  if(!paused){const wake=await supabaseAdmin().rpc("vc2_wake");if(wake.error)throw new Error(wake.error.message)}
}
export async function campaignBrief(accountId: string,id: string): Promise<Brief> {return (await campaignView(accountId,id)).config}
