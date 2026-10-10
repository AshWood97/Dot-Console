// SPDX-License-Identifier: AGPL-3.0-only
// Shared read model: CLI and UI use the same aliases, lifecycle and clocks.
import {normalizeProject} from './project-identity.mjs';
export const VERIFY_AFTER_MS = 5 * 60 * 1000;
export const REPORT_WITHIN_MS = 60 * 1000;
const valid = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const newer = (old, value) => valid(value) && (!valid(old) || Date.parse(value) >= Date.parse(old));
const taskKey = event => JSON.stringify([normalizeProject(event.project).id,event.task]);
export function aggregateTasks(events) {
  const items = new Map(), seen = new Set();
  for (const e of events) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    const key = taskKey(e), old = items.get(key);
    // A checkpoint is never a task launch, lifecycle update, progress report or
    // correction. Orphans and checkpoints after terminal events cannot revive work.
    if (e.kind === 'checkpoint') {
      if (!old || !old.hasLifecycle || ['completed','canceled'].includes(old.status)) continue;
      if (e.verification && (!valid(old.launchAt)||Date.parse(e.verification.observed_at)>=Date.parse(old.launchAt)) && newer(old.lastVerifiedAt,e.verification.observed_at)) {
        items.set(key,{...old,lastVerifiedAt:e.verification.observed_at,lastVerification:e.verification});
      }
      continue;
    }
    const item = {...old,key,project:e.project,title:old&&e.kind==='tool'&&e.verification?.scope==='process'?old.title:e.title,status:old?.status??'queued',first:old?.first??e.timestamp,last:e};
    if (e.kind === 'status' || e.kind === 'confirmation' || (e.kind === 'request' && ['queued','running'].includes(e.status))) {
      item.status=e.status;item.hasLifecycle=true;
      if (['queued','running'].includes(e.status) && (!old?.hasLifecycle || !['queued','running'].includes(old.status))) {
        item.launchAt=[e.timestamp,e.reported_at].find(valid);item.launchOrder=seen.size;
        // A restarted task must be checked again; an old run's verification is
        // not evidence that this run is alive.
        item.lastVerifiedAt=undefined;item.lastVerification=undefined;
      }
    }
    for (const field of ['stage','done','next','blocker','summary','started_at','metrics']) {
      if (Object.hasOwn(e,field)) item[field]=e[field];
    }
    if (Object.hasOwn(e,'metrics')) item.metricsReportedAt=e.reported_at??e.timestamp;
    if (newer(old?.lastProgressAt,e.timestamp)) item.lastProgressAt=e.timestamp;
    if (e.verification && newer(item.lastVerifiedAt,e.verification.observed_at)) {
      item.lastVerifiedAt=e.verification.observed_at;item.lastVerification=e.verification;
    }
    items.set(key,item);
  }
  return [...items.values()];
}
export function taskFreshness(task, now=Date.now()) {
  const active=!!task.hasLifecycle && ['running','queued'].includes(task.status);
  const basis=valid(task.lastVerifiedAt)?task.lastVerifiedAt:valid(task.lastProgressAt)?task.lastProgressAt:undefined;
  const unknown=!valid(task.lastVerifiedAt), ageMs=basis?now-Date.parse(basis):undefined;
  const clockSkew=ageMs!==undefined && ageMs<0;
  return {active,due:active&&(ageMs===undefined||clockSkew||ageMs>=VERIFY_AFTER_MS),unknown,clockSkew,basis,ageMs};
}
