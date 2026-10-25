(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CakeToolMotion=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function approach(value,target,dt,speed){const delta=target-value;return value+Math.sign(delta)*Math.min(Math.abs(delta),speed*dt,Math.abs(delta)*(1-Math.exp(-dt/70)));}
function pipe(state,cursor,tip,active,now){const target=active&&tip?Math.max(0,tip.ground-tip.y):0;if(!state||state.kind!=='pipe')state={kind:'pipe',lift:0,time:now};const dt=clamp(now-state.time,0,50);state.lift=approach(state.lift,target,dt,.28);if(Math.abs(target-state.lift)<.08)state.lift=target;state.time=now;return{state,x:cursor.x,y:cursor.y-state.lift,animating:Math.abs(target-state.lift)>.08};}
function spatula(state,cursor,session,view,surface,length,now){
 const top=view==='top',side=!top&&surface==='side',ratio=top||side?1:.38;
 const raw=side?-Math.PI/2:session?session.sp.a+Math.PI/2+.42:null;
 if(!state||state.kind!=='smooth')state={kind:'smooth',angle:side?-Math.PI/2:-.25,time:now,projected:1};
 const changed=state.surface!==surface||state.view!==view;
 const desired=side?-Math.PI/2:raw===null?(changed?-.25:state.angle):Math.atan2(Math.sin(raw)*ratio,Math.cos(raw));
 const target=side?desired:state.angle+Math.atan(Math.tan(desired-state.angle)),dt=clamp(now-state.time,0,50);
 state.angle=approach(state.angle,target,dt,.009);if(Math.abs(target-state.angle)<.002)state.angle=target;
 const projection=side||top?1:raw===null?(changed?1:state.projected):Math.hypot(Math.cos(raw),Math.sin(raw)*ratio);
 state.projected=approach(state.projected,projection,dt,.006);if(Math.abs(state.projected-projection)<.002)state.projected=projection;
 state.time=now;state.surface=surface;state.view=view;
 return{state,x:cursor.x,y:cursor.y,angle:state.angle,length:length*state.projected,asset:top?'top':side?'side':'oblique',animating:Math.abs(target-state.angle)>.002||Math.abs(projection-state.projected)>.002};
}
return {pipe,spatula};});
