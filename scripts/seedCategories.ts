import 'dotenv/config';
import { addConfigItem, listConfigItems } from '../server/repository';

const categories = [
  { name: 'Bank Code Issues', description: 'Bank code/routing number issues', slaHours: 24 },
  { name: 'Notification issue', description: 'Notification delivery failures', slaHours: 48 },
  { name: 'Disbursement discrepancy', description: 'Disbursement amount mismatches', slaHours: 48 },
  { name: 'Failed Disbursement', description: 'Failed disbursement transactions', slaHours: 24 },
  { name: 'Transaction reference discrepancies', description: 'Transaction reference number issues', slaHours: 24 },
  { name: 'Settlement', description: 'Settlement processing delays', slaHours: 48 },
  { name: 'Configuration Issues', description: 'Configuration/setup problems', slaHours: 72 },
  { name: 'Reconciliation and Settlement', description: 'Reconciliation and settlement tasks', slaHours: 72 },
  { name: 'System Performance', description: 'System performance issues', slaHours: 24 },
  { name: 'Payment Gateway Integration', description: 'Payment gateway integration problems', slaHours: 48 },
  { name: 'Fund Management', description: 'Fund management operations', slaHours: 24 },
  { name: 'Failed Payment', description: 'Failed payment processing', slaHours: 48 },
  { name: 'Invoice generation and account validation issue', description: 'Invoice generation and account validation issues', slaHours: 24 },
];

async function seedCategories() {
  console.log('Checking existing categories...');
  const existing = await listConfigItems('categories', []);
  console.log(`Found ${existing.length} existing categories`);

  const existingNames = new Set(existing.map((c: any) => c.name?.toLowerCase()));
  let added = 0;
  let skipped = 0;

  for (const cat of categories) {
    if (existingNames.has(cat.name.toLowerCase())) {
      console.log(`  ���  Skipping "${cat.name}" (already exists)`);
      skipped++;
      continue;
    }

    try {
      await addConfigItem('categories', cat);
      console.log(`  �� Added "${cat.name}" (SLA: ${cat.slaHours}h)`);
      added++;
    } catch (error) {
      console.error(`  ��� Failed to add "${cat.name}":`, error);
    }
  }

  console.log(`\nDone! Added: ${added}, Skipped: ${skipped}`);
  
  const final = await listConfigItems('categories', []);
  console.log(`\nTotal categories in system: ${final.length}`);
  final.forEach((c: any) => {
    console.log(`  - ${c.name}: ${c.slaHours}h${c.description ? ` - ${c.description}` : ''}`);
  });
}

seedCategories().catch(console.error);