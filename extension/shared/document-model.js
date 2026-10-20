(function(root,factory){const api=factory(typeof module==='object'?require('../web/assets/converters'):root.Converters);if(typeof module==='object')module.exports=api;else root.DocumentModel=api;})(typeof globalThis!=='undefined'?globalThis:this,function(C){
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const limits={bytes:2*1024*1024,rows:5000,columns:200,cells:100000,messages:2000};
 function checkText(text){if(!String(text).trim())throw Error('Add content first.');if(new TextEncoder().encode(text).length>limits.bytes)throw Error('Content must be smaller than 2 MB.');return C.normalizeText(text);}
 // Preserve JSON number tokens as strings before parsing, including integers beyond 2^53.
 function losslessJson(text){let result='',quoted=false,escaped=false;for(let i=0;i<text.length;i++){const ch=text[i];if(quoted){result+=ch;if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')quoted=false;}else if(ch==='"'){quoted=true;result+=ch;}else if(ch==='-'||/\d/.test(ch)){const m=text.slice(i).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);if(!m)throw Error('Invalid JSON number.');result+=JSON.stringify(m[0]);i+=m[0].length-1;}else result+=ch;}return JSON.parse(result);}
 function pointer(root,path){if(!path)return root;if(!path.startsWith('/'))throw Error('Use a JSON Pointer such as /data/items.');return path.slice(1).split('/').reduce((v,p)=>{p=p.replace(/~1/g,'/').replace(/~0/g,'~');if(v===null||typeof v!=='object'||!Object.hasOwn(v,p))throw Error('The JSON records path was not found.');return v[p];},root);}
 const segment=k=>k.replace(/~/g,'~0').replace(/\//g,'~1');
 function flatten(value,path='',out=Object.create(null)){if(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length){for(const k of Object.keys(value))flatten(value[k],path+'/'+segment(k),out);}else out[path||'/value']=value;return out;}
 const cell=value=>value===null||value===undefined?'':typeof value==='object'?JSON.stringify(value):String(value);
 function data(text,settings={}){
  text=checkText(text);const kind=settings.kind==='auto'||!settings.kind?(/^[\s]*[\[{]/.test(text)?'json':'csv'):settings.kind;let headers,rows,warnings=[];
  if(kind==='json'){
   let records=pointer(losslessJson(text),settings.path||'');
   if(!Array.isArray(records)){
    // Tree view accepts any JSON value; Table view stays strict because it needs repeatable records.
    if(!settings.treeOnly)throw Error('Select a JSON array using its records path (for example /items).');
    return{kind,tree:records,columns:[],rows:[],warnings:['Tree view shows the JSON exactly as written. Switch to Table view to tabulate an array of records.']};
   }
   if(records.length>limits.rows)throw Error('At most 5,000 records are supported.');
   const objects=records.map(v=>settings.flatten?flatten(v):v&&typeof v==='object'&&!Array.isArray(v)?v:{value:v});headers=[...new Set(objects.flatMap(Object.keys))];if(headers.length>limits.columns||records.length*headers.length>limits.cells)throw Error('Data limit: 200 columns and 100,000 cells.');rows=objects.map(o=>headers.map(h=>cell(o[h])));warnings.push('JSON numbers are preserved as source text. Nested values remain JSON text unless Flatten is selected.');
  }else{
   const delimiter=settings.delimiter==='tab'?'\t':settings.delimiter&&settings.delimiter!=='auto'?settings.delimiter:C.detectDelimiter(text);
   // Reject an incomplete quoted field rather than silently converting partial CSV.
   let quoted=false;for(let i=0;i<text.length;i++)if(text[i]==='"'){if(quoted&&text[i+1]==='"')i++;else quoted=!quoted;}if(quoted)throw Error('CSV contains an unclosed quoted field.');
   const raw=C.csvToRows(text,delimiter);if(!raw.length)throw Error('No data rows found.');if(raw.length>limits.rows+1)throw Error('At most 5,000 records are supported.');const width=Math.max(...raw.map(r=>r.length));if(width>limits.columns||raw.length*width>limits.cells)throw Error('Data limit: 200 columns and 100,000 cells.');headers=settings.header===false?Array.from({length:width},(_,i)=>'Column '+(i+1)):Array.from({length:width},(_,i)=>raw[0][i]||'Column '+(i+1));rows=(settings.header===false?raw:raw.slice(1)).map(r=>Array.from({length:width},(_,i)=>r[i]??''));
   if(raw.some(r=>r.length!==width))warnings.push('Uneven row widths: extra columns were kept and missing cells left empty.');if(new Set(headers).size!==headers.length)warnings.push('Duplicate column labels are kept as independent columns. Rename them if needed.');
  }
  if(!rows.length)throw Error('No records to export.');if(rows.length>limits.rows||headers.length>limits.columns||rows.length*headers.length>limits.cells)throw Error('Data limit: 5,000 rows, 200 columns, 100,000 cells.');
  return{kind,tree:kind==='json'?records:null,columns:headers.map((name,i)=>({id:i,name,selected:true,width:120,format:'text',key:false})),rows,warnings};
 }
 // Rough text advance: full-width characters count double, matching typical system fonts.
 function textUnits(value){
  let units=0;
  for(const ch of String(value??'')){
   const code=ch.codePointAt(0);
   const wide=/[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE10-\uFE19\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(ch)||(code>=0x20000&&code<=0x3FFFF);
   units+=wide?2:1;
  }
  return units;
 }
 // Measure columns from their content so exported tables are not artificially narrow or wide.
 function autoWidths(model,cols,style){
  const font=Math.min(24,Math.max(9,Number(style.font)||12));
  const perChar=font*0.54,padding=14;
  const available=Math.max(240,Number(style.availableWidth)||700)-(style.index?24:0);
  const widths=cols.map((column,position)=>{
   let units=textUnits(column.name);
   for(const row of model.rows){const unitsRow=textUnits(row[cols[position].id]);if(unitsRow>units)units=unitsRow;}
   return Math.min(420,Math.max(40,Math.ceil(Math.min(units,60)*perChar+padding)));
  });
  const total=widths.reduce((sum,w)=>sum+w,0);
  if(total>available){const scale=available/total;return widths.map(w=>Math.max(40,Math.floor(w*scale)));}
  return widths;
 }
 function tableHtml(model,columns,groupSize=6,style={}){
  const selected=columns.filter(c=>c.selected);if(!selected.length)throw Error('Select at least one column.');const keys=selected.filter(c=>c.key),rest=selected.filter(c=>!c.key);if(keys.length>=groupSize&&rest.length)throw Error('Repeated key columns must leave room for a data column.');const groups=[];if(selected.length<=groupSize)groups.push(selected);else for(let i=0;i<rest.length;i+=groupSize-keys.length)groups.push([...keys,...rest.slice(i,i+groupSize-keys.length)]);
  const density=style.density==='compact'?'compact':style.density==='roomy'?'roomy':'';
  const tableClass=['data-table',density,style.zebra===false?'':'zebra',style.grid===false?'gridless':'grid'].filter(Boolean).join(' ');
  const head=style.index?'<th class="row-index">#</th>':'';
  const indexWidth=String(Math.max(28,Math.min(70,String(model.rows.length).length*9+14)));
  return groups.map((cols,i)=>{
   const widths=style.widthMode==='auto'?autoWidths(model,cols,style):cols.map(c=>Math.min(400,Math.max(40,Number(c.width)||120)));
   return `<section class="column-group"><h2>Columns ${i+1} of ${groups.length}</h2><table class="${tableClass}"><colgroup>${style.index?`<col style="width:${indexWidth}px">`:''}${widths.map(w=>`<col style="width:${w}px">`).join('')}</colgroup><thead><tr>${head}${cols.map(c=>`<th>${escape(c.name)}</th>`).join('')}</tr></thead><tbody>${model.rows.map((row,index)=>`<tr>${style.index?`<td class="row-index">${index+1}</td>`:''}${cols.map(c=>`<td style="text-align:${c.format==='number'?'right':'left'}">${escape(row[c.id])}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`;});
 }
 // Indented tree view for JSON sources. Every node is expanded because a PDF cannot be collapsed.
 function treeHtml(records,{maxNodes=20000}={}){
  let nodes=0;
  const scalar=value=>{
   const type=value===null?'null':typeof value;
   const text=value===null?'null':typeof value==='string'?JSON.stringify(value):String(value);
   return `<span class="tree-value tree-${type}">${escape(text)}</span>`;
  };
  function render(value,label){
   nodes++;
   if(nodes>maxNodes)throw Error('Tree view supports up to 20,000 nodes. Flatten the JSON or use Table view.');
   const head=label?`<span class="tree-key">${escape(label)}</span><span class="tree-sep">: </span>`:'';
   if(Array.isArray(value))return `<li>${head}${value.length?`<span class="tree-bracket">[ ]</span><ul>${value.map((item,i)=>render(item,String(i))).join('')}</ul>`:scalar(value)}</li>`;
   if(value&&typeof value==='object'){
    const entries=Object.entries(value);
    return `<li>${head}${entries.length?`<span class="tree-bracket">{ }</span><ul>${entries.map(([key,item])=>render(item,key)).join('')}</ul>`:scalar(value)}</li>`;
   }
   return `<li>${head}${scalar(value)}</li>`;
  }
  const body=Array.isArray(records)?records.map((item,i)=>render(item,String(i))).join(''):render(records,'');
  return `<div class="tree-root"><ul class="md-tree">${body}</ul></div>`;
 }
 function conversation(text){
  text=checkText(text);let messages=[],current=null,unclassified=0;const lines=text.split('\n');
  const push=()=>{if(current)messages.push(current);};
  // WhatsApp exports: "[dd/mm/yyyy, hh:mm:ss] Name: text" (iOS) or "dd/mm/yyyy, hh:mm - Name: text" (Android).
  const WHATSAPP_BRACKET=/^\[(\d{1,4}[/.\-]\d{1,2}[/.\-]\d{1,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AaPp][Mm])?)\]\s*([^:：]{1,60})[:：]\s?(.*)$/;
  const WHATSAPP_DASH=/^(\d{1,4}[/.\-]\d{1,2}[/.\-]\d{1,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AaPp][Mm])?)\s*[-–—]\s*([^:：]{1,60})[:：]\s?(.*)$/;
  for(const line of lines){
   let match=line.match(WHATSAPP_BRACKET)||line.match(WHATSAPP_DASH);
   if(match&&!/^(?:Messages and calls|<Media omitted>|image omitted)/i.test(match[3])){push();current={when:`${match[1]} ${match[2]}`,who:match[3],text:match[4]};continue;}
   match=line.match(/^\[([^\]]+)\]\s*([^:：]+)[:：]\s?(.*)$/)||line.match(/^(\d{1,4}[/.\-]\d{1,2}[/.\-]\d{1,4},?\s+\d{1,2}:\d{2}(?::\d{2})?)\s*[-–—]\s*([^:：]+)[:：]\s?(.*)$/);
   if(match){push();current={when:match[1],who:match[2],text:match[3]};continue;}
   const slack=line.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s+(\S+)\s{2,}(.*)$/);if(slack){push();current={when:slack[1],who:slack[2],text:slack[3]};continue;}
   const plain=line.match(/^([^\s:：][^:：]{0,39})[:：]\s?(.*)$/);if(plain&&!/^https?:\/\//i.test(line)&&!/^\d+$/.test(plain[1])){push();current={when:'',who:plain[1],text:plain[2]};continue;}
   unclassified++;if(!current)current={when:'',who:'Unclassified',text:line};else current.text+='\n'+line;
  }push();if(messages.length>limits.messages)throw Error('At most 2,000 messages per export.');
  return{messages:messages.map((m,i)=>({...m,id:i,selected:true})),warnings:[`Recognized ${messages.length} blocks. ${unclassified} continuation / unclassified lines were retained. Review the original before assuming the export is complete.`]};
 }
 function isoDate(value){const m=String(value).match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);return m?`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`:null;}
 function filterMessages(messages,{role='',from='',to=''}={}){if(from&&to&&from>to)throw Error('Start date must be before end date.');return messages.filter(m=>{const date=isoDate(m.when);return m.selected&&(!role||m.who===role)&&(!from||!date||date>=from)&&(!to||!date||date<=to);});}
 function conversationHtml(messages,style='',own=''){
  if(!messages.length)throw Error('Select at least one message.');
  if(style==='bubble'){
   return messages.map(m=>{
    const body=m.html||escape(m.text);
    // WhatsApp exports open with encryption notices; keep them out of the conversation bubbles.
    if(!m.who||m.who==='Unclassified')return `<p class="chat-notice">${body}</p>`;
    const mine=own&&m.who===own;
    return `<div class="bubble-row ${mine?'own':'other'}"><article class="bubble"><h3>${mine?'':escape(m.who)+' '}<small>${escape(m.when)}</small></h3><div class="message-body">${body}</div></article></div>`;
   }).join('');
  }
  return messages.map(m=>`<article class="message ${style==='compact'?'compact':''}"><h3>${escape(m.who||'Message')} <small>${escape(m.when)}</small></h3><div class="message-body">${m.html||escape(m.text)}</div></article>`).join('');
 }
 function document(title,body,{font=12,lineHeight=1.6,spacing=12}={}){font=Math.min(24,Math.max(9,Number(font)||12));lineHeight=Math.min(2.5,Math.max(1,Number(lineHeight)||1.6));spacing=Math.min(40,Math.max(0,Number(spacing)||0));return`<!doctype html><html><head><meta charset="utf-8"><title>${escape(title)}</title><style>body{font:${font}px system-ui,Arial;line-height:${lineHeight};color:#17233b}h1{font-size:22px}h2{font-size:15px}h3{font-size:13px}small{font-weight:400}table{border-collapse:collapse;width:100%;table-layout:fixed}thead{display:table-header-group}th,td{border:1px solid #d4dce8;padding:6px;overflow-wrap:anywhere;white-space:pre-wrap;vertical-align:top}th{background:#edf2fa}.column-group+ .column-group{break-before:page}.message{margin-bottom:${spacing}px;padding:12px;border:1px solid #d4dce8;border-radius:8px;break-inside:auto}.compact{border:0;border-bottom:1px solid #ddd;padding:4px}.message-body,pre{white-space:pre-wrap;overflow-wrap:anywhere}.bubble-row{display:flex;margin-bottom:${spacing}px}.bubble-row.own{justify-content:flex-end}.bubble-row.other{justify-content:flex-start}.bubble{max-width:75%;padding:8px 12px;border:1px solid #d4dce8;border-radius:14px;break-inside:avoid}.bubble-row.other .bubble{background:#f1f4f8;border-bottom-left-radius:4px}.bubble-row.own .bubble{background:#e4ebff;border-color:#c9d4f5;border-bottom-right-radius:4px}.bubble h3{margin:0 0 4px;font-size:11px;color:#53647e}.chat-notice{text-align:center;color:#53647e;font-size:11px;margin:0 auto ${spacing}px;max-width:80%;font-style:italic}p{margin:0 0 ${spacing}px}a{color:#345aca}pre{background:#f1f4f8;padding:8px}tr{break-inside:auto}blockquote{margin:0 0 ${spacing}px;padding:8px 12px;border-left:3px solid #9eafd2;background:#f6f8fc}code{background:#eef2f8;padding:1px 4px;border-radius:4px}ul,ol{margin:0 0 ${spacing}px;padding-left:22px}li{margin-bottom:4px}hr{border:0;border-top:1px solid #d4dce8;margin:${spacing}px 0}img{max-width:100%;height:auto}.md-task{margin-right:4px}.md-alt{color:#53647e}.data-table.zebra tbody tr:nth-child(even) td{background:#f6f8fc}.data-table.compact th,.data-table.compact td{padding:3px 5px}.data-table.roomy th,.data-table.roomy td{padding:9px 8px}.data-table.gridless th,.data-table.gridless td{border-left:0;border-right:0;border-top:0}.data-table .row-index{text-align:right;color:#53647e;background:#f9fbfd}.md-tree,.md-tree ul{list-style:none;margin:0;padding-left:16px;border-left:1px dashed #cfd8e8}.md-tree{margin-left:0}.md-tree li{margin:2px 0;overflow-wrap:anywhere}li>ul{margin-top:2px}.tree-key{font-weight:650}.tree-sep,.tree-bracket{color:#7b8496}.tree-bracket{margin-right:6px;font-size:.92em}.tree-value.tree-string{color:#146b48}.tree-value.tree-number{color:#1a4fa0}.tree-value.tree-boolean{color:#8a4b0f}.tree-value.tree-null,.tree-value.tree-undefined{color:#7b8496;font-style:italic}</style></head><body><h1>${escape(title)}</h1>${body}</body></html>`;}
 return{limits,escape,losslessJson,pointer,data,tableHtml,treeHtml,conversation,filterMessages,conversationHtml,document};
});
