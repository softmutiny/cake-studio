(function(){
'use strict';
// One in-flight job; waiting jobs hold references to the newest simulation state.
// The renderer uses the previous completed image until the next one arrives.
let worker=null,failed=false,inFlight=null,serial=0;
const records=new WeakMap(),pending=new Map(),recent=[];
function fail(){failed=true;worker?.terminate();worker=null;inFlight=null;pending.clear();for(const r of recent)dispose(r);recent.length=0;window.dispatchEvent(new Event('cake-pour-ready'));}
function dispose(r){for(const key of ['top','side'])r.result?.[key]?.canvas.close();r.result=null;r.revision=-1;}
function launch(){
 if(inFlight||failed||!pending.size)return;
 const [id,r]=pending.entries().next().value;pending.delete(id);inFlight=r;
 try{worker.postMessage({id,p:r.p,g:r.g,scale:r.scale});}catch{fail();}
}
function ensure(){
 if(failed)return false;if(worker)return true;
 if(typeof Worker==='undefined'||typeof OffscreenCanvas==='undefined'){failed=true;return false;}
 try{worker=new Worker('pour-worker.js?v=0.24.2');worker.onerror=fail;worker.onmessage=({data})=>{
  const r=inFlight;inFlight=null;if(data.error){fail();return;}
  if(!r||r.id!==data.id){for(const v of Object.values(data.result||{}))v?.canvas.close();launch();return;}
  dispose(r);r.result=data.result;r.revision=data.revision;
  const i=recent.indexOf(r);if(i>=0)recent.splice(i,1);recent.push(r);while(recent.length>12)dispose(recent.shift());
  window.dispatchEvent(new Event('cake-pour-ready'));launch();
 };return true;}catch{fail();return false;}
}
function get(p,g,scale){
 if(!ensure())return null;
 let map=records.get(p);if(!map){map=new Map();records.set(p,map);}
 const key=[g.x,g.y,g.rx,g.ry,g.tierHeight||g.height,g.view,scale].join(':');let r=map.get(key);
 if(!r){r={id:++serial,p,g:{x:g.x,y:g.y,rx:g.rx,ry:g.ry,height:g.height,tierHeight:g.tierHeight,shape:g.shape,view:g.view,...(typeof CakeCore!=='undefined'&&CakeCore.shapePoints[g.shape]?{polygon:CakeCore.shapePoints[g.shape]}:{})},scale,revision:-1,result:null};map.set(key,r);if(map.size>8){const first=map.keys().next().value,old=map.get(first);dispose(old);pending.delete(old.id);map.delete(first);}}
 if(r.revision!==(p.revision||0)&&inFlight!==r){pending.set(r.id,r);while(pending.size>12)pending.delete(pending.keys().next().value);launch();}
 return {pending:true,...r.result};
}
window.CakePourPreview={get};
})();
