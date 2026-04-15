CREATE TABLE "alert_tags" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"color" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "analytics_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" text NOT NULL,
	"snapshot_date" text NOT NULL,
	"period" text NOT NULL,
	"type" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" text PRIMARY KEY NOT NULL,
	"profile_id" text NOT NULL,
	"name" text NOT NULL,
	"model" text,
	"local_ip" text,
	"person_id" text,
	"last_seen_at" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "dns_log_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"log_id" integer NOT NULL,
	"tag_id" text NOT NULL,
	"list_id" text NOT NULL,
	"matched_domain" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "dns_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" text NOT NULL,
	"event_hash" text NOT NULL,
	"device_id" text,
	"device_name" text,
	"device_model" text,
	"device_local_ip" text,
	"timestamp" text NOT NULL,
	"domain" text NOT NULL,
	"root_domain" text,
	"tracker" text,
	"status" text NOT NULL,
	"query_type" text,
	"dnssec" boolean,
	"encrypted" boolean DEFAULT false,
	"protocol" text,
	"client_ip" text,
	"client_name" text,
	"is_flagged" boolean DEFAULT false,
	"flag_reason" text,
	"reasons" jsonb,
	"ingested_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "domain_list_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"list_id" text NOT NULL,
	"domain" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "domain_lists" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tag_id" text NOT NULL,
	"source_type" text NOT NULL,
	"source_url" text,
	"is_system" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"last_fetched_at" text,
	"last_fetch_status" text DEFAULT 'idle',
	"last_fetch_error" text,
	"entry_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "persons" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"icon" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"fingerprint" text,
	"api_key" text NOT NULL,
	"is_active" boolean DEFAULT false,
	"last_ingested_at" text,
	"last_stream_id" text,
	"bootstrap_status" text DEFAULT 'idle',
	"bootstrap_cursor" text,
	"bootstrap_window_start" text,
	"bootstrap_window_end" text,
	"bootstrap_cutoff_at" text,
	"bootstrap_completed_at" text,
	"last_successful_poll_at" text,
	"last_successful_stream_at" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "webhook_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"webhook_id" text NOT NULL,
	"tag_id" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"secret" text,
	"is_active" boolean DEFAULT true,
	"triggers" jsonb NOT NULL,
	"person_id" text,
	"last_triggered_at" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "analytics_snapshots" ADD CONSTRAINT "analytics_snapshots_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dns_log_tags" ADD CONSTRAINT "dns_log_tags_log_id_dns_logs_id_fk" FOREIGN KEY ("log_id") REFERENCES "public"."dns_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dns_log_tags" ADD CONSTRAINT "dns_log_tags_tag_id_alert_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."alert_tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dns_log_tags" ADD CONSTRAINT "dns_log_tags_list_id_domain_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."domain_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dns_logs" ADD CONSTRAINT "dns_logs_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dns_logs" ADD CONSTRAINT "dns_logs_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_list_entries" ADD CONSTRAINT "domain_list_entries_list_id_domain_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."domain_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_lists" ADD CONSTRAINT "domain_lists_tag_id_alert_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."alert_tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_tags" ADD CONSTRAINT "webhook_tags_webhook_id_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhooks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_tags" ADD CONSTRAINT "webhook_tags_tag_id_alert_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."alert_tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_alert_tags_name" ON "alert_tags" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_alert_tags_slug" ON "alert_tags" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_snapshot_unique" ON "analytics_snapshots" USING btree ("profile_id","snapshot_date","period","type");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_dns_log_tags_unique" ON "dns_log_tags" USING btree ("log_id","tag_id","list_id","matched_domain");--> statement-breakpoint
CREATE INDEX "idx_dns_log_tags_log_id" ON "dns_log_tags" USING btree ("log_id");--> statement-breakpoint
CREATE INDEX "idx_dns_log_tags_tag_id" ON "dns_log_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_dns_logs_event_hash" ON "dns_logs" USING btree ("profile_id","event_hash");--> statement-breakpoint
CREATE INDEX "idx_dns_logs_timestamp" ON "dns_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_dns_logs_profile_timestamp" ON "dns_logs" USING btree ("profile_id","timestamp");--> statement-breakpoint
CREATE INDEX "idx_dns_logs_domain" ON "dns_logs" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "idx_dns_logs_device" ON "dns_logs" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "idx_dns_logs_status" ON "dns_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_dns_logs_flagged" ON "dns_logs" USING btree ("is_flagged");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_domain_list_entries_unique" ON "domain_list_entries" USING btree ("list_id","domain");--> statement-breakpoint
CREATE INDEX "idx_domain_list_entries_domain" ON "domain_list_entries" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "idx_domain_lists_tag_id" ON "domain_lists" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_webhook_tags_unique" ON "webhook_tags" USING btree ("webhook_id","tag_id");--> statement-breakpoint
CREATE INDEX "idx_webhook_tags_webhook_id" ON "webhook_tags" USING btree ("webhook_id");--> statement-breakpoint
CREATE INDEX "idx_webhook_tags_tag_id" ON "webhook_tags" USING btree ("tag_id");