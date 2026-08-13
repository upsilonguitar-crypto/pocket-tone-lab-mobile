const assert=require('assert');
const Core=require('../app/src/main/assets/www/tone_match_core.js');
const sr=44100,dur=6,n=sr*dur;
function synth(parts){const x=new Float32Array(n);for(let i=0;i<n;i++){const t=i/sr;let v=0;for(const [f,a] of parts)v+=Math.sin(2*Math.PI*f*t)*a;x[i]=Math.tanh(v*1.2)*.55}return x}
const source=synth([[140,.7],[500,.32],[1200,.12]]);
const target=synth([[140,.38],[850,.30],[2600,.28],[4800,.12]]);
const a=Core.analyzePCM(source,sr),b=Core.analyzePCM(target,sr);
const same=Core.similarity(a,a,'isolated');
assert(same>=98,`same similarity ${same}`);
const m=Core.matchProfiles(b,a,{focus:'isolated'});
assert(m.adjustments.treble>0,`expected positive treble, got ${m.adjustments.treble}`);
assert(m.beforeScore<same,'different audio should score below identical');
const preset={id:'x',name:'TEST',match:50,preset_vol:60,modules:{AMP:{enabled:true,model:'Jazz 120',params:{Bass:50,Middle:50,Treble:50,PRES:50,Gain:40,VOL:60}},DRV:{enabled:false,params:{}},EQ:{enabled:false,params:{}},DLY:{enabled:true,params:{Mix:15}},RVB:{enabled:true,params:{Mix:20}}}};
const out=Core.applyMatchToPreset(preset,m,70);
assert(out.preset.name.includes('MATCH'));
assert(out.preset.modules.AMP.params.Treble>50,'treble should increase');
assert(out.changes.length>0,'changes expected');
console.log('Tone Match core OK', {same, before:m.beforeScore, confidence:m.confidence, adjustments:m.adjustments});
