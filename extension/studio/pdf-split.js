// Local PDF splitting. Page content is copied into new documents, never rasterized.
import {LIMITS,ranges,check} from './pdf-enhance.js';
const fail=message=>{throw Error(message);};
const pause=()=>new Promise(r=>setTimeout(r,0));
const baseName=name=>String(name||'document').replace(/\.pdf$/i,'').replace(/[\\/:*?"<>|]+/g,'-').trim()||'document';
const pad=(n,width)=>String(n).padStart(width,'0');

// Build the list of parts before touching the file, so the UI can preview the plan.
// mode: 'every' -> fixed page interval; 'ranges' -> one part per comma-separated range.
export function planParts(pageCount,mode,options={}){
 if(!Number.isInteger(pageCount)||pageCount<1)fail('This PDF contains no pages.');
 if(mode==='every'){
  const size=Number(options.size)||1;
  if(!Number.isInteger(size)||size<1||size>pageCount)fail(`Enter an interval between 1 and ${pageCount} pages.`);
  const parts=[];for(let start=0;start<pageCount;start+=size)parts.push({indices:Array.from({length:Math.min(size,pageCount-start)},(_,i)=>start+i)});
  return parts.map((part,index)=>({index,label:`Part ${pad(index+1,2)}`,...part}));
 }
 if(mode==='ranges'){
  const value=String(options.value||'').trim();
  if(!value)fail('Enter page ranges such as 1-3, 4-8.');
  if(!/^\s*\d+(?:\s*-\s*\d+)?(?:\s*,\s*\d+(?:\s*-\s*\d+)?)*\s*$/.test(value))fail('Use page ranges such as 1-3, 4-8.');
  const parts=[];
  for(const section of value.split(',')){
   const [a,b=a]=section.split('-').map(Number);
   if(a<1||b<a||b>pageCount)fail(`Page range must be within 1–${pageCount}.`);
   const indices=[];for(let n=a;n<=b;n++)indices.push(n-1);
   parts.push({index:parts.length,label:a===b?`Page ${pad(a,3)}`:`Pages ${pad(a,3)}-${pad(b,3)}`,indices});
  }
  if(parts.length>LIMITS.parts)fail(`At most ${LIMITS.parts} parts. Use fewer ranges.`);
  return parts;
 }
 fail('Choose how to split this PDF.');
}

async function open(bytes){
 if(typeof PDFLib==='undefined')fail('The PDF engine did not load. Refresh the page and try again.');
 if(typeof fflate==='undefined')fail('The archive library did not load. Refresh the page and try again.');
 try{return await PDFLib.PDFDocument.load(bytes,{updateMetadata:false});}
 catch{fail('This PDF is encrypted or cannot be read. Use an unencrypted, valid PDF.');}
}

// Split into individual documents and pack them into a single ZIP.
export async function build(file,mode,options,signal,onProgress=()=>{}){
 const abort=()=>signal?.throwIfAborted();abort();
 if(!file)fail('Choose a PDF file.');
 if(file.bytes.length>LIMITS.input)fail('PDF inputs exceed 60 MB.');
 onProgress('Reading PDF…');await pause();
 const source=await open(file.bytes);
 const count=source.getPageCount();
 if(!count)fail('This PDF contains no pages.');
 if(count>LIMITS.pages)fail(`At most ${LIMITS.pages} pages per document.`);
 check(source,true);
 const plan=planParts(count,mode,options);
 abort();
 const stem=baseName(file.name),files={},used=new Set(),warnings=[];
 if(source.catalog.has(PDFLib.PDFName.of('StructTreeRoot')))warnings.push('Accessibility tags are not retained in split output. Original text remains searchable.');
 let total=0;
 for(let p=0;p<plan.length;p++){
  abort();
  const part=plan[p];
  onProgress(`Building part ${p+1} of ${plan.length}…`);
  await pause();
  const doc=await PDFLib.PDFDocument.create();
  const copied=await doc.copyPages(source,part.indices);
  for(const page of copied){page.node.delete(PDFLib.PDFName.of('StructParents'));doc.addPage(page);}
  doc.setTitle(source.getTitle()||'');
  doc.setAuthor(source.getAuthor()||'');
  doc.setSubject(source.getSubject()||'');
  doc.setKeywords(source.getKeywords()?source.getKeywords().split(/,\s*/).filter(Boolean):[]);
  doc.setProducer(source.getProducer()||'');
  doc.setCreator(source.getCreator()||'');
  abort();
  const bytes=await doc.save({addDefaultPage:false,updateFieldAppearances:false});
  total+=bytes.length;
  if(total>LIMITS.output)fail('Output exceeds 80 MB. Use larger parts or fewer ranges.');
  let name=`${stem}-${part.label}.pdf`.replace(/\s+/g,'-');
  while(used.has(name.toLowerCase()))name=`${stem}-${part.label}-${used.size}.pdf`.replace(/\s+/g,'-');
  used.add(name.toLowerCase());
  files[name]=bytes;
 }
 abort();onProgress('Packing ZIP…');await pause();
 const zip=fflate.zipSync(Object.fromEntries(Object.entries(files).map(([k,v])=>[k,new Uint8Array(v)])),{level:6});
 return {zip:new Uint8Array(zip),parts:files,count:plan.length,pages:count,warnings};
}

// Small preview role for range validation feedback before running.
export function pageRange(value,count){return ranges(value,count);}
