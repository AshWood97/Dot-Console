// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync,spawn} from 'node:child_process';
import {aggregateTasks,taskFreshness,VERIFY_AFTER_MS} from '../../lib/task-reporting.mjs';
import {validateEvent,appendEvent,readEvents,MAX_EVENT_BYTES} from '../../local/events.mjs';
import {reportProgress,reportCheckpoint,verificationDue,runCommand} from '../../local/reporting.mjs';
const epoch=Date.parse('2026-10-10T01:00:00Z'),iso=ms=>new Date(epoch+ms).toISOString();
const e=(id,extra={})=>({id,project:'Dot Panel',task:'test',title:'Test',message:'Verified result',kind:'status',status:'running',source:'tool',timestamp:iso(0),reported_at:iso(0),...extra});
const check=(id,ms,extra={})=>e(id,{kind:'checkpoint',timestamp:iso(ms),reported_at:iso(ms),verification:{observed_at:iso(ms),evidence:'Observed real task output',scope:'task'},...extra});
async function fixture(t){const dir=await mkdtemp(join(tmpdir(),'dot-reporting-'));t.after(()=>rm(dir,{recursive:true,force:true}));return join(dir,'events.jsonl');}

test('checkpoint schema requires bounded evidence and forbids state/progress/metrics fields',()=>{
 assert.equal(validateEvent(check('ok',1)).verification.scope,'task');
 for(const extra of [{verification:undefined},{verification:{observed_at:iso(2),evidence:'future',scope:'task'}},{verification:{observed_at:iso(1),evidence:'',scope:'task'}},{verification:{observed_at:iso(1),evidence:'bad scope',scope:'network'}},...['stage','done','next','blocker','summary','started_at','metrics'].map(k=>({[k]:k==='blocker'?null:'bad'}))])assert.throws(()=>validateEvent(check('bad',1,extra)));
});
test('checkpoint preserves progress, title, result, lifecycle, metrics and launch order',()=>{
 const original=e('start',{stage:'Build',done:'Earlier passed result',blocker:'External dependency',metrics:{tests:{passed:2,total:3,scope:'same run',source:'tests'}}});
 const [before]=aggregateTasks([original]);const [after]=aggregateTasks([original,check('check',60_000,{project:'Dot Console',title:'Do not replace title',status:'completed'})]);
 for(const field of ['last','stage','done','status','title','blocker','metrics','metricsReportedAt','launchAt','launchOrder','lastProgressAt'])assert.deepEqual(after[field],before[field]);
 assert.equal(after.lastVerifiedAt,iso(60_000));assert.equal(after.project,'Dot Panel');
});
test('duplicates and delayed older verification never freshen or rewind clocks',()=>{
 const start=e('start'),recent=check('recent',240_000),old=check('late',60_000);
 const [t]=aggregateTasks([start,recent,old,{...recent,verification:{...recent.verification,observed_at:iso(900_000)}}]);
 assert.equal(t.lastVerifiedAt,iso(240_000));assert.equal(t.lastProgressAt,iso(0));
 const [corrected]=aggregateTasks([e('new',{timestamp:iso(90_000)}),e('late',{timestamp:iso(10_000),stage:'Append order correction'})]);
 assert.equal(corrected.stage,'Append order correction');assert.equal(corrected.lastProgressAt,iso(90_000));
});
test('verification becomes due at exactly five minutes, not one millisecond earlier',()=>{
 const [t]=aggregateTasks([e('start'),check('check',0)]);
 assert.equal(taskFreshness(t,epoch+VERIFY_AFTER_MS-1).due,false);
 assert.equal(taskFreshness(t,epoch+VERIFY_AFTER_MS).due,true);
 assert.equal(taskFreshness(t,epoch+VERIFY_AFTER_MS+1).due,true);
});
test('unknown and future times are neutral due states, never lifecycle failures',()=>{
 const [unknown]=aggregateTasks([e('start',{timestamp:undefined,reported_at:undefined})]);
 assert.deepEqual([taskFreshness(unknown,epoch).due,taskFreshness(unknown,epoch).unknown,unknown.status],[true,true,'running']);
 const [future]=aggregateTasks([e('start',{timestamp:iso(60_000)})]);assert.equal(taskFreshness(future,epoch).clockSkew,true);assert.equal(taskFreshness(future,epoch).due,true);
});
test('terminal, waiting, failed and orphan tasks cannot be revived by checkpoint',()=>{
 assert.deepEqual(aggregateTasks([check('orphan',0)]),[]);
 for(const status of ['completed','canceled','blocked','needs_confirmation','failed']){
  const [t]=aggregateTasks([e('state',{status}),check('check',100)]);assert.equal(t.status,status);assert.equal(taskFreshness(t,epoch+999_999).active,false);
  if(['completed','canceled'].includes(status))assert.equal(t.lastVerifiedAt,undefined);
 }
});
test('explicit restart discards old-run verification and rejects delayed old-run checkpoint',()=>{
 const [t]=aggregateTasks([e('start'),check('old',50_000),e('done',{status:'completed',timestamp:iso(90_000)}),e('restart',{timestamp:iso(100_000)}),check('delayed',80_000)]);
 assert.equal(t.lastVerifiedAt,undefined);assert.equal(t.launchAt,iso(100_000));assert.equal(t.status,'running');
});
test('new reports record observed time and report lateness without rewriting history',async t=>{
 const file=await fixture(t),r=await reportProgress(e('first'),file);assert.ok(r.lateByMs>0);assert.equal(r.event.verification.observed_at,iso(0));
 const repeat=await reportProgress(e('first',{message:'Duplicate retry'}),file);assert.equal(repeat.duplicate,true);assert.equal((await readEvents(file)).events.length,1);
});
test('checkpoint helper does not create tasks or append unchanged observations',async t=>{
 const file=await fixture(t);await assert.rejects(()=>reportCheckpoint({project:'P',task:'unknown',evidence:'Observed'},file),/existing task/);
 await appendEvent(e('start'),file);await reportCheckpoint({project:'Dot Console',task:'test',id:'fresh',evidence:'Observed test process result',observed_at:iso(1)},file);
 assert.equal((await reportCheckpoint({project:'Dot Console',task:'test',evidence:'Same time',observed_at:iso(1)},file)).skipped,true);
 await appendEvent(e('done',{status:'completed'}),file);assert.equal((await reportCheckpoint({project:'Dot Console',task:'test',evidence:'Late alive'},file)).reason,'task_terminal');
 assert.equal((await readEvents(file)).events.length,3);
});
test('due is a read-only list from actual observations and excludes terminal/blocked tasks',async t=>{
 const file=await fixture(t);await appendEvent(e('start'),file);await appendEvent(e('blocked',{task:'blocked',status:'blocked'}),file);await appendEvent(e('done',{task:'done',status:'completed'}),file);
 const before=await readFile(file,'utf8'),r=await verificationDue({file,now:epoch+300_000});assert.equal(r.tasks.length,1);assert.equal(r.tasks[0].reason,'verification_not_recorded');assert.equal(await readFile(file,'utf8'),before);
});
test('bounded reader rejects files above 16 MiB and writes stop before crossing the cap',async t=>{
 const file=await fixture(t);await writeFile(file,' '.repeat(MAX_EVENT_BYTES));await assert.rejects(()=>appendEvent(e('excess'),file),/16 MiB/);await writeFile(file,' '.repeat(MAX_EVENT_BYTES+1));await assert.rejects(()=>readEvents(file),/16 MiB/);
});
test('owned command reports real start and success, never overall task completion',async t=>{
 const file=await fixture(t);await appendEvent(e('start',{stage:'Keep stage',done:'Keep result'}),file);
 const result=await runCommand({file,project:'Dot Panel',task:'test',id:'success-run',label:'Own success test',command:process.execPath,args:['-e','process.exit(0)'],stdio:'ignore'});
 assert.equal(result.code,0);const events=(await readEvents(file)).events;assert.ok(events.some(e=>e.id==='success-run:start'&&e.kind==='checkpoint'));assert.equal(events.at(-1).status,'passed');
 const [task]=aggregateTasks(events);assert.equal(task.status,'running');assert.equal(task.stage,'Keep stage');assert.equal(task.done,'Keep result');
 const replay=await runCommand({file,project:'Dot Panel',task:'test',id:'success-run',command:process.execPath,args:['-e','process.exit(4)'],stdio:'ignore'});assert.equal(replay.launched,false);assert.equal((await readEvents(file)).events.length,events.length);
});
test('failed or unlaunchable command preserves task state and records exact command failure',async t=>{
 const file=await fixture(t);await appendEvent(e('start',{blocker:'Unrelated failure retained'}),file);
 const result=await runCommand({file,project:'Dot Panel',task:'test',id:'failure-run',command:process.execPath,args:['-e','process.exit(7)'],stdio:'ignore'});assert.equal(result.code,7);
 const missing=await runCommand({file,project:'Dot Panel',task:'test',id:'missing-run',command:'/no/such/dot-command',stdio:'ignore'});assert.equal(missing.code,127);assert.equal(missing.launched,false);
 const [task]=aggregateTasks((await readEvents(file)).events);assert.equal(task.status,'running');assert.equal(task.blocker,'Unrelated failure retained');assert.equal(task.last.status,'failed');
});
test('owned live process can checkpoint with no invented progress and stops at exit',async t=>{
 const file=await fixture(t);await appendEvent(e('start'),file);
 await runCommand({file,project:'Dot Panel',task:'test',id:'live-run',command:process.execPath,args:['-e','setTimeout(()=>{},100)'],checkEveryMs:20,stdio:'ignore'});
 const events=(await readEvents(file)).events;const checks=events.filter(e=>e.id.startsWith('live-run:alive:'));assert.ok(checks.length>0);assert.ok(checks.every(e=>e.kind==='checkpoint'&&e.verification.scope==='process'));
 assert.equal(aggregateTasks(events.slice(0,-1))[0].lastProgressAt,iso(0));const count=events.length;await new Promise(r=>setTimeout(r,60));assert.equal((await readEvents(file)).events.length,count);
});
test('cancel relays to own process and records canceled command, leaving lifecycle explicit',async t=>{
 const file=await fixture(t);await appendEvent(e('start'),file);const controller=new AbortController();setTimeout(()=>controller.abort(),100);
 const result=await runCommand({file,project:'Dot Panel',task:'test',id:'cancel-run',command:process.execPath,args:['-e','setInterval(()=>{},1000)'],signal:controller.signal,stdio:'ignore',killAfterMs:200});
 assert.equal(result.code,130);const events=(await readEvents(file)).events;assert.equal(events.at(-1).status,'canceled');assert.equal(aggregateTasks(events)[0].status,'running');
});
test('wrapper refuses terminal tasks, and pre-canceled runs never launch',async t=>{
 const file=await fixture(t);await appendEvent(e('done',{status:'completed'}),file);await assert.rejects(()=>runCommand({file,project:'Dot Panel',task:'test',command:process.execPath}),/active task/);
 await appendEvent(e('restart'),file);const signal=AbortSignal.abort();assert.equal((await runCommand({file,project:'Dot Panel',task:'test',command:process.execPath,signal})).launched,false);
});
test('CLI handles config, state-preserving checkpoints, invalid flags and due with no writes',async t=>{
 const file=await fixture(t),cli=resolve('local/report.mjs');const run=(args,input)=>spawnSync(process.execPath,[cli,...args],{input,encoding:'utf8',env:{...process.env,DOT_CONSOLE_EVENTS:file}});
 assert.equal(run(['start','--project','CLI','--task','test','--title','CLI test','--message','Started actual review']).status,0);
 assert.equal(run(['checkpoint','--project','CLI','--task','test','--evidence','Inspected actual test output']).status,0);
 assert.equal(run(['checkpoint','--project','CLI','--task','test','--evidence','x','--done','false progress']).status,1);
 const before=await readFile(file,'utf8');assert.equal(run(['due']).status,0);assert.equal(await readFile(file,'utf8'),before);
 assert.equal(run(['complete','--project','CLI','--task','test','--message','Verified complete']).status,0);
 assert.equal(run(['milestone','--project','CLI','--task','test','--message','Accidental revival']).status,1);
});

test('late historical results can have a separately current verification without refreshing progress time',async t=>{
 const file=await fixture(t),now=new Date().toISOString();const result=await reportProgress(e('old-result',{verification:{observed_at:now,evidence:'Just rechecked the existing result',scope:'task'}}),file);
 assert.equal(result.lateByMs,0);const [task]=aggregateTasks((await readEvents(file)).events);assert.equal(task.lastProgressAt,iso(0));assert.equal(task.lastVerifiedAt,now);
});
test('process exit evidence does not overwrite a newer task title or failed lifecycle',()=>{
 const [task]=aggregateTasks([e('new',{title:'Current stage title',status:'failed',stage:'Failure review',blocker:'Unresolved'}),e('exit',{kind:'tool',status:'passed',title:'Old command title',verification:{observed_at:iso(0),evidence:'Own process exited 0',scope:'process'}})]);
 assert.equal(task.title,'Current stage title');assert.equal(task.status,'failed');assert.equal(task.stage,'Failure review');assert.equal(task.blocker,'Unresolved');
});
