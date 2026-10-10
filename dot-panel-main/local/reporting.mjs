// SPDX-License-Identifier: AGPL-3.0-only
import {spawn} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,open,unlink} from 'node:fs/promises';
import {dirname} from 'node:path';
import {appendEvent,readEvents,DEFAULT_FILE} from './events.mjs';
import {aggregateTasks,taskFreshness,VERIFY_AFTER_MS,REPORT_WITHIN_MS} from '../lib/task-reporting.mjs';
import {normalizeProject} from '../lib/project-identity.mjs';
export async function currentTask(project,task,file=DEFAULT_FILE) {
  return aggregateTasks((await readEvents(file)).events).find(t=>normalizeProject(t.project).id===normalizeProject(project).id&&t.last.task===task);
}
export async function reportProgress(input,file=DEFAULT_FILE) {
  const now=new Date().toISOString(), observed=input.timestamp??now;
  if(input.kind==='checkpoint')throw new Error('Use checkpoint for activity-only observations');
  // Calling this interface attests that the message is a real observed result.
  // supplied historical timestamps remain historical, even when reported late.
  const result=await appendEvent({...input,kind:input.kind??'status',source:input.source??'tool',reported_at:now,timestamp:observed,verification:input.verification??{observed_at:observed,evidence:typeof input.message==='string'?input.message.slice(0,500):input.message,scope:'task'}},file);
  return {...result,lateByMs:Math.max(0,Date.parse(result.event.reported_at)-Date.parse(result.event.verification?.observed_at??result.event.timestamp)-REPORT_WITHIN_MS)};
}
export async function reportCheckpoint({project,task,id,evidence,observed_at,scope='task'},file=DEFAULT_FILE) {
  if(typeof evidence!=='string'||!evidence.trim())throw new Error('Checkpoint requires fresh observed evidence');
  const old=await currentTask(project,task,file);
  if(!old?.hasLifecycle)throw new Error('Checkpoint requires an existing task lifecycle');
  if(['completed','canceled'].includes(old.status))return {skipped:true,reason:'task_terminal'};
  const now=new Date().toISOString(), at=observed_at??now;
  if(old.launchAt&&Date.parse(at)<Date.parse(old.launchAt))return {skipped:true,reason:'before_current_launch'};
  if(old.lastVerifiedAt&&Date.parse(at)<=Date.parse(old.lastVerifiedAt))return {skipped:true,reason:'not_newer'};
  return appendEvent({id:id??randomUUID(),project,task,title:old.title,message:evidence,kind:'checkpoint',status:old.status,source:'tool',timestamp:at,reported_at:now,verification:{observed_at:at,evidence,scope}},file);
}
export async function verificationDue({file=DEFAULT_FILE,now=Date.now()}={}) {
  const snapshot=await readEvents(file);
  return {checkedAt:new Date(now).toISOString(),targetMinutes:VERIFY_AFTER_MS/60000,invalidRecords:snapshot.invalid,tasks:aggregateTasks(snapshot.events).filter(t=>taskFreshness(t,now).due).map(t=>({project:t.project,task:t.last.task,title:t.title,status:t.status,stage:t.stage,lastProgressAt:t.lastProgressAt??null,lastVerifiedAt:t.lastVerifiedAt??null,reason:taskFreshness(t,now).clockSkew?'clock_skew':taskFreshness(t,now).unknown?'verification_not_recorded':'verification_due'}))};
}
// Own explicitly launched child only: no discovery of platform jobs, session
// files, process trees belonging to others, output scraping, or network polling.
export async function runCommand({project,task,id=randomUUID(),label,command,args=[],file=DEFAULT_FILE,checkEveryMs=VERIFY_AFTER_MS,signal,stdio='inherit',killAfterMs=5000}) {
  if(!command)throw new Error('Missing command after --');
  const old=await currentTask(project,task,file);
  if(!old?.hasLifecycle||!['running','queued'].includes(old.status))throw new Error('run requires an existing active task; report start/restart explicitly');
  if(signal?.aborted)return {code:130,canceled:true,launched:false};
  if(typeof id!=='string'||!id.trim()||id.length>120)throw new Error('Run ID must contain 1–120 characters');
  const description=label??'Owned command';
  if(typeof description!=='string'||!description.trim()||description.length>200)throw new Error('Run label must contain 1–200 characters');
  const lock=`${file}.run-${createHash('sha256').update(id).digest('hex').slice(0,24)}.lock`;
  await mkdir(dirname(file),{recursive:true});
  let handle;
  try{handle=await open(lock,'wx',0o600);}catch(e){if(e.code==='EEXIST')throw new Error('Run ID is already active or needs explicit crash review; command not launched');throw e;}
  try {
  const recorded=(await readEvents(file)).events.some(e=>e.id===`${id}:start`||e.id===`${id}:exit`);
  if(recorded)return {code:0,skipped:true,reason:'run_already_recorded',launched:false};
  // Do not store arguments: they may contain sensitive values.
  const child=spawn(command,args,{stdio,detached:process.platform!=='win32'});
  let canceled=false,killTimer,closed=false,queue=Promise.resolve(),reportError;
  const enqueue=fn=>{queue=queue.then(fn).catch(e=>{reportError=e;});return queue;};
  const relay=()=>{if(closed)return;canceled=true;try{if(process.platform!=='win32')process.kill(-child.pid,'SIGTERM');else child.kill('SIGTERM');}catch{}killTimer=setTimeout(()=>{if(!closed)try{if(process.platform!=='win32')process.kill(-child.pid,'SIGKILL');else child.kill('SIGKILL');}catch{}},killAfterMs);killTimer.unref();};
  signal?.addEventListener('abort',relay,{once:true});
  const exited=new Promise(resolve=>{child.once('error',error=>resolve({code:127,signal:null,error}));child.once('close',(code,signal)=>resolve({code,signal}));});
  child.once('spawn',()=>enqueue(()=>reportCheckpoint({project,task,id:`${id}:start`,scope:'process',evidence:`${description}: owned process ${child.pid} started; no result yet`},file)));
  let count=0;
  const timer=setInterval(()=>enqueue(async()=>{
    if(closed||child.exitCode!==null||child.signalCode!==null)return;
    const current=await currentTask(project,task,file);
    if(!current||!taskFreshness(current).active||(!taskFreshness(current).due&&checkEveryMs>=VERIFY_AFTER_MS))return;
    try{process.kill(child.pid,0);}catch{return;}
    await reportCheckpoint({project,task,id:`${id}:alive:${++count}`,scope:'process',evidence:`${description}: owned process ${child.pid} exists; progress and health not inferred`},file);
  }),checkEveryMs);timer.unref();
  const result=await exited;closed=true;clearInterval(timer);clearTimeout(killTimer);signal?.removeEventListener('abort',relay);await queue;
  const status=canceled?'canceled':result.code===0?'passed':'failed';
  const message=`${description}: ${canceled?'canceled':result.error?'could not start':`exited ${result.code??result.signal}`}`;
  const now=new Date().toISOString();
  // Command exit is evidence, never overall task completion or an automatic
  // lifecycle failure. Existing stages, metrics and blockers are untouched.
  await appendEvent({id:`${id}:exit`,project,task,title:old.title,message,kind:'tool',status,source:'tool',timestamp:now,reported_at:now,verification:{observed_at:now,evidence:message,scope:'process'}},file);
  if(reportError)throw reportError;
  return {code:canceled?130:result.code??1,signal:result.signal,status,canceled,launched:!result.error};
  }finally{await handle.close();await unlink(lock);}
}
