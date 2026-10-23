(function(){
'use strict';
const cache=new WeakMap(),projectionMaps=new Map(),{N,W,H,sample,boundary}=CakePour;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function texture(field,width,height,color,side){const c=document.createElement('canvas');c.width=side?256:128;c.height=side?96:128;const ctx=c.getContext('2d'),im=ctx.createImageData(c.width,c.height),rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const fx=x/(c.width-1)*(width-1),fy=y/(c.height-1)*(height-1),h=sample(field,width,height,fx,fy),i=(y*c.width+x)*4;if(h<.018)continue;const dx=sample(field,width,height,fx+.35,fy)-sample(field,width,height,fx-.35,fy),dy=sample(field,width,height,fx,fy+.35)-sample(field,width,height,fx,fy-.35),edge=clamp((.12-h)/.1,0,1),light=clamp((-dx-dy)*19,-16,25)+Math.min(7,h*2)-edge*32-(side?10:0);for(let k=0;k<3;k++)im.data[i+k]=clamp(rgb[k]+light,0,255);im.data[i+3]=Math.round(clamp((h-.018)/.035,0,1)*255);}ctx.putImageData(im,0,0);return c;}
function assets(record){let a=cache.get(record);if(!a||a.revision!==(record.revision||0)){a={revision:record.revision||0,top:texture(record.top,N,N,record.color,false),side:texture(record.side,W,H,record.color,true),rim:boundary(record.shape)};cache.set(record,a);}return a;}
function records(d,options){const live=options.pour;if(!live)return d.glazes||[];const list=Array.isArray(live)?live:[live],ids=new Set(list.map(p=>p.id));return [...(d.glazes||[]).filter(p=>!ids.has(p.id)),...list];}
function top(ctx,d,level,g,options){for(const p of records(d,options)){if(p.level!==level||p.total<=0)continue;const a=assets(p);ctx.save();CakeArt.contourPath(ctx,g);ctx.clip();ctx.drawImage(a.top,g.x-g.rx,g.y-g.ry,g.rx*2,g.ry*2);ctx.restore();}}
function projectedSide(a,g){
 const h=g.tierHeight||g.height,key=[g.rx,g.ry,h].join(':');a.projections??=new Map();if(a.projections.has(key))return a.projections.get(key);
 const scale=1.5,c=document.createElement('canvas');c.width=Math.ceil(g.rx*2*scale);c.height=Math.ceil((h+g.ry*2)*scale);const context=c.getContext('2d'),rim=a.rim;
 // Rasterize into integer columns once, then composite as a single image.
 // Adjacent sheared Canvas strips leave dark antialias seams on the cake.
 const mapKey=[g.shape,c.width,g.ry].join(':');let columns=projectionMaps.get(mapKey);if(!columns){columns=[];for(let x=0;x<c.width;x++){const u=(x+.5)/c.width*2-1;let v=-Infinity,arc=0;for(let i=0;i<W;i++){const b=rim[i],next=rim[(i+1)%W],dx=next.u-b.u;if(Math.abs(dx)<1e-8)continue;const t=(u-b.u)/dx;if(t<0||t>1)continue;const candidate=b.v+(next.v-b.v)*t;if(candidate>v){v=candidate;arc=(i+t)%W;}}columns.push({v,arc});}projectionMaps.set(mapKey,columns);}
 for(let x=0;x<c.width;x++){const {v,arc}=columns[x];if(!Number.isFinite(v))continue;const sx=clamp(arc/W*a.side.width-.5,0,a.side.width-1);context.drawImage(a.side,sx,0,1,a.side.height,x,(v+1)*g.ry*scale,1,h*scale);}
 a.projections.set(key,c);return c;
}
function side(ctx,d,level,g,options){if(g.view==='top')return;for(const p of records(d,options)){if(p.level!==level||p.total<=0)continue;const a=assets(p),c=projectedSide(a,g);ctx.drawImage(c,g.x-g.rx,g.y-g.ry,g.rx*2,(g.tierHeight||g.height)+g.ry*2);}}

function jug(ctx,p,color,flowing,flow=1){ctx.save();if(flowing){ctx.strokeStyle=color;ctx.lineCap='round';ctx.lineWidth=3+flow*3;ctx.beginPath();ctx.moveTo(p.x-6,p.y-79);ctx.bezierCurveTo(p.x-1,p.y-60,p.x,p.y-30,p.x,p.y);ctx.stroke();ctx.strokeStyle='#fffdf0b0';ctx.lineWidth=1.4;ctx.stroke();ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(p.x,p.y,7+flow*2,3.2,0,0,Math.PI*2);ctx.fill();}ctx.translate(p.x-7,p.y-80);ctx.rotate(.35);ctx.lineWidth=2.4;ctx.strokeStyle='#966548';ctx.fillStyle='#fff3dc';ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(-17,-5);ctx.quadraticCurveTo(-18,39,-43,40);ctx.quadraticCurveTo(-66,37,-68,-10);ctx.lineTo(-68,-22);ctx.quadraticCurveTo(-34,-30,-15,-15);ctx.closePath();ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(-66,-12);ctx.bezierCurveTo(-100,-26,-102,28,-65,24);ctx.stroke();ctx.fillStyle='#b7d3d9';ctx.beginPath();ctx.roundRect(-59,-6,32,24,8);ctx.fill();ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(-40,-16,23,6,.1,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#fffdf2';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-58,0);ctx.quadraticCurveTo(-58,21,-49,28);ctx.stroke();ctx.restore();}
window.CakePourArt={top,side,jug};
})();
