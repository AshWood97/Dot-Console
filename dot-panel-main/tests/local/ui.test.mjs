// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {resolve} from 'node:path';
import {renderToStaticMarkup} from 'react-dom/server';

const compiled=await build({entryPoints:[resolve('src/TaskWindow.tsx')],bundle:true,write:false,platform:'node',format:'esm',jsx:'automatic',loader:{'.css':'empty'},plugins:[{name:'hook-harness',setup(build){build.onResolve({filter:/^react$/},args=>args.importer.endsWith('/src/TaskWindow.tsx')?{path:resolve('tests/local/ui-hooks.mjs')}:undefined);}}]});
const {default:TaskWindow,aggregateTasks,displayText,distinctText,reportStamp,reportAge,taskPriority}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text+'\n//# sourceURL=TaskWindow-review-bundle.mjs').toString('base64'));
const sample=(id='one',extra={})=>({id,project:'Review',task:'Task',title:'Progress',message:'A status update',kind:'status',status:'running',source:'tool',timestamp:'2026-10-09T10:00:00.000Z',reported_at:'2026-10-09T10:00:01.000Z',...extra});
const page=(events,cursor='cursor-one',extra={})=>({events,cursor,reset:false,hasMore:false,invalid:0,serverTime:'2026-10-09T10:00:02.000Z',...extra});
const settle=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
function nodes(node,result=[]) {
  if(Array.isArray(node)){for(const child of node)nodes(child,result);return result;}
  if(!node||typeof node!=='object')return result;
  result.push(node);nodes(node.props?.children,result);return result;
}
function text(node) {
  if(Array.isArray(node))return node.map(text).join('');
  if(node==null||typeof node==='boolean')return '';
  if(typeof node!=='object')return String(node);
  return text(node.props?.children);
}
function harness(t) {
  const h={index:0,slots:[],pending:[],tree:null,requests:[],timers:new Map(),nextTimer:1};
  globalThis[Symbol.for('dot-panel.review-hooks')]=h;
  t.mock.method(globalThis,'fetch',(url,options={})=>{
    if(url==='/api/state')return Promise.resolve({ok:true,json:async()=>({})});
    return new Promise((resolve,reject)=>h.requests.push({url,options,resolve:value=>resolve({ok:true,json:async()=>value}),reject}));
  });
  t.mock.method(globalThis,'setTimeout',(callback,delay)=>{const id=h.nextTimer++;h.timers.set(id,{callback,delay});return id;});
  t.mock.method(globalThis,'clearTimeout',id=>h.timers.delete(id));
  h.render=()=>{h.index=0;h.tree=TaskWindow();const pending=h.pending.splice(0);for(const effect of pending)effect();return h.tree;};
  h.click=label=>{const button=nodes(h.tree).find(n=>n.type==='button'&&(text(n)===label||n.props['aria-label']===label));assert.ok(button,`Button ${label} exists`);button.props.onClick({currentTarget:{focus(){}}});h.render();};
  h.nextPoll=()=>{const first=[...h.timers.entries()].find(([,entry])=>entry.delay===25||entry.delay===2500||entry.delay===5000||entry.delay===7500||entry.delay===15000);assert.ok(first,'A poll is scheduled');h.timers.delete(first[0]);first[1].callback();};
  h.unmount=()=>{for(const slot of h.slots)slot?.cleanup?.();};
  t.after(()=>{h.unmount();delete globalThis[Symbol.for('dot-panel.review-hooks')];});
  h.render();return h;
}

test('passive board has no interaction dependency',async t=>{
  const h=harness(t);
  h.requests[0].resolve(page([sample('one',{stage:'Implement layout',done:'Schema added',next:'Browser validation'})]));await settle();h.render();
  assert.equal(nodes(h.tree).filter(n=>['input','dialog','a'].includes(n.type)).length,0);
  for(const content of ['Implement layout','Schema added','Browser validation']) assert.ok(text(h.tree).includes(content));
});

test('unmounted polls cannot inject late data',async t=>{
  const h=harness(t),first=h.requests[0];h.unmount();
  assert.equal(first.options.signal.aborted,true);
  first.resolve(page([sample('stale')],'stale-cursor'));await settle();
  assert.deepEqual(h.slots[0].value,[]);
});

test('temporary errors preserve records, retry, and deduplicate replayed events',async t=>{
  const h=harness(t);
  h.requests[0].resolve(page([sample()],'cursor-one'));await settle();h.render();h.nextPoll();
  h.requests.at(-1).reject(new Error('Network interrupted'));await settle();h.render();
  assert.deepEqual(h.slots[0].value.map(e=>e.id),['one']);
  assert.match(text(h.tree),/数据同步中断/);
  assert.match(text(h.tree),/连接中断/);
  h.nextPoll();assert.match(h.requests.at(-1).url,/cursor-one/);
  h.requests.at(-1).resolve(page([sample(),sample('two')],'cursor-two'));await settle();h.render();
  assert.deepEqual(h.slots[0].value.map(e=>e.id),['one','two']);
  assert.doesNotMatch(text(h.tree),/Network interrupted/);
});

test('event text stays escaped and server reset replaces prior events',async t=>{
  const h=harness(t);
  h.requests[0].resolve(page([sample('one',{done:'<img src=x onerror=alert(1)><script>alert(2)</script>'})]));await settle();h.render();
  const html=renderToStaticMarkup(h.tree);
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.doesNotMatch(html,/<script>alert\(2\)<\/script>/);
  h.nextPoll();h.requests.at(-1).resolve(page([sample('new')],'new-cursor',{reset:true}));await settle();h.render();
  assert.deepEqual(h.slots[0].value.map(e=>e.id),['new']);
});

test('reset removes previous tasks and reveals replacement without selection',async t=>{
  const h=harness(t);h.requests[0].resolve(page([sample()]));await settle();h.render();
  h.nextPoll();h.requests.at(-1).resolve(page([sample('new',{task:'Replacement task',stage:'Replacement visible'})],'reset-cursor',{reset:true}));await settle();h.render();
  assert.match(text(h.tree),/Replacement visible/);
  assert.equal(nodes(h.tree).filter(n=>n.type==='article').length,1);
});

test('test passes never complete tasks, structured fields persist, and order is stable',()=>{
  const events=[sample('one',{stage:'Implementation',done:'Done',blocker:'Waiting'}),sample('other',{project:'Second'}),sample('passed',{kind:'test',status:'passed',next:'Retest',blocker:null})];
  const tasks=aggregateTasks(events);
  assert.equal(tasks[0].project,'Review');assert.equal(tasks[0].status,'running');assert.equal(tasks[0].stage,'Implementation');assert.equal(tasks[0].blocker,null);assert.equal(tasks[0].next,'Retest');
  assert.equal(aggregateTasks([...events,sample('complete',{kind:'status',status:'completed'})])[0].status,'completed');
});

test('unmount aborts current work and clears all future polls',async t=>{
  const h=harness(t);
  h.requests[0].resolve(page([sample()]));await settle();
  assert.ok(h.timers.size>0);h.unmount();assert.equal(h.timers.size,0);
  assert.equal(h.requests[0].options.signal.aborted,true);
});

test('a hung poll times out, retains its cursor, and retries with a fresh signal',async t=>{
  const deadlines=[];
  t.mock.method(AbortSignal,'timeout',duration=>{const controller=new AbortController();deadlines.push({duration,controller});return controller.signal;});
  const h=harness(t);
  h.requests[0].resolve(page([sample()],'cursor-kept'));await settle();h.render();h.nextPoll();
  const pending=h.requests.at(-1),deadline=deadlines.at(-1);
  assert.ok(deadline.duration>0&&deadline.duration<=15000,'Each request has a bounded timeout');
  const reason=new DOMException('Request timed out','TimeoutError');
  deadline.controller.abort(reason);
  assert.equal(pending.options.signal.aborted,true);
  pending.reject(reason);await settle();h.render();
  assert.deepEqual(h.slots[0].value.map(e=>e.id),['one']);
  assert.match(text(h.tree),/连接中断/);
  h.nextPoll();
  assert.match(h.requests.at(-1).url,/cursor-kept/);
  assert.equal(h.requests.at(-1).options.signal.aborted,false);
});


test('Dot Console branding preserves assistant identity, event history and card keys',async t=>{
  const h=harness(t),original=sample('brand',{project:'Dot Panel',stage:'Dot Panel ready'});
  const before=JSON.stringify(original);
  h.requests[0].resolve(page([original]));await settle();h.render();
  assert.match(text(h.tree),/Dot Console/);
  assert.match(text(h.tree),/好大的小西瓜/);
  assert.doesNotMatch(text(h.tree),/Dot Panel/);
  assert.equal(JSON.stringify(original),before);
  assert.equal(nodes(h.tree).find(n=>n.type==='article').props['data-task-key'],JSON.stringify(['dot-console','Task']));
  assert.equal(displayText('Dot Panel progress'),'Dot Console progress');
  assert.equal(nodes(h.tree).find(n=>n.type==='img').props.src,'/brand/favicon.svg');
});

test('mixed task lifecycles remain inside one stable project container',async t=>{
 const h=harness(t);h.requests[0].resolve(page([sample('run',{project:'DramaFlow A',task:'active',stage:'Working'}),sample('block',{project:'A版审核',task:'blocked',status:'blocked',blocker:'Specific authorization is missing'}),sample('done',{project:'A版审核',task:'finished',status:'completed'})]));await settle();h.render();
 const groups=nodes(h.tree).filter(n=>n.props?.['data-project-id']);
 assert.equal(groups.length,1);assert.equal(groups[0].props['data-project-id'],'dramaflow-a');
 assert.equal(nodes(groups[0]).filter(n=>n.type==='article').length,3);
 assert.match(text(groups[0]),/1 进行中/);assert.match(text(groups[0]),/1 受阻/);assert.match(text(groups[0]),/1 已完成/);
 assert.match(text(groups[0]),/Specific authorization is missing/);
});

test('all-completed projects remain grouped and never impersonate running work',async t=>{
 const h=harness(t);h.requests[0].resolve(page([sample('done',{status:'completed'})]));await settle();h.render();
 assert.match(text(h.tree),/1 已完成/);
 assert.equal(nodes(h.tree).filter(n=>n.props?.className?.includes('pg-project pg-running')).length,0);
 assert.equal(nodes(h.tree).filter(n=>n.type==='article').length,1);
});

test('every active task remains available without clipping to a fixed count',async t=>{
 const h=harness(t);h.requests[0].resolve(page(Array.from({length:7},(_,i)=>sample(String(i),{project:'Project '+i,status:i===0?'running':'blocked',blocker:'Blocker '+i}))));await settle();h.render();
 assert.equal(nodes(h.tree).filter(n=>n.type==='article').length,7);
 for(let i=1;i<7;i++) assert.ok(text(h.tree).includes('Blocker '+i));
});

test('multiple notices are preserved together',async t=>{
 const h=harness(t);h.requests[0].resolve(page([sample('approval',{status:'needs_confirmation'})],'one',{invalid:2}));await settle();h.render();
 assert.match(text(h.tree),/请在原对话确认/);assert.match(text(h.tree),/2 条格式异常记录/);
});

test('responsive board never uses clipping or ellipsis to pretend content fits',async()=>{
 const {readFile}=await import('node:fs/promises');
 const css=await readFile('src/task-window.css','utf8');
 assert.match(css,/overflow:auto/);
 assert.doesNotMatch(css,/overflow:\s*hidden|text-overflow:\s*ellipsis|line-clamp|display:\s*none/);
 assert.match(css,/@media\(max-width:560px\)/);
});

test('task counts stay local while the top header summarizes project groups',async t=>{
 const h=harness(t);h.requests[0].resolve(page([sample('old',{project:'Same',task:'old',status:'completed'}),sample('active',{project:'Same',task:'new',status:'running'}),sample('complete',{project:'Other',status:'completed'})]));await settle();h.render();
 assert.equal(nodes(h.tree).filter(n=>n.type==='article').length,3);
 const header=nodes(h.tree).find(n=>n.props?.className==='pg-header');
 assert.match(text(header),/总共 2 组项目/);assert.equal(nodes(header).filter(n=>n.props?.className==='pg-summary').length,1);
 const groups=nodes(h.tree).filter(n=>n.props?.['data-project-id']);assert.equal(groups.length,2);
 assert.match(text(groups[0]),/2 项任务/);assert.match(text(groups[0]),/1 进行中/);assert.match(text(groups[0]),/1 已完成/);
});

test('aliases reduce to one task, replayed event ids are ignored, original events stay unchanged',()=>{
 const a=sample('a',{project:'A版审核',stage:'First'}),b=sample('b',{project:'DramaFlow A',stage:'Second'});
 const original=JSON.stringify([a,b]);const ts=aggregateTasks([a,b,a]);
 assert.equal(ts.length,1);assert.equal(ts[0].stage,'Second');assert.equal(JSON.stringify([a,b]),original);
 assert.equal(aggregateTasks([a,{...b,project:'行业日报'}]).length,2);
});

test('append-order corrections with equal timestamps retain task fields and never create phase tasks',()=>{
 const ts=aggregateTasks([sample('one',{stage:'Audit',done:'Verified'}),sample('two',{stage:'Branch cleanup'}),sample('late',{timestamp:'2026-10-08T10:00:00.000Z',stage:'Corrected status'})]);
 assert.equal(ts.length,1);assert.equal(ts[0].stage,'Corrected status');assert.equal(ts[0].done,'Verified');
});

test('running tasks with reported blockers keep both execution and risk visible',async t=>{
 const h=harness(t);h.requests[0].resolve(page([sample('risk',{status:'running',blocker:'Waiting for deployment input'})]));await settle();h.render();
 assert.match(text(h.tree),/进行中/);assert.match(text(h.tree),/Waiting for deployment input/);
});

test('unrecognized projects stay independent and do not inherit task names from known projects',async t=>{
 const h=harness(t);h.requests[0].resolve(page([sample('unknown',{project:'Unmapped',task:'project-grouping',title:'Independent task'})]));await settle();h.render();
 assert.equal(nodes(h.tree).find(n=>n.props?.['data-project-id']).props['data-project-id'],'legacy:Unmapped');
 assert.match(text(h.tree),/Independent task/);assert.doesNotMatch(text(h.tree),/项目分组/);
});


test('four equal project cards contain their own blockers and confirmation instructions',async t=>{
 const h=harness(t);h.requests[0].resolve(page([sample('a',{project:'DramaFlow A',status:'completed'}),sample('b',{project:'行业日报',status:'blocked',blocker:'Daily blocker'}),sample('c',{project:'Dot Console',status:'running'}),sample('d',{project:'outosgreenroom',status:'needs_confirmation',blocker:'Greenroom approval'})]));await settle();h.render();
 const groups=nodes(h.tree).filter(n=>n.props?.['data-project-id']);assert.equal(groups.length,4);
 assert.ok(groups.every(n=>!n.props.className.includes('pg-tool')));
 const daily=groups.find(n=>n.props['data-project-id']==='cutscene-daily');
 const green=groups.find(n=>n.props['data-project-id']==='legacy:outosgreenroom');
 assert.match(text(daily),/Daily blocker/);assert.doesNotMatch(text(daily),/Greenroom approval/);
 assert.match(text(green),/Greenroom approval/);assert.match(text(green),/请在原对话确认/);
 assert.equal(nodes(h.tree).filter(n=>n.props?.className?.includes('pg-risk-overview')).length,0);
 assert.equal(nodes(h.tree).filter(n=>n.props?.className==='pg-notice').length,0);
});

test('portrait cards share the same grid without full-row tool exceptions',async()=>{
 const {readFile}=await import('node:fs/promises');const css=await readFile('src/task-window.css','utf8');
 assert.match(css,/aspect-ratio:3\/4/);assert.match(css,/auto-fit/);
 assert.doesNotMatch(css,/\.pg-tool|\.pg-project\{[^}]*height:[0-9]+px/);
});


test('completed summaries remove exact repeated text but preserve distinct results',async t=>{
 const h=harness(t);h.requests[0].resolve(page([sample('done',{task:'done',status:'completed',title:'Delivered',stage:'Delivered',done:'Delivered'}),sample('other',{task:'other',status:'running'})]));await settle();h.render();
 const completed=nodes(h.tree).find(n=>n.type==='article'&&n.props['data-task-key'].endsWith('"done"]'));
 assert.equal(text(completed).split('Delivered').length-1,1);
 assert.deepEqual(distinctText(['One',' One ','Two','Two'],[]),['One','Two']);
 assert.deepEqual(distinctText(['阶段完成','额外测试通过'],['任务名']),['阶段完成','额外测试通过']);
});

test('confirmation and blocker tasks are first within their own project, all siblings retained',async t=>{
 const h=harness(t);h.requests[0].resolve(page([sample('run',{task:'run'}),sample('done',{task:'done',status:'completed'}),sample('block',{task:'block',status:'running',blocker:'External dependency'}),sample('confirm',{task:'confirm',status:'needs_confirmation',blocker:'Owner decision'})]));await settle();h.render();
 assert.deepEqual(nodes(h.tree).filter(n=>n.type==='article').map(n=>JSON.parse(n.props['data-task-key'])[1]),['confirm','run','block','done']);
 assert.match(text(h.tree),/1 待确认/);assert.match(text(h.tree),/External dependency/);assert.match(text(h.tree),/请在原对话确认/);
});

test('active progress uses occurrence time and carried test evidence retains its own report timestamp',async t=>{
 const old=sample('tested',{timestamp:'2026-10-08T11:00:00.000Z',reported_at:'2026-10-08T12:00:00.000Z',metrics:{tests:{passed:9,total:10,scope:'Scoped suite',source:'CI log'}}});
 const recent=sample('later',{timestamp:'2026-10-09T10:00:00.000Z',reported_at:'2026-10-09T11:00:00.000Z',stage:'Later review'});
 const ts=aggregateTasks([old,recent]);assert.equal(ts[0].metricsReportedAt,'2026-10-08T12:00:00.000Z');
 const h=harness(t);h.requests[0].resolve(page([old,recent]));await settle();h.render();
 const times=nodes(h.tree).filter(n=>n.type==='time');assert.equal(times[0].props.dateTime,recent.timestamp);
 assert.match(text(h.tree),/CI log · 10\/08 12:00 上报/);
 assert.doesNotMatch(text(h.tree),/暂无新上报|卡死|执行时长|tokens|成本/);
});

test('date and relative age formatting explicitly handle cross-day reports',()=>{
 const now=Date.parse('2026-10-10T04:00:00Z');
 assert.equal(reportStamp('2026-10-09T15:01:00Z',now),'10/09 15:01');
 assert.equal(reportStamp('2026-10-10T03:00:00Z',now),'03:00');
 assert.equal(reportAge('2026-10-10T03:00:00Z',now),'1小时前');
});

test('an incremental backlog is marked as catching up until the final page arrives',async t=>{
 const h=harness(t);h.requests[0].resolve(page([sample('first')],'one',{hasMore:true}));await settle();h.render();assert.match(text(h.tree),/正在补读事件/);
 h.nextPoll();h.requests.at(-1).resolve(page([sample('second')],'two'));await settle();h.render();assert.match(text(h.tree),/同步正常/);
});

test('duplicate blocker and next action render once with both meanings identified',async t=>{
 const h=harness(t);h.requests[0].resolve(page([sample('same',{status:'blocked',blocker:'Provide configuration',next:'Provide configuration'})]));await settle();h.render();
 assert.equal(text(h.tree).split('Provide configuration').length-1,1);assert.match(text(h.tree),/以上也是下一步/);
});


test('pause freezes content until explicit resume while polls continue',async t=>{
 const h=harness(t);h.requests[0].resolve(page([sample('initial',{stage:'Original stage'})]));await settle();h.render();h.click('暂停更新');
 h.nextPoll();h.requests.at(-1).resolve(page([sample('update',{stage:'Updated stage'})],'new'));await settle();h.render();
 assert.match(text(h.tree),/Original stage/);assert.doesNotMatch(text(h.tree),/Updated stage/);assert.match(text(h.tree),/非最新 · 1 条新上报/);
 h.click('恢复更新');assert.match(text(h.tree),/Updated stage/);assert.doesNotMatch(text(h.tree),/非最新/);
});
test('status updates do not reorder existing tasks and new tasks append',async t=>{
 const h=harness(t);h.requests[0].resolve(page([sample('first',{task:'one'}),sample('second',{task:'two',status:'completed'})]));await settle();h.render();
 h.nextPoll();h.requests.at(-1).resolve(page([sample('change',{task:'two',status:'needs_confirmation'}),sample('new',{task:'three',status:'blocked'})],'new'));await settle();h.render();
 assert.deepEqual(nodes(h.tree).filter(n=>n.type==='article').map(n=>JSON.parse(n.props['data-task-key'])[1]),['one','two','three']);
});
test('missing and invalid timestamps render honestly without crashing',async t=>{
 assert.equal(reportStamp('invalid',Date.now()),'时间未上报');assert.equal(reportAge('',Date.now()),'时间未知');
 const h=harness(t);h.requests[0].resolve(page([sample('missing',{timestamp:undefined,reported_at:undefined})]));await settle();h.render();assert.match(text(h.tree),/时间未上报/);
});
test('completed state has visible words and no invented test evidence',async t=>{
 const h=harness(t);h.requests[0].resolve(page([sample('done',{task:'done',status:'completed'}),sample('run',{task:'run'})]));await settle();h.render();
 const finished=nodes(h.tree).find(n=>n.type==='article'&&n.props.className.includes('completed'));assert.match(text(finished),/已完成/);assert.doesNotMatch(text(finished),/验证/);
});

test('pause notices a same-sized server reset and resumes replacement records',async t=>{
 const h=harness(t);h.requests[0].resolve(page([sample('old')]));await settle();h.render();h.click('暂停更新');
 h.nextPoll();h.requests.at(-1).resolve(page([sample('replacement',{stage:'Reset content'})],'reset',{reset:true}));await settle();h.render();assert.match(text(h.tree),/1 条新上报/);assert.doesNotMatch(text(h.tree),/Reset content/);
 h.click('恢复更新');assert.match(text(h.tree),/Reset content/);
});

test('sync metadata and feed errors live in top bar, with no duplicate footer',async t=>{
 const h=harness(t);h.requests[0].resolve(page([sample()],'one',{invalid:2}));await settle();h.render();
 const header=nodes(h.tree).find(n=>n.props?.className==='pg-header');
 assert.match(text(header),/同步正常/);assert.doesNotMatch(text(header),/上报时间均为 UTC|仅展示已上报进展/);assert.match(text(header),/2 条格式异常/);
 assert.equal(nodes(h.tree).filter(n=>n.type==='footer').length,0);
 h.nextPoll();h.requests.at(-1).reject(new Error('Temporary failure'));await settle();h.render();
 assert.match(text(nodes(h.tree).find(n=>n.props?.className==='pg-header')),/数据同步中断/);
 h.click('暂停更新');assert.match(text(nodes(h.tree).find(n=>n.props?.className==='pg-header')),/非最新/);
 h.click('恢复更新');assert.doesNotMatch(text(nodes(h.tree).find(n=>n.props?.className==='pg-header')),/非最新/);
});

test('each project has a focusable independent content scroller below its fixed heading',async t=>{
 const h=harness(t);h.requests[0].resolve(page([sample('a',{project:'DramaFlow A'}),sample('b',{project:'DramaFlow B',status:'blocked',blocker:'B dependency',next:'Resolve B'})]));await settle();h.render();
 const groups=nodes(h.tree).filter(n=>n.props?.['data-project-id']);assert.equal(groups.length,2);
 for(const group of groups){const body=nodes(group).find(n=>n.props?.className==='pg-project-body');assert.equal(body.props.tabIndex,0);assert.equal(body.props.role,'region');assert.match(body.props['aria-label'],/任务内容$/);assert.ok(nodes(body).some(n=>n.type==='article'));assert.ok(!nodes(body).some(n=>n.props?.className==='pg-project-header'));}
 assert.match(text(nodes(groups[1]).find(n=>n.props?.className==='pg-project-body')),/B dependency/);
 const {readFile}=await import('node:fs/promises');const css=await readFile('src/task-window.css','utf8');assert.match(css,/height:var\(--project-card-height\)/);assert.match(css,/overflow-y:auto/);assert.match(css,/overscroll-behavior-y:auto/);assert.doesNotMatch(css,/overscroll-behavior[^;}]*contain/);
});


test('project summary follows the displayed paused snapshot and resumes latest groups',async t=>{
 const h=harness(t);h.requests[0].resolve(page([sample('one',{project:'DramaFlow A'})]));await settle();h.render();h.click('暂停更新');
 h.nextPoll();h.requests.at(-1).resolve(page([sample('b',{project:'DramaFlow B',status:'completed'})],'new'));await settle();h.render();
 const summary=()=>text(nodes(h.tree).find(n=>n.props?.className==='pg-summary'));
 assert.match(summary(),/总共 1 组项目/);assert.match(summary(),/已完成 0 个/);
 h.click('恢复更新');assert.match(summary(),/总共 2 组项目/);assert.match(summary(),/已完成 1 个/);
});

test('launch evidence changes only for a new active task or a real lifecycle restart',()=>{
 const ev=(id,time,status,extra={})=>sample(id,{timestamp:time,reported_at:time,status,...extra});
 const first=ev('start','2026-10-10T01:00:00Z','queued',{kind:'request'});
 const run=ev('run','2026-10-10T02:00:00Z','running');
 const progress=ev('progress','2026-10-10T03:00:00Z','running');
 const finished=ev('finished','2026-10-10T04:00:00Z','completed');
 assert.equal(aggregateTasks([first,run,progress,progress,finished])[0].launchAt,first.timestamp);
 const blocked=ev('block','2026-10-10T05:00:00Z','blocked');
 const restart=ev('restart','2026-10-10T06:00:00Z','running');
 const reduced=aggregateTasks([first,run,finished,blocked,restart]);assert.equal(reduced[0].launchAt,restart.timestamp);
 assert.equal(aggregateTasks([first,run,finished,blocked,restart,first])[0].launchAt,restart.timestamp);
 const evidence=ev('test','2026-10-10T08:00:00Z','running',{kind:'test'});assert.equal(aggregateTasks([first,evidence])[0].launchAt,first.timestamp);
 const note=ev('note','bad','running',{kind:'note',reported_at:undefined});assert.equal(aggregateTasks([note])[0].launchAt,undefined);
 const invalid=ev('invalid','bad','running',{reported_at:undefined});assert.equal(aggregateTasks([invalid])[0].launchAt,undefined);assert.equal(aggregateTasks([invalid])[0].launchOrder,1);
});

test('project launch ordering freezes with pause and ignores ordinary progress or completion time',async t=>{
 const h=harness(t),names=()=>nodes(h.tree).filter(n=>n.props?.['data-project-id']).map(n=>n.props['data-project-id']);
 h.requests[0].resolve(page([sample('a',{project:'DramaFlow A',timestamp:'2026-10-10T01:00:00Z'}),sample('b',{project:'DramaFlow B',timestamp:'2026-10-10T02:00:00Z'})]));await settle();h.render();assert.deepEqual(names(),['dramaflow-b','dramaflow-a']);
 h.nextPoll();h.requests.at(-1).resolve(page([sample('a-progress',{project:'DramaFlow A',timestamp:'2026-10-10T03:00:00Z'})],'p'));await settle();h.render();assert.deepEqual(names(),['dramaflow-b','dramaflow-a']);
 h.click('暂停更新');h.nextPoll();h.requests.at(-1).resolve(page([sample('a-new',{project:'DramaFlow A',task:'new-task',timestamp:'2026-10-10T04:00:00Z'})],'new'));await settle();h.render();assert.deepEqual(names(),['dramaflow-b','dramaflow-a']);h.click('恢复更新');assert.deepEqual(names(),['dramaflow-a','dramaflow-b']);
});

test('project reorder restores each keyed scroll region from its own recorded position',async t=>{
 const h=harness(t);h.requests[0].resolve(page([sample('a',{project:'DramaFlow A',timestamp:'2026-10-10T02:00:00Z'}),sample('b',{project:'DramaFlow B',status:'blocked',timestamp:'2026-10-10T01:00:00Z'})]));await settle();h.render();
 const bodies=nodes(h.tree).filter(n=>n.props?.className==='pg-project-body');const a={isConnected:true,scrollTop:207},b={isConnected:true,scrollTop:88};
 bodies[0].props.ref(a);bodies[1].props.ref(b);bodies[0].props.onScroll({currentTarget:a});bodies[1].props.onScroll({currentTarget:b});a.scrollTop=0;b.scrollTop=0;
 h.nextPoll();h.requests.at(-1).resolve(page([sample('b-new',{project:'DramaFlow B',status:'running',timestamp:'2026-10-10T03:00:00Z'})],'new'));await settle();h.render();assert.equal(a.scrollTop,207);assert.equal(b.scrollTop,88);
});

test('network polls do not verify work, and the five-minute threshold stays neutral',async t=>{
 let now=Date.parse('2026-10-10T01:00:00Z')+299999;t.mock.method(Date,'now',()=>now);
 const h=harness(t),at='2026-10-10T01:00:00Z';h.requests[0].resolve(page([sample('start',{timestamp:at,reported_at:at,verification:{observed_at:at,evidence:'Actual result',scope:'task'}})]));await settle();h.render();
 assert.doesNotMatch(text(h.tree),/待核实/);now++;h.nextPoll();h.requests.at(-1).resolve(page([],'same'));await settle();h.render();
 assert.match(text(h.tree),/待核实/);assert.match(text(h.tree),/进行中/);assert.doesNotMatch(text(h.tree),/验证未通过/);
 assert.match(text(nodes(h.tree).find(n=>n.props?.className?.startsWith('pg-freshness'))),/进展 5分钟前 · 核实 5分钟前/);
});
test('pause freezes freshness ages and checkpoint resumes without progress or group movement',async t=>{
 let now=Date.parse('2026-10-10T01:04:00Z');t.mock.method(Date,'now',()=>now);const h=harness(t),at='2026-10-10T01:00:00Z';
 h.requests[0].resolve(page([sample('start',{timestamp:at,reported_at:at,stage:'Retained stage',done:'Retained result'}),sample('second',{project:'Other',timestamp:'2026-10-10T01:01:00Z'})]));await settle();h.render();
 const order=()=>nodes(h.tree).filter(n=>n.props?.['data-project-id']).map(n=>n.props['data-project-id']);const before=order();h.click('暂停更新');now+=120000;
 h.nextPoll();h.requests.at(-1).resolve(page([sample('check',{kind:'checkpoint',timestamp:new Date(now).toISOString(),reported_at:new Date(now).toISOString(),verification:{observed_at:new Date(now).toISOString(),evidence:'Inspected current output',scope:'task'}})],'checked'));await settle();h.render();
 assert.match(text(h.tree),/进展 4分钟前/);assert.match(text(h.tree),/1 条新上报/);assert.deepEqual(order(),before);
 h.click('恢复更新');assert.match(text(h.tree),/进展 6分钟前 · 核实 刚刚/);assert.match(text(h.tree),/Retained stage/);assert.match(text(h.tree),/Retained result/);assert.deepEqual(order(),before);
});
test('only active tasks get freshness; old verification cannot add an alive badge to completed work',async t=>{
 const h=harness(t);h.requests[0].resolve(page([sample('run'),sample('done',{task:'done',status:'completed'}),sample('late',{task:'done',kind:'checkpoint',verification:{observed_at:'2026-10-09T10:00:00Z',evidence:'Late process alive',scope:'process'}})]));await settle();h.render();
 assert.equal(nodes(h.tree).filter(n=>n.props?.className?.startsWith('pg-freshness')).length,1);
 const finished=nodes(h.tree).find(n=>n.type==='article'&&n.props.className.includes('completed'));assert.doesNotMatch(text(finished),/核实|进行中/);
});
