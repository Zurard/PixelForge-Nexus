// Execute SQL migration against Supabase using the Management API
// Usage: npx tsx scripts/run-sql.ts

import * as fs from 'fs';
import * as path from 'path';

const projectRef = 'hccdpziriskybawbcigp';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjY2RwemlyaXNreWJhd2JjaWdwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDM2NDg3NiwiZXhwIjoyMDg1OTQwODc2fQ.o3jAuav_f_CJE3ptYAB-zWVZTF0Ij9C_j-zR8oVjJsc';

async function executeSql(sql: string) {
  // Supabase Cloud exposes a pg-meta endpoint for SQL execution
  const url = `https://${projectRef}.supabase.co/pg/query`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceRoleKey}`,
      'apikey': serviceRoleKey,
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!response.ok) {
    // Try the alternative pg-meta endpoint
    const altUrl = `https://${projectRef}.supabase.co/rest/v1/rpc/exec_sql`;
    const altResponse = await fetch(altUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
      },
      body: JSON.stringify({ sql }),
    });
    
    if (!altResponse.ok) {
      const text = await altResponse.text();
      throw new Error(`SQL execution failed: ${text}`);
    }
    return altResponse.json();
  }

  return response.json();
}

async function main() {
  const sqlPath = path.join(__dirname, '..', 'supabase', 'migrations', '001_initial_schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf-8');

  try {
    console.log('Executing migration SQL...');
    const result = await executeSql(sql);
    console.log('Result:', JSON.stringify(result).substring(0, 500));
  } catch (error) {
    console.error('Failed:', error);
    console.log('\n');
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║  MANUAL SQL MIGRATION REQUIRED                           ║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log('║                                                           ║');
    console.log('║  1. Open: https://supabase.com/dashboard                 ║');
    console.log('║  2. Select your project                                   ║');
    console.log('║  3. Go to SQL Editor (left sidebar)                       ║');
    console.log('║  4. Click "New Query"                                     ║');
    console.log('║  5. Copy-paste the SQL from:                              ║');
    console.log('║     supabase/migrations/001_initial_schema.sql            ║');
    console.log('║  6. Click "Run"                                           ║');
    console.log('║                                                           ║');
    console.log('║  After running SQL, also go to:                           ║');
    console.log('║  Authentication → Hooks → Custom Access Token             ║');
    console.log('║  → Select: custom_access_token_hook → Save                ║');
    console.log('║                                                           ║');
    console.log('║  Then run: npx tsx scripts/setup.ts                       ║');
    console.log('║                                                           ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
  }
}

main();
