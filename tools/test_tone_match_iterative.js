const assert=require('assert');
const Core=require('../app/src/main/assets/www/tone_match_core.js');

const sr=44100,dur=5,n=sr*dur;
function synth(parts,drive=1.0){
  const x=new Float32Array(n);
  for(let i=0;i<n;i++){
    const t=i/sr;let v=0;
    for(const [f,a] of parts)v+=Math.sin(2*Math.PI*f*t)*a;
    x[i]=Math.tanh(v*drive)*.55;
  }
  return x;
}
const source=Core.analyzePCM(synth([[120,.75],[430,.36],[1000,.14]],1.35),sr);
const mid=Core.analyzePCM(synth([[120,.56],[650,.34],[1800,.20],[3600,.06]],1.15),sr);
const target=Core.analyzePCM(synth([[120,.34],[850,.32],[2400,.29],[4900,.13]],.95),sr);

const p1=Core.planIteration(target,source,{focus:'isolated',iteration:1,baseStrength:70,threshold:93});
assert(p1.beforeScore<93,'source should require correction');
assert(p1.adaptiveStrength>=18&&p1.adaptiveStrength<=85,'adaptive strength bounded');

const p2=Core.planIteration(target,mid,{focus:'isolated',iteration:2,previousScore:p1.beforeScore,baseStrength:70,threshold:93});
assert(p2.beforeScore>=p1.beforeScore,'synthetic iteration should improve score');
assert(p2.adaptiveStrength<=p1.adaptiveStrength,'later/better iteration should not become more aggressive');
assert(!p2.regression,'improving iteration must not be regression');

const bad=Core.planIteration(target,source,{focus:'isolated',iteration:3,previousScore:p2.beforeScore,baseStrength:70,threshold:93});
assert(bad.regression,'score drop should trigger regression guard');
assert(bad.adaptiveStrength< p2.adaptiveStrength,'regression should reduce correction strength');

const preset={id:'x',name:'ITER TEST',preset_vol:60,modules:{AMP:{enabled:true,model:'Jazz 120',params:{Bass:50,Middle:50,Treble:50,PRES:50,Gain:40,VOL:60}},DRV:{enabled:false,params:{}},EQ:{enabled:false,params:{}},DLY:{enabled:true,params:{Mix:15}},RVB:{enabled:true,params:{Mix:20}}}};
const out=Core.applyIterativeMatchToPreset(preset,p1,{iteration:1,strength:p1.adaptiveStrength});
assert(/MATCH I1/.test(out.preset.name),'iteration name expected');
assert(out.preset.tone_match.iterative===true,'iterative metadata expected');
assert(out.preset.tone_match.iteration===1,'iteration metadata expected');

const converged=Core.planIteration(target,target,{focus:'isolated',iteration:4,previousScore:90,baseStrength:70,threshold:93});
assert(converged.converged,'identical profile should converge');
assert(converged.beforeScore>=98,'identical profile should score near 100');

console.log('Tone Match iterative OK',{
  initial:p1.beforeScore,
  improved:p2.beforeScore,
  p1Strength:p1.adaptiveStrength,
  p2Strength:p2.adaptiveStrength,
  regressionStrength:bad.adaptiveStrength,
  converged:converged.beforeScore
});
