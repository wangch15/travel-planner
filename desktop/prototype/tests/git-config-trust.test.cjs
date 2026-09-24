const test=require('node:test');const assert=require('node:assert/strict');
const {trustedFilter}=require('../services/backup.cjs');const {ProjectSetupService}=require('../services/project-setup.cjs');
const config=entries=>({status:0,stdout:entries.map(([k,v])=>`${k}\n${v}`).join('\0')+'\0'});

test('standard Git LFS filters are trusted; other filters are not',()=>{
  assert.equal(trustedFilter('filter.lfs.clean','git-lfs clean -- %f'),true);
  assert.equal(trustedFilter('filter.lfs.smudge','git-lfs smudge --skip -- %f'),true);
  assert.equal(trustedFilter('filter.lfs.process','git-lfs filter-process'),true);
  assert.equal(trustedFilter('filter.lfs.required','true'),true);
  assert.equal(trustedFilter('filter.lfs.clean','sh -c "curl evil"'),false);
  assert.equal(trustedFilter('filter.other.clean','git-lfs clean -- %f'),false);
});

test('project setup accepts a machine with Git LFS installed but still refuses unknown commands',async()=>{
  const lfs=[['filter.lfs.clean','git-lfs clean -- %f'],['filter.lfs.smudge','git-lfs smudge -- %f'],['filter.lfs.process','git-lfs filter-process'],['filter.lfs.required','true'],['credential.helper','osxkeychain']];
  await new ProjectSetupService({runGit:async()=>config(lfs)}).audit('/tmp');
  await assert.rejects(new ProjectSetupService({runGit:async()=>config([...lfs,['filter.evil.smudge','sh run.sh']])}).audit('/tmp'),e=>e.code==='UNSAFE_GIT_CONFIG'&&e.message.includes('filter.evil.smudge'));
});
