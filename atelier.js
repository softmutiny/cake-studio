(function(){
 'use strict';
 const cloud=CakeCloud,store=CakeStore,app=CakeApp,model=CakeCloudModel,$=s=>document.querySelector(s),esc=cloud.esc;
 let page='author',draft=null,entries=[],rows=[],nextPage=null,request=0,previewURL=null,previewVersion=0;
 const names={private:'仅自己可见',pending:'等待审核',approved:'已公开',rejected:'需要调整'};
 const prompt=`请参考附图，为「一口小作坊」蛋糕装饰游戏制作一个独立配件。
我要的配件是：【在这里填入你想要的东西】。
画风：清爽微缩卡通，柔软的奶油与糖塑质感，低饱和暖色、干净饱满的色块、细而柔和的暖棕轮廓，适量高光与轻微体积阴影。可爱但不要过度写实，不要黏土噪点、硬塑料或厚重油画笔触。
视角：正面稍微俯视，与参考蛋糕配件一致；物体完整，底部有清晰的放置接触点。一个主体，居中，周围留少量空隙。
输出：透明背景 PNG，约 1024×1024；不要画蛋糕、盘子、场景、地面投影、文字、水印、边框或棋盘格。不要复制参考图里的具体造型，只参考画风。
如果不能生成透明背景，请使用纯白背景，方便游戏中的去白底工具处理。`;
 function nav(){return `<div class="atelier-nav">${[['author','作者配件'],['mine','我的配件'],['public','网友配件'],['upload','导入图片'],['kit','制作配件'],...(cloud.admin?[['review','审核台']]:[])].map(([v,n])=>`<button data-atelier="${v}" class="${page===v?'active':''}">${n}</button>`).join('')}<button id="account-back">账号与云存档</button></div>`;}
 function shell(body){$('#pantry-content').innerHTML=`${nav()}<div id="atelier-body">${body}</div>`;}
 async function open(tab='author',embedded=false){
  if(!embedded){cloud.close();app.showPage('pantry');}
  page=tab;if(draft?.reviewOnly)draft=null;const ticket=++request,scope=store.key;shell('<p class="community-note">正在打开小柜子…</p>');
  try{
   if(tab==='author')return author();if(tab==='upload')return uploadForm();if(tab==='kit')return kit();
   if(tab==='review'){if(!cloud.admin)throw Error('只有审核员可以打开这里');const {data,error}=await cloud.client.from('cake_assets').select('*').in('status',['pending','approved']).order('created_at',{ascending:false}).limit(100);if(error)throw error;if(ticket!==request)return;rows=data;return review();}
   if(tab==='public'){rows=await cloud.rpc('cake_public_assets',{});if(ticket!==request)return;nextPage=rows.length===60?rows.at(-1).created_at:null;return publicGrid();}
   entries=await store.assets();if(ticket!==request)return;
   if(cloud.user){try{const {data,error}=await cloud.client.from('cake_assets').select('*').eq('owner_id',cloud.user.id).order('created_at',{ascending:false});if(error)throw error;for(const row of data){if(ticket!==request||scope!==store.key)return;const cached=await cloud.cacheRow(row,scope);const i=entries.findIndex(e=>e.id===cached.id);if(i<0)entries.push(cached);else entries[i]={...entries[i],row};}}catch(e){app.notify('先展示本机配件：'+cloud.errorMessage(e));}}
   if(ticket===request){entries=entries.filter(a=>!a.row||cloud.user&&(a.row.owner_id===cloud.user.id||a.row.path?.startsWith(cloud.user.id+'/')));mine();}
  }catch(e){if(ticket===request)$('#atelier-body').innerHTML=`<p class="community-note">${esc(cloud.errorMessage(e))}</p>`;}
 }
 function author(){const list=Object.entries(CakeCore.items).filter(([,a])=>a.group==='decoration'&&!a.custom);shell(`<p class="community-small">作坊里的小收藏，喜欢哪一件就带上画台。</p><div class="pantry-group author-accessories">${list.map(([k,a])=>`<button class="pantry-item" data-author-use="${k}">${CakeArt.icon(k)}<b>${esc(a.name)}</b><span>放到蛋糕上</span></button>`).join('')}</div>`);}
 function card(a,row,buttons){if(a.unavailable)return `<article class="atelier-card"><h3>${esc(a.name)}</h3><p>配件已下架或不可访问。蛋糕中的位置仍保留，其他配件和存档可以继续使用。</p></article>`;return `<article class="atelier-card"><img data-asset-image="${a.id}" alt="${esc(a.name)}"><h3>${esc(a.name)}</h3><span class="asset-status ${row?.status||'private'}">${names[row?.status]||'本机私藏'}</span>${row?.review_note?`<p>审核留言：${esc(row.review_note)}</p>`:''}<div class="community-actions">${buttons}</div></article>`;}
 async function thumbnails(list){for(const a of list){try{const entry=await store.getAsset(a.id),el=$(`[data-asset-image="${a.id}"]`);if(!entry?.blob||!el)continue;const url=URL.createObjectURL(entry.blob);el.onload=()=>URL.revokeObjectURL(url);el.onerror=()=>URL.revokeObjectURL(url);el.src=url;}catch{}}}
 function mine(){
  shell(`<p class="atelier-count">${entries.length} 个配件 · 登录后可同步到其他设备</p>${entries.length?`<div class="atelier-grid">${entries.map(a=>card(a,a.row,`<button data-use-asset="${a.id}" class="mint">放到蛋糕上</button>${!a.row?`<button data-upload-cloud="${a.id}">保存到云端</button>`:''}${a.row&&['private','rejected'].includes(a.row.status)?`<button data-submit-asset="${a.id}">投稿给大家</button>`:''}`)).join('')}</div>`:'<div class="community-note"><b>小柜子还空着，装点你的奇思妙想吧。</b><p>拿走生图小纸条和参考图，交给你喜欢的生图 AI，再把生成的配件带回来。</p><button data-atelier="kit" class="gold">领一份生图参考 →</button></div>'}`);thumbnails(entries);
 }
 function uploadForm(){shell(`<div class="atelier-layout"><div><div class="atelier-board"><canvas id="asset-preview" width="520" height="420" aria-label="配件放上蛋糕的预览"></canvas></div><p class="community-small" id="asset-info">支持 PNG、WebP、JPEG；建议透明背景，文件不超过 5 MB。</p></div><div class="atelier-form"><h3>把小配件带进来</h3><label>选择图片<input class="atelier-file" id="asset-file" type="file" accept="image/png,image/webp,image/jpeg"></label><label>配件名字<input id="asset-name" maxlength="24" placeholder="例如：困困小猫糖片" value="${esc(draft?.name||'')}"></label><label>在蛋糕上的大小<input id="asset-size" type="range" min="25" max="150" value="${draft?.width||80}"></label><label>底部落点<input id="asset-anchor" type="range" min="10" max="100" value="${Math.round((draft?.anchor||.9)*100)}"></label><label class="upload-consent"><input id="asset-white" type="checkbox">去除与边缘相连的近白背景（白色配件建议使用透明原图）</label><button id="asset-process" class="soft" ${draft?'':'disabled'}>重新整理边缘</button><div class="community-actions"><button id="asset-save" class="gold" ${draft?'':'disabled'}>收进我的配件柜</button></div><p class="community-small">保存后立即能用。先只保存在你的柜子里，投稿由你另行选择。</p></div></div>`);paintPreview();}
 async function process(file,removeWhite=false){
  if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024)throw Error('请选择 5 MB 以内的 PNG、WebP 或 JPEG 图片');
  const bitmap=await createImageBitmap(file);if(bitmap.width>4096||bitmap.height>4096){bitmap.close();throw Error('图片太大啦，请缩到 4096 像素以内再导入');}
  const scale=Math.min(1,1024/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  const {width:w,height:h}=canvas,image=ctx.getImageData(0,0,w,h),p=image.data;
  if(removeWhite){const seen=new Uint8Array(w*h),queue=new Int32Array(w*h);let head=0,tail=0;const visit=i=>{if(seen[i])return;seen[i]=1;const q=i*4;if(p[q+3]<12||p[q]>237&&p[q+1]>237&&p[q+2]>237)queue[tail++]=i;};for(let x=0;x<w;x++){visit(x);visit((h-1)*w+x);}for(let y=0;y<h;y++){visit(y*w);visit(y*w+w-1);}while(head<tail){const i=queue[head++];p[i*4+3]=0;const x=i%w,y=Math.floor(i/w);if(x)visit(i-1);if(x<w-1)visit(i+1);if(y)visit(i-w);if(y<h-1)visit(i+w);}ctx.putImageData(image,0,0);}
  let left=w,top=h,right=-1,bottom=-1,transparent=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(p[(y*w+x)*4+3]>12){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}else transparent++;}
  if(right<left)throw Error('图片里没有可见的配件');const cw=right-left+1,ch=bottom-top+1,out=document.createElement('canvas'),fit=Math.min(1,760/Math.max(cw,ch));out.width=Math.ceil(cw*fit)+8;out.height=Math.ceil(ch*fit)+8;out.getContext('2d').drawImage(canvas,left,top,cw,ch,4,4,out.width-8,out.height-8);
  const blob=await new Promise(r=>out.toBlob(r,'image/png'));if(!blob||blob.size>2*1024*1024)throw Error('整理后的图片仍超过 2 MB，请换一张更小的图片');return {blob,ratio:out.height/out.width,transparent:transparent/(w*h)};
 }
 async function paintPreview(){
  const canvas=$('#asset-preview');if(!canvas)return;const version=++previewVersion,game=new CakeCore.Game();game.addLayer('vanilla');game.coat('#fff3d5');
  let transient;
  if(draft?.blob){const a=previewAsset();if(draft.file||!CakeCore.items[a.id])transient=a.id;if(previewURL)URL.revokeObjectURL(previewURL);previewURL=URL.createObjectURL(draft.blob);await CakeArt.registerAsset(a,previewURL);CakeCore.registerAssets([a]);game.addDecoration(a.id,0,0);}
  if(version===previewVersion)CakeArt.draw(canvas,game.draft,{background:true});
  if(transient)delete CakeCore.items[transient];
 }
 function previewAsset(){let w=Math.max(12,Math.min(150,Number($('#asset-size')?.value)||draft.width||80)),h=w*draft.ratio;if(h>180){w*=180/h;h=180;}return model.asset({id:draft.id,name:$('#asset-name')?.value.trim()||draft.name||'新配件',size:[Math.max(12,w),Math.max(12,h)],anchor:$('#asset-anchor')?Number($('#asset-anchor').value)/100:draft.anchor||.9});}
 async function selectFile(file){const normalized=await process(file,$('#asset-white').checked);draft={...normalized,file,id:'custom_'+crypto.randomUUID(),name:'',width:80,anchor:.9};$('#asset-process').disabled=false;$('#asset-save').disabled=false;$('#asset-info').textContent=normalized.transparent<.01?'图片没有透明背景。可以勾选去白底，先看看边缘效果再保存。':'透明边缘已整理好，调整大小和底部落点就能用。';await paintPreview();}
 async function save(){if(!draft)throw Error('先选择一张图片');const a=previewAsset();if(!$('#asset-name').value.trim())throw Error('给它起个名字吧');await store.putAsset({...a,blob:draft.blob});await cloud.loadImage(a,draft.blob);app.addAsset(a);draft=null;await open('mine');app.notify('配件收好啦，去蛋糕上试试吧。');}
 async function kit(){shell(`<div class="reference-strip"><img src="assets/berry.png" alt="草莓配件参考"><img src="assets/flower.png" alt="糖花配件参考"><img src="assets/extras/cream-rose.png" alt="奶油花参考"></div><label>把括号里的内容换成你的想法<textarea id="asset-prompt" rows="10">${esc(prompt)}</textarea></label><div class="community-actions"><button id="kit-copy" class="gold">复制提示词 + 参考图</button><button id="kit-download">下载参考图</button><button data-atelier="upload" class="mint">生成好了，导入配件 →</button></div><p id="kit-note" class="community-small">部分聊天软件一次只能粘贴文字或图片；也可以单独下载参考图，再和提示词一起发给生图 AI。</p>`);}
 async function reference(){const c=document.createElement('canvas');c.width=1024;c.height=512;const ctx=c.getContext('2d');ctx.fillStyle='#fff9ed';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#805a42';ctx.font='28px sans-serif';ctx.fillText('蛋糕装饰 · 画风参考',50,65);const list=['berry','flower','extras/cream-rose'];await CakeArt.loaded;list.forEach((k,i)=>CakeArt.image(ctx,k,75+i*310,130,240,260));return new Promise(r=>c.toBlob(r,'image/png'));}
 async function copyKit(){const text=$('#asset-prompt').value,blob=await reference();try{if(!window.ClipboardItem)throw Error('clipboard');await navigator.clipboard.write([new ClipboardItem({'text/plain':new Blob([text],{type:'text/plain'}),'image/png':blob})]);$('#kit-note').textContent='提示词和参考图已复制。去你的生图 AI 粘贴吧！';}catch{try{await navigator.clipboard.writeText(text);downloadBlob(blob,'蛋糕配件画风参考.png');$('#kit-note').textContent='提示词已复制，参考图已下载；把这两样一起发给生图 AI。';}catch{$('#asset-prompt').select();$('#kit-note').textContent='浏览器不允许自动复制，请长按或 Ctrl+C 复制选中的提示词，再点下载参考图。';}}}
 function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
 function publicGrid(){shell(`<p class="community-small">经过审核的小配件。收进柜子后就能反复使用。</p><div class="atelier-grid">${rows.map(r=>{const a=cloud.rowAsset(r);return card(a,{status:'approved'},`<button data-public-use="${r.id}" class="mint">收进柜子并使用</button>`);}).join('')}</div>${rows.length?'':'<p class="community-note">公共小推车还空着，等第一批可爱配件来报到。</p>'}${nextPage?'<button id="public-more">再看看下一排</button>':''}`);publicThumbs(rows);}
 async function previewBlob(row){const {data,error}=await cloud.client.storage.from('cake-assets').download(row.path);if(error)throw error;return data;}
 async function publicThumbs(list){const ticket=request;for(const row of list){if(ticket!==request)return;try{const blob=await previewBlob(row),el=$(`[data-asset-image="custom_${row.id}"]`);if(ticket!==request||!el)return;const url=URL.createObjectURL(blob);el.onload=el.onerror=()=>URL.revokeObjectURL(url);el.src=url;}catch{const el=$(`[data-asset-image="custom_${row.id}"]`);if(el)el.alt='图片暂时未加载';}}}
 function review(){shell(`<p class="community-small">待审核及已公开配件。通过后图片和配件名称会公开；退回可写明需要修改的地方。</p><div class="atelier-grid">${rows.map(r=>card(cloud.rowAsset(r),r,`<button data-review-preview="${r.id}">放上蛋糕看看</button>${r.status==='pending'?`<button data-review-approve="${r.id}" class="mint">通过</button>`:''}<button data-review-reject="${r.id}">${r.status==='approved'?'下架':'退回'}</button>`)).join('')}</div>${rows.length?'':'<p class="community-note">暂时没有待审核的配件，今天的小柜子很整齐。</p>'}`);publicThumbs(rows);}
 async function moderate(id,decision){const row=rows.find(r=>r.id===id);if(!row)throw Error('配件已更新，请刷新');cloud.modal(`<h2 id="community-title">${decision==='approved'?'让它加入公共小推车？':'给投稿人留张小纸条'}</h2><p>${esc(row.name)}</p><label>审核留言<textarea id="review-note" maxlength="300" placeholder="例如：边缘还有白底，整理后欢迎再投稿。"></textarea></label><div class="community-actions"><button id="review-confirm" data-review-id="${id}" data-review-decision="${decision}" class="gold">${decision==='approved'?'确认通过并公开':'确认退回 / 下架'}</button><button data-atelier="review">返回审核台</button></div>`,'atelier');}
 function submission(id){cloud.modal(`<h2 id="community-title">让大家也用上你的小配件</h2><p>投稿会先进入审核队列，通过后所有玩家都能在游戏里使用。未通过前只有你和审核员能看到图片。</p><label class="upload-consent"><input id="asset-license" type="checkbox">我有权分享这张图片，并允许其他玩家把它用于游戏里的蛋糕、成品导出和展示。我不会上传他人隐私或无权分享的素材。</label><div class="community-actions"><button id="asset-submit-confirm" data-submit-id="${id}" class="gold">提交审核</button><button data-atelier="mine">先留在自己柜子里</button></div>`,'atelier');}
 document.addEventListener('change',async e=>{if(e.target.id!=='asset-file')return;try{await selectFile(e.target.files[0]);}catch(e){app.notify(cloud.errorMessage(e));}});
 document.addEventListener('input',e=>{if(['asset-size','asset-anchor'].includes(e.target.id))paintPreview().catch(e=>app.notify(e.message));});
 document.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b||b.disabled)return;const d=b.dataset,id=b.id;
  if(d.authorUse){app.useBuiltin(d.authorUse);return;}if(id==='moderation-open')return open('review');if(d.atelier)return open(d.atelier);
  if(!id.startsWith('asset-')&&!id.startsWith('kit-')&&!id.startsWith('public-')&&!id.startsWith('review-')&&!['useAsset','uploadCloud','submitAsset','publicUse','reviewPreview','reviewApprove','reviewReject'].some(k=>d[k]))return;
  b.disabled=true;try{
   if(id==='asset-process'){if(draft){const p=await process(draft.file,$('#asset-white').checked);Object.assign(draft,p);await paintPreview();}}
   if(id==='asset-save')await save();if(id==='kit-copy')await copyKit();if(id==='kit-download')downloadBlob(await reference(),'蛋糕配件画风参考.png');
   if(d.useAsset){const a=entries.find(a=>a.id===d.useAsset);await cloud.loadImage(a,a.blob);cloud.close();app.useAsset(model.asset(a));}
   if(d.uploadCloud){if(!cloud.user)throw Error('先登录云存档，就能把配件带去其他设备');const a=entries.find(a=>a.id===d.uploadCloud);await cloud.upload(a);await open('mine');app.notify('配件已保存到自己的云端柜子');}
   if(d.submitAsset)submission(d.submitAsset);
   if(id==='asset-submit-confirm'){if(!$('#asset-license').checked)throw Error('先确认你有权分享这个配件');await cloud.rpc('cake_asset_submit',{asset_id:d.submitId.slice(7),accept_license:true});await open('mine');app.notify('投稿寄出啦，审核通过后大家就能使用。');}
   if(d.publicUse){const row=rows.find(r=>r.id===d.publicUse),entry=await cloud.cacheRow({...row,status:'approved'});cloud.close();app.useAsset(model.asset(entry));}
   if(id==='public-more'){const more=await cloud.rpc('cake_public_assets',{before_time:nextPage});rows.push(...more);nextPage=more.length===60?more.at(-1).created_at:null;publicGrid();}
   if(d.reviewPreview){const row=rows.find(r=>r.id===d.reviewPreview),entry=cloud.rowAsset(row);draft={...entry,blob:await previewBlob(row),reviewOnly:true,ratio:entry.size[1]/entry.size[0],width:entry.size[0]};cloud.modal(`<h2 id="community-title">${esc(entry.name)} · 蛋糕试放</h2><div class="atelier-board"><canvas id="asset-preview" width="520" height="420"></canvas></div><button data-atelier="review">返回审核台</button>`,'atelier');await paintPreview();}
   if(d.reviewApprove)await moderate(d.reviewApprove,'approved');if(d.reviewReject)await moderate(d.reviewReject,'rejected');
   if(id==='review-confirm'){await cloud.rpc('cake_asset_review',{asset_id:d.reviewId,decision:d.reviewDecision,note:$('#review-note').value.trim()});await open('review');app.notify('审核结果已保存。');}
  }catch(e){app.notify(cloud.errorMessage(e));}finally{b.disabled=false;}
 });
 window.addEventListener('cake-account-change',()=>{draft=null;entries=[];rows=[];request++;if($('#pantry').classList.contains('active'))open('author',true);});
 window.CakeAtelier={open,process,render(){if(!$('#atelier-body'))open(page,true);}};
})();
