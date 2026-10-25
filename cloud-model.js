(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CakeCloudModel=api;})(globalThis,function(){
 'use strict';
 const clone=x=>JSON.parse(JSON.stringify(x));
 // Postgres JSONB does not preserve object key order; arrays still retain order.
 const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
 const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
 const customId=k=>/^custom_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(k);
 function asset(a){
  if(!a||!customId(a.id)||typeof a.name!=='string'||!Array.isArray(a.size)||a.size.length!==2||a.size.some(n=>!Number.isFinite(n)||n<12||n>180)||!Number.isFinite(a.anchor)||a.anchor<.1||a.anchor>1)throw Error('配件资料不完整');
  const name=a.name.replace(/[<>"'&\u0000-\u001f]/g,'').trim().slice(0,24);if(!name)throw Error('给配件起个名字吧');
  return {id:a.id,name,size:a.size.map(n=>Math.round(n)),anchor:Math.round(a.anchor*100)/100};
 }
 function manifest(list=[]){if(!Array.isArray(list)||list.length>256)throw Error('这份存档的配件太多了');const seen=new Set();return list.map(a=>{a=asset(a);if(seen.has(a.id))throw Error('配件编号重复');seen.add(a.id);return a;});}
 // Import is additive. A divergent draft becomes a saved work, never silently replaced.
 function merge(target,source,newId=()=>crypto.randomUUID()){
  const out=clone(target),byId=new Map(out.gallery.map(c=>[c.id,c]));
  function fingerprint(c){let hash=2166136261;for(const char of JSON.stringify(canonical(c))){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}return (hash>>>0).toString(16);}
  function add(c){if(!c.layers.length)return;const tag=c.id+':'+fingerprint(c);if(out.gallery.some(x=>x.importSource===tag))return;const existing=byId.get(c.id);if(existing&&same(existing,c))return;if(out.draft.id===c.id&&same(out.draft,c))return;const next=clone(c);if(existing||out.draft.id===next.id){next.id=newId();next.name=(next.name+' · 另一版本').slice(0,30);}next.importSource=tag;next.savedAt||=new Date().toISOString();out.gallery.push(next);byId.set(next.id,next);}
  source.gallery.forEach(add);
  if(source.draft.layers.length){if(!out.draft.layers.length)out.draft=clone(source.draft);else add(source.draft);}
  if(out.gallery.length>24)throw Error('合并后超过 24 只收藏。原存档完整保留，请先整理图鉴再合并。');
  out.customAssets=manifest([...new Map([...(out.customAssets||[]),...(source.customAssets||[])].map(a=>[a.id,a])).values()]);
  return out;
 }
 // CAS: dirty local work + a changed remote revision always requires a visible decision.
 function syncDecision(local,meta,remote){
  if(!remote)return 'push';
  if(same(local,remote.state))return 'equal';
  if(meta.dirty&&remote.revision!==meta.revision)return 'conflict';
  if(meta.dirty)return 'push';
  return 'pull';
 }
 // Source art aliases and the sanitized public edition share one cloud format.
 const aliases={'silvercatcandle':'silvercatcandle','bowcharm':'bowcharm','silver-chain':'silver-chain'};
 function translate(state,toPublic=true){const out=clone(state),map=toPublic?aliases:Object.fromEntries(Object.entries(aliases).map(([a,b])=>[b,a]));const key=k=>map[k]||k;const bag=o=>Object.fromEntries(Object.entries(o||{}).map(([k,v])=>[key(k),v]));out.inventory=bag(out.inventory);for(const d of [out.draft,...out.gallery]){d.used=bag(d.used);for(const l of d.layers){l.item=key(l.item);for(const p of l.pieces||[])if(p.item)p.item=key(p.item);}for(const o of d.decos)o.item=key(o.item);}return out;}
 return {clone,same,customId,asset,manifest,merge,syncDecision,translate};
});
