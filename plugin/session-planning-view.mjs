import { presentLoadChannels } from './load-channel-presentation.mjs';
const copy = (source, keys) => Object.fromEntries(keys.filter(key=>source?.[key]!==undefined).map(key=>[key,source[key]]));
const exactId=(source,keys)=>{
  const values=keys.filter(key=>source?.[key]!=null).map(key=>source[key]);
  if(!values.length)return {status:'unavailable'};
  const ids=values.map(value=>typeof value==='number'||typeof value==='string'&&/^\d+$/.test(value)?Number(value):NaN);
  if(ids.some(id=>!Number.isSafeInteger(id)||id<1)||ids.some(id=>id!==ids[0]))return {status:'conflicting-or-invalid'};
  return {status:'reported-in-session',id:ids[0]};
};
const resolvedRawDetail=rawSet=>{
 const keys=['trainingInfoDetail','training_info_detail'].filter(key=>Object.hasOwn(rawSet??{},key));
 const rows=keys.map(key=>rawSet[key]);
 if(!rows.length)return {status:'unavailable'};
 if(rows.some(row=>!row||typeof row!=='object'||Array.isArray(row)))return {status:'conflicting-or-invalid'};
 const relevant=['actionLibraryId','action_library_id','weights','leftWeights','left_weights','rightWeights','right_weights','leftTimestamps','left_timestamps','rightTimestamps','right_timestamps'];
 const signature=row=>JSON.stringify(relevant.filter(key=>Object.hasOwn(row,key)).map(key=>[key,row[key]]));
 if(rows.length>1&&signature(rows[0])!==signature(rows[1]))return {status:'conflicting-or-invalid'};
 return {status:'reported',value:rows[0]};
};
const repLoadEvidence=(rawSet,normalizedSet)=>{
  const reps=normalizedSet?.unit==='reps'?normalizedSet.reps:null;
  const unit=normalizedSet?.weightUnit;
  if(!Number.isSafeInteger(reps)||reps<1||reps>100||!['kg','lb'].includes(unit))return [];
  const sourceName=rawSet?.trainingInfoDetail?'trainingInfoDetail':'training_info_detail';
  const detail=resolvedRawDetail(rawSet).value;
  if(!detail||typeof detail!=='object'||Array.isArray(detail))return [];
  const sideFields=['leftWeights','rightWeights','left_weights','right_weights'].filter(field=>Object.hasOwn(detail,field));
  const groups=sideFields.length?[['leftWeights','left_weights'],['rightWeights','right_weights']].filter(keys=>normalizedSet?.side===1?/^left/i.test(keys[0]):normalizedSet?.side===2?/^right/i.test(keys[0]):true):[['weights']];
  return groups.flatMap(aliases=>{
    const fields=aliases.filter(field=>Object.hasOwn(detail,field));
    const parsed=fields.map(field=>{
      const raw=detail[field];
      const values=Array.isArray(raw)?raw:typeof raw==='string'&&raw.length<=2000?raw.split(',').map(value=>value.trim()):null;
      if(!values||values.length!==reps||Array.from(values).some(value=>!(typeof value==='number'||typeof value==='string'&&/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value))||!Number.isFinite(Number(value))||Number(value)<=0||Number(value)>300))return null;
      return values.map(Number);
    });
    if(!parsed.length||parsed.some(row=>row===null)||parsed.some(row=>row.some((value,index)=>value!==parsed[0][index])))return [];
    const field=fields[0],loads=parsed[0];
    return [{channel:/^left/i.test(field)?'left-cable':/^right/i.test(field)?'right-cable':'aggregate-reported',unit,reportedRepetitionCount:reps,minimumReportedLoad:Math.min(...loads),maximumReportedLoad:Math.max(...loads),sourceField:`${sourceName}.${field}`,status:'count-aligned-reported-rep-resistance',fixedCustomizeSettingVerified:false,physicalResistanceIndependentlyMeasured:false}];
  });
};
const nativeLoadEvidence=(rawSet,set,summary,parentVariant)=>{
  const detail=resolvedRawDetail(rawSet).value;
  const reportedVariant=exactId(detail,['actionLibraryId','action_library_id']);
  const variant=resolvedRawDetail(rawSet).status==='conflicting-or-invalid'||parentVariant?.status==='conflicting-or-invalid'||parentVariant?.status==='reported-in-session'&&reportedVariant.status==='reported-in-session'&&parentVariant.id!==reportedVariant.id?{status:'conflicting-or-invalid'}:reportedVariant;
  const raw=detail?.weights;
  const values=Array.isArray(raw)?raw:typeof raw==='string'&&raw.length<=2000?raw.split(',').map(value=>value.trim()):null;
  const valid=values&&values.length>0&&values.length<=100&&Array.from(values).every(value=>(typeof value==='number'||typeof value==='string'&&/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value))&&Number.isFinite(Number(value))&&Number(value)>0&&Number(value)<=300);
  return {
    variantIdentity:variant,
    nativeReportedLoad:valid&&variant.status!=='conflicting-or-invalid'?{
      status:'reported-native-sample-range',sourceField:rawSet?.trainingInfoDetail?'trainingInfoDetail.weights':'training_info_detail.weights',
      lower:Math.min(...values.map(Number)),upper:Math.max(...values.map(Number)),sampleCount:values.length,
      unit:['kg','lb'].includes(set?.weightUnit??summary?.weightUnit)?(set.weightUnit??summary.weightUnit):'unknown',
      unitSource:Object.hasOwn(set??{},'weightUnit')?'normalized-set-weightUnit':typeof summary?.weightUnitSource==='string'?summary.weightUnitSource:'unreported',
      ...(Object.hasOwn(set??{},'weightUnit')&&typeof summary?.weightUnitSource==='string'?{sessionContextUnitSource:summary.weightUnitSource}:{}),
      historicalUnitIndependentlyVerified:false,
      sampleCountMatchesAchievedReps:set?.unit==='reps'&&Number.isSafeInteger(set.reps)&&set.reps===values.length,
      sampleSemantics:'reported-native-sample-range-only',customizeSettingRelation:'not-verified-as-static-Customize-setting',customizeWriteScalarContract:'unverified',cableDerivedScalarInterpretation:'possible-but-unconfirmed',
      cableAggregation:'not-inferred',fixedCustomizeSettingVerified:false,physicalResistanceIndependentlyMeasured:false
    }:{status:resolvedRawDetail(rawSet).status==='conflicting-or-invalid'||variant.status==='conflicting-or-invalid'?'conflicting-or-invalid':raw===undefined?'unavailable':'invalid-or-unsupported',fixedCustomizeSettingVerified:false}
  };
};
const pairedCableSum=(rawSet,set)=>{
  if(set?.side!==0||set?.unit!=='reps'||!Number.isSafeInteger(set.reps)||set.reps<1||!['kg','lb'].includes(set.weightUnit))return null;
  const detail=resolvedRawDetail(rawSet).value;
  if(!detail||typeof detail!=='object'||Array.isArray(detail))return null;
  const getSamples=(camel,snake)=>{
    const keys=[camel,snake].filter(key=>Object.hasOwn(detail,key));
    const parsed=keys.map(key=>{
      const raw=detail[key];
      const values=Array.isArray(raw)?raw:typeof raw==='string'&&raw.length<=2000?raw.split(',').map(value=>value.trim()):null;
      if(!values||values.length!==set.reps||Array.from(values).some(value=>!(typeof value==='number'||typeof value==='string'&&/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value))||!Number.isFinite(Number(value))||Number(value)<=0||Number(value)>300))return null;
      return values.map(Number);
    });
    if(!parsed.length||parsed.some(row=>row===null)||parsed.some(row=>row.some((value,index)=>value!==parsed[0][index])))return null;
    return parsed[0];
  };
  const left=getSamples('leftWeights','left_weights'),right=getSamples('rightWeights','right_weights');
  if(!left||!right)return null;
  const timestamps=(camel,snake)=>{
    const keys=[camel,snake].filter(key=>Object.hasOwn(detail,key));
    const rows=keys.map(key=>detail[key]);
    if(!rows.length||rows.some(row=>!Array.isArray(row)||row.length!==set.reps||Array.from(row).some(value=>!Number.isSafeInteger(value)||value<=0))||rows.some(row=>row.some((value,index)=>value!==rows[0][index])))return null;
    return rows[0];
  };
  const leftTimes=timestamps('leftTimestamps','left_timestamps'),rightTimes=timestamps('rightTimestamps','right_timestamps');
  const aligned=Array.isArray(leftTimes)&&Array.isArray(rightTimes)&&leftTimes.length===left.length&&rightTimes.length===right.length&&
    leftTimes.every((value,index)=>Number.isSafeInteger(value)&&value>0&&value===rightTimes[index]&&(index===0||value>leftTimes[index-1]));
  if(!aligned)return {status:'bounded-cable-sum-envelope',basis:'sum-of-separate-channel-ranges; sample pairing unverified',scope:'both-cables',unit:set.weightUnit,lower:Math.min(...left)+Math.min(...right),upper:Math.max(...left)+Math.max(...right),physicalResistanceIndependentlyMeasured:false,fixedCustomizeSettingVerified:false};
  const totals=left.map((value,index)=>value+right[index]);
  return {status:'derived-from-paired-reported-samples',basis:'left-plus-right-with-identical-monotonic-reported-timestamps',scope:'both-cables',unit:set.weightUnit,lower:Math.min(...totals),upper:Math.max(...totals),sampleCount:totals.length,physicalResistanceIndependentlyMeasured:false,fixedCustomizeSettingVerified:false};
};
const loadAnchor=(set,repEvidence)=>{
  if(repEvidence.length)return {status:'reported-rep-resistance',basis:'count-aligned-reported-reps',channels:repEvidence.map(row=>({channel:row.channel,lower:row.minimumReportedLoad,upper:row.maximumReportedLoad,unit:row.unit})),historicalLoadTypeRequired:false,fixedCustomizeSettingVerified:false};
  if(['kg','lb'].includes(set?.weightUnit)&&Number.isFinite(set.weightMin)&&Number.isFinite(set.weightMax)&&set.weightMin>0&&set.weightMax>=set.weightMin&&Number.isSafeInteger(set.reps)&&set.reps>0)return {status:'reported-set-range',basis:'set-associated-load-values; repetition mapping unverified',channels:[{channel:'aggregate-reported',lower:set.weightMin,upper:set.weightMax,unit:set.weightUnit}],historicalLoadTypeRequired:false,fixedCustomizeSettingVerified:false};
  const samples=(set?.reportedLoadSequences??[]).filter(row=>row?.status==='reported'&&['kg','lb'].includes(row.unit)&&['left-cable','right-cable','aggregate-weights'].includes(row.channel)&&Number.isFinite(row.observedSampleSummary?.minimumReportedSample)&&Number.isFinite(row.observedSampleSummary?.maximumReportedSample)&&row.observedSampleSummary.minimumReportedSample>0&&row.observedSampleSummary.maximumReportedSample>=row.observedSampleSummary.minimumReportedSample);
  const sides=samples.filter(row=>row.channel!=='aggregate-weights');
  const scopedSides=set?.side===1?sides.filter(row=>row.channel==='left-cable'):set?.side===2?sides.filter(row=>row.channel==='right-cable'):sides;
  const selected=scopedSides.length?scopedSides: sides.length?[]:samples.filter(row=>row.channel==='aggregate-weights');
  if(Number.isSafeInteger(set?.reps)&&set.reps>0&&selected.length)return {status:'reported-set-range',basis:'set-associated-cable-values; repetition mapping unverified',channels:selected.map(row=>({channel:row.channel,lower:row.observedSampleSummary.minimumReportedSample,upper:row.observedSampleSummary.maximumReportedSample,unit:row.unit})),historicalLoadTypeRequired:false,fixedCustomizeSettingVerified:false};
  return {status:'unavailable',historicalLoadTypeRequired:false,fixedCustomizeSettingVerified:false};
};

export function projectSessionPlanningView(detail) {
  const summary=detail?.gmCoachSessionSummary;
  if (!summary || !Array.isArray(summary.exercises)) throw new Error('Normalized completed session summary is unavailable.');
  const exercises=summary.exercises.map(exercise=>{
    const match=typeof exercise.path==='string'?/^\$\.detail\[(\d+)\]$/.exec(exercise.path):null;
    const raw=match&&Array.isArray(detail.detail)?detail.detail[Number(match[1])]:null;
    const group=exactId(raw,['groupId','group_id','actionLibraryGroupId','action_library_group_id']);
    const variant=exactId(raw,['actionLibraryId','action_library_id']);
    return {
      name:exercise.exercise,
      ...(group.status==='reported-in-session'?{groupId:group.id}:{}),
      ...(group.status!=='reported-in-session'?{groupIdStatus:group.status}:{}),
      ...(variant.status==='reported-in-session'?{actionLibraryId:variant.id}:{}),
      actionLibraryIdStatus:variant.status,
      sets:(exercise.sets??[]).map((set,index)=>{
        const rawSet=raw?.finishedReps?.[index]??raw?.finished_reps?.[index];
        const nativeExecutionEvidence=nativeLoadEvidence(rawSet,set,summary,variant);
        const resolvedSet={...set,weightUnit:set.weightUnit??summary.weightUnit};
        const channelProjection=presentLoadChannels(set.reportedLoadSequences);
        const unknownChannels=new Set(channelProjection.channels.filter(row=>row.status==='unknown').map(row=>row.channel));
        const observedRepLoadEvidence=(nativeExecutionEvidence.variantIdentity.status==='conflicting-or-invalid'?[]:repLoadEvidence(rawSet,resolvedSet)).filter(row=>!unknownChannels.has(row.channel));
        const observedLoadAnchor=nativeExecutionEvidence.variantIdentity.status==='conflicting-or-invalid'?{status:'unavailable',reason:'conflicting-variant-identity',historicalLoadTypeRequired:false,fixedCustomizeSettingVerified:false}:loadAnchor({...resolvedSet,reportedLoadSequences:(resolvedSet.reportedLoadSequences??[]).filter(row=>!unknownChannels.has(row.channel))},observedRepLoadEvidence);
        const pairedSum=nativeExecutionEvidence.variantIdentity.status==='conflicting-or-invalid'?null:pairedCableSum(rawSet,resolvedSet);
        const channels=observedLoadAnchor.channels??[];
        const left=channels.find(row=>row.channel==='left-cable'),right=channels.find(row=>row.channel==='right-cable');
        const channelPresentation=presentLoadChannels(set.reportedLoadSequences);
        const conflictingChannel=channelPresentation.channels.some(row=>row.status==='unknown');
        const envelope=nativeExecutionEvidence.variantIdentity.status!=='conflicting-or-invalid'&&!conflictingChannel&&!pairedSum&&set.side===0&&left&&right&&left.unit===right.unit?{status:'bounded-cable-sum-envelope',basis:'sum-of-separate-channel-ranges; sample pairing unverified',scope:'both-cables',unit:left.unit,lower:left.lower+right.lower,upper:left.upper+right.upper,physicalResistanceIndependentlyMeasured:false,fixedCustomizeSettingVerified:false}:null;
        return {
        ...copy(set,['set','reps','targetCount','unit','elapsedSeconds','side','weightMin','weightMax','weightUnit','summaryWeight','summaryWeightUnit','summaryWeightStatus','reportedSettingCodes']),
        nativeExecutionEvidence,
        observedRepLoadEvidence,
        observedLoadAnchor,
        loadChannelPresentation:presentLoadChannels(set.reportedLoadSequences),
        reportedModeInterpretation:'performed-sportMode-code-unmapped-to-physical-behavior',
        phaseLoadStatus:'concentric-and-eccentric-loads-not-separated-by-reported-samples',
        reportedLoadScope:set.side===0?'bilateral-reported':set.side===1?'left-side-reported':set.side===2?'right-side-reported':'unknown',
        ...(pairedSum||envelope?{reportedCableSum:pairedSum??envelope}:{}),
        reportedLoadChannels:(set.reportedLoadSequences??[]).map(row=>({
          ...copy(row,['channel','unit','status','sampleToRepetitionMapping']),
          ...copy(row.observedSampleSummary,['minimumReportedSample','maximumReportedSample','workingLoadInferred'])
        }))
      };})
    };
  });
  return {
    ...copy(detail,['training_id','kind','liftedVolumeStatus']),
    weightUnit:['kg','lb'].includes(summary.weightUnit)?summary.weightUnit:'unknown',
    weightUnitSource:typeof summary.weightUnitSource==='string'?summary.weightUnitSource:'unreported',
    gmCoachSessionReadback:detail.gmCoachSessionReadback,
    exerciseCount:exercises.length,
    setCount:exercises.reduce((sum,exercise)=>sum+exercise.sets.length,0),
    exercises,
    readOnly:true,
    planningView:true,
    fixedPerSetLoadStatus:'not-inferred-from-telemetry',
    note:'Reported resistance from completed sessions may anchor later manual-load planning, including sessions that used Smart RM to select resistance. Smart RM is a load-selection preset, separate from the resistance mode. Review exercise, reps, unit, side, preset and mode independently. Performed sportMode codes are raw evidence; do not map them to template mode names without confirming that API contract. Standard can vary when resistance is machine-selected, Chain can vary across the movement, and Eccentric can differ between lifting and lowering; reported samples do not identify movement phase or prove a fixed Customize setting. reportedCableSum is a derived left-plus-right sample sum or a bounded envelope, never independently measured physical force. Do not double a one-sided load or infer RIR. Reported IDs need current catalog confirmation; full diagnostic data remain in output_view=full.'
  };
}
