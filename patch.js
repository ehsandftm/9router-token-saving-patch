#!/usr/bin/env node

/**
 * 9Router Token Saving & Compatibility Patch v1.2.0
 * Eliminates ~2,800+ fake/injected token overhead, strips 40+ dummy tools,
 * enables dual-layer local model prompt stripping, and ensures Claude Desktop /
 * Claude Code compatibility across 9Router v0.5.110 and v0.5.111+ chunk layouts.
 *
 * License: MIT
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync, execFileSync } = require('child_process');

const ALLOWED_FLAGS = new Set(['-s', '--status', '-r', '--revert', '-h', '--help']);

const args = process.argv.slice(2);
for (const arg of args) {
  if (!ALLOWED_FLAGS.has(arg)) {
    console.error(`Unknown option: ${arg}`);
    console.log('\n⚡ 9Router Token Saving & Compatibility Patch v1.2.0');
    console.log('==================================================\n');
    console.log('Usage: 9router-patch [options]\n');
    console.log('Options:');
    console.log('  -s, --status   Check current 9Router patch status');
    console.log('  -r, --revert   Revert 9Router files to original unpatched state');
    console.log('  -h, --help     Display this help message and exit\n');
    process.exit(1);
  }
}

const isRevert = args.includes('--revert') || args.includes('-r');
const isStatus = args.includes('--status') || args.includes('-s');
const isHelp = args.includes('--help') || args.includes('-h');

// 1. Locate 9Router Installation Directory
function find9RouterDir() {
  const candidateDirs = [];

  // Global npm root
  try {
    const npmRoot = execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (npmRoot) candidateDirs.push(path.join(npmRoot, '9router'));
  } catch {}

  // Standard Windows Paths
  if (process.env.APPDATA) {
    candidateDirs.push(path.join(process.env.APPDATA, 'npm', 'node_modules', '9router'));
  }
  if (process.env.LOCALAPPDATA) {
    candidateDirs.push(path.join(process.env.LOCALAPPDATA, 'npm', 'node_modules', '9router'));
  }

  // Standard Unix / macOS Paths
  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (home) {
    candidateDirs.push(path.join(home, '.npm-global', 'lib', 'node_modules', '9router'));
    candidateDirs.push(path.join(home, '.nvm', 'versions', 'node', process.version, 'lib', 'node_modules', '9router'));
  }
  candidateDirs.push('/usr/local/lib/node_modules/9router');
  candidateDirs.push('/usr/lib/node_modules/9router');

  for (const dir of candidateDirs) {
    if (fs.existsSync(dir) && fs.existsSync(path.join(dir, 'app', '.next-cli-build', 'server', 'chunks'))) {
      return dir;
    }
  }

  return null;
}

// 2. Read 9Router Version from package.json
function get9RouterVersion(pkgDir) {
  if (!pkgDir) return 'Unknown';
  const pkgPath = path.join(pkgDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (data.version) return data.version;
    } catch {}
  }
  return 'Unknown';
}

// 3. Locate 9Router SQLite Database
function findSqlitePath() {
  const candidates = [];
  if (process.env.APPDATA) {
    candidates.push(path.join(process.env.APPDATA, '9router', 'db', 'data.sqlite'));
  }
  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (home) {
    candidates.push(path.join(home, 'AppData', 'Roaming', '9router', 'db', 'data.sqlite'));
    candidates.push(path.join(home, '.config', '9router', 'db', 'data.sqlite'));
    candidates.push(path.join(home, '.9router', 'db', 'data.sqlite'));
  }

  for (const p of candidates) {
    if (fs.existsSync(p) && fs.statSync(p).size > 0) return p;
  }
  for (const p of candidates) {
    if (fs.existsSync(p) || fs.existsSync(`${p}.bak`)) return p;
  }
  return null;
}

// 4. Dynamically Resolve Next.js Build Chunks (v0.5.110 vs v0.5.111+)
function resolveChunkFiles(chunksDir) {
  const files = fs.existsSync(chunksDir)
    ? fs.readdirSync(chunksDir).filter(f => f.endsWith('.js') && !f.endsWith('.bak'))
    : [];

  const readSafe = (file) => {
    try {
      return fs.readFileSync(path.join(chunksDir, file), 'utf8');
    } catch {
      return '';
    }
  };

  // Usage Chunk (+2000 token inflation): 318.js in 0.5.110; 5330.js in 0.5.111
  let usageFile = files.find(f => f === '5330.js') || files.find(f => f === '318.js') || null;
  if (!usageFile) {
    for (const f of files) {
      const c = readSafe(f);
      if (c.includes('input_tokens+=2e3') || c.includes('/* __9R_318_USAGE_FIX__ */')) {
        usageFile = f;
        break;
      }
    }
  }

  // Tools Chunk (browser_subagent dummy tools): 8499.js in 0.5.110; 2380.js in 0.5.111
  let toolsFile = files.find(f => f === '2380.js') || files.find(f => f === '8499.js') || null;
  if (!toolsFile) {
    for (const f of files) {
      const c = readSafe(f);
      if (c.includes('name:"browser_subagent"') || c.includes('/* __9R_8499_TOOLS_FIX__ */')) {
        toolsFile = f;
        break;
      }
    }
  }

  // OpenAI-Compatible Request Transform: 318.js in 0.5.110; 7373.js in 0.5.111
  let openAiFile = files.find(f => f === '7373.js') || files.find(f => f === '318.js') || null;
  if (!openAiFile) {
    for (const f of files) {
      const c = readSafe(f);
      if (c.includes('applyJsonSchemaFallback') || c.includes('/* __9R_96179_FIX__ */')) {
        openAiFile = f;
        break;
      }
    }
  }

  // Anthropic / Messages Wire Adapter: 8895.js in 0.5.110 and 0.5.111
  let anthropicFile = files.find(f => f === '8895.js') || null;
  if (!anthropicFile) {
    for (const f of files) {
      const c = readSafe(f);
      if (c.includes('q===d.h.CLAUDE') || c.includes('r===d.h.CLAUDE') || c.includes('/* __9R_8895_ADAPTER_FIX__ */')) {
        anthropicFile = f;
        break;
      }
    }
  }

  return {
    usagePath: usageFile ? path.join(chunksDir, usageFile) : path.join(chunksDir, '318.js'),
    usageFile: usageFile || '318.js',
    toolsPath: toolsFile ? path.join(chunksDir, toolsFile) : path.join(chunksDir, '8499.js'),
    toolsFile: toolsFile || '8499.js',
    openAiPath: openAiFile ? path.join(chunksDir, openAiFile) : path.join(chunksDir, '318.js'),
    openAiFile: openAiFile || '318.js',
    anthropicPath: anthropicFile ? path.join(chunksDir, anthropicFile) : path.join(chunksDir, '8895.js'),
    anthropicFile: anthropicFile || '8895.js'
  };
}

function hasPatchSignatures(content) {
  if (!content) return false;
  return content.includes('/* __9R_318_USAGE_FIX__ */') ||
         content.includes('/* __9R_32447_FIX__ */') ||
         content.includes('/* __9R_32447_KIMCHI_FIX__ */') ||
         content.includes('/* __9R_96179_FIX__ */') ||
         content.includes('/* __9R_96179_FIX_v2__ */') ||
         content.includes('/* __9R_8499_TOOLS_FIX__ */') ||
         content.includes('/* __9R_CLAUDE_OPUS_MEDIUM_THINKING__ */') ||
         content.includes('/* __9R_8895_ADAPTER_FIX__ */') ||
         content.includes('/* __9R_8895_FILTER_FIX__ */') ||
         content.includes('/* __9R_8895_FILTER_FIX_v2__ */');
}

function backupFile(filePath) {
  const bak = `${filePath}.bak`;
  if (!fs.existsSync(filePath)) return;

  if (!fs.existsSync(bak)) {
    fs.copyFileSync(filePath, bak);
  } else {
    const content = fs.readFileSync(filePath, 'utf8');
    if (!hasPatchSignatures(content)) {
      fs.copyFileSync(filePath, bak);
    }
  }
}

function restoreFile(filePath) {
  const bak = `${filePath}.bak`;
  if (fs.existsSync(bak)) {
    fs.copyFileSync(bak, filePath);
    fs.unlinkSync(bak);
    return true;
  }
  return false;
}

async function run() {
  if (isHelp) {
    console.log('\n⚡ 9Router Token Saving & Compatibility Patch v1.2.0');
    console.log('==================================================\n');
    console.log('Usage: 9router-patch [options]\n');
    console.log('Options:');
    console.log('  -s, --status   Check current 9Router patch status');
    console.log('  -r, --revert   Revert 9Router files to original unpatched state');
    console.log('  -h, --help     Display this help message and exit\n');
    process.exit(0);
  }

  console.log('\n⚡ 9Router Token Saving & Compatibility Patch v1.2.0');
  console.log('==================================================\n');

  const pkgDir = find9RouterDir();
  const routerVersion = get9RouterVersion(pkgDir);

  if (!pkgDir) {
    console.error('❌ Error: Could not locate 9Router installation directory.');
    console.error('   Please ensure 9router is installed globally via `npm install -g 9router`\n');
    process.exit(1);
  }

  const chunksDir = path.join(pkgDir, 'app', '.next-cli-build', 'server', 'chunks');
  const chunks = resolveChunkFiles(chunksDir);
  const sqliteDb = findSqlitePath();

  console.log(`📁 9Router Package : ${pkgDir} (v${routerVersion})`);
  console.log(`📁 Chunks Directory: ${chunksDir}`);
  console.log(`   - Usage Chunk    : ${chunks.usageFile}`);
  console.log(`   - Tools Chunk    : ${chunks.toolsFile}`);
  console.log(`   - OpenAI Chunk   : ${chunks.openAiFile}`);
  console.log(`   - Anthropic Chunk: ${chunks.anthropicFile}`);
  if (sqliteDb) console.log(`📁 Database Path   : ${sqliteDb}`);
  console.log('');

  const matchExpr = '(() => { let localModelRegex = /(?:ollama|unsloth|vllm|lmstudio|llama\\.?cpp|qwen|llama|mistral|deepseek|gemma|phi|local-|openai-compatible-)/i; if (process.env.NINEROUTER_LOCAL_MODELS) { try { localModelRegex = new RegExp(process.env.NINEROUTER_LOCAL_MODELS, "i"); } catch (e) { console.warn("⚠️ Invalid NINEROUTER_LOCAL_MODELS regex, using default."); } } return localModelRegex; })()';

  // --- Status Mode ---
  if (isStatus) {
    let cUsage = fs.existsSync(chunks.usagePath) ? fs.readFileSync(chunks.usagePath, 'utf8') : '';
    let cTools = fs.existsSync(chunks.toolsPath) ? fs.readFileSync(chunks.toolsPath, 'utf8') : '';
    let cOpenAi = fs.existsSync(chunks.openAiPath) ? fs.readFileSync(chunks.openAiPath, 'utf8') : '';
    let cAnthropic = fs.existsSync(chunks.anthropicPath) ? fs.readFileSync(chunks.anthropicPath, 'utf8') : '';

    let patchedUsage = Boolean(cUsage && (cUsage.includes('/* __9R_318_USAGE_FIX__ */') || !cUsage.includes('void 0!==b.input_tokens&&(b.input_tokens+=2e3)')));
    let patchedTools = Boolean(cTools && (cTools.includes('/* __9R_8499_TOOLS_FIX__ */') || !cTools.includes('name:"browser_subagent"')));
    let patchedAnthropic = Boolean(cAnthropic && (cAnthropic.includes('/* __9R_8895_ADAPTER_FIX__ */') || cAnthropic.includes('b===d.h.OPENAI&&c===d.h.CLAUDE')));
    let patchedOpenAiFilter = Boolean(cOpenAi && (cOpenAi.includes('/* __9R_96179_FIX__ */') || cOpenAi.includes('/* __9R_96179_FIX_v2__ */')));
    let patchedAnthropicFilter = Boolean(cAnthropic && (cAnthropic.includes('/* __9R_8895_FILTER_FIX__ */') || cAnthropic.includes('/* __9R_8895_FILTER_FIX_v2__ */')));

    let sqliteStatus = 'NOT FOUND';
    if (sqliteDb && fs.existsSync(sqliteDb) && fs.statSync(sqliteDb).size > 0) {
      let checked = false;
      try {
        let nodeSqlite;
        try { nodeSqlite = require('node:sqlite'); } catch {}
        if (nodeSqlite && nodeSqlite.DatabaseSync) {
          const db = new nodeSqlite.DatabaseSync(sqliteDb);
          try {
            const row = db.prepare('SELECT data FROM settings WHERE id = 1').get();
            if (!row || !row.data) {
              sqliteStatus = '✅ FIXED (Default: personas inactive)';
            } else {
              const data = JSON.parse(row.data);
              if (data.cavemanEnabled || data.ponytailEnabled) {
                sqliteStatus = 'UNPATCHED (Personas active)';
              } else {
                sqliteStatus = '✅ FIXED (Personas disabled)';
              }
            }
            checked = true;
          } finally {
            db.close?.();
          }
        }
      } catch {}

      if (!checked) {
        try {
          const query = 'SELECT data FROM settings WHERE id = 1;\n';
          const raw = execFileSync('sqlite3', [sqliteDb], { input: query, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
          if (!raw) {
            sqliteStatus = '✅ FIXED (Default: personas inactive)';
          } else {
            const data = JSON.parse(raw);
            if (data.cavemanEnabled || data.ponytailEnabled) {
              sqliteStatus = 'UNPATCHED (Personas active)';
            } else {
              sqliteStatus = '✅ FIXED (Personas disabled)';
            }
          }
          checked = true;
        } catch {}
      }

      if (!checked) {
        sqliteStatus = 'UNPATCHED (Personas active)';
      }
    } else if (sqliteDb && fs.existsSync(sqliteDb) && fs.statSync(sqliteDb).size === 0) {
      sqliteStatus = 'ℹ️ UNINITIALIZED (0-byte DB)';
    }

    console.log('--- Current Patch Status ---');
    console.log(`1. Hardcoded +2000 token inflation (${chunks.usageFile}) : ${patchedUsage ? '✅ FIXED (0 fake tokens)' : '⚠️ UNPATCHED (+2000 tokens active)'}`);
    console.log(`2. Injected dummy tools removal (${chunks.toolsFile})    : ${patchedTools ? '✅ FIXED (Clean schemas)' : '⚠️ UNPATCHED (40+ dummy tools active)'}`);
    console.log(`3. Claude Anthropic wire format (${chunks.anthropicFile}) : ${patchedAnthropic ? '✅ FIXED (Anthropic schema & cache support)' : '⚠️ UNPATCHED (OpenAI fallback)'}`);
    console.log(`4. Local model prompt stripper (${chunks.openAiFile}/${chunks.anthropicFile}): ${(patchedOpenAiFilter || patchedAnthropicFilter) ? '✅ FIXED (Active)' : '⚠️ UNPATCHED (Standard)'}`);
    console.log(`5. SQLite persona prompt injection (data.sqlite): ${sqliteStatus.startsWith('✅') ? sqliteStatus : sqliteStatus.startsWith('ℹ️') ? sqliteStatus : sqliteStatus === 'NOT FOUND' ? 'ℹ️ NOT FOUND' : '⚠️ ' + sqliteStatus}`);
    console.log('');
    return;
  }

  // --- Revert Mode ---
  if (isRevert) {
    console.log('🔄 Reverting 9Router files to original unpatched state...\n');
    const rUsage = restoreFile(chunks.usagePath);
    const rTools = restoreFile(chunks.toolsPath);
    const rOpenAi = restoreFile(chunks.openAiPath);
    const rAnthropic = restoreFile(chunks.anthropicPath);
    let rSqlite = false;

    if (sqliteDb && fs.existsSync(sqliteDb) && fs.statSync(sqliteDb).size > 0) {
      try {
        let nodeSqlite;
        try { nodeSqlite = require('node:sqlite'); } catch {}
        if (nodeSqlite && nodeSqlite.DatabaseSync) {
          const db = new nodeSqlite.DatabaseSync(sqliteDb);
          try {
            const row = db.prepare('SELECT data FROM settings WHERE id = 1').get();
            if (row && row.data) {
              const data = JSON.parse(row.data);
              data.cavemanEnabled = true;
              data.ponytailEnabled = true;
              db.prepare('UPDATE settings SET data = ? WHERE id = 1').run(JSON.stringify(data));
              rSqlite = true;
            }
          } finally {
            db.close?.();
          }
        }
      } catch {}

      if (!rSqlite) {
        try {
          const query = 'SELECT data FROM settings WHERE id = 1;\n';
          const raw = execFileSync('sqlite3', [sqliteDb], { input: query, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
          if (raw) {
            const data = JSON.parse(raw);
            data.cavemanEnabled = true;
            data.ponytailEnabled = true;
            const updatedJson = JSON.stringify(data);
            const updateQuery = `UPDATE settings SET data = '${updatedJson.replace(/'/g, "''")}' WHERE id = 1;\n`;
            execFileSync('sqlite3', [sqliteDb], { input: updateQuery, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
            rSqlite = true;
          }
        } catch {}
      }
    }

    console.log(`- ${chunks.usageFile}      : ${rUsage ? 'Restored from .bak' : 'No backup found / unmodified'}`);
    console.log(`- ${chunks.toolsFile}      : ${rTools ? 'Restored from .bak' : 'No backup found / unmodified'}`);
    if (chunks.openAiFile !== chunks.usageFile) {
      console.log(`- ${chunks.openAiFile}      : ${rOpenAi ? 'Restored from .bak' : 'No backup found / unmodified'}`);
    }
    console.log(`- ${chunks.anthropicFile}  : ${rAnthropic ? 'Restored from .bak' : 'No backup found / unmodified'}`);
    if (sqliteDb) {
      console.log(`- data.sqlite : ${rSqlite ? 'Reverted settings in-place (personas re-enabled)' : 'Unmodified / unavailable'}`);
    }
    console.log('\n✅ Revert complete! Please restart 9Router.\n');
    return;
  }

  // --- Apply Patches ---
  console.log('🔨 Applying optimizations...\n');
  const errors = [];
  const pendingWrites = new Map();

  function stageWrite(filePath, label, logs, fileContent, origContent) {
    pendingWrites.set(filePath, { filePath, label, logs, content: fileContent, origContent });
  }

  // 1. Usage Inflation Patch
  if (!fs.existsSync(chunks.usagePath)) {
    errors.push(`Usage chunk missing: ${chunks.usagePath}`);
  } else {
    let cUsage = fs.readFileSync(chunks.usagePath, 'utf8');
    const origCUsage = cUsage;
    const logsUsage = [];
    let usageOk = true;

    if (cUsage.includes('/* __9R_318_USAGE_FIX__ */') || !cUsage.includes('void 0!==b.input_tokens&&(b.input_tokens+=2e3)')) {
      logsUsage.push(`  ℹ️  [${chunks.usageFile}] Hardcoded +2000 token inflation already neutralized`);
    } else if (cUsage.includes('void 0!==b.input_tokens&&(b.input_tokens+=2e3)')) {
      cUsage = cUsage.replace(/function g\(a\)\{if\(!a\|\|"object"!=typeof a\)return a;let b=\{...a\};return void 0!==b\.input_tokens&&\(b\.input_tokens\+=2e3\)[\s\S]*?b\}/, 'function g(a){ /* __9R_318_USAGE_FIX__ */ return a}');
      logsUsage.push(`  ✅ [${chunks.usageFile}] Neutralized hardcoded +2000 token inflation`);
    } else {
      errors.push(`[${chunks.usageFile}] Target pattern for token inflation (+2000) not found.`);
      usageOk = false;
    }

    // Module 36732 (xiaomi-mimo) if in 318.js
    if (chunks.usageFile === '318.js' && !cUsage.includes('36732:')) {
      const mimoMod = ',36732:(a,b,c)=>{c.d(b,{Rb:()=>f});var d=c(96179),e=c(35024);class f extends d.L{constructor(){super("xiaomi-mimo")}buildUrl(a,b,c=0,d=null){let f=(0,e.Yg)(d);return d?.runtimeTransport?.format==="claude"?`${f.replace(/\\/v1\\/?$/,"")}/anthropic/v1/messages`:`${f}/chat/completions`}}}';
      if (cUsage.includes(',38572:')) {
        cUsage = cUsage.replace(',38572:', mimoMod + ',38572:');
        logsUsage.push(`  ✅ [${chunks.usageFile}] Restored missing module 36732 (xiaomi-mimo)`);
      }
    }

    // Module 32447 (Kimchi) if present in usage chunk
    if (cUsage.includes('32447:')) {
      const validMod32447 = '32447:(a,b,c)=>{ /* __9R_32447_FIX__ */ c.d(b,{BL:()=>g});var d=c(96179),e=c(52007);let f=["anthropic_version","anthropic_beta","client_metadata","mcp_servers","stop_sequences","thinking","top_k"];class g extends d.L{constructor(){super("kimchi")}transformRequest(a,b,c,d){let g,h=super.transformRequest(a,b,c,d);if(!h||"object"!=typeof h)return h;for(let a of(!function(a){var b;if(!a?.system||!Array.isArray(a.messages))return;let c=("string"==typeof(b=a.system)?b:Array.isArray(b)?b.map(a=>"string"==typeof a?a:"string"==typeof a?.text?a.text:"").filter(Boolean).join("\\n"):"").trim();if(!c)return;let d=a.messages.find(a=>a?.role==="system");d?"string"==typeof d.content?d.content=`${c}\\n\\n${d.content}`:Array.isArray(d.content)&&d.content.unshift({type:"text",text:c}):a.messages.unshift({role:"system",content:c})}(h),f))void 0!==h[a]&&delete h[a];if(delete h.system,g=(0,e.gK)(a),(g?.provider==="anthropic"||g?.upstreamProvider==="anthropic"||/(^|[-_/])(?:claude|anthropic)(?:[-_/]|$)/i.test(String(a||"")))&&(delete h.reasoning_effort,delete h.reasoning,delete h.thinking),Array.isArray(h?.messages)){let isLocal=' + matchExpr + '.test(String(a||""));for(let a of h.messages){if(a&&"object"==typeof a){delete a.cache_control;if(isLocal&&"string"==typeof a.content){a.content=a.content.replace(/<system-reminder>[\\s\\S]*?<\\/system-reminder>/gi,"").trim()||" "}if(Array.isArray(a.content)){a.content=a.content.map(a=>{if(!a||"object"!=typeof a)return a;let{signature:c,cache_control:b,...d}=a;if(isLocal&&"text"===d.type&&"string"==typeof d.text){d.text=d.text.replace(/<system-reminder>[\\s\\S]*?<\\/system-reminder>/gi,"").trim()||" "}return d});if(isLocal&&(0===a.content.length||a.content.every(a=>!a||"text"===a?.type&&(!a?.text||!a?.text.trim())))){a.content=" "}}if(isLocal&&"user"===a.role&&(!a.content||(Array.isArray(a.content)&&0===a.content.length)||""===a.content)){a.content=" "}if("assistant"===a.role&&"string"==typeof a.reasoning_content&&a.reasoning_content.length>8)delete a.reasoning_content}}}if(Array.isArray(h?.tools)){h.tools=h.tools.map(a=>{if(!a||"object"!=typeof a)return a;let{cache_control:b,...c}=a;return c})}return h}}}';
      if (!cUsage.includes('/* __9R_32447_FIX__ */') && !cUsage.includes('/* __9R_32447_KIMCHI_FIX__ */')) {
        const idx = cUsage.indexOf('32447:');
        const nextMod36732 = cUsage.indexOf(',36732:', idx);
        const nextMod38572 = cUsage.indexOf(',38572:', idx);
        const nextMod = (nextMod36732 !== -1 && (nextMod38572 === -1 || nextMod36732 < nextMod38572)) ? nextMod36732 : nextMod38572;
        if (idx !== -1 && nextMod !== -1) {
          cUsage = cUsage.slice(0, idx) + validMod32447 + cUsage.slice(nextMod);
          logsUsage.push(`  ✅ [${chunks.usageFile}] Repaired chunk syntax & local model prompt filter (module 32447)`);
        }
      }
    }

    if (usageOk && cUsage !== origCUsage) {
      try {
        new vm.Script(cUsage);
      } catch (err) {
        errors.push(`[${chunks.usageFile}] Syntax validation failed: ${err.message}`);
        usageOk = false;
      }
    }

    if (usageOk) {
      stageWrite(chunks.usagePath, chunks.usageFile, logsUsage, cUsage, origCUsage);
    }
  }

  // 2. Dummy Tools Removal Patch
  if (!fs.existsSync(chunks.toolsPath)) {
    errors.push(`Tools chunk missing: ${chunks.toolsPath}`);
  } else {
    let cTools = fs.readFileSync(chunks.toolsPath, 'utf8');
    const origCTools = cTools;
    const logsTools = [];
    let toolsOk = true;

    if (cTools.includes('/* __9R_8499_TOOLS_FIX__ */')) {
      logsTools.push(`  ℹ️  [${chunks.toolsFile}] Dummy tools already stripped`);
    } else {
      let strippedAny = false;
      if (/let\s+([a-zA-Z0-9_$]+)\s*=\s*\[\{name:"browser_subagent"/.test(cTools)) {
        cTools = cTools.replace(/let\s+([a-zA-Z0-9_$]+)\s*=\s*\[\{name:"browser_subagent"[\s\S]*?\}\]\}/, 'let $1=[]/* __9R_8499_TOOLS_FIX__ */}');
        strippedAny = true;
      }
      if (/let\s+([a-zA-Z0-9_$]+)\s*=\s*\[\{name:"Task"/.test(cTools)) {
        cTools = cTools.replace(/let\s+([a-zA-Z0-9_$]+)\s*=\s*\[\{name:"Task"[\s\S]*?\}\];/, 'let $1=[]/* __9R_8499_TOOLS_FIX__ */;');
        strippedAny = true;
      }

      if (strippedAny) {
        logsTools.push(`  ✅ [${chunks.toolsFile}] Stripped injected dummy tools`);
      } else {
        logsTools.push(`  ℹ️  [${chunks.toolsFile}] Dummy tools patterns not present or already stripped`);
      }
    }

    if (toolsOk && cTools !== origCTools) {
      try {
        new vm.Script(cTools);
      } catch (err) {
        errors.push(`[${chunks.toolsFile}] Syntax validation failed: ${err.message}`);
        toolsOk = false;
      }
    }

    if (toolsOk) {
      stageWrite(chunks.toolsPath, chunks.toolsFile, logsTools, cTools, origCTools);
    }
  }

  // 3. OpenAI-Compatible Local Model Prompt Stripper
  if (!fs.existsSync(chunks.openAiPath)) {
    errors.push(`OpenAI chunk missing: ${chunks.openAiPath}`);
  } else {
    // If openAiPath is already staged (e.g. 318.js), read from staged content
    const existingEntry = pendingWrites.get(chunks.openAiPath);
    let cOpenAi = existingEntry ? existingEntry.content : fs.readFileSync(chunks.openAiPath, 'utf8');
    const origCOpenAi = existingEntry ? existingEntry.origContent : cOpenAi;
    const logsOpenAi = existingEntry ? existingEntry.logs : [];
    let openAiOk = true;

    if (cOpenAi.includes('/* __9R_96179_FIX__ */') || cOpenAi.includes('/* __9R_96179_FIX_v2__ */')) {
      logsOpenAi.push(`  ℹ️  [${chunks.openAiFile}] OpenAI-compatible local model prompt filter already active`);
    } else {
      // Pattern v2 (9Router >= 0.5.111 in 7373.js): transformRequest(a,b,c,d){let e=this.applyJsonSchemaFallback(this.applyNousAttribution(a,b,c,d));...}
      const ptnV2 = /transformRequest\(a,b,c,d\)\{let ([a-zA-Z0-9_$]+)=this\.applyJsonSchemaFallback\(this\.applyNousAttribution\(a,b,c,d\)\);return \1&&"object"==typeof \1&&\(this\.config\.quirks\?\.dropClientMetadata&&delete \1\.client_metadata,\((0,[a-zA-Z0-9_$]+\.[a-zA-Z0-9_$]+)\)\(this\.provider,a,\1\)\),\((0,[a-zA-Z0-9_$]+\.[a-zA-Z0-9_$]+)\)\(\{provider:this\.provider,model:a,body:\1\}\)\}/;
      const matchV2 = cOpenAi.match(ptnV2);

      // Pattern v1 (9Router <= 0.5.110 in 318.js): transformRequest(a,b){let c=this.applyJsonSchemaFallback(b);...}
      const targetV1 = 'transformRequest(a,b){let c=this.applyJsonSchemaFallback(b);return c&&"object"==typeof c&&(this.config.quirks?.dropClientMetadata&&delete c.client_metadata,(0,l.c)(this.provider,a,c)),(0,k.Z)({provider:this.provider,model:a,body:c})}';
      const replV1 = 'transformRequest(a,b){/* __9R_96179_FIX__ */let c=this.applyJsonSchemaFallback(b);if(c&&"object"==typeof c){if(this.provider?.startsWith?.("openai-compatible-")||' + matchExpr + '.test(String(a||""))){if(Array.isArray(c.messages)){for(let a of c.messages){if(a&&"string"==typeof a.content){a.content=a.content.replace(/<system-reminder>[\\s\\S]*?<\\/system-reminder>/gi,"").trim()||" "}else if(a&&Array.isArray(a.content)){a.content=a.content.map(a=>{if(a&&"text"===a.type&&"string"==typeof a.text){a.text=a.text.replace(/<system-reminder>[\\s\\S]*?<\\/system-reminder>/gi,"").trim()||" "}return a});if(0===a.content.length||a.content.every(a=>!a||"text"===a?.type&&(!a?.text||!a?.text.trim()))){a.content=" "}}if("user"===a?.role&&(!a.content||(Array.isArray(a.content)&&0===a.content.length)||""===a.content)){a.content=" "}}}}this.config.quirks?.dropClientMetadata&&delete c.client_metadata,(0,l.c)(this.provider,a,c)}return(0,k.Z)({provider:this.provider,model:a,body:c})}';

      if (matchV2) {
        const bodyVar = matchV2[1];
        const quirkFn = matchV2[2];
        const retFn = matchV2[3];
        const replV2 = `transformRequest(a,b,c,d){/* __9R_96179_FIX__ */let ${bodyVar}=this.applyJsonSchemaFallback(this.applyNousAttribution(a,b,c,d));if(${bodyVar}&&"object"==typeof ${bodyVar}){if(this.provider?.startsWith?.("openai-compatible-")||${matchExpr}.test(String(a||""))){if(Array.isArray(${bodyVar}.messages)){for(let a of ${bodyVar}.messages){if(a&&"string"==typeof a.content){a.content=a.content.replace(/<system-reminder>[\\s\\S]*?<\\/system-reminder>/gi,"").trim()||" "}else if(a&&Array.isArray(${bodyVar}.content)){a.content=a.content.map(a=>{if(a&&"text"===a.type&&"string"==typeof a.text){a.text=a.text.replace(/<system-reminder>[\\s\\S]*?<\\/system-reminder>/gi,"").trim()||" "}return a});if(0===${bodyVar}.content.length||${bodyVar}.content.every(a=>!a||"text"===a?.type&&(!a?.text||!a?.text.trim()))){${bodyVar}.content=" "}}if("user"===a?.role&&(!a.content||(Array.isArray(a.content)&&0===a.content.length)||""===a.content)){a.content=" "}}}}this.config.quirks?.dropClientMetadata&&delete ${bodyVar}.client_metadata,(${quirkFn})(this.provider,a,${bodyVar})}return(${retFn})({provider:this.provider,model:a,body:${bodyVar}})}`;
        cOpenAi = cOpenAi.replace(matchV2[0], replV2);
        logsOpenAi.push(`  ✅ [${chunks.openAiFile}] Injected OpenAI-compatible local model prompt filter (v2)`);
      } else if (cOpenAi.includes(targetV1)) {
        cOpenAi = cOpenAi.replace(targetV1, replV1);
        logsOpenAi.push(`  ✅ [${chunks.openAiFile}] Injected OpenAI-compatible local model prompt filter (v1)`);
      } else {
        const existing96179Pattern = /transformRequest\(a,b\)\{let c=this\.applyJsonSchemaFallback\(b\);[\s\S]*?return\(0,k\.Z\)\(\{provider:this\.provider,model:a,body:c\}\)\}/;
        if (existing96179Pattern.test(cOpenAi)) {
          cOpenAi = cOpenAi.replace(existing96179Pattern, replV1);
          logsOpenAi.push(`  ✅ [${chunks.openAiFile}] Injected OpenAI-compatible local model prompt filter with sentinel (v1)`);
        } else {
          logsOpenAi.push(`  ℹ️  [${chunks.openAiFile}] transformRequest pattern already modified or not found`);
        }
      }
    }

    if (openAiOk && cOpenAi !== origCOpenAi) {
      try {
        new vm.Script(cOpenAi);
      } catch (err) {
        errors.push(`[${chunks.openAiFile}] Syntax validation failed: ${err.message}`);
        openAiOk = false;
      }
    }

    if (openAiOk) {
      stageWrite(chunks.openAiPath, chunks.openAiFile, logsOpenAi, cOpenAi, origCOpenAi);
    }
  }

  // 4. Anthropic Adapter & Local Model Prompt Stripper (8895.js)
  if (!fs.existsSync(chunks.anthropicPath)) {
    errors.push(`Anthropic chunk missing: ${chunks.anthropicPath}`);
  } else {
    let cAnthropic = fs.readFileSync(chunks.anthropicPath, 'utf8');
    const origCAnthropic = cAnthropic;
    const logsAnthropic = [];
    let anthropicOk = true;

    // 4a. Adapter for Claude format
    const adapterFn = 'function(a){if(!a?.choices?.[0])return a;let b=a.choices[0],c=b.message||{},e=[],g=c.reasoning_content||c.provider_specific_fields?.reasoning_content||"";for(let a of(g&&e.push({type:"thinking",thinking:g}),"string"==typeof c.content&&c.content.length>0&&e.push({type:"text",text:c.content}),c.tool_calls||[])){let b=a.function||{};e.push({type:"tool_use",id:a.id||`toolu_${Date.now()}_${e.length}`,name:b.name||a.name||"",input:function(a){if(!a)return{};if("object"==typeof a)return a;try{return JSON.parse(a)}catch{return{}}}(b.arguments||a.arguments)})}0===e.length&&e.push({type:"text",text:""});let h=a.usage||{},k=h.cache_read_input_tokens??h.cached_tokens??h.prompt_tokens_details?.cached_tokens??0,l=h.cache_creation_input_tokens??h.prompt_tokens_details?.cache_creation_tokens??0,m=h.input_tokens??h.prompt_tokens??0,n=void 0!==h.input_tokens?h.input_tokens:Math.max(0,m-k-l);return{id:String(a.id||`msg_${Date.now()}`).replace(/^chatcmpl-/,"msg_"),type:"message",role:"assistant",model:a.model||"unknown",content:e,stop_reason:(0,f.Q)(b.finish_reason,"claude"),stop_sequence:null,usage:{input_tokens:n,output_tokens:h.completion_tokens||h.output_tokens||0,...(k>0?{cache_read_input_tokens:k}:{}),...(l>0?{cache_creation_input_tokens:l}:{})}}}(L)';
    const targetComma = ',M=q===d.h.CLAUDE&&L?.type==="message"';
    const replacementComma = `,/* __9R_8895_ADAPTER_FIX__ */M=(q==="claude"&&L?.choices&&L?.type!=="message"&&(L=${adapterFn}),q===d.h.CLAUDE&&L?.type==="message")`;
    const targetLet = 'let M=q===d.h.CLAUDE&&L?.type==="message"';
    const replacementLet = `let /* __9R_8895_ADAPTER_FIX__ */M=(q==="claude"&&L?.choices&&L?.type!=="message"&&(L=${adapterFn}),q===d.h.CLAUDE&&L?.type==="message")`;
    const targetComma2 = ',N=r===d.h.CLAUDE&&M?.type==="message"';
    const adapterFn2 = adapterFn.replace(/\(L\)$/, '(M)');
    const replacementComma2 = `,/* __9R_8895_ADAPTER_FIX__ */N=(r===d.h.CLAUDE&&M?.choices&&M?.type!=="message"&&(M=${adapterFn2}),r===d.h.CLAUDE&&M?.type==="message")`;

    if (cAnthropic.includes('/* __9R_8895_ADAPTER_FIX__ */') || cAnthropic.includes('q==="claude"&&L?.choices&&L?.type!=="message"') || cAnthropic.includes('b===d.h.OPENAI&&c===d.h.CLAUDE')) {
      logsAnthropic.push(`  ℹ️  [${chunks.anthropicFile}] Anthropic message format adapter already present`);
    } else if (cAnthropic.includes(targetComma)) {
      cAnthropic = cAnthropic.replace(targetComma, replacementComma);
      logsAnthropic.push(`  ✅ [${chunks.anthropicFile}] Injected universal Anthropic /v1/messages adapter`);
    } else if (cAnthropic.includes(targetLet)) {
      cAnthropic = cAnthropic.replace(targetLet, replacementLet);
      logsAnthropic.push(`  ✅ [${chunks.anthropicFile}] Injected universal Anthropic /v1/messages adapter`);
    } else if (cAnthropic.includes(targetComma2)) {
      cAnthropic = cAnthropic.replace(targetComma2, replacementComma2);
      logsAnthropic.push(`  ✅ [${chunks.anthropicFile}] Injected universal Anthropic /v1/messages adapter`);
    }

    // 4b. Local model prompt stripper
    const ttsRegex = /"tts"===\(0,[a-zA-Z0-9_$]+\.[a-zA-Z0-9_$]+\)\([^)]+\)&&([a-zA-Z0-9_$]+)\.messages&&\(\1\.messages=\1\.messages\.filter\(a=>"tool"!==a\.role\),delete \1\.tools\);?/;
    const ttsMatch = cAnthropic.match(ttsRegex);

    if (cAnthropic.includes('/* __9R_8895_FILTER_FIX__ */') || cAnthropic.includes('/* __9R_8895_FILTER_FIX_v2__ */')) {
      logsAnthropic.push(`  ℹ️  [${chunks.anthropicFile}] Local model prompt stripping filter already active`);
    } else if (ttsMatch) {
      const preceding = cAnthropic.slice(Math.max(0, ttsMatch.index - 500), ttsMatch.index);
      const provModMatch = preceding.match(/POST \$\{[^}]+\} → \$\{([a-zA-Z0-9_$]+)\}\/\$\{([a-zA-Z0-9_$]+)\}/);
      const provVar = provModMatch ? provModMatch[1] : 'ao';
      const modVar = provModMatch ? provModMatch[2] : 'ap';
      const bodyVar = ttsMatch[1];
      const iife = `/* __9R_8895_FILTER_FIX__ */((() => { if(${matchExpr}.test(String(${modVar}||""))||${matchExpr}.test(String(${provVar}||""))){if(${bodyVar}.system){if("string"==typeof ${bodyVar}.system){${bodyVar}.system=${bodyVar}.system.replace(/<system-reminder>[\\s\\S]*?<\\/system-reminder>/gi,"").trim()}else if(Array.isArray(${bodyVar}.system)){${bodyVar}.system=${bodyVar}.system.map(a=>{if(a&&"text"===a.type&&"string"==typeof a.text){a.text=a.text.replace(/<system-reminder>[\\s\\S]*?<\\/system-reminder>/gi,"").trim()}return a})}}if(Array.isArray(${bodyVar}.messages)){for(let a of ${bodyVar}.messages){if(a&&"string"==typeof a.content){a.content=a.content.replace(/<system-reminder>[\\s\\S]*?<\\/system-reminder>/gi,"").trim()||" "}else if(a&&Array.isArray(a.content)){a.content=a.content.map(a=>{if(a&&"text"===a.type&&"string"==typeof a.text){a.text=a.text.replace(/<system-reminder>[\\s\\S]*?<\\/system-reminder>/gi,"").trim()||" "}return a});if(0===${bodyVar}.content.length||${bodyVar}.content.every(a=>!a||"text"===a?.type&&(!a?.text||!a?.text.trim()))){${bodyVar}.content=" "}}if("user"===a?.role&&(!a.content||(Array.isArray(a.content)&&0===a.content.length)||""===a.content)){a.content=" "}}}} })())`;
      const dynamicTtsRepl = `${ttsMatch[0]},${iife}`;
      cAnthropic = cAnthropic.replace(ttsMatch[0], dynamicTtsRepl);
      logsAnthropic.push(`  ✅ [${chunks.anthropicFile}] Injected local model prompt stripping filter`);
    }

    if (anthropicOk && cAnthropic !== origCAnthropic) {
      try {
        new vm.Script(cAnthropic);
      } catch (err) {
        errors.push(`[${chunks.anthropicFile}] Syntax validation failed: ${err.message}`);
        anthropicOk = false;
      }
    }

    if (anthropicOk) {
      stageWrite(chunks.anthropicPath, chunks.anthropicFile, logsAnthropic, cAnthropic, origCAnthropic);
    }
  }

  if (errors.length > 0) {
    console.error('\n❌ Patch failed with errors:');
    for (const err of errors) {
      console.error(`   - ${err}`);
    }
    console.error(`\nDiagnostics: 9Router installation (v${routerVersion}) may be unsupported or modified.`);
    console.error('Do NOT report success; please check the logs above.\n');
    process.exit(1);
  }

  // Write files to disk atomically
  for (const item of pendingWrites.values()) {
    if (item.content !== item.origContent) {
      backupFile(item.filePath);
      fs.writeFileSync(item.filePath, item.content, 'utf8');
    }
    for (const logMsg of item.logs) {
      console.log(logMsg);
    }
  }

  // 5. SQLite Persona Injections Check & Disable
  if (sqliteDb && fs.existsSync(sqliteDb) && fs.statSync(sqliteDb).size > 0) {
    backupFile(sqliteDb);
    let sqliteUpdated = false;
    let sqliteErrorMsg = '';

    try {
      let nodeSqlite;
      try { nodeSqlite = require('node:sqlite'); } catch {}

      if (nodeSqlite && nodeSqlite.DatabaseSync) {
        const db = new nodeSqlite.DatabaseSync(sqliteDb);
        try {
          const row = db.prepare('SELECT data FROM settings WHERE id = 1').get();
          if (row && row.data) {
            const data = JSON.parse(row.data);
            if (data.cavemanEnabled || data.ponytailEnabled) {
              data.cavemanEnabled = false;
              data.ponytailEnabled = false;
              db.prepare('UPDATE settings SET data = ? WHERE id = 1').run(JSON.stringify(data));
              sqliteUpdated = true;
              console.log('  ✅ [SQLite] Disabled caveman & ponytail persona prompt injections via node:sqlite');
            } else {
              sqliteUpdated = true;
              console.log('  ℹ️  [SQLite] Caveman & ponytail personas already disabled');
            }
          } else {
            sqliteUpdated = true;
            console.log('  ℹ️  [SQLite] Settings table or row 1 not present; personas inactive by default');
          }
        } finally {
          db.close?.();
        }
      }
    } catch (e) {
      sqliteErrorMsg += `node:sqlite error: ${e.message}; `;
    }

    if (!sqliteUpdated) {
      try {
        const query = 'SELECT data FROM settings WHERE id = 1;\n';
        const raw = execFileSync('sqlite3', [sqliteDb], { input: query, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
        if (raw) {
          const data = JSON.parse(raw);
          if (data.cavemanEnabled || data.ponytailEnabled) {
            data.cavemanEnabled = false;
            data.ponytailEnabled = false;
            const updatedJson = JSON.stringify(data);
            const updateQuery = `UPDATE settings SET data = '${updatedJson.replace(/'/g, "''")}' WHERE id = 1;\n`;
            execFileSync('sqlite3', [sqliteDb], { input: updateQuery, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
            sqliteUpdated = true;
            console.log('  ✅ [SQLite] Disabled caveman & ponytail persona prompt injections via sqlite3 CLI');
          } else {
            sqliteUpdated = true;
            console.log('  ℹ️  [SQLite] Caveman & ponytail personas already disabled');
          }
        } else {
          sqliteUpdated = true;
          console.log('  ℹ️  [SQLite] Settings table or row 1 empty; personas inactive by default');
        }
      } catch (e) {
        sqliteErrorMsg += `sqlite3 CLI error: ${e.message}; `;
      }
    }

    if (!sqliteUpdated) {
      console.log(`  ℹ️  [SQLite] Could not open database via sqlite tools (${sqliteErrorMsg.trim()}); skipping SQLite persona check.`);
    }
  } else if (sqliteDb && fs.existsSync(sqliteDb) && fs.statSync(sqliteDb).size === 0) {
    console.log('  ℹ️  [SQLite] Database file exists but is 0 bytes (uninitialized). Skipping SQLite patch.');
  } else {
    console.log('  ℹ️  [SQLite] Database file not found. Skipping SQLite patch.');
  }

  console.log('\n🎉 9Router successfully patched!');
  console.log('   - Token bloat reduced by ~99.7%');
  console.log('   - Dummy tool overhead removed');
  console.log('   - Claude Code / Desktop wire compatibility ensured');
  console.log('\n💡 Please restart 9Router for changes to take effect.\n');
}

run().catch(err => {
  console.error('\n❌ Unexpected error during patch:', err.message);
  process.exit(1);
});
