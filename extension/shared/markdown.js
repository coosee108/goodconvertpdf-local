// Minimal Markdown renderer for local documents. No HTML from the source is executed:
// everything is escaped and rebuilt, and prepareHtml() sanitizes the result again.
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.Markdown=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const ENTITIES={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>ENTITIES[c]);
 const safeUrl=raw=>{
  const url=String(raw).replace(/&amp;/g,'&').trim();
  return /^(https?:|mailto:)/i.test(url)?escape(url):'';
 };
 function inline(text){
  const codes=[];
  let out=escape(text).replace(/`([^`\n]+)`/g,(match,code)=>{codes.push(code);return '\u0000'+(codes.length-1)+'\u0000';});
  out=out.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^)]*&quot;)?\)/g,(match,alt,url)=>{
   const safe=safeUrl(url);
   return safe?`<img src="${safe}" alt="${alt}">`:`<span class="md-alt">${alt||match}</span>`;
  });
  out=out.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^)]*&quot;)?\)/g,(match,label,url)=>{
   const safe=safeUrl(url);
   return safe?`<a href="${safe}">${label}</a>`:label;
  });
  out=out.replace(/(\*\*|__)([^\n]+?)\1/g,(match,marker,content)=>`<strong>${content}</strong>`);
  out=out.replace(/(^|[^\w\\])_([^\n_]+)_(?![\w])/g,(match,lead,content)=>`${lead}<em>${content}</em>`);
  out=out.replace(/\*([^\s*][^\n*]*)\*/g,'<em>$1</em>');
  out=out.replace(/~~([^\n~]+)~~/g,'<del>$1</del>');
  return out.replace(/\u0000(\d+)\u0000/g,(match,index)=>`<code>${escape(codes[Number(index)])}</code>`);
 }
 const FENCE=/^\s{0,3}(```|~~~)\s*([\w+#-]*)\s*$/;
 const HEADING=/^\s{0,3}(#{1,6})\s+(.*)$/;
 const RULE=/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
 const QUOTE=/^\s{0,3}>\s?(.*)$/;
 const BULLET=/^(\s*)([-*+])\s+(.*)$/;
 const ORDERED=/^(\s*)(\d{1,9})[.)]\s+(.*)$/;
 const TABLE_SEPARATOR=/^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/;
 function startsBlock(line){
  return FENCE.test(line)||HEADING.test(line)||RULE.test(line)||QUOTE.test(line)||BULLET.test(line)||ORDERED.test(line);
 }
 function splitRow(row){
  return row.replace(/^\s*\|/,'').replace(/\|\s*$/,'').split('|').map(cell=>cell.trim());
 }
 function renderItem(lines){
  const first=lines[0]||'',rest=lines.slice(1);
  const task=first.match(/^\[([ xX])\]\s*(.*)$/);
  const head=task
   ? `<span class="md-task">${/^[xX]$/.test(task[1])?'[x]':'[ ]'}</span> ${inline(task[2])}`
   : inline(first);
  return head+(rest.length?'<br>'+rest.map(inline).join('<br>'):'');
 }
 function renderList(items,ordered){
  const base=Math.min(...items.map(item=>item.indent));
  let html='<'+(ordered?'ol':'ul')+'>';
  let i=0;
  while(i<items.length){
   let j=i+1;const children=[];
   while(j<items.length&&items[j].indent>base)children.push(items[j++]);
   html+=`<li>${renderItem(items[i].lines)}${children.length?renderList(children,ordered):''}</li>`;
   i=j;
  }
  return html+'</'+(ordered?'ol':'ul')+'>';
 }
 function blocks(lines){
  let html='',i=0;
  while(i<lines.length){
   const line=lines[i];
   if(!line.trim()){i++;continue;}
   const fence=line.match(FENCE);
   if(fence){
    const marker=fence[1],language=fence[2],body=[];i++;
    while(i<lines.length&&!(lines[i].match(FENCE)&&lines[i].trim().slice(0,3)===marker))body.push(lines[i++]);
    i++;
    html+=`<pre class="md-code${language?' language-'+escape(language):''}"><code>${escape(body.join('\n'))}</code></pre>`;
    continue;
   }
   const heading=line.match(HEADING);
   if(heading){
    const level=heading[1].length;
    html+=`<h${level}>${inline(heading[2].replace(/\s+#+\s*$/,''))}</h${level}>`;i++;
    continue;
   }
   if(/\|/.test(line)&&i+1<lines.length&&TABLE_SEPARATOR.test(lines[i+1])&&!/^\|?\s*$/.test(line)){
    const head=splitRow(line);i+=2;const rows=[];
    while(i<lines.length&&/\|/.test(lines[i])&&lines[i].trim())rows.push(splitRow(lines[i++]));
    html+=`<table><thead><tr>${head.map(cell=>`<th>${inline(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(cell=>`<td>${inline(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    continue;
   }
   if(RULE.test(line)){html+='<hr>';i++;continue;}
   if(QUOTE.test(line)){
    const quoted=[];
    while(i<lines.length&&QUOTE.test(lines[i])){quoted.push(lines[i].replace(QUOTE,'$1'));i++;}
    html+=`<blockquote>${blocks(quoted)}</blockquote>`;
    continue;
   }
   const bullet=line.match(BULLET),ordered=line.match(ORDERED);
   if(bullet||ordered){
    const isOrdered=!!ordered,items=[];
    while(i<lines.length){
     const item=lines[i].match(isOrdered?ORDERED:BULLET);
     if(item)items.push({indent:item[1].length,lines:[item[3]]});
     else if(items.length&&lines[i].trim()&&/^\s{2,}/.test(lines[i]))items[items.length-1].lines.push(lines[i].trim());
     else break;
     i++;
    }
    html+=renderList(items,isOrdered);
    continue;
   }
   const paragraph=[];
   while(i<lines.length&&lines[i].trim()&&!startsBlock(lines[i]))paragraph.push(lines[i++]);
   html+=`<p>${paragraph.map(inline).join('<br>')}</p>`;
  }
  return html;
 }
 function toHtml(text){
  if(!String(text).trim())throw Error('Add Markdown content first.');
  const normalized=String(text).replace(/\r\n?/g,'\n').replace(/\u0000/g,'');
  const html=blocks(normalized.split('\n'));
  const warnings=['Single line breaks are kept as new lines. Links other than http(s) and mailto are shown as plain text.'];
  if(/<img\s/.test(html))warnings.push('Images load from their original address when you preview or print. Embed them offline if you need an exact archive.');
  if(/<script|onerror=/i.test(normalized))warnings.push('Markdown does not execute HTML. Raw HTML blocks appear as text.');
  return {html,warnings};
 }
 return {toHtml,inline,escape};
});
