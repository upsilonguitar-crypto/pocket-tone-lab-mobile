/* Pocket Tone Lab Mobile offline API adapter.
 * Replaces the Flask endpoints with local in-app logic.
 * Native hardware I/O stays behind AndroidBridge + Hardware Guard.
 */
(() => {
  'use strict';
  const BOOT = window.PTL_BOOTSTRAP;
  const originalFetch = window.fetch.bind(window);
  const enc = new TextEncoder(), dec = new TextDecoder('ascii');
  const CATALOG = BOOT.officialCatalog;
  const modules = [...CATALOG.modules].sort((a,b)=>a.moduleId-b.moduleId);
  const byId = Object.fromEntries(modules.map(m=>[m.moduleId,m]));
  const byName = Object.fromEntries(modules.map(m=>[m.name,m]));
  const modelByFx = Object.fromEntries(modules.map(m=>[m.moduleId,Object.fromEntries(m.models.map(x=>[x.fxid,x]))]));
  const modelByName = Object.fromEntries(modules.map(m=>{const o={};for(const x of m.models){const k=x.name.toLowerCase();if(!(k in o))o[k]=x}return [m.name,o]}));
  const PARAM_ALIASES={'h-vol':'H-VOL','l-vol':'L-VOL','vol':'VOL','pres':'PRES','f.back':'F.Back'};
  const SAFE_RAW_DEFAULTS=[
    [0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0],[0,50,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,50,0,0,0,0,0,0],[50,50,50,50,50,0,0,0]
  ];
  const MAGIC = [...enc.encode('Pocket Master'),0,0,0,0,0];
  const FF_PAYLOAD=[1,0,4,0,2,0,0,0,2,0,4,0,0x0a,0x45,0x4d,0x51];
  const ZERO_PAYLOAD=[1,0x10,4,0,10,0,0,0,2,0x10,4,0,8,0,0,0,3,0x10,4,0,2,0,0,0];
  const THREE_PAYLOAD=new Array(8).fill(0);
  const clamp=(v,mn,mx)=>Math.max(mn,Math.min(mx,v));
  const deep=o=>JSON.parse(JSON.stringify(o));
  const normalizeParam=n=>PARAM_ALIASES[String(n).trim().toLowerCase()]||String(n).trim();
  const jsonResponse=(obj,status=200,headers={})=>new Response(JSON.stringify(obj),{status,headers:{'Content-Type':'application/json',...headers}});
  const toArrayBuffer=blob=>blob.arrayBuffer();
  function u16le(v){return [v&255,(v>>>8)&255]}
  function u32le(v){v=Number(v)>>>0;return [v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255]}
  function tlv(tag,payload){return [...u16le(tag),...u16le(payload.length),...payload]}
  function childU32(tag,v){return [...u16le(tag),4,0,...u32le(v)]}
  function f32le(v){const b=new ArrayBuffer(4);new DataView(b).setFloat32(0,Number(v),true);return [...new Uint8Array(b)]}
  function readU16(a,o){return a[o]|(a[o+1]<<8)}
  function readU32(a,o){return (a[o]|(a[o+1]<<8)|(a[o+2]<<16)|(a[o+3]<<24))>>>0}
  function readF32(a,o){return new DataView(a.buffer,a.byteOffset+o,4).getFloat32(0,true)}
  function parseTlvs(a,start=0,end=a.length){const out=[];let p=start;while(p+4<=end){const tag=readU16(a,p),ln=readU16(a,p+2);if(p+4+ln>end)break;out.push({tag,payload:a.slice(p+4,p+4+ln),offset:p});p+=4+ln}return out}
  function childMap(payload){return Object.fromEntries(parseTlvs(payload).map(x=>[x.tag,x.payload]))}
  function crc8(a){let crc=0;for(const byte of a){crc^=byte;for(let i=0;i<8;i++)crc=(crc&0x80)?(((crc<<1)^0x07)&255):((crc<<1)&255)}return crc}
  function safeName(raw){let s=String(raw||'PRESET').toUpperCase().split('').filter(c=>{const x=c.charCodeAt(0);return x>=32&&x<127}).join('').trim();return (s||'PRESET').slice(0,10)}
  function findModel(moduleName,modelName){const meta=byName[moduleName];if(!meta)throw new Error(`Module inconnu: ${moduleName}`);if(!modelName)return meta.models[0];const d=modelByName[moduleName][String(modelName).toLowerCase()];if(d)return d;const norm=s=>String(s).toLowerCase().replace(/[^a-z0-9]/g,'');const hits=meta.models.filter(x=>norm(x.name)===norm(modelName));if(hits.length===1)return hits[0];throw new Error(`Modèle non reconnu pour ${moduleName}: ${modelName}`)}
  function clampStep(value,spec){let x=Number(value);if(!Number.isFinite(x))x=Number(spec.default||0);const mn=Number(spec.min??0),mx=Number(spec.max??100),step=Number(spec.step||1);x=clamp(x,mn,mx);if(step>0)x=Math.round((x-mn)/step)*step+mn;return clamp(x,mn,mx)}
  function inspectPrst(buf){
    const a=new Uint8Array(buf);if(a.length!==515)throw new Error(`Taille .prst inattendue: ${a.length} octets (attendu 515)`);
    const sig=dec.decode(a.slice(0,13));if(sig!=='Pocket Master')throw new Error('Signature Pocket Master absente');
    const version=readU16(a,18),stored=a[20],calc=crc8(a.slice(21));
    const name=dec.decode(a.slice(25,41)).split('\0')[0];
    const top=Object.fromEntries(parseTlvs(a,41).map(x=>[x.tag,x.payload]));if(!top[1]||!top[2])throw new Error('Sections de preset manquantes');
    const g=childMap(top[1]),p=childMap(top[2]);const volume=readU32(g[0x2001],0),bpm=readU32(g[0x2002],0),mask=readU32(p[0x3001],0);
    const chain=[...p[0x3002]],fxRaw=p[0x3003],paramRaw=p[0x3004];if(fxRaw.length!==40||paramRaw.length!==320)throw new Error('Tables natives invalides');
    const fxids=Array.from({length:10},(_,i)=>readU32(fxRaw,i*4));const mods=[],warnings=[];
    for(let mid=0;mid<10;mid++){
      const meta=byId[mid],fxid=fxids[mid],model=modelByFx[mid]?.[fxid],vals=Array.from({length:8},(_,i)=>readF32(paramRaw,(mid*8+i)*4));
      const entry={moduleId:mid,module:meta?.name||`M${mid}`,enabled:!!(mask&(1<<mid)),fxid,model:model?.name||null,params:{},rawParams:vals.map(v=>Number(v.toFixed(6)))};
      if(model){for(const s of model.params||[]){const v=vals[Number(s.algId)];entry.params[s.name]=Number.isInteger(v)?Math.round(v):Number(v.toFixed(4))}}else warnings.push(`FXID inconnu module ${mid}: ${fxid}`);mods.push(entry)
    }
    return {format:'Pocket Master native .prst',size:a.length,version,crcStored:stored,crcCalculated:calc.toString(16).padStart(2,'0').toUpperCase(),crcValid:stored===calc,name,presetVolume:volume,presetBPM:bpm,enabledMask:mask,chainIds:chain,chain:chain.map(i=>byId[i]?.name||`M${i}`),modules:mods,warnings};
  }
  function prstToEditor(buf){const i=inspectPrst(buf),m={};for(const x of i.modules){if(x.module==='Clone')continue;m[x.module]={enabled:x.enabled,model:x.model||'Unknown',params:deep(x.params)}}const chain=i.chain.filter(n=>n!=='Clone'&&m[n]);return {preset:{id:'imported-prst',name:i.name||'Imported PRST',artist:'Native .prst',genre:'Imported',variant:'Custom',era:'',description:'Preset importé depuis un fichier natif SONICAKE Pocket Master .prst.',pickup:'Choose to taste',match:100,preset_vol:i.presetVolume,preset_bpm:i.presetBPM,chain,modules:m,tips:'Import natif .prst. Vérifie le son avant toute sauvegarde matérielle.',native:{crcValid:i.crcValid,sourceName:i.name}},inspection:i}}
  function encodePrst(preset,name,bpm){
    const editorModules=preset.modules||{}, editorChain=preset.chain||['NR','FX1','DRV','AMP','IR','EQ','FX2','DLY','RVB'];let chainNames=editorChain.filter(x=>byName[x]&&x!=='Clone');if(!chainNames.includes('Clone'))chainNames.push('Clone');const seen=new Set(chainNames);for(const m of modules)if(!seen.has(m.name)){chainNames.push(m.name);seen.add(m.name)}chainNames=chainNames.slice(0,10);const chainIds=chainNames.map(n=>byName[n].moduleId);
    let mask=0;const fxids=new Array(10).fill(0),params=SAFE_RAW_DEFAULTS.map(r=>r.slice());
    for(const meta of modules){const mid=meta.moduleId,moduleName=meta.name;const block=moduleName==='Clone'?(preset.native_clone||{}):(editorModules[moduleName]||{});const model=findModel(moduleName,block.model||meta.models[0].name);fxids[mid]=Number(model.fxid)>>>0;if(block.enabled)mask|=(1<<mid);const norm={};for(const [k,v] of Object.entries(block.params||{}))norm[normalizeParam(k).toLowerCase()]=v;for(const s of model.params||[]){const aid=Number(s.algId);if(aid<0||aid>=8)continue;const key=normalizeParam(s.name).toLowerCase();params[mid][aid]=clampStep(Object.prototype.hasOwnProperty.call(norm,key)?norm[key]:s.default,s)}}
    const vol=clamp(Math.round(Number(preset.preset_vol??preset.presetVolume??60)),0,127),bp=clamp(Math.round(Number(bpm??preset.preset_bpm??preset.presetBPM??120)),40,300);
    const s1=[...childU32(0x2001,vol),...childU32(0x2002,bp)];const fx=fxids.flatMap(u32le),flat=params.flat(),pr=flat.flatMap(f32le);const s2=[...childU32(0x3001,mask),...tlv(0x3002,chainIds),...tlv(0x3003,fx),...tlv(0x3004,pr)];
    const nm=safeName(name||preset.name),nameBytes=[...enc.encode(nm)].slice(0,16);while(nameBytes.length<16)nameBytes.push(0);
    const body=[255,255,255,255,...nameBytes,...tlv(0x00ff,FF_PAYLOAD),...tlv(0x0000,ZERO_PAYLOAD),...tlv(0x0001,s1),...tlv(0x0002,s2),...tlv(0x0003,THREE_PAYLOAD)];const out=new Uint8Array([...MAGIC,2,0,0,...body]);if(out.length!==515)throw new Error(`Encodeur .prst: taille ${out.length}`);out[20]=crc8(out.slice(21));const check=inspectPrst(out.buffer);if(!check.crcValid)throw new Error('Auto-vérification .prst échouée');return {bytes:out,name:nm,inspection:check}
  }
  function compactDeviceName(name,max=10){let t=String(name||'PRESET').replace(/[^A-Za-z0-9]+/g,' ').trim().toUpperCase();if(t.length<=max)return t||'PRESET';const w=t.split(/\s+/);if(w.length>=2){const c=w.slice(0,3).map(x=>x.slice(0,3)).join('');if(c)return c.slice(0,max)}return t.replace(/ /g,'').slice(0,max)||'PRESET'}
  const NAME_MAP={'Brit50 JP':'Brit 50JP','Sol100OD':'Sol 100 OD','DizzyVH':'Dizzy VH','Eng120':'Eng 120','Halen51':'Halen 51','Sol100LD':'Sol 100 LD','CalifDualV':'Calif DualV','CalifDualM':'Calif DualM','EngPower':'Eng Power','FlymanB1+':'Flyman B1+','BogXT':'Bog XT','AC Sim':'AC G'};
  const PARAM_MAP={'VOL':'Vol','PRES':'Pres','Clipping':'Clip','H-VOL':'H-Vol','L-VOL':'L-Vol'}, OPT={'Off':0,'On':1,'Guitar':0,'Bass':1,'Cool':0,'Hot':1,'Standard':0,'Jumbo':1,'Enhanced':2,'Piezo':3,'220Hz':0,'450Hz':1,'800Hz':2,'1.6kHz':3,'3kHz':4};
  const MODULE_NAMES=['NR','FX1','DRV','AMP','IR','EQ','FX2','DLY','RVB'], FIXED=['DRV','AMP','IR','EQ'];
  function normalizeChain(chain){let a=(chain||MODULE_NAMES).filter(x=>MODULE_NAMES.includes(x));a=[...new Set(a)];for(const m of MODULE_NAMES)if(!a.includes(m))a.push(m);const first=Math.min(...FIXED.map(m=>a.indexOf(m)));const mov=a.filter(m=>!FIXED.includes(m)),before=mov.filter(m=>a.indexOf(m)<first),after=mov.filter(m=>a.indexOf(m)>=first);return [...before,...FIXED,...after]}
  function toPocketEdit(preset,deviceName){const ms={};for(const m of MODULE_NAMES){const src=preset.modules?.[m]||{enabled:false,model:null,params:{}};const pars={};for(const [k,v] of Object.entries(src.params||{})){const ok=PARAM_MAP[k]||k;if(ok==='Dry/Wet'){pars.Wet=OPT[v]??v;if(typeof v==='number')pars.Dry=clamp(100-v,0,100)}else pars[ok]=OPT[v]??v}ms[m]={enabled:!!src.enabled,effect:src.model?NAME_MAP[src.model]||src.model:null,parameters:pars}}const full=preset.name||'Pocket Tone';return {version:'1.0',presetName:compactDeviceName(deviceName||full),description:`Pocket Tone Lab: ${full}`,ampMode:'Normal',presetVolume:clamp(parseInt(preset.preset_vol??75,10),0,127),modules:ms,signalChain:normalizeChain(preset.chain),metadata:{createdDate:new Date().toISOString().slice(0,10),author:'Pocket Tone Lab Mobile',tags:(preset.tags||[]).map(String).slice(0,12),sourcePresetName:full,compatibility:'PocketEdit JSON v1.0'}}}
  function generate(cfg){const base=deep(BOOT.presets.find(p=>p.id===cfg.base_id)||BOOT.presets[0]);const ag=+cfg.aggression||50,am=+cfg.ambience||50,br=+cfg.brightness||50,wa=+cfg.warmth||50,ti=+cfg.tightness||50,su=+cfg.sustain||50;const amp=base.modules.AMP;for(const k of ['Gain','Gain 1','Gain 2'])if(k in amp.params)amp.params[k]=clamp(amp.params[k]+Math.round((ag-50)*.28),0,100);for(const k of ['Treble','Tone','PRES'])if(typeof amp.params[k]==='number')amp.params[k]=clamp(amp.params[k]+Math.round((br-50)*.2),0,100);if(typeof amp.params.Bass==='number')amp.params.Bass=clamp(amp.params.Bass+Math.round((wa-50)*.18)-Math.round((ti-50)*.16),0,100);if(typeof amp.params.Middle==='number')amp.params.Middle=clamp(amp.params.Middle+Math.round((wa-50)*.12)+Math.round((ti-50)*.08),0,100);const drv=base.modules.DRV;if(drv?.enabled){if('Gain'in drv.params)drv.params.Gain=clamp(drv.params.Gain+Math.round((su-50)*.18),0,100);if('Tone'in drv.params)drv.params.Tone=clamp(drv.params.Tone+Math.round((ti-50)*.1),0,100)}const d=base.modules.DLY,r=base.modules.RVB;d.enabled=am>22;if('Mix'in d.params)d.params.Mix=clamp(Math.round(am*.34),0,45);if('F.Back'in d.params)d.params['F.Back']=clamp(Math.round(am*.4),5,50);if('Mix'in r.params)r.params.Mix=clamp(Math.round(am*.3),5,40);if('Decay'in r.params)r.params.Decay=clamp(Math.round(am*.52),10,70);base.name+=' · Custom';base.id='generated';base.pickup=cfg.pickup||base.pickup;base.variant='Custom';base.tips=`Generated. Aggression ${ag}, ambience ${am}, brightness ${br}, warmth ${wa}, tightness ${ti}, sustain ${su}.`;return base}
  function toneHealth(p){const m=p.modules||{},get=(b,k,d=null)=>{const v=m[b]?.params?.[k];const n=Number(v??d);return Number.isFinite(n)?n:d};let score=100,f=[];const ampGain=['Gain','Gain 1','Gain 2'].map(k=>get('AMP',k)).find(v=>v!=null),ampVol=get('AMP','VOL'),drv=m.DRV||{},drvGain=get('DRV','Gain'),drvVol=get('DRV','VOL'),pv=Number(p.preset_vol||60),dm=get('DLY','Mix',0)||0,rm=get('RVB','Mix',0)||0;if(drv.enabled&&drvGain>75&&ampGain>75){score-=14;f.push({level:'warn',title:'Gain staging très chargé',text:'Drive et ampli ont tous les deux beaucoup de gain.'})}if(ampVol>90){score-=8;f.push({level:'warn',title:'Volume AMP élevé',text:'Le volume d’ampli dépasse 90.'})}if(drv.enabled&&drvVol>90){score-=7;f.push({level:'warn',title:'Boost de drive élevé',text:'Le niveau de sortie du drive est très haut.'})}if(pv>110){score-=10;f.push({level:'warn',title:'Preset VOL très élevé',text:'Le volume global dépasse 110/127.'})}if(dm+rm>85){score-=10;f.push({level:'info',title:'Ambiance très dense',text:'Delay + reverb occupent beaucoup d’espace.'})}if(!f.length)f.push({level:'good',title:'Chaîne équilibrée',text:'Aucun problème évident détecté dans les réglages.'});return {score:clamp(score,0,100),findings:f,note:'Analyse de réglages uniquement : aucun niveau audio réel n’est mesuré.'}}
  async function upstreamProtocol(force=false){
    const key='ptl-mobile-protocol-v1',ttl=7*24*3600*1000;try{const c=JSON.parse(localStorage.getItem(key)||'null');if(c&&!force&&(Date.now()-c.fetched_at)<ttl)return {...c,cache:'hit'}}catch{}
    const url='https://raw.githubusercontent.com/SuckyBle/PocketEdit/refs/heads/main/index.html';
    const extract=(text,name)=>{const marker=`const ${name} =`;let s=text.indexOf(marker);if(s<0)throw new Error(`${name} absent`);s=text.indexOf('{',s+marker.length);let depth=0,str=false,esc=false,q='',e=-1;for(let i=s;i<text.length;i++){const ch=text[i];if(str){if(esc)esc=false;else if(ch==='\\')esc=true;else if(ch===q)str=false;continue}if(ch==='"'||ch==="'"){str=true;q=ch}else if(ch==='{')depth++;else if(ch==='}'&&--depth===0){e=i+1;break}}if(e<0)throw new Error(`${name} incomplet`);return JSON.parse(text.slice(s,e))};
    try{const r=await originalFetch(url,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const txt=await r.text(),payload={fetched_at:Date.now(),source:url,source_project:'PocketEdit',definitions:extract(txt,'MODULE_LIBRARY_DATA'),commands:extract(txt,'COMMAND_LIBRARY_DATA'),cache:'refreshed'};localStorage.setItem(key,JSON.stringify(payload));return payload}catch(e){try{const c=JSON.parse(localStorage.getItem(key)||'null');if(c)return {...c,cache:'stale-fallback'}}catch{}throw e}
  }
  window.PTLMobileCodec={inspectPrst,prstToEditor,encodePrst,compactDeviceName,toPocketEdit,toneHealth};
  window.fetch=async function(input,init={}){
    const url=typeof input==='string'?input:input.url||'';if(!url.startsWith('/api/'))return originalFetch(input,init);
    try{
      if(url.startsWith('/api/meta'))return jsonResponse(BOOT.meta);
      if(url.startsWith('/api/effects'))return jsonResponse(BOOT.effects);
      if(url.startsWith('/api/presets'))return jsonResponse(BOOT.presets);
      if(url.startsWith('/api/official-catalog'))return jsonResponse(BOOT.officialCatalog);
      if(url.startsWith('/api/protocol'))return jsonResponse(await upstreamProtocol(url.includes('refresh=1')));
      const parseBody=()=>{try{return JSON.parse(init.body||'{}')}catch{return {}}};
      if(url==='/api/generate')return jsonResponse(generate(parseBody()));
      if(url==='/api/device-name')return jsonResponse({device_name:compactDeviceName(parseBody().name)});
      if(url==='/api/export/pocketedit'){const b=parseBody();return jsonResponse(toPocketEdit(b.preset,b.device_name))}
      if(url==='/api/analyze/tone-health')return jsonResponse(toneHealth(parseBody()));
      if(url==='/api/prst/import'||url==='/api/prst/inspect'){
        const fd=init.body,file=fd?.get?.('file');if(!file)return jsonResponse({error:'Fichier .prst manquant'},400);const buf=await file.arrayBuffer();const info=prstToEditor(buf);return jsonResponse(url.endsWith('inspect')?info.inspection:info);
      }
      if(url==='/api/prst/export'){
        const b=parseBody(),res=encodePrst(b.preset,b.device_name,b.bpm);const blob=new Blob([res.bytes],{type:'application/octet-stream'});return new Response(blob,{status:200,headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${res.name}.prst"`}})
      }
      return jsonResponse({error:`Endpoint mobile inconnu: ${url}`},404);
    }catch(e){console.error('Mobile API',url,e);return jsonResponse({error:e.message||String(e)},400)}
  };
})();
