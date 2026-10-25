(function(){
'use strict';
// Existing controls are shared with desktop; opening a tray never resizes the canvas.
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const narrow=matchMedia('(max-width: 900px)'),workshop=$('#workshop');
let tray='',returnFocus=null;
const panels={materials:$('.ingredients'),layers:$('.structure'),adjust:$('#selection-controls')};
function closeTray(restore=false){
  if(tray){panels[tray].removeAttribute('role');panels[tray].removeAttribute('aria-modal');}
  tray='';document.body.removeAttribute('data-tray');
  $$('[data-tray-open]').forEach(b=>b.setAttribute('aria-expanded','false'));
  if(restore&&returnFocus?.isConnected)returnFocus.focus({preventScroll:true});
}
function openTray(name,button){
  if(!panels[name]||!narrow.matches&&name==='materials')return;
  if(tray===name){closeTray(true);return;}
  tray=name;returnFocus=button;document.body.dataset.tray=name;
  panels[name].setAttribute('role','dialog');panels[name].setAttribute('aria-modal','true');panels[name].setAttribute('aria-label',({materials:'材料与工具设置',layers:'蛋糕结构',adjust:'装饰调整'})[name]);
  $$('[data-tray-open]').forEach(b=>b.setAttribute('aria-expanded',String(b.dataset.trayOpen===name)));
  panels[name].querySelector('[data-tray-close]')?.focus({preventScroll:true});
}
function sync(){
  const active=workshop.classList.contains('active');
  document.body.classList.toggle('mobile-workshop',narrow.matches&&active);
  if(!active||!narrow.matches&&['materials','layers'].includes(tray))closeTray();
  const selected=$('#selection-controls').classList.contains('has-selection');
  $$('[data-tray-open="adjust"]').forEach(b=>{b.classList.toggle('ready',selected);b.textContent=selected?'调整装饰 ●':'调整装饰';});
  const tool=$('.toolbox button.active')?.dataset.tool;
  $('[data-tray-open="materials"]').textContent=({pipe:'花嘴 / 颜色',pour:'奶盖 / 流量',smooth:'抹面 / 颜色'})[tool]||'挑材料';
}
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||b.disabled)return;
  if(b.hasAttribute('data-structure-toggle')){const collapsed=document.body.classList.toggle('structure-collapsed');$$('[data-structure-toggle]').forEach(el=>el.setAttribute('aria-expanded',String(!collapsed)));if(!collapsed)$('#layer-list').focus?.({preventScroll:true});else $('.desktop-structure')?.focus({preventScroll:true});return;}
  if(b.closest('.camera-options'))b.closest('.camera-options').open=false;
  if(b.dataset.trayOpen){openTray(b.dataset.trayOpen,b);return;}
  if(b.hasAttribute('data-tray-close')){closeTray(true);return;}
  if(!narrow.matches)return;
  // Select a piece, then place it directly on the unobstructed cake.
  if(b.dataset.item||b.dataset.plate||b.id==='layer-cream')closeTray();
  // A tool is immediately usable. Its settings are one tap away, not a mandatory modal.
  if(b.closest('.toolbox'))closeTray();
  if(b.id==='quick-cream'||b.id==='plate-cream'){
    closeTray();openTray('materials',$('[data-tray-open="materials"]'));
  }
  sync();
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape')$$('.camera-options').forEach(el=>el.open=false);
  if(e.key==='Escape'&&tray)closeTray(true);
  if(e.key==='Tab'&&tray){const list=[...panels[tray].querySelectorAll('button:not(:disabled),input:not(:disabled),select,textarea,a[href]')].filter(n=>n.getClientRects().length),first=list[0],last=list.at(-1);if(e.shiftKey&&(document.activeElement===first||!panels[tray].contains(document.activeElement))){e.preventDefault();last?.focus();}else if(!e.shiftKey&&(document.activeElement===last||!panels[tray].contains(document.activeElement))){e.preventDefault();first?.focus();}}
});
new MutationObserver(sync).observe(workshop,{attributes:true,attributeFilter:['class']});
new MutationObserver(sync).observe($('#selection-controls'),{attributes:true,attributeFilter:['class']});
narrow.addEventListener('change',sync);
window.addEventListener('resize',()=>{if(!narrow.matches&&tray==='materials')closeTray();});
sync();
})();
