(function(){
 'use strict';
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 function mount(root,input,{editable=false,onPosition=null}={}){
  const p=CakeGiftModel.payload(input),theme=CakeGiftModel.themes[p.template];
  root.replaceChildren();root.className='gift-view';root.style.setProperty('--gift-paper',theme.paper);root.style.setProperty('--gift-ink',theme.ink);root.style.setProperty('--gift-accent',p.accent);
  let phase='unlit',effectTimer=null;
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  const intro=el('div','gift-intro'),eyebrow=el('p','gift-eyebrow','一口小作坊 · 为你留的一点甜'),heading=el('h1','',p.recipient?'给 '+p.recipient+' 的小蛋糕':'有人为你做了一只蛋糕'),hint=el('p','gift-hint',editable?'点蛋糕顶面，挑一个放蜡烛的位置':'轻轻点亮蜡烛，拆开这份祝福。');intro.append(eyebrow,heading,hint);
  const stage=el('div','gift-stage'),cake=el('img','gift-cake');cake.src=p.image;cake.alt=p.cakeName;cake.draggable=false;
  const candle=el('button','gift-candle');candle.type='button';candle.setAttribute('aria-label','点亮蜡烛，打开祝福');candle.setAttribute('aria-pressed','false');
  const body=el('img','gift-candle-body');body.src='assets/gift/candle-unlit.png';body.alt='';body.draggable=false;
  const flame=el('span','gift-flame');flame.setAttribute('aria-hidden','true');
  const smoke=el('span','gift-smoke'),confetti=el('div','gift-confetti');smoke.setAttribute('aria-hidden','true');confetti.setAttribute('aria-hidden','true');
  candle.append(body,flame,smoke);stage.append(cake,candle,confetti);
  const ritual=el('section','gift-ritual');ritual.hidden=true;ritual.setAttribute('aria-label','许愿和吹蜡烛');
  const ritualNote=el('p','gift-ritual-note','给自己留一个小小的愿望吧。'),wish=el('button','gift-wish','闭上眼睛，许个愿');wish.type='button';ritual.append(ritualNote,wish);
  const letter=el('section','gift-letter');letter.hidden=true;letter.setAttribute('aria-label','送给你的祝福');letter.tabIndex=-1;
  letter.append(el('p','gift-eyebrow','这一刻，愿望交给烛光'),el('h2','',p.title),el('p','gift-message',p.message),el('p','gift-signature',p.signature?'—— '+p.signature:''));
  const status=el('p','gift-status');status.setAttribute('role','status');
  const replay=el('button','gift-replay','再许一次愿');replay.type='button';replay.hidden=true;
  root.append(intro,stage,status,ritual,letter,replay);
  function position(q){candle.style.left=q.x+'%';candle.style.top=q.y+'%';candle.style.width=q.size+'%';}
  position(p.candle);
  function clearEffects(){clearTimeout(effectTimer);effectTimer=null;smoke.replaceChildren();confetti.replaceChildren();}
  function reset(){phase='unlit';clearEffects();root.classList.remove('is-lit','is-blown');candle.setAttribute('aria-pressed','false');candle.setAttribute('aria-label',editable?'收礼蜡烛的位置':'点亮蜡烛，打开祝福');letter.hidden=true;ritual.hidden=true;wish.hidden=false;wish.textContent='闭上眼睛，许个愿';ritualNote.textContent='给自己留一个小小的愿望吧。';replay.hidden=true;status.textContent='';hint.textContent=editable?'点蛋糕顶面，挑一个放蜡烛的位置':'轻轻点亮蜡烛，拆开这份祝福。';}
  function celebrate(){clearEffects();if(reduced())return;
   for(let i=0;i<4;i++){const puff=el('i');puff.style.setProperty('--puff-delay',i*.18+'s');puff.style.setProperty('--puff-drift',(i%2?14:-12)+'px');smoke.append(puff);}
   const colors=['#e9a3a3','#f0cf75','#9fc8b4','#adc4e7','#d0b6dd'];
   for(let i=0;i<28;i++){const piece=el('i');piece.style.left=(8+Math.random()*84)+'%';piece.style.background=colors[i%colors.length];piece.style.setProperty('--fall-delay',Math.random()*.7+'s');piece.style.setProperty('--fall-drift',(Math.random()-.5)*100+'px');piece.style.setProperty('--fall-turn',(Math.random()>.5?1:-1)*(180+Math.random()*360)+'deg');if(i%3===0)piece.className='rounded';confetti.append(piece);}
   effectTimer=setTimeout(clearEffects,4300);
  }
  candle.addEventListener('click',()=>{if(editable||phase!=='unlit')return;phase='lit';root.classList.add('is-lit');candle.setAttribute('aria-pressed','true');candle.setAttribute('aria-label','蜡烛已点亮');letter.hidden=false;ritual.hidden=false;replay.hidden=false;hint.textContent='蜡烛亮了，先悄悄许个愿。';status.textContent='祝福已展开，可以许愿了';wish.focus({preventScroll:true});ritual.scrollIntoView({behavior:reduced()?'instant':'smooth',block:'nearest'});});
  wish.addEventListener('click',()=>{if(phase==='lit'){phase='wishing';ritualNote.textContent='不用说出来，愿望只留在你心里。准备好了，就轻轻吹灭它。';wish.textContent='许好啦，吹灭蜡烛';status.textContent='慢慢许愿，准备好后点击吹灭蜡烛';return;}if(phase!=='wishing')return;phase='blown';root.classList.remove('is-lit');root.classList.add('is-blown');candle.setAttribute('aria-pressed','false');candle.setAttribute('aria-label','蜡烛已吹灭');hint.textContent='呼——愿你的心愿，慢慢成真。';ritualNote.textContent='愿望交给小小的烟，祝福留在这里。';wish.hidden=true;status.textContent='蜡烛吹灭了，愿你的心愿成真';celebrate();candle.focus({preventScroll:true});stage.scrollIntoView({behavior:reduced()?'instant':'smooth',block:'center'});});
  replay.addEventListener('click',()=>{reset();candle.focus({preventScroll:true});stage.scrollIntoView({behavior:reduced()?'instant':'smooth',block:'center'});});
  if(editable){candle.setAttribute('aria-label','收礼蜡烛的位置');cake.addEventListener('click',e=>onPosition?.(e,stage,position));}
  return {reset,position};
 }
 window.CakeGiftView={mount};
})();
