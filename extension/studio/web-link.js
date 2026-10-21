// 引流：把扩展内“网页版”入口指向当前环境的 WEB_URL（dev/prod 由 env.js 决定）。
// 扩展页面（MV3）禁止内联脚本，故用外部脚本设置 href；config 脚本须在本文件之前加载。
(function () {
  var web = (self.CONFIG && self.CONFIG.WEB_URL) || 'https://goodconvertpdf.com';
  var links = document.querySelectorAll('[data-web-link]');
  for (var i = 0; i < links.length; i++) {
    links[i].href = String(web).replace(/\/?$/, '/');
    links[i].target = '_blank';
    links[i].rel = 'noopener noreferrer';
  }
})();
