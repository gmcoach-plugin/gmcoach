import { boundedCycleDigest } from './bounded-cycle-json.mjs';

export const cycleStyleReviewSchema = {type:'object',additionalProperties:false,required:['scopeDigest','scientificReviewDigest','decision','rationale'],properties:{scientificReviewDigest:{type:'string',pattern:'^[a-f0-9]{64}$'},scopeDigest:{type:'string',pattern:'^[a-f0-9]{64}$'},decision:{const:'reviewed-compatible'},rationale:{type:'string',minLength:1,maxLength:1000}}};
const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 1000;
// Inputs are server-derived canonical cycle facts/profile, never caller summary.
export function deriveCycleStyleScope(profile, facts, bindings) {
 const status = profile?.trainingStyleStatus;
 if (!['specified','coach-choice','declined'].includes(status)) throw Error('Cycle style requires a completed dedicated intake answer.');
 const style = {status,...(status==='specified'?{preferredTrainingStyle:profile.preferredTrainingStyle}:{}),...(status==='coach-choice'?{trainingStyleRationale:profile.trainingStyleRationale}:{})};
 if(status==='specified'&&!text(style.preferredTrainingStyle)||status==='coach-choice'&&!text(style.trainingStyleRationale)) throw Error('Cycle style answer is incomplete.');
 if(!facts||typeof facts.prescriptionDigest!=='string'||!/^[a-f0-9]{64}$/.test(facts.prescriptionDigest)||!Array.isArray(facts.occurrences)||!facts.organization)throw Error('Cycle style requires actual complete cycle facts.');
 if(!bindings||![bindings.intakeDigest,bindings.evidenceDigest,bindings.executionDigest].every(value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)))throw Error('Cycle style requires actual intake/evidence/execution bindings.');
 const scopeDigest=boundedCycleDigest({bindings,style,organization:facts.organization,occurrences:facts.occurrences,prescriptionDigest:facts.prescriptionDigest},8_000_000);
 return {version:1,style,scopeDigest,status:'explicit-review-required',automaticStyleMatch:false,scientificSupportVerified:false,declinedIsDelegation:false};
}
export function assertCycleStyleReview(scope, review, scientificReviewDigest) {
 if(!review||typeof review!=='object'||Array.isArray(review)||Object.keys(review).some(key=>!['scopeDigest','scientificReviewDigest','decision','rationale'].includes(key))||review.scopeDigest!==scope.scopeDigest||review.scientificReviewDigest!==scientificReviewDigest||typeof scientificReviewDigest!=='string'||!/^[a-f0-9]{64}$/.test(scientificReviewDigest)||review.decision!=='reviewed-compatible'||!text(review.rationale)) throw Error('Exact cycle style compatibility review required; review the displayed actual cycle and regenerate after changes.');
 return {scopeDigest:scope.scopeDigest,scientificReviewDigest,decision:review.decision,rationale:review.rationale.trim()};
}
