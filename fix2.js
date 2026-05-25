import fs from 'fs';
const files = [
  './server.js'
];
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/\\\`/g, '\`').replace(/\\\$/g, '$');
  fs.writeFileSync(file, content);
}
console.log('Fixed server.js');
