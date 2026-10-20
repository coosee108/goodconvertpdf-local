// Local PDF post-processing. Existing page content is copied, never rasterized.
const LIMITS={files:10,input:60*1024*1024,pages:300,output:80*1024*1024,parts:50};
const fail=message=>{throw Error(message);};
const pause=()=>new Promise(r=>setTimeout(r,0));
export {LIMITS};
export function ranges(value,count){
 if(!value.trim())return Array.from({length:count},(_,i)=>i);
 if(!/^\s*\d+(?:\s*-\s*\d+)?(?:\s*,\s*\d+(?:\s*-\s*\d+)?)*\s*$/.test(value))fail('Use page ranges such as 1-3, 5.');
 const seen=new Set();for(const part of value.split(',')){const [a,b=a]=part.split('-').map(Number);if(a<1||b<a||b>count)fail(`Page range must be within 1–${count}.`);for(let n=a;n<=b;n++)seen.add(n-1);}return [...seen].sort((a,b)=>a-b);
}
async function load(bytes){if(typeof PDFLib==='undefined')fail('The PDF engine did not load. Refresh the page and try again.');try{return await PDFLib.PDFDocument.load(bytes,{updateMetadata:false});}catch{fail('This PDF is encrypted or cannot be read. Use an unencrypted, valid PDF.');}}
export function check(doc,rearranging=false){
 const name=PDFLib.PDFName.of;
 const names=doc.catalog.lookupMaybe(name('Names'),PDFLib.PDFDict);if(names&&(names.has(name('JavaScript'))||names.has(name('EmbeddedFiles'))))fail('PDF scripts and embedded attachments are not supported.');
 if(doc.catalog.has(name('AcroForm'))||doc.catalog.has(name('Perms')))fail('Forms or signed PDFs are not supported. Export a separate static, unsigned copy first.');
 if(doc.catalog.has(name('Collection'))||doc.catalog.has(name('AF')))fail('PDF portfolios and attached-file documents are not supported.');
 if(rearranging&&(doc.catalog.has(name('Outlines'))||doc.catalog.has(name('Names'))||doc.catalog.has(name('Dests'))))fail('Merging or selecting pages from PDFs with bookmarks, named destinations or attachments is not supported. Keep this file separate with all pages.');
 for(const p of doc.getPages()){
  if(p.node.has(name('AA')))fail('PDF page actions are not supported.');
  const ann=p.node.lookupMaybe(name('Annots'),PDFLib.PDFArray);if(!ann)continue;
  for(let i=0;i<ann.size();i++){const a=ann.lookup(i,PDFLib.PDFDict);const subtype=a.get(name('Subtype'))?.toString();const action=a.lookupMaybe(name('A'),PDFLib.PDFDict);const type=action?.get(name('S'))?.toString();
   if(subtype!=='/Link')fail('PDFs with forms, comments or other annotations are not supported. Export a static copy first.');
   if(type&& !['/URI','/GoTo'].includes(type))fail('PDF links with executable or external-file actions are not supported.');
   if(type==='/URI'&&!/^(https?:|mailto:)/i.test(action.lookup(name('URI')).decodeText()))fail('Only web and email links are supported.');
   if(rearranging&&(a.has(name('Dest'))||type==='/GoTo'))fail('Internal page links cannot safely be merged or rearranged. Keep this PDF separate with all pages.');
  }
 }
 // jsPDF always writes an OpenAction view preference; reject nothing — strip the
 // actions instead (view prefs are harmless, and removing them is safer than keeping
 // executable actions), so locally generated and third-party PDFs can be enhanced.
 if(doc.catalog.has(name('OpenAction'))||doc.catalog.has(name('AA'))){doc.catalog.delete(name('OpenAction'));doc.catalog.delete(name('AA'));}
}
export async function inspect(bytes){const doc=await load(bytes);check(doc);if(!doc.getPageCount())fail('This PDF contains no pages.');if(doc.getPageCount()>LIMITS.pages)fail(`At most ${LIMITS.pages} pages per document.`);return {pages:doc.getPageCount(),rotations:doc.getPages().map(p=>p.getRotation().angle),title:doc.getTitle()||'',author:doc.getAuthor()||'',subject:doc.getSubject()||'',keywords:doc.getKeywords()||''};}
function canvas(width,height){const c=document.createElement('canvas');c.width=Math.ceil(width);c.height=Math.ceil(height);return c;}
async function png(c){return new Uint8Array(await(await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('Could not draw text.')),'image/png'))).arrayBuffer());}
async function watermark(doc,o){
 const c=canvas(2000,180),ctx=c.getContext('2d');ctx.font='96px system-ui, "Microsoft YaHei", sans-serif';const width=Math.ceil(ctx.measureText(o.text).width+40);if(width>8000)fail('Watermark text is too wide. Use a shorter label.');c.width=Math.max(80,width);ctx.font='96px system-ui, "Microsoft YaHei", sans-serif';ctx.fillStyle=o.color;ctx.textBaseline='middle';ctx.fillText(o.text,20,90);return doc.embedPng(await png(c));
}
function lines(ctx,text,width){const result=[];for(const paragraph of text.split('\n')){let line='';for(const char of paragraph){if(line&&ctx.measureText(line+char).width>width){result.push(line);line='';}line+=char;}result.push(line);}return result;}
async function cover(doc,first,o){
 const box=first.getCropBox(),rot=first.getRotation().angle%180;const w=rot?box.height:box.width,h=rot?box.width:box.height;
 const scale=Math.min(2,2400/Math.max(w,h));const c=canvas(w*scale,h*scale),ctx=c.getContext('2d');ctx.scale(scale,scale);ctx.fillStyle='#f3f6fd';ctx.fillRect(0,0,w,h);ctx.fillStyle=o.color;ctx.fillRect(w*.09,h*.12,w*.12,6);ctx.fillStyle='#17233b';ctx.textBaseline='top';
 const font=Math.min(36,w*.065,h*.07),padding=w*.09;ctx.font=`600 ${font}px system-ui, "Microsoft YaHei", sans-serif`;const title=lines(ctx,o.title,w-padding*2);let y=h*.25;if(title.length>5)fail('Cover title is too long for the page. Shorten it.');for(const line of title){ctx.fillText(line,padding,y);y+=font*1.4;}
 ctx.font=`${font*.5}px system-ui, "Microsoft YaHei", sans-serif`;ctx.fillStyle='#53647e';y+=font;const subtitle=lines(ctx,o.subtitle,w-padding*2);for(const line of subtitle){ctx.fillText(line,padding,y);y+=font*.8;}if(y>h*.85)fail('Cover text exceeds the page. Shorten the title or subtitle.');
 const img=await doc.embedPng(await png(c));const page=doc.insertPage(0,[w,h]);page.drawImage(img,{x:0,y:0,width:w,height:h});
}
// Page numbers are drawn as high-resolution images so system fonts (including Chinese) render reliably.
async function stamp(doc,text,n){
 const scale=4,size=n.size;
 const measure=canvas(10,10),mctx=measure.getContext('2d');
 const font=`${size*scale}px system-ui, "Microsoft YaHei", sans-serif`;
 mctx.font=font;
 const width=Math.ceil(mctx.measureText(text).width)+8*scale,height=Math.ceil(size*scale*1.6);
 if(width>8000||height>4000)fail('Page number text is too long. Use a shorter template.');
 const c=canvas(width,height),ctx=c.getContext('2d');
 ctx.font=font;ctx.fillStyle=n.color;ctx.textBaseline='middle';ctx.fillText(text,4*scale,height/2);
 return doc.embedPng(await png(c));
}
function place(box,rotation,dw,dh,n){
 const pw=rotation%180?box.height:box.width,ph=rotation%180?box.width:box.height,margin=n.margin||24;
 const vertical=n.position.startsWith('top')?ph-dh-margin:margin;
 const horizontal=n.position.endsWith('right')?pw-dw-margin:n.position.endsWith('left')?margin:(pw-dw)/2;
 const rad=rotation*Math.PI/180,cos=Math.cos(rad),sin=Math.sin(rad);
 const ox=horizontal+dw/2-pw/2,oy=vertical+dh/2-ph/2;
 const cx=box.x+box.width/2+(ox*cos+oy*sin),cy=box.y+box.height/2+(-ox*sin+oy*cos);
 return {x:cx-(dw*cos-dh*sin)/2,y:cy-(dw*sin+dh*cos)/2};
}
export async function build(items,o,signal,onProgress=()=>{}){
 const abort=()=>signal?.throwIfAborted();abort();if(!items.length||items.length>LIMITS.files)fail('Choose 1–10 PDF files.');if(items.reduce((n,i)=>n+i.bytes.length,0)>LIMITS.input)fail('PDF inputs exceed 60 MB.');
 const sources=[];let total=0;for(let i=0;i<items.length;i++){abort();onProgress(`Reading PDF ${i+1} of ${items.length}…`);await pause();const doc=await load(items[i].bytes),indices=ranges(items[i].range||'',doc.getPageCount());check(doc,items.length>1||indices.length!==doc.getPageCount());total+=indices.length;sources.push({doc,indices});}
 if(total+(o.cover.enabled?1:0)>LIMITS.pages)fail('Output exceeds 300 pages. Select fewer pages.');
 const only=sources.length===1&&sources[0].indices.length===sources[0].doc.getPageCount();const doc=only?sources[0].doc:await PDFLib.PDFDocument.create();
 const warnings=[];if(!only&&sources.some(s=>s.doc.catalog.has(PDFLib.PDFName.of('StructTreeRoot'))))warnings.push('Accessibility tags are not retained in merged or selected-page output. Original text remains searchable.');
 if(!only)for(const source of sources){abort();const copied=await doc.copyPages(source.doc,source.indices);for(const page of copied){abort();page.node.delete(PDFLib.PDFName.of('StructParents'));doc.addPage(page);await pause();}}
 if(o.cover.enabled){if(!o.cover.title.trim())fail('Enter a cover title.');await cover(doc,doc.getPage(0),o.cover);}
 if(o.watermark.enabled){const w=o.watermark;if(!w.text.trim()||w.text.length>100)fail('Enter a watermark of 1–100 characters.');if(!/^#[a-f\d]{6}$/i.test(w.color)||!Number.isFinite(w.opacity)||w.opacity<.05||w.opacity>.8||!Number.isFinite(w.angle)||Math.abs(w.angle)>60||!Number.isFinite(w.size)||w.size<.15||w.size>.75)fail('Invalid watermark settings.');
  const selected=ranges(w.range||'',doc.getPageCount());const img=await watermark(doc,w);for(const index of selected){abort();if(index===0&&o.cover.enabled&&!w.includeCover)continue;const page=doc.getPage(index),box=page.getCropBox(),rotation=page.getRotation().angle;const pw=rotation%180?box.height:box.width,ph=rotation%180?box.width:box.height;let iw=Math.min(pw,ph)*w.size,ih=iw*img.height/img.width;const angle=(w.angle+rotation)*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle),fit=Math.min(1,box.width*.85/(Math.abs(iw*cos)+Math.abs(ih*sin)),box.height*.85/(Math.abs(iw*sin)+Math.abs(ih*cos)));iw*=fit;ih*=fit;const x=box.x+box.width/2-(iw*cos-ih*sin)/2,y=box.y+box.height/2-(iw*sin+ih*cos)/2;page.drawImage(img,{x,y,width:iw,height:ih,rotate:PDFLib.degrees(w.angle+rotation),opacity:w.opacity});await pause();onProgress(`Applying watermark ${index+1} of ${doc.getPageCount()}…`);}
 }
 if(o.numbers&&o.numbers.enabled){
  const n=o.numbers;
  if(!/^#[a-f\d]{6}$/i.test(n.color))fail('Invalid page number colour.');
  if(!Number.isFinite(n.size)||n.size<6||n.size>48)fail('Page number size must be between 6 and 48 pt.');
  if(!Number.isInteger(n.start)||n.start<0||n.start>9999)fail('Page numbers must start between 0 and 9,999.');
  if(String(n.template||'').length>60)fail('Page number template is too long. Use 60 characters or fewer.');
  const total=doc.getPageCount(),selected=ranges(n.range||'',total);
  let placed=0;
  for(const index of selected){
   abort();
   if(index===0&&o.cover.enabled&&!n.includeCover)continue;
   const offset=o.cover.enabled&&!n.includeCover?index-1:index;
   const text=String(n.template||'{n}').replaceAll('{total}',String(total-(o.cover.enabled&&!n.includeCover?1:0))).replaceAll('{n}',String(n.start+offset)).trim()||String(n.start+offset);
   const image=await stamp(doc,text,n),dw=image.width/4,dh=image.height/4;
   const page=doc.getPage(index),box=page.getCropBox(),rotation=page.getRotation().angle;
   const {x,y}=place(box,rotation,dw,dh,n);
   page.drawImage(image,{x,y,width:dw,height:dh,rotate:PDFLib.degrees(rotation)});
   placed++;
   await pause();
   onProgress(`Numbering page ${placed} of ${selected.length}…`);
  }
 }
 if(o.metadata.enabled){const m=o.metadata;for(const key of ['title','author','subject','keywords'])if(typeof m[key]!=='string'||m[key].length>500)fail('Document properties must be at most 500 characters.');doc.setTitle(m.title);doc.setAuthor(m.author);doc.setSubject(m.subject);doc.setKeywords(m.keywords.split(',').map(s=>s.trim()).filter(Boolean));doc.catalog.delete(PDFLib.PDFName.of('Metadata'));}
 abort();onProgress('Saving PDF…');await pause();const bytes=await doc.save({addDefaultPage:false,updateFieldAppearances:false});abort();if(bytes.length>LIMITS.output)fail('Output exceeds 80 MB. Use fewer pages or files.');return {bytes,pages:doc.getPageCount(),warnings};
}
