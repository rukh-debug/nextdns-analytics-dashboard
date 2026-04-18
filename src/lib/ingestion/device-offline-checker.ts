import { getDb } from "@/lib/db";
import { devices, webhooks, webhookDevices } from "@/lib/db/schema";
import { and, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import { fireWebhooks } from "@/lib/webhooks/trigger";
import { createLogger } from "@/lib/logger";

const log = createLogger("offline-checker");

const DEFAULT_GAP_SECONDS = 1800; // 30 minutes

export class DeviceOfflineChecker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private isFirstRun = true;

  start() {
    log.info("Starting device offline checker");
    this.run();
    this.timer = setInterval(() => this.run(), 5 * 60 * 1000); // every 5 min
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async run() {
    try {
      const db = getDb();

      // 1. Fetch all active webhooks with device_offline trigger
      const allWebhooks = await db.select().from(webhooks);
      const offlineWebhooks = allWebhooks.filter((wh) => {
        if (!wh.isActive) return false;
        const triggers = Array.isArray(wh.triggers) ? wh.triggers : [];
        return triggers.includes("device_offline");
      });

      if (offlineWebhooks.length === 0) return;

      // 2. Load device scopes for these webhooks
      const webhookIds = offlineWebhooks.map((wh) => wh.id) as [string, ...string[]];
      const deviceRows = await db
        .select({ webhookId: webhookDevices.webhookId, deviceId: webhookDevices.deviceId })
        .from(webhookDevices)
        .where(inArray(webhookDevices.webhookId, webhookIds));

      const webhookDeviceMap = new Map<string, string[]>();
      for (const row of deviceRows) {
        const existing = webhookDeviceMap.get(row.webhookId) ?? [];
        existing.push(row.deviceId);
        webhookDeviceMap.set(row.webhookId, existing);
      }

      // 3. Collect unique gap values across all webhooks
      const gapSet = new Set<number>();
      for (const wh of offlineWebhooks) {
        gapSet.add(wh.deviceGapSeconds ?? DEFAULT_GAP_SECONDS);
      }

      // 4. For each unique gap, find qualifying devices
      const now = new Date();
      const notifiedDeviceIds = new Set<string>();

      for (const gapSeconds of gapSet) {
        const cutoff = new Date(now.getTime() - gapSeconds * 1000).toISOString();

        // Devices where: lastSeenAt is not null, lastSeenAt < cutoff, not already notified
        const offlineDevices = await db
          .select({
            id: devices.id,
            name: devices.name,
            model: devices.model,
            localIp: devices.localIp,
            profileId: devices.profileId,
            groupId: devices.groupId,
            lastSeenAt: devices.lastSeenAt,
            offlineNotifiedAt: devices.offlineNotifiedAt,
          })
          .from(devices)
          .where(
            and(
              isNotNull(devices.lastSeenAt),
              lt(devices.lastSeenAt, cutoff),
              or(
                sql`${devices.offlineNotifiedAt} is null`,
                lt(devices.offlineNotifiedAt, devices.lastSeenAt)
              )
            )
          );

        if (offlineDevices.length === 0) continue;

        // 5. First run: baseline only (set offlineNotifiedAt without firing)
        if (this.isFirstRun) {
          const ids = offlineDevices.map((d) => d.id) as [string, ...string[]];
          await db.update(devices)
            .set({ offlineNotifiedAt: now.toISOString(), updatedAt: sql`now()` })
            .where(inArray(devices.id, ids));
          log.info({ count: offlineDevices.length }, "Baseline: marked devices as offline (no webhooks fired)");
          continue;
        }

        // 6. Match devices to webhooks and fire
        for (const wh of offlineWebhooks) {
          const whGap = wh.deviceGapSeconds ?? DEFAULT_GAP_SECONDS;
          if (whGap !== gapSeconds) continue;

          const scopedDeviceIds = webhookDeviceMap.get(wh.id) ?? [];

          for (const device of offlineDevices) {
            if (scopedDeviceIds.length > 0 && !scopedDeviceIds.includes(device.id)) continue;

            const gapSecondsActual = Math.round((now.getTime() - new Date(device.lastSeenAt!).getTime()) / 1000);

            fireWebhooks("device_offline", {
              profileId: device.profileId,
              deviceId: device.id,
              deviceName: device.name,
              model: device.model,
              localIp: device.localIp,
              groupId: device.groupId,
              personId: device.groupId,
              lastSeenAt: device.lastSeenAt,
              gapSeconds: gapSecondsActual,
            }).catch((err) => log.error({ err, deviceId: device.id }, "device_offline webhook error"));

            notifiedDeviceIds.add(device.id);
          }
        }
      }

      // 7. Update offlineNotifiedAt for all notified devices
      if (!this.isFirstRun && notifiedDeviceIds.size > 0) {
        const ids = [...notifiedDeviceIds] as [string, ...string[]];
        await db.update(devices)
          .set({ offlineNotifiedAt: now.toISOString(), updatedAt: sql`now()` })
          .where(inArray(devices.id, ids));
        log.info({ count: notifiedDeviceIds.size }, "Fired device_offline webhooks");
      }

      // Mark first run complete
      if (this.isFirstRun) {
        this.isFirstRun = false;
      }

    } catch (error) {
      log.error({ err: error }, "Offline checker error");
    }
  }
}
