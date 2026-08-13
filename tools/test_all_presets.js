const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..'),www=path.join(root,'app/src/main/assets/www');global.window=global;global.localStorage={getItem:()=>null,setItem:()=>{}};global.fetch=async()=>{throw new Error('network disabled')};
vm.runInThisContext(fs.readFileSync(path.join(www,'bootstrap.js'),'utf8'));vm.runInThisContext(fs.readFileSync(path.join(www,'mobile_api.js'),'utf8'));
let ok=0;for(const p of PTL_BOOTSTRAP.presets){const r=PTLMobileCodec.encodePrst(p,p.name,p.preset_bpm||120);if(r.bytes.length!==515||!r.inspection.crcValid)throw new Error(`PRST invalide: ${p.name}`);ok++}console.log(`${ok}/${PTL_BOOTSTRAP.presets.length} presets · native PRST OK`);
