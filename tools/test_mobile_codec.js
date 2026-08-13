const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..'),www=path.join(root,'app/src/main/assets/www');
global.window=global;global.localStorage={getItem:()=>null,setItem:()=>{}};global.fetch=async()=>{throw new Error('network disabled in test')};
vm.runInThisContext(fs.readFileSync(path.join(www,'bootstrap.js'),'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(www,'mobile_api.js'),'utf8'));
const src=fs.readFileSync(path.join(root,'samples/CLEAN AMBIENT.prst'));const ab=src.buffer.slice(src.byteOffset,src.byteOffset+src.byteLength);
const parsed=PTLMobileCodec.prstToEditor(ab),out=PTLMobileCodec.encodePrst(parsed.preset,parsed.inspection.name,parsed.inspection.presetBPM).bytes;
if(!parsed.inspection.crcValid)throw new Error('CRC fixture invalide');if(Buffer.compare(src,Buffer.from(out))!==0)throw new Error('Round-trip .prst non identique');
console.log(`PRST round-trip OK · ${out.length} octets · CRC ${out[20].toString(16).padStart(2,'0').toUpperCase()}`);
