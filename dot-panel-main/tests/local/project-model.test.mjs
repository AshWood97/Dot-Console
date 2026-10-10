// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';

const compiled=await build({entryPoints:[resolve('src/project-model.ts')],bundle:true,write:false,platform:'node',format:'esm'});
const {normalizeProject,groupProjects,summarizeProjects}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const task=(project,status='running',extra={})=>({project,status,task:'same-task',...extra});

test('exact historical aliases resolve to stable project identities',()=>{
  assert.deepEqual(normalizeProject('A版审核'),normalizeProject('DramaFlow A'));
  assert.deepEqual(normalizeProject('CutsceneDaily'),normalizeProject('行业日报'));
  assert.deepEqual(normalizeProject('行业日报/CutsceneDaily'),normalizeProject('行业日报'));
  assert.deepEqual(normalizeProject('Dot Panel'),normalizeProject('Dot Console'));
  assert.equal(normalizeProject('A版审核').repo,'zihan/DramaFlow-old26_0922');
  assert.equal(normalizeProject('Dot Panel').repo,undefined);
});

test('unknown names are independent and no fuzzy matching changes identity',()=>{
  for(const name of ['A版审核新','dramaflow a','CutsceneDaily ','Dot Panel copy','dramaflow-a']){
    const identity=normalizeProject(name);
    assert.equal(identity.name,name);assert.equal(identity.known,false);assert.equal(identity.repo,undefined);
    assert.notEqual(identity.id,normalizeProject('DramaFlow A').id);
  }
  assert.notEqual(normalizeProject('Other').id,normalizeProject('other').id);
});

test('canonical groups retain every active and completed task without interpreting stages',()=>{
  const tasks=[task('Dot Panel','completed',{task:'live-window'}),task('Dot Console','completed',{task:'passive-board'}),task('Dot Panel','running',{task:'project-grouping',stage:'测试、部署、修复'})];
  const groups=groupProjects(tasks);
  assert.equal(groups.length,1);assert.equal(groups[0].tasks.length,3);
  assert.deepEqual(groups[0].tasks,tasks);assert.equal(groups[0].counts.completed,2);assert.equal(groups[0].counts.running,1);assert.equal(groups[0].counts.total,3);
});

test('mixed status counts have explicit task units and evidence statuses remain visible',()=>{
  const statuses=['running','blocked','needs_confirmation','queued','completed','canceled','passed','failed','unknown'];
  const [group]=groupProjects(statuses.map(status=>task('DramaFlow A',status)));
  assert.deepEqual(group.counts,{running:1,waiting:3,blocked:1,needsConfirmation:1,completed:1,canceled:1,other:3,total:9});
  assert.equal(group.counts.running+group.counts.waiting+group.counts.completed+group.counts.canceled+group.counts.other,group.counts.total);
});

test('same task name in different projects remains separate, aliases share one group',()=>{
  const groups=groupProjects([task('A版审核'),task('CutsceneDaily'),task('DramaFlow A','completed',{task:'second-task'})]);
  assert.equal(groups.length,2);assert.equal(groups[0].tasks.length,2);assert.equal(groups[1].tasks.length,1);
});

test('known project order is stable and unknown projects keep first-observed order',()=>{
  const groups=groupProjects(['Z new','Dot Console','行业日报','A版审核','A new'].map(name=>task(name)));
  assert.deepEqual(groups.map(group=>group.name),['DramaFlow A','行业日报','Dot Console','Z new','A new']);
  assert.deepEqual(groupProjects([]),[]);
});

test('normalization and grouping never mutate source records or expose registry state',()=>{
  const tasks=Object.freeze([Object.freeze(task('Dot Panel','completed'))]);
  const before=JSON.stringify(tasks);groupProjects(tasks);
  assert.equal(JSON.stringify(tasks),before);
  const identity=normalizeProject('A版审核');identity.name='Changed';
  assert.equal(normalizeProject('A版审核').name,'DramaFlow A');
});

test('actual event file is read-only and all original project labels survive grouping',async t=>{
  const file=resolve('../task-events.jsonl');let before;try{before=await readFile(file,'utf8');}catch(error){if(error.code==='ENOENT'){t.skip('Private host event history is not included in portable bundles');return;}throw error;}
  const events=before.split('\n').filter(Boolean).map(line=>JSON.parse(line));
  const original=JSON.stringify(events);groupProjects(events);
  assert.equal(JSON.stringify(events),original);
  // No file write occurs: callers pass reduced tasks, raw events stay archival.
  assert.ok(events.some(event=>event.project==='A版审核'));
  assert.ok(events.some(event=>event.project==='Dot Panel'));
});

test('DramaFlow B is explicit, independent from A and APIGC company standards',()=>{
 const b=normalizeProject('DramaFlow B');assert.equal(b.id,'dramaflow-b');assert.equal(b.repo,'zihan/DramaFlow-APIGC');assert.equal(b.name,'DramaFlow B');
 const groups=groupProjects(['DramaFlow B','A版审核','行业日报','Dot Panel','outosgreenroom','APIGC公司规范'].map(project=>task(project)));
 assert.equal(groups.length,6);assert.deepEqual(groups.map(g=>g.name),['DramaFlow A','行业日报','Dot Console','outosgreenroom','APIGC公司规范','DramaFlow B']);
 assert.equal(groups.find(g=>g.id==='dramaflow-b').tasks.length,1);
 assert.equal(normalizeProject('APIGC公司规范').known,false);
 assert.notEqual(normalizeProject('DramaFlow-APIGC').id,b.id);
 assert.notEqual(normalizeProject('DramaFlow A').id,b.id);
});


test('project summary uses mutually exclusive buckets with active precedence',()=>{
 const group=(...states)=>({tasks:states.map(status=>({status}))});
 assert.deepEqual(summarizeProjects([group('running','blocked'),group('queued'),group('completed'),group('failed'),group('needs_confirmation'),group('canceled'),group('completed','canceled'),group('unknown'),group()]),{total:9,running:2,waiting:6,completed:1});
 assert.deepEqual(summarizeProjects([]),{total:0,running:0,waiting:0,completed:0});
 assert.deepEqual(summarizeProjects([{tasks:[{status:'completed',blocker:'Unresolved dependency'}]}]),{total:1,running:0,waiting:1,completed:0});
});

test('latest launches sort groups, completed groups trail unresolved ones, invalid dates have stable fallback',()=>{
 const tasks=[task('DramaFlow A','completed',{launchAt:'2026-10-10T09:00:00Z',launchOrder:9}),task('DramaFlow B','running',{launchAt:'2026-10-10T03:00:00Z',launchOrder:3}),task('行业日报','blocked',{launchAt:'2026-10-10T04:00:00Z',launchOrder:4}),task('Undated','running',{launchAt:'invalid',launchOrder:10}),task('No history','running')];
 assert.deepEqual(groupProjects(tasks).map(g=>g.name),['行业日报','DramaFlow B','Undated','No history','DramaFlow A']);
 const tie=[task('One','running',{launchAt:'2026-10-10T03:00:00Z',launchOrder:2}),task('Two','running',{launchAt:'2026-10-10T03:00:00Z',launchOrder:3})];assert.deepEqual(groupProjects(tie).map(g=>g.name),['Two','One']);
});
