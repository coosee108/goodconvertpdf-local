// 纯转换逻辑：图片/CSV·JSON/会话/AI 对话 -> 可打印 HTML。
// 不依赖 DOM，既在扩展 popup 里用，也能在 Node 下直接单测。
//
// 设计要点（准确率 / 速度 / 容错）：
//  - 输入先统一编码与换行（去 BOM、CRLF/CR -> LF），避免首列被 BOM 污染。
//  - CSV 自动探测分隔符（逗号 / 制表符 / 分号 / 竖线），支持引号内换行与转义引号。
//  - JSON 支持「对象数组 / 二维数组 / 单对象 / 标量」，列名与行值不丢字段。
//  - 会话解析采用「时间锚点的多格式模式表」，覆盖 IM、WhatsApp、Slack、邮件头块。
//  - 打印样式面向分页：表头跨页重复、行/消息/图片不断裂、长串可断行、数字列右对齐。
//  - 全部输出走 escapeHtml，避免 XSS 与 PDF 结构被内容破坏。
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Converters = api;
})(typeof self !== 'undefined' ? self : this, function () {

  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function stringifyCell(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') { try { return JSON.stringify(v); } catch (e) { return String(v); } }
    return String(v);
  }

  // 统一编码与换行：去掉 UTF-8 BOM，CRLF/CR 归一到 LF
  function normalizeText(text) {
    return String(text == null ? '' : text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  }

  // ---------- CSV ----------
  // 在首行（表头）内统计候选分隔符出现次数（忽略引号内），取最多者
  function detectDelimiter(text) {
    var first = normalizeText(text).split('\n').filter(function (l) { return l.trim() !== ''; })[0] || '';
    var candidates = [',', '\t', ';', '|'];
    var best = ',', bestCount = 0;
    candidates.forEach(function (d) {
      var count = 0, inQ = false;
      for (var i = 0; i < first.length; i++) {
        var ch = first.charAt(i);
        if (ch === '"') inQ = !inQ;
        else if (ch === d && !inQ) count++;
      }
      if (count > bestCount) { bestCount = count; best = d; }
    });
    return best;
  }

  function csvToRows(text, delimiter) {
    var rows = [], row = [], cur = '', inQ = false;
    var src = normalizeText(text);
    var d = delimiter || detectDelimiter(src);
    for (var i = 0; i < src.length; i++) {
      var ch = src.charAt(i);
      if (inQ) {
        if (ch === '"') {
          if (src.charAt(i + 1) === '"') { cur += '"'; i++; } else inQ = false;
        } else cur += ch;
      } else {
        if (ch === '"') inQ = true;
        else if (ch === d) { row.push(cur); cur = ''; }
        else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
        else cur += ch;
      }
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(function (r) {
      return r.some(function (c) { return (c || '').trim() !== ''; });
    });
  }

  // ---------- JSON ----------
  function jsonToTable(text) {
    var data;
    try { data = JSON.parse(normalizeText(text)); } catch (e) { return null; }
    var columns = [], rows = [];
    function addCol(k) { if (columns.indexOf(k) < 0) columns.push(k); }

    if (Array.isArray(data)) {
      var objRows = data.filter(function (x) { return x && typeof x === 'object' && !Array.isArray(x); });
      var arrRows = data.filter(function (x) { return Array.isArray(x); });
      if (data.length && objRows.length === data.length) {
        // 对象数组：列取并集，缺字段留空，保证字段不丢
        data.forEach(function (o) { Object.keys(o).forEach(addCol); });
        data.forEach(function (o) {
          var r = {}; columns.forEach(function (c) { r[c] = stringifyCell(o[c]); }); rows.push(r);
        });
      } else if (arrRows.length) {
        // 二维数组：按列展开为 col1..colN（此前会被压成一列）
        var width = data.reduce(function (m, r) { return Math.max(m, Array.isArray(r) ? r.length : 1); }, 0);
        for (var i = 0; i < width; i++) columns.push('col' + (i + 1));
        data.forEach(function (r) {
          var o = {}; columns.forEach(function (c, idx) { o[c] = stringifyCell(Array.isArray(r) ? r[idx] : r); }); rows.push(o);
        });
      } else {
        columns = ['value'];
        data.forEach(function (v) { var r = {}; r.value = stringifyCell(v); rows.push(r); });
      }
    } else if (data && typeof data === 'object') {
      columns = ['key', 'value'];
      Object.keys(data).forEach(function (k) {
        var r = {}; r.key = k; r.value = stringifyCell(data[k]); rows.push(r);
      });
    } else {
      columns = ['value'];
      var r0 = {}; r0.value = stringifyCell(data); rows.push(r0);
    }
    return { columns: columns, rows: rows };
  }

  // 数字列（≥80% 单元格为数值）→ 打印时右对齐、不折行
  function isNumericColumn(t, col) {
    var checked = 0, numeric = 0;
    for (var i = 0; i < t.rows.length && checked < 30; i++) {
      var v = String(t.rows[i][col] == null ? '' : t.rows[i][col]).trim();
      if (!v) continue;
      checked++;
      if (/^-?[\d,]+(\.\d+)?%?$/.test(v)) numeric++;
    }
    return checked >= 2 && numeric / checked >= 0.8;
  }

  function rowsToHtml(t) {
    if (!t || !t.rows.length) return '<p class="empty">No rows.</p>';
    var num = {};
    t.columns.forEach(function (c) { num[c] = isNumericColumn(t, c); });
    var head = '<tr>' + t.columns.map(function (c) {
      return '<th' + (num[c] ? ' class="num"' : '') + '>' + escapeHtml(c) + '</th>';
    }).join('') + '</tr>';
    var body = t.rows.map(function (r) {
      return '<tr>' + t.columns.map(function (c) {
        return '<td' + (num[c] ? ' class="num"' : '') + '>' + escapeHtml(r[c]) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    return '<table><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
  }

  function detectDataFormat(text) {
    var t = normalizeText(text).trim();
    if (!t) return 'empty';
    if (/^[[{]/.test(t)) {
      try { JSON.parse(t); return 'json'; } catch (e) { /* 不是合法 JSON，按 CSV 处理 */ }
    }
    return 'csv';
  }

  // 是否「看起来像表格数据」：避免把普通段落误判为 CSV 而拆成一堆单列表格
  function looksLikeTable(text) {
    var src = normalizeText(text).trim();
    if (!src) return false;
    if (detectDataFormat(src) === 'json') return true;

    var lines = src.split('\n').filter(function (l) { return l.trim() !== ''; });
    if (lines.length < 2) return false;
    var sample = lines.slice(0, 20);
    if (!sample.every(function (l) { return l.length <= 200; })) return false;

    var d = detectDelimiter(src);
    var counts = sample.map(function (l) {
      var n = 0, inQ = false;
      for (var i = 0; i < l.length; i++) {
        var ch = l.charAt(i);
        if (ch === '"') inQ = !inQ; else if (ch === d && !inQ) n++;
      }
      return n;
    });
    var base = counts[0];
    if (base < 1) return false;
    // 逗号最容易与自然语言冲突：要求首行至少 2 个（≥3 列）才算表格
    if (d === ',' && base < 2) return false;
    var consistent = counts.filter(function (c) { return c === base; }).length / counts.length;
    return consistent >= 0.8;
  }

  // CSV / JSON -> 表格 HTML
  function dataToHtml(text) {
    var kind = detectDataFormat(text);
    if (kind === 'empty') return { ok: false, error: 'Nothing to convert.' };

    if (kind === 'json') {
      var t = jsonToTable(text);
      if (!t) return { ok: false, error: 'Invalid JSON.' };
      if (!t.rows.length) return { ok: false, error: 'JSON has no rows.' };
      return { ok: true, kind: 'json', html: rowsToHtml(t) };
    }

    var src = normalizeText(text);
    var rows = csvToRows(src);
    if (!rows.length) return { ok: false, error: 'No CSV rows found.' };
    var header = rows[0], data = rows.slice(1), t2;
    if (data.length) {
      t2 = { columns: header.map(function (h, i) { return (h || '').trim() || ('col' + (i + 1)); }), rows: [] };
      // 列数不一致时按表头对齐：多出的列丢弃、缺失的列补空，避免整行错位
      data.forEach(function (r) {
        var o = {}; t2.columns.forEach(function (c, i) { o[c] = r[i] == null ? '' : r[i]; }); t2.rows.push(o);
      });
    } else {
      // 只有一行时，按无表头处理
      var cols = header.map(function (_, i) { return 'col' + (i + 1); });
      var o1 = {}; cols.forEach(function (c, i) { o1[c] = header[i] || ''; });
      t2 = { columns: cols, rows: [o1] };
    }
    return { ok: true, kind: 'csv', html: rowsToHtml(t2), delimiter: detectDelimiter(src) };
  }

  // ---------- 会话（邮件 thread / IM 存档）----------
  // 模式表按「特异性从高到低」排列；每组用 when/who/text 指定捕获组下标（0 = 无）
  var THREAD_PATTERNS = [
    // [2024-01-02, 10:01:02] Alice: hi   /   [10:01] Alice: hi
    { re: /^\s*\[([^\]]{1,40})\]\s*([^:：]{0,40}?)\s*[:：]\s*([\s\S]*)$/, when: 1, who: 2, text: 3 },
    // 2024-01-02, 10:01 - Alice: hi   （WhatsApp 导出，含各种日期分隔与破折号）
    { re: /^\s*(\d{1,4}[\/.\-]\d{1,2}[\/.\-]\d{1,4},?\s+\d{1,2}:\d{2}(?::\d{2})?)\s*[-–—]\s*([^:：]{0,40}?)\s*[:：]\s*([\s\S]*)$/, when: 1, who: 2, text: 3 },
    // 10:01 Alice  hi   （Slack 导出：时间 + 姓名 + 两空格）
    { re: /^\s*(\d{1,2}:\d{2}(?::\d{2})?)\s+(\S{1,40})\s{2,}([\s\S]*)$/, when: 1, who: 2, text: 3 },
    // Alice (10:01): hi
    { re: /^\s*([^\s:：][^:：]{0,39}?)\s*\(([^)]{1,30})\)\s*[:：]\s*([\s\S]*)$/, when: 2, who: 1, text: 3 },
    // Alice: hi
    { re: /^\s*([^\s:：][^:：]{0,39}?)\s*[:：]\s*([\s\S]*)$/, when: 0, who: 1, text: 2 }
  ];
  var RE_MAIL_HEADER = /^(From|To|Cc|Bcc|Date|Sent|Subject|Reply-To|Delivered-To)\s*[:：]/i;

  function parseThread(text) {
    var lines = normalizeText(text).split('\n');
    var msgs = [], cur = null;

    function push() { if (cur && (cur.text || '').trim()) msgs.push(cur); cur = null; }

    lines.forEach(function (line) {
      if (!line.trim()) return;

      // 邮件头块：连续头字段合并为一条，避免每个字段各自成「消息」
      if (RE_MAIL_HEADER.test(line)) {
        if (cur && cur.isHeader) { cur.text += '\n' + line; }
        else { push(); cur = { when: '', who: 'Headers', text: line, isHeader: true }; }
        return;
      }

      var p = null, m = null;
      if (!/^https?:\/\//i.test(line.trim())) {
        for (var i = 0; i < THREAD_PATTERNS.length; i++) {
          var hit = line.match(THREAD_PATTERNS[i].re);
          if (hit) { p = THREAD_PATTERNS[i]; m = hit; break; }
        }
      }

      if (p && m) {
        var who = (p.who ? m[p.who] : '').trim();
        // 兜底：形如「10:01 xxx」的时间行若落入通用模式会得到纯数字说话人，按普通文本处理
        if (p.who === 1 && /^\d+$/.test(who)) who = '';
        if (who || p.when) {
          push();
          cur = { when: (p.when ? m[p.when] : '').trim(), who: who, text: (m[p.text] || '') };
          return;
        }
      }

      // 续行并入上一条；但邮件头块之后的正文应当独立成条，避免头与正文粘在一起
      if (cur && !cur.isHeader) cur.text += '\n' + line;
      else { push(); cur = { when: '', who: '', text: line }; }
    });
    push();
    return msgs;
  }

  function threadToHtml(messages) {
    var msgs = messages || [];
    if (!msgs.length) return '<p class="empty">No messages.</p>';
    return msgs.map(function (m) {
      var meta = (m.who || m.when)
        ? '<div class="meta">' + (m.who ? '<span class="who">' + escapeHtml(m.who) + '</span>' : '') +
          (m.when ? ' <span class="when">' + escapeHtml(m.when) + '</span>' : '') + '</div>'
        : '';
      return '<div class="msg' + (m.isHeader ? ' hdr' : '') + '">' + meta +
        '<div class="body">' + escapeHtml(m.text).replace(/\n/g, '<br/>') + '</div></div>';
    }).join('');
  }

  // ---------- v3：AI 对话 ----------
  function aiChatToHtml(conv) {
    var msgs = (conv && conv.messages) || [];
    if (!msgs.length) return '<p class="empty">No messages.</p>';
    return msgs.map(function (m) {
      var who = m.role === 'assistant' ? 'Assistant' : (m.role === 'system' ? 'System' : 'You');
      var cls = m.role === 'assistant' ? 'ai' : 'me';
      return '<div class="msg ' + cls + '">' +
        '<div class="meta"><span class="who">' + who + '</span></div>' +
        '<div class="body">' + escapeHtml(m.text).replace(/\n/g, '<br/>') + '</div></div>';
    }).join('');
  }

  function imagesToHtml(dataUrls) {
    var urls = dataUrls || [];
    if (!urls.length) return '<p class="empty">No images.</p>';
    return urls.map(function (u) {
      return '<figure class="img"><img src="' + u + '"/></figure>';
    }).join('');
  }

  // ---------- 打印文档外壳 ----------
  var PRINT_CSS = [
    'body{font-family:system-ui,Arial,sans-serif;padding:32px;line-height:1.6;color:#1B1F24;overflow-wrap:anywhere;}',
    'h1.doc-title{font-size:20px;margin:0 0 4px;page-break-after:avoid;}',
    '.doc-meta{font-size:12px;color:#6B7280;margin:0 0 20px;}',
    '.doc-foot{margin-top:28px;font-size:11px;color:#9AA1AB;border-top:1px solid #E5E7EB;padding-top:8px;page-break-inside:avoid;}',
    // 表格：表头跨页重复 + 行不断裂 + 长内容可断行
    'table{border-collapse:collapse;width:100%;font-size:12px;}',
    'thead{display:table-header-group;}',
    'tr{page-break-inside:avoid;}',
    'th,td{border:1px solid #D8DEE7;padding:6px 8px;text-align:left;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;}',
    'th{background:#F3F5F9;}',
    'th.num,td.num{text-align:right;white-space:nowrap;}',
    'p{orphans:2;widows:2;}',
    // 会话：单条消息不跨页
    '.msg{margin:0 0 14px;padding:10px 12px;border:1px solid #E5E7EB;border-radius:10px;page-break-inside:avoid;}',
    '.msg .meta{font-size:11px;color:#6B7280;margin-bottom:4px;}',
    '.msg .who{font-weight:700;color:#1B1F24;}',
    '.msg.ai{background:#F7F9FF;border-color:#D8E2FF;}',
    '.msg.me{background:#FFF;border-color:#E5E7EB;}',
    '.msg.hdr{background:#FBFCFE;border-style:dashed;}',
    '.msg .body{white-space:pre-wrap;word-break:break-word;}',
    // 图片：等比缩放、不跨页
    'figure.img{margin:0 0 16px;page-break-inside:avoid;}',
    'figure.img img{max-width:100%;height:auto;display:block;margin:0 auto;}',
    '.empty{color:#6B7280;}',
    '@page{margin:14mm;}'
  ].join('');

  function buildPrintDocument(opts) {
    opts = opts || {};
    var title = opts.title || 'GoodConvertPDF';
    var meta = opts.meta ? '<p class="doc-meta">' + escapeHtml(opts.meta) + '</p>' : '';
    return '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
      '<meta name="generator" content="GoodConvertPDF (local, zero-upload)">' +
      '<title>' + escapeHtml(title) + '</title>' +
      '<style>' + PRINT_CSS + '</style></head><body>' +
      '<h1 class="doc-title">' + escapeHtml(title) + '</h1>' + meta +
      '<div class="doc-body">' + (opts.bodyHtml || '') + '</div>' +
      '<p class="doc-foot">Made locally with GoodConvertPDF · zero upload · nothing left your browser</p>' +
      '</body></html>';
  }

  return {
    escapeHtml: escapeHtml,
    normalizeText: normalizeText,
    detectDelimiter: detectDelimiter,
    csvToRows: csvToRows,
    jsonToTable: jsonToTable,
    isNumericColumn: isNumericColumn,
    rowsToHtml: rowsToHtml,
    detectDataFormat: detectDataFormat,
    looksLikeTable: looksLikeTable,
    dataToHtml: dataToHtml,
    parseThread: parseThread,
    threadToHtml: threadToHtml,
    aiChatToHtml: aiChatToHtml,
    imagesToHtml: imagesToHtml,
    buildPrintDocument: buildPrintDocument
  };
});
