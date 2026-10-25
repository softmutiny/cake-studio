(function(){
 'use strict';
 const store=CakeStore,model=CakeCloudModel,app=CakeApp,config=window.CAKE_CLOUD_CONFIG||{};
 const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const configured=/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.url||'')&&!!config.publishableKey;
 const client=configured&&!store.test?supabase.createClient(config.url,config.publishableKey,{auth:{flowType:'pkce',detectSessionInUrl:true,persistSession:true,autoRefreshToken:true}}):null;
 let user=null,admin=false,locked=false,timer=null,syncing=null,transition=Promise.resolve(),generation=0,conflict=null,mode='account',status='游客 · 仅保存在本机',email='',cooldown=0,activeMeta=store.meta();
 function saveMeta(meta,scope=store.key){activeMeta=meta;store.setMeta(meta,scope);}
 const urls=new Map();
 const account=()=>user?.id||null;
 function errorMessage(e){const m=e?.message||String(e);if(/fetch|network|offline/i.test(m))return '暂时连不上云端，作品仍保存在本机；联网后可重试。';if(/rate|too many/i.test(m))return '请求有点频繁，请稍等一分钟再试。';if(/token.*expired|otp.*invalid/i.test(m))return '验证码无效或已过期，请重新获取。';return m;}
 function setStatus(text){status=text;$('#account-btn').setAttribute('aria-label',user?'我的账号与云同步':'登录与云同步');$('#account-btn').dataset.connected=user?'true':'false';$('#account-btn').title=text;const el=$('#cloud-status');if(el)el.textContent=text;}
 function modal(html,section='account'){mode=section;$('#community-content').innerHTML=html;if(!$('#community-dialog').open)$('#community-dialog').showModal();}
 function close(){$('#community-dialog').close();}
 function changed(){if(!user||locked)return;saveMeta({...activeMeta,dirty:true});setStatus('已存本机 · 等待同步');clearTimeout(timer);timer=setTimeout(()=>sync().catch(showError),2200);}
 function showError(e){setStatus(errorMessage(e));app.notify(errorMessage(e));}
 async function rpc(name,args){if(!client)throw Error(store.test?'测试画台不会连接正式云端':'云端正在准备，暂时先保存在本机');const {data,error}=await client.rpc(name,args);if(error)throw error;return data;}
 async function loadImage(a,blob){const epoch=generation,old=urls.get(a.id),url=URL.createObjectURL(blob);try{await CakeArt.registerAsset(a,url);if(epoch!==generation){URL.revokeObjectURL(url);return;}urls.set(a.id,url);if(old)URL.revokeObjectURL(old);}catch(e){URL.revokeObjectURL(url);throw e;}}
 const rowAsset=r=>model.asset({id:'custom_'+r.id,name:r.name,size:[r.width,r.height],anchor:Number(r.anchor)});
 async function cacheRow(row,scope=store.key){const a=rowAsset(row),old=await store.getAsset(a.id,scope);if(old?.blob){const entry={...old,...a,row};await store.putAsset(entry,scope);if(scope===store.key)await loadImage(a,old.blob);return entry;}const {data,error}=await client.storage.from('cake-assets').download(row.path);if(error)throw error;const entry={...a,blob:data,row};await store.putAsset(entry,scope);if(scope===store.key)await loadImage(a,data);return entry;}
 async function hydrate(state,scope=store.key){
  const assets=model.manifest(state.customAssets||[]),missing=[];
  for(const a of assets){const entry=await store.getAsset(a.id,scope);if(entry?.blob)await loadImage(a,entry.blob);else missing.push(a.id.slice(7));}
  if(missing.length&&client){const rows=await rpc('cake_assets_resolve',{asset_ids:missing});for(const row of rows)await cacheRow(row,scope);const unavailable=assets.filter(a=>missing.includes(a.id.slice(7))&&!rows.some(r=>r.id===a.id.slice(7)));for(const a of unavailable)await store.putAsset({...a,unavailable:true},scope);if(unavailable.length)app.notify('有 '+unavailable.length+' 个配件已下架或不可访问，已保留它们的位置；其他作品可以继续制作和同步。');}
  else if(missing.length)throw Error('配件图片不在这台设备上，请联网登录后再恢复这份作品。');
 }
 async function upload(a,scope=store.key,uid=account()){
  if(!uid||uid!==account())throw Error('请先登录');
  const entry=await store.getAsset(a.id,scope);if(entry?.unavailable)return null;if(!entry?.blob)throw Error('缺少配件图片：'+a.name);
  if(entry.row)return entry.row;
  const id=a.id.slice(7),path=uid+'/'+id+'.png';
  const {error}=await client.storage.from('cake-assets').upload(path,entry.blob,{contentType:'image/png',upsert:false});
  if(error&&!/already exists|duplicate/i.test(error.message))throw error;
  await rpc('cake_asset_create',{asset_id:id,asset_name:a.name,asset_width:a.size[0],asset_height:a.size[1],asset_anchor:a.anchor});
  const {data,error:readError}=await client.from('cake_assets').select('*').eq('id',id).single();if(readError)throw readError;
  await store.putAsset({...entry,row:data},scope);return data;
 }
 async function uploadUsed(state,scope,uid){for(const a of state.customAssets||[])await upload(a,scope,uid);}
 async function pull(remote,scope){const wasInert=$('.app').inert;$('.app').inert=true;try{await store.backup(app.getState(),'同步前的本机版本',scope);await hydrate(remote.state,scope);if(!CakeCore.validate(remote.state))throw Error('云端存档验证失败，本机作品未更改');localStorage.setItem(scope,JSON.stringify(remote.state));saveMeta({revision:remote.revision,dirty:false},scope);app.switchState(remote.state,scope);}finally{$('.app').inert=wasInert;}}
 async function sync(){
  if(!client||!user||locked)return;if(syncing)return syncing;if(app.busy()){clearTimeout(timer);timer=setTimeout(()=>sync().catch(showError),2200);return;}
  const uid=user.id,scope=store.key,epoch=generation;
  syncing=(async()=>{
   setStatus('正在同步…');const {data:remote,error}=await client.from('cake_saves').select('state,revision').eq('owner_id',uid).maybeSingle();if(error)throw error;if(epoch!==generation)return;if(remote)remote.state=model.translate(remote.state,false);
   if(app.busy()){clearTimeout(timer);timer=setTimeout(()=>sync().catch(showError),2200);return;}
   const state=app.getState(),meta={...activeMeta},action=model.syncDecision(state,meta,remote);
   if(action==='conflict'){conflict=remote;setStatus('两台设备都有新作品 · 请选择保留方式');if(mode==='account'&&$('#community-dialog').open)renderAccount();return;}
   if(action==='pull'){await pull(remote,scope);}
   else if(action==='equal')saveMeta({revision:remote.revision,dirty:false},scope);
   else{
    await uploadUsed(state,scope,uid);if(epoch!==generation)return;
    const result=await rpc('cake_save',{expected_revision:meta.revision,payload:model.translate(state)});if(result.conflict&&result.state)result.state=model.translate(result.state,false);
    if(epoch!==generation)return;
    if(result.conflict){conflict=result;setStatus('云端刚有新变化 · 请选择保留方式');if(mode==='account'&&$('#community-dialog').open)renderAccount();return;}
    const dirty=!model.same(state,app.getState());saveMeta({revision:result.revision,dirty},scope);
    if(dirty){clearTimeout(timer);timer=setTimeout(()=>sync().catch(showError),2200);setStatus('本机有新操作 · 等待下一次同步');return;}
   }
   conflict=null;setStatus('云端已同步 · '+new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}));
  })().finally(()=>{syncing=null;});return syncing;
 }
 async function activate(next){
  if(next?.id===user?.id)return;clearTimeout(timer);if(syncing)await syncing.catch(()=>{});generation++;conflict=null;
  if(!locked){const previous=app.snapshot();localStorage.setItem(store.key,JSON.stringify(previous));}
  $('.app').inert=true;
  try{
   user=next;admin=false;locked=false;const scope=next?store.accountKey(next.id):store.guestKey;
   let state;try{state=store.read(scope)||CakeCore.initial();if(!CakeCore.validate(state))throw Error('invalid');activeMeta=store.meta(scope);}catch{locked=true;CakeArt.clearCustomAssets();app.switchState(CakeCore.initial(),scope);setStatus('本机这份存档有异常，已锁住画台并保留原始记录。请退出账号后联系维护者恢复。');return;}
   // Metadata registration precedes validation; missing images never delete a draft.
   CakeArt.clearCustomAssets();for(const url of urls.values())URL.revokeObjectURL(url);urls.clear();CakeCore.registerAssets(state.customAssets||[]);
   app.switchState(state,scope);await hydrate(state,scope).catch(showError);
   if(next){setStatus('登录成功 · 正在读取云端');try{admin=await rpc('cake_is_moderator',{});await sync();}catch(e){showError(e);}}
   else setStatus('游客 · 仅保存在本机');
  }finally{$('.app').inert=locked;app.refresh();if(locked||$('#community-dialog').open)renderAccount();window.dispatchEvent(new Event('cake-account-change'));}
 }
 function renderAccount(){
  const guest=store.read(store.guestKey),hasGuest=guest&&(guest.gallery.length||guest.draft.layers.length);
  modal(`<div class="community-heading"><span class="eyebrow">一口小作坊 · 云端小柜子</span><h2 id="community-title">${user?'把快乐随身带着':'让蛋糕跟着你回家'}</h2><p>电脑做一半，手机接着玩。作品默认只有自己可见。</p></div><p id="cloud-status" class="cloud-status" role="status">${esc(status)}</p>${!client?`<div class="community-note">${store.test?'这是独立测试画台，不会登录或改动正式云存档。':'云端正在接通。你可以先自由做蛋糕、导入配件，作品仍会保存在这台设备。'}</div>`:user?`<p class="account-email">${esc(user.email)}</p><div class="community-actions"><button id="cloud-sync" class="mint">立即同步</button><button id="gift-manage">我送出的贺卡</button><button id="cloud-export">导出完整存档</button><button id="cloud-backups">恢复备份</button><button id="cloud-logout">退出账号</button></div>${hasGuest?'<div class="community-note"><b>这台设备还有游客作品</b><p>可以合并到当前账号；游客原件会保留。正在制作的两只蛋糕也不会互相覆盖。</p><button id="cloud-import-guest" class="gold">合并本机游客作品</button></div>':''}${conflict?'<div class="conflict-box"><h3>两边都藏着新灵感</h3><p>另一个设备也修改了存档。两份都会先留备份，再按你的选择继续。</p><div class="community-actions"><button data-resolve="merge" class="gold">合并两边的蛋糕</button><button data-resolve="local">继续本机这一版</button><button data-resolve="remote">打开云端那一版</button></div></div>':''}${admin?'<button id="moderation-open" class="wide mint">打开配件审核台 →</button>':''}`:`<form id="cloud-login-form"><label>你的邮箱<input id="cloud-email" type="email" required autocomplete="email" placeholder="输入邮箱，收一封登录信" value="${esc(email)}"></label><button id="cloud-send-code" class="gold" type="submit">发送登录邮件</button></form><form id="cloud-verify-form"><label>邮件里的验证码<input id="cloud-code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" minlength="6" maxlength="10" placeholder="输入邮件中的数字验证码" required></label><button class="mint" type="submit">登录 / 注册</button></form><p class="community-small">首次登录会自动创建账号。验证码只发给你，不需要游戏密码。</p>`}<div class="community-actions">${window.CakeGifts?.pending?'<button id="gift-resume" class="gold">继续写贺卡</button>':''}<button id="cloud-workshop" class="soft">去我的配件工坊 →</button><button id="community-return">回到蛋糕</button></div>`);
 }
 async function resolveConflict(which){
  if(!conflict)return;const remote=conflict,local=app.snapshot();await store.backup(local,'冲突保留：本机');await store.backup(remote.state,'冲突保留：云端');
  const state=which==='merge'?model.merge(local,remote.state):which==='remote'?remote.state:local;
  await hydrate(state);if(!CakeCore.validate(state))throw Error('存档验证失败');
  app.switchState(state,store.key);store.write(state);saveMeta({revision:remote.revision,dirty:which!=='remote'});conflict=null;await sync();renderAccount();
 }
 function download(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
 async function exportAll(state=app.snapshot(),name='我的蛋糕完整存档.json'){
  const images=[],missingImages=[];for(const a of state.customAssets||[]){const entry=await store.getAsset(a.id);if(!entry?.blob){missingImages.push(a.name);continue;}const base64=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(entry.blob);});images.push({asset:a,image:base64});}
  download({format:'cake-studio-backup',version:1,state,images,missingImages},name);if(missingImages.length)app.notify('存档已导出，其中 '+missingImages.length+' 张不可用配件只保留位置与名称，没有原图。');
 }
 async function importGuest(){
  const guest=store.read(store.guestKey);if(!guest)return;const local=app.snapshot(),merged=model.merge(local,guest);await store.backup(local,'合并游客作品前');
  for(const a of guest.customAssets||[]){const entry=await store.getAsset(a.id,store.guestKey);if(entry){const copied={...entry};if(copied.row&&copied.row.status!=='approved'&&copied.row.owner_id!==account())delete copied.row;await store.putAsset(copied);}}
  await hydrate(merged);app.replaceState(merged);await sync();renderAccount();
 }
 async function backups(){const list=await store.backups();modal(`<div class="community-heading"><h2 id="community-title">给灵感留一条回家的路</h2><p>恢复前也会备份当前进度。备份保存在这台设备，可以导出完整文件。</p></div><div class="backup-list">${list.length?list.map(b=>`<article><div><b>${esc(b.reason)}</b><small>${esc(new Date(b.time).toLocaleString('zh-CN'))} · ${b.state.gallery.length} 只收藏</small></div><button data-restore="${b.id}">恢复</button><button data-export-backup="${b.id}">导出</button></article>`).join(''):'<p>目前没有需要恢复的旧版本。</p>'}</div><button id="account-back">返回云存档</button>`);}
 async function handle(e){const b=e.target.closest('button');if(!b||b.disabled)return;const id=b.id;
  if(id==='account-btn'||id==='account-back')return renderAccount();if(id==='community-close'||id==='community-return')return close();
  if(id==='cloud-workshop')return window.CakeAtelier?.open();
  if(!['cloud-sync','cloud-export','cloud-backups','cloud-logout','cloud-import-guest'].includes(id)&&!b.dataset.resolve&&!b.dataset.restore&&!b.dataset.exportBackup)return;
  b.disabled=true;try{
   if(id==='cloud-sync'){await sync();renderAccount();}
   if(id==='cloud-export')await exportAll();
   if(id==='cloud-backups')await backups();
   if(id==='cloud-logout'){app.snapshot();await sync().catch(()=>{});const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;await activate(null);renderAccount();}
   if(id==='cloud-import-guest')await importGuest();
   if(b.dataset.resolve)await resolveConflict(b.dataset.resolve);
   if(b.dataset.restore||b.dataset.exportBackup){const backup=(await store.backups()).find(x=>x.id===(b.dataset.restore||b.dataset.exportBackup));if(!backup)throw Error('备份找不到了');if(b.dataset.exportBackup)await exportAll(backup.state,'蛋糕恢复备份.json');else{await store.backup(app.snapshot(),'恢复前的当前进度');await hydrate(backup.state);app.replaceState(backup.state);renderAccount();}}
  }catch(e){app.notify(errorMessage(e));}finally{b.disabled=false;}
 }
 document.addEventListener('click',handle);
 document.addEventListener('submit',async e=>{
  if(!['cloud-login-form','cloud-verify-form'].includes(e.target.id))return;e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;
  try{if(e.target.id==='cloud-login-form'){
   if(Date.now()<cooldown)throw Error('刚寄出一封信，请稍等一分钟再发。');email=$('#cloud-email').value.trim();const redirect=new URL('./',location.href).href;
   const {error}=await client.auth.signInWithOtp({email,options:{emailRedirectTo:redirect,shouldCreateUser:true}});if(error)throw error;cooldown=Date.now()+60000;setStatus('登录邮件已寄出，检查收件箱或垃圾邮件。');
  }else{email=$('#cloud-email').value.trim();const {error}=await client.auth.verifyOtp({email,token:$('#cloud-code').value.trim(),type:'email'});if(error)throw error;}}
  catch(e){app.notify(errorMessage(e));}finally{button.disabled=false;}
 });
 window.addEventListener('online',()=>sync().catch(showError));
 window.addEventListener('focus',()=>{if(user)sync().catch(showError);});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&user)sync().catch(()=>{});});
 window.CakeCloud={client,configured,rpc,get user(){return user;},get admin(){return admin;},changed,sync,modal,close,esc,errorMessage,cacheRow,loadImage,rowAsset,upload,hydrate,renderAccount,exportAll};
 hydrate(app.getState()).then(()=>app.refresh()).catch(showError);
 if(client){
  client.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>{transition=transition.then(()=>activate(session?.user||null)).catch(showError);},0);});
  client.auth.getSession().then(({data,error})=>{if(error)throw error;transition=transition.then(()=>activate(data.session?.user||null)).catch(showError);}).catch(showError);
 }
})();
