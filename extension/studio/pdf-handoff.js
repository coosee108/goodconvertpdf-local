// Transfer result blobs in memory; no document content is written to storage.
import {installPdfOutput} from './pdf-output.js';
const T=value=>window.GCD_I18N?.text(value)||value;
const put=(el,v)=>{if(!el)return;if(window.GCD_I18N)window.GCD_I18N.write(el,v);else el.textContent=v;};
export function installEnhance(downloadId, openId = downloadId + '-open') {
  const link = document.getElementById(downloadId);
  if (!link || document.getElementById(downloadId + '-enhance')) return;
  let open = document.getElementById(openId);
  if (!open) {
    open = document.createElement('a');
    open.id = openId;
    put(open, 'Open PDF');
    open.target = '_blank';
    open.rel = 'noopener';
    link.after(open);
  }
  if (!link.parentElement.classList.contains('result-actions')) {
    const group = document.createElement('div');
    group.className = 'result-actions';
    link.before(group);
    group.append(link, open);
  }
  const button = document.createElement('button');
  button.id = downloadId + '-enhance';
  button.type = 'button';
  put(button, 'Enhance PDF');
  open.after(button);
  const pngButton = document.createElement('button');
  pngButton.id = downloadId + '-png';
  pngButton.type = 'button';
  put(pngButton, 'Download PNG');
  button.after(pngButton);
  const printButton = document.createElement('button');
  printButton.id = downloadId + '-print';
  printButton.type = 'button';
  put(printButton, 'Print');
  pngButton.after(printButton);
  // Open the finished PDF first, then keep download and print together.
  link.after(pngButton, printButton);
  link.before(open);
  const note = document.createElement('span');
  note.className = 'help';
  note.setAttribute('role', 'status');
  button.after(note);
  const output = installPdfOutput(downloadId, note);
  let pending;
  const update = () => {
    const visible = !link.hidden && link.href.startsWith('blob:');
    open.hidden = button.hidden = pngButton.hidden = printButton.hidden = !visible;
    if (visible) open.href = link.href;
    else {
      open.removeAttribute('href');
      note.textContent = '';
      pending?.();
      output?.cancel();
    }
  };
  new MutationObserver(update).observe(link, {attributes:true, attributeFilter:['href','hidden']});
  update();
  button.onclick = () => {
    pending?.();
    note.textContent = '';
    const nonce = crypto.randomUUID();
    const path = window.GCD_I18N?.url('pdf-tools.html') || 'pdf-tools.html';
    const child = window.open(path + '#handoff=' + nonce, '_blank');
    if (!child) {
      put(note, 'Allow this new tab, or download the PDF and open PDF tools.');
      return;
    }
    const href = link.href, name = link.download;
    const cleanup = () => {window.removeEventListener('message', receive); clearTimeout(timer); pending = null;};
    const receive = async e => {
      if (e.source !== child || e.origin !== location.origin || e.data?.type !== 'gcd-pdf-ready' || e.data.nonce !== nonce) return;
      cleanup();
      try {
        const response = await fetch(href);
        if (!response.ok) throw Error('PDF unavailable');
        const blob = await response.blob();
        child.postMessage({type:'gcd-pdf-transfer',nonce,blob,name}, location.origin);
      } catch {
        put(note, 'Could not transfer the result. Download it and add it in PDF tools.');
      }
    };
    window.addEventListener('message', receive);
    const timer = setTimeout(() => {
      cleanup();
      put(note, 'If the PDF was not transferred, download it and add it in PDF tools.');
    }, 30000);
    pending = cleanup;
  };
}
