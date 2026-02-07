// Setup script — runs SQL migration then seeds test data
// Usage: npx tsx scripts/setup.ts

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hccdpziriskybawbcigp.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjY2RwemlyaXNreWJhd2JjaWdwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDM2NDg3NiwiZXhwIjoyMDg1OTQwODc2fQ.o3jAuav_f_CJE3ptYAB-zWVZTF0Ij9C_j-zR8oVjJsc';

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function setup() {
  console.log('🔄 Testing database connection...\n');

  // Test basic connectivity
  const { data, error } = await supabase.from('profiles').select('count').limit(1);
  
  if (error && error.message.includes('does not exist')) {
    console.log('❌ Database tables not found!');
    console.log('');
    console.log('📋 You need to run the SQL migration first.');
    console.log('');
    console.log('Please follow these steps:');
    console.log('1. Open your Supabase Dashboard: https://supabase.com/dashboard');
    console.log('2. Go to SQL Editor (left sidebar)');
    console.log('3. Click "New Query"');
    console.log('4. Copy and paste the contents of: supabase/migrations/001_initial_schema.sql');
    console.log('5. Click "Run" to execute the SQL');
    console.log('6. After the SQL runs successfully, run this script again: npx tsx scripts/setup.ts');
    console.log('');
    console.log('⚠️  IMPORTANT: After running the SQL, go to:');
    console.log('   Authentication → Hooks → Custom Access Token');
    console.log('   Select the function: custom_access_token_hook');
    console.log('   Click Save');
    return;
  }

  console.log('✅ Database tables exist!\n');
  console.log('Now seeding test data...\n');

  // Run seed
  await seed();
}

async function seed() {
  const testUsers = [
    {
      email: 'admin@pixelforge.dev',
      password: 'Admin@2024!Secure',
      full_name: 'Alex Admin',
      role: 'admin' as const,
    },
    {
      email: 'lead@pixelforge.dev',
      password: 'Lead@2024!Secure',
      full_name: 'Lisa Lead',
      role: 'project_lead' as const,
    },
    {
      email: 'dev@pixelforge.dev',
      password: 'Dev@2024!Secure',
      full_name: 'David Developer',
      role: 'developer' as const,
    },
  ];

  const createdUsers: Record<string, string> = {};

  for (const user of testUsers) {
    console.log(`Creating user: ${user.email} (${user.role})...`);

    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: { full_name: user.full_name },
    });

    if (authError) {
      if (authError.message.includes('already been registered') || authError.message.includes('already exists')) {
        console.log(`  ⚠️  Already exists, updating role...`);
        const { data: { users } } = await supabase.auth.admin.listUsers();
        const existing = users?.find((u) => u.email === user.email);
        if (existing) {
          createdUsers[user.role] = existing.id;
          await supabase.from('user_roles').delete().eq('user_id', existing.id);
          await supabase.from('user_roles').insert({ user_id: existing.id, role: user.role });
          console.log(`  ✅ Role updated`);
        }
        continue;
      }
      console.error(`  ❌ Error: ${authError.message}`);
      continue;
    }

    if (authUser.user) {
      createdUsers[user.role] = authUser.user.id;
      console.log(`  ✅ Created: ${authUser.user.id}`);
      
      await supabase.from('user_roles').insert({
        user_id: authUser.user.id,
        role: user.role,
      });
      console.log(`  ✅ Role assigned`);
    }
  }

  // Create sample projects
  const adminId = createdUsers['admin'];
  const leadId = createdUsers['project_lead'];
  const devId = createdUsers['developer'];

  if (adminId && leadId) {
    console.log('\nCreating sample projects...');

    const { data: existing } = await supabase
      .from('projects')
      .select('name')
      .in('name', ['Dragon\'s Quest RPG', 'Pixel Racers']);

    const existingNames = new Set((existing || []).map((p) => p.name));

    if (!existingNames.has('Dragon\'s Quest RPG')) {
      const { data: project, error } = await supabase
        .from('projects')
        .insert({
          name: 'Dragon\'s Quest RPG',
          description: 'An epic role-playing game featuring a vast open world, complex character progression, and an engaging storyline about a dragon-rider saving their kingdom.',
          deadline: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'active',
          created_by: adminId,
          lead_id: leadId,
        })
        .select()
        .single();

      if (error) {
        console.error(`  ❌ Project error: ${error.message}`);
      } else if (project && devId) {
        console.log(`  ✅ Dragon's Quest RPG created`);
        await supabase.from('project_members').insert({
          project_id: project.id,
          user_id: devId,
          assigned_by: leadId,
        });
        console.log(`  ✅ Developer assigned to Dragon's Quest`);
      }
    }

    if (!existingNames.has('Pixel Racers')) {
      const { error } = await supabase
        .from('projects')
        .insert({
          name: 'Pixel Racers',
          description: 'A fast-paced multiplayer racing game with retro-inspired pixel art graphics, customizable vehicles, and competitive online leaderboards.',
          deadline: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'active',
          created_by: adminId,
          lead_id: leadId,
        });

      if (error) {
        console.error(`  ❌ Project error: ${error.message}`);
      } else {
        console.log(`  ✅ Pixel Racers created`);
      }
    }
  }

  console.log('\n🎉 Setup complete!\n');
  console.log('Test Credentials:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  testUsers.forEach((u) => {
    console.log(`  ${u.role.padEnd(15)} | ${u.email.padEnd(25)} | ${u.password}`);
  });
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\nStart the dev server with: npm run dev');
  console.log('Then visit: http://localhost:3000');
}

setup().catch(console.error);
