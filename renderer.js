(function(){
'use strict';
const {items,colorValue}=CakeCore, sprites={},tints=new Map();
const names=['vanilla','chocolate','tea','whipped','berry','flower','biscuit','choc','stand','frost-ivory','frost-pink','frost-green','frost-cocoa','strawberry-slice','cookie-crumbs','ganache'];
names.push(...['jug','spatula','move','undo','redo','duplicate','remove','knife','pipe'].map(k=>'tools/'+k),'plates/rose','plates/blue','plates/mint',...new Set(Object.values(items).map(it=>it.asset).filter(Boolean)),'extras/piping-bag','extras/slices','extras/blueberry','extras/mango','extras/cookie-disc','extras/cream-swirl','extras/cream-star','extras/cream-rose','extras/cream-wave','extras/cream-leaves');
const loaded=Promise.all(names.map(name=>new Promise(resolve=>{const im=new Image();im.onload=()=>{sprites[name]=im;resolve();};im.onerror=resolve;im.src=`assets/${name}.png`;})));
const {fillingLayout,layerHeight}=CakeCore;
const cameras=new WeakMap();let assetEpoch=0;
async function registerAsset(a,url){const epoch=assetEpoch;CakeCore.registerAssets([a]);decoSizes[a.id]=a.size;await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>{if(epoch===assetEpoch)sprites[a.id]=im;resolve();};im.onerror=()=>reject(Error('配件图片读取失败'));im.src=url;});}
function clearCustomAssets(){assetEpoch++;for(const k of Object.keys(items))if(items[k].custom){delete sprites[k];delete decoSizes[k];delete items[k];}}
function geometry(d,level=d.layers.length,view='perspective'){
 if(level===0)return {x:380,y:view==='top'?320:450,rx:245,ry:view==='top'?245:93,height:0,shape:'round',view,level:0,cake:d};
 if(!d.coat&&!d.layers[level-1]?.coating&&d.layers[level-1]?.kind==='filling')return geometry(d,level-1,view);
 const height=d.layers.slice(0,level).reduce((sum,l)=>sum+layerHeight(l),0),scale=CakeCore.layerSize(d,level)/8,nakedOffset=!d.coat&&!d.layers[level-1]?.coating&&d.layers[level-1]?.kind==='base'?12:0;
 const tier=CakeCore.tiers(d).find(t=>level>t.start&&level<=t.end),bottom=tier?d.layers.slice(0,tier.start).reduce((n,l)=>n+layerHeight(l),0):0;
 return{x:380,y:view==='top'?320:450-height-nakedOffset,rx:180*scale,ry:(view==='top'?180:68)*scale,height,bottom:450-bottom,tierHeight:height-bottom,shape:d.shape||'round',view,level};
}
const flowGeometryCache=new WeakMap();
function flowGeometry(d){const stamp=(d.strokes||[]).map(s=>s.id+':'+s.points.length+':'+(s.revision||0)).join('|')+polishStamp(d),old=flowGeometryCache.get(d);if(old?.stamp===stamp)return old.rows;const fields=new Map(),rows=[];for(const s of d.strokes||[]){if(s.flowVersion!==1)continue;const k=s.level+':'+s.surface;if(!fields.has(k))fields.set(k,new Map());rows.push({s,mesh:CakePiping.mesh({...s,polishAt:CakeCore.polishReader(d,s)},fields.get(k))});}flowGeometryCache.set(d,{stamp,rows});return rows;}
function sceneBounds(d,view){
 const top=view==='top',pg=geometry(d,0,view),bounds={left:108,right:652,top:top?48:355,bottom:top?592:615};
 for(let level=1;level<=d.layers.length;level++){const g=geometry(d,level,view);bounds.top=Math.min(bounds.top,g.y-g.ry-25);}
 for(const o of d.decos){const g=geometry(d,o.level??d.layers.length,view),p=project(o,g,o.surface||'top'),[w,h]=decoSizes[o.item]||[50,50],r=Math.hypot(w,h)*o.scale;bounds.top=Math.min(bounds.top,p.y-r);bounds.bottom=Math.max(bounds.bottom,p.y+r*.3);bounds.left=Math.min(bounds.left,p.x-r*.6);bounds.right=Math.max(bounds.right,p.x+r*.6);}
 for(const {s,mesh} of flowGeometry(d)){const g=geometry(d,s.level,view);for(const m of mesh){const p=flowProjection(m,g,s);bounds.top=Math.min(bounds.top,p.y-Math.max(p.h,p.r)-s.size);bounds.bottom=Math.max(bounds.bottom,p.y+p.r);bounds.left=Math.min(bounds.left,p.x-p.r);bounds.right=Math.max(bounds.right,p.x+p.r);}}
 return bounds;
}
function setView(canvas,d,options={}){
 const view=options.view||'perspective',level=options.level||d.layers.length,h=d.layers.reduce((n,l)=>n+layerHeight(l),0),fit=view==='top'?1:Math.min(1,400/(h+100));
 const rect=canvas.getBoundingClientRect?.(),frameWidth=canvas.id==='cake-canvas'&&rect?.height?640*rect.width/rect.height:760;
 const bounds=sceneBounds(d,view),maxScale=Math.min((frameWidth-32)/(bounds.right-bounds.left),608/(bounds.bottom-bounds.top)),zoom=options.zoom||1,scale=Math.min(fit*zoom,maxScale);
 const baseTx=frameWidth/2-380*fit,baseTy=fit<1?(640-(h+210)*fit)/2-(450-h-80)*fit:0;
 let tx=frameWidth/2-380*scale,ty=baseTy;
 if(zoom>1){const t=Math.min(1,(zoom-1)*2);ty=baseTy*(1-t)+(320-(bounds.top+bounds.bottom)/2*scale)*t;}
 tx+=options.panX||0;ty+=options.panY||0;
 // Keep every painted surface reachable. At close range the frame stops at
 // the full cake's bounds instead of silently cutting off its plate or top.
 tx=Math.max(16-bounds.left*scale,Math.min(frameWidth-16-bounds.right*scale,tx));
 ty=Math.max(16-bounds.top*scale,Math.min(624-bounds.bottom*scale,ty));
 const camera={view,level,scale,tx,ty,frameWidth,baseTx,baseTy,fit,bounds,maxZoom:maxScale/fit};cameras.set(canvas,camera);return camera;
}
const decoOrder=(a,b)=>(a.order??a.v)-(b.order??b.v);
function ellipse(ctx,x,y,rx,ry,fill,stroke){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
function cylinder(ctx,x,y,rx,ry,h,side,top,line='#8a532d'){ctx.lineWidth=2.6;ctx.beginPath();ctx.moveTo(x-rx,y-h);ctx.bezierCurveTo(x-rx,y-h+ry*1.34,x+rx,y-h+ry*1.34,x+rx,y-h);ctx.lineTo(x+rx,y);ctx.bezierCurveTo(x+rx,y+ry*1.34,x-rx,y+ry*1.34,x-rx,y);ctx.closePath();ctx.fillStyle=side;ctx.fill();ctx.strokeStyle=line;ctx.stroke();ellipse(ctx,x,y-h,rx,ry,top,line);}
function tintColor(hex,amount){const c=colorValue(hex);return '#'+[1,3,5].map(i=>{const v=parseInt(c.slice(i,i+2),16);return Math.round(amount>=0?v+(255-v)*amount:v*(1+amount)).toString(16).padStart(2,'0');}).join('');}
function tinted(name,color){const key=name+color,source=sprites[name];if(!source)return null;if(!color)return source;if(tints.has(key))return tints.get(key);const c=document.createElement('canvas');c.width=source.width;c.height=source.height;const ctx=c.getContext('2d');ctx.filter='grayscale(1)';ctx.drawImage(source,0,0);ctx.filter='none';ctx.globalCompositeOperation='multiply';ctx.fillStyle=colorValue(color);ctx.fillRect(0,0,c.width,c.height);ctx.globalCompositeOperation='destination-in';ctx.drawImage(source,0,0);if(tints.size>48)tints.delete(tints.keys().next().value);tints.set(key,c);return c;}
const creamSprites=new Map();
function creamSprite(name,color){const key=name+color,source=sprites[name];if(!source)return null;if(creamSprites.has(key))return creamSprites.get(key);const c=document.createElement('canvas');c.width=source.width;c.height=source.height;const ctx=c.getContext('2d');ctx.drawImage(source,0,0);const pixels=ctx.getImageData(0,0,c.width,c.height),rgb=[1,3,5].map(i=>parseInt(colorValue(color).slice(i,i+2),16));for(let i=0;i<pixels.data.length;i+=4){if(!pixels.data[i+3])continue;const lum=pixels.data[i]*.2126+pixels.data[i+1]*.7152+pixels.data[i+2]*.0722;if(lum<78)continue;const t=Math.min(1,(lum-78)/177);for(let k=0;k<3;k++)pixels.data[i+k]=['vanilla','extras/cream-swirl','extras/peach'].includes(name)?(t<.8?rgb[k]*(.72+.28*t/.8):rgb[k]+(255-rgb[k])*(t-.8)/.2*.25):(t<.65?rgb[k]*(.76+.24*t/.65):rgb[k]+(255-rgb[k])*(t-.65)/.35);}ctx.putImageData(pixels,0,0);if(creamSprites.size>40)creamSprites.delete(creamSprites.keys().next().value);creamSprites.set(key,c);return c;}
function image(ctx,name,x,y,w,h,color){const im=color?(name.startsWith('extras/cream-')?creamSprite(name,color):tinted(name,color)):sprites[name];if(!im)return false;ctx.drawImage(im,x,y,w,h);return true;}
function contourPath(ctx,g,surface='top',depth=g.height){ctx.beginPath();if(surface==='top'||surface==='plate'){const points=CakeCore.shapePoints[g.shape];if(!points){ctx.ellipse(g.x,g.y,g.rx,g.ry,0,0,Math.PI*2);return;}points.forEach((p,i)=>i?ctx.lineTo(g.x+p.u*g.rx,g.y+p.v*g.ry):ctx.moveTo(g.x+p.u*g.rx,g.y+p.v*g.ry));}else{const front=[];for(let i=0;i<=180;i++){const u=-.999+i*1.998/180,v=CakeCore.frontEdge(g.shape,u);if(v!==null)front.push({x:g.x+u*g.rx,y:g.y+v*g.ry});}front.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));for(const p of front.reverse())ctx.lineTo(p.x,p.y+depth);}ctx.closePath();}
function seeded(n){return()=>{n=(Math.imul(n,1664525)+1013904223)|0;return(n>>>0)/4294967296;};}
function crumbMarks(ctx,g,color,texture,count=190,side=false,h=48){const rand=seeded(7203+(side?8:0));for(let i=0;i<count;i++){const u=rand()*2-1,v=rand()*2-1,x=g.x+u*g.rx,y=side?g.y+(CakeCore.frontEdge(g.shape,u)||0)*g.ry+rand()*h:g.y+v*g.ry;const chip=texture&&i%4===0,r=chip?1.5+rand()*2.8:1+rand()*2.6;let ink=tintColor(color,i%3?-.17:.2);if(chip)ink=({oreo:'#605046',sesame:'#5c5557',tea:'#8b7562',coffee:'#78513c',chocolate:'#755144',coconut:'#fff9ea',vanilla:'#8e6b4b',taro:'#9d81a9',blueberry:'#87729e',lemon:'#d1b04b'})[texture]||ink;ellipse(ctx,x,y,r,side?r*.8:r*.48,ink);}}
function shapeBody(ctx,g,h,color,crumbs=true,texture=null){ctx.save();ctx.lineJoin='round';ctx.lineWidth=3;const edge=tintColor(color,-.4);for(const side of [true,false]){contourPath(ctx,g,side?'side':'top',h);ctx.save();ctx.clip();const gradient=ctx.createLinearGradient(g.x-g.rx,g.y-g.ry,g.x+g.rx,g.y+g.ry+h);gradient.addColorStop(0,tintColor(color,side?.1:.28));gradient.addColorStop(.55,color);gradient.addColorStop(1,tintColor(color,side?-.22:-.06));ctx.fillStyle=gradient;ctx.fillRect(g.x-g.rx-3,g.y-g.ry-3,g.rx*2+6,g.ry*2+h+6);if(crumbs){const source=creamSprite('vanilla',color);if(source){ctx.globalAlpha=.2;ctx.drawImage(source,source.width*.27,source.height*(side?.62:.2),source.width*.46,source.height*.2,g.x-g.rx,g.y-g.ry,g.rx*2,g.ry*2+h);ctx.globalAlpha=1;}crumbMarks(ctx,g,color,texture,side?135:170,side,h);}ctx.restore();contourPath(ctx,g,side?'side':'top',h);ctx.strokeStyle=edge;ctx.stroke();if(!side){ctx.save();ctx.translate(0,2);contourPath(ctx,g);ctx.strokeStyle=tintColor(color,.32);ctx.lineWidth=1;ctx.stroke();ctx.restore();}}ctx.restore();}
const baseCache=new Map();
function baseLayer(ctx,key,g){const it=items[key],cacheKey=key+g.shape;let canvas=baseCache.get(cacheKey);if(!canvas){canvas=document.createElement('canvas');canvas.width=760;canvas.height=240;const c=canvas.getContext('2d'),local={...g,x:380,y:82};if(g.shape==='round'&&sprites.vanilla){const source=creamSprite('vanilla',it.color);c.drawImage(source,200,26,360,184);c.save();contourPath(c,local);c.clip();if(it.texture)crumbMarks(c,local,it.color,it.texture,65);c.restore();}else shapeBody(c,local,48,it.color,true,it.texture);baseCache.set(cacheKey,canvas);}ctx.drawImage(canvas,0,g.y-82);}
const previewCache=new Map();
const nozzlePreviews=new Map();
function nozzlePreview(style){if(style==='round')return '';if(nozzlePreviews.has(style))return nozzlePreviews.get(style);const image=creamSprite(nozzleArt[style],'#fff3d5');if(!image)return '';const url=image.toDataURL();nozzlePreviews.set(style,url);return url;}
function flavorIcon(key,shape='round',size=8){if(!sprites.vanilla)return null;const previewKey=key+shape+size;if(previewCache.has(previewKey))return previewCache.get(previewKey);const it=items[key],c=document.createElement('canvas');c.width=150;c.height=105;const ctx=c.getContext('2d');if(it.group==='base'){ctx.translate(-69,0);ctx.scale(.38,.38);ctx.translate(380*(1-size/8),96*(1-size/8));ctx.scale(size/8,size/8);baseLayer(ctx,key,{x:380,y:96,rx:180,ry:68,height:48,shape});const data=c.toDataURL();previewCache.set(previewKey,data);return data;}
 ctx.save();ctx.translate(75,52);ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(-57,0);ctx.quadraticCurveTo(-50,49,0,49);ctx.quadraticCurveTo(50,49,57,0);ctx.closePath();ctx.fillStyle='#fff3d9';ctx.fill();ctx.strokeStyle='#946446';ctx.stroke();ellipse(ctx,0,0,57,18,'#e3ceb0','#946446');ctx.restore();ctx.save();ctx.beginPath();ctx.ellipse(75,47,51,29,0,0,Math.PI*2);ctx.clip();fillingPortion(ctx,key,{u:0,v:0,angle:0},{x:75,y:48,rx:1,ry:1});ctx.restore();const data=c.toDataURL();previewCache.set(previewKey,data);return data;}
function surfacePath(ctx,g,surface){contourPath(ctx,g,surface,surface==='side'?(g.tierHeight||g.height):g.height);return;if(g.shape&&g.shape!=='round'){contourPath(ctx,g,surface);return;}ctx.beginPath();if(surface==='side'){ctx.moveTo(g.x-g.rx,g.y);ctx.bezierCurveTo(g.x-g.rx,g.y+g.ry*1.34,g.x+g.rx,g.y+g.ry*1.34,g.x+g.rx,g.y);ctx.lineTo(g.x+g.rx,450);ctx.bezierCurveTo(g.x+g.rx,450+g.ry*1.34,g.x-g.rx,450+g.ry*1.34,g.x-g.rx,450);ctx.closePath();}else ctx.ellipse(g.x,g.y,g.rx,g.ry,0,0,Math.PI*2);}
function project(p,g,surface='top'){return{x:g.x+p.u*g.rx,y:surface==='side'?g.y+g.ry*(CakeCore.frontEdge(g.shape,p.u)??0)+p.v*(g.tierHeight||g.height):g.y+p.v*g.ry};}
function pearl(ctx,x,y,size,color='#fff4c4'){ctx.lineWidth=1;ellipse(ctx,x,y,size,size*.85,tintColor(color,-.08),tintColor(color,-.35));ellipse(ctx,x-size*.27,y-size*.33,size*.32,size*.22,tintColor(color,.65));}
const decoSizes={...Object.fromEntries(Object.entries(items).filter(([,it])=>it.size).map(([k,it])=>[k,it.size])),berry:[78,94],whipped:[78,74],flower:[53,53],biscuit:[76,80],choc:[74,80],pearl:[18,18]};
function drawDecoration(ctx,d,g,selected){const p=project(d,g,d.surface||'top'),side=d.surface==='side';let[w,h]=decoSizes[d.item]||[50,50];w*=d.scale;h*=d.scale;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(d.angle*Math.PI/180);if(side)ctx.scale(Math.max(.65,Math.sqrt(1-d.u*d.u)),.9);ctx.lineWidth=1.5;ctx.shadowColor='#6a402c33';ctx.shadowBlur=4;ctx.shadowOffsetY=2;const anchor=side?.5:(items[d.item]?.anchor??.88);if(d.item==='pearl')pearl(ctx,0,side?0:-5,9*d.scale);else if(!image(ctx,items[d.item]?.asset||d.item,-w/2,-h*anchor,w,h,d.color))ellipse(ctx,0,-h*.35,w*.4,h*.4,d.item==='berry'?'#f16457':'#fff7dc','#874822');ctx.shadowColor='transparent';if(selected){ctx.setLineDash([5,5]);ctx.strokeStyle='#228aa3';ctx.lineWidth=2;ctx.strokeRect(-w/2-5,-h*anchor-5,w+10,h+10);}ctx.restore();}
function smoothPath(ctx,points,dx=0,dy=0){ctx.beginPath();ctx.moveTo(points[0].x+dx,points[0].y+dy);if(points.length===1){ctx.lineTo(points[0].x+.01+dx,points[0].y+dy);return;}for(let i=1;i<points.length-1;i++)ctx.quadraticCurveTo(points[i].x+dx,points[i].y+dy,(points[i].x+points[i+1].x)/2+dx,(points[i].y+points[i+1].y)/2+dy);ctx.lineTo(points.at(-1).x+dx,points.at(-1).y+dy);}
function stamps(points,spacing,fn){fn(points[0],0);let left=spacing;for(let i=1;i<points.length;i++){if(points[i].break){fn(points[i],0);left=spacing;continue;}let a={...points[i-1]},b=points[i],len=Math.hypot(b.x-a.x,b.y-a.y);while(len>=left&&len>0){const t=left/len;a={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};fn(a,Math.atan2(b.y-points[i-1].y,b.x-points[i-1].x));len-=left;left=spacing;}left-=len;}}
function rosette(ctx,p,size,color,angle=0){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(angle);ctx.lineWidth=1.2;for(let i=0;i<7;i++){const a=i*Math.PI*2/7;ellipse(ctx,Math.cos(a)*size*.2,Math.sin(a)*size*.16,size*.28,size*.22,tintColor(color,i%2?.1:-.06),tintColor(color,-.26));}ctx.beginPath();for(let i=0;i<40;i++){const a=i*.36,r=size*.28*(1-i/44),x=Math.cos(a)*r,y=Math.sin(a)*r*.75;if(!i)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.lineWidth=Math.max(1.4,size*.09);ctx.strokeStyle=tintColor(color,.48);ctx.stroke();ctx.restore();}
// A small height field remembers previous passes, but adjacent samples belong to
// the same squeeze: they must not build a tower simply because the mouse is slow.
function creamSamples(s,g,field=new Map(),stream=null){
 const from=stream?Math.max(0,(stream.count||0)-1):0,pts=s.points.slice(from).map(p=>({...project(p,g,s.surface),break:p.break})),out=[],step=Math.max(1.4,s.size*.15),cell=5,r=Math.max(1,s.size*.23);let travel=stream?.travel||0,last=stream?.last||null,z=stream?.z||0,gap=stream?.gap||false;
 stamps(pts,step,(p,angle)=>{if((s.surface==='plate'&&!CakeCore.plateExposed(g.cake,(p.x-g.x)/g.rx,(p.y-g.y)/g.ry))||s.surface==='top'&&!CakeCore.onSurface('top',(p.x-g.x)/g.rx,(p.y-g.y)/g.ry,g.shape||'round')){gap=true;last=null;return;}if(gap){p={...p,break:true};gap=false;}if(p.break){last=null;z=0;}if(last&&Math.hypot(p.x-last.x,p.y-last.y)<.05)return;travel+=last?Math.hypot(p.x-last.x,p.y-last.y):0;let support=0;const cells=[];
  for(let x=Math.floor((p.x-r)/cell);x<=Math.floor((p.x+r)/cell);x++)for(let y=Math.floor((p.y-r)/cell);y<=Math.floor((p.y+r)/cell);y++){const key=x+','+y,q=field.get(key);cells.push(key);if(q)support=Math.max(support,q.stroke===s&&travel-q.at<s.size*2?q.base:q.h);}
  support=Math.min(6,support);z=s.surface==='top'?support:0;
  for(const key of cells)field.set(key,{h:Math.min(6,support+s.size*.16),base:support,at:travel,stroke:s});
  out.push({break:p.break,x:p.x,y:p.y-(s.surface==='top'?z:z*.35),z,angle});last=p;
 });if(stream)Object.assign(stream,{count:s.points.length,travel,last,z,gap});return out;
}
// Reuse the illustrated cream sprites for the flower tips, with a soft,
// outlined continuous ribbon for the round writing tip.
const nozzleArt={star:'extras/cream-star',rose:'extras/cream-rose',ribbon:'extras/cream-wave',leaf:'extras/cream-leaves',pearl:'extras/cream-swirl'};
// Round cream has a material volume and a physical height independent of camera tilt.
const flowTips=new WeakMap();
function flowProjection(p,g,s){const scale=g.rx/180,pos=project(p,g,s.surface),lift=g.view==='top'?0:(s.surface==='side'?.28:1)*scale;return {...p,x:pos.x,y:pos.y-(p.z+p.h*.5)*lift,r:p.r*scale,h:p.h*scale,lift,ground:pos.y};}
function drawFlow(ctx,s,g,field,model=null,start=0,end=Infinity){
 model=model||CakePiping.mesh(s,field);const pts=model.slice(Math.max(0,start-2),Math.min(model.length,end+2)).map(p=>flowProjection(p,g,s)),offset=Math.max(0,start-2),color=colorValue(s.color),top=g.view==='top',opacity=ctx.globalAlpha;ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
 for(let i=0;i<pts.length;i++){const p=pts[i],a=i&&!p.break?pts[i-1]:p,b=pts[i+1]&&!pts[i+1].break?pts[i+1]:p,dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;p.nx=-dy/len;p.ny=dx/len;}
 let previous=start?pts[start-offset-1]:null;
 for(let index=start;index<Math.min(end,model.length);index++){const p=pts[index-offset];ctx.globalAlpha=opacity*(1-(p.flat||0));
  const r=Math.max(.4,p.r),ry=top?r:Math.max(r*.42,p.h*.52);
  if(previous&&!p.break){
   const a=previous,dx=p.x-a.x,dy=p.y-a.y,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;
   // Overlapping, softly shaded cross-sections form a continuous cylindrical ribbon.
   const sections=12;
   for(let band=0;band<sections;band++){
    const t0=-1+2*band/sections,t1=-1+2*(band+1)/sections,mid=(t0+t1)*.5;
    const light=.2*Math.sqrt(Math.max(0,1-mid*mid))-.16+(-nx*.6-ny*.8)*mid*.13;
    ctx.fillStyle=tintColor(color,light);ctx.beginPath();ctx.moveTo(a.x+a.nx*a.r*t0,a.y+a.ny*a.r*t0);ctx.lineTo(p.x+p.nx*r*t0,p.y+p.ny*r*t0);ctx.lineTo(p.x+p.nx*r*t1,p.y+p.ny*r*t1);ctx.lineTo(a.x+a.nx*a.r*t1,a.y+a.ny*a.r*t1);ctx.closePath();ctx.fill();
   }
  }
  if(p.mound||!previous||p.break||index===model.length-1){
   ctx.save();ctx.translate(p.x,p.y);const gradient=ctx.createRadialGradient(-r*.32,-ry*.4,r*.06,0,0,Math.max(r,ry)*1.12);gradient.addColorStop(0,tintColor(color,.3));gradient.addColorStop(.5,tintColor(color,.06));gradient.addColorStop(.87,tintColor(color,-.1));gradient.addColorStop(1,tintColor(color,-.21));
   ctx.fillStyle=gradient;ctx.beginPath();ctx.ellipse(0,0,r,ry,0,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  previous=p;
 }
 const p=end>=model.length?pts.at(-1):null;if(p){const peak=Math.min(s.size*.72,p.r*.85+3)*(1-(p.flat||0)),x=p.x+p.r*.17,y=p.y-(top?p.r*.22:p.h*.44+peak);
  if(s.tip){ctx.globalAlpha=opacity*(1-(p.flat||0));const grad=ctx.createLinearGradient(p.x-p.r*.6,p.y,p.x+p.r*.7,p.y);grad.addColorStop(0,tintColor(color,.13));grad.addColorStop(.4,tintColor(color,.3));grad.addColorStop(1,tintColor(color,-.12));ctx.fillStyle=grad;ctx.beginPath();ctx.moveTo(p.x-p.r*.66,p.y-(top?0:p.h*.14));ctx.bezierCurveTo(p.x-p.r*.43,p.y-p.h*.6,x-peak*.3,y+peak*.6,x,y);ctx.bezierCurveTo(x-peak*.12,y+peak*.73,p.x+p.r*.63,p.y-p.h*.2,p.x+p.r*.65,p.y);ctx.quadraticCurveTo(p.x,p.y+p.r*.15,p.x-p.r*.66,p.y-(top?0:p.h*.14));ctx.fill();}
  flowTips.set(s,{x:p.x,y:top?p.y:p.y-p.h*.5});
 }ctx.restore();return pts;
}
function drawStroke(ctx,s,g,selected=false,field=new Map(),stream=null){
 if(!s.points?.length)return [];if(s.flowVersion===1)return drawFlow(ctx,s,g,field);ctx.save();const original=g;if(s.surface!=='side'){ctx.translate(g.x,g.y);ctx.scale(g.rx/180,g.ry/180);ctx.translate(-g.x,-g.y);g={...g,rx:180,ry:180};}const pts=creamSamples(s,g,field,stream),size=s.size,color=colorValue(s.color);ctx.save();if(s.style==='round'){surfacePath(ctx,g,s.surface);ctx.clip();}ctx.lineCap='round';ctx.lineJoin='round';
 if(s.style==='round'){
  const parts=[];let part=[];for(const p of pts){if(p.break&&part.length){parts.push(part);part=[];}part.push(p);}if(part.length)parts.push(part);for(const segment of parts){for(const [width,shade,dy]of [[size+1.8,-.32,1],[size,0,0],[size*.48,.37,-size*.15]]){smoothPath(ctx,segment,0,dy);ctx.strokeStyle=tintColor(color,shade);ctx.lineWidth=width;ctx.stroke();}}

 }else{
  let last=stream?.stampLast||null;const spacing=size*(s.style==='ribbon'?.85:1.02);for(const p of pts){if(p.break)last=null;if(last&&Math.hypot(p.x-last.x,p.y-last.y)<spacing)continue;ctx.save();ctx.translate(p.x,p.y);const w=size*(s.style==='ribbon'?2.05:s.style==='leaf'?1.9:1.55),h=size*(s.style==='ribbon'?.92:1.35);if(['ribbon','leaf'].includes(s.style))ctx.rotate(p.angle||0);image(ctx,nozzleArt[s.style]||nozzleArt.star,-w/2,-h*.7,w,h,color);ctx.restore();last=p;}if(stream)stream.stampLast=last;
 }
 ctx.restore();ctx.restore();return pts.map(p=>s.surface!=='side'?{...p,x:original.x+(p.x-original.x)*original.rx/180,y:original.y+(p.y-original.y)*original.ry/180}:p);
}
const creamLayers=new Map(),liveCream=new WeakMap(),hitMeshes=new Map();
function creamLayer(ctx,strokes,g,options,preview){
 if(!strokes.length&&!preview)return;const key=g.shape+':'+g.rx+':'+g.ry+':'+g.y+':'+g.height+':'+strokes.map(s=>s.id+':'+s.points.length+':'+(s.revision||0)).join('|')+':'+polishStamp(options.polishDraft);let layer=creamLayers.get(key);
 if(!layer){const canvas=document.createElement('canvas'),offsetY=Math.max(0,Math.ceil(-g.y+g.ry+320));canvas.width=760;canvas.height=640+offsetY;canvas.getContext('2d').translate(0,offsetY);const field=new Map(),meshes=[];for(const s of strokes){const shaped=options.polishDraft?{...s,polishAt:CakeCore.polishReader(options.polishDraft,s)}:s;
 if(s.flowVersion===1||!options.polishDraft||!hasPolish(options.polishDraft,s)){meshes.push({s,pts:drawStroke(canvas.getContext('2d'),shaped,g,false,field)});}
 else{const temp=document.createElement('canvas');temp.width=760;temp.height=canvas.height;const tc=temp.getContext('2d');tc.translate(0,offsetY);const pts=drawStroke(tc,s,g,false,field);erasePolish(tc,options.polishDraft,s,g);canvas.getContext('2d').drawImage(temp,0,-offsetY);meshes.push({s,pts});}
 }layer={canvas,field,meshes,offsetY};if(creamLayers.size>16)creamLayers.delete(creamLayers.keys().next().value);creamLayers.set(key,layer);}
 ctx.save();if(options.smooth)ctx.globalAlpha*=1-options.smooth.progress;ctx.drawImage(layer.canvas,0,-layer.offsetY);if(options.tool==='move'){const selected=layer.meshes.find(m=>m.s.id===options.selected);if(selected?.pts.length){ctx.lineWidth=1.5;ctx.strokeStyle='#2489a7';for(const p of [selected.pts[0],selected.pts.at(-1)]){ctx.beginPath();ctx.arc(p.x,p.y,selected.s.size*.5+4,0,Math.PI*2);ctx.stroke();}}}if(preview){let live=liveCream.get(preview);if(!live||live.source!==preview.points||live.key!==key){const canvas=document.createElement('canvas');canvas.width=760;canvas.height=640+layer.offsetY;canvas.getContext('2d').translate(0,layer.offsetY);live={canvas,field:new Map(layer.field),stream:{},source:preview.points,key};liveCream.set(preview,live);}if(live.stream.count!==preview.points.length||live.revision!==preview.revision){live.revision=preview.revision;if(preview.style==='round'){if(preview.flowVersion===1){
 const lc=live.canvas.getContext('2d');if(!live.prefix){live.prefix=document.createElement('canvas');live.prefix.width=760;live.prefix.height=live.canvas.height;live.prefix.getContext('2d').translate(0,layer.offsetY);live.flow={};live.frozen=0;}
 const model=CakePiping.mesh(preview,live.field,live.flow),freeze=Math.max(0,model.length-5);
 if(freeze>live.frozen){drawFlow(live.prefix.getContext('2d'),preview,g,null,model,live.frozen,freeze);live.frozen=freeze;}
 lc.clearRect(0,-layer.offsetY,760,live.canvas.height);lc.drawImage(live.prefix,0,-layer.offsetY);drawFlow(lc,preview,g,null,model,live.frozen);
 }else{live.canvas.getContext('2d').clearRect(0,-layer.offsetY,760,live.canvas.height);drawStroke(live.canvas.getContext('2d'),preview,g,false,new Map(layer.field));}live.stream.count=preview.points.length;}else drawStroke(live.canvas.getContext('2d'),preview,g,false,live.field,live.stream);}ctx.drawImage(live.canvas,0,-layer.offsetY);}ctx.restore();
}
function fillingPortion(ctx,item,p,g,alpha=1){const pos=project(p,g);ctx.save();ctx.globalAlpha*=alpha;ctx.translate(pos.x,pos.y);ctx.rotate((p.angle||0)*Math.PI/180);ctx.shadowColor='#69412825';ctx.shadowBlur=3;ctx.shadowOffsetY=3;
 if(item==='berryfill')image(ctx,'extras/slices',-48,-26,96,52);
 else if(item==='cookiefill'){image(ctx,'cookie-crumbs',-41,-17,82,37);for(const [x,y,a]of [[-21,-7,-.4],[18,1,.7]]){ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.beginPath();ctx.moveTo(-20,-17);ctx.lineTo(17,-12);ctx.lineTo(7,18);ctx.lineTo(-16,6);ctx.closePath();ctx.clip();image(ctx,'extras/cookie-disc',-22,-18,44,36);ctx.restore();}}
 else if(item==='chocofill')image(ctx,'ganache',-40,-24,80,48);
 else if(item==='bluefill')image(ctx,'extras/blueberry',-34,-23,68,46);
 else if(item==='mangofill')image(ctx,'extras/mango',-38,-24,76,48);
 else if(item==='beanfill'){for(const [x,y,a]of [[-20,3,-.4],[3,-7,.5],[22,7,-.4],[-4,12,.3]]){ctx.save();ctx.translate(x,y);ctx.rotate(a);ellipse(ctx,0,0,13,7,'#a53e47','#71303a');ellipse(ctx,-3,-2,5,1.8,'#e68c8c');ctx.restore();}}
 else{const it=items[item],kind=it.portion,color=it.color;
 if(kind==='cherry')image(ctx,'extras/cherry',-34,-31,68,60);
 else if(kind==='peach'){const peach=creamSprite('extras/peach','#f3c15e');if(peach)ctx.drawImage(peach,-43,-26,86,52);}
 else if(kind==='berries'){image(ctx,'extras/blueberry',-36,-16,49,34);image(ctx,'extras/raspberry',-2,-23,40,40);image(ctx,'extras/slices',-19,0,38,26);}
 else if(kind==='pudding'){ctx.lineWidth=1.8;ctx.fillStyle=color;ctx.strokeStyle='#ab7548';ctx.beginPath();ctx.moveTo(-22,-20);ctx.lineTo(-30,13);ctx.quadraticCurveTo(0,28,30,13);ctx.lineTo(22,-20);ctx.closePath();ctx.fill();ctx.stroke();ellipse(ctx,0,-20,22,8,'#bb7d45','#a16a3f');ellipse(ctx,-5,-21,11,3,'#e4b16d');}
 else{image(ctx,'extras/cream-swirl',-38,-30,76,47,color);if(kind==='pomelo'){image(ctx,'extras/mango',-25,-11,44,27);for(let i=0;i<5;i++)ellipse(ctx,14+i%3*5,-9+Math.floor(i/3)*6,2.5,3,'#f7b8aa','#d29885');for(let i=0;i<4;i++)pearl(ctx,-18+i*8,12,2.5,'#fff5d8');}if(it.texture){for(const [x,y]of [[-14,-3],[10,4],[21,-6],[-2,11]]){const small=it.texture==='sesame';ellipse(ctx,x,y,small?1.6:3.8,small?.9:2.4,it.texture==='taro'?'#9e84b0':it.texture==='nut'?'#dfbf8a':'#746054');}}}
 }
 ctx.restore();}
function drawFilling(ctx,l,y,g={x:380,y,rx:180,ry:68}){const pieces=l.pieces?fillingLayout(l):[{u:-.48,v:-.12,angle:-17,z:0},{u:.12,v:-.46,angle:11,z:0},{u:.5,v:.02,angle:-8,z:0},{u:-.16,v:.35,angle:22,z:0}];for(const p of [...pieces].sort((a,b)=>a.v-b.v||a.z-b.z))fillingPortion(ctx,p.item||l.item,p,{...g,y:g.y-(g.view==='top'?0:p.z+5)});}

function drawCoat(ctx,d,g){shapeBody(ctx,g,g.tierHeight||g.height,colorValue(d.coat),false);}
function creamCap(ctx,l,g){const color=colorValue(l.color),h=layerHeight(l);if(g.view==='top'){contourPath(ctx,g);ctx.fillStyle=color;ctx.fill();ctx.strokeStyle=tintColor(color,-.28);ctx.lineWidth=2;ctx.stroke();return;}
 shapeBody(ctx,g,h,color,false);if(l.creamForm==='normal'||!l.creamForm)return;ctx.save();ctx.fillStyle=color;ctx.strokeStyle=tintColor(color,-.3);ctx.lineWidth=2;ctx.beginPath();const n=100;for(let i=0;i<=n;i++){const u=-.99+i*1.98/n,y=g.y+(CakeCore.frontEdge(g.shape,u)||0)*g.ry;if(!i)ctx.moveTo(g.x+u*g.rx,y);else ctx.lineTo(g.x+u*g.rx,y);}for(let i=n;i>=0;i--){const u=-.99+i*1.98/n,angle=i/n*Math.PI*12,wave=l.creamForm==='drip'?Math.pow(Math.max(0,Math.sin(angle)),4)*(13+7*Math.sin(i*.43)**2):8*(1+Math.sin(angle));ctx.lineTo(g.x+u*g.rx,g.y+(CakeCore.frontEdge(g.shape,u)||0)*g.ry+h+wave);}ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();}


const polishTextures=new WeakMap(),polishIdentities=new WeakMap();let polishSerial=0;function polishIdentity(b){if(!polishIdentities.has(b))polishIdentities.set(b,++polishSerial);return polishIdentities.get(b);}
function polishStamp(d){return d?d.layers.map(l=>(l.polish||[]).map(b=>polishIdentity(b)+':'+b.revision).join('/')).join(';'):'';}
function hasPolish(d,s){return d.layers.some(l=>l.polish?.some(b=>b.surface===s.surface&&b.targets.includes(s.id)));}
function polishTexture(b,mask=false){let cached=polishTextures.get(b);if(!cached||cached.revision!==b.revision){cached={revision:b.revision};polishTextures.set(b,cached);}const key=mask?'mask':'color';if(cached[key])return cached[key];
 const c=document.createElement('canvas');c.width=c.height=65;const ctx=c.getContext('2d'),pixels=ctx.createImageData(65,65),color=colorValue(b.color),rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
 for(const [key,value]of Object.entries(b.cells)){const offset=+key*4;const t=(+key%65+Math.floor(+key/65))/128,shade=b.surface==='side'?.1-.32*(+key%65)/64:.28-.34*t;for(let k=0;k<3;k++)pixels.data[offset+k]=mask?255:shade>=0?rgb[k]+(255-rgb[k])*shade:rgb[k]*(1+shade);pixels.data[offset+3]=value;}ctx.putImageData(pixels,0,0);cached[key]=c;return c;
}
function polishProjection(ctx,b,g,depth,mask=false){
 const texture=polishTexture(b,mask);ctx.save();contourPath(ctx,g,b.surface,depth);ctx.clip();ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
 if(b.surface==='top')ctx.drawImage(texture,g.x-g.rx,g.y-g.ry,g.rx*2,g.ry*2);
 else{const steps=Math.ceil(g.rx*2);for(let x=0;x<steps;x++){const u=-1+(x+.5)/steps*2,front=CakeCore.frontEdge(g.shape,u);if(front===null)continue;ctx.drawImage(texture,x/steps*65,0,65/steps,65,g.x-g.rx+x/steps*g.rx*2,g.y+front*g.ry,g.rx*2/steps+.02,depth);}}
 ctx.restore();
}
function drawPolish(ctx,d,level,g,surface){
 const batches=d.layers[level-1]?.polish?.filter(b=>b.surface===surface);if(!batches?.length)return;
 // Side fields are bounded to this physical slice, even when several slices form a tier.
 for(const b of batches)polishProjection(ctx,b,g,layerHeight(d.layers[level-1]));
}
function erasePolish(ctx,d,s,g){
 ctx.save();ctx.globalCompositeOperation='destination-out';
 for(let i=0;i<d.layers.length;i++){if(s.surface==='top'&&s.level!==i+1)continue;const pg=geometry(d,i+1,g.view);for(const b of d.layers[i].polish||[])if(b.surface===s.surface&&b.targets.includes(s.id))polishProjection(ctx,b,pg,layerHeight(d.layers[i]),true);}
 ctx.restore();
}

function fadeStroke(ctx,s,g,options){ctx.save();if(options.smooth)ctx.globalAlpha*=1-options.smooth.progress;drawStroke(ctx,s,g,options.tool==='move'&&s.id===options.selected);ctx.restore();}
function pourPolishPhase(ctx,d,level,g,options,surface,after=false){
 const tier=CakeCore.tiers(d).find(t=>level>t.start&&level<=t.end),layers=surface==='top'?[d.layers[level-1]]:d.layers.slice(tier?.start||0,tier?.end||level),batches=layers.flatMap(l=>(l.polish||[]).filter(b=>b.surface===surface));
 if(!batches.length){if(!after)window.CakePourArt?.[surface](ctx,d,level,g,options);return;}
 const records=options.pour||d.glazes||[],old=new Set(batches.flatMap(b=>b.films||[]));
 window.CakePourArt?.[surface](ctx,d,level,g,{...options,pour:records.filter(p=>after?!old.has(p.id):old.has(p.id))});
}
function topArtwork(ctx,d,level,g,options){const finish=d.layers[level-1]?.finish,creamOptions={...options,polishDraft:d,...(finish?{smooth:options.smooth||finish}:{})};pourPolishPhase(ctx,d,level,g,options,'top');drawPolish(ctx,d,level,g,'top');pourPolishPhase(ctx,d,level,g,options,'top',true);const preview=options.previewStroke?.surface==='top'&&options.previewStroke.level===level?options.previewStroke:null;creamLayer(ctx,(d.strokes||[]).filter(s=>s.surface==='top'&&s.level===level),g,creamOptions,preview);for(const o of [...d.decos].filter(o=>(o.surface||'top')==='top'&&(o.level??d.layers.length)===level&&!(level<d.layers.length&&o.v>0&&CakeCore.exposed(d,level,o.u,o.v,'top'))).sort(decoOrder))drawDecoration(ctx,o,g,o.id===options.selected);}
function nakedCake(ctx,d,options){let y=450;const view=options.view||'perspective',tiers=CakeCore.tiers(d);for(let i=0;i<d.layers.length;i++){const l=d.layers[i],it=items[l.item],h=layerHeight(l),scale=CakeCore.layerSize(d,i+1)/8,g={...geometry(d,i+1,view),y:view==='top'?320:y-h-(l.kind==='base'?12:0),height:h,tierHeight:h};
 if(d.coat||l.coating){}else if(view==='top'){if(l.kind==='filling')drawFilling(ctx,l,320,{...g,y:320});else{contourPath(ctx,g);ctx.fillStyle=l.kind==='cream'?colorValue(l.color):it.top||it.color;ctx.fill();ctx.strokeStyle=tintColor(ctx.fillStyle,-.3);ctx.lineWidth=2;ctx.stroke();if(l.kind==='base'){ctx.save();contourPath(ctx,g);ctx.clip();crumbMarks(ctx,g,it.color,it.texture,110);ctx.restore();}}}
 else if(l.kind==='base'){if(scale!==1){shapeBody(ctx,g,h,it.color,true,it.texture);}else{ctx.save();ctx.translate(380*(1-scale),0);ctx.scale(scale,1);const full={...g,x:380,rx:180,ry:68};if(g.shape==='round'&&['vanilla','chocolate','tea','pinkbase'].includes(l.item))image(ctx,it.asset||l.item,200,y-h-68,360,h+136);else baseLayer(ctx,l.item,full);ctx.restore();}}
 else if(l.kind==='filling')drawFilling(ctx,l,y,{...g,y});else creamCap(ctx,l,g);
 y-=h;const endTier=tiers.find(t=>t.end===i+1);const coating=d.coat||l.coating;if(coating&&(endTier||d.layers[i+1]?.coating!==coating)){const coatG=geometry(d,i+1,view);let start=i;while(start>0&&CakeCore.layerSize(d,start)===CakeCore.layerSize(d,i+1)&&(d.coat||d.layers[start-1].coating)===coating)start--;coatG.tierHeight=d.layers.slice(start,i+1).reduce((n,l)=>n+layerHeight(l),0);if(view==='top'){contourPath(ctx,coatG);ctx.fillStyle=colorValue(coating);ctx.fill();ctx.strokeStyle=tintColor(coating,-.3);ctx.stroke();}else drawCoat(ctx,{coat:coating},coatG);}
  if(l.finish){ctx.save();ctx.globalAlpha=l.finish.progress;const fg={...geometry(d,i+1,view),tierHeight:h};if(view==='top'){contourPath(ctx,fg);ctx.fillStyle=colorValue(l.finish.color);ctx.fill();}else drawCoat(ctx,{coat:l.finish.color},fg);ctx.restore();}
 const artG=geometry(d,i+1,view);topArtwork(ctx,d,i+1,artG,options);
 if(endTier&&view!=='top'){
 for(const phase of ['before','flat','after'])for(let n=endTier.start+1;n<=endTier.end;n++){const sg=geometry(d,n,view),sideG={...sg,height:sg.tierHeight};if(phase==='flat')drawPolish(ctx,d,n,sideG,'side');else pourPolishPhase(ctx,d,n,sideG,options,'side',phase==='after');}
 for(let sideLevel=endTier.start+1;sideLevel<=endTier.end;sideLevel++){const sg=geometry(d,sideLevel,view),sideG={...sg,height:sg.tierHeight};creamLayer(ctx,(d.strokes||[]).filter(s=>s.surface==='side'&&s.level===sideLevel),sideG,{...options,polishDraft:d,...(d.layers[sideLevel-1]?.finish?{smooth:options.smooth||d.layers[sideLevel-1].finish}:{})},options.previewStroke?.surface==='side'&&options.previewStroke.level===sideLevel?options.previewStroke:null);for(const o of [...d.decos].filter(o=>o.surface==='side'&&o.level===sideLevel).sort(decoOrder))drawDecoration(ctx,o,sideG,o.id===options.selected);}}

  }}

function plateArt(ctx,d,options,front=false){const g=geometry(d,0,options.view);if(!front)creamLayer(ctx,d.strokes.filter(s=>s.surface==='plate'),g,{...options,smooth:null},options.previewStroke?.surface==='plate'?options.previewStroke:null);for(const o of d.decos.filter(o=>o.surface==='plate'&&(front?o.v>=0:o.v<0)).sort(decoOrder))drawDecoration(ctx,o,g,o.id===options.selected);}
 function draw(canvas,d,options={}){const ctx=canvas.getContext('2d'),camera=options.camera||setView(canvas,d,options);ctx.save();ctx.setTransform(canvas.width/camera.frameWidth,0,0,canvas.height/640,0,0);ctx.clearRect(0,0,camera.frameWidth,640);if(options.background){ctx.fillStyle='#f7e8cc';ctx.fillRect(0,0,camera.frameWidth,640);}ctx.translate(camera.tx,camera.ty);ctx.scale(camera.scale,camera.scale);
 if(d.plate&&d.plate!=='stand'){const pg=geometry(d,0,camera.view);ctx.save();ctx.shadowColor='#68483040';ctx.shadowBlur=9;ctx.shadowOffsetY=5;image(ctx,'plates/'+d.plate,pg.x-272,pg.y-272*pg.ry/pg.rx,544,544*pg.ry/pg.rx);ctx.restore();}else if(camera.view==='top'){ellipse(ctx,380,320,247,247,'#c9c9c5','#8c8b87');ellipse(ctx,380,315,242,242,'#faf8ee','#b8b5ac');}else{ctx.save();ctx.filter='blur(12px)';ellipse(ctx,380,580,235,25,'#603b282e');ctx.restore();image(ctx,'stand',110,377,540,235);}
 plateArt(ctx,d,{...options,view:camera.view});nakedCake(ctx,d,{...options,view:camera.view});plateArt(ctx,d,{...options,view:camera.view},true);for(const t of [...CakeCore.tiers(d)].reverse()){if(t.end===d.layers.length)continue;const tg=geometry(d,t.end,camera.view);for(const o of d.decos.filter(o=>(o.surface||'top')==='top'&&o.level===t.end&&o.v>0&&CakeCore.exposed(d,o.level,o.u,o.v,'top')).sort(decoOrder))drawDecoration(ctx,o,tg,o.id===options.selected);}const g=geometry(d,camera.level,camera.view);
 if(options.smooth){ctx.save();ctx.globalAlpha=options.smooth.progress;for(const t of CakeCore.tiers(d)){const sg=geometry(d,t.end,camera.view);if(camera.view==='top'){contourPath(ctx,sg);ctx.fillStyle=colorValue(options.smooth.color);ctx.fill();}else drawCoat(ctx,{...d,coat:options.smooth.color},sg);}ctx.restore();}
 if(options.ghost&&d.layers.length){ctx.globalAlpha=.6;const gg=geometry(d,options.ghost.level??camera.level,camera.view);items[options.ghost.item]?.group==='filling'?fillingPortion(ctx,options.ghost.item,options.ghost,gg):drawDecoration(ctx,options.ghost,gg,false);ctx.globalAlpha=1;}
 if(options.cursor&&options.tool==='pour')window.CakePourArt?.jug(ctx,options.cursor,colorValue(options.color),options.pourFlowing,options.pourRate);else if(options.cursor){const p=options.cursor;ctx.save();const tip=options.previewStroke?.flowVersion===1?flowTips.get(options.previewStroke):null;ctx.translate(tip?.x??p.x,tip?.y??p.y);if(options.tool==='smooth')image(ctx,'tools/spatula',-16,-149,168,168);else image(ctx,'tools/pipe',-13,-147,165,165);ctx.restore();}ctx.restore();return g;}

function point(canvas,e){const r=canvas.getBoundingClientRect(),c=cameras.get(canvas)||{scale:1,tx:0,ty:0,frameWidth:760},width=c.frameWidth||760,fit=Math.min(r.width/width,r.height/640);return{x:((e.clientX-r.left-(r.width-width*fit)/2)/fit-c.tx)/c.scale,y:((e.clientY-r.top-(r.height-640*fit)/2)/fit-c.ty)/c.scale};}
function autoSurface(d,p,view='perspective'){
 // Test visible solids from the uppermost tier down before considering the plate.
 for(const tier of CakeCore.tiers(d).slice().reverse()){
  const level=tier.end,g=geometry(d,level,view),u=(p.x-g.x)/g.rx,v=(p.y-g.y)/g.ry;
  if(CakeCore.exposed(d,level,u,v,'top'))return {u,v,surface:'top',level};
  const front=CakeCore.frontEdge(g.shape,u),sideV=(p.y-g.y-g.ry*(front??0))/(g.tierHeight||g.height);
  if(view!=='top'&&front!==null&&CakeCore.exposed(d,level,u,sideV,'side'))return {u,v:sideV,surface:'side',level};
 }
 const g=geometry(d,0,view),u=(p.x-g.x)/g.rx,v=(p.y-g.y)/g.ry;
 if(!CakeCore.plateExposed(d,u,v))return null;
 if(view!=='top')for(let i=1;i<=d.layers.length;i++){const cg=geometry(d,i,view),cu=(p.x-cg.x)/cg.rx,cv=(p.y-cg.y)/cg.ry,front=CakeCore.frontEdge(cg.shape,cu);if(CakeCore.onSurface('top',cu,cv,cg.shape)||Math.abs(cu)<1&&front!==null&&p.y>=cg.y+front*cg.ry&&p.y<=cg.y+front*cg.ry+layerHeight(d.layers[i-1]))return null;}
 return {u,v,surface:'plate',level:0};
}
function surfacePoint(canvas,d,e,mode='auto',clamp=false,lockedLevel=null){
 if(mode==='auto'&&!lockedLevel)return autoSurface(d,point(canvas,e),cameras.get(canvas)?.view||'perspective');
 if(mode==='plate'){const p=point(canvas,e),camera=cameras.get(canvas)||{},g=geometry(d,0,camera.view),u=(p.x-g.x)/g.rx,v=(p.y-g.y)/g.ry;if(!CakeCore.plateExposed(d,u,v))return null;
 // The back of the plate can be hidden by a tall cake in the oblique view.
 if(camera.view!=='top')for(let i=1;i<=d.layers.length;i++){const cg=geometry(d,i,camera.view),cu=(p.x-cg.x)/cg.rx,cv=(p.y-cg.y)/cg.ry,front=CakeCore.frontEdge(cg.shape,cu);if(CakeCore.onSurface('top',cu,cv,cg.shape)||Math.abs(cu)<1&&front!==null&&p.y>=cg.y+front*cg.ry&&p.y<=cg.y+front*cg.ry+layerHeight(d.layers[i-1]))return null;}return{u,v,surface:'plate',level:0};}
 const p=point(canvas,e),camera=cameras.get(canvas)||{},requested=lockedLevel||camera.level||d.layers.length,level=mode==='filling'?d.layers.length:requested,g=geometry(d,mode==='filling'&&d.layers.at(-1)?.kind==='filling'?d.layers.length-1:level,camera.view);if(mode==='filling')mode='top';if(!g.height)return null;const u=(p.x-g.x)/g.rx,v=(p.y-g.y)/g.ry;if(mode!=='side'&&CakeCore.exposed(d,level,u,v,'top'))return{u,v,surface:'top',level};const sideV=(p.y-g.y-g.ry*(CakeCore.frontEdge(g.shape,u)??0))/(g.tierHeight||g.height);if(camera.view!=='top'&&mode!=='top'&&CakeCore.exposed(d,level,u,sideV,'side'))return{u,v:sideV,surface:'side',level};if(clamp&&mode==='top'){const q=CakeCore.clampTop(u,v,g.shape);if(CakeCore.exposed(d,level,q.u,q.v,'top'))return{...q,surface:'top',level};}return null;}

function topPoint(canvas,d,e){const p=point(canvas,e),g=geometry(d);return{u:(p.x-g.x)/g.rx,v:(p.y-g.y)/g.ry};}
function hit(canvas,d,e){const p=point(canvas,e),camera=cameras.get(canvas)||{},view=camera.view||'perspective',level=camera.level||d.layers.length,g=geometry(d,level,view),tier=CakeCore.tiers(d).find(t=>level>t.start&&level<=t.end),visible=o=>{if(o.surface==='side'&&view==='top')return false;if(!CakeCore.exposed(d,o.level,o.u,o.v,o.surface||'top'))return false;const anchor=project(o,geometry(d,o.level,view),o.surface||'top'),at=autoSurface(d,anchor,view);if(!at||at.surface!==(o.surface||'top'))return false;if(o.surface==='plate')return true;if(o.surface==='side'){const t=CakeCore.tiers(d).find(t=>o.level>t.start&&o.level<=t.end);return at.level===t?.end;}return at.level===o.level;};for(const o of [...d.decos].filter(visible).sort((a,b)=>decoOrder(b,a))){const pos=project(o,geometry(d,o.level,view),o.surface||'top'),a=-o.angle*Math.PI/180,dx=p.x-pos.x,dy=p.y-pos.y,px=dx*Math.cos(a)-dy*Math.sin(a),py=dx*Math.sin(a)+dy*Math.cos(a),[w,h]=decoSizes[o.item]||[50,50],anchor=o.surface==='side'?.5:(items[o.item]?.anchor??.88);if(Math.abs(px)<(w/2+4)*o.scale&&py>-(h*anchor+4)*o.scale&&py<(h*(1-anchor)+4)*o.scale)return o;}
 for(const s of [...d.strokes].reverse()){if(s.surface==='plate'?false:s.surface==='side'?view==='top':s.level!==level)continue;const sg=geometry(d,s.level,view),pts=s.flowVersion===1?(flowGeometry(d).find(row=>row.s===s)?.mesh||CakePiping.mesh(s)).map(q=>flowProjection(q,sg,s)):s.points.map(q=>({...project(q,sg,s.surface),break:q.break}));for(let i=0;i<pts.length;i++){const b=pts[i],a=b.break?b:pts[Math.max(0,i-1)],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));if(Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)<(b.r||s.size/2)+5)return{...s,kind:'stroke'};}}return null;}
function icon(k,shape='round',size=8){const it=items[k]||{};if(it.custom){const src=sprites[k]?.src;return src?'<img class="icon" src="'+src+'" alt="" draggable="false">':'<span class="icon" aria-label="配件加载中">◇</span>';}if(it.renderBase||it.portion){const data=flavorIcon(k,shape,size);if(data)return `<img class="icon" src="${data}" alt="" draggable="false">`;}const map={base:'vanilla',chocobase:'chocolate',teabase:'tea',cream:'whipped',cookie:'biscuit',choc:'choc',berry:'berry',flower:'flower',flour:'flour',egg:'egg',milk:'milk',sugar:'sugar',cocoa:'cocoa',matcha:'matcha',jam:'berryfill',cookiejar:'cookiefill',chocojar:'ganache'},src=it.asset||({berryfill:'extras/bowl-berry',cookiefill:'extras/bowl-cookie',chocofill:'extras/bowl-choco'}[k])||(k==='cream'?'cream-bowl':map[it.icon]);if(src)return `<img class="icon" src="assets/${src}.png" alt="" draggable="false">`;return '<span class="icon raw-icon sugar-pearls" aria-hidden="true">●</span>';}
window.CakeArt={registerAsset,clearCustomAssets,image,sceneBounds,draw,setView,loaded,geometry,point,topPoint,autoSurface,surfacePoint,project,hit,icon,drawStroke,colorValue,layerHeight,fillingLayout,creamSamples,decoOrder,nozzlePreview,surfacePath,contourPath};
})();

