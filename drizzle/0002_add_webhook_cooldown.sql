-- Add cooldown_minutes column to webhooks table for per-webhook deduplication
ALTER TABLE "webhooks" ADD COLUMN "cooldown_minutes" integer DEFAULT 5;
