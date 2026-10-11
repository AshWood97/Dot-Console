import test from 'node:test';
import assert from 'node:assert/strict';
import { projectStatus, projectCounts, checkFreshness, isStale, relativeTime, escapeText, metricPercent, formatBytes, matchesSearch, startTimeState, projectStartLabel, resourceScopeLabel } from './helpers.mjs';
const now = Date.parse('2026-10-11T12:00:00Z');
const ago = ms => new Date(now - ms).toISOString();
const project = (...statuses) => ({ tasks: statuses.map(status => ({ status })) });

test('project status precedence is running, failed, waiting, completed', () => {
  assert.equal(projectStatus(project('completed', 'failed', 'waiting', 'running')), 'running');
  assert.equal(projectStatus(project('completed', 'waiting', 'failed')), 'failed');
  assert.equal(projectStatus(project('completed', 'waiting')), 'waiting');
  assert.equal(projectStatus(project('completed', 'completed')), 'completed');
  assert.equal(projectStatus(project()), 'waiting');
  assert.equal(projectStatus({}), 'waiting');
});
test('summary counts whole projects once, never each task', () => {
  assert.deepEqual(projectCounts([project('running', 'running', 'failed'), project('waiting', 'waiting'), project('completed', 'completed'), project('failed')]), { running: 1, waiting: 1, completed: 1, failed: 1 });
  assert.deepEqual(projectCounts([]), { running: 0, waiting: 0, completed: 0, failed: 0 });
});
test('task freshness distinguishes fresh, stale, unknown, and clock mismatch', () => {
  assert.equal(checkFreshness(ago(0), now), 'fresh');
  assert.equal(checkFreshness(ago(60000), now), 'fresh');
  assert.equal(checkFreshness(ago(60001), now), 'stale');
  assert.equal(isStale(ago(60001), now), true);
  assert.equal(checkFreshness(null, now), 'unknown');
  assert.equal(checkFreshness('', now), 'unknown');
  assert.equal(checkFreshness('not-a-date', now), 'unknown');
  assert.equal(checkFreshness(ago(-5001), now), 'unknown');
  assert.equal(checkFreshness(ago(-4999), now), 'fresh');
});
test('relative times do not misrepresent future timestamps as current', () => {
  assert.equal(relativeTime(ago(-5001), now), 'Clock ahead');
  assert.equal(relativeTime(ago(0), now), 'just now');
  assert.equal(relativeTime(ago(65000), now), '1m ago');
  assert.equal(relativeTime(null, now), 'Not recorded');
});
test('escaping preserves content without leaving HTML control characters', () => {
  assert.equal(escapeText('<img src=x onerror="alert(1)"> & \'quoted\''), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;quoted&#39;');
  assert.equal(escapeText(null), '');
  assert.equal(escapeText('中文 🪴'), '中文 🪴');
});
test('unavailable resource values never become fabricated zero percent', () => {
  assert.equal(metricPercent(null, 100), null);
  assert.equal(metricPercent(0, null), null);
  assert.equal(metricPercent(20, 0), null);
  assert.equal(metricPercent(0, 100), 0);
  assert.equal(metricPercent(25, 100), 25);
  assert.equal(metricPercent(200, 100), 100);
  assert.equal(formatBytes(null), 'Unavailable');
  assert.equal(formatBytes(0), '0 B');
});
test('search handles user text as text and includes task details', () => {
  const item = { name: '日本', description: 'Local workspace', group: 'Product', tasks: [{ title: 'Sample', blocker: '<script>pending</script>', nextAction: 'Review build' }] };
  assert.equal(matchesSearch(item, ' REVIEW '), true);
  assert.equal(matchesSearch(item, '<script>'), true);
  assert.equal(matchesSearch(item, 'absent'), false);
  assert.equal(matchesSearch(item, ''), true);
});

test('missing start timestamps mean unknown, never not-started', () => {
  assert.equal(startTimeState(null), 'unknown');
  assert.equal(startTimeState(undefined), 'unknown');
  assert.equal(startTimeState(''), 'unknown');
  assert.equal(startTimeState('invalid'), 'unknown');
  assert.equal(startTimeState(ago(5000)), 'recorded');
});

test('completed and waiting projects without start records show unknown start label', () => {
  for (const status of ['completed', 'waiting']) {
    const item = { lastStartedAt: null, tasks: [{ status, startedAt: null }] };
    assert.equal(projectStartLabel(item), '开始时间未记录');
    assert.notEqual(projectStartLabel(item), 'Not started');
  }
  assert.equal(projectStartLabel({ lastStartedAt: ago(1000) }), '启动于');
});

test('scope labels preserve host fallback and data-filesystem distinction', () => {
  assert.equal(resourceScopeLabel('host (container limit unavailable)'), '主机（容器限额不可用）');
  assert.equal(resourceScopeLabel('container'), '容器');
  assert.equal(resourceScopeLabel('data filesystem'), '数据目录所在磁盘');
  assert.equal(resourceScopeLabel(null), '范围未知');
});
