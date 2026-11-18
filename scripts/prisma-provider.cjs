const fs = require('node:fs');
const provider = process.argv[2];
if (!['sqlite','postgresql'].includes(provider)) throw new Error('Usa npm run db:provider -- sqlite|postgresql');
const path = 'prisma/schema.prisma';
fs.writeFileSync(path, fs.readFileSync(path,'utf8').replace(/provider = "(?:sqlite|postgresql)"/, 'provider = "'+provider+'"'));
console.log('Provider actualizado. Genera migraciones independientes para '+provider+'.');
