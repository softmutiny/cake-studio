(function(){
'use strict';
// Existing controls are shared with desktop; opening a tray never resizes the canvas.
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const narrow=matchMedia('(max-width: 900px)'),workshop=$('#workshop');
let tray='',returnFocus=null;
const panels={materials:$('.ingredients'),layers:$('.structure'),adjust:$('#selection-controls')};
function closeTray(restore=false){
  tray='';document.body.removeAttribute('data-tray');
  $$('[data-tray-open]').forEach(b=>b.setAttribute('aria-expanded','false'));
  if(restore&&returnFocus?.isConnected)returnFocus.focus({preventScroll:true});
}
function openTray(name,button){
  if(!narrow.matches||!panels[name])return;
  if(tray===name){closeTray(true);return;}
  tray=name;returnFocus=button;document.body.dataset.tray=name;
  $$('[data-tray-open]').forEach(b=>b.setAttribute('aria-expanded',String(b.dataset.trayOpen===name)));
  panels[name].querySelector('[data-tray-close]')?.focus({preventScroll:true});
}
function sync(){
  const active=workshop.classList.contains('active');
  document.body.classList.toggle('mobile-workshop',narrow.matches&&active);
  if(!narrow.matches||!active)closeTray();
  const selected=$('#selection-controls').classList.contains('has-selection');
  $('[data-tray-open="adjust"]').classList.toggle('ready',selected);
  $('[data-tray-open="adjust"]').textContent=selected?'调整装饰 ●':'调整装饰';
}
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||b.disabled)return;
  if(b.dataset.trayOpen){openTray(b.dataset.trayOpen,b);return;}
  if(b.hasAttribute('data-tray-close')){closeTray(true);return;}
  if(!narrow.matches)return;
  // Select a piece, then place it directly on the unobstructed cake.
  if(b.dataset.item||b.dataset.plate||b.id==='layer-cream'||b.closest('.ingredients')&&b.dataset.tool)closeTray();
  if(b.closest('.toolbox')&&['pipe','pour','smooth'].includes(b.dataset.tool)){
    if(tray)closeTray();
    openTray('materials',$('[data-tray-open="materials"]'));
  }
  if(b.id==='quick-cream'||b.id==='plate-cream'){
    closeTray();openTray('materials',$('[data-tray-open="materials"]'));
  }
  sync();
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&tray)closeTray(true);});
new MutationObserver(sync).observe(workshop,{attributes:true,attributeFilter:['class']});
new MutationObserver(sync).observe($('#selection-controls'),{attributes:true,attributeFilter:['class']});
narrow.addEventListener('change',sync);
sync();
})();
