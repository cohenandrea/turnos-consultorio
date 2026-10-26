CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'owner' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"session_version" integer DEFAULT 1 NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"coverage_id" integer NOT NULL,
	"consultation_type_id" integer NOT NULL,
	"location_id" integer NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"block_end_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"source" text DEFAULT 'web' NOT NULL,
	"contact_name" text NOT NULL,
	"contact_phone" text NOT NULL,
	"contact_email" text,
	"member_number" text,
	"consent_reminders" boolean DEFAULT false NOT NULL,
	"attendance_confirmed_at" timestamp with time zone,
	"reschedule_count" integer DEFAULT 0 NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" text,
	"manage_token_hash" text NOT NULL,
	"manage_token_enc" text NOT NULL,
	"manage_token_revoked_at" timestamp with time zone,
	"google_event_id" text,
	"google_calendar_id" text,
	"google_sync_status" text DEFAULT 'pending' NOT NULL,
	"google_sync_attempts" integer DEFAULT 0 NOT NULL,
	"google_sync_error" text,
	"google_next_attempt_at" timestamp with time zone,
	"sync_version" integer DEFAULT 1 NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"review_reason" text,
	"admin_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity" text,
	"entity_id" text,
	"details" jsonb
);
--> statement-breakpoint
CREATE TABLE "consultation_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"duration_minutes" integer DEFAULT 30 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "consultation_types_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "coverages" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'prepaga' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"requires_member_number" boolean DEFAULT true NOT NULL,
	"requires_birth_date" boolean DEFAULT false NOT NULL,
	"instructions" text,
	"allowed_consultation_type_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allowed_location_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allowed_weekdays" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"time_from" text,
	"time_to" text,
	"duration_override_minutes" integer,
	CONSTRAINT "coverages_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "google_integration" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"account_email" text,
	"refresh_token_enc" text,
	"access_token_enc" text,
	"access_token_expires_at" timestamp with time zone,
	"calendar_id" text,
	"calendar_summary" text,
	"extra_busy_calendar_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"connected_at" timestamp with time zone,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"last_error_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"maps_url" text,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_templates" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"body" text NOT NULL,
	"email_subject" text NOT NULL,
	"whatsapp_template_name" text,
	"whatsapp_language" text DEFAULT 'es_AR' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid,
	"waitlist_id" integer,
	"kind" text NOT NULL,
	"channel" text NOT NULL,
	"recipient" text NOT NULL,
	"payload" jsonb,
	"scheduled_for" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"last_error" text,
	"provider_message_id" text,
	"sent_at" timestamp with time zone,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target" text NOT NULL,
	"channel" text NOT NULL,
	"code_hash" text NOT NULL,
	"patient_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"dni" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"birth_date" date,
	"coverage_id" integer,
	"member_number" text,
	"consent_reminders" boolean DEFAULT false NOT NULL,
	"consent_at" timestamp with time zone,
	"privacy_accepted_at" timestamp with time zone,
	"admin_notes" text,
	"anonymized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_exceptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"location_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_id" integer NOT NULL,
	"weekday" integer NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"professional_name" text NOT NULL,
	"specialty" text NOT NULL,
	"bio" text,
	"photo_url" text,
	"whatsapp_contact" text,
	"contact_email" text,
	"attention_info" text,
	"primary_color" text DEFAULT '#5b7f6e' NOT NULL,
	"accent_color" text DEFAULT '#c98b6b' NOT NULL,
	"timezone" text DEFAULT 'America/Argentina/Buenos_Aires' NOT NULL,
	"slot_interval_minutes" integer DEFAULT 30 NOT NULL,
	"buffer_minutes" integer DEFAULT 0 NOT NULL,
	"min_notice_hours" integer DEFAULT 12 NOT NULL,
	"max_advance_days" integer DEFAULT 60 NOT NULL,
	"max_active_per_patient" integer DEFAULT 1 NOT NULL,
	"cancel_limit_hours" integer DEFAULT 24 NOT NULL,
	"reschedule_limit_hours" integer DEFAULT 24 NOT NULL,
	"reminder_48_enabled" boolean DEFAULT true NOT NULL,
	"reminder_24_enabled" boolean DEFAULT true NOT NULL,
	"reminder_window_start" text DEFAULT '08:00' NOT NULL,
	"reminder_window_end" text DEFAULT '21:00' NOT NULL,
	"google_on_cancel" text DEFAULT 'delete' NOT NULL,
	"google_external_change" text DEFAULT 'review' NOT NULL,
	"google_all_day_blocks" boolean DEFAULT true NOT NULL,
	"event_title_format" text DEFAULT 'name' NOT NULL,
	"waitlist_enabled" boolean DEFAULT true NOT NULL,
	"data_controller_name" text,
	"privacy_extra" text,
	"last_cron_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waitlist" (
	"id" serial PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"coverage_id" integer NOT NULL,
	"consultation_type_id" integer NOT NULL,
	"wants_before" timestamp with time zone,
	"time_preference" text DEFAULT 'any' NOT NULL,
	"consent" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"notify_count" integer DEFAULT 0 NOT NULL,
	"last_notified_at" timestamp with time zone,
	"remove_token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_coverage_id_coverages_id_fk" FOREIGN KEY ("coverage_id") REFERENCES "public"."coverages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_consultation_type_id_consultation_types_id_fk" FOREIGN KEY ("consultation_type_id") REFERENCES "public"."consultation_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_coverage_id_coverages_id_fk" FOREIGN KEY ("coverage_id") REFERENCES "public"."coverages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "schedule_exceptions_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_rules" ADD CONSTRAINT "schedule_rules_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_coverage_id_coverages_id_fk" FOREIGN KEY ("coverage_id") REFERENCES "public"."coverages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_consultation_type_id_consultation_types_id_fk" FOREIGN KEY ("consultation_type_id") REFERENCES "public"."consultation_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointments_start_idx" ON "appointments" USING btree ("start_at");--> statement-breakpoint
CREATE INDEX "appointments_patient_idx" ON "appointments" USING btree ("patient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "appointments_token_idx" ON "appointments" USING btree ("manage_token_hash");--> statement-breakpoint
CREATE INDEX "appointments_sync_idx" ON "appointments" USING btree ("google_sync_status");--> statement-breakpoint
CREATE INDEX "audit_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_idx" ON "notifications" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "notifications_due_idx" ON "notifications" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "notifications_provider_idx" ON "notifications" USING btree ("provider_message_id");--> statement-breakpoint
CREATE INDEX "otp_target_idx" ON "otp_codes" USING btree ("target");--> statement-breakpoint
CREATE UNIQUE INDEX "patients_dni_idx" ON "patients" USING btree ("dni");--> statement-breakpoint
CREATE INDEX "patients_phone_idx" ON "patients" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "patients_email_idx" ON "patients" USING btree ("email");--> statement-breakpoint
CREATE INDEX "schedule_exceptions_range_idx" ON "schedule_exceptions" USING btree ("start_at","end_at");