// SPDX-License-Identifier: AGPL-3.0-only
import {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import './task-window.css';
import ResourceMonitor from './ResourceMonitor';
import {normalizeProject,groupProjects,summarizeProjects} from './project-model';
import {aggregateTasks,taskFreshness} from '../lib/task-reporting.mjs';
import type {Status,TaskEvent} from '../lib/task-reporting.mjs';
export {aggregateTasks};
export type {Status,TaskEvent};
type EventPage={events:TaskEvent[];cursor:string;reset:boolean;hasMore:boolean;invalid:number;serverTime:string};
const labels:Record<Status,string>={queued:'等待执行',running:'进行中',passed:'已通过',failed:'验证未通过',blocked:'受阻',needs_confirmation:'需你确认',completed:'已完成',canceled:'已取消'};
export const displayText=(value:string)=>value.replace(/Dot Panel/g,'Dot Console');
const clock=(value:string)=>new Date(value).toISOString().slice(11,19);
export function reportStamp(value:string,now:number){if(!Number.isFinite(Date.parse(value)))return '时间未上报';const iso=new Date(value).toISOString();return `${iso.slice(0,10)===new Date(now).toISOString().slice(0,10)?'':iso.slice(5,10).replace('-','/')+' '}${iso.slice(11,16)}`;}
export function reportAge(value:string,now:number){if(!Number.isFinite(Date.parse(value)))return '时间未知';const n=Math.max(0,Math.floor((now-Date.parse(value))/60000));return n<1?'刚刚':n<60?`${n}分钟前`:n<1440?`${Math.floor(n/60)}小时前`:`${Math.floor(n/1440)}天前`;}
export function distinctText(values:(string|undefined|null)[],exclude:(string|undefined|null)[]=[]){const key=(s:string)=>displayText(s).trim().replace(/\s+/g,' ');const seen=new Set(exclude.filter((s):s is string=>!!s).map(key));return values.filter((s):s is string=>{if(!s?.trim()||seen.has(key(s)))return false;seen.add(key(s));return true;}).map(displayText);}
export function taskPriority(task:{status:Status;blocker?:string|null}){return task.status==='needs_confirmation'?0:task.status==='running'?1:task.blocker||task.status==='blocked'||task.status==='failed'?2:task.status==='queued'?3:5;}
const iconPaths:Record<Status,string>={running:'M8 5l6 5-6 5z',queued:'M6 5v10M14 5v10',blocked:'M5 5l10 10M15 5L5 15',needs_confirmation:'M10 5v6M10 14v1',completed:'M5 10l3 3 7-7',canceled:'M5 10h10',passed:'M5 10l3 3 7-7',failed:'M5 5l10 10M15 5L5 15'};
function StatusIcon({status}:{status:Status}){return <svg className="pg-status-icon" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9"/><path d={iconPaths[status]}/></svg>;}
export default function TaskWindow(){
 const [events,setEvents]=useState<TaskEvent[]>([]),[connection,setConnection]=useState<'connecting'|'catching-up'|'live'|'offline'>('connecting'),[lastChecked,setLastChecked]=useState(''),[error,setError]=useState(''),[invalid,setInvalid]=useState(0),[name,setName]=useState('好大的小西瓜'),[now,setNow]=useState(Date.now());
 const cursor=useRef('');
 const ranks=useRef(new Map<string,number>());
 const visibleEvents=events;
 const displayNow=now;
 useEffect(()=>{const controller=new AbortController();fetch('/api/state',{signal:controller.signal,cache:'no-store'}).then(r=>r.ok?r.json() as Promise<{dot_display_name?:string}>:null).then(s=>{if(s?.dot_display_name)setName(s.dot_display_name);}).catch(()=>{});return()=>controller.abort();},[]);
 useEffect(()=>{
   const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;let failures=0;
   const poll=async()=>{let delay=2500;
    try{const response=await fetch(`/api/task-events${cursor.current?'?cursor='+encodeURIComponent(cursor.current):''}`,{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)])});
     if(!response.ok)throw new Error(`事件连接暂不可用（${response.status}）`);
     const page=await response.json() as EventPage;if(!Array.isArray(page.events)||typeof page.cursor!=='string')throw new Error('事件响应格式不正确');if(controller.signal.aborted)return;
     setEvents(previous=>{const merged=page.reset?[]:[...previous],seen=new Set(merged.map(e=>e.id));for(const event of page.events)if(!seen.has(event.id)){seen.add(event.id);merged.push(event);}return merged;});
     cursor.current=page.cursor;setInvalid(page.invalid);setConnection(page.hasMore?'catching-up':'live');setLastChecked(new Date().toISOString());setNow(Date.now());setError('');failures=0;if(page.hasMore)delay=25;
    }catch(e){if(controller.signal.aborted)return;setNow(Date.now());setConnection('offline');setError(e instanceof Error?e.message:'连接中断');failures++;delay=Math.min(15000,2500*failures);}
    if(!controller.signal.aborted)timer=setTimeout(poll,delay);
   };void poll();return()=>{controller.abort();clearTimeout(timer);};
 },[]);
 const tasks=useMemo(()=>aggregateTasks(visibleEvents),[visibleEvents]);
 for(const task of [...tasks].sort((a,b)=>taskPriority(a)-taskPriority(b)))if(!ranks.current.has(task.key))ranks.current.set(task.key,ranks.current.size);
 const projects=useMemo(()=>groupProjects(tasks),[tasks]);
 const projectSummary=summarizeProjects(projects);
 const scrollPositions=useRef(new Map<string,number>()),scrollNodes=useRef(new Map<string,HTMLDivElement>());
 const projectOrder=JSON.stringify(projects.map(project=>project.id));
 useLayoutEffect(()=>{for(const [id,node] of scrollNodes.current){if(node.isConnected)node.scrollTop=scrollPositions.current.get(id)??0;}},[projectOrder]);
 const taskNames:Record<string,string>={'dramaflow-a/apigc-model-sync-audit':'A版审核与分支整理（历史综合任务）','cutscene-daily/company-assets':'公司边界适配','dot-console/live-window':'进度窗口','dot-console/passive-board':'紧凑布局','dot-console/project-grouping':'项目分组','dot-console/portrait-project-layout':'竖版项目卡布局','dot-console/reading-polish':'阅读体验精修','dot-console/startup-defaults':'启动与桌面默认设置'};
 const label=(task:typeof tasks[number])=>taskNames[normalizeProject(task.project).id+'/'+task.last.task]??displayText(task.title);
 const taskRow=(task:typeof tasks[number],compact=false)=>{
  const finished=['completed','canceled'].includes(task.status),blocked=!!task.blocker||['blocked','needs_confirmation','failed'].includes(task.status),brief=compact&&finished;
  const name=label(task),stage=displayText(task.stage??task.title),reported=task.last.reported_at??task.last.timestamp;
  const results=distinctText([task.stage,task.done],[name]);
  const next=distinctText([task.next],[task.blocker])[0];
  const done=distinctText([task.done],[task.next,task.blocker])[0];
  const freshness=taskFreshness(task,displayNow), verified=task.lastVerifiedAt, progress=task.lastProgressAt;
  const verificationLabel=verified?`${task.lastVerification?.scope==='process'?'进程核实':'核实'} ${reportAge(verified,displayNow)}`:'核实未记录';
  const freshnessTitle=`进展发生：${progress??'未知'}；最近上报：${reported??'未知'}；核实证据：${task.lastVerification?.evidence??'尚无明确核实记录'}。活跃任务以 5 分钟为核实目标；待核实不代表失败。`;
  return <article className={`pg-task ${task.status} ${brief?'pg-compact':''}`} key={task.key} data-task-key={task.key}>
   <div className="pg-task-heading">{(!brief&&name===stage)?null:<h3>{name}</h3>}{brief?<span className={`pg-terminal ${task.status}`} aria-label={labels[task.status]}><StatusIcon status={task.status}/>{labels[task.status]}</span>:<span className={`pg-badge ${task.status}`}><StatusIcon status={task.status}/>{labels[task.status]}</span>}</div>
   {!brief&&<p className="pg-stage">{stage}</p>}

   {!brief&&<div className="pg-facts">{next&&!blocked&&<div className="pg-next"><span>{task.done&&distinctText([task.done],[task.next]).length===0?'最近结果 / ':''}{finished?'后续':'下一步'}</span><p>{next}</p></div>}{done&&<div className="pg-done"><span>最近结果</span><p>{done}</p></div>}</div>}
   {brief&&results.length>0&&<div className="pg-result">{results.map((result,i)=><p key={i}>{result}</p>)}</div>}
   {task.metrics?.tests&&<div className="pg-metric"><span>验证 <b>{task.metrics.tests.passed} / {task.metrics.tests.total}</b> · {displayText(task.metrics.tests.scope)}</span><small>{displayText(task.metrics.tests.source)} · {reportStamp(task.metricsReportedAt??reported,displayNow)} 上报</small></div>}
   {freshness.active?<div className={`pg-freshness ${freshness.due?'pg-verification-due':''}`} title={freshnessTitle}><time dateTime={progress} className="pg-report">进展 {progress?reportAge(progress,displayNow):'时间未上报'}</time><span> · {freshness.clockSkew?'时间待校准':verificationLabel}{freshness.due?' · 待核实':''}</span></div>:<time dateTime={reported} className="pg-report">上报 {reportStamp(reported,displayNow)}{!finished&&<span> · {reportAge(reported,displayNow)}</span>}</time>}
  </article>;
 };
 return <main className="pg-shell">
  <header className="pg-header"><div className="pg-identity"><img src="/brand/favicon.svg" width="29" height="29" alt=""/><h1>Dot Console</h1><span>{name}</span></div><div className="pg-sync-header" aria-label="同步信息">{error&&<span role="status" className="pg-sync-warning">数据同步中断 · 保留最后记录，正在重连</span>}{invalid>0&&<span role="status" className="pg-sync-warning">{invalid} 条格式异常记录未展示</span>}<span className={`pg-connection ${connection}`}><i/>{connection==='live'?'同步正常':connection==='catching-up'?'正在补读事件':connection==='connecting'?'正在连接':'连接中断'}{lastChecked?` · ${clock(lastChecked)} UTC`:''}</span></div><ResourceMonitor/><div className="pg-summary" aria-label="项目总览"><strong>总共 {projectSummary.total} 组项目</strong><span>进行中 <b>{projectSummary.running}</b> 个</span><span>暂停等待 <b>{projectSummary.waiting}</b> 个</span><span>已完成 <b>{projectSummary.completed}</b> 个</span></div></header>
  <section className="pg-projects" aria-label="按项目组织的任务">
   {projects.map(project=>{const hasRunning=project.counts.running>0;return <section className={`pg-project ${hasRunning?'pg-running':''}`} key={project.id} data-project-id={project.id} aria-label={project.name}>
    <header className="pg-project-header"><div><h2>{project.name}</h2>{project.repo&&<p className="pg-repo">{project.repo}</p>}</div><div className="pg-project-counts"><span>{project.counts.total} 项任务</span>{project.tasks.some(t=>t.blocker||['blocked','needs_confirmation','failed'].includes(t.status))&&<span className="pg-attention-count">{project.tasks.filter(t=>t.blocker||['blocked','needs_confirmation','failed'].includes(t.status)).length} 关注项</span>}{project.counts.running>0&&<b className="pg-running-label"><StatusIcon status="running"/>{project.counts.running} 进行中</b>}{project.counts.blocked>0&&<b className="pg-waiting-label"><StatusIcon status="blocked"/>{project.counts.blocked} 受阻</b>}{project.counts.needsConfirmation>0&&<b className="pg-waiting-label"><StatusIcon status="needs_confirmation"/>{project.counts.needsConfirmation} 待确认</b>}{project.counts.waiting-project.counts.blocked-project.counts.needsConfirmation>0&&<span>{project.counts.waiting-project.counts.blocked-project.counts.needsConfirmation} 排队</span>}{project.counts.completed>0&&<span>{project.counts.completed} 已完成</span>}{project.counts.canceled>0&&<span>{project.counts.canceled} 已取消</span>}{project.counts.other>0&&<span>{project.counts.other} 其他状态</span>}</div></header>
    <div className="pg-project-body" ref={node=>{if(node)scrollNodes.current.set(project.id,node);else scrollNodes.current.delete(project.id);}} onScroll={event=>scrollPositions.current.set(project.id,event.currentTarget.scrollTop)} tabIndex={0} role="region" aria-label={`${project.name}任务内容`}>
    <div className="pg-attention" aria-label="组内关注事项">{project.tasks.filter(t=>!!t.blocker||['blocked','needs_confirmation','failed'].includes(t.status)).map(t=><div className="pg-blocker" key={t.key}><span><StatusIcon status={t.status==='needs_confirmation'?'needs_confirmation':'blocked'}/>{t.status==='needs_confirmation'?'需要你确认':t.status==='failed'?'验证未通过':t.status==='running'?'外部依赖':'受阻'} · {label(t)}</span><p>{displayText(t.blocker??(t.status==='needs_confirmation'?'具体确认事项未单独上报':t.status==='failed'?'失败原因未单独上报':'具体阻塞尚未单独上报'))}</p>{distinctText([t.next],[t.blocker]).map(n=><p className="pg-attention-next" key={n}>下一步：{n}</p>)}{t.next&&distinctText([t.next],[t.blocker]).length===0&&<small>以上也是下一步</small>}{t.status==='needs_confirmation'&&<small>请在原对话确认</small>}</div>)}</div>
    <div className="pg-task-list">{[...project.tasks].sort((a,b)=>(ranks.current.get(a.key)??0)-(ranks.current.get(b.key)??0)).map(t=>taskRow(t,project.tasks.length>1))}</div>
    </div>
   </section>;})}
   {!projects.length&&<div className="pg-empty"><h2>{connection==='connecting'?'正在读取项目':'当前空闲'}</h2><p>收到真实项目任务后自动显示，无需操作。</p></div>}
  </section>

 </main>;
}
