ALTER TABLE "settings" ADD COLUMN "booking_start_date" date;--> statement-breakpoint
-- Inicio de la turnera online (editable desde el panel: Horarios y agenda)
UPDATE "settings" SET "booking_start_date" = '2027-01-01' WHERE "booking_start_date" IS NULL;
