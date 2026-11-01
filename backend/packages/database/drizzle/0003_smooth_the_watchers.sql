CREATE TYPE "public"."asset_kind" AS ENUM('SOURCE_AUDIO', 'SOURCE_VIDEO', 'THUMBNAIL', 'HLS_PLAYLIST', 'HLS_SEGMENT');--> statement-breakpoint
CREATE TYPE "public"."upload_session_status" AS ENUM('UPLOADING', 'UPLOADED', 'EXPIRED', 'FAILED');--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_id" uuid NOT NULL,
	"kind" "asset_kind" NOT NULL,
	"object_key" varchar(255) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"mime_type" varchar(128) NOT NULL,
	"checksum" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upload_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"media_id" uuid,
	"object_key" varchar(255) NOT NULL,
	"filename" varchar(255) NOT NULL,
	"mime_type" varchar(128) NOT NULL,
	"expected_size" bigint NOT NULL,
	"status" "upload_session_status" DEFAULT 'UPLOADING' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_object_key_idx" ON "media_assets" USING btree ("object_key");--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_media_kind_key_idx" ON "media_assets" USING btree ("media_id","kind","object_key");--> statement-breakpoint
CREATE UNIQUE INDEX "upload_sessions_object_key_idx" ON "upload_sessions" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "upload_sessions_status_expires_idx" ON "upload_sessions" USING btree ("status","expires_at");