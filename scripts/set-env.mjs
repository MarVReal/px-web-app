// Generates src/environments/environment.ts from env vars (used by Vercel build).
import { writeFileSync } from 'node:fs';
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;
if (!url || !key) { console.log('[set-env] SUPABASE_URL / SUPABASE_ANON_KEY not set; keeping existing environment.ts'); process.exit(0); }
writeFileSync('src/environments/environment.ts',
  `export const environment = {\n  supabaseUrl: ${JSON.stringify(url)},\n  supabaseAnonKey: ${JSON.stringify(key)},\n};\n`);
console.log('[set-env] wrote src/environments/environment.ts');
