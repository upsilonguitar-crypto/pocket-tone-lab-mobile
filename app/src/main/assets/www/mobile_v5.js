(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const isMobile = () => matchMedia('(max-width:900px)').matches || !!window.AndroidBridge;
  if (!isMobile()) return;

  function clickLegacyTab(tab){
    const btn = $(`.nav-btn[data-tab="${tab}"]`);
    if(btn) btn.click();
  }

  const dockDefs = [
    {key:'tone', icon:'◉', label:'TONE', tab:'library'},
    {key:'presets', icon:'▦', label:'PRESETS'},
    {key:'match', icon:'◎', label:'MATCH', tab:'tonematch'},
    {key:'live', icon:'▶', label:'LIVE', tab:'performance'},
    {key:'tools', icon:'•••', label:'TOOLS'}
  ];

  function buildChrome(){
    document.body.classList.add('ptl-v5');

    const bar=document.createElement('header');
    bar.className='v5-appbar';
    bar.innerHTML=`
      <div class="v5-brandmark"><img src="soniclink/app_logo.svg" alt="Pocket Tone Lab"></div>
      <div class="v5-appbar-copy"><small id="v5Section">TONE STUDIO</small><b id="v5PresetName">Pocket Master</b></div>
      <button id="v5Status" class="v5-status" type="button"><i></i><span id="v5StatusText">OFFLINE</span></button>`;
    document.body.appendChild(bar);

    const dock=document.createElement('nav');
    dock.className='v5-dock';
    dock.setAttribute('aria-label','Navigation principale');
    dock.innerHTML=dockDefs.map(d=>`<button type="button" data-v5-nav="${d.key}"><span class="v5-icon">${d.icon}</span><span>${d.label}</span></button>`).join('');
    document.body.appendChild(dock);

    const backdrop=document.createElement('div');backdrop.className='v5-sheet-backdrop';document.body.appendChild(backdrop);
    const sheet=document.createElement('section');sheet.className='v5-tools-sheet';sheet.innerHTML=`
      <div class="v5-sheet-grab"></div>
      <div class="v5-tools-head"><div><b>Outils</b><span>Fonctions avancées</span></div><button class="ghost-btn" id="v5ToolsClose">Fermer</button></div>
      <div class="v5-tools-grid">
        <button class="v5-tool" data-v5-tool="generator"><span>✦</span><div><b>Générateur</b><small>Macros de tonalité et variantes.</small></div></button>
        <button class="v5-tool" data-v5-tool="vault"><span>▣</span><div><b>Vault</b><small>.prst, snapshots, setlists, santé.</small></div></button>
        <button class="v5-tool" data-v5-tool="transfer"><span>⇪</span><div><b>Pocket Master</b><small>USB MIDI, Guard, backup et envoi.</small></div></button>
        <button class="v5-tool" data-v5-tool="machine"><span>⚙</span><div><b>Modèles</b><small>Catalogue AMP/DRV/FX et paramètres.</small></div></button>
      </div>`;document.body.appendChild(sheet);

    const closeSheet=()=>{sheet.classList.remove('open');backdrop.classList.remove('open')};
    const openSheet=()=>{sheet.classList.add('open');backdrop.classList.add('open')};
    $('#v5ToolsClose').onclick=closeSheet;backdrop.onclick=closeSheet;
    sheet.addEventListener('click',e=>{const b=e.target.closest('[data-v5-tool]');if(!b)return;clickLegacyTab(b.dataset.v5Tool);closeSheet()});

    dock.addEventListener('click',e=>{
      const b=e.target.closest('[data-v5-nav]');if(!b)return;
      const key=b.dataset.v5Nav;
      if(key==='tools'){openSheet();return}
      if(key==='presets'){
        clickLegacyTab('library');
        setTimeout(()=>$('#togglePresetDrawer')?.click(),20);
        setActive('presets');
        return;
      }
      const def=dockDefs.find(x=>x.key===key);if(def?.tab)clickLegacyTab(def.tab);
      setActive(key);
    });

    $('#v5Status').onclick=()=>clickLegacyTab('transfer');
    syncFromLegacy();
  }

  function setActive(key){
    $$('[data-v5-nav]').forEach(b=>b.classList.toggle('active',b.dataset.v5Nav===key));
    const names={tone:'TONE STUDIO',presets:'PRESET LIBRARY',match:'TONE MATCH',live:'LIVE CONTROL',tools:'TOOLS'};
    if($('#v5Section')) $('#v5Section').textContent=names[key]||'POCKET TONE LAB';
  }

  function tabToDock(tab){
    if(tab==='library')return 'tone';if(tab==='tonematch')return 'match';if(tab==='performance')return 'live';
    if(['generator','vault','transfer','machine'].includes(tab))return 'tools';return 'tone';
  }

  function syncFromLegacy(){
    const title=$('#stripPresetTitle')?.textContent?.trim();if(title&&$('#v5PresetName'))$('#v5PresetName').textContent=title;
    const connected=$('#studioDeviceText')?.textContent?.toLowerCase().includes('connect') && !$('#studioDeviceText')?.textContent?.toLowerCase().includes('non');
    $('#v5Status')?.classList.toggle('connected',!!connected);if($('#v5StatusText'))$('#v5StatusText').textContent=connected?'USB':'OFFLINE';
    const active=$('.nav-btn.active')?.dataset.tab||'library';setActive(tabToDock(active));
  }

  function observe(){
    ['#stripPresetTitle','#studioDeviceText'].forEach(sel=>{const n=$(sel);if(n)new MutationObserver(syncFromLegacy).observe(n,{childList:true,subtree:true,characterData:true})});
    const nav=$('.nav-tabs');if(nav)new MutationObserver(syncFromLegacy).observe(nav,{attributes:true,subtree:true,attributeFilter:['class']});
    document.addEventListener('click',e=>{
      if(e.target.closest('#togglePresetDrawer') && $('#presetBrowser')?.classList.contains('open')) setActive('presets');
      if(e.target.closest('.preset-card')) setTimeout(()=>setActive('tone'),50);
    },true);
  }

  function enhanceModuleScroll(){
    document.addEventListener('click',e=>{
      const node=e.target.closest('.chain-node');if(!node)return;
      setTimeout(()=>{
        const active=$('.module-card.editor-active');
        active?.scrollIntoView({behavior:'smooth',block:'nearest'});
        node.scrollIntoView({behavior:'smooth',inline:'center',block:'nearest'});
      },40);
    });
  }

  function init(){buildChrome();observe();enhanceModuleScroll();setTimeout(syncFromLegacy,550)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
