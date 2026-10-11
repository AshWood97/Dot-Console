// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {resolve} from 'node:path';
const compiled=await build({entryPoints:[resolve('src/ResourceMonitor.tsx')],bundle:true,write:false,platform:'node',format:'esm',jsx:'automatic',plugins:[{name:'hooks',setup(build){build.onResolve({filter:/^react$/},args=>args.importer.endsWith('/src/ResourceMonitor.tsx')?{path:resolve('tests/local/ui-hooks.mjs')}:undefined);}}]});
const {default:ResourceMonitor,resourceText}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const at=Date.parse('2026-10-11T11:00:00Z');
const sample=()=>({sampledAt:new Date(at).toISOString(),memory:{usedBytes:2**30,totalBytes:2**31,scope:'cgroup'},disk:{usedBytes:2**31,totalBytes:2**33,scope:'filesystem'},cpu:{percent:12.5,scope:'cgroup'}});
const settle=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
function harness(t){
 const h={index:0,slots:[],pending:[],requests:[],timers:new Map(),next:1};globalThis[Symbol.for('dot-panel.review-hooks')]=h;
 t.mock.method(Date,'now',()=>at);
 t.mock.method(globalThis,'fetch',(url,options)=>new Promise((resolve,reject)=>h.requests.push({url,options,resolve:(value,ok=true)=>resolve({ok,json:async()=>value}),reject})));
 t.mock.method(globalThis,'setTimeout',(fn,ms)=>{const id=h.next++;h.timers.set(id,{fn,ms});return id;});
 t.mock.method(globalThis,'clearTimeout',id=>h.timers.delete(id));
 h.render=()=>{h.index=0;h.tree=ResourceMonitor();for(const effect of h.pending.splice(0))effect();};
 h.run=ms=>{const timer=[...h.timers].find(([,v])=>v.ms===ms);assert.ok(timer);h.timers.delete(timer[0]);timer[1].fn();};
 h.unmount=()=>{for(const slot of h.slots)slot?.cleanup?.();};
 t.after(()=>{h.unmount();delete globalThis[Symbol.for('dot-panel.review-hooks')];});h.render();return h;
}
test('metrics are compact GiB values with independently unknown fields',()=>{
 assert.deepEqual(resourceText(sample(),at),{memory:'1.0G / 2.0G',disk:'2.0G / 8.0G',cpu:'12.5%',stale:false});
 const value=sample();value.memory=null;value.cpu=null;assert.equal(resourceText(value,at).memory,'未知');assert.equal(resourceText(value,at).disk,'2.0G / 8.0G');
});
test('failed, old, future or invalid samples never display stale numeric values',()=>{
 for(const [value,now,failed] of [[sample(),at+20000,false],[sample(),at,true],[sample(),at-2000,false],[{...sample(),sampledAt:'bad'},at,false]]){
  assert.deepEqual(resourceText(value,now,failed),{memory:'未知',disk:'未知',cpu:'未知',stale:true});
 }
 const value=sample();value.memory.usedBytes=Infinity;value.disk.usedBytes=-1;value.cpu.percent=101;
 assert.deepEqual(resourceText(value,at),{memory:'未知',disk:'未知',cpu:'未知',stale:false});
});
test('one request at a time, eight seconds after completion, with bounded timeout',async t=>{
 const h=harness(t);assert.equal(h.requests.length,1);assert.equal(h.requests[0].url,'/api/resources');assert.equal(h.requests[0].options.cache,'no-store');assert.equal([...h.timers.values()].some(t=>t.ms===8000),false);
 h.requests[0].resolve(sample());await settle();h.render();assert.equal(h.slots[0].value.sampledAt,sample().sampledAt);
 h.run(8000);assert.equal(h.requests.length,2);assert.equal([...h.timers.values()].some(t=>t.ms===8000),false);
 h.requests[1].reject(new Error('Offline'));await settle();h.render();assert.equal(h.slots[1].value,true);assert.equal([...h.timers.values()].some(t=>t.ms===8000),true);
});
test('unmount aborts inflight request, prevents late data, and clears freshness timer',async t=>{
 const h=harness(t);h.unmount();assert.equal(h.requests[0].options.signal.aborted,true);assert.equal(h.timers.size,0);
 h.requests[0].resolve(sample());await settle();assert.equal(h.slots[0].value,null);assert.equal(h.timers.size,0);
});
test('invalid response becomes unknown and a later successful poll recovers',async t=>{
 const h=harness(t);h.requests[0].resolve({sampledAt:'bad'});await settle();h.render();assert.equal(h.slots[1].value,true);
 h.run(8000);h.requests[1].resolve(sample());await settle();h.render();assert.equal(h.slots[1].value,false);
});
