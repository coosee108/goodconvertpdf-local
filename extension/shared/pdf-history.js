// PDF bytes stay inside the extension origin. No remote calls and no original URLs.
(function(root){
  const MAX_AGE=7*86400000,MAX_COUNT=20,MAX_BYTES=100*1024*1024;
  let opening;
  function open(){if(!opening)opening=new Promise((resolve,reject)=>{
    const request=indexedDB.open('gcd-pdf-results',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('results',{keyPath:'id'});
    request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();opening=null;};resolve(db);};
    request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('HISTORY_UNAVAILABLE'));
  }).catch(error=>{opening=null;throw error;});return opening;}
  function survivors(records,now=Date.now()){
    const valid=records.filter(r=>typeof r.id==='string'&&Number.isFinite(r.size)&&r.size>0&&Number.isFinite(r.createdAt)&&r.createdAt<=now&&now-r.createdAt<MAX_AGE).sort((a,b)=>b.createdAt-a.createdAt||b.id.localeCompare(a.id));
    let bytes=0;return valid.filter((record,index)=>{bytes+=record.size;return index<MAX_COUNT&&bytes<=MAX_BYTES;});
  }
  async function transaction(action){const db=await open();return new Promise((resolve,reject)=>{
    const tx=db.transaction('results','readwrite'),store=tx.objectStore('results'),request=store.getAll();let value;
    request.onsuccess=()=>{try{value=action(store,request.result);}catch(error){tx.abort();reject(error);}};
    tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('HISTORY_UNAVAILABLE'));
  });}
  function prune(store,records){const keep=survivors(records),ids=new Set(keep.map(r=>r.id));records.forEach(r=>{if(!ids.has(r.id))store.delete(r.id);});return keep;}
  async function save(input){
    if(chrome.extension?.inIncognitoContext||input.incognito)return null;
    if(!(input.blob instanceof Blob)||input.blob.size>40*1024*1024||input.blob.type!=='application/pdf')throw Error('INVALID_PDF');
    const record={id:crypto.randomUUID(),blob:input.blob,name:String(input.name||'document').slice(0,100),host:String(input.host||'').slice(0,253),createdAt:Date.now(),size:input.blob.size,pages:input.pages,mode:input.options.contentMode,options:GCDPrefs.clean(input.options)};
    return transaction((store,records)=>{store.put(record);prune(store,[...records,record]);return record.id;});
  }
  const list=()=>transaction((store,records)=>prune(store,records).map(({blob,...meta})=>meta));
  const get=id=>transaction((store,records)=>prune(store,records).find(r=>r.id===id)||null);
  const remove=id=>transaction(store=>store.delete(id));
  const clear=()=>transaction(store=>store.clear());
  root.GCDHistory={save,list,get,remove,clear,survivors,MAX_AGE,MAX_COUNT,MAX_BYTES};
})(globalThis);
