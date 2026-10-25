const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../core'),P=require('../piping');
const pos=(u,v=0,level=1,surface='top')=>({u,v,level,surface});
function stroke(g,points=[{u:-.65,v:0},{u:0,v:0},{u:.65,v:0}],surface='top',level=g.draft.layers.length){g.addStroke({style:'round',flowVersion:1,tip:true,color:'#ffffff',size:16,surface,level,points:points.map(p=>({...p,q:80}))});return g.draft.strokes.at(-1);}
test('局部抹面只改变接触区，重复经过更平，原作品和新挤的奶油互不污染',()=>{
 const g=new C.Game();g.addLayer('vanilla');const s=stroke(g),path=[pos(-.7),pos(-.3)];g.smoothLocal('#fff3d5',path);
 const left=C.polishAmount(g.draft,s,{u:-.5,v:0});assert.ok(left>.1&&left<.95);assert.equal(C.polishAmount(g.draft,s,{u:.5,v:0}),0);assert.equal(g.draft.layers[0].finish,undefined);
 g.smoothLocal('#fff3d5',path);assert.ok(C.polishAmount(g.draft,s,{u:-.5,v:0})>left);
 const newStroke=stroke(g);assert.equal(C.polishAmount(g.draft,newStroke,{u:-.5,v:0}),0);
 assert.equal(C.polishAmount(g.draft,s,{u:.5,v:0}),0);assert.ok(C.validate(g.state));
 const saved=JSON.stringify(g.state),preview=C.polishPreview(g.draft);C.polishMove(preview,'#f7b4c3',pos(.3),pos(.7));assert.equal(JSON.stringify(g.state),saved);
 const restored=new C.Game(JSON.parse(saved));assert.deepEqual(restored.state,g.state);g.undo();g.undo();assert.equal(C.polishAmount(g.draft,s,{u:-.5,v:0}),left);g.redo();assert.ok(C.polishAmount(g.draft,s,{u:-.5,v:0})>left);
});
test('顶面、侧面和多层隔离，侧面记录固定到实际胚层，叠胚后不拉伸',()=>{
 const g=new C.Game();g.addLayer('vanilla');g.addLayer('chocolate');const s=stroke(g,[{u:0,v:.3},{u:0,v:.8}],'side');
 g.smoothLocal('#f7b4c3',[pos(-.2,.8,2,'side'),pos(.2,.8,2,'side')]);assert.ok(g.draft.layers[0].polish);assert.equal(g.draft.layers[1].polish,undefined);
 assert.equal(C.polishAmount(g.draft,s,{u:0,v:.2}),0);assert.ok(C.polishAmount(g.draft,s,{u:0,v:.8})>.1);
 const lower=JSON.stringify(g.draft.layers[0].polish);g.addLayer('tea','ivory',{size:4});
 assert.equal(JSON.stringify(g.draft.layers[0].polish),lower);assert.equal(g.draft.layers[2].polish,undefined);
});
test('间断路径不跨空气补线，心形凹口和被上层遮住的区域不落笔',()=>{
 const g=new C.Game();g.setShape('heart');g.addLayer('vanilla');g.addLayer('chocolate','ivory',{size:4});
 g.smoothLocal('#fff3d5',[pos(-.6),null,pos(.6),pos(.68)]);assert.equal(g.draft.layers[1].polish,undefined);assert.ok(g.draft.layers[0].polish);
 const b=g.draft.layers[0].polish[0];assert.equal(C.polishSample(b,0,0),0);assert.equal(C.polishSample(b,-.8,0),0);
});
test('抹刀压低真实圆口高度，新奶油的支撑场也跟着降低',()=>{
 const s={size:16,style:'round',flowVersion:1,surface:'top',points:[{u:0,v:0,q:2000}]};
 const normal=P.mesh(s),field=new Map(),flat=P.mesh({...s,polishAt:()=>.8},field);assert.ok(flat[0].h<normal[0].h*.21);assert.equal(flat[0].flat,.8);assert.ok(Math.max(...[...field.values()].map(v=>v.h))<normal[0].h*.21);
});
test('侧面抹刀跨过同尺寸胚层接缝保持连续，不生成硬切边',()=>{
 const g=new C.Game();g.addLayer('vanilla');g.addLayer('chocolate');const s=stroke(g,[{u:0,v:.3},{u:0,v:.7}],'side');
 g.smoothLocal('#fff3d5',[pos(-.2,.5,2,'side'),pos(.2,.5,2,'side')]);assert.ok(g.draft.layers.every(l=>l.polish?.length));
 const a=C.polishAmount(g.draft,s,{u:0,v:.4999}),b=C.polishAmount(g.draft,s,{u:0,v:.5001});assert.ok(a>.1);assert.ok(Math.abs(a-b)<.01);
});
test('一键抹面清除局部痕迹，装饰保护、非法路径与坏字段拒绝写入',()=>{
 const g=new C.Game();g.addLayer('vanilla');g.smoothLocal('#fff3d5',[pos(-.5),pos(.5)]);g.coat('pink',true);assert.equal(g.draft.layers[0].polish,undefined);
 g.addDecoration('flower',0,0);assert.throws(()=>g.smoothLocal('pink',[pos(-.5),pos(.5)]),/装饰/);assert.throws(()=>g.smoothLocal('pink',[pos(NaN),pos(.5)]),/轨迹/);
 const bad=JSON.parse(JSON.stringify(g.state));bad.draft.layers[0].polish=[{surface:'top',color:'pink',targets:[],revision:1,cells:{'99999':255}}];assert.equal(C.validate(bad),false);
});

