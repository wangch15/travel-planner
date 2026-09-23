const { isDeepStrictEqual } = require('node:util');
const { parseLiteralModule } = require('@travel-planner/engine');
const { replaceDay } = require('../../packages/engine/day-edit.cjs');
const fields={title:'標題',theme:'行程重點',lead:'行程說明',cautions:'提醒事項',color:'代表色',route:'停留安排與備案'};
const fail=code=>Object.assign(Error(code),{code});
const scope=data=>{const {DAYS,...rest}=data;return rest;};
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
  if(!isDeepStrictEqual(before.DAYS.map(d=>[d.id,d.date]),after.DAYS.map(d=>[d.id,d.date])))return [{key:'days:structure',dayId:null,field:'structure',label:'整體每日結構（天數、日期與順序）',before:format(before.DAYS),after:format(after.DAYS)}];
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
  return changes;
}
function selectChanges(beforeSource,fullSource,keys) {
  const changes=changesBetween(beforeSource,fullSource);
  if(!Array.isArray(keys)||keys.length!==new Set(keys).size||keys.some(k=>!changes.some(c=>c.key===k)))throw fail('INVALID_SELECTION');
  if(keys.length===changes.length)return fullSource;
  if(changes.some(c=>c.field==='structure'))return keys.includes('days:structure')?fullSource:beforeSource;
  const selected=new Set(keys),desired=parseLiteralModule(fullSource).DAYS;
  let source=beforeSource;
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
module.exports={changesBetween,selectChanges};
