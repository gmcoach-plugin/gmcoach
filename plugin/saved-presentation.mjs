const sharedNames = new Set(['unitEvidence','unitNote','restSourceFields','resistanceModeContract','displayLoad','loadDiagnostics']);
const envelopeNames = new Set(['profile','id','code','name','deviceType','displayWeightUnit','displayWeightUnitSource','accountWeightUnit','accountWeightUnitSource','staticLoadProtocolDiagnostic','unitMemoryWarning','listCompleteness','coachNotesIdentityStatus','operationStatus','mutationSent','programCreatedByThisCall','programModifiedByThisCall','canUseListForMutation','exerciseCatalogRead','nativeStaticDisplayReadOnly','presetDisplayReadOnly','savedReadSemanticMetadataReadOnly','humanLoadPresentationReadOnly']);
function jsonClone(value,{preserveFullValues=false}={}) {
 if(Object.hasOwn(Array.prototype,'toJSON')||Object.hasOwn(Object.prototype,'toJSON'))throw new TypeError('Inherited JSON hooks forbidden.');
 const seen=new Set();
 function clone(v){
  if(v===undefined&&preserveFullValues)return undefined;
  if(v===null||['string','boolean'].includes(typeof v))return v;
  if(typeof v==='number'&&(preserveFullValues||Number.isFinite(v)))return v;
  if(typeof v!=='object'||seen.has(v))throw new TypeError('Presentation requires plain JSON.');
  const array=Array.isArray(v),proto=Object.getPrototypeOf(v);
  if(array?proto!==Array.prototype:proto!==Object.prototype&&proto!==null)throw new TypeError('Presentation requires plain JSON.');
  seen.add(v);const out=array?[]:{};
  for(const key of Reflect.ownKeys(v)){
   if(array&&key==='length')continue;
   if(typeof key!=='string'||array&&(!/^(0|[1-9]\d*)$/.test(key)||Number(key)>=v.length))throw new TypeError('Presentation requires canonical JSON keys.');
   const d=Object.getOwnPropertyDescriptor(v,key);if(!Object.hasOwn(d,'value')||!d.enumerable)throw new TypeError('Presentation requires plain JSON.');
   Object.defineProperty(out,key,{value:clone(d.value),writable:true,enumerable:true,configurable:true});
  }
  if(array)for(let i=0;i<v.length;i++)if(!Object.hasOwn(v,i))throw new TypeError('Presentation requires dense JSON arrays.');
  seen.delete(v);return out;
 }
 // Full/read presentation retains optional undefined/nonfinite values exactly; transport serialization stays separate.
 const result=clone(value);return preserveFullValues?result:JSON.parse(JSON.stringify(result));
}
export function assertSavedPresentationArguments(args){
 const header=Object.getOwnPropertyDescriptor(args,'include_response_header_diagnostics');if(('include_response_header_diagnostics' in args&&!header)||header&&(!Object.hasOwn(header,'value')||typeof header.value!=='boolean'))throw new TypeError('include_response_header_diagnostics must be own boolean.');
 const diagnostic=Object.getOwnPropertyDescriptor(args,'include_load_diagnostics');if(('include_load_diagnostics' in args&&!diagnostic)||diagnostic&&(!Object.hasOwn(diagnostic,'value')||typeof diagnostic.value!=='boolean'))throw new TypeError('include_load_diagnostics must be own boolean.');
 for(const [key,min,max]of [['load_diagnostics_offset',0,10000],['load_diagnostics_limit',1,8]]){const d=Object.getOwnPropertyDescriptor(args,key);if(key in args&&!d||d&&(!Object.hasOwn(d,'value')||!Number.isSafeInteger(d.value)||d.value<min||d.value>max||diagnostic?.value!==true))throw new TypeError('Invalid '+key+'.');} 
 const descriptor=Object.getOwnPropertyDescriptor(args,'output_view');if(descriptor&&!Object.hasOwn(descriptor,'value'))throw new TypeError('Invalid output_view.');
 const view=descriptor?descriptor.value:'full';if(!['full','presentation'].includes(view))throw new TypeError('Invalid output_view.');
 if(view==='presentation')for(const name of ['include_action_library_list','include_coach_review','unit_confirmations','confirmed_weight_unit','include_load_diagnostics','include_response_header_diagnostics','load_diagnostics_offset','load_diagnostics_limit'])if(Object.hasOwn(args,name))throw new TypeError('Presentation excludes '+name+'.');
 return view;
}
export function encodeSavedPresentation(source){
 const value=jsonClone(source,{preserveFullValues:true});value.humanLoadPresentationReadOnly=projectSavedHumanLoads(value);if(!Array.isArray(value.exercises))throw new TypeError('Presentation exercises missing.');
 for(const [field,limit]of [['nativeStaticDisplayReadOnly',16000],['presetDisplayReadOnly',16384],['savedReadSemanticMetadataReadOnly',4096]])if(value[field]!==undefined&&Buffer.byteLength(JSON.stringify(value[field]),'utf8')>limit)throw new TypeError('Presentation control envelope exceeds bound.');
 const out={};for(const [key,v]of Object.entries(value))if(envelopeNames.has(key))out[key]=v;
 out.outputView='presentation';out.presentationSchema='gm-coach.saved-presentation.v1';out.writeReady=false;out.scientificApproval=false;out.requiresFullReadForMutation=true;
 out.omittedFields=Object.keys(value).filter(key=>!envelopeNames.has(key)&&key!=='exercises');out.sharedSetFields=[];const index=new Map();
 out.exercises=value.exercises.map(ex=>{if(!ex||Array.isArray(ex)||typeof ex!=='object'||!Array.isArray(ex.sets))throw new TypeError('Presentation sets missing.');return {...ex,sets:ex.sets.map(set=>{
  if(!set||Array.isArray(set)||typeof set!=='object')throw new TypeError('Invalid presentation set.');if(Object.hasOwn(set,'sharedFieldsRefs'))throw new TypeError('Presentation reserved-field-collision.');const row={...set},refs={};
  for(const field of sharedNames)if(Object.hasOwn(row,field)){if(row[field]===undefined)continue;const key=JSON.stringify([field,row[field]]);let id=index.get(key);if(id===undefined){id=out.sharedSetFields.length;index.set(key,id);out.sharedSetFields.push({field,value:row[field]});}refs[field]=id;delete row[field];}
  if(Object.keys(refs).length)row.sharedFieldsRefs=refs;return row;
 })};});return out;
}
export function decodeSavedPresentation(input){
 const value=jsonClone(input);if(value.outputView!=='presentation'||value.presentationSchema!=='gm-coach.saved-presentation.v1'||!Array.isArray(value.sharedSetFields)||!Array.isArray(value.exercises))throw new TypeError('Invalid presentation schema.');
 for(const entry of value.sharedSetFields)if(!entry||Object.keys(entry).length!==2||!Object.hasOwn(entry,'field')||!Object.hasOwn(entry,'value')||!sharedNames.has(entry.field))throw new TypeError('Invalid shared field.');
 return value.exercises.map(ex=>{if(!ex||Array.isArray(ex)||typeof ex!=='object'||!Array.isArray(ex.sets))throw new TypeError('Invalid presentation sets.');return{...ex,sets:ex.sets.map(set=>{if(!set||Array.isArray(set)||typeof set!=='object')throw new TypeError('Invalid presentation set.');const row={...set};if(Object.hasOwn(row,'sharedFieldsRefs')){const refs=row.sharedFieldsRefs;if(!refs||Array.isArray(refs)||typeof refs!=='object')throw new TypeError('Invalid shared refs.');for(const [field,id]of Object.entries(refs)){if(!sharedNames.has(field)||Object.hasOwn(row,field)||!Number.isSafeInteger(id)||id<0||id>=value.sharedSetFields.length||value.sharedSetFields[id].field!==field)throw new TypeError('Invalid shared reference or collision.');row[field]=value.sharedSetFields[id].value;}delete row.sharedFieldsRefs;}return row;})};});
}
export function presentSavedRead(source,{outputView='presentation'}={}){
 const value=jsonClone(source,{preserveFullValues:true});
 if(outputView==='full')return {...value,humanLoadPresentationReadOnly:projectSavedHumanLoads(value)};
 if(outputView!=='presentation')throw new TypeError('Invalid output view.');
 try{return encodeSavedPresentation(value);}catch(error){
  if(error.message!=='Presentation reserved-field-collision.')throw error;
  return {...value,humanLoadPresentationReadOnly:projectSavedHumanLoads(value),outputView:'full',presentationDiagnostic:'reserved-field-collision; full result returned; existing full-read authority semantics retained'};
 }
}
// Software presentation only: original normalized sets and diagnostics are never replaced.
export function projectSavedHumanLoads(source){
 const unavailable=reason=>({schema:'gm-coach.saved-human-loads.v1',readOnly:true,writeReady:false,scientificApproval:false,status:'unavailable',reason,rows:[]});
 try{
  const selected={};for(const [field,key]of [['exercises','exercises'],['nativeStaticDisplayReadOnly','native'],['presetDisplayReadOnly','preset']]){const d=Object.getOwnPropertyDescriptor(source,field);if(!d){if(field in source)throw new TypeError('Inherited display field.');continue;}if(!Object.hasOwn(d,'value'))throw new TypeError('Display accessor forbidden.');selected[key]=d.value;}
 const value=jsonClone(selected);
  if(!Array.isArray(value.exercises)||value.exercises.length>100)return unavailable('exercise-bound');
  const validId=n=>Number.isSafeInteger(n)&&n>0;
  const label=s=>typeof s==='string'&&s.length>0&&s.length<=200&&!/[\u0000-\u001f\u007f]/.test(s);
  const native=new Map(),preset=new Map(),blockedNative=new Set(),blockedPreset=new Set();
  const key=(a,s,v)=>`${a}:${s}:${v}`;
  const offer=(map,blocked,k,v)=>{if(map.has(k)||blocked.has(k)){map.delete(k);blocked.add(k);}else map.set(k,v);};
  const n=value.native;
  if(n?.status==='qualified-display-rows'&&n.qualification==='official-share-consumer-display'&&n.readOnly===true&&n.displayOnly===true&&n.executableAllowed===false&&n.scientificApproval===false&&n.apiAccountUnitConfirmed===false&&n.physicalResistanceConfirmed===false&&Array.isArray(n.rows)&&n.rows.length<=10000){
   for(const row of n.rows){if(!Number.isSafeInteger(row.actionIndex)||row.actionIndex<0||!validId(row.set)||!validId(row.exerciseId)||!validId(row.actionLibraryId)||row.displayUnit!=='kg'||typeof row.reportedWeight!=='number'||!Number.isFinite(row.reportedWeight)||row.reportedWeight<=0)continue;offer(native,blockedNative,key(row.actionIndex,row.set,row.actionLibraryId),row);}
  }
  const p=value.preset;
  if(p?.readOnly===true&&p.executableAllowed===false&&p.schemaVersion===1&&Array.isArray(p.presetDisplay)&&p.presetDisplay.length<=100){
   for(const group of p.presetDisplay){if(!validId(group.groupId)||group.source!=='same-read-exact-group-metadata'||group.qualification!=='display-only-not-writer-authority'||!Array.isArray(group.occurrences)||group.occurrences.length>10000)continue;
    for(const row of group.occurrences){if(row.status!=='contextual-display-match'||row.reason!=='exact-selector-and-variant-match'||!Number.isSafeInteger(row.actionIndex)||row.actionIndex<0||!validId(row.set)||!validId(row.actionLibraryId)||!validId(row.recordedPresetId)||!label(row.displayPresetName))continue;offer(preset,blockedPreset,key(row.actionIndex,row.set,row.actionLibraryId),{...row,exerciseId:group.groupId});}
   }
  }
  const rows=[];
  for(let actionIndex=0;actionIndex<value.exercises.length;actionIndex++){
   const exercise=value.exercises[actionIndex];if(!exercise||!Array.isArray(exercise.sets)||exercise.sets.length>100)return unavailable('set-bound');
   if(!validId(exercise.exerciseId)||!validId(exercise.actionLibraryId))return unavailable('exercise-identity');
   for(let index=0;index<exercise.sets.length;index++){
    const set=exercise.sets[index];if(!set||set.set!==index+1)return unavailable('set-identity');
    const k=key(actionIndex,set.set,exercise.actionLibraryId),nr=native.get(k),pr=preset.get(k);
    let text=typeof set.displayLoad==='string'?set.displayLoad:'Obciążenie niepodane',provenance='normalized-saved-set';
    // Unknown account unit is not proof against the independently qualified manufacturer view.
    if(nr&&nr.exerciseId===exercise.exerciseId&&validId(exercise.actionLibraryId)&&set.unit==='reps'&&set.loadType==='static-account-load'){
     text=`${nr.reportedWeight} kg (widok producenta)`;provenance='qualified-native-manufacturer-view';
    }else if(set.unit==='reps'&&set.loadType==='preset-load-unknown'&&set.recordedPresetStatus==='recorded-only'&&label(set.recordedPresetName)){
     text=`${set.recordedPresetName} (zapisany preset)`;provenance='returned-recorded-preset-name';
    }else if(set.unit==='reps'&&pr&&pr.exerciseId===exercise.exerciseId&&set.loadType==='preset-load-unknown'&&set.recordedPresetId===pr.recordedPresetId){
     text=`${pr.displayPresetName} (zapisany preset)`;provenance='exact-contextual-preset-name';
    }
    rows.push({actionIndex,exerciseId:exercise.exerciseId,actionLibraryId:exercise.actionLibraryId,set:set.set,label:text,provenance});
   }
  }
  const result={schema:'gm-coach.saved-human-loads.v1',readOnly:true,writeReady:false,scientificApproval:false,status:'available',rows,diagnosticsLocation:'Original normalized exercises and complete nativeStaticDisplayReadOnly/presetDisplayReadOnly remain unchanged; describe an actual relevant conflict once below the table.'};
  return Buffer.byteLength(JSON.stringify(result),'utf8')<=65536?result:unavailable('human-projection-envelope-bound');
 }catch{return unavailable('non-json-or-unqualified-input');}
}