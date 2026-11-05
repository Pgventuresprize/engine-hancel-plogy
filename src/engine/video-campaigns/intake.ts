import { MODES, text, type Mode } from "./model"
import { CampaignActionError } from "./action-result"

const normalize = (s:string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
function modeOf(key:string):Mode|null {
  const k=normalize(key).replace(/[^a-z]/g,"")
  if(["replica","replicas"].includes(k))return "replica"
  if(["adaptacion","adaptaciones","adaptation","adaptations","noticia","noticias","adaptacionnoticia","adaptacionesnoticias"].includes(k))return "adaptacion"
  if(["original","originales","originals"].includes(k))return "original"
  return null
}
function percentage(value:unknown):number {
  if(typeof value==="number")return value
  if(typeof value==="string"&&/^\s*\d+(?:[.,]\d+)?\s*%?\s*$/.test(value))return Number(value.replace("%","").replace(",",".").trim())
  return NaN
}
function checked(mix:Partial<Record<Mode,number>>):Record<Mode,number> {
  if(MODES.some(m=>!Number.isInteger(mix[m])||Number(mix[m])<0||Number(mix[m])>100))
    throw new CampaignActionError("Completa los tres porcentajes con números enteros entre 0 y 100: réplicas, adaptaciones/noticias y originales.")
  const total=MODES.reduce((n,m)=>n+Number(mix[m]),0)
  if(total!==100)throw new CampaignActionError(`La mezcla suma ${total} %. Ajusta réplicas, adaptaciones/noticias y originales para que sumen 100 %.`)
  return mix as Record<Mode,number>
}
export function explicitMix(request:string):Partial<Record<Mode,number>> {
  const found:Partial<Record<Mode,number>>={}
  const record=(label:string,value:string)=>{
    const mode=modeOf(label),n=percentage(value)
    if(!mode)return
    if(found[mode]!==undefined&&found[mode]!==n)throw new CampaignActionError("El pedido asigna porcentajes distintos al mismo grupo. Deja un porcentaje para réplicas, otro para adaptaciones/noticias y otro para originales.")
    found[mode]=n
  }
  const source=normalize(request)
  const labels="replicas?|adaptaciones|adaptacion|noticias?|originales|original"
  for(const match of source.matchAll(new RegExp("(\\d+(?:[.,]\\d+)?)\\s*%\\s*(?:de\\s+)?(?:videos?\\s+)?("+labels+")\\b","g")))record(match[2],match[1])
  for(const match of source.matchAll(new RegExp("\\b("+labels+")\\s*[:=–-]?\\s*(\\d+(?:[.,]\\d+)?)\\s*%","g")))record(match[1],match[2])
  return found
}
export function normalizeIntake(value:Record<string,unknown>,request:string):Record<string,unknown> {
  const o={...value},assumptions=Array.isArray(o.assumptions)?o.assumptions.filter(x=>typeof x==="string").slice(0,8):[]
  for(const field of ["name","audience","offer","cta"])if(field in o){
    if(typeof o[field]!=="string")delete o[field]
    else o[field]=text(o[field],field==="name"?120:2000)
  }
  const explicit=explicitMix(request),known=MODES.filter(m=>explicit[m]!==undefined)
  let parsed:Partial<Record<Mode,number>>={}
  if(o.mix&&typeof o.mix==="object"&&!Array.isArray(o.mix)){
    for(const [key,value] of Object.entries(o.mix)){
      const mode=modeOf(key)
      if(mode)parsed[mode]=percentage(value)
    }
    const values=MODES.map(m=>parsed[m])
    // Algunos modelos devuelven proporciones 0.6/0.2/0.2 en lugar de 60/20/20.
    if(values.every(v=>typeof v==="number"&&v>=0&&v<=1)&&Math.abs(values.reduce<number>((n,v)=>n+Number(v),0)-1)<1e-8)
      parsed=Object.fromEntries(MODES.map(m=>[m,Math.round(Number(parsed[m])*1000000)/10000]))
  }
  if(known.length===3)parsed=explicit
  else if(known.length===2){
    const missing=MODES.find(m=>explicit[m]===undefined)!
    parsed={...explicit,[missing]:100-known.reduce((n,m)=>n+Number(explicit[m]),0)}
    assumptions.push("El porcentaje restante se asignó al tercer grupo.")
  }else if(known.length===1){
    const mode=known[0]
    const valid=MODES.every(m=>Number.isInteger(parsed[m]))&&MODES.reduce((n,m)=>n+Number(parsed[m]),0)===100
    if(!valid||parsed[mode]!==explicit[mode]){
      if(mode!=="replica")throw new CampaignActionError("Indica también los porcentajes de los otros grupos para completar la mezcla.")
      const rest=100-Number(explicit.replica)
      parsed={replica:explicit.replica,adaptacion:Math.floor(rest/2),original:rest-Math.floor(rest/2)}
      assumptions.push("El porcentaje restante se repartió entre adaptaciones y originales.")
    }
  }
  if(o.mix!==undefined||known.length)o.mix=checked(parsed)
  if(o.count!==undefined){
    const count=typeof o.count==="string"?Number(o.count.trim()):o.count
    if(!Number.isInteger(count)||Number(count)<1||Number(count)>35)throw new CampaignActionError("La cantidad debe estar entre uno y 35 videos.")
    o.count=count
  }
  if(Array.isArray(o.topics))o.topics=o.topics.filter((v):v is Record<string,unknown>=>Boolean(v)&&typeof v==="object").map(t=>({
    name:text(t.name,120),focus:text(t.focus,1500),weight:Math.max(1,Math.min(100,Math.round(Number(t.weight)||1))),
    references:Array.isArray(t.references)?t.references.filter(u=>typeof u==="string"&&request.includes(u)):[]
  })).filter(t=>t.name).slice(0,20)
  o.assumptions=[...new Set(assumptions)]
  return o
}
