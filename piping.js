(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CakePiping=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 // Material volume, not event count, drives the shape. A yield-stress deposit
 // keeps its body; excess mass spreads the footprint under its own weight.
 const rate=size=>size**3*1.8;
 const px=(s,p)=>s.surface==='side'&&Number.isFinite(p.a)?p.a*180:p.u*180;
 function feed(s,p,seconds,accept=()=>true){
  if(!p)return;const q=rate(s.size)*Math.max(0,Math.min(.12,seconds)),last=s.points.at(-1),distance=last?Math.hypot(px(s,p)-px(s,last),(p.v-last.v)*180):0;
  if(last&&!p.break&&distance<s.size*.22){last.q+=q;}
  else{const steps=last&&!p.break?Math.min(200,Math.max(1,Math.ceil(distance/(s.size*.3)))):1;let gap=!!p.break;for(let i=1;i<=steps;i++){const t=i/steps,n={u:last&&!p.break?last.u+(p.u-last.u)*t:p.u,v:last&&!p.break?last.v+(p.v-last.v)*t:p.v,q:Math.max(.001,q/steps),...(Number.isFinite(p.a)?{a:last&&!p.break&&Number.isFinite(last.a)?last.a+(p.a-last.a)*t:p.a}:{})};if(!accept(n.u,n.v)){gap=true;continue;}if(gap)n.break=true;s.points.push(n);gap=false;}}
  s.revision=(s.revision||0)+1;
 }
 function valid(s){return Array.isArray(s.points)&&s.points.every(p=>p.a===undefined||s.surface==='side'&&Number.isFinite(p.a)&&Math.abs(p.a)<1e6)&&(s.flowVersion===undefined||s.flowVersion===1&&s.style==='round'&&(s.tip===undefined||typeof s.tip==='boolean')&&s.points.every(p=>Number.isFinite(p.q)&&p.q>=0&&p.q<=1e9));}
 function mesh(s,field=new Map(),stream=null){
  // Rewind the mutable tail: density uses two neighbours, whose lengths
  // depend on one further point. Earlier deposits are immutable while drawing.
  const owner=s.owner||s;
  const start=stream?Math.max(0,(stream.count||0)-4):0,out=stream?.out||[],cell=5;
  if(stream){for(let i=(stream.journal?.length||0)-1;i>=start;i--)for(const [key,old]of stream.journal[i]){if(old===undefined)field.delete(key);else field.set(key,old);}stream.journal=(stream.journal||[]).slice(0,start);stream.travel=(stream.travel||[]).slice(0,start);out.length=start;}
  const lengths=[];for(let i=Math.max(0,start-2);i<s.points.length;i++){const p=s.points[i],a=i&&!p.break?s.points[i-1]:p,b=s.points[i+1]&&!s.points[i+1].break?s.points[i+1]:p;lengths[i]=(Math.hypot(px(s,p)-px(s,a),(p.v-a.v)*180)+Math.hypot(px(s,b)-px(s,p),(b.v-p.v)*180))*.5;}
  let travel=start?stream.travel[start-1]:0,previous=start?out[start-1]:null;
  for(let i=start;i<s.points.length;i++){
   const changes=[];
   const p=s.points[i],x=px(s,p),y=p.v*180,next=s.points[i+1];let length=previous&&!p.break?Math.hypot(x-previous.x,y-previous.y):0;
   travel+=length;if(next&&!next.break)length=(length+Math.hypot(px(s,next)-px(s,p),(next.v-p.v)*180))*.5;
   const q=p.q||.001,base=s.size*.32;
   const mound=length<.01||q>s.size**3*.45&&q>Math.PI*(s.size*.5)**2*Math.max(length,1)*3.5;
   let mass=q,span=Math.max(length,.1);
   if(!mound){mass=0;span=0;for(let j=Math.max(0,i-2);j<=Math.min(s.points.length-1,i+2);j++){if(s.points.slice(Math.min(i,j)+1,Math.max(i,j)+1).some(p=>p.break)||s.points[j].q>s.size**3*.45)continue;mass+=s.points[j].q;span+=lengths[j];}}
   let r=mound?Math.cbrt(q/2.1+base**3):Math.max(s.size*.12,Math.min(s.size*.65,Math.sqrt(mass/(Math.PI*Math.max(span,.1)*.7))));
   const fluid=s.material==='filling';if(fluid)r=mound?Math.cbrt(q/(Math.PI*.14)+base**3):Math.max(s.size*.4,Math.sqrt(mass/(Math.PI*Math.max(span,1)*.14)));const flat=s.polishAt?.(p)||0,h=(fluid?Math.min(16,r*.28):(mound?q/(Math.PI*r*r*.7):r*1.45))*(1-flat);
   let support=0;const cells=[];
   for(let cx=Math.floor((x-r)/cell);cx<=Math.ceil((x+r)/cell);cx++)for(let cy=Math.floor((y-r)/cell);cy<=Math.ceil((y+r)/cell);cy++){
    const distance=Math.hypot(cx*cell-x,cy*cell-y);if(distance>r+cell*.5)continue;const angular=s.surface==='side'&&Number.isFinite(p.a),arc=angular?((Math.round(cx*cell/180/(Math.PI*2)*256)%256)+256)%256:cx,key=(angular?'arc:':'flow:')+arc+','+cy,old=field.get(key);cells.push([key,distance]);
    if(old&&distance<r*.55+cell*.5)support=Math.max(support,old.owner===owner&&travel-old.travel<s.size*2.5?old.base:fluid&&old.material==='filling'?old.h*.28:old.h);
   }
   // Compress supported cream gently instead of growing a rigid vertical column.
   support=Math.max(support,s.baseAt?.(p)||0);support*=.94*(1-flat);const body={x,y,u:p.u,v:p.v,r,h,z:support,break:p.break,...(Number.isFinite(p.a)?{a:p.a}:{}),mound,...(flat?{flat}:{})};out.push(body);
   for(const [key,distance]of cells){const crown=Math.sqrt(Math.max(0,1-(distance/(r+cell*.5))**2));const old=field.get(key);const height=support+h*crown;if(!old||height>=old.h){if(stream)changes.push([key,old]);field.set(key,{h:height,base:support,owner,travel,material:s.material});}}
   if(stream){stream.journal.push(changes);stream.travel.push(travel);}
   previous={x,y};
  }
  if(stream){stream.count=s.points.length;stream.out=out;}
  return out;
 }
 return {rate,feed,valid,mesh};
});
