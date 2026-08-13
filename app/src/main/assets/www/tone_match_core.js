/* Pocket Tone Lab — Tone Match DSP analysis core.
 * Pure JS / offline. No audio leaves the device.
 * UMD-style so the core can be unit-tested with Node and reused by the WebView UI.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PTLToneMatchCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const EPS=1e-12;
  const BAND_DEFS=[
    {id:'bass',label:'BASS',lo:80,hi:250,center:145},
    {id:'lowMid',label:'LOW MID',lo:250,hi:500,center:354},
    {id:'mid',label:'MID',lo:500,hi:1600,center:894},
    {id:'highMid',label:'HIGH MID',lo:1600,hi:3500,center:2366},
    {id:'presence',label:'PRESENCE',lo:3500,hi:6500,center:4769},
    {id:'air',label:'AIR',lo:6500,hi:10000,center:8062}
  ];
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const round=(v,n=2)=>Number(Number(v).toFixed(n));
  const db=x=>20*Math.log10(Math.max(EPS,x));
  const dbPower=x=>10*Math.log10(Math.max(EPS,x));
  const deep=o=>JSON.parse(JSON.stringify(o));

  function nextPow2(n){let p=1;while(p<n)p<<=1;return p}
  function fft(re,im){
    const n=re.length;
    for(let i=1,j=0;i<n;i++){
      let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;
      if(i<j){let t=re[i];re[i]=re[j];re[j]=t;t=im[i];im[i]=im[j];im[j]=t}
    }
    for(let len=2;len<=n;len<<=1){
      const ang=-2*Math.PI/len,wr0=Math.cos(ang),wi0=Math.sin(ang);
      for(let i=0;i<n;i+=len){
        let wr=1,wi=0;const half=len>>1;
        for(let j=0;j<half;j++){
          const u=i+j,v=i+j+half;
          const tr=wr*re[v]-wi*im[v],ti=wr*im[v]+wi*re[v];
          re[v]=re[u]-tr;im[v]=im[u]-ti;re[u]+=tr;im[u]+=ti;
          const nwr=wr*wr0-wi*wi0;wi=wr*wi0+wi*wr0;wr=nwr;
        }
      }
    }
  }

  function hannWindow(n){const w=new Float64Array(n);for(let i=0;i<n;i++)w[i]=0.5-0.5*Math.cos(2*Math.PI*i/(n-1));return w}

  function sanitizeSamples(input){
    if(input instanceof Float32Array)return input;
    if(Array.isArray(input))return Float32Array.from(input);
    if(ArrayBuffer.isView(input))return new Float32Array(input.buffer,input.byteOffset,Math.floor(input.byteLength/4));
    throw new Error('PCM invalide');
  }

  function analyzePCM(input,sampleRate,opts={}){
    const samples=sanitizeSamples(input),sr=Number(sampleRate)||44100;
    if(samples.length<Math.min(sr*0.4,4096))throw new Error('Extrait audio trop court');
    const n=nextPow2(clamp(Number(opts.fftSize)||2048,512,4096));
    const hop=Math.max(128,Math.floor(n/2)),duration=samples.length/sr;
    const maxFrames=clamp(Number(opts.maxFrames)||140,30,260);
    let sq=0,peak=0,zcr=0,prev=samples[0]||0;
    const stride=Math.max(1,Math.floor(samples.length/600000));
    let count=0;
    for(let i=0;i<samples.length;i+=stride){const x=samples[i]||0;sq+=x*x;peak=Math.max(peak,Math.abs(x));if((x>=0)!=(prev>=0))zcr++;prev=x;count++}
    const rms=Math.sqrt(sq/Math.max(1,count)),rmsDb=db(rms),peakDb=db(peak),crestDb=20*Math.log10(Math.max(EPS,peak)/Math.max(EPS,rms));
    if(rmsDb<-70)throw new Error('Signal audio trop faible pour être analysé');

    const window=hannWindow(n),totalFrames=Math.max(1,Math.floor((samples.length-n)/hop)+1),frameStep=Math.max(1,Math.ceil(totalFrames/maxFrames));
    const bandPower=Object.fromEntries(BAND_DEFS.map(b=>[b.id,0]));
    let totalPower=0,centroidSum=0,rolloffSum=0,flatnessSum=0,fluxSum=0,frames=0;
    let prevMag=null;
    const nyq=sr/2,binHz=sr/n,maxBin=Math.min(n>>1,Math.floor(12000/binHz));
    for(let fi=0;fi<totalFrames;fi+=frameStep){
      const start=fi*hop;if(start+n>samples.length)break;
      let frameSq=0;const re=new Float64Array(n),im=new Float64Array(n);
      for(let i=0;i<n;i++){const x=(samples[start+i]||0)*window[i];re[i]=x;frameSq+=x*x}
      const frameRms=Math.sqrt(frameSq/n);if(frameRms<Math.max(1e-6,rms*0.08))continue;
      fft(re,im);
      const mags=new Float64Array(maxBin+1);let pwr=0,centNum=0,logSum=0,magMean=0;
      for(let k=Math.max(1,Math.ceil(80/binHz));k<=maxBin;k++){
        const mag=Math.hypot(re[k],im[k]),power=mag*mag;mags[k]=mag;pwr+=power;centNum+=(k*binHz)*power;logSum+=Math.log(mag+EPS);magMean+=mag;
        for(const b of BAND_DEFS)if(k*binHz>=b.lo&&k*binHz<b.hi){bandPower[b.id]+=power;break}
      }
      if(pwr<EPS)continue;
      totalPower+=pwr;centroidSum+=centNum/pwr;
      let cum=0,roll=0;for(let k=1;k<=maxBin;k++){cum+=mags[k]*mags[k];if(!roll&&cum>=pwr*0.85)roll=k*binHz}rolloffSum+=roll||maxBin*binHz;
      const bins=Math.max(1,maxBin-Math.ceil(80/binHz)+1),geo=Math.exp(logSum/bins),arith=magMean/bins;flatnessSum+=clamp(geo/Math.max(EPS,arith),0,1);
      if(prevMag){let diff=0,norm=0;for(let k=1;k<=maxBin;k++){const d=mags[k]-prevMag[k];if(d>0)diff+=d;norm+=mags[k]}fluxSum+=diff/Math.max(EPS,norm)}
      prevMag=mags;frames++;
    }
    if(frames<3)throw new Error('Pas assez de signal exploitable dans cet extrait');

    const bands={};for(const b of BAND_DEFS)bands[b.id]=round(dbPower(bandPower[b.id]/Math.max(EPS,totalPower)),2);
    const centroid=centroidSum/frames,rolloff=rolloffSum/frames,flatness=flatnessSum/frames,flux=frames>1?fluxSum/(frames-1):0;
    const brightness=clamp((centroid-650)/(4800-650)*100,0,100);
    const body=clamp(62 + (bands.bass+bands.lowMid)*1.05,0,100);
    const presence=clamp(70 + (bands.highMid*0.55+bands.presence*0.85),0,100);
    const drive=clamp(76-(crestDb*4.1)+(flatness*42)+(brightness*0.08),0,100);
    const space=clamp(30+(1-clamp(flux*5,0,1))*28+(clamp(10-crestDb,-4,6)*2.2),0,100);
    const zcrRate=zcr/Math.max(1,count);
    return {
      sampleRate:sr,duration:round(duration,2),rmsDb:round(rmsDb,2),peakDb:round(peakDb,2),crestDb:round(crestDb,2),
      centroidHz:round(centroid,0),rolloffHz:round(rolloff,0),flatness:round(flatness,4),flux:round(flux,4),zcr:round(zcrRate,4),
      bands,brightness:round(brightness,1),body:round(body,1),presence:round(presence,1),drive:round(drive,1),space:round(space,1),frames
    };
  }

  function focusWeights(mode){
    if(mode==='mix')return {bass:.45,lowMid:.75,mid:1.2,highMid:1.35,presence:1.15,air:.35,loudness:0,space:.35};
    if(mode==='rhythm')return {bass:.8,lowMid:1,mid:1.15,highMid:1.25,presence:.85,air:.25,loudness:.45,space:.45};
    return {bass:.8,lowMid:1,mid:1.1,highMid:1.2,presence:1,air:.55,loudness:.7,space:.55};
  }

  function similarity(target,source,mode='isolated'){
    const w=focusWeights(mode);let err=0,weight=0;
    for(const b of BAND_DEFS){const d=(target.bands[b.id]??-60)-(source.bands[b.id]??-60);err+=Math.abs(d)*w[b.id];weight+=w[b.id]}
    const spectral=err/Math.max(EPS,weight);
    const cent=Math.abs(Math.log2(Math.max(100,target.centroidHz)/Math.max(100,source.centroidHz)))*13;
    const crest=Math.abs(target.crestDb-source.crestDb)*1.7;
    const loud=w.loudness?Math.abs(target.rmsDb-source.rmsDb)*w.loudness:0;
    return Math.round(clamp(100-(spectral*5.2+cent+crest+loud),0,100));
  }

  function matchProfiles(target,source,opts={}){
    if(!target||!source)throw new Error('Deux analyses audio sont nécessaires');
    const mode=opts.focus||'isolated',w=focusWeights(mode),d={};
    for(const b of BAND_DEFS)d[b.id]=round(clamp((target.bands[b.id]??-60)-(source.bands[b.id]??-60),-12,12),2);
    const bassAdj=clamp((d.bass*.68+d.lowMid*.32)*1.1,-11,11);
    const midAdj=clamp((d.lowMid*.18+d.mid*.67+d.highMid*.15)*1.05,-11,11);
    const trebleAdj=clamp((d.highMid*.72+d.presence*.28)*1.05,-11,11);
    const presenceAdj=clamp((d.presence*.82+d.air*.18)*.95,-9,9);
    const driveAdj=clamp((target.drive-source.drive)*.13,-8,8);
    const spaceAdj=clamp((target.space-source.space)*.08*w.space,-5.5,5.5);
    const volumeAdj=w.loudness?clamp((target.rmsDb-source.rmsDb)*.7,-8,8):0;
    const before=similarity(target,source,mode);
    const durationFactor=clamp(Math.min(target.duration,source.duration)/8,0.45,1);
    const signalFactor=clamp((Math.min(target.rmsDb,source.rmsDb)+55)/35,.35,1);
    const confidence=Math.round(clamp((72+durationFactor*18+signalFactor*10)-(mode==='mix'?12:0),35,100));
    return {
      mode,beforeScore:before,confidence,bandDelta:d,
      metrics:{
        brightness:round(target.brightness-source.brightness,1),body:round(target.body-source.body,1),presence:round(target.presence-source.presence,1),
        drive:round(target.drive-source.drive,1),space:round(target.space-source.space,1),loudnessDb:round(target.rmsDb-source.rmsDb,1)
      },
      adjustments:{bass:round(bassAdj,1),mid:round(midAdj,1),treble:round(trebleAdj,1),presence:round(presenceAdj,1),gain:round(driveAdj,1),space:round(spaceAdj,1),presetVolume:round(volumeAdj,1)},
      note:mode==='mix'?'Mode MIX : le volume global n’est pas aligné car la référence contient d’autres instruments.':'Analyse comparative spectrale + dynamique. Aucun modèle AMP/DRV n’est remplacé automatiquement.'
    };
  }

  function clampParam(name,v,current){
    const n=String(name||'').toLowerCase();
    if(/hz|db/.test(n)&&current>=-24&&current<=24)return clamp(v,-24,24);
    if(/time|ms/.test(n))return clamp(v,1,4000);
    return clamp(v,0,100);
  }
  function addParam(block,names,delta){
    if(!block||!block.params)return false;
    for(const name of names){if(typeof block.params[name]==='number'){const cur=block.params[name];block.params[name]=round(clampParam(name,cur+delta,cur),2);return true}}
    const lower=Object.fromEntries(Object.keys(block.params).map(k=>[k.toLowerCase(),k]));
    for(const name of names){const key=lower[String(name).toLowerCase()];if(key&&typeof block.params[key]==='number'){const cur=block.params[key];block.params[key]=round(clampParam(key,cur+delta,cur),2);return true}}
    return false;
  }
  function eqFrequencyFromName(name){const s=String(name).toLowerCase().replace(',','.');let m=s.match(/([0-9]+(?:\.[0-9]+)?)\s*k(?:hz)?/);if(m)return Number(m[1])*1000;m=s.match(/([0-9]+(?:\.[0-9]+)?)\s*hz/);return m?Number(m[1]):null}
  function correctionAtFrequency(freq,a){
    const pts=[[120,a.bass],[350,(a.bass+a.mid)/2],[900,a.mid],[2400,a.treble],[4800,a.presence],[8000,a.presence*.45]];
    const x=Math.log(Math.max(50,freq));for(let i=1;i<pts.length;i++){if(freq<=pts[i][0]){const x0=Math.log(pts[i-1][0]),x1=Math.log(pts[i][0]),t=clamp((x-x0)/(x1-x0),0,1);return pts[i-1][1]+(pts[i][1]-pts[i-1][1])*t}}return pts[pts.length-1][1]
  }

  function applyMatchToPreset(preset,match,strength=70){
    if(!preset)throw new Error('Aucun preset courant');if(!match?.adjustments)throw new Error('Résultat Tone Match invalide');
    const out=deep(preset),s=clamp(Number(strength)||70,0,100)/100,a=Object.fromEntries(Object.entries(match.adjustments).map(([k,v])=>[k,Number(v)*s]));
    const mods=out.modules||{},amp=mods.AMP,drv=mods.DRV,eq=mods.EQ,dly=mods.DLY,rvb=mods.RVB;
    const changes=[];
    const change=(block,names,delta,label)=>{if(Math.abs(delta)<.25)return;if(addParam(block,names,delta))changes.push({target:label,delta:round(delta,1)})};
    change(amp,['Bass','BASS'],a.bass,'AMP Bass');
    change(amp,['Middle','Mid','MIDDLE','MID'],a.mid,'AMP Mid');
    change(amp,['Treble','TREBLE','Tone'],a.treble,'AMP Treble');
    change(amp,['PRES','Pres','Presence'],a.presence,'AMP Presence');
    change(amp,['Gain','Gain 1','Gain1'],a.gain,'AMP Gain');
    if(drv?.enabled){change(drv,['Tone','Treble'],a.treble*.32,'DRV Tone');change(drv,['Gain'],a.gain*.45,'DRV Gain')}
    if(eq?.enabled&&eq.params){for(const [k,v] of Object.entries(eq.params)){if(typeof v!=='number')continue;const f=eqFrequencyFromName(k);if(!f)continue;const delta=correctionAtFrequency(f,a)*.55;if(Math.abs(delta)>=.25){eq.params[k]=round(clampParam(k,v+delta,v),2);changes.push({target:`EQ ${k}`,delta:round(delta,1)})}}}
    if(rvb?.enabled)change(rvb,['Mix','Wet'],a.space,'RVB Mix');
    if(dly?.enabled)change(dly,['Mix','Wet'],a.space*.55,'DLY Mix');
    const pv=Number(out.preset_vol??out.presetVolume??60);if(Number.isFinite(pv)&&Math.abs(a.presetVolume)>=.25){out.preset_vol=Math.round(clamp(pv+a.presetVolume*1.4,0,127));changes.push({target:'Preset VOL',delta:round(out.preset_vol-pv,1)})}
    out.name=`${String(preset.name||'Preset').replace(/\s·\sMATCH.*$/i,'')} · MATCH`;
    out.id=`tonematch-${Date.now()}`;out.variant='Tone Match';out.match=Math.max(Number(preset.match||0),match.beforeScore);
    out.description=`Tone Match local à ${Math.round(s*100)}% depuis “${preset.name||'Preset'}”.`;
    out.tips=`Tone Match · score audio initial ${match.beforeScore}/100 · confiance ${match.confidence}% · ${match.note}`;
    out.tone_match={createdAt:new Date().toISOString(),strength:Math.round(s*100),beforeScore:match.beforeScore,confidence:match.confidence,mode:match.mode,metrics:match.metrics,bandDelta:match.bandDelta,adjustments:match.adjustments,appliedChanges:changes};
    return {preset:out,changes};
  }

  function summarizeChanges(match,strength=70){
    const s=clamp(Number(strength)||70,0,100)/100,a=match.adjustments||{};
    const rows=[['BASS',a.bass],['MID',a.mid],['TREBLE',a.treble],['PRESENCE',a.presence],['GAIN',a.gain],['SPACE',a.space],['PRESET VOL',a.presetVolume]];
    return rows.map(([label,v])=>({label,delta:round(Number(v||0)*s,1)})).filter(x=>Math.abs(x.delta)>=.2);
  }

  return {BAND_DEFS,analyzePCM,matchProfiles,similarity,applyMatchToPreset,summarizeChanges,clamp};
});
