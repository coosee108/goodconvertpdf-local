// Organize tool UI: drop, rotate and reorder pages of one PDF.
import {build,initialPlan,summary} from './pdf-organize.js';
import {inspect} from './pdf-enhance.js';
const $=id=>document.getElementById(id);
const T=value=>window.GCD_I18N?window.GCD_I18N.text(value):value;
const put=(el,value)=>{if(!el)return;if(window.GCD_I18N)window.GCD_I18N.write(el,value);else el.textContent=value;};
let file=null,plan=[],url=null,busy=false,controller;
const QUARTER=90;
function clearResult(){
 if(url)URL.revokeObjectURL(url);url=null;
 for(const id of ['organize-download','organize-open']){$(id).hidden=true;$(id).removeAttribute('href');}
 $('organize-error').hidden=true;
}
function error(e){clearResult();(window.GCD_I18N ? window.GCD_I18N.write($('organize-error'), e&&e.message?e.message:String(e)) : ($('organize-error').textContent=e&&e.message?e.message:String(e)));$('organize-error').hidden=false;}
function status(text){(window.GCD_I18N ? window.GCD_I18N.write($('organize-status'), text) : ($('organize-status').textContent=text));}
function lock(value){
 busy=value;
 $('organize-create').disabled=value||!file;
 $('organize-cancel').hidden=!value;
 for(const id of ['organize-file','organize-reset','organize-reverse'])$(id).disabled=value||!file;
}
function render(){
 const list=$('organize-list');list.replaceChildren();
 plan.forEach((entry,index)=>{
  const li=document.createElement('li');
  li.className='pdf-file-row'+(entry.removed?' removed':'');
  const title=document.createElement('strong');
  (window.GCD_I18N ? window.GCD_I18N.write(title, `${index+1}. Source page ${entry.source+1}`) : (title.textContent=`${index+1}. Source page ${entry.source+1}`));
  const info=document.createElement('small');
  const angle=(((entry.base+entry.turn)%360)+360)%360;
  info.textContent=[entry.removed?T('Removed'):T('Kept'),angle?T(`Rotated ${angle}°`):T('Original orientation')].filter(Boolean).join(' · ');
  const row=document.createElement('div');row.className='button-row';
  for(const [name,action] of [['Rotate',()=>{entry.turn+=QUARTER;}],['Remove',()=>{entry.removed=true;}],['Restore',()=>{entry.removed=false;}],['Move up',()=>{if(index>0)[plan[index-1],plan[index]]=[plan[index],plan[index-1]];}],['Move down',()=>{if(index<plan.length-1)[plan[index+1],plan[index]]=[plan[index],plan[index+1]];}]]){
   if((name==='Remove'&&entry.removed)||(name==='Restore'&&!entry.removed))continue;
   const b=document.createElement('button');b.type='button';put(b,name);b.disabled=busy;
   b.setAttribute('aria-label',(window.GCD_I18N ? window.GCD_I18N.text(T(name)+' '+T(`page ${entry.source+1}`)) : T(name)+' '+T(`page ${entry.source+1}`)));
   b.onclick=()=>{clearResult();action();render();};
   row.append(b);
  }
  li.append(title,info,row);list.append(li);
 });
 const s=summary(plan);
 $('organize-summary').textContent=file
  ? T(`${s.kept} of ${s.total} page(s) kept`)+(s.turned?' · '+T(`${s.turned} rotated`):'')+(s.moved?' · '+T('order changed'):'')
  : T('Organize pages of a single PDF. Nothing is uploaded.');
 $('organize-create').disabled=busy||!file||!s.kept;
}
async function pick(files){
 if(busy)return;
 clearResult();plan=[];file=null;
 const chosen=[...(files||[])].filter(f=>f&&(f.type==='application/pdf'||/\.pdf$/i.test(f.name||'')))[0];
 lock(true);render();
 if(!chosen){lock(false);status('Your original file is kept unchanged.');return;}
 status('Reading PDF…');
 try{
  const bytes=new Uint8Array(await chosen.arrayBuffer());
  const info=await inspect(bytes);
  file={name:chosen.name,bytes,pages:info.pages};
  plan=initialPlan(info);
  status(`${info.pages} page(s) ready. Rotate, remove or reorder, then apply.`);
 }catch(e){file=null;status('Your original file is kept unchanged.');error(e);}
 finally{lock(false);render();}
}
$('organize-file').onchange=e=>pick(e.target.files);
$('organize-reset').onclick=()=>{if(!file||busy)return;clearResult();plan=[...plan].sort((a,b)=>a.source-b.source).map(p=>({...p,turn:0,removed:false}));render();};
$('organize-reverse').onclick=()=>{if(!file||busy)return;clearResult();plan.reverse();render();};
$('organize-cancel').onclick=()=>{controller?.abort();status('Cancelling…');};
$('organize-create').onclick=async()=>{
 if(busy||!file)return;
 clearResult();lock(true);controller=new AbortController();
 try{
  const result=await build(file,plan,controller.signal,text=>status(text));
  const blob=new Blob([result.bytes],{type:'application/pdf'});
  url=URL.createObjectURL(blob);
  const stem=String($('organize-name').value||'').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/\.pdf$/i,'').trim()||'organized-document';
  const link=$('organize-download');link.href=url;link.download=stem+'.pdf';link.hidden=false;
  const open=$('organize-open');open.href=url;open.hidden=false;
  status(T(`PDF ready · ${result.pages} page(s)`)+(result.warnings.length?' · '+result.warnings[0]:''));
 }catch(e){
  if(e.name==='AbortError')status('Cancelled. Your page order is kept.');
  else{error(e);status('No new PDF was created. Review the message and try again.');}
 }
 finally{lock(false);render();}
};
window.addEventListener('pagehide',()=>{controller?.abort();if(url)URL.revokeObjectURL(url);});
window.addEventListener('languagechange',render);
render();

import {installEnhance} from './pdf-handoff.js';
installEnhance('organize-download', 'organize-open');
