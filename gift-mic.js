(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CakeGiftMic=api;})(globalThis,function(){
 'use strict';
 // A short, local-only sound heuristic, not speech recognition or a breath sensor.
 function features(wave,spectrum,sampleRate){let energy=0,crossings=0,mean=0;for(const x of wave)mean+=x;mean/=wave.length;for(let i=0;i<wave.length;i++){const x=wave[i]-mean;energy+=x*x;if(i&&x*(wave[i-1]-mean)<0)crossings++;}let sum=0,peak=0,log=0,count=0;const binHz=sampleRate/(spectrum.length*2);for(let i=1;i<spectrum.length&&i*binHz<=6000;i++){if(i*binHz<80)continue;const power=Math.pow(10,Math.max(-120,spectrum[i])/10);sum+=power;peak=Math.max(peak,power);log+=Math.log(Math.max(power,1e-12));count++;}return {rms:Math.sqrt(energy/wave.length),zcr:crossings/wave.length,flatness:count&&sum?Math.exp(log/count)/(sum/count):0,peakShare:sum?peak/sum:1};}
 function detector(){let start=null,last=null,hold=0,fired=false;const noise=[];return {sample(f,now){if(start===null)start=now;const dt=last===null?0:Math.min(70,Math.max(0,now-last));last=now;if(now-start<1000){noise.push(f.rms);return {calibrating:true,level:0,blow:false};}const sorted=noise.slice().sort((a,b)=>a-b),floor=sorted.length?sorted[Math.floor(sorted.length*.65)]:.003,threshold=Math.max(.014,floor*3+.006);const noisy=f.flatness>.07||(f.peakShare<.22&&f.zcr>.018),candidate=f.rms>threshold&&noisy;hold=candidate?hold+dt:Math.max(0,hold-dt*2.5);const blow=!fired&&hold>=420;if(blow)fired=true;return {calibrating:false,level:Math.min(1,hold/420),blow};}};}
 function create({onStatus=()=>{},onLevel=()=>{},onBlow=()=>{},alive=()=>true}={},env=globalThis){
  let serial=0,active=false,stream=null,context=null,source=null,frame=null,deadline=null,observer=null;
  const emit=(state,text)=>onStatus(state,text);
  const releaseTracks=s=>s?.getTracks().forEach(t=>{try{t.stop();}catch{}});
  function hidden(){if(env.document?.hidden)stop('页面已离开，麦克风已关闭。');}
  function leaving(){stop();}
  function stop(message=''){serial++;active=false;env.cancelAnimationFrame?.(frame);env.clearTimeout(deadline);frame=deadline=null;observer?.disconnect();observer=null;env.document?.removeEventListener('visibilitychange',hidden);env.removeEventListener?.('pagehide',leaving);env.removeEventListener?.('hashchange',leaving);try{source?.disconnect();}catch{}source=null;releaseTracks(stream);stream=null;const old=context;context=null;if(old)try{Promise.resolve(old.close()).catch(()=>{});}catch{}onLevel(0);emit('idle',message);}
  async function start(){if(active)return;const Audio=env.AudioContext||env.webkitAudioContext;if(!env.isSecureContext||!env.navigator?.mediaDevices?.getUserMedia||!Audio){emit('unavailable','这个浏览器暂时不能开麦。可以换系统浏览器打开，或直接点按钮吹灭。');return;}stop();active=true;const run=serial;emit('requesting','请在浏览器提示中允许麦克风；也可以取消，继续用按钮。');
   env.document?.addEventListener('visibilitychange',hidden);env.addEventListener?.('pagehide',leaving);env.addEventListener?.('hashchange',leaving);
   if(env.MutationObserver&&env.document?.body){observer=new env.MutationObserver(()=>{if(!alive())stop();});observer.observe(env.document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});}
   deadline=env.setTimeout(()=>stop('这次等待已结束，麦克风已关闭。想试的话可以重新开启。'),25000);
   try{
    // Resume inside the click gesture for mobile Safari. Never connect to speakers.
    const audio=new Audio();context=audio;const resumed=audio.resume();Promise.resolve(resumed).catch(()=>{});
    const acquired=await env.navigator.mediaDevices.getUserMedia({video:false,audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:1}});
    if(run!==serial||!alive()){releaseTracks(acquired);if(run===serial)stop();return;}stream=acquired;
    await resumed;if(run!==serial)return;if(audio.state!=='running')throw Object.assign(Error('suspended'),{name:'AudioSuspended'});
    const analyser=audio.createAnalyser();analyser.fftSize=1024;analyser.smoothingTimeConstant=0;source=audio.createMediaStreamSource(stream);source.connect(analyser);stream.getTracks().forEach(t=>t.addEventListener?.('ended',()=>{if(run===serial)stop('麦克风已断开，仍然可以点按钮吹灭。');},{once:true}));
    const wave=new Float32Array(analyser.fftSize),frequency=new Float32Array(analyser.frequencyBinCount),detect=detector();let calibrated=false,lastUi=-Infinity;
    env.clearTimeout(deadline);deadline=env.setTimeout(()=>stop('这次还没听到吹气，麦克风已关闭。靠近手机再试，或点按钮吹灭。'),20000);emit('calibrating','先安静一秒，让小蜡烛听听周围的声音……');
    function tick(now){if(run!==serial)return;if(!alive()||env.document?.hidden){stop();return;}try{analyser.getFloatTimeDomainData(wave);analyser.getFloatFrequencyData(frequency);const result=detect.sample(features(wave,frequency,audio.sampleRate),now);if(!result.calibrating&&!calibrated){calibrated=true;emit('listening','可以吹啦：靠近手机麦克风，轻轻连续吹半秒。');}if(now-lastUi>70){onLevel(result.level);lastUi=now;}if(result.blow){stop();onBlow();return;}frame=env.requestAnimationFrame(tick);}catch{stop('暂时没有读到声音，麦克风已关闭。可以继续点按钮吹灭。');}}
    frame=env.requestAnimationFrame(tick);
   }catch(error){if(run!==serial)return;stop();const messages={NotAllowedError:'没有开启麦克风也没关系，点按钮一样能吹灭。',NotFoundError:'没有找到麦克风，仍然可以点按钮吹灭。',NotReadableError:'麦克风可能被其他应用占用了，请稍后再试，或点按钮吹灭。',AudioSuspended:'浏览器暂停了声音检测，请再点一次开启，或直接点按钮吹灭。'};emit('error',messages[error.name]||'麦克风暂时不可用，仍然可以点按钮吹灭。');}
  }
  return {start,stop,get active(){return active;}};
 }
 return {features,detector,create};
});
