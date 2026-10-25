const {test}=require('node:test'),assert=require('node:assert/strict'),P=require('../piping');
test('奶盖后台只允许一个在途任务，合并最新状态并可回退',()=>{
 const vm=require('node:vm'),fs=require('node:fs');let worker,events=0,closed=0;const sent=[];
 const window={dispatchEvent(){events++;}},ctx={window,Event:class{},OffscreenCanvas:class{},Worker:class{constructor(){worker=this}postMessage(x){sent.push(structuredClone(x))}terminate(){this.stopped=true}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../pour-preview.js'),'utf8'),ctx);const get=window.CakePourPreview.get,p={revision:1},g={x:0,y:0,rx:180,ry:68,height:48,shape:'round',view:'perspective'};
 assert.ok(get(p,g,1.5).pending);p.revision=2;get(p,g,1.5);assert.equal(sent.length,1);
 const bitmap=()=>({close(){closed++}});worker.onmessage({data:{id:sent[0].id,revision:1,result:{top:{canvas:bitmap()},side:{canvas:bitmap()}}}});get(p,g,1.5);assert.equal(sent.length,2);assert.equal(sent[1].p.revision,2);assert.equal(events,1);
 worker.onerror();assert.equal(get(p,g,1.5),null);assert.equal(closed,2);assert.ok(worker.stopped);
});
test('增量奶油尾部与完整计算一致：绕圈、停留、跨断点、承托',()=>{
 const base={size:20,style:'round',flowVersion:1,points:[]};P.feed(base,{u:0,v:0},.12);const initial=new Map();P.mesh(base,initial);
 const s={size:16,style:'round',flowVersion:1,points:[]},field=new Map(initial),stream={};
 for(let i=0;i<160;i++){const a=i*.17;P.feed(s,i>90&&i<110?{u:0,v:0}:{u:Math.cos(a)*.2,v:Math.sin(a)*.2,break:i===120},1/60);const actual=P.mesh(s,field,stream),expected=P.mesh(s,new Map(initial));assert.deepEqual(actual,expected,'第 '+i+' 次出料');}
});

test('异形转盘的动态轮廓随奶盖任务发给后台，避免后台缺少旋转形状',()=>{const vm=require('node:vm'),fs=require('node:fs'),C=require('../core'),sent=[],window={dispatchEvent(){}},context={window,CakeCore:C,Event:class{},OffscreenCanvas:class{},Worker:class{postMessage(m){sent.push(m)}}};vm.runInNewContext(fs.readFileSync(require.resolve('../pour-preview.js'),'utf8'),context);const g=new C.Game();g.setShape('heart');g.addLayer('vanilla');const d=C.Turntable.display(C,g.draft,1);window.CakePourPreview.get({revision:1},{x:380,y:400,rx:180,ry:68,height:48,view:'perspective',shape:d.shape},1);assert.equal(sent.length,1);assert.ok(sent[0].g.polygon.length>100);assert.deepEqual(sent[0].g.polygon,C.shapePoints[d.shape]);});
