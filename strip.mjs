import { transformSync } from 'esbuild';
import fs from 'fs';
import path from 'path';

function stripTypes(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      stripTypes(fullPath);
    } else if (fullPath.endsWith('.ts')) {
      const code = fs.readFileSync(fullPath, 'utf-8');
      const result = transformSync(code, { loader: 'ts', format: 'esm' });
      fs.writeFileSync(fullPath.replace('.ts', '.js'), result.code);
      fs.unlinkSync(fullPath);
    }
  }
}
stripTypes('./src');
