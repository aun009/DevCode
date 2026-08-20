import "dotenv/config";
import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { Worker } from "bullmq";
import { prisma } from "./db";
import { SubmissionStatus } from "./generated/prisma/enums";
import { createRedisConnection } from "./redis";

type QueueJob = {
  submissionId: string;
  code: string;
  language: string;
  input: string;
};

type CommandResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
};

type ExecutionResult = {
  status: SubmissionStatus;
  output: string;
  stderr: string;
  exitCode: number | null;
  executionTimeMs: number;
};

const queueName = process.env.REDIS_QUEUE_NAME ?? "code-runner-jobs";
const compileTimeoutMs = Number(process.env.COMPILE_TIMEOUT_MS ?? 10000);
const runTimeoutMs = Number(process.env.RUN_TIMEOUT_MS ?? 5000);
const outputLimit = Number(process.env.OUTPUT_LIMIT_CHARS ?? 12000);
const workerConcurrency = Number(process.env.WORKER_CONCURRENCY ?? 2);

function resolveExecutable(envName: string, fallbackNames: string[]) {
  const candidates = [process.env[envName], ...fallbackNames].filter(Boolean) as string[];

  for (const candidate of candidates) {
    let resolved = candidate;

    if (isAbsolute(candidate)) {
      if (!existsSync(candidate)) {
        continue;
      }
    } else {
      const found = spawnSync("which", [candidate], { encoding: "utf8" });

      if (found.status !== 0 || !found.stdout.trim()) {
        continue;
      }

      resolved = found.stdout.trim();
    }

    return resolved;
  }

  throw new Error(`Missing runtime for ${envName}. Install one of: ${candidates.join(", ")}`);
}

const executables = {
  c: resolveExecutable("C_BIN", ["gcc"]),
  cpp: resolveExecutable("CPP_BIN", ["g++"]),
  java: resolveExecutable("JAVA_BIN", ["java"]),
  javac: resolveExecutable("JAVAC_BIN", ["javac"]),
  javascript: resolveExecutable("NODE_BIN", ["node"]),
  python: resolveExecutable("PYTHON_BIN", ["python3", "python"]),
};

function trimOutput(value: string) {
  if (value.length <= outputLimit) {
    return value;
  }

  return `${value.slice(0, outputLimit)}\n\n[output truncated at ${outputLimit} characters]`;
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  input = "",
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const finish = (result: Omit<CommandResult, "durationMs">) => {
      if (settled) {
        return;
      }

      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      resolve({
        ...result,
        durationMs: Date.now() - startedAt,
      });
    };

    try {
      const proc = Bun.spawn([command, ...args], {
        cwd,
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      });

      timeout = setTimeout(() => {
        timedOut = true;
        proc.kill();
      }, timeoutMs);

      proc.stdin.write(input);
      proc.stdin.end();

      void (async () => {
        stdout = trimOutput(await new Response(proc.stdout).text());
        stderr = trimOutput(await new Response(proc.stderr).text());
        const exitCode = await proc.exited;
        finish({
          exitCode,
          stdout,
          stderr,
          timedOut,
        });
      })().catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        finish({
          exitCode: null,
          stdout,
          stderr: trimOutput(`Failed to start ${command}: ${message}`),
          timedOut: false,
        });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      finish({
        exitCode: null,
        stdout,
        stderr: trimOutput(`Failed to start ${command}: ${message}`),
        timedOut: false,
      });
    }
  });
}

function commandToResult(result: CommandResult): ExecutionResult {
  if (result.timedOut) {
    return {
      status: SubmissionStatus.TimeLimitExceeded,
      output: `Execution timed out after ${runTimeoutMs}ms.`,
      stderr: result.stderr,
      exitCode: result.exitCode,
      executionTimeMs: result.durationMs,
    };
  }

  if (result.exitCode === null) {
    return {
      status: SubmissionStatus.RuntimeError,
      output: result.stdout,
      stderr: trimOutput(result.stderr || "Process failed to start."),
      exitCode: null,
      executionTimeMs: result.durationMs,
    };
  }

  return {
    status: result.exitCode === 0 ? SubmissionStatus.Success : SubmissionStatus.RuntimeError,
    output: trimOutput(result.stdout || "[program completed with no output]"),
    stderr: result.stderr,
    exitCode: result.exitCode,
    executionTimeMs: result.durationMs,
  };
}

async function compileOrError(
  command: string,
  args: string[],
  workspace: string,
): Promise<ExecutionResult | null> {
  const compileResult = await runCommand(command, args, workspace, compileTimeoutMs);

  if (compileResult.timedOut) {
    return {
      status: SubmissionStatus.CompilationError,
      output: `Compilation timed out after ${compileTimeoutMs}ms.`,
      stderr: compileResult.stderr,
      exitCode: compileResult.exitCode,
      executionTimeMs: compileResult.durationMs,
    };
  }

  if (compileResult.exitCode !== 0) {
    return {
      status: SubmissionStatus.CompilationError,
      output: compileResult.stdout,
      stderr: trimOutput(compileResult.stderr || "Compilation failed."),
      exitCode: compileResult.exitCode,
      executionTimeMs: compileResult.durationMs,
    };
  }

  return null;
}

async function runCppSubmission(job: QueueJob, workspace: string): Promise<ExecutionResult> {
  const sourcePath = join(workspace, "main.cpp");
  const binaryPath = join(workspace, "main");

  await writeFile(sourcePath, job.code);

  const compileError = await compileOrError(
    executables.cpp,
    [sourcePath, "-std=c++17", "-O2", "-pipe", "-o", binaryPath],
    workspace,
  );

  if (compileError) {
    return compileError;
  }

  return commandToResult(await runCommand(binaryPath, [], workspace, runTimeoutMs, job.input));
}

async function runCSubmission(job: QueueJob, workspace: string): Promise<ExecutionResult> {
  const sourcePath = join(workspace, "main.c");
  const binaryPath = join(workspace, "main");

  await writeFile(sourcePath, job.code);

  const compileError = await compileOrError(
    executables.c,
    [sourcePath, "-std=c17", "-O2", "-pipe", "-o", binaryPath],
    workspace,
  );

  if (compileError) {
    return compileError;
  }

  return commandToResult(await runCommand(binaryPath, [], workspace, runTimeoutMs, job.input));
}

async function runPythonSubmission(job: QueueJob, workspace: string): Promise<ExecutionResult> {
  const sourcePath = join(workspace, "main.py");

  await writeFile(sourcePath, job.code);

  return commandToResult(await runCommand(executables.python, [sourcePath], workspace, runTimeoutMs, job.input));
}

async function runJavaScriptSubmission(job: QueueJob, workspace: string): Promise<ExecutionResult> {
  const sourcePath = join(workspace, "main.js");

  await writeFile(sourcePath, job.code);

  return commandToResult(await runCommand(executables.javascript, [sourcePath], workspace, runTimeoutMs, job.input));
}

async function runJavaSubmission(job: QueueJob, workspace: string): Promise<ExecutionResult> {
  const sourcePath = join(workspace, "Main.java");

  await writeFile(sourcePath, job.code);

  const compileError = await compileOrError(executables.javac, [sourcePath], workspace);

  if (compileError) {
    return compileError;
  }

  return commandToResult(await runCommand(executables.java, ["Main"], workspace, runTimeoutMs, job.input));
}

async function runSubmission(job: QueueJob): Promise<ExecutionResult> {
  const workspace = await mkdtemp(join(tmpdir(), `submission-${job.submissionId}-`));

  try {
    switch (job.language) {
      case "c":
        return await runCSubmission(job, workspace);
      case "cpp":
        return await runCppSubmission(job, workspace);
      case "java":
        return await runJavaSubmission(job, workspace);
      case "javascript":
        return await runJavaScriptSubmission(job, workspace);
      case "python":
        return await runPythonSubmission(job, workspace);
      default:
        return {
          status: SubmissionStatus.Failure,
          output: "Unsupported language.",
          stderr: "",
          exitCode: null,
          executionTimeMs: 0,
        };
    }
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
}

async function processJob(job: QueueJob) {
  console.log(`Processing submission ${job.submissionId}`);

  try {
    const result = await runSubmission(job);

    await prisma.submissions.update({
      where: { id: job.submissionId },
      data: result,
    });

    console.log(`Finished submission ${job.submissionId} with ${result.status}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await prisma.submissions.update({
      where: { id: job.submissionId },
      data: {
        status: SubmissionStatus.Failure,
        output: `Worker error: ${message}`,
        stderr: message,
      },
    });

    console.error(`Failed submission ${job.submissionId}`, error);
    throw error;
  }
}

const connection = createRedisConnection();

console.log(`Worker starting on queue "${queueName}" (concurrency: ${workerConcurrency})`);
console.log("Resolved runtimes:", executables);

const worker = new Worker<QueueJob>(
  queueName,
  async (job) => {
    await processJob(job.data);
  },
  {
    connection,
    concurrency: workerConcurrency,
  },
);

worker.on("failed", (job, error) => {
  console.error(`Job ${job?.id ?? "unknown"} failed`, error);
});

worker.on("error", (error) => {
  console.error("Worker error", error);
});

process.on("SIGINT", async () => {
  await worker.close();
  await connection.quit();
  process.exit(0);
});

console.log("Worker is ready and waiting for jobs");
