// Public extension links always open the official site in a separate tab.
(()=>{
 const locales=['en','de','fr','es','pt-BR','ja','zh-CN'];
 function url(page=''){const locale=locales.includes(document.documentElement.lang)?document.documentElement.lang:'en';return new URL(locale+'/'+page,'https://goodconvertpdf.com/').href;}
 function refresh(){document.querySelectorAll('a[data-site]').forEach(a=>{a.href=url(a.dataset.site);a.target='_blank';a.rel='noopener noreferrer';});}
 window.GCDSite={url,refresh};
 window.addEventListener('languagechange',refresh);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refresh);else refresh();
})();
