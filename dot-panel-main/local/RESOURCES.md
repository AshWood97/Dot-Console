# Local resource metrics

The same-origin, GET-only `/api/resources` endpoint returns a small, read-only
snapshot. It does not read task history, process command lines or environment
variables, and never returns filesystem paths or raw diagnostic errors.

- Memory uses the effective container/cgroup limit when reliably available.
  The usage includes cgroup memory cache, and an inherited shared ancestor limit
  uses that ancestor’s usage. Missing or unbounded quota information stays unknown instead of presenting
  host memory as the container's entitlement.
- Disk reports the filesystem containing this checkout. It is shared filesystem
  usage, not a dedicated allocation or the checkout directory's own size.
- CPU is sampled as an interval delta and normalized against the available CPU
  quota/cpuset. The first sample or unavailable scope is unknown; it is not an
  instantaneous process CPU reading.
- G in the compact UI means GiB (1024³ bytes).

The server caches samples for eight seconds and coalesces concurrent reads.
The client waits eight seconds after a request finishes before starting another,
with a ten-second request timeout. It checks age independently every second;
failed, invalid, future-dated or 20-second-old readings show unknown/expired
rather than continuing to display old numbers. Task polling is independent.

This implementation was rebuilt on 2026-10-11 from the previously requested
specification on the verified private-repository baseline. The lost original
uncommitted resource patch was not restored. Existing running services and
private task histories were not modified by the source publication workflow.
