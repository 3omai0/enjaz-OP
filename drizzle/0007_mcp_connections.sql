CREATE TABLE "mcp_clients" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"redirect_uris" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"client_name" text NOT NULL,
	"scope" text,
	"code_hash" text,
	"code_challenge" text,
	"redirect_uri" text,
	"code_expires_at" timestamp with time zone,
	"refresh_token_hash" text,
	"session_version" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mcp_connections" ADD CONSTRAINT "mcp_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_connections" ADD CONSTRAINT "mcp_connections_client_id_mcp_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."mcp_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mcp_connections_user_idx" ON "mcp_connections" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_connections_code_idx" ON "mcp_connections" USING btree ("code_hash") WHERE "mcp_connections"."code_hash" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_connections_refresh_idx" ON "mcp_connections" USING btree ("refresh_token_hash") WHERE "mcp_connections"."refresh_token_hash" is not null;