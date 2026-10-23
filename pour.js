/* Conservative, depth-averaged surface film in game-scale units.
   Flux = mobility(thickness) * (tangential gravity - pressure gradient).
   Pressure includes hydrostatic head, curvature and contact-line wetting.
   No position-dependent drain channels or forced radial transport. */
(function(root,factory){const api=factory(typeof module==='object'?require('./core.js'):root.CakeCore);if(typeof module==='object'&&module.exports)module.exports=api;else root.CakePour=api;})(typeof globalThis!=='undefined'?globalThis:this,function(C){
'use strict';
const N=49,W=128,H=32,PORTION=600,STEP=1/60;
const viscosities={light:{name:'轻盈流动',spread:12,gravity:3,yield:.035},silky:{name:'丝滑奶盖',spread:7,gravity:1.4,yield:.07},thick:{name:'浓厚缓流',spread:3.4,gravity:.7,yield:.13}};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function boundary(shape){const pts=shape==='round'?Array.from({length:256},(_,i)=>({u:Math.cos(i*Math.PI/128),v:Math.sin(i*Math.PI/128)})):C.shapePoints[shape],segments=pts.map((a,i)=>{const b=pts[(i+1)%pts.length];return{a,b,length:Math.hypot(b.u-a.u,b.v-a.v)};}),total=segments.reduce((n,s)=>n+s.length,0),out=[];let j=0,start=0;for(let i=0;i<W;i++){const distance=i*total/W;while(j<segments.length-1&&start+segments[j].length<distance)start+=segments[j++].length;const s=segments[j],t=(distance-start)/s.length;out.push({u:s.a.u+(s.b.u-s.a.u)*t,v:s.a.v+(s.b.v-s.a.v)*t});}return out;}
function nearest(points,u,v){let best=0,dist=Infinity;for(let i=0;i<points.length;i++){const d=(points[i].u-u)**2+(points[i].v-v)**2;if(d<dist){dist=d;best=i;}}return best;}
function inside(shape,u,v){return C.onSurface('top',u,v,shape);}
function sample(a,w,h,x,y){x=clamp(x,0,w-1);y=clamp(y,0,h-1);const ix=Math.floor(x),iy=Math.floor(y),jx=Math.min(w-1,ix+1),jy=Math.min(h-1,iy+1),fx=x-ix,fy=y-iy;return (a[iy*w+ix]*(1-fx)+a[iy*w+jx]*fx)*(1-fy)+(a[jy*w+ix]*(1-fx)+a[jy*w+jx]*fx)*fy;}
class Film{
 constructor(cake,level,color,viscosity='silky',saved=null,batch=null){
  this.shape=cake.shape||'round';this.level=level;this.color=C.colorValue(color).toLowerCase();this.viscosity=viscosities[viscosity]?viscosity:'silky';this.rim=boundary(this.shape);this.size=C.layerSize(cake,level);const above=C.layerSize(cake,level+1);this.inner=level<cake.layers.length&&above<this.size?above/this.size:0;
  this.top=Float64Array.from(saved?.top||new Array(N*N).fill(0));this.side=Float64Array.from(saved?.side||new Array(W*H).fill(0));this.total=saved?.total||0;this.spilled=saved?.spilled||0;this.cost=saved?.cost||0;this.id=saved?.id||('pour-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2)));
  this.batch=batch??(Math.max(0,...(saved?.pigments||[]).map(p=>p.layer||0))+1);this.pigments=(saved?.pigments|| (saved?[{color:saved.color,top:saved.top,side:saved.side}]:[])).map(p=>this.makePigment(p.color,p));this.ensurePigment(this.color);this.replaces=saved?.replaces||[];
  this.mask=new Uint8Array(N*N);this.links=[];this.drains=[];this.delta=new Float64Array(N*N);this.sideDelta=new Float64Array(W*H);this.revision=0;this.outflow=new Float64Array(W);this.motion=0;this.topPressure=new Float64Array(N*N);this.sidePressure=new Float64Array(W*H);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){const u=x/(N-1)*2-1,v=y/(N-1)*2-1;this.mask[y*N+x]=inside(this.shape,u,v)&&(!this.inner||!inside(this.shape,u/this.inner,v/this.inner))?1:0;}
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){const i=y*N+x;if(!this.mask[i])continue;const u=x/(N-1)*2-1,v=y/(N-1)*2-1;let edges=0;for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,j=ny*N+nx;if(nx>=0&&nx<N&&ny>=0&&ny<N&&this.mask[j]){if(j>i)this.links.push([i,j]);}else if(!inside(this.shape,nx/(N-1)*2-1,ny/(N-1)*2-1))edges++;}if(edges)this.drains.push([i,nearest(this.rim,u,v),edges]);}
  // Rows span the side of the selected tier; gravity is scaled to its height.
  const tier=C.tiers(cake).find(t=>level>t.start&&level<=t.end);this.depth=cake.layers.slice(tier?.start||0,level).reduce((s,l)=>s+C.layerHeight(l),0);this.dx=360*this.size/8/(N-1);this.dy=Math.max(1,this.depth/H);this.sx=this.rim.reduce((s,r,i)=>{const n=this.rim[(i+1)%W];return s+Math.hypot(n.u-r.u,n.v-r.v)*180*this.size/8;},0)/W;this.topArea=this.dx*this.dx;this.sideArea=this.sx*this.dy;this.data={id:this.id,version:1,level,shape:this.shape,color:this.color,viscosity:this.viscosity,size:this.size,inner:this.inner,pigments:this.pigments,replaces:this.replaces,top:this.top,side:this.side,total:this.total,spilled:this.spilled,cost:this.cost,revision:0,heightScale:75/this.sideArea,topHeightScale:75/this.topArea};
 }
 makePigment(color,p={}){return{color:C.colorValue(color).toLowerCase(),layer:p.layer||0,top:Float64Array.from(p.top||new Array(N*N).fill(0)),side:Float64Array.from(p.side||new Array(W*H).fill(0)),dt:new Float64Array(N*N),ds:new Float64Array(W*H),out:new Float64Array(W)};}
 ensurePigment(color,layer=this.batch){color=C.colorValue(color).toLowerCase();let p=this.pigments.find(p=>p.color===color&&p.layer===layer);if(!p){p=this.makePigment(color,{layer});this.pigments.push(p);}return p;}
 transfer(from,i,to,j,volume){if(volume<0)return this.transfer(to,j,from,i,-volume);const total=this[from][i];if(volume<=0||total<=0)return;if(this.pigments.length===1){if(to==='out')this.pigments[0].out[j]+=volume;return;}for(const p of this.pigments){const q=volume*p[from][i]/total;p[from==='top'?'dt':'ds'][i]-=q;if(to==='out')p.out[j]+=q;else p[to==='top'?'dt':'ds'][j]+=q;}}
 // Conservative interfacial diffusion; no exchange across a dry boundary.
 diffuse(key,i,j,dt){if(this.pigments.length<2)return;const a=this[key][i],b=this[key][j];if(a<1e-7||b<1e-7)return;const rate={light:.075,silky:.018,thick:.004}[this.viscosity],q=Math.min(a,b)*rate*dt,delta=key==='top'?'dt':'ds';for(const p of this.pigments){const exchange=q*(p[key][i]/a-p[key][j]/b);p[delta][i]-=exchange;p[delta][j]+=exchange;}}
 inject(u,v,volume,mixture=null){if(!Number.isFinite(volume)||volume<=0||!inside(this.shape,u,v)||this.inner&&inside(this.shape,u/this.inner,v/this.inner))return 0;const cx=(u+1)*(N-1)/2,cy=(v+1)*(N-1)/2,parts=[];let sum=0;for(let y=Math.max(0,Math.floor(cy-2.5));y<=Math.min(N-1,Math.ceil(cy+2.5));y++)for(let x=Math.max(0,Math.floor(cx-2.5));x<=Math.min(N-1,Math.ceil(cx+2.5));x++){const i=y*N+x,weight=Math.exp(-((x-cx)**2+(y-cy)**2)/2);if(this.mask[i]){parts.push([i,weight]);sum+=weight;}}if(!sum)return 0;const components=mixture?.length?mixture:[[this.color,1]],norm=components.reduce((n,p)=>n+p[1],0);for(const [color,weight,layer]of components){const p=this.ensurePigment(color,layer??this.batch);for(const [i,w]of parts)p.top[i]+=volume*w/sum*weight/norm;}for(const [i,w]of parts)this.top[i]+=volume*w/sum;this.total+=volume;this.touch();return volume;}
 touch(){this.data.total=this.total;this.data.spilled=this.spilled;this.data.revision=++this.revision;}
 step(dt=STEP){if(!Number.isFinite(dt)||dt<=0)return;const duration=Math.min(.1,dt),steps=Math.ceil(duration/(STEP/3)-1e-8),h=duration/steps;this.outflow.fill(0);for(const p of this.pigments)p.out.fill(0);for(let i=0;i<steps;i++)this.advance(h);this.touch();}
 advance(dt){
  const v=viscosities[this.viscosity],viscosity=250/v.gravity,gravity=220,sigma=700,volumeScale=75;
  const a=this.top,b=this.side,d=this.delta,s=this.sideDelta,pt=this.topPressure,ps=this.sidePressure;
  const ht=volumeScale/this.topArea,hs=volumeScale/this.sideArea;
  const wet=h=>{const r=.7/(h+.7);return 48*(r*r*r-r*r);};
  // Pressure from local height and curvature; closed boundaries have zero
  // normal gradient. The contact potential retains a rounded wetting front.
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){const i=y*N+x;if(!this.mask[i])continue;const h=a[i]*ht;let lap=0;if(x>0&&this.mask[i-1])lap+=a[i-1]*ht-h;if(x<N-1&&this.mask[i+1])lap+=a[i+1]*ht-h;if(y>0&&this.mask[i-N])lap+=a[i-N]*ht-h;if(y<N-1&&this.mask[i+N])lap+=a[i+N]*ht-h;lap/=this.dx*this.dx;pt[i]=gravity*h-sigma*lap+wet(h);}
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x,h=b[i]*hs,l=b[y*W+(x+W-1)%W]*hs,r=b[y*W+(x+1)%W]*hs,u=b[Math.max(0,y-1)*W+x]*hs,down=b[Math.min(H-1,y+1)*W+x]*hs;ps[i]=-sigma*((l+r-2*h)/(this.sx*this.sx)+(u+down-2*h)/(this.dy*this.dy))+wet(h);}
  d.fill(0);s.fill(0);for(const p of this.pigments){p.dt.fill(0);p.ds.fill(0);}
  const mobility=h=>Math.pow(Math.max(0,h-v.yield*7),3)/(3*viscosity);
  const flux=(amountI,amountJ,hi,hj,drive,length,width)=>{const src=drive>=0?amountI:amountJ,m=Math.min(mobility((hi+hj)*.5),.012*Math.pow(Math.min(length,width),4)/(sigma*dt));return Math.sign(drive)*Math.min(src*.18,Math.abs(drive)*m*width/volumeScale*dt);};
  for(const [i,j]of this.links){const q=flux(a[i],a[j],a[i]*ht,a[j]*ht,(pt[i]-pt[j])/this.dx,this.dx,this.dx);d[i]-=q;d[j]+=q;this.transfer('top',i,'top',j,q);this.diffuse('top',i,j,dt);}
  // A local rounded rim retains a little head before it spills. Each edge
  // feeds the adjacent arc, with no snapping to predetermined drip slots.
  for(const [i,k,edges]of this.drains){const h=a[i]*ht,sideHead=b[k]*hs*.15,head=Math.max(0,h-sideHead-.75-v.yield*4),q=Math.min(a[i]*.16,Math.pow(head,3)*gravity/(3*viscosity)*this.dx/volumeScale*dt*edges);d[i]-=q;s[k]+=q*.5;s[(k+W-1)%W]+=q*.25;s[(k+1)%W]+=q*.25;this.transfer('top',i,'side',k,q*.5);this.transfer('top',i,'side',(k+W-1)%W,q*.25);this.transfer('top',i,'side',(k+1)%W,q*.25);}
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   const i=y*W+x,j=y*W+(x+1)%W,h=b[i]*hs;
   const q=flux(b[i],b[j],h,b[j]*hs,(ps[i]-ps[j])/this.sx,this.sx,this.dy);s[i]-=q;s[j]+=q;this.transfer('side',i,'side',j,q);this.diffuse('side',i,j,dt);
   if(y<H-1){const k=i+W,capillary=flux(b[i],b[k],h,b[k]*hs,(ps[i]-ps[k])/this.dy,this.dy,this.sx),fall=Math.min(b[i]*.18,mobility(h)*gravity*this.sx/volumeScale*dt),down=capillary+fall;s[i]-=down;s[k]+=down;this.transfer('side',i,'side',k,down);this.diffuse('side',i,k,dt);}
   else {const out=Math.min(b[i]*.18,mobility(h)*gravity*this.sx/volumeScale*dt);s[i]-=out;this.outflow[x]+=out;this.spilled+=out;this.transfer('side',i,'out',x,out);}
  }
  let change=0;for(let i=0;i<a.length;i++){a[i]+=d[i];change+=Math.abs(d[i]);}for(let i=0;i<b.length;i++){b[i]+=s[i];change+=Math.abs(s[i]);}
  if(this.pigments.length===1){this.pigments[0].top.set(a);this.pigments[0].side.set(b);}else for(const p of this.pigments){for(let i=0;i<a.length;i++)p.top[i]=Math.max(0,p.top[i]+p.dt[i]);for(let i=0;i<b.length;i++)p.side[i]=Math.max(0,p.side[i]+p.ds[i]);}
  this.motion=change/dt;
 }
 isSettled(){return this.motion<Math.max(.5,this.total*.01);}

 snapshot(extraCost=0){const round=v=>Math.round(Math.max(0,v)*1e6)/1e6;return{...this.data,pigments:this.pigments.map(p=>({color:p.color,layer:p.layer,top:Array.from(p.top,round),side:Array.from(p.side,round)})),top:Array.from(this.top,round),side:Array.from(this.side,round),total:round(this.total),spilled:round(this.spilled),cost:Math.round((this.cost+extraCost)*1e6)/1e6};}
 mass(){return this.top.reduce((a,b)=>a+b,0)+this.side.reduce((a,b)=>a+b,0)+this.spilled;}
}
// A cascade keeps one independent field per exposed tier. Only rim overflow
// is transferred: no material is created, teleported over a tier, or billed twice.
function mergeFilms(records){if(!records.length)return null;const first=records[0],out={...first,total:0,spilled:0,cost:0,top:new Float64Array(N*N),side:new Float64Array(W*H),pigments:[],replaces:records.map(p=>p.id)};const colors=new Map();for(const r of records){out.total+=r.total;out.spilled+=r.spilled;out.cost+=r.cost;for(const key of ['top','side'])for(let i=0;i<out[key].length;i++)out[key][i]+=r[key][i];for(const p of r.pigments||[{color:r.color,top:r.top,side:r.side}]){const color=p.color.toLowerCase(),layer=p.layer||0,key=color+':'+layer;let c=colors.get(key);if(!c){c={color,layer,top:new Float64Array(N*N),side:new Float64Array(W*H)};colors.set(key,c);}for(const key of ['top','side'])for(let i=0;i<c[key].length;i++)c[key][i]+=p[key][i];}}out.pigments=[...colors.values()];return out;}
 class Cascade{
 constructor(cake,level,color,viscosity='silky',saved=[]){
  const prior=saved.flatMap(r=>r.pigments||[{color:r.color,layer:0}]),last=Math.max(0,...prior.map(p=>p.layer||0)),batch=prior.length&&prior.filter(p=>(p.layer||0)===last).every(p=>p.color===C.colorValue(color).toLowerCase())?last:last+1;this.level=level;this.films=C.tiers(cake).filter(t=>t.end<=level).reverse().map(t=>new Film(cake,t.end,color,viscosity,mergeFilms(saved.filter(p=>p.level===t.end)),batch));
  if(!this.films.length||this.films[0].level!==level)throw Error('请从蛋糕外露的顶面开始淋');
  this.data=this.films.map(f=>f.data);this.transferred=0;
 }
 inject(u,v,volume){return this.films[0].inject(u,v,volume);}
 step(dt=STEP){let left=Math.min(.1,dt);while(left>1e-8){const h=Math.min(STEP,left);for(let i=0;i<this.films.length;i++){const f=this.films[i],below=this.films[i+1];if(f.total<=0)continue;f.step(h);if(!below)continue;const ratio=f.size/below.size;for(let x=0;x<W;x++){const q=f.outflow[x];if(q<=0)continue;const rim=f.rim[x];let received=0;for(const offset of [.012,.025,.04]){received=below.inject(rim.u*(ratio+offset),rim.v*(ratio+offset),q,f.pigments.map(p=>[p.color,p.out[x],p.layer]).filter(p=>p[1]>0));if(received)break;}if(received){f.spilled=Math.max(0,f.spilled-received);this.transferred+=received;}}f.touch();}left-=h;}}
 isSettled(){return this.films.every(f=>f.total<=0||f.isSettled());}
 snapshot(cost=0){return this.films.filter((f,i)=>i===0||f.total>0).map((f,i)=>f.snapshot(i===0?cost:0));}
 mass(){return this.films.reduce((s,f)=>s+f.mass(),0);}
}
return{Film,Cascade,N,W,H,PORTION,STEP,viscosities,boundary,sample};
});

