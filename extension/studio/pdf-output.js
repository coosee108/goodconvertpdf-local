// Raster output for a finished PDF: PNG (or a ZIP of PNGs) download and rasterized printing.
// The bytes are read from the result blob URL and rendered on the device; nothing is uploaded.
// pdf.js is imported lazily inside the click handlers, so pages that only show a result never pay for it.
import {download} from './jobs-client.js';

/** Largest canvas edge browsers reliably accept. */
const MAX_DIM = 8192;
/** Largest canvas area (pixels) allocated for a single page. */
const MAX_AREA = 16000000;
/** Hard page cap: beyond this the export is refused instead of exhausting memory. */
const MAX_PAGES = 100;
/** Above this page count the DPI drops so long documents stay within memory limits. */
const MANY_PAGES = 60;
const PNG_DPI = 150;
const PRINT_DPI = 200;
const LOW_DPI = 96;
// Bound document opening so a hung worker rejects instead of settling-never; an unbounded
// getDocument() would leave the calling action's button disabled forever.
const OPEN_TIMEOUT = 30000;
// Test seam: lets the suite shrink the guard so a hung-worker timeout is exercised quickly.
const openTimeout = () => {
  const override = globalThis.__GCD_PDF_OPEN_TIMEOUT__;
  return Number.isFinite(override) && override > 0 ? override : OPEN_TIMEOUT;
};
const PROGRESS = 'Rendering page {p0} of {p1}…';
const ENGINE_ERROR = Symbol('pdf-engine-unavailable');
const CANVAS_ERROR = Symbol('pdf-canvas-unavailable');
// User-facing hints, shared by both the result-page wiring (installPdfOutput) and the
// history-page Blob wrappers (exportPngBlob / printPdfBlob) so the wording never drifts.
const ENGINE_HINT = 'The PDF engine could not load. Reload the page and try again.';
const CANVAS_HINT = 'This PDF is too large to export as images. Download it or print it from the PDF viewer.';
const PNG_FAIL_HINT = 'Could not create the PNG. Download the PDF and use PDF tools.';
const PRINT_TAB_HINT = 'Allow the new tab, then print from the PDF viewer.';
const PRINT_FAIL_HINT = 'Printing could not start. Open the PDF, then print it from your browser.';
const PREPARE_PRINT = 'Preparing print preview…';
const PNG_PAGE_LIMIT = 'At most 100 pages can be exported as images.';
const PRINT_PAGE_LIMIT = 'At most 100 pages can be printed.';
// Kept in one constant (and never a template literal) so the UI localizer leaves it alone.
const PRINT_CSS = '@media screen{.gcd-print-output{display:none}}@media print{.gcd-print-output{display:block}.gcd-print-output .gcd-print-page{break-after:page}.gcd-print-output img{width:100%;height:auto;display:block}}@page{size:auto;margin:0}';

const put = (el, value) => { if (!el) return; if (window.GCD_I18N) window.GCD_I18N.write(el, value); else el.textContent = value; };
const putProgress = (el, page, total) => {
  if (!el) return;
  const params = {p0: page, p1: total};
  el.textContent = window.GCD_I18N?.t('ui.67e08d5dd409', params)
    || PROGRESS.replace('{p0}', String(page)).replace('{p1}', String(total));
};

// Firefox 115–120 lacks Promise.withResolvers, which pdf.js calls unconditionally.
function polyfill() {
  if (typeof Promise.withResolvers === 'function') return;
  Promise.withResolvers = function () {
    let resolve, reject;
    const promise = new Promise((accept, refuse) => { resolve = accept; reject = refuse; });
    return {promise, resolve, reject};
  };
}

let engine;
async function loadPdfjs() {
  polyfill();
  if (engine) return engine;
  try {
    const library = await import('../vendor/pdf.min.mjs');
    library.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;
    engine = library;
    return library;
  } catch (exception) {
    throw ENGINE_ERROR;
  }
}

async function loadFflate() {
  if (window.fflate) return window.fflate;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('../vendor/fflate.js', import.meta.url).href;
    script.onload = () => resolve();
    script.onerror = () => reject(ENGINE_ERROR);
    document.head.append(script);
  });
  if (!window.fflate) throw ENGINE_ERROR;
  return window.fflate;
}

// ConversionOptions is only loaded on pages that convert; keep an equivalent fallback so the
// PDF tools page (which also hosts a result card) still produces clean file names.
function outputName(value, ext) {
  const options = globalThis.ConversionOptions;
  if (options && typeof options.filename === 'function') return options.filename(value, ext);
  return (String(value || 'document').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/\.\w+$/i, '').trim().slice(0, 100) || 'document') + '.' + ext;
}

async function readBytes(link) {
  const response = await fetch(link.href);
  if (!response.ok) throw new Error();
  const blob = await response.blob();
  return new Uint8Array(await blob.arrayBuffer());
}

// pdf.js 6 removed PDFDocumentProxy#destroy; the loading task owns teardown, and the document
// only exposes cleanup(). Feature-detect so a future pdf.js upgrade cannot turn a successful
// export into a reported failure.
async function openDocument(bytes) {
  const library = await loadPdfjs();
  const task = library.getDocument({data: bytes, canvasMaxAreaInBytes: MAX_AREA * 4});
  let timer = null;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      try { if (task && typeof task.destroy === 'function') task.destroy(); } catch (exception) { /* teardown is best effort */ }
      reject(Error('The PDF engine did not respond in time. Please try again.'));
    }, openTimeout());
  });
  try {
    const doc = await Promise.race([task.promise, timeout]);
    return {doc, task};
  } finally {
    clearTimeout(timer);
  }
}
async function closeDocument(doc, task) {
  try {
    if (task && typeof task.destroy === 'function') { await task.destroy(); return; }
    if (doc && typeof doc.cleanup === 'function') await doc.cleanup();
  } catch (exception) {
    // Teardown is best effort; a failure here must never mask a completed export.
  }
}

// Renders one page and releases the canvas immediately, so peak memory stays at one page.
async function rasterize(page, dpi, type, quality) {
  const base = page.getViewport({scale: 1});
  const limit = Math.min(MAX_DIM / Math.max(base.width, base.height), Math.sqrt(MAX_AREA / (base.width * base.height)));
  const viewport = page.getViewport({scale: Math.min(dpi / 72, limit)});
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const context = canvas.getContext('2d');
  let blob;
  try {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    try {
      await page.render({canvasContext: context, viewport}).promise;
    } catch (exception) {
      throw CANVAS_ERROR;
    }
    blob = await new Promise((resolve, reject) => {
      canvas.toBlob(value => (value ? resolve(value) : reject(CANVAS_ERROR)), type, quality);
    });
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
  return blob;
}

const dpiFor = (total, dpi) => (total > MANY_PAGES ? LOW_DPI : dpi);

async function exportPng(link, note, alive) {
  const {doc, task} = await openDocument(await readBytes(link));
  try {
    const total = doc.numPages;
    if (total > MAX_PAGES) { put(note, PNG_PAGE_LIMIT); return; }
    const dpi = dpiFor(total, PNG_DPI);
    const blobs = [];
    for (let index = 1; index <= total; index++) {
      if (!alive()) return;
      putProgress(note, index, total);
      const page = await doc.getPage(index);
      try { blobs.push(await rasterize(page, dpi, 'image/png')); } finally { page.cleanup(); }
    }
    if (!alive()) return;
    const stem = outputName(link.download, 'png').replace(/\.png$/, '');
    if (blobs.length === 1) {
      put(note, '');
      download(blobs[0], stem + '.png');
      return;
    }
    const fflate = await loadFflate();
    if (!alive()) return;
    const files = {};
    for (const [index, blob] of blobs.entries()) {
      files[stem + '-' + String(index + 1).padStart(3, '0') + '.png'] = new Uint8Array(await blob.arrayBuffer());
    }
    put(note, '');
    download(new Blob([fflate.zipSync(files, {level: 6})], {type: 'application/zip'}), stem + '.zip');
  } finally {
    await closeDocument(doc, task);
  }
}

async function printPdf(link, note, alive, cleanup) {
  const {doc, task} = await openDocument(await readBytes(link));
  try {
    put(note, PREPARE_PRINT);
    const total = doc.numPages;
    if (total > MAX_PAGES) { put(note, PRINT_PAGE_LIMIT); return; }
    const dpi = dpiFor(total, PRINT_DPI);
    const container = document.createElement('div');
    container.className = 'gcd-print-output';
    const style = document.createElement('style');
    style.textContent = PRINT_CSS;
    const urls = [];
    let printed = false;
    const release = () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.length = 0;
      container.remove();
      style.remove();
    };
    try {
      for (let index = 1; index <= total; index++) {
        if (!alive()) return;
        putProgress(note, index, total);
        const page = await doc.getPage(index);
        let blob;
        try { blob = await rasterize(page, dpi, 'image/jpeg', 0.92); } finally { page.cleanup(); }
        const url = URL.createObjectURL(blob);
        urls.push(url);
        const sheet = document.createElement('div');
        sheet.className = 'gcd-print-page';
        const image = document.createElement('img');
        image.src = url;
        image.setAttribute('aria-hidden', 'true');
        sheet.append(image);
        container.append(sheet);
      }
      if (!alive()) return;
      document.head.append(style);
      document.body.append(container);
      // Wait for the bitmap to decode before the browser snapshots the print layout.
      const images = Array.from(container.querySelectorAll('img'));
      await Promise.all(images.map(image => image.decode()));
      // Chromium can resolve decode() before the last blob image updates naturalWidth.
      for (let attempt = 0; images.some(image => !image.complete || !image.naturalWidth) && attempt < 100; attempt++) {
        if (!alive()) return;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      if (images.some(image => !image.complete || !image.naturalWidth)) throw Error('Print image did not load');
      if (!alive()) return;
      const hidden = [];
      for (const child of Array.from(document.body.children)) {
        if (child === container) continue;
        hidden.push([child, child.style.display]);
        child.style.display = 'none';
      }
      const restore = () => {
        window.removeEventListener('afterprint', restore);
        for (const [child, value] of hidden) child.style.display = value;
        release();
        if (cleanup) cleanup.value = null;
      };
      cleanup.value = restore;
      window.addEventListener('afterprint', restore, {once: true});
      put(note, '');
      window.print();
      printed = true;
    } finally {
      if (!printed) release();
    }
  } finally {
    await closeDocument(doc, task);
  }
}

/**
 * Centralized failure reporting for both the result-page wiring and the history Blob wrappers.
 * ENGINE/CANVAS errors get a specific hint; any other failure falls back to a helpful message
 * (for printing, opening the PDF in a new tab is offered as a last resort).
 * @param {HTMLElement|null} note status element used for progress and fallback hints.
 * @param {*} exception value thrown by the rasterizer/printer.
 * @param {{href?: string}|null} link result download anchor (its href opens in a new tab on print failure).
 * @param {'png'|'print'} kind which action failed, so the fallback wording matches the button.
 */
function reportError(note, exception, link, kind) {
  if (exception === ENGINE_ERROR) { put(note, ENGINE_HINT); return; }
  if (exception === CANVAS_ERROR) { put(note, CANVAS_HINT); return; }
  if (kind === 'print' && link) {
    let child = null;
    try { child = window.open(link.href, '_blank'); } catch (error) { child = null; }
    put(note, child ? PRINT_TAB_HINT : PRINT_FAIL_HINT);
  } else {
    put(note, PNG_FAIL_HINT);
  }
}

/**
 * Wires the "Download PNG" and "Print" buttons that `installEnhance` inserts next to a result link.
 * @param {string} downloadId id of the result download anchor holding the blob URL.
 * @param {HTMLElement|null} note status element used for progress and fallback hints.
 * @returns {{cancel: () => void}|null} cancel aborts in-flight work; null when the buttons are absent.
 */
export function installPdfOutput(downloadId, note) {
  const link = document.getElementById(downloadId);
  const pngButton = document.getElementById(downloadId + '-png');
  const printButton = document.getElementById(downloadId + '-print');
  if (!link || !pngButton || !printButton) return null;
  let run = 0;
  const cleanup = {value: null};
  const alive = token => token === run;
  const stop = () => {
    run++;
    const restore = cleanup.value;
    cleanup.value = null;
    if (restore) restore();
    pngButton.disabled = false;
    printButton.disabled = false;
  };
  const guard = async (action, kind) => {
    const token = ++run;
    const previous = cleanup.value;
    cleanup.value = null;
    if (previous) previous();
    pngButton.disabled = printButton.disabled = true;
    try {
      await action(token);
    } catch (exception) {
      if (!alive(token)) return;
      reportError(note, exception, link, kind);
    } finally {
      if (alive(token)) pngButton.disabled = printButton.disabled = false;
    }
  };
  pngButton.onclick = () => guard(token => exportPng(link, note, () => alive(token)), 'png');
  printButton.onclick = () => guard(token => printPdf(link, note, () => alive(token), cleanup), 'print');
  return {cancel: stop};
}


// History actions reuse the same rasterizer and print cleanup as fresh results.
export async function firstPagePng(blob){
 const {doc,task}=await openDocument(new Uint8Array(await blob.arrayBuffer()));
 try{const page=await doc.getPage(1);try{return await rasterize(page,PNG_DPI,'image/png');}finally{page.cleanup();}}finally{await closeDocument(doc,task);}
}
export async function printStoredPdf(blob,note){
 const url=URL.createObjectURL(blob);
 try{await printPdf({href:url},note,()=>true,{value:null});}finally{URL.revokeObjectURL(url);}
}

// ---- Blob entry points (used by the Recent PDFs page) -----------------------
// The recent page holds the PDF bytes in IndexedDB, not as a result-card anchor, so it
// hands the stored blob straight to the rasterizer. A temporary object URL shims the same
// {href, download} contract the result-card path relies on, and is revoked once finished.

/**
 * Renders a stored PDF blob to a PNG (or a ZIP of PNGs) and downloads it.
 * @param {Blob} blob the PDF bytes.
 * @param {string} name original file name, used to derive the download name.
 * @param {HTMLElement|null} note status element for progress and fallback hints.
 * @param {() => boolean} [alive] returns false to abort; defaults to always running.
 */
export async function exportPngBlob(blob, name, note, alive = () => true) {
  const link = {href: URL.createObjectURL(blob), download: name};
  try {
    await exportPng(link, note, alive);
  } catch (exception) {
    reportError(note, exception, link, 'png');
  } finally {
    URL.revokeObjectURL(link.href);
  }
}

/**
 * Rasterizes a stored PDF blob and opens the browser print dialog.
 * @param {Blob} blob the PDF bytes.
 * @param {string} name original file name, used to derive the download name.
 * @param {HTMLElement|null} note status element for progress and fallback hints.
 * @param {() => boolean} [alive] returns false to abort; defaults to always running.
 * @param {{value: (() => void)|null}} [cleanup] holds the afterprint restore callback.
 */
export async function printPdfBlob(blob, name, note, alive = () => true, cleanup = {value: null}) {
  const link = {href: URL.createObjectURL(blob), download: name};
  try {
    await printPdf(link, note, alive, cleanup);
  } catch (exception) {
    reportError(note, exception, link, 'print');
  } finally {
    URL.revokeObjectURL(link.href);
  }
}

// ---- "Open PDF / Open PNG" viewer (Batch & history, Account recent tasks) ------
// Chrome refuses a top-level navigation to a blob: URL issued from script: the new tab is
// created but stays blank on about:blank (verified against normal URLs, which navigate fine,
// while blob: targets do not). The blob is therefore loaded as a *subresource* inside a window
// that is opened synchronously while the user gesture is still active — an <iframe> for PDFs
// (Chrome's built-in viewer) or an <img> for the first-page PNG.

// Spinner shown while the result is fetched; deliberately text-free so it needs no translation.
const VIEWER_LOADING_HTML = (window.GCD_I18N ? window.GCD_I18N.htmlLiteral('<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%}body{display:grid;place-items:center}i{width:26px;height:26px;border:3px solid #ddd;border-top-color:#888;border-radius:50%;animation:sp 1s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}</style><body><i></i></body>') : '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%}body{display:grid;place-items:center}i{width:26px;height:26px;border:3px solid #ddd;border-top-color:#888;border-radius:50%;animation:sp 1s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}</style><body><i></i></body>');
const viewerHtml = (url, png) => (window.GCD_I18N ? window.GCD_I18N.htmlLiteral('<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%}iframe,img{display:block;width:100%;height:100%;border:0}img{object-fit:contain}</style><body>') : '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%}iframe,img{display:block;width:100%;height:100%;border:0}img{object-fit:contain}</style><body>') + (png ? '<img src="' + url + '" alt="">' : '<iframe src="' + url + '" title="PDF"></iframe>') + '</body>';

/**
 * Opens a stored PDF (or its first page as PNG) in a new tab.
 * MUST be invoked synchronously from the user gesture: the pop-up is opened up front so the
 * gesture is still valid, then filled once the bytes arrive.
 * @param {() => Promise<Blob>} getBlob resolves the stored PDF bytes.
 * @param {{asPng?: boolean, blockedMessage?: string}} [options] asPng rasterizes page 1 to PNG;
 *   blockedMessage is shown when pop-ups are blocked.
 */
export async function openPdfBlob(getBlob, {asPng = false, blockedMessage = ''} = {}) {
  const child = window.open('', '_blank');
  if (!child) throw Object.assign(Error(blockedMessage || 'Pop-ups are blocked for this site.'), {code: 'OPEN_TAB_BLOCKED'});
  let url = null;
  try {
    child.document.open();
    child.document.write(VIEWER_LOADING_HTML);
    child.document.close();
    const status=child.document.createElement('p');
    status.setAttribute('role','status');
    status.style.cssText='font:16px/1.6 system-ui;color:#334155;text-align:center';
    const message=key=>window.GCD_I18N?.t(key)||key;
    status.textContent=message('ui.history.fetchingPdf');
    child.document.body.append(status);
    child.document.title=(window.GCD_I18N ? window.GCD_I18N.text(status.textContent) : status.textContent);
    const blob = await getBlob();
    if(child.closed)return;
    if(asPng){status.textContent=message('ui.history.renderingPng');child.document.title=(window.GCD_I18N ? window.GCD_I18N.text(status.textContent) : status.textContent);}
    const output = asPng ? await firstPagePng(blob) : blob;
    if(child.closed)return;
    url = URL.createObjectURL(output);
    child.document.open();
    child.document.write(viewerHtml(url, asPng));
    child.document.close();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    if (url) URL.revokeObjectURL(url);
    try { child.close(); } catch (exception) { /* the tab may already be gone */ }
    throw error;
  }
}
