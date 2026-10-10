#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
import {DEFAULT_FILE} from './events.mjs';
import {reportProgress,reportCheckpoint,verificationDue,runCommand,currentTask} from './reporting.mjs';
const help=`Dot Console factual reporting (Node 22.13+)
  report     JSON event from stdin. Adds explicit observed-result verification.
  milestone  --project NAME --task ID --message FACT [--stage TEXT --done TEXT --next TEXT]
  start|blocked|complete|cancel  Same flags; explicit task lifecycle change.
  checkpoint --project NAME --task ID --evidence FACT [--observed-at ISO --id RETRY_ID]
  due        Read-only JSON list of active tasks needing verification (5 min target).
  run        --project NAME --task ID --label LABEL [--id RUN_ID] -- COMMAND ARGS...
Common: --file PATH (or DOT_CONSOLE_EVENTS); --id stable retry ID.
Only report real observations. No scheduler or platform-wide task hook is installed.
Process run never marks the whole task completed; it owns only the command it launches.
See local/REPORTING.md.`;
try {
  const argv=process.argv.slice(2), action=argv.shift();
  if(!action||['help','--help','-h'].includes(action)){console.log(help);process.exit(0);}
  const opts={},commands=[];
  const allowed=new Set(['file','project','task','title','message','stage','done','next','blocker','summary','status','kind','source','id','timestamp','observed-at','evidence','label']);
  while(argv.length){const key=argv.shift();if(key==='--'){commands.push(...argv);break;}if(!key.startsWith('--')||!allowed.has(key.slice(2))||!argv.length)throw new Error(`Invalid option: ${key}`);opts[key.slice(2).replaceAll('-','_')]=argv.shift();}
  const file=opts.file??process.env.DOT_CONSOLE_EVENTS??DEFAULT_FILE;delete opts.file;
  let output;
  if(action==='due'){if(Object.keys(opts).length||commands.length)throw new Error('due takes only --file');output=await verificationDue({file});}
  else if(action==='checkpoint'){
    for(const key of Object.keys(opts))if(!['project','task','id','evidence','observed_at'].includes(key))throw new Error(`checkpoint cannot change ${key}`);
    output=await reportCheckpoint(opts,file);
  }else if(action==='run'){
    for(const key of Object.keys(opts))if(!['project','task','id','label'].includes(key))throw new Error(`run does not accept ${key}`);
    const controller=new AbortController(),cancel=()=>controller.abort();process.on('SIGINT',cancel);process.on('SIGTERM',cancel);
    try{output=await runCommand({...opts,command:commands[0],args:commands.slice(1),file,signal:controller.signal});process.exitCode=output.code;}finally{process.off('SIGINT',cancel);process.off('SIGTERM',cancel);}
  }else if(action==='report'){
    if(Object.keys(opts).length||commands.length)throw new Error('report takes JSON on stdin and optional --file');
    let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>65536)throw new Error('Input exceeds 64 KiB');}output=await reportProgress(JSON.parse(input),file);
  }else if(['start','milestone','blocked','complete','cancel'].includes(action)){
    const old=await currentTask(opts.project,opts.task,file);
    if(!opts.title)opts.title=old?.title;
    if(!opts.title)throw new Error('New tasks require --title');
    const status={start:'running',blocked:'blocked',complete:'completed',cancel:'canceled'}[action];
    if(status&&opts.status&&opts.status!==status)throw new Error('Conflicting lifecycle status');
    if(!status&&!old?.hasLifecycle)throw new Error('Use start to create a task');
    if(!status&&['completed','canceled'].includes(old.status))throw new Error('Use start for an explicit restart');
    if(opts.blocker==='null')opts.blocker=null;
    output=await reportProgress({...opts,status:status??opts.status??old.status},file);
  }else throw new Error(`Unknown action: ${action}`);
  console.log(JSON.stringify(output));
}catch(error){console.error(error.message);process.exitCode=1;}
