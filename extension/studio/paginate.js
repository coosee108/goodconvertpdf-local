// Paginate measured DOM before raster export: repeated table headers, bounded page canvases.
const T=value=>window.GCD_I18N?.text(value)||value;
const put=(el,v)=>{if(!el)return;if(window.GCD_I18N)window.GCD_I18N.write(el,v);else el.textContent=v;};
// Long blocks retain every text character across marked continuation fragments.
export function paginate(doc,options){
 const [w,h]=ConversionOptions.dimensions(options),m=options.marginsMm,width=(w-m.left-m.right)*96/25.4,height=(h-m.top-m.bottom)*96/25.4-3;
 let firstGroup=true;const blocks=[];for(const child of [...doc.body.children])if(child.classList.contains('column-group')){if(!firstGroup)blocks.push({break:true});firstGroup=false;for(const node of [...child.children])blocks.push({node});}else blocks.push({node:child});
 doc.body.replaceChildren();doc.body.style.width=width+'px';const pages=[];let page,table;
 // Oversized media cannot be split across pages; cap it to the usable page height instead of failing the layout.
 let mediaCap=doc.getElementById('gcd-media-cap');if(!mediaCap){mediaCap=doc.createElement('style');mediaCap.id='gcd-media-cap';doc.head.append(mediaCap);}mediaCap.textContent=`img{max-height:${Math.max(1,Math.floor(height))}px;object-fit:contain}`;
 function next(){if(pages.length>=100)throw Error('Document exceeds 100 pages. Export fewer records or use system printing.');page=doc.createElement('section');page.className='pdf-sheet';page.style.cssText=`width:${width}px;box-sizing:border-box;display:flow-root;break-after:page`;doc.body.append(page);pages.push(page);table=null;}
 function fits(){return page.getBoundingClientRect().height<=height;}
 function slice(node,start,end){
  const texts=[],walk=doc.createTreeWalker(node,4);let text;while(text=walk.nextNode())texts.push(text);
  const boundary=offset=>{for(const part of texts){if(offset<=part.length)return[part,offset];offset-=part.length;}return[texts.at(-1),texts.at(-1).length];};
  const range=doc.createRange(),[from,fromOffset]=boundary(start),[to,toOffset]=boundary(end);
  range.setStart(from,fromOffset);range.setEnd(to,toOffset);
  const copy=node.cloneNode(false);copy.append(range.cloneContents());return copy;
 }
 function fitBlock(node,container,fresh=false){container.append(node);if(fits())return;node.remove();if(!fresh&&page.textContent.trim()){next();container=page;container.append(node);if(fits())return;node.remove();}
  const full=node.textContent.length;if(full<2)throw Error('A non-text element is taller than the page. Use larger paper or system printing.');let lo=1,hi=full-1,best=0;
  while(lo<=hi){const mid=Math.floor((lo+hi)/2),part=slice(node,0,mid);container.append(part);const ok=fits();part.remove();if(ok){best=mid;lo=mid+1;}else hi=mid-1;}
  if(!best)throw Error('Paper is too small for this content. Reduce margins or choose larger paper.');container.append(slice(node,0,best));const rest=slice(node,best,full);next();const note=doc.createElement('small');put(note, 'Continued from previous page');page.append(note);fitBlock(rest,page,true);
 }
 next();
 for(const block of blocks){if(block.break){if(page.textContent.trim())next();continue;}const node=block.node;if(node.tagName!=='TABLE'){fitBlock(node,page);continue;}
  const header=node.querySelector('thead'),cols=node.querySelector('colgroup');const makeTable=()=>{table=doc.createElement('table');if(node.className)table.className=node.className;if(node.hasAttribute('style'))table.setAttribute('style',node.getAttribute('style'));if(cols)table.append(cols.cloneNode(true));if(header)table.append(header.cloneNode(true));const body=doc.createElement('tbody');table.append(body);page.append(table);return body;};let body=makeTable();
  for(const original of [...node.querySelectorAll('tbody > tr')]){let row=original;while(row){body.append(row);if(fits())break;row.remove();if(body.children.length){next();body=makeTable();continue;}if(page.children.length>1){table.remove();next();body=makeTable();continue;}
    const full=row.textContent.length;let lo=1,hi=full-1,best=0;while(lo<=hi){const mid=Math.floor((lo+hi)/2),part=slice(row,0,mid);body.append(part);const ok=fits();part.remove();if(ok){best=mid;lo=mid+1;}else hi=mid-1;}if(!best)throw Error('A table row cannot fit this paper. Use larger paper or fewer columns.');body.append(slice(row,0,best));row=slice(row,best,full);next();body=makeTable();const label=doc.createElement('caption');put(label, 'Row continued');table.prepend(label);
   }
  }table=null;
 }
 return pages.filter(p=>p.textContent.trim());
}
