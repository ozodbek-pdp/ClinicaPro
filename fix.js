import fs from 'fs';
const files = [
  './src/pages/patients.js',
  './src/pages/doctors.js',
  './src/pages/diagnoses.js',
  './src/pages/dashboard.js'
];
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/\\\`/g, '\`').replace(/\\\$/g, '$');
  fs.writeFileSync(file, content);
}
console.log('Fixed');
