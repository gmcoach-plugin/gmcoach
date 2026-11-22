import { createHash } from 'node:crypto';
import { GuardBlockedError, overrideAuthorizes, userOverrideContext } from './user-override.mjs';

// 687: czat powtarzał ten sam podgląd bez preferenceReviews (157× w logu 686). Drugi raz ten sam zakres → osobny kod z gotowym przykładem.
const requestedPreferenceScopes = new Map();
const PREFERENCE_LOOP_WINDOW_MS = 30 * 60_000;
export function preferenceReviewExample(requiredPreferenceReviews) {
  return requiredPreferenceReviews.map(item => ({ scopeDigest: item.scopeDigest, field: item.field, decision: 'reviewed-compatible', rationale: 'Krótko: dlaczego plan jest zgodny z tą preferencją.', ...(item.userAnswerRequired ? { userConfirmed: true } : {}) }));
}
function repeatedPreferenceScope(requiredPreferenceReviews, now = Date.now()) {
  const key = requiredPreferenceReviews.map(item => item.field + ':' + item.scopeDigest).sort().join('|');
  for (const [k, at] of requestedPreferenceScopes) if (now - at > PREFERENCE_LOOP_WINDOW_MS) requestedPreferenceScopes.delete(k);
  const repeated = requestedPreferenceScopes.has(key);
  requestedPreferenceScopes.set(key, now);
  if (requestedPreferenceScopes.size > 500) requestedPreferenceScopes.delete(requestedPreferenceScopes.keys().next().value);
  return repeated;
}

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fields = ['bodyweightPreference', 'absPreference', 'obliquesPreference', 'exercisePreferences', 'exerciseRestrictions', 'resistanceModePreferences', 'supersetPreferences'];
const label = value => typeof value === 'string' ? value.trim().toLocaleLowerCase('en-US') : '';
// Exact anatomy labels only. A different primary muscle does not exclude
// secondary abdominal work. Exercise titles/category-derived kind are never used.
const abdomen = new Set(['abdominals', 'rectus abdominis']);
const obliques = new Set(['obliques', 'external oblique', 'internal oblique']);

export const preferenceReviewsSchema = { type: 'array', maxItems: 94, items: { type: 'object', additionalProperties: false, required: ['scopeDigest','field','decision','rationale'], properties: {
  scopeDigest: {type:'string',pattern:'^[a-f0-9]{64}$'},field:{type:'string',enum:fields},decision:{const:'reviewed-compatible'},rationale:{type:'string',minLength:1,maxLength:500},userConfirmed:{type:'boolean',description:'Required true for ask; attests an actual scoped user answer, never an assistant assumption.'}
}}};
/** Cycle-level confirmation: one review per field applies to every cycle session. Contradictions still block. */
export const cyclePreferenceReviewsSchema = { type: 'array', maxItems: 7, description: 'Potwierdzenie raz na poziomie cyklu (bez scopeDigest) obowiązuje dla wszystkich sesji cyklu. Dla ask wymaga userConfirmed=true.', items: { type: 'object', additionalProperties: false, required: ['field','decision','rationale'], properties: { field:{type:'string',enum:fields},decision:{const:'reviewed-compatible'},rationale:{type:'string',minLength:1,maxLength:500},userConfirmed:{type:'boolean'} } } };
export function normalizeCyclePreferenceReviews(value) {
  if(value===undefined||value===null)return [];
  if(!Array.isArray(value)||value.length>7)throw Error('Invalid cycle preference reviews.');
  const seen=new Set();
  return value.map(item=>{
    if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(key=>!['field','decision','rationale','userConfirmed'].includes(key))||!fields.includes(item.field)||seen.has(item.field)||item.decision!=='reviewed-compatible'||typeof item.rationale!=='string'||!item.rationale.trim()||item.rationale.length>500||(item.userConfirmed!==undefined&&typeof item.userConfirmed!=='boolean'))throw Error('Invalid cycle preference review.');
    seen.add(item.field);
    return {field:item.field,decision:item.decision,rationale:item.rationale.trim(),...(item.userConfirmed===undefined?{}:{userConfirmed:item.userConfirmed})};
  });
}
export function normalizePreferenceReviews(value) {
  if(value===undefined)return [];
  if(!Array.isArray(value)||value.length>94)throw Error('Invalid preference reviews.');
  return value.map(item=>{
    if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(key=>!['scopeDigest','field','decision','rationale','userConfirmed'].includes(key))||!fields.includes(item.field)||!/^[a-f0-9]{64}$/.test(item.scopeDigest)||item.decision!=='reviewed-compatible'||typeof item.rationale!=='string'||!item.rationale.trim()||item.rationale.length>500||(item.userConfirmed!==undefined&&typeof item.userConfirmed!=='boolean'))throw Error('Invalid scoped preference review.');
    return {scopeDigest:item.scopeDigest,field:item.field,decision:item.decision,rationale:item.rationale.trim(),...(item.userConfirmed===undefined?{}:{userConfirmed:item.userConfirmed})};
  });
}

/** Shared scope for single-session preview and cycle preparation: prescription, rules and catalog only. Science evidence is excluded because cycle paths expand decisionEvidence differently. */
export function preferenceScopeContext(plan,rules,catalogObservations){
  return {rules,exercises:plan.exercises,supersetBlocks:plan.supersetBlocks??[],warmup:plan.warmup??null,postWorkoutStretching:plan.postWorkoutStretching??null,catalogObservations};
}
export function assessPreferenceCompliance(plan, profile = {}, records = new Map()) {
  const rules = Object.fromEntries(fields.filter(key => profile[key] !== undefined).map(key => [key, profile[key]]));
  const checks = [];
  for (const [index, exercise] of plan.exercises.entries()) {
    const record = records.get(exercise.id);
    const primary = record?.mainMuscleGroupStatus === 'available' ? label(record.mainMuscleGroupName) : '';
    for (const field of ['bodyweightPreference', 'absPreference', 'obliquesPreference']) {
      if (profile[field] !== 'no' && profile[field] !== 'ask') continue;
      // Current catalog has no authoritative bodyweight classification. A plan's
      // supplied loadType is a prescription, not independently observed metadata.
      const confirmed = field === 'bodyweightPreference' ? exercise.section !== 'warmup' && exercise.section !== 'stretching' && exercise.loadType === 'bodyweight'
        : field === 'absPreference' ? abdomen.has(primary) || obliques.has(primary)
        : field === 'obliquesPreference' ? obliques.has(primary) : false;
      checks.push({ exerciseIndex: index, exerciseId: exercise.id, actionLibraryId: exercise.actionLibraryId,
        field, requested: profile[field], status: confirmed && profile[field] === 'no' ? 'confirmed-contradiction' : 'unresolved-review-required',
        metadataScope: field === 'bodyweightPreference' && confirmed ? 'selected-main-work-execution-path' : primary ? 'reported-primary-muscle-only' : 'classification-unavailable',
        ...(primary ? { reportedPrimaryMuscle: record.mainMuscleGroupName } : {}),
        limitation: field === 'bodyweightPreference' ? 'Main-section bodyweight loadType is the selected execution prescription; other execution paths do not prove catalog classification.' : 'Primary muscle metadata cannot rule out secondary work; no title inference was made.' });
    }
  }
  const reviews = ['exercisePreferences', 'exerciseRestrictions', 'resistanceModePreferences', 'supersetPreferences']
    .filter(field => typeof profile[field] === 'string' && profile[field].trim())
    .map(field => ({ field, requested: profile[field], status: 'unresolved-review-required',
      scope: field === 'resistanceModePreferences' ? 'each-executed-set-resistance-mode' : field === 'supersetPreferences' ? 'superset-organization' : 'each-exercise-occurrence',
      limitation: 'Free text is not machine-interpreted or certified by research citations. Review it against the displayed prescription before approval.' }));
  const supplied=normalizePreferenceReviews(plan.preferenceReviews);
  const cycleReviews=normalizeCyclePreferenceReviews(plan.cyclePreferenceReviews);
  const catalogObservations=plan.exercises.map((exercise,index)=>{
    const record=records.get(exercise.id);
    return {exerciseIndex:index,exerciseId:exercise.id,actionLibraryId:exercise.actionLibraryId,
      mainMuscleGroupStatus:record?.mainMuscleGroupStatus??'missing',
      mainMuscleGroupName:typeof record?.mainMuscleGroupName==='string'?record.mainMuscleGroupName:null};
  });
  const context=preferenceScopeContext(plan,rules,catalogObservations);
  const used=new Set();
  for(const item of [...checks,...reviews]) {
    // Bind the observed classification and interpretation before review mutation.
    item.scopeDigest=hash({context,field:item.field,exerciseIndex:item.exerciseIndex??null,
      metadataScope:item.metadataScope??null,limitation:item.limitation,status:item.status,scope:item.scope??null});
    const matching=supplied.filter(review=>review.scopeDigest===item.scopeDigest&&review.field===item.field);
    if(matching.length>1)throw Error('Duplicate scoped preference review.');
    if(matching.length&&item.status!=='confirmed-contradiction'){
      const review=matching[0];if(item.requested==='ask'&&review.userConfirmed!==true)throw Error('Preference ask requires an actual scoped user answer with userConfirmed=true.');
      item.status='explicitly-reviewed-compatible';item.review=review;used.add(review);
    } else if(item.status==='unresolved-review-required'){
      const cycleReview=cycleReviews.find(review=>review.field===item.field);
      if(cycleReview){if(item.requested==='ask'&&cycleReview.userConfirmed!==true)throw Error('Preference ask requires an actual user answer with userConfirmed=true.');item.status='explicitly-reviewed-compatible';item.review={...cycleReview,scope:'cycle'};}
    }
  }
  // Stale/unneeded session reviews are ignored with a notice; unresolved items and contradictions still gate approval.
  const notices=supplied.filter(review=>!used.has(review)).map(review=>({code:'preference-review-ignored',field:review.field,scopeDigest:review.scopeDigest,message:'Session preference review did not match the current server-derived scope (stale or unneeded) and was ignored; server-derived compliance or cyclePreferenceReviews apply.'}));
  const result = { version: 1, status: checks.some(item => item.status === 'confirmed-contradiction') ? 'blocked' : [...checks,...reviews].some(item=>item.status==='unresolved-review-required') ? 'unresolved-review-required' : checks.length || reviews.length ? 'explicitly-reviewed' : 'no-restrictive-rules',
    rulesDigest: hash(rules), prescriptionDigest: hash({ exercises: plan.exercises, supersetBlocks: plan.supersetBlocks ?? [], warmup: plan.warmup ?? null, postWorkoutStretching: plan.postWorkoutStretching ?? null }), evidenceDigest: hash({evidence:plan.evidence,decisionEvidence:plan.decisionEvidence}), catalogObservationsDigest:hash(catalogObservations), checks, reviews,
    ...(notices.length?{notices}:{}), scientificSupportVerified: false, preferenceComplianceVerified: checks.length === 0 && reviews.length === 0,
    bodyweightExclusionScope:'main-work-execution-path; incidental warmup/stretching remains outside this exclusion check',
    abdominalExclusionScope:'dedicated work positively identified by reported primary muscle; not incidental stabilization or absence of secondary activation' };
  result.assessmentDigest = hash(result);
  return result;
}

export function assertPreferenceCompliance(assessment) {
  if (assessment.status === 'blocked') {
    const failed = assessment.checks.filter(item => item.status === 'confirmed-contradiction');
    // Diagnostics expose bounded interpretation only; exact API labels remain
    // bound by catalogObservationsDigest and must not inflate an error response.
    throw new Error(`Plan conflicts with explicit exercise exclusions: ${failed.map(item => `exercise ${item.exerciseIndex + 1}: ${item.field}=no (${item.metadataScope})`).join('; ')}. Revise the plan; scientific citations do not override user exclusions.`);
  }
  if(assessment.status==='unresolved-review-required'){const requiredPreferenceReviews=[...assessment.checks,...assessment.reviews].filter(item=>item.status==='unresolved-review-required').map(item=>({field:item.field,exerciseIndex:item.exerciseIndex??null,scopeDigest:item.scopeDigest,userAnswerRequired:item.requested==='ask'}));const message=`Scoped preference review required before approval: ${JSON.stringify(requiredPreferenceReviews)}. Supply preferenceReviews only after explicit compatibility review; ask needs the user's scoped answer. In a cycle confirm once per field via cyclePreferenceReviews (sealed draft: speediance_set_training_cycle_preference_reviews); it applies to all sessions.`;if(userOverrideContext.getStore()?.tool==='speediance_preview_saved_program_update'&&repeatedPreferenceScope(requiredPreferenceReviews)&&!overrideAuthorizes('preference_compliance')){const example=preferenceReviewExample(requiredPreferenceReviews);throw Object.assign(new GuardBlockedError('preference_review_loop',`${message} [preference_review_loop] Ten sam zakres (scopeDigest) wrócił bez ocen — nie powtarzaj wywołania bez zmian. Dodaj do argumentów dokładnie: "preferenceReviews":${JSON.stringify(example)}${requiredPreferenceReviews.some(item=>item.userAnswerRequired)?' (userConfirmed=true tylko po faktycznej odpowiedzi użytkownika na pytanie o tę preferencję)':''}.`),{guardDetails:{requiredPreferenceReviews,preferenceReviewsExample:example}});}throw Object.assign(Error(message),{guardDetails:{requiredPreferenceReviews,preferenceReviewsExample:preferenceReviewExample(requiredPreferenceReviews)}});}
}
