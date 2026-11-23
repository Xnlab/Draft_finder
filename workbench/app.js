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
  teams:[],tq:'',tlg:'all',fMore:12,tMore:12,persp:null,team:null,myTeam:null,changing:false,pq:'',plg:'LCK',pl:'all',ppt:'all',pcn:15,pp:null,ttab:'ov',cl:'all',cpt:'all',cr:'all',cn:20};
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
  for(const side of['blue','red'])for(const[role,en]of Object.entries(b[side]||{}))if(chId(en)!=null)S[side][ROLES.indexOf(role)]=chId(en);
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
  return `<div class="pk ${hl.has(cid)?'hl':''}" title="${esc(c.ko)}${fx!=null?' | '+ROLE_KO[ROLES[fx]]+'로 사용':''}"><div class="pw"><img src="${c.icon}" alt="" width="40" height="40">${tag}</div><span>${esc(c.ko)}</span></div>`;
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
  const fl=r.flex.slice(0,2).map(f=>`<span class="m flex">${esc(CH[f.c].ko)} | ${ROLE_KO[ROLES[f.to]]}로 사용</span>`).join('');
  const res=veil?`<button class="reveal" type="button" data-reveal="${g.id}">결과 보기</button>`:`<span class="gres ${r.win?'win':'loss'}">고른 쪽 ${r.win?'승':'패'}</span>`;
  const gd=veil?'<span class="gd">결과 가림 중</span>':`<span class="gd">15분 골드 ${fmtGd(r.gd)} | ${gdWord(r.gd)}</span>`;
  const ser=g.sg>1?`<span class="tag">시리즈 ${veil?'':g.sg+'세트 중 '}${g.s}세트</span>`:'';
  return `<article class="game card" data-open="${g.id}" tabindex="0" aria-label="${esc(g.bt)} 대 ${esc(g.rt)} 경기 자세히 보기">
    <div class="gh"><span class="lg">${esc(g.lg)}</span><span>${fmtDate(g.d)} | 패치 ${esc(g.p)} | ${g.s}세트</span>${g.inc?'<span class="tag warn">일부 누락</span>':''}${res}</div>
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
    box.innerHTML='';
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
        rows.push(`<div class="urow"><img src="${CH[s.c].icon}" alt="" width="26" height="26"><span class="un">${esc(CH[s.c].ko)}</span><div class="ubar">${ent.map(([ix,c])=>`<i style="width:${c/tot*100}%;background:${ROLE_COLORS[ROLES[ix]]}" title="${ROLE_KO[ROLES[ix]]} ${c}경기"></i>`).join('')}</div><span class="utxt">${ent.map(([ix,c])=>`${ROLE_KO[ROLES[ix]]} ${c}`).join(' | ')}</span></div>`);
      }
      if(rows.length)useHtml=`<div class="use"><div class="k">고른 챔피언은 어느 포지션에서 쓰였을까요</div>${rows.slice(0,6).join('')}</div>`;
    }
    const leagueTile=`<div class="stat"><div class="k">나온 리그</div><div class="lbar">${lgs.map(([l,c],i)=>`<i style="width:${c/n*100}%;background:${LEAGUE_COLORS[i%LEAGUE_COLORS.length]}"></i>`).join('')}</div><div class="lleg">${lgs.slice(0,4).map(([l,c],i)=>`<span><em style="background:${LEAGUE_COLORS[i%LEAGUE_COLORS.length]}"></em><b>${esc(l)}</b> ${c}</span>`).join('')}</div></div>`;
    const stats=veil
      ?`<div class="stats"><div class="stat veilbox span2"><div class="k">결과 가림 중</div><p style="margin:4px 0 10px">승률과 골드 차이는 경기 결과를 알려 주기 때문에 가려 뒀어요.</p><button class="btn" type="button" data-stats>통계 보기</button></div>${leagueTile}</div>`
      :`<div class="stats">
        <div class="stat"><div class="k">${esc(who)} 승률</div><div class="ring">${ringSvg(pct)}<div><div class="v">${wins}승 ${n-wins}패</div><div class="s">${n}경기 중</div></div></div></div>
        <div class="stat"><div class="k">15분 평균 골드 차이</div><div class="v ${gd>0?'pos':gd<0?'neg':''}">${fmtGd(gd)}</div><div class="s">${esc(who)} 기준 | ${gdWord(gd)}</div></div>${leagueTile}</div>`;
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
      const sub=[pl&&pl[i]?esc(pl[i]):'',fx?`<span class="tg">돌려쓰기</span>보통 ${ROLE_KO[main]}`:''].filter(Boolean).join(' | ');
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
  const item=(o,label)=>`<button class="twin" type="button" data-twin="${o.id}"><b>${label}</b><span>${esc(o.lg)} | ${fmtDate(o.d)} | 패치 ${esc(o.p)}</span><span class="muted">${esc(o.bt)} vs ${esc(o.rt)} | ${o.s}세트</span></button>`;
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
    :`<div class="dwin">${esc(wName)} 승리<small>${g.len!=null?g.len+'분 경기 | ':''}${g.w==='b'?'블루':'레드'} 진영</small></div>`;
  const flow=veil?'':`<div class="dsec"><h5>경기 흐름 (골드 차이)</h5>${dgRow('10분',g.g10)}${dgRow('15분',g.gd)}${dgRow('20분',g.g20)}${dgRow('25분',g.g25)}
       <div class="objs"><span class="obj">첫 드래곤${dot(g.fd)}</span><span class="obj">첫 전령${dot(g.fh)}</span><span class="obj">첫 바론${dot(g.fb)}</span><span class="obj">첫 타워${dot(g.ft)}</span></div></div>`;
  $('#d-title').textContent=`${g.bt} vs ${g.rt}`;
  $('#d-sub').textContent=`${g.lg} | ${fmtDate(g.d)} | 패치 ${g.p} | ${g.s}세트`;
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
  S.dStep=20;S.sShown=setNo||1;S.sSet=seriesVeil(s)?S.sShown:(setNo||s.k);
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
</article>`;
  }).join('');
  return `<div class="tools" style="margin:0 0 14px">${chips}</div>
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
    return `<div class="prow"><span class="un" style="color:${ROLE_COLORS[r]}">${ROLE_KO[r]}</span><div class="pops">${ids.map(id=>`<div class="pop ${con.has(id)?'used':''}" title="${esc(CH[id].ko)}${con.has(id)?' | 소진':''}"><img src="${CH[id].icon}" alt="${esc(CH[id].ko)}" width="36" height="36"></div>`).join('')}</div><span class="utxt">${left}/${ids.length} 남음</span></div>`;
  }).join('');
  return {total,used,rows,per:POPTOP[ROLES[0]].length};
}
function gameStripHtml(g){
  const veil=hidden(g.id);
  const team=code=>{
    const name=code==='b'?g.bt:g.rt,won=!veil&&g.w===code;
    return `<div class="gt ${code} ${won?'won':''}"><div class="gn"><b>${esc(name)}</b><small>${code==='b'?'블루':'레드'} 진영</small>${won?'<small class="w">승</small>':''}</div><div class="pks">${g[code].map(c=>c<0?`<div class="pk"><div class="pw"><div class="ph">?</div></div></div>`:`<div class="pk" title="${esc(CH[c].ko)}"><div class="pw"><img src="${CH[c].icon}" alt="" width="40" height="40"></div><span>${esc(CH[c].ko)}</span></div>`).join('')}</div></div>`;
  };
  const res=veil?`<button class="reveal" type="button" data-reveal="${g.id}">결과 보기</button>`:'';
  return `<article class="card game" data-open="${g.id}" tabindex="0"><div class="gh"><span class="lg">${esc(g.lg)}</span><span>${fmtDate(g.d)} | 패치 ${esc(g.p)} | ${g.s}세트</span>${res}</div>${team('b')}${team('r')}</article>`;
}

function seriesDetail(s){
  const sp=seriesVeil(s),k=s.k;
  const maxShown=sp?Math.min(S.sShown,k):k;
  if(S.sSet>maxShown)S.sSet=maxShown;
  if(S.sSet<1)S.sSet=1;
  const n=S.sSet,con=consumedAfter(s,n),g=s.games[n-1];
  const tabs=Array.from({length:maxShown},(_,i)=>i+1).map(i=>`<button role="tab" type="button" data-sset-tab="${i}" aria-selected="${n===i}">${i}세트</button>`).join('')
    +(sp?`<button class="chip" type="button" data-snext>다음 세트 열기 ▸</button>`:'');
  const score=sp?`<button class="btn" type="button" data-sreveal>결과 보기</button>`:`<b>${esc(tn(s.A))} ${s.wA} : ${s.wB} ${esc(tn(s.B))}</b>`;
  const veil=hidden(g.id)&&sp;
  const step=S.dStep||20,{html:board,exact}=draftBoard(g,{upto:step,veil,last:true});
  const stepLab=step>=20?'전체':`${step}/20 | ${step<=6?'1페이즈 밴':step<=12?'1페이즈 픽':step<=16?'2페이즈 밴':'2페이즈 픽'}`;
  const setCard=`<section class="card sd"><div class="gh"><span class="lg">${n}세트</span><span>${fmtDate(g.d)} | 패치 ${esc(g.p)}</span>
    <span class="dstep"><button class="chip" type="button" data-dstep="0" ${step<=1?'disabled':''}>처음</button><button class="chip" type="button" data-dstep="-1" ${step<=1?'disabled':''} aria-label="이전 선택">◀</button><b>${stepLab}</b><button class="chip" type="button" data-dstep="1" ${step>=20?'disabled':''} aria-label="다음 선택">▶</button><button class="chip" type="button" data-dstep="20" ${step>=20?'disabled':''}>전체</button></span></div>
    ${board}${exact?'':'<p class="muted" style="font-size:.75rem;margin:8px 0 0">픽 순서 정보가 없어 포지션 순서로 표시</p>'}</section>`;
  const banned=new Set(g.bb.concat(g.rb));
  /* 챔피언 풀: 이번 세트에 소진된 챔피언은 색 그대로 + 세트 번호 표시, 앞 세트에 소진된 챔피언은 흐리게 */
  const pool=ROLES.map(r=>{
    const list=CH.filter(c=>c.roles[0]===r).sort((a,b)=>b.n-a.n);
    return `<div class="pg"><h6 style="color:${ROLE_COLORS[r]}">${ROLE_KO[r]} <small>${list.filter(c=>!con.has(c.id)).length}/${list.length}</small></h6><div class="pt">${list.map(c=>{const u=con.get(c.id),now=u&&u.set===n,bn=!now&&banned.has(c.id);return `<div class="tile ${now?'now':bn?'used ban':u?'used':''}" title="${esc(c.ko)}${now||u&&!bn?` | ${u.set}세트에 소진`:''}${bn?` | ${n}세트에 밴`:''}"><img src="${c.icon}" alt="" width="30" height="30" loading="lazy">${now?`<b>${n}</b>`:''}</div>`}).join('')}</div></div>`;
  }).join('');
  return `<button class="chip" type="button" data-sback>← 시리즈 목록</button>
    <div class="sd-top"><h1>${esc(tn(s.A))} <span class="muted">vs</span> ${esc(tn(s.B))}</h1><span class="muted">${esc(s.league)} | ${fmtDate(s.date)}</span>${score}</div>
    <div class="tabs" role="tablist" style="flex-wrap:wrap;margin-bottom:14px">${tabs}</div>
    ${setCard}
    <section class="card story"><div class="tpanels">${teamPanelHtml(s,s.A,n)}${teamPanelHtml(s,s.B,n)}</div>
      <div class="lgd" style="margin-top:18px"><span><i class="tile-key"></i>사용 가능</span><span><i class="tile-key used"></i>앞 세트에 소진</span><span><i class="tile-key now"></i>이번 세트에 소진</span><span><i class="tile-key used ban"></i>이번 세트에 밴</span></div>
      <div class="pool">${pool}</div></section>`;
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
    if(b.type==='search')return[...Object.values(b.board.blue||{}),...Object.values(b.board.red||{})].map(en=>chId(en)).filter(x=>x!=null);
    if(b.type==='series'){const s=pickSeries(b);if(s)return s.games[0].b.concat(s.games[0].r).filter(x=>x>=0).slice(0,6)}
    if(b.type==='draft'){const g=draftGame(b);if(g)return g.b.concat(g.r).filter(x=>x>=0).slice(0,6)}
    if(b.type==='game'||b.type==='flow'){const g=pickGame(b);if(g)return g.b.concat(g.r).filter(x=>x>=0).slice(0,6)}
  }
  return[];
}
function colCard(c,i){
  const ids=colIcons(c);
  return `<article class="card col"><div class="kick">${c.draft?'<span class="tag warn">초안</span> ':''}${c.kind==='note'?'분석 노트':esc(c.kick||'칼럼')} | ${fmtDate(c.date)}</div><h3>${esc(c.title)}</h3>
    <div class="ics">${ids.map(id=>`<img src="${CH[id].icon}" alt="${esc(CH[id].ko)}" width="28" height="28">`).join('')}</div>
    <button type="button" data-col="${i}">칼럼 읽기</button></article>`;
}
function renderColumns(){
  const none='<p class="muted">아직 칼럼이 없어요.</p>';
  if($('#col-strip'))$('#col-strip').innerHTML='';
  $('#col-list').innerHTML=COLUMNS.map(colCard).join('')||none;
  const dbox=$('#draft-list');if(!dbox)return;
  if(typeof watchDrafts==='function')watchDrafts();
  const ds=Object.entries(DRAFTS||{}).sort((a,b)=>(b[1].updatedAt||'')<(a[1].updatedAt||'')?-1:1);
  const note=DRAFT_STATE==='local'?'<p class="rel">이 화면은 서버 저장을 쓸 수 없어서 원고가 이 브라우저에만 저장돼요. claude.ai의 작업실 페이지에서 쓰면 서버에 저장돼요.</p>':DRAFT_STATE==='slow'?'<p class="rel">원고 저장소에 아직 연결되지 않았어요.</p>':DRAFT_STATE==='error'?'<p class="rel">원고 저장소를 쓸 수 없어요.</p>':'';
  dbox.innerHTML=`<div class="section-title"><h2>내 원고</h2><a href="#write-new" class="btn primary" style="margin-left:auto">새 칼럼 쓰기</a></div>
    ${ds.length?`<div class="dlist">${ds.map(([id,d])=>`<a class="card ditem" href="#write-${esc(id)}"><div class="kick">${d.kind==='note'?'분석 노트':esc(d.kick||'칼럼')} | ${esc(d.date||'')}</div><b>${esc(d.title||'(제목 없음)')}</b><small>${d.updatedAt?'저장 '+esc(new Date(d.updatedAt).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})):''}</small></a>`).join('')}</div>`:''}${note}`;
}

/* 근거 상자는 검색기와 같은 계산을 쓴다. 검색 상태(S)를 잠깐 바꿔서 계산하고 원래대로 돌려놓는다. */
function withState(patch,fn){
  const saved={};for(const k of Object.keys(patch))saved[k]=S[k];
  try{Object.assign(S,patch);return fn()}finally{Object.assign(S,saved)}
}
/* 상자에는 영문 이름과 한글 이름 둘 다 쓸 수 있다 */
const chId=name=>{if(CHIDX[name]!=null)return CHIDX[name];const c=CH.find(x=>x.ko===name||x.ko.replace(/\s/g,'')===String(name).replace(/\s/g,''));return c?c.id:null};
const toArr=o=>ROLES.map(r=>o&&o[r]!=null&&chId(o[r])!=null?chId(o[r]):-1);
function searchLabel(b){
  const part=side=>Object.entries(b.board[side]||{}).map(([r,en])=>`${ROLE_KO[r]} ${esc(chId(en)!=null?CH[chId(en)].ko:en)}`).join(' + ');
  const bl=part('blue'),rd=part('red');
  const f=[];
  if(b.sets==='late')f.push('4~5세트');
  if(b.sets==='early')f.push('1~3세트');
  if(b.patch==='latest')f.push('최신 패치');
  if(b.patch==='last3')f.push('최근 3패치');
  if(b.leagues&&b.leagues.length)f.push(b.leagues.join('/'));
  if(b.pos==='exact')f.push('같은 포지션만');
  return{q:bl&&rd?`${bl} vs ${rd}`:(bl||rd),f};
}
function columnBody(c,i){
  return c.blocks.map((b,j)=>{
    if(b.type==='p')return `<p>${esc(b.text)}</p>`;
    if(b.type==='h')return `<h2>${esc(b.text)}</h2>`;
    if(b.type==='h3')return `<h3>${esc(b.text)}</h3>`;
    if(b.type==='search')return searchWidget(b,`${i}:${j}`);
    if(b.type==='series')return seriesWidget(b);
    if(b.type==='game')return gameWidget(b);
    if(b.type==='draft')return draftWidget(b);
    if(b.type==='team')return teamWidget(b);
    if(b.type==='form')return formWidget(b);
    if(b.type==='flow')return flowWidget(b);
    if(b.type==='rank')return rankWidget(b);
    return '';
  }).join('');
}
function renderColumn(i){
  S.col=i;
  const c=COLUMNS[i],box=$('#column-box');
  if(!c){box.innerHTML='<div class="card empty-state"><h2>찾는 칼럼이 없어요</h2><p class="muted" style="margin:0 0 12px">칼럼 목록으로 돌아가 주세요.</p><a class="btn" href="#columns">칼럼 목록</a></div>';return}
  const body=columnBody(c,i);
  const older=COLUMNS[i+1],newer=COLUMNS[i-1];
  box.innerHTML=`<article class="art"><a class="chip" href="#columns">← 칼럼 목록</a>
    <header><div class="kick">${c.draft?'<span class="tag warn">초안 | 공개 사이트에 안 실림</span> ':''}${c.kind==='note'?'분석 노트':esc(c.kick||'칼럼')} | ${fmtDate(c.date)}</div><h1>${esc(c.title)}</h1>${c.lede?`<p class="lede2">${esc(c.lede)}</p>`:''}</header>${body}
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
/* 받침 여부: 한글은 종성, 숫자는 읽는 소리(1 일, 3 삼…)로 본다. 영문 등은 받침 없음으로 친다 */
const hasB=w=>{const ch=String(w).trim().slice(-1),c=ch.charCodeAt(0)-0xAC00;if(c>=0&&c<11172)return c%28!==0;return '013678'.includes(ch)};
const eul=w=>hasB(w)?'을':'를',eun=w=>hasB(w)?'은':'는';
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
function emblem(name,size,wide){
  const st=teamStyle(name),n=st.short.length,fs=Math.round(size*(n<=2?.4:n===3?.32:n===4?.26:.22));
  // 사용 허락을 받은 팀만 teams.json에 logo가 있다. 없으면 약칭+팀 색 엠블럼
  if(st.logo){const w=Math.round(wide&&st.logoW?size*.66*st.logoW:size);   // 가로로 긴 로고는 높이를 2/3로 줄여 정사각 로고와 무게를 맞춘다
    return `<span class="eb lg" style="width:${w}px;height:${size}px" aria-hidden="true"><img src="${esc(st.logo)}" alt="" width="${w}" height="${size}"></span>`}
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
  const icons=g[code].map(c=>c<0?'<span class="tph">?</span>':`<div class="tic" title="${esc(CH[c].ko)}${nws.has(c)?' | 올해 처음 꺼낸 픽':''}"><img src="${CH[c].icon}" alt="${esc(CH[c].ko)}" width="36" height="36">${nws.has(c)?'<em class="nw">처음</em>':''}</div>`).join('');
  const res=veil?`<button class="reveal" type="button" data-reveal="${g.id}">결과 보기</button>`:`<span class="gres ${win?'win':'loss'}">${win?'승':'패'}</span>`;
  const notes=n.notes.filter(x=>!veil||!x.spoils).slice(0,3).map(x=>`<li>${esc(x.t)}</li>`).join('');
  return `<article class="card tcard" data-open="${g.id}" tabindex="0" aria-label="${esc(tn(me))} 대 ${esc(tn(opp))} 경기 읽기">
    <div class="gh"><span class="lg">${esc(g.lg)}</span><span>${fmtDate(g.d)} | ${g.s}세트</span>${res}</div>
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
/* 좁은 화면에서 최근 흐름은 옆으로 밀리니, 가장 최근 경기가 보이게 오른쪽 끝에서 시작한다 */
function formToEnd(){document.querySelectorAll('.form').forEach(e=>{e.scrollLeft=e.scrollWidth})}

/* ---------- 팀·선수 지표 (stats.json): 팀 페이지와 챔피언 순위를 열 때만 읽는다 ---------- */
let ST=null,STP=null;const TF={},PF={},LMET={};
function loadStats(){
  if(!STP)STP=fetch('stats.json').then(r=>{if(!r.ok)throw new Error('no stats');return r.json()}).then(j=>{
    if(j.rows.length!==G.length)throw new Error('stats.json과 games.json의 경기 수가 달라요');
    j.team.forEach((k,i)=>TF[k]=i);j.player.forEach((k,i)=>PF[k]=i);
    j.rows.forEach((row,i)=>{G[i]._st=row});ST=j;
  }).catch(e=>{console.warn(e);ST=false}).then(()=>{
    if(!$('#view-team').hidden)renderTeam(S.team);
    if(!$('#view-teams').hidden)renderTeams();
    if(!$('#view-column').hidden)renderColumn(S.col);
    if(!$('#view-player').hidden)renderPlayer(S.pp);
  });
  return STP;
}
const avg=a=>{let s=0,n=0;for(const x of a)if(x!=null&&!Number.isNaN(x)){s+=x;n++}return n?s/n:null};
const tSt=(g,code,k)=>g._st?g._st[code==='b'?0:1][TF[k]]:null;
const opp=c=>c==='b'?'r':'b';
const DRAKES=[['inf','화염','#e8642c'],['mtn','대지','#a0784f'],['cld','바람','#8fc3e6'],['ocn','바다','#3fb8a6'],['chm','화학공학','#9bbf3a'],['hex','마법공학','#3a8fb8'],['eld','장로','#a58fe0']];
/* 리그 비교는 그 리그 경기만으로 계산한다 (국제전이 섞이면 국제전에 나간 팀만 표본이 달라진다) */
function teamMetrics(t,lg){
  lg=lg===undefined?t.league:lg;
  const gs=t.games.filter(x=>x.g._st&&(!lg||x.g.lg===lg));if(gs.length<3)return null;
  const T=k=>gs.map(x=>tSt(x.g,x.code,k)),sumT=(k,c)=>gs.reduce((s,x)=>s+(tSt(x.g,c?opp(x.code):x.code,k)||0),0);
  const share=k=>{const a=sumT(k),b=sumT(k,1);return a+b?a/(a+b)*100:null};
  const gd=x=>x.g.gd==null?null:(x.code==='b'?x.g.gd:-x.g.gd);
  const ah=gs.filter(x=>gd(x)>0),ft=gs.filter(x=>x.g.ft);
  const k=sumT('k'),d=sumT('d');
  return{n:gs.length,gpm:avg(T('gpm')),gd15:avg(gs.map(gd)),ahead:ah.length>=3?ah.filter(x=>x.g.w===x.code).length/ah.length*100:null,
    cspm:avg(T('cspm')),csd15:avg(T('csd15')),ft:ft.length?ft.filter(x=>x.g.ft===x.code).length/ft.length*100:null,
    dpm:avg(T('dpm')),fb:avg(T('fb'))*100,k:avg(T('k')),d:avg(T('d')),kd:d?k/d:null,
    plt:avg(T('plt')),drg:avg(T('drg')),drgS:share('drg'),grub:avg(T('grub')),her:avg(T('her')),bar:avg(T('bar')),barS:share('bar'),
    vspm:avg(T('vspm')),wpm:avg(T('wpm')),wcpm:avg(T('wcpm')),xpd15:avg(T('xpd15'))};
}
const f0=v=>Math.round(v).toLocaleString('ko-KR'),f1=v=>v.toFixed(1),f2=v=>v.toFixed(2),fp=v=>Math.round(v)+'%',fs1=v=>Math.abs(v)<.05?'0.0':(v>0?'+':'−')+Math.abs(v).toFixed(1);
/* [묶음, 키, 이름, 표시, 높을수록 좋은가(1)/낮을수록(-1), 결과를 알려 주는가] */
const MDEF=[
  ['경제','gpm','분당 골드',f0,1],['경제','gd15','15분 골드 차이',fmtGd,1],['경제','ahead','15분에 앞섰을 때 승률',fp,1,1],
  ['경제','cspm','분당 CS',f1,1],['경제','csd15','15분 CS 차이',fs1,1],['경제','ft','첫 포탑',fp,1],
  ['교전','dpm','분당 피해량',f0,1],['교전','fb','첫 킬',fp,1],['교전','k','경기당 킬',f1,1],['교전','d','경기당 데스',f1,-1],['교전','kd','킬 ÷ 데스',f2,1],
  ['오브젝트','plt','경기당 포탑 방패',f1,1],['오브젝트','drgS','용 획득 비율',fp,1],['오브젝트','grub','경기당 공허 유충',f1,1],['오브젝트','her','경기당 전령',f2,1],['오브젝트','barS','바론 획득 비율',fp,1],
  ['시야','vspm','분당 시야 점수',f2,1],['시야','wpm','분당 와드 설치',f2,1],['시야','wcpm','분당 와드 제거',f2,1],
];
function leagueMetrics(lg){
  if(!LMET[lg])LMET[lg]=TEAMS.filter(t=>t.league===lg&&t.games.filter(x=>x.g.lg===lg).length>=8).map(t=>({t,m:teamMetrics(t)})).filter(x=>x.m);
  return LMET[lg];
}
function rankOf(lg,key,dir,v){
  const vals=leagueMetrics(lg).map(x=>x.m[key]).filter(x=>x!=null);
  if(v==null||vals.length<4)return null;
  return{r:1+vals.filter(x=>dir>0?x>v:x<v).length,n:vals.length,avg:avg(vals)};
}
function sideHtml(t,veil){
  if(veil)return `<div class="mpanel"><h5>진영별 승패</h5><p class="muted" style="margin:6px 0 10px">결과 가림 중이라 가렸어요.</p><button class="btn" type="button" data-stats>통계 보기</button></div>`;
  const rows=['b','r'].map(c=>{const gs=t.games.filter(x=>x.code===c),w=gs.filter(x=>x.g.w===c).length,n=gs.length;
    return `<div class="srow"><span class="sl ${c==='b'?'bl':'rd'}">${c==='b'?'블루':'레드'}</span><div class="sbar"><i class="${c==='b'?'bl':'rd'}" style="width:${n?w/n*100:0}%"></i></div><span class="sv">${w}승 ${n-w}패 <small>${n?Math.round(w/n*100):0}%</small></span></div>`}).join('');
  return `<div class="mpanel"><h5>진영별 승패</h5>${rows}</div>`;
}
function drakeHtml(t){
  const gs=t.games.filter(x=>x.g._st);
  const rows=DRAKES.map(([k,label,col])=>{
    const a=gs.reduce((s,x)=>s+(tSt(x.g,x.code,k)||0),0),b=gs.reduce((s,x)=>s+(tSt(x.g,opp(x.code),k)||0),0);
    if(a+b===0)return '';
    return `<div class="srow"><span class="sl"><em class="dot" style="background:${col}"></em>${label}</span><div class="sbar"><i style="width:${a/(a+b)*100}%;background:${col}"></i></div><span class="sv">${a} : ${b} <small>${Math.round(a/(a+b)*100)}%</small></span></div>`;
  }).join('');
  return `<div class="mpanel"><h5>용 종류별 획득 <span class="muted" style="font-weight:500">우리 : 상대</span></h5>${rows||'<p class="muted">기록이 없어요.</p>'}</div>`;
}
/* 선수 지표 표: 로스터 선수마다, 이 팀에서 그 포지션으로 뛴 경기 기준 */
function playerTable(t,ros){
  if(!ST)return ST===null?(loadStats(),'<p>지표를 불러오는 중이에요…</p>'):'';
  const pct=v=>v==null?'-':(v*100).toFixed(1)+'%';
  const rows=ros.map(p=>{
    if(!p)return '';const a=playerAgg(t,p);if(!a.games)return '';
    return `<tr><td><span class="rtag" style="color:${ROLE_COLORS[ROLES[p.role]]}">${ROLE_KO[ROLES[p.role]]}</span></td><td><b>${pLink(p.name)}</b></td><td class="num">${a.games}</td>
      <td class="num">${a.kda!=null?a.kda.toFixed(1):'-'}</td><td class="num">${a.kp!=null?Math.round(a.kp*100)+'%':'-'}</td>
      <td class="num">${pct(a.dmg)}</td><td class="num">${pct(a.gsh)}</td><td class="num">${a.vspm!=null?a.vspm.toFixed(2):'-'}</td><td class="num">${a.cspm!=null?a.cspm.toFixed(1):'-'}</td>
      <td><div class="chs">${a.chs.slice(0,10).map(([c,n])=>`<span class="pc" title="${esc(CH[+c].ko)} ${n}회"><img src="${CH[+c].icon}" alt="${esc(CH[+c].ko)}" width="28" height="28"><i>${n}</i></span>`).join('')}</div></td></tr>`;
  }).join('');
  if(!rows)return '';
  return `<div class="tscroll"><table class="ptable"><thead><tr><th>포지션</th><th>선수</th><th class="num">경기</th><th class="num" title="(킬+어시스트) ÷ 데스">KDA</th><th class="num" title="팀 킬 중 킬이나 어시스트로 관여한 비율">킬 관여</th><th class="num" title="팀이 챔피언에게 준 피해 중 이 선수의 몫">피해 비중</th><th class="num" title="팀이 번 골드 중 이 선수의 몫">골드 비중</th><th class="num">분당 시야</th><th class="num">분당 CS</th><th>챔피언</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="rel" style="margin:8px 0 0">이 팀에서 그 포지션으로 뛴 경기만 셌어요. 표가 넘치면 옆으로 밀어 보세요.</p>`;
}

/* ---------- 챔피언 순위: 리그·패치·포지션별 픽, 밴 ---------- */
const INTL={WLDs:'월즈',MSI:'MSI',FST:'퍼스트 스탠드',EWC:'EWC'};
const lgLabel=l=>INTL[l]||l;
function champLeagues(){
  const cnt={};G.forEach(g=>cnt[g.lg]=(cnt[g.lg]||0)+1);
  const main=['LCK','LPL','LEC','LCS','LCP','CBLOL'].filter(l=>cnt[l]),intl=Object.keys(INTL).filter(l=>cnt[l]);
  const rest=Object.keys(cnt).filter(l=>!main.includes(l)&&!intl.includes(l)).sort((a,b)=>cnt[b]-cnt[a]);
  return{main:main.concat(intl),rest,cnt};
}
function renderChamps(){
  const box=$('#champs-box');if(!box)return;
  const L=champLeagues(),last=PATCHES[PATCHES.length-1],last3=new Set(PATCHES.slice(-3));
  const pOk=g=>S.cpt==='all'||(S.cpt==='latest'?g.p===last:S.cpt==='last3'?last3.has(g.p):g.p===S.cpt.slice(2));   // 'p:16.20'처럼 패치 하나를 고를 수 있다
  // 대회 구분: OP.GG 등은 LCK 컵 같은 컵 대회를 정규 시즌과 따로 센다. 기본은 컵 제외
  const lgGames=G.filter(g=>S.cl==='all'||g.lg===S.cl),isCup=g=>/cup/i.test(g.sp||'');
  const hasCup=lgGames.some(isCup),splits=[...new Set(lgGames.map(g=>g.sp).filter(Boolean))];
  if(S.csp==null)S.csp='nocup';
  if(S.csp==='nocup'&&!hasCup)S.csp='all';
  if(S.csp.startsWith('s:')&&!splits.includes(S.csp.slice(2)))S.csp=hasCup?'nocup':'all';
  const spOk=g=>S.csp==='all'||(S.csp==='nocup'?!isCup(g):S.csp==='po'?g.po:S.csp==='reg'?!g.po&&!isCup(g):g.sp===S.csp.slice(2));
  const gs=lgGames.filter(g=>pOk(g)&&spOk(g));
  const pc={};lgGames.forEach(g=>{if(spOk(g))pc[g.p]=(pc[g.p]||0)+1});
  const plist=PATCHES.slice().reverse().filter(p=>pc[p]);
  const ri=S.cr==='all'?null:+S.cr,n=gs.length;
  const pk={},wn={},rl={},bn={};
  for(const g of gs){
    for(const code of['b','r'])g[code].forEach((c,i)=>{if(c<0||(ri!=null&&i!==ri))return;pk[c]=(pk[c]||0)+1;if(g.w===code)wn[c]=(wn[c]||0)+1;const o=rl[c]||(rl[c]=[0,0,0,0,0]);o[i]++});
    for(const c of g.bb.concat(g.rb)){if(ri!=null&&CH[c].roles[0]!==ROLES[ri])continue;bn[c]=(bn[c]||0)+1}
  }
  const byKo=(a,b)=>CH[+a[0]].ko.localeCompare(CH[+b[0]].ko,'ko');
  const ranks=(list,val)=>{let prev=null,r=0;return list.map((x,i)=>{const v=val(x);if(v!==prev){r=i+1;prev=v}return r})};
  const roleTag=c=>{const o=rl[c];if(!o){const r0=CH[+c].roles[0];return r0?`<span class="rtag" style="color:${ROLE_COLORS[r0]}">${ROLE_KO[r0]}</span>`:''}const i=o.indexOf(Math.max(...o));return `<span class="rtag" style="color:${ROLE_COLORS[ROLES[i]]}">${ROLE_KO[ROLES[i]]}</span>`};
  const nm=c=>`<button type="button" class="cname" data-chsearch="${c}" title="밴픽 찾기에서 ${esc(CH[c].ko)} 경기 보기"><img src="${CH[c].icon}" alt="" width="32" height="32"><span>${esc(CH[c].ko)}</span></button>`;
  const lgName=S.cl==='all'?'전체 리그':lgLabel(S.cl),ptName=S.cpt==='all'?'전체 패치':S.cpt==='latest'?'패치 '+last:S.cpt==='last3'?'최근 3개 패치':'패치 '+esc(S.cpt.slice(2));
  // 리그: 원형 아이콘 한 줄 (OP.GG 방식)
  const lgItem=(v,label,badge)=>`<button type="button" class="lgc ${S.cl===v?'on':''}" data-cl="${esc(v)}" aria-pressed="${S.cl===v}"><span class="lgc-i">${badge}</span><span class="lgc-n">${esc(label)}</span></button>`;
  const lgRow=`<div class="lgrow">${lgItem('all','전체','<span class="lgc-all">ALL</span>')}${L.main.map(l=>lgItem(l,lgLabel(l),leagueBadge(l,34))).join('')}
    <label class="lgc lgc-more ${L.rest.includes(S.cl)?'on':''}"><span class="lgc-i"><span class="lgc-all">+</span></span><select id="cl-more" aria-label="다른 리그"><option value="">다른 리그</option>${L.rest.map(l=>`<option value="${esc(l)}" ${S.cl===l?'selected':''}>${esc(l)} (${L.cnt[l]}경기)</option>`).join('')}</select></label></div>`;
  // 포지션: 가로로 꽉 찬 탭 (OP.GG 방식)
  const roleBar=`<div class="rolebar" role="tablist"><button role="tab" type="button" data-cr="all" aria-selected="${S.cr==='all'}">모든 라인</button>${ROLES.map((r,i)=>`<button role="tab" type="button" data-cr="${i}" aria-selected="${S.cr===String(i)}"><em class="dot" style="background:${ROLE_COLORS[r]}"></em>${ROLE_KO[r]}</button>`).join('')}</div>`;
  // 표 위 제목 줄: 리그·패치·경기 수 + 패치 고르기 + 보기 전환
  const patchSel=`<select class="sel" id="cpt-one" aria-label="패치"><option value="all" ${S.cpt==='all'?'selected':''}>전체 패치</option><option value="last3" ${S.cpt==='last3'?'selected':''}>최근 3개 패치</option><option value="latest" ${S.cpt==='latest'?'selected':''}>최신 패치 ${esc(last)}</option>${plist.map(p=>`<option value="p:${esc(p)}" ${S.cpt==='p:'+p?'selected':''}>${esc(p)} (${pc[p]}경기)</option>`).join('')}</select>`;
  const spName={all:'전체 대회',nocup:'컵 대회 제외',reg:'정규 시즌',po:'플레이오프'};
  const splitSel=`<select class="sel" id="csp-one" aria-label="대회 구분"><option value="all" ${S.csp==='all'?'selected':''}>전체 대회</option>${hasCup?`<option value="nocup" ${S.csp==='nocup'?'selected':''}>컵 대회 제외</option>`:''}<option value="reg" ${S.csp==='reg'?'selected':''}>정규 시즌</option><option value="po" ${S.csp==='po'?'selected':''}>플레이오프</option>${splits.map(x=>`<option value="s:${esc(x)}" ${S.csp==='s:'+x?'selected':''}>${esc(x)}</option>`).join('')}</select>`;
  const view=S.cview||'rank';
  const viewTabs=`<div class="tabs" role="tablist"><button role="tab" type="button" data-cview="rank" aria-selected="${view==='rank'}">픽/밴 순위</button><button role="tab" type="button" data-cview="win" aria-selected="${view==='win'}">승률</button></div>`;
  const head=`<div class="chead">${viewTabs}<span class="chead-sp"></span>${splitSel}${patchSel}</div>`;
  let body='';
  if(!n)body='<div class="card empty-state"><h2>조건에 맞는 경기가 없어요</h2></div>';
  else if(view==='rank'){
    // 픽 순위·밴 순위: 그래프 없이 순위만
    const P=Object.entries(pk).sort((a,b)=>b[1]-a[1]||byKo(a,b)),B=Object.entries(bn).sort((a,b)=>b[1]-a[1]||byKo(a,b));
    const pr=ranks(P,x=>x[1]),br=ranks(B,x=>x[1]);
    const cols='<colgroup><col class="c-rk"><col class="c-ch"><col class="c-pos"><col><col></colgroup>';
    const row=(r,c,v)=>`<tr><td class="rk">${r}</td><td>${nm(+c)}</td><td>${roleTag(c)||'<span class="muted">-</span>'}</td><td class="num"><b>${v}</b></td><td class="num">${(v/n*100).toFixed(1)}%</td></tr>`;
    const pRows=P.slice(0,S.cn).map(([c,v],i)=>row(pr[i],c,v)).join('');
    const bRows=B.slice(0,S.cn).map(([c,v],i)=>row(br[i],c,v)).join('');
    const th=(cnt,rate)=>`<thead><tr><th>#</th><th>챔피언</th><th>포지션</th><th class="num">${cnt}</th><th class="num">${rate}</th></tr></thead>`;
    body=`<div class="ctwo">
      <section class="card ctab"><h2>픽 순위</h2><table class="ptable ctbl">${cols}${th('픽','픽률')}<tbody>${pRows}</tbody></table></section>
      <section class="card ctab"><h2>밴 순위</h2><table class="ptable ctbl">${cols}${th('밴','밴률')}<tbody>${bRows}</tbody></table></section></div>
      ${Math.max(P.length,B.length)>S.cn?`<button class="more" type="button" data-cmore>더 보기</button>`:''}`;
  }else{
    // 승률: 0~100% 막대, 50% 기준선. 픽이 적은 챔피언은 뺀다
    const minN=Math.max(10,Math.round(n*0.01));
    const W=Object.entries(pk).filter(([,v])=>v>=minN).map(([c,v])=>[c,v,(wn[c]||0)/v]).sort((a,b)=>b[2]-a[2]||b[1]-a[1]);
    const wr=ranks(W,x=>Math.round(x[2]*1000));
    const rows=W.slice(0,S.cn).map(([c,v,r],i)=>`<div class="wr-row"><span class="rk">${wr[i]}</span><span>${nm(+c)}</span><span>${roleTag(c)}</span>
      <div class="wr-bar"><i class="${r>=.5?'up':'dn'}" style="width:${(r*100).toFixed(1)}%"></i><em></em></div>
      <span class="wr-v"><b>${(r*100).toFixed(1)}%</b><small>${wn[c]||0}승 ${v-(wn[c]||0)}패</small></span></div>`).join('');
    body=`<section class="card ctab"><h2>승률 <span class="muted" style="font-weight:500;font-size:.8rem">픽 ${minN}회 이상</span></h2>
      <div class="wr-head"><span></span><span></span><span></span><div class="wr-ax"><small>0%</small><small>50%</small><small>100%</small></div><span></span></div>${rows||'<p class="muted">조건에 맞는 챔피언이 없어요</p>'}</section>
      ${W.length>S.cn?`<button class="more" type="button" data-cmore>더 보기</button>`:''}`;
  }
  box.innerHTML=`<section class="card cfil">${lgRow}${roleBar}</section>${head}${body}`;
}

/* ---------- 팀 페이지 대시보드 (dpm.lol을 참고한 배치): 요약 카드, 최근 흐름, 리그 비교, 챔피언 표 ---------- */
const PAXES=[['k','경기당 킬',1],['fb','첫 킬',1],['ft','첫 포탑',1],['gd15','15분 골드',1],['csd15','15분 CS',1],['drgS','용',1],['barS','바론',1],['vspm','시야',1]];
function pctl(lg,key,dir,v){
  const vals=leagueMetrics(lg).map(x=>x.m[key]).filter(x=>x!=null);
  if(v==null||vals.length<4)return null;
  const worse=vals.filter(x=>dir>0?x<v:x>v).length,eq=vals.filter(x=>x===v).length-1;
  return(worse+eq/2)/(vals.length-1);
}
function radarSvg(t,m){
  const W=320,H=270,cx=160,cy=135,R=92,N=PAXES.length;
  const pt=(i,r)=>{const a=-Math.PI/2+i*2*Math.PI/N;return[cx+Math.cos(a)*R*r,cy+Math.sin(a)*R*r]};
  const poly=rs=>rs.map((r,i)=>pt(i,r).map(v=>v.toFixed(1)).join(',')).join(' ');
  const ps=PAXES.map(([k,,d])=>{const p=pctl(t.league,k,d,m[k]);return p==null?.5:Math.max(.06,p)});
  const rings=[.25,.5,.75,1].map(r=>`<polygon points="${poly(PAXES.map(()=>r))}" class="rg${r===.5?' mid':''}"/>`).join('');
  const spokes=PAXES.map((_,i)=>{const[x,y]=pt(i,1);return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="rg"/>`}).join('');
  const labels=PAXES.map(([,l],i)=>{const[x,y]=pt(i,1.2),c=Math.cos(-Math.PI/2+i*2*Math.PI/N);return `<text x="${x.toFixed(1)}" y="${(y+4).toFixed(1)}" text-anchor="${Math.abs(c)<.2?'middle':c>0?'start':'end'}">${l}</text>`}).join('');
  return `<svg class="radar" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(tn(t.name))}의 지표를 ${esc(t.league)} 팀들과 비교한 그림">${rings}${spokes}<polygon points="${poly(ps)}" class="rv"/>${ps.map((r,i)=>{const[x,y]=pt(i,r);return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" class="rd"/>`}).join('')}${labels}</svg>`;
}
function teamStatsHtml(t){
  if(ST===null){loadStats();return '<section class="card story"><h2 class="ptitle">리그 비교</h2><p>지표를 불러오는 중이에요…</p></section>'}
  const inner=teamStatsInner(t);if(!inner)return '';
  return `<section class="card story"><h2 class="ptitle">리그 비교 <span>${esc(tn(t.name))} vs ${esc(t.league)} ${leagueMetrics(t.league).length}팀</span></h2>${inner}</section>`;
}
function teamStatsInner(t){
  if(!ST)return '';
  const m=teamMetrics(t);if(!m)return '';
  const veil=S.spoiler&&!S.statsRevealed,lg=t.league,nt=leagueMetrics(lg).length;
  const rows=[...new Set(MDEF.map(x=>x[0]))].map(gname=>`<div class="mgh">${gname}</div>`+MDEF.filter(x=>x[0]===gname).map(([,k,label,fmt,dir,sp,neu])=>{
    const v=m[k];if(v==null)return '';
    if(sp&&veil)return `<div class="mrow"><span class="rkb">–</span><span class="ml">${label}</span><b class="mv muted">가림</b><span class="mav"></span></div>`;
    const rk=rankOf(lg,k,dir,v),third=rk?Math.ceil(rk.n/3):0,tone=!rk||neu?'':rk.r<=third?'good':rk.r>rk.n-third?'bad':'';
    return `<div class="mrow"><span class="rkb ${tone}" title="${esc(lg)} ${rk?rk.n:''}팀 중">${rk?rk.r+'위':'–'}</span><span class="ml">${label}</span><b class="mv">${fmt(v)}</b><span class="mav">${rk?fmt(rk.avg):''}</span></div>`;
  }).join('')).join('');
  return `${radarSvg(t,m)}
    <p class="rel" style="margin:0 0 6px;text-align:center">점선은 ${esc(lg)}의 가운데(중간 순위)예요. 바깥으로 갈수록 리그에서 앞서요.</p>
    <div class="mhead"><span>순위</span><span></span><span>${esc(tn(t.name))}</span><span>리그 평균</span></div>${rows}
    <p class="rel" style="margin:12px 0 0">${esc(t.league)} ${m.n}경기 기준(국제전 제외). 초록은 리그 상위 3분의 1, 빨강은 하위 3분의 1이에요. 높고 낮음이 곧 잘하고 못함은 아니에요(경기당 킬이 적은 팀이 운영으로 이기기도 해요).</p>`;
}
/* 최근 흐름: 경기마다 15분 골드 차이 막대 + 승패 + 상대 */
function formChart(t){
  const veil=S.spoiler&&!S.statsRevealed,list=t.games.slice(-18);
  if(veil)return `<section class="card story"><h2 class="ptitle">최근 흐름</h2><div class="stat veilbox" style="margin-top:8px"><div class="k">결과 가림 중</div><p style="margin:4px 0 10px">경기별 골드 차이와 승패는 결과를 알려 줘서 가렸어요.</p><button class="btn" type="button" data-stats>통계 보기</button></div></section>`;
  return `<section class="card story"><h2 class="ptitle">최근 흐름 <span>최근 ${list.length}경기 | 막대는 15분 골드 차이</span></h2>${formInner(list)}</section>`;
}
function formInner(list){
  let prev='';
  const cols=list.map(({g,code})=>{
    const v=g.gd==null?null:(code==='b'?g.gd:-g.gd),win=g.w===code,o=code==='b'?g.rt:g.bt;
    const h=v==null?0:Math.max(3,Math.min(Math.abs(v)/5000,1)*54),dl=g.d!==prev?fmtDate(g.d).replace('월 ','/').replace('일',''):'';prev=g.d;
    const lab=v==null?'':(v>0?'+':v<0?'−':'')+(Math.abs(v)/1000).toFixed(1)+'k';
    return `<button type="button" class="fcol" data-open="${g.id}" title="${fmtDate(g.d)} ${g.s}세트 vs ${esc(tn(o))} | 15분 골드 차이 ${fmtGd(v)} | ${win?'승':'패'}">
      <span class="fd">${dl}</span>
      <span class="fbar"><i class="${win?'w':'l'} ${v!=null&&v<0?'dn':'up'}" style="height:${h}px"></i>${lab?`<em class="${v<0?'dn':'up'}" style="${v<0?'top':'bottom'}:calc(50% + ${h+2}px)">${lab}</em>`:''}</span>
      <span class="fo">${emblem(o,22)}</span><span class="fr ${win?'w':'l'}">${win?'승':'패'}</span></button>`;
  }).join('');
  return `<div class="form">${cols}</div>`;
}
/* 챔피언 픽(승패, 경기 수 막대)과 밴(진영별) 표 */
function teamChampTables(t,lim){
  const veil=S.spoiler&&!S.statsRevealed,cnt={},win={},role={};
  for(const{g,code}of t.games)g[code].forEach((c,i)=>{if(c<0)return;cnt[c]=(cnt[c]||0)+1;if(g.w===code)win[c]=(win[c]||0)+1;const o=role[c]||(role[c]=[0,0,0,0,0]);o[i]++});
  const picks=Object.entries(cnt).sort((a,b)=>b[1]-a[1]).slice(0,lim||10),mx=picks.length?picks[0][1]:1;
  const rt=c=>{const o=role[c],i=o.indexOf(Math.max(...o));return `<span class="rtag" style="color:${ROLE_COLORS[ROLES[i]]}">${ROLE_KO[ROLES[i]]}</span>`};
  const pr=picks.map(([c,n])=>{const w=win[c]||0,wr=w/n*100;
    return `<tr class="barrow" style="--w:${n/mx*100}%"><td>${nameCell(+c)}</td><td>${rt(c)}</td><td class="num">${veil?'':`<b class="${wr>=60?'pos':wr<=40?'neg':''}">${Math.round(wr)}%</b> <small class="muted">${w}승 ${n-w}패</small>`}</td><td class="num"><b>${n}</b></td></tr>`}).join('');
  const kind=S.tbk||'against',bc={};
  for(const{g,code}of t.games){const side=kind==='own'?code:opp(code);for(const c of g[side==='b'?'bb':'rb']){const o=bc[c]||(bc[c]={b:0,r:0});o[side]++}}
  const bans=Object.entries(bc).sort((a,b)=>(b[1].b+b[1].r)-(a[1].b+a[1].r)).slice(0,lim||10);
  const nb=t.games.filter(x=>x.code===(kind==='own'?'b':'r')).length,nr=t.games.length-nb;   // 그 진영에서 밴할 기회가 있었던 경기 수
  const br=bans.map(([c,o])=>{const n=o.b+o.r;
    return `<tr><td>${nameCell(+c)}</td><td class="num"><b>${n}</b></td><td class="split"><div class="spl"><i class="bl" style="width:${o.b/n*100}%"></i><i class="rd" style="width:${o.r/n*100}%"></i></div><small><span class="bl">블루 ${o.b}</span> | <span class="rd">레드 ${o.r}</span></small></td></tr>`}).join('');
  return `<section class="card story"><h2 class="ptitle">챔피언 <span>많이 쓴 순</span></h2>
      <div class="tscroll" style="margin-top:6px"><table class="ptable ctable"><thead><tr><th>픽</th><th>포지션</th><th class="num">승률</th><th class="num">경기</th></tr></thead><tbody>${pr}</tbody></table></div>
    </section><!--ban-->
    <section class="card story"><h2 class="ptitle">밴</h2>
      <div class="tabs" role="tablist" style="margin:6px 0 8px"><button role="tab" type="button" data-tbk="against" aria-selected="${kind==='against'}">상대가 밴한 챔피언</button><button role="tab" type="button" data-tbk="own" aria-selected="${kind==='own'}">우리가 밴한 챔피언</button></div>
      <div class="tscroll" style="margin-top:0"><table class="ptable ctable"><thead><tr><th>챔피언</th><th class="num">밴</th><th>밴한 진영</th></tr></thead><tbody>${br}</tbody></table></div>
      <p class="rel" style="margin:8px 0 0">${kind==='own'?`이 팀이 블루에서 ${nb}경기, 레드에서 ${nr}경기를 했어요.`:`상대 팀이 블루에서 ${nb}경기, 레드에서 ${nr}경기를 했어요.`} 피어리스라 같은 시리즈 뒤 세트에서는 밴할 챔피언이 달라져요.</p>
    </section>`;
}
const nameCell=c=>`<span class="cname"><img src="${CH[c].icon}" alt="" width="30" height="30"><span>${esc(CH[c].ko)}</span></span>`;

/* ---------- 리그 배지: 리그 로고는 Riot·각 리그의 상표라 쓰지 않고, 약칭과 리그 색으로 직접 만든다 ---------- */
const LSTYLE={LCK:['LCK','#2b4a9b','#0d1a3f'],LPL:['LPL','#e2333b','#7a0f14'],LEC:['LEC','#14b0a5','#0a4f4b'],LCS:['LCS','#5468ee','#232c7a'],
  LCP:['LCP','#f0843f','#8a3b13'],CBLOL:['CB','#35b357','#145024'],WLDs:['월즈','#cfa94e','#5c4614'],MSI:['MSI','#8e6ae0','#3b2479'],FST:['FST','#e05a8a','#6e1a3b'],EWC:['EWC','#3aa0d8','#0f4566']};
function leagueBadge(lg,size){
  let[t,c,c2]=LSTYLE[lg]||[];
  if(!t){let h=0;for(const ch of lg)h=(h*31+ch.charCodeAt(0))>>>0;t=lg.slice(0,4);c=hsl2hex(h%360,45,45);c2=hsl2hex((h+20)%360,45,20)}
  const fs=Math.round(size*(t.length<=2?.38:t.length===3?.3:.24));
  return `<span class="lb" style="--c:${c};--c2:${c2};width:${size}px;height:${size}px;font-size:${fs}px" aria-hidden="true">${esc(t)}</span>`;
}
/* 리그 고르기 줄: 배지 타일. attr는 data-속성 이름, cur는 지금 고른 리그 */
function leagueBar(list,cur,attr,allLabel){
  const tile=(v,label,badge)=>`<button type="button" class="ltile ${cur===v?'on':''}" data-${attr}="${esc(v)}" aria-pressed="${cur===v}">${badge}<span>${esc(label)}</span></button>`;
  return `<div class="lbar2">${allLabel?tile('all',allLabel,`<span class="lb all" style="width:40px;height:40px">전체</span>`):''}${list.map(l=>tile(l,lgLabel(l),leagueBadge(l,40))).join('')}</div>`;
}

/* ---------- 팀 페이지 (dpm.lol 배치): 머리(엠블럼·이름·성적) + 탭, 왼쪽 최근 시리즈, 오른쪽 탭 내용 ---------- */
function playerAgg(t,p){
  const gs=t.games.filter(x=>{const pl=x.g[x.code==='b'?'bp':'rp'];return pl&&pl[p.role]===p.name});
  const ch={};for(const x of gs){const c=x.g[x.code][p.role];if(c>=0)ch[c]=(ch[c]||0)+1}
  const o={games:gs.length,chs:Object.entries(ch).sort((a,b)=>b[1]-a[1])};
  const sg=ST?gs.filter(x=>x.g._st):[];
  if(sg.length){
    const P=(x,k)=>x.g._st[x.code==='b'?2:3][p.role][PF[k]];
    let k=0,d=0,a=0,tk=0;for(const x of sg){k+=P(x,'k')||0;d+=P(x,'d')||0;a+=P(x,'a')||0;tk+=tSt(x.g,x.code,'k')||0}
    Object.assign(o,{kda:(k+a)/Math.max(d,1),kp:tk?(k+a)/tk:null,dmg:avg(sg.map(x=>P(x,'dmg'))),gsh:avg(sg.map(x=>P(x,'gsh'))),vspm:avg(sg.map(x=>P(x,'vspm'))),cspm:avg(sg.map(x=>P(x,'cspm')))});
  }
  return o;
}
function playerCard2(p,t){
  const st=teamStyle(t.name),ini=/^[\x00-\x7f]+$/.test(p.name)?p.name.slice(0,2).toUpperCase():p.name.slice(0,2),a=playerAgg(t,p),r=ROLES[p.role];
  return `<div class="card pcard2"><span class="prole" style="color:${ROLE_COLORS[r]}">${ROLE_KO[r]}</span>
    <div class="av2" style="--c:${st.c};--c2:${st.c2};--f:${fgOn(st.c)}"><span>${esc(ini)}</span></div>
    <b title="${esc(p.name)}">${pLink(p.name)}</b><small>${esc(tn(t.name))} ${ROLE_KO[r]}</small>
    <div class="pch">${a.chs.slice(0,3).map(([c,n])=>`<span class="pc" title="${esc(CH[+c].ko)} ${n}회"><img src="${CH[+c].icon}" alt="${esc(CH[+c].ko)}" width="34" height="34"></span>`).join('')}</div>
    <div class="pfoot"><div><small>경기</small><b>${a.games}</b></div><div><small>KDA</small><b>${a.kda!=null?a.kda.toFixed(1):'-'}</b></div><div><small>킬 관여</small><b>${a.kp!=null?Math.round(a.kp*100)+'%':'-'}</b></div></div></div>`;
}
function teamHead(t,mine){
  const st=teamStyle(t.name),veil=S.spoiler&&!S.statsRevealed;
  const mid=rgb2hex(mixc(hex2rgb(st.c),hex2rgb(st.c2),.5)),hf=fgOn(mid);
  const uniq=new Set(t.games.flatMap(({g,code})=>g[code].filter(c=>c>=0))).size;
  const btns=mine
    ?`<button class="hbtn" type="button" data-change>마이 팀 바꾸기</button><button class="hbtn" type="button" data-myteam="">마이 팀 해제</button>`
    :`<button class="hbtn solid" type="button" data-myteam="${esc(t.name)}">마이 팀으로 설정</button>`;
  const fact=(k,v)=>`<div class="hf"><b>${v}</b><small>${k}</small></div>`;
  const tab=(k,label)=>`<button role="tab" type="button" data-ttab="${k}" aria-selected="${S.ttab===k}">${label}</button>`;
  return `<section class="card thead"><div class="hero2" style="--hc:${st.c};--hc2:${st.c2};--hf:${hf};--hs:${hf==='#ffffff'?'#111111':'#ffffff'}">
      <span class="hemb">${emblem(t.name,84)}</span>
      <div class="htx"><div class="hk">${leagueBadge(t.league,20)} ${esc(lgLabel(t.league))}${mine?' | 내 응원팀':''}</div><h1>${esc(tn(t.name))}</h1>${st.ko!==t.name?`<div class="hsub">${esc(t.name)}</div>`:''}</div>
      <div class="hfacts">${fact('시즌 성적',veil?'가림':`${t.w}승 ${t.l}패`)}${fact('승률',veil?'가림':Math.round(t.w/(t.w+t.l)*100)+'%')}${fact('써 본 챔피언',uniq+'개')}</div>
      <div class="hbtns">${btns}</div></div>
    <div class="ttabs" role="tablist">${tab('ov','개요')}${tab('games','경기')}${tab('players','선수')}${tab('champs','챔피언')}</div></section>`;
}
/* 왼쪽: 최근 시리즈 결과 */
function seriesSide(t){
  const veil=S.spoiler&&!S.statsRevealed,list=SLIST.filter(s=>s.A===t.name||s.B===t.name).slice(0,14);
  const side=(name,w,won)=>`<div class="sline ${won&&!veil?'won':''}">${emblem(name,20)}<span title="${esc(tn(name))}">${esc(teamStyle(name).short)}</span><b>${veil?'–':w}</b></div>`;
  return `<aside class="card tside"><h2 class="ptitle">최근 시리즈</h2>${list.map(s=>`<button type="button" class="sitem" data-series="${s.id}" title="${esc(tn(s.A))} 대 ${esc(tn(s.B))} 시리즈 복기">
      <div class="smeta"><span>${s.date.slice(5).replace('-','/')} | ${s.k}세트</span><span class="slg">${leagueBadge(s.league,16)}${esc(lgLabel(s.league))}</span></div>
      ${side(s.A,s.wA,s.wA>s.wB)}${side(s.B,s.wB,s.wB>s.wA)}</button>`).join('')||'<p class="muted">시리즈가 없어요.</p>'}</aside>`;
}
function teamBody(t,mine){
  const ros=roster(t),recent=t.games.slice().reverse(),veil=S.spoiler&&!S.statsRevealed;
  const cards=ros.some(Boolean)?`<div class="pgrid2">${ros.map(p=>p?playerCard2(p,t):'').join('')}</div>`:'';
  let main='';
  if(S.ttab==='games'){
    main=`<section class="card story"><h2 class="ptitle">경기 흐름 유형</h2>${teamFlow(t)}</section>
      <div class="games one">${recent.slice(0,S.tMore).map(x=>tcardHtml(x.g,x.code)).join('')}</div>${recent.length>S.tMore?`<button class="more" type="button" data-tmore>경기 더 보기 (${recent.length-S.tMore}개 남음)</button>`:''}`;
  }else if(S.ttab==='players'){
    main=`${cards}<section class="card story"><h2 class="ptitle">선수 지표 <span>최근 40경기 기준 주전</span></h2>${playerTable(t,ros)}<p class="rel" style="margin:12px 0 0">선수 사진은 쓰지 않아요. 권리를 확인한 사진이 생기면 이 자리에 넣을 수 있어요.</p></section>`;
  }else if(S.ttab==='champs'){
    main=`<div class="tgrid"><div>${teamChampTables(t,30).split('<!--ban-->')[0]}</div><div>${teamChampTables(t,30).split('<!--ban-->')[1]}</div></div>`;
  }else{
    const rel=COLUMNS.map((c,i)=>({c,i})).filter(x=>(x.c.teams||[]).includes(t.name));
    main=`${cards}${formChart(t)}<div class="tgrid"><div>${teamStatsHtml(t)}</div><div>${teamChampTables(t,10)}</div></div>
      ${ST?`<section class="card story"><h2 class="ptitle">진영과 용</h2><div class="mgrid">${sideHtml(t,veil)}${drakeHtml(t)}</div></section>`:''}
      ${rel.length?`<section class="card story"><h2 class="ptitle">이 팀 이야기</h2><div class="cols">${rel.map(x=>colCard(x.c,x.i)).join('')}</div></section>`:''}`;
  }
  return `${teamHead(t,mine)}<div class="tlayout">${seriesSide(t)}<div class="tcontent">${main}</div></div>`;
}

/* ---------- 칼럼 상자: @team(팀 지표), @form(최근 흐름), @flow(경기 하나의 흐름) ---------- */
const findTeam=name=>TEAMIDX[name]!=null?TEAMS[TEAMIDX[name]]:(TEAMS.filter(t=>tn(t.name)===name||teamStyle(t.name).short===name).sort((a,b)=>b.games.length-a.games.length)[0]||null);
/* ---------- 칼럼 데이터 상자: 제목 → 숫자·그래프 → 출처 한 줄. 꾸미는 문장은 넣지 않는다 ---------- */
const seasonOf=()=>G.length?G[G.length-1].d.slice(0,4)+' 시즌':'';
const srcOf=()=>META.demo?'데모 데이터':"Oracle's Elixir";
function dbox(title,sub,body,note){
  return `<figure class="dbox"><figcaption><b>${title}</b>${sub?`<span>${sub}</span>`:''}</figcaption>${body}<p class="dsrc">${note?note+' | ':''}${esc(seasonOf())} | ${esc(srcOf())}</p></figure>`;
}
const dstats=items=>`<div class="dstats">${items.map(([k,v])=>`<div><small>${k}</small><b>${v}</b></div>`).join('')}</div>`;
const wErr=msg=>`<figure class="dbox"><p class="muted" style="margin:0">${esc(msg)}</p></figure>`;
const wLoading='<figure class="dbox"><p class="muted" style="margin:0">지표를 불러오는 중…</p></figure>';
const gdk=v=>v==null?'-':(v>0?'+':v<0?'−':'')+(Math.abs(v)/1000).toFixed(1)+'k';

/* @search: 고른 챔피언(과 팀)이 나온 경기의 수, 승률, 95% 범위, 15분 골드 차이 */
function searchWidget(b,ref){
  const miss=[];
  for(const side of['blue','red'])for(const en of Object.values(b.board[side]||{}))if(chId(en)==null)miss.push(en);
  if(miss.length)return wErr(`챔피언을 찾을 수 없음: ${miss.join(', ')}`);
  if(b.team&&!findTeam(b.team))return wErr(`팀을 찾을 수 없음: ${b.team}`);
  const st={blue:toArr(b.board.blue),red:toArr(b.board.red),patch:b.patch||'all',sets:b.sets||'all',pos:b.pos||'any',leagues:new Set(b.leagues||[])};
  const res=withState(st,()=>{const sel=selection();return{sel,...run(sel)}});
  const total=res.sel.length,lab=searchLabel(b);
  let list=res.list.filter(r=>r.matched===total);
  const tmN=b.team?findTeam(b.team).name:null;
  if(tmN)list=list.filter(r=>(r.pGame==='b'?r.g.bt:r.g.rt)===tmN);
  const title=b.team?`${esc(tn(b.team))} | ${lab.q}`:lab.q,sub=lab.f.join(' | ');
  if(!list.length)return dbox(title,sub,'<p class="muted" style="margin:0">해당 경기 없음</p>','');
  const n=list.length,wins=list.filter(r=>r.win).length,ph=wins/n;
  const gds=list.map(r=>r.gd).filter(v=>v!=null),gd=gds.length?gds.reduce((a,v)=>a+v,0)/gds.length:null;
  const z=1.96,den=1+z*z/n,mid=(ph+z*z/(2*n))/den,half=z*Math.sqrt(ph*(1-ph)/n+z*z/(4*n*n))/den;   // 윌슨 95% 구간
  const veil=S.spoiler&&!S.statsRevealed;
  const items=veil?[['경기',n]]:[['경기',n.toLocaleString('ko-KR')],['전적',`${wins}승 ${n-wins}패`],['승률',n<5?'-':Math.round(ph*100)+'%'],
    ['95% 범위',n<5?'-':`${Math.max(0,Math.round((mid-half)*100))}–${Math.min(100,Math.round((mid+half)*100))}%`],['15분 골드 차이',fmtGd(gd)]];
  const lines=b.games?`<ul class="wlist">${list.slice(0,b.games).map(r=>{const g=r.g,me=r.pGame==='b'?g.bt:g.rt,op=r.pGame==='b'?g.rt:g.bt;
    return `<li><span>${esc(g.lg)} | ${fmtDate(g.d)} | ${g.s}세트</span><b>${esc(tn(me))}</b> vs ${esc(tn(op))}${veil?'':` <em class="${r.win?'pos':'neg'}">${r.win?'승':'패'}</em>`}</li>`}).join('')}</ul>`:'';
  return dbox(title,sub,`${dstats(items)}${lines}<div class="dact" style="margin-top:12px"><button class="btn" type="button" data-wsearch="${ref}">검색기에서 열기</button></div>`,
    b.team?'':'고른 챔피언을 쓴 팀 기준, 포지션 무관');
}
/* @series: 세트별 소진 챔피언과 포지션별 인기 픽 잔여 */
function seriesWidget(b){
  const s=pickSeries(b);if(!s)return '';
  const n=Math.min(Math.max(b.set==null?s.k:b.set,0),s.k),con=consumedAfter(s,n),pop=popBlockHtml(con);
  const left=ROLES.map(r=>[ROLE_KO[r],`${POPTOP[r].filter(id=>!con.has(id)).length}/${pop.per}`]);
  return dbox(`${esc(tn(s.A))} vs ${esc(tn(s.B))} | ${n}세트 후`,`${esc(s.league)} | ${fmtDate(s.date)}`,
    `${dstats([['소진 챔피언',con.size],['인기 상위 소진',`${pop.used}/${pop.total}`]])}<div class="tpanels">${teamPanelHtml(s,s.A,n)}${teamPanelHtml(s,s.B,n)}</div>
     <p class="dlab">포지션별 인기 상위 ${pop.per}명 중 남은 수</p>${dstats(left)}
     <div class="dact" style="margin-top:12px"><button class="btn" type="button" data-wseries="${s.id}:${n}">시리즈 복기 열기</button></div>`,
    '인기 순위: 시즌 포지션별 픽 수');
}
/* @draft: 한 세트의 밴픽 보드 (밴·픽 순서, 이전 세트 소진, 강조, 특정 시점까지만 보기)
   팀 안의 밴·픽 순서는 데이터 그대로. 두 팀 사이 순서는 표준 드래프트 규칙(선픽 팀이 1페이즈 밴·픽을 먼저, 2페이즈 밴은 후픽 팀이 먼저)으로 맞춘다 */
const dtn=name=>{const k=tn(name);return k===name&&name.length>10?(teamStyle(name).short||name):k};
function teamIs(name,q){const t=findTeam(q);return t?t.name===name:(name===q||tn(name)===q)}
function draftGame(b){
  if(b.id!=null||b.nth!=null)return pickGame(b);
  const [x,y]=b.teams;
  const gs=G.filter(g=>g.s===b.set&&((teamIs(g.bt,x)&&teamIs(g.rt,y))||(teamIs(g.bt,y)&&teamIs(g.rt,x)))&&(!b.date||g.d===b.date));
  return gs.sort((a,c)=>a.d<c.d?1:a.d>c.d?-1:0)[0]||null;
}
const DRAFT_SEQ=(()=>{const q=[];
  [['F',0],['S',0],['F',1],['S',1],['F',2],['S',2]].forEach(([t,i])=>q.push({t,k:'ban',i,ph:1}));
  [['F',0],['S',0],['S',1],['F',1],['F',2],['S',2]].forEach(([t,i])=>q.push({t,k:'pick',i,ph:1}));
  [['S',3],['F',3],['S',4],['F',4]].forEach(([t,i])=>q.push({t,k:'ban',i,ph:2}));
  [['S',3],['F',3],['F',4],['S',4]].forEach(([t,i])=>q.push({t,k:'pick',i,ph:2}));
  return q.map((x,n)=>({...x,step:n+1}))})();
function draftWidget(b){
  const g=draftGame(b);if(!g)return wErr(b.teams?`${b.teams.join(' vs ')} ${b.set}세트 경기를 찾을 수 없음`:'경기를 찾을 수 없음');
  const upto=b.upto||20,{html,exact}=draftBoard(g,{upto,hl:b.hl});
  const sub=`${esc(g.lg)} | ${fmtDate(g.d)} | 패치 ${esc(g.p)}${upto>=20?'':` | ${upto}번째 선택까지`}`;
  return dbox(`${esc(dtn(g.bt))} vs ${esc(dtn(g.rt))} | ${g.s}세트 밴픽`,sub,html,exact?'숫자: 전체 픽 순서':'픽 순서 정보가 없어 포지션 순서로 표시');
}
/* 밴픽 보드 본문 (칼럼 @draft와 피어리스 복기가 함께 쓴다). veil=결과 숨김 */
function draftBoard(g,o){
  const b={upto:o.upto,hl:o.hl};
  const F=g.fp||'b',side=t=>t==='F'?F:(F==='b'?'r':'b');
  const order={b:g.bo&&g.bo.length===5?g.bo:g.b,r:g.ro&&g.ro.length===5?g.ro:g.r};
  const exact=g.bo&&g.bo.length===5&&g.ro&&g.ro.length===5;
  const upto=b.upto||20,hl=new Set((b.hl||[]).map(chId).filter(x=>x!=null));
  let pn=0;const cells={b:{ban:[],pick:[]},r:{ban:[],pick:[]}};
  for(const q of DRAFT_SEQ){const sd=side(q.t),c=q.k==='ban'?(g[sd+'b']||[])[q.i]:order[sd][q.i];
    if(q.k==='pick')pn++;
    cells[sd][q.k].push({...q,c,pn:q.k==='pick'?pn:null,show:q.step<=upto&&c!=null&&c>=0});}
  const roleOf=(sd,c)=>{const i=g[sd].indexOf(c);return i>=0?ROLE_KO[ROLES[i]]:''};
  const cell=(sd,x)=>{
    if(!x.show)return `<div class="dr-c ${x.k} empty"><span class="dr-i"></span>${x.k==='pick'?`<small>${x.pn}픽</small>`:''}</div>`;
    const ch=CH[x.c],h=hl.has(x.c)||(o.last&&upto<20&&x.step===upto)?' hl':'';
    return `<div class="dr-c ${x.k}${h}" title="${esc(ch.ko)}${x.k==='ban'?' (밴)':' | '+roleOf(sd,x.c)}"><span class="dr-i"><span class="dr-im"><img src="${ch.icon}" alt="" width="${x.k==='ban'?34:46}" height="${x.k==='ban'?34:46}"></span>${x.k==='pick'?`<em>${x.pn}</em>`:''}</span><b>${esc(ch.ko)}</b></div>`;
  };
  const row=(ph,k,label)=>`<div class="dr-row ${k}"><span class="dr-lab">${label}</span>${['b','r'].map(sd=>`<div class="dr-cells ${sd}">${cells[sd][k].filter(x=>x.ph===ph).map(x=>cell(sd,x)).join('')}</div>`).join('')}</div>`;
  const done=upto>=20,won=sd=>done&&!o.veil&&g.w===sd;
  const head=sd=>{const name=sd==='b'?g.bt:g.rt;return `<div class="dr-team ${sd}">${emblem(name,22,true)}<b>${esc(dtn(name))}</b><small>${sd==='b'?'블루':'레드'}${F===sd?' | 선픽':''}</small>${won(sd)?'<em>승</em>':''}</div>`};
  // 피어리스: 이 세트 전에 두 팀이 이미 쓴 챔피언
  const s=g.sid!=null?SERIES.get(g.sid):null,prev=s?s.games.filter(x=>x.s<g.s):[];
  const used=name=>prev.flatMap(x=>(x.bt===name?x.b:x.rt===name?x.r:[])).filter(c=>c>=0);
  const prevHtml=prev.length?`<div class="dr-prev"><span class="dr-lab">${prev.length===1?'1세트':`1~${prev.length}세트`} 소진</span>${['b','r'].map(sd=>`<div class="dr-used ${sd}">${used(sd==='b'?g.bt:g.rt).map(c=>`<span class="dr-u${hl.has(c)?' hl':''}" title="${esc(CH[c].ko)}"><img src="${CH[c].icon}" alt="${esc(CH[c].ko)}" width="26" height="26"></span>`).join('')}</div>`).join('')}</div>`:'';
  const body=`<div class="drb"><div class="dr-row dr-heads"><span class="dr-lab"></span>${head('b')}${head('r')}</div>${prevHtml}
    ${row(1,'ban','1페이즈 밴')}${row(1,'pick','1페이즈 픽')}${row(2,'ban','2페이즈 밴')}${row(2,'pick','2페이즈 픽')}</div>`;
  return{html:body,exact};
}
function gameWidget(b){
  const g=pickGame(b);if(!g)return '';
  return dbox(`${esc(tn(g.bt))} vs ${esc(tn(g.rt))}`,`${esc(g.lg)} | ${fmtDate(g.d)} | ${g.s}세트`,`<div class="games one">${gameStripHtml(g)}</div>`,'');
}
/* @team: 지표 묶음은 시간 기준(초반 / 경기 전체). 이 사이트가 정한 묶음이고 공인 분류가 아니다 */
const EARLY=[['gd15','15분 골드 차이',fmtGd,1],['xpd15','15분 경험치 차이',v=>(v>0?'+':v<0?'−':'')+Math.abs(Math.round(v)),1],['csd15','15분 CS 차이',fs1,1],['fb','첫킬',fp,1],
  ['ft','첫포탑',fp,1],['plt','포탑 방패',f1,1],['grub','공허 유충',f1,1],['her','전령',f2,1]];
const WHOLE=[['gpm','분당 골드',f0,1],['cspm','분당 CS',f1,1],['dpm','분당 데미지',f0,1],['vspm','분당 시야 점수',f2,1],['wcpm','분당 와드 제거',f2,1],
  ['k','경기당 킬',f1,1],['d','경기당 데스',f1,-1],['drgS','드래곤 점유율',fp,1],['barS','바론 점유율',fp,1],['ahead','15분 우위 시 승률',fp,1]];
function leagueVals(lg,key){return leagueMetrics(lg).map(x=>({t:x.t,v:x.m[key]})).filter(x=>x.v!=null)}
const median=a=>{const s=[...a].sort((x,y)=>x-y),n=s.length;return n?(n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2):null};   // 순위와 막대 방향이 어긋나지 않게 가운데는 중간값
/* 지표 정의 (Oracle's Elixir처럼 이름에 마우스를 올리면 보인다). 모든 값은 경기마다 계산한 뒤 경기 평균, 점유율만 시즌 합계 기준 */
const MDESC={gd15:'15분 시점 팀 골드 − 상대 골드',xpd15:'15분 시점 팀 경험치 − 상대 경험치',csd15:'15분 시점 팀 CS − 상대 CS',
  fb:'첫 킬을 낸 경기의 비율',ft:'첫 포탑을 깬 경기의 비율',plt:'경기당 부순 포탑 방패 수',grub:'경기당 처치한 공허 유충 수',her:'경기당 처치한 전령 수',
  gpm:'팀이 1분마다 얻은 골드',cspm:'팀 5명이 1분마다 처치한 미니언, 몬스터 수의 합',dpm:'팀이 챔피언에게 1분마다 준 데미지',vspm:'팀의 분당 시야 점수',wcpm:'팀이 1분마다 제거한 와드 수',
  k:'경기당 킬',d:'경기당 데스 (낮을수록 좋음)',drgS:'양 팀이 처치한 드래곤 중 이 팀의 몫 (시즌 합계)',barS:'양 팀이 처치한 바론 중 이 팀의 몫 (시즌 합계)',ahead:'15분에 골드가 앞선 경기에서 이긴 비율'};
const mlab=(k,label)=>`<span class="tm-def" title="${esc(MDESC[k]||'')}">${label}</span>`;
/* 0 또는 50%가 자연스러운 기준인 지표 (차이값·점유율·비율): 막대를 그 기준에서 그린다 */
const BASE={gd15:0,xpd15:0,csd15:0,fb:50,ft:50,drgS:50,barS:50,ahead:50};

/* @rank: 지표 하나로 리그 전체 팀을 세운 순위표 (Sheep 리더 카드 + OP.GG 순위표). 글에서 말하는 팀만 강조 */
function rankWidget(b){
  const def=EARLY.concat(WHOLE).find(x=>x[0]===b.stat);if(!def)return wErr(`알 수 없는 지표: ${b.stat}`);
  const t=b.team?findTeam(b.team):null;if(b.team&&!t)return wErr(`팀을 찾을 수 없음: ${b.team}`);
  if(ST===null){loadStats();return wLoading}
  const lg=b.league||(t&&t.league),[k,label,fmt,dir]=def;
  const rows=leagueMetrics(lg).map(x=>({t:x.t,v:x.m[k],n:x.m.n})).filter(x=>x.v!=null).sort((a,c)=>(c.v-a.v)*dir);
  if(rows.length<3)return wErr(`${lg}: 비교할 팀이 부족함`);
  if(t&&!rows.some(r=>r.t===t))return wErr(`${b.team}: ${lg}에서 8경기 이상 치르지 않음`);
  // 막대는 기준점에서 그린다: 0·50%가 자연스러운 지표는 그 값, 아니면 리그 평균 (0부터 그리면 1,870과 1,940이 똑같아 보인다)
  const a=avg(rows.map(r=>r.v)),base=BASE[k],from=base!=null?base:a,span=Math.max(...rows.map(r=>Math.abs(r.v-from)))||1;
  const x=v=>50+(v-from)*dir/span*46,showAvg=base!=null&&Math.abs(x(a)-50)>1.5;   // 평균이 기준과 거의 같으면 선을 하나만
  const body=rows.map((r,i)=>{const me=r.t===t,v0=x(from),v1=x(r.v);
    return `<div class="rk-row ${me?'me':''}"><span class="rk-n">${i+1}</span><span class="rk-t">${emblem(r.t.name,20)}<b>${esc(tn(r.t.name))}</b><small>${r.n}경기</small></span>
      <div class="rk-bar"><i style="left:${Math.min(v0,v1).toFixed(1)}%;width:${Math.abs(v1-v0).toFixed(1)}%"></i><em class="rk-base" style="left:50%"></em>${showAvg?`<em class="rk-avg" style="left:${x(a).toFixed(1)}%"></em>`:''}</div>
      <span class="rk-v">${fmt(r.v)}</span></div>`}).join('');
  const mine=t?rows.findIndex(r=>r.t===t):-1;
  return dbox(`${mlab(k,label)} | ${esc(lg)} ${rows.length}팀`,t?`${esc(tn(t.name))} ${mine+1}위 | ${fmt(rows[mine].v)}${dir<0?' | 낮을수록 위':''}`:(dir<0?'낮을수록 위':''),
    `<div class="rk-list">${body}</div><p class="rk-leg">${base==null?`<span><i class="rk-base"></i>막대 기준 = 리그 평균 ${fmt(a)}</span>`:showAvg?`<span><i class="rk-base"></i>막대 기준 ${fmt(base)}</span><span><i class="rk-avg"></i>리그 평균 ${fmt(a)}</span>`:`<span><i class="rk-base"></i>막대 기준 ${fmt(base)} (리그 평균 ${fmt(a)})</span>`}</p>`,
    `${esc(MDESC[k]||'')} | ${esc(lg)}에서 8경기 이상 치른 팀`);
}

/* 지표 하나를 리그와 비교: 값, 리그 평균, 순위, 차이가 큰가(리그 폭의 1/4 이상) */
function metricCmp(t,m,[k,label,fmt,dir]){
  const lg=t.league,vs=leagueVals(lg,k).map(x=>x.v),v=m[k];
  if(v==null||vs.length<4)return null;
  const a=avg(vs),lo=Math.min(...vs),hi=Math.max(...vs),rk=rankOf(lg,k,dir,v);
  const gap=(v-a)*dir,big=hi>lo&&Math.abs(v-a)>=(hi-lo)/4;
  return{k,label,fmt,dir,v,a,rk,gap,big,tone:big?(gap>0?'good':'bad'):'',score:hi>lo?Math.abs(v-a)/(hi-lo):0};
}
const ordinal=rk=>rk?`${rk.r}위`:'';
/* 큰 숫자 카드 (Opta 팀 리더 카드 방식) */
function leaderCard(c,lg){
  return `<div class="tm-card ${c.tone}"><small>${mlab(c.k,c.label)}</small><div class="tm-val"><b>${c.fmt(c.v)}</b><em>${ordinal(c.rk)}</em></div><span>${esc(lg)} 평균 ${c.fmt(c.a)}</span></div>`;
}
/* 표 한 줄 (dpm.lol 방식: 순위 배지 | 지표 | 팀 값 | 리그 평균, 차이가 클 때만 더 나은 쪽에 색 박스) */
function cmpRow(c){
  return `<div class="tm-row"><span class="tm-rk ${c.rk&&c.rk.r===1?'tm-first':''}">${ordinal(c.rk)}</span><span class="tm-l">${mlab(c.k,c.label)}</span>
    <span class="tm-v"><b class="${c.big&&c.gap>0?'tm-hi good':''}">${c.fmt(c.v)}</b></span><span class="tm-a"><b class="${c.big&&c.gap<0?'tm-hi bad':''}">${c.fmt(c.a)}</b></span></div>`;
}
function teamWidget(b){
  const t=findTeam(b.name);if(!t)return wErr(`팀을 찾을 수 없음: ${b.name}`);
  if(ST===null){loadStats();return wLoading}
  const m=ST?teamMetrics(t):null;if(!m)return wErr(`${b.name}: 지표 없음`);
  const veil=S.spoiler&&!S.statsRevealed,lg=t.league,nT=leagueMetrics(lg).length,few=m.n<8;
  const defs=EARLY.concat(WHOLE).filter(x=>!(veil&&x[0]==='ahead'));
  const head=`${emblem(t.name,22)} ${esc(tn(t.name))} 팀 지표`,sub=`${esc(lg)} ${nT}팀과 비교 | ${esc(lg)} ${m.n}경기`;
  const note=`색: 리그 평균과의 차이가 리그 최고–최저 폭의 4분의 1 이상 | 순위: ${esc(lg)}에서 8경기 이상 치른 ${nT}팀 중`;
  const fewTag=few?'<p class="tm-few">표본 부족: 8경기 미만이라 참고용</p>':'';
  if(b.show){   // 글에 필요한 지표만 카드로
    const cs=b.show.map(k=>defs.find(x=>x[0]===k)).filter(Boolean).map(d=>metricCmp(t,m,d)).filter(Boolean);
    return dbox(head,sub,`${fewTag}<div class="tm-cards ${few?'tm-dim':''}">${cs.map(c=>leaderCard(c,lg)).join('')}</div>`,note);
  }
  const all=defs.map(d=>metricCmp(t,m,d)).filter(Boolean),stand=all.filter(c=>c.big).sort((x,y)=>y.score-x.score).slice(0,4);
  const grp=(title,ds)=>{const rows=ds.map(d=>all.find(c=>c.k===d[0])).filter(Boolean);
    return `<section class="tm-sec"><div class="tm-row tm-head"><span></span><span class="tm-l">${title}</span><span class="tm-v">${esc(teamStyle(t.name).short)}</span><span class="tm-a">${esc(lg)} 평균</span></div>${rows.map(cmpRow).join('')}</section>`};
  return dbox(head,sub,
    `${fewTag}<p class="dlab">리그 평균과 차이가 큰 지표</p>${stand.length?`<div class="tm-cards ${few?'tm-dim':''}">${stand.map(c=>leaderCard(c,lg)).join('')}</div>`:'<p class="muted" style="margin:0 0 8px">없음 (모든 지표가 리그 평균 근처)</p>'}
     <details class="wmore"><summary>전체 지표 ${all.length}개 보기</summary><div class="tm-grid ${few?'tm-dim':''}">${grp('초반 <small>15분 전후</small>',EARLY)}${grp('경기 전체',WHOLE.filter(x=>!(veil&&x[0]==='ahead')))}</div></details>`,note+' | 지표 이름에 마우스를 올리면 정의');
}
/* @form: 최근 n경기를 한 줄씩, 15분 골드 차이 가로 막대 */
function formWidget(b){
  const t=findTeam(b.team);if(!t)return wErr(`팀을 찾을 수 없음: ${b.team}`);
  const list=t.games.filter(x=>!b.until||x.g.d<=b.until).slice(-b.n).reverse();
  if(!list.length)return wErr('해당 경기 없음');
  const veil=S.spoiler&&!S.statsRevealed,w=list.filter(x=>x.g.w===x.code).length;
  const gdOf=x=>x.g.gd==null?null:(x.code==='b'?x.g.gd:-x.g.gd);
  const mx=Math.max(3000,...list.map(x=>Math.abs(gdOf(x)||0))),cap=Math.ceil(mx/1000)*1000;
  const rows=list.map(x=>{const g=x.g,v=gdOf(x),o=x.code==='b'?g.rt:g.bt,win=g.w===x.code,wd=v==null?0:Math.abs(v)/cap*50;
    return `<div class="frow"><span class="fdt">${fmtDate(g.d).replace('월 ','/').replace('일','')}</span><span class="fop">${emblem(o,18)}<span>${esc(teamStyle(o).short)}</span></span>
      <div class="fbar3">${veil||v==null?'':`<i class="${v>=0?'up':'dn'}" style="width:${wd.toFixed(1)}%;${v>=0?'left:50%':'right:50%'}"></i>`}</div>
      <span class="fval">${veil?'':gdk(v)}</span><span class="fres ${veil?'':win?'w':'l'}">${veil?'':win?'승':'패'}</span></div>`}).join('');
  const axis=`<div class="frow fax"><span></span><span></span><div class="fbar3 ax"><small style="left:0">−${cap/1000}k</small><small style="left:50%">0</small><small style="left:100%">+${cap/1000}k</small></div><span></span><span></span></div>`;
  return dbox(`${esc(tn(t.name))} 최근 ${list.length}경기${veil?'':` | ${w}승 ${list.length-w}패`}`,`${fmtDate(list[list.length-1].g.d)} – ${fmtDate(list[0].g.d)} | 막대: 15분 골드 차이`,
    `<div class="flist">${rows}${axis}</div>`,'');
}
/* @flow: 경기 하나. 지정한 팀 기준의 시간대별 골드 차이(축 있음), 10·15분 차이, 먼저 가져간 쪽, 최종 수치 */
function niceStep(mx){for(const s of[500,1000,2000,2500,5000,10000])if(mx/s<=3)return s;return 10000}
function flowWidget(b){
  let g;
  if(b.id!=null||b.nth!=null)g=pickGame(b);
  else{const t=findTeam(b.team);if(!t)return wErr(`팀을 찾을 수 없음: ${b.team}`);const x=t.games[t.games.length-b.last];g=x&&x.g}
  if(!g)return wErr('경기를 찾을 수 없음');
  const tmF=b.team?(findTeam(b.team)||{name:b.team}).name:null;
  if(tmF&&g.bt!==tmF&&g.rt!==tmF)return wErr(`${b.team}가 뛴 경기가 아님 (${g.bt} vs ${g.rt})`);
  if(ST===null){loadStats();return wLoading}
  const code=tmF&&g.rt===tmF?'r':'b',o=opp(code),me=code==='b'?g.bt:g.rt,them=code==='b'?g.rt:g.bt,win=g.w===code,sg=code==='b'?1:-1;
  const T=k=>tSt(g,code,k),O=k=>tSt(g,o,k);
  const pts=[[10,g.g10],[15,g.gd],[20,g.g20],[25,g.g25]].filter(x=>x[1]!=null).map(([mm,v])=>[mm,v*sg]);
  const W=560,H=220,L=52,Rr=28,Tp=24,B=28,mx=Math.max(1000,...pts.map(p=>Math.abs(p[1]))),st=niceStep(mx),top=Math.ceil(mx/st)*st;
  const xs=mm=>L+28+(mm-10)/15*(W-L-28-Rr),ys=v=>Tp+(top-v)/(2*top)*(H-Tp-B);
  const ticks=[];for(let v=-top;v<=top;v+=st)ticks.push(v);
  const grid=ticks.map(v=>`<line x1="${L}" x2="${W-Rr}" y1="${ys(v).toFixed(1)}" y2="${ys(v).toFixed(1)}" class="${v===0?'z':'gl'}"/><text x="${L-8}" y="${(ys(v)+4).toFixed(1)}" text-anchor="end">${v===0?'0':gdk(v)}</text>`).join('');
  const line=pts.length>1?`<polyline points="${pts.map(([mm,v])=>`${xs(mm).toFixed(1)},${ys(v).toFixed(1)}`).join(' ')}" class="fl"/>`:'';
  const svg=`<svg class="flowsvg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(tn(me))} 기준 시간대별 골드 차이">${grid}${[10,15,20,25].map(mm=>`<text x="${xs(mm)}" y="${H-8}" text-anchor="middle">${mm}분</text>`).join('')}${line}${pts.map(([mm,v])=>`<circle cx="${xs(mm).toFixed(1)}" cy="${ys(v).toFixed(1)}" r="4" class="fp ${v>=0?'w':'l'}"/><text x="${xs(mm).toFixed(1)}" y="${(ys(v)-9).toFixed(1)}" text-anchor="middle" class="fv">${fmtGd(v)}</text>`).join('')}</svg>`;
  const sgn=v=>v==null?'-':(v>0?'+':v<0?'−':'')+Math.abs(Math.round(v)).toLocaleString('ko-KR');
  const yn=(ours)=>ours==null?'-':ours?esc(teamStyle(me).short):esc(teamStyle(them).short);
  const firsts=[['첫 킬',T('fb')==null?null:T('fb')===1],['첫 포탑',g.ft?g.ft===code:null],['첫 미드 포탑',T('fmt')==null?null:T('fmt')===1],['포탑 3개 선점',T('f3t')==null?null:T('f3t')===1],['첫 용',g.fd?g.fd===code:null],['첫 전령',g.fh?g.fh===code:null],['첫 바론',g.fb?g.fb===code:null]].filter(x=>x[1]!=null);
  const pair=(l,a,b2)=>a==null&&b2==null?'':`<tr><td>${l}</td><td class="num"><b>${a??'-'}</b></td><td class="num">${b2??'-'}</td></tr>`;
  const sh=esc(teamStyle(me).short),so=esc(teamStyle(them).short);
  return dbox(`${esc(tn(me))} vs ${esc(tn(them))} | ${win?'승':'패'}`,`${esc(g.lg)} | ${fmtDate(g.d)} | ${g.s}세트${g.len?` | ${g.len}분`:''} | ${esc(tn(me))} 기준`,
    `<div class="wpicks">${[code,o].map(c=>{const nm=c==='b'?g.bt:g.rt;return `<div>${emblem(nm,20)}<b>${esc(tn(nm))}</b><span class="muted">${c==='b'?'블루':'레드'}</span><span class="wic">${g[c].map(x=>x<0?'<i class="tph">?</i>':`<img src="${CH[x].icon}" alt="${esc(CH[x].ko)}" title="${esc(CH[x].ko)}" width="28" height="28">`).join('')}</span></div>`}).join('')}</div>
     <p class="dlab">골드 차이</p>${svg}
     <div class="mgrid">
      <div class="mpanel"><table class="ptable"><thead><tr><th>차이</th><th class="num">10분</th><th class="num">15분</th></tr></thead><tbody>
        <tr><td>골드</td><td class="num">${sgn(g.g10==null?null:g.g10*sg)}</td><td class="num">${sgn(g.gd==null?null:g.gd*sg)}</td></tr>
        <tr><td>경험치</td><td class="num">${sgn(T('xpd10'))}</td><td class="num">${sgn(T('xpd15'))}</td></tr>
        <tr><td>CS</td><td class="num">${sgn(T('csd10'))}</td><td class="num">${sgn(T('csd15'))}</td></tr>
        <tr><td>킬 (${sh}:${so})</td><td class="num">-</td><td class="num">${T('k15')??'-'} : ${O('k15')??'-'}</td></tr></tbody></table></div>
      <div class="mpanel"><table class="ptable"><thead><tr><th>최종</th><th class="num">${sh}</th><th class="num">${so}</th></tr></thead><tbody>${[pair('킬',T('k'),O('k')),pair('포탑',T('tow'),O('tow')),pair('용',T('drg'),O('drg')),pair('공허 유충',T('grub'),O('grub')),pair('바론',T('bar'),O('bar')),pair('억제기',T('inh'),O('inh'))].join('')}</tbody></table></div>
     </div>
     <p class="dlab">먼저 가져간 쪽</p><div class="dstats fstats">${firsts.map(([l,ours])=>`<div><small>${l}</small><b class="${ours?'pos':''}">${yn(ours)}</b></div>`).join('')}</div>`,
    '10/15/20/25분 시점 값');
}

/* 공개 사이트를 만들 때 쓰는 내보내기: 칼럼마다 근거 상자까지 계산한 본문 HTML (누르는 버튼은 뺀다) */
window.dfExport=async function(){
  await loadStats();
  S.spoiler=false;S.statsRevealed=true;
  const clean=h=>h.replace(/<div class="dact"[^>]*>[\s\S]*?<\/div>/g,'').replace(/<button class="again"[^>]*>[^<]*<\/button>/g,'').replace(/ data-(open|team|twin)="[^"]*"/g,'').replace(/ tabindex="0"/g,'');
  return COLUMNS.map((c,i)=>({slug:c.slug,html:clean(columnBody(c,i))}));
};

/* ---------- 내 팀(마이 팀 고르기 또는 팀 홈), 팀 페이지 ---------- */
function teamPickList(){
  const q=S.tq.trim().toLowerCase();
  let list=TEAMS.filter(t=>(S.tlg==='all'||t.league===S.tlg)&&(!q||t.name.toLowerCase().includes(q)||tn(t.name).toLowerCase().includes(q)));
  const total=list.length;list=list.slice(0,60);
  return `<div class="egrid">${list.map(t=>`<div class="etile ${S.myTeam===t.name?'on':''}"><button type="button" class="ebtn" data-myteam="${esc(t.name)}" title="${esc(t.name)}">${emblem(t.name,64)}<span>${esc(tn(t.name))}</span></button></div>`).join('')||'<p class="muted">찾는 팀이 없어요.</p>'}</div>${total>60?`<p class="muted" style="margin:10px 0 0;font-size:.82rem">${total-60}개 팀이 더 있어요. 이름으로 검색해 보세요.</p>`:''}`;
}
function renderTeams(){
  const box=$('#teams-box');if(!box)return;
  const id=S.myTeam!=null?TEAMIDX[S.myTeam]:null;
  if(id!=null&&!S.changing){box.innerHTML=teamBody(TEAMS[id],true);formToEnd();return}
  const lgCnt={};TEAMS.forEach(t=>lgCnt[t.league]=(lgCnt[t.league]||0)+t.games.length);
  const pref=['LCK','LPL','LEC','LCS','LCP','CBLOL'],lgs=pref.filter(l=>lgCnt[l]).concat(Object.entries(lgCnt).filter(x=>!pref.includes(x[0])).sort((a,b)=>b[1]-a[1]).slice(0,4).map(x=>x[0]));
  box.innerHTML=`
    <section class="card story">
      <input class="q" id="team-q" type="search" placeholder="팀 이름 검색" autocomplete="off" value="${esc(S.tq)}" style="width:100%;margin:0 0 10px">
      ${leagueBar(lgs,S.tlg,'tlg','전체')}
      <div id="team-pick">${teamPickList()}</div></section>
    ${id!=null?`<button class="chip" type="button" data-keep style="margin-top:14px">← 바꾸지 않고 돌아가기</button>`:''}`;
}
function renderTeam(id){
  S.team=id;
  const box=$('#team-box'),t=TEAMS[id];
  if(!t){box.innerHTML='<div class="card empty-state"><h2>찾는 팀이 없어요</h2><a class="btn" href="#teams">내 팀으로</a></div>';return}
  box.innerHTML=`<a class="chip" href="#teams">← 내 팀</a><div style="height:12px"></div>${teamBody(t,S.myTeam===t.name)}`;
  formToEnd();
}

/* ---------- 챔피언 고르기 ---------- */
let P=null;
const CHO='ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const cho=s=>[...s].map(ch=>{const c=ch.charCodeAt(0)-0xAC00;return c>=0&&c<11172?CHO[Math.floor(c/588)]:ch}).join('');
function openPicker(side,i){
  P={side,i,tab:ROLES[i]};
  $('#p-title').textContent=`${side==='blue'?'블루':'레드'} | ${ROLE_KO[ROLES[i]]} 챔피언 고르기`;
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
function refresh(){renderResults();renderSeries();if(!$('#view-champs').hidden)renderChamps();if(!$('#view-column').hidden)renderColumn(S.col);if(!$('#view-teams').hidden)renderTeams();if(!$('#view-team').hidden)renderTeam(S.team);if(S.detailId)openDetail(S.detailId)}
function update(){renderBoard();renderFilters();renderResults()}
document.addEventListener('click',e=>{
  const t=e.target;
  // 결과 공개 버튼은 카드 클릭(상세 열기)보다 먼저 처리한다
  const rv=t.closest('[data-reveal]');if(rv){S.revealed.add(rv.dataset.reveal);refresh();return}
  const mt=t.closest('[data-myteam]');if(mt){setMyTeam(mt.dataset.myteam);return}
  if(t.closest('[data-change]')){S.changing=true;renderTeams();window.scrollTo({top:0});return}
  if(t.closest('[data-keep]')){S.changing=false;renderTeams();return}
  const tm=t.closest('[data-team]');if(tm){closeDetail();S.tMore=12;S.ttab='ov';location.hash='team-'+tm.dataset.team;route();window.scrollTo({top:0});return}
  const pe=t.closest('[data-persp]');if(pe&&S.detailId){S.persp={id:S.detailId,code:pe.dataset.persp};openDetail(S.detailId);return}
  const tl=t.closest('[data-tlg]');if(tl){S.tlg=tl.dataset.tlg;renderTeams();return}
  if(t.closest('[data-tmore]')){S.tMore+=12;if(!$('#view-team').hidden)renderTeam(S.team);else renderTeams();return}
  if(t.closest('[data-stats]')){S.statsRevealed=true;refresh();return}
  const cl=t.closest('[data-cl]');if(cl){S.cl=cl.dataset.cl;S.csp=null;S.cn=20;renderChamps();return}
  const cp=t.closest('[data-cpt]');if(cp){S.cpt=cp.dataset.cpt;S.cn=20;renderChamps();return}
  const cr=t.closest('[data-cr]');if(cr){S.cr=cr.dataset.cr;S.cn=20;renderChamps();return}
  const tt=t.closest('[data-ttab]');if(tt){S.ttab=tt.dataset.ttab;S.tMore=12;if(!$('#view-team').hidden)renderTeam(S.team);else renderTeams();return}
  const tbk=t.closest('[data-tbk]');if(tbk){S.tbk=tbk.dataset.tbk;if(!$('#view-team').hidden)renderTeam(S.team);else renderTeams();return}
  const cv=t.closest('[data-cview]');if(cv){S.cview=cv.dataset.cview;S.cn=20;renderChamps();return}
  if(t.closest('[data-cmore]')){S.cn+=20;renderChamps();return}
  const cs=t.closest('[data-chsearch]');if(cs){const c=CH[+cs.dataset.chsearch],role=S.cr!=='all'?ROLES[+S.cr]:(c.roles[0]||'mid');
    setBoard({blue:{[role]:c.en}});S.leagues.clear();if(S.cl!=='all'&&LEAGUES.includes(S.cl))S.leagues.add(S.cl);S.shown=12;location.hash='search';update();window.scrollTo({top:0});return}
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
  const st=t.closest('[data-sset-tab]');if(st){S.sSet=+st.dataset.ssetTab;S.sEnd=false;S.dStep=20;renderSeries();return}
  const ds=t.closest('[data-dstep]');if(ds){const v=+ds.dataset.dstep,cur=S.dStep||20;S.dStep=v===0?1:v===20?20:Math.min(20,Math.max(1,(cur>=20&&v<0?20:cur)+v));renderSeries();return}
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
document.addEventListener('change',e=>{if(e.target&&e.target.id==='cl-more'&&e.target.value){S.cl=e.target.value;S.csp=null;S.cn=20;renderChamps()}
  if(e.target&&e.target.id==='cpt-one'&&e.target.value){S.cpt=e.target.value;S.cn=20;renderChamps()}
  if(e.target&&e.target.id==='csp-one'&&e.target.value){S.csp=e.target.value;S.cpt='all';S.cn=20;renderChamps()}});
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

/* ---------- 칼럼 쓰기: 원고는 이 페이지의 저장소(db)에 둔다. Claude가 읽어서 columns/*.md로 옮긴다 ---------- */
/* src/columns.py와 같은 규칙의 파서 (미리 보기용). 결과 블록 모양도 같다 */
const POSN=['top','jng','mid','bot','sup'];
const MKEYS=()=>EARLY.concat(WHOLE).map(x=>x[0]);
function colParse(text){
  const errs=[],blocks=[];
  const body=String(text||'').replace(/^(#{2,3} .*|@\w+.*)$/gm,'\n$1\n');
  const paras=body.trim().split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean);
  paras.forEach((para,i)=>{
    const em=/^@(\w+)\b(.*)$/.exec(para.split('\n')[0]);
    if(em){
      try{blocks.push({type:em[1],...colEmbed(em[1],colArgs(em[2]))})}
      catch(e){errs.push(`${i+1}번째 문단: ${e.message}`);blocks.push({type:'err',text:`${para.split('\n')[0]} → ${e.message}`})}
    }else if(para.startsWith('### '))blocks.push({type:'h3',text:para.slice(4).trim()});
    else if(para.startsWith('## '))blocks.push({type:'h',text:para.slice(3).trim()});
    else blocks.push({type:'p',text:para.split('\n').map(x=>x.trim()).join(' ')});
  });
  return{blocks,errs};
}
function colArgs(raw){
  const out={},re=/(\S+?)=("([^"]*)"|\S+)|(\S+)/g;let m;
  while((m=re.exec(raw))){if(m[4]!=null)throw new Error(`'${m[4]}'는 key=value 모양이어야 해요`);out[m[1]]=m[3]!=null?m[3]:m[2]}
  return out;
}
function colEmbed(kind,a){
  const int=(k,v)=>{if(!/^-?\d+$/.test(v))throw new Error(`${k}=${v}: 숫자여야 해요`);return +v};
  const only=ok=>{const ex=Object.keys(a).filter(k=>!ok.includes(k));if(ex.length)throw new Error(`@${kind}에 알 수 없는 인자 ${ex.join(', ')}`)};
  const ref=()=>{if('nth'in a)return{nth:int('nth',a.nth)};if('id'in a)return{id:a.id};throw new Error(`@${kind}에는 nth=N 또는 id=게임ID가 필요해요`)};
  if(kind==='search'){
    const board={blue:{},red:{}},o={};
    for(const[k,v]of Object.entries(a)){
      if(/^(blue|red)\./.test(k)){const[side,role]=k.split('.');if(!POSN.includes(role))throw new Error(`알 수 없는 포지션 '${role}' (top/jng/mid/bot/sup)`);board[side][role]=v}
      else if(k==='team')o.team=v;
      else if(k==='games'){const n=int(k,v);if(n<0||n>10)throw new Error('games는 0~10 사이여야 해요');o.games=n}
      else if(k==='leagues')o.leagues=v.split(',').filter(Boolean);
      else if(k==='sets'||k==='patch'||k==='pos'){const ok={sets:['all','early','late'],patch:['all','latest','last3'],pos:['any','exact']}[k];if(!ok.includes(v))throw new Error(`${k}=${v}: ${ok.join('/')} 중 하나`);o[k]=v}
      else throw new Error(`@search에 알 수 없는 인자 '${k}'`);
    }
    if(!Object.keys(board.blue).length&&!Object.keys(board.red).length)throw new Error('@search에는 챔피언이 하나 이상 필요해요 (예: blue.mid=오리아나)');
    return{board,...o};
  }
  if(kind==='series'){only(['pick','set']);const pick=a.pick||'longest';if(!['longest','latest'].includes(pick))throw new Error('@series pick은 longest 또는 latest');return{pick,set:'set'in a?int('set',a.set):null}}
  if(kind==='game'){only(['nth','id']);return ref()}
  if(kind==='draft'){only(['nth','id','teams','set','date','upto','hl']);let o;
    if('id'in a||'nth'in a)o=ref();
    else if(a.teams){const t=a.teams.split(',').map(x=>x.trim()).filter(Boolean);if(t.length!==2)throw new Error('@draft teams는 "젠지,BLG"처럼 두 팀');o={teams:t,set:int('set',a.set||'1')};if(a.date){if(!/^\d{4}-\d{2}-\d{2}$/.test(a.date))throw new Error('@draft date는 2026-11-14 모양');o.date=a.date}}
    else throw new Error('@draft에는 teams="팀1,팀2" set=N 또는 id=게임ID가 필요해요');
    if('upto'in a){o.upto=int('upto',a.upto);if(o.upto<1||o.upto>20)throw new Error('@draft upto는 1~20 (밴/픽 선택 순서)')}
    if(a.hl)o.hl=a.hl.split(',').map(x=>x.trim()).filter(Boolean);
    return o}
  if(kind==='team'){only(['name','show']);if(!a.name)throw new Error('@team에는 name="팀"이 필요해요');const o={name:a.name};
    if('show'in a){const ks=a.show.split(',').filter(Boolean),bad=ks.filter(k=>!MKEYS().includes(k));if(bad.length||!ks.length)throw new Error(`@team show에 알 수 없는 지표 ${bad.join(', ')} (쓸 수 있는 것: ${MKEYS().join(', ')})`);o.show=ks}return o}
  if(kind==='rank'){only(['stat','team','league']);if(!MKEYS().includes(a.stat))throw new Error(`@rank에는 stat=지표가 필요해요 (쓸 수 있는 것: ${MKEYS().join(', ')})`);if(!a.team&&!a.league)throw new Error('@rank에는 team="팀" 또는 league=LCK가 필요해요');const o={stat:a.stat};if(a.team)o.team=a.team;if(a.league)o.league=a.league;return o}
  if(kind==='form'){only(['team','n','until']);if(!a.team)throw new Error('@form에는 team="팀"이 필요해요');const n=int('n',a.n||'10');if(n<3||n>30)throw new Error('@form n은 3~30 사이');const o={team:a.team,n};if(a.until){if(!/^\d{4}-\d{2}-\d{2}$/.test(a.until))throw new Error('@form until은 2026-11-14 모양');o.until=a.until}return o}
  if(kind==='flow'){only(['nth','id','team','last']);let o;if('id'in a||'nth'in a)o=ref();else if(a.team){o={last:int('last',a.last||'1')};if(o.last<1)throw new Error('@flow last는 1 이상')}else throw new Error('@flow에는 id=게임ID, nth=N, team="팀" 중 하나가 필요해요');if(a.team)o.team=a.team;return o}
  throw new Error(`알 수 없는 상자 @${kind} (search/series/game/draft/team/rank/form/flow)`);
}

/* 원고 저장소. claude.ai의 작업실 페이지에서만 열린다. 그 밖(내 컴퓨터에서 연 경우)에는 이 브라우저에만 임시 저장 */
let DBP=null,DRAFTS=null,DRAFT_UNSUB=null,DRAFT_STATE='loading';
function getDb(){if(!DBP)DBP=(window.claude&&typeof window.claude.use==='function')?window.claude.use('db').catch(()=>null):Promise.resolve(null);return DBP}
function watchDrafts(){
  if(DRAFT_UNSUB||DRAFTS)return;
  DRAFTS={};
  getDb().then(db=>{
    if(!db){DRAFT_STATE='local';try{const loc=JSON.parse(store.get('df-drafts')||'{}');DRAFTS=loc}catch(e){}redrawWrite();return}
    const timer=setTimeout(()=>{if(DRAFT_STATE==='loading'){DRAFT_STATE='slow';redrawWrite()}},10000);
    DRAFT_UNSUB=db.collection('drafts').onSnapshot(snap=>{
      DRAFTS={};snap.docs.forEach(d=>{DRAFTS[d.id]=d.data()});
      if(!snap.metadata.fromCache){clearTimeout(timer);DRAFT_STATE='ok'}
      redrawWrite();
    },e=>{clearTimeout(timer);DRAFT_STATE='error';redrawWrite()});
  });
}
function redrawWrite(){if(!$('#view-columns').hidden)renderColumns();if(!$('#view-write').hidden&&!S.w)renderWrite(S.wid)}
async function saveDraft(d){
  d.updatedAt=new Date().toISOString();
  const db=await getDb();
  if(!db){DRAFTS[d.id]=d;store.set('df-drafts',JSON.stringify(DRAFTS));return 'local'}
  const{id,...body}=d;await db.collection('drafts').doc(id).set(body);return 'ok';
}
async function deleteDraft(id){
  const db=await getDb();
  if(!db){delete DRAFTS[id];store.set('df-drafts',JSON.stringify(DRAFTS));return}
  await db.collection('drafts').doc(id).delete();
}
function draftMd(d){
  const fm=[['title',d.title],['date',d.date],['kick',d.kick],['kind',d.kind==='note'?'note':''],['draft','true'],['teams',d.teams],['lede',d.lede]].filter(x=>x[1]).map(([k,v])=>`${k}: ${String(v).replace(/\n/g,' ')}`);
  return `---\n${fm.join('\n')}\n---\n${(d.body||'').trim()}\n`;
}
const TEMPLATE_BODY=`## 한 줄 결론
(이 경기를 한 문장으로. "누가 이겼다"가 아니라 "무엇이 갈랐다".)

## 경기 정보
(대회, 날짜, 세트, 결과, 시리즈 상황. 피어리스라면 앞 세트에서 소진된 것.)

## 밴픽: 양 팀은 무엇을 노렸나
(밴/픽 순서를 따라가며 왜 먼저 가져갔나, 왜 밴했나. 플렉스 픽, 진영 선택, 피어리스로 좁아진 풀.)

## 게임 플랜: 각 조합의 이기는 방법
(초반 주도권, 한타, 스플릿, 시야 등. 두 계획이 어디서 부딪히나.)

## 분기점
### 1. (00:00) 장면 제목
(무슨 일이 있었나, 왜 그 선택을 했을까, 무엇이 바뀌었나.)

### 2. (00:00) 장면 제목
(설명)

## 데이터로 확인: 평소에도 그런가
(이번 경기의 패턴이 이 팀의 평소 모습인지. 데이터는 원인이 아니라 경향 확인에만.)

## 정리와 다음 관전 포인트
(무엇이 승부를 갈랐나, 다음 경기에서 볼 것.)`;
const BOXES=[['조합이 나온 경기 (챔피언)','@search blue.mid=오리아나'],['팀이 고른 조합','@search team="젠지" blue.mid=오리아나'],['피어리스 시리즈','@series pick=latest set=3'],['경기 하나 밴픽','@game id=게임ID'],['밴픽 보드 (순서)','@draft teams="젠지,BLG" set=2'],['밴픽 보드 (그 시점까지)','@draft teams="젠지,BLG" set=2 upto=6 hl="카시오페아"'],
  ['팀 지표','@team name="젠지"'],['팀 지표 몇 개만','@team name="젠지" show=gd15,barS'],['지표 하나 리그 순위','@rank stat=barS team="젠지"'],['최근 흐름','@form team="젠지" n=10'],['경기 흐름 (최근 경기)','@flow team="젠지"']];

function renderWrite(id){
  const box=$('#write-box');watchDrafts();
  if(!id||id==='new'){
    const nid='c'+Date.now().toString(36);
    S.w={id:nid,title:'',date:new Date().toISOString().slice(0,10),kind:'column',kick:'',lede:'',teams:'',body:''};S.wid=nid;S.wdirty=false;
    history.replaceState(null,'','#write-'+nid);
  }else if(!S.w||S.w.id!==id){
    if(DRAFTS===null||(DRAFT_STATE==='loading'&&!DRAFTS[id])){box.innerHTML='<p class="muted">원고를 불러오는 중…</p>';S.wid=id;return}
    const d=DRAFTS[id];if(!d){box.innerHTML='<div class="card empty-state"><h2>원고를 찾을 수 없어요</h2><a class="btn" href="#columns">칼럼으로</a></div>';return}
    S.w={id,title:'',date:'',kind:'column',kick:'',lede:'',teams:'',body:'',...d};S.wid=id;S.wdirty=false;
  }
  const w=S.w,f=(k,label,ph,type)=>`<label class="wf"><span>${label}</span><input ${type?`type="${type}"`:''} data-wf="${k}" value="${esc(w[k]||'')}" placeholder="${esc(ph||'')}"></label>`;
  box.innerHTML=`<div class="wtop"><a class="chip" href="#columns">← 칼럼</a><span class="wstat" id="wstat">${S.wmsg||''}</span>
      <button class="btn" type="button" data-wtpl>견본 불러오기</button><button class="btn" type="button" data-wdl>.md 내려받기</button><button class="btn" type="button" data-wdel>삭제</button><button class="btn primary" type="button" data-wsave>저장</button></div>
    <div class="wlay"><section class="card wedit">
      ${f('title','제목','무엇이 승부를 갈랐나')}
      <div class="wrow">${f('date','날짜','2026-11-21','date')}<label class="wf"><span>종류</span><select data-wf="kind"><option value="column" ${w.kind!=='note'?'selected':''}>칼럼</option><option value="note" ${w.kind==='note'?'selected':''}>분석 노트</option></select></label>${f('kick','머리말','경기 분석')}</div>
      ${f('teams','관련 팀','Gen.G, T1 (영문, 쉼표)')}
      ${f('lede','요약','목록에 보일 한두 문장')}
      <div class="wbar"><span>본문</span><select id="wbox"><option value="">근거 상자 넣기…</option>${BOXES.map(([l,v],i)=>`<option value="${i}">${esc(l)}</option>`).join('')}</select></div>
      <textarea id="wbody" data-wf="body" spellcheck="false" placeholder="## 소제목&#10;&#10;문단은 빈 줄로 나눠요.&#10;&#10;@search blue.mid=오리아나">${esc(w.body||'')}</textarea>
      <p class="rel" style="margin:8px 0 0">## 소제목, ### 작은 소제목, 빈 줄로 문단을 나눠요. @로 시작하는 줄은 근거 상자예요(챔피언, 팀은 한글 이름도 돼요). 저장한 원고는 Claude에게 "원고 가져와"라고 하면 칼럼 파일로 옮겨요.</p>
    </section><section class="card wprev"><div class="wprev-h">미리 보기</div><div id="wpreview" class="art"></div></section></div>`;
  drawPreview();
}
function drawPreview(){
  const el=$('#wpreview');if(!el||!S.w)return;
  const w=S.w,{blocks,errs}=colParse(w.body);
  const c={slug:'draft',title:w.title,date:w.date,kind:w.kind,blocks:blocks.filter(b=>b.type!=='err')};
  let html='';
  try{html=blocks.map(b=>b.type==='err'?`<p class="werr">${esc(b.text)}</p>`:columnBody({blocks:[b]},-1)).join('')}catch(e){html=`<p class="werr">미리 보기 오류: ${esc(e.message)}</p>`}
  html=html.replace(/<div class="dact"[^>]*>[\s\S]*?<\/div>/g,'');
  el.innerHTML=`<header><div class="kick">${w.kind==='note'?'분석 노트':esc(w.kick||'칼럼')}${w.date?' | '+fmtDate(w.date):''}</div><h1>${esc(w.title||'(제목 없음)')}</h1>${w.lede?`<p class="lede2">${esc(w.lede)}</p>`:''}</header>${errs.length?`<p class="werr">상자 문법 오류 ${errs.length}개</p>`:''}${html||'<p class="muted">본문을 쓰면 여기에 보여요.</p>'}`;
}
let WTIMER=null,PTIMER=null;
function wSetStat(msg){S.wmsg=msg;const e=$('#wstat');if(e)e.textContent=msg}
async function wSave(){
  clearTimeout(WTIMER);if(!S.w)return;
  if(!S.w.title.trim()&&!S.w.body.trim()){wSetStat('');return}
  wSetStat('저장 중…');
  try{const r=await saveDraft({...S.w});S.wdirty=false;wSetStat(r==='local'?'이 브라우저에만 저장됨 (claude.ai 작업실 페이지에서 열면 서버에 저장돼요)':'저장됨 '+new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}))}
  catch(e){wSetStat('저장 실패: '+(e&&e.code==='quota_exceeded'?'저장 공간이 가득 찼어요':(e&&e.message)||'다시 시도해 주세요'))}
}
document.addEventListener('input',e=>{
  const k=e.target&&e.target.dataset&&e.target.dataset.wf;if(!k||!S.w)return;
  S.w[k]=e.target.value;S.wdirty=true;wSetStat('저장 안 됨');
  clearTimeout(PTIMER);PTIMER=setTimeout(drawPreview,350);
  clearTimeout(WTIMER);WTIMER=setTimeout(wSave,3000);   // 입력이 멈추고 3초 뒤 자동 저장
});
document.addEventListener('change',e=>{
  if(e.target&&e.target.dataset&&e.target.dataset.wf==='kind'&&S.w){S.w.kind=e.target.value;drawPreview();wSave()}
  if(e.target&&e.target.id==='wbox'&&e.target.value!==''){
    const ta=$('#wbody'),txt=BOXES[+e.target.value][1],pos=ta.selectionStart??ta.value.length;
    ta.value=ta.value.slice(0,pos).replace(/\s*$/,'')+(pos?'\n\n':'')+txt+'\n\n'+ta.value.slice(pos).replace(/^\s*/,'');
    S.w.body=ta.value;e.target.value='';drawPreview();wSetStat('저장 안 됨');clearTimeout(WTIMER);WTIMER=setTimeout(wSave,3000);ta.focus();
  }
});
document.addEventListener('click',async e=>{
  const t=e.target;if(!t.closest)return;
  if(t.closest('[data-wsave]')){wSave();return}
  if(t.closest('[data-wtpl]')&&S.w){
    if(S.w.body.trim()&&!t.closest('[data-wtpl]').dataset.sure){const b=t.closest('[data-wtpl]');b.dataset.sure='1';b.textContent='본문을 견본으로 바꿀까요? 다시 누르기';setTimeout(()=>{b.textContent='견본 불러오기';delete b.dataset.sure},3000);return}
    S.w.body=TEMPLATE_BODY;if(!S.w.kick)S.w.kick='경기 분석';renderWrite(S.w.id);wSetStat('저장 안 됨');clearTimeout(WTIMER);WTIMER=setTimeout(wSave,3000);return}
  if(t.closest('[data-wdel]')&&S.w){
    const b=t.closest('[data-wdel]');
    if(!b.dataset.sure){b.dataset.sure='1';b.textContent='정말 삭제? 다시 누르기';setTimeout(()=>{b.textContent='삭제';delete b.dataset.sure},3000);return}
    clearTimeout(WTIMER);await deleteDraft(S.w.id);S.w=null;location.hash='columns';return}
  if(t.closest('[data-wdl]')&&S.w){
    const md=draftMd(S.w),name=(S.w.date||'draft')+'-'+(S.w.title||'칼럼').replace(/[^\w가-힣]+/g,'-').slice(0,40)+'.md';
    let dl=null;try{dl=window.claude&&await window.claude.use('downloads')}catch(x){}
    if(dl){try{await dl.save({filename:name,data:md})}catch(x){}return}
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([md],{type:'text/markdown'}));a.download=name;a.click();return}
});
window.addEventListener('beforeunload',()=>{if(S.wdirty)wSave()});

/* ---------- 선수: 이름으로 묶는다 (데이터에 선수 ID가 없어 이적·동명이인은 같은 이름이면 합쳐진다) ---------- */
let PLAYERS=null;
function buildPlayers(){
  if(PLAYERS)return PLAYERS;
  const m=new Map();
  for(const g of G)for(const code of['b','r']){
    const pl=g[code==='b'?'bp':'rp'];if(!pl)continue;
    pl.forEach((name,i)=>{if(!name)return;let p=m.get(name);if(!p){p={name,apps:[]};m.set(name,p)}p.apps.push({g,code,i})});
  }
  PLAYERS=m;return m;
}
const pUrl=name=>'#player-'+encodeURIComponent(name);
const pLink=name=>`<a class="plink" href="${pUrl(name)}">${esc(name)}</a>`;
function topOf(o){return Object.entries(o).sort((a,b)=>b[1]-a[1])}
function renderPlayers(){
  const box=$('#players-box');if(!box)return;
  const M=buildPlayers(),q=(S.pq||'').trim().toLowerCase();
  let list=[...M.values()];
  if(q)list=list.filter(p=>p.name.toLowerCase().includes(q)||p.apps.some(a=>tn(a.code==='b'?a.g.bt:a.g.rt).toLowerCase().includes(q)));
  if(!q&&S.plg!=='all')list=list.filter(p=>p.apps.some(a=>a.g.lg===S.plg));
  list.sort((a,b)=>b.apps.length-a.apps.length);
  const total=list.length;list=list.slice(0,60);
  const lgs=['LCK','LPL','LEC','LCS','LCP','LCKC'].filter(l=>G.some(g=>g.lg===l));
  const card=p=>{const tc={},rc=[0,0,0,0,0];p.apps.forEach(a=>{const t=a.code==='b'?a.g.bt:a.g.rt;tc[t]=(tc[t]||0)+1;rc[a.i]++});
    const team=topOf(tc)[0][0],r=rc.indexOf(Math.max(...rc));
    return `<a class="card pitem" href="${pUrl(p.name)}">${emblem(team,28)}<span class="pi-t"><b>${esc(p.name)}</b><small>${esc(tn(team))}</small></span><span class="rtag" style="color:${ROLE_COLORS[ROLES[r]]}">${ROLE_KO[ROLES[r]]}</span><span class="pi-n">${p.apps.length}</span></a>`};
  box.innerHTML=`<section class="card cfil"><input class="q" id="player-q" type="search" placeholder="선수 또는 팀 이름" autocomplete="off" value="${esc(S.pq||'')}" style="width:100%;margin:0 0 10px">
      <div class="tools" style="margin:0"><button class="chip ${S.plg==='all'?'on':''}" type="button" data-plg="all">전체</button>${lgs.map(l=>`<button class="chip ${S.plg===l?'on':''}" type="button" data-plg="${esc(l)}">${esc(l)}</button>`).join('')}</div></section>
    <div class="plist">${list.map(card).join('')||'<p class="muted">찾는 선수가 없어요</p>'}</div>${total>60?`<p class="muted" style="font-size:.82rem">${total-60}명 더 있어요. 이름으로 찾아 주세요.</p>`:''}`;
}
function renderPlayer(name){
  const box=$('#player-box');if(!box)return;
  const p=buildPlayers().get(name);
  if(!p){box.innerHTML=`<a class="chip" href="#players">← 선수</a><div class="card empty-state" style="margin-top:12px"><h2>찾는 선수가 없어요</h2></div>`;return}
  if(ST===null)loadStats();
  if(S.pp!==name){S.pp=name;S.pl='all';S.ppt='all';S.pcn=15}
  // 대회별 요약 (필터와 상관없이 전체)
  const byLg={};p.apps.forEach(a=>{const o=byLg[a.g.lg]||(byLg[a.g.lg]={n:0,w:0,ch:{},last:''});o.n++;if(a.g.w===a.code)o.w++;const c=a.g[a.code][a.i];if(c>=0)o.ch[c]=(o.ch[c]||0)+1;if(a.g.d>o.last)o.last=a.g.d});
  const lgRows=Object.entries(byLg).sort((a,b)=>b[1].last<a[1].last?-1:1);
  const apps=p.apps.filter(a=>(S.pl==='all'||a.g.lg===S.pl)&&(S.ppt==='all'||a.g.p===S.ppt));
  const tc={},rc=[0,0,0,0,0];p.apps.forEach(a=>{const t=a.code==='b'?a.g.bt:a.g.rt;tc[t]=(tc[t]||0)+1;rc[a.i]++});
  const teams=topOf(tc),r=rc.indexOf(Math.max(...rc)),w=apps.filter(a=>a.g.w===a.code).length;
  // 챔피언별
  const P=(a,k)=>a.g._st?a.g._st[a.code==='b'?2:3][a.i][PF[k]]:null;
  const ch={};
  for(const a of apps){const c=a.g[a.code][a.i];if(c<0)continue;const o=ch[c]||(ch[c]={n:0,w:0,k:0,d:0,as:0,st:0});o.n++;if(a.g.w===a.code)o.w++;if(a.g._st){o.st++;o.k+=P(a,'k')||0;o.d+=P(a,'d')||0;o.as+=P(a,'a')||0}}
  const rows=Object.entries(ch).sort((a,b)=>b[1].n-a[1].n||b[1].w-a[1].w);
  const kda=o=>o.st?((o.k+o.as)/Math.max(o.d,1)).toFixed(1):'-';
  const tot=rows.reduce((t,[,o])=>({k:t.k+o.k,d:t.d+o.d,as:t.as+o.as,st:t.st+o.st}),{k:0,d:0,as:0,st:0});
  const plist=[...new Set(p.apps.filter(a=>S.pl==='all'||a.g.lg===S.pl).map(a=>a.g.p))].sort((a,b)=>{const A=pKey(a),B=pKey(b);return B[0]-A[0]||B[1]-A[1]});
  const lgChips=`<button class="chip ${S.pl==='all'?'on':''}" type="button" data-pl="all">전체 대회</button>${lgRows.map(([l,o])=>`<button class="chip ${S.pl===l?'on':''}" type="button" data-pl="${esc(l)}">${esc(lgLabel(l))} ${o.n}</button>`).join('')}`;
  const patchSel=`<select class="sel" id="ppt" aria-label="패치"><option value="all">전체 패치</option>${plist.map(x=>`<option value="${esc(x)}" ${S.ppt===x?'selected':''}>${esc(x)}</option>`).join('')}</select>`;
  const chRows=rows.slice(0,S.pcn).map(([c,o],i)=>{const wr=o.w/o.n;return `<div class="wr-row pc-row"><span class="rk">${i+1}</span><span>${nameCellBtn(+c)}</span><span class="num"><b>${o.n}</b></span>
      <div class="wr-bar"><i class="${wr>=.5?'up':'dn'}" style="width:${(wr*100).toFixed(1)}%"></i><em></em></div>
      <span class="wr-v"><b>${Math.round(wr*100)}%</b><small>${o.w}승 ${o.n-o.w}패 | KDA ${kda(o)}</small></span></div>`}).join('');
  box.innerHTML=`<a class="chip" href="#players">← 선수</a>
    <div class="ph-top">${emblem(teams[0][0],44)}<div><h1>${esc(p.name)}</h1><div class="muted">${teams.map(([t,n])=>`${esc(tn(t))} ${n}`).join(' | ')} | <span style="color:${ROLE_COLORS[ROLES[r]]};font-weight:800">${ROLE_KO[ROLES[r]]}</span></div></div>
      <div class="ph-facts"><div><b>${apps.length}</b><small>경기</small></div><div><b>${w}승 ${apps.length-w}패</b><small>${apps.length?Math.round(w/apps.length*100):0}%</small></div><div><b>${tot.st?((tot.k+tot.as)/Math.max(tot.d,1)).toFixed(2):'-'}</b><small>KDA</small></div><div><b>${rows.length}</b><small>챔피언</small></div></div></div>
    <section class="card ctab" style="margin-bottom:16px"><h2>대회별</h2><table class="ptable ctbl"><colgroup><col style="width:150px"><col style="width:70px"><col style="width:110px"><col style="width:70px"><col></colgroup>
      <thead><tr><th>대회</th><th class="num">경기</th><th class="num">승패</th><th class="num">승률</th><th>많이 쓴 챔피언</th></tr></thead><tbody>${lgRows.map(([l,o])=>`<tr><td><span class="slg">${leagueBadge(l,18)} ${esc(lgLabel(l))}</span></td><td class="num"><b>${o.n}</b></td><td class="num">${o.w}승 ${o.n-o.w}패</td><td class="num">${Math.round(o.w/o.n*100)}%</td><td><div class="chs">${topOf(o.ch).slice(0,6).map(([c,n])=>`<span class="pc" title="${esc(CH[+c].ko)} ${n}회"><img src="${CH[+c].icon}" alt="${esc(CH[+c].ko)}" width="26" height="26"><i>${n}</i></span>`).join('')}</div></td></tr>`).join('')}</tbody></table></section>
    <div class="chead"><div class="tools" style="margin:0">${lgChips}</div><span class="chead-sp"></span>${patchSel}</div>
    <section class="card ctab"><h2>챔피언</h2><div class="wr-head pc-row"><span>#</span><span>챔피언</span><span class="num">경기</span><div class="wr-ax"><small>0%</small><small>50%</small><small>100%</small></div><span class="wr-v">승률</span></div>${chRows||'<p class="muted">조건에 맞는 경기가 없어요</p>'}</section>
    ${rows.length>S.pcn?`<button class="more" type="button" data-pmore>더 보기</button>`:''}`;
}
const nameCellBtn=c=>`<button type="button" class="cname" data-chsearch="${c}" title="밴픽 찾기에서 ${esc(CH[c].ko)} 경기 보기"><img src="${CH[c].icon}" alt="" width="32" height="32"><span>${esc(CH[c].ko)}</span></button>`;
document.addEventListener('click',e=>{
  const t=e.target;if(!t.closest)return;
  const pl=t.closest('[data-pl]');if(pl){S.pl=pl.dataset.pl;S.ppt='all';S.pcn=15;renderPlayer(S.pp);return}
  const plg=t.closest('[data-plg]');if(plg){S.plg=plg.dataset.plg;renderPlayers();return}
  if(t.closest('[data-pmore]')){S.pcn+=15;renderPlayer(S.pp);return}
});
document.addEventListener('change',e=>{if(e.target&&e.target.id==='ppt'){S.ppt=e.target.value;renderPlayer(S.pp)}});
document.addEventListener('input',e=>{if(e.target&&e.target.id==='player-q'){S.pq=e.target.value;const pos=e.target.selectionStart;renderPlayers();const q=$('#player-q');q.focus();q.setSelectionRange(pos,pos)}});

/* ---------- 화면 전환 + 시작 ---------- */
function route(){
  const h=location.hash,mc=/^#column-(\d+)$/.exec(h),mt=/^#team-(\d+)$/.exec(h),mw=/^#write-([\w-]+)$/.exec(h);
  const mp=/^#player-(.+)$/.exec(h);
  if(!$('#view-write').hidden&&S.wdirty&&!mw)wSave();
  const v=mp?'player':h==='#players'?'players':mw?'write':mc?'column':mt?'team':h==='#columns'?'columns':h==='#series'?'series':h==='#search'?'search':h==='#champs'?'champs':'teams';
  for(const k of['teams','team','champs','search','series','columns','column','write','players','player'])$('#view-'+k).hidden=k!==v;
  const nav=v==='player'?'players':v==='column'||v==='write'?'columns':v==='team'?'teams':v;
  for(const k of['teams','players','champs','search','series','columns'])$('#nav-'+k).setAttribute('aria-current',k===nav?'page':'false');
  if(v==='champs')renderChamps();
  if(v==='series')renderSeries();
  if(v==='column')renderColumn(+mc[1]);
  if(v==='teams')renderTeams();
  if(v==='team')renderTeam(+mt[1]);
  if(v==='columns')renderColumns();
  if(v==='players')renderPlayers();
  if(v==='player')renderPlayer(decodeURIComponent(mp[1]));
  if(v==='write'&&(!S.w||S.w.id!==mw[1]))renderWrite(mw[1]);
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
  if(TEAMS.some(t=>t.league==='LCK'))S.tlg='LCK';
  S.cl=S.myTeam?TEAMS[TEAMIDX[S.myTeam]].league:(G.some(g=>g.lg==='LCK')?'LCK':'all');       // 한국 팬 기준: 처음엔 LCK 팀부터 보여 준다
  applyTheme();
  SLIST=[...SERIES.values()].sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:b.id-a.id);
  PATCHES=[...new Set(G.map(x=>x.p))].sort((a,b)=>{const A=pKey(a),B=pKey(b);return A[0]-B[0]||A[1]-B[1]});
  LEAGUES=[...new Set(G.map(x=>x.lg))].sort();
  if(!META.demo){$('#demo-pill').hidden=true;$('#foot').textContent='챔피언 이미지는 Riot Games Data Dragon을, 경기 데이터는 Oracle\'s Elixir(Tim Sevenhuysen)의 2026 파일을 사용했어요. 개인 작업실이에요. 링크를 공유하지 마세요.'}
  S.spoiler=false;syncSpoiler();   // 결과 가리기는 작업실에서 쓰지 않는다
  renderColumns();route();update();
}).catch(err=>{console.error(err);$('#view-teams').hidden=false;$('#teams-box').innerHTML='<div class="card empty-state"><h2>데이터를 불러오지 못했어요</h2><p class="muted" style="margin:0">잠시 후 다시 열어 주세요.</p></div>';$('#results').innerHTML='<div class="card empty-state"><h2>데이터를 불러오지 못했어요</h2><p class="muted" style="margin:0">잠시 후 다시 열어 주세요.</p></div>'});
