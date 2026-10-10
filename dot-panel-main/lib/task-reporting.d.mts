export type Status='queued'|'running'|'passed'|'failed'|'blocked'|'needs_confirmation'|'completed'|'canceled';
export type TaskEvent={id:string;project:string;task:string;title:string;message:string;timestamp:string;reported_at:string;kind:'request'|'status'|'tool'|'test'|'note'|'confirmation'|'checkpoint';status:Status;source:'manual'|'tool';stage?:string;done?:string;next?:string;blocker?:string|null;summary?:string;started_at?:string;verification?:{observed_at:string;evidence:string;scope:'task'|'process'};metrics?:{tests?:{passed:number;total:number;scope:string;source:string}}};

export type Task={key:string;project:string;title:string;status:Status;first:string;last:TaskEvent;stage?:string;done?:string;next?:string;blocker?:string|null;summary?:string;started_at?:string;metrics?:TaskEvent['metrics'];metricsReportedAt?:string;launchAt?:string;launchOrder?:number;hasLifecycle?:boolean;lastProgressAt?:string;lastVerifiedAt?:string;lastVerification?:TaskEvent['verification']};
export const VERIFY_AFTER_MS:number;
export const REPORT_WITHIN_MS:number;
export function aggregateTasks(events:TaskEvent[]):Task[];
export function taskFreshness(task:Task,now?:number):{active:boolean;due:boolean;unknown:boolean;clockSkew:boolean;basis?:string;ageMs?:number};
