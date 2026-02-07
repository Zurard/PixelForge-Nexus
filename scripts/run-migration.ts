// Execute SQL migration against Supabase using the pg REST endpoint
// Usage: npx tsx scripts/run-migration.ts

import * as fs from 'fs';
import * as path from 'path';

const supabaseUrl = 'https://hccdpziriskybawbcigp.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjY2RwemlyaXNreWJhd2JjaWdwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDM2NDg3NiwiZXhwIjoyMDg1OTQwODc2fQ.o3jAuav_f_CJE3ptYAB-zWVZTF0Ij9C_j-zR8oVjJsc';

// Parse the ref from the supabase URL
const ref = 'hccdpziriskybawbcigp';

async function executeSql(sql: string): Promise<{ error?: string }> {
  // Use the Supabase Management API query endpoint
  const response = await fetch(`${supabaseUrl}/pg/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
      'x-supabase-info': '{"projectRef":"' + ref + '"}',
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!response.ok) {
    const text = await response.text();
    return { error: `HTTP ${response.status}: ${text.substring(0, 500)}` };
  }

  return {};
}

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inDollarBlock = false;

  for (const line of sql.split('\n')) {
    const trimmed = line.trim();
    
    // Skip pure comment lines outside of dollar blocks
    if (trimmed.startsWith('--') && !inDollarBlock) {
      continue;
    }

    // Track $$ blocks
    const dollarMatches = line.match(/\$\$/g);
    if (dollarMatches && dollarMatches.length % 2 !== 0) {
      inDollarBlock = !inDollarBlock;
    }

    current += line + '\n';

    if (!inDollarBlock && trimmed.endsWith(';')) {
      const stmt = current.trim();
      if (stmt && stmt !== ';') {
        statements.push(stmt);
      }
      current = '';
    }
  }

  if (current.trim()) {
    statements.push(current.trim());
  }

  return statements;
}

async function runMigration() {
  console.log('🔄 Running database migration...\n');

  const sqlPath = path.join(__dirname, '..', 'supabase', 'migrations', '001_initial_schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf-8');
  const statements = splitSqlStatements(sql);

  console.log(`Found ${statements.length} SQL statements.\n`);

  // Try running the entire SQL as one batch first
  console.log('Attempting to run full migration as single batch...');
  const result = await executeSql(sql);
  
  if (result.error) {
    console.log(`Batch execution failed: ${result.error}`);
    console.log('\nFalling back to statement-by-statement execution...\n');
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const preview = stmt.replace(/\n/g, ' ').substring(0, 80);
      
      const stmtResult = await executeSql(stmt);
      
      if (stmtResult.error) {
        console.log(`  ❌ [${i + 1}] ${preview}...`);
        console.log(`     Error: ${stmtResult.error.substring(0, 200)}`);
        errorCount++;
      } else {
        console.log(`  ✅ [${i + 1}] ${preview}...`);
        successCount++;
      }
    }
    
    console.log(`\n✅ Success: ${successCount}, ❌ Errors: ${errorCount}`);
  } else {
    console.log('✅ Full migration executed successfully!');
  }

  console.log('\n📋 Next step: Run "npx tsx scripts/setup.ts" to seed test data');
}

runMigration().catch(console.error);
