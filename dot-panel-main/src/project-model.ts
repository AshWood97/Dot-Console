// SPDX-License-Identifier: AGPL-3.0-only
// Explicit project identity only: titles, stages and message text are not inputs.
export type ProjectIdentity = {id:string;name:string;repo?:string;known:boolean};
import {registry,normalizeProject} from '../lib/project-identity.mjs';
export {normalizeProject};

export type ProjectCounts = {
  running:number;waiting:number;blocked:number;needsConfirmation:number;
  completed:number;canceled:number;other:number;total:number;
};
export type ProjectTask = {project:string;status:string;blocker?:string|null;launchAt?:string;launchOrder?:number};
export type ProjectGroup<T extends ProjectTask> = ProjectIdentity & {tasks:T[];counts:ProjectCounts};

// Input tasks have already been reduced by canonical project ID + task ID.
// Preserve every task, including completed siblings of active work. This is not
// an event reducer, and neither phases nor a task's evidence are extra tasks.
export function groupProjects<T extends ProjectTask>(tasks:readonly T[]):ProjectGroup<T>[] {
  const groups=new Map<string,ProjectGroup<T>>();
  for(const task of tasks){
    const identity=normalizeProject(task.project);
    let group=groups.get(identity.id);
    if(!group){
      group={...identity,tasks:[],counts:{running:0,waiting:0,blocked:0,needsConfirmation:0,completed:0,canceled:0,other:0,total:0}};
      groups.set(identity.id,group);
    }
    group.tasks.push(task);
    const counts=group.counts;counts.total++;
    switch(task.status){
      case 'running':counts.running++;break;
      case 'queued':counts.waiting++;break;
      case 'blocked':counts.blocked++;counts.waiting++;break;
      case 'needs_confirmation':counts.needsConfirmation++;counts.waiting++;break;
      case 'completed':counts.completed++;break;
      case 'canceled':counts.canceled++;break;
      default:counts.other++;break;
    }
  }
  const order=new Map(registry.map((project,index)=>[project.id,project.id==='dramaflow-b'?registry.length+1:index]));
  // Newly registered B follows the pre-existing known and legacy project groups.
  const complete=(group:ProjectGroup<T>)=>group.tasks.length>0&&group.tasks.every(task=>task.status==='completed'&&!task.blocker);
  const launch=(group:ProjectGroup<T>)=>group.tasks.reduce((latest,task)=>{const parsed=Date.parse(task.launchAt??'');const time=Number.isFinite(parsed)?parsed:-Infinity;const ordinal=task.launchOrder??-1;return time>latest.time||(time===latest.time&&ordinal>latest.ordinal)?{time,ordinal}:latest;},{time:-Infinity,ordinal:-1});
  // Only lifecycle launch evidence affects recency. Missing dates follow dated
  // launches, ordered by their deduplicated append ordinal; wholly unobserved
  // launches retain the established registry/first-observed fallback.
  return [...groups.values()].sort((a,b)=>{
    if(complete(a)!==complete(b))return complete(a)?1:-1;
    const left=launch(a),right=launch(b);
    if(left.time!==right.time)return right.time-left.time;
    if(left.ordinal!==right.ordinal)return right.ordinal-left.ordinal;
    return (order.get(a.id)??registry.length)-(order.get(b.id)??registry.length);
  });
}

// These are mutually exclusive project buckets, not task totals or successful-run claims.
// Running/queued takes precedence; unresolved flags and any non-completed lifecycle
// (including canceled, failed, passed or unknown) wait. Empty input has zero projects;
// an explicitly supplied empty group waits because no completion evidence exists.
export function summarizeProjects(groups:readonly {tasks:readonly {status:string;blocker?:string|null}[]}[]) {
  const result={total:groups.length,running:0,waiting:0,completed:0};
  for(const group of groups){
    if(group.tasks.some(task=>task.status==='running'||task.status==='queued'))result.running++;
    else if(group.tasks.length>0&&group.tasks.every(task=>task.status==='completed'&&!task.blocker))result.completed++;
    else result.waiting++;
  }
  return result;
}
