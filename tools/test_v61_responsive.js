const fs=require('fs'), path=require('path');
const root=path.join(__dirname,'..');
const www=path.join(root,'app','src','main','assets','www');
const html=fs.readFileSync(path.join(www,'index.html'),'utf8');
const css=fs.readFileSync(path.join(www,'classic_v61_responsive.css'),'utf8');
const java=fs.readFileSync(path.join(root,'app','src','main','java','fr','pockettonelab','mobile','MainActivity.java'),'utf8');
const js=fs.readFileSync(path.join(www,'classic_v6.js'),'utf8');
function ok(v,m){ if(!v) throw new Error(m); }
ok(html.includes('viewport-fit=cover'),'viewport-fit missing');
ok(html.includes('classic_v61_responsive.css'),'responsive CSS not loaded');
ok(css.includes('grid-template-columns:repeat(9,minmax(0,1fr))'),'9 FX chain does not fit viewport');
ok(css.includes('min-width:0!important'),'min-width reset missing');
ok(css.includes('overflow-x:hidden!important'),'horizontal overflow guard missing');
ok(css.includes('@media (max-width:360px)'),'narrow phone breakpoint missing');
ok(java.includes('s.setLoadWithOverviewMode(false)'),'WebView overview mode still enabled');
ok(java.includes('s.setUseWideViewPort(false)'),'WebView wide viewport still enabled');
ok(java.includes('webView.setInitialScale(100)'),'initial scale guard missing');
ok(!js.includes("scrollIntoView({behavior:'smooth',inline:'center'"),'chain still forces horizontal scroll');
console.log('V6.1 responsive viewport contracts OK');
