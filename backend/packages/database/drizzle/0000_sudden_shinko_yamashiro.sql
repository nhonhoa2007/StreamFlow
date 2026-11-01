CREATE TYPE "public"."media_status" AS ENUM('DRAFT', 'READY');--> statement-breakpoint
CREATE TYPE "public"."media_type" AS ENUM('AUDIO', 'VIDEO');--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "media_type" NOT NULL,
	"title" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"status" "media_status" DEFAULT 'DRAFT' NOT NULL,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "media_slug_idx" ON "media" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "media_status_created_at_idx" ON "media" USING btree ("status","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);