// 跨浏览器临时存储抽象。
// Chrome 提供 chrome.storage.session（会话级、随扩展关闭清空）；
// Firefox 115+ 和 Chromium 均支持 storage.session；临时内容只保留到浏览器会话结束。
// 用法：在 service worker 与扩展页中 importScripts / <script> 引入，统一调用 SessionStore。
(function (root) {
  var useSession = !!(typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session);
  if (!useSession) throw new Error('Session storage requires Firefox 115 or a compatible Chromium browser.');

  function get(keys) {
    return chrome.storage.session.get(keys);
  }

  function set(items) {
    return chrome.storage.session.set(items);
  }

  function remove(keys) {
    return chrome.storage.session.remove(keys);
  }

  // 只转发会话存储变更。
  function onChanged(listener) {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === 'session') listener(changes, 'session');
    });
  }

  root.SessionStore = {
    get: get,
    set: set,
    remove: remove,
    onChanged: onChanged,
    isSession: useSession
  };
})(typeof self !== 'undefined' ? self : this);
