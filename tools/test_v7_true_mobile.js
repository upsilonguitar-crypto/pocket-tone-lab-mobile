const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'../app/src/main/assets/www');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'mobile_v7.css'),'utf8');
const js=fs.readFileSync(path.join(root,'mobile_v7.js'),'utf8');
function ok(x,msg){if(!x)throw new Error(msg)}
ok(html.includes('viewport-fit=cover'),'viewport-fit missing');
ok(html.includes('mobile_v7.css'),'V7 CSS missing');
ok(html.includes('mobile_v7.js'),'V7 JS missing');
ok(!html.includes('<script src="classic_v6.js"></script>'),'classic V6 UI still loaded');
ok(css.includes('grid-template-columns:repeat(5,minmax(0,1fr))'),'phone bottom nav missing');
ok(css.includes('grid-template-columns:repeat(9,minmax(0,1fr))'),'9-slot chain not fitted to phone width');
ok(css.includes('overflow:hidden !important'),'root overflow lock missing');
ok(js.includes("document.body.classList.add('m7-mode')"),'mobile shell mode missing');
ok(js.includes('m7-params'),'mobile parameter surface missing');
ok(js.includes('PTLToneMatch'),'Tone Match bridge missing');
ok(js.includes('Hardware Guard'),'Hardware Guard text missing');
console.log('V7 TRUE MOBILE contracts OK');
