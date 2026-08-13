/* Pocket Tone Lab Mobile — Android MIDI bridge connector. */
class PocketMasterDirectConnector {
  constructor({onLog=()=>{},onStatus=()=>{}}={}) {
    this.onLog=onLog; this.onStatus=onStatus; this.devices=[]; this.definitions=null; this.commands=null;
    this.protocolMeta=null; this.connected=false; this.deviceIndex=-1; this.deviceName=null;
    this._ackResolve=null; this._midiBuffer=[]; this.delayMs=55; this.writeArmed=false; this.persistentArmed=false;
    window.__ptlMobileConnector=this;
  }
  setWriteArmed(value){this.writeArmed=!!value;if(!this.writeArmed)this.persistentArmed=false;try{window.AndroidBridge?.setWriteArmed(this.writeArmed)}catch{}}
  setPersistentArmed(value){this.persistentArmed=!!value&&this.writeArmed;try{window.AndroidBridge?.setPersistentArmed(this.persistentArmed)}catch{}}
  log(message,type='info'){this.onLog({message,type,at:new Date()})}
  status(extra={}){this.onStatus({connected:this.connected,name:this.deviceName||null,...extra})}
  async loadProtocol(force=false){
    if(this.definitions&&this.commands&&!force)return;
    this.log('Chargement du protocole Pocket Master…');
    const response=await fetch(`/api/protocol${force?'?refresh=1':''}`),data=await response.json();
    if(!response.ok)throw new Error(data.detail||data.error||'Protocole indisponible');
    this.definitions=data.definitions;this.commands=data.commands;this.protocolMeta={source:data.source,cache:data.cache,fetched_at:data.fetched_at};
    this.log(`Protocole chargé (${data.cache||'ok'})`,'success');
  }
  async scan(){
    if(!window.AndroidBridge)throw new Error('Bridge Android indisponible. Lance l’application Android native.');
    await this.loadProtocol(false);
    let list=[];try{list=JSON.parse(AndroidBridge.scanMidiDevices()||'[]')}catch(e){throw new Error(`Scan MIDI Android: ${e.message}`)}
    this.devices=list;this.log(`${list.length} périphérique(s) MIDI détecté(s).`,list.length?'success':'warning');return list.map((d,index)=>({index,name:d.name||`MIDI ${index+1}`,input:d.name,output:d.name}));
  }
  async connect(index=0){
    if(!this.devices.length)await this.scan();
    if(!this.devices[index])throw new Error('Périphérique MIDI introuvable.');
    const raw=AndroidBridge.connectMidi(Number(index));let r;try{r=JSON.parse(raw||'{}')}catch{r={ok:false,error:raw}}
    if(!r.ok)throw new Error(r.error||'Connexion MIDI impossible');
    this.deviceIndex=Number(index);this.deviceName=r.name||this.devices[index].name||'Pocket Master';this.connected=true;this.setWriteArmed(false);this.status();this.log(`Connecté via Android MIDI : ${this.deviceName}`,'success');return this.deviceName;
  }
  disconnect(){try{window.AndroidBridge?.disconnectMidi()}catch{}this.deviceIndex=-1;this.deviceName=null;this.connected=false;this.writeArmed=false;this.persistentArmed=false;this._midiBuffer=[];if(this._ackResolve){this._ackResolve(false);this._ackResolve=null}this.status()}
  _onMidiHex(hex){
    const clean=String(hex||'').replace(/\s+/g,'').toUpperCase();if(!clean)return;this.log(`RX ${clean}`,'rx');
    const ACK='F00B02000100000003010400080000F7';if(clean===ACK&&this._ackResolve){const r=this._ackResolve;this._ackResolve=null;r(true)}
  }
  _hexToBytes(hex){const c=String(hex).replace(/\s+/g,'');if(c.length%2)throw new Error('Commande SysEx hexadécimale invalide.');return c.match(/.{2}/g).map(x=>parseInt(x,16))}
  async writeCommand(commandString,{persistent=false}={}){
    if(!this.connected)throw new Error('Pocket Master non connecté.');
    if(!this.writeArmed)throw new Error('Hardware Guard actif : écriture MIDI refusée.');
    if(persistent&&!this.persistentArmed)throw new Error('Hardware Guard : écriture permanente non autorisée.');
    let bytes=this._hexToBytes(commandString);if(bytes[0]===0x80&&bytes[1]===0x80)bytes=bytes.slice(2);if(bytes[0]!==0xF0||bytes[bytes.length-1]!==0xF7)throw new Error('Commande non SysEx refusée.');
    const hex=bytes.map(b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
    const raw=AndroidBridge.sendSysEx(hex,!!persistent);let r;try{r=JSON.parse(raw||'{}')}catch{r={ok:false,error:raw}}if(!r.ok)throw new Error(r.error||'Envoi SysEx refusé');this.log(`TX ${hex}`,'tx');
  }
  _sleep(ms=this.delayMs) { return new Promise(r=>setTimeout(r,ms)); }

  _moduleDef(name) {
    return this.definitions?.modules?.find(m=>m.name===name) || null;
  }

  _effectId(moduleName, effectName) {
    const mod = this._moduleDef(moduleName);
    if (!mod || !effectName) return null;
    for (const id of mod.effects || []) {
      if (this.definitions.effectLibrary?.[id]?.name === effectName) return Number(id);
    }
    return null;
  }

  _paramDef(fxId, paramName) {
    const list = this.definitions.effectLibrary?.[fxId]?.alg || [];
    return list.find(p=>String(p.name).toUpperCase()===String(paramName).toUpperCase()) || null;
  }

  _normalizeParamValue(def, value) {
    let v = value;
    if (typeof v === 'string' && def?.options) {
      const idx = def.options.findIndex(x=>String(x).toLowerCase()===v.toLowerCase());
      if (idx >= 0) v = idx;
    }
    v = Number(v);
    if (!Number.isFinite(v)) v = Number(def?.defaultValue ?? 0);
    if (def?.min !== undefined) v = Math.max(Number(def.min), v);
    if (def?.max !== undefined) v = Math.min(Number(def.max), v);
    return v;
  }

  _lookupValueCommand(table, value) {
    if (!table) return null;
    const candidates = [String(value), String(Number(value))];
    if (Number.isInteger(Number(value))) candidates.push(String(parseInt(value,10)));
    for (const key of candidates) if (table[key]) return table[key];
    const numericKeys = Object.keys(table).map(k=>({k,n:Number(k)})).filter(x=>Number.isFinite(x.n));
    if (!numericKeys.length) return null;
    numericKeys.sort((a,b)=>Math.abs(a.n-Number(value))-Math.abs(b.n-Number(value)));
    return table[numericKeys[0].k] || null;
  }

  convertPreset(jsonData) {
    if (!this.definitions) throw new Error('Protocole non chargé.');
    if (jsonData.version !== '1.0') throw new Error(`Version de preset non supportée : ${jsonData.version}`);
    const result = {
      ampMode: jsonData.ampMode || 'Normal',
      states: {}, order: jsonData.signalChain || [],
      presetVolume: Math.max(0, Math.min(127, Number(jsonData.presetVolume ?? 75))),
      selectedEffects: {}, parameters: {}
    };
    for (const [moduleName, moduleData] of Object.entries(jsonData.modules || {})) {
      const mod = this._moduleDef(moduleName);
      if (!mod) continue;
      const moduleId = Number(mod.moduleId);
      result.states[moduleName] = moduleData.enabled === true;
      if (!moduleData.effect) continue;
      const fxId = this._effectId(moduleName, moduleData.effect);
      if (fxId === null) throw new Error(`${moduleName}: effet « ${moduleData.effect} » absent du protocole courant.`);
      result.selectedEffects[moduleId] = fxId;
      result.parameters[moduleId] = {};
      const provided = {};
      for (const [k,v] of Object.entries(moduleData.parameters || {})) provided[String(k).toUpperCase()] = v;
      for (const pdef of this.definitions.effectLibrary[fxId]?.alg || []) {
        const raw = Object.prototype.hasOwnProperty.call(provided, String(pdef.name).toUpperCase())
          ? provided[String(pdef.name).toUpperCase()] : pdef.defaultValue;
        result.parameters[moduleId][Number(pdef.algId)] = this._normalizeParamValue(pdef, raw);
      }
    }
    return result;
  }

  async applyPreset(jsonData, onProgress=()=>{}) {
    await this.loadProtocol(false);
    if (!this.connected) throw new Error('Connecte d’abord le Pocket Master.');
    const data = this.convertPreset(jsonData);
    const jobs = [];

    const volCmd = this._lookupValueCommand(this.commands.globalCommands?.presetVolume, data.presetVolume);
    if (volCmd) jobs.push({label:`Volume ${data.presetVolume}`, cmd:volCmd});

    for (const [moduleName, enabled] of Object.entries(data.states)) {
      const mod = this._moduleDef(moduleName); if (!mod) continue;
      let id = Number(mod.moduleId); if (id === 9) id = 3;
      const cmd = this.commands.moduleStates?.[id]?.[enabled ? 'on' : 'off'];
      if (cmd) jobs.push({label:`${moduleName} ${enabled?'ON':'OFF'}`, cmd});
    }

    const ampCmd = data.ampMode === 'Clone' ? this.commands.ampModes?.clone : this.commands.ampModes?.factory;
    if (ampCmd) jobs.push({label:`AMP ${data.ampMode}`, cmd:ampCmd});

    for (const [idStr, fxId] of Object.entries(data.selectedEffects)) {
      const moduleId = Number(idStr);
      if (moduleId === 0) continue;
      let lookupId = moduleId;
      if (moduleId === 3 && this.commands.effectTypes?.[9]?.[fxId]) lookupId = 9;
      const cmd = this.commands.effectTypes?.[lookupId]?.[fxId];
      if (!cmd) throw new Error(`Commande de modèle introuvable : module ${lookupId}, FX ${fxId}.`);
      jobs.push({label:`Modèle M${moduleId} FX${fxId}`, cmd});
    }

    const orderKey = data.order.join('-');
    const chainCmd = this.commands.chainOrderCommands?.[orderKey];
    if (chainCmd) jobs.push({label:'Ordre de chaîne', cmd:chainCmd});
    else this.log(`Ordre non trouvé dans le protocole : ${orderKey}`, 'warning');

    for (const [idStr, params] of Object.entries(data.parameters)) {
      const moduleId = Number(idStr);
      for (const [algIdStr, value] of Object.entries(params)) {
        let lookupId = moduleId;
        if (moduleId === 3 && this.commands.parameters?.[9]?.[algIdStr]) lookupId = 9;
        const cmd = this._lookupValueCommand(this.commands.parameters?.[lookupId]?.[algIdStr], value);
        if (!cmd) throw new Error(`Commande paramètre introuvable : M${lookupId}.A${algIdStr}=${value}`);
        jobs.push({label:`M${moduleId}.A${algIdStr}=${value}`, cmd});
      }
    }

    let done = 0;
    for (const job of jobs) {
      await this.writeCommand(job.cmd);
      done++;
      onProgress({done,total:jobs.length,label:job.label,percent:Math.round(done/jobs.length*100)});
      await this._sleep();
    }
    this.log(`Preset appliqué : ${jobs.length} commandes envoyées.`, 'success');
    return {commands:jobs.length};
  }

  async sendPresetVolume(value) {
    if (!this.connected || !this.commands) return false;
    const v=Math.max(0,Math.min(127,Number(value)));
    const cmd=this._lookupValueCommand(this.commands.globalCommands?.presetVolume,v);
    if(!cmd) return false; await this.writeCommand(cmd); return true;
  }

  async sendModuleState(moduleName, enabled) {
    if (!this.connected || !this.commands) return false;
    const mod=this._moduleDef(moduleName); if(!mod) return false;
    let id=Number(mod.moduleId); if(id===9) id=3;
    const cmd=this.commands.moduleStates?.[id]?.[enabled?'on':'off'];
    if(!cmd) return false; await this.writeCommand(cmd); return true;
  }

  async sendEffectType(moduleName, effectName) {
    if (!this.connected || !this.commands) return false;
    const mod=this._moduleDef(moduleName); if(!mod) return false;
    const fxId=this._effectId(moduleName,effectName); if(fxId===null || Number(mod.moduleId)===0) return false;
    let id=Number(mod.moduleId);
    if(id===3 && this.commands.effectTypes?.[9]?.[fxId]) id=9;
    const cmd=this.commands.effectTypes?.[id]?.[fxId];
    if(!cmd) return false; await this.writeCommand(cmd); return true;
  }

  async sendParameter(moduleName, effectName, paramName, value) {
    if (!this.connected || !this.commands) return false;
    const mod=this._moduleDef(moduleName); if(!mod) return false;
    const fxId=this._effectId(moduleName,effectName); if(fxId===null) return false;
    const pdef=this._paramDef(fxId,paramName); if(!pdef) return false;
    const v=this._normalizeParamValue(pdef,value);
    let id=Number(mod.moduleId);
    if(id===3 && this.commands.parameters?.[9]?.[pdef.algId]) id=9;
    const cmd=this._lookupValueCommand(this.commands.parameters?.[id]?.[pdef.algId],v);
    if(!cmd) return false; await this.writeCommand(cmd); return true;
  }

  async sendChainOrder(order) {
    if(!this.connected || !this.commands) return false;
    const cmd=this.commands.chainOrderCommands?.[(order||[]).join('-')];
    if(!cmd) return false; await this.writeCommand(cmd); return true;
  }

  _charCode(ch) {
    if (ch === ' ') return '0200';
    if (ch === '-') return '020D';
    if (ch === '.') return '020E';
    if (/^[0-9]$/.test(ch)) return `03${Number(ch).toString(16).toUpperCase().padStart(2,'0')}`;
    if (/^[A-O]$/.test(ch)) return `04${(ch.charCodeAt(0)-64).toString(16).toUpperCase().padStart(2,'0')}`;
    if (/^[P-Z]$/.test(ch)) return `05${(ch.charCodeAt(0)-80).toString(16).toUpperCase().padStart(2,'0')}`;
    if (ch === '_') return '050F';
    return '0000';
  }

  _encodeName(name) {
    const safe=String(name||'PRESET').toUpperCase().slice(0,10);
    let out='';
    for(let i=0;i<10;i++) out += i<safe.length ? this._charCode(safe[i]) : '0000';
    return out;
  }

  _crc8(hexString) {
    const bytes=hexString.match(/[0-9a-fA-F]{2}/g)?.map(x=>parseInt(x,16)) || [];
    let crc=0;
    for(const byte of bytes){
      crc ^= byte;
      for(let i=0;i<8;i++) crc = (crc & 0x80) ? ((crc<<1)^0x07)&0xFF : (crc<<1)&0xFF;
    }
    return crc;
  }

  _saveCommand(slot, name) {
    const n=Number(slot);
    if(!Number.isInteger(n)||n<1||n>50) throw new Error('Le slot doit être compris entre 1 et 50.');
    const valueHex=(n-1).toString(16).padStart(2,'0');
    const presetBytes=`0${valueHex[0]}0${valueHex[1]}`;
    const encoded=this._encodeName(name);
    let payload=`0001000001030101040a${presetBytes}000000000000${encoded}000000000000`;
    const compact=payload.replace(/0(.)/g,'$1');
    const crc=this._crc8(compact).toString(16).toUpperCase().padStart(2,'0');
    const expanded=crc.split('').map(nib=>'0'+nib).join('');
    return {command:`8080f0${expanded}${payload}f7`, crc};
  }

  waitForAck(timeoutMs=1300) {
    return new Promise(resolve=>{
      const timer=setTimeout(()=>{
        if(this._ackResolve){this._ackResolve=null;resolve(false)}
      },timeoutMs);
      this._ackResolve=(ok)=>{clearTimeout(timer);this._ackResolve=null;resolve(ok)};
    });
  }

  async saveToSlot(slot, name) {
    if(!this.connected) throw new Error('Pocket Master non connecté.');
    const {command,crc}=this._saveCommand(slot,name);
    const ack=this.waitForAck();
    await this.writeCommand(command,{persistent:true});
    const ok=await ack;
    if(!ok) throw new Error('La pédale n’a pas confirmé la sauvegarde (ACK absent).');
    this.log(`Preset sauvegardé en User ${slot} (CRC ${crc}).`, 'success');
    return {slot:Number(slot),name:String(name).slice(0,10),crc};
  }
}

window.PocketMasterDirectConnector = PocketMasterDirectConnector;

window.PTLNativeMidiReceive=function(hex){try{window.__ptlMobileConnector?._onMidiHex(hex)}catch(e){console.error(e)}};
window.PocketMasterDirectConnector=PocketMasterDirectConnector;
