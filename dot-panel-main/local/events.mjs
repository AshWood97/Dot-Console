// SPDX-License-Identifier: AGPL-3.0-only
// Explicit, curated progress reports only. No session/log scraping.
import {mkdir, open} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
export const DEFAULT_FILE = resolve(import.meta.dirname, '../../task-events.jsonl');
export const KINDS = ['request','status','tool','test','note','confirmation','checkpoint'];
export const MAX_EVENT_BYTES = 16*1024*1024;
export const STATUSES = ['queued','running','passed','failed','blocked','needs_confirmation','completed','canceled'];
export function validateEvent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected event object');
  const out = {};
  for (const [key, max] of Object.entries({id:160,project:100,task:160,title:180,message:12000})) {
    if (typeof value[key] !== 'string' || !value[key].trim() || value[key].length > max) throw new Error(`Invalid ${key}`);
    out[key] = value[key];
  }
  if (!KINDS.includes(value.kind)) throw new Error('Invalid kind');
  if (!STATUSES.includes(value.status)) throw new Error('Invalid status');
  if (!['tool','manual'].includes(value.source)) throw new Error('Invalid source');
  for (const key of ['timestamp','reported_at']) {
    if (typeof value[key] !== 'string' || !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value[key]) || !Number.isFinite(Date.parse(value[key]))) throw new Error(`Invalid ${key}`);
    out[key] = new Date(value[key]).toISOString();
  }
  for (const field of ['stage','done','next','summary']) {
    if (value[field] !== undefined) {
      if (typeof value[field] !== 'string' || !value[field].trim() || value[field].length > 140) throw new Error(`Invalid ${field}`);
      out[field] = value[field];
    }
  }
  if (value.blocker !== undefined) {
    if (value.blocker !== null && (typeof value.blocker !== 'string' || !value.blocker.trim() || value.blocker.length > 140)) throw new Error('Invalid blocker');
    out.blocker = value.blocker;
  }
  if (value.started_at !== undefined) {
    if (typeof value.started_at !== 'string' || !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value.started_at) || !Number.isFinite(Date.parse(value.started_at))) throw new Error('Invalid started_at');
    out.started_at = new Date(value.started_at).toISOString();
  }
  if (value.metrics !== undefined) {
    if (!value.metrics || typeof value.metrics !== 'object' || Array.isArray(value.metrics)) throw new Error('Invalid metrics');
    out.metrics = {};
    if (value.metrics.tests !== undefined) {
      const t = value.metrics.tests;
      if (!t || !Number.isSafeInteger(t.passed) || !Number.isSafeInteger(t.total) || t.passed < 0 || t.total < t.passed || t.total < 1 || typeof t.scope !== 'string' || !t.scope.trim() || t.scope.length > 100 || typeof t.source !== 'string' || !t.source.trim() || t.source.length > 200) throw new Error('Invalid tests metric');
      out.metrics.tests = {passed:t.passed,total:t.total,scope:t.scope,source:t.source};
    }
  }
  if (value.verification !== undefined) {
    const v=value.verification;
    if (!v || typeof v !== 'object' || !['task','process'].includes(v.scope) || typeof v.evidence !== 'string' || !v.evidence.trim() || v.evidence.length>500 || typeof v.observed_at !== 'string' || !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(v.observed_at) || !Number.isFinite(Date.parse(v.observed_at)) || Date.parse(v.observed_at)>Date.parse(out.reported_at)) throw new Error('Invalid verification');
    out.verification={observed_at:new Date(v.observed_at).toISOString(),evidence:v.evidence,scope:v.scope};
  }
  if (value.kind === 'checkpoint') {
    if (!out.verification) throw new Error('Checkpoint requires verified evidence');
    for (const field of ['stage','done','next','blocker','summary','started_at','metrics']) if (Object.hasOwn(value,field)) throw new Error(`Checkpoint cannot change ${field}`);
  }
  return {...out,kind:value.kind,status:value.status,source:value.source};
}
export async function readEvents(file = DEFAULT_FILE) {
  let text;
  try {const h = await open(file, 'r'); try {const stat = await h.stat(); if (stat.size > MAX_EVENT_BYTES) throw new Error('Event file exceeds 16 MiB; archive explicitly before continuing'); const chunks=[]; let size=0; while(true) {const buffer=Buffer.alloc(Math.min(65536,MAX_EVENT_BYTES+1-size)); const {bytesRead}=await h.read(buffer,0,buffer.length,null); if(!bytesRead)break; size+=bytesRead; if(size>MAX_EVENT_BYTES)throw new Error('Event file exceeds 16 MiB; archive explicitly before continuing');chunks.push(buffer.subarray(0,bytesRead));}text=Buffer.concat(chunks).toString('utf8');} finally {await h.close();}}
  catch (e) {if(e.code === 'ENOENT') return {events:[],epoch:'empty',invalid:0}; throw e;}
  const seen = new Set(), events = []; let invalid = 0;
  // A concurrent append may leave a partial tail. Read it on the next poll.
  for (const line of text.slice(0, text.lastIndexOf('\n') + 1).split('\n')) {
    if (!line.trim()) continue;
    try {const event = validateEvent(JSON.parse(line)); if (!seen.has(event.id)) {seen.add(event.id); events.push(event);}} catch {invalid++;}
  }
  const epoch = events.length ? createHash('sha256').update(JSON.stringify(events[0])).digest('hex').slice(0,16) : 'empty';
  return {events,epoch,invalid};
}
export function eventPage(snapshot, cursor) {
  const {events,epoch,invalid} = snapshot;
  let offset = 0, reset = false;
  if (cursor) {
    const match = /^([a-f0-9]{16}|empty):(\d+):([a-f0-9]{16}|none)$/.exec(cursor);
    const n = match ? Number(match[2]) : -1;
    const anchor = n > 0 && n <= events.length ? prefixFingerprint(events,n) : 'none';
    if (match && match[1] === epoch && Number.isSafeInteger(n) && n >= 0 && n <= events.length && match[3] === anchor) offset = n;
    else reset = true;
  }
  const page = events.slice(offset, offset + 250), next = offset + page.length;
  return {events:page,cursor:`${epoch}:${next}:${next ? prefixFingerprint(events,next) : 'none'}`,reset,hasMore:next<events.length,invalid,serverTime:new Date().toISOString(),source:'Curated tool/manual reports; not automatic full-task listening'};
}
function prefixFingerprint(events, count) {const hash=createHash('sha256'); for(const event of events.slice(0,count)) hash.update(JSON.stringify(event)+'\n'); return hash.digest('hex').slice(0,16);}
export async function appendEvent(value, file = DEFAULT_FILE) {
  const now = new Date().toISOString();
  const event = validateEvent({id:randomUUID(),kind:'note',status:'running',source:'manual',timestamp:now,reported_at:now,...value});
  const existing = (await readEvents(file)).events.find(e => e.id === event.id);
  if (existing) return {event:existing,duplicate:true};
  await mkdir(dirname(file), {recursive:true});
  const handle = await open(file, 'a', 0o600);
  try {const line='\n'+JSON.stringify(event)+'\n';if((await handle.stat()).size+Buffer.byteLength(line)>MAX_EVENT_BYTES)throw new Error('Event file exceeds 16 MiB; archive explicitly before continuing');await handle.write(line);} finally {await handle.close();}
  return {event,duplicate:false};
}
