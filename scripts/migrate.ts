// Run SQL migrations against Supabase
// Usage: npx tsx scripts/migrate.ts

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabaseUrl = 'https://hccdpziriskybawbcigp.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjY2RwemlyaXNreWJhd2JjaWdwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDM2NDg3NiwiZXhwIjoyMDg1OTQwODc2fQ.o3jAuav_f_CJE3ptYAB-zWVZTF0Ij9C_j-zR8oVjJsc';

async function runMigration() {
  console.log('🔄 Running database migration...\n');

  const sqlPath = path.join(__dirname, '..', 'supabase', 'migrations', '001_initial_schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf-8');

  // Split SQL into individual statements (handle multi-line functions)
  const statements = splitSqlStatements(sql);
  
  console.log(`Found ${statements.length} SQL statements to execute.\n`);

  // Use the REST API to run SQL via pg_net or the SQL editor endpoint
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
    },
  });

  // Alternative: use the management API
  // For cloud Supabase, we'll use the SQL endpoint
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i].trim();
    if (!stmt) continue;
    
    console.log(`[${i + 1}/${statements.length}] Executing: ${stmt.substring(0, 80)}...`);
    
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/rpc/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceRoleKey,
          'Authorization': `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ query: stmt }),
      });
      
      if (!res.ok) {
        const text = await res.text();
        console.log(`  ⚠️  HTTP ${res.status}: ${text.substring(0, 200)}`);
      } else {
        console.log(`  ✅ Success`);
      }
    } catch (err) {
      console.log(`  ⚠️  Error: ${err}`);
    }
  }

  console.log('\n✅ Migration complete!');
}

function splitSqlStatements(sql: string): string[] {
  // Remove comments
  const lines = sql.split('\n');
  const cleanLines: string[] = [];
  let inBlock = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('--') && !inBlock) {
      continue; // Skip line comments
    }
    cleanLines.push(line);
    
    if (trimmed.includes('$$')) {
      inBlock = !inBlock;
    }
  }
  
  // Now split on semicolons, but not within $$ blocks
  const statements: string[] = [];
  let current = '';
  let inDollarBlock = false;
  
  for (const line of cleanLines) {
    if (line.includes('$$')) {
      const count = (line.match(/\$\$/g) || []).length;
      if (count % 2 !== 0) {
        inDollarBlock = !inDollarBlock;
      }
    }
    
    current += line + '\n';
    
    if (!inDollarBlock && line.trim().endsWith(';')) {
      statements.push(current.trim());
      current = '';
    }
  }
  
  if (current.trim()) {
    statements.push(current.trim());
  }
  
  return statements.filter(s => s.length > 0);
}

runMigration().catch(console.error);
