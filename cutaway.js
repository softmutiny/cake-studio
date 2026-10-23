(function(){
'use strict';
const {section,items,colorValue}=CakeCore;
const shade=(hex,t)=>'#'+[1,3,5].map(i=>Math.max(0,Math.min(255,Math.round(parseInt(hex.slice(i,i+2),16)+t))).toString(16).padStart(2,'0')).join('');
function oval(c,x,y,rx,ry,fill,line){c.beginPath();c.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,Math.PI*2);c.fillStyle=fill;c.fill();if(line){c.strokeStyle=line;c.stroke();}}
function seedFor(s){let n=2166136261;for(const ch of s)n=Math.imul(n^ch.charCodeAt(0),16777619);return()=>{n=(Math.imul(n,1664525)+1013904223)|0;return(n>>>0)/4294967296;};}
function fruit(c,p,x,y,w,h){c.save();c.translate(x,y);c.lineWidth=1.7;const kind=p.item;
 if(kind==='berryfill'){c.beginPath();c.moveTo(-w*.43,-h*.35);c.bezierCurveTo(-w*.7,-h*.9,w*.7,-h*.9,w*.43,-h*.35);c.quadraticCurveTo(w*.35,h*.13,0,h*.5);c.quadraticCurveTo(-w*.4,h*.08,-w*.43,-h*.35);c.fillStyle='#ee767e';c.fill();c.strokeStyle='#973f3f';c.stroke();c.beginPath();c.moveTo(0,-h*.4);c.quadraticCurveTo(-w*.3,-h*.22,0,h*.25);c.quadraticCurveTo(w*.25,-h*.22,0,-h*.4);c.fillStyle='#ffe7ce';c.fill();for(const dx of [-.26,.26])for(const dy of [-.23,0,.2])oval(c,dx*w,dy*h,1.3,2.1,'#fff1b3');}
 else if(kind==='cookiefill'){c.rotate(-.15);c.fillStyle='#533d35';c.strokeStyle='#382920';c.beginPath();c.roundRect(-w/2,-h/2,w,h,3);c.fill();c.stroke();c.fillStyle='#fff0d1';c.fillRect(-w*.46,-h*.1,w*.92,h*.22);for(let i=0;i<5;i++)oval(c,-w*.35+i*w*.17,-h*.29,1.4,1.2,'#a38466');}
 else if(kind==='mangofill'||kind==='peachfill'){c.fillStyle='#ffcf69';c.strokeStyle='#c8802e';c.beginPath();c.roundRect(-w/2,-h/2,w,h,5);c.fill();c.stroke();c.fillStyle='#ffe6a3';c.fillRect(-w*.35,-h*.3,w*.35,h*.13);}
 else if(kind==='bluefill'){oval(c,0,0,w*.45,h*.48,'#7278b1','#45476c');oval(c,-w*.1,-h*.1,w*.22,h*.25,'#c4b1d4');}
 else if(kind==='beanfill'){oval(c,0,0,w*.43,h*.35,'#a95d69','#713b45');oval(c,-w*.12,-h*.08,w*.12,h*.1,'#efb4ac');}
 else if(items[kind].portion==='cream'||items[kind].portion==='pudding'||items[kind].portion==='pomelo'){const it=items[kind];oval(c,0,0,w*.49,h*.46,it.color,shade(it.color,-48));oval(c,-w*.12,-h*.15,w*.28,h*.12,shade(it.color,22));if(it.portion==='pudding'){c.fillStyle='#b77d4a';c.fillRect(-w*.4,-h*.36,w*.8,h*.16);}if(it.texture||it.portion==='pomelo'){for(let i=0;i<6;i++)oval(c,-w*.32+i*w*.12,(i%2?1:-1)*h*.13,it.texture==='sesame'?1.2:2.8,1.7,it.texture==='taro'?'#9b7daa':it.portion==='pomelo'?'#e69e67':'#83634e');}}else if(kind==='cherryfill'||kind==='mixedberryfill'){oval(c,0,0,w*.43,h*.48,items[kind].color,shade(items[kind].color,-45));oval(c,-w*.12,-h*.14,w*.17,h*.15,'#e5b1bb');}else{c.fillStyle='#815747';c.strokeStyle='#4d3029';c.beginPath();c.roundRect(-w/2,-h/2,w,h,5);c.fill();c.stroke();c.fillStyle='#c49573';c.fillRect(-w*.35,-h*.3,w*.5,3);}
 c.restore();}
function draw(canvas,cake,offset=0,progress=1){const c=canvas.getContext('2d'),model=section(cake,offset);c.save();c.setTransform(canvas.width/920,0,0,canvas.height/620,0,0);c.clearRect(0,0,920,620);c.fillStyle='#fff4df';c.fillRect(0,0,920,620);
 const original=document.createElement('canvas');original.width=760;original.height=640;CakeArt.draw(original,cake,{background:true});
 if(progress<1){c.save();c.globalAlpha=1-progress;c.drawImage(original,180,16,560,472);const g=CakeArt.geometry(cake),y=16+(g.y+offset*g.ry)*560/760,x=180+g.x*560/760,rx=g.rx*model.halfWidth*560/760;c.setLineDash([7,6]);c.strokeStyle='#bc6745';c.lineWidth=2;c.beginPath();c.moveTo(x-rx,y);c.lineTo(x+rx,y);c.stroke();c.setLineDash([]);if(progress>0){const kx=x-rx+rx*2*progress;c.fillStyle='#dbe9ec';c.strokeStyle='#6f7979';c.beginPath();c.moveTo(kx,y-100);c.lineTo(kx+23,y-87);c.lineTo(kx+8,y+58);c.lineTo(kx-8,y+60);c.closePath();c.fill();c.stroke();}c.restore();}
 if(progress>0){c.save();c.globalAlpha=progress;c.drawImage(original,4,15,280,236);c.fillStyle='#855438';c.font='20px Happy,sans-serif';c.textAlign='center';c.fillText('外面的模样',144,257);
 const scale=Math.min(1.5,280/Math.max(48,model.height)),width=470*model.halfWidth,left=580-width/2,bottom=437,top=bottom-model.height*scale,coat=model.coat,upper=model.rows.at(-1),edge=coat||upper?.color||'#edce94';
 oval(c,580,458,width*.59,22,'#e5cdab');c.fillStyle='#fdf8eb';c.strokeStyle='#a99272';c.lineWidth=2;c.beginPath();c.roundRect(left-30,440,width+60,15,8);c.fill();c.stroke();
 for(const row of model.rows){const y=bottom-(row.bottom+row.height)*scale,h=row.height*scale;for(const [a,b]of row.intervals||model.intervals){const left=580+a*235,width=(b-a)*235;if(width<=0)continue;
 c.save();c.beginPath();c.rect(left,y,width,h);c.clip();c.fillStyle=row.kind==='filling'?'#e8d5b6':row.color;c.fillRect(left,y,width,h);
 if(row.kind==='base'){const random=seedFor(cake.id+':'+row.index);for(let i=0;i<95;i++){const x=left+random()*width,py=y+random()*h,rx=1+random()*2.6;oval(c,x,py,rx,rx*.65,i%3?shade(row.color,-22):shade(row.color,22));}if(items[row.item].texture)for(let i=0;i<20;i++)oval(c,left+random()*width,y+random()*h,1.8,1.3,shade(row.color,-65));}
 if(row.kind==='cream'){c.fillStyle=shade(row.color,13);c.fillRect(left,y+2,width,Math.max(2,h*.22));}
 for(const p of row.pieces){const x=580+(p.left+p.right)/2*235,w=(p.right-p.left)*235,ph=Math.min(h*.92,26*scale*p.depth),py=bottom-(row.bottom+p.z+7)*scale;fruit(c,p,x,Math.max(y+ph*.48,Math.min(y+h-ph*.48,py)),w,ph);}c.restore();
 c.strokeStyle=shade(row.color,-35);c.lineWidth=1.6;c.strokeRect(left,y,width,h);
 if(row.coating||coat){c.fillStyle=CakeCore.colorValue(row.coating||coat);c.fillRect(left-5,y,6,h);c.fillRect(left+width-1,y,6,h);const above=model.rows[row.index+1];if(!above||above.scale<row.scale){c.fillRect(left-5,y-4,width+10,6);}}
 c.save();c.beginPath();c.rect(left-2,y-25,width+4,h+30);c.clip();for(const p of row.cream)oval(c,580+p.u*235,y,Math.max(3,p.size*.55*row.scale,(p.span||0)*235/360),Math.max(3,p.size*.22),p.color,shade(p.color,-38));c.restore();
 }}
 c.fillStyle='#805139';c.font='24px Happy,sans-serif';c.textAlign='center';c.fillText('这一刀，切到你的搭配',580,506);c.font='14px "Microsoft YaHei",sans-serif';c.fillText('不同落刀位置，会遇到不同的夹心',580,533);c.restore();}
 c.restore();return model;
}
window.CakeCut={draw};
})();
