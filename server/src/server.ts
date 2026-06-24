import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { checkDatabaseConnection, disconnectDatabase } from "./db/prisma.js";

async function main(): Promise<void> {
  // Fail fast on startup if the database is unreachable, rather than
  // accepting traffic and failing on the first request. This matters
  // especially on a free-tier host like Render, where you want a broken
  // deploy to show as failed immediately, not as "running" with every
  // request silently 500ing.
  await checkDatabaseConnection();

  const app = createApp();

  const server = app.listen(env.PORT, () => {
    console.log(`[server] listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  // Render (and most container hosts) sends SIGTERM before killing the
  // process on redeploy/scale-down. Closing the HTTP server first lets
  // in-flight requests finish, then we close the DB pool — without this,
  // a deploy can occasionally cut off a request mid-query.
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[server] received ${signal}, shutting down gracefully...`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[server] failed to start:", err);
  process.exit(1);
});
