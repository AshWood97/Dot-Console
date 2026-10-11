// SPDX-License-Identifier: AGPL-3.0-only
import {useEffect,useState} from 'react';
export type ResourceSnapshot={sampledAt:string;memory:{usedBytes:number;totalBytes:number;scope:string}|null;disk:{usedBytes:number;totalBytes:number;scope:string}|null;cpu:{percent:number;scope:string}|null};
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
export function resourceText(snapshot:ResourceSnapshot|null,now:number,failed=false){
 const age=snapshot?now-Date.parse(snapshot.sampledAt):Infinity;
 const stale=failed||!Number.isFinite(age)||age< -1000||age>=20000;
 const bytes=(metric:ResourceSnapshot['memory'])=>!stale&&metric&&finite(metric.usedBytes)&&finite(metric.totalBytes)&&metric.totalBytes>0&&metric.usedBytes<=metric.totalBytes?`${(metric.usedBytes/2**30).toFixed(1)}G / ${(metric.totalBytes/2**30).toFixed(1)}G`:'未知';
 const cpu=!stale&&snapshot?.cpu&&finite(snapshot.cpu.percent)&&snapshot.cpu.percent<=100?`${snapshot.cpu.percent.toFixed(1)}%`:'未知';
 return {memory:bytes(snapshot?.memory??null),disk:bytes(snapshot?.disk??null),cpu,stale:!!snapshot&&stale};
}
export default function ResourceMonitor(){
 const [snapshot,setSnapshot]=useState<ResourceSnapshot|null>(null),[failed,setFailed]=useState(false),[now,setNow]=useState(Date.now());
 useEffect(()=>{
  const controller=new AbortController();let pollTimer:ReturnType<typeof setTimeout>,ageTimer:ReturnType<typeof setTimeout>;
  const tick=()=>{if(controller.signal.aborted)return;setNow(Date.now());ageTimer=setTimeout(tick,1000);};tick();
  const poll=async()=>{
   try{
    const response=await fetch('/api/resources',{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)])});
    if(!response.ok)throw new Error('Resource sample unavailable');
    const value=await response.json() as ResourceSnapshot;
    if(!value||typeof value.sampledAt!=='string'||!Number.isFinite(Date.parse(value.sampledAt)))throw new Error('Invalid resource sample');
    if(controller.signal.aborted)return;setSnapshot(value);setFailed(false);setNow(Date.now());
   }catch{if(controller.signal.aborted)return;setFailed(true);setNow(Date.now());}
   // No overlapping requests: wait eight seconds after this request completes.
   if(!controller.signal.aborted)pollTimer=setTimeout(poll,8000);
  };void poll();return()=>{controller.abort();clearTimeout(pollTimer);clearTimeout(ageTimer);};
 },[]);
 const value=resourceText(snapshot,now,failed);
 return <div className="pg-resources" aria-label="硬件使用率" title="G = GiB。内存为 cgroup memory.current（含缓存），优先使用有效容器限额；无可靠配额显示未知。磁盘为工作目录所在文件系统，非专属容量。CPU 为采样间隔内占可用 CPU 配额的比例；首次采样可能未知。失败或超过 20 秒的采样不显示旧数值。">
  <span>内存 {value.memory}</span><span>磁盘 {value.disk}</span><span>CPU {value.cpu}</span>{value.stale&&<span>数据已过期</span>}
 </div>;
}
