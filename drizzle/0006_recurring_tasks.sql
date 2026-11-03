CREATE TYPE "public"."recurrence" AS ENUM('daily', 'weekly', 'monthly', 'yearly');--> statement-breakpoint
CREATE TABLE "recurring_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"created_by" uuid,
	"title" text NOT NULL,
	"description" text,
	"priority" "task_priority" DEFAULT 'medium' NOT NULL,
	"assignee_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"label_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recurrence" "recurrence" NOT NULL,
	"minute_of_day" integer DEFAULT 540 NOT NULL,
	"weekdays" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"day_of_month" integer,
	"month" integer,
	"enabled" boolean DEFAULT true NOT NULL,
	"next_at" timestamp with time zone NOT NULL,
	"last_fired_at" timestamp with time zone,
	"fire_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recurring_tasks" ADD CONSTRAINT "recurring_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_tasks" ADD CONSTRAINT "recurring_tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_tasks_project_idx" ON "recurring_tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "recurring_tasks_due_idx" ON "recurring_tasks" USING btree ("enabled","next_at");