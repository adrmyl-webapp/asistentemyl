// Función serverless de Netlify: IA compartida para todos los usuarios.
// La clave de Google vive SOLO en la variable de entorno GEMINI_API_KEY (nunca llega al navegador).
const SYS="Eres un JUEZ del TCG Mitos y Leyendas (formato Primer Bloque). Responde en español como en un duelo real, usando SOLO la INFORMACIÓN entregada (fichas de cartas, reglas y aclaraciones oficiales). No inventes reglas, cartas ni efectos y no apliques prioridades universales. Resuelve TODAS las habilidades de TODAS las cartas mencionadas. Formato: 1) Fallo (conclusión). 2) Desarrollo paso a paso. 3) Estado final de cada habilidad de cada carta. 4) Qué sigue activo hasta la Fase Final. 5) Datos que faltan. Cita la fuente de cada regla (FAQ 2026, FAQ 2023, DAR). Si la información no alcanza, di 'Información insuficiente' y qué dato falta.";
const MODELS=["gemini-flash-latest","gemini-2.5-flash","gemini-2.0-flash","gemini-2.5-flash-lite"];
const hits=new Map();
const J=(s,b)=>({statusCode:s,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"},body:JSON.stringify(b)});
exports.handler=async(event)=>{
 const key=(process.env.GEMINI_API_KEY||"").replace(/[\s"']/g,"");
 if(event.httpMethod==="GET")return J(200,{ok:!!key});
 if(event.httpMethod!=="POST")return J(405,{error:"Método no permitido."});
 if(!key)return J(503,{error:"La IA compartida aún no está configurada (falta GEMINI_API_KEY en Netlify)."});
 const h=event.headers||{},origin=h.origin||"";
 if(origin){let ok=false;try{ok=new URL(origin).host===h.host||(process.env.ALLOWED_ORIGIN||"").split(",").map(s=>s.trim()).filter(Boolean).includes(origin)}catch(e){}if(!ok)return J(403,{error:"Origen no permitido."})}
 const ip=h["x-nf-client-connection-ip"]||(h["x-forwarded-for"]||"").split(",")[0].trim()||"?",now=Date.now(),lim=+process.env.IA_LIMIT_PER_HOUR||20,arr=(hits.get(ip)||[]).filter(t=>now-t<3600000);
 if(arr.length>=lim)return J(429,{error:"Alcanzaste el límite de consultas por hora. Intenta más tarde."});
 arr.push(now);hits.set(ip,arr);if(hits.size>5000)hits.clear();
 let q="";try{q=String((JSON.parse(event.body||"{}")).q||"")}catch(e){return J(400,{error:"Solicitud inválida."})}
 if(q.length<10)return J(400,{error:"La consulta está vacía."});if(q.length>16000)return J(413,{error:"La consulta es demasiado larga."});
 const models=process.env.GEMINI_MODEL?[process.env.GEMINI_MODEL,...MODELS]:MODELS;let last="";
 for(const m of models){try{
  const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(m)+":generateContent",{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},body:JSON.stringify({systemInstruction:{parts:[{text:SYS}]},contents:[{role:"user",parts:[{text:q}]}],generationConfig:{temperature:0.2,maxOutputTokens:2000}})});
  const j=await r.json().catch(()=>({}));
  if(r.ok){const t=((j.candidates||[])[0]?.content?.parts||[]).map(p=>p.text||"").join("").trim();if(t)return J(200,{text:t,model:m});last="sin texto";continue}
  const msg=(j.error&&j.error.message)||("HTTP "+r.status);last=r.status+": "+msg;
  if(r.status===401||r.status===403||(r.status===400&&/api key/i.test(msg)))return J(502,{error:"La clave de IA del servidor fue rechazada por Google. Avisa al administrador."});
 }catch(e){last=String(e.message||e)}}
 return J(502,{error:"La IA no respondió ("+last.slice(0,160)+"). Intenta de nuevo en unos minutos."});
};
