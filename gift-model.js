(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CakeGiftModel=api;})(globalThis,function(){
 'use strict';
 const themes={picnic:{name:'奶油野餐',paper:'#fff3dc',ink:'#805039',accent:'#dba4a4'},moon:{name:'星月来信',paper:'#eaf1fb',ink:'#456187',accent:'#b6c7e5'},garden:{name:'花园来信',paper:'#eff3e4',ink:'#56705b',accent:'#b5c89d'}};
 const token=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value||'');
 const text=(value,max,fallback='')=>String(value??fallback).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim().slice(0,max);
 function settings(input={}){return {title:text(input.title,36,'把今天的甜送给你')||'把今天的甜送给你',message:text(input.message,500,'愿你每一天，都有一点值得收藏的小幸福。'),signature:text(input.signature,24,'来自我的小作坊'),recipient:text(input.recipient,24),template:Object.hasOwn(themes,input.template)?input.template:'picnic',accent:/^#[0-9a-f]{6}$/i.test(input.accent||'')?input.accent:themes[input.template]?.accent||themes.picnic.accent};}
 function candle(input={}){const x=Number(input.x),y=Number(input.y),size=Number(input.size);return {x:Number.isFinite(x)?Math.max(8,Math.min(92,x)):50,y:Number.isFinite(y)?Math.max(24,Math.min(85,y)):54,size:Number.isFinite(size)?Math.max(3,Math.min(7,size)):4.4};}
 function payload(input){if(!input||input.version!==1||typeof input.image!=='string'||input.image.length>2000000||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(input.image))throw Error('蛋糕图片格式或大小不符合要求，请重新生成');const cfg=settings(input);if(!cfg.message)throw Error('先写一句想送给对方的祝福吧');return {version:1,...cfg,cakeName:text(input.cakeName,30,'一只小蛋糕'),image:input.image,candle:candle(input.candle)};}
 function link(id,base){if(!token(id))throw Error('分享编号无效');const u=new URL('gift.html',base);u.search='';u.hash=id;return u.href;}
 function shareBase(value,fallback){try{const u=new URL(value);if(u.protocol==='https:'&&!u.username&&!u.password){u.hash='';u.search='';return u.href;}}catch{}return fallback;}
 return {themes,token,settings,candle,payload,link,shareBase};
});
