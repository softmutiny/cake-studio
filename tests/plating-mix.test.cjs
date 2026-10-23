const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../core'),P=require('../pour'),Pigment=require('../pigment');
const total=a=>a.reduce((s,n)=>s+n,0);
test('盘上摆盘只接受盘内、胚外落点；形状、颜色、删除及刷新保留',()=>{
 const g=new C.Game();g.setShape('heart');g.addLayer('vanilla');g.setPlate('rose');
 const o=g.addDecoration('berry',0,.85,{surface:'plate'});assert.equal(o.level,0);
 g.addStroke({surface:'plate',color:'#a4d6ef',style:'rose',size:14,points:[{u:0,v:.8},{u:.2,v:.8}]});
 assert.throws(()=>g.addDecoration('berry',0,0,{surface:'plate'}));assert.throws(()=>g.changeDecoration(o.id,{u:1.5}));
 const saved=C.copy(g.state);assert.ok(C.validate(saved));assert.deepEqual(new C.Game(saved).state,saved);
 g.setPlate('blue');assert.equal(g.draft.strokes.length,1);g.coat('#fff3d5',true);assert.equal(g.draft.strokes.length,1,'抹面不清掉盘上奶油');
 g.removeStroke(g.draft.strokes[0].id);assert.equal(g.stock('whipped'),14);g.undo();assert.equal(g.draft.strokes.length,1);
});
test('删除中间胚：上层和附件重新编号，移除附件退款，撤回完整恢复',()=>{
 const g=new C.Game();for(const size of[8,6,4])g.addLayer('vanilla','ivory',{size});
 g.addStroke({surface:'top',level:2,color:'#fff3d5',style:'round',size:12,points:[{u:0,v:.9}]});
 const kept=g.addDecoration('berry',0,0,{level:3}),removed=g.addDecoration('berry',0,.9,{level:2});
 g.addDecoration('berry',0,.85,{surface:'plate'});const before=C.copy(g.state);g.removeLayer(1);
 assert.deepEqual(g.draft.layers.map(l=>l.size),[8,4]);assert.equal(g.draft.decos.find(o=>o.id===kept.id).level,2);assert.ok(!g.draft.decos.some(o=>o.id===removed.id));assert.equal(g.draft.strokes.length,0);assert.equal(g.stock('whipped'),16);assert.ok(C.validate(g.state));g.undo();assert.deepEqual(g.state,before);
});
test('移除最底层后的无支撑夹心收回；最后一层删除不丢盘上作品',()=>{
 const g=new C.Game();g.addLayer('vanilla');g.addFilling('berryfill',0,0);g.addLayer('chocolate');g.addDecoration('berry',0,.85,{surface:'plate'});g.removeLayer(0);
 assert.equal(g.draft.layers.length,1);assert.equal(g.draft.layers[0].item,'chocolate');assert.equal(g.stock('berryfill'),3);g.removeLayer(0);assert.equal(g.draft.decos.length,1);assert.equal(g.draft.decos[0].surface,'plate');assert.ok(C.validate(g.state));
});
test('收藏蛋糕改名按 ID 更新，评分和作品内容不变，空名字被拒绝',()=>{
 const g=new C.Game();g.addLayer('vanilla');const cake=g.save('旧名字'),before=C.copy(cake);g.renameCake(cake.id,'  草莓的小宇宙  ');assert.equal(cake.name,'草莓的小宇宙');assert.deepEqual(cake.layers,before.layers);assert.deepEqual(cake.rating,before.rating);assert.throws(()=>g.renameCake(cake.id,' '));assert.equal(new C.Game(g.state).state.gallery[0].name,cake.name);
});
test('换色只改变接触处：旧色质量不变，远处颜色保持，厚层覆盖旧色',()=>{
 const g=new C.Game();g.addLayer('vanilla');const a=new P.Cascade(g.draft,1,'#ffe189');a.inject(-.6,0,60);a.inject(.6,0,60);g.commitGlazes(a.snapshot(.2),.2);
 const before=C.copy(g.state),b=new P.Cascade(g.draft,1,'#a4d6ef','silky',g.draft.glazes);b.inject(-.6,0,60);const f=b.films[0],left=24*49+10,right=24*49+38;
 assert.deepEqual(Array.from(f.pigments.find(p=>p.color==='#ffe189').top),before.draft.glazes[0].pigments[0].top);assert.deepEqual(Pigment.at(f.data,'top',right),[255,225,137]);const mixed=Pigment.at(f.data,'top',left);assert.ok(mixed[2]>mixed[1]&&mixed[1]>mixed[0],'厚的新蓝色应覆盖旧黄底');
 for(let i=0;i<90;i++)b.step();for(const key of['top','side'])for(let i=0;i<f[key].length;i++)assert.ok(Math.abs(f.pigments.reduce((s,p)=>s+p[key][i],0)-f[key][i])<1e-8);
 g.commitGlazes(b.snapshot(.1),.1);assert.equal(g.draft.glazes.length,1);assert.equal(g.stock('whipped'),15.7);assert.ok(C.validate(g.state));assert.deepEqual(new C.Game(g.state).state,g.state);g.undo();assert.deepEqual(g.state,before);
});
test('多笔旧版单色奶盖升级时守恒合并，未接触的颜色不被覆盖',()=>{
 const g=new C.Game();g.addLayer('vanilla');for(const [color,u]of[['#ec687c',-.5],['#a4d6ef',.5]]){const f=new P.Film(g.draft,1,color);f.inject(u,0,60);const p=f.snapshot(.1);delete p.pigments;g.commitGlaze(p,.1);}
 const f=new P.Cascade(g.draft,1,'#fff3d5','silky',g.draft.glazes);f.inject(0,.5,60);g.commitGlazes(f.snapshot(.1),.1);assert.equal(g.draft.glazes.length,1);assert.equal(g.draft.glazes[0].pigments.length,3);assert.equal(g.stock('whipped'),15.7);assert.ok(C.validate(g.state));
 const bad=C.copy(g.state);bad.draft.glazes[0].pigments[0].top[0]=20;assert.equal(C.validate(bad),false);
});
test('混合奶盖跨层流动时携带颜料比例，质量守恒',()=>{
 const g=new C.Game();for(const size of[8,6,4])g.addLayer('vanilla','ivory',{size});const sim=new P.Cascade(g.draft,3,'#ec687c');
 for(let i=0;i<360;i++){if(i<180)sim.films[0].inject(0,.94,4,[['#ec687c',1],['#a4d6ef',1]]);sim.step();}
 assert.ok(sim.films[1].total>1);for(const f of sim.films)for(const key of['top','side']){const red=f.pigments.find(p=>p.color==='#ec687c'),blue=f.pigments.find(p=>p.color==='#a4d6ef');if(!blue)continue;assert.ok(Math.abs(total(red[key])-total(blue[key]))<1e-7);}assert.ok(Math.abs(sim.mass()-720)<1e-6);assert.ok(sim.snapshot(1.2).every(p=>C.validGlaze(p,3)));
});
test('删除瀑布源头层按实际存留用量退款，下层奶盖不变成免费材料',()=>{
 const g=new C.Game();g.addLayer('vanilla');g.addLayer('vanilla','ivory',{size:6});const lower=new P.Film(g.draft,1,'#fff3d5'),upper=new P.Film(g.draft,2,'#fff3d5');lower.inject(0,.9,60);upper.inject(0,0,60);g.commitGlazes([lower.snapshot(0),upper.snapshot(.2)],.2);const before=C.copy(g.state);g.removeLayer(1);assert.equal(g.stock('whipped'),15.9);assert.equal(g.draft.glazes.length,1);assert.equal(g.draft.glazes[0].cost,.1);assert.equal(g.draft.glazes[0].inner,0);g.undo();assert.deepEqual(g.state,before);
});
