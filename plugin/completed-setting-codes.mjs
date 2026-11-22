const fields = ['sportMode', 'templatePresetId'];
const MAX_EVIDENCE_PATH = 1024;
const MAX_SET_PATH = MAX_EVIDENCE_PATH - '.training_info_detail.templatePresetId'.length;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function code(value) {
  // Preserve code -1 without assigning Customize semantics. No booleans,
  // floats, CSV, whitespace or exponent strings are accepted as codes.
  if (typeof value === 'string' && !/^-?(?:0|[1-9]\d{0,9})$/.test(value)) return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= -2147483648 && n <= 2147483647 ? n : null;
}
export function reportedCompletedSettingCodes(set, path) {
  if (!object(set) || typeof path !== 'string' || path.length > MAX_SET_PATH) return undefined;
  const scopes = [{record:set,path,scope:'finished-set'}];
  if (object(set.trainingInfoDetail)) scopes.push({record:set.trainingInfoDetail,path:`${path}.trainingInfoDetail`,scope:'finished-set-detail'});
  if (object(set.training_info_detail)) scopes.push({record:set.training_info_detail,path:`${path}.training_info_detail`,scope:'finished-set-detail'});
  const settings = fields.flatMap(field => {
    const evidence = scopes.filter(x => Object.hasOwn(x.record,field)).map(x => {
      const raw = x.record[field], parsed = code(raw);
      return {field,path:`${x.path}.${field}`,scope:x.scope,status:parsed === null ? 'invalid-code' : 'reported-code',
        ...(parsed === null ? {} : {code:parsed}),
        rawType:raw === null ? 'null' : Array.isArray(raw) ? 'array' : typeof raw};
    });
    if (!evidence.length) return [];
    const valid = evidence.filter(x => x.status === 'reported-code');
    const status = valid.length !== evidence.length ? 'invalid-or-conflicting' : new Set(valid.map(x=>x.code)).size > 1 ? 'conflict' : 'reported-code';
    return [{field,status,...(status === 'reported-code' ? {code:valid[0].code} : {}),evidence,
      interpretation:'raw-performed-response-code; name-and-physical-semantics-unverified'}];
  });
  return settings.length ? settings : undefined;
}

export function safeReportedCompletedSettingCodes(value) {
  if (!Array.isArray(value) || value.length > 2) return undefined;
  const result=[];
  for (const item of value) {
    if (!object(item) || !fields.includes(item.field) || !['reported-code','conflict','invalid-or-conflicting'].includes(item.status) ||
      !Array.isArray(item.evidence) || item.evidence.length < 1 || item.evidence.length > 3) return undefined;
    if (result.some(x=>x.field===item.field)) return undefined;
    const evidence=[];
    for (const e of item.evidence) {
      if (!object(e) || e.field!==item.field || typeof e.path!=='string' || e.path.length>MAX_EVIDENCE_PATH ||
        !['finished-set','finished-set-detail'].includes(e.scope) || !['invalid-code','reported-code'].includes(e.status) ||
        !['null','array','object','string','number','boolean','undefined','bigint','symbol','function'].includes(e.rawType) ||
        (e.status==='reported-code' && code(e.code)===null)) return undefined;
      evidence.push({field:e.field,path:e.path,scope:e.scope,status:e.status,rawType:e.rawType,...(e.status==='reported-code'?{code:code(e.code)}:{})});
    }
    const valid=evidence.filter(e=>e.status==='reported-code');
    const status=valid.length!==evidence.length?'invalid-or-conflicting':new Set(valid.map(e=>e.code)).size>1?'conflict':'reported-code';
    if(status!==item.status || (status==='reported-code' && code(item.code)!==valid[0].code)) return undefined;
    result.push({field:item.field,status,...(status==='reported-code'?{code:valid[0].code}:{}),evidence,interpretation:'raw-performed-response-code; name-and-physical-semantics-unverified'});
  }
  return result.length?result:undefined;
}
