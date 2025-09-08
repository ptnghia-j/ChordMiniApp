#!/usr/bin/env node
/*
 * Generator: Analysis Index & Sub-indexes
 * Creates docs/analysis/INDEX.md and per-category indexes under docs/analysis/indexes/
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const ANALYSIS_DIR = path.join(ROOT, 'docs/analysis');
const INDEX_DIR = path.join(ANALYSIS_DIR, 'indexes');

const categories = [
  { key: 'components', title: 'Frontend Components', base: 'src/components' },
  { key: 'api', title: 'API Routes (Next.js)', base: 'src/app/api' },
  { key: 'app_misc', title: 'App Pages & Layout (non-API)', base: 'src/app' },
  { key: 'hooks', title: 'React Hooks', base: 'src/hooks' },
  { key: 'contexts', title: 'React Contexts', base: 'src/contexts' },
  { key: 'front_services', title: 'Frontend Services', base: 'src/services' },
  { key: 'py_blueprints', title: 'Backend Blueprints (Flask)', base: 'python_backend/blueprints' },
  { key: 'py_services', title: 'Backend Services (Python)', base: 'python_backend/services' },
  { key: 'py_models', title: 'Python ML Models', base: 'python_backend/models' },
  { key: 'py_utils', title: 'Python Utilities', base: 'python_backend/utils' },
  { key: 'py_top', title: 'Backend Top-level Files', base: 'python_backend' },
  { key: 'scripts', title: 'Scripts', base: 'scripts' },
];

function listMdFiles(relBase, filterFn) {
  const base = path.join(ANALYSIS_DIR, relBase);
  const results = [];
  if (!fs.existsSync(base)) return results;
  const stack = [base];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const relFromAnalysis = path.relative(ANALYSIS_DIR, full);
        if (!filterFn || filterFn(relFromAnalysis)) {
          results.push(relFromAnalysis);
        }
      }
    }
  }
  return results.sort((a, b) => a.localeCompare(b));
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeFile(filepath, content) {
  ensureDir(path.dirname(filepath));
  fs.writeFileSync(filepath, content, 'utf8');
}

function makeLink(relPath) {
  return `- [${relPath.split('/').slice(-1)[0].replace(/\.md$/, '')}](/${path.posix.join('docs/analysis', relPath)})`;
}

function build() {
  const listings = {};

  for (const cat of categories) {
    let files = listMdFiles(cat.base, (p) => true);
    if (cat.key === 'app_misc') {
      files = files.filter((p) => !p.startsWith('src/app/api/'));
    }
    if (cat.key === 'py_top') {
      // only top-level .md inside python_backend
      files = files.filter((p) => !p.startsWith('python_backend/blueprints/') &&
        !p.startsWith('python_backend/services/') &&
        !p.startsWith('python_backend/utils/') &&
        !p.startsWith('python_backend/models/'));
    }
    listings[cat.key] = files;

    // Write sub-index file
    const subIndexPath = path.join(INDEX_DIR, `${cat.key}.md`);
    const lines = [];
    lines.push(`# ${cat.title} Index`);
    lines.push('');
    lines.push(`Total files: ${files.length}`);
    lines.push('');
    files.forEach((rel) => lines.push(makeLink(rel)));
    lines.push('');
    lines.push('Maintenance: keep this list alphabetized. Run scripts/generate-analysis-index.js after adding new analysis files.');
    writeFile(subIndexPath, lines.join('\n'));
  }

  // Build master INDEX.md
  const lines = [];
  lines.push('# ChordMiniApp Analysis Index');
  lines.push('');
  lines.push('This is the navigable entry point for all analysis documents.');
  lines.push('');
  lines.push('Maintenance: Update this index whenever new analysis files are added (run the generator). Keep alphabetical order within each category.');
  lines.push('');
  for (const cat of categories) {
    const files = listings[cat.key] || [];
    const subPath = path.posix.join('docs/analysis/indexes', `${cat.key}.md`);
    lines.push(`## ${cat.title} (${files.length})`);
    lines.push('');
    lines.push(`- Open full list: [${cat.title} Index](/${subPath})`);
    const preview = files.slice(0, 10).map((rel) => makeLink(rel));
    if (preview.length) {
      lines.push('- Preview:');
      preview.forEach((l) => lines.push(`  ${l}`));
    } else {
      lines.push('- No files yet.');
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('Notes:');
  lines.push('- Use standard Markdown code fences (```), not custom tags.');
  lines.push('- See GLOSSARY.md for terminology and acronyms.');
  lines.push('');

  writeFile(path.join(ANALYSIS_DIR, 'INDEX.md'), lines.join('\n'));
}

build();
console.log('✅ Generated docs/analysis/INDEX.md and per-category indexes in docs/analysis/indexes/');

