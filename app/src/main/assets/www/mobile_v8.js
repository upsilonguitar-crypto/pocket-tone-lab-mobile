/* Pocket Tone Lab Mobile V8 — true mobile UI adapter.
 * The tested legacy DOM remains hidden as the data/hardware engine.
 * This file renders a dedicated mobile shell from state and forwards edits to the existing engine.
 */
(() => {
  'use strict';

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const clone = o => typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o));
  const esc7 = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const m7 = { page:'effects', module:'AMP', query:'', quick:'all', liveIndex:0, tap:[], lastKey:'', timer:null, deviceOpen:false };

  function asset(m,on=true){ return typeof moduleAsset==='function' ? moduleAsset(m,on) : `soniclink/${String(m).toLowerCase()}_${on?'on':'off'}.svg`; }
  function vibrate(ms=15){ try{ window.AndroidBridge?.vibrate?.(ms); }catch{} }
  function stateReady(){ return typeof state!=='undefined' && state.presets?.length && state.effects && state.current; }
  function key(){ try{return typeof presetKey==='function'?presetKey(state.current):JSON.stringify(state.current)}catch{return ''} }

  function build(){
    document.body.classList.add('m7-mode');
    const shell=document.createElement('div'); shell.className='m7-shell'; shell.id='m7Shell';
    shell.innerHTML=`
      <header class="m7-topbar">
        <button id="m7Menu" class="m7-iconbtn" aria-label="More"><img src="soniclink/btn_menu.svg" alt=""></button>
        <div class="m7-title"><small>POCKET MASTER</small><b id="m7Title">Pocket Tone Lab</b></div>
        <button id="m7Device" class="m7-iconbtn" aria-label="Device"><span id="m7DeviceDot" class="m7-device-dot"></span></button>
      </header>
      <main class="m7-main">
        <section id="m7Effects" class="m7-page active"></section>
        <section id="m7Presets" class="m7-page"></section>
        <section id="m7Match" class="m7-page"></section>
        <section id="m7Live" class="m7-page"></section>
        <section id="m7More" class="m7-page"></section>
      </main>
      <nav class="m7-nav">
        <button data-m7-page="effects" class="active"><img src="soniclink/effects.svg"><span>Effects</span></button>
        <button data-m7-page="presets"><span class="m7-nav-glyph">▦</span><span>Presets</span></button>
        <button data-m7-page="match"><span class="m7-nav-glyph">◎</span><span>Match</span></button>
        <button data-m7-page="live"><span class="m7-nav-glyph">▶</span><span>Live</span></button>
        <button data-m7-page="more"><img src="soniclink/settings.svg"><span>More</span></button>
      </nav>`;
    document.body.appendChild(shell);
    shell.querySelector('.m7-nav').addEventListener('click',e=>{const b=e.target.closest('[data-m7-page]');if(b)go(b.dataset.m7Page)});
    $('#m7Menu').onclick=()=>go('more');
    $('#m7Device').onclick=()=>{go('more');setTimeout(()=>$('#m7DevicePanel')?.scrollIntoView({behavior:'smooth',block:'start'}),50)};
    // Avoid app.js mobile auto-scroll ever moving hidden desktop content.
    window.addEventListener('scroll',()=>{ if(document.body.classList.contains('m7-mode')&&window.scrollX)window.scrollTo(0,window.scrollY); },{passive:true});
  }

  function go(page){
    m7.page=page;
    $$('.m7-page').forEach(x=>x.classList.toggle('active',x.id===`m7${page[0].toUpperCase()+page.slice(1)}`));
    $$('[data-m7-page]').forEach(x=>x.classList.toggle('active',x.dataset.m7Page===page));
    const host=$(`#m7${page[0].toUpperCase()+page.slice(1)}`); if(host)host.scrollTop=0;
    renderPage(page); vibrate(7);
  }

  function renderPage(page){
    if(!stateReady())return;
    if(page==='effects')renderEffects();
    else if(page==='presets')renderPresetsPage(true);
    else if(page==='match')renderMatch();
    else if(page==='live')renderLive();
    else renderMore();
    syncTop();
  }
  function syncTop(){
    if(!stateReady())return;
    $('#m7Title').textContent=state.current?.name||'Pocket Master';
    $('#m7DeviceDot').classList.toggle('on',!!state.direct?.connected);
  }

  function renderEffects(){
    const p=state.current,host=$('#m7Effects'); if(!p||!host)return;
    if(!p.chain.includes(m7.module))m7.module=p.chain.includes('AMP')?'AMP':p.chain[0];
    state.editorModule=m7.module;
    const b=p.modules[m7.module]||{enabled:false,model:null,params:{}};
    const models=Object.keys(state.effects.library?.[m7.module]?.models||{});
    const schema=state.effects.library?.[m7.module]?.models?.[b.model]?.params||{};
    host.innerHTML=`
      <div class="m7-preset-strip">
        <button id="m7OpenPresets"><b>${esc7(p.name)}</b><small>${esc7(p.artist||'')} · ${esc7(p.modules?.AMP?.model||'')}</small></button>
        <button id="m7Save" class="m7-save-mini"><img src="soniclink/home_btn_save.svg" alt="Save"></button>
      </div>
      <div class="m7-chain">${p.chain.map(m=>{const x=p.modules[m]||{};return `<button data-m7-module="${m}" class="${x.enabled?'on':''} ${m7.module===m?'active':''}"><img src="${asset(m,!!x.enabled)}" alt="${m}"><span>${m}</span></button>`}).join('')}</div>
      <div class="m7-module-head">
        <div class="m7-module-icon"><img src="${asset(m7.module,!!b.enabled)}" alt="${m7.module}"></div>
        <label class="m7-model"><small>${m7.module}</small><select id="m7Model">${models.map(x=>`<option ${x===b.model?'selected':''}>${esc7(x)}</option>`).join('')}</select></label>
        <button id="m7Toggle" class="m7-switch ${b.enabled?'on':''}" aria-label="Bypass"><i></i></button>
      </div>
      <div class="m7-params">${Object.entries(b.params||{}).map(([name,value])=>paramHtml(m7.module,name,value,schema[name])).join('')||'<div class="m7-empty" style="grid-column:1/-1">Aucun paramètre pour ce bloc.</div>'}</div>
      <div class="m7-master"><span>PRESET VOL</span><input id="m7Master" type="range" min="0" max="127" step="1" value="${Number(p.preset_vol||0)}"><b id="m7MasterVal">${Number(p.preset_vol||0)}</b></div>`;
    host.querySelectorAll('[data-m7-module]').forEach(btn=>btn.onclick=()=>{m7.module=btn.dataset.m7Module;state.editorModule=m7.module;renderEffects();vibrate(8)});
    $('#m7OpenPresets').onclick=()=>go('presets');
    $('#m7Save').onclick=()=>openTransfer(state.current);
    $('#m7Model').onchange=e=>changeModelMobile(m7.module,e.target.value);
    $('#m7Toggle').onclick=()=>toggleModuleMobile(m7.module);
    $('#m7Master').oninput=e=>writeMaster(Number(e.target.value));
    host.querySelectorAll('.m7-param-range').forEach(r=>r.oninput=()=>writeParam(r.dataset.module,r.dataset.param,Number(r.value),r));
    host.querySelectorAll('.m7-param-select').forEach(s=>s.onchange=()=>writeSelectParam(s.dataset.module,s.dataset.param,s.value));
    host.querySelectorAll('.m7-knob').forEach(bindKnob);
  }

  function paramHtml(m,name,value,spec={}){
    const label=spec?.label||name;
    if(spec?.type==='select'||spec?.type==='switch'){
      const opts=spec.options||[];
      return `<label class="m7-param m7-param-wide"><span class="m7-param-label" style="text-align:left;margin:0">${esc7(label)}</span><select class="m7-param-select" data-module="${m}" data-param="${esc7(name)}">${opts.map(o=>`<option ${o===value?'selected':''}>${esc7(o)}</option>`).join('')}</select></label>`;
    }
    const min=Number(spec?.min??0),max=Number(spec?.max??100),step=Number(spec?.step??1),v=Number(value),unit=spec?.unit||'';
    const deg=knobDeg(v,min,max);
    return `<div class="m7-param"><div class="m7-knob" data-module="${m}" data-param="${esc7(name)}"><i class="m7-knob-pointer" style="transform:rotate(${deg}deg)"></i></div><b class="m7-param-value">${esc7(value)}${esc7(unit)}</b><span class="m7-param-label">${esc7(label)}</span><input class="m7-param-range" data-module="${m}" data-param="${esc7(name)}" data-unit="${esc7(unit)}" type="range" min="${min}" max="${max}" step="${step}" value="${v}"></div>`;
  }
  function knobDeg(v,min,max){const n=max===min?0:(Number(v)-min)/(max-min);return -135+Math.max(0,Math.min(1,n))*270}
  function findLegacyRange(m,k){return $$('#detailPanel .param-slider').find(x=>x.dataset.module===m&&x.dataset.param===k)}
  function writeParam(m,k,v,range){
    const legacy=findLegacyRange(m,k);
    if(legacy){legacy.value=v;legacy.dispatchEvent(new Event('input',{bubbles:true}))}else if(state.current?.modules?.[m])state.current.modules[m].params[k]=v;
    if(range){const card=range.closest('.m7-param'),min=Number(range.min),max=Number(range.max);card.querySelector('.m7-param-value').textContent=`${range.value}${range.dataset.unit||''}`;card.querySelector('.m7-knob-pointer').style.transform=`rotate(${knobDeg(Number(range.value),min,max)}deg)`}
  }
  function writeSelectParam(m,k,v){
    const legacy=$$('#detailPanel .select-param').find(x=>x.dataset.module===m&&x.dataset.param===k);
    if(legacy){legacy.value=v;legacy.dispatchEvent(new Event('change',{bubbles:true}))}else if(state.current?.modules?.[m])state.current.modules[m].params[k]=v;
  }
  function changeModelMobile(m,model){
    const legacy=$$('#detailPanel .model-select').find(x=>x.dataset.module===m);
    if(legacy){legacy.value=model;legacy.dispatchEvent(new Event('change',{bubbles:true}));setTimeout(renderEffects,30)}
  }
  function toggleModuleMobile(m){const legacy=$$('#detailPanel .toggle').find(x=>x.dataset.module===m);if(legacy){legacy.click();setTimeout(renderEffects,30)}}
  function writeMaster(v){
    const legacy=$('#detailPanel .preset-volume-slider');if(legacy){legacy.value=v;legacy.dispatchEvent(new Event('input',{bubbles:true}))}else state.current.preset_vol=v;
    $('#m7MasterVal').textContent=v;
  }
  function bindKnob(knob){
    const range=knob.closest('.m7-param')?.querySelector('.m7-param-range');if(!range)return;
    knob.onpointerdown=e=>{
      e.preventDefault();const sy=e.clientY,start=Number(range.value),min=Number(range.min),max=Number(range.max),span=max-min;knob.setPointerCapture?.(e.pointerId);vibrate(5);
      const move=ev=>{const raw=start+((sy-ev.clientY)/145)*span;const step=Number(range.step)||1;let val=Math.max(min,Math.min(max,raw));val=min+Math.round((val-min)/step)*step;range.value=val;range.dispatchEvent(new Event('input',{bubbles:true}))};
      const up=()=>{knob.removeEventListener('pointermove',move);knob.removeEventListener('pointerup',up);knob.removeEventListener('pointercancel',up)};
      knob.addEventListener('pointermove',move);knob.addEventListener('pointerup',up);knob.addEventListener('pointercancel',up);
    };
  }

  function filteredPresets(){
    let rows=state.presets||[];const q=m7.query.trim().toLowerCase();if(q)rows=rows.filter(p=>`${p.name} ${p.artist} ${p.song||''} ${p.genre||''} ${p.modules?.AMP?.model||''}`.toLowerCase().includes(q));
    if(m7.quick==='fav')rows=rows.filter(p=>state.favorites.has(p.id));else if(m7.quick!=='all')rows=rows.filter(p=>p.variant===m7.quick);return rows;
  }
  function renderPresetsPage(rebuild=false){
    const host=$('#m7Presets');if(!host)return;
    if(rebuild||!$('#m7PresetList')){
      host.innerHTML=`<div class="m7-page-title"><div><small>LIBRARY</small><h1>Presets</h1></div><small>${state.presets.length} sons</small></div><div class="m7-search"><input id="m7Search" placeholder="Rechercher artiste, morceau, ampli…" value="${esc7(m7.query)}"></div><div class="m7-chips">${[['all','Tous'],['Song','Morceaux'],['Lead','Lead'],['Rhythm','Rhythm'],['Clean','Clean'],['Style','Styles'],['fav','★ Favoris']].map(([k,l])=>`<button class="m7-chip ${m7.quick===k?'active':''}" data-m7-quick="${k}">${l}</button>`).join('')}</div><div id="m7PresetList" class="m7-preset-list"></div>`;
      $('#m7Search').addEventListener('input',e=>{m7.query=e.target.value;renderPresetRows()});
      host.querySelector('.m7-chips').onclick=e=>{const b=e.target.closest('[data-m7-quick]');if(!b)return;m7.quick=b.dataset.m7Quick;host.querySelectorAll('.m7-chip').forEach(x=>x.classList.toggle('active',x===b));renderPresetRows()};
    }
    renderPresetRows();
  }
  function renderPresetRows(){
    const list=$('#m7PresetList');if(!list)return;const rows=filteredPresets();
    list.innerHTML=rows.map((p,i)=>`<div class="m7-preset-row ${state.current?.id===p.id?'active':''}" data-m7-preset="${p.id}"><span class="m7-preset-num">${String(i+1).padStart(2,'0')}</span><button style="min-width:0;border:0;background:transparent;color:inherit;text-align:left;padding:0" data-m7-load="${p.id}" class="m7-preset-copy"><b>${esc7(p.name)}</b><small>${esc7(p.artist||'')}${p.song?` · ${esc7(p.song)}`:''}</small></button><div><div class="m7-preset-amp">${esc7(p.modules?.AMP?.model||'')}</div><button class="m7-iconbtn m7-star ${state.favorites.has(p.id)?'on':''}" style="width:28px;height:28px;margin-left:auto" data-m7-fav="${p.id}">★</button></div></div>`).join('')||'<div class="m7-empty-small">Aucun preset.</div>';
    list.onclick=e=>{const f=e.target.closest('[data-m7-fav]');if(f){toggleFav(f.dataset.m7Fav);renderPresetRows();return}const b=e.target.closest('[data-m7-load]');if(b){selectPreset(b.dataset.m7Load,{scroll:false});m7.module='AMP';m7.lastKey='';go('effects');vibrate(10)}};
  }

  function hiddenClick(id){const el=$(id);if(el&&!el.disabled){el.click();return true}return false}
  function mirrorStatus(id){const x=$(id);return x?.textContent?.trim()||'En attente'}
  function renderMatch(){
    const host=$('#m7Match'),tm=window.PTLToneMatch?.session;if(!host)return;
    const match=tm?.match,score=match?.beforeScore??null,strength=Number($('#tmStrength')?.value||70),summary=match&&window.PTLToneMatchCore?window.PTLToneMatchCore.summarizeChanges(match,strength):[];
    const it=tm?.iterative,points=it?.measured||[];
    host.innerHTML=`
      <div class="m7-page-title"><div><small>LOCAL · OFFLINE</small><h1>Tone Match</h1></div><small>audio → preset</small></div>
      <div class="m7-current-chip"><small>PRESET</small><b>${esc7(state.current?.name||'Aucun')}</b></div>
      <section class="m7-source"><div class="m7-source-head"><b>1 · Référence</b><span class="m7-status ${statusClass('#tmRefStatus')}">${esc7(mirrorStatus('#tmRefStatus'))}</span></div><div class="m7-button-row"><button id="m7RefFile" class="m7-btn primary">CHOISIR AUDIO</button><button id="m7RefAnalyze" class="m7-btn">RÉANALYSER</button></div><small class="m7-source-meta">${esc7($('#tmRefMeta')?.textContent||'MP3 / WAV / M4A')}</small></section>
      <section class="m7-source"><div class="m7-source-head"><b>2 · Ton son</b><span class="m7-status ${statusClass('#tmSourceStatus')}">${esc7(mirrorStatus('#tmSourceStatus'))}</span></div><div class="m7-button-row"><button id="m7SourceFile" class="m7-btn">IMPORTER</button><button id="m7Record" class="m7-btn primary">● REC 8 s</button></div><small class="m7-source-meta">${esc7($('#tmSourceMeta')?.textContent||'Enregistre le même passage')}</small></section>
      <details class="m7-match-settings"><summary>Réglages du match</summary><div class="m7-setting"><label>Type</label><select id="m7Focus"><option value="isolated">Guitare isolée</option><option value="rhythm">Rythmique</option><option value="mix">Dans un mix</option></select><b></b></div><div class="m7-setting"><label>Force</label><input id="m7Strength" type="range" min="20" max="100" value="${strength}"><b id="m7StrengthVal">${strength}%</b></div><div class="m7-setting"><label>Cible</label><input id="m7Target" type="range" min="85" max="98" value="${Number($('#tmIterTarget')?.value||93)}"><b id="m7TargetVal">${Number($('#tmIterTarget')?.value||93)}</b></div></details>
      <button id="m7Analyze" class="m7-btn primary" style="width:100%;min-height:50px">◎ ANALYSER & CRÉER LE MATCH</button>
      <section class="m7-result"><div class="m7-score"><b>${score===null?'—':score}</b><span>/100</span></div><div class="m7-score-caption">SIMILARITÉ AVANT CORRECTION${match?` · CONFIANCE ${match.confidence}%`:''}</div><div class="m7-corrections">${summary.length?summary.map(x=>`<div class="m7-correction"><span>${esc7(x.label)}</span><b>${x.delta>=0?'+':''}${x.delta}</b></div>`).join(''):'<div class="m7-empty-small" style="grid-column:1/-1">Charge deux audios puis lance l’analyse.</div>'}</div><div class="m7-result-actions"><button id="m7A" class="m7-btn" ${match?'':'disabled'}>A · ORIGINAL</button><button id="m7B" class="m7-btn" ${match?'':'disabled'}>B · MATCH</button><button id="m7Apply" class="m7-btn primary" ${match?'':'disabled'}>UTILISER MATCH</button><button id="m7Test" class="m7-btn" ${match?'':'disabled'}>TEST PÉDALE</button></div>${iterHtml(it,points)}</section>`;
    $('#m7Focus').value=$('#tmFocus')?.value||'isolated';
    $('#m7RefFile').onclick=()=>hiddenClick('#tmRefFile');$('#m7SourceFile').onclick=()=>hiddenClick('#tmSourceFile');$('#m7RefAnalyze').onclick=()=>hiddenClick('#tmRefReanalyze');$('#m7Record').onclick=()=>hiddenClick('#tmRecordBtn');$('#m7Analyze').onclick=()=>hiddenClick('#tmAnalyzeBtn');
    $('#m7Focus').onchange=e=>{const h=$('#tmFocus');if(h){h.value=e.target.value;h.dispatchEvent(new Event('change',{bubbles:true}))}setTimeout(renderMatch,80)};
    $('#m7Strength').oninput=e=>{const h=$('#tmStrength');if(h){h.value=e.target.value;h.dispatchEvent(new Event('input',{bubbles:true}))}$('#m7StrengthVal').textContent=`${e.target.value}%`;setTimeout(renderMatch,100)};
    $('#m7Target').oninput=e=>{const h=$('#tmIterTarget');if(h){h.value=e.target.value;h.dispatchEvent(new Event('change',{bubbles:true}))}$('#m7TargetVal').textContent=e.target.value};
    $('#m7A').onclick=()=>hiddenClick('#tmABar');$('#m7B').onclick=()=>hiddenClick('#tmBBar');$('#m7Apply').onclick=()=>{hiddenClick('#tmApplyBtn');setTimeout(()=>{m7.lastKey='';go('effects')},60)};$('#m7Test').onclick=()=>hiddenClick('#tmSendBtn');
    $('#m7IterSend')?.addEventListener('click',()=>hiddenClick('#tmIterSendBtn'));$('#m7IterCapture')?.addEventListener('click',()=>hiddenClick('#tmIterCaptureBtn'));$('#m7IterBest')?.addEventListener('click',()=>hiddenClick('#tmIterBestBtn'));$('#m7IterRollback')?.addEventListener('click',()=>hiddenClick('#tmIterRollbackBtn'));$('#m7IterResume')?.addEventListener('click',()=>hiddenClick('#tmIterResumeBtn'));
  }
  function statusClass(id){const x=$(id);return x?.classList.contains('good')?'good':x?.classList.contains('bad')?'bad':x?.classList.contains('recording')?'recording':''}
  function iterHtml(it,points){
    if(!it?.active)return `<div class="m7-iter"><h3>Mode itératif</h3><p class="m7-note">Le premier match démarre automatiquement une session fermée. Ensuite : test → rec 8 s → micro-correction.</p></div>`;
    const best=it.best?.score??points[0]?.score??0;
    return `<div class="m7-iter"><h3>Itérations</h3><div class="m7-iter-meta"><span>BEST <b>${best}</b></span><span>CIBLE <b>${it.threshold}</b></span><span>ÉTAT <b>${esc7(it.phase)}</b></span></div><div class="m7-iter-points">${points.map(x=>`<div class="m7-iter-point ${it.best===x?'best':''}"><span>${esc7(x.label||`I${x.iteration}`)}</span><b>${x.score}</b><small>/100</small></div>`).join('')}</div><div class="m7-button-row"><button id="m7IterSend" class="m7-btn">TESTER CANDIDAT</button><button id="m7IterCapture" class="m7-btn primary">● CAPTURER 8 s</button><button id="m7IterBest" class="m7-btn">★ MEILLEUR</button>${it.phase==='regression'?'<button id="m7IterRollback" class="m7-btn">↶ ROLLBACK</button>':'<button id="m7IterResume" class="m7-btn">↻ REPRENDRE</button>'}</div></div>`;
  }

  function loadLiveIndex(i){
    if(!state.setlist.length)return; m7.liveIndex=Math.max(0,Math.min(state.setlist.length-1,i));const item=state.setlist[m7.liveIndex];state.current=clone(item.preset);renderDetail(state.current,$('#detailPanel'));updateHardwareStrip(state.current);window.PTLToneMatch?.syncCurrentPreset?.();m7.lastKey='';renderLive();syncTop();
  }
  function renderLive(){
    const host=$('#m7Live');if(!host)return;const list=state.setlist||[];if(m7.liveIndex>=list.length)m7.liveIndex=Math.max(0,list.length-1);const active=list[m7.liveIndex]?.preset||state.current;
    host.innerHTML=`<div class="m7-page-title"><div><small>STAGE</small><h1>Live</h1></div><small>${list.length} dans la setlist</small></div><div class="m7-live-hero"><small>${list.length?`SET ${m7.liveIndex+1}/${list.length}`:'CURRENT PRESET'}</small><h2>${esc7(active?.name||'Aucun preset')}</h2><p>${esc7(active?.modules?.AMP?.model||'')} · ${esc7(active?.modules?.DRV?.model||'Drive OFF')}</p></div><div class="m7-live-controls"><button id="m7Prev">PREV</button><button id="m7Load" class="load">LOAD</button><button id="m7Next">NEXT</button></div><div class="m7-tempo"><button id="m7Tap">TAP<br><b id="m7Bpm">${Number($('#tempoBpm')?.value||120)}</b> BPM</button><button id="m7TestCurrent">TEST DEVICE<br><small>Hardware Guard</small></button></div><button id="m7AddSet" class="m7-btn" style="width:100%;margin-bottom:10px">+ AJOUTER LE PRESET COURANT À LA SETLIST</button><div>${list.map((x,i)=>`<div class="m7-setlist-row ${i===m7.liveIndex?'active':''}" data-m7-set="${i}"><span>${String(i+1).padStart(2,'0')}</span><div><b>${esc7(x.preset.name)}</b><small>${esc7(x.preset.modules?.AMP?.model||'')}</small></div></div>`).join('')||'<div class="m7-empty-small">Setlist vide. Ajoute tes sons puis utilise PREV / NEXT sur scène.</div>'}</div>`;
    $('#m7Prev').onclick=()=>loadLiveIndex(m7.liveIndex-1);$('#m7Next').onclick=()=>loadLiveIndex(m7.liveIndex+1);$('#m7Load').onclick=()=>{if(list.length)loadLiveIndex(m7.liveIndex);else renderEffects()};
    $('#m7TestCurrent').onclick=()=>state.current&&openTransfer(state.current);
    $('#m7AddSet').onclick=()=>{if(!state.current)return;state.setlist.push({id:`set-${Date.now()}`,preset:clone(state.current)});localStorage.setItem('ptl-setlist',JSON.stringify(state.setlist));renderSetlist?.();renderLive();toast('Ajouté à la setlist')};
    host.querySelectorAll('[data-m7-set]').forEach(x=>x.onclick=()=>{m7.liveIndex=Number(x.dataset.m7Set);renderLive()});
    $('#m7Tap').onclick=tapTempo;
  }
  function tapTempo(){const now=performance.now();m7.tap=m7.tap.filter(x=>now-x<2200);m7.tap.push(now);if(m7.tap.length>=2){const d=[];for(let i=1;i<m7.tap.length;i++)d.push(m7.tap[i]-m7.tap[i-1]);const avg=d.reduce((a,b)=>a+b,0)/d.length,bpm=Math.max(40,Math.min(300,Math.round(60000/avg)));const h=$('#tempoBpm');if(h){h.value=bpm;h.dispatchEvent(new Event('input',{bubbles:true}))}$('#m7Bpm').textContent=bpm;vibrate(10)}}

  function renderMore(){
    const host=$('#m7More');if(!host)return;const connected=!!state.direct?.connected,armed=!!state.direct?.armed;
    host.innerHTML=`<div class="m7-page-title"><div><small>APP</small><h1>More</h1></div><small>avancé</small></div>
      <section id="m7DevicePanel" class="m7-settings-group"><div class="m7-settings-title">POCKET MASTER</div><div class="m7-device-panel"><div class="m7-device-line"><span>Connexion</span><b>${connected?'Connecté':'Non connecté'}</b></div><div class="m7-button-row"><button id="m7Scan" class="m7-btn primary">DÉTECTER</button><button id="m7Connect" class="m7-btn">CONNECTER</button></div><label class="m7-arm"><input id="m7Arm" type="checkbox" ${armed?'checked':''}><span>Armer les écritures temporaires Hardware Guard</span></label>${state.current?'<button id="m7DeviceSend" class="m7-btn" style="width:100%;margin-top:8px">TESTER LE PRESET COURANT</button>':''}</div></section>
      <section class="m7-settings-group"><div class="m7-settings-title">PRESETS & FICHIERS</div><button class="m7-settings-row" id="m7ImportPrst"><span class="icon">PR</span><span><b>Importer .prst</b><small>Ouvrir un preset natif Pocket Master</small></span><span class="m7-chevron">›</span></button><button class="m7-settings-row" id="m7ExportPrst"><span class="icon">⇩</span><span><b>Exporter .prst</b><small>Preset courant, CRC natif recalculé</small></span><span class="m7-chevron">›</span></button><button class="m7-settings-row" id="m7Snapshot"><span class="icon">S</span><span><b>Snapshot</b><small>${state.snapshots?.length||0} sauvegarde(s) locale(s)</small></span><span class="m7-chevron">›</span></button></section>
      <section class="m7-settings-group"><div class="m7-settings-title">OUTILS</div><button class="m7-settings-row" id="m7Generator"><span class="icon">✦</span><span><b>Tone Generator</b><small>Créer une variante du preset courant</small></span><span class="m7-chevron">›</span></button><button class="m7-settings-row" id="m7Models"><span class="icon">FX</span><span><b>Models</b><small>${Object.values(state.effects.library||{}).reduce((n,x)=>n+Object.keys(x.models||{}).length,0)} modèles disponibles</small></span><span class="m7-chevron">›</span></button></section><p class="m7-note">Pocket Tone Lab V7 · interface mobile dédiée. Les fonctions matérielles restent verrouillées par défaut.</p>`;
    $('#m7Scan').onclick=()=>{hiddenClick('#scanMidiBtn');setTimeout(renderMore,600)};$('#m7Connect').onclick=()=>{hiddenClick('#connectMidiBtn');setTimeout(renderMore,400)};$('#m7Arm').onchange=e=>{const h=$('#hardwareWriteArm');if(h){h.checked=e.target.checked;h.dispatchEvent(new Event('change',{bubbles:true}))}else setHardwareArm?.(e.target.checked);setTimeout(renderMore,40)};$('#m7DeviceSend')?.addEventListener('click',()=>openTransfer(state.current));
    $('#m7ImportPrst').onclick=()=>hiddenClick('#prstFileInput');$('#m7ExportPrst').onclick=()=>state.current&&exportNativePrst(state.current);$('#m7Snapshot').onclick=()=>{hiddenClick('#createSnapshotBtn');setTimeout(renderMore,50)};
    $('#m7Generator').onclick=()=>showGeneratorSheet();$('#m7Models').onclick=()=>showModelsSheet();
  }

  function showSheet(title,html){
    let d=$('#m7QuickSheet');if(d)d.remove();d=document.createElement('div');d.id='m7QuickSheet';d.style.cssText='position:fixed;z-index:2600;inset:0;background:#000a;display:flex;align-items:flex-end';d.innerHTML=`<section style="width:100%;max-height:88dvh;overflow:auto;background:#202020;border-radius:18px 18px 0 0;padding:14px 14px calc(20px + env(safe-area-inset-bottom))"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><b style="font-size:18px">${esc7(title)}</b><button id="m7SheetClose" class="m7-iconbtn" style="background:#2b2b2b;border-radius:50%">×</button></div>${html}</section>`;document.body.appendChild(d);$('#m7SheetClose').onclick=()=>d.remove();d.onclick=e=>{if(e.target===d)d.remove()};return d;
  }
  function showGeneratorSheet(){
    const d=showSheet('Tone Generator',`<label class="m7-note">Base</label><select id="m7GenBase" style="width:100%;height:42px;background:#292929;color:#fff;border:1px solid #3a3a3a;border-radius:7px;margin:5px 0 12px"></select>${[['aggression','Agressivité'],['ambience','Ambiance'],['brightness','Brillance'],['warmth','Chaleur'],['tightness','Tightness'],['sustain','Sustain']].map(([id,l])=>`<div class="m7-setting"><label>${l}</label><input data-gen="${id}" type="range" min="0" max="100" value="${Number($('#'+id)?.value||50)}"><b>${Number($('#'+id)?.value||50)}</b></div>`).join('')}<button id="m7GenGo" class="m7-btn primary" style="width:100%;margin-top:12px">GÉNÉRER</button>`);
    const s=d.querySelector('#m7GenBase');(state.presets||[]).forEach(p=>s.insertAdjacentHTML('beforeend',`<option value="${p.id}">${esc7(p.name)}</option>`));s.value=state.current?.id&&state.presets.some(p=>p.id===state.current.id)?state.current.id:state.presets[0]?.id;
    d.querySelectorAll('[data-gen]').forEach(r=>r.oninput=()=>{r.nextElementSibling.textContent=r.value;const h=$('#'+r.dataset.gen);if(h)h.value=r.value});d.querySelector('#m7GenGo').onclick=async()=>{if($('#genBase'))$('#genBase').value=s.value;hiddenClick('#generateBtn');setTimeout(()=>{const generated=$('#generatedDetail');if(generated&&!generated.classList.contains('empty-state')){toast('Preset généré dans le moteur. Ouvre-le depuis Generator avancé si besoin.')}d.remove()},500)};
  }
  function showModelsSheet(){
    const rows=Object.entries(state.effects.library||{}).flatMap(([m,x])=>Object.keys(x.models||{}).map(n=>({m,n})));showSheet('Models',`<div style="font-size:10px;color:#777;margin-bottom:8px">${rows.length} modèles QME-10 connus</div>${rows.map(x=>`<div style="display:flex;justify-content:space-between;padding:10px 2px;border-bottom:1px solid #303030"><b style="font-size:12px">${esc7(x.n)}</b><span style="font-size:9px;color:#777">${x.m}</span></div>`).join('')}`);
  }

  function poll(){
    if(!stateReady())return;
    const k=key(),device=!!state.direct.connected;if(k!==m7.lastKey){m7.lastKey=k;syncTop();if(m7.page==='effects')renderEffects();else if(m7.page==='presets')renderPresetRows();else if(m7.page==='live')renderLive()}
    $('#m7DeviceDot')?.classList.toggle('on',device);
    if(m7.page==='match'){const a=mirrorStatus('#tmRefStatus')+'|'+mirrorStatus('#tmSourceStatus')+'|'+(window.PTLToneMatch?.session?.iterative?.phase||'');if(a!==poll.matchKey){poll.matchKey=a;renderMatch()}}
  }
  function init(){build();let tries=0;const wait=setInterval(()=>{if(stateReady()){clearInterval(wait);m7.lastKey=key();renderEffects();syncTop();m7.timer=setInterval(poll,350)}else if(++tries>80){clearInterval(wait);$('#m7Effects').innerHTML='<div class="m7-empty">Impossible de charger le moteur Pocket Tone Lab.</div>'}},100)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
