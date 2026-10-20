// No network or scripts are allowed in local documents, including stylesheets and ZIP assets.
const MAX_SOURCE=2*1024*1024, MAX_TOTAL=20*1024*1024;
export function safePath(name){
  name=String(name).replace(/\\/g,'/');
  if(name.startsWith('/')||/^[a-z][a-z\d+.-]*:/i.test(name)||name.includes('\0')||name.split('/').some(p=>p==='..'))throw Error('Unsafe resource path in the package.');
  return name.replace(/^\.\//,'');
}
export async function readPackage(file){
  if(file.size>10*1024*1024)throw Error('Resource ZIP must be smaller than 10 MB.');
  const bytes=new Uint8Array(await file.arrayBuffer()),entries=new Map();let total=0,count=0,pending=0,failure;const names=new Set();
  const unzip=new fflate.Unzip(entry=>{
    try{
      const name=safePath(entry.name);
      if(++count>200||entry.originalSize>5*1024*1024)throw Error('ZIP limit exceeded: 200 entries, 5 MB per file.');
      if(name.endsWith('/'))return;
      if(names.has(name))throw Error('Duplicate resource path in ZIP.');names.add(name);pending++;
      const chunks=[];let size=0;
      entry.ondata=(error,data,final)=>{
        if(error){failure=error;return;}
        size+=data.length;total+=data.length;
        if(size>5*1024*1024||total>MAX_TOTAL){failure=Error('Expanded ZIP exceeds the 20 MB resource budget.');entry.terminate?.();return;}
        chunks.push(data);if(final){pending--;const result=new Uint8Array(size);let offset=0;chunks.forEach(c=>{result.set(c,offset);offset+=c.length;});entries.set(name,result);}
      };entry.start();
    }catch(error){failure=error;entry.terminate?.();}
  });
  unzip.register(fflate.UnzipInflate);
  for(let offset=0;offset<bytes.length;offset+=4096){unzip.push(bytes.subarray(offset,offset+4096),offset+4096>=bytes.length);if(failure)throw failure;}
  if(!entries.size||pending)throw Error('The ZIP is empty or incomplete.');
  return entries;
}
export function decode(bytes,encoding='utf-8'){
  try{return new TextDecoder(encoding,{fatal:true}).decode(bytes);}catch{throw Error('The file does not match the selected encoding. Try another encoding.');}
}
export async function prepareHtml({text,entries=new Map(),entry='index.html',encoding='utf-8'},options){
  if(typeof text!=='string'||!text.trim())throw Error('Choose an HTML file or paste HTML first.');
  if(new TextEncoder().encode(text).length>MAX_SOURCE)throw Error('HTML must be smaller than 2 MB.');
  const warnings=new Set(),urls=[];
  const clean=DOMPurify.sanitize(text,{WHOLE_DOCUMENT:true,FORBID_TAGS:['svg','math','script','iframe','frame','frameset','object','embed','form','input','button','textarea','select','meta','base','video','audio','source','template'],FORBID_ATTR:['srcdoc','srcset','ping','action','formaction','autofocus'],ADD_TAGS:['link'],ADD_ATTR:['rel']});
  const doc=new DOMParser().parseFromString(clean,'text/html');
  if(/<script|\son\w+\s*=/i.test(text))warnings.add('ui.warning.scriptsRemoved');
  const resourceUrl=(value,base)=>{
    value=String(value||'').trim();
    if(urls.includes(value))return value;
    if(/^data:(image\/(png|jpeg|webp|gif)|font\/(woff2?|ttf)|application\/font-woff)[;,]/i.test(value))return value;
    if(!value||value.startsWith('#'))return '';
    try{
      const url=new URL(value,new URL(base,'https://local.invalid/'));
      if(url.origin!=='https://local.invalid')throw Error();
      const pathname=safePath(decodeURIComponent(url.pathname.slice(1)));const bytes=entries.get(pathname);
      if(!bytes)throw Error();
      const ext=pathname.split('.').pop().toLowerCase(),type={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf'}[ext];
      if(!type)throw Error();
      const out=URL.createObjectURL(new Blob([bytes],{type}));urls.push(out);return out;
    }catch{warnings.add('ui.warning.resourcesBlocked');return '';}
  };
  const css=(value,base)=>{value=value.replace(/\/\*[\s\S]*?\*\//g,'');if(/(?:image-set|image|src|paint|cross-fade)\s*\(/i.test(value)){warnings.add('ui.warning.cssImageFunctionsRemoved');return '';}if(value.includes('\\')){warnings.add('ui.warning.escapedCssRemoved');return '';}return value.replace(/@import\s+(?:url\([^)]*\)|[^;]+)[^;]*;?/gi,()=>{warnings.add('ui.warning.cssImportBlocked');return '';}).replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi,(_,q,url)=>`url("${resourceUrl(url,base)}")`);};
  for(const link of [...doc.querySelectorAll('link')]){
    if(link.rel==='stylesheet')try{
      const url=new URL(link.getAttribute('href'),new URL(entry,'https://local.invalid/'));
      if(url.origin!=='https://local.invalid')throw Error();
      const pathname=safePath(decodeURIComponent(url.pathname.slice(1))),bytes=entries.get(pathname);if(!bytes)throw Error();
      const style=doc.createElement('style');style.textContent=css(decode(bytes,encoding),pathname);link.replaceWith(style);
    }catch{warnings.add('ui.warning.stylesheetBlocked');link.remove();}else link.remove();
  }
  doc.querySelectorAll('style').forEach(el=>{el.textContent=css(el.textContent,entry);});
  // Opt-in only: absolute image URLs are downloaded and turned into blob URLs so the
  // rasterizer can paint them. Off by default — local documents stay network-free, and
  // any failure falls back to the blocked-resource warning.
  const remoteImage=async(value)=>{
    try{
      if(!/^https?:\/\//i.test(value))throw Error();
      const res=await fetch(value,{mode:'cors',credentials:'omit',redirect:'follow',referrerPolicy:'no-referrer'});
      if(!res.ok)throw Error();
      const type=(res.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
      if(!/^image\/(png|jpeg|webp|gif|avif|bmp|svg\+xml)$/.test(type))throw Error();
      const blob=await res.blob();if(blob.size>5*1024*1024)throw Error();
      const out=URL.createObjectURL(blob);urls.push(out);return out;
    }catch{warnings.add('ui.warning.resourcesBlocked');return '';}
  };
  const nodes=[...doc.querySelectorAll('*')];
  for(const el of nodes){
    if(el.hasAttribute('style'))el.setAttribute('style',css(el.getAttribute('style'),entry));
    if(el.hasAttribute('background'))el.removeAttribute('background');
    if(el.hasAttribute('href')&&el.tagName.toLowerCase()!=='a')el.removeAttribute('href');
    if(el.tagName.toLowerCase()==='a'){el.removeAttribute('target');el.removeAttribute('download');}
  }
  const sources=[...doc.querySelectorAll('[src]')];
  const resolved=await Promise.all(sources.map(async el=>{
    const value=(el.getAttribute('src')||'').trim();
    if(options.remoteImages&&/^https?:\/\//i.test(value))return remoteImage(value);
    return resourceUrl(value,entry);
  }));
  sources.forEach((el,i)=>{if(resolved[i])el.setAttribute('src',resolved[i]);else el.removeAttribute('src');});
  const csp=doc.createElement('meta');csp.httpEquiv='Content-Security-Policy';csp.content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";doc.head.prepend(csp);
  const [w,h]=ConversionOptions.dimensions(options),m=options.marginsMm;
  const print=doc.createElement('style');print.textContent=`@page{size:${w}mm ${h}mm;margin:${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm}html{background:white;color:#172033}body{margin:0;overflow-wrap:anywhere}img{max-width:100%;height:auto}pre{white-space:pre-wrap}thead{display:table-header-group}a{pointer-events:none}*{animation:none!important;transition:none!important}${options.printBackground?'*{-webkit-print-color-adjust:exact;print-color-adjust:exact}':'*{background:transparent!important}'}`;doc.head.append(print);
  return {html:'<!doctype html>'+doc.documentElement.outerHTML,warnings:[...warnings],release:()=>urls.forEach(u=>URL.revokeObjectURL(u))};
}
export async function mountDocument(iframe,html){
  iframe.setAttribute('sandbox','allow-same-origin allow-modals');
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Local preview took too long to load.')),10000);iframe.onload=()=>{clearTimeout(timer);resolve();};iframe.srcdoc=html;});
  const doc=iframe.contentDocument;let timer;
  await Promise.race([Promise.all([doc.fonts?.ready,...[...doc.images].map(img=>img.decode?.().catch(()=>{}))]),new Promise(resolve=>{timer=setTimeout(resolve,4000);})]);clearTimeout(timer);
  return doc;
}
