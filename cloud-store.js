(function(){
 'use strict';
 const test=new URLSearchParams(location.search).get('test')==='1';
 const guestKey=test?'cake-studio-test-v2':'cake-studio-v1';
 let key=guestKey,dbPromise;
 function db(){return dbPromise||=new Promise((resolve,reject)=>{const r=indexedDB.open(test?'cake-workshop-test-v1':'cake-workshop-v1',1);r.onupgradeneeded=()=>{r.result.createObjectStore('assets',{keyPath:'key'});r.result.createObjectStore('backups',{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
 async function tx(store,mode,fn){const d=await db();return new Promise((resolve,reject)=>{const t=d.transaction(store,mode),r=fn(t.objectStore(store));t.oncomplete=()=>resolve(r.result);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||Error('本地存储失败'));});}
 const read=k=>{const raw=localStorage.getItem(k);return raw?JSON.parse(raw):null;};
 window.CakeStore={test,guestKey,get key(){return key;},read,
  accountKey(uid){return guestKey+':account:'+uid;},
  switchKey(k){key=k;},
  write(state){localStorage.setItem(key,JSON.stringify(state));},
  meta(k=key){return read(k+':sync')||{revision:0,dirty:false};},
  setMeta(m,k=key){localStorage.setItem(k+':sync',JSON.stringify(m));},
  putAsset(a,scope=key){return tx('assets','readwrite',s=>s.put({...a,key:scope+':'+a.id,scope}));},
  getAsset(id,scope=key){return tx('assets','readonly',s=>s.get(scope+':'+id));},
  async assets(scope=key){return (await tx('assets','readonly',s=>s.getAll())).filter(a=>a.scope===scope);},
  async backup(state,reason,scope=key){const value={id:crypto.randomUUID(),scope,time:new Date().toISOString(),reason,state:structuredClone(state)};await tx('backups','readwrite',s=>s.put(value));return value;},
  async backups(scope=key){return (await tx('backups','readonly',s=>s.getAll())).filter(b=>b.scope===scope).sort((a,b)=>b.time.localeCompare(a.time));}
 };
})();
