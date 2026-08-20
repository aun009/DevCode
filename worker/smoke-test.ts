import "dotenv/config";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const python = "/usr/bin/python3";
const workspace = await mkdtemp(join(tmpdir(), "smoke-test-"));

try {
  await writeFile(join(workspace, "main.py"), 'print("smoke test ok")');

  const proc = Bun.spawn([python, join(workspace, "main.py")], {
    cwd: workspace,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  proc.stdin.end();

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  console.log({ exitCode, stdout: stdout.trim(), stderr: stderr.trim() });

  if (exitCode !== 0 || !stdout.includes("smoke test ok")) {
    process.exit(1);
  }

  console.log("Worker execution path is OK.");
} finally {
  await rm(workspace, { recursive: true, force: true });
}
