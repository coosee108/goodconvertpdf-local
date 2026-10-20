// 纯本地模式开关：当 CONFIG.CLOUD_ENABLED === false 时，隐藏页面上所有跳转网页端的入口。
// 用法：在 env.js / config.*.js / config.js 之后、业务脚本之前引入本文件；
// 需要按模式隐藏的元素加 data-web-entry 属性即可，无需各页面写判断逻辑。
// 同时在 <html> 上标记 data-local-only，便于样式或其他脚本按模式分支。
(function () {
  var localOnly = !!(self.CONFIG && self.CONFIG.CLOUD_ENABLED === false);
  if (!localOnly) return;
  document.documentElement.setAttribute('data-local-only', '');
  var style = document.createElement('style');
  style.textContent = '[data-web-entry]{display:none!important}';
  (document.head || document.documentElement).appendChild(style);
  var hide = function () {
    document.querySelectorAll('[data-web-entry]').forEach(function (el) { el.hidden = true; });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hide);
  else hide();
})();
