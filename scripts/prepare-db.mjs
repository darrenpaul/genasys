import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const seed = fileURLToPath(new URL('../server/db.seed.json', import.meta.url));
const database = fileURLToPath(new URL('../server/db.json', import.meta.url));

if (process.argv.includes('--reset') || !existsSync(database)) {
  copyFileSync(seed, database);
  console.log('Local JSON database reset from seed.');
}
