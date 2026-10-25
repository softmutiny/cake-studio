(function(){
 'use strict';
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 function mount(root,input,{editable=false,onPosition=null}={}){
  const p=CakeGiftModel.payload(input),theme=CakeGiftModel.themes[p.template];
  root.replaceChildren();root.className='gift-view';root.style.setProperty('--gift-paper',theme.paper);root.style.setProperty('--gift-ink',theme.ink);root.style.setProperty('--gift-accent',p.accent);
  const intro=el('div','gift-intro'),eyebrow=el('p','gift-eyebrow','一口小作坊 · 为你留的一点甜'),heading=el('h1','',p.recipient?'给 '+p.recipient+' 的小蛋糕':'有人为你做了一只蛋糕'),hint=el('p','gift-hint',editable?'点蛋糕顶面，挑一个放蜡烛的位置':'轻轻点亮蜡烛，拆开这份祝福。');intro.append(eyebrow,heading,hint);
  const stage=el('div','gift-stage'),cake=el('img','gift-cake');cake.src=p.image;cake.alt=p.cakeName;cake.draggable=false;
  const candle=el('button','gift-candle');candle.type='button';candle.setAttribute('aria-label','点亮蜡烛，打开祝福');candle.setAttribute('aria-pressed','false');
  const body=el('img','gift-candle-body');body.src='assets/gift/candle-unlit.png';body.alt='';body.draggable=false;
  const flame=el('span','gift-flame');flame.setAttribute('aria-hidden','true');candle.append(body,flame);stage.append(cake,candle);
  const letter=el('section','gift-letter');letter.hidden=true;letter.setAttribute('aria-label','送给你的祝福');letter.tabIndex=-1;
  letter.append(el('p','gift-eyebrow','这一刻，愿望交给烛光'),el('h2','',p.title),el('p','gift-message',p.message),el('p','gift-signature',p.signature?'—— '+p.signature:''));
  const status=el('p','gift-status');status.setAttribute('role','status');
  const replay=el('button','gift-replay','再许一次愿');replay.type='button';replay.hidden=true;
  root.append(intro,stage,status,letter,replay);
  function position(q){candle.style.left=q.x+'%';candle.style.top=q.y+'%';candle.style.width=q.size+'%';}
  position(p.candle);
  function reset(){root.classList.remove('is-lit');candle.setAttribute('aria-pressed','false');letter.hidden=true;replay.hidden=true;status.textContent='';hint.textContent=editable?'点蛋糕顶面，挑一个放蜡烛的位置':'轻轻点亮蜡烛，拆开这份祝福。';}
  candle.addEventListener('click',()=>{if(editable)return;if(root.classList.contains('is-lit'))return;root.classList.add('is-lit');candle.setAttribute('aria-pressed','true');letter.hidden=false;replay.hidden=false;hint.textContent='蜡烛亮了，祝福也送到了。';status.textContent='祝福已展开';letter.focus({preventScroll:true});letter.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'nearest'});});
  replay.addEventListener('click',()=>{reset();candle.focus({preventScroll:true});stage.scrollIntoView({behavior:'smooth',block:'center'});});
  if(editable){candle.setAttribute('aria-label','收礼蜡烛的位置');cake.addEventListener('click',e=>onPosition?.(e,stage,position));}
  return {reset,position};
 }
 window.CakeGiftView={mount};
})();
