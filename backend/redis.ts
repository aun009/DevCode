import { Redis } from "ioredis";

export function createRedisConnection() {
  const url = process.env.REDIS_URL;

  if (!url) {
    throw new Error("REDIS_URL is required");
  }

  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}
