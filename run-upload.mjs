import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from 'process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const tsxCmd = path.join(__dirname, 'node_modules', '.bin', 'tsx.cmd');
const seedScript = path.join(__dirname, 'server', 'uploadHeroImage.ts');

try {
  console.log('Running upload script...');
  execSync(`"${tsxCmd}" "${seedScript}"`, {
    cwd: __dirname,
    stdio: 'inherit',
    env: {
      ...env,
      NODE_ENV: 'development',
    },
    timeout: 30000,
  });
  console.log('Upload script completed successfully');
} catch (error) {
  console.error('Upload script failed:', error?.status || error?.message || 'Unknown error');
  process.exit(error?.status || 1);
}
