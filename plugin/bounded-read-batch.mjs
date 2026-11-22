// Transport policy must disable automatic session recovery in parallel phase.
// Existing auth-expiry predicate is supplied by the real transport adapter.
export async function boundedReadBatch({operations,parallelScope,serialScope,isExpired,assertCurrent,concurrency=3}){
 if(!Array.isArray(operations)||operations.length>12||!Number.isSafeInteger(concurrency)||concurrency<1||concurrency>3||[parallelScope,serialScope,isExpired,assertCurrent].some(x=>typeof x!=='function'))throw Error('Invalid bounded read capability.');
 const results=new Array(operations.length);let next=0,fatal=null;
 const current=async()=>{try{await assertCurrent();}catch(error){fatal??=error;throw error;}};
 const worker=async()=>{while(!fatal&&next<operations.length){const at=next++;try{await current();}catch{return;}if(fatal)return;let result;try{result={status:'fulfilled',value:await parallelScope(operations[at])};}catch(reason){result={status:'rejected',reason};}try{await current();}catch{return;}results[at]=result;}};
 await Promise.all(Array.from({length:Math.min(concurrency,operations.length)},worker));
 if(fatal)throw fatal;
 // Drain all original requests before any token recovery. A retry reexecutes
 // only a GET-only feed rejected by actual verified expiry, never an arbitrary error.
 for(let i=0;i<results.length;i++)if(results[i].status==='rejected'&&isExpired(results[i].reason)){
  await assertCurrent();try{const value=await serialScope(operations[i]);results[i]={status:'fulfilled',value};}catch(reason){results[i]={status:'rejected',reason};}await assertCurrent();
 }
 await assertCurrent();return results;
}
