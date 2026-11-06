import "dotenv/config";
import { runTick } from "../src/lib/jobs/tick";
import { closeDb } from "../src/lib/db/client";

/** Runs one scheduler tick locally (same code path as GET /api/internal/jobs/tick). */
async function main() {
  const result = await runTick();
  console.log(JSON.stringify(result, null, 2));
  await closeDb();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
