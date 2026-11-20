'use strict';
/* Draft Finder 목업: 밴픽 찾기, 경기 상세(밴픽 쌍둥이), 피어리스 복기, 스포일러 방지 */
const ROLES=['top','jng','mid','bot','sup'];
const ROLE_KO={top:'탑',jng:'정글',mid:'미드',bot:'원딜',sup:'서폿'};
const ROLE_COLORS={top:'#e0484f',jng:'#118a49',mid:'#2f6df6',bot:'#f2a20c',sup:'#8b5cf6'};
const LEAGUE_COLORS=['#2f6df6','#e0484f','#f2a20c','#118a49','#8b5cf6','#0ea5b7'];
let CH=[],G=[],PATCHES=[],LEAGUES=[],CHIDX={},BYID={},SERIES=new Map(),SLIST=[],META={demo:true};
let POPRANK={},POPTOP={},POPTREND=null;
let TEAMS=[],TEAMIDX={},LDIST={};
const S={blue:[-1,-1,-1,-1,-1],red:[-1,-1,-1,-1,-1],patch:'all',leagues:new Set(),sets:'all',pos:'any',flexOnly:false,
  tab:'full',shown:12,spoiler:false,revealed:new Set(),statsRevealed:false,detailId:null,
  series:null,sSet:0,sShown:1,sLeague:'all',sMore:24,sRevealed:new Set(),sEnd:false,
  teams:[],tq:'',tlg:'all',fMore:12,tMore:12,persp:null,team:null,myTeam:null,changing:false};
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
    return `<div class="dteam ${code}"><h4>${teamLink(name)}<span class="muted" style="font-weight:500">${code==='b'?'블루':'레드'}</span>${won?'<span class="w">승</span>':''}</h4>${rows}
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
     ${readHtml(g,id)}
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

/* ---------- 경기 읽기 (데이터 해설자 v1): 규칙으로 고른 사실만 문장으로 ---------- */
const ARC_LABEL={rout:'압승',latewin:'후반에 크게 앞선 승리',closewin:'접전 끝에 승리',comeback:'역전승',closeloss:'접전 끝에 패배',lateloss:'후반에 크게 밀린 패배',blown:'역전패',early:'초반부터 밀린 패배'};
const ARC_ORDER=['rout','latewin','closewin','comeback','closeloss','lateloss','blown','early'];
const ARC_TONE={rout:'good',latewin:'good',closewin:'good',comeback:'good',closeloss:'bad',lateloss:'bad',blown:'bad',early:'bad'};
/* 한 팀 기준 골드 차이 곡선 [10분, 15분, 20분, 25분]. 하나라도 비면 null */
function curve(g,code){const s=code==='b'?1:-1,p=[g.g10,g.gd,g.g20,g.g25];return p.some(v=>v==null)?null:p.map(v=>v*s)}
/* 흐름 유형: 기획서의 분류 기준과 같다 (이기면 역전승/압승/접전, 지면 역전패/초반 밀림/접전) */
function arcOf(g,code){
  g._arc=g._arc||{};
  if(g._arc[code]!==undefined)return g._arc[code];
  const v=curve(g,code);let a=null;
  if(v){
    const win=g.w===code,lead=Math.max(...v),trail=Math.min(...v);
    // 이기면: 역전승 > 압승 > 후반에 크게 앞선 승리(25분 +3,000 이상) > 접전. 지면 같은 순서로 반대.
    a=win?(trail<=-2000?'comeback':(v[1]>=2500&&trail>-500)?'rout':v[3]>=3000?'latewin':'closewin')
         :(lead>=2000?'blown':(v[0]<=-1000||v[1]<=-2500)?'early':v[3]<=-3000?'lateloss':'closeloss');
  }
  return g._arc[code]=a;
}
function arcText(a,v){
  const[f,m]=v,mx=Math.max(...v),mn=Math.min(...v);
  return{rout:`처음부터 앞서 나간 경기였어요. 15분에 ${fmtGd(m)} 앞서 있었어요.`,
    latewin:`초반엔 팽팽했지만 중후반에 격차를 벌린 경기였어요. 25분에 ${fmtGd(v[3])} 앞서 있었어요.`,
    lateloss:`초반엔 팽팽했지만 중후반에 격차가 벌어진 경기였어요. 25분에 ${fmtGd(v[3])}였어요.`,
    closewin:`끝까지 접전이었고 이겼어요. 골드 차이는 ${fmtGd(mn)}에서 ${fmtGd(mx)} 사이를 오갔어요.`,
    comeback:`뒤지다 뒤집은 경기였어요. 가장 크게 뒤진 시점은 ${fmtGd(mn)}였어요.`,
    closeloss:`끝까지 접전이었지만 졌어요. 골드 차이는 ${fmtGd(mn)}에서 ${fmtGd(mx)} 사이를 오갔어요.`,
    blown:`앞서다 뒤집힌 경기였어요. 가장 크게 앞선 시점은 ${fmtGd(mx)}였어요.`,
    early:`초반부터 밀린 경기였어요. 10분에 ${fmtGd(f)}, 15분에 ${fmtGd(m)}였어요.`}[a];
}
function priorTwin(g,code){
  g._tw=g._tw||{};
  if(g._tw[code]!==undefined)return g._tw[code];
  const mine=g['_'+code];let found=null;
  for(let i=g._i-1;i>=0&&!found;i--){
    const o=G[i];
    if(inter(mine,o._b)===5&&mine.size===5)found={d:o.d,lg:o.lg,team:o.bt};
    else if(inter(mine,o._r)===5&&mine.size===5)found={d:o.d,lg:o.lg,team:o.rt};
  }
  return g._tw[code]=found;
}
/* 이 경기를 이 팀 시점으로 읽는다. spoils=true인 문장은 "결과 가리기"에서 숨긴다. */
function narrate(g,code){
  const v=curve(g,code),a=arcOf(g,code),notes=[];
  const nw=(g._new&&g._new[code])||[];
  const late=g.s>=3?' 피어리스 후반 세트라 선택지가 줄어든 영향도 있을 수 있어요.':'';
  if(nw.length>=3)notes.push({p:1,t:`올해 처음 꺼낸 픽이 ${nw.length}개예요 (${nw.map(c=>CH[c].ko).join(', ')}).${late}`});
  else if(nw.length)notes.push({p:4,t:`올해 처음 꺼낸 픽: ${nw.map(c=>CH[c].ko).join(', ')}.${g.s>=3?' (피어리스 후반 세트)':''}`});
  const tw=priorTwin(g,code);
  if(tw)notes.push({p:2,t:`같은 5명이 나온 경기가 이전에 있어요: ${fmtDate(tw.d)} ${tw.lg}, ${tw.team}.`});
  const fx=[];
  g[code].forEach((c,i)=>{if(c>=0&&ROLES[i]!==CH[c].roles[0])fx.push(`${CH[c].ko}(${ROLE_KO[ROLES[i]]}, 보통 ${ROLE_KO[CH[c].roles[0]]})`)});
  if(fx.length)notes.push({p:3,t:`돌려쓴 픽: ${fx.slice(0,2).join(', ')}.`});
  if(g.s>=3&&g.sg>1&&g.so){
    const s=SERIES.get(g.sid),con=consumedAfter(s,g.s-1),pb=popBlockHtml(con);
    notes.push({p:5,t:`${g.s}세트라 앞선 ${g.s-1}세트에서 쓴 챔피언 ${con.size}명은 고를 수 없었어요. 인기 상위 ${pb.total}명 중 ${pb.used}명이 이미 소진된 상태였어요.`});
  }
  const ob=[g.fd,g.fh,g.ft];
  if(ob.every(x=>x!=null)){
    const k=ob.filter(x=>x===code).length;
    if(k===3)notes.push({p:3,spoils:true,t:'첫 드래곤, 첫 전령, 첫 타워를 모두 가져갔어요.'});
    if(k===0)notes.push({p:3,spoils:true,t:'첫 드래곤, 첫 전령, 첫 타워를 하나도 가져가지 못했어요.'});
  }
  notes.sort((x,y)=>x.p-y.p);
  return{a,v,arc:a?ARC_LABEL[a]:null,arcLine:a?arcText(a,v):'이 경기는 골드 기록이 비어 있어 흐름을 읽을 수 없어요.',notes};
}
function sparkSvg(v,win){
  const W=120,H=34,xs=[8,44,80,112],col=win?'var(--win)':'var(--loss)';
  const sc=h=>H/2-Math.max(-1,Math.min(1,h/4000))*(H/2-4);
  return `<svg class="spark" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="골드 차이 10분 ${fmtGd(v[0])}, 15분 ${fmtGd(v[1])}, 20분 ${fmtGd(v[2])}, 25분 ${fmtGd(v[3])}"><line x1="0" x2="${W}" y1="${H/2}" y2="${H/2}" stroke="var(--line)" stroke-dasharray="3 3"/><polyline points="${v.map((y,i)=>xs[i]+','+sc(y).toFixed(1)).join(' ')}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${v.map((y,i)=>`<circle cx="${xs[i]}" cy="${sc(y).toFixed(1)}" r="2.5" fill="${col}"/>`).join('')}</svg>`;
}
/* 경기 상세의 "이 경기 읽기": 어느 팀 시점으로 읽을지 고른다 (응원팀, 상대 팀 팬 모두를 위해) */
function readHtml(g,id){
  const fav=['b','r'].find(c=>S.myTeam===(c==='b'?g.bt:g.rt));
  const code=(S.persp&&S.persp.id===id)?S.persp.code:(fav||'b');
  const veil=hidden(id),n=narrate(g,code),win=g.w===code;
  const tab=c=>`<button role="tab" type="button" data-persp="${c}" aria-selected="${c===code}">${esc(tn(c==='b'?g.bt:g.rt))} 시점</button>`;
  const notes=n.notes.filter(x=>!veil||!x.spoils).slice(0,4).map(x=>`<li>${esc(x.t)}</li>`).join('');
  const arc=veil?'<p class="arcl muted">결과 가림 중이라 경기 흐름은 가려 뒀어요.</p>'
    :`<div class="trow2">${n.a?`<span class="arc ${ARC_TONE[n.a]}">${n.arc}</span>`:''}${n.v?sparkSvg(n.v,win):''}</div><p class="arcl">${esc(n.arcLine)}</p>`;
  return `<div class="dsec read"><h5>이 경기 읽기</h5><div class="tabs" role="tablist" style="margin-bottom:10px">${tab('b')}${tab('r')}</div>${arc}${notes?`<ul class="notes">${notes}</ul>`:''}<p class="rel" style="margin:8px 0 0">데이터가 보여 주는 눈에 띈 점이에요. 이 때문에 이기거나 졌다는 뜻은 아니에요.</p></div>`;
}

/* ---------- 팀 ---------- */
function buildTeams(){
  G.forEach((g,i)=>{g._i=i});
  const seen={},cnt={};
  for(const g of G){
    g._new={b:[],r:[]};
    for(const code of['b','r']){
      const name=code==='b'?g.bt:g.rt,set=seen[name]||(seen[name]=new Set());
      if((cnt[name]||0)>=10)g._new[code]=g[code].filter(c=>c>=0&&!set.has(c));   // 그 팀의 11번째 경기부터 센다
      g[code].forEach(c=>{if(c>=0)set.add(c)});
    }
    cnt[g.bt]=(cnt[g.bt]||0)+1;cnt[g.rt]=(cnt[g.rt]||0)+1;
  }
  const map=new Map();
  for(const g of G)for(const code of['b','r']){
    const name=code==='b'?g.bt:g.rt;let t=map.get(name);
    if(!t){t={name,games:[],leagues:{},w:0,l:0};map.set(name,t)}
    t.games.push({g,code});t.leagues[g.lg]=(t.leagues[g.lg]||0)+1;
    if(g.w===code)t.w++;else t.l++;
  }
  TEAMS=[...map.values()].sort((a,b)=>b.games.length-a.games.length);
  TEAMS.forEach((t,i)=>{t.id=i;t.league=Object.entries(t.leagues).sort((a,b)=>b[1]-a[1])[0][0];TEAMIDX[t.name]=i});
}
const josa=w=>{const c=w.charCodeAt(w.length-1)-0xAC00;return c>=0&&c<11172&&c%28!==0?'이':'가'};   // 받침이 있으면 이, 없으면 가
function distOf(list){const c={};let n=0;for(const{g,code}of list){const a=arcOf(g,code);if(a){c[a]=(c[a]||0)+1;n++}}return{c,n}}
function leagueDist(lg){
  if(!LDIST[lg]){const list=[];for(const g of G)if(g.lg===lg){list.push({g,code:'b'},{g,code:'r'})}LDIST[lg]=distOf(list)}
  return LDIST[lg];
}
/* ---------- 팀 스타일: 로고 대신 직접 만든 엠블럼(약칭 + 팀 색)과 마이 팀 색 테마 ---------- */
let TSTYLE={};
const _fb={};
function hex2rgb(h){h=h.replace('#','');return[0,2,4].map(i=>parseInt(h.slice(i,i+2),16))}
function rgb2hex(c){return'#'+c.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('')}
function lum(c){const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};return .2126*f(c[0])+.7152*f(c[1])+.0722*f(c[2])}
function contrast(a,b){const A=lum(a),B=lum(b);return(Math.max(A,B)+.05)/(Math.min(A,B)+.05)}
function mixc(a,b,t){return a.map((v,i)=>v+(b[i]-v)*t)}
/* 배경 위에서 글자로 쓸 수 있게(명암비 min 이상) 팀 색을 어둡게/밝게 조정한다 */
function inkOn(hex,bgHex,min){
  const bg=hex2rgb(bgHex),base=hex2rgb(hex),target=lum(bg)>.5?[0,0,0]:[255,255,255];
  let c=base,t=0;
  while(contrast(c,bg)<min&&t<1){t+=.05;c=mixc(base,target,t)}
  return rgb2hex(c);
}
const fgOn=hex=>contrast(hex2rgb(hex),[17,17,17])>=contrast(hex2rgb(hex),[255,255,255])?'#111111':'#ffffff';
function hsl2hex(h,s,l){s/=100;l/=100;const k=n=>(n+h/30)%12,a=s*Math.min(l,1-l),f=n=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));return rgb2hex([f(0)*255,f(8)*255,f(4)*255])}
function initials(n){
  const w=n.replace(/[^A-Za-z0-9가-힣 ]/g,' ').split(/\s+/).filter(Boolean);
  return(w.length>1?w.slice(0,3).map(x=>x[0]).join(''):n.replace(/[^A-Za-z0-9가-힣]/g,'').slice(0,3)).toUpperCase();
}
function teamStyle(name){
  if(TSTYLE[name])return TSTYLE[name];
  if(_fb[name])return _fb[name];
  const sub=/^(.+?) ((?:Esports )?(?:Academy|Challengers|Rookies|Scholars|Youth)(?: Rookies)?)$/.exec(name);
  if(sub&&TSTYLE[sub[1]]){
    const p=TSTYLE[sub[1]],suf=sub[2],L=/Rookies/.test(suf)?'R':/Academy/.test(suf)?'A':/Challengers/.test(suf)?'C':/Scholars/.test(suf)?'S':'Y';
    return _fb[name]={short:p.short+'-'+L,ko:(p.ko||sub[1])+' '+suf.replace('Esports ',''),c:rgb2hex(mixc(hex2rgb(p.c),[128,128,128],.35)),c2:p.c2};
  }
  let h=0;for(const ch of name)h=(h*31+ch.charCodeAt(0))>>>0;
  const hue=h%360;
  return _fb[name]={short:initials(name),ko:name,c:hsl2hex(hue,58,42),c2:hsl2hex((hue+22)%360,52,18)};
}
const tn=name=>teamStyle(name).ko||name;
function emblem(name,size){
  const st=teamStyle(name),n=st.short.length,fs=Math.round(size*(n<=2?.4:n===3?.32:n===4?.26:.22));
  return `<span class="eb" style="--c:${st.c};--c2:${st.c2};--f:${fgOn(st.c)};width:${size}px;height:${size}px;font-size:${fs}px" aria-hidden="true">${esc(st.short)}</span>`;
}
/* 마이 팀을 고르면 사이트 전체의 강조색, 배경 색조, 헤더가 그 팀 색으로 바뀐다 (라이트/다크 모두 글자 명암비를 맞춘다) */
function applyTheme(){
  const root=document.documentElement,props=['--team','--team2','--ink-l','--ink-d','--fg-l','--fg-d'];
  if(!S.myTeam){root.classList.remove('themed');props.forEach(p=>root.style.removeProperty(p))}
  else{
    const st=teamStyle(S.myTeam),il=inkOn(st.c,'#ffffff',4.5),id=inkOn(st.c,'#141a24',4.5);
    root.style.setProperty('--team',st.c);root.style.setProperty('--team2',st.c2);
    root.style.setProperty('--ink-l',il);root.style.setProperty('--ink-d',id);
    root.style.setProperty('--fg-l',fgOn(il));root.style.setProperty('--fg-d',fgOn(id));
    root.classList.add('themed');
  }
  const n=$('#nav-teams');if(n)n.innerHTML=S.myTeam?`${emblem(S.myTeam,22)}<span>내 팀</span>`:'내 팀';
}
function setMyTeam(name){
  S.myTeam=name||null;S.changing=false;
  store.set('df-my-team',S.myTeam||'');
  applyTheme();
  if(S.detailId)openDetail(S.detailId);
  if(!$('#view-team').hidden)renderTeam(S.team);
  else{location.hash='teams';route()}
}
const teamLink=(name,cls)=>TEAMIDX[name]!=null?`<button type="button" class="linkbtn ${cls||''}" data-team="${TEAMIDX[name]}">${esc(tn(name))}</button>`:esc(tn(name));

/* ---------- 응원팀 시점의 경기 카드: 흐름 유형, 골드 곡선, 눈에 띈 점 ---------- */
function tcardHtml(g,code){
  const veil=hidden(g.id),opp=code==='b'?g.rt:g.bt,me=code==='b'?g.bt:g.rt;
  const n=narrate(g,code),win=g.w===code,nws=new Set(g._new[code]);
  const icons=g[code].map(c=>c<0?'<span class="tph">?</span>':`<div class="tic" title="${esc(CH[c].ko)}${nws.has(c)?' · 올해 처음 꺼낸 픽':''}"><img src="${CH[c].icon}" alt="${esc(CH[c].ko)}" width="36" height="36">${nws.has(c)?'<em class="nw">처음</em>':''}</div>`).join('');
  const res=veil?`<button class="reveal" type="button" data-reveal="${g.id}">결과 보기</button>`:`<span class="gres ${win?'win':'loss'}">${win?'승':'패'}</span>`;
  const notes=n.notes.filter(x=>!veil||!x.spoils).slice(0,3).map(x=>`<li>${esc(x.t)}</li>`).join('');
  return `<article class="card tcard" data-open="${g.id}" tabindex="0" aria-label="${esc(tn(me))} 대 ${esc(tn(opp))} 경기 읽기">
    <div class="gh"><span class="lg">${esc(g.lg)}</span><span>${fmtDate(g.d)} · ${g.s}세트</span>${res}</div>
    <div class="tmain"><div class="tvs">${emblem(me,26)}<b>${esc(tn(me))}</b><span class="muted">vs</span>${emblem(opp,22)}${teamLink(opp)}</div><div class="ticons">${icons}</div></div>
    ${veil?'':`<div class="trow2">${n.a?`<span class="arc ${ARC_TONE[n.a]}">${n.arc}</span>`:''}${n.v?sparkSvg(n.v,win):''}</div><p class="arcl">${esc(n.arcLine)}</p>`}
    ${notes?`<ul class="notes">${notes}</ul>`:''}</article>`;
}

/* ---------- 팀 홈에 들어가는 조각들 ---------- */
/* 로스터: 최근 40경기에서 포지션마다 가장 많이 나온 선수와 그 선수의 챔피언 */
function roster(t){
  const recent=t.games.slice(-40),by=ROLES.map(()=>({}));
  for(const{g,code}of recent){
    const pl=g[code==='b'?'bp':'rp'];if(!pl)continue;
    ROLES.forEach((r,i)=>{
      const nm=pl[i];if(!nm)return;
      const o=by[i][nm]||(by[i][nm]={n:0,ch:{}});o.n++;
      const c=g[code][i];if(c>=0)o.ch[c]=(o.ch[c]||0)+1;
    });
  }
  return by.map((m,i)=>{
    const e=Object.entries(m).sort((a,b)=>b[1].n-a[1].n)[0];
    return e?{role:i,name:e[0],games:e[1].n,top:Object.entries(e[1].ch).sort((a,b)=>b[1]-a[1]).slice(0,3)}:null;
  });
}
function playerCard(p,t){
  const st=teamStyle(t.name),ini=/^[\x00-\x7f]+$/.test(p.name)?p.name.slice(0,2).toUpperCase():p.name.slice(0,2);
  return `<div class="pcard"><div class="av" style="--c:${st.c};--c2:${st.c2};--f:${fgOn(st.c)}"><span>${esc(ini)}</span><em style="background:${ROLE_COLORS[ROLES[p.role]]}">${ROLE_KO[ROLES[p.role]]}</em></div>
    <b title="${esc(p.name)}">${esc(p.name)}</b><small>${p.games}경기 출전</small>
    <div class="pch">${p.top.map(([c,n])=>`<span class="pc" title="${esc(CH[+c].ko)} ${n}회"><img src="${CH[+c].icon}" alt="${esc(CH[+c].ko)}" width="32" height="32"><i>${n}</i></span>`).join('')}</div></div>`;
}
function banStats(t){
  const own={},against={},sig=ROLES.map(()=>({}));
  for(const{g,code}of t.games){
    for(const c of g[code==='b'?'bb':'rb'])own[c]=(own[c]||0)+1;
    for(const c of g[code==='b'?'rb':'bb'])against[c]=(against[c]||0)+1;
    g[code].forEach((c,i)=>{if(c>=0)sig[i][c]=(sig[i][c]||0)+1});
  }
  const top=(o,n)=>Object.entries(o).sort((a,b)=>b[1]-a[1]).slice(0,n);
  return{own:top(own,8),against:top(against,8),sig:sig.map(o=>top(o,1)[0])};
}
const iconRow=list=>`<div class="bi">${list.map(([c,n])=>`<span class="pc" title="${esc(CH[+c].ko)} ${n}회"><img src="${CH[+c].icon}" alt="${esc(CH[+c].ko)}" width="36" height="36"><i>${n}</i></span>`).join('')}</div>`;

function teamHero(t,mine){
  const st=teamStyle(t.name),veil=S.spoiler&&!S.statsRevealed;
  const mid=rgb2hex(mixc(hex2rgb(st.c),hex2rgb(st.c2),.5)),hf=fgOn(mid);
  const btns=mine
    ?`<button class="hbtn" type="button" data-change>마이 팀 바꾸기</button><button class="hbtn" type="button" data-myteam="">마이 팀 해제</button>`
    :`<button class="hbtn solid" type="button" data-myteam="${esc(t.name)}">마이 팀으로 설정</button>`;
  return `<section class="hero2" style="--hc:${st.c};--hc2:${st.c2};--hf:${hf};--hs:${hf==='#ffffff'?'#111111':'#ffffff'}">
    <span class="hemb">${emblem(t.name,84)}</span>
    <div class="htx"><div class="hk">${esc(t.league)}${veil?'':` · ${t.w}승 ${t.l}패`} · ${t.games.length}경기${mine?' · 내 응원팀':''}</div><h1>${esc(tn(t.name))}</h1>${st.ko!==t.name?`<div class="hsub">${esc(t.name)}</div>`:''}</div>
    <div class="hbtns">${btns}</div></section>`;
}
function teamFlow(t){
  const veil=S.spoiler&&!S.statsRevealed,td=distOf(t.games),ld=leagueDist(t.league);
  if(veil)return `<div class="stat veilbox"><div class="k">결과 가림 중</div><p style="margin:4px 0 10px">경기 흐름 분포는 결과를 알려 줘서 가렸어요.</p><button class="btn" type="button" data-stats>통계 보기</button></div>`;
  if(td.n<10)return '<p class="muted" style="margin:0">골드 기록이 있는 경기가 10개 미만이라 흐름 분포를 보여 주기 어려워요.</p>';
  const pct=(o,a)=>(o.c[a]||0)/o.n*100,mx=Math.max(...ARC_ORDER.map(a=>Math.max(pct(td,a),pct(ld,a))))*1.15;
  const top=ARC_ORDER.map(a=>({a,d:pct(td,a)-pct(ld,a)})).sort((x,y)=>Math.abs(y.d)-Math.abs(x.d))[0];
  return `<p style="margin:0 0 12px"><b>${ARC_LABEL[top.a]}</b>${josa(ARC_LABEL[top.a])} ${pct(td,top.a).toFixed(0)}%로 ${esc(t.league)} 평균(${pct(ld,top.a).toFixed(0)}%)보다 ${top.d>0?'많아요':'적어요'}.</p>`
    +ARC_ORDER.map(a=>`<div class="drow2"><span class="dl">${ARC_LABEL[a]}</span><div class="dbar2"><i class="${ARC_TONE[a]}" style="width:${pct(td,a)/mx*100}%"></i><b style="left:${pct(ld,a)/mx*100}%" title="${esc(t.league)} 평균 ${pct(ld,a).toFixed(0)}%"></b></div><span class="dv">${pct(td,a).toFixed(0)}% <small>평균 ${pct(ld,a).toFixed(0)}%</small></span></div>`).join('')
    +`<p class="rel" style="margin:10px 0 0">막대는 이 팀, 세로 표시는 ${esc(t.league)} 평균이에요. 골드 기록이 있는 ${td.n}경기 기준이에요.</p>`;
}
/* 팀 홈(마이 팀) / 팀 페이지(다른 팀) 공용 본문 */
function teamBody(t,mine){
  const ros=roster(t),bs=banStats(t),recent=t.games.slice().reverse();
  const rosterHtml=ros.some(Boolean)?`<section class="card story"><h2 style="font-size:1.1rem">선수 <span class="muted" style="font-size:.8rem;font-weight:500">최근 40경기 기준 주전과 챔피언</span></h2><div class="pgrid">${ros.map(p=>p?playerCard(p,t):'').join('')}</div><p class="rel" style="margin:12px 0 0">선수 사진은 쓰지 않아요. 권리를 확인한 사진이 생기면 이 자리에 넣을 수 있어요.</p></section>`:'';
  const sigRow=`<div class="siglist">${bs.sig.map((s,i)=>s?`<div class="sigp"><span class="rl" style="color:${ROLE_COLORS[ROLES[i]]}">${ROLE_KO[ROLES[i]]}</span><span class="pc" title="${esc(CH[+s[0]].ko)} ${s[1]}회"><img src="${CH[+s[0]].icon}" alt="${esc(CH[+s[0]].ko)}" width="40" height="40"><i>${s[1]}</i></span></div>`:'').join('')}</div>`;
  const picksHtml=`<section class="card story"><h2 style="font-size:1.1rem">밴픽</h2>
    <h5 class="sub5" style="margin-top:12px">포지션별로 가장 많이 쓴 챔피언</h5>${sigRow}
    <h5 class="sub5">이 팀이 자주 밴한 챔피언</h5>${iconRow(bs.own)}
    <h5 class="sub5">이 팀을 상대로 자주 밴된 챔피언</h5>${iconRow(bs.against)}</section>`;
  const feed=`<div class="section-title"><h2>최근 경기</h2></div><div class="games one">${recent.slice(0,S.tMore).map(x=>tcardHtml(x.g,x.code)).join('')}</div>${recent.length>S.tMore?`<button class="more" type="button" data-tmore>경기 더 보기 (${recent.length-S.tMore}개 남음)</button>`:''}`;
  const rel=COLUMNS.map((c,i)=>({c,i})).filter(x=>(x.c.teams||[]).includes(t.name));
  const colHtml=rel.length?`<div class="section-title"><h2>이 팀 이야기</h2></div><div class="cols">${rel.map(x=>colCard(x.c,x.i)).join('')}</div>`:'';
  return `${teamHero(t,mine)}${rosterHtml}${feed}${picksHtml}<section class="card story" style="margin-top:16px"><h2 style="font-size:1.1rem">이 팀의 경기 흐름</h2>${teamFlow(t)}</section>${colHtml}`;
}

/* ---------- 내 팀(마이 팀 고르기 또는 팀 홈), 팀 페이지 ---------- */
function teamPickList(){
  const q=S.tq.trim().toLowerCase();
  let list=TEAMS.filter(t=>(S.tlg==='all'||t.league===S.tlg)&&(!q||t.name.toLowerCase().includes(q)||tn(t.name).toLowerCase().includes(q)));
  const total=list.length;list=list.slice(0,60);
  return `<div class="egrid">${list.map(t=>`<div class="etile ${S.myTeam===t.name?'on':''}"><button type="button" class="ebtn" data-myteam="${esc(t.name)}" title="${esc(t.name)}">${emblem(t.name,64)}<span>${esc(tn(t.name))}</span></button><button type="button" class="eview" data-team="${t.id}" aria-label="${esc(tn(t.name))} 팀 페이지">팀 보기</button></div>`).join('')||'<p class="muted">찾는 팀이 없어요.</p>'}</div>${total>60?`<p class="muted" style="margin:10px 0 0;font-size:.82rem">${total-60}개 팀이 더 있어요. 이름으로 검색해 보세요.</p>`:''}`;
}
function renderTeams(){
  const box=$('#teams-box');if(!box)return;
  const id=S.myTeam!=null?TEAMIDX[S.myTeam]:null;
  if(id!=null&&!S.changing){box.innerHTML=teamBody(TEAMS[id],true);return}
  const lgCnt={};TEAMS.forEach(t=>lgCnt[t.league]=(lgCnt[t.league]||0)+t.games.length);
  const lgs=Object.entries(lgCnt).sort((a,b)=>(b[0]==='LCK')-(a[0]==='LCK')||b[1]-a[1]).slice(0,8).map(x=>x[0]);
  box.innerHTML=`<div class="page-h"><h1>${id!=null?'마이 팀 바꾸기':'내 팀을 골라 주세요'}</h1><p class="muted">팀 엠블럼을 누르면 사이트가 그 팀의 색으로 바뀌고, 그 팀의 선수, 밴픽, 경기, 칼럼이 첫 화면에 모여요. 고른 팀은 이 브라우저에만 저장돼요.</p></div>
    <section class="card story">
      <input class="q" id="team-q" type="search" placeholder="팀 이름 검색 (예: 젠지, T1)" autocomplete="off" value="${esc(S.tq)}" style="width:100%;margin:0 0 10px">
      <div class="tools" style="margin:0 0 14px"><button class="chip ${S.tlg==='all'?'on':''}" type="button" data-tlg="all">전체</button>${lgs.map(l=>`<button class="chip ${S.tlg===l?'on':''}" type="button" data-tlg="${esc(l)}">${esc(l)}</button>`).join('')}</div>
      <div id="team-pick">${teamPickList()}</div>
      <p class="rel" style="margin:14px 0 0">엠블럼은 팀 로고가 아니라 약칭과 팀 색으로 직접 만든 그림이에요. 팀 색과 한글 이름은 초안이라 틀릴 수 있어요.</p></section>
    ${id!=null?`<button class="chip" type="button" data-keep style="margin-top:14px">← 바꾸지 않고 돌아가기</button>`:''}`;
}
function renderTeam(id){
  S.team=id;
  const box=$('#team-box'),t=TEAMS[id];
  if(!t){box.innerHTML='<div class="card empty-state"><h2>찾는 팀이 없어요</h2><a class="btn" href="#teams">내 팀으로</a></div>';return}
  box.innerHTML=`<a class="chip" href="#teams">← 내 팀</a><div style="height:12px"></div>${teamBody(t,S.myTeam===t.name)}`;
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
function refresh(){renderResults();renderSeries();if(!$('#view-column').hidden)renderColumn(S.col);if(!$('#view-teams').hidden)renderTeams();if(!$('#view-team').hidden)renderTeam(S.team);if(S.detailId)openDetail(S.detailId)}
function update(){renderBoard();renderFilters();renderResults()}
document.addEventListener('click',e=>{
  const t=e.target;
  // 결과 공개 버튼은 카드 클릭(상세 열기)보다 먼저 처리한다
  const rv=t.closest('[data-reveal]');if(rv){S.revealed.add(rv.dataset.reveal);refresh();return}
  const mt=t.closest('[data-myteam]');if(mt){setMyTeam(mt.dataset.myteam);return}
  if(t.closest('[data-change]')){S.changing=true;renderTeams();window.scrollTo({top:0});return}
  if(t.closest('[data-keep]')){S.changing=false;renderTeams();return}
  const tm=t.closest('[data-team]');if(tm){closeDetail();S.tMore=12;location.hash='team-'+tm.dataset.team;route();window.scrollTo({top:0});return}
  const pe=t.closest('[data-persp]');if(pe&&S.detailId){S.persp={id:S.detailId,code:pe.dataset.persp};openDetail(S.detailId);return}
  const tl=t.closest('[data-tlg]');if(tl){S.tlg=tl.dataset.tlg;renderTeams();return}
  if(t.closest('[data-tmore]')){S.tMore+=12;if(!$('#view-team').hidden)renderTeam(S.team);else renderTeams();return}
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
document.addEventListener('input',e=>{if(e.target&&e.target.id==='team-q'){S.tq=e.target.value;const el=$('#team-pick');if(el)el.innerHTML=teamPickList()}});
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
  const h=location.hash,mc=/^#column-(\d+)$/.exec(h),mt=/^#team-(\d+)$/.exec(h);
  const v=mc?'column':mt?'team':h==='#columns'?'columns':h==='#series'?'series':h==='#search'?'search':'teams';
  for(const k of['teams','team','search','series','columns','column'])$('#view-'+k).hidden=k!==v;
  const nav=v==='column'?'columns':v==='team'?'teams':v;
  for(const k of['teams','search','series','columns'])$('#nav-'+k).setAttribute('aria-current',k===nav?'page':'false');
  if(v==='series')renderSeries();
  if(v==='column')renderColumn(+mc[1]);
  if(v==='teams')renderTeams();
  if(v==='team')renderTeam(+mt[1]);
}
window.addEventListener('hashchange',route);

Promise.all([fetch('champs.json').then(r=>r.json()),fetch('games.json').then(r=>r.json()),fetch('meta.json').then(r=>r.json()).catch(()=>({demo:true})),fetch('columns.json').then(r=>r.json()).catch(()=>[]),fetch('teams.json').then(r=>r.json()).catch(()=>({}))]).then(([c,g,m,cols,ts])=>{
  CH=c;G=g;META=m;COLUMNS=cols;TSTYLE=ts;CH.forEach(x=>CHIDX[x.en]=x.id);
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
  buildTeams();
  try{let mt=store.get('df-my-team');if(mt===null){const old=JSON.parse(store.get('df-teams')||'[]');mt=old[0]||''}S.myTeam=mt&&TEAMIDX[mt]!=null?mt:null}catch(e){S.myTeam=null}
  if(TEAMS.some(t=>t.league==='LCK'))S.tlg='LCK';       // 한국 팬 기준: 처음엔 LCK 팀부터 보여 준다
  applyTheme();
  SLIST=[...SERIES.values()].sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:b.id-a.id);
  PATCHES=[...new Set(G.map(x=>x.p))].sort((a,b)=>{const A=pKey(a),B=pKey(b);return A[0]-B[0]||A[1]-B[1]});
  LEAGUES=[...new Set(G.map(x=>x.lg))].sort();
  if(!META.demo){$('#demo-pill').hidden=true;$('#foot').textContent='챔피언 이미지는 Riot Games Data Dragon을, 경기 데이터는 Oracle\'s Elixir(Tim Sevenhuysen)의 2026 파일을 사용했어요. (로컬 확인용)'}
  S.spoiler=store.get('df-spoiler')==='1';syncSpoiler();
  setBoard({blue:{jng:'Vi',mid:'Orianna'}});
  renderColumns();route();update();
}).catch(err=>{console.error(err);$('#view-teams').hidden=false;$('#teams-box').innerHTML='<div class="card empty-state"><h2>데이터를 불러오지 못했어요</h2><p class="muted" style="margin:0">잠시 후 다시 열어 주세요.</p></div>';$('#results').innerHTML='<div class="card empty-state"><h2>데이터를 불러오지 못했어요</h2><p class="muted" style="margin:0">잠시 후 다시 열어 주세요.</p></div>'});
