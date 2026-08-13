(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const mobile = () => matchMedia('(max-width: 900px)').matches || !!window.AndroidBridge;
  if (!mobile()) return;

  function legacyTab(name){
    const b=$(`.nav-btn[data-tab="${name}"]`);
    if(b) b.click();
  }
  function presetName(){
    return $('#stripPresetTitle')?.textContent?.trim() || state?.current?.name || 'Pocket Master';
  }
  function build(){
    document.body.classList.add('soniclink-classic-v6');

    const header=document.createElement('header');
    header.className='sl6-header';
    header.innerHTML=`
      <button class="sl6-iconbtn" id="sl6Menu" aria-label="Menu"><img src="soniclink/btn_menu.svg"></button>
      <button class="sl6-title" id="sl6Preset" aria-label="Preset courant"><small>POCKET MASTER</small><b id="sl6PresetName">Pocket Master</b></button>
      <div class="sl6-head-actions">
        <button class="sl6-iconbtn" id="sl6Load" aria-label="Charger"><img src="soniclink/home_btn_load.svg"></button>
        <button class="sl6-iconbtn" id="sl6Save" aria-label="Sauvegarder"><img src="soniclink/home_btn_save.svg"></button>
        <button class="sl6-iconbtn" id="sl6More" aria-label="Plus"><img src="soniclink/btn_more_option.svg"></button>
      </div>`;
    document.body.appendChild(header);

    const dock=document.createElement('nav');
    dock.className='sl6-dock';
    dock.innerHTML=`
      <button data-sl6="effects" class="active"><img src="soniclink/effects.svg"><span>Effects</span></button>
      <button data-sl6="presets"><span class="sl6-gridicon">▦</span><span>Presets</span></button>
      <button data-sl6="match"><span class="sl6-matchicon">◎</span><span>Match</span></button>
      <button data-sl6="more"><img src="soniclink/settings.svg"><span>More</span></button>`;
    document.body.appendChild(dock);

    const back=document.createElement('div'); back.className='sl6-backdrop'; document.body.appendChild(back);
    const sheet=document.createElement('section'); sheet.className='sl6-sheet'; sheet.innerHTML=`
      <div class="sl6-grab"></div>
      <div class="sl6-sheet-title"><b>More</b><button id="sl6Close">×</button></div>
      <div class="sl6-sheet-list">
        <button data-sl6-page="performance"><span>▶</span><div><b>Live Control</b><small>Setlist, TAP, PREV / NEXT</small></div></button>
        <button data-sl6-page="transfer"><span>USB</span><div><b>Pocket Master</b><small>Connexion, Hardware Guard, envoi</small></div></button>
        <button data-sl6-page="vault"><span>PR</span><div><b>Presets & Backup</b><small>.prst, snapshots, setlists</small></div></button>
        <button data-sl6-page="generator"><span>✦</span><div><b>Tone Generator</b><small>Variantes et macros</small></div></button>
        <button data-sl6-page="machine"><span>FX</span><div><b>Models</b><small>Catalogue réel QME-10</small></div></button>
      </div>`; document.body.appendChild(sheet);

    const openSheet=()=>{sheet.classList.add('open');back.classList.add('open')};
    const closeSheet=()=>{sheet.classList.remove('open');back.classList.remove('open')};
    $('#sl6Menu').onclick=openSheet; $('#sl6More').onclick=openSheet; $('#sl6Close').onclick=closeSheet; back.onclick=closeSheet;
    $('#sl6Load').onclick=()=>{legacyTab('library');setTimeout(()=>$('#togglePresetDrawer')?.click(),30);setDock('presets')};
    $('#sl6Preset').onclick=$('#sl6Load').onclick;
    $('#sl6Save').onclick=()=>{if(state?.current) openTransfer(state.current); else toast('Charge un preset')};
    sheet.onclick=e=>{const b=e.target.closest('[data-sl6-page]');if(!b)return;legacyTab(b.dataset.sl6Page);closeSheet();setDock('more')};
    dock.onclick=e=>{const b=e.target.closest('[data-sl6]');if(!b)return;const k=b.dataset.sl6;if(k==='effects'){legacyTab('library');closePresetDrawer?.();setDock(k)}else if(k==='presets'){legacyTab('library');setTimeout(()=>{if(!$('#presetBrowser')?.classList.contains('open'))$('#togglePresetDrawer')?.click()},30);setDock(k)}else if(k==='match'){legacyTab('tonematch');setDock(k)}else openSheet()};

    // Simplify labels inside the legacy editor to match SONICLINK wording.
    const observer=new MutationObserver(sync);
    const title=$('#stripPresetTitle'); if(title) observer.observe(title,{childList:true,subtree:true,characterData:true});
    const nav=$('.nav-tabs'); if(nav) observer.observe(nav,{attributes:true,subtree:true,attributeFilter:['class']});
    document.addEventListener('click', e=>{
      if(e.target.closest('.preset-card')) setTimeout(()=>{setDock('effects');sync()},60);
    },true);
    sync();
  }

  function setDock(k){$$('[data-sl6]').forEach(b=>b.classList.toggle('active',b.dataset.sl6===k))}
  function sync(){
    const n=$('#sl6PresetName'); if(n)n.textContent=presetName();
    const t=$('.nav-btn.active')?.dataset.tab;
    if(t==='library'&&!$('#presetBrowser')?.classList.contains('open'))setDock('effects');
    else if(t==='tonematch')setDock('match');
    else if(['performance','transfer','vault','generator','machine'].includes(t))setDock('more');
  }

  function init(){
    build();
    // app.js is async; resync once its first preset is ready.
    let tries=0;const timer=setInterval(()=>{sync();if(state?.current||++tries>30)clearInterval(timer)},180);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
