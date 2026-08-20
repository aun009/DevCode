-- Extend statuses for a free-form code playground.
ALTER TYPE "SubmissionStatus" ADD VALUE IF NOT EXISTS 'CompilationError';
ALTER TYPE "SubmissionStatus" ADD VALUE IF NOT EXISTS 'RuntimeError';
ALTER TYPE "SubmissionStatus" ADD VALUE IF NOT EXISTS 'TimeLimitExceeded';

-- Store user input and structured process metadata.
ALTER TABLE "Submissions" ADD COLUMN IF NOT EXISTS "input" TEXT;
ALTER TABLE "Submissions" ADD COLUMN IF NOT EXISTS "stderr" TEXT;
ALTER TABLE "Submissions" ADD COLUMN IF NOT EXISTS "exitCode" INTEGER;
ALTER TABLE "Submissions" ADD COLUMN IF NOT EXISTS "executionTimeMs" INTEGER;
ALTER TABLE "Submissions" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Submissions" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
