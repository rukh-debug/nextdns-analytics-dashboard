# NextDNS Logs API — Complete Guide

> Based on live testing with the NextDNS API (`https://api.nextdns.io`).  
> Authentication: `X-Api-Key` header.

---

## 1. Authentication

Every request must include your API key in the `X-Api-Key` header:

```bash
curl -H "X-Api-Key: YOUR_API_KEY" \
     "https://api.nextdns.io/profiles"
```

---

## 2. Base Endpoint

```
https://api.nextdns.io
```

---

## 3. List Profiles

Before fetching logs, you need a `profile_id`.

**Request:**
```bash
GET /profiles
```

**Example:**
```bash
curl -H "X-Api-Key: YOUR_API_KEY" \
     "https://api.nextdns.io/profiles"
```

**Response:**
```json
{
  "data": [
    {
      "id": "c8cf6e",
      "fingerprint": "fp5b2999f42468071b",
      "role": "owner",
      "name": "Tailscale default"
    },
    {
      "id": "bd19cb",
      "fingerprint": "fp85bcda619c80a9fe",
      "role": "owner",
      "name": "Router default"
    }
  ]
}
```

---

## 4. Fetch Logs

**Endpoint:**
```
GET /profiles/{profile_id}/logs
```

### 4.1 Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `from` | Date | — | Filter logs **on or after** this date |
| `to` | Date | — | Filter logs **before** this date (exclusive) |
| `sort` | `asc` \| `desc` | `desc` | `asc` = oldest first, `desc` = newest first |
| `limit` | Integer | `100` | Results per page. **Min 10, max 1000** |
| `cursor` | String | — | Pagination cursor from `meta.pagination.cursor` |
| `device` | String | — | Filter by device ID. Use `__UNIDENTIFIED__` for unknown devices |
| `status` | `default` \| `blocked` \| `allowed` \| `error` | — | Filter by resolution status |
| `search` | String | — | Domain substring search (e.g. `facebook`) |
| `raw` | Boolean (`0` or `1`) | `0` | `1` = return **all** DNS query types without deduplication |

### 4.2 Date Formats

The `from` and `to` parameters accept multiple formats:

- ISO 8601: `2026-04-13T06:00:00Z`
- Unix timestamp (seconds): `1744524000`
- Unix timestamp (milliseconds): `1744524000000`
- Relative: `-6h`, `-1d`, `-7d`, `-3M`, `now`
- Common date: `2026-04-13`

---

## 5. Response Schema

### 5.1 Top-Level Structure

```json
{
  "data": [ /* array of log entries */ ],
  "meta": {
    "pagination": {
      "cursor": "64vkedhg6mt3cc9r6rtka"
    },
    "stream": {
      "id": "64vkedhg6mt3cctk60v3a"
    }
  }
}
```

- `cursor` is `null` when there are no more pages.

### 5.2 Log Entry Fields

| Field | Type | Present In | Description |
|-------|------|------------|-------------|
| `timestamp` | ISO 8601 string | Always | Exact query time |
| `domain` | string | Always | Full queried domain |
| `root` | string | Always | Root domain |
| `tracker` | string | Often | Classified tracker/service name (e.g. `google`, `reddit`) |
| `type` | string | `raw=1` only | DNS query type: `A`, `AAAA`, `HTTPS`, `CNAME`, `SRV`, etc. |
| `dnssec` | boolean | `raw=1` only | Whether DNSSEC validation was used |
| `encrypted` | boolean | Always | Whether the query was encrypted |
| `protocol` | string | Always | Transport protocol: `DNS-over-HTTPS`, `DNS-over-TLS`, `UDP`, etc. |
| `clientIp` | string | Always | Public/WAN IP that made the query |
| `client` | string | Always | Client tag: `tailscale`, `nextdns-cli`, etc. |
| `device` | object | Always | See device object below |
| `status` | string | Always | `default`, `blocked`, `allowed`, or `error` |
| `reasons` | array | Always | Why it was blocked or allowed. Empty `[]` for `default` |

### 5.3 Device Object

```json
{
  "id": "ngLCC89JMs11CNTRL",
  "name": "laptop",
  "model": "linux",
  "localIp": "100.124.181.41"
}
```

| Field | Description |
|-------|-------------|
| `id` | NextDNS device identifier |
| `name` | Human-readable device name |
| `model` | Device model/OS (`linux`, `windows`, `iPhone`, etc.) |
| `localIp` | Private/local IP address |

### 5.4 Reasons Object

Present inside the `reasons` array when `status` is `blocked` or `allowed`:

```json
{
  "id": "blocklist:adguard-dns-filter",
  "name": "AdGuard DNS filter"
}
```

```json
{
  "id": "allowlist",
  "name": "Allowlist"
}
```

```json
{
  "id": "native:windows",
  "name": "Native Tracking (Windows)"
}
```

---

## 6. Status Values Explained

| Status | Meaning |
|--------|---------|
| `default` | Query resolved normally (no blocklist or allowlist match) |
| `blocked` | Domain was blocked by a blocklist, native tracking rule, or security setting |
| `allowed` | Domain was explicitly allowed by the allowlist |
| `error` | DNS resolution error (e.g. SERVFAIL, NXDOMAIN) |

---

## 7. Default vs. Raw Logs

### Default (`raw=0` or omitted)
- Returns only **navigational** query types (`A`, `AAAA`, `HTTPS`).
- Automatically **deduplicates** repeated queries.
- Filters out "noise" domains (e.g. Chrome random DNS lookups).
- Best for human-readable browsing history.

### Raw (`raw=1`)
- Returns **all** DNS query types (`A`, `AAAA`, `HTTPS`, `CNAME`, `SRV`, `TXT`, etc.).
- **No deduplication** — every single query is listed.
- Includes `type` and `dnssec` fields.
- Best for complete traffic analysis or debugging.

---

## 8. Practical Examples

### 8.1 Get last 50 log entries (default view)
```bash
curl -H "X-Api-Key: YOUR_API_KEY" \
     "https://api.nextdns.io/profiles/c8cf6e/logs?limit=50&sort=desc"
```

### 8.2 Get last 50 log entries (raw view)
```bash
curl -H "X-Api-Key: YOUR_API_KEY" \
     "https://api.nextdns.io/profiles/c8cf6e/logs?limit=50&sort=desc&raw=1"
```

### 8.3 Get only blocked queries
```bash
curl -H "X-Api-Key: YOUR_API_KEY" \
     "https://api.nextdns.io/profiles/c8cf6e/logs?limit=100&sort=desc&status=blocked"
```

### 8.4 Get only allowed queries
```bash
curl -H "X-Api-Key: YOUR_API_KEY" \
     "https://api.nextdns.io/profiles/c8cf6e/logs?limit=100&sort=desc&status=allowed"
```

### 8.5 Filter by device
```bash
curl -H "X-Api-Key: YOUR_API_KEY" \
     "https://api.nextdns.io/profiles/c8cf6e/logs?limit=100&sort=desc&device=ngLCC89JMs11CNTRL"
```

### 8.6 Search for a domain substring
```bash
curl -H "X-Api-Key: YOUR_API_KEY" \
     "https://api.nextdns.io/profiles/c8cf6e/logs?limit=100&sort=desc&search=facebook"
```

### 8.7 Get logs from the last 24 hours
```bash
curl -H "X-Api-Key: YOUR_API_KEY" \
     "https://api.nextdns.io/profiles/c8cf6e/logs?limit=1000&sort=desc&from=-1d"
```

### 8.8 Get logs for a specific date range
```bash
curl -H "X-Api-Key: YOUR_API_KEY" \
     "https://api.nextdns.io/profiles/c8cf6e/logs?limit=1000&sort=desc&from=2026-04-01T00:00:00Z&to=2026-04-02T00:00:00Z"
```

---

## 9. Pagination

To fetch **all** logs across pages:

1. Make the initial request (e.g. `limit=1000`).
2. Check `meta.pagination.cursor`.
3. If `cursor` is not `null`, make the next request with `?cursor=CURSOR_VALUE`.
4. Repeat until `cursor` is `null`.

**Example:**
```bash
# Page 1
curl -H "X-Api-Key: YOUR_API_KEY" \
     "https://api.nextdns.io/profiles/c8cf6e/logs?limit=1000&sort=desc"

# Page 2 (using cursor from page 1 response)
curl -H "X-Api-Key: YOUR_API_KEY" \
     "https://api.nextdns.io/profiles/c8cf6e/logs?limit=1000&sort=desc&cursor=64vkedhg6mt3cc9r6rtka"
```

---

## 10. What You Get vs. What You Don't

### Included
- Exact timestamp of every DNS query
- Full domain and root domain
- Device identity (`id`, `name`, `model`, `localIp`)
- Public client IP (`clientIp`)
- Query protocol and encryption status
- Block/allow status and reasons
- DNS query type and DNSSEC flag (with `raw=1`)

### NOT Included
- **Resolved IP addresses** (the A/AAAA record answers are not returned)
- Query response time / latency
- Geo-location of the resolver used
- Full HTTP payload or SNI data

---

## 11. Full Live Response Examples

### Default log entry
```json
{
  "timestamp": "2026-04-13T06:37:40.892Z",
  "domain": "api.kimi.com",
  "root": "kimi.com",
  "encrypted": true,
  "protocol": "DNS-over-HTTPS",
  "clientIp": "99.234.138.84",
  "client": "tailscale",
  "device": {
    "id": "ngLCC89JMs11CNTRL",
    "name": "laptop",
    "model": "linux",
    "localIp": "100.124.181.41"
  },
  "status": "default",
  "reasons": []
}
```

### Blocked log entry
```json
{
  "timestamp": "2026-04-13T06:31:22.741Z",
  "domain": "error-tracking.reddit.com",
  "root": "reddit.com",
  "tracker": "reddit",
  "encrypted": true,
  "protocol": "DNS-over-HTTPS",
  "clientIp": "99.234.138.84",
  "client": "tailscale",
  "device": {
    "id": "ngLCC89JMs11CNTRL",
    "name": "laptop",
    "model": "linux",
    "localIp": "100.124.181.41"
  },
  "status": "blocked",
  "reasons": [
    {
      "id": "blocklist:adguard-dns-filter",
      "name": "AdGuard DNS filter"
    }
  ]
}
```

### Allowed log entry
```json
{
  "timestamp": "2026-04-13T06:12:38.331Z",
  "domain": "ogads-pa.clients6.google.com",
  "root": "google.com",
  "tracker": "google",
  "encrypted": true,
  "protocol": "DNS-over-HTTPS",
  "clientIp": "99.234.138.84",
  "client": "tailscale",
  "device": {
    "id": "ngLCC89JMs11CNTRL",
    "name": "laptop",
    "model": "linux",
    "localIp": "100.124.181.41"
  },
  "status": "allowed",
  "reasons": [
    {
      "id": "allowlist",
      "name": "Allowlist"
    }
  ]
}
```

### Raw log entry (`raw=1`)
```json
{
  "timestamp": "2026-04-13T06:37:39.126Z",
  "domain": "api.nextdns.io",
  "root": "nextdns.io",
  "type": "AAAA",
  "dnssec": true,
  "encrypted": true,
  "protocol": "DNS-over-HTTPS",
  "clientIp": "99.234.138.84",
  "client": "tailscale",
  "device": {
    "id": "ngLCC89JMs11CNTRL",
    "name": "laptop",
    "model": "linux",
    "localIp": "100.124.181.41"
  },
  "status": "default",
  "reasons": []
}
```

---

## 12. Python Script Example

```python
import requests

API_KEY = "YOUR_API_KEY"
PROFILE_ID = "c8cf6e"
HEADERS = {"X-Api-Key": API_KEY}

url = f"https://api.nextdns.io/profiles/{PROFILE_ID}/logs"
params = {
    "limit": 100,
    "sort": "desc",
    "raw": 1,
    "from": "-1d"
}

resp = requests.get(url, headers=HEADERS, params=params)
data = resp.json()

for entry in data.get("data", []):
    print(f"[{entry['timestamp']}] {entry['device']['name']} -> {entry['domain']} ({entry['status']})")
```

---

## 13. Error Handling

If you use an invalid `limit` (e.g. below 10), the API returns:

```json
{
  "errors": [
    {
      "code": "minimum",
      "source": {
        "parameter": "limit"
      },
      "detail": "`limit` must be >= 10."
    }
  ]
}
```

Always check `resp.status_code` and the presence of `errors` in the JSON body.

---

## 14. Summary

- The NextDNS Logs API gives you **complete query history** (timestamps, domains, devices, IPs, statuses, block reasons).
- You can filter by **date, device, status, and domain substring**.
- Use **pagination** with `cursor` to pull large datasets.
- Use **`raw=1`** to see every single DNS query type without deduplication.
- The **only major missing piece** is the actual DNS answer (resolved IP addresses).
