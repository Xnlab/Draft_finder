'use strict';
/* Draft Finder 목업: 밴픽 찾기, 경기 상세(밴픽 쌍둥이), 피어리스 복기, 스포일러 방지 */
const ROLES=['top','jng','mid','bot','sup'];
const ROLE_KO={top:'탑',jng:'정글',mid:'미드',bot:'원딜',sup:'서폿'};
const ROLE_COLORS={top:'#e0484f',jng:'#118a49',mid:'#2f6df6',bot:'#f2a20c',sup:'#8b5cf6'};
const LEAGUE_COLORS=['#2f6df6','#e0484f','#f2a20c','#118a49','#8b5cf6','#0ea5b7'];
let CH=[],G=[],PATCHES=[],LEAGUES=[],CHIDX={},BYID={},SERIES=new Map(),SLIST=[],META={demo:true};
let POPRANK={},POPTOP={},POPTREND=null;
const S={blue:[-1,-1,-1,-1,-1],red:[-1,-1,-1,-1,-1],patch:'all',leagues:new Set(),sets:'all',pos:'any',flexOnly:false,
  tab:'full',shown:12,spoiler:false,revealed:new Set(),statsRevealed:false,detailId:null,
  series:null,sSet:0,sShown:1,sLeague:'all',sMore:24,sRevealed:new Set(),sEnd:false};
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmtGd=v=>v==null?'-':(v>0?'+':v<0?'−':'')+Math.abs(Math.round(v)).toLocaleString('ko-KR');
const fmtDate=d=>{const[,m,dd]=d.split('-');return `${+m}월 ${+dd}일`};
const pKey=p=>p.split('.').map(Number);
const hidden=id=>S.spoiler&&!S.revealed.has(id);       // 이 경기 결과를 가려야 하는가
const store={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};

/* ---------- 칼럼: columns/*.md 가 columns.json 으로 빌드돼 들어온다 ---------- */
let COLUMNS=[];

/* ---------- 필터 ---------- */
function passFilters(g){
  if(S.patch==='latest'&&g.p!==PATCHES[PATCHES.length-1])return false;
  if(S.patch==='last3'&&PATCHES.indexOf(g.p)<PATCHES.length-3)return false;
  if(S.leagues.size&&!S.leagues.has(g.lg))return false;
  if(S.sets==='early'&&g.s>3)return false;
  if(S.sets==='late'&&g.s<4)return false;
  return true;
}

/* ---------- 검색 ---------- */
function selection(){
  const sel=[];
  for(const side of['blue','red'])S[side].forEach((c,i)=>{if(c>=0)sel.push({side,i,c})});
  return sel;
}
function jacc(a,b){let n=0;for(const x of a)if(b.has(x))n++;const u=a.size+b.size-n;return u?n/u:0}
function evaluate(g,sel,persp){
  const exact=S.pos==='exact';
  const teams={b:g._b,r:g._r};
  let best=null;
  for(const flip of[false,true]){
    const map=flip?{blue:'r',red:'b'}:{blue:'b',red:'r'};
    let matched=0;const hl=new Set(),flex=[],roleOf={};
    for(const s of sel){
      const idx=g[map[s.side]].indexOf(s.c);
      if(idx<0||(exact&&idx!==s.i))continue;
      matched++;hl.add(s.c);roleOf[s.c]=idx;
      if(idx!==s.i)flex.push({c:s.c,from:s.i,to:idx});
    }
    let tie=0;
    for(const side of['blue','red']){
      const mine=new Set(S[side].filter(x=>x>=0));
      if(mine.size)tie+=jacc(mine,teams[map[side]]);
    }
    const cand={flip,map,matched,tie,hl,flex,roleOf};
    if(!best||matched>best.matched||(matched===best.matched&&tie>best.tie))best=cand;
  }
  if(best.matched===0)return null;
  const lanes=[];
  ROLES.forEach((_,i)=>{
    const a=S.blue[i],b=S.red[i];
    if(a<0||b<0)return;
    if(g[best.map.blue][i]===a&&g[best.map.red][i]===b)lanes.push(i);
  });
  const pGame=best.map[persp];
  const gd=g.gd==null?null:(pGame==='b'?g.gd:-g.gd);
  return {g,matched:best.matched,total:sel.length,tie:best.tie,hl:best.hl,flex:best.flex,roleOf:best.roleOf,lanes,pGame,gd,win:g.w===pGame};
}
function run(sel){
  const nb=sel.filter(s=>s.side==='blue').length,nr=sel.length-nb;
  const persp=nb>=nr?'blue':'red';
  const out=[];
  for(const g of G){if(!passFilters(g))continue;const r=evaluate(g,sel,persp);if(r)out.push(r)}
  out.sort((a,b)=>b.matched-a.matched||b.tie-a.tie||(a.g.d<b.g.d?1:a.g.d>b.g.d?-1:0));
  return {list:out,persp,both:nb>0&&nr>0};
}

/* ---------- 보드 ---------- */
function renderBoard(){
  for(const side of['blue','red']){
    const el=$('#slots-'+side);el.innerHTML='';
    S[side].forEach((cid,i)=>{
      const w=document.createElement('div');w.className='sw';
      const c=cid>=0?CH[cid]:null;
      w.innerHTML=`<button type="button" class="slot ${c?'filled':''}" data-side="${side}" data-i="${i}" aria-label="${side==='blue'?'블루':'레드'} ${ROLE_KO[ROLES[i]]} ${c?esc(c.ko):'고르기'}">
        <span class="rl">${ROLE_KO[ROLES[i]]}</span>
        ${c?`<span class="ic"><img src="${c.icon}" alt=""></span><span class="nm">${esc(c.ko)}</span>`:`<span class="ic empty">+</span><span class="nm hint">고르기</span>`}
      </button>${c?`<button type="button" class="clr" data-clear="1" data-side="${side}" data-i="${i}" aria-label="${esc(c.ko)} 지우기">×</button>`:''}`;
      el.appendChild(w);
    });
  }
}
function setBoard(b){
  S.blue.fill(-1);S.red.fill(-1);
  for(const side of['blue','red'])for(const[role,en]of Object.entries(b[side]||{}))if(CHIDX[en]!=null)S[side][ROLES.indexOf(role)]=CHIDX[en];
}
function example(k){
  S.sets='all';S.patch='all';S.pos='any';S.flexOnly=false;S.leagues.clear();S.tab='full';S.shown=12;
  if(k==='same')setBoard({blue:{jng:'Vi',mid:'Orianna'}});
  if(k==='lane')setBoard({blue:{mid:'Azir'},red:{mid:'Orianna'}});
  if(k==='flex')setBoard({blue:{mid:'Sylas'}});
  if(k==='game'){loadGame(G[Math.floor(Math.random()*G.length)].id);return}
  update();
}
function loadGame(id){
  const g=BYID[id];if(!g)return;
  closeDetail();S.flexOnly=false;
  S.blue=g.b.slice();S.red=g.r.slice();S.tab='full';S.shown=12;
  location.hash='search';route();update();window.scrollTo({top:0,behavior:'smooth'});
}
/* ---------- 필터 메뉴 ---------- */
const MENUS=['patch','league','set','pos'];
function closeMenus(){MENUS.forEach(k=>{$('#menu-'+k).hidden=true;$('#dd-'+k).setAttribute('aria-expanded','false')})}
function toggleMenu(k){
  const open=$('#menu-'+k).hidden;closeMenus();
  if(open){$('#menu-'+k).hidden=false;$('#dd-'+k).setAttribute('aria-expanded','true')}
}
function optBtn(on,label,sub,attr){return `<button type="button" class="${on?'on':''}" ${attr}><span class="ck">${on?'✓':''}</span><span>${label}${sub?`<span class="sub">${sub}</span>`:''}</span></button>`}
function renderFilters(){
  const last=PATCHES[PATCHES.length-1],l3=PATCHES[Math.max(PATCHES.length-3,0)];
  $('#menu-patch').innerHTML=
    optBtn(S.patch==='all','전체 패치',`${PATCHES[0]} ~ ${last}`,'data-patch="all"')+
    optBtn(S.patch==='latest','최신 패치',last,'data-patch="latest"')+
    optBtn(S.patch==='last3','최근 3패치',`${l3} ~ ${last}`,'data-patch="last3"');
  $('#menu-league').innerHTML=LEAGUES.map(l=>optBtn(S.leagues.has(l),esc(l),'',`data-league="${esc(l)}"`)).join('')+
    `<button type="button" data-league="*"><span class="ck"></span><span class="muted">모두 선택 해제 (전체)</span></button>`;
  $('#menu-set').innerHTML=
    optBtn(S.sets==='all','전체 세트','','data-sets="all"')+
    optBtn(S.sets==='early','1~3세트','','data-sets="early"')+
    optBtn(S.sets==='late','4~5세트','피어리스 후반 세트를 볼 때','data-sets="late"');
  $('#menu-pos').innerHTML=
    optBtn(S.pos==='any','포지션 상관없이','돌려쓰는 픽도 찾아요. 다른 포지션으로 쓴 경기는 표시돼요','data-pos="any"')+
    optBtn(S.pos==='exact','같은 포지션만','고른 칸의 포지션과 같을 때만 찾아요','data-pos="exact"');
  $('#dd-pos b').textContent=S.pos==='any'?'상관없이':'같은 포지션만';
  $('#dd-patch b').textContent={all:'전체',latest:'최신',last3:'최근 3패치'}[S.patch];
  $('#dd-league b').textContent=S.leagues.size===0?'전체':S.leagues.size<=2?[...S.leagues].join(', '):`${S.leagues.size}개`;
  $('#dd-set b').textContent={all:'전체',early:'1~3세트',late:'4~5세트'}[S.sets];
}

/* ---------- 카드 ---------- */
function icon(cid,hl,fx){
  if(cid<0)return `<div class="pk"><div class="pw"><div class="ph">?</div></div><span>없음</span></div>`;
  const c=CH[cid];
  const tag=fx!=null?`<em class="fx">${ROLE_KO[ROLES[fx]]}</em>`:'';
  return `<div class="pk ${hl.has(cid)?'hl':''}" title="${esc(c.ko)}${fx!=null?' · '+ROLE_KO[ROLES[fx]]+'로 사용':''}"><div class="pw"><img src="${c.icon}" alt="" width="40" height="40">${tag}</div><span>${esc(c.ko)}</span></div>`;
}
function gdWord(v){return v==null?'기록 없음':v>=1000?'크게 앞섰어요':v>=300?'앞섰어요':v>-300?'비슷했어요':v>-1000?'뒤졌어요':'크게 뒤졌어요'}
function cardHtml(r){
  const g=r.g,veil=hidden(g.id);
  const row=(code)=>{
    const ids=g[code],name=code==='b'?g.bt:g.rt;
    const mine=r.pGame===code,won=!veil&&g.w===code;
    return `<div class="gt ${code} ${won?'won':''}"><div class="gn"><b>${esc(name)}</b>${mine?'<small>고른 쪽</small>':''}${won?'<small class="w">승</small>':''}</div><div class="pks">${ids.map(c=>{const f=r.flex.find(x=>x.c===c);return icon(c,r.hl,f?f.to:null)}).join('')}</div></div>`;
  };
  const lanes=r.lanes.map(i=>`<span class="m lane">${ROLE_KO[ROLES[i]]} 맞대결 일치</span>`).join('');
  const fl=r.flex.slice(0,2).map(f=>`<span class="m flex">${esc(CH[f.c].ko)} · ${ROLE_KO[ROLES[f.to]]}로 사용</span>`).join('');
  const res=veil?`<button class="reveal" type="button" data-reveal="${g.id}">결과 보기</button>`:`<span class="gres ${r.win?'win':'loss'}">고른 쪽 ${r.win?'승':'패'}</span>`;
  const gd=veil?'<span class="gd">결과 가림 중</span>':`<span class="gd">15분 골드 ${fmtGd(r.gd)} · ${gdWord(r.gd)}</span>`;
  const ser=g.sg>1?`<span class="tag">시리즈 ${veil?'':g.sg+'세트 중 '}${g.s}세트</span>`:'';
  return `<article class="game card" data-open="${g.id}" tabindex="0" aria-label="${esc(g.bt)} 대 ${esc(g.rt)} 경기 자세히 보기">
    <div class="gh"><span class="lg">${esc(g.lg)}</span><span>${fmtDate(g.d)} · 패치 ${esc(g.p)} · ${g.s}세트</span>${g.inc?'<span class="tag warn">일부 누락</span>':''}${res}</div>
    ${row('b')}${row('r')}
    <div class="gf"><span class="m">${r.matched}/${r.total} 일치</span>${lanes}${fl}${gd}
      <button class="again" type="button" data-again="${g.id}">이 경기로 다시 찾기</button></div>
  </article>`;
}
function ringSvg(pct){
  const R=34,C=2*Math.PI*R,d=C*pct/100;
  return `<svg width="84" height="84" viewBox="0 0 84 84" role="img" aria-label="승률 ${pct}%"><circle cx="42" cy="42" r="${R}" fill="none" stroke="var(--line)" stroke-width="9"/><circle cx="42" cy="42" r="${R}" fill="none" stroke="var(--accent)" stroke-width="9" stroke-linecap="round" stroke-dasharray="${d} ${C}" transform="rotate(-90 42 42)"/><text x="42" y="47" text-anchor="middle" font-size="16" font-weight="800" fill="var(--fg)">${pct}%</text></svg>`;
}

/* ---------- 결과 ---------- */
function renderResults(){
  const box=$('#results'),sel=selection();
  if(!sel.length){
    box.innerHTML=`<div class="card empty-state" style="margin-top:16px"><h2>챔피언을 하나만 골라도 찾아 드려요</h2><p class="muted" style="margin:0">위 보드에서 칸을 누르거나, 예시 버튼을 눌러 보세요.</p></div>`;
    return;
  }
  const {list:all,persp,both}=run(sel);
  const total=sel.length;
  const full=all.filter(r=>r.matched===total);
  const part=total>1?all.filter(r=>r.matched<total&&r.matched>=Math.ceil(total/2)):[];
  if(S.tab==='full'&&!full.length&&part.length)S.tab='part';
  if(S.tab==='part'&&!part.length)S.tab='full';
  const tabList=S.tab==='full'?full:part;
  const flexCount=S.pos==='any'?tabList.filter(r=>r.flex.length).length:0;
  const fl=S.flexOnly&&flexCount>0;
  const list=fl?tabList.filter(r=>r.flex.length):tabList;
  const tabs=`<div class="tabs" role="tablist"><button role="tab" type="button" data-tab="full" aria-selected="${S.tab==='full'}">모두 일치<span>${full.length}</span></button>${total>1?`<button role="tab" type="button" data-tab="part" aria-selected="${S.tab==='part'}">일부 일치<span>${part.length}</span></button>`:''}</div>`
    +(flexCount?`<button class="fchip" type="button" id="flexbtn" aria-pressed="${fl}">다른 포지션으로 쓴 경기만 보기<b>${flexCount}</b></button>`:'');
  let story='';
  if(!list.length){
    story=`<div class="card story"><h2>조건에 맞는 경기가 없어요</h2><p>패치, 리그, 세트 조건을 넓히거나 챔피언을 줄여 보세요.</p></div>`;
  }else{
    const n=list.length,wins=list.filter(r=>r.win).length,pct=Math.round(wins/n*100);
    const gds=list.map(r=>r.gd).filter(v=>v!=null);
    const gd=gds.length?gds.reduce((a,v)=>a+v,0)/gds.length:null;
    const who=both?`${persp==='blue'?'블루':'레드'}로 고른 팀`:'고른 챔피언을 쓴 팀';
    const lg={};list.forEach(r=>lg[r.g.lg]=(lg[r.g.lg]||0)+1);
    const lgs=Object.entries(lg).sort((a,b)=>b[1]-a[1]);
    const head=S.tab==='full'?`고른 챔피언이 모두 나온 경기가 ${n.toLocaleString('ko-KR')}개 있어요`:`고른 챔피언 중 일부가 나온 경기가 ${n.toLocaleString('ko-KR')}개 있어요`;
    const veil=S.spoiler&&!S.statsRevealed;
    const tg=[];
    if(n<10)tg.push('<span class="tag warn">표본이 적어요. 참고용으로만 봐 주세요</span>');
    if(!veil){
      if(gd!=null)tg.push(gd>=300?'<span class="tag good">초반에 앞서는 편</span>':gd<=-300?'<span class="tag bad">초반에 밀리는 편</span>':'<span class="tag">초반은 비슷한 편</span>');
      tg.push(pct>=60?'<span class="tag good">이긴 경기가 더 많아요</span>':pct<=40?'<span class="tag bad">진 경기가 더 많아요</span>':'<span class="tag">승패가 비슷해요</span>');
    }
    tg.push(`<span class="tag">${esc(lgs[0][0])}에서 가장 많이 나왔어요 (${lgs[0][1]}경기)</span>`);
    if(flexCount)tg.push(`<span class="tag">다른 포지션으로 쓴 경기 ${flexCount}개</span>`);
    let useHtml='';
    if(S.pos==='any'){
      const seen=new Set(),rows=[];
      for(const s of selection()){
        if(seen.has(s.c))continue;seen.add(s.c);
        const cnt={};let tot=0;
        for(const r of list){const ix=r.roleOf[s.c];if(ix!=null){cnt[ix]=(cnt[ix]||0)+1;tot++}}
        if(!tot)continue;
        const ent=Object.entries(cnt).sort((a,b)=>b[1]-a[1]);
        rows.push(`<div class="urow"><img src="${CH[s.c].icon}" alt="" width="26" height="26"><span class="un">${esc(CH[s.c].ko)}</span><div class="ubar">${ent.map(([ix,c])=>`<i style="width:${c/tot*100}%;background:${ROLE_COLORS[ROLES[ix]]}" title="${ROLE_KO[ROLES[ix]]} ${c}경기"></i>`).join('')}</div><span class="utxt">${ent.map(([ix,c])=>`${ROLE_KO[ROLES[ix]]} ${c}`).join(' · ')}</span></div>`);
      }
      if(rows.length)useHtml=`<div class="use"><div class="k">고른 챔피언은 어느 포지션에서 쓰였을까요</div>${rows.slice(0,6).join('')}</div>`;
    }
    const leagueTile=`<div class="stat"><div class="k">나온 리그</div><div class="lbar">${lgs.map(([l,c],i)=>`<i style="width:${c/n*100}%;background:${LEAGUE_COLORS[i%LEAGUE_COLORS.length]}"></i>`).join('')}</div><div class="lleg">${lgs.slice(0,4).map(([l,c],i)=>`<span><em style="background:${LEAGUE_COLORS[i%LEAGUE_COLORS.length]}"></em><b>${esc(l)}</b> ${c}</span>`).join('')}</div></div>`;
    const stats=veil
      ?`<div class="stats"><div class="stat veilbox span2"><div class="k">결과 가림 중</div><p style="margin:4px 0 10px">승률과 골드 차이는 경기 결과를 알려 주기 때문에 가려 뒀어요.</p><button class="btn" type="button" data-stats>통계 보기</button></div>${leagueTile}</div>`
      :`<div class="stats">
        <div class="stat"><div class="k">${esc(who)} 승률</div><div class="ring">${ringSvg(pct)}<div><div class="v">${wins}승 ${n-wins}패</div><div class="s">${n}경기 중</div></div></div></div>
        <div class="stat"><div class="k">15분 평균 골드 차이</div><div class="v ${gd>0?'pos':gd<0?'neg':''}">${fmtGd(gd)}</div><div class="s">${esc(who)} 기준 · ${gdWord(gd)}</div></div>${leagueTile}</div>`;
    const lead=veil?'':`<p>${who}은 <b>${wins}번 이겼고(${pct}%)</b>${gd!=null?`, 15분에는 평균 <b class="${gd>0?'pos':gd<0?'neg':''}">${fmtGd(gd)}</b> 골드 ${gd>=0?'앞서':'뒤져'} 있었어요`:''}.</p>`;
    story=`<section class="card story"><h2>${head}</h2>${lead}<div class="tags">${tg.join('')}</div>${stats}${useHtml}</section>`;
  }
  const shown=list.slice(0,S.shown);
  box.innerHTML=`<div class="res-head">${tabs}</div>${story}${list.length?`<div class="games">${shown.map(cardHtml).join('')}</div>`:''}
    ${list.length>S.shown?`<button class="more" type="button" id="more">경기 ${Math.min(12,list.length-S.shown)}개 더 보기 (${list.length-S.shown}개 남음)</button>`:''}
    <details class="card how"><summary>이 결과는 어떻게 찾나요?</summary><p>고른 챔피언이 같은 팀에 얼마나 나왔는지로 찾아요. 밴은 따지지 않고, 포지션이 달라도 같은 챔피언이면 같은 것으로 봐요. 진영(블루/레드)이 바뀐 경기도 함께 찾아요. 같은 라인에서 두 챔피언이 마주친 경우에는 "맞대결 일치"가 따로 표시돼요.</p></details>`;
}

/* ---------- 경기 상세 + 밴픽 쌍둥이 ---------- */
const inter=(a,b)=>{let n=0;for(const x of a)if(b.has(x))n++;return n};
const byFit=(a,b)=>b.m-a.m||(a.o.d<b.o.d?1:a.o.d>b.o.d?-1:0);
/* 경기 전체(10명) 쌍둥이: 2026 데이터에서 8/10 이상은 1.6%뿐이라 7/10 이상만 "드문 경기"로 다룬다 */
function twins(g){
  const res=[];
  for(const o of G){
    if(o===g)continue;
    const m=Math.max(inter(g._b,o._b)+inter(g._r,o._r),inter(g._b,o._r)+inter(g._r,o._b));
    if(m>=7)res.push({o,m});
  }
  res.sort(byFit);
  return {top:res.slice(0,3),total:res.length};
}
/* 팀 조합 쌍둥이: 같은 5명이 나온 다른 경기 (실제 데이터에서 17.7%의 경기가 해당), 없으면 5명 중 4명 */
function teamTwins(g,code){
  const s=g['_'+code],res=[];
  for(const o of G){
    if(o===g)continue;
    const m=Math.max(inter(s,o._b),inter(s,o._r));
    if(m>=4)res.push({o,m});
  }
  res.sort(byFit);
  return {exact:res.filter(x=>x.m===5),near:res.filter(x=>x.m===4)};
}
function similarCount(g,code){
  const s=g['_'+code];let n=0;
  for(const o of G){if(o===g)continue;for(const k of['_b','_r']){let m=0;for(const c of o[k])if(s.has(c))m++;if(m>=3){n++;break}}}
  return n;
}
function dgRow(label,v){
  if(v==null)return `<div class="dg"><span>${label}</span><div class="dgbar"></div><span class="v muted">기록 없음</span></div>`;
  const w=Math.min(Math.abs(v)/4000,1)*50;
  const bar=v>=0?`<i style="right:50%;width:${w}%;background:var(--blue)"></i>`:`<i style="left:50%;width:${w}%;background:var(--red)"></i>`;
  const who=v===0?'비슷':(v>0?'블루 ':'레드 ')+fmtGd(Math.abs(v)).replace(/^[+−]/,'+');
  return `<div class="dg"><span>${label}</span><div class="dgbar">${bar}</div><span class="v" style="${v>0?'color:var(--blue)':v<0?'color:var(--red)':''}">${who}</span></div>`;
}
function openDetail(id){
  const g=BYID[id];if(!g)return;
  closeMenus();S.detailId=id;
  const veil=hidden(id);
  const selSet=new Set(selection().map(s=>s.c));
  const panel=(code)=>{
    const ids=g[code],bans=g[code==='b'?'bb':'rb'],name=code==='b'?g.bt:g.rt,won=!veil&&g.w===code,pl=g[code==='b'?'bp':'rp'];
    const rows=ids.map((c,i)=>{
      if(c<0)return `<div class="drow"><span class="dr">${ROLE_KO[ROLES[i]]}</span><div class="dn"><small>기록이 없어요</small></div></div>`;
      const ch=CH[c],main=ch.roles[0],fx=ROLES[i]!==main;
      const sub=[pl&&pl[i]?esc(pl[i]):'',fx?`<span class="tg">돌려쓰기</span>보통 ${ROLE_KO[main]}`:''].filter(Boolean).join(' · ');
      return `<div class="drow ${selSet.has(c)?'hl':''}"><span class="dr">${ROLE_KO[ROLES[i]]}</span><img src="${ch.icon}" alt="" width="38" height="38"><div class="dn"><b>${esc(ch.ko)}</b>${sub?`<small>${sub}</small>`:''}</div>${selSet.has(c)?'<span class="m">찾는 챔피언</span>':''}</div>`;
    }).join('');
    return `<div class="dteam ${code}"><h4>${esc(name)}<span class="muted" style="font-weight:500">${code==='b'?'블루':'레드'}</span>${won?'<span class="w">승</span>':''}</h4>${rows}
      <div class="bans"><span>밴</span>${bans.map(c=>`<img src="${CH[c].icon}" alt="${esc(CH[c].ko)}" title="${esc(CH[c].ko)}" width="28" height="28">`).join('')||'<small class="muted">기록 없음</small>'}</div></div>`;
  };
  const wName=g.w==='b'?g.bt:g.rt;
  const dot=s=>s?`<em style="background:var(--${s==='b'?'blue':'red'})"></em>`:'<em style="background:var(--faint)"></em>';
  const flexList=[];
  for(const code of['b','r'])g[code].forEach((c,i)=>{if(c>=0&&ROLES[i]!==CH[c].roles[0])flexList.push(`${CH[c].ko}(${ROLE_KO[ROLES[i]]})`)});
  const tw=twins(g);
  const item=(o,label)=>`<button class="twin" type="button" data-twin="${o.id}"><b>${label}</b><span>${esc(o.lg)} · ${fmtDate(o.d)} · 패치 ${esc(o.p)}</span><span class="muted">${esc(o.bt)} vs ${esc(o.rt)} · ${o.s}세트</span></button>`;
  const teamBlock=code=>{
    const t=teamTwins(g,code),nm=code==='b'?g.bt:g.rt,side=code==='b'?'블루':'레드';
    if(t.exact.length)return `<h6 class="th2">${esc(nm)} (${side}) 조합과 같은 5명이 나온 다른 경기 <b>${t.exact.length}개</b></h6><div class="twins">${t.exact.slice(0,3).map(x=>item(x.o,'5/5')).join('')}</div>`;
    if(t.near.length)return `<h6 class="th2">${esc(nm)} (${side}) 조합: 같은 5명은 없고, 5명 중 4명이 같은 경기 <b>${t.near.length}개</b></h6><div class="twins">${t.near.slice(0,2).map(x=>item(x.o,'4/5')).join('')}</div>`;
    return `<h6 class="th2">${esc(nm)} (${side}) 조합과 비슷한 경기가 거의 없어요</h6>`;
  };
  const rareHtml=tw.top.length?`<div class="callout"><b>드문 경기예요</b> 양 팀 10명 중 ${tw.top[0].m}명이 같은 다른 경기가 ${tw.total}개 있어요. 올해 이런 경기는 아주 드물어요.</div><div class="twins">${tw.top.map(({o,m})=>item(o,m+'/10')).join('')}</div>`:'';
  const twHtml=rareHtml+teamBlock('b')+teamBlock('r');
  const banner=veil
    ?`<div class="dwin veil">결과 가림 중<small>경기 결과와 흐름은 가려 뒀어요</small><button class="btn" type="button" data-reveal="${id}" style="margin-left:auto">결과 보기</button></div>`
    :`<div class="dwin">${esc(wName)} 승리<small>${g.len!=null?g.len+'분 경기 · ':''}${g.w==='b'?'블루':'레드'} 진영</small></div>`;
  const flow=veil?'':`<div class="dsec"><h5>경기 흐름 (골드 차이)</h5>${dgRow('10분',g.g10)}${dgRow('15분',g.gd)}${dgRow('20분',g.g20)}${dgRow('25분',g.g25)}
       <div class="objs"><span class="obj">첫 드래곤${dot(g.fd)}</span><span class="obj">첫 전령${dot(g.fh)}</span><span class="obj">첫 바론${dot(g.fb)}</span><span class="obj">첫 타워${dot(g.ft)}</span></div></div>`;
  $('#d-title').textContent=`${g.bt} vs ${g.rt}`;
  $('#d-sub').textContent=`${g.lg} · ${fmtDate(g.d)} · 패치 ${g.p} · ${g.s}세트`;
  $('#d-body').innerHTML=
    `${banner}
     <div class="dteams">${panel('b')}${panel('r')}</div>
     ${flexList.length?`<div class="dsec"><h5>이 경기의 돌려쓰기</h5><div class="objs">${flexList.map(t=>`<span class="obj">${esc(t)}</span>`).join('')}</div></div>`:''}
     <div class="dsec"><h5>밴픽 쌍둥이</h5>${twHtml}</div>
     ${flow}
     <div class="dsec"><h5>비슷한 경기</h5><p class="rel" style="margin:0">블루 조합과 3명 이상 겹치는 다른 경기 <b>${similarCount(g,'b')}개</b>, 레드 조합은 <b>${similarCount(g,'r')}개</b>예요.${g.inc?' 이 경기는 일부 기록이 비어 있어요.':''}</p></div>
     <div class="dact"><button class="btn primary" type="button" data-again="${id}">이 경기로 다시 찾기</button>${g.sg>1&&g.so?`<button class="btn" type="button" data-series="${g.sid}" data-sset="${g.s}">피어리스 시리즈 복기</button>`:''}<button class="btn" type="button" id="d-close2">닫기</button></div>`;
  $('#detail').hidden=false;$('#d-body').scrollTop=0;
  setTimeout(()=>$('#d-close').focus(),30);
}
function closeDetail(){$('#detail').hidden=true;S.detailId=null}

/* 포지션별 시즌 인기 순위 + 세트가 늘수록 인기 순위가 내려가는지 (4세트 이상 시리즈) */
function buildPop(){
  POPRANK={};POPTOP={};
  ROLES.forEach(r=>{
    const l=CH.filter(c=>(c.rc[r]||0)>0).sort((a,b)=>(b.rc[r]||0)-(a.rc[r]||0));
    POPTOP[r]=l.slice(0,8).map(c=>c.id);
    l.forEach((c,i)=>{POPRANK[r+':'+c.id]=i+1});
  });
  const sum={},cnt={};
  for(const s of SERIES.values()){
    if(!s.ok||s.k<4)continue;
    for(const g of s.games)for(const code of['b','r'])g[code].forEach((c,i)=>{
      const rk=c>=0?POPRANK[ROLES[i]+':'+c]:null;if(!rk)return;
      sum[g.s]=(sum[g.s]||0)+rk;cnt[g.s]=(cnt[g.s]||0)+1;
    });
  }
  const ns=Object.keys(cnt).map(Number).sort((a,b)=>a-b);
  POPTREND=ns.length>=3&&cnt[ns[0]]>=40?ns.map(n=>({n,avg:sum[n]/cnt[n]})):null;
}

/* ---------- 피어리스 복기 ---------- */
function consumedAfter(s,n){
  const m=new Map();
  for(const g of s.games.slice(0,n))for(const side of['b','r']){
    const tag=(side==='b'?g.bt:g.rt)===s.A?'A':'B';
    for(const c of g[side])if(c>=0)m.set(c,{set:g.s,tag});
  }
  return m;
}
function seriesVeil(s){return S.spoiler&&!S.sRevealed.has(s.id)}
function openSeries(sid,setNo){
  const s=SERIES.get(sid);if(!s)return;
  closeDetail();
  S.series=sid;S.sEnd=false;
  S.sShown=setNo||1;S.sSet=seriesVeil(s)?S.sShown:(setNo||s.k);
  location.hash='series';route();renderSeries();window.scrollTo({top:0});
}
function renderSeries(){
  const box=$('#series-box');if(!box||$('#view-series').hidden)return;
  const s=S.series!=null?SERIES.get(S.series):null;
  box.innerHTML=s?seriesDetail(s):seriesList();
}
function seriesList(){
  const base=SLIST.filter(x=>x.k>=3&&x.ok);
  const cnt={};base.forEach(x=>cnt[x.league]=(cnt[x.league]||0)+1);
  const lgs=Object.entries(cnt).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const list=S.sLeague==='all'?base:base.filter(x=>x.league===S.sLeague);
  const chips=`<button class="chip ${S.sLeague==='all'?'on':''}" type="button" data-sleague="all">전체 ${base.length.toLocaleString('ko-KR')}</button>`+lgs.map(([l,c])=>`<button class="chip ${S.sLeague===l?'on':''}" type="button" data-sleague="${esc(l)}">${esc(l)} ${c}</button>`).join('');
  const cards=list.slice(0,S.sMore).map(x=>{
    const sp=seriesVeil(x);
    return `<article class="card scard" data-series="${x.id}" tabindex="0"><div class="gh"><span class="lg">${esc(x.league)}</span><span>${fmtDate(x.date)}</span>${sp?'<span class="muted" style="margin-left:auto">세트 수 가림</span>':`<span class="muted" style="margin-left:auto">${x.k}세트</span>`}</div>
      <h3>${esc(x.A)} <span class="muted">vs</span> ${esc(x.B)}</h3>
      ${sp?'<p class="muted" style="margin:0">세트를 하나씩 열면서 복기해요</p>':`<p class="muted" style="margin:0">${esc(x.A)} ${x.wA} : ${x.wB} ${esc(x.B)} · 소진된 챔피언 ${x.used}명</p>`}</article>`;
  }).join('');
  return `<div class="page-h"><h1>피어리스 복기</h1><p class="muted">세트가 지날수록 쓸 수 있는 챔피언이 줄어들어요. 시리즈를 골라 세트마다 소진된 챔피언을 따라가 보세요.</p></div>
    <div class="tools" style="margin:0 0 14px">${chips}</div>
    <div class="cols" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr))">${cards}</div>
    ${list.length>S.sMore?`<button class="more" type="button" data-smore>시리즈 더 보기 (${list.length-S.sMore}개 남음)</button>`:''}`;
}
function teamPanelHtml(s,name,n){
  const rows=s.games.slice(0,n).map(g=>{
    const code=g.bt===name?'b':'r';
    return `<div class="trow"><span class="tset">${g.s}세트</span><div class="ticons">${g[code].map(c=>c<0?'<span class="tph">?</span>':`<img src="${CH[c].icon}" alt="${esc(CH[c].ko)}" title="${esc(CH[c].ko)}" width="36" height="36">`).join('')}</div></div>`;
  }).join('');
  return `<div class="tpanel"><h4>${esc(name)}</h4>${rows||'<p class="muted" style="margin:0">아직 쓴 챔피언이 없어요</p>'}</div>`;
}
function popBlockHtml(con){
  const total=ROLES.reduce((a,r)=>a+POPTOP[r].length,0),used=ROLES.reduce((a,r)=>a+POPTOP[r].filter(id=>con.has(id)).length,0);
  const rows=ROLES.map(r=>{
    const ids=POPTOP[r],left=ids.filter(id=>!con.has(id)).length;
    return `<div class="prow"><span class="un" style="color:${ROLE_COLORS[r]}">${ROLE_KO[r]}</span><div class="pops">${ids.map(id=>`<div class="pop ${con.has(id)?'used':''}" title="${esc(CH[id].ko)}${con.has(id)?' · 소진':''}"><img src="${CH[id].icon}" alt="${esc(CH[id].ko)}" width="36" height="36"></div>`).join('')}</div><span class="utxt">${left}/${ids.length} 남음</span></div>`;
  }).join('');
  return {total,used,rows};
}
function gameStripHtml(g){
  const veil=hidden(g.id);
  const team=code=>{
    const name=code==='b'?g.bt:g.rt,won=!veil&&g.w===code;
    return `<div class="gt ${code} ${won?'won':''}"><div class="gn"><b>${esc(name)}</b><small>${code==='b'?'블루':'레드'} 진영</small>${won?'<small class="w">승</small>':''}</div><div class="pks">${g[code].map(c=>c<0?`<div class="pk"><div class="pw"><div class="ph">?</div></div></div>`:`<div class="pk" title="${esc(CH[c].ko)}"><div class="pw"><img src="${CH[c].icon}" alt="" width="40" height="40"></div><span>${esc(CH[c].ko)}</span></div>`).join('')}</div></div>`;
  };
  const res=veil?`<button class="reveal" type="button" data-reveal="${g.id}">결과 보기</button>`:'';
  return `<article class="card game" data-open="${g.id}" tabindex="0"><div class="gh"><span class="lg">${esc(g.lg)}</span><span>${fmtDate(g.d)} · 패치 ${esc(g.p)} · ${g.s}세트</span>${res}</div>${team('b')}${team('r')}</article>`;
}

function seriesDetail(s){
  const sp=seriesVeil(s),k=s.k;
  const maxShown=sp?Math.min(S.sShown,k):k;
  if(S.sSet>maxShown)S.sSet=maxShown;
  const n=S.sSet,con=consumedAfter(s,n);
  const tabs=[0,...Array.from({length:maxShown},(_,i)=>i+1)].map(i=>`<button role="tab" type="button" data-sset-tab="${i}" aria-selected="${n===i}">${i===0?'시작 전':i+'세트 후'}</button>`).join('')
    +(sp?`<button class="chip" type="button" data-snext>다음 세트 열기 ▸</button>`:'');
  const score=sp?`<span class="muted">결과 가림 중</span> <button class="btn" type="button" data-sreveal>모두 공개</button>`
    :`<b>${esc(s.A)} ${s.wA} : ${s.wB} ${esc(s.B)}</b>`;

  const teamPanel=name=>teamPanelHtml(s,name,n);

  /* 2) 챔피언 풀: 사용 가능 / 이미 소진 / 이번 세트에 소진 */
  const now=new Set([...con].filter(([,u])=>u.set===n).map(([id])=>id));
  const pool=ROLES.map(r=>{
    const list=CH.filter(c=>c.roles[0]===r).sort((a,b)=>b.n-a.n);
    return `<div class="pg"><h6 style="color:${ROLE_COLORS[r]}">${ROLE_KO[r]} <small>${list.filter(c=>!con.has(c.id)).length}/${list.length}</small></h6><div class="pt">${list.map(c=>{const u=con.get(c.id);return `<div class="tile ${u?'used':''} ${u&&now.has(c.id)?'now':''}" title="${esc(c.ko)}${u?` · ${u.set}세트에 소진`:''}"><img src="${c.icon}" alt="" width="30" height="30" loading="lazy"></div>`}).join('')}</div></div>`;
  }).join('');

  const pop=popBlockHtml(con);
  const trend=POPTREND?`<p class="rel" style="margin:10px 0 0">세트가 늘수록 뽑히는 챔피언의 인기 순위가 내려가요. 4세트 이상 시리즈에서 포지션 안 평균 순위는 ${POPTREND.map(t=>`${t.n}세트 ${t.avg.toFixed(1)}위`).join(' → ')}예요.</p>`:'';

  /* 4) 세트별 밴픽 (진영별, 밴 포함) */
  const sets=s.games.slice(0,n).map(g=>{
    const veil=hidden(g.id)&&sp;
    const team=(code)=>{
      const name=code==='b'?g.bt:g.rt;
      return `<div class="gt ${code} ${(!veil&&g.w===code)?'won':''}"><div class="gn"><b>${esc(name)}</b><small>${code==='b'?'블루':'레드'} 진영</small>${(!veil&&g.w===code)?'<small class="w">승</small>':''}</div><div class="pks">${g[code].map(c=>c<0?`<div class="pk"><div class="pw"><div class="ph">?</div></div></div>`:`<div class="pk" title="${esc(CH[c].ko)}"><div class="pw"><img src="${CH[c].icon}" alt="" width="40" height="40"></div><span>${esc(CH[c].ko)}</span></div>`).join('')}</div></div>`;
    };
    const bans=(g.bb.concat(g.rb)).map(c=>`<img src="${CH[c].icon}" alt="" title="밴: ${esc(CH[c].ko)}" width="22" height="22">`).join('');
    return `<article class="card game" data-open="${g.id}" tabindex="0"><div class="gh"><span class="lg">${g.s}세트</span><span>${fmtDate(g.d)} · 패치 ${esc(g.p)}</span>${sp?'':`<span class="gres win">${esc(g.w==='b'?g.bt:g.rt)} 승</span>`}</div>${team('b')}${team('r')}<div class="gf"><span class="muted">밴</span><span class="bn">${bans}</span></div></article>`;
  }).join('');

  return `<button class="chip" type="button" data-sback>← 시리즈 목록</button>
    <div class="page-h" style="margin-top:12px"><h1>${esc(s.A)} <span class="muted">vs</span> ${esc(s.B)}</h1><p class="muted" style="margin:0">${esc(s.league)} · ${fmtDate(s.date)} · 패치 ${esc(s.games[0].p)} · ${score}${!s.ok?' · 시리즈 묶기가 불확실한 경기예요':''}</p></div>
    <div class="tabs" role="tablist" style="flex-wrap:wrap;margin-bottom:14px">${tabs}</div>
    ${sp&&S.sEnd?'<p class="muted">이 시리즈는 여기까지였어요.</p>':''}
    <section class="card story"><h2>${n===0?'시리즈가 시작되기 전, 모든 챔피언을 쓸 수 있어요':`${n}세트까지 챔피언 ${con.size}명이 소진됐어요`}</h2>
      <p>피어리스에서는 이미 뽑힌 챔피언을 같은 시리즈에서 다시 뽑을 수 없어요. 밴은 소진되지 않아요.</p>
      ${n>0?`<h5 class="sub5">팀별로 쓴 챔피언</h5><div class="tpanels">${teamPanel(s.A)}${teamPanel(s.B)}</div>`:''}
      <h5 class="sub5">전체 챔피언 풀</h5>
      <div class="lgd"><span><i class="tile-key"></i>사용 가능</span><span><i class="tile-key used"></i>이미 소진</span><span><i class="tile-key used now"></i>이번 세트에 소진</span></div>
      <div class="pool">${pool}</div>
      ${n>0?`<h5 class="sub5">인기 픽은 얼마나 남았을까 <span class="muted" style="font-weight:500">· 포지션별 시즌 인기 상위 ${POPTOP.top.length}명 중 ${pop.used}/${pop.total}명 소진</span></h5><div class="use">${pop.rows}</div>${trend}`:''}
    </section>
    ${n>0?`<div class="section-title"><h2>세트별 밴픽</h2></div><div class="games">${sets}</div>`:''}`;
}

/* ---------- 칼럼 ---------- */
function pickSeries(b){
  const ok=SLIST.filter(x=>x.ok&&x.k>=3);
  if(!ok.length)return SLIST[0]||null;
  if(b.pick==='latest')return ok[0];
  const mx=Math.max(...ok.map(x=>x.k));
  return ok.find(x=>x.k===mx);            // SLIST는 최신순이라, 가장 긴 시리즈 중 가장 최근 것
}
function pickGame(b){return b.id?BYID[b.id]:G[Math.min(Math.max(b.nth||0,0),G.length-1)]}
function colIcons(c){
  for(const b of c.blocks){
    if(b.type==='search')return[...Object.values(b.board.blue||{}),...Object.values(b.board.red||{})].map(en=>CHIDX[en]).filter(x=>x!=null);
    if(b.type==='series'){const s=pickSeries(b);if(s)return s.games[0].b.concat(s.games[0].r).filter(x=>x>=0).slice(0,6)}
    if(b.type==='game'){const g=pickGame(b);if(g)return g.b.concat(g.r).filter(x=>x>=0).slice(0,6)}
  }
  return[];
}
function colCard(c,i){
  const ids=colIcons(c);
  return `<article class="card col"><div class="kick">${esc(c.kick||'칼럼')} · ${fmtDate(c.date)}</div><h3>${esc(c.title)}</h3><p>${esc(c.lede)}</p>
    <div class="ics">${ids.map(id=>`<img src="${CH[id].icon}" alt="${esc(CH[id].ko)}" width="28" height="28">`).join('')}</div>
    <button type="button" data-col="${i}">칼럼 읽기</button></article>`;
}
function renderColumns(){
  const none='<p class="muted">아직 칼럼이 없어요.</p>';
  $('#col-strip').innerHTML=COLUMNS.slice(0,3).map(colCard).join('')||none;
  $('#col-list').innerHTML=COLUMNS.map(colCard).join('')||none;
}

/* 근거 상자는 검색기와 같은 계산을 쓴다. 검색 상태(S)를 잠깐 바꿔서 계산하고 원래대로 돌려놓는다. */
function withState(patch,fn){
  const saved={};for(const k of Object.keys(patch))saved[k]=S[k];
  try{Object.assign(S,patch);return fn()}finally{Object.assign(S,saved)}
}
const toArr=o=>ROLES.map(r=>o&&o[r]!=null&&CHIDX[o[r]]!=null?CHIDX[o[r]]:-1);
function searchLabel(b){
  const part=side=>Object.entries(b.board[side]||{}).map(([r,en])=>`${ROLE_KO[r]} ${esc(CHIDX[en]!=null?CH[CHIDX[en]].ko:en)}`).join(' + ');
  const bl=part('blue'),rd=part('red');
  const f=[];
  if(b.sets==='late')f.push('4~5세트');
  if(b.sets==='early')f.push('1~3세트');
  if(b.patch==='latest')f.push('최신 패치');
  if(b.patch==='last3')f.push('최근 3패치');
  if(b.leagues&&b.leagues.length)f.push(b.leagues.join('·'));
  if(b.pos==='exact')f.push('같은 포지션만');
  return{q:bl&&rd?`${bl} vs ${rd}`:(bl||rd),f};
}
function searchWidget(b,ref){
  const miss=[];
  for(const side of['blue','red'])for(const en of Object.values(b.board[side]||{}))if(CHIDX[en]==null)miss.push(en);
  if(miss.length)return `<section class="wbox"><div class="wh"><span class="b">근거</span><span>챔피언을 찾을 수 없어요: ${esc(miss.join(', '))}</span></div></section>`;
  const st={blue:toArr(b.board.blue),red:toArr(b.board.red),patch:b.patch||'all',sets:b.sets||'all',pos:b.pos||'any',leagues:new Set(b.leagues||[])};
  const res=withState(st,()=>{const sel=selection();return{sel,...run(sel)}});
  const total=res.sel.length,list=res.list.filter(r=>r.matched===total);
  const lab=searchLabel(b);
  const head=`<div class="wh"><span class="b">근거</span><span>${lab.q}</span>${lab.f.map(x=>`<span class="tag">${esc(x)}</span>`).join('')}</div>`;
  if(!list.length)return `<section class="wbox">${head}<p class="muted" style="margin:0">조건에 맞는 경기가 없어요.</p></section>`;
  const n=list.length,wins=list.filter(r=>r.win).length,pct=Math.round(wins/n*100);
  const gds=list.map(r=>r.gd).filter(v=>v!=null),gd=gds.length?gds.reduce((a,v)=>a+v,0)/gds.length:null;
  const veil=S.spoiler&&!S.statsRevealed;
  const who=res.both?`${res.persp==='blue'?'블루':'레드'}로 고른 팀`:'고른 챔피언을 쓴 팀';
  const stats=veil
    ?`<div class="wstats one"><div>결과 가림 중이라 승률과 골드 차이는 가렸어요. <button class="btn" type="button" data-stats>통계 보기</button></div></div>`
    :`<div class="wstats"><div><b>${n.toLocaleString('ko-KR')}</b>찾은 경기</div><div><b>${pct}%</b>${esc(who)} 승률 (${wins}승 ${n-wins}패)</div><div><b>${fmtGd(gd)}</b>15분 평균 골드 차이</div></div>`;
  const small=n<10?'<p style="margin:0 0 10px"><span class="tag warn">표본이 적어요. 참고용으로만 봐 주세요</span></p>':'';
  return `<section class="wbox">${head}${stats}${small}<div class="games one">${list.slice(0,3).map(cardHtml).join('')}</div>
    <div class="dact" style="margin-top:12px"><button class="btn" type="button" data-wsearch="${ref}">검색기에서 열기 (${n.toLocaleString('ko-KR')}경기 전체)</button></div></section>`;
}
function seriesWidget(b){
  const s=pickSeries(b);if(!s)return '';
  const n=Math.min(Math.max(b.set==null?s.k:b.set,0),s.k),con=consumedAfter(s,n),pop=popBlockHtml(con);
  return `<section class="wbox"><div class="wh"><span class="b">근거</span><span>${esc(s.league)} · ${fmtDate(s.date)} · ${esc(s.A)} vs ${esc(s.B)}</span><span class="tag">${n}세트 후</span></div>
    <p style="margin:0 0 10px"><b>${n}세트까지 챔피언 ${con.size}명이 소진됐어요.</b> 인기 상위 ${pop.total}명 중 ${pop.used}명이 이미 쓰였어요.</p>
    <div class="tpanels">${teamPanelHtml(s,s.A,n)}${teamPanelHtml(s,s.B,n)}</div>
    <h5 class="sub5">인기 픽은 얼마나 남았을까</h5><div class="use">${pop.rows}</div>
    <div class="dact" style="margin-top:12px"><button class="btn" type="button" data-wseries="${s.id}:${n}">시리즈 복기 열기</button></div></section>`;
}
function gameWidget(b){
  const g=pickGame(b);if(!g)return '';
  return `<section class="wbox"><div class="wh"><span class="b">근거</span><span>경기 하나</span></div><div class="games one">${gameStripHtml(g)}</div></section>`;
}
function renderColumn(i){
  S.col=i;
  const c=COLUMNS[i],box=$('#column-box');
  if(!c){box.innerHTML='<div class="card empty-state"><h2>찾는 칼럼이 없어요</h2><p class="muted" style="margin:0 0 12px">칼럼 목록으로 돌아가 주세요.</p><a class="btn" href="#columns">칼럼 목록</a></div>';return}
  const body=c.blocks.map((b,j)=>{
    if(b.type==='p')return `<p>${esc(b.text)}</p>`;
    if(b.type==='h')return `<h2>${esc(b.text)}</h2>`;
    if(b.type==='search')return searchWidget(b,`${i}:${j}`);
    if(b.type==='series')return seriesWidget(b);
    if(b.type==='game')return gameWidget(b);
    return '';
  }).join('');
  const older=COLUMNS[i+1],newer=COLUMNS[i-1];
  box.innerHTML=`<article class="art"><a class="chip" href="#columns">← 칼럼 목록</a>
    <header><div class="kick">${esc(c.kick||'칼럼')} · ${fmtDate(c.date)}</div><h1>${esc(c.title)}</h1>${c.lede?`<p class="lede2">${esc(c.lede)}</p>`:''}</header>${body}
    <nav class="artnav">${older?`<a href="#column-${i+1}"><small>이전 글</small>${esc(older.title)}</a>`:'<span></span>'}${newer?`<a href="#column-${i-1}"><small>다음 글</small>${esc(newer.title)}</a>`:''}</nav></article>`;
}
function openWidgetSearch(ref){
  const[i,j]=ref.split(':').map(Number),b=COLUMNS[i].blocks[j];
  S.patch=b.patch||'all';S.sets=b.sets||'all';S.pos=b.pos||'any';S.leagues=new Set(b.leagues||[]);
  S.flexOnly=false;S.tab='full';S.shown=12;
  setBoard(b.board);
  location.hash='search';route();update();window.scrollTo({top:0});
}

/* ---------- 챔피언 고르기 ---------- */
let P=null;
const CHO='ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const cho=s=>[...s].map(ch=>{const c=ch.charCodeAt(0)-0xAC00;return c>=0&&c<11172?CHO[Math.floor(c/588)]:ch}).join('');
function openPicker(side,i){
  P={side,i,tab:ROLES[i]};
  $('#p-title').textContent=`${side==='blue'?'블루':'레드'} · ${ROLE_KO[ROLES[i]]} 챔피언 고르기`;
  $('#p-q').value='';
  $('#picker').hidden=false;renderPicker();
  setTimeout(()=>$('#p-q').focus(),30);
}
function closePicker(){$('#picker').hidden=true;P=null}
function renderPicker(){
  if(!P)return;
  const tabs=[['all','전체'],...ROLES.map(r=>[r,ROLE_KO[r]])];
  $('#p-tabs').innerHTML=tabs.map(([k,l])=>`<button type="button" role="tab" data-ptab="${k}" aria-selected="${P.tab===k}">${l}</button>`).join('');
  const q=$('#p-q').value.trim().toLowerCase();
  const taken=new Set([...S.blue,...S.red].filter(x=>x>=0));
  const cur=S[P.side][P.i];if(cur>=0)taken.delete(cur);
  const list=CH.filter(c=>(P.tab==='all'||c.roles.includes(P.tab))&&(!q||c.ko.includes(q)||cho(c.ko).includes(q)||c.en.toLowerCase().includes(q))).sort((a,b)=>a.ko.localeCompare(b.ko,'ko'));
  $('#p-grid').innerHTML=list.length?list.map(c=>`<button type="button" class="cell" data-pick="${c.id}" ${taken.has(c.id)?'disabled title="이미 고른 챔피언이에요"':''}><img src="${c.icon}" alt="" width="48" height="48"><span>${esc(c.ko)}</span></button>`).join(''):`<div class="nores">찾는 챔피언이 없어요. 다른 탭에서 찾아보세요.</div>`;
}

/* ---------- 이벤트 ---------- */
function refresh(){renderResults();renderSeries();if(!$('#view-column').hidden)renderColumn(S.col);if(S.detailId)openDetail(S.detailId)}
function update(){renderBoard();renderFilters();renderResults()}
document.addEventListener('click',e=>{
  const t=e.target;
  // 결과 공개 버튼은 카드 클릭(상세 열기)보다 먼저 처리한다
  const rv=t.closest('[data-reveal]');if(rv){S.revealed.add(rv.dataset.reveal);refresh();return}
  if(t.closest('[data-stats]')){S.statsRevealed=true;renderResults();return}
  if(t.closest('[data-sreveal]')){S.sRevealed.add(S.series);S.sEnd=false;renderSeries();return}
  const clr=t.closest('.clr');if(clr){S[clr.dataset.side][+clr.dataset.i]=-1;S.shown=12;update();return}
  const slot=t.closest('.slot');if(slot){openPicker(slot.dataset.side,+slot.dataset.i);return}
  const ex=t.closest('[data-ex]');if(ex){example(ex.dataset.ex);return}
  const ag=t.closest('[data-again]');if(ag){loadGame(ag.dataset.again);return}
  const co=t.closest('[data-col]');if(co){location.hash='column-'+co.dataset.col;window.scrollTo({top:0});return}
  const ws=t.closest('[data-wsearch]');if(ws){openWidgetSearch(ws.dataset.wsearch);return}
  const wr=t.closest('[data-wseries]');if(wr){const[a,b]=wr.dataset.wseries.split(':');openSeries(+a,+b);return}
  const tw=t.closest('[data-twin]');if(tw){openDetail(tw.dataset.twin);return}
  const sv=t.closest('button[data-series]');if(sv){openSeries(+sv.dataset.series,sv.dataset.sset?+sv.dataset.sset:null);return}
  const sc=t.closest('article[data-series]');if(sc){openSeries(+sc.dataset.series,null);return}
  if(t.closest('[data-sback]')){S.series=null;renderSeries();window.scrollTo({top:0});return}
  const sl=t.closest('[data-sleague]');if(sl){S.sLeague=sl.dataset.sleague;S.sMore=24;renderSeries();return}
  if(t.closest('[data-smore]')){S.sMore+=24;renderSeries();return}
  const st=t.closest('[data-sset-tab]');if(st){S.sSet=+st.dataset.ssetTab;S.sEnd=false;renderSeries();return}
  if(t.closest('[data-snext]')){
    const s=SERIES.get(S.series);
    if(S.sShown<s.k){S.sShown++;S.sSet=S.sShown;S.sEnd=false}else{S.sEnd=true;S.sRevealed.add(s.id)}
    renderSeries();return;
  }
  const tb=t.closest('[data-tab]');if(tb){S.tab=tb.dataset.tab;S.shown=12;renderResults();return}
  if(t.closest('#flexbtn')){S.flexOnly=!S.flexOnly;S.shown=12;renderResults();return}
  if(t.closest('#more')){S.shown+=12;renderResults();return}
  const mb=t.closest('.menu button');
  if(mb){
    if(mb.dataset.patch){S.patch=mb.dataset.patch;closeMenus()}
    if(mb.dataset.sets){S.sets=mb.dataset.sets;closeMenus()}
    if(mb.dataset.pos){S.pos=mb.dataset.pos;closeMenus()}
    if(mb.dataset.league){if(mb.dataset.league==='*')S.leagues.clear();else{const l=mb.dataset.league;S.leagues.has(l)?S.leagues.delete(l):S.leagues.add(l)}}
    S.shown=12;update();
    if(mb.dataset.league)toggleMenu('league');
    return;
  }
  const op=t.closest('[data-open]');
  if(op&&!t.closest('button')){openDetail(op.dataset.open);return}
  if(!t.closest('.dd'))closeMenus();
});
document.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&e.target.matches){
    if(e.target.matches('article[data-open]'))openDetail(e.target.dataset.open);
    else if(e.target.matches('article[data-series]'))openSeries(+e.target.dataset.series,null);
  }
  if(e.key==='Escape'){if(!$('#picker').hidden)closePicker();if(!$('#detail').hidden)closeDetail();closeMenus()}
});
MENUS.forEach(k=>$('#dd-'+k).onclick=e=>{e.stopPropagation();toggleMenu(k)});
$('#reset').onclick=()=>{S.blue.fill(-1);S.red.fill(-1);S.shown=12;update()};
$('#p-q').addEventListener('input',renderPicker);
$('#p-close').onclick=closePicker;
$('#picker').addEventListener('click',e=>{
  if(e.target.id==='picker'){closePicker();return}
  const t=e.target.closest('[data-ptab]');if(t){P.tab=t.dataset.ptab;renderPicker();return}
  const c=e.target.closest('[data-pick]');if(c&&P){S[P.side][P.i]=+c.dataset.pick;S.shown=12;closePicker();update()}
});
$('#d-close').onclick=closeDetail;
$('#detail').addEventListener('click',e=>{if(e.target.id==='detail'||e.target.id==='d-close2')closeDetail()});
$('#spoiler').onclick=()=>{
  S.spoiler=!S.spoiler;S.revealed.clear();S.sRevealed.clear();S.statsRevealed=false;S.sEnd=false;
  store.set('df-spoiler',S.spoiler?'1':'0');
  if(S.series!=null){const s=SERIES.get(S.series);S.sShown=Math.min(S.sSet||1,s.k);if(S.spoiler)S.sSet=S.sShown}
  syncSpoiler();refresh();
};
function syncSpoiler(){
  const b=$('#spoiler');b.setAttribute('aria-checked',String(S.spoiler));
  b.querySelector('span').textContent=S.spoiler?'결과 가리는 중':'결과 가리기';
}

/* ---------- 화면 전환 + 시작 ---------- */
function route(){
  const h=location.hash,m=/^#column-(\d+)$/.exec(h);
  const v=m?'column':h==='#columns'?'columns':h==='#series'?'series':'search';
  for(const k of['search','series','columns','column'])$('#view-'+k).hidden=k!==v;
  const nav=v==='column'?'columns':v;
  for(const k of['search','series','columns'])$('#nav-'+k).setAttribute('aria-current',k===nav?'page':'false');
  if(v==='series')renderSeries();
  if(v==='column')renderColumn(+m[1]);
}
window.addEventListener('hashchange',route);

Promise.all([fetch('champs.json').then(r=>r.json()),fetch('games.json').then(r=>r.json()),fetch('meta.json').then(r=>r.json()).catch(()=>({demo:true})),fetch('columns.json').then(r=>r.json()).catch(()=>[])]).then(([c,g,m,cols])=>{
  CH=c;G=g;META=m;COLUMNS=cols;CH.forEach(x=>CHIDX[x.en]=x.id);
  for(const x of G){
    BYID[x.id]=x;x._b=new Set(x.b.filter(v=>v>=0));x._r=new Set(x.r.filter(v=>v>=0));
    if(x.sid!=null){let s=SERIES.get(x.sid);if(!s){s={id:x.sid,games:[]};SERIES.set(x.sid,s)}s.games.push(x)}
  }
  for(const s of SERIES.values()){
    s.games.sort((a,b)=>a.s-b.s);
    const f=s.games[0];
    s.league=f.lg;s.date=f.d;s.A=f.bt;s.B=f.rt;s.k=s.games.length;s.ok=f.so!==false&&f.s===1;
    s.wA=s.games.filter(x=>(x.w==='b'?x.bt:x.rt)===s.A).length;s.wB=s.k-s.wA;
    s.used=new Set(s.games.flatMap(x=>x.b.concat(x.r)).filter(v=>v>=0)).size;
  }
  buildPop();
  SLIST=[...SERIES.values()].sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:b.id-a.id);
  PATCHES=[...new Set(G.map(x=>x.p))].sort((a,b)=>{const A=pKey(a),B=pKey(b);return A[0]-B[0]||A[1]-B[1]});
  LEAGUES=[...new Set(G.map(x=>x.lg))].sort();
  if(!META.demo){$('#demo-pill').hidden=true;$('#foot').textContent='챔피언 이미지는 Riot Games Data Dragon, 경기 데이터는 Oracle\'s Elixir 2026 파일을 사용했어요. (로컬 확인용)'}
  S.spoiler=store.get('df-spoiler')==='1';syncSpoiler();
  setBoard({blue:{jng:'Vi',mid:'Orianna'}});
  renderColumns();route();update();
}).catch(err=>{console.error(err);$('#results').innerHTML='<div class="card empty-state"><h2>데이터를 불러오지 못했어요</h2><p class="muted" style="margin:0">잠시 후 다시 열어 주세요.</p></div>'});
