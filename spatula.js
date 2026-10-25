(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CakeSpatula=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// Height-map scraper adapted from the supplied spatula-lab prototype.
// Heights are in 8-world-unit increments; the blade carries volume, not opacity.
const UNIT=8,decoded=new WeakMap(),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rgb=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));
function create(nx,ny,width,depth,mask){const count=nx*ny;return {nx,ny,width,depth,dx:width/nx,dy:depth/ny,H:new Float32Array(count),G:new Float32Array(count),R:new Float32Array(count),C:new Float32Array(count),B:new Float32Array(count),wet:new Float32Array(count),mask:mask||new Uint8Array(count).fill(1),absorbed:[],films:[],revision:0};}
function add(f,i,h,col){if(h<=0||!f.mask[i])return;const old=f.H[i],total=old+h;f.R[i]=(f.R[i]*old+col[0]*h)/total;f.C[i]=(f.C[i]*old+col[1]*h)/total;f.B[i]=(f.B[i]*old+col[2]*h)/total;f.H[i]=total;}
function cell(f,x,y){const ix=Math.floor(x/f.dx),iy=Math.floor(y/f.dy);if(ix<0||iy<0||ix>=f.nx||iy>=f.ny)return -1;const i=iy*f.nx+ix;return f.mask[i]?i:-1;}
function sample(f,x,y,array=f.H){const fx=clamp(x/f.dx-.5,0,f.nx-1),fy=clamp(y/f.dy-.5,0,f.ny-1),ix=Math.floor(fx),iy=Math.floor(fy),a=fx-ix,b=fy-iy,at=(x,y)=>array[Math.min(f.ny-1,y)*f.nx+Math.min(f.nx-1,x)];return (at(ix,iy)*(1-a)+at(ix+1,iy)*a)*(1-b)+(at(ix,iy+1)*(1-a)+at(ix+1,iy+1)*a)*b;}
function blob(f,x,y,r,h,col){const ext=r*2;for(let yy=Math.max(0,Math.floor((y-ext)/f.dy));yy<=Math.min(f.ny-1,Math.ceil((y+ext)/f.dy));yy++)for(let xx=Math.max(0,Math.floor((x-ext)/f.dx));xx<=Math.min(f.nx-1,Math.ceil((x+ext)/f.dx));xx++){const d=((xx+.5)*f.dx-x)**2+((yy+.5)*f.dy-y)**2;if(d>ext*ext)continue;add(f,yy*f.nx+xx,h*Math.exp(-d/(r*r)),col);}}
// A finite contact patch accepts only a soft bead's worth of cream. Excess
// stays on the blade instead of being renormalized into a one-cell tower at rims.
function splat(f,x,y,m,col,ceiling=.8){if(m<=0)return 0;const radius=8,cells=[];let total=0;for(let yy=Math.max(0,Math.floor((y-radius)/f.dy));yy<=Math.min(f.ny-1,Math.floor((y+radius)/f.dy));yy++)for(let xx=Math.max(0,Math.floor((x-radius)/f.dx));xx<=Math.min(f.nx-1,Math.floor((x+radius)/f.dx));xx++){const i=yy*f.nx+xx;if(!f.mask[i])continue;const d=(((xx+.5)*f.dx-x)**2+((yy+.5)*f.dy-y)**2)/(radius*radius);if(d>=1)continue;const w=(1-d)**2,capacity=Math.max(0,ceiling-f.H[i])*area(f,i);if(capacity<=0)continue;cells.push([i,w,capacity]);total+=w;}if(!total)return 0;let given=0;for(const [i,w,capacity]of cells){const amount=Math.min(capacity,m*w/total);add(f,i,amount/area(f,i),col);f.wet[i]=1;given+=amount;}return Math.min(m,given);}
// Only old, needle-like corruption is relaxed. Move height AND pigment mass;
// do not clip height away, flatten ordinary piping, or mutate the saved record.
function repairSpikes(f){let active=new Set();const w=f.nx,h=f.ny,neighbors=i=>{const x=i%w,y=Math.floor(i/w);return[x?i-1:-1,x<w-1?i+1:-1,y?i-w:-1,y<h-1?i+w:-1];};for(let i=0;i<f.H.length;i++)if(f.mask[i]&&f.H[i]>3&&neighbors(i).some(j=>j>=0&&f.mask[j]&&f.H[i]-f.H[j]>1.5))active.add(i);if(!active.size)return false;
 for(let pass=0;pass<400&&active.size;pass++){const next=new Set();for(const i of active){if(!f.mask[i])continue;for(const j of neighbors(i)){if(j<0||!f.mask[j])continue;const diff=f.H[i]-f.H[j],from=diff>0?i:j,to=diff>0?j:i,excess=Math.abs(diff)-.07;if(excess<=.001)continue;const m=excess*.24*Math.min(area(f,from),area(f,to));add(f,to,m/area(f,to),[f.R[from],f.C[from],f.B[from]]);f.H[from]-=m/area(f,from);next.add(i);next.add(j);}}active=next;}f.revision++;return true;}
function area(f,i){return f.rowArea?f.rowArea[Math.floor(i/f.nx)]:f.dx*f.dy;}
function volume(f){return f.H.reduce((n,h,i)=>n+h*area(f,i),0);}
function pigmentMass(f){const out=[0,0,0];for(let i=0;i<f.H.length;i++){const cellArea=area(f,i);out[0]+=f.H[i]*f.R[i]*cellArea;out[1]+=f.H[i]*f.C[i]*cellArea;out[2]+=f.H[i]*f.B[i]*cellArea;}return out;}
function to64(bytes){if(typeof Buffer!=='undefined')return Buffer.from(bytes).toString('base64');let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
function from64(s){if(typeof Buffer!=='undefined')return new Uint8Array(Buffer.from(s,'base64'));const b=atob(s);return Uint8Array.from(b,c=>c.charCodeAt(0));}
function pack(f){let max=0;for(const h of f.H)max=Math.max(max,h);const unit=Math.max(1/4096,max/65535),out=[];let previous='',run=0,pixel=[];
 const flush=()=>{if(run)out.push(run&255,run>>8,...pixel);};
 for(let i=0;i<f.H.length;i++){const h=Math.round(f.H[i]/unit),next=[h&255,h>>8,Math.round(f.R[i]),Math.round(f.C[i]),Math.round(f.B[i]),Math.round(clamp(f.G[i],0,1)*255)],key=next.join(',');if(key===previous&&run<65535)run++;else{flush();previous=key;pixel=next;run=1;}}flush();return {version:2,nx:f.nx,ny:f.ny,width:f.width,depth:f.depth,unit,data:to64(Uint8Array.from(out)),absorbed:[...f.absorbed],films:[...f.films]};}
function valid(record){if(!record||![1,2].includes(record.version)||![128,192,256].includes(record.nx)||!Number.isInteger(record.ny)||record.ny<4||record.ny>1024||!Number.isFinite(record.width)||record.width<1||record.width>360||!Number.isFinite(record.depth)||record.depth<1||record.depth>1600||!Number.isFinite(record.unit)||record.unit<=0||record.unit>100||typeof record.data!=='string'||record.data.length>record.nx*record.ny*12||!Array.isArray(record.absorbed)||record.absorbed.length>120||!Array.isArray(record.films)||record.films.length>24||[...record.absorbed,...record.films].some(s=>typeof s!=='string'||s.length>100))return false;
 try{const bytes=from64(record.data);if(bytes.length%8)return false;let count=0;for(let i=0;i<bytes.length;i+=8){const run=bytes[i]+bytes[i+1]*256;if(!run)return false;count+=run;}return count===record.nx*record.ny;}catch{return false;}}
function unpack(record){if(record.H)return record;if(decoded.has(record))return decoded.get(record);if(!valid(record))throw Error('抹面高度图损坏');const f=create(record.nx,record.ny,record.width,record.depth),bytes=from64(record.data);let at=0;for(let j=0;j<bytes.length;j+=8){const n=bytes[j]+bytes[j+1]*256;for(let k=0;k<n;k++){f.H[at]=(bytes[j+2]+bytes[j+3]*256)*record.unit;f.R[at]=bytes[j+4];f.C[at]=bytes[j+5];f.B[at]=bytes[j+6];f.G[at]=bytes[j+7]/255;at++;}}f.absorbed=[...record.absorbed];f.films=[...record.films];decoded.set(record,f);return f;}
function clone(f){const out=create(f.nx,f.ny,f.width,f.depth,f.mask.slice());for(const key of ['H','R','C','B','G'])out[key].set(f[key]);out.absorbed=[...f.absorbed];out.films=[...f.films];return out;}
function blade(options={},saved){const length=options.blade===56?78.75:157.5,S=Math.ceil(length/.85),sp={length,S,press:[.5,.3,.14].includes(options.press)?options.press:.3,a:0,carry:new Float64Array(S),colors:new Float64Array(S*3),stri:new Float32Array(S),removed:0,contact:0};
 for(let i=0;i<S;i++)sp.stri[i]=.0035*Math.sin(i*.23)+.0015*Math.sin(i*.71);
 if(saved?.carry?.length===S&&saved.colors?.length===S*3){sp.carry.set(saved.carry);sp.colors.set(saved.colors);sp.a=saved.a||0;}else if(saved?.carry){const total=saved.carry.reduce((n,v)=>n+v,0),col=[0,0,0];for(let i=0;i<saved.carry.length;i++)for(let k=0;k<3;k++)col[k]+=saved.carry[i]*saved.colors[i*3+k];if(total)for(let i=0;i<S;i++){sp.carry[i]=total/S;for(let k=0;k<3;k++)sp.colors[i*3+k]=col[k]/total;}}
 return sp;}
function validBlade(s){return s===undefined||s&&Number.isFinite(s.a)&&Array.isArray(s.carry)&&s.carry.length<=200&&s.carry.every(v=>Number.isFinite(v)&&v>=0&&v<1e10)&&Array.isArray(s.colors)&&s.colors.length===s.carry.length*3&&s.colors.every(v=>Number.isFinite(v)&&v>=0&&v<=255.001);}
function bladeSave(sp){return {a:sp.a,carry:Array.from(sp.carry),colors:Array.from(sp.colors)};}
function mix(sp,k,m,col){const old=sp.carry[k],total=old+m;if(!total)return;for(let c=0;c<3;c++)sp.colors[k*3+c]=(sp.colors[k*3+c]*old+col[c]*m)/total;sp.carry[k]=total;}
function sweep(f,sp,x0,y0,x1,y1){const dx=x1-x0,dy=y1-y0,dist=Math.hypot(dx,dy);sp.removed=0;sp.contact=0;if(dist<.001)return false;const ta=Math.atan2(dy,dx),da=Math.atan2(Math.sin(ta-sp.a),Math.cos(ta-sp.a));sp.a+=da*Math.min(1,dist/7);
 const nx=Math.cos(sp.a),ny=Math.sin(sp.a),ba=sp.a+Math.PI/2+.42,bx=Math.cos(ba),by=Math.sin(ba),steps=Math.ceil(dist/.65),step=dist/steps,spacing=sp.length/(sp.S-1),plus=bx*nx+by*ny<0,slide=Math.min(.9,step*Math.tan(.42)/spacing),stamp=new Int32Array(f.H.length);let changed=false;
 for(let s=1;s<=steps;s++){const x=x0+dx*s/steps,y=y0+dy*s/steps;
  for(let k=0;k<sp.S;k++){const off=(k/(sp.S-1)-.5)*sp.length,i=cell(f,x+bx*off,y+by*off);if(i<0||stamp[i]===s)continue;stamp[i]=s;const cellArea=area(f,i),e=Math.max(0,Math.abs(k/(sp.S-1)-.5)*2-.9)/.1,target=Math.max(.02,sp.press+sp.stri[k]+e*e*.18),h=f.H[i];
   if(h>target){const m=(h-target)*cellArea;f.H[i]=target;mix(sp,k,m,[f.R[i],f.C[i],f.B[i]]);sp.removed+=m;sp.contact++;changed=true;}
   else if(sp.carry[k]>0&&h<target){const m=Math.min(sp.carry[k],(target-h)*cellArea);add(f,i,m/cellArea,Array.from(sp.colors.subarray(k*3,k*3+3)));sp.carry[k]-=m;sp.contact++;changed=true;}
   if(h>.02){f.wet[i]=1;if(f.H[i]>target-.06)f.G[i]=Math.min(1,f.G[i]+.35);}
  }
  // Wet the blade ends and the lip pushed ahead of the blade, as in the lab,
  // so the ridge left there can slump instead of freezing into a crater ring.
  {const cs=Math.min(f.dx,f.dy),ext=sp.length/2;for(const sg of [-1,1])for(let o=0;o<6;o++){const off=sg*(ext+o*cs*.8);for(let a=-1;a<=3;a++){const i=cell(f,x+bx*off+nx*a*cs,y+by*off+ny*a*cs);if(i>=0)f.wet[i]=1;}}
   for(let k=0;k<sp.S;k+=2){const off=(k/(sp.S-1)-.5)*sp.length;for(let a=1;a<=3;a++){const i=cell(f,x+bx*off+nx*a*cs,y+by*off+ny*a*cs);if(i>=0)f.wet[i]=Math.max(f.wet[i],.8);}}}
  // Conservative exchange along the blade replaces the prototype's lossy blur.
  for(let pass=0;pass<2;pass++)for(let k=pass%2;k<sp.S-1;k+=2){const diff=(sp.carry[k]-sp.carry[k+1])*.22,from=diff>0?k:k+1,to=diff>0?k+1:k,m=Math.abs(diff);mix(sp,to,m,Array.from(sp.colors.subarray(from*3,from*3+3)));sp.carry[from]-=m;}
  const end=plus?sp.S-1:0,dir=plus?1:-1;
  for(let n=0;n<sp.S;n++){const k=plus?sp.S-1-n:n,m=sp.carry[k]*slide;if(m<=0)continue;const col=Array.from(sp.colors.subarray(k*3,k*3+3));if(k===end){const off=(k/(sp.S-1)-.5)*sp.length+dir*2;const given=splat(f,x+bx*off,y+by*off,m,col,sp.press+.25);sp.carry[k]-=given;if(given)changed=true;}else{sp.carry[k]-=m;mix(sp,k+dir,m,col);}}
 }
 if(changed)f.revision++;return changed;
}
function lift(f,sp,x,y){const nx=Math.cos(sp.a),ny=Math.sin(sp.a),bx=Math.cos(sp.a+Math.PI/2+.42),by=Math.sin(sp.a+Math.PI/2+.42);let out=0;for(let k=0;k<sp.S;k++){const m=Math.min(1,sp.carry[k]*.55),off=(k/(sp.S-1)-.5)*sp.length,col=Array.from(sp.colors.subarray(k*3,k*3+3)),given=splat(f,x+bx*off+nx*2,y+by*off+ny*2,m,col,sp.press+.25);sp.carry[k]-=given;out+=given;}if(out)f.revision++;return out;}
function settle(f){let moved=false;for(let y=0;y<f.ny;y++)for(let x=0;x<f.nx;x++){const i=y*f.nx+x;if(!f.mask[i]||f.wet[i]<.02)continue;for(const j of [x+1<f.nx?i+1:-1,y+1<f.ny?i+f.nx:-1]){if(j<0||!f.mask[j])continue;const diff=(f.H[i]-f.H[j])*.25*Math.max(f.wet[i],f.wet[j]),from=diff>0?i:j,to=diff>0?j:i,m=Math.min(Math.abs(diff)*Math.min(area(f,i),area(f,j)),f.H[from]*area(f,from)*.2);if(m<1e-7)continue;add(f,to,m/area(f,to),[f.R[from],f.C[from],f.B[from]]);f.H[from]-=m/area(f,from);f.wet[to]=Math.max(f.wet[to],f.wet[from]*.7);moved=true;}f.wet[i]*=.96;}if(moved)f.revision++;return moved;}

return {UNIT,create,add,cell,sample,blob,splat,volume,pigmentMass,pack,unpack,valid,clone,repairSpikes,blade,validBlade,bladeSave,sweep,lift,settle,rgb};
});
