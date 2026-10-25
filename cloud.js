(function(){
 'use strict';
 const store=CakeStore,model=CakeCloudModel,app=CakeApp,config=window.CAKE_CLOUD_CONFIG||{};
 const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const configured=/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.url||'')&&!!config.publishableKey;
 const client=configured&&!store.test?supabase.createClient(config.url,config.publishableKey,{auth:{flowType:'pkce',detectSessionInUrl:true,persistSession:true,autoRefreshToken:true}}):null;
 let user=null,admin=false,locked=false,timer=null,syncing=null,transition=Promise.resolve(),generation=0,conflict=null,mode='account',status='游客 · 仅保存在本机',email='',cooldown=0,activeMeta=store.meta();
 function saveMeta(meta,scope=store.key){activeMeta=meta;store.setMeta(meta,scope);}
 const urls=new Map();
 let authMode='password',authMessage='',authBusy=false;
 const account=()=>user?.id||null;
 const nickname=()=>user?.user_metadata?.display_name||'奶油玩家';
 function readNickname(){const value=$('#player-name').value.trim();if(value.length<2||value.length>20||/[<>\u0000-\u001f]/.test(value))throw Error('昵称请用 2～20 个字，不要包含尖括号或控制字符。');return value;}
 function readPassword(){const value=$('#player-password').value;if(value.length<8||value.length>128)throw Error('密码请用 8～128 位字符。');const again=$('#player-password-confirm');if(again&&again.value!==value)throw Error('两次输入的密码不一致。');return value;}
 function authFeedback(message){authMessage=message;const el=$('#auth-feedback');if(el)el.textContent=message;}
 function authForm(){const register=authMode==='register',code=authMode==='code';return `<div class="account-auth-tabs" aria-label="登录方式">${[['password','密码登录'],['register','注册账号'],['code','验证码登录']].map(([key,label])=>`<button type="button" data-auth-mode="${key}" aria-pressed="${key===authMode}">${label}</button>`).join('')}</div><p id="auth-feedback" class="auth-feedback" role="status">${esc(authMessage)}</p><form id="${code?'cloud-login-form':'cloud-password-form'}">${register?'<label>玩家昵称<input id="player-name" minlength="2" maxlength="20" required autocomplete="nickname" placeholder="给自己起个喜欢的名字"></label>':''}<label>邮箱<input id="cloud-email" type="email" required autocomplete="email" placeholder="用于登录和找回账号" value="${esc(email)}"></label>${code?'':`<label>密码<input id="player-password" type="password" minlength="8" maxlength="128" required autocomplete="${register?'new-password':'current-password'}" placeholder="${register?'至少 8 位字符':'输入你的游戏密码'}"></label>${register?'<label>再输入一次密码<input id="player-password-confirm" type="password" minlength="8" maxlength="128" required autocomplete="new-password"></label>':''}`}<button class="gold" type="submit">${code?'发送验证码':register?'注册奶油积木':'登录'}</button></form>${code?'<form id="cloud-verify-form"><label>邮件里的验证码<input id="cloud-code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" minlength="6" maxlength="10" required placeholder="输入邮件中的数字"></label><button class="mint" type="submit">验证并进入</button></form>':''}<p class="community-small">${register?'首次注册需要验证邮箱；之后可以直接用密码登录。昵称可以随时修改，不作为登录凭证。':code?'原有账号、忘记密码都可以使用验证码。登录后在「账号设置」里设置密码。':'以前只用过验证码？先用验证码登录，再到「账号设置」添加密码。'} 登录状态会自动保留。</p>`;}

 function errorMessage(e){const m=e?.message||String(e);if(/invalid login credentials/i.test(m))return '邮箱或密码不正确，也可以改用验证码登录。';if(/email not confirmed/i.test(m))return '请先验证注册邮箱，再登录。';if(/already registered|already been registered/i.test(m))return '这个邮箱已有账号，请登录或使用验证码。';if(/password.*(weak|short|least)|weak_password/i.test(m))return '密码强度不足，请换一个更长的密码。';if(/reauth|nonce/i.test(m))return '请先退出并用验证码重新登录，再设置密码。';if(/fetch|network|offline/i.test(m))return '暂时连不上云端，作品仍保存在本机；联网后可重试。';if(/rate|too many/i.test(m))return '请求有点频繁，请稍等一分钟再试。';if(/token.*expired|otp.*invalid/i.test(m))return '验证码无效或已过期，请重新获取。';return m;}
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
  if(next?.id===user?.id){user=next;return;}clearTimeout(timer);if(syncing)await syncing.catch(()=>{});generation++;conflict=null;
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
  const guest=store.read(store.guestKey),hasGuest=guest&&(guest.gallery.length||guest.draft.layers.length),state=app.getState();
  const conflictUI=conflict?'<div class="conflict-box"><h3>两台设备都有新作品</h3><p>两份都会先备份，再按你的选择继续。</p><div class="community-actions"><button data-resolve="merge" class="gold">合并两边作品</button><button data-resolve="local">保留本机版本</button><button data-resolve="remote">打开云端版本</button></div></div>':'';
  const guestUI=hasGuest?'<div class="community-note"><b>这台设备还有游客作品</b><p>可以合并到账号里，游客原件也会保留。</p><button id="cloud-import-guest">合并游客作品</button></div>':'';
  const settings=`<details class="account-settings"><summary>账号设置 <small>昵称 · 密码</small></summary><form id="player-profile-form"><label>玩家昵称<input id="player-name" value="${esc(nickname())}" minlength="2" maxlength="20" required autocomplete="nickname"></label><button type="submit">保存昵称</button></form><details class="password-settings"><summary>设置 / 修改密码</summary><p class="community-small">以后用邮箱和密码登录；验证码仍然可用。</p><form id="player-password-form"><label>新密码<input id="player-password" type="password" minlength="8" maxlength="128" required autocomplete="new-password" placeholder="至少 8 位字符"></label><label>再输入一次<input id="player-password-confirm" type="password" minlength="8" maxlength="128" required autocomplete="new-password"></label><button type="submit">保存密码</button></form></details></details>`;
  modal(`<div class="account-home"><div class="community-heading"><span class="eyebrow">奶油积木 · 我的</span><h2 id="community-title">${user?esc(nickname())+'的小天地':'欢迎来到奶油积木'}</h2><p>${user?'灵感、收藏和祝福，都放在这里。':'注册后，电脑与手机可以接着做同一只蛋糕。'}</p></div>${user?`<div class="player-card"><span class="player-avatar" aria-hidden="true">${esc([...nickname()][0])}</span><div><b>${esc(nickname())}</b><small>${esc(user.email)}</small></div><span class="player-badge">${admin?'工坊主理人':'蛋糕创作者'}</span></div>`:''}<p id="cloud-status" class="cloud-status" role="status">${esc(status)}</p><p id="account-feedback" role="status"></p>${!client?`<div class="community-note">${store.test?'独立测试画台不会连接正式账号。正式游戏支持昵称、密码登录和云存档。':'云端暂未连接，作品仍保存在本机。'}</div>`:user?`<div class="account-shortcuts"><button id="cloud-gallery"><b>${state.gallery.length}</b><span>我的作品</span></button><button id="cloud-workshop"><b>${(state.customAssets||[]).length}</b><span>我的配件</span></button><button id="gift-manage"><b>✉</b><span>送出的贺卡</span></button></div><section class="account-sync"><div><h3>云端存档</h3><p>作品默认私密，修改后自动同步。</p></div><button id="cloud-sync" class="mint">立即同步</button></section>${conflictUI}${settings}<details class="account-settings"><summary>存档管理 <small>导出 · 恢复 · 合并</small></summary><div class="community-actions"><button id="cloud-export">导出完整存档</button><button id="cloud-backups">恢复本机备份</button></div>${guestUI}</details>${admin?'<button id="moderation-open" class="wide mint">配件审核台 →</button>':''}<button id="cloud-logout" class="account-signout">退出当前账号</button>`:authForm()}<div class="account-footer">${window.CakeGifts?.pending?'<button id="gift-resume" class="gold">继续写贺卡</button>':''}<button id="community-return" class="soft">回到蛋糕</button></div></div>`);
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
  if(b.dataset.authMode){if(authBusy)return;email=$('#cloud-email')?.value.trim()||email;authMode=b.dataset.authMode;authMessage='';return renderAccount();}if(id==='cloud-gallery'){close();return app.showPage('gallery');}if(id==='account-btn'||id==='account-back')return renderAccount();if(id==='community-close'||id==='community-return')return close();
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
  const form=e.target,id=form.id;if(!['cloud-login-form','cloud-verify-form','cloud-password-form','player-profile-form','player-password-form'].includes(id))return;e.preventDefault();if(authBusy)return;const button=form.querySelector('button');button.disabled=true;authBusy=true;
  try{
   if(!client)throw Error('当前画台无法连接账号服务。');
   if(id==='player-profile-form'){if(!user)throw Error('请先登录');const {data,error}=await client.auth.updateUser({data:{display_name:readNickname()}});if(error)throw error;user=data.user;renderAccount();$('#account-feedback').textContent='昵称已保存，下次登录也会带上它。';}
   else if(id==='player-password-form'){if(!user)throw Error('请先登录');const password=readPassword();const {data,error}=await client.auth.updateUser({password});if(error)throw error;user=data.user;renderAccount();$('#account-feedback').textContent='密码已设置。以后可以使用邮箱和密码登录。';}
   else if(id==='cloud-password-form'){
    email=$('#cloud-email').value.trim();const password=authMode==='register'?readPassword():$('#player-password').value;
    if(authMode==='register'){const name=readNickname(),{data,error}=await client.auth.signUp({email,password,options:{data:{display_name:name},emailRedirectTo:new URL('./',location.href).href}});if(error)throw error;if(data.session)await activate(data.session.user);else{authMode='code';authMessage='注册验证邮件已发送，请输入邮件里的验证码。如果邮箱已有账号，也可以发送登录验证码进入。';renderAccount();}}
    else{const {data,error}=await client.auth.signInWithPassword({email,password});if(error)throw error;await activate(data.user);}
   }else if(id==='cloud-login-form'){
    if(Date.now()<cooldown)throw Error('刚寄出一封信，请稍等一分钟再发。');email=$('#cloud-email').value.trim();
    const {error}=await client.auth.signInWithOtp({email,options:{emailRedirectTo:new URL('./',location.href).href,shouldCreateUser:true}});if(error)throw error;cooldown=Date.now()+60000;authFeedback('验证码已寄出，请检查收件箱或垃圾邮件。');
   }else{email=$('#cloud-email').value.trim();const {data,error}=await client.auth.verifyOtp({email,token:$('#cloud-code').value.trim(),type:'email'});if(error)throw error;if(data?.user)await activate(data.user);}
  }catch(e){const message=errorMessage(e);if(user){const el=$('#account-feedback');if(el)el.textContent=message;}else authFeedback(message);app.notify(message);}finally{button.disabled=false;authBusy=false;}
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
