// Shared by extension pages and the worker. Never stores source URLs or page content.
(function(root){
  const KEY='gcd-quick-preferences-v1';
  const fields=['paper','orientation','marginsMm','scale','layout','media','printBackground','loading','hideFixed','hideNavigation','preferCSSPageSize','contentMode'];
  function defaults(){return ConversionOptions.normalize({media:'screen',loading:{preset:'balanced',preScroll:true}});}
  function clean(input={}){
    const result=defaults();
    for(const key of fields)if(input[key]!==undefined)result[key]=input[key];
    if(result.contentMode==='selection')result.contentMode='full';
    return ConversionOptions.normalize(result);
  }
  function legacy(values){
    if(values.paper&&typeof values.paper==='object')return clean(values);
    return clean({paper:values.paper==='custom'?{mode:'custom',widthMm:Number(values.width)*(values.units==='in'?25.4:1),heightMm:Number(values.height)*(values.units==='in'?25.4:1)}:{mode:'preset',format:values.paper||'A4'},
      orientation:values.orientation,layout:values.layout,media:values.media,scale:values.scale===undefined?undefined:Number(values.scale),
      marginsMm:Object.fromEntries(['top','right','bottom','left'].map(k=>[k,values[k]===undefined?10:Number(values[k])])),
      printBackground:values.background,contentMode:values.content,hideFixed:values.fixed,hideNavigation:values.navigation,
      preferCSSPageSize:values.cssPaper,loading:{preset:values.loading||'balanced',preScroll:values.scroll??true}});
  }
  function hostname(url){try{const u=new URL(url);return /^https?:$/.test(u.protocol)?u.hostname.toLowerCase():'';}catch{return '';}}
  async function read(){const saved=(await chrome.storage.local.get(KEY))[KEY];return {version:1,retain:true,rules:{},...saved};}
  // All writes run in the worker, serialized to avoid lost updates across extension pages.
  let writes=Promise.resolve();
  function update(change){const next=writes.then(async()=>{const prefs=await read();await change(prefs);await chrome.storage.local.set({[KEY]:prefs});return prefs;});writes=next.catch(()=>{});return next;}
  async function resolve(host,{bypass=false,mode}={}){
    const prefs=await read();let options=defaults(),rule=false;
    {try{if(prefs.defaultOptions||prefs.recent)options=clean(prefs.defaultOptions||prefs.recent);}catch{}
      const saved=prefs.rules[host];if(!bypass&&saved?.enabled){try{options=clean(saved.options);rule=true;}catch{}}
    }
    if(mode==='article')options.contentMode='article';
    return {options,rule,retain:prefs.retain!==false};
  }
  async function mutate(action,payload={}){return update(prefs=>{
    if(action==='retain')prefs.retain=!!payload.value;
    else if(action==='recent')prefs.recent=clean(payload.options);
    else if(action==='rule'){
      const host=hostname('https://'+payload.host);
      if(!host||host!==payload.host)throw Error('INVALID_HOST');
      if(payload.operation==='delete')delete prefs.rules[host];
      else if(payload.operation==='toggle'){if(prefs.rules[host])prefs.rules[host].enabled=!!payload.enabled;}
      else{if(!prefs.rules[host]&&Object.keys(prefs.rules).length>=30)throw Error('RULE_LIMIT');prefs.rules[host]={enabled:true,options:clean(payload.options)};}
    }else if(action==='migrate'&&!prefs.migrated){
      const backup=payload.legacy||{};prefs.legacyBackup=backup;prefs.migrationWarnings=0;
      for(const [host,values] of Object.entries(backup.rules||{}).slice(0,30)){
        try{if(hostname('https://'+host)!==host)throw Error();if(!prefs.rules[host])prefs.rules[host]={enabled:true,options:legacy(values)};}catch{prefs.migrationWarnings++;}
      }
      try{if(backup.defaultOptions&&!prefs.defaultOptions)prefs.defaultOptions=legacy(backup.defaultOptions);}catch{prefs.migrationWarnings++;}
      try{if(backup.recent&&!prefs.recent)prefs.recent=legacy(backup.recent);}catch{prefs.migrationWarnings++;}
      prefs.migrated=true;
    }else if(action==='default')prefs.defaultOptions=payload.options?clean(payload.options):null;
  });}
  root.GCDPrefs={KEY,defaults,clean,legacy,hostname,read,resolve,mutate};
})(globalThis);
