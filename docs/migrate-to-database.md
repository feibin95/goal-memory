# 迁移到数据库（SQLite + Prisma）

## 何时做

模型字段基本稳定、不再频繁增删字段之后再做。

## 需要做什么

### 1. 安装依赖

```bash
npm install prisma @prisma/client
npx prisma init --datasource-provider sqlite
```

### 2. 定义表结构（prisma/schema.prisma）

对照 `types/index.ts` 的 interface 写：

```prisma
model Goal {
  id               String   @id
  title            String
  description      String
  parent_id        String?
  dependencies     String   @default("[]") // JSON 数组存为字符串
  status           String
  cost             Int
  ddl              String?
  success_criteria String
  notes            String   @default("[]") // JSON 数组存为字符串
  created_at       String
  updated_at       String
}

model Attempt {
  id         String  @id
  goal_id    String
  hypothesis String
  action     String
  result     String
  evidence   String
  outcome    String
  gradient   Float?
  created_at String
}

model KBEntry {
  id         String @id
  title      String
  body       String
  tags       String @default("[]") // JSON 数组存为字符串
  created_at String
}
```

### 3. 写数据迁移脚本（scripts/import-jsonl.ts）

```ts
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';

const prisma = new PrismaClient();

async function main() {
  // 读取 goals.jsonl
  const goalsRaw = readFileSync('.goal-memory/goals.jsonl', 'utf-8');
  for (const line of goalsRaw.trim().split('\n')) {
    const goal = JSON.parse(line);
    await prisma.goal.upsert({
      where: { id: goal.id },
      update: goal,
      create: {
        ...goal,
        dependencies: JSON.stringify(goal.dependencies),
        notes: JSON.stringify(goal.notes),
      },
    });
  }

  // 同理处理 attempts.jsonl 和 kb.jsonl
}

main();
```

### 4. 替换 lib/store.ts

把现有的 `loadGoals()`、`saveGoal()` 等函数，改成调用 `prisma.goal.findMany()`、`prisma.goal.upsert()` 等。API 路由层（`app/api/`）不需要改，因为它只调用这些函数。

## 注意事项

- `dependencies` 和 `notes` 是数组，SQLite 没有原生数组类型，先用 JSON 字符串存，读出来再 `JSON.parse()`
- 如果后续换 PostgreSQL，这两个字段可以改成原生 `Json` 类型，Prisma 会自动处理
- 迁移后删掉 `.goal-memory/` 目录和 `lib/store.ts` 里的 JSONL 相关代码
