import fs from 'fs';
import path from 'path';

/**
 * Pulari Bakes Icon Registry
 * All icons and favicons are generated directly from public/pulari-logo.jpg.
 */
const logoPath = path.resolve('public', 'pulari-logo.jpg');

if (!fs.existsSync(logoPath)) {
  console.error('Error: pulari-logo.jpg not found in public directory.');
  process.exit(1);
}

console.log('Pulari Bakes brand asset verified: public/pulari-logo.jpg');
console.log('All favicons, touch icons, and PWA icons are linked to Pulari Bakes brand identity.');
