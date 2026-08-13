(() => {
  'use strict';
  const $m=s=>document.querySelector(s);
  const b64FromBlob=blob=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]||'');r.onerror=reject;r.readAsDataURL(blob)});
  async function nativeSave(blob,name){
    if(!window.AndroidBridge)return false;
    try{const b64=await b64FromBlob(blob);AndroidBridge.saveBase64File(String(name||'file.bin'),blob.type||'application/octet-stream',b64);return true}catch(e){console.error(e);return false}
  }
  window.downloadBlob=async function(blob,name){if(await nativeSave(blob,name))return;const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1200)};
  window.downloadJSON=async function(p){const blob=new Blob([JSON.stringify(p,null,2)],{type:'application/json'});await window.downloadBlob(blob,(p.id||'preset')+'.pocket-tone.json');toast('JSON Pocket Tone Lab exporté')};
  window.exportPocketEdit=async function(copyOnly=false){
    try{const data=await getPocketEditJSON(),json=JSON.stringify(data,null,2);if(copyOnly){if(window.AndroidBridge)AndroidBridge.copyText(json);else await navigator.clipboard.writeText(json);toast('JSON PocketEdit copié');return}await window.downloadBlob(new Blob([json],{type:'application/json'}),`${data.presetName||'PRESET'}_PocketEdit.json`);toast('JSON PocketEdit prêt à importer')}catch(e){console.error(e);toast(e.message||'Erreur export')}
  };
  window.exportSetlist=async function(){const blob=new Blob([JSON.stringify({format:'Pocket Tone Lab Setlist',version:1,createdAt:new Date().toISOString(),items:state.setlist},null,2)],{type:'application/json'});await window.downloadBlob(blob,'pocket-tone-setlist.json')};

  let perfIndex=0,keepAwake=false,taps=[];
  function buzz(ms=18){try{AndroidBridge?.vibrate(ms)}catch{}}
  function currentPerfPreset(){if(state.setlist?.length){perfIndex=Math.max(0,Math.min(perfIndex,state.setlist.length-1));return state.setlist[perfIndex]?.preset||state.current}return state.current}
  function setCurrent(p){if(!p)return;state.current=structuredClone(p);renderDetail(state.current,$m('#detailPanel'));updateHardwareStrip(state.current);renderPresets();syncPerformance();buzz(16)}
  function syncPerformance(){
    const p=currentPerfPreset(),list=$m('#performanceSetlist');
    if($m('#performanceSetCount'))$m('#performanceSetCount').textContent=state.setlist?.length||0;
    if(p){$m('#performancePresetName').textContent=p.name||'Preset';$m('#performancePresetMeta').textContent=[p.artist,p.modules?.AMP?.model,p.variant].filter(Boolean).join(' · ');$m('#performanceMatchBar').style.width=`${Math.max(0,Math.min(100,p.match||100))}%`;}
    if(list){if(!state.setlist?.length)list.innerHTML='<div class="performance-empty">Ajoute des presets depuis Vault & Live pour préparer ta scène.</div>';else list.innerHTML=state.setlist.map((x,i)=>`<button class="performance-set-row ${i===perfIndex?'active':''}" data-perf-index="${i}"><span>${String(i+1).padStart(2,'0')}</span><div><b>${esc(x.preset.name)}</b><small>${esc(x.preset.artist||'')} · ${esc(x.preset.modules?.AMP?.model||'')}</small></div><i>${i===perfIndex?'NOW':'LOAD'}</i></button>`).join('')}
    const armed=!!$m('#hardwareWriteArm')?.checked;$m('#performanceGuardText').textContent=armed?'TEMP WRITE ARMED':'WRITE LOCKED';$m('#performanceGuard')?.classList.toggle('armed',armed);
    const bpm=Number(p?.preset_bpm||120);$m('#tapTempoValue').textContent=`${Math.round(bpm)} BPM`;
  }
  function movePerf(delta){if(!state.setlist?.length)return toast('La setlist est vide');perfIndex=(perfIndex+delta+state.setlist.length)%state.setlist.length;setCurrent(state.setlist[perfIndex].preset)}
  function tapTempo(){const now=performance.now();taps=taps.filter(t=>now-t<2200);taps.push(now);if(taps.length>=2){const ds=[];for(let i=1;i<taps.length;i++)ds.push(taps[i]-taps[i-1]);const avg=ds.reduce((a,b)=>a+b,0)/ds.length,bpm=Math.max(40,Math.min(300,Math.round(60000/avg)));if(state.current)state.current.preset_bpm=bpm;$m('#tapTempoValue').textContent=`${bpm} BPM`;if($m('#tempoBpm'))$m('#tempoBpm').value=bpm;toast(`${bpm} BPM`)}buzz(12)}
  function toggleGuard(){const box=$m('#hardwareWriteArm');if(!box)return;if(box.checked){box.checked=false;box.dispatchEvent(new Event('change',{bubbles:true}));syncPerformance();toast('Hardware Guard verrouillé');return}if(!confirm('Armer temporairement les écritures MIDI ?\n\nAucun slot ne sera sauvegardé sans une deuxième confirmation séparée.'))return;box.checked=true;box.dispatchEvent(new Event('change',{bubbles:true}));syncPerformance();toast('Écritures temporaires armées')}
  function shareCurrent(){if(!state.current)return toast('Aucun preset');const res=PTLMobileCodec.encodePrst(state.current,state.current.name,state.current.preset_bpm||120),blob=new Blob([res.bytes],{type:'application/octet-stream'});b64FromBlob(blob).then(b64=>{if(window.AndroidBridge)AndroidBridge.shareBase64File(`${res.name}.prst`,'application/octet-stream',b64)});}
  function installMobileChrome(){
    document.body.classList.add('ptl-mobile-app');
    const top=document.createElement('div');top.className='mobile-safety-bar';top.innerHTML='<span class="mobile-native-dot"></span><b>POCKET TONE MOBILE</b><small id="mobileSafetyText">HARDWARE GUARD · LOCKED</small><button id="mobileShareBtn">⇧</button>';document.body.appendChild(top);
    $m('#mobileShareBtn').addEventListener('click',shareCurrent);
    const box=$m('#hardwareWriteArm');box?.addEventListener('change',()=>{const t=$m('#mobileSafetyText');if(t)t.textContent=box.checked?'HARDWARE GUARD · TEMP WRITE ARMED':'HARDWARE GUARD · LOCKED';syncPerformance()});
  }
  function wire(){
    installMobileChrome();
    $m('#performancePrev')?.addEventListener('click',()=>movePerf(-1));$m('#performanceNext')?.addEventListener('click',()=>movePerf(1));
    $m('#performanceSend')?.addEventListener('click',()=>{const p=currentPerfPreset();if(!p)return toast('Aucun preset');state.transferPreset=p;openTransfer(p);buzz(20)});
    $m('#tapTempoBtn')?.addEventListener('click',tapTempo);$m('#performanceGuard')?.addEventListener('click',toggleGuard);
    $m('#performanceSetlist')?.addEventListener('click',e=>{const r=e.target.closest('[data-perf-index]');if(!r)return;perfIndex=Number(r.dataset.perfIndex);setCurrent(state.setlist[perfIndex].preset)});
    $m('#keepAwakeBtn')?.addEventListener('click',()=>{keepAwake=!keepAwake;try{AndroidBridge?.setKeepAwake(keepAwake)}catch{}$m('#keepAwakeBtn').textContent=keepAwake?'☀ Écran verrouillé ON':'☀ Écran actif';$m('#keepAwakeBtn').classList.toggle('active',keepAwake);toast(keepAwake?'Écran maintenu allumé':'Mode écran normal')});
    document.addEventListener('click',e=>{if(e.target.closest('button,.interactive-knob,.preset-card,.chain-node'))buzz(7)},{passive:true});
    const oldRenderSetlist=window.renderSetlist;window.renderSetlist=function(){oldRenderSetlist?.();syncPerformance()};
    const oldActivate=window.activateTab;window.activateTab=function(tab){oldActivate(tab);if(tab==='performance')syncPerformance()};
    setTimeout(syncPerformance,650);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire);else wire();
})();
