// Local page organization: drop, rotate and reorder pages without rasterizing content.
import {LIMITS,check} from './pdf-enhance.js';
const fail=message=>{throw Error(message);};
const pause=()=>new Promise(r=>setTimeout(r,0));
const baseName=name=>String(name||'document').replace(/\.pdf$/i,'').replace(/[\\/:*?"<>|]+/g,'-').trim()||'document';

async function open(bytes){
 if(typeof PDFLib==='undefined')fail('The PDF engine did not load. Refresh the page and try again.');
 try{return await PDFLib.PDFDocument.load(bytes,{updateMetadata:false});}
 catch{fail('This PDF is encrypted or cannot be read. Use an unencrypted, valid PDF.');}
}

// Build the editable page plan from file information: one entry per source page.
export function initialPlan(info){
 const rotations=Array.isArray(info.rotations)?info.rotations:[];
 return Array.from({length:info.pages},(_,i)=>({source:i,base:rotations[i]||0,turn:0,removed:false}));
}
export function summary(plan){
 const kept=plan.filter(p=>!p.removed);
 return {total:plan.length,kept:kept.length,turned:kept.filter(p=>p.turn).length,moved:kept.some((p,i)=>p.source!==i)};
}
// Rebuild the document from the plan. Order follows the array, removed entries are dropped.
export async function build(file,plan,signal,onProgress=()=>{}){
 const abort=()=>signal?.throwIfAborted();abort();
 if(!file)fail('Choose a PDF file.');
 if(!Array.isArray(plan)||!plan.length)fail('The page plan is empty. Reload the PDF.');
 const order=plan.filter(p=>!p.removed);
 if(!order.length)fail('Keep at least one page.');
 if(order.length>LIMITS.pages)fail(`At most ${LIMITS.pages} pages per document.`);
 if(file.bytes.length>LIMITS.input)fail('PDF inputs exceed 60 MB.');
 onProgress('Reading PDF…');await pause();
 const source=await open(file.bytes);
 const count=source.getPageCount();
 if(!count)fail('This PDF contains no pages.');
 if(count>LIMITS.pages)fail(`At most ${LIMITS.pages} pages per document.`);
 if(order.some(p=>!Number.isInteger(p.source)||p.source<0||p.source>=count))fail('The page order is no longer valid. Reload the PDF.');
 check(source,true);
 abort();
 const doc=await PDFLib.PDFDocument.create();
 const copied=await doc.copyPages(source,order.map(p=>p.source));
 const warnings=[];
 if(source.catalog.has(PDFLib.PDFName.of('StructTreeRoot')))warnings.push('Accessibility tags are not retained when pages are rearranged, rotated or removed. Original text remains searchable.');
 for(let i=0;i<copied.length;i++){
  abort();
  const page=copied[i],angle=(((order[i].base||0)+(order[i].turn||0))%360+360)%360;
  if(angle)page.setRotation(PDFLib.degrees(angle));
  page.node.delete(PDFLib.PDFName.of('StructParents'));
  doc.addPage(page);
  if(i===0||i===copied.length-1||i%10===0)onProgress(`Building page ${i+1} of ${copied.length}…`);
  await pause();
 }
 doc.setTitle(source.getTitle()||'');
 doc.setAuthor(source.getAuthor()||'');
 doc.setSubject(source.getSubject()||'');
 doc.setKeywords(source.getKeywords()?source.getKeywords().split(/,\s*/).filter(Boolean):[]);
 doc.setProducer(source.getProducer()||'');
 doc.setCreator(source.getCreator()||'');
 abort();onProgress('Saving PDF…');await pause();
 const bytes=await doc.save({addDefaultPage:false,updateFieldAppearances:false});
 abort();
 if(bytes.length>LIMITS.output)fail('Output exceeds 80 MB. Keep fewer pages.');
 return {bytes,pages:doc.getPageCount(),warnings};
}
export {baseName};
