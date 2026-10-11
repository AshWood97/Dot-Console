import { projectStatus, projectCounts, checkFreshness, relativeTime, formatBytes, metricPercent, matchesSearch, timestamp, startTimeState, projectStartLabel, resourceScopeLabel } from './helpers.mjs';

const POLL_MS = 3000;
const REQUEST_TIMEOUT_MS = 6000;
const MAX_IMPORT_BYTES = 1024 * 1024;
const STATUS_LABELS = { running: '运行中', waiting: '等待中', completed: '已完成', failed: '需处理' };
const TASK_ICONS = { running: '', waiting: '', completed: '', failed: '' };
const $ = id => document.getElementById(id);
let snapshot = null;
let snapshotSignature = '';
let resources = null;
let lastSyncedAt = null;
let connectionError = null;
let resourceFetchError = null;
let filter = '';
let groupFilter = '';
let searchQuery = '';
let inFlight = false;
let queuedRefresh = false;
let importData = null;
let importing = false;
let toastTimer;

/** All dynamic fields enter the document through textContent, never HTML parsing. */
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}
function text(id, value) { $(id).textContent = String(value ?? ''); if (id.endsWith('-scope') || id.endsWith('-detail')) $(id).title = String(value ?? ''); }
function plural(count, singular) { return `${count} ${singular === 'project' ? '个项目' : '项任务'}`; }
function displayTime(value) {
  const relative = relativeTime(value);
  if (relative === 'Not recorded') return '时间未记录';
  if (relative === 'Clock ahead') return '时间超前';
  if (relative === 'just now') return '刚刚';
  return relative.replace(/(\d+)s ago/, '$1 秒前').replace(/(\d+)m ago/, '$1 分钟前').replace(/(\d+)h ago/, '$1 小时前').replace(/(\d+)d ago/, '$1 天前');
}
function absoluteTime(value) {
  const parsed = timestamp(value);
  return parsed === null ? '时间未记录' : new Date(parsed).toLocaleString();
}
function timeNode(value, prefix, className = '') {
  const node = element('span', `relative-time ${className}`.trim());
  node.dataset.timestamp = value || '';
  node.dataset.prefix = prefix;
  node.title = absoluteTime(value);
  node.textContent = `${prefix}${displayTime(value)}`;
  return node;
}
function errorMessage(error, fallback = '请求未能完成。') {
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error.message === 'string' && error.message.trim()) return error.message;
  if (error && typeof error.error === 'string' && error.error.trim()) return error.error;
  if (error?.error && typeof error.error.message === 'string') return error.error.message;
  return fallback;
}
async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(path, { ...options, cache: 'no-store', signal: controller.signal, headers: { Accept: 'application/json', ...(options.headers || {}) } });
    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); }
    catch { throw new Error(response.ok ? '服务器返回了无法读取的内容。' : `服务器返回 HTTP ${response.status}。`); }
    if (!response.ok) throw new Error(errorMessage(data, `服务器返回 HTTP ${response.status}。`));
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('请求在 6 秒后超时。');
    throw error;
  } finally { clearTimeout(timer); }
}
function validState(data) {
  const statuses = ['waiting', 'running', 'completed', 'failed'];
  if (!data || data.version !== 1 || !Array.isArray(data.projects)) return false;
  const projectIds = new Set();
  for (const project of data.projects) {
    if (!project || typeof project.id !== 'string' || projectIds.has(project.id) || typeof project.name !== 'string' || !Array.isArray(project.tasks)) return false;
    projectIds.add(project.id);
    const taskIds = new Set();
    for (const task of project.tasks) {
      if (!task || typeof task.id !== 'string' || taskIds.has(task.id) || typeof task.title !== 'string' || !statuses.includes(task.status)) return false;
      taskIds.add(task.id);
    }
  }
  return true;
}
function setConnection(error) {
  connectionError = error;
  $('connection').className = `connection ${error ? 'offline' : 'live'}`;
  text('connection-text', error ? '已断开' : '实时连接');
  $('state-error').hidden = !error;
  if (error) {
    text('state-error-title', snapshot ? '连接中断，仍显示上次成功读取的快照。' : '暂时无法读取工作区。');
    text('state-error-text', `${error} 每 3 秒自动重试。`);
  }
  updateClocks();
}
async function poll() {
  if (inFlight) { queuedRefresh = true; return; }
  inFlight = true;
  $('refresh-button').disabled = true;
  $('retry-button').disabled = true;
  await Promise.allSettled([
    (async () => {
      try {
        const data = await request('/api/state');
        if (!validState(data)) throw new Error('服务器返回了无效的项目快照。');
        lastSyncedAt = new Date().toISOString();
        const signature = JSON.stringify(data);
        snapshot = data;
        setConnection(null);
        if (signature !== snapshotSignature) {
          snapshotSignature = signature;
          renderSummary();
          renderGroupsFilter();
          renderProjects();
        }
      } catch (error) {
        setConnection(errorMessage(error, '无法连接本地服务器。'));
      } finally {
        $('loading-state').hidden = true;
        $('projects').setAttribute('aria-busy', 'false');
      }
    })(),
    (async () => {
      try {
        const data = await request('/api/resources');
        if (!data || typeof data !== 'object' || !Object.hasOwn(data, 'checkedAt')) throw new Error('服务器返回了无效的资源测量。');
        resources = data;
        resourceFetchError = null;
      } catch (error) {
        resourceFetchError = errorMessage(error, '暂时无法获取资源测量。');
      }
      renderResources();
    })(),
  ]);
  inFlight = false;
  $('refresh-button').disabled = false;
  $('retry-button').disabled = false;
  if (queuedRefresh) { queuedRefresh = false; queueMicrotask(poll); }
}
function renderSummary() {
  if (!snapshot) return;
  const counts = projectCounts(snapshot.projects);
  for (const [status, count] of Object.entries(counts)) {
    text(`count-${status}`, count);
    document.querySelector(`[data-filter="${status}"]`).setAttribute('aria-label', `${STATUS_LABELS[status]}：${plural(count, 'project')}。点击筛选。`);
  }
  text('project-total', snapshot.projects.length);
}
function renderGroupsFilter() {
  if (!snapshot) return;
  const names = [...new Set(snapshot.projects.map(project => project.group || '未分组'))];
  const current = $('group-filter').value;
  $('group-filter').replaceChildren();
  const all = element('option', '', '所有分组');
  all.value = '';
  $('group-filter').append(all);
  for (const name of names) {
    const option = element('option', '', name);
    option.value = name;
    $('group-filter').append(option);
  }
  if (names.includes(current)) $('group-filter').value = current;
  else { $('group-filter').value = ''; groupFilter = ''; }
}
function badge(status) {
  const result = element('span', `status-badge ${status}`);
  const dot = element('span', 'status-dot');
  dot.setAttribute('aria-hidden', 'true');
  result.append(dot, document.createTextNode(STATUS_LABELS[status] || status));
  return result;
}
function createTask(task) {
  const node = element('article', 'task');
  const top = element('div', 'task-top');
  const icon = element('span', `task-icon ${task.status}`, TASK_ICONS[task.status] || '');
  icon.setAttribute('role', 'img');
  icon.setAttribute('aria-label', STATUS_LABELS[task.status]);
  top.append(icon, element('h4', 'task-name', task.title), element('span', `task-status ${task.status}`, STATUS_LABELS[task.status]));
  node.append(top);
  if (task.stage) node.append(element('p', 'task-stage', task.stage));
  const facts = element('div', 'task-facts');
  for (const [key, label] of [['outcome', '结果'], ['blocker', '阻碍'], ['nextAction', '下一步']]) {
    if (!task[key]) continue;
    const fact = element('div', `task-fact ${key}`);
    fact.append(element('span', 'fact-label', label), element('span', 'fact-value', task[key]));
    facts.append(fact);
  }
  if (facts.childElementCount) node.append(facts);
  const dates = element('div', 'task-timestamps');
  dates.append(timeNode(task.updatedAt, '更新于 '));
  const checked = element('span', 'check-time');
  checked.dataset.checked = task.lastCheckedAt || '';
  checked.title = task.lastCheckedAt ? `最后检查：${absoluteTime(task.lastCheckedAt)}。超过 60 秒的检查记录标记为过期。` : '尚无检查记录。刷新看板不会更新任务检查时间。';
  dates.append(checked);
  node.append(dates);
  return node;
}
function createProject(project) {
  const status = projectStatus(project);
  const completed = project.tasks.filter(task => task.status === 'completed').length;
  const card = element('article', 'project-card');
  card.dataset.projectId = project.id;
  const header = element('header', 'project-header');
  const meta = element('div', 'project-meta');
  const startRecorded = startTimeState(project.lastStartedAt) === 'recorded';
  const startLabel = projectStartLabel(project);
  const started = timeNode(startRecorded ? project.lastStartedAt : '', startRecorded ? `${startLabel} ` : '', 'project-started');
  if (!startRecorded) { started.textContent = startLabel; started.dataset.prefix = ''; started.dataset.emptyLabel = startLabel; }
  meta.append(badge(status), started);
  const title = element('h3', 'project-title', project.name);
  title.title = project.name;
  const description = element('p', 'project-description', project.description || '暂无描述');
  description.title = project.description || '';
  header.append(meta, title, description);
  const taskLabel = element('div', 'task-section-label');
  taskLabel.append(element('span', '', '任务'), element('span', '', project.tasks.length));
  const tasks = element('div', 'task-list');
  tasks.dataset.projectId = project.id;
  tasks.tabIndex = 0;
  tasks.setAttribute('role', 'region');
  tasks.setAttribute('aria-label', `${project.name} 的任务。可滚动查看全部任务。`);
  if (!project.tasks.length) {
    const empty = element('p', 'task-empty');
    const symbol = element('span', '', '');
    symbol.setAttribute('aria-hidden', 'true');
    empty.append(symbol, document.createTextNode('暂无任务'));
    tasks.append(empty);
  } else for (const task of project.tasks) tasks.append(createTask(task));
  const footer = element('div', 'project-footer');
  const summary = element('div', 'progress-summary');
  summary.append(element('span', '', `已完成 ${completed} / ${project.tasks.length} 项任务`), element('span', '', project.tasks.length ? `${Math.round(completed / project.tasks.length * 100)}%` : '—'));
  const progress = element('div', 'project-progress');
  progress.setAttribute('role', 'progressbar');
  progress.setAttribute('aria-label', `${project.name} 任务完成进度`);
  progress.setAttribute('aria-valuemin', '0');
  progress.setAttribute('aria-valuemax', String(project.tasks.length || 1));
  progress.setAttribute('aria-valuenow', String(completed));
  progress.setAttribute('aria-valuetext', `已完成 ${completed} / ${project.tasks.length} 项任务`);
  const fill = element('span');
  fill.style.width = `${project.tasks.length ? completed / project.tasks.length * 100 : 0}%`;
  progress.append(fill);
  footer.append(summary, progress, timeNode(project.updatedAt, '项目更新于 ', 'project-updated'));
  card.append(header, taskLabel, tasks, footer);
  return card;
}
function renderProjects() {
  if (!snapshot) return;
  const scrollPositions = new Map([...document.querySelectorAll('.task-list')].map(node => [node.dataset.projectId, node.scrollTop]));
  const focusedProject = document.activeElement?.classList.contains('task-list') ? document.activeElement.dataset.projectId : null;
  const projects = snapshot.projects.filter(project => (!filter || projectStatus(project) === filter) && (!groupFilter || (project.group || '未分组') === groupFilter) && matchesSearch(project, searchQuery));
  const groups = new Map();
  for (const project of projects) {
    const group = project.group || '未分组';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(project);
  }
  const fragment = document.createDocumentFragment();
  for (const [name, items] of groups) {
    const group = element('section', 'project-group');
    group.setAttribute('aria-label', `${name}: ${plural(items.length, 'project')}`);
    const heading = element('div', 'group-heading');
    heading.append(element('h3', '', name), element('span', 'group-count', items.length), element('span', 'group-line'));
    const grid = element('div', 'project-grid');
    for (const project of items) grid.append(createProject(project));
    group.append(heading, grid);
    fragment.append(group);
  }
  $('project-groups').replaceChildren(fragment);
  for (const node of document.querySelectorAll('.task-list')) {
    node.scrollTop = scrollPositions.get(node.dataset.projectId) || 0;
    if (focusedProject === node.dataset.projectId) node.focus({ preventScroll: true });
  }
  const isFiltered = Boolean(filter || groupFilter || searchQuery.trim());
  $('empty-state').hidden = projects.length !== 0;
  $('empty-import').hidden = isFiltered;
  text('empty-title', isFiltered ? '没有匹配的项目' : '还没有项目');
  text('empty-copy', isFiltered ? '试试其他关键词，或清除筛选查看全部项目。' : '使用本地 API 或 CLI 报告项目后会显示在这里，也可导入快照。');
  $('clear-filter').hidden = !isFiltered;
  $('filter-description').hidden = !isFiltered;
  text('filter-description', `显示 ${projects.length} / ${plural(snapshot.projects.length, 'project')}${filter ? ` · ${STATUS_LABELS[filter]}` : ''}${groupFilter ? ` · ${groupFilter}` : ''}`);
  for (const button of document.querySelectorAll('[data-filter]')) button.setAttribute('aria-pressed', String(button.dataset.filter === filter));
  updateClocks();
}
function setMeter(name, percent) {
  const valid = Number.isFinite(percent);
  const meter = $(`${name}-meter`);
  meter.classList.toggle('unavailable', !valid);
  if (valid) { meter.setAttribute('aria-valuenow', percent.toFixed(1)); meter.setAttribute('aria-valuetext', `已使用 ${percent.toFixed(1)}%`); }
  else { meter.removeAttribute('aria-valuenow'); meter.setAttribute('aria-valuetext', '测量不可用'); }
  $(`${name}-bar`).style.width = valid ? `${Math.min(100, Math.max(0, percent))}%` : '0%';
}
function renderResources() {
  const cpu = resources?.cpu;
  const cpuPercent = Number.isFinite(cpu?.usedPercent) && cpu.usedPercent >= 0 ? cpu.usedPercent : null;
  text('cpu-value', cpuPercent === null ? '不可用' : `${cpuPercent.toFixed(1)}%`);
  $('cpu-value').classList.toggle('unavailable', cpuPercent === null);
  text('cpu-scope', resourceScopeLabel(cpu?.scope));
  $('cpu-scope').title = cpu?.scope || '范围未知';
  text('cpu-detail', Number.isFinite(cpu?.limitCores) ? `可用核心（系统报告）：${cpu.limitCores}` : '核心数量未知');
  setMeter('cpu', cpuPercent);
  for (const key of ['memory', 'disk']) {
    const metric = resources?.[key];
    const percent = metricPercent(metric?.usedBytes, metric?.totalBytes);
    const hasUsed = Number.isFinite(metric?.usedBytes) && metric.usedBytes >= 0;
    text(`${key}-value`, hasUsed ? formatBytes(metric.usedBytes) : '不可用');
    $(`${key}-value`).classList.toggle('unavailable', !hasUsed);
    text(`${key}-scope`, resourceScopeLabel(metric?.scope));
    $(`${key}-scope`).title = metric?.scope || '范围未知';
    text(`${key}-detail`, Number.isFinite(metric?.totalBytes) && metric.totalBytes > 0 ? `共 ${formatBytes(metric.totalBytes)}${percent === null ? '' : ` · 已用 ${percent.toFixed(1)}%`}` : '总容量未知');
    setMeter(key, percent);
  }
  updateResourceHealth();
}
function updateResourceHealth() {
  const age = checkFreshness(resources?.checkedAt);
  const stale = Boolean(resourceFetchError) || age === 'stale';
  document.querySelector('.resource-panel').classList.toggle('stale', stale);
  text('resource-time', resources ? `${stale ? '已过期 · ' : ''}${displayTime(resources.checkedAt)}` : '暂无资源测量');
  $('resource-time').title = absoluteTime(resources?.checkedAt);
  const errors = Array.isArray(resources?.errors) ? resources.errors.map(item => errorMessage(item, '部分资源测量不可用。')) : [];
  if (resourceFetchError) errors.unshift(`${resourceFetchError}${resources ? ' 当前显示上次可用的测量。' : ''}`);
  if (age === 'stale' && !resourceFetchError) errors.unshift('测量已超过 60 秒。');
  if (resources && age === 'unknown') errors.unshift('缺少测量时间，无法确认数据是否最新。');
  $('resource-error').hidden = errors.length === 0;
  text('resource-error', errors.join(' '));
}
function updateClocks() {
  for (const node of document.querySelectorAll('.relative-time')) node.textContent = !node.dataset.timestamp && node.dataset.emptyLabel ? node.dataset.emptyLabel : `${node.dataset.prefix || ''}${displayTime(node.dataset.timestamp)}`;
  for (const node of document.querySelectorAll('.check-time')) {
    const freshness = checkFreshness(node.dataset.checked);
    node.className = `check-time check-${freshness}`;
    node.textContent = freshness === 'unknown' ? (node.dataset.checked ? '检查时间不确定' : '尚无检查记录') : `检查于 ${displayTime(node.dataset.checked)}${freshness === 'stale' ? ' · 已过期' : ''}`;
  }
  if (lastSyncedAt) text('last-sync', `${connectionError ? '上次同步' : '同步于'} ${displayTime(lastSyncedAt)}`);
  else if (connectionError) text('last-sync', '尚未成功同步');
  if (resources || resourceFetchError) updateResourceHealth();
}
function showToast(message, error = false) {
  clearTimeout(toastTimer);
  text('toast', message);
  $('toast').className = `toast${error ? ' error' : ''}`;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, error ? 12000 : 6500);
}
function chooseImport() { $('import-file').value = ''; $('import-file').click(); }
async function prepareImport() {
  const file = $('import-file').files?.[0];
  if (!file) return;
  if (file.size > MAX_IMPORT_BYTES) { showToast('文件过大，请选择不超过 1 MB 的 JSON 快照。', true); return; }
  try {
    const data = JSON.parse(await file.text());
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('文件必须包含 JSON 快照对象。');
    if (!Array.isArray(data.projects)) throw new Error('快照缺少 projects 数组。');
    importData = data;
    text('import-filename', file.name);
    text('import-count', `${plural(data.projects.length, 'project')} · ${(file.size / 1024).toFixed(1)} KB`);
    $('import-error').hidden = true;
    $('import-dialog').showModal();
    $('cancel-import').focus();
  } catch (error) {
    showToast(error instanceof SyntaxError ? '文件不是有效的 JSON，请选择已导出的工作区快照。' : errorMessage(error), true);
  }
}
async function confirmImport() {
  if (!importData || importing) return;
  importing = true;
  $('confirm-import').disabled = true;
  $('cancel-import').disabled = true;
  text('confirm-import', '合并中…');
  $('import-error').hidden = true;
  try {
    const result = await request('/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'merge', data: importData }) });
    const count = importData.projects.length;
    $('import-dialog').close();
    importData = null;
    showToast(typeof result?.message === 'string' ? result.message : `已成功合并 ${plural(count, 'project')}。`);
    await poll();
  } catch (error) {
    const message = errorMessage(error);
    const uncertain = /超时|fetch|network|无法读取/i.test(message);
    text('import-error', uncertain ? `${message} 导入结果尚不确定。请先检查项目，再决定是否重试；重复内容会被拒绝。` : `导入被拒绝：${message}`);
    $('import-error').hidden = false;
    if (uncertain) poll();
  } finally {
    importing = false;
    $('confirm-import').disabled = false;
    $('cancel-import').disabled = false;
    text('confirm-import', '确认合并');
  }
}
async function exportSnapshot() {
  const button = $('export-button');
  button.disabled = true;
  try {
    const data = await request('/api/export');
    const blob = new Blob([`${JSON.stringify(data)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = element('a');
    link.href = url;
    link.download = `dot-console-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('工作区快照已准备好下载。');
  } catch (error) { showToast(`导出失败：${errorMessage(error)}`, true); }
  finally { button.disabled = false; }
}

for (const button of document.querySelectorAll('[data-filter]')) button.addEventListener('click', () => { filter = filter === button.dataset.filter ? '' : button.dataset.filter; renderProjects(); });
$('search').addEventListener('input', event => { searchQuery = event.target.value; renderProjects(); });
$('group-filter').addEventListener('change', event => { groupFilter = event.target.value; renderProjects(); });
$('clear-filter').addEventListener('click', () => { filter = ''; groupFilter = ''; searchQuery = ''; $('search').value = ''; $('group-filter').value = ''; renderProjects(); $('search').focus(); });
$('refresh-button').addEventListener('click', poll);
$('retry-button').addEventListener('click', poll);
$('import-button').addEventListener('click', chooseImport);
$('empty-import').addEventListener('click', chooseImport);
$('import-file').addEventListener('change', prepareImport);
$('confirm-import').addEventListener('click', confirmImport);
$('cancel-import').addEventListener('click', () => { if (!importing) { $('import-dialog').close(); importData = null; } });
$('import-dialog').addEventListener('cancel', event => { if (importing) event.preventDefault(); else importData = null; });
$('import-dialog').querySelector('form').addEventListener('submit', event => event.preventDefault());
$('export-button').addEventListener('click', exportSnapshot);
document.addEventListener('keydown', event => {
  const target = event.target;
  const editable = target instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);
  if (event.key === '/' && !editable && !event.metaKey && !event.ctrlKey && !event.altKey && !$('import-dialog').open) { event.preventDefault(); $('search').focus(); }
});
window.addEventListener('online', poll);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { updateClocks(); poll(); } });
poll();
setInterval(() => { if (!inFlight) poll(); }, POLL_MS);
setInterval(updateClocks, 1000);
