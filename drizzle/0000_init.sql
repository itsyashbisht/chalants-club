CREATE TYPE "public"."audit_actor" AS ENUM('user', 'system', 'provider');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('queued', 'sent', 'failed', 'recorded');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('host', 'reviewer', 'finance', 'operator');--> statement-breakpoint
CREATE TYPE "public"."departure_status" AS ENUM('draft', 'published', 'closed', 'cancelled', 'completed');--> statement-breakpoint
CREATE TYPE "public"."booking_state" AS ENUM('HELD', 'UNDER_REVIEW', 'BALANCE_DUE', 'CONFIRMED', 'EXPIRED', 'REJECTED', 'CANCELLED', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."cancellation_origin" AS ENUM('traveller', 'operator', 'rejection', 'balance_timeout', 'departure_cancelled');--> statement-breakpoint
CREATE TYPE "public"."review_call_status" AS ENUM('none', 'requested', 'scheduled', 'done', 'inconclusive');--> statement-breakpoint
CREATE TYPE "public"."review_decision" AS ENUM('pending', 'info_requested', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."allocation_outcome" AS ENUM('applied', 'unapplied_late', 'unapplied_duplicate', 'unapplied_mismatch');--> statement-breakpoint
CREATE TYPE "public"."inbox_status" AS ENUM('received', 'processed', 'quarantined', 'failed');--> statement-breakpoint
CREATE TYPE "public"."instalment_kind" AS ENUM('deposit', 'balance');--> statement-breakpoint
CREATE TYPE "public"."instalment_status" AS ENUM('pending', 'paid', 'void');--> statement-breakpoint
CREATE TYPE "public"."order_request_state" AS ENUM('leased', 'created', 'uncertain', 'superseded', 'paid', 'void');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'processing', 'delivered', 'failed');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('created', 'authorized', 'captured', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."provider_mode" AS ENUM('test', 'live');--> statement-breakpoint
CREATE TYPE "public"."refund_state" AS ENUM('requested', 'processing', 'processed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."support_status" AS ENUM('open', 'in_progress', 'closed');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_type" "audit_actor" NOT NULL,
	"actor_user_id" uuid,
	"operation" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"recipient" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" "email_status" NOT NULL,
	"provider_message_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text NOT NULL,
	"operation" text NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_leases" (
	"name" text PRIMARY KEY NOT NULL,
	"lease_id" text NOT NULL,
	"leased_until" timestamp with time zone NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_result" jsonb
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role" "user_role" NOT NULL,
	"granted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"mfa_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "departure_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"departure_id" uuid NOT NULL,
	"question" text NOT NULL,
	"option_id" text NOT NULL,
	"fact" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"host_id" uuid NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"status" "departure_status" DEFAULT 'draft' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"sales_close_at" timestamp with time zone NOT NULL,
	"capacity" integer NOT NULL,
	"min_age" integer NOT NULL,
	"max_age" integer NOT NULL,
	"total_paise" integer NOT NULL,
	"deposit_bps" integer NOT NULL,
	"hold_minutes" integer DEFAULT 15 NOT NULL,
	"review_hours" integer DEFAULT 48 NOT NULL,
	"balance_window_hours" integer DEFAULT 24 NOT NULL,
	"taxes_note" text DEFAULT 'Prices are tax-inclusive.' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_pilot_fixture" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "departures_capacity_positive" CHECK ("departures"."capacity" > 0),
	CONSTRAINT "departures_age_range" CHECK ("departures"."min_age" >= 18 and "departures"."max_age" >= "departures"."min_age"),
	CONSTRAINT "departures_total_positive" CHECK ("departures"."total_paise" > 0),
	CONSTRAINT "departures_deposit_bps_range" CHECK ("departures"."deposit_bps" between 1 and 9999),
	CONSTRAINT "departures_dates_ordered" CHECK ("departures"."end_date" >= "departures"."start_date"),
	CONSTRAINT "departures_windows_positive" CHECK ("departures"."hold_minutes" > 0 and "departures"."review_hours" > 0 and "departures"."balance_window_hours" > 0)
);
--> statement-breakpoint
CREATE TABLE "host_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"departure_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hosts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"bio" text NOT NULL,
	"photo_url" text,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "itinerary_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"day_number" integer NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"version" integer NOT NULL,
	"rules" jsonb NOT NULL,
	"is_pilot_fixture" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"destination" text NOT NULL,
	"region" text NOT NULL,
	"summary" text NOT NULL,
	"description" text NOT NULL,
	"hero_image_url" text,
	"hero_image_alt" text,
	"hero_image_credit" text,
	"duration_days" integer NOT NULL,
	"meeting_point_area" text NOT NULL,
	"room_plan" text NOT NULL,
	"pace" text NOT NULL,
	"inclusions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"extra_costs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"optional_activities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_pilot" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trips_duration_positive" CHECK ("trips"."duration_days" > 0)
);
--> statement-breakpoint
CREATE TABLE "waitlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"departure_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"user_id" uuid,
	"consent_at" timestamp with time zone NOT NULL,
	"invited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"version" text NOT NULL,
	"answers" jsonb NOT NULL,
	"track_title" text,
	"track_artist" text,
	"track_consent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"departure_id" uuid NOT NULL,
	"state" "booking_state" NOT NULL,
	"hold_expires_at" timestamp with time zone,
	"review_due_at" timestamp with time zone,
	"balance_due_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"total_paise" integer NOT NULL,
	"deposit_paise" integer NOT NULL,
	"balance_paise" integer NOT NULL,
	"quote_version" integer NOT NULL,
	"taxes_note" text NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"policy_rules" jsonb NOT NULL,
	"quiz_snapshot" jsonb,
	"traveller_age" integer NOT NULL,
	"single_attested_at" timestamp with time zone NOT NULL,
	"conduct_accepted_at" timestamp with time zone NOT NULL,
	"policy_accepted_at" timestamp with time zone NOT NULL,
	"client_operation_key" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_amounts_positive" CHECK ("bookings"."total_paise" > 0 and "bookings"."deposit_paise" > 0 and "bookings"."balance_paise" > 0),
	CONSTRAINT "bookings_amounts_sum" CHECK ("bookings"."deposit_paise" + "bookings"."balance_paise" = "bookings"."total_paise"),
	CONSTRAINT "bookings_age_adult" CHECK ("bookings"."traveller_age" >= 18)
);
--> statement-breakpoint
CREATE TABLE "cancel_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"booking_revision" integer NOT NULL,
	"refund_paise" integer NOT NULL,
	"breakdown" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cancellations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"origin" "cancellation_origin" NOT NULL,
	"quote_id" uuid,
	"captured_paise" integer NOT NULL,
	"refund_paise" integer NOT NULL,
	"breakdown" jsonb NOT NULL,
	"actor_user_id" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"reason_code" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"reviewer_id" uuid,
	"call_status" "review_call_status" DEFAULT 'none' NOT NULL,
	"call_request_note" text,
	"call_requested_at" timestamp with time zone,
	"decision" "review_decision" DEFAULT 'pending' NOT NULL,
	"reason_code" text,
	"note" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"escalated_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_attempt_id" uuid NOT NULL,
	"instalment_id" uuid,
	"booking_id" uuid,
	"outcome" "allocation_outcome" NOT NULL,
	"amount_paise" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gateway_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instalment_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"mode" "provider_mode" NOT NULL,
	"receipt" text NOT NULL,
	"operation_key" text NOT NULL,
	"provider_order_id" text,
	"request_state" "order_request_state" DEFAULT 'leased' NOT NULL,
	"lease_expires_at" timestamp with time zone,
	"amount_paise" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instalments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"kind" "instalment_kind" NOT NULL,
	"amount_paise" integer NOT NULL,
	"status" "instalment_status" DEFAULT 'pending' NOT NULL,
	"due_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instalments_amount_positive" CHECK ("instalments"."amount_paise" > 0)
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"transition_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payment_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" "provider_mode" NOT NULL,
	"provider_payment_id" text NOT NULL,
	"provider_order_id" text,
	"gateway_order_id" uuid,
	"booking_id" uuid,
	"amount_paise" integer NOT NULL,
	"currency" text NOT NULL,
	"status" "payment_status" NOT NULL,
	"method" text,
	"source" text NOT NULL,
	"captured_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"error_code" text,
	"error_description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_attempt_id" uuid NOT NULL,
	"booking_id" uuid,
	"cancellation_id" uuid,
	"mode" "provider_mode" NOT NULL,
	"amount_paise" integer NOT NULL,
	"reason" text NOT NULL,
	"origin" text DEFAULT 'app' NOT NULL,
	"request_body" jsonb,
	"request_fingerprint" text,
	"idempotency_key" text NOT NULL,
	"receipt" text,
	"provider_refund_id" text,
	"state" "refund_state" DEFAULT 'requested' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"last_error" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_amount_positive" CHECK ("refunds"."amount_paise" > 0)
);
--> statement-breakpoint
CREATE TABLE "webhook_inbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text DEFAULT 'razorpay' NOT NULL,
	"mode" "provider_mode" NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"provider_payment_id" text,
	"provider_order_id" text,
	"provider_refund_id" text,
	"payload" jsonb NOT NULL,
	"status" "inbox_status" DEFAULT 'received' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"last_error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "circle_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"departure_id" uuid NOT NULL,
	"share_welcome_preference" boolean DEFAULT false NOT NULL,
	"welcome_preference_option_id" text,
	"share_rotation_preference" boolean DEFAULT false NOT NULL,
	"rotation_preference_option_id" text,
	"intro" text,
	"contact_share_revoked_at" timestamp with time zone,
	"attended" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "circle_tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"departure_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"artist" text NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reconnect_choices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"departure_id" uuid NOT NULL,
	"from_user_id" uuid NOT NULL,
	"to_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reconnect_choices_no_self" CHECK ("reconnect_choices"."from_user_id" <> "reconnect_choices"."to_user_id")
);
--> statement-breakpoint
CREATE TABLE "support_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"booking_id" uuid,
	"email" text NOT NULL,
	"name" text,
	"category" text NOT NULL,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"status" "support_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departure_tags" ADD CONSTRAINT "departure_tags_departure_id_departures_id_fk" FOREIGN KEY ("departure_id") REFERENCES "public"."departures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departures" ADD CONSTRAINT "departures_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departures" ADD CONSTRAINT "departures_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departures" ADD CONSTRAINT "departures_policy_version_id_policy_versions_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."policy_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_assignments" ADD CONSTRAINT "host_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_assignments" ADD CONSTRAINT "host_assignments_departure_id_departures_id_fk" FOREIGN KEY ("departure_id") REFERENCES "public"."departures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosts" ADD CONSTRAINT "hosts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_days" ADD CONSTRAINT "itinerary_days_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_departure_id_departures_id_fk" FOREIGN KEY ("departure_id") REFERENCES "public"."departures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_submissions" ADD CONSTRAINT "quiz_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_departure_id_departures_id_fk" FOREIGN KEY ("departure_id") REFERENCES "public"."departures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_policy_version_id_policy_versions_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."policy_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cancel_quotes" ADD CONSTRAINT "cancel_quotes_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cancellations" ADD CONSTRAINT "cancellations_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cancellations" ADD CONSTRAINT "cancellations_quote_id_cancel_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."cancel_quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cancellations" ADD CONSTRAINT "cancellations_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_actions" ADD CONSTRAINT "review_actions_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_actions" ADD CONSTRAINT "review_actions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_payment_attempt_id_payment_attempts_id_fk" FOREIGN KEY ("payment_attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_instalment_id_instalments_id_fk" FOREIGN KEY ("instalment_id") REFERENCES "public"."instalments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateway_orders" ADD CONSTRAINT "gateway_orders_instalment_id_instalments_id_fk" FOREIGN KEY ("instalment_id") REFERENCES "public"."instalments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateway_orders" ADD CONSTRAINT "gateway_orders_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instalments" ADD CONSTRAINT "instalments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_gateway_order_id_gateway_orders_id_fk" FOREIGN KEY ("gateway_order_id") REFERENCES "public"."gateway_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_attempt_id_payment_attempts_id_fk" FOREIGN KEY ("payment_attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_cancellation_id_cancellations_id_fk" FOREIGN KEY ("cancellation_id") REFERENCES "public"."cancellations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_preferences" ADD CONSTRAINT "circle_preferences_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_preferences" ADD CONSTRAINT "circle_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_preferences" ADD CONSTRAINT "circle_preferences_departure_id_departures_id_fk" FOREIGN KEY ("departure_id") REFERENCES "public"."departures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_tracks" ADD CONSTRAINT "circle_tracks_departure_id_departures_id_fk" FOREIGN KEY ("departure_id") REFERENCES "public"."departures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_tracks" ADD CONSTRAINT "circle_tracks_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "circle_tracks" ADD CONSTRAINT "circle_tracks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconnect_choices" ADD CONSTRAINT "reconnect_choices_departure_id_departures_id_fk" FOREIGN KEY ("departure_id") REFERENCES "public"."departures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconnect_choices" ADD CONSTRAINT "reconnect_choices_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconnect_choices" ADD CONSTRAINT "reconnect_choices_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_cases" ADD CONSTRAINT "support_cases_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_cases" ADD CONSTRAINT "support_cases_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "email_deliveries_key_idx" ON "email_deliveries" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "email_deliveries_recipient_idx" ON "email_deliveries" USING btree ("recipient");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_scope_idx" ON "idempotency_keys" USING btree ("actor_id","operation","key");--> statement-breakpoint
CREATE UNIQUE INDEX "users_clerk_user_id_idx" ON "users" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "departure_tags_unique_idx" ON "departure_tags" USING btree ("departure_id","question","option_id");--> statement-breakpoint
CREATE INDEX "departures_trip_idx" ON "departures" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "departures_status_start_idx" ON "departures" USING btree ("status","start_date");--> statement-breakpoint
CREATE UNIQUE INDEX "host_assignments_unique_idx" ON "host_assignments" USING btree ("user_id","departure_id");--> statement-breakpoint
CREATE UNIQUE INDEX "itinerary_days_trip_day_idx" ON "itinerary_days" USING btree ("trip_id","day_number");--> statement-breakpoint
CREATE UNIQUE INDEX "policy_versions_name_version_idx" ON "policy_versions" USING btree ("name","version");--> statement-breakpoint
CREATE UNIQUE INDEX "trips_slug_idx" ON "trips" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_departure_email_idx" ON "waitlist" USING btree ("departure_id","email");--> statement-breakpoint
CREATE INDEX "quiz_submissions_user_idx" ON "quiz_submissions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_reference_idx" ON "bookings" USING btree ("reference");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_active_owner_departure_idx" ON "bookings" USING btree ("owner_id","departure_id") WHERE "bookings"."state" in ('HELD','UNDER_REVIEW','BALANCE_DUE','CONFIRMED');--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_owner_operation_key_idx" ON "bookings" USING btree ("owner_id","client_operation_key");--> statement-breakpoint
CREATE INDEX "bookings_departure_state_idx" ON "bookings" USING btree ("departure_id","state");--> statement-breakpoint
CREATE INDEX "bookings_owner_idx" ON "bookings" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "bookings_hold_expiry_idx" ON "bookings" USING btree ("state","hold_expires_at");--> statement-breakpoint
CREATE INDEX "bookings_balance_due_idx" ON "bookings" USING btree ("state","balance_due_at");--> statement-breakpoint
CREATE INDEX "cancel_quotes_booking_idx" ON "cancel_quotes" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cancellations_booking_idx" ON "cancellations" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "review_actions_review_idx" ON "review_actions" USING btree ("review_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_booking_idx" ON "reviews" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "reviews_decision_due_idx" ON "reviews" USING btree ("decision","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "allocations_payment_idx" ON "allocations" USING btree ("payment_attempt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "allocations_applied_instalment_idx" ON "allocations" USING btree ("instalment_id") WHERE "allocations"."outcome" = 'applied';--> statement-breakpoint
CREATE INDEX "allocations_booking_idx" ON "allocations" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gateway_orders_receipt_idx" ON "gateway_orders" USING btree ("receipt");--> statement-breakpoint
CREATE UNIQUE INDEX "gateway_orders_operation_key_idx" ON "gateway_orders" USING btree ("operation_key");--> statement-breakpoint
CREATE UNIQUE INDEX "gateway_orders_provider_order_idx" ON "gateway_orders" USING btree ("provider_order_id","mode");--> statement-breakpoint
CREATE INDEX "gateway_orders_instalment_idx" ON "gateway_orders" USING btree ("instalment_id","request_state");--> statement-breakpoint
CREATE INDEX "gateway_orders_booking_idx" ON "gateway_orders" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "instalments_booking_kind_idx" ON "instalments" USING btree ("booking_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_transition_key_idx" ON "outbox" USING btree ("transition_key");--> statement-breakpoint
CREATE INDEX "outbox_status_idx" ON "outbox" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_provider_payment_idx" ON "payment_attempts" USING btree ("provider_payment_id","mode");--> statement-breakpoint
CREATE INDEX "payment_attempts_booking_idx" ON "payment_attempts" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "payment_attempts_order_idx" ON "payment_attempts" USING btree ("provider_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_idempotency_idx" ON "refunds" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_provider_refund_idx" ON "refunds" USING btree ("provider_refund_id","mode");--> statement-breakpoint
CREATE INDEX "refunds_payment_idx" ON "refunds" USING btree ("payment_attempt_id");--> statement-breakpoint
CREATE INDEX "refunds_booking_idx" ON "refunds" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "refunds_state_retry_idx" ON "refunds" USING btree ("state","next_retry_at");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_inbox_event_idx" ON "webhook_inbox" USING btree ("provider","mode","event_id");--> statement-breakpoint
CREATE INDEX "webhook_inbox_status_idx" ON "webhook_inbox" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE INDEX "webhook_inbox_payment_idx" ON "webhook_inbox" USING btree ("provider_payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "circle_preferences_booking_idx" ON "circle_preferences" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "circle_preferences_departure_idx" ON "circle_preferences" USING btree ("departure_id");--> statement-breakpoint
CREATE UNIQUE INDEX "circle_tracks_booking_idx" ON "circle_tracks" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "circle_tracks_departure_idx" ON "circle_tracks" USING btree ("departure_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reconnect_choices_pair_idx" ON "reconnect_choices" USING btree ("departure_id","from_user_id","to_user_id");--> statement-breakpoint
CREATE INDEX "support_cases_owner_idx" ON "support_cases" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "support_cases_status_idx" ON "support_cases" USING btree ("status","created_at");