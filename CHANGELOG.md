# Changelog

## Pre-automated entries

### 2026-04-16 — CPU Optimization for Log Ingestion

**SSE Batching** — SSE stream now buffers logs and flushes in batches (2s / 50 logs) instead of processing one-by-one. Profile state updates throttled to 10s intervals.

**Hash & Dedup Cache** — Event hashing uses faster field concatenation. New in-memory dedup cache (10K entries/profile) skips DB queries for known hashes.

**Batch Device Upserts** — Device updates consolidated into a single `INSERT ... ON CONFLICT UPDATE` per batch instead of individual queries per device.

**Poller Interval** — Default poller interval increased from 30s to 300s. SSE is the primary source; poller is now a fallback safety-net. Override with `POLL_INTERVAL_SECONDS`.
