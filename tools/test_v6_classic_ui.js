const fs=require('fs'), path=require('path');
const www=path.join(__dirname,'..','app','src','main','assets','www');
const html=fs.readFileSync(path.join(www,'index.html'),'utf8');
const css=fs.readFileSync(path.join(www,'classic_v6.css'),'utf8');
const js=fs.readFileSync(path.join(www,'classic_v6.js'),'utf8');
function ok(x,m){if(!x)throw new Error(m)}
ok(html.includes('classic_v6.css'),'classic_v6.css missing');
ok(html.includes('classic_v6.js'),'classic_v6.js missing');
ok(!html.includes('mobile_v5.css'),'V5 CSS still loaded');
ok(!html.includes('mobile_v5.js'),'V5 JS still loaded');
for(const s of ['sl6-header','sl6-dock','soniclink/btn_menu.svg','soniclink/home_btn_save.svg','soniclink/effects.svg']) ok(js.includes(s),`missing ${s}`);
for(const s of ['.module-card.editor-active','.soniclink-chain','#presetBrowser','--sl-orange:#ca6821']) ok(css.includes(s),`missing CSS ${s}`);
console.log('V6 SONICLINK Classic UI contracts OK');
