// Worker-owned task metadata. PDF payloads are returned only to the owning workspace.
const QuickJobs=(()=>{
  const prefix='pdf-job:',active=new Set(['queued','selecting','preparing','loading','organizing','printing']),running=new Map();
  let serial=Promise.resolve();
  const key=id=>prefix+id;
  const read=async id=>(await SessionStore.get(key(id)))[key(id)];
  const write=async job=>{await SessionStore.set({[key(job.id)]:job});return job;};
  const queue=fn=>{const next=serial.then(fn);serial=next.catch(()=>{});return next;};
  // Read-modify-write transitions share one queue: a late progress event cannot
  // overwrite cancellation or success with an older active state.
  let transitions=Promise.resolve();
  const change=(id,fn)=>{const next=transitions.then(async()=>{const job=await read(id);return job?write(fn(job)):null;});transitions=next.catch(()=>{});return next;};
  const ready=(async()=>{
    const all=await SessionStore.get(null);
    for(const [name,job] of Object.entries(all))if(name.startsWith(prefix)){
      if(Date.now()-job.createdAt>86400000){await SessionStore.remove(name);continue;}
      if(active.has(job.state)&&!['queued','selecting'].includes(job.state)){
        await chrome.debugger?.detach({tabId:job.sourceTabId}).catch(()=>{});
        await prepareTab(job.sourceTabId,{},'restore').catch(()=>{});
        await undoHidden(job.sourceTabId,true).catch(()=>{});
        await write({...job,state:'interrupted',code:'INTERRUPTED'});
      }
    }
  })();
  function errorCode(error){const text=String(error?.message||error);return error?.code||
    (/cancelled|canceled/i.test(text)?'CANCELLED':/already attached|another debugger|DevTools/i.test(text)?'DEBUGGER_BUSY':
    /5,000 mm|long.page limit/i.test(text)?'LONG_PAGE_LIMIT':/40 MB|result limit/i.test(text)?'FILE_TOO_LARGE':
    /article/i.test(text)?'ARTICLE_NOT_FOUND':/selector|selected|selection/i.test(text)?'SELECTION_INVALID':
    /No tab|closed|navigat|frame.*removed/i.test(text)?'SOURCE_CHANGED':/time|timeout/i.test(text)?'TIMEOUT':'CONVERSION_FAILED');}
  async function source(tabId){const tab=await chrome.tabs.get(tabId);if(!ExtensionSource.supported(tab))throw Object.assign(Error('Unsupported page'),{code:'UNSUPPORTED_PAGE'});return tab;}
  async function open(msg){await ready;return queue(async()=>{
    const tab=await source(msg.tabId),all=await SessionStore.get(null);
    for(const [name,job] of Object.entries(all))if(name.startsWith(prefix)&&job.sourceTabId===tab.id&&active.has(job.state)&&job.ownerTabId){
      try{const owner=await chrome.tabs.get(job.ownerTabId);if(owner.url?.startsWith(chrome.runtime.getURL('workspace.html'))){await chrome.tabs.update(owner.id,{active:true});return {jobId:job.id};}}catch{}
    }
    const id=crypto.randomUUID();
    const job=await write({id,sourceTabId:tab.id,sourceUrl:tab.url,ownerTabId:null,state:'queued',createdAt:Date.now(),mode:['article','selection'].includes(msg.mode)?msg.mode:'full',bypass:!!msg.bypass});
    const owner=await chrome.tabs.create({windowId:tab.windowId,url:chrome.runtime.getURL('workspace.html')+'?tabId='+tab.id+'&quick='+id});
    await write({...job,ownerTabId:owner.id});return {jobId:id};
  });}
  async function owned(msg,sender){await ready;await serial;let job=await read(msg.jobId);if(!job||job.ownerTabId!==sender.tab?.id||job.sourceTabId!==msg.tabId)throw Object.assign(Error('Task unavailable'),{code:'INTERRUPTED'});return job;}
  async function status(msg,sender){const job=await owned(msg,sender);return {job};}
  async function claim(msg,sender){await owned(msg,sender);let start=false;const job=await change(msg.jobId,job=>{start=job.state==='queued';return start?{...job,state:'selecting'}:job;});return {job,start};}
  async function authorize(tabId,owner){await ready;const all=await SessionStore.get(null);if(Object.entries(all).some(([name,job])=>name.startsWith(prefix)&&job.sourceTabId===tabId&&active.has(job.state)&&job.ownerTabId!==owner))throw Object.assign(Error('Task already running'),{code:'TASK_BUSY'});}
  async function create(msg,sender){await ready;return queue(async()=>{await authorize(msg.tabId,sender.tab.id);const tab=await source(msg.tabId);const job=await write({id:crypto.randomUUID(),sourceTabId:tab.id,sourceUrl:tab.url,ownerTabId:sender.tab.id,createdAt:Date.now(),state:'selecting'});return {job};});}
  async function run(msg,sender){await ready;
    let job=msg.jobId?await owned(msg,sender):null;
    const tab=await source(msg.tabId);
    await authorize(tab.id,sender.tab.id);
    if(job&&job.sourceUrl!==tab.url)throw Object.assign(Error('Source changed'),{code:'SOURCE_CHANGED'});
    if(running.has(tab.id)||printingTabs.has(tab.id))throw Object.assign(Error('Task already running'),{code:'TASK_BUSY'});
    if(job&&active.has(job.state)&&!['queued','selecting'].includes(job.state))throw Object.assign(Error('Task interrupted'),{code:'INTERRUPTED'});
    if(!job)job={id:crypto.randomUUID(),sourceTabId:tab.id,sourceUrl:tab.url,ownerTabId:sender.tab.id,createdAt:Date.now()};
    // Lock synchronously, before the first storage write.
    running.set(tab.id,job.id);
    try{
      await write({...job,state:'preparing',code:null});
      await SessionStore.set({['cleanup-owner:'+sender.tab.id+':'+tab.id]:true});
      const result=await printTab(tab.id,msg.options);
      const latest=await read(job.id);
      if(!latest||['cancelled','interrupted'].includes(latest.state))throw Object.assign(Error('Task interrupted'),{code:latest?.code||'CANCELLED'});
      const current=await source(tab.id);if(current.url!==job.sourceUrl)throw Object.assign(Error('Source changed'),{code:'SOURCE_CHANGED'});
      const finished=await change(job.id,current=>active.has(current.state)?{...current,state:result.manual?'interrupted':'success',code:result.manual?'MANUAL_PRINT':null}:current);
      if(finished.state!=='success'&&!result.manual)throw Object.assign(Error('Task interrupted'),{code:finished.code||'CANCELLED'});
      return {...result,jobId:job.id};
    }catch(error){
      const latest=await read(job.id),code=latest?.code||errorCode(error);
      await change(job.id,current=>({...current,state:code==='CANCELLED'?'cancelled':code==='SOURCE_CHANGED'?'interrupted':'failed',code}));
      throw Object.assign(error,{code,jobId:job.id});
    }finally{running.delete(tab.id);await SessionStore.remove('cleanup-owner:'+sender.tab.id+':'+tab.id);}
  }
  async function progress(tabId,stage){const id=running.get(tabId);if(!id)return;await change(id,job=>active.has(job.state)?{...job,state:({scrolling:'loading',resources:'loading',organizing:'organizing',article:'organizing',printing:'printing'})[stage]||'preparing',stage}:job);}
  async function stop(tabId,code='CANCELLED'){
    await ready;
    const all=await SessionStore.get(null);
    const matches=Object.entries(all).filter(([name,job])=>name.startsWith(prefix)&&job.sourceTabId===tabId&&active.has(job.state));
    if(!matches.length&&!printingTabs.has(tabId))return;
    for(const [name,job] of matches)await change(job.id,current=>active.has(current.state)?{...current,state:code==='CANCELLED'?'cancelled':'interrupted',code}:current);
    await cancelPrintTab(tabId).catch(()=>{});
    await undoHidden(tabId,true).catch(()=>{});
  }
  async function interruptOwner(tabId){await ready;const all=await SessionStore.get(null);for(const [name,job] of Object.entries(all))if(name.startsWith(prefix)&&job.ownerTabId===tabId&&active.has(job.state))await stop(job.sourceTabId,'INTERRUPTED');}
  // Popup status mirror: read-only view of the newest task for one source tab.
  // Only non-sensitive metadata leaves the worker — never the PDF payload itself.
  async function lookup(tabId){await ready;const all=await SessionStore.get(null);let found=null;
    for(const [name,job] of Object.entries(all))if(name.startsWith(prefix)&&job.sourceTabId===tabId&&job.ownerTabId&&(!found||job.createdAt>found.createdAt))found=job;
    return found?{id:found.id,state:found.state,code:found.code||null,mode:found.mode||'full',sourceTabId:found.sourceTabId,ownerTabId:found.ownerTabId,resultId:found.resultId||null,createdAt:found.createdAt}:null;}
  // The owning workspace publishes the retained history id so the popup can offer open/download.
  async function publish(msg,sender){await ready;const job=await read(msg.jobId);if(!job||job.ownerTabId!==sender.tab?.id)throw Object.assign(Error('Task unavailable'),{code:'INTERRUPTED'});
    const resultId=String(msg.resultId||'').slice(0,64);
    return write({...job,resultId:resultId||null,resultName:resultId?String(msg.name||'').slice(0,120):null});}
  return {open,status,claim,create,authorize,run,progress,stop,interruptOwner,lookup,publish,errorCode};
})();
chrome.tabs.onUpdated.addListener((id,change)=>{if(change.status==='loading'||change.url)QuickJobs.stop(id,'SOURCE_CHANGED').catch(()=>{});});
chrome.tabs.onRemoved.addListener(id=>{QuickJobs.stop(id,'SOURCE_CHANGED').catch(()=>{});QuickJobs.interruptOwner(id).catch(()=>{});});
