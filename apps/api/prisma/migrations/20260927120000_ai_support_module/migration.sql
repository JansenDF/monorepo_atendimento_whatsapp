CREATE TYPE "AiProvider" AS ENUM ('OPENAI', 'AZURE_OPENAI');
CREATE TYPE "AiIntent" AS ENUM ('FAQ', 'ORDER_STATUS', 'BILLING', 'COMPLAINT', 'SALES', 'HUMAN_HANDOFF', 'OTHER');
CREATE TYPE "AiExecutionStatus" AS ENUM ('PROCESSING', 'AUTO_REPLY_PENDING', 'AUTO_REPLY_SENDING', 'AUTO_REPLIED', 'HUMAN_HANDOFF', 'FAILED');

ALTER TABLE "messages" ADD COLUMN "ai_execution_id" UUID;

CREATE TABLE "ai_faqs" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "question" VARCHAR(1000) NOT NULL,
  "answer" VARCHAR(4000) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_faqs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_executions" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "ticket_id" UUID NOT NULL,
  "message_id" UUID NOT NULL,
  "provider" "AiProvider" NOT NULL,
  "model" VARCHAR(160) NOT NULL,
  "intent" "AiIntent",
  "score" REAL,
  "prompt" TEXT NOT NULL,
  "response" TEXT,
  "answer" TEXT,
  "status" "AiExecutionStatus" NOT NULL DEFAULT 'PROCESSING',
  "error_code" VARCHAR(100),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_executions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ai_executions" ADD CONSTRAINT "ai_executions_score_range_check"
  CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= 100));

CREATE UNIQUE INDEX "ai_faqs_id_company_id_key" ON "ai_faqs"("id", "company_id");
CREATE INDEX "ai_faqs_company_id_is_active_updated_at_idx" ON "ai_faqs"("company_id", "is_active", "updated_at");
CREATE UNIQUE INDEX "ai_executions_id_company_id_key" ON "ai_executions"("id", "company_id");
CREATE UNIQUE INDEX "ai_executions_company_id_message_id_key" ON "ai_executions"("company_id", "message_id");
CREATE INDEX "ai_executions_company_id_status_created_at_idx" ON "ai_executions"("company_id", "status", "created_at");
CREATE INDEX "ai_executions_company_id_ticket_id_created_at_idx" ON "ai_executions"("company_id", "ticket_id", "created_at");
CREATE UNIQUE INDEX "messages_company_id_ai_execution_id_key" ON "messages"("company_id", "ai_execution_id");
CREATE UNIQUE INDEX "messages_ai_execution_id_company_id_key" ON "messages"("ai_execution_id", "company_id");
CREATE UNIQUE INDEX "ai_executions_message_id_company_id_key" ON "ai_executions"("message_id", "company_id");

ALTER TABLE "ai_faqs" ADD CONSTRAINT "ai_faqs_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_executions" ADD CONSTRAINT "ai_executions_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_executions" ADD CONSTRAINT "ai_executions_ticket_id_company_id_fkey"
  FOREIGN KEY ("ticket_id", "company_id") REFERENCES "tickets"("id", "company_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_executions" ADD CONSTRAINT "ai_executions_message_id_company_id_fkey"
  FOREIGN KEY ("message_id", "company_id") REFERENCES "messages"("id", "company_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_ai_execution_id_company_id_fkey"
  FOREIGN KEY ("ai_execution_id", "company_id") REFERENCES "ai_executions"("id", "company_id") ON DELETE CASCADE ON UPDATE CASCADE;
