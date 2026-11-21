/* 공개 칼럼 사이트: 글 목록과 글. 근거 상자는 사이트를 만들 때 미리 계산해 둔 HTML이라, 여기서는 보여 주기만 한다. */
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmtDate=d=>{const[y,m,dd]=d.split('-');return `${y}년 ${+m}월 ${+dd}일`};
const KIND={column:'칼럼',note:'분석 노트'};
let POSTS=[],META={};

function card(p){
  return `<a class="card post" href="#/${encodeURIComponent(p.slug)}"><div class="kick">${p.draft?'<span class="tag warn">초안</span> ':''}${esc(p.kind==='note'?KIND.note:(p.kick||KIND.column))} · ${fmtDate(p.date)}</div>
    <h3>${esc(p.title)}</h3>${p.lede?`<p>${esc(p.lede)}</p>`:''}
    ${p.icons&&p.icons.length?`<div class="ics">${p.icons.map(i=>`<img src="${esc(i)}" alt="" width="28" height="28">`).join('')}</div>`:''}</a>`;
}
function list(kind){
  const ps=POSTS.filter(p=>p.kind===kind);
  const intro=kind==='note'
    ?'<div class="intro"><h1>분석 노트</h1><p>가설을 세우고 데이터로 확인한 기록이에요. 확인하지 못한 결과와 고친 계산도 남겨요.</p></div>'
    :'<div class="intro"><h1>칼럼</h1><p>경기를 보고 쓴 분석 글이에요. 글 안의 상자는 실제 경기 데이터에서 계산한 근거예요.</p></div>';
  return intro+(ps.length?`<div class="plist">${ps.map(card).join('')}</div>`:'<div class="card empty-state"><h2>아직 글이 없어요</h2></div>');
}
function post(slug){
  const i=POSTS.findIndex(p=>p.slug===slug),p=POSTS[i];
  if(!p)return '<div class="card empty-state"><h2>찾는 글이 없어요</h2><a class="btn" href="#">글 목록으로</a></div>';
  const same=POSTS.filter(x=>x.kind===p.kind),j=same.indexOf(p),older=same[j+1],newer=same[j-1];
  return `<article class="art"><a class="chip" href="${p.kind==='note'?'#notes':'#'}">← ${KIND[p.kind]} 목록</a>
    <header><div class="kick">${p.draft?'<span class="tag warn">초안</span> ':''}${esc(p.kind==='note'?KIND.note:(p.kick||KIND.column))} · ${fmtDate(p.date)}</div><h1>${esc(p.title)}</h1>${p.lede?`<p class="lede2">${esc(p.lede)}</p>`:''}</header>
    ${p.html}
    <nav class="artnav">${older?`<a href="#/${encodeURIComponent(older.slug)}"><small>이전 글</small>${esc(older.title)}</a>`:'<span></span>'}${newer?`<a href="#/${encodeURIComponent(newer.slug)}"><small>다음 글</small>${esc(newer.title)}</a>`:''}</nav></article>`;
}
function route(){
  const h=decodeURIComponent(location.hash.replace(/^#/,''));
  let navKind='column';
  if(h.startsWith('/')){const p=POSTS.find(x=>x.slug===h.slice(1));navKind=p?p.kind:'column';$('#view').innerHTML=post(h.slice(1));
    document.title=p?`${p.title} · Draft Finder`:'Draft Finder'}
  else{navKind=h==='notes'?'note':'column';$('#view').innerHTML=list(navKind);document.title='Draft Finder'}
  for(const k of['column','note'])$('#nav-'+k).setAttribute('aria-current',k===navKind?'page':'false');
  window.scrollTo({top:0});
}
window.addEventListener('hashchange',route);
fetch('posts.json').then(r=>r.json()).then(d=>{
  POSTS=d.posts;META=d.meta||{};
  $('#demo-pill').hidden=!META.demo;
  $('#foot').textContent=META.demo
    ?'데모 데이터입니다. 챔피언 이미지는 Riot Games Data Dragon을 사용했어요.'
    :"챔피언 이미지는 Riot Games Data Dragon을, 경기 데이터는 Oracle's Elixir(Tim Sevenhuysen)의 2026 파일을 사용했어요.";
  route();
}).catch(()=>{$('#view').innerHTML='<div class="card empty-state"><h2>글을 불러오지 못했어요</h2></div>'});
