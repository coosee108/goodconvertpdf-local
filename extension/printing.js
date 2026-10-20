const printingTabs=new Set();
const cancelledPrintingTabs=new Set();
const printingAttachments=new Set();
async function cancelPrintTab(tabId){
  if(!printingTabs.has(tabId))return;
  cancelledPrintingTabs.add(tabId);
  await Promise.allSettled([
    chrome.scripting.executeScript({target:{tabId},func:()=>{globalThis.__gcdPrintCancelled=true;}}),
    printingAttachments.has(tabId)?chrome.debugger.detach({tabId}):Promise.resolve()
  ]);
}
// Firefox 等浏览器没有 chrome.debugger / CDP 的 Page.printToPDF，退化为浏览器原生打印对话框（另存为 PDF）。
async function printTabFallback(tabId,input){
  if(printingTabs.has(tabId))throw Error('This page is already being converted.');
  const options=ConversionOptions.normalize(input||{}),tab=await chrome.tabs.get(tabId);
  if(!/^https?:/i.test(tab.url||''))throw Error('Open a normal HTTP(S) webpage before converting.');
  printingTabs.add(tabId);
  // Firefox 需要目标标签页处于激活/可见状态，window.print() 弹出的系统打印对话框才能被用户看到；
  // 否则对话框会挂在后台原网页上，用户在当前工作台标签页看不到任何反应。
  await chrome.tabs.update(tabId,{active:true});
  if(tab.windowId!=null) await chrome.windows.update(tab.windowId,{focused:true}).catch(()=>{});
  try{
    await chrome.scripting.executeScript({
      target:{tabId},
      func:(cssUrl)=>{
        globalThis.__gcdPrintCleanup?.();
        let link=document.querySelector('link[data-gcd-print]');
        if(!link){link=document.createElement('link');link.rel='stylesheet';link.dataset.gcdPrint='';document.head.appendChild(link);}
        link.href=chrome.runtime.getURL(cssUrl);
        let timer;
        const cleanup=()=>{clearTimeout(timer);window.removeEventListener('afterprint',cleanup);window.removeEventListener('pagehide',cleanup);link.remove();delete globalThis.__gcdPrintCleanup;};
        globalThis.__gcdPrintCleanup=cleanup;
        window.addEventListener('afterprint',cleanup,{once:true});window.addEventListener('pagehide',cleanup,{once:true});
        timer=setTimeout(cleanup,300000);
        setTimeout(()=>{try{window.print();}catch{cleanup();}},80);
        return true;
      },
      args:['print.css']
    });
    return {ok:true,manual:true};
  }finally{
    printingTabs.delete(tabId);
  }
}
async function prepareTab(tabId,options,action='prepare'){
  if(action==='prepare'&&options.contentMode==='article')await chrome.scripting.executeScript({target:{tabId},files:['vendor/readability.js']});
  await chrome.scripting.executeScript({target:{tabId},files:['shared/page-preparation.js']});
  // Chrome may omit a rejected injected promise from InjectionResult. Return an
  // explicit envelope so a failed article extraction cannot look like success.
  const results=await chrome.scripting.executeScript({target:{tabId},func:async(options,action)=>{
    try{return {ok:true,value:await globalThis.PagePreparation.prepare(options,action)};}
    catch(error){return {ok:false,error:error.message,code:error.code};}
  },args:[options,action]});
  const result=results[0]?.result;
  if(!result?.ok)throw Object.assign(Error(result?.error||'The extension could not finish this operation.'),{code:result?.code});
  return result.value;
}
// Poll the live tab for a selector before printing — covers lazy/SPA content
// that the browser's own print path cannot wait for.
async function waitForSelector(tabId, selector, timeoutMs){
  const results=await chrome.scripting.executeScript({
    target:{tabId},
    func:(sel,ms)=>new Promise(resolve=>{
      chrome.runtime.sendMessage({type:'PAGE_PROGRESS',stage:'resources'}).catch(()=>{});
      try{ document.querySelector(sel); }catch(e){ return resolve({ok:false,code:'SELECTION_INVALID'}); }
      const start=Date.now();
      (function check(){
        if(globalThis.__gcdPrintCancelled)return resolve({ok:false,code:'CANCELLED'});
        if(globalThis.__gcdSkipWait)return resolve({ok:true});
        let el; try{ el=document.querySelector(sel); }catch(e){ return resolve({ok:false,code:'SELECTION_INVALID'}); }
        if(el && (el.getClientRects().length || el.getBoundingClientRect().width)) return resolve({ok:true});
        if(Date.now()-start>=ms) return resolve({ok:false,code:'TIMEOUT'});
        setTimeout(check,200);
      })();
    }),
    args:[selector, timeoutMs],
    timeout: timeoutMs+3000
  });
  if(!results[0]?.result?.ok)throw Object.assign(Error('The requested element did not appear within the time limit.'),{code:results[0]?.result?.code||'TIMEOUT'});
}
async function printTab(tabId,input){
  if(typeof chrome.debugger==='undefined')return printTabFallback(tabId,input);
  if(printingTabs.has(tabId))throw Error('This page is already being converted.');
  const options=ConversionOptions.normalize(input||{}),tab=await chrome.tabs.get(tabId);
  if(!/^https?:/i.test(tab.url||''))throw Error('Open a normal HTTP(S) webpage before converting.');
  printingTabs.add(tabId);let attached=false,metrics=false;
  cancelledPrintingTabs.delete(tabId);
  let timedOut=false;
  const deadline=setTimeout(()=>{timedOut=true;cancelPrintTab(tabId).catch(()=>{});},70000);
  const checkCancelled=()=>{if(cancelledPrintingTabs.has(tabId))throw Object.assign(Error('Conversion cancelled.'),{code:timedOut?'TIMEOUT':'CANCELLED'});};
  try{
    await chrome.scripting.executeScript({target:{tabId},func:()=>{globalThis.__gcdPrintCancelled=false;globalThis.__gcdSkipWait=false;}});
    checkCancelled();
    await chrome.debugger.attach({tabId},'1.3');attached=true;printingAttachments.add(tabId);checkCancelled();
    await chrome.debugger.sendCommand({tabId},'Page.enable');
    checkCancelled();
    await chrome.debugger.sendCommand({tabId},'Emulation.setEmulatedMedia',{media:options.media});
    checkCancelled();
    if(options.waitFor){
      try{ await waitForSelector(tabId,options.waitFor,15000); }
      catch(error){ throw Object.assign(new Error('Waited for "'+String(options.waitFor).slice(0,80)+'" but it never appeared. Check the selector or use a more patient loading preset.'),{code:error.code}); }
    }
    if(options.layout==='long'){
      const [width]=ConversionOptions.dimensions(options);
      await chrome.debugger.sendCommand({tabId},'Emulation.setDeviceMetricsOverride',{width:Math.max(1,Math.floor((width-options.marginsMm.left-options.marginsMm.right)*96/25.4/options.scale)),height:800,deviceScaleFactor:1,mobile:false});metrics=true;
    }
    checkCancelled();
    const info=await prepareTab(tabId,options);let longHeight;
    checkCancelled();
    if(options.layout==='long'){
      const [w]=ConversionOptions.dimensions(options);
      longHeight=info.height*25.4/96*options.scale+options.marginsMm.top+options.marginsMm.bottom+2;
      if(longHeight>5000)throw Error('This page exceeds the 5,000 mm long-page limit. Use paginated layout.');
      await chrome.scripting.executeScript({target:{tabId},func:(w,h)=>{const style=document.querySelector('style[data-gcd-print]');if(style)style.textContent+=`@page{size:${w}mm ${h}mm!important}`;},args:[w,longHeight]});
    }
    const result=await chrome.debugger.sendCommand({tabId},'Page.printToPDF',ConversionOptions.cdp(options,{url:tab.url},longHeight));
    checkCancelled();
    if(result.data.length>54*1024*1024)throw Error('The PDF exceeds the 40 MB result limit. Try a smaller selection.');
    return {ok:true,data:result.data,warnings:info.warnings,title:info.title};
  }catch(error){checkCancelled();throw error;
  }finally{
    clearTimeout(deadline);
    await prepareTab(tabId,options,'restore').catch(()=>{});
    if(attached){if(metrics)await chrome.debugger.sendCommand({tabId},'Emulation.clearDeviceMetricsOverride').catch(()=>{});await chrome.debugger.sendCommand({tabId},'Emulation.setEmulatedMedia',{media:''}).catch(()=>{});await chrome.debugger.detach({tabId}).catch(()=>{});}
    printingTabs.delete(tabId);
    printingAttachments.delete(tabId);
    cancelledPrintingTabs.delete(tabId);
  }
}
async function getContentState(tabId){
  const [entry]=await chrome.scripting.executeScript({target:{tabId},func:()=>({
    excluded:new Set((globalThis.__gcdHiddenElements||[]).filter(item=>item.el.isConnected).map(item=>item.el)).size,
    selector:globalThis.__gcdSelectedElement?.selector||'',
    connected:!!globalThis.__gcdSelectedElement?.el?.isConnected
  })});
  return entry.result;
}
async function pickElement(tabId,mode,labels){
  await chrome.scripting.executeScript({target:{tabId},func:(mode,labels)=>{
    globalThis.__gcdPickerStop?.();
    const hidden=globalThis.__gcdHiddenElements ||= [], initialCount=hidden.length;
    const previousStyles=hidden.map(item=>({el:item.el,style:item.el.getAttribute('style')}));
    hidden.forEach(item=>{if(item.el.isConnected)item.el.style.setProperty('display','none','important');});
    let selected=null, hovered=null, narrower=[];
    const overlay=document.createElement('div');overlay.dataset.gcdPicker='';overlay.style.cssText='position:fixed;pointer-events:none;border:2px solid #496bff;background:#496bff18;z-index:2147483646';
    const bar=document.createElement('div');bar.dataset.gcdPicker='';bar.setAttribute('role','toolbar');bar.setAttribute('aria-label',labels.title);
    bar.style.cssText='position:fixed;bottom:16px;left:16px;right:16px;max-width:760px;margin:auto;display:flex;flex-wrap:wrap;gap:8px;padding:12px;background:#fff;color:#17233b;border:1px solid #496bff;border-radius:12px;box-shadow:0 4px 24px #0003;z-index:2147483647;font:14px system-ui';
    const status=document.createElement('span');status.setAttribute('role','status');status.style.cssText='flex-basis:100%;overflow-wrap:anywhere';bar.append(status);
    document.documentElement.append(overlay,bar);
    const buttons={};
    function restore(item){if(item.style===null)item.el.removeAttribute('style');else item.el.setAttribute('style',item.style);}
    function paint(el){overlay.hidden=!el?.isConnected;if(overlay.hidden)return;const rect=el.getBoundingClientRect();Object.assign(overlay.style,{left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px'});}
    function refresh(){status.textContent=mode==='hide'?labels.hidden.replace('{count}',String(hidden.length)):selected?labels.selected+' · '+selected.tagName.toLowerCase():labels.choose;
      if(buttons.confirm)buttons.confirm.disabled=!selected?.isConnected;
      if(buttons.grow)buttons.grow.disabled=!selected||selected===document.body;
      if(buttons.shrink)buttons.shrink.disabled=!narrower.length;
      if(buttons.undo)buttons.undo.disabled=hidden.length<=initialCount;
      paint(selected||hovered);
    }
    function button(id,label,action){const el=document.createElement('button');el.type='button';el.textContent=label;el.style.cssText='font:inherit;min-height:44px;padding:8px 12px;border:1px solid #ccd5ed;border-radius:8px;background:#f4f6ff;color:#17233b;cursor:pointer';el.onclick=action;bar.append(el);buttons[id]=el;}
    function selector(el){const parts=[];while(el&&el!==document.body){const parent=el.parentElement;if(!parent)break;parts.unshift(el.tagName.toLowerCase()+':nth-of-type('+([...parent.children].filter(n=>n.tagName===el.tagName).indexOf(el)+1)+')');el=parent;}return 'body'+(parts.length?' > '+parts.join(' > '):'');}
    function notify(el){chrome.runtime.sendMessage({type:'PAGE_PICKED',selector:el?selector(el):'',mode,time:Date.now()}).catch(()=>{});}
    function stop(){document.removeEventListener('mousemove',move,true);document.removeEventListener('click',click,true);document.removeEventListener('keydown',key,true);window.removeEventListener('scroll',repaint,true);window.removeEventListener('resize',repaint);window.removeEventListener('pagehide',cancel);overlay.remove();bar.remove();delete globalThis.__gcdPickerStop;}
    function changed(){chrome.runtime.sendMessage({type:'PAGE_CONTENT_CHANGED'}).catch(()=>{});}
    function cancel(){if(mode==='hide')while(hidden.length>initialCount)restore(hidden.pop());previousStyles.forEach(restore);stop();changed();}
    function repaint(){paint(selected||hovered);}
    function key(event){if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();cancel();}}
    function eligible(el){return el instanceof HTMLElement && el!==document.documentElement && !bar.contains(el) && el!==overlay;}
    function move(event){if(!selected&&eligible(event.target)){hovered=event.target;paint(hovered);}}
    function click(event){if(bar.contains(event.target))return;event.preventDefault();event.stopImmediatePropagation();const el=event.target;if(!eligible(el))return;
      if(mode==='hide'){if(el===document.body)return;hidden.push({el,style:el.getAttribute('style')});el.style.setProperty('display','none','important');hovered=null;}
      else {selected=el;narrower=[];}
      refresh();changed();
    }
    if(mode==='hide'){
      button('undo',labels.undo,()=>{if(hidden.length>initialCount)restore(hidden.pop());refresh();changed();});
      button('done',labels.done,()=>{notify(null);stop();});
    }else{
      button('grow',labels.grow,()=>{if(selected?.parentElement&&selected!==document.body){narrower.push(selected);selected=selected.parentElement;refresh();}});
      button('shrink',labels.shrink,()=>{if(narrower.length){selected=narrower.pop();refresh();}});
      button('again',labels.again,()=>{selected=null;hovered=null;narrower=[];refresh();});
      button('confirm',labels.confirm,()=>{if(!selected?.isConnected){selected=null;refresh();return;}globalThis.__gcdSelectedElement={el:selected,selector:selector(selected)};notify(selected);stop();});
    }
    button('cancel',labels.cancel,cancel);refresh();
    globalThis.__gcdPickerStop=cancel;document.addEventListener('mousemove',move,true);document.addEventListener('click',click,true);document.addEventListener('keydown',key,true);window.addEventListener('scroll',repaint,true);window.addEventListener('resize',repaint);window.addEventListener('pagehide',cancel,{once:true});
  },args:[mode,labels]});
  await chrome.tabs.update(tabId,{active:true});
}
async function undoHidden(tabId,all){await chrome.scripting.executeScript({target:{tabId},func:(all)=>{globalThis.__gcdPickerStop?.();const items=globalThis.__gcdHiddenElements||[];let item;do{item=items.pop();if(item){if(item.style===null)item.el.removeAttribute('style');else item.el.setAttribute('style',item.style);}}while(all&&items.length);},args:[all]});}
