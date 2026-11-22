import { expandTerm, impliedMuscles } from './exercise-aliases.mjs';
// Catalog titles may carry invisible characters (zero-width space, soft hyphen); match and return them clean (NFC).
const text = value => typeof value === 'string' ? value.normalize('NFC').replace(/[\u200b-\u200d\ufeff\u00ad]/gu, '').trim() : '';
const key = value => text(value).toLocaleLowerCase('en-US');
const tokens = value => key(value).match(/[\p{L}\p{N}]+/gu) ?? [];

function sectionHint(row) {
  const category = key(row.category);
  if (category.includes('warmup') || category.includes('warm-up')) return 'warmup';
  if (category.includes('stretch') || category.includes('recovery')) return 'stretching';
  return 'main';
}

function equipmentStatus(row, inventory) {
  if (row.equipmentMetadataAvailable !== true || !['valid-empty','valid-ids'].includes(row.equipmentMetadataStatus)) return 'requirements-unknown';
  const ids = Array.isArray(row.requiredAccessoryIds) ? row.requiredAccessoryIds : [];
  if (!ids.every(id => Number.isSafeInteger(id) && id > 0)) return 'requirements-unknown';
  const owned = new Set((inventory.ownedAccessories ?? []).map(item => item.id));
  if (ids.every(id => owned.has(id))) return inventory.ownershipKnown === true || ids.length > 0 && inventory.source === 'user-confirmed-local' ? 'available' : 'ownership-unknown';
  return inventory.ownershipKnown === true ? 'missing-accessory' : 'ownership-unknown';
}

export function buildExerciseCandidateIndex(exercises, inventory, requests, perRequestLimit = 8) {
  if (!Array.isArray(exercises) || !Array.isArray(requests) || requests.length < 1 || requests.length > 32 || !Number.isSafeInteger(perRequestLimit) || perRequestLimit < 1 || perRequestLimit > 20) throw new Error('Invalid candidate index request.');
  const accessoryById = new Map((inventory.catalog ?? []).filter(row=>Number.isSafeInteger(row?.id)&&row.id>0&&text(row.name)).map(row=>[row.id,row.name]));
  const categoryCounts = new Map();
  const muscleCounts = new Map();
  const observedVariantGroups = new Map();
  for (const row of exercises) {
    if (!Number.isSafeInteger(row?.id) || row.id < 1 || !text(row.title)) continue;
    const category = text(row.category) || 'Unreported category';
    const groupKey = JSON.stringify([sectionHint(row),category]);
    categoryCounts.set(groupKey,(categoryCounts.get(groupKey) ?? 0)+1);
    const muscle = row.mainMuscleGroupStatus === 'available' ? text(row.mainMuscleGroupName) : '';
    if (muscle) muscleCounts.set(muscle,(muscleCounts.get(muscle) ?? 0)+1);
    if (row.variantCatalogStatus === 'observed-list' && Array.isArray(row.actionLibraryVariants)) {
      for (const variant of row.actionLibraryVariants) {
        if (!Number.isSafeInteger(variant?.id) || variant.id < 1) continue;
        const groups = observedVariantGroups.get(variant.id) ?? new Set();
        groups.add(row.id);
        observedVariantGroups.set(variant.id,groups);
      }
    }
  }
  const categories = [...categoryCounts].map(([group,count])=>{const [sectionHint,category]=JSON.parse(group);return {sectionHint,category,count};}).sort((a,b)=>a.sectionHint.localeCompare(b.sectionHint)||a.category.localeCompare(b.category));
  const muscleGroups = [...muscleCounts].map(([muscle,count])=>({muscle,count})).sort((a,b)=>a.muscle.localeCompare(b.muscle));
  const results = requests.map((request,index) => {
    if (!request || Object.keys(request).some(name=>!['section','terms','muscleLabel','groupId','actionLibraryId'].includes(name)) || !['main','warmup','stretching'].includes(request.section??'main') || (request.groupId !== undefined && (!Number.isSafeInteger(request.groupId) || request.groupId < 1)) || (request.actionLibraryId !== undefined && (request.groupId === undefined || !Number.isSafeInteger(request.actionLibraryId) || request.actionLibraryId < 1)) || (request.terms !== undefined && (typeof request.terms !== 'string' || request.terms.length > 120 || tokens(request.terms).length===0)) || (request.groupId === undefined && (!request.terms || tokens(request.terms).length===0)) || request.muscleLabel !== undefined && (typeof request.muscleLabel !== 'string' || request.muscleLabel.length > 120 || !request.muscleLabel.trim())) throw new Error(`Invalid candidate request ${index+1}.`);
    const requestedSection=request.section??'main';
    const words = [...new Set(tokens(request.terms))];
    const muscle = key(request.muscleLabel);
    const matches = [];
    for (const row of exercises) {
      if (!Number.isSafeInteger(row?.id) || row.id < 1 || !text(row.title)) continue;
      if (request.groupId !== undefined && row.id !== request.groupId) continue;
      if (muscle && (row.mainMuscleGroupStatus !== 'available' || key(row.mainMuscleGroupName) !== muscle)) continue;
      const title = key(row.title), category = key(row.category), muscleName = key(row.mainMuscleGroupName);
      const titleHits = words.filter(word=>expandTerm(word).some(v=>title.includes(v))).length;
      const otherHits = words.filter(word=>expandTerm(word).some(v=>category.includes(v)||muscleName.includes(v))).length;
      if (request.groupId === undefined && titleHits + otherHits === 0) continue;
      const equipment = equipmentStatus(row,inventory);
      const section = sectionHint(row);
      const confirmedRequirements = row.equipmentMetadataAvailable === true && ['valid-empty','valid-ids'].includes(row.equipmentMetadataStatus);
      const exactTitle = request.terms !== undefined && title === key(request.terms);
      const allTitleWords = words.length > 0 && titleHits === words.length;
      const score = (exactTitle?100:0) + (allTitleWords?20:0) + titleHits*4 + otherHits + (section===requestedSection?3:0) + (equipment==='available'?2:0) + (row.variantCatalogStatus==='observed-list'?1:0) + (confirmedRequirements?1:0);
      matches.push({score,row,section,equipment});
    }
    matches.sort((a,b)=>b.score-a.score||a.row.title.localeCompare(b.row.title)||a.row.id-b.row.id);
    const variantGroups = request.groupId !== undefined && matches.length === 0 ? [...(observedVariantGroups.get(request.groupId) ?? [])] : [];
    const ready = matches.filter(({row,section,equipment})=>section===requestedSection && words.every(word=>expandTerm(word).some(v=>key(row.title).includes(v))) && equipment==='available' && row.equipmentMetadataAvailable===true && ['valid-empty','valid-ids'].includes(row.equipmentMetadataStatus) && row.variantCatalogStatus==='observed-list' && Array.isArray(row.actionLibraryVariants) && row.actionLibraryVariants.some(variant=>Number.isSafeInteger(variant?.id)&&variant.id>0));
    let substitute=null;
    if (!ready.length && requestedSection!=='main' && request.groupId===undefined) {
      const muscles=new Set([...(muscle?[request.muscleLabel]:[]),...impliedMuscles(request.terms),...matches.slice(0,5).map(({row})=>row.mainMuscleGroupStatus==='available'?row.mainMuscleGroupName:null).filter(Boolean)].map(key));
      const pool=exercises.filter(row=>Number.isSafeInteger(row?.id)&&text(row.title)&&sectionHint(row)===requestedSection&&muscles.has(key(row.mainMuscleGroupName))&&equipmentStatus(row,inventory)==='available'&&row.variantCatalogStatus==='observed-list'&&Array.isArray(row.actionLibraryVariants)&&row.actionLibraryVariants.some(variant=>Number.isSafeInteger(variant?.id)&&variant.id>0));
      const overlap=row=>words.filter(word=>expandTerm(word).some(v=>key(row.title).includes(v))).length;
      pool.sort((a,b)=>overlap(b)-overlap(a)||a.title.localeCompare(b.title)||a.id-b.id);
      if (pool.length) { const row=pool[0]; substitute={groupId:row.id,title:text(row.title),actionLibraryId:row.actionLibraryVariants.find(variant=>Number.isSafeInteger(variant?.id)&&variant.id>0).id,requiredAccessoryIds:row.requiredAccessoryIds,mainMuscleGroupName:row.mainMuscleGroupName,substituteFor:request.terms,userNotice:`Nie znaleziono „${request.terms}” w katalogu; automatycznie wybrano najbliższy dostępny zamiennik z tej samej grupy mięśniowej (${row.mainMuscleGroupName}): ${row.title}. Poinformuj użytkownika o zamianie.`}; ready.push({row,section:requestedSection,equipment:'available'}); }
    }
    return {...(substitute?{autoSubstitute:substitute}:{}),section:requestedSection,...(request.terms?{terms:request.terms}:{}),...(request.groupId?{groupId:request.groupId}:{}),...(request.actionLibraryId?{actionLibraryId:request.actionLibraryId}:{}),...(muscle?{muscleLabel:request.muscleLabel}:{}),totalCandidates:matches.length,readyCandidateCount:ready.length,readyCandidates:ready.slice(0,perRequestLimit).map(({row})=>({groupId:row.id,title:text(row.title),actionLibraryId:row.actionLibraryVariants.find(variant=>Number.isSafeInteger(variant?.id)&&variant.id>0).id,requiredAccessoryIds:row.requiredAccessoryIds})),...(variantGroups.length===1?{identifierHint:{status:'variant-id-used-as-group-id',suggestedGroupId:variantGroups[0],actionLibraryId:request.groupId}}:{}),candidates:matches.slice(0,perRequestLimit).map(({row,section,equipment})=>({groupId:row.id,title:text(row.title),category:row.category,sectionHint:section,mainMuscleGroupName:row.mainMuscleGroupStatus==='available'?row.mainMuscleGroupName:null,mainMuscleGroupStatus:row.mainMuscleGroupStatus??'unknown',equipmentStatus:equipment,accessoryMetadataStatus:row.equipmentMetadataAvailable===true&&['valid-empty','valid-ids'].includes(row.equipmentMetadataStatus)?'confirmed':'unknown',requiredAccessoryIds:row.equipmentMetadataAvailable===true?row.requiredAccessoryIds:[],requiredAccessories:row.equipmentMetadataAvailable===true&&Array.isArray(row.requiredAccessoryIds)?row.requiredAccessoryIds.map(id=>({id,name:accessoryById.get(id)??null,nameStatus:accessoryById.has(id)?'catalog-confirmed':'unknown'})):[],variantCatalogStatus:row.variantCatalogStatus??'unknown',requestedVariantStatus:request.actionLibraryId===undefined?'not-requested':row.variantCatalogStatus!=='observed-list'?'unconfirmed':row.actionLibraryVariants?.filter(variant=>variant?.id===request.actionLibraryId).length===1?'observed-exact':'not-observed',actionLibraryVariants:row.variantCatalogStatus==='observed-list'&&Array.isArray(row.actionLibraryVariants)?row.actionLibraryVariants.slice(0,6):[],variantCount:row.actionLibraryVariants?.length??0}))};
  });
  return {categories,muscleGroups,results,observedExerciseCount:exercises.length,ownershipKnown:inventory.ownershipKnown===true,readOnly:true,executableApproval:false,note:'Section and title matching only navigate observed catalogue. Confirm exact groupId/actionLibraryId, accessory requirements and availability before preview; unknown is never no equipment.'};
}
