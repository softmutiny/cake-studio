(function(){
'use strict';
const cache=new WeakMap(),maps=new Map(),{N,W,H,boundary}=CakePour;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
// Positive cubic B-spline reconstruction removes cell corners without changing
// the simulation or saved amounts. Four samples per cell retain subpixel rims.
function field(source,w,h,heightScale,wrap=false){
 if(wrap){let a=Float32Array.from(source);for(let pass=0;pass<6;pass++){const b=new Float32Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)b[y*w+x]=a[Math.max(0,y-1)*w+x]*.25+a[y*w+x]*.5+a[Math.min(h-1,y+1)*w+x]*.25;a=b;}source=a;}
 const factor=4,sw=wrap?w*factor:(w-1)*factor+1,sh=(h-1)*factor+1,tmp=new Float32Array(sw*h),heights=new Float32Array(sw*sh),amount=new Float32Array(sw*sh);
 const weights=t=>[(1-t)**3/6,(3*t**3-6*t*t+4)/6,(-3*t**3+3*t*t+3*t+1)/6,t**3/6];
 for(let x=0;x<sw;x++){const f=x/factor,k=Math.floor(f),a=weights(f-k);for(let y=0;y<h;y++){let v=0;for(let j=0;j<4;j++){let ix=k+j-1;ix=wrap?(ix+w)%w:clamp(ix,0,w-1);v+=source[y*w+ix]*a[j];}tmp[y*sw+x]=v;}}
 for(let y=0;y<sh;y++){const f=y/factor,k=Math.floor(f),a=weights(f-k);for(let x=0;x<sw;x++){let v=0;for(let j=0;j<4;j++)v+=tmp[clamp(k+j-1,0,h-1)*sw+x]*a[j];const i=y*sw+x;amount[i]=v;if(heightScale)heights[i]=12*(1-Math.exp(-v*heightScale/12));}}
 if(!heightScale)return {w:sw,h:sh,amount,wrap};
 let minX=sw,maxX=0,minY=sh,maxY=0;for(let y=0;y<sh;y++)for(let x=0;x<sw;x++)if(amount[y*sw+x]>.008){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}return {w:sw,h:sh,heights,amount,wrap,minX,maxX,minY,maxY};
}
function at(f,a,x,y){x=f.wrap?(x%f.w+f.w)%f.w:clamp(x,0,f.w-1);y=clamp(y,0,f.h-1);const ix=Math.floor(x),iy=Math.floor(y),jx=f.wrap?(ix+1)%f.w:Math.min(ix+1,f.w-1),jy=Math.min(iy+1,f.h-1),u=x-ix,v=y-iy;return(a[iy*f.w+ix]*(1-u)+a[iy*f.w+jx]*u)*(1-v)+(a[jy*f.w+ix]*(1-u)+a[jy*f.w+jx]*u)*v;}
function tintFields(p,key){const pigments=(p.pigments||[]).filter(c=>c[key].some(v=>v>1e-8));if(pigments.length<2)return {rgb:pigments.length?[1,3,5].map(i=>parseInt(pigments[0].color.slice(i,i+2),16)):null};const source=p[key];let uniform=null,same=true;for(let i=0;i<source.length;i++){if(source[i]<.0001)continue;const ratio=CakePigment.weights(p,key,i).map(c=>c[0]+Math.round(c[1]*128));if(!uniform)uniform=ratio;else if(ratio.some((v,j)=>v!==uniform[j])){same=false;break;}}if(same&&uniform){const i=source.findIndex(v=>v>=.0001);return{rgb:CakePigment.at(p,key,i)};}const channels=Array.from({length:3},()=>new Float32Array(source.length));for(let i=0;i<source.length;i++){if(source[i]<1e-9)continue;const rgb=CakePigment.at(p,key,i);for(let k=0;k<3;k++)channels[k][i]=rgb[k]*source[i];}return {channels:channels.map(c=>field(c,key==='top'?N:W,key==='top'?N:H,0,key==='side'))};}
 function tintAt(a,key,f,x,y,amount){const t=a[key+'Tint'];if(t?.channels)return t.channels.map(c=>at(c,c.amount,x,y)/Math.max(amount,1e-9));return t?.rgb||a.rgb;}
 function assets(p){let a=cache.get(p);if(!a||a.revision!==(p.revision||0)){a={revision:p.revision||0,top:field(p.top,N,N,p.topHeightScale||1),side:field(p.side,W,H,p.heightScale||1,true),topTint:tintFields(p,'top'),sideTint:tintFields(p,'side'),rim:boundary(p.shape),rgb:[1,3,5].map(i=>parseInt(p.color.slice(i,i+2),16)),projections:new Map()};cache.set(p,a);}return a;}
function records(d,options){const live=options.pour;if(!live)return d.glazes||[];const list=Array.isArray(live)?live:[live],ids=new Set(list.flatMap(p=>[p.id,...(p.replaces||[])]));return [...(d.glazes||[]).filter(p=>!ids.has(p.id)),...list];}
function quality(options){return options.pour?clamp(1.5*(options.zoom||1),1.5,3):clamp(1.5*(options.zoom||1),2,4);}
function paint(im,i,rgb,nx,ny,nz,amount){
 const length=Math.hypot(nx,ny,nz)||1;nx/=length;ny/=length;nz/=length;
 const diffuse=Math.max(0,-nx*.44+ny*.26+nz*.86),shine=Math.max(0,-nx*.22+ny*.47+nz*.855)**22;
 const light=.76+.25*diffuse,highlight=shine*19,alpha=smooth((amount-.012)/.07);
 for(let k=0;k<3;k++)im[i+k]=clamp(rgb[k]*light+highlight,0,255);im[i+3]=Math.round(alpha*255);
}
function canvas(w,h){const c=document.createElement('canvas');c.width=Math.ceil(w);c.height=Math.ceil(h);return c;}
function topImage(a,p,g,scale){
 const key=['top',g.rx,g.ry,scale].join(':');if(a.projections.has(key))return a.projections.get(key);
 const pad=16,c=canvas((2*g.rx+pad*2)*scale,(2*g.ry+pad*2)*scale),ctx=c.getContext('2d'),im=ctx.createImageData(c.width,c.height),f=a.top,tilt=Math.sqrt(Math.max(0,1-(g.ry/g.rx)**2)),cell=g.rx*2/(f.w-1);
 // Project smooth surface strips back-to-front. Front strips overwrite folds;
 // unlike fixed-point inversion, a steep mound cannot leave an empty hole.
 for(let x=0;x<c.width;x++){const u=((x+.5)/scale-pad-g.rx)/g.rx,fx=(u+1)*(f.w-1)/2;if(Math.abs(u)>1||fx<f.minX-1||fx>f.maxX+1)continue;
 for(let row=Math.max(0,f.minY-1);row<Math.min(f.h-1,f.maxY+1);row++){const v0=row/(f.h-1)*2-1,v1=(row+1)/(f.h-1)*2-1,h0=at(f,f.heights,fx,row),h1=at(f,f.heights,fx,row+1),y0=(pad+g.ry+v0*g.ry-h0*tilt)*scale,y1=(pad+g.ry+v1*g.ry-h1*tilt)*scale;
 if(Math.abs(y1-y0)<1e-8)continue;const from=Math.max(0,Math.ceil(Math.min(y0,y1)-.5)),to=Math.min(c.height-1,Math.floor(Math.max(y0,y1)-.5));
 for(let y=from;y<=to;y++){const fy=row+(y+.5-y0)/(y1-y0),v=fy/(f.h-1)*2-1,amount=at(f,f.amount,fx,fy);if(amount<.012||!CakeCore.onSurface('top',u,v,p.shape)||(p.inner&&CakeCore.onSurface('top',u/p.inner,v/p.inner,p.shape)))continue;const dx=(at(f,f.heights,fx+1,fy)-at(f,f.heights,fx-1,fy))/(cell*2),dy=(at(f,f.heights,fx,fy+1)-at(f,f.heights,fx,fy-1))/(cell*2);paint(im.data,(y*c.width+x)*4,tintAt(a,'top',f,fx,fy,amount),-dx,-dy,1,amount);}
 }}ctx.putImageData(im,0,0);const result={canvas:c,x:g.x-g.rx-pad,y:g.y-g.ry-pad,scale};a.projections.set(key,result);return result;
}
function rimMap(a,g){const key=[g.shape,g.rx].join(':');if(maps.has(key))return maps.get(key);const size=2049,map=[];
 for(let k=0;k<size;k++){const u=k/(size-1)*2-1;let v=-Infinity,arc=0;
 for(let i=0;i<W;i++){const r=a.rim[i],n=a.rim[(i+1)%W],du=n.u-r.u;if(Math.abs(du)<1e-9)continue;const t=(u-r.u)/du;if(t<0||t>1)continue;const candidate=r.v+(n.v-r.v)*t;if(candidate>v){v=candidate;arc=i+t;}}
 // Smooth polygon normals across segment boundaries, including square corners.
 const ix=Math.floor(arc)%W,t=arc-Math.floor(arc);function normal(i){const before=a.rim[(i+W-1)%W],after=a.rim[(i+1)%W],len=Math.hypot(after.u-before.u,after.v-before.v)||1;return {x:(after.v-before.v)/len,y:-(after.u-before.u)/len};}const n=normal(ix),m=normal((ix+1)%W),nx=n.x*(1-t)+m.x*t,nv=n.y*(1-t)+m.y*t,len=Math.hypot(nx,nv)||1;map.push({u,v,arc,nx:nx/len,nv:nv/len});
 }const first=map.find(r=>Number.isFinite(r.v)),last=map.findLast(r=>Number.isFinite(r.v));if(first&&last)for(let i=0;i<map.length;i++)if(!Number.isFinite(map[i].v))map[i]=i<map.length/2?first:last;if(maps.size>=16)maps.delete(maps.keys().next().value);maps.set(key,map);return map;
}
function sideImage(a,p,g,scale){
 const height=g.tierHeight||g.height,key=['side',g.rx,g.ry,height,scale].join(':');if(a.projections.has(key))return a.projections.get(key);
 const pad=18,c=canvas((2*g.rx+pad*2)*scale,(height+2*g.ry+pad*2)*scale),ctx=c.getContext('2d'),im=ctx.createImageData(c.width,c.height),f=a.side,map=rimMap(a,g),tilt=Math.sqrt(1-(g.ry/g.rx)**2),lip=8,stepDown=height/(f.h-1),perimeter=a.rim.reduce((s,r,i)=>{const n=a.rim[(i+1)%W];return s+Math.hypot(n.u-r.u,n.v-r.v)*g.rx;},0),stepArc=perimeter/f.w;
 const sin=new Float32Array(f.h),cos=new Float32Array(f.h),peak=new Float32Array(f.w),ys=new Float32Array(f.h);for(let y=0;y<f.h;y++){const angle=Math.min(1,y*stepDown/lip)*Math.PI/2;sin[y]=Math.sin(angle);cos[y]=Math.cos(angle);for(let x=0;x<f.w;x++)peak[x]=Math.max(peak[x],f.heights[y*f.w+x]);}
 for(let x=0;x<c.width;x++){const screenX=(x+.5)/scale-pad-g.rx;let u=screenX/g.rx;if(Math.abs(u)>1+12/g.rx)continue;
 let r=map[Math.round(clamp((u+1)/2,0,1)*(map.length-1))],fx=r.arc/W*f.w;if(!Number.isFinite(r.v))continue;const maxH=peak[Math.floor(fx)%f.w];if(maxH<.01)continue;
 u=(screenX-r.nx*maxH*.5)/g.rx;if(Math.abs(u)>1)continue;r=map[Math.round((u+1)/2*(map.length-1))];fx=r.arc/W*f.w;
 const topH=at(a.top,a.top.heights,(r.u+1)*(a.top.w-1)/2,(r.v+1)*(a.top.h-1)/2);
 for(let j=0;j<f.h;j++){const bulge=at(f,f.heights,fx,j);ys[j]=(pad+g.ry+r.v*g.ry+j*stepDown+r.nv*bulge*sin[j]*g.ry/g.rx-topH*cos[j]*tilt)*scale;if(j)ys[j]=Math.max(ys[j-1]+.001,ys[j]);}
 let row=0;const from=Math.max(0,Math.ceil(ys[0]-scale*.8-.5)),to=Math.min(c.height-1,Math.floor(ys[f.h-1]-.5));for(let y=from;y<=to;y++){while(row<f.h-2&&ys[row+1]<y+.5)row++;const fy=Math.max(0,row+(y+.5-ys[row])/(ys[row+1]-ys[row])),amount=at(f,f.amount,fx,fy);if(amount<.012)continue;
 const da=(at(f,f.heights,fx+1,fy)-at(f,f.heights,fx-1,fy))/(2*stepArc),dd=(at(f,f.heights,fx,fy+1)-at(f,f.heights,fx,fy-1))/(2*stepDown),t=fy-row,round=sin[row]*(1-t)+sin[row+1]*t,up=cos[row]*(1-t)+cos[row+1]*t;
 paint(im.data,(y*c.width+x)*4,tintAt(a,'side',f,fx,fy,amount),r.nx*round+r.nv*da,r.nv*round-r.nx*da,up+dd*round,amount);
 }}ctx.putImageData(im,0,0);const result={canvas:c,x:g.x-g.rx-pad,y:g.y-g.ry-pad,scale};a.projections.set(key,result);return result;
}
function composite(ctx,r,shadow){ctx.save();ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';if(shadow){ctx.shadowColor='#6b432d35';ctx.shadowBlur=3;ctx.shadowOffsetY=1.5;}ctx.drawImage(r.canvas,r.x,r.y,r.canvas.width/r.scale,r.canvas.height/r.scale);ctx.restore();}
function preview(p,g,options){return options.asyncPour&&options.pour&&window.CakePourPreview?.get(p,g,quality(options));}
function prior(d,p){return (d.glazes||[]).filter(old=>old.level===p.level&&(old.id===p.id||(p.replaces||[]).includes(old.id)));}
function top(ctx,d,level,g,options){for(const p of records(d,options)){if(p.level!==level||p.total<=0)continue;const live=preview(p,g,options);if(live){if(live.top)composite(ctx,live.top,true);else for(const old of prior(d,p))composite(ctx,topImage(assets(old),old,g,quality(options)),true);}else composite(ctx,topImage(assets(p),p,g,quality(options)),true);}}
function side(ctx,d,level,g,options){if(g.view==='top')return;for(const p of records(d,options)){if(p.level!==level||p.total<=0)continue;const live=preview(p,g,options);if(live){if(live.side)composite(ctx,live.side,false);else for(const old of prior(d,p))composite(ctx,sideImage(assets(old),old,g,quality(options)),false);}else composite(ctx,sideImage(assets(p),p,g,quality(options)),false);}}
function bake(p,g,scale){const a=assets(p);return {top:topImage(a,p,g,scale),side:g.view==='top'?null:sideImage(a,p,g,scale)};}

function jug(ctx,p,color,flowing,flow=1){ctx.save();if(flowing){ctx.strokeStyle=color;ctx.lineCap='round';ctx.lineWidth=3+flow*3;ctx.beginPath();ctx.moveTo(p.x-6,p.y-79);ctx.bezierCurveTo(p.x-1,p.y-60,p.x,p.y-30,p.x,p.y);ctx.stroke();ctx.strokeStyle='#fffdf0b0';ctx.lineWidth=1.4;ctx.stroke();ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(p.x,p.y,7+flow*2,3.2,0,0,Math.PI*2);ctx.fill();}window.CakeArt?.image(ctx,'tools/jug',p.x-161,p.y-173,168,168);ctx.restore();}
window.CakePourArt={top,side,jug,bake};
})();
