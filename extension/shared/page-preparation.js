(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PagePreparation=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  // Self-contained: also executed through CDP / chrome.scripting in an isolated world.
  async function prepare(options, action = 'prepare') {
    const key = '__gcdPrintPreparation';
    const runId=globalThis.__gcdPreparationRun=(globalThis.__gcdPreparationRun||0)+1;
    const checkCurrent=()=>{if(globalThis.__gcdPreparationRun!==runId||globalThis.__gcdPrintCancelled)throw Object.assign(Error('Conversion cancelled.'),{code:'CANCELLED'});};
    globalThis.__gcdPickerStop?.();
    if (globalThis[key]) { globalThis[key](); delete globalThis[key]; }
    const exclusions=globalThis.__gcdHiddenElements||[];
    exclusions.forEach(item=>{if(item.style===null)item.el.removeAttribute('style');else item.el.setAttribute('style',item.style);});
    if (action === 'restore') {globalThis.__gcdPrintCancelled=false;return {warnings:[]};}
    const warnings = [], changed = new Map(), styles = [], imageLoading = new Map(), imageSource = new Map();
    const report=stage=>{try{globalThis.chrome?.runtime?.sendMessage({type:'PAGE_PROGRESS',stage}).catch(()=>{});}catch{}};
    const scroll = {x:scrollX,y:scrollY};
    const remember = element => { if (!changed.has(element)) changed.set(element,element.getAttribute('style')); };
    const hide = element => { remember(element); element.style.setProperty('display','none','important'); };
    let restored=false;
    const cleanup=globalThis[key] = () => {if(restored)return;restored=true;changed.forEach((value,element)=>value===null?element.removeAttribute('style'):element.setAttribute('style',value)); imageLoading.forEach((value,element)=>value===null?element.removeAttribute('loading'):element.setAttribute('loading',value)); imageSource.forEach((value,element)=>value===null?element.removeAttribute('src'):element.setAttribute('src',value)); styles.forEach(el=>el.remove()); window.scrollTo(scroll.x,scroll.y); };
    try {
      exclusions.filter(item=>item.el.isConnected).forEach(item=>hide(item.el));
      if (options.loading.preScroll) {
        report('scrolling');
        let rounds=0,last=0,stable=0; const until=Date.now()+5000;
        while (rounds++<30 && Date.now()<until) {
          checkCurrent();
          if(globalThis.__gcdSkipWait)break;
          window.scrollBy(0,Math.max(300,innerHeight*.8)); await new Promise(r=>setTimeout(r,100));
          checkCurrent();
          const height=document.documentElement.scrollHeight; stable=height===last?stable+1:0; last=height;
          if (scrollY+innerHeight>=height-5 && stable>=2) break;
        }
        if (rounds>=30 || Date.now()>=until) warnings.push('Scrolling stopped at the safety limit. Only loaded content can be exported.');
        window.scrollTo(scroll.x,scroll.y);
      }
      let selected;
      checkCurrent();report('organizing');
      if (options.contentMode==='article') {
        report('article');
        const ancillary=el=>!!el.closest('nav,aside,[role="navigation"],[role="complementary"],[class*="recommend" i],[class*="related" i],[class*="sidebar" i],[class*="advert" i],[id*="recommend" i],[id*="related" i],[id*="sidebar" i],[id*="advert" i]');
        // Readability only reads a clone. Keep original nodes/styles, tables and code
        // in the PDF instead of inserting extracted HTML into the user's live page.
        let articleText='';
        if(typeof Readability!=='undefined'){
          const clone=document.cloneNode(true);
          clone.querySelectorAll('nav,aside,[role="navigation"],[role="complementary"],[class*="recommend" i],[class*="related" i],[class*="sidebar" i],[class*="advert" i],[id*="recommend" i],[id*="related" i],[id*="sidebar" i],[id*="advert" i]').forEach(el=>el.remove());
          try{articleText=(new Readability(clone,{charThreshold:80}).parse()?.textContent||'').replace(/\s+/g,' ').trim();}catch{}
        }
        const candidateSet=new Set([...document.querySelectorAll('article,main,[role="main"]')].slice(0,100));
        for(const paragraph of [...document.querySelectorAll('p')].slice(0,500)){let el=paragraph.parentElement;for(let depth=0;el&&el!==document.body&&depth<3;depth++,el=el.parentElement)candidateSet.add(el);}
        const candidates=[...candidateSet].slice(0,300);
        const scored=candidates.map(el=>{
          if(!el.getClientRects().length||ancillary(el))return {el,score:0};
          const paragraphs=[...el.querySelectorAll('p')].filter(p=>!ancillary(p));
          const text=paragraphs.map(p=>p.innerText||'').join(' ').replace(/\s+/g,' ').trim();
          const links=[...el.querySelectorAll('a')].reduce((n,a)=>n+(a.innerText||'').length,0);
          const density=links/Math.max(1,text.length);
          if(text.length<80||density>.45||(!el.matches('article,main,[role="main"]')&&paragraphs.length<2))return {el,score:0};
          const matched=paragraphs.reduce((n,p)=>{const value=(p.innerText||'').replace(/\s+/g,' ').trim();return n+(value.length>=40&&(!articleText||articleText.includes(value.slice(0,100)))?value.length:0);},0);
          const score=(matched||(!articleText?text.length:0))*Math.pow(1-density,2)*(el.matches('article')?1.3:1);
          return {el,score};
        }).filter(item=>item.score>0).sort((a,b)=>b.score-a.score);
        // GitHub READMEs can be almost entirely links or very short. Their
        // dedicated rendered Markdown container is more reliable than prose density.
        const githubReadme=location.hostname==='github.com'&&[...document.querySelectorAll('article.markdown-body')].find(el=>el.getClientRects().length&&(el.innerText||'').trim().length>=80);
        selected=githubReadme||scored[0]?.el;
        // Prefer a more specific container when it retains essentially the same prose.
        if(!githubReadme)for(const candidate of scored)if(selected?.contains(candidate.el)&&candidate.score>=scored[0].score*.95)selected=candidate.el;
        if(!selected)throw Error('Main article could not be identified. Choose Full page or Pick content.');
        selected.querySelectorAll('nav,aside,[role="navigation"],[role="complementary"],[class*="recommend" i],[class*="related" i],[class*="sidebar" i],[class*="advert" i],[id*="recommend" i],[id*="related" i],[id*="sidebar" i],[id*="advert" i]').forEach(hide);
      } else if (options.contentMode==='selection') {
        const picked=globalThis.__gcdSelectedElement;
        if(picked?.selector===options.selector&&!picked.el.isConnected)throw Error('The selected element is no longer present. Select it again.');
        try {selected=document.querySelector(options.selector);} catch {throw Error('Invalid element selector.');}
        if(picked?.selector===options.selector&&selected!==picked.el)throw Error('The selected element is no longer present. Select it again.');
        if(!selected) throw Error('The selected element is no longer present. Select it again.');
      }
      if(selected && selected!==document.body && selected!==document.documentElement){
        for(let node=selected;node && node!==document.body;node=node.parentElement){
          const parent=node.parentElement;if(!parent)break;
          [...parent.children].forEach(sibling=>{
            const heading=options.contentMode==='article'&&sibling===node.previousElementSibling&&(sibling.matches('h1,h2')||sibling.matches('header')&&sibling.querySelector('h1,h2'))&&sibling.innerText.length<300;
            if(sibling!==node&&!heading&&!['STYLE','SCRIPT','LINK'].includes(sibling.tagName))hide(sibling);
          });
          remember(parent); parent.style.setProperty('min-height','0','important'); parent.style.setProperty('height','auto','important'); parent.style.setProperty('overflow','visible','important');
        }
      }
      const elements=[...document.body.querySelectorAll('*')];
      if(elements.length>30000) warnings.push('Very large page: cleanup was limited to the first 30,000 elements.');
      let frameBudget=10000,expandedFrames=0,uncertainFrames=false;
      for(const frame of elements.slice(0,30000)){
        if(frame.tagName!=='IFRAME'||!frame.getClientRects().length)continue;
        try{
          const embedded=frame.contentDocument;
          if(!embedded||!embedded.body?.textContent.trim()||embedded.readyState==='loading'){uncertainFrames=true;continue;}
          const height=Math.max(embedded.body.scrollHeight,embedded.documentElement.scrollHeight);
          const extra=height-frame.clientHeight;
          if(embedded.documentElement.scrollWidth>frame.clientWidth+8||extra>5000||extra>frameBudget||expandedFrames>=10){uncertainFrames=true;continue;}
          if(extra>8){remember(frame);frame.style.setProperty('height',height+'px','important');frame.style.setProperty('max-height','none','important');frameBudget-=extra;expandedFrames++;}
          if(embedded.documentElement.scrollHeight>frame.clientHeight+8)uncertainFrames=true;
        }catch{uncertainFrames=true;}
      }
      if(uncertainFrames)warnings.push('Embedded content may be incomplete. Review the PDF before saving.');
      let expansionBudget=10000,expandedBoxes=0,clippedBoxes=false;
      for(const el of elements.slice(0,30000)){
        if(!el.getClientRects().length||el.clientHeight<=0||el.scrollHeight<=el.clientHeight+8)continue;
        if(!['auto','scroll'].includes(getComputedStyle(el).overflowY))continue;
        const extra=el.scrollHeight-el.clientHeight;
        if(expandedBoxes>=20||extra>5000||extra>expansionBudget){clippedBoxes=true;continue;}
        remember(el);
        el.style.setProperty('height','auto','important');
        el.style.setProperty('max-height','none','important');
        el.style.setProperty('overflow','visible','important');
        if(el.scrollHeight>el.clientHeight+8){clippedBoxes=true;continue;}
        expansionBudget-=extra;expandedBoxes++;
      }
      if(clippedBoxes)warnings.push('Scrollable sections may contain hidden content. Expand them before converting.');
      elements.slice(0,30000).forEach(el=>{
        if(selected && (el===selected || el.contains(selected)))return;
        if(options.hideNavigation && el.matches('nav,[role="navigation"]'))hide(el);
        if(options.hideFixed && ['fixed','sticky'].includes(getComputedStyle(el).position))hide(el);
      });
      const css=document.createElement('style'); css.dataset.gcdPrint='true';
      css.textContent='@media print{*{animation:none!important;transition:none!important}img{max-width:100%;height:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere}table{max-width:100%;overflow-wrap:anywhere}thead{display:table-header-group}h1,h2,h3{break-after:avoid}p{orphans:2;widows:2}}';
      if(/(^|\.)notion\.(?:so|site)$/.test(location.hostname))css.textContent+='@media print{.layout{padding-bottom:0!important}.notion-page-content,.notion-page-content .notion-selectable{height:auto!important;min-height:0!important;break-inside:auto!important;page-break-inside:auto!important}.notion-page-content .notion-header-block,.notion-page-content .notion-sub_header-block{break-after:avoid!important}.notion-page-content img{max-width:600px!important;height:auto!important;object-fit:contain!important}.notion-column_list-block>div{display:block!important}.notion-column_list-block>div>div:empty{display:none!important}.notion-column_list-block>div>div:not(:empty){width:100%!important;height:auto!important;flex:none!important}.notion-column_list-block .notion-column-block{display:block!important;width:100%!important;max-width:100%!important}}';
      if(!options.preferCSSPageSize) {
        const formats={A4:[210,297],A3:[297,420],A5:[148,210],Letter:[215.9,279.4],Legal:[215.9,355.6]};
        let [w,h]=options.paper.mode==='custom'?[options.paper.widthMm,options.paper.heightMm]:formats[options.paper.format];
        if(options.orientation==='landscape')[w,h]=[h,w];
        css.textContent+=`@page{size:${w}mm ${options.layout==='long'?'auto':h+'mm'}!important;margin:${options.marginsMm.top}mm ${options.marginsMm.right}mm ${options.marginsMm.bottom}mm ${options.marginsMm.left}mm!important}`;
      }
      document.head.append(css);styles.push(css);
      const budget={fast:2000,balanced:5000,patient:10000}[options.loading.preset];
      report('resources');
      const visibleImages=[...document.images].filter(img=>img.getClientRects().length);
      // Some sites use a tiny placeholder and store the actual URL in data-src.
      // Resolve only normal web URLs and restore the original src afterward.
      visibleImages.forEach(img=>{
        const source=img.getAttribute('src')||'';
        const lazy=img.getAttribute('data-src');
        if(!lazy||source&&!/^data:image\//i.test(source))return;
        try{const url=new URL(lazy,document.baseURI);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return;imageSource.set(img,img.getAttribute('src'));img.src=url.href;}catch{}
      });
      // Native lazy images outside the viewport still belong in the PDF. Start
      // their normal browser request without guessing site-specific data-src URLs.
      visibleImages.forEach(img=>{if(img.loading==='lazy'){imageLoading.set(img,img.getAttribute('loading'));img.loading='eager';}});
      let timeout,cancelTimer,settled;
      try{settled=await Promise.race([Promise.all([document.fonts?.ready,...visibleImages.map(img=>img.decode?.().catch(()=>{}))]).then(()=>true),new Promise(r=>{timeout=setTimeout(()=>r(false),budget);}),new Promise((resolve,reject)=>{cancelTimer=setInterval(()=>{if(globalThis.__gcdPrintCancelled||globalThis.__gcdPreparationRun!==runId)reject(Error('Conversion cancelled.'));else if(globalThis.__gcdSkipWait)resolve(false);},100);})]);}
      finally{clearTimeout(timeout);clearInterval(cancelTimer);}
      checkCurrent();
      if(!settled)warnings.push('Some fonts or images did not finish loading before the time limit.');
      if(globalThis.__gcdSkipWait)warnings.push('Loading was skipped. Some content may be missing.');
      const missing=visibleImages.filter(img=>!img.complete || img.naturalWidth===0).length;
      if(missing)warnings.push(`${missing} image(s) could not be loaded. Review the PDF before saving.`);
      report('printing');
      return {warnings,scope:selected?selected.tagName.toLowerCase():'body',title:document.title,height:Math.max(document.body.scrollHeight,document.documentElement.scrollHeight),width:document.documentElement.clientWidth};
    } catch(error) {cleanup();if(globalThis.__gcdPreparationRun===runId)delete globalThis[key];throw error;}
  }
  return {prepare};
});
