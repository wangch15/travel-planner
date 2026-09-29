const { isDeepStrictEqual } = require('node:util');
const { parseLiteralModule } = require('@travel-planner/engine');
const { replaceDay } = require('../../packages/engine/day-edit.cjs');
const fields={title:'標題',theme:'行程重點',lead:'行程說明',cautions:'提醒事項',color:'代表色',route:'停留安排與備案'};
const fail=code=>Object.assign(Error(code),{code});
const { replaceStayGuides, replaceExport, replacePlaceNote } = require('../../packages/engine/guide-edit.cjs');
const { checklistDelta } = require('../../packages/engine/trip-text.cjs');
// AI 能改、App 會記版本的範圍：每日、住宿指南、全程總覽、行前清單、地點備註；其他資料必須原封不動。
const stripNotes=places=>places&&typeof places==='object'?Object.fromEntries(Object.entries(places).map(([k,p])=>{if(!p||typeof p!=='object')return [k,p];const {note,...rest}=p;return [k,rest];})):places;
const scope=data=>{const {DAYS,STAY_GUIDES,OVERVIEW,CHECKLIST,...rest}=data;return {...rest,...(Object.hasOwn(rest,'PLACES')?{PLACES:stripNotes(rest.PLACES)}:{})};};
function formatOverview(o){
  if(!o||!Object.keys(o).length)return '未設定';
  const lines=[];
  if(o.checked)lines.push(`查核日期：${o.checked}`);
  if(o.stays)lines.push(`住宿段：${[o.stays.title,o.stays.hint].filter(Boolean).join('／')||'（只有日期）'}`);
  if(o.dining)lines.push(`餐食段：${[o.dining.hint,...(o.dining.notes||[])].filter(Boolean).join('；')}`);
  if(o.addonsHint)lines.push(`加點說明：${o.addonsHint}`);
  for(const r of o.reservations||[])lines.push(`預約提醒：${r.place} · 第 ${r.days.join('、')} 天 · ${r.note}`);
  for(const p of o.foot||[])lines.push(`頁尾：${p}`);
  return lines.join('\n');
}
function textChanges(before,after){
  const changes=[];
  const ob=before.OVERVIEW||{},oa=after.OVERVIEW||{};
  if(!isDeepStrictEqual(ob,oa))changes.push({key:'overview',dayId:null,field:'overview',label:'全程總覽',before:formatOverview(ob),after:formatOverview(oa)});
  const cb=before.CHECKLIST||[],ca=after.CHECKLIST||[];
  if(!isDeepStrictEqual(cb,ca)){const d=checklistDelta(cb,ca);
    changes.push({key:'checklist',dayId:null,field:'checklist',label:`行前需要補齊的資料（新增 ${d.added.length} 項、移除 ${d.removed.length} 項）`,
      before:cb.length?cb.map(c=>(d.removed.includes(c)?'✕ ':'• ')+c).join('\n'):'無',after:ca.length?ca.map(c=>(d.added.includes(c)?'＋ ':'• ')+c).join('\n'):'無'});}
  const pb=before.PLACES||{},pa=after.PLACES||{};
  for(const key of Object.keys(pb)){const x=pb[key]?.note,y=pa[key]?.note;if(x!==y)changes.push({key:`note:${key}`,dayId:null,field:'note',placeKey:key,label:`地點備註 · ${pb[key]?.name||key}`,before:x||'未設定',after:y||'未設定（刪除）'});}
  return changes;
}
const guidesOf=data=>Array.isArray(data.STAY_GUIDES)?data.STAY_GUIDES:[];
const LIST_TITLE={shopping:'採買',dining:'餐飲',onsen:'泡湯'},SECTION_TITLE={checkin:'入住方式',parking:'停車',checkout:'退房'};
// 對照表用的人話摘要：看得出改了哪些分類、哪些店，不把整份 JSON 攤出來。
function formatGuide(g){
  if(!g)return '未設定';
  const lines=[`標題：${g.title||g.stay+' 住宿指南'}`,`顯示在：${(g.days||[]).map(d=>'第 '+d+' 天').join('、')||'無'}`];
  if((g.alerts||[]).length)lines.push(`重要提醒：${g.alerts.map(a=>a.text).join('；')}`);
  for(const s of g.sections||[])lines.push(`${s.title||SECTION_TITLE[s.kind]||'說明'}（${(s.steps||[]).length} 步）：${(s.steps||[]).join(' → ')}`);
  for(const l of g.lists||[])lines.push(`${l.title||LIST_TITLE[l.kind]||'推薦'} ${(l.items||[]).length} 項：${(l.items||[]).map(i=>i.name).join('、')}`);
  if((g.images||[]).length)lines.push(`圖片 ${g.images.length} 張：${g.images.map(i=>i.caption||i.alt).join('、')}`);
  return lines.join('\n');
}
function guideChanges(before,after){
  const a=guidesOf(before),b=guidesOf(after),ids=[...new Set([...a,...b].map(g=>g?.id))];
  return ids.flatMap(id=>{const x=a.find(g=>g.id===id),y=b.find(g=>g.id===id);if(isDeepStrictEqual(x,y))return [];
    const title=(y||x).title||`${(y||x).stay} 住宿指南`;
    return [{key:`guide:${id}`,dayId:null,guideId:id,field:'guide',label:`住宿指南 · ${title}${!x?'（新增）':!y?'（刪除）':''}`,before:formatGuide(x),after:formatGuide(y)}];});
}
// 修改後不見的連結：搬移長文時最容易漏，提案上直接列出來給人看。
const URL_PATTERN=/https?:\/\/[^\s'"`<>)\]]+/g;
function lostLinks(beforeSource,afterSource){const after=new Set(afterSource.match(URL_PATTERN)||[]);return [...new Set(beforeSource.match(URL_PATTERN)||[])].filter(u=>!after.has(u));}
function format(value) {
  if(value===undefined || value===null)return '未設定';
  if(typeof value==='string')return value || '空白';
  if(Array.isArray(value))return value.length?value.map((v,i)=>typeof v==='string'?`• ${v}`:`${i+1}. ${format(v)}`).join('\n'):'無';
  if(typeof value==='object')return Object.entries(value).map(([k,v])=>`${({stops:'停留安排',alts:'備案',time:'時間',place:'地點',label:'安排',kind:'類型',note:'說明',desc:'說明',title:'標題',places:'地點',reason:'原因',duration:'時間',transport:'交通'})[k]||k}：${format(v)}`).join('；');
  return String(value);
}
function changesBetween(beforeSource,afterSource) {
  const before=parseLiteralModule(beforeSource),after=parseLiteralModule(afterSource);
  if(!isDeepStrictEqual(scope(before),scope(after)) || !Array.isArray(before.DAYS) || !Array.isArray(after.DAYS)
    )throw fail('UNSUPPORTED_DAY_CHANGE');
  if(!isDeepStrictEqual(before.DAYS.map(d=>[d.id,d.date]),after.DAYS.map(d=>[d.id,d.date])))return [{key:'days:structure',dayId:null,field:'structure',label:'整體每日結構（天數、日期與順序）',before:format(before.DAYS),after:format(after.DAYS)},...guideChanges(before,after),...textChanges(before,after)];
  const changes=[];
  for(let i=0;i<before.DAYS.length;i++){
    const a=before.DAYS[i],b=after.DAYS[i];
    const allowed=new Set(['title','theme','lead','cautions','color','stops','alts']);
    for(const k of new Set([...Object.keys(a),...Object.keys(b)]))if(!isDeepStrictEqual(a[k],b[k])&&!allowed.has(k))throw fail('UNSUPPORTED_DAY_CHANGE');
    for(const field of Object.keys(fields)){
      const av=field==='route'?{stops:a.stops,alts:a.alts}:a[field];
      const bv=field==='route'?{stops:b.stops,alts:b.alts}:b[field];
      if(!isDeepStrictEqual(av,bv))changes.push({key:`${a.id}:${field}`,dayId:a.id,field,label:`第 ${a.id} 天 · ${fields[field]}`,before:format(av),after:format(bv)});
    }
  }
  return [...changes,...guideChanges(before,after),...textChanges(before,after)];
}
function selectChanges(beforeSource,fullSource,keys) {
  const changes=changesBetween(beforeSource,fullSource);
  if(!Array.isArray(keys)||keys.length!==new Set(keys).size||keys.some(k=>!changes.some(c=>c.key===k)))throw fail('INVALID_SELECTION');
  if(keys.length===changes.length)return fullSource;
  const selected=new Set(keys),full=parseLiteralModule(fullSource),desired=full.DAYS;
  const structure=changes.some(c=>c.field==='structure');
  let source=structure&&selected.has('days:structure')?fullSource:beforeSource;
  if(!structure)source=selectDays(source,beforeSource,changes,selected,desired);
  source=selectGuides(source,parseLiteralModule(beforeSource),full,selected);
  return selectText(source,parseLiteralModule(beforeSource),full,selected);
}
// 總覽、清單、備註：勾選的換成新版，沒勾的維持修改前。
function selectText(source,before,full,selected){
  const current=parseLiteralModule(source);
  const want=(key,a,b)=>selected.has(key)?b:a;
  const overview=want('overview',before.OVERVIEW,full.OVERVIEW);
  if(!isDeepStrictEqual(current.OVERVIEW,overview))source=replaceExport(source,'OVERVIEW',overview||{},'object').source;
  const checklist=want('checklist',before.CHECKLIST,full.CHECKLIST);
  if(!isDeepStrictEqual(current.CHECKLIST,checklist))source=replaceExport(source,'CHECKLIST',checklist||[],'array').source;
  for(const key of Object.keys(before.PLACES||{})){
    const note=want(`note:${key}`,before.PLACES[key]?.note,full.PLACES?.[key]?.note)??null;
    if((parseLiteralModule(source).PLACES[key]?.note??null)!==note)source=replacePlaceNote(source,key,note).source;
  }
  return source;
}
// 只套用勾選的指南：未勾的維持修改前（新增的就不加、刪除的就保留）。
function selectGuides(source,before,full,selected){
  const wanted=guidesOf(full),kept=[];
  for(const g of guidesOf(before)){if(!selected.has(`guide:${g.id}`)){kept.push(g);continue;}const next=wanted.find(x=>x.id===g.id);if(next)kept.push(next);}
  for(const g of wanted)if(selected.has(`guide:${g.id}`)&&!kept.some(x=>x.id===g.id))kept.push(g);
  const current=guidesOf(parseLiteralModule(source));
  return isDeepStrictEqual(current,kept)?source:replaceStayGuides(source,kept).source;
}
function selectDays(source,beforeSource,changes,selected,desired){
  for(const original of parseLiteralModule(beforeSource).DAYS){
    if(!changes.some(c=>c.dayId===original.id&&selected.has(c.key)))continue;
    const day=structuredClone(original),other=desired.find(d=>d.id===day.id);
    for(const change of changes.filter(c=>c.dayId===day.id&&selected.has(c.key))){
      for(const field of change.field==='route'?['stops','alts']:[change.field]){
        if(Object.hasOwn(other,field))day[field]=structuredClone(other[field]);else delete day[field];
      }
    }
    source=replaceDay(source,day.id,day).source;
  }
  return source;
}
module.exports={changesBetween,selectChanges,lostLinks,formatGuide};
