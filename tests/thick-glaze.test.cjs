const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),C=require('../core'),P=require('../pour'),Pigment=require('../pigment');
const total=a=>a.reduce((s,n)=>s+n,0);
function cake(){const g=new C.Game();g.addLayer('vanilla');return g;}
function base(viscosity){const g=cake(),f=new P.Film(g.draft,1,'#ffe189',viscosity);for(let i=0;i<f.top.length;i++)if(f.mask[i]){f.top[i]=.4;f.pigments[0].top[i]=.4;}f.total=total(f.top);return{g,f};}
test('新色厚处保持蓝色，薄边呈现渐变；再次用旧色不重染远处',()=>{
 const {g,f}=base('thick');g.commitGlazes([f.snapshot(1)],1);const a=new P.Cascade(g.draft,1,'#a4d6ef','thick',g.draft.glazes);a.inject(0,0,35);const center=24*49+24,edge=center+3;
 assert.deepEqual(Pigment.at(a.data[0],'top',center),[164,214,239]);const e=Pigment.at(a.data[0],'top',edge);assert.ok(e[1]>e[0]&&e[1]>e[2],'接触薄边保留一点黄蓝晕染');
 g.commitGlazes(a.snapshot(.1),.1);const before=Pigment.at(g.draft.glazes[0],'top',center),b=new P.Cascade(g.draft,1,'#ffe189','thick',g.draft.glazes);b.inject(.7,0,35);assert.deepEqual(Pigment.at(b.data[0],'top',center),before);assert.equal(b.data[0].pigments.filter(p=>p.color==='#ffe189').length,2);
 const saved=b.snapshot(.1);g.commitGlazes(saved,.1);assert.ok(C.validate(g.state));assert.deepEqual(new C.Game(g.state).draft.glazes,g.draft.glazes);
});
test('接触面的颜料扩散守恒，浓厚款比轻盈款缓慢',()=>{
 const measurements=[];
 for(const viscosity of ['light','thick']){const g=cake(),f=new P.Film(g.draft,1,'#ffe189',viscosity),other=f.ensurePigment('#a4d6ef',2),i=24*49+24,j=i+1;f.top[i]=f.top[j]=1;f.pigments[0].top[i]=1;other.top[j]=1;f.diffuse('top',i,j,1);assert.ok(Math.abs(f.pigments.reduce((n,p)=>n+p.dt[i],0))<1e-12);assert.ok(Math.abs(other.dt[i]+other.dt[j])<1e-12);measurements.push(other.dt[i]);}
 assert.ok(measurements[0]>measurements[1]*10);
});
test('旧混色存档仍按原混色显示；有叠淋顺序的颜色刷新保持',()=>{
 const {g,f}=base('silky'),p=f.snapshot();delete p.pigments[0].layer;const blue={color:'#a4d6ef',top:p.top.map(v=>v/2),side:p.side.map(v=>v/2)};p.pigments[0].top=p.top.map(v=>v/2);p.pigments.push(blue);const color=Pigment.at(p,'top',1200);assert.ok(color[1]>color[0]&&color[1]>color[2]);g.commitGlazes([{...p,cost:.1}],.1);assert.deepEqual(Pigment.at(new C.Game(g.state).draft.glazes[0],'top',1200),color);
});
test('抹面后叠同尺寸或小尺寸新胚：旧壳保留，新胚裸露，删除退款和前进完整',()=>{
 for(const size of [8,6]){const g=cake();g.coat('pink');g.addLayer('chocolate','ivory',{size});assert.equal(g.draft.coat,null);assert.equal(g.draft.layers[0].coating,'pink');assert.equal(g.draft.layers[1].coating,undefined);assert.equal(C.section(g.draft).rows[0].coating,'pink');assert.equal(C.section(g.draft).rows[1].coating,null);const before=C.copy(g.state);g.removeLayer(0);assert.equal(g.stock('whipped'),0);assert.ok(g.undo());assert.deepEqual(g.state,before);assert.ok(g.redo());assert.equal(g.draft.layers[0].item,'chocolate');assert.ok(C.validate(g.state));}
});
test('前进恢复库存、附件与奶盖；新操作清空分支，失败操作不丢前进',()=>{
 const g=cake(),f=new P.Cascade(g.draft,1,'#a4d6ef');f.inject(0,0,60);g.commitGlazes(f.snapshot(.1),.1);const snapshot=C.copy(g.state);g.undo();assert.equal(g.draft.glazes.length,0);assert.throws(()=>g.addLayer('missing'));assert.equal(g.future.length,1);assert.ok(g.redo());assert.deepEqual(g.state,snapshot);g.undo();g.setPlate('blue');assert.equal(g.future.length,0);assert.equal(g.redo(),false);g.undo();g.redo();g.save('前进的小蛋糕');assert.equal(g.future.length,0);assert.equal(g.history.length,0);
});
test('宽屏、窄屏、顶视、多层和夸张平移都保留完整蛋糕边界，投影可逆',()=>{
 const window={};vm.runInNewContext(fs.readFileSync(require.resolve('../renderer'),'utf8'),{window,CakeCore:C,Image:class{},document:{createElement(){}}});const A=window.CakeArt,g=cake();g.addLayer('chocolate','ivory',{size:6});g.addDecoration('berry',0,0);
 for(const [width,height]of [[620,360],[340,340],[1100,500]])for(const view of ['top','perspective'])for(const zoom of [1,2.6]){const canvas={id:'cake-canvas',getBoundingClientRect:()=>({left:0,top:0,width,height})},c=A.setView(canvas,g.draft,{view,zoom,panX:9999,panY:-9999}),b=c.bounds;assert.ok(b.left*c.scale+c.tx>=15.9);assert.ok(b.right*c.scale+c.tx<=c.frameWidth-15.9);assert.ok(b.top*c.scale+c.ty>=15.9);assert.ok(b.bottom*c.scale+c.ty<=624.1);const p=A.project({u:.2,v:0},A.geometry(g.draft,2,view)),screen={clientX:(p.x*c.scale+c.tx)*height/640,clientY:(p.y*c.scale+c.ty)*height/640},hit=A.surfacePoint(canvas,g.draft,screen,'top');assert.ok(Math.abs(hit.u-.2)<1e-8);}
});
