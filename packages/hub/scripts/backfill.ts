import { backfill } from "../src/db/backfill.js";
import { configFromEnv, createDocumentClient } from "../src/db/client.js";

/**
 * The step in each environment's apply job (decision 0041), until Issue-213
 * removes it: HEAT_PLAYER_TABLE and HEAT_LOCATION_TABLE name the tables, the
 * apply role's credentials reach them, and the job summary takes the counts.
 * Run through `npm run backfill`.
 */
const config = configFromEnv();
const { written, remaining, leftAside } = await backfill(createDocumentClient(config), config.tables);
console.log(`ElectroDB backfill: ${written} items made whole, ${remaining} without identifiers remaining, ${leftAside} left aside.`);
