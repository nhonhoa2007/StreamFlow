ALTER TABLE "media" ADD COLUMN "metadata" jsonb;
--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "classification_labels" text[] DEFAULT '{}'::text[] NOT NULL;
--> statement-breakpoint
CREATE INDEX "media_classification_labels_gin_idx" ON "media" USING gin ("classification_labels");
