-- Garantía a nivel base de datos: dos turnos confirmados nunca pueden superponerse
-- (incluye el tiempo entre pacientes, guardado en block_end_at).
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_no_overlap"
  EXCLUDE USING gist (tstzrange("start_at", "block_end_at", '[)') WITH &&)
  WHERE ("status" = 'confirmed');
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_valid_range" CHECK ("end_at" > "start_at" AND "block_end_at" >= "end_at");
--> statement-breakpoint
ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "schedule_exceptions_valid_range" CHECK ("end_at" > "start_at");
