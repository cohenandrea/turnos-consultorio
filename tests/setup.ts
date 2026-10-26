process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/turnos_test";
process.env.SESSION_SECRET = "test-session-secret-0123456789abcdef0123456789";
process.env.ENCRYPTION_KEY = "test-encryption-key-0123456789abcdef0123456789";
process.env.APP_URL = "https://turnos.test";
process.env.TZ = "UTC";
