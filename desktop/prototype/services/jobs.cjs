const {randomUUID}=require('node:crypto');
const fail=code=>Object.assign(Error(code),{code});
const MODES=['discussion','edit-day','edit-all','research','planning','materialize'];
function validJob(job){return job===undefined||job===null||(
 job&&typeof job==='object'&&typeof job.id==='string'&&job.id.length<=100&&typeof job.accountKey==='string'&&job.accountKey.length<=200&&
 ['running','waiting_quota','paused','unknown','completed','failed'].includes(job.status)&&typeof job.autoResume==='boolean'&&Number.isFinite(job.createdAt)&&Number.isFinite(job.nextCheck)&&Number.isInteger(job.failures)&&job.failures>=0&&job.failures<=100&&
 (job.baselineDigest===null||typeof job.baselineDigest==='string')&&typeof job.input?.text==='string'&&job.input.text.length<=12000&&MODES.includes(job.input.mode)&&
 (job.input.dayId===null||Number.isSafeInteger(job.input.dayId))&&(!job.input.attachmentIds||Array.isArray(job.input.attachmentIds)&&job.input.attachmentIds.length<=12&&job.input.attachmentIds.every(id=>typeof id==='string'&&id.length<=100))&&
 (job.threadId===null||typeof job.threadId==='string')&&(job.turnId===null||typeof job.turnId==='string')
 );}
function nextQuotaCheck(limits,now=Date.now(),failures=0){
 const buckets=Object.values(limits?.rateLimitsByLimitId||{});if(limits?.rateLimits)buckets.push(limits.rateLimits);
 const reset=buckets.flatMap(b=>[b.primary,b.secondary]).filter(w=>w&&w.usedPercent>=100&&Number.isFinite(w.resetsAt)).map(w=>w.resetsAt*1000).filter(t=>t>now);
 return reset.length?Math.max(now+60000,Math.max(...reset)+1000):now+Math.min(30*60000,[60000,120000,300000,900000][Math.min(failures,3)]||1800000);
}
class JobController{
 constructor(conversations,{now=Date.now}={}){this.store=conversations;this.now=now;}
 async begin(target,{input,accountKey,baselineDigest}){
  const job={id:randomUUID(),input,accountKey,baselineDigest:baselineDigest||null,status:'running',autoResume:false,createdAt:this.now(),nextCheck:0,failures:0,threadId:null,turnId:null};
  if(!validJob(job))throw fail('INVALID_JOB');await this.store.update(target,s=>{if(s.job?.autoResume&&s.job.status==='waiting_quota')throw fail('JOB_WAITING');s.job=job;});return job;
 }
 async patch(target,id,change){let value;await this.store.update(target,s=>{if(s.job?.id!==id)throw fail('STALE_JOB');Object.assign(s.job,change);if(!validJob(s.job))throw fail('INVALID_JOB');value=s.job;});return value;}
 async checkpoint(target,id,threadId,turnId=null){return this.patch(target,id,{threadId,turnId});}
 // settled：這輪確定已結束（程序已退出或伺服器回報結束），不是「結果不明」，可以直接重送。
 async fail(target,id,code,limits,{settled=false}={}){const quota=['QUOTA_UNAVAILABLE','QUOTA_EXHAUSTED'].includes(code);return this.patch(target,id,{status:quota?'waiting_quota':code==='AI_CANCELED'?'paused':settled?'failed':['AI_RESULT_UNKNOWN','UNKNOWN_RESULT'].includes(code)?'unknown':'failed',nextCheck:nextQuotaCheck(limits,this.now()),reason:code,...(settled&&!quota&&code!=='AI_CANCELED'?{settled:true}:{})});}
 async finish(target,id){return this.patch(target,id,{status:'completed',autoResume:false,reason:null});}
 async wait(target,enabled){const {job}=await this.store.read(target);if(!job||job.status!=='waiting_quota')throw fail('NO_WAITING_JOB');return this.patch(target,job.id,{autoResume:Boolean(enabled),claimId:null,nextCheck:enabled?Math.max(this.now()+1000,job.nextCheck):0});}
 async pause(target){const {job}=await this.store.read(target);if(!job)return null;return this.patch(target,job.id,{autoResume:false,claimId:null,status:job.status==='completed'?'completed':'paused',reason:'user-paused'});}
 async poll(target,{accountKey,limits,baselineDigest,busy=false}){
  const {job}=await this.store.read(target);if(!job||job.status!=='waiting_quota'||!job.autoResume||this.now()<job.nextCheck||busy)return null;
  let claimed=null;
  await this.store.update(target,s=>{
    const current=s.job;if(!current||current.id!==job.id||current.status!=='waiting_quota'||!current.autoResume||this.now()<current.nextCheck)return;
    if(accountKey!==current.accountKey||baselineDigest!==current.baselineDigest){Object.assign(current,{status:'paused',autoResume:false,claimId:null,reason:accountKey!==current.accountKey?'ACCOUNT_CHANGED':'CONTENT_CHANGED'});return;}
    if(limits?.ordinaryUsageAllowed!==true){Object.assign(current,{nextCheck:nextQuotaCheck(limits,this.now(),current.failures),failures:Math.min(current.failures+1,100),...(current.failures>=9&&!limits?{autoResume:false,status:'paused',reason:'QUOTA_CHECK_UNAVAILABLE'}:{})});return;}
    Object.assign(current,{autoResume:false,status:'paused',reason:'ready-to-resume',claimId:randomUUID()});claimed=structuredClone(current);
  });return claimed;
 }
 async takeClaim(target,id,claimId){let claimed=null;await this.store.update(target,s=>{if(s.job?.id!==id||s.job.claimId!==claimId||s.job.status!=='paused'||s.job.reason!=='ready-to-resume')return;s.job.status='running';s.job.reason='dispatch-claimed';claimed=structuredClone(s.job);});return claimed;}
 async releaseClaim(target,id,claimId){await this.store.update(target,s=>{if(s.job?.id!==id||s.job.claimId!==claimId||!['ready-to-resume','dispatch-claimed'].includes(s.job.reason))return;Object.assign(s.job,{status:'waiting_quota',autoResume:true,claimId:null,nextCheck:this.now()+60000,reason:null});});}

}
module.exports={JobController,validJob,nextQuotaCheck};
