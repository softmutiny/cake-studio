const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const Core=require('../core.js');
test('真实手势计时：原地持续挤、越界暂停、回来续挤，松手收尖且撤回完整',()=>{
 const h=setup();h.click({item:'vanilla'});h.click({tool:'pipe'});const p=h.point(380,390);h.callbacks['#cake-canvas:pointerdown'](p);for(let i=0;i<60;i++)h.advance(1000/60);h.callbacks['#cake-canvas:pointermove'](h.point(900,-100));for(let i=0;i<60;i++)h.advance(1000/60);h.callbacks['#cake-canvas:pointermove'](p);for(let i=0;i<60;i++)h.advance(1000/60);h.callbacks['#cake-canvas:pointerup'](p);const s=h.state().draft.strokes[0],mass=s.points.reduce((n,p)=>n+p.q,0);assert.equal(s.flowVersion,1);assert.equal(s.tip,true);assert.ok(s.points.some(p=>p.break));assert.ok(Math.abs(mass/require('../piping.js').rate(16)-2.035)<.03);assert.ok(Core.validate(h.state()));h.callbacks['document:keydown']({key:'z',ctrlKey:true,target:{tagName:'BODY'},preventDefault(){}});assert.equal(h.state().draft.strokes.length,0);
});
function setup(){
 let clock=0;const callbacks={},nodes=new Map(),store=new Map(),frames=[];
 const element=id=>{if(!nodes.has(id))nodes.set(id,{id,style:{},classList:{add(){},remove(){},toggle(){}},textContent:'',innerHTML:'',scrollTop:0,addEventListener(type,fn){callbacks[id+':'+type]=fn;},getBoundingClientRect(){return{left:0,top:0,width:760,height:640}},focus(){},setPointerCapture(){},hasPointerCapture(){return true},releasePointerCapture(){},setAttribute(){}});return nodes.get(id)};
 const document={querySelector:s=>element(s),querySelectorAll:()=>[],addEventListener(type,fn){callbacks['document:'+type]=fn;},body:{classList:{add(){},remove(){}}}};
 const context={CakeCore:Core,CakePiping:require('../piping.js'),CakePour:require('../pour.js'),document,location:{search:'?test=1'},URLSearchParams,localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},requestAnimationFrame:fn=>frames.push(fn),setTimeout:()=>1,clearTimeout(){},Image:class{},window:{addEventListener(){}},performance:{now:()=>clock},console};
 vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../renderer.js'),'utf8'),context);context.CakeArt=context.window.CakeArt;context.CakeArt.draw=()=>{};
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),context);
 const click=dataset=>callbacks['document:click']({target:{closest:()=>({dataset})}}),point=(x,y)=>({button:0,buttons:1,pointerId:1,clientX:x,clientY:y,preventDefault(){}});
 return{advance(ms){clock+=ms;for(const fn of frames.splice(0))fn(clock);},callbacks,click,point,store,frames,nodes,art:context.CakeArt,state:()=>JSON.parse(store.get('cake-studio-test-v2'))};
}
test('触摸绘制只跟随起笔手指，第二根手指不会截断或另起奶油笔画',()=>{
 const h=setup();h.click({item:'vanilla'});h.click({tool:'pipe'});
 const emit=(type,x,id=1,primary=true)=>h.callbacks['#cake-canvas:'+type]({...h.point(x,390),pointerId:id,isPrimary:primary,pointerType:'touch'});
 emit('pointerdown',300);emit('pointermove',330);emit('pointerdown',450,2,false);emit('pointermove',470,2,false);emit('pointerup',470,2,false);
 assert.equal(h.state().draft.strokes.length,0);emit('pointermove',350);emit('pointerup',370);
 assert.equal(h.state().draft.strokes.length,1);assert.equal(h.state().inventory.whipped,undefined);assert.ok(h.state().draft.strokes[0].points.every(p=>p.u<.1));
});
test('系统取消触摸后保存已画笔画，下一次手指仍能正常起笔',()=>{
 const h=setup();h.click({item:'vanilla'});h.click({tool:'pipe'});h.callbacks['#cake-canvas:pointerdown'](h.point(300,390));h.callbacks['#cake-canvas:pointermove'](h.point(330,390));h.callbacks['#cake-canvas:pointercancel'](h.point(330,390));
 h.callbacks['#cake-canvas:pointerdown']({...h.point(400,390),pointerId:7});h.callbacks['#cake-canvas:pointerup']({...h.point(430,390),pointerId:7});assert.equal(h.state().draft.strokes.length,2);
});
test('左栏重复点击取消选中，撤回后可用两种快捷键前进',()=>{
 const h=setup();h.click({item:'vanilla'});h.click({layer:'0'});assert.equal(h.nodes.get('#delete-layer').disabled,false);h.click({layer:'0'});assert.equal(h.nodes.get('#delete-layer').disabled,true);
 const key=(key,extra={})=>h.callbacks['document:keydown']({key,ctrlKey:true,target:{tagName:'BODY'},preventDefault(){},...extra});
 key('z');assert.equal(h.state().draft.layers.length,0);key('z',{shiftKey:true});assert.equal(h.state().draft.layers.length,1);key('z');key('y');assert.equal(h.state().draft.layers.length,1);assert.equal(h.nodes.get('#redo-btn').disabled,true);
});
test('真实盘上手势：侧边摆装饰和连续奶油，底部图层可删除并整步撤回',()=>{
 const h=setup();h.click({item:'vanilla'});h.click({plate:'blue'});h.click({category:'decoration'});h.click({surface:'plate'});h.click({item:'berry'});h.callbacks['#cake-canvas:pointerdown'](h.point(589,450));assert.equal(h.state().draft.decos[0].surface,'plate');assert.equal(h.state().draft.decos[0].level,0);
 h.click({tool:'pipe'});h.callbacks['#cake-canvas:pointerdown'](h.point(589,450));h.callbacks['#cake-canvas:pointermove'](h.point(589,460));h.callbacks['#cake-canvas:pointerup'](h.point(589,464));assert.equal(h.state().draft.strokes[0].surface,'plate');assert.ok(h.state().draft.strokes[0].points.length>=2);
 h.click({layer:'0'});h.callbacks['document:keydown']({key:'Delete',target:{tagName:'BODY'},preventDefault(){}});assert.equal(h.state().draft.layers.length,0);assert.equal(h.state().draft.decos.length,1);h.callbacks['document:keydown']({key:'z',ctrlKey:true,target:{tagName:'BODY'},preventDefault(){}});assert.equal(h.state().draft.layers.length,1);assert.ok(Core.validate(h.state()));
});
test('颜色输入框切换会提交前一壶；下一次点淋保留旧色与旧用量',()=>{
 const h=setup();h.click({item:'vanilla'});h.click({tool:'pour'});const p=h.point(340,390);h.callbacks['#cake-canvas:pointerdown'](p);for(let i=1;i<=30;i++)for(const fn of h.frames.splice(0))fn(i*1000/60);h.callbacks['#cake-canvas:pointerup'](p);
 h.callbacks['document:input']({target:{id:'cream-color',value:'#a4d6ef'}});const before=h.state().draft.glazes[0],old=before.pigments[0];assert.ok(old.top.some(n=>n>0));h.callbacks['#cake-canvas:pointerdown'](h.point(450,390));for(let i=1;i<=30;i++)for(const fn of h.frames.splice(0))fn(i*1000/60);h.callbacks['#cake-canvas:pointerup'](h.point(450,390));h.click({tool:'move'});const after=h.state().draft.glazes[0];assert.equal(after.pigments.length,2);assert.equal(after.pigments[0].color,old.color);assert.ok(after.pigments[0].top.some(n=>n>0));assert.ok(after.pigments[1].top.some(n=>n>0));assert.ok(Core.validate(h.state()));
});
test('真实指针处理器：同一次按住画 100 圈、短暂越界返回，松开才保存为一笔',()=>{
 const h=setup();h.click({item:'vanilla'});h.click({tool:'pipe'});h.callbacks['#cake-canvas:pointerdown'](h.point(500,402));
 for(let i=1;i<=24000;i++){const a=i/240*Math.PI*2;h.callbacks['#cake-canvas:pointermove'](h.point(380+120*Math.cos(a),402+40*Math.sin(a)));}
 // Moving far outside is clamped, and returning continues the same captured gesture.
 h.callbacks['#cake-canvas:pointermove'](h.point(900,-100));h.callbacks['#cake-canvas:pointermove'](h.point(480,402));
 assert.equal(h.state().draft.strokes.length,0);h.callbacks['#cake-canvas:pointerup'](h.point(480,402));
 const s=h.state();assert.equal(s.draft.strokes.length,1);assert.equal(s.inventory.whipped,undefined);assert.ok(s.draft.strokes[0].points.length>1200);assert.ok(Core.validate(s));assert.equal(h.frames.length,2,'one pending draw frame and one extrusion clock');
 h.click({page:'gallery'});assert.equal(h.state().draft.strokes.length,1);
});
test('夹心按落点保存，无圆盘数据；同层可多勺，撤回一勺恢复库存',()=>{const g=new Core.Game();g.addLayer('vanilla');g.addFilling('berryfill',-.4,.2);g.addFilling('berryfill',.3,-.2);assert.equal(g.draft.layers.length,2);assert.equal(g.draft.layers[1].pieces.length,2);assert.equal(g.draft.layers[1].pieces[0].u,-.4);g.undo();assert.equal(g.draft.layers[1].pieces.length,1);assert.equal(g.stock('berryfill'),0);g.addLayer('tea');assert.equal(g.draft.layers[1].pieces.length,1);assert.ok(Core.validate(g.state));});
test('旧版数量数据不再补发，已有草稿完整保留',()=>{const old=Core.initial();old.version=2;for(const k of Object.keys(require('../catalog.js')))delete old.inventory[k];old.inventory.whipped=7;old.draft.layers=[{item:'vanilla',kind:'base'}];assert.ok(Core.validate(old));const g=new Core.Game(old);assert.equal(g.stock('whipped'),7);assert.equal(g.stock('silvercatcandle'),0);g.addDecoration('silvercatcandle',0,0);const again=new Core.Game(g.state);assert.equal(again.stock('silvercatcandle'),0);assert.equal(again.draft.decos[0].item,'silvercatcandle');});

test('同层混合水果与饼干，不凭空增高或挪动已有果肉',()=>{const g=new Core.Game();g.addLayer('vanilla');g.addFilling('berryfill',-.2,0);g.addFilling('cookiefill',.3,.2);assert.equal(g.draft.layers.length,2);assert.deepEqual(g.draft.layers[1].pieces.map(p=>p.item),['berryfill','cookiefill']);assert.equal(g.draft.layers[1].height,16);assert.ok(Core.validate(g.state));});

test('裸胚真实指针入口可点放无限装饰；切换分类不会继续执行抹刀',()=>{const h=setup();h.click({item:'vanilla'});h.click({tool:'smooth'});h.click({category:'decoration'});h.click({item:'silvercatcandle'});h.callbacks['#cake-canvas:pointerdown'](h.point(380,390));assert.equal(h.state().draft.coat,null);assert.equal(h.state().draft.decos.length,1);assert.equal(h.state().inventory.silvercatcandle,undefined);assert.equal(h.nodes.get('#selection-controls').hidden,false);});
test('夹心越密越撑高，局部堆叠保留，几何和绘制使用同一高度',()=>{const h=setup(),g=new Core.Game();g.state.inventory.berryfill=24;g.addLayer('vanilla');g.addFilling('berryfill',0,.5);const small=h.art.layerHeight(g.draft.layers[1]);for(let i=0;i<12;i++)g.addFilling('berryfill',(i%3-1)*.1,.5);const l=g.draft.layers[1];assert.ok(h.art.layerHeight(l)>small+20);assert.ok(h.art.fillingLayout(l).at(-1).z>0);g.addLayer('vanilla');assert.equal(h.art.geometry(g.draft).height,96+h.art.layerHeight(l));});
test('连续奶油圈重叠会升高；同一笔的邻近采样不虚增到顶',()=>{const h=setup(),g={x:380,y:350,rx:180,ry:68,height:100};const line={size:16,color:'#fff3d5',style:'round',surface:'top',points:Array.from({length:1000},(_,i)=>({u:-.7+i/999*1.4,v:0}))};const flat=h.art.creamSamples(line,g);assert.ok(Math.max(...flat.map(p=>p.z))<1);const loops={...line,points:Array.from({length:1200},(_,i)=>({u:.5*Math.cos(i/120*Math.PI*2),v:.5*Math.sin(i/120*Math.PI*2)}))};const raised=h.art.creamSamples(loops,g);assert.ok(raised.at(-1).z>0);assert.ok(Math.max(...raised.map(p=>p.z))<=6);const field=new Map();h.art.creamSamples(line,g,field);assert.ok(h.art.creamSamples({...line},g,field)[100].z>0,'separate strokes also stack');});

test('填料时落点留在支撑胚上，不随夹心越堆越高而漂走',()=>{const h=setup(),g=new Core.Game();g.state.inventory.berryfill=24;g.addLayer('vanilla');const canvas={getBoundingClientRect:()=>({left:0,top:0,width:760,height:640})},before=h.art.surfacePoint(canvas,g.draft,h.point(380,410),'filling');for(let i=0;i<15;i++)g.addFilling('berryfill',0,.3);const after=h.art.surfacePoint(canvas,g.draft,h.point(380,410),'filling');assert.deepEqual({u:after.u,v:after.v,surface:after.surface},{u:before.u,v:before.v,surface:before.surface});});
test('增量挤奶油只产出新段，累计高度和整笔相近',()=>{const h=setup(),g={x:380,y:350,rx:180,ry:68,height:100},s={size:16,surface:'top',points:[]},field=new Map(),stream={};let samples=0;for(let i=0;i<1200;i++){s.points.push({u:.5*Math.cos(i/120*Math.PI*2),v:.5*Math.sin(i/120*Math.PI*2)});samples+=h.art.creamSamples(s,g,field,stream).length;}assert.ok(samples<4000);assert.ok(stream.z>0&&stream.z<=6);assert.equal(stream.count,1200);});

test('离开蛋糕暂停出料，返回仍是一笔且不连起空中缺口',()=>{const h=setup();h.click({item:'vanilla'});h.click({tool:'pipe'});h.callbacks['#cake-canvas:pointerdown'](h.point(300,390));h.callbacks['#cake-canvas:pointermove'](h.point(330,390));h.callbacks['#cake-canvas:pointermove'](h.point(900,-100));h.callbacks['#cake-canvas:pointermove'](h.point(460,390));h.callbacks['#cake-canvas:pointerup'](h.point(490,390));const s=h.state().draft.strokes[0];assert.equal(h.state().draft.strokes.length,1);assert.ok(s.points.some(p=>p.break));assert.ok(s.points.every(p=>p.u*p.u+p.v*p.v<1));const input=JSON.stringify(s.points);Core.compactPoints(s.points);assert.equal(JSON.stringify(s.points),input);const pts=h.art.creamSamples(s,{x:380,y:390,rx:180,ry:68,height:48});assert.ok(pts.some(p=>p.break));assert.ok(!pts.some(p=>p.x>350&&p.x<440));});

test('裸蛋糕顶层为散夹心时，裱花仍落在支撑胚表面而非悬空层顶',()=>{const h=setup(),g=new Core.Game();g.state.inventory.berryfill=20;g.addLayer('tea');const before=h.art.geometry(g.draft);for(let i=0;i<15;i++)g.addFilling('berryfill',0,.2);assert.equal(h.art.geometry(g.draft).y,before.y);assert.equal(h.art.geometry(g.draft).height,before.height);g.addLayer('vanilla');assert.ok(h.art.geometry(g.draft).y<before.y-48);});

 test('实际指针选择心形，凹口拒绝裱花而花瓣不作整体裁切',()=>{const h=setup();h.click({shape:'heart'});h.click({item:'tarobase'});h.click({tool:'pipe'});h.callbacks['#cake-canvas:pointerdown'](h.point(380,342));h.callbacks['#cake-canvas:pointerup'](h.point(380,342));assert.equal(h.state().draft.strokes.length,0);h.callbacks['#cake-canvas:pointerdown'](h.point(470,342));h.callbacks['#cake-canvas:pointerup'](h.point(470,342));assert.equal(h.state().draft.strokes.length,1);const g={x:380,y:390,rx:180,ry:68,height:48,shape:'heart'},s={size:16,surface:'top',points:[{u:-.5,v:-.7},{u:.5,v:-.7}]},pts=h.art.creamSamples(s,g);assert.ok(pts.some(p=>p.break));assert.ok(!pts.some(p=>Math.abs(p.x-380)<30));let clips=0;const ctx=new Proxy({clip(){clips++;}},{get:(t,k)=>t[k]||(()=>{})});h.art.drawStroke(ctx,{...s,style:'rose',color:'#fff3d5'},g);assert.equal(clips,0);h.art.drawStroke(ctx,{...s,style:'round',color:'#fff3d5'},g);assert.equal(clips,1);});
 test('形状与花嘴切换不改布局，超过旧奶油数量仍能继续挤',()=>{const h=setup();h.click({item:'vanilla'});for(let i=0;i<80;i++){h.click({tool:'pipe'});h.callbacks['#cake-canvas:pointerdown'](h.point(380,390));h.callbacks['#cake-canvas:pointerup'](h.point(380,390));}assert.equal(h.state().draft.strokes.length,80);assert.equal(h.state().inventory.whipped,undefined);h.callbacks['#cake-canvas:pointerdown'](h.point(380,390));h.callbacks['#cake-canvas:pointerup'](h.point(380,390));assert.equal(h.state().draft.strokes.length,81);assert.equal(h.nodes.get('#selection-controls').hidden,false);});


test('真实奶壶手势：持续出料、越界暂停、松手续流、保存和整次撤回',()=>{
 const h=setup();h.click({item:'vanilla'});h.click({tool:'pour'});h.callbacks['#cake-canvas:pointerdown'](h.point(380,435));
 function frame(now){const pending=h.frames.splice(0);for(const fn of pending)fn(now);}
 for(let i=1;i<=60;i++)frame(i*1000/60);
 h.callbacks['#cake-canvas:pointermove'](h.point(900,-100));for(let i=61;i<=90;i++)frame(i*1000/60);
 h.callbacks['#cake-canvas:pointermove'](h.point(390,435));for(let i=91;i<=120;i++)frame(i*1000/60);
 h.callbacks['#cake-canvas:pointerup'](h.point(390,435));for(let i=121;i<=610;i++)frame(i*1000/60);
 const state=h.state();assert.equal(state.draft.glazes.length,1);assert.ok(state.draft.glazes[0].total>190&&state.draft.glazes[0].total<215);assert.deepEqual(state.inventory,{});assert.ok(Core.validate(state));
 h.callbacks['document:keydown']({key:'z',ctrlKey:true,target:{tagName:'BODY'},preventDefault(){}});assert.equal(h.state().draft.glazes.length,0);assert.equal(h.state().inventory.whipped,undefined);
});
test('真实多层奶壶手势：三层瀑布一次提交和撤回，固定步长完成接力',()=>{const h=setup();for(const size of[8,6,4]){h.click({size:String(size)});h.click({item:'vanilla'});}h.click({tool:'pour'});const g=h.art.geometry(h.state().draft),p=h.point(g.x,g.y+g.ry*.94);h.callbacks['#cake-canvas:pointerdown'](p);function frame(now){for(const fn of h.frames.splice(0))fn(now);}for(let i=1;i<=420;i++)frame(i*1000/60);h.callbacks['#cake-canvas:pointerup'](p);for(let i=421;i<=1800;i++)frame(i*1000/60);const state=h.state();assert.equal(state.draft.glazes.length,3);assert.ok(state.draft.glazes.find(x=>x.level===1).total>80);assert.ok(Core.validate(state));assert.deepEqual(state.inventory,{});h.callbacks['document:keydown']({key:'z',ctrlKey:true,target:{tagName:'BODY'},preventDefault(){}});assert.equal(h.state().draft.glazes.length,0);assert.equal(h.state().inventory.whipped,undefined);});
