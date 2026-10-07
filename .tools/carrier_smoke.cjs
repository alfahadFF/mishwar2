const {JSDOM,VirtualConsole}=require('/tmp/node_modules/jsdom');const fs=require('fs');
const html=fs.readFileSync('/home/user/naql-carrier.html','utf8');
const vc=new VirtualConsole(); const errs=[]; vc.on('jsdomError',e=>{ if(!/Not implemented|Could not load/.test(e.message)) errs.push(e.message.slice(0,200)) });
const w=new JSDOM(html,{runScripts:'dangerously',virtualConsole:vc,url:'https://x.test/',beforeParse(w){
  Object.defineProperty(w,'localStorage',{get(){ throw new w.DOMException('sandboxed','SecurityError') }});
  w.fetch=()=>Promise.reject(new Error('offline'));
}}).window;
setTimeout(()=>{
  const $=id=>w.document.getElementById(id); const t=id=>$(id).textContent.replace(/\s+/g,' ').trim();
  console.log('errors:', errs);
  console.log('modals open:', [...w.document.querySelectorAll('.overlay.open,.sheetBg.open')].map(e=>e.id));
  console.log('vehicle pill:', t('vehPill'), '| clickable:', !!$('vehPill').getAttribute('onclick'));
  console.log('wallet:', t('walletPill'), '| feed:', t('feedCount'));
  console.log('cards:', [...w.document.querySelectorAll('#feedList .card .cHead b')].map(b=>b.textContent).join(' / '));
  w.eval("openDetail(feed()[0].id)");
  setTimeout(()=>{ console.log('detail open:', $('detail').classList.contains('open'), '| actions:', t('dActions').slice(0,50)); process.exit(0) },300)
},800)
