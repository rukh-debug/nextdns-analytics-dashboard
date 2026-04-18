CREATE TABLE "webhook_devices" (
	"id" serial PRIMARY KEY NOT NULL,
	"webhook_id" text NOT NULL,
	"device_id" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "offline_notified_at" text;--> statement-breakpoint
ALTER TABLE "webhooks" ADD COLUMN "device_gap_seconds" integer;--> statement-breakpoint
ALTER TABLE "webhook_devices" ADD CONSTRAINT "webhook_devices_webhook_id_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_devices" ADD CONSTRAINT "webhook_devices_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_webhook_devices_unique" ON "webhook_devices" USING btree ("webhook_id","device_id");--> statement-breakpoint
CREATE INDEX "idx_webhook_devices_webhook_id" ON "webhook_devices" USING btree ("webhook_id");--> statement-breakpoint
CREATE INDEX "idx_webhook_devices_device_id" ON "webhook_devices" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "idx_devices_last_seen_at" ON "devices" USING btree ("last_seen_at");
