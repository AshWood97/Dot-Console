// SPDX-License-Identifier: AGPL-3.0-only
// Rebuilt from the verified 2026-10-10 resource-monitor specification.
// Sampling runs inside the serving gateway, not an external shell namespace.
import {readFile,statfs} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {performance} from 'node:perf_hooks';

const integer=text=>typeof text==='string'&&/^\d+$/.test(text.trim())&&Number.isSafeInteger(Number(text))?Number(text):null;
export function cpuCount(text){
 if(typeof text!=='string'||text.length>65536)return null;
 const cpus=new Set();
 for(const part of text.trim().split(',')){
  if(!/^\d+(-\d+)?$/.test(part))return null;
  const [a,b=a]=part.split('-').map(Number);
  if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||b<a||b-a>65536)return null;
  for(let cpu=a;cpu<=b;cpu++){cpus.add(cpu);if(cpus.size>65536)return null;}
 }
 return cpus.size||null;
}
export function cpuQuota(text){
 if(typeof text!=='string')return {known:false,value:null};
 const parts=text.trim().split(/\s+/),period=integer(parts[1]);
 if(parts.length!==2||period===null||period<=0)return {known:false,value:null};
 if(parts[0]==='max')return {known:true,value:null};
 const quota=integer(parts[0]);return quota!==null&&quota>0?{known:true,value:quota/period}:{known:false,value:null};
}
const unescapeMount=text=>text.replace(/\\(040|011|012|134)/g,(_,octal)=>String.fromCharCode(parseInt(octal,8)));
export function cgroupLocation(membership,mounts){
 const group=membership.split('\n').find(line=>line.startsWith('0::'))?.slice(3);
 if(!group?.startsWith('/')||group.split('/').includes('..'))throw Error('Unavailable cgroup2');
 for(const line of mounts.split('\n')){
  const [left,right]=line.split(' - ');if(!right?.startsWith('cgroup2 '))continue;
  const fields=left.split(' ');if(fields.length<5)continue;
  const root=unescapeMount(fields[3]),mount=unescapeMount(fields[4]);
  if(group===root||group.startsWith(root==='/'?'/':root+'/')){
   const own=resolve(mount,'.'+(root==='/'?group:group.slice(root.length)||'/'));
   if(own!==mount&&!own.startsWith(mount+'/'))continue;
   return {mount,own};
  }
 }
 throw Error('Unavailable cgroup2 mount');
}

export function createResourceMonitor({root=resolve(import.meta.dirname,'..'),read=path=>readFile(path,'utf8'),disk=statfs,clock=()=>performance.now(),wall=()=>Date.now(),cacheMs=8000}={}){
 let cached,inflight,lastCPU;
 const safe=async path=>{try{return (await read(path)).trim();}catch{return null;}};
 async function collect(){
  const result={sampledAt:new Date(wall()).toISOString(),memory:null,disk:null,cpu:null};
  try{
   const {mount,own}=cgroupLocation(await read('/proc/self/cgroup'),await read('/proc/self/mountinfo'));
   const chain=[];for(let path=own;;path=dirname(path)){chain.push(path);if(path===mount)break;if(dirname(path)===path)throw Error('Invalid hierarchy');}
   let memoryPath=own,limit=null,capacity=null,memoryKnown=true,cpuKnown=true;
   for(const path of chain){
    const rawMemory=await safe(path+'/memory.max'),maximum=integer(rawMemory);
    if(rawMemory===null||(rawMemory!=='max'&&maximum===null))memoryKnown=false;
    if(maximum!==null&&(limit===null||maximum<limit)){limit=maximum;memoryPath=path;}
    const quota=cpuQuota(await safe(path+'/cpu.max')),count=cpuCount(await safe(path+'/cpuset.cpus.effective'));
    // Effective sets are already intersected with ancestors by the kernel.
    if(!quota.known||count===null)cpuKnown=false;
    for(const cap of [quota.value,count])if(cap!==null&&cap>0)capacity=capacity===null?cap:Math.min(capacity,cap);
   }
   // Unknown/unlimited limits do not become a host-RAM quota. Missing root
   // controller files remain unknown: '/' does not prove a genuine host root.
   const used=integer(await safe(memoryPath+'/memory.current'));
   if(memoryKnown&&limit!==null&&used!==null)result.memory={usedBytes:used,totalBytes:limit,scope:'cgroup2; memory.current includes cache; effective ancestor limit'};
   const stats=await safe(own+'/cpu.stat'),match=stats?.match(/^usage_usec (\d+)$/m),usage=match?integer(match[1]):null,stamp=clock();
   if(cpuKnown&&capacity!==null&&usage!==null&&Number.isFinite(stamp)){
    const previous=lastCPU;lastCPU={usage,stamp,capacity};
    if(previous&&previous.capacity===capacity&&stamp>previous.stamp&&usage>=previous.usage){
     const percent=(usage-previous.usage)/((stamp-previous.stamp)*1000*capacity)*100;
     if(Number.isFinite(percent))result.cpu={percent:Math.max(0,Math.min(100,percent)),scope:'cgroup2 cpu.stat delta / effective cpu.max and cpuset capacity'};
    }
   }else lastCPU=undefined;
  }catch{lastCPU=undefined;}
  try{
   const fs=await disk(root),total=Number(fs.blocks)*Number(fs.bsize),free=Number(fs.bfree)*Number(fs.bsize);
   // Filesystem allocation, not per-user availability or an individual quota.
   if(Number.isSafeInteger(total)&&Number.isSafeInteger(free)&&total>0&&free>=0&&free<=total)result.disk={usedBytes:total-free,totalBytes:total,scope:'workspace filesystem; shared capacity, not a personal quota'};
  }catch{/* Metrics failure never interrupts the separate task-event feed. */}
  return result;
 }
 return ()=>{
  const now=clock();if(cached&&now>=cached.at&&now-cached.at<cacheMs)return Promise.resolve(cached.value);
  if(inflight)return inflight;
  inflight=collect().then(value=>{cached={at:clock(),value};return value;}).finally(()=>{inflight=undefined;});
  return inflight;
 };
}
