import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

const candidates = [
  path.resolve(process.cwd(), '.env.test'),
  path.resolve(process.cwd(), 'test/env/.env.test'),
  path.resolve(process.cwd(), 'test/env/.env.test.example'),
];

for (const envPath of candidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
    break;
  }
}
