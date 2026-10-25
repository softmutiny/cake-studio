(function(){
 'use strict';const root=document.querySelector('#gift-root');let request=0;
 function problem(message,retry=false){root.replaceChildren();const box=document.createElement('div');box.className='gift-loading';const h=document.createElement('h1');h.textContent='这封小小的祝福，还没到手';const p=document.createElement('p');p.textContent=message;box.append(h,p);if(retry){const b=document.createElement('button');b.textContent='再接一次小蛋糕';b.onclick=load;box.append(b);}root.append(box);}
 async function load(){const run=++request,id=location.hash.slice(1),cfg=window.CAKE_CLOUD_CONFIG||{};if(!CakeGiftModel.token(id))return problem('链接似乎少了一截，请让送蛋糕的人重新复制完整链接。');if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(cfg.url||'')||!cfg.publishableKey)return problem('小作坊的分享服务还没有配置好。');const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{const res=await fetch(cfg.url+'/rest/v1/rpc/cake_gift_get',{method:'POST',headers:{apikey:cfg.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({gift_id:id}),signal:controller.signal,cache:'no-store'});if(!res.ok)throw Error('network');const data=await res.json();if(run!==request)return;if(!data)return problem('这份分享不存在，或送蛋糕的人暂时收起了它。');CakeGiftView.mount(root,data);document.title=data.title+' · 奶油积木';}
  catch(e){if(run===request)problem('暂时没有接到小蛋糕，请检查网络后再试一次。',true);}finally{clearTimeout(timer);}
 }
 addEventListener('hashchange',load);load();
})();
