# Online Compiler

A multi-language online compiler with async job processing. Users write code in the browser, submissions are queued through **BullMQ + Upstash Redis**, executed on a worker VM with native Linux compilers, and results are stored in **Neon PostgreSQL**.

## Architecture

```
React Frontend  →  Express Backend  →  BullMQ (Upstash Redis)
                         │                      │
                         ▼                      ▼
                   Neon PostgreSQL       Worker (AWS Lightsail)
                                              │
                                         gcc / python / java / node
```

## Tech Stack

- **Frontend:** React, Bun, Tailwind
- **Backend:** Express, Prisma, BullMQ
- **Worker:** Bun, BullMQ, native Linux process execution
- **Database:** Neon PostgreSQL
- **Queue:** Upstash Redis + BullMQ

## Supported Languages

- Python
- C / C++17
- Java
- JavaScript (Node.js)

## Local Setup

### 1. Clone and install

```bash
git clone <your-repo-url>
cd devcode

cd backend && bun install && cd ..
cd worker && bun install && cd ..
cd frontend && bun install && cd ..
```

### 2. Environment variables

Copy example files and fill in your Neon + Upstash credentials:

```bash
cp backend/.env.example backend/.env
cp worker/.env.example worker/.env
cp frontend/.env.example frontend/.env
```

### 3. Database setup

```bash
cd backend
bunx prisma generate
bunx prisma migrate deploy
cd ../worker
bunx prisma generate
```

### 4. Run (3 terminals)

```bash
# Terminal 1 — API
cd backend && bun run index.ts

# Terminal 2 — Worker (needs gcc, g++, java, python3, node installed)
cd worker && bun run index.ts

# Terminal 3 — Frontend
cd frontend && bun run dev
```

Open the frontend URL shown in the terminal (default `http://127.0.0.1:5173`).

## Deploy Worker to AWS Lightsail

1. Create an Ubuntu 24.04 Lightsail instance ($7/mo recommended).
2. Install runtimes: `build-essential`, `openjdk-21-jdk`, `python3`, `nodejs`, Bun.
3. Clone this repo on the VM.
4. Copy `worker/.env` with your Neon + Upstash URLs.
5. Run `bun install && bunx prisma generate` inside `worker/`.
6. Use `deploy/code-worker.service` with systemd to keep the worker running.

The backend can stay local for now, or deploy later to Railway/Render.

## Interview Highlights

- **Async queue:** BullMQ handles multiple users; extra jobs wait in queue.
- **Separation:** User code runs only on the worker VM, not the API server.
- **Concurrency:** Worker runs 2 jobs in parallel by default (`WORKER_CONCURRENCY`).
- **No Docker:** Native Linux processes for faster execution startup.
- **Idempotency:** Each submission ID is used as the BullMQ job ID.

## Project Structure

```
devcode/
├── frontend/     # React UI
├── backend/      # REST API + job producer
├── worker/       # BullMQ consumer + code execution
├── deploy/       # systemd service for Lightsail
└── README.md
```
