const test=require('node:test'),assert=require('node:assert/strict'),core=require('../core.js'),m=require('../cloud-model.js');
const id='custom_00000000-0000-4000-8000-000000000001';
test('自定义配件元数据不会注入 HTML、URL 或覆盖内置材料',()=>{
 const a=m.asset({id,name:'<猫&"咪>',size:[80,90],anchor:.9,url:'javascript:evil'});assert.equal(a.name,'猫咪');assert.equal(a.url,undefined);
 assert.throws(()=>m.asset({...a,id:'vanilla'}));assert.throws(()=>m.asset({...a,size:[Infinity,80]}));assert.throws(()=>m.manifest([a,a]));
});
test('自定义装饰收藏刷新、撤回和库存验证保持兼容',()=>{
 const g=new core.Game(),a=m.asset({id,name:'小猫糖片',size:[80,90],anchor:.9});g.state.customAssets=[a];core.registerAssets([a]);g.addLayer('vanilla');g.addDecoration(id,0,0);assert(core.validate(g.state));g.undo();assert.equal(g.draft.decos.length,0);g.redo();const saved=g.save('我的猫猫蛋糕');assert.equal(saved.decos[0].item,id);const loaded=new core.Game(g.state);assert.equal(loaded.state.gallery[0].decos[0].item,id);
});
test('合并保留两份不同草稿，相同收藏不重复，原数据不变',()=>{
 const a=new core.Game(),b=new core.Game();a.addLayer('vanilla');b.addLayer('chocolate');a.save('香草');b.state.gallery=core.copy(a.state.gallery);a.addLayer('tea');const original=core.copy(a.state),merged=m.merge(a.state,b.state,()=> 'conflict-id');assert.equal(merged.gallery.length,2);assert.equal(merged.gallery[1].layers[0].item,'chocolate');assert.deepEqual(a.state,original);assert(core.validate(merged));
});
test('同编号不同作品保留为另一版本，超过容量时整体拒绝而非截断',()=>{
 const a=new core.Game();a.addLayer('vanilla');a.save('旧名字');const b=core.copy(a.state);b.gallery[0].name='新名字';const merged=m.merge(a.state,b,()=> 'another-id');assert.equal(merged.gallery.length,2);assert.notEqual(merged.gallery[0].id,merged.gallery[1].id);a.state.gallery=Array.from({length:24},(_,i)=>({...a.state.gallery[0],id:String(i)}));assert.throws(()=>m.merge(a.state,b),/24/);assert.equal(a.state.gallery.length,24);
});
test('离线编辑遇到云端新版本必须停下来解决，不能直接覆盖',()=>{
 const local={cake:'local'},remote={revision:3,state:{cake:'remote'}};assert.equal(m.syncDecision(local,{dirty:true,revision:2},remote),'conflict');assert.equal(m.syncDecision(local,{dirty:true,revision:3},remote),'push');assert.equal(m.syncDecision(local,{dirty:false,revision:2},remote),'pull');assert.equal(m.syncDecision(local,{dirty:true,revision:2},{revision:3,state:local}),'equal');assert.equal(m.syncDecision(local,{dirty:true,revision:0},null),'push');
});
test('数据库 JSONB 调换键顺序不应产生冲突或重复导入，数组顺序仍有效',()=>{
 const local={version:3,draft:{name:'蛋糕',layers:[{kind:'base',item:'vanilla'}]},gallery:[]};const remote={gallery:[],draft:{layers:[{item:'vanilla',kind:'base'}],name:'蛋糕'},version:3};assert(m.same(local,remote));assert.equal(m.syncDecision(local,{revision:1,dirty:true},{revision:2,state:remote}),'equal');assert(!m.same([1,2],[2,1]));
 const a=new core.Game(),b=new core.Game();a.addLayer('vanilla');b.addLayer('chocolate');const once=m.merge(a.state,b.state,()=> 'first');const twice=m.merge(once,b.state,()=> 'second');assert.equal(once.gallery.length,twice.gallery.length);
});
