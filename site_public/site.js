/* 공개 칼럼 사이트: 글 목록과 글. 근거 상자는 사이트를 만들 때 미리 계산해 둔 HTML이라, 여기서는 보여 주기만 한다. */
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmtDate=d=>{const[y,m,dd]=d.split('-');return `${y}년 ${+m}월 ${+dd}일`};
const KIND={column:'칼럼',note:'분석 노트'};
let POSTS=[],META={},AUTHOR={};

const kickOf=p=>`${p.draft?'<span class="tag warn">초안</span> ':''}${esc(p.kind==='note'?KIND.note:(p.kick||KIND.column))}`;
const tagsOf=p=>(p.tags||[]).map(t=>`<span class="ptag">#${esc(t)}</span>`).join('');
const icons=p=>p.icons&&p.icons.length?`<div class="ics">${p.icons.map(i=>`<img src="${esc(i)}" alt="" width="28" height="28">`).join('')}</div>`:'';
const metaLine=p=>`${fmtDate(p.date)} | ${p.minutes||1}분 읽기`;

function feature(p){
  return `<a class="card feat" href="#/${encodeURIComponent(p.slug)}"><div class="kick">${kickOf(p)}</div>
    <h2>${esc(p.title)}</h2>${p.lede?`<p>${esc(p.lede)}</p>`:''}
    <div class="pmeta"><span>${esc(AUTHOR.name||'')}</span><span>${metaLine(p)}</span>${tagsOf(p)}</div>${icons(p)}</a>`;
}
function row(p){
  return `<a class="prow2" href="#/${encodeURIComponent(p.slug)}"><div class="ptx"><div class="kick">${kickOf(p)}</div><h3>${esc(p.title)}</h3>${p.lede?`<p>${esc(p.lede)}</p>`:''}
    <div class="pmeta"><span>${metaLine(p)}</span>${tagsOf(p)}</div></div>${icons(p)}</a>`;
}
function list(kind){
  const ps=POSTS.filter(p=>p.kind===kind);
  const intro=kind==='note'
    ?'<div class="intro"><h1>분석 노트</h1><p>가설과 데이터 확인 기록. 확인하지 못한 결과와 정정도 포함.</p></div>'
    :'<div class="intro"><h1>칼럼</h1><p>LoL e스포츠 경기 분석.</p></div>';
  if(!ps.length)return intro+'<div class="card empty-state"><h2>아직 글이 없어요</h2></div>';
  return `${intro}${feature(ps[0])}${ps.length>1?`<h2 class="lh">지난 글</h2><div class="plist2">${ps.slice(1).map(row).join('')}</div>`:''}`;
}
function authorBox(){
  if(!AUTHOR.name)return '';
  return `<aside class="abox"><div class="aav">${esc(AUTHOR.name.slice(0,1))}</div><div><b>${esc(AUTHOR.name)}</b><p>${esc(AUTHOR.bio||'')}</p>
    ${AUTHOR.email?`<a href="mailto:${esc(AUTHOR.email)}">${esc(AUTHOR.email)}</a>`:''}</div></aside>`;
}
function related(p){
  const share=x=>(x.tags||[]).filter(t=>(p.tags||[]).includes(t)).length;
  const rs=POSTS.filter(x=>x!==p).map(x=>({x,s:share(x)*2+(x.kind===p.kind?1:0)})).sort((a,b)=>b.s-a.s||(a.x.date<b.x.date?1:-1)).slice(0,3).map(o=>o.x);
  return rs.length?`<section class="rel2"><h2 class="lh">함께 읽을 글</h2><div class="plist2">${rs.map(row).join('')}</div></section>`:'';
}
function post(slug){
  const p=POSTS.find(x=>x.slug===slug);
  if(!p)return '<div class="card empty-state"><h2>찾는 글이 없어요</h2><a class="btn" href="#">글 목록으로</a></div>';
  const same=POSTS.filter(x=>x.kind===p.kind),j=same.indexOf(p),older=same[j+1],newer=same[j-1];
  return `<div class="alay"><article class="art">
    <a class="back" href="${p.kind==='note'?'#notes':'#'}">← ${KIND[p.kind]}</a>
    <header><div class="kick">${kickOf(p)}</div><h1>${esc(p.title)}</h1>${p.lede?`<p class="lede2">${esc(p.lede)}</p>`:''}
      <div class="byline"><span class="aav sm">${esc((AUTHOR.name||'?').slice(0,1))}</span><b>${esc(AUTHOR.name||'')}</b><span>${metaLine(p)}</span></div>
      ${p.tags&&p.tags.length?`<div class="ptags">${tagsOf(p)}</div>`:''}</header>
    <div class="body">${p.html}</div>
    ${authorBox()}
    <nav class="artnav">${older?`<a href="#/${encodeURIComponent(older.slug)}"><small>이전 글</small>${esc(older.title)}</a>`:'<span></span>'}${newer?`<a href="#/${encodeURIComponent(newer.slug)}"><small>다음 글</small>${esc(newer.title)}</a>`:''}</nav>
    ${related(p)}</article><nav class="toc" id="toc" aria-label="목차"></nav></div>`;
}
/* 소제목으로 목차를 만들고, 읽는 위치를 표시한다 (넓은 화면에서만 보인다) */
function buildToc(){
  const toc=$('#toc');if(!toc)return;
  const hs=[...document.querySelectorAll('.art .body > h2')];
  if(hs.length<2){toc.remove();return}
  hs.forEach((h,i)=>{h.id='s'+(i+1)});
  toc.innerHTML=`<b>목차</b>${hs.map(h=>`<a href="#/${encodeURIComponent(location.hash.slice(2))}" data-to="${h.id}">${esc(h.textContent)}</a>`).join('')}`;
  toc.onclick=e=>{const a=e.target.closest('[data-to]');if(a){e.preventDefault();document.getElementById(a.dataset.to).scrollIntoView({behavior:'smooth'})}};
  const links=[...toc.querySelectorAll('a')];
  const io=new IntersectionObserver(es=>{for(const en of es)if(en.isIntersecting){links.forEach(l=>l.classList.toggle('on',l.dataset.to===en.target.id))}},{rootMargin:'0px 0px -70% 0px'});
  hs.forEach(h=>io.observe(h));
}
function route(){
  const h=decodeURIComponent(location.hash.replace(/^#/,''));
  let navKind='column';
  if(h.startsWith('/')){const p=POSTS.find(x=>x.slug===h.slice(1));navKind=p?p.kind:'column';$('#view').innerHTML=post(h.slice(1));
    document.title=p?`${p.title} | Draft Finder`:'Draft Finder';buildToc();
    document.querySelectorAll('.form').forEach(e=>{e.scrollLeft=e.scrollWidth})}   // 최근 흐름은 가장 최근 경기부터 보이게
  else{navKind=h==='notes'?'note':'column';$('#view').innerHTML=list(navKind);document.title='Draft Finder'}
  for(const k of['column','note'])$('#nav-'+k).setAttribute('aria-current',k===navKind?'page':'false');
  window.scrollTo({top:0});
}
window.addEventListener('hashchange',route);
fetch('posts.json').then(r=>r.json()).then(d=>{
  POSTS=d.posts;META=d.meta||{};AUTHOR=META.author||{};
  $('#demo-pill').hidden=!META.demo;
  $('#foot').textContent=(META.demo
    ?'데모 데이터입니다. 챔피언 이미지는 Riot Games Data Dragon을 사용했어요.'
    :"챔피언 이미지는 Riot Games Data Dragon을, 경기 데이터는 Oracle's Elixir(Tim Sevenhuysen)의 2026 파일을 사용했어요. 팀 로고는 각 팀의 허락을 받아 사용했어요.")+(AUTHOR.email?` 문의: ${AUTHOR.email}`:'');
  route();
}).catch(()=>{$('#view').innerHTML='<div class="card empty-state"><h2>글을 불러오지 못했어요</h2></div>'});
