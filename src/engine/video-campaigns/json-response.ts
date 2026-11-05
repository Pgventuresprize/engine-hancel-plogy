import { CampaignActionError } from "./action-result"

// Escapa únicamente controles literales dentro de cadenas. No inventa claves,
// cierra objetos truncados ni modifica el contenido editorial.
export function parseModelObject(input:string):Record<string,unknown>{
  const cleaned=input.trim().replace(/<\/?cite\b[^>]*>/g,"")
  const fenced=cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body=fenced?.[1]??cleaned
  const start=body.indexOf("{"),end=body.lastIndexOf("}")
  let quoted=false,escaped=false,json=""
  for(const char of body.slice(start,end+1)){
    if(quoted&&char.charCodeAt(0)<32){json+=JSON.stringify(char).slice(1,-1);escaped=false;continue}
    json+=char
    if(escaped){escaped=false;continue}
    if(quoted&&char==="\\"){escaped=true;continue}
    if(char==='"')quoted=!quoted
  }
  let result:unknown
  try{result=JSON.parse(json)}catch{throw new CampaignActionError("El modelo devolvió un formato inválido. Reintenta este paso; no necesitas volver a interpretar la campaña.")}
  if(!result||typeof result!=="object"||Array.isArray(result))throw new CampaignActionError("El modelo no devolvió un objeto válido.")
  return result as Record<string,unknown>
}

export async function objectWithFormatRecovery(output:string,repair:(invalid:string)=>Promise<string>):Promise<Record<string,unknown>>{
  try{return parseModelObject(output)}catch{return parseModelObject(await repair(output))}
}
