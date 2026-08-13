const state={editorModule:'AMP',presets:[],effects:null,official:null,current:null,transferPreset:null,importedPrst:null,favorites:new Set(JSON.parse(localStorage.getItem('ptl-favs')||'[]')),favoritesOnly:false,quickFilter:'all',presetDrawerOpen:false,focusMode:false,snapshots:JSON.parse(localStorage.getItem('ptl-snapshots')||'[]'),setlist:JSON.parse(localStorage.getItem('ptl-setlist')||'[]'),direct:{connector:null,devices:[],connected:false,live:false,armed:false,lastAppliedKey:null,log:[]}};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const POCKETEDIT_URL='https://suckyble.github.io/PocketEdit/';
const LIVE_EFFECT_NAME_MAP={'AC Sim':'AC G','Brit50 JP':'Brit 50JP','Sol100OD':'Sol 100 OD','DizzyVH':'Dizzy VH','Eng120':'Eng 120','Halen51':'Halen 51','Sol100LD':'Sol 100 LD','CalifDualV':'Calif DualV','CalifDualM':'Calif DualM','EngPower':'Eng Power','FlymanB1+':'Flyman B1+','BogXT':'Bog XT'};
const LIVE_PARAM_NAME_MAP={'VOL':'Vol','PRES':'Pres','Clipping':'Clip','H-VOL':'H-Vol','L-VOL':'L-Vol'};
const liveEffectName=x=>LIVE_EFFECT_NAME_MAP[x]||x;
const liveParamName=x=>LIVE_PARAM_NAME_MAP[x]||x;
const SONICLINK_MODULE_ASSET={NR:'nr',FX1:'fx1',DRV:'drv',AMP:'amp',IR:'ir',EQ:'eq',FX2:'fx2',DLY:'dly',RVB:'rvb'};
const moduleAsset=(m,on=true)=>`soniclink/${SONICLINK_MODULE_ASSET[m]||String(m).toLowerCase()}_${on?'on':'off'}.svg`;
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(window._toast);window._toast=setTimeout(()=>t.classList.remove('show'),2200)}
function saveFavs(){localStorage.setItem('ptl-favs',JSON.stringify([...state.favorites]))}

async function init(){
  const [meta,effects,presets,official]=await Promise.all([
    fetch('/api/meta').then(r=>r.json()),fetch('/api/effects').then(r=>r.json()),fetch('/api/presets').then(r=>r.json()),fetch('/api/official-catalog').then(r=>r.json())
  ]);
  state.effects=effects;state.presets=presets;state.official=official;
  meta.artists.forEach(a=>$('#artistFilter').insertAdjacentHTML('beforeend',`<option>${esc(a)}</option>`));
  meta.genres.forEach(g=>$('#genreFilter').insertAdjacentHTML('beforeend',`<option>${esc(g)}</option>`));
  meta.eras.forEach(e=>$('#eraFilter').insertAdjacentHTML('beforeend',`<option>${esc(e)}</option>`));
  presets.forEach(p=>$('#genBase').insertAdjacentHTML('beforeend',`<option value="${p.id}">${esc(p.name)}</option>`));
  bind();initDirectConnector();renderMachine();renderPresets();renderSnapshots();renderSetlist();updateTempo();
  if(presets.length) selectPreset(presets[0].id,{scroll:false});
}

function filtered(){
  let rows=state.presets;
  const q=$('#searchInput').value.trim().toLowerCase(),a=$('#artistFilter').value,g=$('#genreFilter').value,v=$('#variantFilter').value,e=$('#eraFilter').value;
  if(q) rows=rows.filter(p=>JSON.stringify(p).toLowerCase().includes(q));
  if(a!=='all') rows=rows.filter(p=>p.artist===a);
  if(g!=='all') rows=rows.filter(p=>p.genre===g);
  if(v!=='all') rows=rows.filter(p=>p.variant===v);
  if(e!=='all') rows=rows.filter(p=>p.era===e);
  if(state.quickFilter!=='all') rows=rows.filter(p=>p.variant===state.quickFilter);
  if(state.favoritesOnly) rows=rows.filter(p=>state.favorites.has(p.id));
  return rows;
}
function renderPresets(){
  const rows=filtered();
  $('#resultCount').textContent=`${rows.length}`;
  const a=$('#artistFilter').value;
  const quickName={Song:'Presets morceaux',Lead:'Lead tones',Rhythm:'Rhythm tones',Clean:'Clean tones',Style:'Styles'}[state.quickFilter];
  $('#resultTitle').textContent=state.favoritesOnly?'Mes favoris':(a!=='all'?a:(quickName||'Tous les presets'));
  $('#presetGrid').innerHTML=rows.map((p,i)=>card(p,i)).join('')||'<div class="empty-results">Aucun preset avec ces filtres.</div>';
}
function card(p,i){
  const amp=p.modules.AMP?.model||'—',drv=p.modules.DRV?.enabled?p.modules.DRV.model:'OFF';
  const kicker=p.variant==='Song'?(p.section||'Song'):p.variant;
  const context=p.variant==='Song'?[p.song,p.year].filter(Boolean).join(' · '):(p.genre||p.era||'Preset');
  const onCount=p.chain.filter(m=>p.modules[m]?.enabled).length;
  return `<article class="preset-card ${state.current?.id===p.id?'selected':''}" data-id="${p.id}">
    <div class="preset-slot">${String(i+1).padStart(2,'0')}</div>
    <div class="preset-card-body">
      <div class="card-top"><span class="genre-chip ${p.variant==='Song'?'song-chip':''}">${esc(kicker)}</span><button class="favorite-star ${state.favorites.has(p.id)?'on':''}" data-fav="${p.id}" title="Favori">★</button></div>
      <h3>${esc(p.name)}</h3>
      <p class="card-artist">${esc(p.artist)}</p>
      <p class="card-context">${esc(context)}</p>
      <div class="tone-tags"><span class="amp-tag">AMP ${esc(amp)}</span><span class="drv-tag">DRV ${esc(drv)}</span></div>
      <div class="preset-card-meter"><div><span style="width:${Math.max(0,Math.min(100,p.match||0))}%"></span></div><b>${p.match}%</b></div>
      <div class="card-footer"><span>${onCount}/9 blocs actifs</span><span>${esc(p.pickup||'Pickup au choix')}</span></div>
    </div>
  </article>`;
}

function bind(){
  ['searchInput','artistFilter','genreFilter','variantFilter','eraFilter'].forEach(id=>$('#'+id).addEventListener(id==='searchInput'?'input':'change',renderPresets));
  $('#presetGrid').addEventListener('click',e=>{const fav=e.target.closest('[data-fav]');if(fav){e.stopPropagation();toggleFav(fav.dataset.fav);return}const c=e.target.closest('[data-id]');if(c){selectPreset(c.dataset.id);closePresetDrawer()}});
  $('#togglePresetDrawer')?.addEventListener('click',()=>togglePresetDrawer());
  document.addEventListener('click',e=>{if(!state.presetDrawerOpen)return;const drawer=$('#presetBrowser'),btn=$('#togglePresetDrawer');if(!drawer||!btn)return;const insideDrawer=drawer.contains(e.target);const onBtn=btn.contains(e.target);if(!insideDrawer&&!onBtn)closePresetDrawer()});
  $$('.quick-filter').forEach(btn=>btn.addEventListener('click',()=>{state.quickFilter=btn.dataset.presetQuick;$$('.quick-filter').forEach(x=>x.classList.toggle('active',x===btn));renderPresets()}));
  $$('.nav-btn').forEach(b=>b.addEventListener('click',()=>activateTab(b.dataset.tab)));
  $('#studioDeviceButton').addEventListener('click',()=>activateTab('transfer'));
  $('#stripPresetButton')?.addEventListener('click',()=>togglePresetDrawer());
  $('#stripSendButton')?.addEventListener('click',()=>{if(state.current)openTransfer(state.current)});
  $('#studioFocusBtn')?.addEventListener('click',toggleStudioFocus);
  document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&state.focusMode){state.focusMode=false;document.body.classList.remove('tone-focus');syncFocusButton()}});
  $('#randomBtn').addEventListener('click',()=>{const rows=filtered();if(rows.length){selectPreset(rows[Math.floor(Math.random()*rows.length)].id);closePresetDrawer()}});
  $('#favoritesBtn').addEventListener('click',()=>{state.favoritesOnly=!state.favoritesOnly;$('#favoritesBtn').classList.toggle('active',state.favoritesOnly);$('#favoritesBtn').textContent=state.favoritesOnly?'★ Tous':'★ Favoris';renderPresets()});
  bindMacroKnob('aggression','aggressionKnob','aggressionVal');bindMacroKnob('ambience','ambienceKnob','ambienceVal');bindMacroKnob('brightness','brightnessKnob','brightnessVal');bindMacroKnob('warmth','warmthKnob','warmthVal');bindMacroKnob('tightness','tightnessKnob','tightnessVal');bindMacroKnob('sustain','sustainKnob','sustainVal');
  $('#generateBtn').addEventListener('click',generatePreset);
  $$('[data-close-transfer]').forEach(x=>x.addEventListener('click',closeTransfer));
  $('#exportPocketEditBtn').addEventListener('click',()=>exportPocketEdit(false));
  $('#copyPocketEditBtn').addEventListener('click',()=>exportPocketEdit(true));
  $('#openPocketEditBtn').addEventListener('click',openPocketEdit);
  $('#openPocketEditTab').addEventListener('click',openPocketEdit);
  $('#scanMidiBtn').addEventListener('click',scanMidiDevices);
  $('#connectMidiBtn').addEventListener('click',connectSelectedMidi);
  $('#disconnectMidiBtn').addEventListener('click',disconnectMidi);
  $('#hardwareWriteArm')?.addEventListener('change',e=>setHardwareArm(e.target.checked));
  $('#liveSyncToggle').addEventListener('change',e=>{if(!state.direct.armed){e.target.checked=false;return toast('Arme d’abord les écritures temporaires');}state.direct.live=e.target.checked;toast(state.direct.live?'Live Sync activé':'Live Sync désactivé')});
  $('#clearMidiLogBtn').addEventListener('click',()=>{state.direct.log=[];renderMidiLog()});
  $('#sendDirectBtn').addEventListener('click',sendDirectPreset);
  $('#saveDirectBtn').addEventListener('click',saveDirectPreset);
  $('#prstFileInput')?.addEventListener('change',e=>{const f=e.target.files?.[0];if(f)inspectNativePrst(f)});
  $('#prstDropZone')?.addEventListener('dragover',e=>{e.preventDefault();e.currentTarget.classList.add('drag')});
  $('#prstDropZone')?.addEventListener('dragleave',e=>e.currentTarget.classList.remove('drag'));
  $('#prstDropZone')?.addEventListener('drop',e=>{e.preventDefault();e.currentTarget.classList.remove('drag');const f=e.dataTransfer.files?.[0];if(f)inspectNativePrst(f)});
  $('#importPrstToStudioBtn')?.addEventListener('click',importPrstToStudio);
  $('#exportNativePrstBtn')?.addEventListener('click',()=>exportNativePrst(state.current));
  $('#transferExportNativeBtn')?.addEventListener('click',()=>exportNativePrst(state.current));
  $('#exportNativeModalBtn')?.addEventListener('click',()=>exportNativePrst(state.transferPreset,$('#deviceName')?.value));
  $('#createSnapshotBtn')?.addEventListener('click',createSnapshot);
  $('#clearSnapshotsBtn')?.addEventListener('click',clearSnapshots);
  $('#snapshotList')?.addEventListener('click',handleSnapshotAction);
  $('#addSetlistBtn')?.addEventListener('click',addSetlistItem);
  $('#clearSetlistBtn')?.addEventListener('click',clearSetlist);
  $('#exportSetlistBtn')?.addEventListener('click',exportSetlist);
  $('#setlistList')?.addEventListener('click',handleSetlistAction);
  $('#analyzeToneBtn')?.addEventListener('click',analyzeToneHealth);
  $('#tempoBpm')?.addEventListener('input',updateTempo);
  $('#tempoDivision')?.addEventListener('change',updateTempo);
  $('#applyTempoBtn')?.addEventListener('click',applyTempoToCurrent);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeTransfer();closePresetDrawer()}});
}
function bindMacroKnob(rangeId,knobId,valueId){
  const range=$('#'+rangeId),knob=$('#'+knobId),label=$('#'+valueId);
  const sync=()=>{knob.style.setProperty('--value',range.value);label.textContent=range.value};
  range.addEventListener('input',sync);sync();makeKnobDraggable(knob,range);
}
function activateTab(tab){$$('.nav-btn').forEach(x=>x.classList.toggle('active',x.dataset.tab===tab));$$('.tab-page').forEach(x=>x.classList.remove('active'));$('#tab-'+tab).classList.add('active');if(tab!=='library')closePresetDrawer();window.scrollTo({top:0,behavior:'smooth'})}
function openPresetDrawer(){state.presetDrawerOpen=true;const drawer=$('#presetBrowser'),btn=$('#togglePresetDrawer');drawer?.classList.add('open');document.body.classList.add('drawer-open');if(btn){btn.classList.add('active');btn.setAttribute('aria-expanded','true');btn.innerHTML='▴ Fermer la bibliothèque';}}
function closePresetDrawer(){state.presetDrawerOpen=false;const drawer=$('#presetBrowser'),btn=$('#togglePresetDrawer');drawer?.classList.remove('open');document.body.classList.remove('drawer-open');if(btn){btn.classList.remove('active');btn.setAttribute('aria-expanded','false');btn.innerHTML='▾ Bibliothèque presets';}}
function togglePresetDrawer(force){const next=typeof force==='boolean'?force:!state.presetDrawerOpen;next?openPresetDrawer():closePresetDrawer()}
function updateHardwareStrip(p){
  if(!p)return;
  const amp=p.modules?.AMP?.model||'—';
  const drv=p.modules?.DRV?.enabled?(p.modules.DRV.model||'ON'):'OFF';
  const title=$('#stripPresetTitle'),sub=$('#stripPresetSub'),a=$('#stripAmp'),d=$('#stripDrv'),pick=$('#stripPickup'),match=$('#stripMatch'),vol=$('#stripVol');
  if(title)title.textContent=p.variant==='Song'?(p.song||p.name):p.name;
  if(sub)sub.textContent=[p.artist,p.variant==='Song'?p.section:p.variant,p.era].filter(Boolean).join(' · ');
  if(a)a.textContent=amp;
  if(d)d.textContent=drv;
  if(pick)pick.textContent=p.pickup||'—';
  if(match)match.textContent=`${p.match??'—'}%`;
  if(vol)vol.textContent=p.preset_vol??'—';
}
function syncFocusButton(){const b=$('#studioFocusBtn');if(!b)return;b.classList.toggle('active',state.focusMode);b.textContent=state.focusMode?'⊙ Quitter Focus':'⛶ Focus'}
async function toggleStudioFocus(){
  state.focusMode=!state.focusMode;
  document.body.classList.toggle('tone-focus',state.focusMode);
  syncFocusButton();
  if(state.focusMode){
    try{if(document.documentElement.requestFullscreen&&!document.fullscreenElement)await document.documentElement.requestFullscreen()}catch(_){}
    setTimeout(()=>$('#detailPanel')?.scrollIntoView({behavior:'smooth',block:'start'}),80);
  }else{
    try{if(document.fullscreenElement&&document.exitFullscreen)await document.exitFullscreen()}catch(_){}
  }
}
function toggleFav(id){state.favorites.has(id)?state.favorites.delete(id):state.favorites.add(id);saveFavs();renderPresets();if(state.current?.id===id)renderDetail(state.current,$('#detailPanel'));toast(state.favorites.has(id)?'Ajouté aux favoris':'Retiré des favoris')}
function selectPreset(id,opts={scroll:true}){const p=state.presets.find(x=>x.id===id);if(!p)return;state.current=structuredClone(p);renderPresets();renderDetail(state.current,$('#detailPanel'));updateHardwareStrip(state.current);window.PTLToneMatch?.syncCurrentPreset?.();if(opts.scroll&&innerWidth<900)$('#detailPanel').scrollIntoView({behavior:'smooth',block:'start'})}

function songMeta(p){
  if(p.variant!=='Song') return '';
  return `<div class="song-ribbon"><span>♫ ${esc(p.song)}</span><span>${esc(p.album||'')}</span><span>${esc(p.year||'')} · ${esc(p.section||'')}</span></div>`;
}
function renderDetail(p,host){
  host.classList.remove('empty-state');
  if(!p.chain.includes(state.editorModule)) state.editorModule=p.chain.includes('AMP')?'AMP':p.chain[0];
  if(host?.id==='detailPanel')updateHardwareStrip(p);
  const activeCount=p.chain.filter(m=>p.modules[m]?.enabled).length;
  host.innerHTML=`<div class="console-hero">
      <div class="detail-head"><div><p class="eyebrow">${esc(p.artist)} · ${esc(p.variant)}</p><h2>${esc(p.name)}</h2><p>${esc(p.description)}</p></div><div class="detail-actions"><button class="icon-btn fav-detail" title="Favori">${state.favorites.has(p.id)?'★':'☆'}</button><button class="icon-btn copy-detail" title="Copier les réglages">⧉</button><button class="icon-btn json-detail" title="Exporter JSON Pocket Tone Lab">⇩</button></div></div>
      ${songMeta(p)}
      <div class="console-control-strip">
        <div class="master-control module-AMP">
          <div class="master-label"><span>MASTER</span><small>PRESET VOL</small></div>
          <div class="master-dial"><div class="knob master-knob interactive-knob" style="--value:${Number(p.preset_vol)};--min:0;--max:127"></div><b class="master-value">${p.preset_vol}</b></div>
          <input class="preset-volume-slider" type="range" min="0" max="127" step="1" value="${Number(p.preset_vol)}">
        </div>
        <div class="tone-summary">
          <div class="detail-meta"><span class="meta-pill">🎸 ${esc(p.pickup)}</span><span class="meta-pill">${activeCount}/9 blocs actifs</span><span class="meta-pill">Approche ${p.match}%</span>${p.era?`<span class="meta-pill">◷ ${esc(p.era)}</span>`:''}</div>
          <div class="tone-summary-copy"><b>${esc(p.modules.AMP?.model||'AMP')}</b><span>${p.modules.DRV?.enabled?esc(p.modules.DRV.model):'Drive bypass'} · ${esc(p.genre||p.variant)}</span></div>
        </div>
        <button class="device-cta"><b>⚡ Envoyer au Pocket Master</b><span>USB direct · aucun slot écrasé</span></button>
      </div>
    </div>
    <div class="rack-section-head"><div><span class="eyebrow">Signal chain</span><h3>Ta chaîne en un coup d’œil</h3></div><small>Clique un bloc pour aller directement à ses potards.</small></div>
    <div class="chain soniclink-chain">${p.chain.map((m,i)=>{const b=p.modules[m];return `<button class="chain-node chain-${m} ${b?.enabled?'on':''} ${state.editorModule===m?'editor-selected':''}" data-chain-module="${m}"><span>${String(i+1).padStart(2,'0')}</span><img class="chain-module-art" src="${moduleAsset(m,!!b?.enabled)}" alt="${m}"><b>${m}</b><small>${esc(b?.model||'OFF')}</small></button>`}).join('')}</div>
    <div class="rack-section-head controls-head"><div><span class="eyebrow">Control surface</span><h3>Potards & paramètres</h3></div><small>Glisse verticalement sur un potard, utilise la molette ou le slider.</small></div>
    <div class="module-list">${p.chain.map(m=>moduleCard(p,m)).join('')}</div>
    <div class="tip-box"><b>Conseil de jeu</b><span>${esc(p.tips)}</span></div>`;
  host.querySelector('.fav-detail').onclick=()=>{if(p.id!=='generated')toggleFav(p.id)};
  host.querySelector('.copy-detail').onclick=()=>navigator.clipboard.writeText(settingsText(p)).then(()=>toast('Réglages copiés'));
  host.querySelector('.json-detail').onclick=()=>downloadJSON(p);
  host.querySelector('.device-cta').onclick=()=>openTransfer(p);
  host.querySelectorAll('[data-chain-module]').forEach(btn=>btn.onclick=()=>{state.editorModule=btn.dataset.chainModule;renderDetail(p,host);});
  host.querySelectorAll('.toggle').forEach(btn=>btn.onclick=()=>{const m=btn.dataset.module;p.modules[m].enabled=!p.modules[m].enabled;liveSend(()=>state.direct.connector.sendModuleState(m,p.modules[m].enabled));renderDetail(p,host)});
  host.querySelectorAll('.move-block').forEach(btn=>btn.onclick=()=>moveModule(p,btn.dataset.module,Number(btn.dataset.dir),host));
  host.querySelectorAll('.param-slider').forEach(inp=>{
    inp.oninput=()=>{const m=inp.dataset.module,k=inp.dataset.param;const val=Number(inp.value);p.modules[m].params[k]=val;syncRangeVisual(inp);clearTimeout(inp._liveTimer);inp._liveTimer=setTimeout(()=>liveSend(()=>state.direct.connector.sendParameter(m,liveEffectName(p.modules[m].model),liveParamName(k),val)),45)};
    syncRangeVisual(inp);const knob=inp.closest('.knob-wrap')?.querySelector('.interactive-knob');if(knob)makeKnobDraggable(knob,inp);
  });
  host.querySelectorAll('.select-param').forEach(sel=>sel.onchange=()=>{const m=sel.dataset.module,k=sel.dataset.param;p.modules[m].params[k]=sel.value;liveSend(()=>state.direct.connector.sendParameter(m,liveEffectName(p.modules[m].model),liveParamName(k),sel.value))});
  host.querySelectorAll('.model-select').forEach(sel=>sel.onchange=()=>changeModel(p,sel.dataset.module,sel.value,host));
  const vol=host.querySelector('.preset-volume-slider');
  if(vol){vol.oninput=()=>{p.preset_vol=Number(vol.value);if(host?.id==='detailPanel')updateHardwareStrip(p);host.querySelector('.master-knob').style.setProperty('--value',vol.value);host.querySelector('.master-value').textContent=vol.value;clearTimeout(vol._liveTimer);vol._liveTimer=setTimeout(()=>liveSend(()=>state.direct.connector.sendPresetVolume(Number(vol.value))),45)};makeKnobDraggable(host.querySelector('.master-knob'),vol)}
}
function syncRangeVisual(inp){
  const w=inp.closest('.knob-wrap');if(!w)return;const knob=w.querySelector('.knob'),val=w.querySelector('.knob-value');if(knob)knob.style.setProperty('--value',inp.value);if(val)val.textContent=inp.value+(inp.dataset.unit||'');
}
function steppedValue(raw,min,max,step){
  const s=Number(step)||1;let v=Math.min(max,Math.max(min,raw));v=min+Math.round((v-min)/s)*s;const dec=(String(s).split('.')[1]||'').length;return Number(v.toFixed(dec));
}
function makeKnobDraggable(knob,range){
  if(!knob||!range||knob.dataset.knobBound==='1')return;knob.dataset.knobBound='1';knob.tabIndex=0;knob.setAttribute('role','slider');knob.setAttribute('aria-label',range.dataset.param||range.id||'Réglage');
  const min=Number(range.min),max=Number(range.max),step=Number(range.step)||1;
  const apply=v=>{range.value=steppedValue(v,min,max,step);range.dispatchEvent(new Event('input',{bubbles:true}));knob.setAttribute('aria-valuenow',range.value)};
  knob.addEventListener('pointerdown',e=>{if(e.button!==undefined&&e.button!==0)return;e.preventDefault();const startY=e.clientY,startX=e.clientX,start=Number(range.value),span=max-min;knob.classList.add('dragging');knob.setPointerCapture?.(e.pointerId);const move=ev=>{const px=(startY-ev.clientY)+(ev.clientX-startX)*.28;apply(start+(px/150)*span)};const up=()=>{knob.classList.remove('dragging');knob.removeEventListener('pointermove',move);knob.removeEventListener('pointerup',up);knob.removeEventListener('pointercancel',up)};knob.addEventListener('pointermove',move);knob.addEventListener('pointerup',up);knob.addEventListener('pointercancel',up)});
  knob.addEventListener('wheel',e=>{e.preventDefault();apply(Number(range.value)+(e.deltaY<0?step:-step))},{passive:false});
  knob.addEventListener('keydown',e=>{if(e.key==='ArrowUp'||e.key==='ArrowRight'){e.preventDefault();apply(Number(range.value)+step)}if(e.key==='ArrowDown'||e.key==='ArrowLeft'){e.preventDefault();apply(Number(range.value)-step)}});
}
function moveModule(p,m,dir,host){
  const i=p.chain.indexOf(m),j=i+dir;if(i<0||j<0||j>=p.chain.length)return;
  const fixed=state.effects.fixed;
  if(fixed.includes(p.chain[j])){const boundary=dir<0?p.chain.indexOf(fixed[0]):p.chain.indexOf(fixed[fixed.length-1]);p.chain.splice(i,1);p.chain.splice(boundary,0,m)}else{[p.chain[i],p.chain[j]]=[p.chain[j],p.chain[i]]}
  liveSend(()=>state.direct.connector.sendChainOrder(p.chain));renderDetail(p,host);
}
function changeModel(p,m,model,host){
  const schema=state.effects.library[m].models[model];p.modules[m].model=model;p.modules[m].enabled=true;p.modules[m].params={};
  Object.entries(schema.params||{}).forEach(([k,x])=>{if(x.type==='switch'||x.type==='select')p.modules[m].params[k]=x.options[0];else if(k==='Time')p.modules[m].params[k]=Math.min(350,x.max??350);else if((x.min??0)<0 && (x.max??100)>0)p.modules[m].params[k]=0;else if((x.min??0)>0)p.modules[m].params[k]=x.min;else p.modules[m].params[k]=50});
  liveSend(async()=>{await state.direct.connector.sendEffectType(m,liveEffectName(model));await state.direct.connector.sendModuleState(m,true);for(const [k,v] of Object.entries(p.modules[m].params||{})){await state.direct.connector.sendParameter(m,liveEffectName(model),liveParamName(k),v)}});renderDetail(p,host);
}
function moduleCard(p,m){
  const b=p.modules[m]||{enabled:false,model:null,params:{}},movable=state.effects.movable.includes(m),idx=p.chain.indexOf(m),models=state.effects.library[m]?.models||{},schema=models?.[b.model]?.params||{};
  return `<section class="module-card module-${m} ${b.enabled?'on':''} ${state.editorModule===m?'editor-active':''}" data-module-card="${m}"><div class="module-title"><div class="module-name"><span class="module-badge soniclink-module-badge"><img src="${moduleAsset(m,b.enabled)}" alt="${m}"></span><div class="module-select-zone"><label class="model-label">${m} · ${state.effects.fixed.includes(m)?'FIXED':'MOVABLE'}</label><select class="model-select" data-module="${m}">${Object.keys(models).map(x=>`<option ${x===b.model?'selected':''}>${esc(x)}</option>`).join('')}</select><span>${b.enabled?'ON':'OFF'} · ${Object.keys(b.params||{}).length} PARAM${Object.keys(b.params||{}).length>1?'S':''}</span></div></div><div class="module-actions">${movable?`<button class="move-block" data-module="${m}" data-dir="-1" ${idx===0?'disabled':''} title="Déplacer avant">‹</button><button class="move-block" data-module="${m}" data-dir="1" ${idx===p.chain.length-1?'disabled':''} title="Déplacer après">›</button>`:''}<button class="toggle ${b.enabled?'on':''}" data-module="${m}" aria-label="Activer ou bypass ${m}"></button></div></div>${b.model?`<div class="knob-grid">${Object.entries(b.params).map(([k,v])=>paramWidget(m,k,v,schema[k])).join('')}</div>`:''}</section>`;
}
function paramWidget(m,k,v,s){
  s=s||{label:k,min:0,max:100,step:1,unit:''};
  if(s.type==='select'||s.type==='switch') return `<div class="knob-wrap select-knob-wrap"><div class="select-control-icon">◆</div><div class="knob-value select-value">MODE</div><div class="knob-label">${esc(s.label||k)}</div><select class="select-param" data-module="${m}" data-param="${esc(k)}">${s.options.map(o=>`<option ${o===v?'selected':''}>${esc(o)}</option>`).join('')}</select></div>`;
  const mn=s.min??0,mx=s.max??100,unit=s.unit||'';
  return `<div class="knob-wrap"><div class="knob interactive-knob" data-module="${m}" data-param="${esc(k)}" style="--value:${Number(v)};--min:${mn};--max:${mx}"></div><div class="knob-value">${v}${unit}</div><div class="knob-label" title="${esc(s.label||k)}">${esc(s.label||k)}</div><input class="param-slider" data-module="${m}" data-param="${esc(k)}" data-unit="${esc(unit)}" type="range" min="${mn}" max="${mx}" step="${s.step||1}" value="${Number(v)}"></div>`;
}

function settingsText(p){let out=`${p.name}\nPreset VOL: ${p.preset_vol}\nPickup: ${p.pickup}\n`;if(p.song)out+=`Song: ${p.song} · ${p.section} · ${p.year}\n`;out+='\n';p.chain.forEach(m=>{const b=p.modules[m];out+=`${m}: ${b.enabled?'ON':'OFF'} — ${b.model||'Bypass'}\n`;if(b.enabled&&b.params)Object.entries(b.params).forEach(([k,v])=>out+=`  ${k}: ${v}\n`)});out+=`\n${p.tips}\n`;return out}
function downloadJSON(p){const blob=new Blob([JSON.stringify(p,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(p.id||'preset')+'.pocket-tone.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('JSON Pocket Tone Lab exporté')}
async function generatePreset(){const body={base_id:$('#genBase').value,pickup:$('#genPickup').value,aggression:$('#aggression').value,ambience:$('#ambience').value,brightness:$('#brightness').value,warmth:$('#warmth').value,tightness:$('#tightness').value,sustain:$('#sustain').value};const p=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json());renderDetail(p,$('#generatedDetail'));toast('Preset généré');if(innerWidth<900)$('#generatedDetail').scrollIntoView({behavior:'smooth',block:'start'})}
function renderMachine(){const off=state.official?.modules;if(off?.length){$('#machineCatalog').innerHTML=off.map(m=>{const local=state.effects.library?.[m.name]||{};return `<section class="machine-block"><h3>${esc(m.name)}<span>Module ID ${m.moduleId} · ${m.models.length} modèles · source SONICLINK QME-10</span></h3>${m.models.map(model=>{const localModel=local.models?.[model.name]||{};return `<div class="model-row"><div class="official-model-title"><b>${esc(model.name)}</b><code>FXID ${model.fxid}</code></div><p>${esc(localModel.description||model.type||'')}</p><div class="param-chips">${model.params.map(v=>`<span>${esc(v.name)} · alg ${v.algId} · ${esc(v.min)}…${esc(v.max)} · step ${esc(v.step)}</span>`).join('')}</div></div>`}).join('')}</section>`}).join('');return}const lib=state.effects.library;$('#machineCatalog').innerHTML=Object.entries(lib).map(([name,b])=>`<section class="machine-block"><h3>${name}<span>${b.movable?'déplaçable':'position fixe'} · ${Object.keys(b.models||{}).length} modèles</span></h3>${Object.entries(b.models||{}).map(([model,s])=>`<div class="model-row"><b>${esc(model)}</b><p>${esc(s.description||'')}</p></div>`).join('')}</section>`).join('')}

function presetKey(p){if(!p)return '';return JSON.stringify({name:p.name,vol:p.preset_vol,chain:p.chain,modules:p.modules})}
function initDirectConnector(){
  if(!window.PocketMasterDirectConnector){appendMidiLog({message:'Connecteur WebMIDI non chargé.',type:'error',at:new Date()});return}
  state.direct.connector=new window.PocketMasterDirectConnector({onLog:appendMidiLog,onStatus:updateDirectStatus});updateDirectStatus({connected:false});
  if(!navigator.requestMIDIAccess){const status=$('#protocolStatus');if(status)status.textContent='WebMIDI indisponible dans ce navigateur.'}
}
function appendMidiLog(entry){state.direct.log.push(entry);if(state.direct.log.length>220)state.direct.log.shift();renderMidiLog()}
function renderMidiLog(){
  const host=$('#midiLog');if(!host)return;if(!state.direct.log.length){host.innerHTML='<div class="midi-log-empty">Aucune communication MIDI pour le moment.</div>';return}
  host.innerHTML=state.direct.log.slice().reverse().map(x=>{const t=x.at instanceof Date?x.at:new Date(x.at||Date.now());let msg=String(x.message||'');if(msg.length>180)msg=msg.slice(0,176)+'…';return `<div class="midi-line ${esc(x.type||'info')}"><time>${t.toLocaleTimeString('fr-FR')}</time><span>${esc(msg)}</span></div>`}).join('');
}
function updateDirectStatus(info={}){
  state.direct.connected=!!info.connected;const name=info.name||'Pocket Master';
  const main=$('#directStatus');if(main){main.classList.toggle('connected',state.direct.connected);main.querySelector('b').textContent=state.direct.connected?`Connecté · ${name}`:'Non connecté';main.querySelector('small').textContent=state.direct.connected?'USB MIDI/SysEx prêt. Tu peux envoyer un preset.':'Branche la pédale en USB puis autorise l’accès MIDI.'}
  const studio=$('#studioDeviceButton');if(studio){studio.classList.toggle('connected',state.direct.connected);$('#studioDeviceText').textContent=state.direct.connected?`Connecté · ${name}`:'Non connecté'}
  const modal=$('#directModalStatus');if(modal){modal.classList.toggle('connected',state.direct.connected);modal.classList.toggle('offline',!state.direct.connected);modal.querySelector('b').textContent=state.direct.connected?`Connecté · ${name}`:'Connecteur direct non connecté';modal.querySelector('small').textContent=state.direct.connected?'L’envoi test n’écrase aucun slot.':'Connecte le Pocket Master depuis l’onglet Pocket Master.'}
  if($('#disconnectMidiBtn'))$('#disconnectMidiBtn').hidden=!state.direct.connected;if($('#connectMidiBtn')&&state.direct.connected)$('#connectMidiBtn').hidden=true;syncHardwareButtons();if(!state.direct.connected){state.direct.lastAppliedKey=null;setHardwareArm(false);}
}
async function scanMidiDevices(){
  const btn=$('#scanMidiBtn');btn.disabled=true;btn.textContent='Détection…';
  try{const devices=await state.direct.connector.scan();state.direct.devices=devices;const sel=$('#midiDeviceSelect');sel.innerHTML='';devices.forEach(d=>sel.insertAdjacentHTML('beforeend',`<option value="${d.index}">${esc(d.name)}</option>`));sel.hidden=!devices.length;$('#connectMidiBtn').hidden=!devices.length;const meta=state.direct.connector.protocolMeta;$('#protocolStatus').textContent=meta?`Protocole PocketEdit courant chargé · cache ${meta.cache||'OK'}`:'Protocole chargé.';if(!devices.length)toast('Aucune paire MIDI détectée');else toast(`${devices.length} périphérique(s) MIDI détecté(s)`)}catch(e){console.error(e);appendMidiLog({message:e.message,type:'error',at:new Date()});toast(e.message)}finally{btn.disabled=false;btn.textContent='⌁ Détecter le Pocket Master'}
}
async function connectSelectedMidi(){try{const idx=Number($('#midiDeviceSelect').value||0);await state.direct.connector.connect(idx);$('#connectMidiBtn').hidden=true;$('#disconnectMidiBtn').hidden=false;toast('Pocket Master connecté')}catch(e){console.error(e);appendMidiLog({message:e.message,type:'error',at:new Date()});toast(e.message)}}
function disconnectMidi(){state.direct.connector?.disconnect();$('#connectMidiBtn').hidden=!state.direct.devices.length;$('#disconnectMidiBtn').hidden=true;toast('Pédale déconnectée')}
function liveSend(fn){if(!state.direct.connected||!state.direct.live||!state.direct.armed||!state.direct.connector)return;Promise.resolve().then(fn).catch(e=>{console.error(e);appendMidiLog({message:`Live Sync: ${e.message}`,type:'error',at:new Date()})})}
function setDirectProgress(percent,label){const p=Math.max(0,Math.min(100,Number(percent)||0));$('#directProgressBar').style.width=`${p}%`;$('#directProgressText').textContent=label||`${p}%`}
async function sendDirectPreset(){
  if(!state.direct.connected){activateTab('transfer');toast('Connecte d’abord le Pocket Master');return false}
  if(!state.direct.armed){toast('Hardware Guard : arme explicitement les écritures temporaires');return false}
  const btn=$('#sendDirectBtn');btn.disabled=true;setDirectProgress(0,'Préparation…');
  try{const data=await getPocketEditJSON();await state.direct.connector.applyPreset(data,x=>setDirectProgress(x.percent,`${x.percent}% · ${x.label}`));state.direct.lastAppliedKey=presetKey(state.transferPreset);setDirectProgress(100,'Appliqué · non sauvegardé');toast('Preset envoyé — aucun slot écrasé');return true}catch(e){console.error(e);setDirectProgress(0,'Erreur');appendMidiLog({message:e.message,type:'error',at:new Date()});toast(e.message);return false}finally{syncHardwareButtons()}
}
async function saveDirectPreset(){
  if(!state.direct.connected){toast('Connecte d’abord le Pocket Master');return}
  if(!state.direct.armed){toast('Hardware Guard : écriture non armée');return}
  if(!$('#persistentWriteConfirm')?.checked){toast('Coche l’autorisation explicite d’écriture permanente');return}
  const slot=Number($('#directSlot').value);if(!Number.isInteger(slot)||slot<1||slot>50){toast('Choisis un slot User entre 1 et 50');return}
  if(state.direct.lastAppliedKey!==presetKey(state.transferPreset)){if(!confirm('Ce preset n’a pas encore été appliqué à la pédale. L’envoyer avant la sauvegarde ?'))return;const ok=await sendDirectPreset();if(!ok)return}
  if(!confirm(`Le slot User ${slot} va être écrasé. Continuer ?`))return;
  const btn=$('#saveDirectBtn');btn.disabled=true;btn.textContent='Sauvegarde…';
  try{const res=await state.direct.connector.saveToSlot(slot,$('#deviceName').value);toast(`Sauvegardé dans User ${res.slot}`);setDirectProgress(100,`Sauvegardé · User ${res.slot}`)}catch(e){console.error(e);appendMidiLog({message:e.message,type:'error',at:new Date()});toast(e.message)}finally{btn.textContent='Sauvegarder dans ce slot';syncHardwareButtons()}
}
async function openTransfer(p){
  state.transferPreset=p;$('#transferPresetName').textContent=p.name;$('#transferModal').classList.add('open');$('#transferModal').setAttribute('aria-hidden','false');
  try{const x=await fetch('/api/device-name',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:p.song?`${p.artist} ${p.song}`:p.name})}).then(r=>r.json());$('#deviceName').value=x.device_name}catch{$('#deviceName').value='PRESET'}
  if($('#persistentWriteConfirm'))$('#persistentWriteConfirm').checked=false;updateDirectStatus({connected:state.direct.connected,name:state.direct.connector?.deviceName||null});setDirectProgress(0,state.direct.connected?'Prêt à envoyer':'Connecteur non connecté');setTimeout(()=>$('#deviceName').focus(),80);
}
function closeTransfer(){const m=$('#transferModal');m.classList.remove('open');m.setAttribute('aria-hidden','true')}
async function getPocketEditJSON(){if(!state.transferPreset)throw new Error('Aucun preset sélectionné');const r=await fetch('/api/export/pocketedit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({preset:state.transferPreset,device_name:$('#deviceName').value})});const data=await r.json();if(!r.ok)throw new Error(data.error||'Export impossible');return data}
async function exportPocketEdit(copyOnly=false){
  try{const data=await getPocketEditJSON(),json=JSON.stringify(data,null,2);if(copyOnly){await navigator.clipboard.writeText(json);toast('JSON PocketEdit copié');return}const blob=new Blob([json],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${data.presetName||'PRESET'}_PocketEdit.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('JSON PocketEdit prêt à importer')}catch(e){console.error(e);toast(e.message||'Erreur export')}
}

function setHardwareArm(armed){
  state.direct.armed=!!armed;state.direct.connector?.setWriteArmed?.(state.direct.armed);
  const arm=$('#hardwareWriteArm'); if(arm)arm.checked=state.direct.armed;
  const live=$('#liveSyncToggle');
  if(live){live.disabled=!state.direct.armed;if(!state.direct.armed){live.checked=false;state.direct.live=false}live.closest('.live-sync-toggle')?.classList.toggle('disabled',!state.direct.armed)}
  syncHardwareButtons();
  if(state.direct.armed)toast('Hardware Guard armé · écriture temporaire autorisée');
}
function syncHardwareButtons(){
  const canTemp=!!(state.direct.connected&&state.direct.armed);
  if($('#sendDirectBtn'))$('#sendDirectBtn').disabled=!canTemp;
  const permanent=!!($('#persistentWriteConfirm')?.checked);
  if($('#saveDirectBtn'))$('#saveDirectBtn').disabled=!(canTemp&&permanent);
}
document.addEventListener('change',e=>{if(e.target?.id==='persistentWriteConfirm'){state.direct.connector?.setPersistentArmed?.(!!e.target.checked);syncHardwareButtons()}});

async function inspectNativePrst(file){
  const fd=new FormData();fd.append('file',file);
  const host=$('#prstInspector');host.classList.remove('empty');host.innerHTML='<div class="inspector-loading">Analyse du format natif…</div>';
  try{
    const r=await fetch('/api/prst/import',{method:'POST',body:fd}),data=await r.json();
    if(!r.ok)throw new Error(data.error||'Fichier .prst invalide');
    state.importedPrst=data;
    const i=data.inspection;
    const modules=i.modules.map(m=>`<div class="native-module ${m.enabled?'on':''}"><span>${esc(m.module)}</span><b>${esc(m.model||'FXID '+m.fxid)}</b><small>${m.enabled?'ON':'OFF'} · ${Object.entries(m.params||{}).map(([k,v])=>`${esc(k)} ${esc(v)}`).join(' · ')||'aucun paramètre visible'}</small></div>`).join('');
    host.innerHTML=`<div class="inspector-head"><div><b>${esc(i.name)}</b><span>${i.size} octets · Version ${i.version}</span></div><span class="crc-pill ${i.crcValid?'good':'bad'}">CRC ${i.crcValid?'OK':'ERREUR'} · ${String(i.crcCalculated).toUpperCase()}</span></div><div class="native-global"><span>VOL <b>${i.presetVolume}</b></span><span>BPM <b>${i.presetBPM}</b></span><span>MASK <b>${i.enabledMask}</b></span><span>CHAIN <b>${i.chain.join(' → ')}</b></span></div><div class="native-module-grid">${modules}</div>${i.warnings?.length?`<div class="native-warning">${i.warnings.map(esc).join('<br>')}</div>`:''}`;
    $('#importPrstToStudioBtn').disabled=false;
    toast(i.crcValid?'PRST valide · CRC confirmé':'PRST lu mais CRC invalide');
  }catch(e){state.importedPrst=null;$('#importPrstToStudioBtn').disabled=true;host.innerHTML=`<div class="native-error">${esc(e.message)}</div>`;toast(e.message)}
}
function importPrstToStudio(){
  const p=state.importedPrst?.preset;if(!p)return;
  state.current=structuredClone(p);renderDetail(state.current,$('#detailPanel'));updateHardwareStrip(state.current);window.PTLToneMatch?.syncCurrentPreset?.();activateTab('library');toast('Preset natif chargé dans Tone Studio');
}
async function exportNativePrst(preset,nameOverride=null){
  const p=preset||state.current;if(!p)return toast('Aucun preset courant');
  try{
    const r=await fetch('/api/prst/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({preset:p,device_name:nameOverride||p.name,bpm:p.preset_bpm||120})});
    if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.error||'Export .prst impossible')}
    const blob=await r.blob(),cd=r.headers.get('Content-Disposition')||'',m=cd.match(/filename="?([^";]+)"?/i);downloadBlob(blob,m?.[1]||'PRESET.prst');toast('Fichier .prst natif généré et auto-vérifié');
  }catch(e){console.error(e);toast(e.message)}
}
function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1200)}

function persistVault(){localStorage.setItem('ptl-snapshots',JSON.stringify(state.snapshots));localStorage.setItem('ptl-setlist',JSON.stringify(state.setlist))}
function createSnapshot(){
  if(!state.current)return toast('Aucun preset courant');
  state.snapshots.unshift({id:`snap-${Date.now()}`,createdAt:new Date().toISOString(),preset:structuredClone(state.current)});state.snapshots=state.snapshots.slice(0,30);persistVault();renderSnapshots();toast('Snapshot créé');
}
function clearSnapshots(){if(!state.snapshots.length)return;if(confirm('Effacer tous les snapshots locaux ?')){state.snapshots=[];persistVault();renderSnapshots()}}
function presetDiffCount(a,b){
  let n=0;const ma=a?.modules||{},mb=b?.modules||{};for(const m of new Set([...Object.keys(ma),...Object.keys(mb)])){const x=ma[m]||{},y=mb[m]||{};if(x.enabled!==y.enabled||x.model!==y.model)n++;const px=x.params||{},py=y.params||{};for(const k of new Set([...Object.keys(px),...Object.keys(py)]))if(px[k]!==py[k])n++}if(a?.preset_vol!==b?.preset_vol)n++;return n;
}
function renderSnapshots(){
  const host=$('#snapshotList');if(!host)return;$('#snapshotCount').textContent=state.snapshots.length;
  if(!state.snapshots.length){host.innerHTML='<div class="vault-empty">Aucun snapshot.</div>';return}
  host.innerHTML=state.snapshots.map((s,i)=>{const d=presetDiffCount(state.current,s.preset),t=new Date(s.createdAt).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'});return `<article class="snapshot-row" data-snap="${s.id}"><div><b>${esc(s.preset.name)}</b><span>${t} · ${d} différence${d>1?'s':''} avec le son courant</span></div><div><button data-snap-action="restore">A/B Charger</button><button data-snap-action="delete">×</button></div></article>`}).join('');
}
function handleSnapshotAction(e){const btn=e.target.closest('[data-snap-action]'),row=e.target.closest('[data-snap]');if(!btn||!row)return;const i=state.snapshots.findIndex(x=>x.id===row.dataset.snap);if(i<0)return;if(btn.dataset.snapAction==='delete'){state.snapshots.splice(i,1);persistVault();renderSnapshots();return}state.current=structuredClone(state.snapshots[i].preset);renderDetail(state.current,$('#detailPanel'));updateHardwareStrip(state.current);window.PTLToneMatch?.syncCurrentPreset?.();renderSnapshots();activateTab('library');toast('Snapshot restauré localement')}

function addSetlistItem(){if(!state.current)return toast('Aucun preset courant');state.setlist.push({id:`set-${Date.now()}`,preset:structuredClone(state.current)});persistVault();renderSetlist();toast('Ajouté à la setlist')}
function clearSetlist(){if(state.setlist.length&&confirm('Vider la setlist locale ?')){state.setlist=[];persistVault();renderSetlist()}}
function renderSetlist(){const host=$('#setlistList');if(!host)return;$('#setlistCount').textContent=state.setlist.length;if(!state.setlist.length){host.innerHTML='<div class="vault-empty">Ta setlist est vide.</div>';return}host.innerHTML=state.setlist.map((x,i)=>`<article class="setlist-row" data-set="${x.id}"><span>${String(i+1).padStart(2,'0')}</span><div><b>${esc(x.preset.name)}</b><small>${esc(x.preset.artist||'')} · ${esc(x.preset.modules?.AMP?.model||'')}</small></div><div><button data-set-action="up">↑</button><button data-set-action="down">↓</button><button data-set-action="load">LOAD</button><button data-set-action="delete">×</button></div></article>`).join('')}
function handleSetlistAction(e){const btn=e.target.closest('[data-set-action]'),row=e.target.closest('[data-set]');if(!btn||!row)return;const i=state.setlist.findIndex(x=>x.id===row.dataset.set);if(i<0)return;const a=btn.dataset.setAction;if(a==='delete')state.setlist.splice(i,1);else if(a==='up'&&i>0)[state.setlist[i-1],state.setlist[i]]=[state.setlist[i],state.setlist[i-1]];else if(a==='down'&&i<state.setlist.length-1)[state.setlist[i+1],state.setlist[i]]=[state.setlist[i],state.setlist[i+1]];else if(a==='load'){state.current=structuredClone(state.setlist[i].preset);renderDetail(state.current,$('#detailPanel'));updateHardwareStrip(state.current);window.PTLToneMatch?.syncCurrentPreset?.();activateTab('library');toast('Preset de setlist chargé')}persistVault();renderSetlist()}
function exportSetlist(){const blob=new Blob([JSON.stringify({format:'Pocket Tone Lab Setlist',version:1,createdAt:new Date().toISOString(),items:state.setlist},null,2)],{type:'application/json'});downloadBlob(blob,'pocket-tone-setlist.json')}

async function analyzeToneHealth(){if(!state.current)return toast('Aucun preset courant');const score=$('#toneHealthScore'),host=$('#toneHealthFindings');score.textContent='…';host.innerHTML='<div class="health-empty">Analyse…</div>';try{const r=await fetch('/api/analyze/tone-health',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(state.current)}),d=await r.json();score.textContent=d.score;score.className=`health-score ${d.score>=85?'good':d.score>=65?'warn':'bad'}`;host.innerHTML=d.findings.map(x=>`<article class="health-item ${esc(x.level)}"><span></span><div><b>${esc(x.title)}</b><p>${esc(x.text)}</p></div></article>`).join('')+`<small class="health-note">${esc(d.note)}</small>`}catch(e){score.textContent='—';host.innerHTML=`<div class="native-error">${esc(e.message)}</div>`}}
function tempoMs(){const bpm=Math.max(40,Math.min(300,Number($('#tempoBpm')?.value||120))),division=Number($('#tempoDivision')?.value||1);return Math.round((60000/bpm)*division)}
function updateTempo(){const ms=tempoMs();if($('#tempoMs'))$('#tempoMs').textContent=`${ms} ms`}
function applyTempoToCurrent(){if(!state.current)return toast('Aucun preset courant');const d=state.current.modules?.DLY;if(!d||!('Time' in (d.params||{})))return toast('Le delay courant n’expose pas de paramètre Time');const spec=state.effects?.library?.DLY?.models?.[d.model]?.params?.Time;let ms=tempoMs();if(spec){ms=Math.max(Number(spec.min),Math.min(Number(spec.max),ms))}d.params.Time=ms;d.enabled=true;renderDetail(state.current,$('#detailPanel'));updateHardwareStrip(state.current);toast(`Delay réglé sur ${ms} ms`)}

function openPocketEdit(){window.open(POCKETEDIT_URL,'_blank','noopener,noreferrer')}

init().catch(err=>{console.error(err);toast('Erreur de chargement')});
