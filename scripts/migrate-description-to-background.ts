import * as fs from 'fs';
import * as path from 'path';

const filePath = path.resolve('.goal-memory/goals.jsonl');
const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);

const migrated = lines.map((line) => {
  const obj = JSON.parse(line) as Record<string, unknown>;
  if ('description' in obj) {
    obj.background = obj.description;
    delete obj.description;
  }
  return JSON.stringify(obj);
});

fs.writeFileSync(filePath, migrated.join('\n') + '\n');
console.log(`Migrated ${migrated.length} records in ${filePath}`);
