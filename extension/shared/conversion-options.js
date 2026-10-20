(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ConversionOptions = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const VERSION = 2;
  const papers = { A4:[210,297], A3:[297,420], A5:[148,210], Letter:[215.9,279.4], Legal:[215.9,355.6] };
  const fail = message => { const error = new Error(message); error.code = 'INVALID_OPTIONS'; throw error; };
  const number = (v, fallback, min, max, name) => { const n = v === undefined ? fallback : Number(v); if (!Number.isFinite(n) || n < min || n > max) fail(`${name} must be between ${min} and ${max}.`); return Math.round(n * 1000) / 1000; };
  const choice = (v, fallback, values, name) => { v = v === undefined ? fallback : v; if (!values.includes(v)) fail(`Unsupported ${name}.`); return v; };
  const bool = (v, fallback) => { if (v === undefined) return fallback; if (typeof v !== 'boolean') fail('Expected a boolean option.'); return v; };
  const keys = (obj, allowed) => { if (!obj || typeof obj !== 'object' || Array.isArray(obj)) fail('Options must be an object.'); Object.keys(obj).forEach(k => { if (!allowed.includes(k)) fail(`Unknown option: ${k}`); }); };
  function normalize(input = {}) {
    keys(input, ['paper','orientation','layout','marginsMm','scale','printBackground','media','contentMode','selector','pageRanges','headerFooter','loading','viewport','hideFixed','hideNavigation','preferCSSPageSize','javascript','waitFor','output','markdownFrontMatter','markdownToc','localizeImages','remoteImages']);
    const p = input.paper || {}; keys(p, ['mode','format','widthMm','heightMm']);
    const mode = choice(p.mode,'preset',['preset','custom'],'paper mode');
    if (mode === 'custom' && p.format !== undefined) fail('Custom paper cannot also have a format.');
    if (mode === 'preset' && (p.widthMm !== undefined || p.heightMm !== undefined)) fail('Preset paper cannot have custom dimensions.');
    const paper = mode === 'preset' ? {mode,format:choice(p.format,'A4',Object.keys(papers),'paper format')} : {mode,widthMm:number(p.widthMm,210,50,500,'Width'),heightMm:number(p.heightMm,297,50,500,'Height')};
    const m = input.marginsMm || {}; keys(m,['top','right','bottom','left']);
    const marginsMm = Object.fromEntries(['top','right','bottom','left'].map(k => [k,number(m[k],10,0,50,'Margin')]));
    const h = input.headerFooter || {}; keys(h,['enabled','templateId','template']);
    const l = input.loading || {}; keys(l,['preset','preScroll']);
    const o = {paper,orientation:choice(input.orientation,'portrait',['portrait','landscape'],'orientation'),layout:choice(input.layout,'paged',['paged','long'],'layout'),marginsMm,
      scale:number(input.scale,1,.5,1.5,'Scale'),printBackground:bool(input.printBackground,true),media:choice(input.media,'print',['print','screen'],'media'),
      contentMode:choice(input.contentMode,'full',['full','article','selection'],'content mode'),selector:input.selector || '',pageRanges:input.pageRanges || '',
      headerFooter:{enabled:bool(h.enabled,false),templateId:choice(h.templateId,'title-page',['title-page','source-date','page-only','custom'],'header/footer template'),template:typeof h.template==='string'?h.template.slice(0,200):''},
      loading:{preset:choice(l.preset,'balanced',['fast','balanced','patient'],'loading preset'),preScroll:bool(l.preScroll,false)},
      viewport:choice(input.viewport,'desktop',['desktop','mobile'],'viewport'),hideFixed:bool(input.hideFixed,false),hideNavigation:bool(input.hideNavigation,false),preferCSSPageSize:bool(input.preferCSSPageSize,false),
      javascript:bool(input.javascript,true),waitFor:typeof input.waitFor==='string'?input.waitFor.slice(0,300):'',output:choice(input.output,'pdf',['pdf','markdown','text'],'output'),markdownFrontMatter:bool(input.markdownFrontMatter,true),markdownToc:bool(input.markdownToc,false),localizeImages:choice(input.localizeImages,'off',['off','inline','zip'],'image localization'),remoteImages:bool(input.remoteImages,false)};
    if (typeof o.waitFor !== 'string' || o.waitFor.length > 300) fail('Use a valid CSS selector.');
    if (o.waitFor && !o.waitFor.trim()) o.waitFor = '';
    if (typeof o.selector !== 'string' || o.selector.length > 300 || (o.contentMode === 'selection' && !o.selector.trim())) fail('Choose a valid element selector first.');
    if (typeof o.pageRanges !== 'string' || o.pageRanges.length > 200 || (o.pageRanges && !/^\s*\d+(?:\s*-\s*\d+)?(?:\s*,\s*\d+(?:\s*-\s*\d+)?)*\s*$/.test(o.pageRanges))) fail('Use page ranges such as 1-3, 5.');
    if (o.pageRanges) o.pageRanges.split(',').forEach(r => { const [a,b=a] = r.split('-').map(Number); if (a<1 || b<a || b>10000) fail('Invalid page range.'); });
    if (o.output === 'pdf') {
      if (o.layout === 'long' && (o.pageRanges || o.headerFooter.enabled || o.preferCSSPageSize)) fail('Long pages cannot use page ranges, headers/footers or source paper size.');
      if (o.headerFooter.enabled && (marginsMm.top<12 || marginsMm.bottom<12)) fail('Headers and footers need at least 12 mm top and bottom margins.');
      if (o.headerFooter.enabled && o.headerFooter.templateId === 'custom' && !o.headerFooter.template.trim()) fail('Enter header/footer text, or choose a built-in template.');
      // Page scripts drive measurement, cleanup and content selection; without them those steps cannot run.
      // Disabling JavaScript also makes waiting for a (usually script-rendered) element meaningless.
      if (!o.javascript && (o.layout === 'long' || o.contentMode !== 'full' || o.loading.preScroll || o.hideFixed || o.hideNavigation || o.waitFor)) fail('Reading the page without JavaScript cannot use long pages, content selection, page cleanup or waiting for an element.');
      const [w,hgt] = dimensions(o);
      if (w-marginsMm.left-marginsMm.right<10 || hgt-marginsMm.top-marginsMm.bottom<10) fail('Margins leave too little printable space.');
    }
    return o;
  }
  function dimensions(o) { let [w,h] = o.paper.mode === 'custom' ? [o.paper.widthMm,o.paper.heightMm] : papers[o.paper.format]; return o.orientation === 'landscape' ? [h,w] : [w,h]; }
  function cdp(o, metadata = {}, longHeightMm) {
    const [w,h] = dimensions(o); const escape = s => String(s || '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const base = 'font-size:8px;width:100%;padding:0 12mm;color:#555;';
    let header = '<span></span>', footer = '<span></span>';
    if (o.headerFooter.enabled) {
      const tokens = {title:'<span class="title"></span>',url:escape(metadata.url||''),date:'<span class="date"></span>',page:'<span class="pageNumber"></span>',total:'<span class="totalPages"></span>'};
      const render = value => escape(value).replace(/\{(title|url|date|page|total)\}/g,(_,name)=>tokens[name]);
      const custom = o.headerFooter.templateId === 'custom';
      // Custom text: "Text |more" splits header | footer, so one field can fill both bands.
      const [customHeader, customFooter = ''] = custom ? String(o.headerFooter.template).split('|') : ['',''];
      header = `<div style="${base}">${custom ? render(customHeader) : o.headerFooter.templateId === 'title-page' ? tokens.title : o.headerFooter.templateId === 'source-date' ? tokens.url : ''}</div>`;
      footer = `<div style="${base}text-align:right">${custom ? render(customFooter) : `${o.headerFooter.templateId === 'source-date' ? tokens.date + ' · ' : ''}${tokens.page} / ${tokens.total}`}</div>`;
    }
    return {paperWidth:w/25.4,paperHeight:(longHeightMm || h)/25.4,landscape:false,scale:o.scale,printBackground:o.printBackground,preferCSSPageSize:o.preferCSSPageSize,
      marginTop:o.marginsMm.top/25.4,marginRight:o.marginsMm.right/25.4,marginBottom:o.marginsMm.bottom/25.4,marginLeft:o.marginsMm.left/25.4,
      pageRanges:o.pageRanges,displayHeaderFooter:o.headerFooter.enabled,headerTemplate:header,footerTemplate:footer};
  }
  function puppeteer(o, metadata, longHeightMm) { const v = cdp(o,metadata,longHeightMm); return {width:`${v.paperWidth}in`,height:`${v.paperHeight}in`,scale:v.scale,printBackground:v.printBackground,preferCSSPageSize:v.preferCSSPageSize,pageRanges:v.pageRanges,displayHeaderFooter:v.displayHeaderFooter,headerTemplate:v.headerTemplate,footerTemplate:v.footerTemplate,margin:{top:`${v.marginTop}in`,right:`${v.marginRight}in`,bottom:`${v.marginBottom}in`,left:`${v.marginLeft}in`}}; }
  function filename(value, ext = 'pdf') { return (String(value || 'document').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/\.\w+$/i,'').trim().slice(0,100) || 'document') + '.' + ext; }
  function rangeIndices(range, count) { if (!range) return Array.from({length:count},(_,i)=>i); const result = new Set(); for (const part of range.split(',')) { const [a,b=a] = part.split('-').map(Number); if (a<1 || b<a || b>count) fail(`Page range exceeds the ${count} pages in this document.`); for(let i=a;i<=b;i++)result.add(i-1); } return [...result].sort((a,b)=>a-b); }
  // Engine capability matrix (planning docs: E1-3 "capability-driven UI").
  // Single source of truth: controls.js reads this to decide which options to show, so an
  // option can never be clickable-but-ignored for a given engine. Adding a capability here
  // makes the control appear; removing it hides the control. Never gate visibility anywhere else.
  const capabilities = {
    server:{paper:true,orientation:true,margins:true,scale:true,layout:true,long:true,ranges:true,background:true,headers:true,content:true,media:true,viewport:true,preferCSSPageSize:true,hideFixed:true,hideNavigation:true,preScroll:true,loading:true,javascript:true,waitFor:true,systemPrint:false},
    extension:{paper:true,orientation:true,margins:true,scale:true,layout:true,long:true,ranges:true,background:true,headers:true,content:true,media:true,viewport:false,preferCSSPageSize:true,hideFixed:true,hideNavigation:true,preScroll:true,loading:true,javascript:false,waitFor:true,systemPrint:false},
    html:{paper:true,orientation:true,margins:true,scale:false,layout:false,long:false,ranges:true,background:true,headers:false,content:false,media:false,viewport:false,preferCSSPageSize:false,hideFixed:false,hideNavigation:false,preScroll:false,loading:false,javascript:false,waitFor:false,systemPrint:true},
    images:{paper:true,orientation:true,margins:true,scale:false,layout:false,long:false,ranges:true,background:false,headers:false,content:false,media:false,viewport:false,preferCSSPageSize:false,hideFixed:false,hideNavigation:false,preScroll:false,loading:false,javascript:false,waitFor:false,systemPrint:false}
  };
  const supports = (engine, capability) => !!capabilities[engine]?.[capability];
  return {VERSION,papers,normalize,dimensions,cdp,puppeteer,filename,rangeIndices,capabilities,supports};
});
