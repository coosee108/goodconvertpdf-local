// Content script: local print of the current page + AI chat extraction (v3).
// 注：右下角悬浮工具栏已移除，避免干扰页面；转换入口统一走扩展 popup。
(function () {
  // PRINT_PAGE 消息回退：加载打印样式并唤起浏览器打印对话框
  function convertPage() {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('print.css');
    document.head.appendChild(link);
    setTimeout(() => window.print(), 60);
  }

  function extractAiChat(){return ChatAdapters.extract(document,location.hostname);}
  let stopChatLoad=false;
  async function loadAndExtractAiChat(){
    stopChatLoad=false;
    const start=Date.now(),pause=()=>new Promise(resolve=>setTimeout(resolve,350));
    const signature=message=>message.sourceId||message.role+'\u0000'+message.text+'\u0000'+message.html;
    let collected=[],first=extractAiChat();
    function capture(){
      const batch=extractAiChat().messages;
      if(!batch.length)return 0;
      if(!collected.length){collected=batch;chrome.runtime.sendMessage({type:'AI_CHAT_LOAD_PROGRESS',count:collected.length}).catch(()=>{});return batch.length;}
      const same=(a,b)=>signature(a)===signature(b);
      if(batch.length<=collected.length&&collected.some((_,index)=>index+batch.length<=collected.length&&batch.every((m,i)=>same(m,collected[index+i]))))return 0;
      let overlap=0;
      for(let size=Math.min(batch.length,collected.length);size>0;size--){
        if(batch.slice(-size).every((m,i)=>same(m,collected[i]))){overlap=size;break;}
      }
      const added=batch.slice(0,batch.length-overlap);
      if(added.length)collected=[...added,...collected];
      chrome.runtime.sendMessage({type:'AI_CHAT_LOAD_PROGRESS',count:collected.length}).catch(()=>{});
      return added.length;
    }
    capture();
    // The page may still be rendering when the user starts the assisted import.
    while(!collected.length&&!stopChatLoad&&Date.now()-start<5000){await pause();capture();}
    if(collected.length)first=extractAiChat();
    const sample=document.querySelector('[data-message-author-role],[data-testid^="conversation-turn-"],[data-turn="user"],[data-turn="assistant"],[data-turn-key],[data-chatgpt-search-unit-key],[data-testid="user-message"],[data-testid="assistant-message"],user-query,model-response');
    let scroller=sample;
    while(scroller&&scroller!==document.body){
      if(scroller.scrollHeight>scroller.clientHeight+80&&getComputedStyle(scroller).overflowY!=='visible')break;
      scroller=scroller.parentElement;
    }
    if(!scroller||scroller===document.body){
      scroller=[...document.querySelectorAll('main [class],main [data-testid]')].find(n=>n.scrollHeight>n.clientHeight+80&&getComputedStyle(n).overflowY!=='visible')||document.scrollingElement||document.documentElement;
    }
    const original=scroller.scrollTop;let idle=0;
    try{
      for(let step=0;step<40&&!stopChatLoad&&Date.now()-start<20000&&collected.length<2000;step++){
        const before=scroller.scrollTop;
        scroller.scrollTop=Math.max(0,before-Math.max(500,scroller.clientHeight*.8));
        await pause();
        idle=capture()?0:idle+1;
        if((scroller.scrollTop===0||before===scroller.scrollTop)&&idle>=3)break;
      }
    }finally{scroller.scrollTop=original;}
    if(!collected.length)return {...first,warnings:[...first.warnings,stopChatLoad?'History loading was stopped.':'No loaded messages were found. Wait for the conversation to finish loading or paste text instead.']};
    const countLimit=collected.length>=2000;collected=collected.slice(-2000);
    const encoder=new TextEncoder();let bytes=0,kept=[];for(let index=collected.length-1;index>=0;index--){const size=encoder.encode(JSON.stringify(collected[index])).length;if(bytes+size>1700000)break;bytes+=size;kept.unshift(collected[index]);}
    const sizeLimit=kept.length<collected.length;
    return {...first,messages:kept.map((message,index)=>({...message,id:index+1})),warnings:[...(first.warnings||[]),stopChatLoad?'History loading was stopped.':'Assisted loading finished. Compare the first and last messages with the original; completeness cannot be guaranteed.',...(countLimit?['The 2,000-message limit was reached.']:[]),...(sizeLimit?['The document size limit was reached. Older messages were omitted; review the first retained message.']:[])]};
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'PRINT_PAGE') {
      convertPage();
      if (sendResponse) sendResponse({ ok: true });
    }
    if (msg && msg.type === 'EXTRACT_AI_CHAT') {
      let conv;
      try {
        conv = extractAiChat();
      } catch (e) {
        conv = { platform: 'AI chat', title: '', messages: [] };
      }
      if (sendResponse) sendResponse(conv);
    }
    if(msg&&msg.type==='STOP_AI_CHAT_LOAD'){stopChatLoad=true;sendResponse?.({ok:true});}
    if(msg&&msg.type==='LOAD_AND_EXTRACT_AI_CHAT'){
      loadAndExtractAiChat().then(sendResponse).catch(()=>sendResponse({platform:'AI chat',title:'',messages:[],warnings:['Could not load conversation history.']}));
      return true;
    }
  });
})();
