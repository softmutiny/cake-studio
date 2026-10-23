/* Volume-weighted Kubelka–Munk approximation, using Spectral.js 3.0.0 (MIT).
   Pigment masses are advected by pour.js; this module only reconstructs color. */
(function(root,factory){const api=factory(typeof module==='object'?require('./vendor/spectral.js'):root.spectral);if(typeof module==='object'&&module.exports)module.exports=api;else root.CakePigment=api;})(globalThis,function(S){
 'use strict';
 const colors=new Map(),cache=new Map();
 function color(hex){if(!colors.has(hex))colors.set(hex,new S.Color(hex));return colors.get(hex);}
 function rgb(parts){const present=parts.filter(p=>p[1]>1e-9),total=present.reduce((s,p)=>s+p[1],0);if(!total)return[255,243,213];if(present.length===1)return color(present[0][0]).sRGB;
  const weights=present.map(([c,n])=>[c,Math.round(n/total*128)]).filter(p=>p[1]>0).sort((a,b)=>a[0].localeCompare(b[0])),key=weights.map(p=>p.join(':')).join('|');if(cache.has(key))return cache.get(key);
  // Spectral.js squares user factors and multiplies by luminance. Undo those
  // UI weights so concentrations here follow the actual fluid volume.
  const result=S.mix(...weights.map(([c,n])=>{const pigment=color(c);return[pigment,Math.sqrt(n/Math.max(1e-9,pigment.luminance))];})).sRGB;
  if(cache.size>8192)cache.clear();cache.set(key,result);return result;
 }
 // Opaque cream laminae: view the newest skin first, not an average through
 // the whole column. Only thin contact margins transmit the underlying color.
 function weights(record,surface,index){
  const pigments=record.pigments||[{color:record.color,[surface]:record[surface]}],groups=new Map();
  for(const p of pigments){const mass=p[surface][index];if(mass<1e-10)continue;const layer=p.layer||0;if(!groups.has(layer))groups.set(layer,[]);groups.get(layer).push([p.color,mass]);}
  const levels=[...groups.keys()].sort((a,b)=>b-a),parts=[];
  const scale=surface==='top'?(record.topHeightScale||75/(360*(record.size||8)/8/48)**2):(record.heightScale||8),opacity={light:8,silky:18,thick:30}[record.viscosity]||18;
  let transmission=1;
  for(let n=0;n<levels.length;n++){const group=groups.get(levels[n]),mass=group.reduce((s,p)=>s+p[1],0),cover=n===levels.length-1?1:1-Math.exp(-mass*scale*opacity);for(const [color,m] of group)parts.push([color,transmission*cover*m/mass]);transmission*=1-cover;if(transmission<.00001)break;}
  return parts;
 }
 function at(record,surface,index){return rgb(weights(record,surface,index));}
 return{rgb,at,weights};
});
