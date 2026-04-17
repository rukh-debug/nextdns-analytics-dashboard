---
date: 2026-04-16
topic: "CPU Optimization for Log Ingestion Pipeline"
status: validated
---

# CPU Optimization Design

## Problem Statement

The NDNS Analytics dashboard experiences high CPU usage from the log ingestion pipeline. The root cause is two-fold:

1. **SSE stream processes logs one-by-one** through the full processing pipeline (hash, dedup, device upsert, profile state update) — for high-traffic profiles this means hundreds of DB operations per minute
2. **Poller + SSE run simultaneously**, duplicating work for each profile
3. **Per-log overhead is excessive**: JSON.stringify + SHA256 for every single log, individual device upserts, profile state read-then-write on every event

## Constraints

- Must not break existing log ingestion correctness (no lost or duplicate logs)
- Must not require database schema changes
- Must maintain real-time feel for the dashboard (sub-5s log appearance is acceptable)
- Must work with both SSE and Poller ingestion paths
- Existing webhook and notification system must continue to function

## Approach

Three-phase progressive optimization. Phase 1 has the highest impact and lowest risk.

### Phase 1: SSE Batching (Highest Impact)

Buffer SSE messages and flush as batches instead of processing one-by-one.

- SSE messages accumulate in a time-bounded buffer
- Flush conditions: 2 seconds elapsed OR 50 logs accumulated
- Flush calls the existing `processLogBatch()` function (already designed for batch processing)
- Expected reduction: 10-50x fewer DB operations for SSE-sourced logs

### Phase 2: Hashing & Dedup Optimization

Replace expensive hash computation and add in-memory dedup cache.

- **Hash optimization**: Replace `JSON.stringify + SHA256` with concatenation of stable fields (timestamp + domain + device + action + profileId) + lighter hash (or even just the concatenated string as key)
- **In-memory LRU cache**: Maintain a Set of recently-seen hashes per profile (last 10,000). Skip DB dedup query for cache hits. Only query DB on cache miss.
- Expected reduction: Near-zero DB dedup queries for active streams, 5-10x faster hash computation

### Phase 3: Device Upsert Batching & Profile State Throttling

- **Device upsert batching**: Accumulate device upsert operations and flush as a single batch DB query per batch cycle
- **Profile state throttling**: Update profile state (last seen, counts) on a timer (every 10s) instead of per-log
- **Poller role reduction**: Reduce poller to fallback role (5-minute interval) since SSE provides real-time data
- Expected reduction: Device upserts go from N-per-batch to 1-per-batch; profile updates go from N-per-minute to 6-per-minute

## Architecture

### Before (Current)

```
SSE Stream ──► processLogBatch([singleLog]) ──► per-log:
                  ├── JSON.stringify + SHA256
                  ├── DB dedup query
                  ├── Individual device upsert
                  ├── Profile state update
                  └── Webhook evaluation

Poller (30s) ──► processLogBatch(logs[]) ──► (same pipeline but batched)
```

### After (Optimized)

```
SSE Stream ──► LogBuffer ──► flush (2s or 50) ──► processLogBatch(batch)
                                                       ├── Field-concat hash
                                                       ├── In-memory dedup check → DB only on miss
                                                       ├── Batch device upsert
                                                       └── Throttled profile state

Poller (5min) ──► processLogBatch(logs[]) ──► (same optimized pipeline)
```

## Components

### LogBuffer (New)

- Manages per-profile log accumulation
- Two flush triggers: time-based (2s) and size-based (50 logs)
- Flushes call `processLogBatch()` with accumulated logs
- Thread-safe via profile lock (reuses existing locking pattern)

### DedupCache (New)

- In-memory LRU cache storing recent event hashes per profile
- Default capacity: 10,000 entries per profile
- Lookup: O(1) Set membership check
- Eviction: simple size-based (drop oldest when full)
- On profile change/restart: cache is empty, falls back to DB (safe)

### Modified: SSEStreamer

- Replace immediate `processLogBatch([log])` with `logBuffer.add(log)`
- Buffer handles batching and flush

### Modified: buildEventHash()

- Replace `JSON.stringify(fullLog) + createHash('sha256')` with concatenation of stable fields
- Fields: `${profileId}|${timestamp}|${domain}|${device.id}|${action}|${server}` 
- Hash with a lighter algorithm or use the concatenated string directly as key

### Modified: processLogBatch() dedup section

- Check in-memory cache first
- Only query DB for hashes not in cache
- Add all new hashes to cache after processing

### Modified: Device upsert logic

- Collect all unique devices from batch
- Single batched upsert (INSERT ... ON CONFLICT UPDATE) instead of individual queries

### Modified: Profile state updates

- Move to a periodic timer (every 10s per profile)
- Batch writes aggregated stats instead of per-log updates

### Modified: LogPoller

- Increase interval from 30s to 5 minutes (300s)
- Role changes from primary to fallback/safety-net
- Still processes through same optimized batch pipeline

## Data Flow

### Optimized SSE Flow

1. SSE EventSource receives message → parse to log object
2. Add to LogBuffer for this profile
3. On flush trigger (time or size):
   a. Build hashes for all logs using stable-field concatenation
   b. Check DedupCache for all hashes → split into cache-hits (skip) and cache-misses
   c. For cache-misses: query DB for existing hashes
   d. Filter truly new logs
   e. Batch insert new logs to DB
   f. Batch upsert devices
   g. Add new hashes to DedupCache
   h. Update profile state (throttled, may not fire every batch)
   i. Evaluate and fire webhooks for new logs

### Poller Flow (Unchanged Pattern, Optimized Internally)

1. Timer fires every 5 minutes
2. Fetch logs from NextDNS API
3. Process through same optimized batch pipeline
4. Serves as safety net for any logs missed by SSE

## Error Handling

- **SSE buffer overflow**: If buffer grows beyond 500 logs without flushing, force-flush immediately
- **DedupCache miss on restart**: Empty cache means DB queries on first batch after restart — same as today, no degradation
- **Hash algorithm change**: New hash format will not match old hashes. After deployment, first batch per profile will not dedup against pre-deployment logs. Acceptable: means ~1 batch of potential duplicates, which retention cleanup handles
- **DB errors during batch flush**: Existing error handling applies — log error, retry on next cycle
- **Profile lock contention**: Buffer flush and poller both acquire profile lock. Lock is already promise-chained, so they serialize naturally

## Testing Strategy

### Unit Tests

- LogBuffer: flush triggers (time, size, overflow), empty buffer handling
- DedupCache: hit/miss/eviction behavior, per-profile isolation
- buildEventHash: verify new hash produces consistent results for same input

### Integration Tests

- SSE → Buffer → processLogBatch → DB: verify no log loss
- Simultaneous SSE + Poller: verify no duplicates
- High-volume test: simulate 1000 logs/min through SSE, verify batch processing

### Performance Validation

- CPU profiling before/after during sustained SSE traffic
- DB query count comparison (should drop 10-50x)
- Memory usage monitoring for DedupCache (should be bounded)

## Open Questions

1. **Profile count**: How many profiles are typically active? Affects DedupCache memory sizing.
2. **SSE vs Poller usage**: Is SSE actually enabled in production? If only poller is used, Phase 1 priority shifts.
3. **Webhook latency tolerance**: The 2s buffer window adds delay to webhook triggers. Is this acceptable?
4. **Hash backward compatibility**: Should we maintain old hash format alongside new, or accept the one-time dedup gap?

## Estimated Impact

| Metric | Before | After (Phase 1) | After (All Phases) |
|--------|--------|-----------------|-------------------|
| DB ops per log (SSE) | ~4-5 | ~0.1-0.2 | ~0.05-0.1 |
| Hash computations/sec | 1 per log | 1 per log | 1 per log (cheaper) |
| Dedup DB queries | 1 per batch | 1 per batch | ~0.01 per batch (cache hits) |
| Device upserts | 1 per log | 1 per batch | 1 per batch |
| Profile state updates | 1 per log | 1 per batch | ~0.17 per second (6/min) |
| CPU from ingestion | HIGH | MEDIUM | LOW |
