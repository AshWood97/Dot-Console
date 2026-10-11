// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import {createResourceMonitor,cpuCount,cpuQuota,cgroupLocation} from '../../local/resources.mjs';
function fixture(){
 let now=0,usage=1000000,calls=0;
 const values={'/proc/self/cgroup':'0::/group/child\n','/proc/self/mountinfo':'1 0 0:1 /group /cg rw - cgroup2 cgroup rw','/cg/memory.max':'8589934592','/cg/memory.current':'6000000000','/cg/cpu.max':'200000 100000','/cg/cpuset.cpus.effective':'0-3','/cg/child/memory.max':'max','/cg/child/memory.current':'1000000','/cg/child/cpu.max':'max 100000','/cg/child/cpuset.cpus.effective':'0-2'};
 const monitor=createResourceMonitor({root:'/workspace',read:async path=>{calls++;if(path.endsWith('/cpu.stat'))return `usage_usec ${usage}`;if(!(path in values))throw Error('/private/token');return values[path];},disk:async path=>{assert.equal(path,'/workspace');return {bsize:1024,blocks:100,bfree:40,bavail:-1};},clock:()=>now,wall:()=>1700000000000+now});
 return {monitor,values,setUsage:value=>{usage=value;},advance:(ms=8000)=>{now+=ms;usage+=8000000;},calls:()=>calls};
}
test('maps the cgroup2 mount root and rejects mismatches',()=>{
 assert.deepEqual(cgroupLocation('0::/parent/child','1 0 0:1 /parent /cg rw - cgroup2 cgroup rw'),{mount:'/cg',own:'/cg/child'});
 assert.throws(()=>cgroupLocation('0::/outside','1 0 0:1 /parent /cg rw - cgroup2 cgroup rw'));
 assert.throws(()=>cgroupLocation('0::/../outside','1 0 0:1 / /cg rw - cgroup2 cgroup rw'));
});
test('CPU ranges, overlaps, fractional quota and malformed/overflow tokens',()=>{
 assert.equal(cpuCount('0-3,3,6,8-9'),7);assert.equal(cpuCount('bad'),null);assert.equal(cpuCount('9007199254740992'),null);assert.equal(cpuCount('0-999999'),null);
 assert.deepEqual(cpuQuota('50000 100000'),{known:true,value:.5});assert.deepEqual(cpuQuota('max 100000'),{known:true,value:null});
 for(const text of ['999999999999999999999 100000','max 999999999999999999999','0 100000','100000 0','max garbage'])assert.equal(cpuQuota(text).known,false);
});
test('hierarchical memory cap and CPU delta use real capacity; first sample is unknown',async()=>{
 const f=fixture(),first=await f.monitor();assert.equal(first.memory.totalBytes,8589934592);assert.equal(first.memory.usedBytes,6000000000);assert.equal(first.cpu,null);
 f.advance();const next=await f.monitor();assert.equal(next.cpu.percent,50);assert.equal(next.disk.usedBytes,61440);assert.equal(next.disk.totalBytes,102400);
 assert.doesNotMatch(JSON.stringify(next),/\/cg|\/workspace|private|token|pid/);assert.match(next.memory.scope,/cache/);assert.match(next.disk.scope,/not a personal quota/);
});
test('8-second cache coalesces requests and expires at the boundary',async()=>{
 const f=fixture(),[a,b]=await Promise.all([f.monitor(),f.monitor()]);assert.equal(a,b);const calls=f.calls();f.advance(7999);assert.equal(await f.monitor(),a);assert.equal(f.calls(),calls);f.advance(1);assert.notEqual(await f.monitor(),a);
});
test('unlimited, missing and malformed limits never masquerade as host quotas',async()=>{
 for(const limit of ['max',undefined,'999999999999999999999']){const f=fixture();if(limit===undefined)delete f.values['/cg/memory.max'];else f.values['/cg/memory.max']=limit;assert.equal((await f.monitor()).memory,null);}
 const f=fixture();delete f.values['/cg/child/cpu.max'];await f.monitor();f.advance();assert.equal((await f.monitor()).cpu,null);
});
test('zero finite memory limits stay zero',async()=>{const f=fixture();f.values['/cg/child/memory.max']='0';assert.equal((await f.monitor()).memory.totalBytes,0);});
test('counter reset and changed capacity require a fresh baseline; zero usage is valid',async()=>{
 const f=fixture();f.setUsage(0);await f.monitor();f.advance();f.setUsage(0);assert.equal((await f.monitor()).cpu.percent,0);
 f.advance();f.setUsage(100);assert.ok((await f.monitor()).cpu);f.advance();f.setUsage(0);assert.equal((await f.monitor()).cpu,null);
 f.values['/cg/cpu.max']='100000 100000';f.advance();assert.equal((await f.monitor()).cpu,null);f.advance();assert.equal((await f.monitor()).cpu.percent,100);
});
test('fractional child quota and effective cpuset limit CPU capacity',async()=>{
 const f=fixture();f.values['/cg/child/cpu.max']='50000 100000';await f.monitor();f.advance();assert.equal((await f.monitor()).cpu.percent,100);
 const g=fixture();g.values['/cg/cpu.max']='max 100000';await g.monitor();g.advance();assert.ok(Math.abs((await g.monitor()).cpu.percent-100/3)<.0001);
});
test('overflow quota cannot fall back to cpuset',async()=>{const f=fixture();f.values['/cg/cpu.max']='9999999999999999999999 100000';await f.monitor();f.advance();assert.equal((await f.monitor()).cpu,null);});
test('failures are isolated, sanitized, and disk never uses negative bavail as used space',async()=>{
 const f=fixture();delete f.values['/proc/self/cgroup'];const r=await f.monitor();assert.equal(r.memory,null);assert.equal(r.cpu,null);assert.equal(r.disk.usedBytes,61440);
 const m=createResourceMonitor({read:async()=>{throw Error('/secret/token');},disk:async()=>{throw Error('/private/path');}});const result=await m();assert.equal(result.disk,null);assert.doesNotMatch(JSON.stringify(result),/secret|token|private/);
});
test('invalid or overflowing filesystem sizes remain unknown',async()=>{
 for(const fs of [{bsize:4096,blocks:Number.MAX_VALUE,bfree:0},{bsize:1024,blocks:100,bfree:-1},{bsize:1024,blocks:100,bfree:101}]){const monitor=createResourceMonitor({read:async()=>{throw Error();},disk:async()=>fs});assert.equal((await monitor()).disk,null);}
});
