(function(){
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
let S={credits:150,cad:0,mode:'basic',dept:'',img:false,ocr:''};
try{Object.assign(S,JSON.parse(localStorage.getItem('qz_state')||'{}'))}catch(e){}
delete S.live;delete S.demo;delete S.img;delete S.imgData;delete S.ocr;
const save=()=>{try{const {live,demo,img,imgData,ocr,...r}=S;localStorage.setItem('qz_state',JSON.stringify(r))}catch(e){}};
const toast=m=>{const t=$('#toast');t.textContent=m;t.style.display='block';setTimeout(()=>t.style.display='none',2600)};
function paint(){const ok=S.live||S.demo;$('#cr').textContent=ok?S.credits:'—';$('#cad').textContent=ok?S.cad:'—';$('#dept').value=S.dept;
 $$('#modes button').forEach(b=>b.classList.toggle('on',b.dataset.m===S.mode));$('#est').textContent=est()}
// Cost: words in the prompt + answer depth + model + image
function est(text){text=text===undefined?$('#q').value:text;if(!text.trim()&&S.img)text='Solve this image';const w=text.trim().split(/\s+/).filter(Boolean).length;
 if(!w)return 0;return Math.max(1,Math.ceil((Math.ceil(w/40)+(S.mode==='advanced'?6:2)+(S.img?3:0)+({quick:0,summary:1,teach:3,calc:2,science:3,image:3,essay:4,case:4,report:5,research:6}[$('#kind').value]||0))*parseFloat($('#model').value)))}
// Departmental duplicate check (demo store in this browser; move to Supabase for real cross-student checks)
const words=t=>t.toLowerCase().replace(/[^a-z0-9\s]/g,'').split(/\s+/).filter(w=>w.length>2);
const hash=w=>{let h=5381;for(const c of w)h=((h<<5)+h+c.charCodeAt(0))>>>0;return h};
const sig=t=>[...new Set(words(t).map(hash))];
const key=()=>'qz_dept_'+(S.dept||'general').toLowerCase();
const seen=()=>{try{return JSON.parse(localStorage.getItem(key())||'[]')}catch(e){return[]}};
function similar(t){const a=new Set(sig(t));if(a.size<3)return false;
 return seen().some(b=>{const s=new Set(b),i=[...a].filter(x=>s.has(x)).length;return i/(a.size+s.size-i)>=0.7})}
function remember(t){try{const l=seen();l.push(sig(t));localStorage.setItem(key(),JSON.stringify(l.slice(-200)))}catch(e){}}
// AI call: uses your Netlify function if it exists, else a demo answer
async function callAI(p){
 let tok='';try{const k=Object.keys(localStorage).find(x=>/^sb-.*-auth-token$/.test(x));tok=JSON.parse(localStorage.getItem(k)).access_token||''}catch(e){}
 let r=null;try{r=await fetch('/.netlify/functions/quikaz',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tok},body:JSON.stringify(p)})}catch(e){}
 if(r&&r.ok)return await r.json();
 if(r&&r.status===401){$('#login').classList.add('open');throw new Error('Log in to continue.')}
 if(r&&r.status===409){const e=new Error('dup');e.dup=true;throw e}
 if(r&&r.status!==404){const d=await r.json().catch(()=>({}));throw new Error(d.error||'The AI is unavailable. Try again.')}
 return {answer:`## ${{brainstorm:'Topic ideas',audit:'Review and audit'}[p.task]||'Answer'}\n\nDemo answer. Connect a backend to get real responses. Inline math works: the quadratic formula is $x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}$.\n\n$$E=mc^2$$\n\n| Item | Detail |\n|---|---|\n| Mode | ${p.mode} |\n| Model weight | ${p.model} |\n\n- Point one\n- Point two\n\n**Your input:** ${(p.text||'').slice(0,200)}`}}
// Small markdown renderer (headings, bold, italic, lists, tables). Math is kept for KaTeX.
const rtl=el=>el.querySelectorAll('p,li,h1,h2,h3,td,th').forEach(e=>e.dir='auto');
const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
const inl=s=>esc(s).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/(^|\s)_(.+?)_/g,'$1<i>$2</i>');
function md(t){const L=t.split('\n');let o='',i=0;
 while(i<L.length){const l=L[i];
  if(/^\|/.test(l)&&/^\|[\s\-|:]+$/.test(L[i+1]||'')){const h=l.split('|').slice(1,-1);o+='<table><tr>'+h.map(c=>'<th>'+inl(c.trim())+'</th>').join('')+'</tr>';i+=2;
   while(/^\|/.test(L[i]||'')){o+='<tr>'+L[i].split('|').slice(1,-1).map(c=>'<td>'+inl(c.trim())+'</td>').join('')+'</tr>';i++}o+='</table>';continue}
  if(/^- /.test(l)){o+='<ul>';while(/^- /.test(L[i]||'')){o+='<li>'+inl(L[i].slice(2))+'</li>';i++}o+='</ul>';continue}
  const h=l.match(/^(#{1,3}) (.*)/);if(h)o+=`<h${h[1].length}>${inl(h[2])}</h${h[1].length}>`;else if(l.trim())o+='<p>'+inl(l)+'</p>';i++}
 return o}
function show(t){const p=$('#paper');p.innerHTML=md(t);rtl(p);
 if(window.renderMathInElement)renderMathInElement(p,{delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}],throwOnError:false})}
function append(t){const p=$('#paper');if(p.querySelector('.empty'))p.innerHTML='';const d=document.createElement('div');d.innerHTML=md(t);rtl(d);p.appendChild(d);
 if(window.renderMathInElement)renderMathInElement(d,{delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}],throwOnError:false})}
async function run(task,text,rep,force,q){const cost=est(text);
 if(!S.live&&S.credits<cost)return toast('Not enough credits. This needs '+cost+'.');
 $('#ask').disabled=true;$('#busy').hidden=false;
 try{const res=await callAI({task,text,q:q||text,force:!!force,mode:S.mode,model:$('#model').value,kind:$('#kind').value,level:$('#level').value,tone:$('#tone').value,lang:$('#lang').value,img:task==='answer'&&S.img,image:task==='answer'&&S.imgData?{mime:'image/jpeg',data:S.imgData}:null,dept:S.dept,ocr:S.ocr});
  if(res.credits!==undefined){S.live=true;S.credits=res.credits}else S.credits-=cost;
  save();paint();rep?append(res.answer):show(res.answer);remember(text);toast('Done. '+cost+' credits used.')}
 catch(e){if(e.dup){pending=q||text;$('#dup').classList.add('open')}else toast(e.message||'Something went wrong.')}
 finally{$('#ask').disabled=false;$('#busy').hidden=true}}
let pending='';
function ask(force){const t=$('#q').value.trim();if(!t&&!S.imgData)return toast('Type a question or add an image first.');
 if(!force&&similar(t)){pending=t;return $('#dup').classList.add('open')}run('answer',t,false,force,t)}
$('#ask').onclick=()=>ask(false);
$('#go').onclick=()=>{$('#dup').classList.remove('open');ask(true)};
$('#remodel').onclick=()=>{$('#dup').classList.remove('open');const t=pending+'\n\nAnswer with a unique structure, wording and examples.';$('#q').value=t;run('answer',t,false,true,pending)};
$$('[data-t]').forEach(b=>b.onclick=()=>{const t=$('#q').value.trim();if(!t)return toast('Type a topic or paste an answer first.');run(b.dataset.t,t)});
$('#expand').onclick=()=>{const p=$('#paper');if(p.querySelector('.empty'))return toast('Get an answer first.');run('expand','Expand this answer in much more depth, keeping the same structure:\n\n'+p.innerText,true)};
$('#trans').onclick=()=>{const p=$('#paper');if(p.querySelector('.empty'))return toast('Get an answer first.');run('translate',p.innerText,true)};
$('#modes').onclick=e=>{if(e.target.dataset.m){S.mode=e.target.dataset.m;save();paint()}};
$('#model').onchange=paint;$('#kind').onchange=paint;$('#q').oninput=paint;
$('#dept').onchange=e=>{S.dept=e.target.value.trim();save()};
// Image: shrink it, then send it straight to the AI so it can see it
const clearImg=()=>{S.img=false;S.imgData=null;$('#img').value='';$('#imgbox').hidden=true;$('#thumb').removeAttribute('src');$('#imgname').textContent='';paint()};
$('#imgx').onclick=clearImg;
$('#img').onchange=e=>{const f=e.target.files[0];if(!f)return;if(!/^image\//.test(f.type))return toast('Please choose an image.');
 const im=new Image(),u=URL.createObjectURL(f);
 im.onerror=()=>{clearImg();toast('Could not open that image. Try another.')};
 im.onload=()=>{const s=Math.min(1,1600/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.round(im.width*s);c.height=Math.round(im.height*s);
  c.getContext('2d').drawImage(im,0,0,c.width,c.height);S.imgData=c.toDataURL('image/jpeg',.8).split(',')[1];S.img=true;
  $('#thumb').src=u;$('#imgname').textContent=f.name;$('#imgbox').hidden=false;paint()};
 im.src=u};
// Voice typing (the browser asks for microphone permission once)
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;let rec=null,rOn=false;
const mathify=t=>t.replace(/\bsquare root of\b/gi,'√').replace(/\bdivided by\b/gi,'÷').replace(/\bto the power of\b/gi,'^').replace(/\btimes\b/gi,'×').replace(/\bplus\b/gi,'+').replace(/\bminus\b/gi,'-').replace(/\bequals\b/gi,'=').replace(/\bsquared\b/gi,'²').replace(/\bcubed\b/gi,'³');
$('#mic').onclick=()=>{if(!SR)return toast('Voice typing is not supported here. Try Chrome.');
 if(rOn){rec.stop();return}
 rec=new SR();rec.lang='en-NG';rec.continuous=true;rec.interimResults=false;
 rec.onstart=()=>{rOn=true;$('#mic').textContent='Stop'};
 rec.onresult=e=>{let s='';for(let i=e.resultIndex;i<e.results.length;i++)if(e.results[i].isFinal)s+=e.results[i][0].transcript;
  if(s){const q=$('#q');q.value+=(q.value&&!/\s$/.test(q.value)?' ':'')+mathify(s.trim());paint()}};
 rec.onerror=e=>toast(e.error==='not-allowed'?'Microphone blocked. Allow it in your browser settings.':'Could not hear you. Try again.');
 rec.onend=()=>{rOn=false;$('#mic').textContent='Speak'};
 try{rec.start()}catch(e){}};
// Store
$('#buy').onclick=()=>$('#store').classList.add('open');
$('#pay').onclick=()=>{if(S.live){$('#store').classList.remove('open');return toast('Payments open soon.')}S.cad+=500;save();paint();$('#store').classList.remove('open');toast('500 AutoCAD Units added (demo).')};
$$('[data-close]').forEach(b=>b.onclick=()=>b.closest('.modal').classList.remove('open'));
// Export
$('#pdf').onclick=()=>window.print();
$('#doc').onclick=()=>{const h='<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>@page{margin:1in}body{font:12pt "Times New Roman",serif;line-height:1.5}table{border-collapse:collapse}td,th{border:1px solid #000;padding:4px}</style></head><body>'+$('#paper').innerHTML+'</body></html>';
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff',h],{type:'application/msword'}));a.download='quikaz-answer.doc';a.click()};
$('#share').onclick=async()=>{const u=location.origin+'/';try{if(navigator.share)await navigator.share({title:'QuikAz',text:'Try QuikAz, an AI study assistant for university students.',url:u});else{await navigator.clipboard.writeText(u);toast('Link copied.')}}catch(e){}};
// Sign in (QuikAz has its own login, using the same ProjectPal accounts)
let sbc=null,signup=false;try{sbc=window.supabase.createClient('https://qhcponrxumfnomkgverb.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoY3BvbnJ4dW1mbm9ta2d2ZXJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyMDMyNzUsImV4cCI6MjEwNTc3OTI3NX0.PWiYx_f-yPLgdCQRz12cU4IazliOhb6W7klWTnGqT_U')}catch(e){}
$('#lsw').onclick=()=>{signup=!signup;$('#lt').textContent=signup?'Create your QuikAz account':'Log in to QuikAz';$('#lgo').textContent=signup?'Sign up':'Log in';$('#lsw').textContent=signup?'I have an account':'Create account'};
$('#lgo').onclick=async()=>{const m=$('#lm');if(!sbc){m.textContent='Login is not available right now.';return}
 const e=$('#le').value.trim(),p=$('#lp').value;if(!e||!p){m.textContent='Enter your email and password.';return}
 m.textContent='Please wait…';const r=signup?await sbc.auth.signUp({email:e,password:p}):await sbc.auth.signInWithPassword({email:e,password:p});
 if(r.error){m.textContent=r.error.message;return}
 if(signup&&!r.data.session){m.textContent='Check your email to confirm, then log in.';return}
 m.textContent='';$('#login').classList.remove('open');toast('Logged in. Ask your question again.');wal()};
$('#logout').onclick=async()=>{try{await sbc.auth.signOut()}catch(e){}S.live=false;paint();toast('Logged out.')};
$('#menu').onclick=()=>$('#side').classList.toggle('open');
async function wal(){try{const r=await callAI({task:'wallet'});if(r.credits!==undefined){S.live=true;S.credits=r.credits;S.cad=r.cad||0;paint()}else{S.demo=true;paint()}}catch(e){}}
wal();
paint();
})();
