import {calculateSketchTime, sketchTimeInputSchema} from './sketch-time.mjs';

const range = sketchTimeInputSchema.properties.additionalSetupRange;
const side = {type:'string',enum:['left','right','bilateral','not-applicable']};
const work = sketchTimeInputSchema.properties.rows.items.properties.work;
const zero = Object.freeze({minSeconds:0,maxSeconds:0});

export const compactSketchInputSchema = {
  type:'object',required:['blocks','additionalSetupRange'],additionalProperties:false,
  properties:{
    blocks:{type:'array',minItems:1,maxItems:32,items:{type:'object',
      required:['id','section','setCount','sides','loadMode','restWithinSetRange','restBetweenSetsRange','restAfterBlockRange','transitionAfterBlockRange'],
      additionalProperties:false,allOf:[{oneOf:[{required:['work'],not:{required:['workBySet']}},{required:['workBySet'],not:{required:['work']}}]},{if:{properties:{loadMode:{const:'smart-rm'}}},then:{required:['smartRmPreset']},else:{not:{required:['smartRmPreset']}}}],properties:{
        id:{type:'string',pattern:'^[A-Za-z0-9_-]{1,40}$'},
        section:{type:'string',enum:['warmup','main','cooldown']},
        setCount:{type:'integer',minimum:1,maximum:32},
        sides:{type:'array',minItems:1,maxItems:2,items:side},
        work,
        workBySet:{type:'array',minItems:1,maxItems:32,items:work,description:'Jedna dawka na serię, dokładnie setCount elementów; użyj zamiast work, gdy powtórzenia lub czas serii się różnią.'},
        loadMode:{type:'string',enum:['smart-rm','bodyweight','other','none']},
        smartRmPreset:{type:'string',enum:['Gain Muscle','Strength','Stamina'],description:'Wymagane dla smart-rm: Gain Muscle 8–12, Strength 2–8, Stamina 13–20 powtórzeń; kalkulator odrzuca inną liczbę.'},
        restWithinSetRange:range,
        restBetweenSetsRange:range,
        restAfterBlockRange:range,
        transitionAfterBlockRange:range
      }}},
    additionalSetupRange:range,
    sessionLimitMinutes:{type:'number',exclusiveMinimum:0,maximum:1440}
  }
};

export function calculateCompactSketch(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !Array.isArray(input.blocks) || input.blocks.length<1 || input.blocks.length>32) throw new TypeError('Compact sketch needs 1–32 blocks.');
  if (Object.keys(input).some(key=>!['blocks','additionalSetupRange','sessionLimitMinutes'].includes(key))) throw new TypeError('Unknown compact sketch field.');
  const seen=new Set(),rows=[];
  for(const block of input.blocks){
    if(!block || typeof block!=='object' || Array.isArray(block) || Object.keys(block).some(key=>!['id','section','setCount','sides','work','workBySet','loadMode','smartRmPreset','restWithinSetRange','restBetweenSetsRange','restAfterBlockRange','transitionAfterBlockRange'].includes(key))) throw new TypeError('Invalid compact block.');
    if(typeof block.id!=='string'||!/^[A-Za-z0-9_-]{1,40}$/.test(block.id)||seen.has(block.id))throw new TypeError('Block IDs must be unique local ASCII identifiers.');
    seen.add(block.id);
    if(!['warmup','main','cooldown'].includes(block.section)||!Number.isSafeInteger(block.setCount)||block.setCount<1||block.setCount>32)throw new TypeError('Invalid compact block section or set count.');
    if(!Array.isArray(block.sides)||block.sides.length<1||block.sides.length>2||new Set(block.sides).size!==block.sides.length||block.sides.some(value=>!['left','right','bilateral','not-applicable'].includes(value))||block.sides.length===2&&!(block.sides.includes('left')&&block.sides.includes('right')))throw new TypeError('Declare one side or both left and right.');
    const variable=block.workBySet!==undefined;
    if(variable=== (block.work!==undefined)||variable&&(!Array.isArray(block.workBySet)||block.workBySet.length!==block.setCount||block.workBySet.some(item=>!item||typeof item!=='object'||Array.isArray(item)))||!variable&&(!block.work||typeof block.work!=='object'||Array.isArray(block.work)))throw new TypeError('Declare one work dose or exactly one dose per set.');
    if(!['smart-rm','bodyweight','other','none'].includes(block.loadMode))throw new TypeError('Declare the load mode for each block.');
    if(block.loadMode==='smart-rm'){
      const bounds={'Gain Muscle':[8,12],Strength:[2,8],Stamina:[13,20]}[block.smartRmPreset];
      if(!bounds|| (variable?block.workBySet:[block.work]).some(item=>item.unit!=='reps'||!Number.isSafeInteger(item.reps)||item.reps<bounds[0]||item.reps>bounds[1]))throw new TypeError('Smart RM preset requires matching repetition range: Gain Muscle 8–12, Strength 2–8, Stamina 13–20.');
    }else if(block.smartRmPreset!==undefined)throw new TypeError('Smart RM preset belongs only to a smart-rm block.');
    for(let set=1;set<=block.setCount;set++)for(let sideIndex=0;sideIndex<block.sides.length;sideIndex++){
      const lastSide=sideIndex===block.sides.length-1,lastSet=set===block.setCount;
      rows.push({label:`${block.id}.s${set}.${block.sides[sideIndex]}`,section:block.section,side:block.sides[sideIndex],work:variable?block.workBySet[set-1]:block.work,
        restAfterRange:!lastSide?block.restWithinSetRange:!lastSet?block.restBetweenSetsRange:block.restAfterBlockRange,
        transitionAfterRange:lastSide&&lastSet?block.transitionAfterBlockRange:zero,overlapAfterSeconds:0});
      if(rows.length>100)throw new TypeError('Compact sketch expands beyond 100 rows.');
    }
  }
  // The final block must declare zero rest and transition; the underlying
  // calculator rejects accidental after-session gaps instead of dropping them.
  const timed=calculateSketchTime({rows,additionalSetupRange:input.additionalSetupRange,...(input.sessionLimitMinutes===undefined?{}:{sessionLimitMinutes:input.sessionLimitMinutes})});
  const scienceScopeHints={timedExercisePresent:input.blocks.some(block=>(block.workBySet??[block.work]).some(item=>item.unit==='seconds')),warmupPresent:input.blocks.some(block=>block.section==='warmup'),cooldownPresent:input.blocks.some(block=>block.section==='cooldown'),smartRmPresent:input.blocks.some(block=>block.loadMode==='smart-rm'),note:'Presence only; assess timed_exercise even for timed warmup/cooldown. If cooldown includes stretching, assess stretching_mobility and post_workout_stretching. Exact evidence bindings and fresh research remain required for a real plan.'};
  return {...timed,source:'caller-declared-compact-sketch',expansion:{blockCount:input.blocks.length,rowCount:rows.length,variableSetBlocks:input.blocks.filter(block=>block.workBySet!==undefined).length,restBetweenSidesAndSetsDeclared:true,transitionAfterBlocksDeclared:true,overlapAssumedSeconds:0,smartRmPresetRangesChecked:input.blocks.filter(block=>block.loadMode==='smart-rm').length},scienceScopeHints,writeReady:false,scientificApproval:false};
}
