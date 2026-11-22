import {createHash} from 'node:crypto';

const MAX_ENTRIES=20,TTL_MS=2*60*60*1000;
const entries=new Map();
const sha=t=>createHash('sha256').update(t,'utf8').digest('hex');
const prune=now=>{for(const [k,v] of entries)if(now-v.at>TTL_MS)entries.delete(k);while(entries.size>MAX_ENTRIES)entries.delete(entries.keys().next().value);};

export function sharedPlanArtifactUri(digest,fileName){return `gm-coach://shared-plans/${digest}/${fileName}`;}

export function rememberSharedPlanArtifact({digest,fileName,artifactText},now=Date.now()){
  if(typeof digest!=='string'||!/^[A-Za-z0-9._:-]{8,200}$/.test(digest))throw new Error('Shared plan digest required.');
  if(typeof artifactText!=='string'||!artifactText)throw new Error('Shared plan artifactText required.');
  const uri=sharedPlanArtifactUri(digest,String(fileName||'gm-coach-plan.json'));
  entries.delete(uri);entries.set(uri,{text:artifactText,hash:sha(artifactText),at:now});prune(now);
  return uri;
}

export function resolveSharedPlanImportArgs(args={},now=Date.now()){
  const hasText=args.artifactText!==undefined,hasUri=args.artifactUri!==undefined;
  if(hasText===hasUri)throw new Error('Podaj dokładnie jedno: artifactText albo artifactUri.');
  if(hasText)return args;
  const {artifactUri,...rest}=args;
  if(typeof artifactUri!=='string'||!artifactUri.startsWith('gm-coach://shared-plans/'))throw new Error('Nieprawidłowy artifactUri — użyj artifactUri zwróconego przez gm_coach_export_shared_plan.');
  prune(now);
  const hit=entries.get(artifactUri);
  if(!hit)throw new Error('Plik udostępniania o tym artifactUri wygasł lub jest nieznany (serwer przechowuje go 2 h, maks. 20 plików, do restartu). Wygeneruj plik ponownie przez gm_coach_export_shared_plan albo podaj artifactText.');
  if(sha(hit.text)!==hit.hash){entries.delete(artifactUri);throw new Error('Plik udostępniania nie przeszedł weryfikacji hash — wygeneruj plik ponownie.');}
  return {...rest,artifactText:hit.text};
}

export function clearSharedPlanArtifacts(){entries.clear();}
