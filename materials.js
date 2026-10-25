(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CakeMaterials=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const profiles={
 chantillyfill:{gloss:.22},cheesefill:{gloss:.32},custardfill:{gloss:.72},yogurtfill:{gloss:.9},chocofill:{gloss:.86},hazelnutfill:{gloss:.75,bits:'nut'},caramelfill:{gloss:1},coffeefill:{gloss:.6,bits:'coffee'},tarofill:{gloss:.25,bits:'taro'},matchafill:{gloss:.6},sesamefill:{gloss:.5,bits:'sesame'},pomelofill:{gloss:.85,bits:'pomelo'},strawberryjam:{gloss:1,bits:'berry'},blueberryjam:{gloss:.95,bits:'berry'},mangojam:{gloss:.95,bits:'mango'}
};
function profile(item){return profiles[item]||null;}
function stabilize(previous,target,seconds){if(!target)return null;if(!previous||previous.surface!==target.surface||previous.level!==target.level)return {...target};const distance=Math.hypot(target.u-previous.u,target.v-previous.v)*180;if(distance<.7)return {...previous};const t=1-Math.exp(-Math.max(0,Math.min(.1,seconds))/.085);return {...target,u:previous.u+(target.u-previous.u)*t,v:previous.v+(target.v-previous.v)*t};}
return {profile,stabilize};
});
