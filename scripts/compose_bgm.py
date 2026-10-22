"""Original 32-bar waltz for the cake studio. No samples or external recordings.
Run: python scripts/compose_bgm.py (requires numpy). Output is a seamless PCM WAV.
"""
from pathlib import Path
import json, wave
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
SR=32000; BPM=84; BEAT=60/BPM; BARS=32; DURATION=BARS*3*BEAT
N=round(DURATION*SR); mix=np.zeros((N,2),np.float64); events=[]
rng=np.random.default_rng(42419)
# Each pair is a MIDI pitch and length in half-beats. A rest is None.
A=[[(76,2),(79,1),(76,1),(74,2)],[(72,3),(71,1),(69,2)],[(69,2),(72,1),(74,1),(76,2)],[(74,4),(None,2)],[(77,2),(76,1),(74,1),(72,2)],[(71,2),(74,2),(79,2)],[(76,2),(74,1),(72,1),(69,2)],[(71,2),(74,2),(None,2)]]
B=[[(79,2),(81,1),(79,1),(76,2)],[(77,2),(76,2),(72,2)],[(74,3),(76,1),(77,2)],[(76,4),(None,2)],[(72,1),(74,1),(76,2),(79,2)],[(77,2),(74,2),(71,2)],[(72,2),(76,2),(74,2)],[(72,4),(None,2)]]
chords=[[48,55,60,64],[45,52,57,60],[50,57,60,65],[43,50,59,62],[41,48,57,60],[43,50,59,62],[45,52,57,60],[43,50,59,62]]

def note(midi,beat,dur,amp,kind='bell',pan=0):
    events.append(dict(midi=midi,beat=round(beat,4),duration=round(dur,4),gain=amp,voice=kind,pan=pan))
    seconds=dur*BEAT+(.7 if kind=='bell' else .25); t=np.arange(round(seconds*SR))/SR
    f=440*2**((midi-69)/12)
    if kind=='bell':
        y=(np.sin(2*np.pi*f*t)*np.exp(-t*2.7)+.20*np.sin(2*np.pi*f*2*t)*np.exp(-t*7)+.065*np.sin(2*np.pi*f*3*t)*np.exp(-t*12))
    elif kind=='bass':
        y=(np.sin(2*np.pi*f*t)+.13*np.sin(2*np.pi*f*2*t))*np.exp(-t*2.3)
    else:
        y=(np.sin(2*np.pi*f*t)+.22*np.sin(2*np.pi*f*2*t)+.08*np.sin(2*np.pi*f*3*t))*np.exp(-t*4)
    attack=1-np.exp(-t/(.014 if kind=='bell' else .008)); release=np.minimum(1,np.maximum(0,(seconds-t)/.08)); y*=attack*release*amp
    stereo=y[:,None]*np.array([np.sqrt((1-pan)/2),np.sqrt((1+pan)/2)])
    start=round(beat*BEAT*SR)
    for delay,gain,panswap in [(0,1,False),(.16,.13,True),(.29,.075,False)]:
        idx=(start+round(delay*SR)+np.arange(len(t)))%N
        np.add.at(mix,idx,stereo[:,::-1] *gain if panswap else stereo*gain)

for bar in range(BARS):
    melody=(A if bar<16 else B)[bar%8]
    chord=chords[bar%8]
    if bar>=16 and bar%8==7:chord=[48,55,60,64]
    base=bar*3
    note(chord[0],base,1.5,.19,'bass',-.1)
    for beat in [1,2]:
        for j,midi in enumerate(chord[1:]):note(midi+12,base+beat+j*.035,.7,.075,'pluck',(-.35+j*.35))
    at=0
    for midi,length in melody:
        if midi is not None:note(midi,base+at,length/2,.185 if bar%16<8 else .16,'bell',.13)
        at+=length/2
    # Occasional high answer in the repeated phrase, with generous rests.
    if bar%8 in [3,7]:note(chord[2]+24,base+2.3,.5,.07,'bell',-.4)
# Bounded soft saturation; keep headroom for game effects in the browser.
peak=float(np.max(np.abs(mix))); mix*=.72/max(peak,.001)
pcm=np.round(np.clip(mix,-1,1)*32767).astype('<i2')
out=ROOT/'audio'/'little-kitchen-waltz.wav'
with wave.open(str(out),'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(SR);w.writeframes(pcm.tobytes())
(ROOT/'audio'/'score.json').write_text(json.dumps({'title':'烤箱旁的小圆舞曲','bpm':BPM,'meter':'3/4','bars':BARS,'seconds':DURATION,'events':events},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print(json.dumps({'seconds':round(DURATION,3),'peak':round(float(np.max(np.abs(mix))),3),'rms':round(float(np.sqrt(np.mean(mix**2))),4),'loop_jump':round(float(np.max(np.abs(mix[0]-mix[-1]))),5),'bytes':out.stat().st_size}))
