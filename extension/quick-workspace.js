const Q=(key,params)=>QuickText.text(key,params);
const $=id=>document.getElementById(id);
const send=async(type,extra={})=>{const response=await chrome.runtime.sendMessage({type,...extra});if(!response?.ok)throw Object.assign(Error(response?.error||'CONVERSION_FAILED'),{code:response?.code,jobId:response?.jobId});return response;};
const update=(action,payload)=>send('PREFERENCES_UPDATE',{action,payload});

function toFields(o){return {paper:o.paper.mode==='custom'?'custom':o.paper.format,units:'mm',width:o.paper.widthMm||210,height:o.paper.heightMm||297,
  orientation:o.orientation,layout:o.layout,media:o.media,scale:String(o.scale),background:o.printBackground,...o.marginsMm,
  marginPreset:'custom',linked:false,content:o.contentMode,selector:'',ranges:'',headers:false,template:'title-page',headerTemplate:'',
  loading:o.loading.preset,scroll:o.loading.preScroll,fixed:o.hideFixed,navigation:o.hideNavigation,cssPaper:o.preferCSSPageSize,waitForMode:'',waitFor:'',javascript:true};}

export async function mountQuickWorkspace(ctx){
  const params=new URLSearchParams(location.search),quickId=params.get('quick');
  let jobId=quickId||sessionStorage.getItem('pdf-job-id'),sourceUrl='',host='',savedId=null,lastResult=null,lastOptions=null,selecting=false,initial=true,sourceChanged=false,hasAttempt=false,disposed=false;
  let bypass=params.get('defaults')==='1',mode='full',incognito=!!chrome.extension.inIncognitoContext,serial=0,initialized=false;
  const apply=options=>ctx.controls.apply(toFields(options),{rememberChange:false});
  const button=(key,action)=>{const b=document.createElement('button');b.type='button';b.dataset.q=key;b.textContent=Q(key);b.onclick=()=>Promise.resolve().then(action).catch(showError);return b;};
  const panel=document.createElement('section');panel.className='quick-result-options';panel.innerHTML='<div class="quick-source" role="status"></div><div class="quick-task-actions"></div><p class="quick-error" role="alert" hidden></p><div class="quick-recovery"></div><label class="checkbox"><input id="keep-local-pdf" type="checkbox"><span data-q="retain"></span></label><p class="help" id="local-result-status" role="status"></p><p class="help" data-q="retention"></p><div class="quick-history-links"></div><div class="quick-rule-controls"></div><p class="help" id="quick-rule-status" role="status"></p>';
  document.querySelector('.result-card').insertBefore(panel,$('preview-empty'));
  const sourceLabel=panel.querySelector('.quick-source'),errorLabel=panel.querySelector('.quick-error'),recoveries=panel.querySelector('.quick-recovery'),keep=$('keep-local-pdf'),storageStatus=$('local-result-status'),ruleStatus=$('quick-rule-status');
  const errorMessage=error=>({ARTICLE_NOT_FOUND:'articleError',SELECTION_INVALID:'selectionError',LONG_PAGE_LIMIT:'longError',TIMEOUT:'timeoutError',FILE_TOO_LARGE:'sizeError',TASK_BUSY:'busyError',UNSUPPORTED_PAGE:'unsupported',DEBUGGER_BUSY:'debugger',SOURCE_CHANGED:'changed',INTERRUPTED:'interrupted',RULE_LIMIT:'ruleLimit',CANCELLED:'cancelled'})[error?.code||error?.message]||'failed';
  function showError(error){errorLabel.hidden=false;errorLabel.dataset.q=errorMessage(error);errorLabel.textContent=Q(errorLabel.dataset.q);}
  function adjusted(){document.body.classList.remove('quick-mode');$('studio-fields').scrollIntoView({block:'start'});}
  const cancel=button('cancel',()=>ctx.cancel());cancel.hidden=true;
  const skip=button('skip',async()=>{await send('SKIP_PDF_WAIT',{tabId:ctx.target()});skip.hidden=true;ctx.feedback('working',Q('organizing'),Q('skipped'));});skip.hidden=true;
  panel.querySelector('.quick-task-actions').append(cancel,skip,button('adjust',adjusted));
  const historyLink=document.createElement('a');historyLink.href='recent.html';historyLink.dataset.q='recent';historyLink.textContent=Q('recent');panel.querySelector('.quick-history-links').append(historyLink);
  const saveRule=button('saveRule',async()=>{await update('rule',{host,options:lastOptions||ctx.controls.read()});ruleStatus.textContent=Q('ruleSaved')+((lastOptions||ctx.controls.read()).contentMode==='selection'?' '+Q('selectionNote'):'');await showRule();});saveRule.hidden=true;
  const ruleToggle=document.createElement('label');ruleToggle.className='checkbox';ruleToggle.hidden=true;
  const enabled=document.createElement('input');enabled.type='checkbox';const enabledLabel=document.createElement('span');enabledLabel.dataset.q='enabled';ruleToggle.append(enabled,enabledLabel);
  enabled.onchange=()=>update('rule',{host,operation:'toggle',enabled:enabled.checked}).then(showRule).catch(showError);
  const ruleDelete=button('remove',async()=>{await update('rule',{host,operation:'delete'});await showRule();});ruleDelete.hidden=true;
  const ruleView=document.createElement('details');ruleView.hidden=true;const summary=document.createElement('summary');summary.dataset.q='rules';const description=document.createElement('p');ruleView.append(summary,description);
  const defaultButton=button('defaults',async()=>{bypass=true;apply((await GCDPrefs.resolve(host,{bypass:true,mode})).options);await showRule();});
  panel.querySelector('.quick-rule-controls').append(saveRule,ruleToggle,ruleDelete,ruleView,defaultButton);
  async function showRule(){const prefs=await GCDPrefs.read(),rule=prefs.rules[host];ruleToggle.hidden=ruleDelete.hidden=ruleView.hidden=!rule;defaultButton.hidden=!host||ctx.busy();if(rule){enabled.checked=rule.enabled;const o=GCDPrefs.clean(rule.options);description.textContent=host+' · '+QuickText.describe(o);}
    if(rule?.enabled&&!bypass)sourceLabel.textContent=host+' · '+Q('ruleApplied',{mode:Q(rule.options.contentMode==='article'?'body':'full')});else sourceLabel.textContent=host;
  }
  async function migrate(){const prefs=await GCDPrefs.read();if(prefs.migrated)return prefs;
    const parse=key=>{try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}};
    const presets=parse('gcd-layout-presets-v3');
    return (await update('migrate',{legacy:{rules:parse('gcd-site-layout-rules-v1'),recent:parse('gcd-layout-recent-v2'),defaultOptions:presets?.presets?.[presets.defaultPreset]}})).prefs;
  }
  const prefs=await migrate();keep.checked=prefs.retain!==false&&!incognito;keep.disabled=incognito;
  const engine=$('engine-note'),notice=document.querySelector('.local-explanation p:last-child');
  if(engine){window.GCD_I18N?.untrack(engine);engine.dataset.q='localEngine';engine.textContent=Q('localEngine');}
  if(notice){window.GCD_I18N?.untrack(notice);notice.dataset.q='localNotice';notice.textContent=Q('localNotice');}
  storageStatus.dataset.q=incognito?'private':'unsaved';storageStatus.textContent=Q(storageStatus.dataset.q);
  if(prefs.migrationWarnings)ruleStatus.textContent=Q('migration');
  keep.onchange=async()=>{try{
    if(!keep.checked){if(savedId){await GCDHistory.remove(savedId);if(jobId)chrome.runtime.sendMessage({type:'QUICK_JOB_RESULT',jobId,resultId:''}).catch(()=>{});savedId=null;}storageStatus.dataset.q='unsaved';storageStatus.textContent=Q(storageStatus.dataset.q);}
    else if(lastResult&&!savedId)await persist(lastResult,lastOptions);
  }catch{storageStatus.dataset.q='storageError';storageStatus.textContent=Q(storageStatus.dataset.q);}};
  async function persist(result,options){
    if(incognito||!keep.checked){storageStatus.dataset.q=incognito?'private':'unsaved';storageStatus.textContent=Q(storageStatus.dataset.q);return;}
    try{const id=await GCDHistory.save({blob:result.blob,pages:result.pages,name:ConversionOptions.filename($('pdf-filename').value),host,options});
      // A checkbox change during the IndexedDB write must not leave a retained file.
      if(!keep.checked||disposed){if(id)await GCDHistory.remove(id);storageStatus.dataset.q='unsaved';storageStatus.textContent=Q(storageStatus.dataset.q);return;}
      savedId=id;sessionStorage.setItem('pdf-result-id',id);storageStatus.dataset.q='retained';storageStatus.textContent=Q(storageStatus.dataset.q);
      // 让弹窗也能打开/下载这份结果：把历史 id 回写到任务上（只存 id，不存 PDF）
      if(jobId)chrome.runtime.sendMessage({type:'QUICK_JOB_RESULT',jobId,resultId:id,name:ConversionOptions.filename($('pdf-filename').value)}).catch(()=>{});
    }catch{storageStatus.dataset.q='storageError';storageStatus.textContent=Q(storageStatus.dataset.q);}
  }
  async function source(){const version=++serial;if(ctx.busy())return;
    let tab;try{tab=await chrome.tabs.get(ctx.target());}catch{sourceChanged=true;return;}
    if(version!==serial)return;
    incognito=!!chrome.extension.inIncognitoContext||!!tab.incognito;
    keep.disabled=incognito;historyLink.hidden=incognito;
    if(incognito){keep.checked=false;storageStatus.dataset.q='private';storageStatus.textContent=Q(storageStatus.dataset.q);}
    if(quickId&&sourceUrl&&sourceUrl!==tab.url){sourceChanged=true;showError({code:'SOURCE_CHANGED'});return;}
    if(sourceUrl===tab.url&&!initial)return;
    if(sourceUrl&&sourceUrl!==tab.url&&!quickId){jobId=null;sessionStorage.removeItem('pdf-job-id');}
    const sameHost=!initial&&host===GCDPrefs.hostname(tab.url);
    initial=false;sourceUrl=tab.url;host=GCDPrefs.hostname(tab.url);
    if(!host)return;
    if(sameHost&&!quickId){await showRule();return;}
    const resolved=await GCDPrefs.resolve(host,{bypass,mode});if(version!==serial)return;
    apply(resolved.options);await showRule();
  }
  const sourceEvent=()=>{if(initialized)source().catch(showError);};window.addEventListener('gcd:extension-source',sourceEvent);
  await ctx.firstTarget;
  if(quickId){
    document.body.classList.add('quick-mode');
    try{const reply=await send('CLAIM_QUICK_PDF',{jobId,tabId:ctx.target()});mode=reply.job.mode;bypass=reply.job.bypass;
      await source();
      if(reply.start){setTimeout(()=>{if(mode==='selection'){selecting=true;window.dispatchEvent(new Event('gcd:pick-content'));}else ctx.submit();},0);}
      else{sourceUrl=reply.job.sourceUrl;restoreStatus(reply.job);}
    }catch(exception){showError(exception);ctx.feedback('stopped',Q('interrupted'),Q('retry'));}
  }else {await source();if(jobId)try{restoreStatus((await send('PDF_JOB_STATUS',{jobId,tabId:ctx.target()})).job);}catch{jobId=null;sessionStorage.removeItem('pdf-job-id');}}
  initialized=true;
  if(!incognito)GCDHistory.list().catch(()=>{});
  QuickText.render(panel);
  const legacyRule=document.querySelector('.site-rule-row');if(legacyRule)legacyRule.hidden=true;
  // Explicit preset selection/default changes are shared with subsequent quick saves.
  document.addEventListener('click',event=>{const el=event.target.closest('[data-default],[data-last],[data-delete]');if(!el)return;queueMicrotask(()=>{try{const saved=JSON.parse(localStorage.getItem('gcd-layout-presets-v3')||'null');update('default',{options:saved?.presets?.[saved.defaultPreset]?GCDPrefs.legacy(saved.presets[saved.defaultPreset]):null}).catch(showError);}catch(e){showError(e);}});});
  function restoreStatus(job){if(job.state==='success'){ctx.feedback('idle',Q('resultClosed'),Q('recent'));const id=sessionStorage.getItem('pdf-result-id');if(id)historyLink.href='recent.html?result='+encodeURIComponent(id);}else{ctx.feedback('stopped',Q('interrupted'),Q('retry'));showError({code:'INTERRUPTED'});}}
  return {
    async before(){await source();ctx.controls.read();if((await GCDPrefs.read()).retain===false)keep.checked=false;if(quickId&&sourceChanged)throw Object.assign(Error(Q('changed')),{code:'SOURCE_CHANGED'});
      if(!jobId)jobId=(await send('CREATE_PDF_JOB',{tabId:ctx.target()})).job.id;
      sessionStorage.setItem('pdf-job-id',jobId);sessionStorage.removeItem('pdf-result-id');
      lastResult=null;lastOptions=null;savedId=null;errorLabel.hidden=true;recoveries.replaceChildren();saveRule.hidden=true;cancel.hidden=false;skip.hidden=true;defaultButton.hidden=true;hasAttempt=true;
    },
    async run(options,signal){
      const printTarget=ctx.target();let reply;
      try{reply=await send('RUN_PDF_JOB',{tabId:printTarget,jobId,options});jobId=reply.jobId;signal.throwIfAborted();return reply;}
      catch(error){if(error.jobId)jobId=error.jobId;throw error;}
    },
    async success(result,options){lastResult=result;lastOptions=options;cancel.hidden=skip.hidden=true;saveRule.hidden=!host;defaultButton.hidden=false;await update('recent',{options}).catch(()=>{});await persist(result,options);},
    failure(error){cancel.hidden=skip.hidden=true;defaultButton.hidden=false;showError(error);recoveries.replaceChildren();const code=error.code||'CONVERSION_FAILED';
      const retry=(key,patch)=>recoveries.append(button(key,()=>{if(ctx.busy())return;ctx.controls.apply(patch||{});ctx.submit();}));
      if(code==='ARTICLE_NOT_FOUND')retry('full',{content:'full'});
      else if(code==='LONG_PAGE_LIMIT')retry('paged',{layout:'paged'});
      else if(code==='TIMEOUT')retry('fast',{scroll:false,loading:'fast',waitFor:'',waitForMode:''});
      else if(code==='SELECTION_INVALID'||code==='FILE_TOO_LARGE')recoveries.append(button('select',()=>{selecting=true;window.dispatchEvent(new Event('gcd:pick-content'));}));
      else if(code==='SOURCE_CHANGED')recoveries.append(button('adjust',()=>{location.href='workspace.html';}));
      else retry('retry');
      recoveries.append(button('adjust',adjusted));
    },
    stage(stage){skip.hidden=!['scrolling','resources'].includes(stage);const label={scrolling:'loading',resources:'loading',article:'organizing',organizing:'organizing',printing:'printing',preparing:'preparing'}[stage];if(label)ctx.feedback('working',Q(label),Q('once'));},
    async selection(value){if(selecting&&value.mode==='select'&&value.selector){selecting=false;const own=await chrome.tabs.getCurrent();await chrome.tabs.update(own.id,{active:true});ctx.submit();}},
    disposed(){disposed=true;if(hasAttempt&&ctx.busy())ctx.cancel();if(selecting)send('CANCEL_PRINT',{tabId:ctx.target()}).catch(()=>{});},
    sourceType(value){panel.hidden=value!=='web';if(engine){if(value==='web'){engine.dataset.q='localEngine';engine.textContent=Q('localEngine');}else delete engine.dataset.q;}}
  };
}
