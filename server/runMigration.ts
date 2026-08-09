import { supabase } from './supabase';
import fs from 'fs';
import path from 'path';

/**
 * Run the landing page images migration
 * This creates the necessary tables in Supabase
 */
export async function runLandingPageMigration() {
  try {
    console.log('Running landing page images migration...');

    const migrationPath = path.join(process.cwd(), 'supabase/migrations/022_landing_page_images.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    // Split by semicolons to execute statements individually
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      if (statement.trim()) {
        const { error } = await supabase.rpc('exec_sql', { sql: statement });
        if (error) {
          console.warn(`Warning executing statement: ${error.message}`);
        }
      }
    }

    console.log('✓ Migration completed successfully');
    console.log('\nVerifying tables...');

    // Verify tables exist
    const { data: tables, error: tablesError } = await supabase
      .from('landing_page_images')
      .select('count')
      .limit(1);

    if (tablesError) {
      console.error('❌ Tables not created. Please run migration manually in Supabase Dashboard.');
      console.log('\nTo apply migration manually:');
      console.log('1. Go to Supabase Dashboard');
      console.log('2. Click "SQL Editor"');
      console.log('3. Paste contents of supabase/migrations/022_landing_page_images.sql');
      console.log('4. Click "Run"');
      return false;
    }

    console.log('✓ Tables verified');
    return true;
  } catch (error) {
    console.error('Migration error:', error);
    return false;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runLandingPageMigration()
    .then((success) => {
      if (success) {
        console.log('\n✓ Migration successful!');
        process.exit(0);
      } else {
        console.log('\n⚠ Migration needs manual intervention');
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}