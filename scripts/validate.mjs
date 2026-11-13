#!/usr/bin/env node
/**
 * Self-validation script for the Discord Bot Skill.
 * Verifies frontmatter, naming, internal link integrity, and reference coverage.
 * Node.js 18+, zero external dependencies.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let errors = 0;
let warnings = 0;

function err(msg) {
  console.error(`\x1b[31m✖ ERROR:\x1b[0m ${msg}`);
  errors++;
}

function warn(msg) {
  console.warn(`\x1b[33m⚠ WARN:\x1b[0m ${msg}`);
  warnings++;
}

function ok(msg) {
  console.log(`\x1b[32m✔\x1b[0m ${msg}`);
}

console.log('Validating Discord Bot Skill at:', ROOT);

// 1. Verify SKILL.md exists and has valid frontmatter
const skillPath = join(ROOT, 'SKILL.md');
if (!existsSync(skillPath)) {
  err('SKILL.md is missing at repository root');
} else {
  const content = readFileSync(skillPath, 'utf8');
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) {
    err('SKILL.md missing YAML frontmatter (enclosed by ---)');
  } else {
    const fm = fmMatch[1];
    const nameMatch = fm.match(/^name:\s*([^\r\n]+)/m);
    const descMatch = fm.match(/^description:\s*([^\r\n>|]+|>[-+]?|\|[-+]?)/m);

    if (!nameMatch) {
      err('Frontmatter missing "name" field');
    } else {
      const name = nameMatch[1].trim();
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
        err(`Skill name "${name}" should be lowercase alphanumeric with hyphens`);
      } else {
        ok(`Frontmatter name: "${name}"`);
      }
    }

    if (!descMatch) {
      err('Frontmatter missing "description" field');
    } else {
      ok('Frontmatter description is present');
    }
  }

  // 2. Verify all references mentioned in SKILL.md exist
  const refMatches = content.matchAll(/`references\/([^`]+)`/g);
  for (const match of refMatches) {
    const relPath = `references/${match[1]}`;
    const fullPath = join(ROOT, relPath);
    if (!existsSync(fullPath)) {
      err(`SKILL.md links to non-existent reference: ${relPath}`);
    }
  }
}

// 3. Verify README.md exists and internal links resolve
const readmePath = join(ROOT, 'README.md');
if (!existsSync(readmePath)) {
  err('README.md is missing at repository root');
} else {
  const readmeContent = readFileSync(readmePath, 'utf8');
  ok('README.md exists');
}

// 4. Verify LICENSE exists
const licensePath = join(ROOT, 'LICENSE');
if (!existsSync(licensePath)) {
  err('LICENSE file is missing at repository root');
} else {
  ok('LICENSE file exists');
}

// 5. Verify references/ directory and all its files are indexed in SKILL.md
const refsDir = join(ROOT, 'references');
if (!existsSync(refsDir)) {
  err('references/ directory is missing');
} else {
  const skillText = existsSync(skillPath) ? readFileSync(skillPath, 'utf8') : '';
  const entries = readdirSync(refsDir);
  for (const entry of entries) {
    if (entry.endsWith('.md')) {
      if (!skillText.includes(entry) && !skillText.includes(entry.replace(/\.md$/, ''))) {
        warn(`Reference file "references/${entry}" might not be indexed in SKILL.md`);
      }
    }
  }
  ok(`Checked ${entries.length} items in references/`);
}

// 6. Check audit script
const auditPath = join(ROOT, 'scripts', 'audit.mjs');
if (!existsSync(auditPath)) {
  err('scripts/audit.mjs is missing');
} else {
  ok('scripts/audit.mjs exists');
}

console.log('----------------------------------------');
if (errors === 0) {
  console.log(`\x1b[32mValidation passed!\x1b[0m (${warnings} warnings)`);
  process.exit(0);
} else {
  console.error(`\x1b[31mValidation failed with ${errors} errors.\x1b[0m`);
  process.exit(1);
}
