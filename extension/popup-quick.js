// Capture the source once: activating another tab must not retarget this action.
// 弹窗主流程：一个主操作 + 两个次级操作 + 第三层「调整后导出」+ 文字入口，
// 并把后台任务状态回显到弹窗（进行中禁用主按钮，成功后可直接打开/下载）。
(async()=>{
  const $=id=>document.getElementById(id),Q=key=>QuickText.text(key);
  const firefox=location.protocol==='moz-extension:';
  const main=$('task-web'),label=main.querySelector('span');
  const strip=document.createElement('section');strip.className='quick-popup';
  document.querySelector('.task-map').before(strip);strip.append(main);
  const SVG='http://www.w3.org/2000/svg';
  const ICONS={
    article:'<rect x="4" y="3.5" width="16" height="17" rx="2.5"/><path d="M8 8.5h8M8 12.5h8M8 16.5h4"/>',
    select:'<rect x="3.5" y="3.5" width="17" height="17" rx="2.5" stroke-dasharray="3.5 3"/><path d="M8.5 13.5l3 3 4.5-7"/>',
    adjust:'<path d="M4 7h9M19 7h1M4 17h1M11 17h9"/><circle cx="16" cy="7" r="2.2"/><circle cx="8" cy="17" r="2.2"/>',
    more:'<rect x="3.5" y="3.5" width="6" height="6" rx="1.5"/><rect x="14.5" y="3.5" width="6" height="6" rx="1.5"/><rect x="3.5" y="14.5" width="6" height="6" rx="1.5"/><rect x="14.5" y="14.5" width="6" height="6" rx="1.5"/>',
    recent:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'
  };
  const svgOf=markup=>{const el=document.createElementNS(SVG,'svg');el.setAttribute('viewBox','0 0 24 24');el.setAttribute('aria-hidden','true');el.innerHTML=markup;return el;};
  const button=(id,key,cls,icon,action)=>{const b=document.createElement('button');b.type='button';if(id)b.id=id;b.className=cls||'btn';
    if(icon)b.append(svgOf(icon));const span=document.createElement('span');span.dataset.q=key;span.textContent=Q(key);b.append(span);
    b.onclick=()=>Promise.resolve().then(action).catch(()=>{$('popup-source-note').textContent=Q('failed');});return b;};
  const navigation=b=>{b.classList.add('quick-navigation');const arrow=svgOf('<path d="m9 5 7 7-7 7"/>');arrow.classList.add('quick-chevron');b.append(arrow);return b;};
  let source,bypass=false;
  const open=async mode=>{if(!ExtensionSource.supported(source))return;const result=await chrome.runtime.sendMessage({type:'OPEN_QUICK_PDF',tabId:source.id,mode,bypass});if(!result?.ok)throw Error(result?.error);await startPoll();};
  if(!firefox){label.removeAttribute('data-i18n');window.GCD_I18N?.untrack(label);label.dataset.q='save';main.onclick=()=>open('full').catch(()=>{$('popup-source-note').textContent=Q('failed');});}
  main.classList.add('primary');
  // 次级：两个等宽描边按钮，带图标
  const secondary=document.createElement('div');secondary.className='quick-secondary';strip.append(secondary);
  const article=button('quick-article','article','btn',ICONS.article,()=>open('article'));
  const select=button('quick-select','select','btn',ICONS.select,()=>open('selection'));
  secondary.append(article,select);
  article.hidden=select.hidden=firefox;article.disabled=select.disabled=true;
  // 第三层：调整后导出（弱化）
  const adjust=button('quick-adjust','adjust','btn block',ICONS.adjust,()=>chrome.tabs.create({url:chrome.runtime.getURL('workspace.html')+'?tabId='+(source?.id||'')}));
  strip.append(navigation(adjust));
  // 状态回显区
  const statusBox=document.createElement('div');statusBox.id='quick-status';statusBox.className='quick-status';statusBox.setAttribute('role','status');statusBox.hidden=true;
  const statusText=document.createElement('p');statusText.className='quick-status-text';
  const statusActions=document.createElement('div');statusActions.className='quick-status-actions';
  statusBox.append(statusText,statusActions);strip.append(statusBox);
  // 底部文字入口：最近结果（独立入口） + 更多工具
  const links=document.createElement('div');links.className='quick-links';strip.append(links);
  const recent=button('quick-recent','recent','btn sm',ICONS.recent,()=>chrome.tabs.create({url:chrome.runtime.getURL('recent.html')}));
  const more=button('quick-more','more','btn sm',ICONS.more,()=>{document.body.classList.add('show-more');$('show-tasks').classList.remove('hidden');});
  more.setAttribute('aria-controls','popup-more-tools');document.querySelector('.task-map').id='popup-more-tools';
  links.append(navigation(recent),navigation(more));
  recent.hidden=firefox;
  const rule=document.createElement('p');rule.className='hint';strip.append(rule);
  const defaults=button('quick-defaults','defaults','btn block',null,()=>{bypass=true;rule.textContent=Q('defaults');defaults.hidden=true;});defaults.hidden=true;strip.append(defaults);
  const guest=document.createElement('p');guest.className='quick-guest';guest.dataset.q='localFooter';strip.append(guest);
  const official=document.createElement('div');official.className='quick-official';
  for(const [key,page] of [['official','']]){const a=document.createElement('a');a.dataset.q=key;a.dataset.site=page;official.append(a);}
  const workspace=document.createElement('a');workspace.dataset.q='fullWorkspace';workspace.href=chrome.runtime.getURL('workspace.html');workspace.target='_blank';workspace.rel='noopener';official.append(workspace);
  workspace.onclick=e=>{e.preventDefault();chrome.tabs.create({url:chrome.runtime.getURL('workspace.html')+'?tabId='+(source?.id||'')});};
  strip.append(official);GCDSite.refresh();
  const grid=document.querySelector('.task-grid');
  const extra=document.createElement('div');extra.className='extra-sources';extra.append($('task-chat'));document.querySelector('.task-map').append(extra);
  const sources=button('task-sources','moreSources','btn',ICONS.more,()=>{const expanded=document.body.classList.toggle('sources-open');sources.setAttribute('aria-expanded',String(expanded));if(expanded)document.querySelector('[data-tab=web]').focus();});
  sources.setAttribute('aria-expanded','false');grid.append(sources);
  const localLabel=$('task-local').querySelector('span');localLabel.removeAttribute('data-i18n');window.GCD_I18N?.untrack(localLabel);localLabel.dataset.q='localFiles';
  QuickText.render(document.querySelector('.task-map'));
  const back=$('show-tasks').onclick;$('show-tasks').onclick=()=>{const formats=document.body.dataset.view==='formats';back();document.body.classList.remove('sources-open');sources.setAttribute('aria-expanded','false');if(formats){document.body.classList.add('show-more');$('show-tasks').classList.remove('hidden');$('task-local').focus();}else{document.body.classList.remove('show-more');$('quick-more').focus();}};
  QuickText.render(strip);

  const ACTIVE=new Set(['queued','selecting','preparing','loading','organizing','printing']);
  const STAGE={queued:'preparing',selecting:'preparing',preparing:'preparing',loading:'loading',organizing:'organizing',printing:'printing'};
  const ERRORS={ARTICLE_NOT_FOUND:'articleError',SELECTION_INVALID:'selectionError',LONG_PAGE_LIMIT:'longError',TIMEOUT:'timeoutError',FILE_TOO_LARGE:'sizeError',TASK_BUSY:'busyError',UNSUPPORTED_PAGE:'unsupported',DEBUGGER_BUSY:'debugger',SOURCE_CHANGED:'changed',INTERRUPTED:'interrupted',MANUAL_PRINT:'interrupted',CANCELLED:'cancelled'};
  let timer=0;
  const actionable=()=>{const valid=ExtensionSource.supported(source);main.disabled=!valid;if(!firefox){article.disabled=!valid;select.disabled=!valid;}};
  const setBusy=busy=>{for(const b of [article,select,main])b.disabled=busy||!ExtensionSource.supported(source);};
  async function focusOwner(job){
    try{if(job?.ownerTabId){const tab=await chrome.tabs.get(job.ownerTabId);await chrome.tabs.update(tab.id,{active:true});if(tab.windowId!==undefined)await chrome.windows.update(tab.windowId,{focused:true});return;}}catch{}
    chrome.tabs.create({url:chrome.runtime.getURL('workspace.html')+'?tabId='+(source?.id||'')});
  }
  async function download(resultId){
    const record=await GCDHistory.get(resultId);
    if(!record?.blob)throw Error(Q('unavailable'));
    const url=URL.createObjectURL(record.blob),name=ConversionOptions.filename(record.name);
    try{await chrome.downloads.download({url,filename:name,saveAs:false});}
    catch{const a=document.createElement('a');a.href=url;a.download=name;a.click();}
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  // Opens the stored PDF itself in a new tab (native PDF viewer), not the recent page.
  async function openPdf(resultId){
    const record=await GCDHistory.get(resultId);
    if(!record?.blob)throw Error(Q('unavailable'));
    const url=URL.createObjectURL(record.blob);
    try{chrome.tabs.create({url});}catch{window.open(url,'_blank','noopener');}
    setTimeout(()=>URL.revokeObjectURL(url),120000);
  }
  function renderStatus(job){
    statusActions.replaceChildren();
    if(!job){statusBox.hidden=true;actionable();return;}
    statusBox.hidden=false;
    statusBox.classList.toggle('is-error',['failed','cancelled','interrupted'].includes(job.state));
    statusBox.classList.toggle('is-success',job.state==='success');
    if(ACTIVE.has(job.state)){
      statusText.textContent=Q(STAGE[job.state]||'preparing');
      setBusy(true);
      statusActions.append(button('','openWorkspace','btn',null,()=>focusOwner(job)));
      return;
    }
    setBusy(false);
    if(job.state==='success'){
      statusText.textContent=Q('succeeded');
      if(job.resultId)statusActions.append(
        button('','open','btn',null,()=>openPdf(job.resultId)),
        button('','download','btn quick-result-download',null,()=>download(job.resultId)));
      else statusActions.append(button('','openWorkspace','btn',null,()=>focusOwner(job)));
      return;
    }
    statusText.textContent=Q(ERRORS[job.code]||'failed');
    statusActions.append(button('','retry','btn',null,()=>open(job.mode||'full')),button('','openWorkspace','btn',null,()=>focusOwner(job)));
  }
  async function startPoll(){
    if(timer){clearTimeout(timer);timer=0;}
    if(!source?.id)return;
    let job=null;
    try{const reply=await chrome.runtime.sendMessage({type:'QUICK_JOB_LOOKUP',tabId:source.id});if(reply?.ok)job=reply.job;}catch{}
    renderStatus(job);
    if(job&&ACTIVE.has(job.state))timer=setTimeout(()=>{timer=0;startPoll();},1000);
  }
  window.addEventListener('languagechange',()=>{if(!statusBox.hidden)startPoll();});
  window.addEventListener('pagehide',()=>{if(timer)clearTimeout(timer);});
  try{
    [source]=await chrome.tabs.query({active:true,currentWindow:true});
    if(source?.incognito&&$('quick-recent'))$('quick-recent').hidden=true;
    const valid=ExtensionSource.supported(source);article.disabled=select.disabled=main.disabled=!valid;
    await startPoll();
    if(!valid)return;
    if(!(await GCDPrefs.read()).migrated){const parse=key=>{try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}};const presets=parse('gcd-layout-presets-v3');await chrome.runtime.sendMessage({type:'PREFERENCES_UPDATE',action:'migrate',payload:{legacy:{rules:parse('gcd-site-layout-rules-v1'),recent:parse('gcd-layout-recent-v2'),defaultOptions:presets?.presets?.[presets.defaultPreset]}}});}
    const resolved=await GCDPrefs.resolve(GCDPrefs.hostname(source.url));
    if(resolved.rule&&!firefox){rule.textContent=QuickText.text('ruleApplied',{mode:Q(resolved.options.contentMode==='article'?'body':'full')});defaults.hidden=false;}
  }catch{$('popup-source-note').textContent=Q('unavailable');}
})();
