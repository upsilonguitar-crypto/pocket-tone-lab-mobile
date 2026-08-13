/* Pocket Tone Lab — Tone Match mobile UI.
 * Local-only audio comparison + iterative closed-loop refinement.
 * It NEVER writes hardware automatically: every hardware test still goes through Hardware Guard.
 */
(() => {
  'use strict';
  const Core=window.PTLToneMatchCore;
  if(!Core){console.error('Tone Match core missing');return}
  const $t=s=>document.querySelector(s);
  const clone=o=>typeof structuredClone==='function'?structuredClone(o):JSON.parse(JSON.stringify(o));
  const tm={
    ref:{file:null,buffer:null,profile:null,url:null,samples:null,sampleRate:null},
    source:{file:null,buffer:null,profile:null,url:null,samples:null,sampleRate:null},
    match:null,original:null,matched:null,changes:[],recording:false,
    history:JSON.parse(localStorage.getItem('ptl-tone-match-history')||'[]'),
    iterative:{
      active:false,phase:'idle',sessionId:null,startedAt:null,
      threshold:93,maxIterations:5,basePreset:null,candidate:null,candidateIteration:0,
      measured:[],best:null,lastPlan:null,lastImprovement:null
    }
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
    return true;
  }

  async function recordMic(opts={}){
    if(tm.recording)return;
    const iterative=Boolean(opts.iterative),btn=iterative?$t('#tmIterCaptureBtn'):$t('#tmRecordBtn');
    const normalBtn=$t('#tmRecordBtn'),iterBtn=$t('#tmIterCaptureBtn');
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('Capture microphone non disponible sur ce WebView');
      if(iterative&&!tm.iterative.active)throw new Error('Lance d’abord un Tone Match');
      if(iterative&&!tm.iterative.candidate)throw new Error('Aucun candidat à mesurer');
      tm.recording=true;if(normalBtn)normalBtn.disabled=true;if(iterBtn)iterBtn.disabled=true;await waitMicPermission();
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});
      const ctx=audioContext();if(ctx.state==='suspended')await ctx.resume();
      const src=ctx.createMediaStreamSource(stream),proc=ctx.createScriptProcessor(4096,1,1),mute=ctx.createGain();mute.gain.value=0;
      const chunks=[];proc.onaudioprocess=e=>chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      src.connect(proc);proc.connect(mute);mute.connect(ctx.destination);
      const seconds=8,started=performance.now();
      while((performance.now()-started)<seconds*1000){
        const left=Math.max(0,seconds-(performance.now()-started)/1000);
        if(btn)btn.textContent=`● REC ${left.toFixed(1)} s`;
        status('source',iterative?`Mesure du candidat I${tm.iterative.candidateIteration}…`:'Joue le preset courant…','recording');
        await sleep(100);
      }
      proc.disconnect();src.disconnect();mute.disconnect();stream.getTracks().forEach(t=>t.stop());
      const total=chunks.reduce((a,c)=>a+c.length,0),samples=new Float32Array(total);let off=0;for(const c of chunks){samples.set(c,off);off+=c.length}
      if(total<ctx.sampleRate)throw new Error('Capture trop courte');
      tm.source.buffer=null;tm.source.file=null;tm.source.samples=samples;tm.source.sampleRate=ctx.sampleRate;clearUrl('source');
      const blob=pcmToWav(samples,ctx.sampleRate);tm.source.url=URL.createObjectURL(blob);setPreview('source',tm.source.url);
      const meta=$t('#tmSourceMeta');if(meta)meta.textContent=`Capture micro${iterative?` I${tm.iterative.candidateIteration}`:''} · ${(samples.length/ctx.sampleRate).toFixed(1)} s · ${Math.round(ctx.sampleRate/100)/10} kHz`;
      await analyzeSlot('source');
      if(iterative)await processIterativeMeasurement();else toast('Capture de ton son analysée localement');
    }catch(e){console.error(e);status('source',e.message||'Capture impossible','bad');toast(e.message||'Capture microphone impossible')}
    finally{
      tm.recording=false;if(normalBtn)normalBtn.disabled=false;if(iterBtn)iterBtn.disabled=false;
      if(normalBtn)normalBtn.textContent='● ENREGISTRER 8 s';renderIterative();
    }
  }

  function matchModeLabel(mode){return mode==='mix'?'Guitare dans un mix':mode==='rhythm'?'Rythmique / dense':'Guitare isolée / solo'}
  function renderResult(){
    const r=tm.match,host=$t('#tmResult');if(!host)return;
    if(!r){host.innerHTML='<div class="tm-empty-result">Charge deux extraits puis lance Tone Match.</div>';return}
    const strength=tm.iterative.active&&tm.iterative.candidateIteration>1?(r.adaptiveStrength||num('#tmStrength',70)):num('#tmStrength',70),summary=Core.summarizeChanges(r,strength);
    const rows=summary.length?summary.map(x=>`<div class="tm-change ${x.delta>0?'up':'down'}"><span>${safeEsc(x.label)}</span><b>${signed(x.delta)}</b></div>`).join(''):'<div class="tm-nochange">Le caractère est déjà très proche.</div>';
    const bands=Core.BAND_DEFS.map(b=>{const d=r.bandDelta[b.id],v=Math.min(50,Math.abs(d)*4),side=d>=0?'right':'left';return `<div class="tm-delta-row"><span>${b.label}</span><div class="tm-delta-axis"><i class="${side}" style="width:${v}%"></i></div><b>${signed(d)}</b></div>`}).join('');
    const iterNote=tm.iterative.active?` · I${tm.iterative.candidateIteration||1}${r.adaptiveStrength?` · force adaptative ${r.adaptiveStrength}%`:''}`:'';
    host.innerHTML=`
      <div class="tm-result-head"><div class="tm-score-ring" style="--score-pct:${r.beforeScore}%"><b>${r.beforeScore}</b><small>SIMILARITÉ</small></div><div><span class="eyebrow">${tm.iterative.active&&tm.iterative.measured.length>1?'Score mesuré après itération':'Avant correction'}</span><h2>${r.beforeScore}/100</h2><p>Confiance ${r.confidence}% · ${safeEsc(matchModeLabel(r.mode))}${safeEsc(iterNote)}</p></div></div>
      <div class="tm-result-grid"><div><h3>Écart spectral résiduel</h3>${bands}</div><div><h3>Corrections proposées</h3><div class="tm-change-grid">${rows}</div></div></div>
      <div class="tm-character-grid"><span><small>BRIGHTNESS</small><b>${signed(r.metrics.brightness)}</b></span><span><small>BODY</small><b>${signed(r.metrics.body)}</b></span><span><small>DRIVE</small><b>${signed(r.metrics.drive)}</b></span><span><small>SPACE*</small><b>${signed(r.metrics.space)}</b></span></div>
      <p class="tm-result-note">${safeEsc(r.note)} Les corrections sont plafonnées : Tone Match ne change ni le modèle AMP/DRV, ni la chaîne, ni un slot matériel.</p>`;
    $t('#tmABar').disabled=!tm.original;$t('#tmBBar').disabled=!tm.matched;$t('#tmApplyBtn').disabled=!tm.matched;$t('#tmSendBtn').disabled=!tm.matched;
  }

  function currentCandidateStrength(){
    if(tm.iterative.active&&tm.iterative.candidateIteration>1&&tm.match?.adaptiveStrength)return tm.match.adaptiveStrength;
    return num('#tmStrength',70);
  }

  function rebuildMatched(){
    if(!tm.match)return;
    const base=tm.iterative.active?(tm.iterative.basePreset||tm.original):tm.original;
    if(!base)return;
    const strength=currentCandidateStrength();
    const applied=tm.iterative.active?Core.applyIterativeMatchToPreset(base,tm.match,{strength,iteration:tm.iterative.candidateIteration||1}):Core.applyMatchToPreset(base,tm.match,strength);
    tm.matched=applied.preset;tm.changes=applied.changes;
    if(tm.iterative.active)tm.iterative.candidate=clone(tm.matched);
    renderResult();renderIterative();
  }

  function resetIterative(){
    tm.iterative={active:false,phase:'idle',sessionId:null,startedAt:null,threshold:num('#tmIterTarget',93),maxIterations:num('#tmIterMax',5),basePreset:null,candidate:null,candidateIteration:0,measured:[],best:null,lastPlan:null,lastImprovement:null};
    renderIterative();
  }

  function startIterativeSession(plan){
    const threshold=num('#tmIterTarget',93),maxIterations=num('#tmIterMax',5);
    const m0={iteration:0,score:plan.beforeScore,confidence:plan.confidence,preset:clone(tm.original),profile:clone(tm.source.profile),at:new Date().toISOString(),label:'ORIGINAL'};
    tm.iterative={active:true,phase:'candidate_ready',sessionId:`tm-${Date.now()}`,startedAt:new Date().toISOString(),threshold,maxIterations,basePreset:clone(tm.original),candidate:null,candidateIteration:1,measured:[m0],best:m0,lastPlan:plan,lastImprovement:null};
    rebuildMatched();
  }

  async function runMatch(){
    try{
      if(!state.current)throw new Error('Charge d’abord un preset dans Tone Studio');
      setBusy(true,'ANALYSE DSP…');
      if(tm.ref.buffer||tm.ref.samples)await analyzeSlot('ref');else if(!tm.ref.profile)throw new Error('Charge un audio de référence');
      if(tm.source.buffer||tm.source.samples)await analyzeSlot('source');else if(!tm.source.profile)throw new Error('Charge ou enregistre ton son actuel');
      const focus=$t('#tmFocus')?.value||'isolated',threshold=num('#tmIterTarget',93);
      tm.original=clone(state.current);
      tm.match=Core.planIteration(tm.ref.profile,tm.source.profile,{focus,iteration:1,baseStrength:num('#tmStrength',70),threshold});
      startIterativeSession(tm.match);
      tm.history.unshift({at:new Date().toISOString(),preset:state.current.name,score:tm.match.beforeScore,confidence:tm.match.confidence,mode:focus,adjustments:tm.match.adjustments,iterative:true});tm.history=tm.history.slice(0,12);saveHistory();renderHistory();
      toast(`Tone Match I1 prêt · similarité ${tm.match.beforeScore}/100`);
    }catch(e){console.error(e);toast(e.message||'Tone Match impossible');$t('#tmResult').innerHTML=`<div class="tm-error">${safeEsc(e.message||String(e))}</div>`}
    finally{setBusy(false)}
  }

  async function processIterativeMeasurement(){
    const it=tm.iterative;
    if(!it.active||!it.candidate||!tm.ref.profile||!tm.source.profile)return;
    const focus=$t('#tmFocus')?.value||'isolated',prev=it.measured[it.measured.length-1],measuredIteration=it.candidateIteration;
    const score=Core.similarity(tm.ref.profile,tm.source.profile,focus);
    const measured={iteration:measuredIteration,score,confidence:Core.matchProfiles(tm.ref.profile,tm.source.profile,{focus}).confidence,preset:clone(it.candidate),profile:clone(tm.source.profile),at:new Date().toISOString(),label:`I${measuredIteration}`};
    it.measured.push(measured);it.lastImprovement=score-prev.score;
    if(!it.best||score>it.best.score)it.best=measured;

    const nextIteration=measuredIteration+1;
    const plan=Core.planIteration(tm.ref.profile,tm.source.profile,{focus,iteration:nextIteration,previousScore:prev.score,baseStrength:num('#tmStrength',70),threshold:it.threshold});
    it.lastPlan=plan;tm.match=plan;

    if(plan.converged){
      it.phase='converged';it.basePreset=clone(measured.preset);it.candidate=clone(measured.preset);tm.matched=clone(measured.preset);tm.changes=[];
      toast(`Tone Match convergé · ${score}/100 en ${measuredIteration} itération${measuredIteration>1?'s':''}`);
    }else if(plan.regression){
      it.phase='regression';it.basePreset=clone(measured.preset);it.candidate=clone(measured.preset);tm.matched=clone(measured.preset);tm.changes=[];
      toast(`Régression détectée (${signed(it.lastImprovement)} pts) · meilleur ${it.best.score}/100`);
    }else if(measuredIteration>=it.maxIterations){
      it.phase='maxed';it.basePreset=clone(measured.preset);it.candidate=clone(measured.preset);tm.matched=clone(it.best.preset);tm.changes=[];
      toast(`Limite d’itérations atteinte · meilleur score ${it.best.score}/100`);
    }else{
      it.phase='candidate_ready';it.basePreset=clone(measured.preset);it.candidateIteration=nextIteration;
      const applied=Core.applyIterativeMatchToPreset(it.basePreset,plan,{strength:plan.adaptiveStrength,iteration:nextIteration});
      it.candidate=clone(applied.preset);tm.matched=clone(applied.preset);tm.changes=applied.changes;
      toast(`I${measuredIteration} mesurée ${score}/100 · candidat I${nextIteration} prêt (${plan.adaptiveStrength}%)`);
    }
    renderResult();renderIterative();syncCurrentPreset();
  }

  function loadPresetLocal(p,label){if(!p)return;state.current=clone(p);renderDetail(state.current,$('#detailPanel'));updateHardwareStrip(state.current);renderPresets();syncCurrentPreset();toast(label)}
  function applyMatched(){if(!tm.matched)return;loadPresetLocal(tm.matched,'Tone Match appliqué localement · aucun write hardware');activateTab('library')}
  function sendMatched(){
    if(!tm.matched)return toast('Lance Tone Match');
    state.transferPreset=clone(tm.matched);openTransfer(state.transferPreset);
    if(tm.iterative.active&&tm.iterative.phase==='candidate_ready'){tm.iterative.phase='awaiting_capture';renderIterative()}
  }
  function sendIterCandidate(){
    if(!tm.iterative.candidate)return toast('Aucun candidat itératif');
    state.transferPreset=clone(tm.iterative.candidate);openTransfer(state.transferPreset);tm.iterative.phase='awaiting_capture';renderIterative();
  }
  function useBest(){const b=tm.iterative.best;if(!b)return toast('Pas encore de mesure');loadPresetLocal(b.preset,`Meilleur Tone Match · ${b.score}/100 · local uniquement`)}
  function rollbackBest(){
    const it=tm.iterative,b=it.best;if(!b)return;
    it.basePreset=clone(b.preset);it.candidate=clone(b.preset);it.candidateIteration=b.iteration;it.phase='best_ready';tm.matched=clone(b.preset);tm.changes=[];
    loadPresetLocal(b.preset,`Retour au meilleur résultat ${b.score}/100`);renderIterative();renderResult();
  }
  function resumeFromBest(){
    const it=tm.iterative,b=it.best;if(!b||!b.profile)return;
    const focus=$t('#tmFocus')?.value||'isolated',next=Math.max(1,b.iteration+1),previous=it.measured[Math.max(0,it.measured.indexOf(b)-1)]?.score;
    tm.source.profile=clone(b.profile);renderProfile('source',tm.source.profile);
    const plan=Core.planIteration(tm.ref.profile,b.profile,{focus,iteration:next,previousScore:previous,baseStrength:Math.min(55,num('#tmStrength',70)),threshold:it.threshold});
    it.basePreset=clone(b.preset);it.candidateIteration=next;it.lastPlan=plan;tm.match=plan;it.phase='candidate_ready';
    const applied=Core.applyIterativeMatchToPreset(it.basePreset,plan,{strength:plan.adaptiveStrength,iteration:next});it.candidate=clone(applied.preset);tm.matched=clone(applied.preset);tm.changes=applied.changes;
    renderResult();renderIterative();toast(`Reprise depuis le meilleur ${b.score}/100 · force réduite ${plan.adaptiveStrength}%`);
  }
  function useImportedAsIteration(){
    if(!tm.iterative.active)return toast('Lance d’abord un Tone Match');
    if(!tm.source.profile)return toast('Charge ou analyse une capture');
    processIterativeMeasurement().catch(e=>toast(e.message||'Itération impossible'));
  }
  function syncCurrentPreset(){const el=$t('#tmCurrentPreset');if(el)el.textContent=state.current?`${state.current.name} · ${state.current.modules?.AMP?.model||'AMP —'}`:'Aucun preset chargé'}

  function renderIterative(){
    const host=$t('#tmIterPanel');if(!host)return;const it=tm.iterative;
    if(!it.active){host.innerHTML='<div class="tm-iter-empty"><b>TONE MATCH ITÉRATIF</b><span>Après le premier match, l’app peut mesurer le résultat, calculer l’écart résiduel et générer une micro-correction suivante automatiquement.</span></div>';return}
    const scores=it.measured.map(m=>m.score),best=it.best?.score??scores[0]??0,current=scores[scores.length-1]??0;
    const points=it.measured.map((m,i)=>`<div class="tm-iter-point ${it.best===m?'best':''}"><span>${m.label||`I${m.iteration}`}</span><b>${m.score}</b><small>${i?`${m.score-it.measured[i-1].score>=0?'+':''}${m.score-it.measured[i-1].score} pts`:'BASE'}</small></div>`).join('');
    let title='Candidat prêt',desc=`Teste I${it.candidateIteration} sur le Pocket Master puis réenregistre 8 secondes exactement comme avant.`;
    if(it.phase==='awaiting_capture'){title=`Mesure I${it.candidateIteration} attendue`;desc='Après avoir envoyé/testé le candidat temporairement, joue le même passage et capture 8 secondes.'}
    else if(it.phase==='converged'){title='Convergence atteinte';desc=`Le score ${current}/100 atteint la cible ${it.threshold}. Tu peux garder ce résultat.`}
    else if(it.phase==='regression'){title='Régression détectée';desc=`La dernière itération a perdu ${Math.abs(it.lastImprovement||0)} point(s). L’app bloque la boucle pour éviter la sur-correction.`}
    else if(it.phase==='maxed'){title='Limite atteinte';desc=`${it.maxIterations} itérations maximum. Le meilleur résultat reste ${best}/100.`}
    else if(it.phase==='best_ready'){title='Meilleur résultat restauré';desc=`Preset mesuré à ${best}/100 chargé localement. Tu peux le tester ou reprendre avec une correction plus douce.`}
    const nextStrength=it.lastPlan?.adaptiveStrength||currentCandidateStrength();
    const canCapture=['candidate_ready','awaiting_capture'].includes(it.phase),canSend=['candidate_ready','awaiting_capture','best_ready'].includes(it.phase)&&Boolean(it.candidate);
    host.innerHTML=`
      <div class="tm-iter-head"><div><span class="eyebrow">CLOSED LOOP · LOCAL</span><h3>${safeEsc(title)}</h3><p>${safeEsc(desc)}</p></div><div class="tm-iter-score"><small>BEST</small><b>${best}</b><span>/100</span></div></div>
      <div class="tm-iter-targets"><span><small>CIBLE</small><b>${it.threshold}</b></span><span><small>MAX</small><b>${it.maxIterations}</b></span><span><small>MESURES</small><b>${it.measured.length}</b></span><span><small>PROCHAINE FORCE</small><b>${Math.round(nextStrength)}%</b></span></div>
      <div class="tm-iter-timeline">${points}</div>
      <div class="tm-iter-actions">
        <button id="tmIterSendBtn" class="ghost-btn" ${canSend?'':'disabled'}>⇪ TESTER ${it.phase==='best_ready'?'LE MEILLEUR':`CANDIDAT I${it.candidateIteration}`}</button>
        <button id="tmIterCaptureBtn" class="primary-btn" ${canCapture?'':'disabled'}>● APRÈS ENVOI · CAPTURER 8 s</button>
        <button id="tmIterUseCaptureBtn" class="ghost-btn" ${canCapture&&tm.source.profile?'':'disabled'}>◎ UTILISER L’AUDIO CHARGÉ</button>
        <button id="tmIterBestBtn" class="ghost-btn" ${it.best?'':'disabled'}>★ UTILISER LE MEILLEUR</button>
        ${it.phase==='regression'?'<button id="tmIterRollbackBtn" class="danger-outline-btn">↶ REVENIR AU MEILLEUR</button><button id="tmIterResumeBtn" class="ghost-btn">↻ REPRENDRE PLUS DOUX</button>':''}
        ${it.phase==='converged'||it.phase==='maxed'||it.phase==='best_ready'?'<button id="tmIterResumeBtn" class="ghost-btn">↻ REPRENDRE DEPUIS LE MEILLEUR</button>':''}
        <button id="tmIterResetBtn" class="ghost-btn">× NOUVELLE SESSION</button>
      </div>
      <div class="tm-iter-guard"><b>Anti-overshoot actif.</b> Les itérations suivantes réduisent automatiquement la force quand le score monte. Une baisse de plus de 2 points bloque la boucle et propose un rollback.</div>`;
    $t('#tmIterSendBtn')?.addEventListener('click',sendIterCandidate);
    $t('#tmIterCaptureBtn')?.addEventListener('click',()=>recordMic({iterative:true}));
    $t('#tmIterUseCaptureBtn')?.addEventListener('click',useImportedAsIteration);
    $t('#tmIterBestBtn')?.addEventListener('click',useBest);
    $t('#tmIterRollbackBtn')?.addEventListener('click',rollbackBest);
    $t('#tmIterResumeBtn')?.addEventListener('click',resumeFromBest);
    $t('#tmIterResetBtn')?.addEventListener('click',()=>{resetIterative();tm.match=null;tm.matched=null;renderResult();toast('Nouvelle session Tone Match prête')});
  }

  function renderHistory(){const h=$t('#tmHistory');if(!h)return;h.innerHTML=tm.history.length?tm.history.map(x=>`<div class="tm-history-row"><span>${new Date(x.at).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'})}</span><div><b>${safeEsc(x.preset)}</b><small>${x.score}/100 · ${safeEsc(matchModeLabel(x.mode))}${x.iterative?' · LOOP':''}</small></div><i>${x.confidence}%</i></div>`).join(''):'<div class="tm-history-empty">Aucune session Tone Match.</div>'}

  function fileChanged(slot,e){const f=e.target.files?.[0];if(!f)return;decodeFile(slot,f).catch(err=>{console.error(err);status(slot,err.message||'Audio invalide','bad');toast(err.message||'Audio invalide')})}
  function reanalyze(slot){analyzeSlot(slot).catch(e=>{status(slot,e.message,'bad');toast(e.message)})}

  function wire(){
    $t('#tmRefFile')?.addEventListener('change',e=>fileChanged('ref',e));$t('#tmSourceFile')?.addEventListener('change',e=>fileChanged('source',e));
    $t('#tmRefReanalyze')?.addEventListener('click',()=>reanalyze('ref'));$t('#tmSourceReanalyze')?.addEventListener('click',()=>reanalyze('source'));
    $t('#tmRecordBtn')?.addEventListener('click',()=>recordMic());$t('#tmAnalyzeBtn')?.addEventListener('click',runMatch);
    $t('#tmStrength')?.addEventListener('input',e=>{$t('#tmStrengthVal').textContent=`${e.target.value}%`;if(tm.match&&tm.iterative.active){
      const prev=tm.iterative.measured.length>1?tm.iterative.measured[tm.iterative.measured.length-2].score:null,focus=$t('#tmFocus')?.value||'isolated';
      tm.match=Core.planIteration(tm.ref.profile,tm.source.profile,{focus,iteration:tm.iterative.candidateIteration||1,previousScore:prev,baseStrength:Number(e.target.value),threshold:tm.iterative.threshold});tm.iterative.lastPlan=tm.match;rebuildMatched();
    }else if(tm.match)rebuildMatched()});
    $t('#tmFocus')?.addEventListener('change',()=>{if(tm.ref.profile&&tm.source.profile&&tm.original){
      const prev=tm.iterative.active&&tm.iterative.measured.length>1?tm.iterative.measured[tm.iterative.measured.length-2].score:null;
      tm.match=Core.planIteration(tm.ref.profile,tm.source.profile,{focus:$t('#tmFocus').value,iteration:tm.iterative.candidateIteration||1,previousScore:prev,baseStrength:num('#tmStrength',70),threshold:tm.iterative.threshold||num('#tmIterTarget',93)});if(tm.iterative.active)tm.iterative.lastPlan=tm.match;rebuildMatched()
    }});
    $t('#tmIterTarget')?.addEventListener('change',e=>{tm.iterative.threshold=Number(e.target.value)||93;renderIterative()});
    $t('#tmIterMax')?.addEventListener('change',e=>{tm.iterative.maxIterations=Math.max(1,Math.min(8,Number(e.target.value)||5));renderIterative()});
    $t('#tmABar')?.addEventListener('click',()=>loadPresetLocal(tm.original,'A · preset original chargé localement'));
    $t('#tmBBar')?.addEventListener('click',()=>loadPresetLocal(tm.matched,'B · candidat Tone Match chargé localement'));
    $t('#tmApplyBtn')?.addEventListener('click',applyMatched);$t('#tmSendBtn')?.addEventListener('click',sendMatched);
    document.addEventListener('click',e=>{if(e.target.closest('[data-tab="tonematch"]'))setTimeout(syncCurrentPreset,0)});
    ['#tmRefStart','#tmRefDuration'].forEach(id=>$t(id)?.addEventListener('change',()=>status('ref','Fenêtre modifiée · relance l’analyse','warn')));
    ['#tmSourceStart','#tmSourceDuration'].forEach(id=>$t(id)?.addEventListener('change',()=>status('source','Fenêtre modifiée · relance l’analyse','warn')));
    resetIterative();syncCurrentPreset();renderHistory();renderResult();
  }
  window.PTLToneMatch={syncCurrentPreset,runMatch,processIterativeMeasurement,get session(){return tm}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire);else wire();
})();
