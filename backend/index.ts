import "dotenv/config";
import express from "express";
import { Queue } from "bullmq";
import { prisma } from "./db";
import cors from "cors";
import { createRedisConnection } from "./redis";

const app = express();
const port = Number(process.env.PORT ?? 3000);
const queueName = process.env.REDIS_QUEUE_NAME ?? "code-runner-jobs";
const maxCodeSize = Number(process.env.MAX_CODE_SIZE ?? 51200);
const maxInputSize = Number(process.env.MAX_INPUT_SIZE ?? 10240);
const supportedLanguages = new Set(["c", "cpp", "java", "javascript", "python"]);

const connection = createRedisConnection();
const queue = new Queue(queueName, { connection });

app.use(express.json({ limit: "100kb" }));
app.use(cors());

app.get("/health", async (_req, res) => {
  res.json({ ok: true });
});

app.post("/submission", async (req, res) => {
  const code = req.body?.code;
  const language = req.body?.language;
  const input = req.body?.input;

  if (typeof code !== "string" || code.trim().length === 0) {
    res.status(400).json({ error: "code is required" });
    return;
  }

  if (code.length > maxCodeSize) {
    res.status(400).json({ error: `code must be at most ${maxCodeSize} characters` });
    return;
  }

  if (typeof language !== "string" || !supportedLanguages.has(language)) {
    res.status(400).json({ error: "Unsupported language" });
    return;
  }

  if (input !== undefined && typeof input !== "string") {
    res.status(400).json({ error: "input must be a string" });
    return;
  }

  if (typeof input === "string" && input.length > maxInputSize) {
    res.status(400).json({ error: `input must be at most ${maxInputSize} characters` });
    return;
  }

  const submission = await prisma.submissions.create({
    data: {
      language,
      code,
      input: input ?? "",
      status: "Processing",
    },
  });

  try {
    await queue.add(
      "run",
      {
        submissionId: submission.id,
        code,
        language,
        input: input ?? "",
      },
      {
        jobId: submission.id,
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await prisma.submissions.update({
      where: { id: submission.id },
      data: {
        status: "Failure",
        output: "Could not enqueue job.",
        stderr: message,
      },
    });

    res.status(503).json({ error: "Queue unavailable. Try again." });
    return;
  }

  res.status(202).json({
    message: "processing",
    submissionId: submission.id,
  });
});

app.get("/submission/:submissionId", async (req, res) => {
  const submission = await prisma.submissions.findUnique({
    where: { id: req.params.submissionId },
    select: {
      id: true,
      language: true,
      status: true,
      output: true,
      stderr: true,
      exitCode: true,
      executionTimeMs: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!submission) {
    res.status(404).json({ error: "submission not found" });
    return;
  }

  res.json(submission);
});

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});

process.on("SIGINT", async () => {
  await queue.close();
  await connection.quit();
  process.exit(0);
});
