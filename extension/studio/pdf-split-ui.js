// Split tool UI. Mirrors the merge tool: everything happens in this tab.
import {build,planParts} from './pdf-split.js';
import {inspect} from './pdf-enhance.js';
const T=value=>window.GCD_I18N?.text(value)||value;
const put=(el,v)=>{if(!el)return;if(window.GCD_I18N)window.GCD_I18N.write(el,v);else el.textContent=v;};
const $=id=>document.getElementById(id);
let file=null,url=null,busy=false,controller;
function clearResult(){
 if(url)URL.revokeObjectURL(url);url=null;
 $('split-download').hidden=true;$('split-download').removeAttribute('href');
 $('split-error').hidden=true;
}
function error(e){clearResult();(window.GCD_I18N ? window.GCD_I18N.write($('split-error'), e&&e.message?e.message:String(e)) : ($('split-error').textContent=e&&e.message?e.message:String(e)));$('split-error').hidden=false;}
function status(text){(window.GCD_I18N ? window.GCD_I18N.write($('split-status'), text) : ($('split-status').textContent=text));}
function lock(value){
 busy=value;
 $('split-fields').disabled=value;
 $('split-create').disabled=value||!file;
 $('split-cancel').hidden=!value;
 for(const id of ['split-file','split-mode-select','split-size','split-ranges'])$(id).disabled=value;
}
function options(){
 const mode=$('split-mode-select').value;
 return mode==='every'?{size:$('split-size').value}:{value:$('split-ranges').value};
}
function plan(){
 if(!file){put($('split-plan'), 'Choose a PDF to see how many parts you will get.');return false;}
 try{
  const parts=planParts(file.pages,$('split-mode-select').value,options());
  const sizes=new Set(parts.map(p=>p.indices.length));
  const total=parts.reduce((n,p)=>n+p.indices.length,0);
  const planText=[T(`${parts.length} file(s)`)+' · '+T(`${total} pages`)];
  if(sizes.size===1)planText.push(T(`${[...sizes][0]} page(s) each`));
  planText.push(T(`Example name: ${parts[0].label}.pdf`));
  $('split-plan').textContent=planText.join(' · ');
  $('split-error').hidden=true;return true;
 }catch(e){$('split-plan').textContent='';put($('split-error'),e.message);$('split-error').hidden=false;return false;}
}
function syncMode(){
 const every=$('split-mode-select').value==='every';
 $('split-size-row').hidden=!every;$('split-ranges-row').hidden=every;
 clearResult();plan();$('split-create').disabled=busy||!file;
}
async function pick(files){
 if(busy)return;
 clearResult();
 const chosen=[...(files||[])].filter(f=>f&&(f.type==='application/pdf'||/\.pdf$/i.test(f.name||'')))[0];
 if(!chosen){file=null;status('Your original file is kept unchanged.');lock(false);return;}
 lock(true);status('Reading PDF…');
 try{
  const bytes=new Uint8Array(await chosen.arrayBuffer());
  const info=await inspect(bytes);
  file={name:chosen.name,bytes,pages:info.pages};
  status(`${info.pages} page(s) ready. Choose how to split.`);
  const max=Math.max(1,info.pages);
  $('split-size').max=String(max);
  if(Number($('split-size').value)>max)$('split-size').value=String(max);
  syncMode();
 }catch(e){file=null;status('Your original file is kept unchanged.');error(e);}
 finally{lock(false);plan();}
}
$('split-file').onchange=e=>pick(e.target.files);
$('split-mode-select').onchange=syncMode;
$('split-size').oninput=()=>{clearResult();plan();};
$('split-ranges').oninput=()=>{clearResult();plan();};
$('split-cancel').onclick=()=>{controller?.abort();status('Cancelling…');};
$('split-create').onclick=async()=>{
 if(busy||!file)return;
 if(!plan())return;
 clearResult();lock(true);controller=new AbortController();
 const worked=Date.now();
 try{
  const result=await build(file,$('split-mode-select').value,options(),controller.signal,text=>status(text));
  const stem=String(file.name||'document').replace(/\.pdf$/i,'')||'document';
  const blob=new Blob([result.zip],{type:'application/zip'});
  url=URL.createObjectURL(blob);
  const link=$('split-download');
  link.href=url;link.download=`${stem}-split.zip`;link.hidden=false;
  if(result.warnings.length)status(T(`${result.count} file(s) created in ${Math.max(1,Math.round((Date.now()-worked)/1000))}s.`)+' '+result.warnings[0]);
  else status(T(`${result.count} file(s) created from ${result.pages} pages.`));
 }catch(e){if(e.name==='AbortError')status('Splitting cancelled. Nothing was saved.');else error(e);}
 finally{lock(false);plan();}
};
plan();
window.addEventListener('languagechange',plan);
