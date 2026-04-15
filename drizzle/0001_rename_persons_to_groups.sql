-- Rename persons table to groups
ALTER TABLE "persons" RENAME TO "groups";
--> statement-breakpoint
-- Rename person_id column in devices to group_id
ALTER TABLE "devices" RENAME COLUMN "person_id" TO "group_id";
--> statement-breakpoint
-- Rename person_id column in webhooks to group_id
ALTER TABLE "webhooks" RENAME COLUMN "person_id" TO "group_id";
--> statement-breakpoint
-- Update FK constraint names (PostgreSQL auto-renames on table rename, but update column refs)
ALTER TABLE "devices" DROP CONSTRAINT IF EXISTS "devices_person_id_persons_id_fk";
--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "webhooks" DROP CONSTRAINT IF EXISTS "webhooks_person_id_persons_id_fk";
--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;
