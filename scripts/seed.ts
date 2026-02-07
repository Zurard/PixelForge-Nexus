// Seed script — creates test users for PixelForge Nexus
// Run with: npx tsx scripts/seed.ts

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hccdpziriskybawbcigp.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjY2RwemlyaXNreWJhd2JjaWdwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDM2NDg3NiwiZXhwIjoyMDg1OTQwODc2fQ.o3jAuav_f_CJE3ptYAB-zWVZTF0Ij9C_j-zR8oVjJsc';

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

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

async function seed() {
  console.log('🌱 Seeding PixelForge Nexus database...\n');

  for (const user of testUsers) {
    console.log(`Creating user: ${user.email} (${user.role})...`);

    // Create user
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: {
        full_name: user.full_name,
      },
    });

    if (authError) {
      if (authError.message.includes('already been registered')) {
        console.log(`  ⚠️  User ${user.email} already exists, skipping creation...`);
        
        // Get existing user
        const { data: { users } } = await supabase.auth.admin.listUsers();
        const existingUser = users?.find((u) => u.email === user.email);
        
        if (existingUser) {
          // Ensure role is set
          const { error: roleError } = await supabase
            .from('user_roles')
            .upsert(
              { user_id: existingUser.id, role: user.role },
              { onConflict: 'user_id,role' }
            );

          if (roleError) {
            // Delete existing and insert fresh
            await supabase.from('user_roles').delete().eq('user_id', existingUser.id);
            await supabase.from('user_roles').insert({ user_id: existingUser.id, role: user.role });
          }
          console.log(`  ✅ Role '${user.role}' ensured for ${user.email}`);
        }
        continue;
      }
      console.error(`  ❌ Error creating ${user.email}:`, authError.message);
      continue;
    }

    if (!authUser.user) {
      console.error(`  ❌ No user returned for ${user.email}`);
      continue;
    }

    console.log(`  ✅ User created: ${authUser.user.id}`);

    // Assign role
    const { error: roleError } = await supabase
      .from('user_roles')
      .insert({
        user_id: authUser.user.id,
        role: user.role,
      });

    if (roleError) {
      console.error(`  ❌ Error assigning role:`, roleError.message);
    } else {
      console.log(`  ✅ Role '${user.role}' assigned`);
    }
  }

  // Create a sample project
  console.log('\nCreating sample project...');
  
  // Get admin user id
  const { data: { users } } = await supabase.auth.admin.listUsers();
  const adminUser = users?.find((u) => u.email === 'admin@pixelforge.dev');
  const leadUser = users?.find((u) => u.email === 'lead@pixelforge.dev');
  const devUser = users?.find((u) => u.email === 'dev@pixelforge.dev');

  if (adminUser && leadUser && devUser) {
    // Check if project already exists
    const { data: existingProjects } = await supabase
      .from('projects')
      .select('id')
      .eq('name', 'Dragon\'s Quest RPG');

    if (!existingProjects || existingProjects.length === 0) {
      const { data: project, error: projError } = await supabase
        .from('projects')
        .insert({
          name: 'Dragon\'s Quest RPG',
          description: 'An epic role-playing game featuring a vast open world, complex character progression, and an engaging storyline about a dragon-rider saving their kingdom.',
          deadline: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days from now
          status: 'active',
          created_by: adminUser.id,
          lead_id: leadUser.id,
        })
        .select()
        .single();

      if (projError) {
        console.error('  ❌ Error creating project:', projError.message);
      } else if (project) {
        console.log(`  ✅ Project created: ${project.id}`);

        // Assign developer to project
        const { error: memberError } = await supabase
          .from('project_members')
          .insert({
            project_id: project.id,
            user_id: devUser.id,
            assigned_by: leadUser.id,
          });

        if (memberError) {
          console.error('  ❌ Error assigning member:', memberError.message);
        } else {
          console.log('  ✅ Developer assigned to project');
        }
      }
    } else {
      console.log('  ⚠️  Sample project already exists, skipping...');
    }

    // Create a second project
    const { data: existingProjects2 } = await supabase
      .from('projects')
      .select('id')
      .eq('name', 'Pixel Racers');

    if (!existingProjects2 || existingProjects2.length === 0) {
      const { error: proj2Error } = await supabase
        .from('projects')
        .insert({
          name: 'Pixel Racers',
          description: 'A fast-paced multiplayer racing game with retro-inspired pixel art graphics, customizable vehicles, and competitive online leaderboards.',
          deadline: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'active',
          created_by: adminUser.id,
          lead_id: leadUser.id,
        });

      if (proj2Error) {
        console.error('  ❌ Error creating second project:', proj2Error.message);
      } else {
        console.log('  ✅ Second project created');
      }
    }
  }

  console.log('\n🎉 Seeding complete!\n');
  console.log('Test Credentials:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  testUsers.forEach((u) => {
    console.log(`  ${u.role.padEnd(15)} | ${u.email.padEnd(25)} | ${u.password}`);
  });
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

seed().catch(console.error);
