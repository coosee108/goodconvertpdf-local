// Background service worker: holds auth token + license status, handles messaging.
importScripts('config.js');
importScripts('shared/conversion-options.js', 'shared/page-preparation.js', 'printing.js');
importScripts('shared/extension-source.js', 'shared/session-store.js');
importScripts('shared/quick-preferences.js','shared/pdf-history.js','quick-jobs.js');
if(!chrome.extension?.inIncognitoContext)GCDHistory.list().catch(()=>{});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if(!msg || sender.id!==chrome.runtime.id)return;
  const page=sender.url?.split('?')[0].split('#')[0];
  const extensionPage=['popup.html','workspace.html','recent.html'].some(name=>page===chrome.runtime.getURL(name));
  if(['OPEN_QUICK_PDF','PDF_JOB_STATUS','CLAIM_QUICK_PDF','CREATE_PDF_JOB','RUN_PDF_JOB','PREFERENCES_UPDATE','SKIP_PDF_WAIT','QUICK_JOB_LOOKUP','QUICK_JOB_RESULT'].includes(msg.type)){
    if(!extensionPage){sendResponse({ok:false,code:'UNTRUSTED_SENDER'});return;}
    const workspaceOnly=['PDF_JOB_STATUS','CLAIM_QUICK_PDF','CREATE_PDF_JOB','RUN_PDF_JOB','SKIP_PDF_WAIT','QUICK_JOB_RESULT'];
    if(workspaceOnly.includes(msg.type)&&page!==chrome.runtime.getURL('workspace.html')){sendResponse({ok:false,code:'UNTRUSTED_SENDER'});return;}
    // 状态镜像只允许弹窗读取，且只返回元数据，不含 PDF 内容
    if(msg.type==='QUICK_JOB_LOOKUP'&&page!==chrome.runtime.getURL('popup.html')){sendResponse({ok:false,code:'UNTRUSTED_SENDER'});return;}
    (async()=>{
      if(msg.type==='OPEN_QUICK_PDF')return QuickJobs.open(msg);
      if(msg.type==='QUICK_JOB_LOOKUP')return {job:await QuickJobs.lookup(msg.tabId)};
      if(msg.type==='QUICK_JOB_RESULT')return {job:await QuickJobs.publish(msg,sender)};
      if(msg.type==='PREFERENCES_UPDATE')return {prefs:await GCDPrefs.mutate(msg.action,msg.payload)};
      if(msg.type==='PDF_JOB_STATUS')return QuickJobs.status(msg,sender);
      if(msg.type==='CLAIM_QUICK_PDF')return QuickJobs.claim(msg,sender);
      if(msg.type==='CREATE_PDF_JOB')return QuickJobs.create(msg,sender);
      if(msg.type==='RUN_PDF_JOB')return QuickJobs.run(msg,sender);
      if(msg.type==='SKIP_PDF_WAIT'){
        const ownership=(await SessionStore.get('cleanup-owner:'+sender.tab?.id+':'+msg.tabId))['cleanup-owner:'+sender.tab?.id+':'+msg.tabId];
        if(!ownership)throw Error('Task unavailable');
        await chrome.scripting.executeScript({target:{tabId:msg.tabId},func:()=>{globalThis.__gcdSkipWait=true;}});return {};
      }
    })().then(result=>sendResponse({ok:true,...result}),error=>sendResponse({ok:false,error:error.message,code:QuickJobs.errorCode(error),jobId:error.jobId}));return true;
  }
  const printActions=['GET_CONTENT_STATE','PRINT_TO_PDF','CANCEL_PRINT','PAGE_PREPARE','PAGE_RESTORE','PICK_ELEMENT','UNDO_HIDDEN'];
  if(printActions.includes(msg.type)){
    if(page!==chrome.runtime.getURL('workspace.html')) {sendResponse({ok:false,error:'Open the conversion workspace first.'});return;}
    (async()=>{
        try{
          const source=await chrome.tabs.get(msg.tabId);if(!ExtensionSource.supported(source))throw Error(ExtensionSource.reason);
          if(msg.type==='GET_CONTENT_STATE')return sendResponse({ok:true,...await getContentState(msg.tabId)});
          await QuickJobs.authorize(msg.tabId,sender.tab?.id);
          if(sender.tab?.id)await SessionStore.set({['cleanup-owner:'+sender.tab.id+':'+msg.tabId]:true});
        if(msg.type==='PRINT_TO_PDF')return sendResponse(await printTab(msg.tabId,msg.options));
        if(msg.type==='CANCEL_PRINT'){await QuickJobs.stop(msg.tabId);return sendResponse({ok:true});}
        if(msg.type==='PICK_ELEMENT'){await pickElement(msg.tabId,msg.mode,msg.labels);return sendResponse({ok:true});}
        if(msg.type==='UNDO_HIDDEN'){await undoHidden(msg.tabId,msg.all);return sendResponse({ok:true});}
        const options=ConversionOptions.normalize(msg.options||{});
        const result=await prepareTab(msg.tabId,options,msg.type==='PAGE_RESTORE'?'restore':'prepare');sendResponse({ok:true,...result});
      }catch(error){sendResponse({ok:false,error:error.message,code:QuickJobs.errorCode(error)});}
    })();return true;
  }
  if(msg.type==='PAGE_PROGRESS'&&sender.tab&&['scrolling','article','organizing','resources','printing'].includes(msg.stage)){Promise.all([QuickJobs.progress(sender.tab.id,msg.stage),SessionStore.set({['progress:'+sender.tab.id]:{stage:msg.stage,time:Date.now()}})]).then(()=>sendResponse({ok:true}));return true;}
  if(msg.type==='PAGE_CONTENT_CHANGED'&&sender.tab){SessionStore.set({['content-change:'+sender.tab.id]:Date.now()}).then(()=>sendResponse({ok:true}));return true;}
  if(msg.type==='PAGE_PICKED'&&sender.tab){SessionStore.set({['selection:'+sender.tab.id]:{selector:String(msg.selector).slice(0,300),mode:msg.mode,time:Date.now()}}).then(()=>sendResponse({ok:true}));return true;}
  sendResponse({ ok: false, error: 'Unsupported community-edition action.' });
});
