(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CakePiping=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 // Material volume, not event count, drives the shape. A yield-stress deposit
 // keeps its body; excess mass spreads the footprint under its own weight.
 const rate=size=>size**3*1.8;
 function feed(s,p,seconds,accept=()=>true){
  if(!p)return;const q=rate(s.size)*Math.max(0,Math.min(.12,seconds)),last=s.points.at(-1),distance=last?Math.hypot((p.u-last.u)*180,(p.v-last.v)*180):0;
  if(last&&!p.break&&distance<s.size*.22){last.q+=q;}
  else{const steps=last&&!p.break?Math.min(200,Math.max(1,Math.ceil(distance/(s.size*.3)))):1;let gap=!!p.break;for(let i=1;i<=steps;i++){const t=i/steps,n={u:last&&!p.break?last.u+(p.u-last.u)*t:p.u,v:last&&!p.break?last.v+(p.v-last.v)*t:p.v,q:Math.max(.001,q/steps)};if(!accept(n.u,n.v)){gap=true;continue;}if(gap)n.break=true;s.points.push(n);gap=false;}}
  s.revision=(s.revision||0)+1;
 }
 function valid(s){return s.flowVersion===undefined||s.flowVersion===1&&s.style==='round'&&(s.tip===undefined||typeof s.tip==='boolean')&&s.points.every(p=>Number.isFinite(p.q)&&p.q>=0&&p.q<=1e9);}
 function mesh(s,field=new Map()){
  const out=[],cell=5,lengths=s.points.map((p,i)=>{const a=i&&!p.break?s.points[i-1]:p,b=s.points[i+1]&&!s.points[i+1].break?s.points[i+1]:p;return (Math.hypot((p.u-a.u)*180,(p.v-a.v)*180)+Math.hypot((b.u-p.u)*180,(b.v-p.v)*180))*.5;});let travel=0,previous=null;
  for(let i=0;i<s.points.length;i++){
   const p=s.points[i],x=p.u*180,y=p.v*180,next=s.points[i+1];let length=previous&&!p.break?Math.hypot(x-previous.x,y-previous.y):0;
   travel+=length;if(next&&!next.break)length=(length+Math.hypot((next.u-p.u)*180,(next.v-p.v)*180))*.5;
   const q=p.q||.001,base=s.size*.32;
   const mound=length<.01||q>s.size**3*.45&&q>Math.PI*(s.size*.5)**2*Math.max(length,1)*3.5;
   let mass=q,span=Math.max(length,.1);
   if(!mound){mass=0;span=0;for(let j=Math.max(0,i-2);j<=Math.min(s.points.length-1,i+2);j++){if(s.points.slice(Math.min(i,j)+1,Math.max(i,j)+1).some(p=>p.break)||s.points[j].q>s.size**3*.45)continue;mass+=s.points[j].q;span+=lengths[j];}}
   const r=mound?Math.cbrt(q/2.1+base**3):Math.max(s.size*.12,Math.min(s.size*.65,Math.sqrt(mass/(Math.PI*Math.max(span,.1)*.7))));
   const h=mound?q/(Math.PI*r*r*.7):r*1.45;
   let support=0;const cells=[];
   for(let cx=Math.floor((x-r)/cell);cx<=Math.ceil((x+r)/cell);cx++)for(let cy=Math.floor((y-r)/cell);cy<=Math.ceil((y+r)/cell);cy++){
    const distance=Math.hypot(cx*cell-x,cy*cell-y);if(distance>r+cell*.5)continue;const key='flow:'+cx+','+cy,old=field.get(key);cells.push([key,distance]);
    if(old&&distance<r*.55+cell*.5)support=Math.max(support,old.owner===s&&travel-old.travel<s.size*2.5?old.base:old.h);
   }
   // Compress supported cream gently instead of growing a rigid vertical column.
   support*=.94;const body={x,y,u:p.u,v:p.v,r,h,z:support,break:p.break,mound};out.push(body);
   for(const [key,distance]of cells){const crown=Math.sqrt(Math.max(0,1-(distance/(r+cell*.5))**2));const old=field.get(key);const height=support+h*crown;if(!old||height>=old.h)field.set(key,{h:height,base:support,owner:s,travel});}
   previous={x,y};
  }
  return out;
 }
 return {rate,feed,valid,mesh};
});
