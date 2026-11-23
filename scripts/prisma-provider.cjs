const fs = require('node:fs');

const provider = process.argv[2] ?? 'postgresql';
if (provider !== 'postgresql') {
  throw new Error('BiblioQR usa únicamente PostgreSQL. Usa: npm run db:provider -- postgresql');
}

const path = 'prisma/schema.prisma';
const current = fs.readFileSync(path, 'utf8');
const updated = current.replace(/provider = "(?:sqlite|postgresql)"/, 'provider = "postgresql"');
fs.writeFileSync(path, updated);
console.log('Provider configurado en postgresql.');
