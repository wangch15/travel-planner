const {test}=require('node:test');const assert=require('node:assert/strict');
const {changesBetween,selectChanges}=require('../proposal-diff.cjs');
const source=days=>'module.exports = '+JSON.stringify({DAYS:days,PLACES:{}})+';';
test('structural day changes remain one atomic restore choice, preserving exact source',()=>{
 const a=source([{id:1,date:'10/1',title:'First'}]),b=source([{id:2,date:'10/2',title:'Second'},{id:1,date:'10/1',title:'First'}]);
 const changes=changesBetween(a,b);assert.equal(changes.length,1);assert.equal(changes[0].key,'days:structure');
 assert.equal(selectChanges(a,b,[]),a);assert.equal(selectChanges(a,b,['days:structure']),b);
});
test('changes outside day content and fabricated selections cannot sneak into restoration',()=>{
 const a=source([{id:1,date:'10/1',title:'First'}]);
 assert.throws(()=>changesBetween(a,a.replace('"PLACES":{}','"PLACES":{"secret":{}}')),{code:'UNSUPPORTED_DAY_CHANGE'});
 assert.throws(()=>selectChanges(a,a,['fake']),{code:'INVALID_SELECTION'});
});
test('selecting changes never rewrites or resolves untouched shared day expressions',()=>{
 const before='const second={id:2,date:"10/2",title:"Other"};const alias=second;module.exports={DAYS:[{id:1,date:"10/1",title:"Old",lead:"Old lead"},second],PLACES:{}};';
 const {replaceDay}=require('../../../packages/engine/day-edit.cjs');const {parseLiteralModule}=require('@travel-planner/engine');
 const day=parseLiteralModule(before).DAYS[0];const full=replaceDay(before,1,{...day,title:'New',lead:'New lead'}).source;
 assert.equal(selectChanges(before,full,['1:title','1:lead']),full);
 const partial=selectChanges(before,full,['1:title']);assert.equal(parseLiteralModule(partial).DAYS[0].lead,'Old lead');assert.ok(partial.includes('const alias=second'));
});
