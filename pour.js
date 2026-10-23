/* A conservative surface-film model: local pressure spreads the top film;
   rim outflow feeds a gravity-driven side film. A yield threshold arrests
   thin cream. No preset drip lengths or random drip sprites are used. */
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
 constructor(cake,level,color,viscosity='silky',saved=null){
  this.shape=cake.shape||'round';this.level=level;this.color=C.colorValue(color);this.viscosity=viscosities[viscosity]?viscosity:'silky';this.rim=boundary(this.shape);this.size=C.layerSize(cake,level);const above=C.layerSize(cake,level+1);this.inner=level<cake.layers.length&&above<this.size?above/this.size:0;
  this.top=Float64Array.from(saved?.top||new Array(N*N).fill(0));this.side=Float64Array.from(saved?.side||new Array(W*H).fill(0));this.total=saved?.total||0;this.spilled=saved?.spilled||0;this.cost=saved?.cost||0;this.id=saved?.id||('pour-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2)));
  this.mask=new Uint8Array(N*N);this.links=[];this.drains=[];this.delta=new Float64Array(N*N);this.sideDelta=new Float64Array(W*H);this.revision=0;this.outflow=new Float64Array(W);this.wetting=Float64Array.from({length:W},(_,x)=>{const t=x/W*Math.PI*2;return 1+.28*Math.sin(t*11+.7)+.18*Math.sin(t*17+1.3)+.09*Math.cos(t*7);});
  // Capillary collection along a slightly uneven rim feeds nearby wetting
  // maxima. This redistributes real outgoing volume into narrow rivulets.
  this.channels=Array.from({length:W},(_,x)=>{let best=x;for(let d=-5;d<=5;d++){const k=(x+d+W)%W;if(this.wetting[k]>this.wetting[best])best=k;}return best;});
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){const u=x/(N-1)*2-1,v=y/(N-1)*2-1;this.mask[y*N+x]=inside(this.shape,u,v)&&(!this.inner||!inside(this.shape,u/this.inner,v/this.inner))?1:0;}
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){const i=y*N+x;if(!this.mask[i])continue;const u=x/(N-1)*2-1,v=y/(N-1)*2-1;let edges=0;for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,j=ny*N+nx;if(nx>=0&&nx<N&&ny>=0&&ny<N&&this.mask[j]){if(j>i)this.links.push([i,j]);}else if(!inside(this.shape,nx/(N-1)*2-1,ny/(N-1)*2-1))edges++;}if(edges)this.drains.push([i,nearest(this.rim,u,v),edges]);}
  // Rows span the side of the selected tier; gravity is scaled to its height.
  const tier=C.tiers(cake).find(t=>level>t.start&&level<=t.end);this.depth=cake.layers.slice(tier?.start||0,level).reduce((s,l)=>s+C.layerHeight(l),0);this.data={id:this.id,version:1,level,shape:this.shape,color:this.color,viscosity:this.viscosity,size:this.size,inner:this.inner,top:this.top,side:this.side,total:this.total,spilled:this.spilled,cost:this.cost,revision:0};
 }
 inject(u,v,volume){if(!Number.isFinite(volume)||volume<=0||!inside(this.shape,u,v)||this.inner&&inside(this.shape,u/this.inner,v/this.inner))return 0;const cx=(u+1)*(N-1)/2,cy=(v+1)*(N-1)/2,parts=[];let sum=0;for(let y=Math.max(0,Math.floor(cy-2.5));y<=Math.min(N-1,Math.ceil(cy+2.5));y++)for(let x=Math.max(0,Math.floor(cx-2.5));x<=Math.min(N-1,Math.ceil(cx+2.5));x++){const i=y*N+x,weight=Math.exp(-((x-cx)**2+(y-cy)**2)/2);if(this.mask[i]){parts.push([i,weight]);sum+=weight;}}if(!sum)return 0;for(const [i,w]of parts)this.top[i]+=volume*w/sum;this.total+=volume;this.touch();return volume;}
 touch(){this.data.total=this.total;this.data.spilled=this.spilled;this.data.revision=++this.revision;}
 step(dt=STEP){if(!Number.isFinite(dt)||dt<=0)return;let left=Math.min(.1,dt);while(left>1e-8){const h=Math.min(STEP,left);this.advance(h);left-=h;}this.touch();}
 advance(dt){const p=viscosities[this.viscosity],a=this.top,d=this.delta;d.fill(0);
  // Each cell has at most four outgoing links. Per-link limiting keeps flux
  // positive and conserves volume without a frame-rate-dependent clamp loss.
  for(const [i,j]of this.links){const diff=a[i]-a[j],from=diff>0?i:j,to=diff>0?j:i,drive=Math.max(0,Math.abs(diff)-p.yield*.3),mobility=Math.min(5,.7+(a[i]+a[j])*.32),q=Math.min(a[from]*.19,drive*.2,drive*p.spread*mobility*dt);d[from]-=q;d[to]+=q;}
  for(let i=0;i<a.length;i++)a[i]+=d[i];
  if(this.inner){d.fill(0);for(let y=1;y<N-1;y++)for(let x=1;x<N-1;x++){const i=y*N+x;if(!this.mask[i]||a[i]<p.yield)continue;const dx=x-(N-1)/2,dy=y-(N-1)/2,n=Math.hypot(dx,dy),q=Math.min(a[i]*.22,Math.max(0,a[i]-p.yield)*dt*(this.viscosity==='thick'?2:6));if(!n)continue;for(const [j,w]of [[i+Math.sign(dx),Math.abs(dx)/n],[i+Math.sign(dy)*N,Math.abs(dy)/n]]){if(this.mask[j]){const v=q*w*.7;d[i]-=v;d[j]+=v;}}}for(let i=0;i<a.length;i++)a[i]+=d[i];}
  for(const [i,k,edges]of this.drains){const q=Math.min(a[i]*.35,Math.max(0,a[i]-p.yield)*dt*4*edges);a[i]-=q;const channel=this.channels[k];this.side[channel]+=q*.72;this.side[(channel+W-1)%W]+=q*.14;this.side[(channel+1)%W]+=q*.14;}
  const b=this.side,s=this.sideDelta;s.fill(0);this.outflow.fill(0);const gravity=p.gravity*24*clamp(80/this.depth,.35,1.5);
  // Local wetting variation seeds channels. Thick streams move faster; weak
  // lateral leveling preserves separate fingers instead of ironing a curtain.
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   const i=y*W+x,j=y*W+(x+1)%W,diff=b[i]-b[j],from=diff>0?i:j,to=diff>0?j:i;
   const q=Math.min(b[from]*.1,Math.max(0,Math.abs(diff)-p.yield*.5)*dt*.45);s[from]-=q;s[to]+=q;
   const h=b[i],mobile=Math.max(0,h-p.yield*.55),speed=gravity*this.wetting[x]*(.13+Math.min(4,mobile*mobile*.7)),flow=Math.min(h*.72,mobile*speed*dt);
   s[i]-=flow;if(y<H-1)s[i+W]+=flow;else{this.outflow[x]+=flow;this.spilled+=flow;}
  }
  for(let i=0;i<b.length;i++)b[i]+=s[i];
 }
 snapshot(extraCost=0){const round=v=>Math.round(Math.max(0,v)*1e6)/1e6;return{...this.data,top:Array.from(this.top,round),side:Array.from(this.side,round),total:round(this.total),spilled:round(this.spilled),cost:Math.round((this.cost+extraCost)*1e6)/1e6};}
 mass(){return this.top.reduce((a,b)=>a+b,0)+this.side.reduce((a,b)=>a+b,0)+this.spilled;}
}
// A cascade keeps one independent field per exposed tier. Only rim overflow
// is transferred: no material is created, teleported over a tier, or billed twice.
class Cascade{
 constructor(cake,level,color,viscosity='silky',saved=[]){
  this.level=level;this.films=C.tiers(cake).filter(t=>t.end<=level).reverse().map(t=>new Film(cake,t.end,color,viscosity,saved.findLast(p=>p.level===t.end&&p.color===C.colorValue(color)&&p.viscosity===viscosity)));
  if(!this.films.length||this.films[0].level!==level)throw Error('请从蛋糕外露的顶面开始淋');
  this.data=this.films.map(f=>f.data);this.transferred=0;
 }
 inject(u,v,volume){return this.films[0].inject(u,v,volume);}
 step(dt=STEP){let left=Math.min(.1,dt);while(left>1e-8){const h=Math.min(STEP,left);for(let i=0;i<this.films.length;i++){const f=this.films[i],below=this.films[i+1];if(f.total<=0)continue;f.step(h);if(!below)continue;const ratio=f.size/below.size;for(let x=0;x<W;x++){const q=f.outflow[x];if(q<=0)continue;const rim=f.rim[x];let received=0;for(const offset of [.055,.085,.12]){received=below.inject(rim.u*(ratio+offset),rim.v*(ratio+offset),q);if(received)break;}if(received){f.spilled=Math.max(0,f.spilled-received);this.transferred+=received;}}f.touch();}left-=h;}}
 snapshot(cost=0){return this.films.filter((f,i)=>i===0||f.total>0).map((f,i)=>f.snapshot(i===0?cost:0));}
 mass(){return this.films.reduce((s,f)=>s+f.mass(),0);}
}
return{Film,Cascade,N,W,H,PORTION,STEP,viscosities,boundary,sample};
});

