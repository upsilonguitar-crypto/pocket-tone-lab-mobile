/* Pocket Tone Lab — Tone Match mobile UI.
 * Local-only audio comparison. It never writes hardware automatically.
 */
(() => {
  'use strict';
  const Core=window.PTLToneMatchCore;
  if(!Core){console.error('Tone Match core missing');return}
  const $t=s=>document.querySelector(s);
  const tm={
    ref:{file:null,buffer:null,profile:null,url:null},
    source:{file:null,buffer:null,profile:null,url:null,samples:null,sampleRate:null},
    match:null,original:null,matched:null,changes:[],recording:false,
    history:JSON.parse(localStorage.getItem('ptl-tone-match-history')||'[]')
  };
  let audioCtx=null;
  const audioContext=()=>audioCtx||(audioCtx=new (window.AudioContext||window.webkitAudioContext)());
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const num=(id,def=0)=>{const v=Number($t(id)?.value);return Number.isFinite(v)?v:def};
  const signed=v=>`${Number(v)>=0?'+':''}${Number(v).toFixed(1)}`;
  const safeEsc=s=>typeof esc==='function'?esc(s):String(s??'').replace(/[&<>"']/g,'');

  function saveHistory(){localStorage.setItem('ptl-tone-match-history',JSON.stringify(tm.history.slice(0,12)))}
  function status(slot,text,kind=''){const el=$t(slot==='ref'?'#tmRefStatus':'#tmSourceStatus');if(el){el.textContent=text;el.className=`tm-status ${kind}`}}
  function setBusy(on,text='Analyse…'){const b=$t('#tmAnalyzeBtn');if(!b)return;b.disabled=on;b.textContent=on?text:'◎ ANALYSER & PROPOSER LE MATCH'}
  function setPreview(slot,url){const el=$t(slot==='ref'?'#tmRefPreview':'#tmSourcePreview');if(!el)return;el.src=url||'';el.hidden=!url;if(url)el.load()}
  function clearUrl(slot){if(tm[slot].url)URL.revokeObjectURL(tm[slot].url);tm[slot].url=null}

  async function decodeFile(slot,file){
    if(!file)return;
    status(slot,'Décodage…');
    const ctx=audioContext();if(ctx.state==='suspended')await ctx.resume();
    const ab=await file.arrayBuffer();const buffer=await ctx.decodeAudioData(ab.slice(0));
    clearUrl(slot);tm[slot].url=URL.createObjectURL(file);setPreview(slot,tm[slot].url);
    tm[slot].file=file;tm[slot].buffer=buffer;tm[slot].samples=null;tm[slot].sampleRate=buffer.sampleRate;
    const dur=Math.max(0.5,buffer.duration);
    const startEl=$t(slot==='ref'?'#tmRefStart':'#tmSourceStart'),durEl=$t(slot==='ref'?'#tmRefDuration':'#tmSourceDuration');
    if(startEl){startEl.max=Math.max(0,Math.floor(dur-.5));startEl.value='0'}
    if(durEl){durEl.max=Math.ceil(dur);durEl.value=String(Math.min(12,Math.max(3,Math.floor(dur))))}
    const meta=$t(slot==='ref'?'#tmRefMeta':'#tmSourceMeta');if(meta)meta.textContent=`${file.name} · ${dur.toFixed(1)} s · ${Math.round(buffer.sampleRate/100)/10} kHz`;
    await analyzeSlot(slot);
  }

  function downmixWindow(buffer,startSec,durationSec){
    const sr=buffer.sampleRate,start=Math.max(0,Math.floor(startSec*sr)),end=Math.min(buffer.length,start+Math.floor(durationSec*sr));
    if(end-start<sr*.4)throw new Error('Fenêtre audio trop courte');
    const out=new Float32Array(end-start),channels=buffer.numberOfChannels;
    for(let c=0;c<channels;c++){const d=buffer.getChannelData(c);for(let i=start,j=0;i<end;i++,j++)out[j]+=d[i]/channels}
    return {samples:out,sampleRate:sr};
  }

  async function analyzeSlot(slot){
    const data=tm[slot];status(slot,'Analyse locale…');await sleep(10);
    let samples,sampleRate;
    if(data.buffer){
      const st=num(slot==='ref'?'#tmRefStart':'#tmSourceStart',0),du=num(slot==='ref'?'#tmRefDuration':'#tmSourceDuration',12);
      ({samples,sampleRate}=downmixWindow(data.buffer,st,du));
    }else if(data.samples){samples=data.samples;sampleRate=data.sampleRate}else throw new Error('Aucun audio chargé');
    const p=Core.analyzePCM(samples,sampleRate);data.profile=p;renderProfile(slot,p);status(slot,`PRÊT · ${p.duration.toFixed(1)} s analysées`,'good');return p;
  }

  function renderProfile(slot,p){
    const host=$t(slot==='ref'?'#tmRefProfile':'#tmSourceProfile');if(!host)return;
    const bars=Core.BAND_DEFS.map(b=>{const d=p.bands[b.id],w=Math.max(5,Math.min(100,(d+32)*3.4));return `<div class="tm-band"><span>${b.label}</span><i><b style="width:${w}%"></b></i><em>${d.toFixed(1)} dB</em></div>`}).join('');
    host.innerHTML=`<div class="tm-spectrum">${bars}</div><div class="tm-metrics"><span><small>BRIGHT</small><b>${Math.round(p.brightness)}</b></span><span><small>BODY</small><b>${Math.round(p.body)}</b></span><span><small>DRIVE</small><b>${Math.round(p.drive)}</b></span><span><small>SPACE*</small><b>${Math.round(p.space)}</b></span><span><small>RMS</small><b>${p.rmsDb.toFixed(1)}</b></span><span><small>CENTROID</small><b>${Math.round(p.centroidHz)}</b></span></div>`;
  }

  function pcmToWav(samples,sampleRate){
    const ab=new ArrayBuffer(44+samples.length*2),v=new DataView(ab),write=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i))};
    write(0,'RIFF');v.setUint32(4,36+samples.length*2,true);write(8,'WAVE');write(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);write(36,'data');v.setUint32(40,samples.length*2,true);
    let o=44;for(const x0 of samples){const x=Math.max(-1,Math.min(1,x0));v.setInt16(o,x<0?x*0x8000:x*0x7fff,true);o+=2}return new Blob([ab],{type:'audio/wav'});
  }

  async function waitMicPermission(){
    try{
      if(window.AndroidBridge?.hasMicrophonePermission?.())return true;
      window.AndroidBridge?.requestMicrophonePermission?.();
      for(let i=0;i<35;i++){await sleep(180);if(window.AndroidBridge?.hasMicrophonePermission?.())return true}
    }catch{}
    return true; // Browser permission prompt may still handle it.
  }

  async function recordMic(){
    if(tm.recording)return;
    const btn=$t('#tmRecordBtn');
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('Capture microphone non disponible sur ce WebView');
      tm.recording=true;btn.disabled=true;await waitMicPermission();
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});
      const ctx=audioContext();if(ctx.state==='suspended')await ctx.resume();
      const src=ctx.createMediaStreamSource(stream),proc=ctx.createScriptProcessor(4096,1,1),mute=ctx.createGain();mute.gain.value=0;
      const chunks=[];proc.onaudioprocess=e=>chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      src.connect(proc);proc.connect(mute);mute.connect(ctx.destination);
      const seconds=8,started=performance.now();
      while((performance.now()-started)<seconds*1000){const left=Math.max(0,seconds-(performance.now()-started)/1000);btn.textContent=`● REC ${left.toFixed(1)} s`;status('source','Joue le preset courant…','recording');await sleep(100)}
      proc.disconnect();src.disconnect();mute.disconnect();stream.getTracks().forEach(t=>t.stop());
      const total=chunks.reduce((a,c)=>a+c.length,0),samples=new Float32Array(total);let off=0;for(const c of chunks){samples.set(c,off);off+=c.length}
      if(total<ctx.sampleRate)throw new Error('Capture trop courte');
      tm.source.buffer=null;tm.source.file=null;tm.source.samples=samples;tm.source.sampleRate=ctx.sampleRate;clearUrl('source');
      const blob=pcmToWav(samples,ctx.sampleRate);tm.source.url=URL.createObjectURL(blob);setPreview('source',tm.source.url);
      const meta=$t('#tmSourceMeta');if(meta)meta.textContent=`Capture micro · ${(samples.length/ctx.sampleRate).toFixed(1)} s · ${Math.round(ctx.sampleRate/100)/10} kHz`;
      await analyzeSlot('source');toast('Capture de ton son analysée localement');
    }catch(e){console.error(e);status('source',e.message||'Capture impossible','bad');toast(e.message||'Capture microphone impossible')}
    finally{tm.recording=false;btn.disabled=false;btn.textContent='● ENREGISTRER 8 s'}
  }

  function matchModeLabel(mode){return mode==='mix'?'Guitare dans un mix':mode==='rhythm'?'Rythmique / dense':'Guitare isolée / solo'}
  function renderResult(){
    const r=tm.match,host=$t('#tmResult');if(!host)return;
    if(!r){host.innerHTML='<div class="tm-empty-result">Charge deux extraits puis lance Tone Match.</div>';return}
    const strength=num('#tmStrength',70),summary=Core.summarizeChanges(r,strength);
    const rows=summary.length?summary.map(x=>`<div class="tm-change ${x.delta>0?'up':'down'}"><span>${safeEsc(x.label)}</span><b>${signed(x.delta)}</b></div>`).join(''):'<div class="tm-nochange">Le caractère est déjà très proche.</div>';
    const bands=Core.BAND_DEFS.map(b=>{const d=r.bandDelta[b.id],v=Math.min(50,Math.abs(d)*4),side=d>=0?'right':'left';return `<div class="tm-delta-row"><span>${b.label}</span><div class="tm-delta-axis"><i class="${side}" style="width:${v}%"></i></div><b>${signed(d)}</b></div>`}).join('');
    host.innerHTML=`
      <div class="tm-result-head"><div class="tm-score-ring" style="--score-pct:${r.beforeScore}%"><b>${r.beforeScore}</b><small>SIMILARITÉ</small></div><div><span class="eyebrow">Avant correction</span><h2>${r.beforeScore}/100</h2><p>Confiance ${r.confidence}% · ${safeEsc(matchModeLabel(r.mode))}</p></div></div>
      <div class="tm-result-grid"><div><h3>Écart spectral</h3>${bands}</div><div><h3>Corrections proposées</h3><div class="tm-change-grid">${rows}</div></div></div>
      <div class="tm-character-grid"><span><small>BRIGHTNESS</small><b>${signed(r.metrics.brightness)}</b></span><span><small>BODY</small><b>${signed(r.metrics.body)}</b></span><span><small>DRIVE</small><b>${signed(r.metrics.drive)}</b></span><span><small>SPACE*</small><b>${signed(r.metrics.space)}</b></span></div>
      <p class="tm-result-note">${safeEsc(r.note)} Les corrections sont plafonnées : Tone Match ne change ni le modèle AMP/DRV, ni la chaîne, ni un slot matériel.</p>`;
    $t('#tmABar').disabled=!tm.original;$t('#tmBBar').disabled=!tm.matched;$t('#tmApplyBtn').disabled=!tm.matched;$t('#tmSendBtn').disabled=!tm.matched;
  }

  function rebuildMatched(){
    if(!tm.match||!tm.original)return;const strength=num('#tmStrength',70),applied=Core.applyMatchToPreset(tm.original,tm.match,strength);tm.matched=applied.preset;tm.changes=applied.changes;renderResult();
  }

  async function runMatch(){
    try{
      if(!state.current)throw new Error('Charge d’abord un preset dans Tone Studio');
      setBusy(true,'ANALYSE DSP…');
      if(tm.ref.buffer||tm.ref.samples)await analyzeSlot('ref');else if(!tm.ref.profile)throw new Error('Charge un audio de référence');
      if(tm.source.buffer||tm.source.samples)await analyzeSlot('source');else if(!tm.source.profile)throw new Error('Charge ou enregistre ton son actuel');
      const focus=$t('#tmFocus')?.value||'isolated';tm.match=Core.matchProfiles(tm.ref.profile,tm.source.profile,{focus});tm.original=structuredClone(state.current);rebuildMatched();
      tm.history.unshift({at:new Date().toISOString(),preset:state.current.name,score:tm.match.beforeScore,confidence:tm.match.confidence,mode:focus,adjustments:tm.match.adjustments});tm.history=tm.history.slice(0,12);saveHistory();renderHistory();
      toast(`Tone Match terminé · similarité ${tm.match.beforeScore}/100`);
    }catch(e){console.error(e);toast(e.message||'Tone Match impossible');$t('#tmResult').innerHTML=`<div class="tm-error">${safeEsc(e.message||String(e))}</div>`}
    finally{setBusy(false)}
  }

  function loadPresetLocal(p,label){if(!p)return;state.current=structuredClone(p);renderDetail(state.current,$('#detailPanel'));updateHardwareStrip(state.current);renderPresets();syncCurrentPreset();toast(label)}
  function applyMatched(){if(!tm.matched)return;loadPresetLocal(tm.matched,'Tone Match appliqué localement · aucun write hardware');activateTab('library')}
  function sendMatched(){if(!tm.matched)return toast('Lance Tone Match');state.transferPreset=structuredClone(tm.matched);openTransfer(state.transferPreset)}
  function syncCurrentPreset(){const el=$t('#tmCurrentPreset');if(el)el.textContent=state.current?`${state.current.name} · ${state.current.modules?.AMP?.model||'AMP —'}`:'Aucun preset chargé'}

  function renderHistory(){const h=$t('#tmHistory');if(!h)return;h.innerHTML=tm.history.length?tm.history.map(x=>`<div class="tm-history-row"><span>${new Date(x.at).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'})}</span><div><b>${safeEsc(x.preset)}</b><small>${x.score}/100 · ${safeEsc(matchModeLabel(x.mode))}</small></div><i>${x.confidence}%</i></div>`).join(''):'<div class="tm-history-empty">Aucune session Tone Match.</div>'}

  function fileChanged(slot,e){const f=e.target.files?.[0];if(!f)return;decodeFile(slot,f).catch(err=>{console.error(err);status(slot,err.message||'Audio invalide','bad');toast(err.message||'Audio invalide')})}
  function reanalyze(slot){analyzeSlot(slot).catch(e=>{status(slot,e.message,'bad');toast(e.message)})}

  function wire(){
    $t('#tmRefFile')?.addEventListener('change',e=>fileChanged('ref',e));$t('#tmSourceFile')?.addEventListener('change',e=>fileChanged('source',e));
    $t('#tmRefReanalyze')?.addEventListener('click',()=>reanalyze('ref'));$t('#tmSourceReanalyze')?.addEventListener('click',()=>reanalyze('source'));
    $t('#tmRecordBtn')?.addEventListener('click',recordMic);$t('#tmAnalyzeBtn')?.addEventListener('click',runMatch);
    $t('#tmStrength')?.addEventListener('input',e=>{$t('#tmStrengthVal').textContent=`${e.target.value}%`;if(tm.match)rebuildMatched()});
    $t('#tmFocus')?.addEventListener('change',()=>{if(tm.ref.profile&&tm.source.profile&&tm.original){tm.match=Core.matchProfiles(tm.ref.profile,tm.source.profile,{focus:$t('#tmFocus').value});rebuildMatched()}});
    $t('#tmABar')?.addEventListener('click',()=>loadPresetLocal(tm.original,'A · preset original chargé localement'));
    $t('#tmBBar')?.addEventListener('click',()=>loadPresetLocal(tm.matched,'B · Tone Match chargé localement'));
    $t('#tmApplyBtn')?.addEventListener('click',applyMatched);$t('#tmSendBtn')?.addEventListener('click',sendMatched);
    document.addEventListener('click',e=>{if(e.target.closest('[data-tab="tonematch"]'))setTimeout(syncCurrentPreset,0)});
    ['#tmRefStart','#tmRefDuration'].forEach(id=>$t(id)?.addEventListener('change',()=>status('ref','Fenêtre modifiée · relance l’analyse','warn')));
    ['#tmSourceStart','#tmSourceDuration'].forEach(id=>$t(id)?.addEventListener('change',()=>status('source','Fenêtre modifiée · relance l’analyse','warn')));
    syncCurrentPreset();renderHistory();renderResult();
  }
  window.PTLToneMatch={syncCurrentPreset,runMatch,get session(){return tm}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire);else wire();
})();
