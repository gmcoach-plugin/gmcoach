const TOPIC_TERMS=Object.freeze({
  hypertrophy:['hypertroph','muscle growth','muscle mass'],
  recovery:['recover','fatigue','sleep'],
  deload:['deload','taper','reduced volume','training break'],
  strength:['strength','one repetition maximum','1rm'],
  muscle_mass:['muscle mass','lean mass','hypertroph'],
  exercise:['']
});
const fold=value=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function findResearchInRetainedBatches({getBatch,now=Date.now,batchIds,topic,terms,termMatch='phrase',category,limit=12}){
  if(typeof getBatch!=='function'||typeof now!=='function'||!Array.isArray(batchIds)||batchIds.length<1||batchIds.length>8||new Set(batchIds).size!==batchIds.length||batchIds.some(id=>typeof id!=='string'||id.length<1||id.length>128)||!Object.hasOwn(TOPIC_TERMS,topic)||terms!==undefined&&(typeof terms!=='string'||terms.length>100)||!['phrase','all_words'].includes(termMatch)||topic==='exercise'&&!terms?.trim()||category!==undefined&&(typeof category!=='string'||category.length>80)||!Number.isSafeInteger(limit)||limit<1||limit>12)throw new Error('Invalid bounded research navigation request.');
  const needles=TOPIC_TERMS[topic].filter(Boolean).map(fold),query=fold(terms?.trim()).replace(/\s+/g,' ');
  const rows=new Map(),coverage=[];
  for(const batchId of batchIds){
    const batch=getBatch(batchId);
    if(!batch||batch.batchId!==batchId||!Number.isFinite(batch.expiresAt)||batch.expiresAt<=now())throw new Error('UNKNOWN_OR_EXPIRED_BATCH');
    if(!Array.isArray(batch.sources)||batch.sources.length>40)throw new Error('INVALID_CANONICAL_BATCH');
    coverage.push({batchId,sourceCount:batch.sources.length});
    for(const source of batch.sources){
      if(!source||typeof source.id!=='string'||!/^pubmed:\d{1,12}$/.test(source.id)||typeof source.title!=='string'||!Array.isArray(source.matchedCategories))throw new Error('INVALID_CANONICAL_BATCH');
      if(category&&!source.matchedCategories.includes(category))continue;
      const title=fold(source.title),abstract=fold(source.abstract),matched=needles.filter(term=>title.includes(term)||abstract.includes(term));
      if(needles.length&&!matched.length)continue;
      const queryMatched=!query||termMatch==='phrase'?(title.includes(query)||abstract.includes(query)):query.split(' ').every(word=>title.includes(word)||abstract.includes(word));
      if(!queryMatched)continue;
      const score=matched.reduce((sum,term)=>sum+(title.includes(term)?3:1),0)+(query?(title.includes(query)?6:3):0);
      const previous=rows.get(source.id);
      if(!previous||score>previous.score)rows.set(source.id,{sourceId:source.id,batchId,title:source.title.slice(0,240),publicationDate:source.publicationDate??null,matchedCategories:source.matchedCategories,matchedTerms:query?[...matched,query]:matched,score,hasAbstract:source.hasAbstract===true});
    }
  }
  const matches=[...rows.values()].sort((a,b)=>b.score-a.score||String(b.publicationDate??'').localeCompare(String(a.publicationDate??''))||a.sourceId.localeCompare(b.sourceId));
  return {topic,terms:terms??null,termMatch,category:category??null,coverage,totalMatches:matches.length,matches:matches.slice(0,limit),readOnly:true,scientificApproval:false,note:'Exact category and lexical navigation within retained batches. No match does not prove lack of evidence; read full selected abstracts and assess each decision.'};
}
