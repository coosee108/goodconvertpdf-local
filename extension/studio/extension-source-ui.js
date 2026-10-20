export function mountSource(initial,onChange,onRefresh,isBusy){
const T=value=>window.GCD_I18N?.text(value)||value;
const put=(el,v)=>{if(!el)return;if(window.GCD_I18N)window.GCD_I18N.write(el,v);else el.textContent=v;};
  const panel=document.getElementById('source-web'),input=document.getElementById('source-url');
  input.readOnly=true;input.disabled=false;
  const localizeSourcePlaceholder=()=>{input.placeholder=(window.GCD_I18N ? window.GCD_I18N.text(window.GCD_I18N?.text('Select a webpage from the list')||'Select a webpage from the list') : window.GCD_I18N?.text('Select a webpage from the list')||'Select a webpage from the list');};
  localizeSourcePlaceholder();window.addEventListener('languagechange',localizeSourcePlaceholder);
  put(document.querySelector('label[for="source-url"]'), 'Source webpage · read only');
  const box=document.createElement('div');box.className='extension-source-card';
  box.innerHTML=(window.GCD_I18N ? window.GCD_I18N.htmlLiteral('<strong id="target-title">Choose the webpage to convert</strong><p id="target-note" class="help" role="status"></p><label for="target-tabs">Open webpages</label><select id="target-tabs"><option value="">Choose a webpage…</option></select><div class="button-row"><button type="button" id="target-refresh">Refresh list</button><button type="button" id="target-view" disabled>View source page</button></div><details class="tab-batch"><summary>Convert several open tabs (Chrome / Edge)</summary><fieldset id="target-batch-tabs"><legend>Select up to 10 webpages</legend></fieldset><button type="button" id="target-batch-run">Create a PDF bundle</button><p id="target-batch-status" class="help" role="status"></p></details><p class="help" id="source-hint">Only pages already open in this browser window can be selected. You cannot paste a URL here — to convert any public link, use the website version.</p>') : '<strong id="target-title">Choose the webpage to convert</strong><p id="target-note" class="help" role="status"></p><label for="target-tabs">Open webpages</label><select id="target-tabs"><option value="">Choose a webpage…</option></select><div class="button-row"><button type="button" id="target-refresh">Refresh list</button><button type="button" id="target-view" disabled>View source page</button></div><details class="tab-batch"><summary>Convert several open tabs (Chrome / Edge)</summary><fieldset id="target-batch-tabs"><legend>Select up to 10 webpages</legend></fieldset><button type="button" id="target-batch-run">Create a PDF bundle</button><p id="target-batch-status" class="help" role="status"></p></details><p class="help" id="source-hint">Only pages already open in this browser window can be selected. You cannot paste a URL here — to convert any public link, use the website version.</p>');
  panel.prepend(box);
  const select=box.querySelector('#target-tabs'),batch=box.querySelector('#target-batch-tabs'),note=box.querySelector('#target-note'),title=box.querySelector('strong');
  if(location.protocol==='moz-extension:')box.querySelector('.tab-batch').hidden=true;
  let current=initial||0,lastUrl='',version=0,first=true;
  async function refresh(reset=false){
    if(isBusy())return;
    const revision=++version;let active=null;
    try{if(current)active=await chrome.tabs.get(current);}catch{}
    const all=await chrome.tabs.query({currentWindow:true});if(revision!==version)return;
    const supported=all.filter(ExtensionSource.supported),emptyOption=new Option('Choose a webpage…','');
    window.GCD_I18N?.write(emptyOption,'Choose a webpage…');
    select.replaceChildren(emptyOption,...supported.map(tab=>new Option(tab.title||new URL(tab.url).hostname,String(tab.id))));
    const selected=new Set([...batch.querySelectorAll('input:checked')].map(item=>item.value));
    batch.querySelectorAll('label').forEach(label=>label.remove());
    batch.append(...supported.map(tab=>{const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.value=String(tab.id);check.checked=selected.has(check.value);label.append(check,document.createTextNode(tab.title||new URL(tab.url).hostname));return label;}));
    const valid=ExtensionSource.supported(active);select.value=valid?String(current):'';input.value=valid?active.url:'';
    if(valid&&active.title){window.GCD_I18N?.untrack(title);title.textContent=active.title;}
    else window.GCD_I18N?.write(title,valid?'Source webpage':'No supported source selected');
    window.GCD_I18N?.write(note,valid?'This selected tab is converted locally, including its current signed-in content.':ExtensionSource.reason);
    box.querySelector('#target-view').disabled=!valid;
    const changed=lastUrl!==(active?.url||'');lastUrl=active?.url||'';
    onChange(current,valid,valid?active:null,reset||changed||first);first=false;onRefresh();
  }
  select.onchange=()=>{current=Number(select.value);refresh(true);};
  box.querySelector('#target-refresh').onclick=()=>refresh();
  box.querySelector('#target-view').onclick=async()=>{try{await chrome.tabs.update(current,{active:true});}catch{refresh();}};
  box.querySelector('#target-batch-run').onclick=()=>{const ids=[...batch.querySelectorAll('input:checked')].map(item=>Number(item.value));window.dispatchEvent(new CustomEvent('gcd:batch-tabs',{detail:{ids,status:box.querySelector('#target-batch-status')}}));};
  const removed=id=>{if(id===current)refresh(true);};
  const updated=(id,change)=>{if(id===current&&(change.url||change.status==='complete'))refresh(true);};
  chrome.tabs.onRemoved.addListener(removed);chrome.tabs.onUpdated.addListener(updated);
  window.addEventListener('focus',()=>refresh());
  window.addEventListener('pagehide',()=>{chrome.tabs.onRemoved.removeListener(removed);chrome.tabs.onUpdated.removeListener(updated);});
  refresh();return refresh;
}
