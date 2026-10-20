// Webpage -> Markdown: extract the readable article, then convert it to Markdown.
//
// Shared by the browser extension (runs inside the page, sees the rendered DOM)
// and the Node renderer (runs on a detached DOM built by the server). The module
// itself has no dependencies: Turndown and Readability are read from the global
// scope, so it can be injected as a plain script into any world.
//
// Design points:
//  - Never mutates the live document: everything happens on a clone.
//  - Div-based code blocks are rebuilt as <pre><code> *before* Readability runs,
//    because Readability flattens them into <p> + <br> and the language is lost.
//  - Relative URLs are absolutised inside the page (the base URL is lost afterwards).
//  - Tables that Markdown cannot express are kept as HTML instead of being flattened.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MarkdownExtract = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const LAZY_IMAGE_ATTRS = ['data-src', 'data-original', 'data-lazy-src', 'data-echo'];
  const CODE_CLASS = /(^|\s)(hljs|highlight|prism|shiki|code-?block|code-?snippet|syntax|md-code)(\s|$)/i;
  const LANG_CLASS = /(?:^|\s)(?:language|lang|highlight-language)-([a-z0-9+#.-]+)(?:\s|$)/i;
  const GUTTER_CLASS = /(^|\s)(gutter|line-?numbers?|lineno|linenumber|CodeMirror-linenumber)(\s|$)/i;
  const MONO_FONT = /(mono|consolas|menlo|courier|"source code"|inconsolata|fira code)/i;
  const NOISE_SELECTOR = 'script,style,noscript,template,canvas,iframe,object,embed,form,input,select,textarea,' +
    'button,[aria-hidden="true"],[hidden],[data-md-copy]';
  const ELEMENT_BUDGET = 30000;
  const TEXT_NODE = 3, ELEMENT_NODE = 1;
  const LEADING_MARKDOWN = /^(\s*)([#>+=]|\d+[.)])(\s|$)/;
  // Turndown escapes backslashes, so a "\|" written into the DOM would become "\\|"
  // and still break the table. Use a sentinel, then swap it for a real escape.
  const PIPE_MARK = 'PIPE';

  function plain(value) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim(); }

  function absolutizeUrl(value, base) {
    const raw = String(value == null ? '' : value).trim();
    if (!raw || /^(javascript|mailto|tel|sms|data|blob|about):/i.test(raw)) return raw;
    try { return new URL(raw, base).href; } catch (e) { return raw; }
  }

  function isPlaceholder(src) {
    const value = String(src || '').trim();
    return !value || /^data:image\/(gif|png);base64,R0lGOD/i.test(value) || /\/(blank|placeholder|loading|spinner)\./i.test(value);
  }

  function bestSrcset(value) {
    const candidates = String(value || '').split(',').map((part) => {
      const match = part.trim().match(/^(\S+)(?:\s+(\d+(?:\.\d+)?)(w|x))?$/);
      return match && !/^data:/i.test(match[1]) ? { url: match[1], size: Number(match[2] || 1), unit: match[3] || 'x' } : null;
    }).filter(Boolean);
    if (!candidates.length) return '';
    candidates.sort((a, b) => (b.unit === 'w' ? b.size : b.size * 1000) - (a.unit === 'w' ? a.size : a.size * 1000));
    return candidates[0].url;
  }

  // ---------- DOM helpers (no TreeWalker: must also work on server-side DOMs) ----------
  function firstTextNode(el) {
    for (let node = el.firstChild; node; node = node.nextSibling) {
      if (node.nodeType === TEXT_NODE) return node;
      if (node.nodeType === ELEMENT_NODE) {
        const found = firstTextNode(node);
        if (found) return found;
      }
    }
    return null;
  }

  function eachTextNode(el, fn) {
    for (let node = el.firstChild; node; node = node.nextSibling) {
      if (node.nodeType === TEXT_NODE) fn(node);
      else if (node.nodeType === ELEMENT_NODE) eachTextNode(node, fn);
    }
  }

  function computedStyle(el) {
    try {
      const view = el.ownerDocument && el.ownerDocument.defaultView;
      return view ? view.getComputedStyle(el) : null;
    } catch (e) { return null; }
  }

  function classOf(el) { return typeof el.className === 'string' ? el.className : ''; }

  // ---------- code blocks ----------
  function detectLanguage(el) {
    for (let node = el; node && node.nodeType === ELEMENT_NODE; node = node.parentNode) {
      const match = classOf(node).match(LANG_CLASS);
      if (match) return match[1];
      for (let i = 0; i < ['data-lang', 'data-language', 'data-highlight-language', 'data-code-language'].length; i++) {
        const value = node.getAttribute && node.getAttribute(['data-lang', 'data-language', 'data-highlight-language', 'data-code-language'][i]);
        if (value) return value;
      }
    }
    const code = el.querySelector && el.querySelector('code[class]');
    if (code) {
      const match = classOf(code).match(LANG_CLASS);
      if (match) return match[1];
    }
    return '';
  }

  // Turndown only fences <pre><code>: give bare <pre> a code child so the rule fires.
  function normalizePre(root) {
    [].slice.call(root.querySelectorAll('pre')).forEach((pre) => {
      if (pre.querySelector('code')) return;
      const doc = pre.ownerDocument || root;
      const code = doc.createElement('code');
      while (pre.firstChild) code.appendChild(pre.firstChild);
      const lang = detectLanguage(pre);
      if (lang) code.className = 'language-' + lang;
      pre.appendChild(code);
    });
  }

  function collectCodeText(el) {
    const out = [];
    (function walk(node) {
      if (node.nodeType === TEXT_NODE) {
        // Whitespace between inline spans is source formatting, not a blank code line.
        if (/^\s*$/.test(node.nodeValue) && /\n/.test(node.nodeValue)) return;
        out.push(node.nodeValue);
        return;
      }
      if (node.nodeType !== ELEMENT_NODE) return;
      if (GUTTER_CLASS.test(classOf(node))) return;
      if (node.tagName === 'BR') { out.push('\n'); return; }
      if (/^(DIV|P|LI|TR|PRE)$/.test(node.tagName) && out.length && !/\n$/.test(out[out.length - 1])) out.push('\n');
      for (let child = node.firstChild; child; child = child.nextSibling) walk(child);
    })(el);
    return out.join('').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
  }

  function looksLikeCode(el) {
    if (CODE_CLASS.test(classOf(el))) return true;
    if (el.tagName !== 'DIV') return false;
    const style = computedStyle(el);
    if (!style) return false;
    return MONO_FONT.test(style.fontFamily || '') || /^pre(-wrap)?$/i.test(String(style.whiteSpace || ''));
  }

  // closest() is not available on every server-side DOM, so walk up manually.
  function insideCode(el) {
    for (let node = el.parentNode; node && node.nodeType === ELEMENT_NODE; node = node.parentNode) {
      if (node.tagName === 'PRE' || node.tagName === 'CODE') return true;
    }
    return false;
  }

  function normalizeCodeBlocks(root) {
    const doc = root.ownerDocument || root;
    [].slice.call(root.querySelectorAll('div,section,figure')).forEach((el) => {
      if (!root.contains(el) || insideCode(el)) return;
      if (el.querySelector('pre')) return;
      if (!looksLikeCode(el)) return;
      const raw = collectCodeText(el);
      if (!raw || raw.trim().length < 12) return;
      const pre = doc.createElement('pre');
      const code = doc.createElement('code');
      const lang = detectLanguage(el);
      if (lang) code.className = 'language-' + lang;
      code.textContent = raw;
      pre.appendChild(code);
      el.parentNode.replaceChild(pre, el);
    });
  }

  // Readability flattens code blocks, so they must be rebuilt first. Skipped on
  // oversized pages so a huge DOM cannot block the export.
  function prepareCode(root) {
    if (root.querySelectorAll('*').length > ELEMENT_BUDGET) return false;
    normalizePre(root);
    normalizeCodeBlocks(root);
    return true;
  }

  // ---------- tables ----------
  // A single <p> wrapper inside a cell is not "nested content": unwrap it first.
  function unwrapCellParagraphs(table) {
    [].slice.call(table.querySelectorAll('td,th')).forEach((cell) => {
      const paragraphs = [].slice.call(cell.querySelectorAll('p')).filter((p) => !p.querySelector('p'));
      if (!paragraphs.length) return;
      const doc = cell.ownerDocument || table.ownerDocument;
      paragraphs.forEach((p, index) => {
        const fragment = doc.createDocumentFragment();
        if (index > 0) fragment.appendChild(doc.createElement('br'));
        while (p.firstChild) fragment.appendChild(p.firstChild);
        p.parentNode.replaceChild(fragment, p);
      });
    });
  }

  function isComplexTable(table) {
    if (table.querySelector('table')) return true;
    const cells = [].slice.call(table.querySelectorAll('td,th'));
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (Number(cell.getAttribute('colspan')) > 1) return true;
      if (Number(cell.getAttribute('rowspan')) > 1) return true;
      if (cell.querySelector('ul,ol,pre,blockquote,table,h1,h2,h3,h4,h5,h6')) return true;
    }
    return false;
  }

  function escapeTableCells(table) {
    [].slice.call(table.querySelectorAll('br')).forEach((br) => {
      br.parentNode.replaceChild(br.ownerDocument.createTextNode(' '), br);
    });
    [].slice.call(table.querySelectorAll('td,th')).forEach((cell) => {
      eachTextNode(cell, (node) => {
        node.nodeValue = node.nodeValue.replace(/\|/g, PIPE_MARK).replace(/[\r\n]+/g, ' ');
      });
    });
  }

  function normalizeTables(root) {
    let kept = 0;
    [].slice.call(root.querySelectorAll('table')).forEach((table) => {
      unwrapCellParagraphs(table);
      if (isComplexTable(table)) {
        table.setAttribute('data-md-keep-html', '1');
        kept++;
      } else {
        escapeTableCells(table);
      }
    });
    return kept;
  }

  // Paragraphs starting with Markdown syntax would silently change meaning.
  function normalizeLeading(root) {
    [].slice.call(root.querySelectorAll('p,li,blockquote')).forEach((el) => {
      const node = firstTextNode(el);
      if (!node) return;
      const match = node.nodeValue.match(LEADING_MARKDOWN);
      if (!match) return;
      node.nodeValue = node.nodeValue.replace(LEADING_MARKDOWN,
        (all, space, marker, tail) => space + '\\' + marker + tail);
    });
  }

  // Chat apps (ChatGPT etc.) wrap message images in <button> lightbox triggers.
  // Buttons are UI noise for extraction, so pull a text-free image button's <img>
  // out (keeping its alt / aria-label) before noise removal deletes it.
  function rescueImages(root) {
    [].slice.call(root.querySelectorAll('button')).forEach((btn) => {
      const img = btn.querySelector('img');
      if (!img || plain(btn.textContent)) return;
      if (!img.getAttribute('alt')) img.setAttribute('alt', btn.getAttribute('aria-label') || btn.getAttribute('title') || '');
      btn.parentNode.replaceChild(img, btn);
    });
  }

  // Full cleanup of a detached holder: noise removal, URL absolutising, code blocks,
  // tables and leading-character escapes. Returns how many tables had to stay as HTML.
  function normalizeElement(root, base) {
    rescueImages(root);
    [].slice.call(root.querySelectorAll(NOISE_SELECTOR)).forEach((el) => el.remove());
    absolutize(root, base);
    normalizePre(root);
    normalizeCodeBlocks(root);
    const keptTables = normalizeTables(root);
    normalizeLeading(root);
    return { keptTables: keptTables };
  }

  // ---------- links and images ----------
  function absolutize(root, base) {
    [].slice.call(root.querySelectorAll('a[href]')).forEach((el) => {
      el.setAttribute('href', absolutizeUrl(el.getAttribute('href'), base));
    });
    [].slice.call(root.querySelectorAll('img')).forEach((img) => {
      let src = img.getAttribute('src');
      const responsive = bestSrcset(img.getAttribute('data-srcset') || img.getAttribute('srcset'));
      if (responsive) src = responsive;
      if (isPlaceholder(src)) {
        for (let i = 0; i < LAZY_IMAGE_ATTRS.length && isPlaceholder(src); i++) {
          src = img.getAttribute(LAZY_IMAGE_ATTRS[i]);
        }
      }
      if (isPlaceholder(src)) {
        const source = img.parentNode && img.parentNode.tagName === 'PICTURE'
          ? img.parentNode.querySelector('source[srcset]') : null;
        if (source) src = bestSrcset(source.getAttribute('srcset'));
      }
      img.setAttribute('src', absolutizeUrl(src, base));
      img.removeAttribute('srcset');
      if (!img.getAttribute('alt')) img.setAttribute('alt', img.getAttribute('title') || '');
    });
  }

  // ---------- extraction ----------
  function readArticle(doc) {
    const Ctor = typeof Readability !== 'undefined' ? Readability : root.Readability;
    if (!Ctor) return null;
    try {
      // keepClasses: Readability strips class names by default, which would drop the
      // language marker we put on code blocks.
      return new Ctor(doc, { charThreshold: 200, keepClasses: true }).parse();
    } catch (e) { return null; }
  }

  function extractArticle(options) {
    const opts = options || {};
    const warnings = [];
    const base = (typeof document !== 'undefined' && document.baseURI) ||
      (typeof location !== 'undefined' && location && location.href) || '';
    const mode = opts.mode || 'auto';

    let html = '', used = 'full';
    let title = (typeof document !== 'undefined' && document.title) || '';
    let byline = '', siteName = '', excerpt = '', publishedTime = '';

    if (mode === 'selection') {
      // A live selection cannot cross the extension boundary, so callers pass the
      // element directly; `selector` stays available for server-side use.
      const selected = opts.element || (opts.selector ? document.querySelector(opts.selector) : null);
      if (!selected) throw new Error('The selected element is no longer present. Select it again.');
      const copy = selected.cloneNode(true);
      prepareCode(copy);
      html = copy.outerHTML;
      used = 'selection';
    } else if (mode === 'full') {
      const copy = document.body ? document.body.cloneNode(true) : null;
      if (copy) {
        if (!prepareCode(copy)) warnings.push('Very large page: code blocks were left unchanged.');
        html = copy.outerHTML;
      }
      used = 'full';
    } else {
      const clone = document.cloneNode(true);
      if (!prepareCode(clone)) warnings.push('Very large page: code blocks were left unchanged.');
      rescueImages(clone);
      const article = readArticle(clone);
      const probe = document.createElement('div');
      probe.innerHTML = article && article.content ? article.content : '';
      if (article && probe.textContent.replace(/\s+/g, '').length >= 200) {
        html = article.content;
        title = article.title || title;
        byline = article.byline || '';
        siteName = article.siteName || '';
        excerpt = article.excerpt || '';
        publishedTime = article.publishedTime || '';
        used = 'readability';
      } else {
        const regions = [].slice.call(clone.querySelectorAll('article,main,[role="main"]'))
          .sort((a, b) => (b.textContent || '').length - (a.textContent || '').length);
        const main = regions[0];
        if (main && plain(main.textContent).length >= 80) {
          html = main.outerHTML;
          used = 'main';
          warnings.push('The article could not be isolated automatically. The main page region was used instead.');
        } else {
          html = document.body ? document.body.innerHTML : '';
          used = 'body';
          warnings.push('The article could not be isolated automatically. The whole page was exported — review the result.');
        }
      }
    }

    const holder = document.createElement('div');
    holder.innerHTML = html || '';
    const keptTables = normalizeElement(holder, base).keptTables;
    if (keptTables) {
      warnings.push(keptTables === 1
        ? '1 table had merged or nested cells and was kept as HTML.'
        : keptTables + ' tables had merged or nested cells and were kept as HTML.');
    }
    normalizeLeading(holder);

    const remoteImages = [].slice.call(holder.querySelectorAll('img')).filter((img) => {
      return /^https?:/i.test(img.getAttribute('src') || '');
    }).length;
    if (remoteImages) {
      warnings.push(remoteImages === 1
        ? '1 image still points at the source site and will break if it moves.'
        : remoteImages + ' images still point at the source site and will break if they move.');
    }

    return {
      element: holder,
      html: holder.innerHTML,
      title: plain(title),
      byline: plain(byline),
      siteName: plain(siteName),
      excerpt: plain(excerpt),
      publishedTime: plain(publishedTime),
      source: base,
      mode: used,
      warnings: warnings
    };
  }

  // ---------- Markdown conversion ----------
  function turndownService() {
    const Ctor = typeof TurndownService !== 'undefined' ? TurndownService : root.TurndownService;
    if (!Ctor) throw new Error('Turndown is not loaded.');
    const service = new Ctor({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      fence: '```',
      emDelimiter: '*',
      strongDelimiter: '**',
      linkStyle: 'inlined'
    });
    const gfm = typeof turndownPluginGfm !== 'undefined' ? turndownPluginGfm : root.turndownPluginGfm;
    if (gfm) service.use(gfm.gfm);
    service.remove(['script', 'style', 'noscript', 'svg', 'button', 'iframe', 'form']);
    // Added last, so it wins over the GFM table rule for tables we cannot express.
    service.addRule('keptTable', {
      filter: (node) => node.nodeName === 'TABLE' && node.getAttribute('data-md-keep-html') === '1',
      replacement: (content, node) => '\n\n<!-- This table uses merged or nested cells, which Markdown cannot express — kept as raw HTML; some Markdown viewers may not render it. -->\n' +
        node.outerHTML.replace(/\s+data-md-keep-html="1"/g, '') + '\n\n'
    });
    service.addRule('fencedCodeBlock', {
      filter: (node, options) => options.codeBlockStyle === 'fenced' &&
        node.nodeName === 'PRE' && node.firstChild && node.firstChild.nodeName === 'CODE',
      replacement: (content, node, options) => {
        const language = detectLanguage(node) || '';
        const fence = options.fence || '```';
        const body = node.firstChild.textContent.replace(/\n+$/, '');
        const longest = body.split('\n').reduce((max, line) => {
          const match = line.match(/^`+/);
          return match && match[0].length > max ? match[0].length : max;
        }, 0);
        const extra = Math.max(0, longest + 1 - fence.length);
        const marker = fence + new Array(extra + 1).join('`');
        return '\n\n' + marker + language + '\n' + body + '\n' + marker + '\n\n';
      }
    });
    // 定义列表 <dl><dt>术语</dt><dd>释义</dd></dl> → 术语\n:   释义 （kramdown/Pandoc 风格）
    service.addRule('definitionList', {
      filter: 'dl',
      replacement: (content, node) => {
        let out = '\n\n';
        for (const child of Array.from(node.childNodes)) {
          const name = child.nodeName;
          if (name === 'DT' || name === 'DH') {
            out += service.turndown(child).trim().replace(/\n+/g, ' ') + '\n';
          } else if (name === 'DD') {
            out += ':   ' + service.turndown(child).trim().replace(/\n+/g, ' ') + '\n';
          }
        }
        return out + '\n';
      }
    });
    // 脚注引用 <sup><a href="#fn1">1</a></sup> → [^1]（常见维基/导出模式，尽力而为）
    service.addRule('footnoteRef', {
      filter: (node) => node.nodeName === 'SUP' && node.firstChild && node.firstChild.nodeName === 'A' &&
        /^#(fn|footnote)/i.test(node.firstChild.getAttribute('href') || ''),
      replacement: (content, node) => {
        const href = node.firstChild.getAttribute('href') || '';
        const m = href.match(/\d+/);
        return '[^' + (m ? m[0] : '1') + ']';
      }
    });
    // 脚注定义 <li id="fn1">…</li> → [^1]: …（位于脚注区块时）
    service.addRule('footnoteDef', {
      filter: (node) => node.nodeName === 'LI' && /^fn|^footnote|^footnote-/i.test(node.id || ''),
      replacement: (content, node) => {
        const m = (node.id || '').match(/\d+/);
        return '[^' + (m ? m[0] : '1') + ']: ' + content.trim() + '\n';
      }
    });
    return service;
  }

  function postClean(markdown) {
    const cleaned = String(markdown || '')
      .replace(/\r\n?/g, '\n')
      .replace(/[​-‏﻿]/g, '')
      .replace(/ /g, ' ')
      .replace(/[ \t]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\n+/, '')
      .replace(/\s+$/, '');
    return cleaned ? cleaned + '\n' : '';
  }

  function yamlValue(value) {
    return '"' + plain(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }

  function frontMatter(meta) {
    const lines = ['---'];
    if (meta.title) lines.push('title: ' + yamlValue(meta.title));
    if (meta.source) lines.push('source: ' + yamlValue(meta.source));
    if (meta.author) lines.push('author: ' + yamlValue(meta.author));
    if (meta.published) lines.push('published: ' + yamlValue(meta.published));
    if (meta.site) lines.push('site: ' + yamlValue(meta.site));
    lines.push('exported: ' + new Date().toISOString().slice(0, 10));
    lines.push('generator: "GoodConvertPDF"');
    lines.push('---', '');
    return lines.join('\n');
  }

  function slugify(value) {
    return String(value || '').toLowerCase().trim()
      .replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  }

  // Build a GitHub-style Table of Contents from H2/H3 headings (without altering the body).
  function buildToc(markdown) {
    const items = [];
    const slugs = new Map();
    let fence = null;
    String(markdown || '').split('\n').forEach((line) => {
      const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
      if (marker) {
        if (!fence) fence = { char: marker[1][0], length: marker[1].length };
        else if (marker[1][0] === fence.char && marker[1].length >= fence.length && /^\s*$/.test(line.slice(marker[0].length))) fence = null;
        return;
      }
      if (fence || /^(?: {4}|\t)/.test(line)) return;
      const m = line.match(/^(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/);
      if (!m) return;
      const label = m[2].replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/<[^>]+>/g, '').replace(/[*`_~]/g, '').trim();
      if (!label) return;
      const base = slugify(label), count = slugs.get(base) || 0;
      slugs.set(base, count + 1);
      if (m[1].length === 2 || m[1].length === 3) items.push({ level: m[1].length, text: label, slug: count ? base + '-' + count : base });
    });
    if (!items.length) return '';
    let toc = '## Table of Contents\n\n';
    for (const it of items) {
      const indent = '  '.repeat(it.level - 2);
      toc += indent + '- [' + it.text + '](#' + it.slug + ')\n';
    }
    return toc + '\n';
  }

  // Convert Markdown to clean plain text (for .txt export): strips YAML front matter,
  // HTML comments and inline/block formatting while keeping headings, lists and tables.
  function markdownToText(md) {
    let s = String(md || '')
      .replace(/^---\n[\s\S]*?\n---\n?/, '')
      .replace(/<!--[\s\S]*?-->/g, '');
    const lines = s.split('\n');
    const out = [];
    let inFence = false;
    for (let line of lines) {
      if (/^```/.test(line)) { inFence = !inFence; if (!inFence) out.push(''); continue; }
      if (inFence) { out.push(line); continue; }
      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) { out.push(''); out.push(h[2].trim().toUpperCase()); out.push(''); continue; }
      line = line.replace(/^>\s?/, '');
      line = line.replace(/^(\s*)([-*+]|\d+\.)\s+/, '$1');
      if (/^\s*\|/.test(line)) {
        if (/^\s*\|?[\s:|-]+\|?\s*$/.test(line)) continue; // GFM separator row
        line = line.replace(/\|/g, ' | ').replace(/\s*\|\s*$/, '');
      }
      line = line
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        .replace(/~~([^~]+)~~/g, '$1')
        .replace(/!\[([^\]]*)\]\(([^)]*)\)/g, '$1')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
        .replace(/\\\|/g, '|');
      out.push(line);
    }
    return postClean(out.join('\n'));
  }

  function htmlToMarkdown(input, options) {
    const opts = options || {};
    const converted = String(turndownService().turndown(input)).split(PIPE_MARK).join('\\|');
    let markdown = postClean(converted);
    const fm = opts.frontMatter !== false ? frontMatter(opts.meta || {}) : '';
    const toc = opts.toc ? buildToc(markdown) : '';
    return { markdown: fm + toc + markdown, warnings: opts.warnings || [] };
  }

  function extractMarkdown(options) {
    const opts = options || {};
    const article = extractArticle(opts);
    const result = htmlToMarkdown(article.element, {
      frontMatter: opts.frontMatter,
      toc: opts.toc,
      warnings: article.warnings,
      meta: {
        title: opts.title || article.title,
        source: article.source,
        author: article.byline,
        published: article.publishedTime,
        site: article.siteName
      }
    });
    return {
      markdown: result.markdown,
      title: article.title,
      source: article.source,
      mode: article.mode,
      warnings: result.warnings
    };
  }

  return {
    extractArticle: extractArticle,
    normalizeElement: normalizeElement,
    htmlToMarkdown: htmlToMarkdown,
    extractMarkdown: extractMarkdown,
    frontMatter: frontMatter,
    buildToc: buildToc,
    markdownToText: markdownToText,
    absolutizeUrl: absolutizeUrl,
    postClean: postClean
  };
});
