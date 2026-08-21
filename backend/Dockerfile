FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Generate Prisma client
RUN bun prisma generate

# Expose port (Fly sets $PORT automatically)
EXPOSE 3000

CMD ["bun", "run", "index.ts"]
