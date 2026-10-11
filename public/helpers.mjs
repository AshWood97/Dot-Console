export const STALE_CHECK_MS = 60_000;

/** A project has one summary status; task counts never inflate project counts. */
export function projectStatus(project) {
  const tasks = Array.isArray(project?.tasks) ? project.tasks : [];
  if (tasks.some(task => task.status === 'running')) return 'running';
  if (tasks.some(task => task.status === 'failed')) return 'failed';
  if (!tasks.length || tasks.some(task => task.status === 'waiting')) return 'waiting';
  return 'completed';
}

export function timestamp(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Missing checks are unknown, never silently treated as fresh. */
export function checkFreshness(value, now = Date.now(), threshold = STALE_CHECK_MS) {
  const time = timestamp(value);
  if (time === null || time > now + 5000) return 'unknown';
  return now - time > threshold ? 'stale' : 'fresh';
}

export function isStale(value, now = Date.now(), threshold = STALE_CHECK_MS) {
  return checkFreshness(value, now, threshold) === 'stale';
}

/** Useful at text-only export boundaries. DOM rendering uses textContent instead. */
export function escapeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

export function projectCounts(projects) {
  const counts = { running: 0, waiting: 0, completed: 0, failed: 0 };
  for (const project of projects) counts[projectStatus(project)] += 1;
  return counts;
}

export function relativeTime(value, now = Date.now()) {
  const time = timestamp(value);
  if (time === null) return 'Not recorded';
  if (time > now + 5000) return 'Clock ahead';
  const seconds = Math.max(0, Math.floor((now - time) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Unavailable';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length);
  return `${(bytes / 1024 ** exponent).toFixed(exponent < 2 ? 0 : 1)} ${units[exponent - 1]}`;
}

export function metricPercent(used, total) {
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0 || used < 0) return null;
  return Math.min(100, Math.max(0, used / total * 100));
}

export function matchesSearch(project, query) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  const values = [project.name, project.group, project.description, ...(project.tasks || []).flatMap(task => [task.title, task.stage, task.outcome, task.blocker, task.nextAction])];
  return values.some(value => typeof value === 'string' && value.toLocaleLowerCase().includes(needle));
}

/** A missing start record does not mean a project has never started. */
export function startTimeState(value) {
  return timestamp(value) === null ? 'unknown' : 'recorded';
}

export function projectStartLabel(project) {
  return startTimeState(project?.lastStartedAt) === 'recorded' ? '启动于' : '开始时间未记录';
}

/** Translate known metric scopes without disguising host fallback as a container limit. */
export function resourceScopeLabel(value) {
  if (typeof value !== 'string' || !value.trim()) return '范围未知';
  const scope = value.toLowerCase();
  if (scope.includes('filesystem') || scope.includes('file system')) return scope.includes('data') ? '数据目录所在磁盘' : '文件系统';
  if (scope.includes('host')) {
    if (scope.includes('container') || scope.includes('cgroup')) {
      return /unavailable|unknown|undetected|not detected|not available|fallback|missing|unsupported|no limit/.test(scope) ? '主机（容器限额不可用）' : '主机（容器环境）';
    }
    return '主机';
  }
  if (scope.includes('container') || scope.includes('cgroup')) return '容器';
  if (scope === 'process') return '进程';
  return value;
}
