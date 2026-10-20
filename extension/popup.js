// Local popup tools. Account and subscription actions are handled on the official website.
const $ = (id) => document.getElementById(id);
const TABS = ['web', 'markdown', 'file', 'image', 'data', 'thread', 'chat'];
// The extension works locally; account and plan management live on the website.
(function bindWebLink() {
  GCDSite.refresh();
  const domain=$('web-link-domain');if(domain)domain.textContent=new URL(GCDSite.url()).hostname;
})();


function hint(msg) {
  const h = $('hint');
  if (!h) return;
  if(window.GCD_I18N)window.GCD_I18N.write(h,msg||'');else h.textContent = msg || '';
  h.style.display = msg ? 'block' : 'none';
}

function printHtml(html) {
  const w = window.open('', '_blank');
  if (!w) { hint('Popup blocked — allow popups to print.'); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}

// Tab switching
const sourceTabs = [...document.querySelectorAll('.tab')];
function selectSource(tab) {
  document.body.dataset.source=tab.dataset.tab;
  document.body.dataset.view='formats';$('show-tasks').classList.remove('hidden');
  sourceTabs.forEach(t => {
    const active = t === tab;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', String(active));
    t.tabIndex = active ? 0 : -1;
    $(`panel-${t.dataset.tab}`).classList.toggle('hidden', !active);
  });
}
$('show-tasks').onclick=()=>{document.body.dataset.view='tasks';$('show-tasks').classList.add('hidden');($('task-web').disabled?$('task-local'):$('task-web')).focus();};
sourceTabs.forEach(tab => {
  const panel = $(`panel-${tab.dataset.tab}`);
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-label', (window.GCD_I18N ? window.GCD_I18N.text(tab.getAttribute('aria-label') || tab.dataset.tab) : tab.getAttribute('aria-label') || tab.dataset.tab));
  tab.addEventListener('click', () => selectSource(tab));
  tab.addEventListener('keydown', event => {
    const available = sourceTabs.filter(t => !t.hidden && getComputedStyle(t).display !== 'none');
    const position = available.indexOf(tab);
    const keys = { ArrowRight: 1, ArrowLeft: -1, Home: -position, End: available.length - 1 - position };
    if (!(event.key in keys)) return;
    event.preventDefault();
    const next = available[(position + keys[event.key] + available.length) % available.length];
    selectSource(next);
    next.focus();
  });
});

function sanitizeFilename(name) {
  return (name || 'GoodConvertPDF').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80);
}

// 把生成的 HTML 文档真正转成 PDF 下载（debugger 渲染临时标签，失败提示手动打印）
async function openStudio(source='web') {
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(['data','thread','chat'].includes(source)){await chrome.tabs.create({url:chrome.runtime.getURL('documents.html')+'?mode='+(source==='data'?'data':'conversation')});return;}
  await chrome.tabs.create({url:chrome.runtime.getURL('workspace.html')+'?tabId='+(ExtensionSource.supported(tab)?tab.id:'')+'&tab='+source});
}
async function convertGenerated(html,title) {
  const id='draft:'+crypto.randomUUID();
  try { await SessionStore.set({[id]:{html,title}}); await chrome.tabs.create({url:chrome.runtime.getURL('workspace.html')+'?draft='+encodeURIComponent(id)}); }
  catch(error){hint('Could not open the conversion workspace: '+error.message);}
}
async function openDocument(draft){const key='document:'+crypto.randomUUID();await SessionStore.set({[key]:draft});await chrome.tabs.create({url:chrome.runtime.getURL('documents.html')+'?draft='+encodeURIComponent(key)});}
$('convert-page').addEventListener('click',()=>openStudio().catch(e=>hint(e.message)));
$('open-studio').addEventListener('click',()=>{const selected=document.querySelector('.tab.active')?.dataset.tab||'web';openStudio(({file:'html',image:'images'})[selected]||selected).catch(e=>hint(e.message));});
function updateChatTitles(){
  const t=m=>window.GCD_I18N?GCD_I18N.text(m):m;
  // 保存网页等按钮置灰时，悬浮说明原因（文案随语言切换、随 disabled 状态更新）
  const webMsg=$('task-web').disabled?ExtensionSource.reason:'Convert the current page to a clean PDF — locally, no upload.';
  for(const id of ['task-web','convert-page','md-extract'])$(id).title=(window.GCD_I18N ? window.GCD_I18N.text(t(webMsg)) : t(webMsg));
  const chatMsg=$('task-chat').disabled?'Open a ChatGPT, Claude or Gemini conversation to import.':'Import this AI conversation for free.';
  for(const id of ['task-chat','import-chat'])$(id).title=(window.GCD_I18N ? window.GCD_I18N.text(t(chatMsg)) : t(chatMsg));
}
new MutationObserver(updateChatTitles).observe($('task-web'),{attributes:true,attributeFilter:['disabled']});
new MutationObserver(updateChatTitles).observe($('task-chat'),{attributes:true,attributeFilter:['disabled']});
window.addEventListener('languagechange',updateChatTitles);
updateChatTitles();
const chatHosts=new Set(['chatgpt.com','chat.openai.com','claude.ai','gemini.google.com','bard.google.com']);
$('task-web').onclick=()=>openStudio('web').catch(e=>hint(e.message));
$('task-chat').onclick=()=>{selectSource(document.querySelector('[data-tab="chat"]'));$('import-chat').click();};
$('task-local').onclick=()=>{$('local-choices').classList.toggle('hidden');$('task-local').setAttribute('aria-expanded',String(!$('local-choices').classList.contains('hidden')));$('task-note').hidden=!$('local-choices').classList.contains('hidden');if(!$('local-choices').classList.contains('hidden'))$('task-document').focus();};
$('task-document').onclick=()=>chrome.tabs.create({url:chrome.runtime.getURL('documents.html')+'?mode=text'}).catch(e=>hint(e.message));
$('task-html').onclick=()=>openStudio('html').catch(e=>hint(e.message));
$('task-images').onclick=()=>openStudio('images').catch(e=>hint(e.message));
$('task-pdf').onclick=()=>chrome.tabs.create({url:chrome.runtime.getURL('pdf-tools.html')}).catch(e=>hint(e.message));
chrome.tabs.query({active:true,currentWindow:true}).then(([tab])=>{const valid=ExtensionSource.supported(tab);const host=valid?new URL(tab.url).hostname:'';const chat=chatHosts.has(host);(window.GCD_I18N ? window.GCD_I18N.write($('popup-source-title'), valid?tab.title||'Current webpage':'Open a webpage to begin') : ($('popup-source-title').textContent=valid?tab.title||'Current webpage':'Open a webpage to begin'));(window.GCD_I18N ? window.GCD_I18N.write($('popup-source-note'), valid?host+' · Local processing':ExtensionSource.reason) : ($('popup-source-note').textContent=valid?host+' · Local processing':ExtensionSource.reason));$('convert-page').disabled=!valid;$('md-extract').disabled=!valid;$('task-web').disabled=!valid;$('task-chat').disabled=!chat;(window.GCD_I18N ? window.GCD_I18N.write($('task-note'), chat?'Import this AI conversation for free.':'Open a ChatGPT, Claude or Gemini conversation to import.') : ($('task-note').textContent=chat?'Import this AI conversation for free.':'Open a ChatGPT, Claude or Gemini conversation to import.'));}).catch(()=>{(window.GCD_I18N ? window.GCD_I18N.write($('popup-source-note'), 'Could not identify the current tab. Open the full workspace to choose a webpage.') : ($('popup-source-note').textContent='Could not identify the current tab. Open the full workspace to choose a webpage.'));$('task-chat').disabled=true;$('task-web').disabled=true;});

// ---------- 网页 -> Markdown（全本地）----------
// 依赖库按需注入，避免把 Readability / Turndown 打进每个页面的 content script。
const MD_LIBS = ['vendor/readability.js', 'vendor/turndown.js', 'vendor/turndown-plugin-gfm.js', 'shared/markdown-extract.js'];
let mdResult = null;

async function extractMarkdown(tabId, options) {
  await chrome.scripting.executeScript({ target: { tabId }, files: MD_LIBS });
  const runs = await chrome.scripting.executeScript({
    target: { tabId },
    func: (opts) => {
      try {
        let element = null;
        if (opts.mode === 'selection') {
          // A DOM node cannot travel through executeScript, so read the selection here.
          // Export exactly what is selected: clone each range's contents into a wrapper
          // instead of the common ancestor element (that pulled in whole containers).
          const selection = window.getSelection && window.getSelection();
          const text = String(selection || '').trim();
          if (!selection || !selection.rangeCount || !text) return { ok: false, error: 'NO_SELECTION' };
          const wrap = document.createElement('div');
          for (let i = 0; i < selection.rangeCount; i++) wrap.append(selection.getRangeAt(i).cloneContents());
          element = wrap;
        }
        const result = globalThis.MarkdownExtract.extractMarkdown({
          mode: opts.mode, frontMatter: opts.frontMatter, element: element || undefined
        });
        return { ok: true, markdown: result.markdown, title: result.title, warnings: result.warnings || [] };
      } catch (e) {
        return { ok: false, error: (e && e.message) || String(e) };
      }
    },
    args: [options]
  });
  const value = runs && runs[0] && runs[0].result;
  if (!value || !value.ok) throw new Error((value && value.error) || 'Could not read the page.');
  return value;
}

function showMarkdown(value) {
  mdResult = value;
  $('panel-markdown').classList.add('has-result');
  $('md-preview').value = value.markdown;
  $('md-preview').classList.remove('hidden');
  $('md-actions').classList.remove('hidden');
  const list = $('md-warnings');
  list.innerHTML = '';
  list.classList.toggle('hidden', !value.warnings.length);
  value.warnings.forEach((text) => {
    const li = document.createElement('li');
    (window.GCD_I18N ? window.GCD_I18N.write(li, text) : (li.textContent = text));
    list.appendChild(li);
  });
}

chrome.storage.local.get(['mdFrontMatter']).then((saved) => {
  $('md-front-matter').checked = saved.mdFrontMatter !== false;
}).catch(() => {});
$('md-front-matter').addEventListener('change', () => {
  chrome.storage.local.set({ mdFrontMatter: $('md-front-matter').checked }).catch(() => {});
});

$('md-extract').addEventListener('click', async () => {
  hint('');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !ExtensionSource.supported(tab)) { hint('Open a webpage to begin'); return; }
  $('md-extract').disabled = true;
  try {
    hint('Reading page…');
    showMarkdown(await extractMarkdown(tab.id, {
      mode: $('md-selection').checked ? 'selection' : 'auto',
      frontMatter: $('md-front-matter').checked
    }));
    hint('Markdown ready — copy it or download the .md file.');
  } catch (e) {
    if (e.message === 'NO_SELECTION') hint('Select the text you want on the page first.');
    else hint('Could not extract this page: ' + e.message);
  } finally {
    $('md-extract').disabled = false;
  }
});

$('md-copy').addEventListener('click', async () => {
  if (!mdResult) return;
  try {
    await navigator.clipboard.writeText(mdResult.markdown);
    hint('Copied to clipboard.');
  } catch (e) {
    $('md-preview').select();
    hint('Clipboard blocked — the text is selected, press Ctrl+C.');
  }
});

$('md-download').addEventListener('click', () => {
  if (!mdResult) return;
  const url = URL.createObjectURL(new Blob([mdResult.markdown], { type: 'text/markdown;charset=utf-8' }));
  chrome.downloads.download(
    { url, filename: sanitizeFilename(mdResult.title || 'webpage') + '.md', saveAs: true },
    () => setTimeout(() => URL.revokeObjectURL(url), 30000)
  );
});

$('md-to-pdf').addEventListener('click', () => {
  if (!mdResult) return;
  let rendered;
  try { rendered = window.Markdown.toHtml(mdResult.markdown); }
  catch (e) { hint(e.message); return; }
  const title = mdResult.title || 'Markdown export';
  convertGenerated(Converters.buildPrintDocument({ title, bodyHtml: rendered.html }), title);
});

// Convert pasted text/file -> open a print view
$('convert-file').addEventListener('click', () => {
  const text = $('file-text').value || '';
  if (!text.trim()) { hint('Paste some text first. For HTML rendering, use the conversion workspace.'); return; }
  hint('');
  convertGenerated(Converters.buildPrintDocument({
    title: 'Text export',
    bodyHtml: '<div class="msg"><div class="body">' + Converters.escapeHtml(text).replace(/\n/g, '<br/>') + '</div></div>'
  }), 'Text export');
});

// ---------- v2：图片 -> PDF（全本地）----------
function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

$('convert-images').addEventListener('click',()=>openStudio('images'));

// ---------- v2：CSV / JSON -> PDF ----------
$('convert-data').addEventListener('click', () => {
  const text = $('data-text').value || '';
  if (!text.trim()) { hint('Paste CSV or JSON first.'); return; }
  openDocument({mode:'data',text,title:'Data export'}).catch(e=>hint(e.message));
});

// ---------- v2：邮件 thread / IM 存档 -> PDF ----------
$('convert-thread').addEventListener('click', () => {
  const text = $('thread-text').value || '';
  if (!text.trim()) { hint('Paste a conversation first.'); return; }
  openDocument({mode:'conversation',text,title:'Conversation'}).catch(e=>hint(e.message));
});

// AI conversation import is local and free.
let chatImportTabId=null;
$('import-chat').addEventListener('click', async () => {
  if(chatImportTabId!==null)return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !ExtensionSource.supported(tab) || !chatHosts.has(new URL(tab.url).hostname)) { hint('Open a ChatGPT, Claude or Gemini conversation to import.'); return; }
  chatImportTabId=tab.id;
  hint('Reading conversation…');
  const assisted=$('chat-load-history').checked;
  $('stop-chat-load').classList.toggle('hidden',!assisted);
  $('import-chat').disabled=true;
  let conv = null;
  try {
    conv = await chrome.tabs.sendMessage(tab.id, { type: assisted?'LOAD_AND_EXTRACT_AI_CHAT':'EXTRACT_AI_CHAT' });
  } catch (e) {
    conv = null;
  } finally {
    chatImportTabId=null;
    $('stop-chat-load').classList.add('hidden');
    $('import-chat').disabled=false;
  }
  if (!conv || !conv.messages || !conv.messages.length) {
    hint(conv?.warnings?.at(-1)||'No conversation detected. Open a ChatGPT / Claude / Gemini chat on this tab and try again.');
    return;
  }
  hint('');
  (window.GCD_I18N ? window.GCD_I18N.write($('chat-progress'), `Read ${conv.messages.length} loaded messages. Review the first and last messages against the original; unloaded history may still be missing.`) : ($('chat-progress').textContent=`Read ${conv.messages.length} loaded messages. Review the first and last messages against the original; unloaded history may still be missing.`));
  chatLog.innerHTML = '';
  conv.messages.forEach((m) => {
    chatLog.insertAdjacentHTML('beforeend',
      '<div class="u">' + (m.role === 'assistant' ? 'Assistant' : 'You') + ':</div>' +
      '<div>' + escapeHtml(m.text) + '</div>');
  });
  const aiTitle = (conv.title || 'AI chat') + ' · ' + (conv.platform || 'chat');
  await openDocument({mode:'ai',conversation:conv,title:aiTitle});
});
$('stop-chat-load').onclick=async()=>{if(chatImportTabId!==null)await chrome.tabs.sendMessage(chatImportTabId,{type:'STOP_AI_CHAT_LOAD'}).catch(()=>{});};
chrome.runtime.onMessage.addListener((message,sender)=>{if(message?.type==='AI_CHAT_LOAD_PROGRESS'&&sender.tab?.id===chatImportTabId)(window.GCD_I18N ? window.GCD_I18N.write($('chat-progress'), `Reading conversation: ${message.count} messages found…`) : ($('chat-progress').textContent=`Reading conversation: ${message.count} messages found…`));});

// Manual local conversation export (free).
const chatLog = $('chat-log');
$('chat-send').addEventListener('click', () => {
  const v = $('chat-msg').value.trim();
  if (!v) return;
  chatLog.insertAdjacentHTML('beforeend', `<div class="u">You:</div><div>${escapeHtml(v)}</div>`);
  $('chat-msg').value = '';
});
$('export-chat').addEventListener('click', async () => {
  const pendingText = $('chat-msg').value.trim();
  if (pendingText) $('chat-send').click();
  const content = chatLog.innerText || '';
  if (!content.trim()) { hint('Add content or import a conversation first.'); return; }
  hint('');
  convertGenerated(Converters.buildPrintDocument({
    title: 'Chat export',
    bodyHtml: '<div class="msg"><div class="body">' + escapeHtml(content).replace(/\n/g, '<br/>') + '</div></div>'
  }), 'Chat export');
});

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

