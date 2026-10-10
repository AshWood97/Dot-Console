// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, appendFile, rm, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {appendEvent, eventPage, readEvents, validateEvent} from '../../local/events.mjs';

const sample = (id = 'one', extra = {}) => ({id, project:'Review', task:'Task', title:'Progress', message:'A status update', kind:'status', status:'running', source:'tool', timestamp:'2026-10-09T10:00:00.000Z', reported_at:'2026-10-09T10:00:01.000Z', ...extra});
const lines = events => events.map(e => JSON.stringify(e)+'\n').join('');
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'dot-events-review-'));
  t.after(() => rm(directory, {recursive:true, force:true}));
  return join(directory, 'events.jsonl');
}

test('event validation rejects invalid fields and strips unknown data', () => {
  for (const patch of [{id:''}, {kind:'untrusted'}, {status:'unknown'}, {source:'session'}, {timestamp:'today'}, {reported_at:'2026-10-09T10:00:00'}, {message:'a'.repeat(12001)}]) assert.throws(() => validateEvent(sample('one',patch)));
  assert.equal(validateEvent(sample('one',{timestamp:'2026-10-09T12:00:00+02:00'})).timestamp, '2026-10-09T10:00:00.000Z');
  assert.equal(validateEvent(sample('one',{secret:'remove-me'})).secret, undefined);
});

test('missing files produce an empty, valid feed', async t => {
  const snapshot = await readEvents(await fixture(t));
  assert.deepEqual(snapshot, {events:[], epoch:'empty', invalid:0});
  assert.equal(eventPage(snapshot).cursor, 'empty:0:none');
});

test('reader ignores incomplete tails, skips invalid lines, and keeps first event per ID', async t => {
  const file = await fixture(t);
  const tail = JSON.stringify(sample('three'));
  await writeFile(file, lines([sample('one'), sample('one',{message:'Duplicate'})])+'not JSON\n'+lines([sample('two')])+tail.slice(0,20));
  let snapshot = await readEvents(file);
  assert.deepEqual(snapshot.events.map(e => e.id), ['one','two']);
  assert.equal(snapshot.events[0].message, 'A status update');
  assert.equal(snapshot.invalid,1);
  await appendFile(file, tail.slice(20)+'\n');
  snapshot = await readEvents(file);
  assert.deepEqual(snapshot.events.map(e=>e.id), ['one','two','three']);
});

test('cursor pages all events once, sees later appends, and has a stable idle cursor', async t => {
  const file = await fixture(t);
  await writeFile(file, lines(Array.from({length:505},(_,i)=>sample(`id-${i}`))));
  const snapshot = await readEvents(file);
  const first = eventPage(snapshot);
  const second = eventPage(snapshot,first.cursor);
  const third = eventPage(snapshot,second.cursor);
  assert.deepEqual([first.events.length,second.events.length,third.events.length],[250,250,5]);
  assert.deepEqual([first.hasMore,second.hasMore,third.hasMore],[true,true,false]);
  assert.equal(new Set([...first.events,...second.events,...third.events].map(e=>e.id)).size,505);
  assert.deepEqual(eventPage(snapshot,third.cursor).events,[]);
  assert.equal(eventPage(snapshot,third.cursor).cursor,third.cursor);
  await appendFile(file,lines([sample('later')]));
  const next = eventPage(await readEvents(file),third.cursor);
  assert.equal(next.reset,false);
  assert.deepEqual(next.events.map(e=>e.id),['later']);
});

test('invalid cursors, truncation, and file replacement signal reset', async t => {
  const file = await fixture(t);
  const original = [sample('one'),sample('two'),sample('three')];
  await writeFile(file,lines(original));
  const snapshot = await readEvents(file);
  const cursor = eventPage(snapshot).cursor;
  for (const invalid of ['bad', `${snapshot.epoch}:999:none`, `${snapshot.epoch}:9007199254740992:none`]) assert.equal(eventPage(snapshot,invalid).reset,true);
  await writeFile(file,lines(original.slice(0,2)));
  assert.equal(eventPage(await readEvents(file),cursor).reset,true);
  await writeFile(file,lines([sample('replacement'),sample('two'),sample('three')]));
  assert.equal(eventPage(await readEvents(file),cursor).reset,true);
  await writeFile(file,'');
  assert.equal(eventPage(await readEvents(file),cursor).reset,true);
});

test('rewriting an already consumed middle event signals reset', async t => {
  const file = await fixture(t);
  await writeFile(file,lines([sample('one'),sample('two'),sample('three')]));
  const cursor = eventPage(await readEvents(file)).cursor;
  await writeFile(file,lines([sample('one'),sample('two',{message:'Corrected status'}),sample('three')]));
  const page = eventPage(await readEvents(file),cursor);
  assert.equal(page.reset,true,'A changed consumed prefix must invalidate the cursor');
  assert.equal(page.events[1].message,'Corrected status');
});

test('append is idempotent for an existing ID and leaves the original record intact', async t => {
  const file = await fixture(t);
  const first = await appendEvent(sample(),file);
  const second = await appendEvent(sample('one',{message:'Replacement'}),file);
  assert.equal(first.duplicate,false);
  assert.equal(second.duplicate,true);
  assert.equal(second.event.message,'A status update');
  assert.equal((await readFile(file,'utf8')).trim().split('\n').length,1);
});

test('a new append after an interrupted partial write remains readable', async t => {
  const file = await fixture(t);
  await writeFile(file,lines([sample('one')])+'{"id":"interrupted');
  const result = await appendEvent(sample('two'),file);
  assert.equal(result.duplicate,false);
  const snapshot = await readEvents(file);
  assert.deepEqual(snapshot.events.map(e=>e.id),['one','two'],'The successful new append must not become part of the corrupt tail');
});

test('concurrent same-ID appends are delivered only once to feed readers', async t => {
  const file = await fixture(t);
  await Promise.all(Array.from({length:8},()=>appendEvent(sample(),file)));
  assert.equal((await readEvents(file)).events.length,1);
});


test('structured fields and scoped metrics round trip with strict validation',()=>{
 const e=validateEvent(sample('one',{stage:'Audit',done:'Build passed',next:'QA',blocker:null,summary:'Layout refreshed',metrics:{tests:{passed:3,total:4,scope:'Local UI suite',source:'node test'}}}));
 assert.equal(e.stage,'Audit');assert.equal(e.blocker,null);assert.equal(e.metrics.tests.total,4);
 for (const extra of [{stage:'x'.repeat(141)},{blocker:0},{metrics:{tests:{passed:5,total:4,scope:'x',source:'x'}}},{metrics:{tests:{passed:1,total:2,scope:'x'}}},{metrics:null},{started_at:'yesterday'}]) assert.throws(()=>validateEvent(sample('bad',extra)));
 assert.deepEqual(validateEvent(sample('tokens',{metrics:{tokens_per_second:999}})).metrics,{});
});
