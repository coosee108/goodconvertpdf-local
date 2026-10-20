// 最近结果页：卡片化列表 + 搜索/排序 + 空状态 + 存储管理 + 危险区。
// PDF 字节只在本机扩展源内处理，不上传、不记录原始网址。
(async()=>{
  const $=id=>document.getElementById(id),Q=(key,params)=>QuickText.text(key,params),urls=new Set();
  const status=$('recent-status'),viewer=$('recent-viewer'),preview=$('recent-preview'),list=$('recent-list'),empty=$('recent-empty'),count=$('recent-count');
  const searchInput=$('recent-search'),sortSelect=$('recent-sort'),spaceEl=$('storage-space'),countEl=$('storage-count');
  let currentId=null,records=[],query='',sort='newest';
  const unavailable=()=>{status.textContent=Q('storageError');status.setAttribute('role','alert');};
  const update=async(action,payload)=>{const r=await chrome.runtime.sendMessage({type:'PREFERENCES_UPDATE',action,payload});if(!r?.ok)throw Error(r?.error);return r.prefs;};
  const button=(key,cls,action)=>{const b=document.createElement('button');b.type='button';b.className=cls;b.dataset.q=key;b.textContent=Q(key);b.onclick=()=>Promise.resolve().then(action).catch(unavailable);return b;};
  function release(){viewer.removeAttribute('src');preview.hidden=true;for(const url of urls)URL.revokeObjectURL(url);urls.clear();currentId=null;}
  // Opens a stored PDF in a new browser tab (native PDF viewer) or downloads it.
  async function result(id,download){const r=await GCDHistory.get(id);if(!r){release();await render();return;}
    const url=URL.createObjectURL(r.blob);
    if(download){const a=document.createElement('a');a.href=url;a.download=ConversionOptions.filename(r.name);a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);return;}
    try{chrome.tabs.create({url});}catch{window.open(url,'_blank','noopener');}
    setTimeout(()=>URL.revokeObjectURL(url),120000);
  }
  // 一次只展开一个「更多」菜单，点击外部或按 Esc 关闭
  let openMenu=null;
  const closeMenus=()=>{if(!openMenu)return;openMenu.hidden=true;openMenu=null;};
  document.addEventListener('click',event=>{if(!event.target.closest('.recent-more'))closeMenus();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenus();});
  // Copies text to the clipboard, with a legacy fallback for restricted extension contexts.
  async function copyText(text){
    try{ if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(text);return true;} }catch(e){}
    try{
      const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.top='-9999px';ta.style.opacity='0';
      document.body.append(ta);ta.focus();ta.select();const ok=document.execCommand('copy');ta.remove();return ok;
    }catch(e){ return false; }
  }
  // Copies the full source URL, briefly swapping the button label to confirm without stealing focus.
  const siteUrl=r=>r.host?`https://${r.host}`:'';
  async function copyHost(button,text){
    const ok=await copyText(text);
    const original=button.textContent;
    const label=ok?Q('copied'):Q('copyFailed');
    button.textContent=label;
    await new Promise(resolve=>setTimeout(resolve,1200));
    if(button.textContent===label)button.textContent=original;
  }
  // Runs a stored-PDF action (PNG/Print) through the shared rasterizer bridge.
  function runOutput(r,kind,note){
    return Promise.resolve().then(async ()=>{
      const rec=await GCDHistory.get(r.id);
      if(!rec){note.textContent=Q('unavailable');return;}
      const api=globalThis.GCDPdfOutput;
      if(!api){note.textContent=Q('unavailable');return;}
      const alive=()=>true,cleanup={value:null};
      if(kind==='png')await api.exportPngBlob(rec.blob,rec.name,note,alive);
      else await api.printPdfBlob(rec.blob,rec.name,note,alive,cleanup);
    }).catch(unavailable);
  }
  function card(r){
    const li=document.createElement('li');li.className='recent-item';li.dataset.resultId=r.id;
    if(currentId===r.id)li.classList.add('is-active');
    const main=document.createElement('div');main.className='recent-main';
    const name=document.createElement('p');name.className='recent-name';name.textContent=r.name;
    const meta=document.createElement('p');meta.className='recent-meta';
    const badge=document.createElement('span');badge.className='recent-badge';badge.textContent=Q(r.mode==='article'?'body':r.mode==='selection'?'select':'full');
    const span=text=>{const s=document.createElement('span');s.textContent=text;return s;};
    const dot=()=>{const s=document.createElement('span');s.className='dot';s.textContent='·';return s;};
    // The originating website is a plain link that opens the source in a new tab.
    const url=siteUrl(r);
    let host;
    if(url){host=document.createElement('a');host.href=url;host.target='_blank';host.rel='noopener noreferrer';host.title=url;}
    else{host=document.createElement('span');host.title=Q('unavailable');}
    host.className='recent-host';host.textContent=r.host||'—';
    meta.append(badge,dot(),host,dot(),span(new Date(r.createdAt).toLocaleString(document.documentElement.lang)),dot(),span(`${(r.size/1024).toFixed(0)} KB`),dot(),span(`${r.pages} p.`));
    main.append(name,meta);
    // Per-card status line that the PNG/print actions write progress and fallbacks into.
    const note=document.createElement('p');note.className='recent-note';
    main.append(note);
    const actions=document.createElement('div');actions.className='recent-actions';
    actions.append(button('open','btn primary sm',()=>result(r.id,false)),button('download','btn ghost sm',()=>result(r.id,true)));
    const wrap=document.createElement('div');wrap.className='recent-more';
    const menu=document.createElement('ul');menu.className='recent-menu';menu.hidden=true;
    // PNG and Print reuse the shared rasterizer; copying the source URL is third; Delete stays last.
    const copyBtn=button('copyUrl','',()=>copyHost(copyBtn,siteUrl(r)));
    menu.append(
      button('png','',()=>runOutput(r,'png',note)),
      button('printPdf','',()=>runOutput(r,'print',note)),
      copyBtn,
      button('remove','is-danger',async()=>{if(!confirm(Q('confirmDelete')))return;await GCDHistory.remove(r.id);if(currentId===r.id)release();await render();})
    );
    const moreBtn=button('more','btn quiet sm',()=>{const willOpen=menu.hidden;closeMenus();if(willOpen){menu.hidden=false;openMenu=menu;}});
    wrap.append(moreBtn,menu);actions.append(wrap);
    li.append(main,actions);
    return li;
  }
  function visible(){
    const rows=records.filter(r=>!query||String(r.name||'').toLowerCase().includes(query)||String(r.host||'').toLowerCase().includes(query));
    const sorted=[...rows];
    if(sort==='oldest')sorted.sort((a,b)=>a.createdAt-b.createdAt);
    else if(sort==='name')sorted.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),document.documentElement.lang||undefined));
    else if(sort==='size')sorted.sort((a,b)=>(b.size||0)-(a.size||0));
    else sorted.sort((a,b)=>b.createdAt-a.createdAt||String(b.id).localeCompare(String(a.id)));
    return sorted;
  }
  function stats(){
    const bytes=records.reduce((total,r)=>total+(r.size||0),0);
    spaceEl.textContent=bytes>=1048576?`${(bytes/1048576).toFixed(1)} MB`:`${Math.round(bytes/1024)} KB`;
    countEl.textContent=String(records.length);
  }
  async function render(){
    records=await GCDHistory.list();
    $('clear-results').disabled=!records.length;
    stats();
    searchInput.placeholder=Q('search');
    status.textContent='';status.removeAttribute('role');
    const rows=visible();
    count.textContent=Q('resultsCount',{count:rows.length});
    list.replaceChildren();
    empty.hidden=!!rows.length;
    for(const r of rows)list.append(card(r));
  }
  async function rules(){
    const prefs=await GCDPrefs.read(),target=$('rule-list');
    target.replaceChildren();
    for(const [host,rule] of Object.entries(prefs.rules)){
      const li=document.createElement('li');li.className='rule-item';
      const head=document.createElement('div');head.className='rule-head';
      const title=document.createElement('strong');title.textContent=host;
      const toggle=document.createElement('label');toggle.className='checkbox';
      const input=document.createElement('input');input.type='checkbox';input.checked=rule.enabled;
      const label=document.createElement('span');label.dataset.q='enabled';label.textContent=Q('enabled');
      toggle.append(input,label);
      input.onchange=()=>update('rule',{host,operation:'toggle',enabled:input.checked}).then(rules).catch(unavailable);
      head.append(title,toggle,button('remove','btn sm ghost',async()=>{if(confirm(Q('confirmDelete'))){await update('rule',{host,operation:'delete'});await rules();}}));
      const note=document.createElement('p');note.className='rule-note';note.textContent=QuickText.describe(GCDPrefs.clean(rule.options));
      li.append(head,note);
      target.append(li);
    }
    $('rules-card').hidden=!Object.keys(prefs.rules).length;
  }
  window.addEventListener('pagehide',release);
  // 无痕/私密模式：不写本地历史。API 缺失或抛错时按非私密处理，避免未捕获 rejection 打断整页脚本。
  let privateMode=false;
  try{privateMode=location.protocol==='moz-extension:'||!!chrome.extension?.inIncognitoContext||!!(await chrome.tabs?.getCurrent?.())?.incognito;}catch(e){privateMode=false;}
  if(privateMode){$('retain-results').disabled=$('clear-results').disabled=true;status.textContent=Q('private');$('storage-card').hidden=$('danger-card').hidden=true;return;}
  window.addEventListener('languagechange',()=>{render().then(rules).catch(unavailable);});
  try{
    const prefs=await GCDPrefs.read();
    $('retain-results').checked=prefs.retain!==false;
    $('retain-results').onchange=()=>update('retain',{value:$('retain-results').checked}).catch(unavailable);
    $('clear-results').onclick=async()=>{if(!confirm(Q('confirmClear')))return;try{await GCDHistory.clear();release();await render();}catch{unavailable();}};
    searchInput.oninput=()=>{query=searchInput.value.trim().toLowerCase();render().catch(unavailable);};
    sortSelect.onchange=()=>{sort=sortSelect.value;render().catch(unavailable);};
    await render();await rules();
    const id=new URLSearchParams(location.search).get('result');
    if(id)await result(id,new URLSearchParams(location.search).has('download'));
  }catch{unavailable();}
})();
