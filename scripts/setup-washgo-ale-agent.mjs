#!/usr/bin/env node
/** 相容舊指令，改走三品牌腳本 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const result = spawnSync(process.execPath, [join(here, 'setup-editor-agents.mjs'), 'washgo'], {
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
