CREATE TYPE "public"."artist_role" AS ENUM('MAIN', 'FEATURED', 'PRODUCER');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('USER', 'ADMIN');--> statement-breakpoint
CREATE TABLE "albums" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"artist_id" uuid,
	"release_year" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"bio" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_artists" (
	"media_id" uuid NOT NULL,
	"artist_id" uuid NOT NULL,
	"role" "artist_role" DEFAULT 'MAIN' NOT NULL,
	CONSTRAINT "media_artists_media_id_artist_id_pk" PRIMARY KEY("media_id","artist_id")
);
--> statement-breakpoint
CREATE TABLE "refresh_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"role" "user_role" DEFAULT 'USER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "album_id" uuid;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "albums" ADD CONSTRAINT "albums_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_artists" ADD CONSTRAINT "media_artists_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_artists" ADD CONSTRAINT "media_artists_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "albums_slug_idx" ON "albums" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "artists_slug_idx" ON "artists" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "media_artists_artist_id_idx" ON "media_artists" USING btree ("artist_id");--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_sessions_token_hash_idx" ON "refresh_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "refresh_sessions_user_revoked_idx" ON "refresh_sessions" USING btree ("user_id","revoked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_status_published_at_idx" ON "media" USING btree ("status","published_at" DESC NULLS LAST,"id" DESC NULLS LAST);