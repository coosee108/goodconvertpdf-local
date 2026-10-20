import {inspect,build,LIMITS} from './pdf-enhance.js';
const $=id=>document.getElementById(id);let items=[],busy=false,url=null,controller,lastResult=null;
const T=value=>window.GCD_I18N?.text(value)||value;
const put=(el,v)=>{if(!el)return;if(window.GCD_I18N)window.GCD_I18N.write(el,v);else el.textContent=v;};
const sizeLabel=bytes=>bytes<1024*1024?`${Math.max(1,Math.round(bytes/1024))} KB`:`${(bytes/1024/1024).toFixed(1)} MB`;
function clear(){if(url)URL.revokeObjectURL(url);url=null;lastResult=null;for(const id of ['enhance-download','enhance-open','enhance-preview']){$(id).hidden=true;$(id).removeAttribute(id==='enhance-preview'?'src':'href');} $('enhance-continue').hidden=true;$('enhance-error').hidden=true;}
function error(e){put($('enhance-error'),e.message||String(e));$('enhance-error').hidden=false;}
function lock(value,cancellable=false){busy=value;$('enhance-fields').disabled=value;$('enhance-create').disabled=value||!items.length;$('enhance-cancel').hidden=!value||!cancellable;}
function render(){const list=$('pdf-list');list.replaceChildren();items.forEach((item,index)=>{const li=document.createElement('li');li.className='pdf-file-row';const title=document.createElement('strong');title.textContent=`${index+1}. ${item.name}`;li.append(title);const info=document.createElement('small');(window.GCD_I18N ? window.GCD_I18N.write(info, `${item.info.pages} pages · ${sizeLabel(item.bytes.length)}`) : (info.textContent=`${item.info.pages} pages · ${sizeLabel(item.bytes.length)}`));li.append(info);const label=document.createElement('label');put(label, 'Pages to keep');const range=document.createElement('input');range.placeholder=(window.GCD_I18N ? window.GCD_I18N.text('All pages, or 1-3, 5') : 'All pages, or 1-3, 5');range.value=item.range;range.setAttribute('aria-label',(window.GCD_I18N ? window.GCD_I18N.text(`Pages from ${item.name}`) : `Pages from ${item.name}`));range.oninput=()=>{item.range=range.value;clear();put($('enhance-status'), 'Page selection changed. Generate to preview.');};label.append(range);li.append(label);const row=document.createElement('div');row.className='button-row';for(const [name,delta] of [['Move up',-1],['Move down',1],['Remove',0]]){const b=document.createElement('button');b.type='button';put(b,name);b.setAttribute('aria-label',(window.GCD_I18N ? window.GCD_I18N.text(T(name)+' '+item.name) : T(name)+' '+item.name));b.disabled=delta!==0&&(index+delta<0||index+delta>=items.length);b.onclick=()=>{clear();if(delta)[items[index],items[index+delta]]=[items[index+delta],items[index]];else items.splice(index,1);render();put($('enhance-status'), 'Files changed. Generate to preview.');};row.append(b);}li.append(row);list.append(li);});(window.GCD_I18N ? window.GCD_I18N.write($('pdf-summary'), `${items.length} file(s) · ${items.reduce((n,i)=>n+i.info.pages,0)} source pages`) : ($('pdf-summary').textContent=`${items.length} file(s) · ${items.reduce((n,i)=>n+i.info.pages,0)} source pages`)); $('enhance-create').disabled=busy||!items.length;}
async function add(files){
 if(busy)return;
 files=[...files].filter(f=>f&&(f.type==='application/pdf'||/\.pdf$/i.test(f.name||'')));
 if(!files.length)return;
 clear();
 const added=[],failed=[];
 lock(true);
 try{
  for(const f of files){
   if(items.length+added.length>=LIMITS.files){failed.push(`${f.name}: ${T('Choose 1–10 PDF files.')}`);continue;}
   const used=items.reduce((n,i)=>n+i.bytes.length,0)+added.reduce((n,i)=>n+i.bytes.length,0);
   if(used+f.size>LIMITS.input){failed.push(`${f.name}: ${T('PDF inputs exceed 60 MB.')}`);continue;}
   try{
    (window.GCD_I18N ? window.GCD_I18N.write($('enhance-status'), `Reading ${f.name}…`) : ($('enhance-status').textContent=`Reading ${f.name}…`));
    const bytes=new Uint8Array(await f.arrayBuffer());
    added.push({name:f.name,bytes,info:await inspect(bytes),range:''});
   }catch(e){failed.push(`${f.name}: ${T(e&&e.message?e.message:String(e))}`);}
  }
  if(added.length){
   const first=!items.length;
   items.push(...added);
   if(first){for(const key of ['title','author','subject','keywords'])$('metadata-'+key).value=added[0].info[key];}
   (window.GCD_I18N ? window.GCD_I18N.write($('enhance-status'), `${added.length} file(s) ready. Arrange pages and choose finishing options.`) : ($('enhance-status').textContent=`${added.length} file(s) ready. Arrange pages and choose finishing options.`));
  }else{
   (window.GCD_I18N ? window.GCD_I18N.write($('enhance-status'), `${failed.length} file(s) could not be added. Existing inputs are kept. First reason: ${failed[0]}`) : ($('enhance-status').textContent=`${failed.length} file(s) could not be added. Existing inputs are kept. First reason: ${failed[0]}`));
  }
  if(failed.length)error(Error(T(failed.length===files.length?'No files were added.':'Some files were skipped.')+'\n'+failed.join('\n')));
 }finally{lock(false);render();$('pdf-files').value='';}
}
$('pdf-files').onchange=e=>add([...e.target.files]);
// Prominent drop zone: accept dragged PDFs alongside the click-to-choose input.
const dropZone=$('pdf-drop');
if(dropZone){
 ['dragenter','dragover'].forEach(type=>dropZone.addEventListener(type,e=>{e.preventDefault();dropZone.classList.add('dragging');}));
 ['dragleave','drop'].forEach(type=>dropZone.addEventListener(type,e=>{e.preventDefault();dropZone.classList.remove('dragging');}));
 dropZone.addEventListener('drop',e=>{const picked=[...(e.dataTransfer?.files||[])].filter(f=>f&&(f.type==='application/pdf'||/\.pdf$/i.test(f.name||'')));if(picked.length)add(picked);});
}
$('enhance-fields').addEventListener('input',e=>{if(e.target.id==='pdf-files')return;clear();put($('enhance-status'), 'Settings changed. Generate to preview.');});
$('enhance-cancel').onclick=()=>{controller?.abort();put($('enhance-status'), 'Cancelling…');};
$('enhance-create').onclick=async()=>{if(busy)return;clear();lock(true,true);controller=new AbortController();try{const value=id=>$(id).value,checked=id=>$(id).checked;const o={numbers:{enabled:checked('numbers-enabled'),template:value('numbers-template'),position:value('numbers-position'),start:Number(value('numbers-start')),size:Number(value('numbers-size')),color:value('numbers-color'),range:value('numbers-range'),includeCover:checked('numbers-cover')},watermark:{enabled:checked('watermark-enabled'),text:value('watermark-text'),color:value('watermark-color'),opacity:Number(value('watermark-opacity'))/100,angle:Number(value('watermark-angle')),size:Number(value('watermark-size'))/100,range:value('watermark-range'),includeCover:checked('watermark-cover')},cover:{enabled:checked('cover-enabled'),title:value('cover-title'),subtitle:value('cover-subtitle'),color:value('cover-color')},metadata:{enabled:checked('metadata-enabled'),...Object.fromEntries(['title','author','subject','keywords'].map(k=>[k,value('metadata-'+k)]))}};
 const result=await build(items,o,controller.signal,text=>(window.GCD_I18N ? window.GCD_I18N.write($('enhance-status'), text) : ($('enhance-status').textContent=text)));url=URL.createObjectURL(new Blob([result.bytes],{type:'application/pdf'}));for(const id of ['enhance-download','enhance-open']){$(id).href=url;$(id).hidden=false;}$('enhance-download').download=(value('enhance-name').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/\.pdf$/i,'').trim()||'finished-document')+'.pdf';$('enhance-preview').src=url;$('enhance-preview').hidden=false;lastResult={bytes:result.bytes,name:$('enhance-download').download};$('enhance-continue').hidden=false;(window.GCD_I18N ? window.GCD_I18N.write($('enhance-status'), `PDF ready · ${result.pages} pages · ${sizeLabel(result.bytes.length)}`) : ($('enhance-status').textContent=`PDF ready · ${result.pages} pages · ${sizeLabel(result.bytes.length)}`));
 if(result.warnings.length)$('enhance-status').textContent+=' · '+result.warnings.join(' ');
 }catch(e){if(e.name==='AbortError')put($('enhance-status'), 'Cancelled. Your inputs and settings are kept.');else{error(e);put($('enhance-status'), 'No new PDF was created. Review the message and try again.');}}finally{lock(false);controller=null;}};
$('enhance-download').onclick=()=>{put($('enhance-status'), 'Download requested. Check your browser downloads; your preview remains available.');};
// Continue enhancing in place: feed the generated PDF straight back as the only input.
$('enhance-continue').onclick=async()=>{if(busy||!lastResult)return;const {bytes,name}=lastResult;const file=new File([bytes],name,{type:'application/pdf'});lastResult=null;items=[];render();clear();put($('enhance-status'), 'Result loaded for another pass. Choose finishing options and generate again.');await add([file]);};
window.addEventListener('pagehide',()=>{controller?.abort();if(url)URL.revokeObjectURL(url);});
window.addEventListener('languagechange',render);
// Receive only a one-time, same-origin handoff from the window that opened us.
const nonce=new URLSearchParams(location.hash.slice(1)).get('handoff');if(window.opener&&/^[\w-]{36}$/.test(nonce||'')){const parent=window.opener;const receive=async e=>{if(e.source!==parent||e.origin!==location.origin||e.data?.type!=='gcd-pdf-transfer'||e.data.nonce!==nonce)return;window.removeEventListener('message',receive);history.replaceState(null,'',location.pathname);if(!(e.data.blob instanceof Blob)||e.data.blob.size>LIMITS.input){error(Error('Transferred PDF is invalid or too large.'));return;}await add([new File([e.data.blob],String(e.data.name||'converted.pdf'),{type:'application/pdf'})]);};window.addEventListener('message',receive);parent.postMessage({type:'gcd-pdf-ready',nonce},location.origin);}
// Search deep links reveal the requested controls without enabling an edit.
const section=new URLSearchParams(location.search).get('section');
const sectionTarget={files:'pdf-files',watermark:'watermark-text',numbers:'numbers-template',cover:'cover-title',metadata:'metadata-title'}[section];
if(sectionTarget){const field=document.getElementById(sectionTarget);const detail=field.closest('details');if(detail)detail.open=true;requestAnimationFrame(()=>{field.scrollIntoView({block:'center'});field.focus({preventScroll:true});});}
