import {captureRetainedPortableSource} from './retained-portable-source.mjs';
import {archiveRawPortableSource} from './portable-source-adapter.mjs';

// Rebuilds a portable source for a saved template whose reviewed record has no
// retained source (saved before retention or rejected by older v1 bounds).
// Allowed only when the caller proved that the current account template still
// matches the reviewed plan identity (identityStatus === 'matched').
export function reconstructSavedPortableSource({record,identityStatus,templateCode}){
 const flags={writeReady:false,scientificApproval:false,requiresFreshScientificReview:true,originVerified:false};
 const plan=record?.plan;
 if(!plan||typeof plan!=='object'||!Array.isArray(plan.exercises)||!plan.exercises.length)return {...flags,status:'unavailable',reason:'source-not-captured',detail:`Brak lokalnego zapisu planu dla szablonu ${templateCode}; nie ma z czego odtworzyć źródła.`};
 if(identityStatus==='missing')return {...flags,status:'unavailable',reason:'source-not-captured',detail:`Szablon ${templateCode} nie ma zachowanego źródła ani zapisanej tożsamości planu; nie można bezpiecznie odtworzyć źródła.`};
 if(identityStatus!=='matched')return {...flags,status:'unavailable',reason:'saved-template-changed-since-review',detail:`Szablon ${templateCode} na koncie nie zgadza się z zapisanym planem (tożsamość: ${identityStatus??'missing'}); odczytaj i zapisz plan ponownie.`};
 const metadata=new Map(plan.exercises.map(ex=>[ex.id,{batch:{id:ex.id,actionLibraryList:[{id:ex.actionLibraryId}]}}]));
 const candidate=captureRetainedPortableSource(plan,plan,metadata);
 if(candidate.status==='unavailable')return {...flags,status:'unavailable',reason:candidate.reason,detail:candidate.detail??'Nieznana przyczyna.'};
 const {sourceDigest,...body}=candidate;
 return {...archiveRawPortableSource(body.source),referenceClientExecutionCoverage:'none-source-archive-only',...flags,status:'exported-reconstructed-source',origin:'reconstructed-from-saved-template',sourceProvenance:'reconstructed-from-saved-template',sourceDigest,originalPublicPrescription:body.original};
}

