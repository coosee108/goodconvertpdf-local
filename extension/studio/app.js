import * as Jobs from './jobs-client.js';
import {mountRegionPicker,previewError} from './region-picker.js';
import {mountControls} from './controls.js';
import {readPackage,decode,prepareHtml,mountDocument} from './local-html.js';
import {inspectImage,imagesToPdf,imageLimits} from './images.js';
const $=id=>document.getElementById(id),state={source:'web',busy:false,loading:false,blobUrl:null,html:null,items:[],entries:new Map(),file:null,controller:null,dragId:null};
const isExtension=['chrome-extension:','moz-extension:'].includes(location.protocol);
const isFirefoxExtension=location.protocol==='moz-extension:';
const localize=(node,value)=>window.GCD_I18N?.write(node,value)||!window.GCD_I18N&&(node.textContent=value);
const tx=s=>window.GCD_I18N?.text(s)||s;
const put=(el,v)=>{if(!el)return;if(window.GCD_I18N)window.GCD_I18N.write(el,v);else el.textContent=v;};
let targetTab=Number(new URLSearchParams(location.search).get('tabId')),targetReady=false;
let quickWorkspace=null,resolveFirstTarget,starting=false,quickInitialized=!(isExtension&&!isFirefoxExtension);
const firstTarget=new Promise(resolve=>{resolveFirstTarget=resolve;});
let quickReady=Promise.resolve();
let nameEdited=false;
let activeQuick='';
let syncTarget=()=>{};
let refreshContentSummary=()=>{};
const message=async payload=>{const result=await chrome.runtime.sendMessage(payload);if(!result?.ok)throw Object.assign(Error(result?.error||'The extension could not finish this operation.'),{code:result?.code});return result;};
const tabs=[...document.querySelectorAll('[data-source]')];
function updateSteps(kind){const steps=$('studio-steps');if(!steps)return;let hasSource=false;if(state.source==='web'){if(isExtension)hasSource=targetReady;else{try{const url=new URL(normalizeWebUrl($('source-url').value));hasSource=['http:','https:'].includes(url.protocol)&&!url.username&&!url.password;}catch{}}}else if(state.source==='html')hasSource=!!state.file||!!$('html-code').value.trim();else hasSource=state.items.length>0;const current=kind==='ready'?'save':hasSource?'layout':'source';for(const item of steps.children){item.classList.toggle('is-current',item.dataset.step===current);if(item.dataset.step===current)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');}}
function feedback(kind,title,detail){const card=document.querySelector('.result-card');card.dataset.state=kind;card.setAttribute('aria-busy',kind==='working'?'true':'false');put($('conversion-status'),title);put($('result-guidance'),detail);put($('action-feedback'),title);$('action-feedback').hidden=kind==='idle';$('view-result').hidden=kind!=='ready';const retry=$('retry-conversion');if(retry)put(retry,'Try again');if(retry)retry.hidden=!['failed','stopped'].includes(kind)||(isFirefoxExtension&&state.source==='web');updateSteps(kind);if(kind!=='ready'){const heading=document.createElement('strong');put(heading,kind==='idle'?'Your PDF starts here.':title);const description=document.createElement('span');put(description,detail);$('preview-empty').replaceChildren(heading,description);}}
const error=message=>{put($('studio-error'),message);$('studio-error').hidden=!message;};
const track=(event,props={})=>{if(!isExtension)window.Analytics?.track(event,props);};
function allowanceHelp(code){const box=$('allowance-help');if(!box)return;const auth=code==='AUTH_REQUIRED',quota=code==='QUOTA_EXCEEDED';box.hidden=!auth&&!quota;if(box.hidden)return;$('allowance-title').textContent=tx(auth?'Sign in to convert a public webpage.':'Your monthly cloud allowance is used up.');$('allowance-detail').textContent=tx(auth?'Your input and settings are kept. Local HTML and image conversion remains available.':'Check when your allowance resets, compare plans, or use local HTML and image conversion.');$('allowance-login').hidden=!auth;$('allowance-account').hidden=auth;$('allowance-pricing').hidden=auth;track(auth?'conversion_signin_required':'conversion_allowance_exhausted',{source:state.source});}
$('allowance-local')?.addEventListener('click',()=>{source('html');$('tab-html').focus();});
function clearSourceError(){document.querySelector('.source-validation')?.remove();for(const id of ['source-url','html-code','image-files']){$(id).removeAttribute('aria-invalid');if(id==='source-url')$(id).setAttribute('aria-describedby','studio-error');else $(id).removeAttribute('aria-describedby');}}
function requireSource(){let field,help;if(state.source==='web'&&!isExtension){try{const url=new URL(normalizeWebUrl($('source-url').value));if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error();}catch{field=$('source-url');help='Paste a public webpage URL, then choose Create PDF.';}}else if(state.source==='html'&&!state.file&&!$('html-code').value.trim()){field=$('html-code');help='Choose an HTML file / ZIP or paste code, then create your PDF.';}else if(state.source==='images'&&!state.items.length){field=$('image-files');help='Add images, arrange them in order, then create your PDF.';}if(!field)return true;const message=tx(help);clearSourceError();const hint=document.createElement('p');hint.id='source-validation';hint.className='source-validation';hint.setAttribute('role','alert');(window.GCD_I18N ? window.GCD_I18N.write(hint, message) : (hint.textContent=message));const anchor=field=== $('source-url')?field.closest('.control-row'):field=== $('image-files')?$('image-drop'):field;anchor.after(hint);(window.GCD_I18N ? window.GCD_I18N.write($('studio-error'), message) : ($('studio-error').textContent=message));$('studio-error').hidden=true;field.setAttribute('aria-invalid','true');field.setAttribute('aria-describedby',hint.id);field.focus();return false;}
function normalizeWebUrl(value){const raw=String(value||'').trim();return /^[\w.-]+\.[a-z]{2,}(?::\d+)?(?:[/?#]|$)/i.test(raw)?'https://'+raw:raw;}
function revealResult(){if(isExtension||!matchMedia('(max-width: 900px)').matches)return;const heading=$('preview-heading');heading.focus({preventScroll:true});heading.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});}
function syncClear(){const url=$('clear-url'),html=$('clear-html'),images=$('clear-images');if(url)url.hidden=!$('source-url').value;if(html)html.hidden=!state.file&&!$('html-code').value;if(images)images.hidden=!state.items.length;}
function invalidate(){if(state.busy)return;syncClear();const hadResult=!!state.blobUrl;if(state.blobUrl)URL.revokeObjectURL(state.blobUrl);state.blobUrl=null;['download-pdf','open-pdf','pdf-preview','print-html','html-preview'].forEach(id=>$(id).hidden=true);$('pdf-preview').removeAttribute('src');$('html-preview').removeAttribute('srcdoc');state.html?.release();state.html=null;$('preview-empty').hidden=false;const selected=state.source==='web'&&!isExtension&&controls.field('content').value==='selection'&&regionPicker?.label();let hasUrl=false;try{const url=new URL(normalizeWebUrl($('source-url').value));hasUrl=['http:','https:'].includes(url.protocol)&&!url.username&&!url.password;}catch{}const webHint=selected?'Selected region is ready. Choose Create PDF to preview it.':hasUrl?'Your webpage is ready. Choose Create PDF to preview it.':'Paste a public webpage URL, then choose Create PDF.';feedback('idle',hadResult?'Settings changed — create a new PDF.':'Ready when you are.',state.source==='web'?(isExtension?(targetReady?'Review the selected webpage and choose Create PDF.':'Choose an open webpage from the source list. Browser settings and extension pages cannot be converted.'):webHint):state.source==='html'?'Choose an HTML file / ZIP or paste code, then create your PDF.':'Add images, arrange them in order, then create your PDF.');$('conversion-warnings').hidden=true;$('warning-summary').hidden=true;$('review-loading').hidden=true;$('download-note').hidden=true;if($('allowance-help'))$('allowance-help').hidden=true;clearSourceError();error('');suggestName();syncTarget();refreshContentSummary();}
function clearQuick(){activeQuick='';const group=$('quick-layout');if(!group)return;for(const button of group.querySelectorAll('[data-quick][aria-pressed]'))button.setAttribute('aria-pressed','false');$('quick-summary').hidden=true;}
const controls=mountControls($('layout-controls'),isFirefoxExtension?'extension':isExtension?'extension':'server',()=>{clearQuick();invalidate();},{regionPicker:!isExtension});
const regionPicker=isExtension?null:mountRegionPicker({controls,urlInput:$('source-url'),getUrl:()=>{try{return new URL(normalizeWebUrl($('source-url').value)).href;}catch{return '';}},canOpen:()=>!state.busy&&!state.loading&&state.source==='web'&&requireSource(),onConfirm:()=>{invalidate();refreshContentSummary();}});
window.addEventListener('gcd:pick-web-region',()=>regionPicker?.open());
const contentSummary=document.createElement('div');
contentSummary.id='content-summary';contentSummary.className='content-summary';contentSummary.setAttribute('role','status');contentSummary.setAttribute('aria-live','polite');
$('layout-controls').after(contentSummary);
let summaryRequest=0;
refreshContentSummary=async()=>{
  const request=++summaryRequest;
  contentSummary.hidden=state.source!=='web'||isFirefoxExtension;
  if(contentSummary.hidden)return;
  const mode=controls.field('content').value,selector=controls.field('selector').value.trim();
  const title=document.createElement('strong'),scope=document.createElement('span'),excluded=document.createElement('span');
  title.textContent=tx('PDF content')+' · '+tx(mode==='article'?'Main article':mode==='selection'?'Selected region':'Full page');
  scope.textContent=mode==='selection'?(regionPicker?.label()||selector||tx('Pick content')):tx(mode==='article'?'Article scope is detected when preparing the page.':'Full page');
  excluded.textContent=isExtension?tx('Checking page selection…'):tx('Excluded elements: {count}').replace('{count}','0');
  contentSummary.replaceChildren(title,scope,excluded);
  if(!isExtension){excluded.hidden=true;return;}
  if(!targetReady){put(scope, 'Choose an open webpage from the source list.');excluded.hidden=true;return;}
  try{
    const value=await message({type:'GET_CONTENT_STATE',tabId:targetTab});
    if(request!==summaryRequest)return;
    excluded.textContent=tx('Excluded elements: {count}').replace('{count}',String(value.excluded));
    if(mode==='selection'&&value.selector===selector&&!value.connected)put(scope, 'Selected content is no longer available. Pick content again.');
  }catch{if(request===summaryRequest)put(excluded, 'Page selection could not be checked. Return to the webpage and try again.');}
};
document.addEventListener('change',()=>refreshContentSummary());
window.addEventListener('focus',()=>refreshContentSummary());
refreshContentSummary();
const SITE_RULES_KEY='gcd-site-layout-rules-v1';
const siteMessages={'ui.site.save':'Save settings for this website','ui.site.remove':'Remove website rule','ui.site.saved':'Settings saved for {host}.','ui.site.empty':'No saved settings for {host}.','ui.site.limit':'Keep at most 30 website rules.'};
const siteText=(key,params={})=>window.GCD_I18N?.t(key,params)||siteMessages[key].replace(/\{(\w+)\}/g,(_,name)=>String(params[name]??''));
let siteRules={},appliedRuleHost='';
try{const value=JSON.parse(localStorage.getItem(SITE_RULES_KEY)||'{}');if(value&&typeof value==='object'&&!Array.isArray(value))siteRules=value;}catch{}
function siteHost(){try{if(state.source!=='web'||isFirefoxExtension||isExtension&&!targetReady)return '';const url=new URL(normalizeWebUrl($('source-url').value));return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&url.hostname.includes('.')?url.hostname.toLowerCase():'';}catch{return '';}}
const siteRuleBox=document.createElement('div');siteRuleBox.className='site-rule-row';
const saveSiteRule=document.createElement('button'),removeSiteRule=document.createElement('button'),siteRuleStatus=document.createElement('span');
saveSiteRule.type=removeSiteRule.type='button';localize(saveSiteRule,siteMessages['ui.site.save']);localize(removeSiteRule,siteMessages['ui.site.remove']);siteRuleStatus.setAttribute('role','status');siteRuleBox.append(saveSiteRule,removeSiteRule,siteRuleStatus);$('quick-layout').after(siteRuleBox);
function updateSiteRule(){if(isExtension&&!isFirefoxExtension){siteRuleBox.hidden=true;return;}const host=siteHost();siteRuleBox.hidden=state.source!=='web'||isFirefoxExtension||(!isExtension&&!host);saveSiteRule.disabled=!host;removeSiteRule.disabled=!host||!siteRules[host];siteRuleStatus.textContent=host?(siteRules[host]?siteText('ui.site.saved',{host}):siteText('ui.site.empty',{host})):'';}
function applySiteRule(){if(isExtension&&!isFirefoxExtension)return;const host=siteHost();if(host&&host!==appliedRuleHost&&siteRules[host]){controls.apply(siteRules[host]);}appliedRuleHost=host;updateSiteRule();}
saveSiteRule.onclick=()=>{const host=siteHost();if(!host)return;try{controls.read();if(!siteRules[host]&&Object.keys(siteRules).length>=30)throw Error(siteText('ui.site.limit'));const next={...siteRules,[host]:controls.snapshot()};localStorage.setItem(SITE_RULES_KEY,JSON.stringify(next));siteRules=next;updateSiteRule();}catch(e){put(siteRuleStatus,e.message);}};
removeSiteRule.onclick=()=>{const host=siteHost();if(!host)return;try{const next={...siteRules};delete next[host];localStorage.setItem(SITE_RULES_KEY,JSON.stringify(next));siteRules=next;updateSiteRule();}catch(e){put(siteRuleStatus,e.message);}};
updateSiteRule();
const quickValues={original:{layout:'paged'},long:{layout:'long'}};
const quickDetails={original:['Paginated PDF'],long:['One long page']};
for(const button of $('quick-layout').querySelectorAll('[data-quick]'))button.onclick=()=>{const value=button.dataset.quick;if(value==='reset'){controls.reset();clearQuick();return;}controls.apply(quickValues[value]);activeQuick=value;for(const item of $('quick-layout').querySelectorAll('[data-quick][aria-pressed]'))item.setAttribute('aria-pressed',String(item===button));$('quick-summary').textContent=quickDetails[value].map(tx).join(' · ');$('quick-summary').hidden=false;};
function firefoxControls(){if(isFirefoxExtension){$('layout-controls').hidden=state.source==='web';$('quick-layout').hidden=true;}}
function source(value){if(state.busy||state.loading)return;state.source=value;if(value!=='web')vendor().catch(()=>{});quickWorkspace?.sourceType(value);if(value!=='web')appliedRuleHost='';tabs.forEach(tab=>{const active=tab.dataset.source===value;tab.setAttribute('aria-selected',active);tab.tabIndex=active?0:-1;$('source-'+tab.dataset.source).hidden=!active;});controls.setEngine(value==='web'?(isExtension?'extension':'server'):value);$('quick-layout').hidden=value!=='web'||isFirefoxExtension;clearQuick();firefoxControls();(window.GCD_I18N ? window.GCD_I18N.write($('generate'), value==='html'?'Preview HTML & create PDF':isFirefoxExtension&&value==='web'?'Open print dialog':'Create PDF') : ($('generate').textContent=value==='html'?'Preview HTML & create PDF':isFirefoxExtension&&value==='web'?'Open print dialog':'Create PDF'));(window.GCD_I18N ? window.GCD_I18N.write($('engine-note'), value==='web'?(isFirefoxExtension?'Firefox opens the browser print dialog. Choose Save as PDF there; paper and margins are set in that dialog.':isExtension?'Local extension conversion. Keep this workspace open until you save.':'Cloud conversion uses your online allowance. Server tasks and results are kept for 24 hours on Free or 30 days on Pro.'):value==='html'?'Direct download is an image-based PDF. Use Print for searchable text; choose paper and page ranges in the print dialog.':'Images stay on this device. Each image becomes one PDF page.') : ($('engine-note').textContent=value==='web'?(isFirefoxExtension?'Firefox opens the browser print dialog. Choose Save as PDF there; paper and margins are set in that dialog.':isExtension?'Local extension conversion. Keep this workspace open until you save.':'Cloud conversion uses your online allowance. Server tasks and results are kept for 24 hours on Free or 30 days on Pro.'):value==='html'?'Direct download is an image-based PDF. Use Print for searchable text; choose paper and page ranges in the print dialog.':'Images stay on this device. Each image becomes one PDF page.'));invalidate();if(value==='web')applySiteRule();else updateSiteRule();track('source_selected',{source:value});}
tabs.forEach((tab,index)=>{tab.onclick=()=>source(tab.dataset.source);tab.onkeydown=event=>{const offsets={ArrowRight:1,ArrowLeft:-1,Home:-index,End:tabs.length-1-index};if(event.key in offsets){event.preventDefault();const target=tabs[(index+offsets[event.key]+tabs.length)%tabs.length];source(target.dataset.source);target.focus();}};});
updateSteps('idle');
$('source-url').oninput=()=>{invalidate();updateSiteRule();};$('source-url').onchange=applySiteRule;$('source-url').onkeydown=event=>{if(event.key==='Enter')applySiteRule();};$('html-code').oninput=()=>{state.file=null;state.entries.clear();put($('html-file-info'), 'Using pasted HTML.');$('entry-label').hidden=true;invalidate();};
$('clear-url').onclick=()=>{if(state.busy||state.loading)return;$('source-url').value='';invalidate();updateSiteRule();$('source-url').focus();};
$('clear-html').onclick=()=>{if(state.busy||state.loading)return;state.file=null;state.entries.clear();$('html-file').value='';$('html-code').value='';$('html-entry').replaceChildren();$('entry-label').hidden=true;put($('html-file-info'),'');invalidate();$('html-code').focus();};
$('clear-images').onclick=()=>{if(state.busy||state.loading)return;state.items.forEach(item=>URL.revokeObjectURL(item.url));state.items=[];$('image-files').value='';invalidate();renderImages();$('image-files').focus();};
$('paste-url').onclick=async()=>{try{const value=await navigator.clipboard.readText();if(!state.busy){$('source-url').value=value;invalidate();applySiteRule();}}catch{error('Paste directly into the URL field; clipboard access is unavailable.');$('source-url').focus();}};
function warnings(messages){$('conversion-warnings').replaceChildren(...messages.map(text=>{const li=document.createElement('li');if(isExtension&&text==='Loading was skipped. Some content may be missing.'){li.dataset.q='skipped';li.textContent=QuickText.text('skipped');}else put(li,text);return li;}));$('conversion-warnings').hidden=!messages.length;$('warning-summary').hidden=!messages.length;put($('warning-summary'),state.blobUrl?'PDF created with notes. You can download it now; review the items below.':'Preview notes — review these before printing.');$('review-loading').hidden=!(state.source==='web'&&messages.some(text=>/fonts|images|scroll/i.test(text)));}
async function selectHtml(file){if(!file||state.busy||state.loading)return;invalidate();loading(true);state.file=null;state.entries.clear();$('entry-label').hidden=true;put($('html-file-info'), 'Reading file…');await vendor();try{
  if(/\.zip$/i.test(file.name)){state.entries=await readPackage(file);const htmls=[...state.entries.keys()].filter(name=>/\.html?$/i.test(name));if(!htmls.length)throw Error('No HTML file was found in the ZIP.');$('html-entry').replaceChildren(...htmls.map(name=>new Option(name,name)));$('entry-label').hidden=false;}
  else if(!/\.html?$/i.test(file.name))throw Error('Choose an HTML file or ZIP.');
  else if(file.size>2*1024*1024)throw Error('HTML files must be smaller than 2 MB.');
  state.file=file;await loadHtmlEntry();$('html-file-info').textContent=file.name;
}catch(exception){error(exception.message);put($('html-file-info'), 'No file loaded.');}finally{loading(false);}}
async function loadHtmlEntry(){if(!state.file)return;await vendor();try{const bytes=state.entries.size?state.entries.get($('html-entry').value):new Uint8Array(await state.file.arrayBuffer());$('html-code').value=decode(bytes,$('html-encoding').value);invalidate();}catch(exception){$('html-code').value='';error(exception.message);}}
$('html-file').onchange=event=>selectHtml(event.target.files[0]);$('html-entry').onchange=loadHtmlEntry;$('html-encoding').onchange=loadHtmlEntry;
async function addImages(files){if(state.busy||state.loading)return;invalidate();loading(true);try{for(const file of files){if(state.items.length>=imageLimits.count)throw Error('Choose at most 30 images.');if(state.items.reduce((sum,item)=>sum+item.file.size,0)+file.size>imageLimits.bytes)throw Error('Combined images must be smaller than 60 MB.');const info=await inspectImage(file);if(state.items.reduce((sum,item)=>sum+item.width*item.height,0)+info.width*info.height>imageLimits.pixels)throw Error('Combined images must be at most 80 megapixels.');state.items.push({id:crypto.randomUUID(),file,...info,rotation:0,url:URL.createObjectURL(file)});}}catch(exception){error(exception.message);}finally{loading(false);renderImages();updateSteps('idle');suggestName();}}
function renderImages(){syncClear();const list=$('image-list');list.replaceChildren();state.items.forEach((item,index)=>{const li=document.createElement('li');li.className='image-row';li.draggable=true;li.dataset.id=item.id;const img=document.createElement('img');img.src=item.url;img.alt=(window.GCD_I18N ? window.GCD_I18N.text('') : '');img.style.transform=`rotate(${item.rotation}deg)`;const info=document.createElement('div');info.className='image-info';const title=document.createElement('strong');title.textContent=item.file.name;const size=document.createElement('small');(window.GCD_I18N ? window.GCD_I18N.write(size, `${item.width} × ${item.height} · ${index+1} of ${state.items.length}`) : (size.textContent=`${item.width} × ${item.height} · ${index+1} of ${state.items.length}`));const actions=document.createElement('div');actions.className='button-row';[['up','↑'],['down','↓'],['rotate','Rotate'],['remove','Remove']].forEach(([action,label])=>{const button=document.createElement('button');button.type='button';if(window.GCD_I18N)window.GCD_I18N.write(button,label);else button.textContent=label;button.setAttribute('aria-label',(window.GCD_I18N ? window.GCD_I18N.text(`${action} ${item.file.name}`) : `${action} ${item.file.name}`));button.disabled=state.busy||(action==='up'&&index===0)||(action==='down'&&index===state.items.length-1);button.onclick=()=>{if(state.busy)return;if(action==='remove'){URL.revokeObjectURL(item.url);state.items.splice(index,1);}else if(action==='rotate')item.rotation=(item.rotation+90)%360;else {const other=action==='up'?index-1:index+1;[state.items[index],state.items[other]]=[state.items[other],state.items[index]];}invalidate();renderImages();};actions.append(button);});info.append(title,size,actions);li.append(img,info);li.ondragstart=event=>{if(state.busy)return event.preventDefault();state.dragId=item.id;};li.ondragover=event=>event.preventDefault();li.ondrop=event=>{event.preventDefault();if(state.busy)return;const from=state.items.findIndex(i=>i.id===state.dragId);if(from<0)return;const [moving]=state.items.splice(from,1);state.items.splice(index,0,moving);invalidate();renderImages();};list.append(li);});}
$('image-files').onchange=event=>{addImages([...event.target.files]);event.target.value='';};
function dropzone(id,handler){const element=$(id);['dragenter','dragover'].forEach(type=>element.addEventListener(type,event=>{event.preventDefault();element.classList.add('dragging');}));['dragleave','drop'].forEach(type=>element.addEventListener(type,event=>{event.preventDefault();element.classList.remove('dragging');if(type==='drop')handler([...event.dataTransfer.files]);}));}
dropzone('image-drop',addImages);dropzone('html-drop',files=>selectHtml(files[0]));
['image-fit','image-quality','image-auto'].forEach(id=>$(id).onchange=invalidate);
function naming(){if(state.blobUrl)$('download-pdf').download=ConversionOptions.filename($('pdf-filename').value);}
function suggestName(){if(isExtension||nameEdited)return;let value='my-document';if(state.source==='web'){try{const url=new URL(normalizeWebUrl($('source-url').value));if(['http:','https:'].includes(url.protocol)&&!url.username&&!url.password){const last=url.pathname.split('/').filter(Boolean).pop()||'';let leaf='';try{leaf=decodeURIComponent(last);}catch{leaf=last;}leaf=leaf.replace(/\.[a-z0-9]{1,8}$/i,'');value=[url.hostname.replace(/^www\./i,'').replace(/\./g,'-'),leaf].filter(Boolean).join('-');}}catch{}}else if(state.source==='html'&&state.file)value=state.file.name.replace(/\.[^.]+$/,'');else if(state.source==='images'&&state.items.length)value=state.items[0].file.name.replace(/\.[^.]+$/,'');$('pdf-filename').value=(value.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').trim().slice(0,100)||'my-document');naming();}
$('pdf-filename').oninput=()=>{nameEdited=true;naming();};
function loading(value){state.loading=value;$('studio-fields').disabled=value;$('generate').disabled=value;syncTarget();tabs.forEach(tab=>tab.disabled=value);}
function busy(value){state.busy=value;(window.GCD_I18N ? window.GCD_I18N.write($('generate'), value?(isFirefoxExtension&&state.source==='web'?'Open print dialog':'Creating PDF…'):state.source==='html'?'Preview HTML & create PDF':isFirefoxExtension&&state.source==='web'?'Open print dialog':'Create PDF') : ($('generate').textContent=value?(isFirefoxExtension&&state.source==='web'?'Open print dialog':'Creating PDF…'):state.source==='html'?'Preview HTML & create PDF':isFirefoxExtension&&state.source==='web'?'Open print dialog':'Create PDF'));$('studio-fields').disabled=value;$('generate').disabled=value;tabs.forEach(tab=>tab.disabled=value);$('cancel-conversion').hidden=!value;$('studio-form').setAttribute('aria-busy',value);syncTarget();}
async function engine(){if(window.html2pdf)return;await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=isExtension?'vendor/html2pdf.bundle.min.js':'/assets/vendor/html2pdf.bundle.min.js';const timer=setTimeout(()=>reject(Error('PDF engine load timed out.')),15000);script.onload=()=>{clearTimeout(timer);resolve();};script.onerror=()=>{clearTimeout(timer);reject(Error('PDF engine unavailable. Reload and retry.'));};document.head.append(script);});}
const VENDOR_LIBS=['pdf-lib.min.js','fflate.js','purify.min.js'];let vendorReady;
async function vendor(){if(window.PDFLib&&window.fflate&&window.DOMPurify)return;if(!vendorReady)vendorReady=(async()=>{for(const name of VENDOR_LIBS){if(document.querySelector('script[src$="'+name+'"]'))continue;await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=(isExtension?'vendor/':'/assets/vendor/')+name;const timer=setTimeout(()=>reject(Error('PDF engine load timed out.')),20000);script.onload=()=>{clearTimeout(timer);resolve();};script.onerror=()=>{clearTimeout(timer);reject(Error('PDF engine unavailable. Reload and retry.'));};document.head.append(script);});}})().catch(exception=>{vendorReady=null;throw exception;});return vendorReady;}
async function htmlPdf(options,signal){
  const remoteImages=$('html-remote-images');if(remoteImages)options.remoteImages=!!remoteImages.checked;
  state.html=await prepareHtml({text:$('html-code').value,entries:state.entries,entry:state.entries.size?$('html-entry').value:'index.html',encoding:$('html-encoding').value},options);
  const frame=$('html-preview');frame.hidden=false;$('preview-empty').hidden=true;
  const [w,h]=ConversionOptions.dimensions(options),m=options.marginsMm;frame.style.height='480px';
  const doc=await mountDocument(frame,state.html.html);$('print-html').hidden=false;
  // Retain a local print preview even when raster export exceeds the browser canvas limit.
  const printableWidth=Math.floor((w-m.left-m.right)*96/25.4);
  doc.body.style.width=printableWidth+'px';
  if(doc.body.scrollHeight>14000 || doc.body.scrollHeight*printableWidth>14000000)throw Error('This HTML is too long for image-based PDF export. Use Print / save searchable PDF instead.');
  if(signal.aborted)throw new DOMException('Cancelled','AbortError');
  await engine();
  const bytes=await html2pdf().set({margin:[m.top,m.left,m.bottom,m.right],image:{type:'jpeg',quality:.92},html2canvas:{scrollX:0,scrollY:0,scale:1.5,backgroundColor:'#fff',useCORS:false,logging:false},jsPDF:{unit:'mm',format:[w,h],orientation:options.orientation},pagebreak:{mode:['css','legacy'],avoid:['img','h1','h2','h3']}}).from(doc.body).outputPdf('arraybuffer');
  const original=await PDFLib.PDFDocument.load(bytes);let result=original;
  if(options.pageRanges){result=await PDFLib.PDFDocument.create();const pages=await result.copyPages(original,ConversionOptions.rangeIndices(options.pageRanges,original.getPageCount()));pages.forEach(page=>result.addPage(page));}
  return {blob:new Blob([await result.save()],{type:'application/pdf'}),pages:result.getPageCount(),warnings:[...state.html.warnings,'ui.warning.imageBasedPdf']};
}
async function webPdf(options,signal,onReady=()=>{}){
  if(isExtension){
    if(!targetTab||!targetReady)throw Error('Choose an open webpage in Source webpage before converting.');
    const printTarget=targetTab,cancel=()=>message({type:'CANCEL_PRINT',tabId:printTarget}).catch(()=>{});
    signal.addEventListener('abort',cancel,{once:true});
    let result;
    try{signal.throwIfAborted();result=quickWorkspace?await quickWorkspace.run(options,signal):await message({type:'PRINT_TO_PDF',tabId:printTarget,options});signal.throwIfAborted();}
    catch(exception){signal.throwIfAborted();throw exception;}
    finally{signal.removeEventListener('abort',cancel);}
    if(result&&result.manual)return {manual:true};
    const bytes=Uint8Array.from(atob(result.data),c=>c.charCodeAt(0));
    const pdf=await PDFLib.PDFDocument.load(bytes);
    return {blob:new Blob([bytes],{type:'application/pdf'}),pages:pdf.getPageCount(),warnings:result.warnings||[]};
  }
  let url;try{url=new URL(normalizeWebUrl($('source-url').value));if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error();}catch{throw Error('Enter a public HTTP(S) URL without embedded credentials.');}
  $('source-url').value=url.href;
  const reference=regionPicker?.reference();if(reference){options._regionPreview=reference;track('region_conversion_started',{source:'web'});}
  try{const result=await Jobs.run(url.href,options,$('pdf-filename').value,signal,stage=>{if(stage==='fetching')onReady();const title={queued:'Queued — your PDF will start shortly.',rendering:'Rendering your webpage…',cancelling:'Cancelling your conversion…',fetching:'PDF created. Retrieving your file…'}[stage];feedback('working',title||'Creating your PDF…','You can recover this task from Batch & history even after refreshing this page.');});if(reference){regionPicker.consumed();track('region_conversion_success',{source:'web'});}return result;}catch(e){if(reference)track(e.name==='AbortError'?'region_conversion_cancelled':'region_conversion_failed',{source:'web'});if(reference&&!['QUOTA_EXCEEDED','AUTH_REQUIRED','RATE_LIMITED'].includes(e.code))regionPicker.consumed();if(typeof e.code==='string'&&e.code.startsWith('PREVIEW_'))e.message=previewError(e.code);throw e;}
}
$('studio-form').onsubmit=async event=>{event.preventDefault();if(state.busy||state.loading||starting)return;if(state.source==='web'&&!isExtension)applySiteRule();invalidate();if(!requireSource())return;starting=true;let timer,slowTimer,timedOut=false;
  try{if(!(state.source==='web'&&!isExtension))await vendor();if(isExtension&&!isFirefoxExtension&&state.source==='web'){await quickReady;await quickWorkspace.before();}const options=isFirefoxExtension&&state.source==='web'?ConversionOptions.normalize({}):controls.read();state.controller=new AbortController();const signal=state.controller.signal;busy(true);track('conversion_started',{source:state.source});feedback('working','Creating your PDF…',state.source==='web'?'Waiting for the webpage and PDF result. Keep this page open; there is no need to submit again.':'Processing on this device. Keep this page open until your PDF is ready.');slowTimer=setTimeout(()=>feedback('working','Still creating your PDF…',state.source==='web'&&!isExtension?'This is taking longer. You can wait, cancel the task, or recover it later from Batch & history.':'This is taking longer. You can keep waiting or stop; your input will stay here.'),15000);timer=setTimeout(()=>{timedOut=true;state.controller.abort();},70000);if(quickWorkspace&&state.source==='web')quickWorkspace.stage('preparing');
    const result=state.source==='web'?await webPdf(options,signal,()=>{clearTimeout(timer);clearTimeout(slowTimer);}):state.source==='html'?await htmlPdf(options,signal):await imagesToPdf(state.items,options,{fit:$('image-fit').value,quality:$('image-quality').value,autoOrientation:$('image-auto').checked},signal,(n,total)=>{feedback('working',`Preparing image ${n} of ${total}…`,'Images are processed locally, one at a time.');});
    clearTimeout(timer);clearTimeout(slowTimer);
    if(result&&result.manual){feedback('stopped',tx('Print dialog requested'),tx('In Firefox, choose Save as PDF in the print dialog. This workspace cannot confirm whether you saved or cancelled.'));return;}
    if(signal.aborted&&!(state.source==='web'&&!isExtension))throw new DOMException('Stopped','AbortError');
    if(!isExtension){const _src=state.source==='web'?($('source-url').value||''):'';const _host=_src?(()=>{try{return new URL(_src).hostname}catch{return ''}})():'';window.GCDUsage?.record({type:state.source==='web'?'online':'file',id:state.source==='web'?(sessionStorage.getItem('gcd-last-task')||undefined):undefined,title:_host||undefined,source:_src||undefined,pages:result&&result.pages});}
    state.blobUrl=URL.createObjectURL(result.blob);$('pdf-preview').src=state.blobUrl;$('pdf-preview').hidden=false;$('html-preview').hidden=true;$('preview-empty').hidden=true;
    ['download-pdf','open-pdf'].forEach(id=>{$(id).href=state.blobUrl;$(id).hidden=false;});naming();warnings(result.warnings);
    if(quickWorkspace&&state.source==='web')await quickWorkspace.success(result,options);
    feedback('ready',`PDF ready · ${result.pages} pages · ${(result.blob.size/1024).toFixed(0)} KB`,'Download your PDF below. If the preview is blank, choose Open PDF. Downloading again uses the same file.');track('conversion_success',{source:state.source});try{if(!localStorage.getItem('gcd-first-conversion-v1')){localStorage.setItem('gcd-first-conversion-v1','1');track('first_conversion_success',{source:state.source});}}catch{}revealResult();
  }catch(exception){
    if(quickWorkspace&&state.source==='web')quickWorkspace.failure({code:timedOut?'TIMEOUT':exception.name==='AbortError'?'CANCELLED':exception.code,message:exception.message});
    if(exception.code==='RESULT_FETCH_FAILED'){error('');feedback('stopped','PDF created, but the download could not be retrieved.','Retrieve the completed PDF again, or download it from Batch & history. No new conversion is needed.');put($('retry-conversion'),'Retrieve PDF again');revealResult();}
    else if(exception.name==='AbortError')feedback('stopped',timedOut?'Conversion time limit reached.':'Conversion cancelled.',state.source==='web'&&!isExtension?'Your input is kept. Cancellation was confirmed; any reserved allowance is returned. Completed results remain in Batch & history.':'Your input is kept. Choose Create PDF when you are ready to try again.');
    else{error(exception instanceof TypeError&&/fetch|network/i.test(exception.message)?'Could not connect to the conversion service. Check your connection and try again.':exception.message);allowanceHelp(exception.code);track('conversion_failed',{source:state.source,code:['QUOTA_EXCEEDED','AUTH_REQUIRED','RATE_LIMITED'].includes(exception.code)?exception.code:'OTHER'});feedback('failed','PDF could not be created.','Your input and settings are kept. Check the message beside Create PDF, adjust if needed, then try again.');if(state.html)warnings(state.html.warnings);$('studio-error').focus({preventScroll:true});$('studio-error').scrollIntoView({block:'nearest',behavior:'auto'});}
  }
  finally{starting=false;clearTimeout(timer);clearTimeout(slowTimer);busy(false);state.controller=null;}

};
// The server-rendered form can paint before deferred startup finishes.
// Enable submission only after the conversion handler is installed.
if(!isExtension)$('generate').disabled=false;
if($('studio-startup'))$('studio-startup').hidden=true;
$('review-loading').onclick=()=>{const field=controls.field('loading');field.closest('details').open=true;field.focus();put($('result-guidance'), 'If the PDF is missing images or fonts, choose Patient loading, optionally enable scrolling, then create a new PDF. A new cloud conversion uses your allowance.');};
$('retry-conversion').onclick=()=>{if(!state.busy&&!state.loading)$('studio-form').requestSubmit();};
$('download-pdf').onclick=()=>{$('download-note').hidden=false;put($('download-note'), 'Download requested. Check your browser’s downloads; this does not create another conversion.');};
$('cancel-conversion').onclick=()=>{state.controller?.abort();if(state.source==='web'&&!isExtension)feedback('working','Cancelling your conversion…','Waiting for the server to confirm cancellation.');};
$('print-html').onclick=()=>{const frame=$('html-preview');frame.hidden=false;frame.contentWindow.focus();frame.contentWindow.print();};
// A mobile browser can fire pagehide while handing a blob PDF to its viewer.
// Keep the URL alive until the result is replaced; the document owns it and
// the browser releases it when this page is actually discarded.
window.addEventListener('pagehide',()=>{quickWorkspace?.disposed();state.html?.release();state.items.forEach(item=>URL.revokeObjectURL(item.url));});
if(!isExtension)put($('cancel-conversion'), 'Cancel conversion');
const tab=new URLSearchParams(location.search).get('tab');if(!isExtension&&tab==='file')location.replace('documents.html?mode=data');else if(!isExtension&&tab==='chat')location.replace('documents.html?mode=conversation');else if(['html','images'].includes(tab))source(tab);
const store=window.SITE?.STORE_URL;if($('extension-link') && store && /^https:\/\/(chromewebstore.google.com|chrome.google.com)\//.test(store) && !/\.\.\.|REPLACE/.test(store)){$('extension-link').href=store;$('extension-link').target='_blank';$('extension-link').rel='noopener';}
const extensionHelp=$('extension-help');
if(extensionHelp){
  const showExtensionHelp=(focus=false)=>{extensionHelp.open=true;requestAnimationFrame(()=>{extensionHelp.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});if(focus)extensionHelp.querySelector('summary').focus({preventScroll:true});});};
  document.querySelectorAll('a[href="#extension-help"]').forEach(link=>link.addEventListener('click',event=>{event.preventDefault();if(location.hash!=='#extension-help')history.pushState(null,'','#extension-help');showExtensionHelp(true);}));
  if(location.hash==='#extension-help')showExtensionHelp();
  window.addEventListener('hashchange',()=>{if(location.hash==='#extension-help')showExtensionHelp();});
}

if(isExtension){
  if(isFirefoxExtension){firefoxControls();localize($('generate'),'Open print dialog');localize($('engine-note'),'Firefox opens the browser print dialog. Choose Save as PDF there; paper and margins are set in that dialog.');}
  $('paste-url').hidden=true;
  put(document.querySelector('#source-web .privacy-note'), 'This page is processed locally in your desktop browser. No content is uploaded.');
  if(!isFirefoxExtension)put($('engine-note'), 'Local extension conversion. Closing this workspace discards its result; keep it open until you save.');
  const buttons=document.createElement('div');buttons.className='selection-tools';
  const pickerLabels=()=>Object.fromEntries(Object.entries({title:'Choose PDF content',choose:'Click a region, then confirm.',selected:'Selected region',hidden:'Excluded elements: {count}',undo:'Undo hide',done:'Finish cleanup',grow:'Expand selection',shrink:'Reduce selection',again:'Select again',confirm:'Confirm selection',cancel:'Cancel'}).map(([key,value])=>[key,tx(value)]));
  let pickButton;
  for(const [label,payload] of [['Pick content',{type:'PICK_ELEMENT',mode:'select'}],['Hide an element',{type:'PICK_ELEMENT',mode:'hide'}],['Undo hide',{type:'UNDO_HIDDEN',all:false}],['Restore hidden elements',{type:'UNDO_HIDDEN',all:true}],['Apply cleanup preview',{type:'PAGE_PREPARE'}],['Restore page',{type:'PAGE_RESTORE'}]]){
    const button=document.createElement('button');button.type='button';localize(button,label);
    if(payload.type==='PICK_ELEMENT'&&payload.mode==='select'){pickButton=button;button.hidden=true;}
    button.onclick=async()=>{const preview=payload.type==='PAGE_PREPARE';try{if(preview)loading(true);const result=await message({...payload,tabId:targetTab,labels:pickerLabels(),...(preview?{options:controls.read()}:{})});invalidate();if(result.warnings)warnings(result.warnings);if(preview){put($('conversion-status'), 'Preview applied to the source webpage. Review it, then return to create the PDF or restore the page.');await chrome.tabs.update(targetTab,{active:true});}}catch(e){error(e.message);}finally{if(preview)loading(false);}};buttons.append(button);
  }
  window.addEventListener('gcd:pick-content',()=>{if(!isFirefoxExtension&&targetReady&&!state.busy)pickButton.click();});
  if(isFirefoxExtension)buttons.hidden=true;
  $('source-web').append(buttons);
  syncTarget=()=>{$('generate').disabled=state.busy||state.loading||!quickInitialized||(state.source==='web'&&!targetReady);buttons.querySelectorAll('button').forEach(b=>b.disabled=state.busy||state.loading||!quickInitialized||!targetReady);};
  mountSource(targetTab,(id,valid,tab,changed)=>{const previous=targetTab;if(changed&&previous&&previous!==id){message({type:'UNDO_HIDDEN',tabId:previous,all:true}).catch(()=>{});message({type:'PAGE_RESTORE',tabId:previous}).catch(()=>{});}targetTab=id;targetReady=valid;if(changed){controls.field('content').value='full';controls.field('selector').value='';controls.setEngine(state.source==='web'?'extension':state.source);invalidate();if(tab)$('pdf-filename').value=tab.title||'webpage';applySiteRule();}else updateSiteRule();syncTarget();refreshContentSummary();resolveFirstTarget();window.dispatchEvent(new Event('gcd:extension-source'));},syncTarget,()=>state.busy||state.loading);
  window.addEventListener('gcd:batch-tabs',async event=>{
    const status=event.detail?.status,ids=[...new Set(event.detail?.ids||[])];
    if(isFirefoxExtension){if(status)put(status, 'Tab bundles are available in Chrome and Edge.');return;}
    if(state.busy||state.loading)return;
    if(!ids.length||ids.length>10){if(status)put(status, 'Select between 1 and 10 webpages.');return;}
    let options;try{options=controls.read();}catch(exception){if(status)put(status,exception.message);return;}
    const files=Object.create(null),failed=[];let totalBytes=0,completed=0;
    state.controller=new AbortController();busy(true);
    try{
      for(let index=0;index<ids.length;index++){
        if(state.controller.signal.aborted){for(let remaining=index;remaining<ids.length;remaining++)failed.push(`${remaining+1}: ${tx('Cancelled before conversion.')}`);break;}
        const id=ids[index];
        if(status)put(status, tx('Preparing webpage {current} of {total}…').replace('{current}',String(index+1)).replace('{total}',String(ids.length)));
        try{
          const tab=await chrome.tabs.get(id);if(!ExtensionSource.supported(tab))throw Error(tx('Unsupported webpage'));
          const result=await message({type:'PRINT_TO_PDF',tabId:id,options});
          if(result.manual)throw Error(tx('Manual print is unavailable in a tab bundle.'));
          const bytes=Uint8Array.from(atob(result.data),char=>char.charCodeAt(0));
          if(totalBytes+bytes.byteLength>100*1024*1024){for(let remaining=index;remaining<ids.length;remaining++)failed.push(`${remaining+1}: ${tx('Skipped after bundle size limit.')}`);break;}
          totalBytes+=bytes.byteLength;
          const base=String(result.title||tab.title||`webpage-${index+1}`).replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').trim().slice(0,90)||`webpage-${index+1}`;
          let name=`${String(index+1).padStart(2,'0')}-${base}.pdf`,suffix=1;
          while(files[name])name=`${String(index+1).padStart(2,'0')}-${base}-${suffix++}.pdf`;
          files[name]=bytes;completed++;
        }catch(exception){failed.push(`${index+1}: ${tx(String(exception.message||exception)).slice(0,240)}`);}
      }
      if(!completed)throw Error(tx('No PDFs could be created.'));
      files['batch-report.txt']=new TextEncoder().encode(`${tx('{count} PDFs created.').replace('{count}',String(completed))}\n${failed.length?tx('Failed tabs:')+'\n'+failed.join('\n'):tx('All selected webpages converted.')}`);
      const zipped=fflate.zipSync(files,{level:6});
      if(zipped.byteLength>120*1024*1024)throw Error(tx('The ZIP exceeds the 120 MB download limit.'));
      const url=URL.createObjectURL(new Blob([zipped],{type:'application/zip'})),anchor=document.createElement('a');
      anchor.href=url;anchor.download='goodconvertpdf-tab-bundle.zip';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
      if(status)put(status, tx('{success} PDFs added to the ZIP; {failed} failed.').replace('{success}',String(completed)).replace('{failed}',String(failed.length)));
    }catch(exception){if(status)(window.GCD_I18N ? window.GCD_I18N.write(status, tx(String(exception.message||exception))) : (status.textContent=tx(String(exception.message||exception))));}finally{busy(false);state.controller=null;}
  });
  SessionStore.onChanged((changes)=>{if(changes['content-change:'+targetTab])refreshContentSummary();const progress=changes['progress:'+targetTab]?.newValue;if(progress&&state.busy){quickWorkspace?.stage(progress.stage);const labels={scrolling:'Scrolling to load page content…',article:'Identifying the main article…',resources:'Waiting for visible images and fonts…',printing:'Creating your PDF…'};if(!quickWorkspace&&labels[progress.stage])$('conversion-status').textContent=tx(labels[progress.stage]);}const value=changes['selection:'+targetTab]?.newValue;if(value){if(value.mode==='select')controls.setSelection(value.selector);else invalidate();(window.GCD_I18N ? window.GCD_I18N.write($('conversion-status'), value.mode==='select'?'Selected element ready. Return here to create the PDF.':'Element hidden. Undo or restore is available.') : ($('conversion-status').textContent=value.mode==='select'?'Selected element ready. Return here to create the PDF.':'Element hidden. Undo or restore is available.'));SessionStore.remove('selection:'+targetTab);quickWorkspace?.selection(value);}});
  const draft=new URLSearchParams(location.search).get('draft');
  if(draft)SessionStore.get(draft).then(async stored=>{const value=stored[draft];await SessionStore.remove(draft);if(value){source('html');$('html-code').value=value.html;$('pdf-filename').value=value.title||'document';}});
}
import {installEnhance} from './pdf-handoff.js';
installEnhance('download-pdf', 'open-pdf');
// 修正锚点定位：#layout-controls 由 mountControls 填充，浏览器先前的碎片跳转会停在旧坐标，
// 内容被推下后就会"跳偏"。布局稳定后重新对齐；若用户已主动滚动/按键则不再打断。
(() => {
  const raw = location.hash;
  if (!raw || raw.length < 2) return;
  let target = null;
  try { target = document.getElementById(decodeURIComponent(raw.slice(1))); } catch (e) { return; }
  if (!target) return;
  let userMoved = false;
  ['wheel', 'touchstart', 'keydown'].forEach(type =>
    addEventListener(type, () => { userMoved = true; }, { once: true, passive: true }));
  const align = () => { if (!userMoved) target.scrollIntoView({ behavior: 'auto', block: 'start' }); };
  align();
  requestAnimationFrame(align);
  addEventListener('load', align, { once: true });
})();
import {mountSource} from './extension-source-ui.js';

if(isExtension&&!isFirefoxExtension){$('studio-fields').disabled=true;quickReady=import('../quick-workspace.js').then(async({mountQuickWorkspace})=>{quickWorkspace=await mountQuickWorkspace({controls,firstTarget,target:()=>targetTab,busy:()=>state.busy,cancel:()=>$('cancel-conversion').click(),feedback,submit:()=>$('studio-form').requestSubmit()});quickWorkspace.sourceType(state.source);quickInitialized=true;$('studio-fields').disabled=false;syncTarget();}).catch(exception=>{error(exception.message);throw exception;});}

