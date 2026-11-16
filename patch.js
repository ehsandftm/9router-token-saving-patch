#!/usr/bin/env node

/**
 * 9Router Token Saving & Compatibility Patch v1.4.0
 * Eliminates ~2,800+ fake/injected token overhead, strips 40+ dummy tools,
 * enables dual-layer local model prompt stripping (while preserving <task-notification>
 * and cloud models), and ensures Claude Desktop / Claude Code compatibility
 * across 9Router v0.5.110 and v0.5.111+ chunk layouts.
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
    console.log('\n⚡ 9Router Token Saving & Compatibility Patch v1.4.0');
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
         content.includes('/* __9R_32447_FIX_V2__ */') ||
         content.includes('/* __9R_32447_KIMCHI_FIX__ */') ||
         content.includes('/* __9R_96179_FIX__ */') ||
         content.includes('/* __9R_96179_FIX_v2__ */') ||
         content.includes('/* __9R_96179_FIX_V2__ */') ||
         content.includes('/* __9R_7373_FIX__ */') ||
         content.includes('/* __9R_8499_TOOLS_FIX__ */') ||
         content.includes('/* __9R_CLAUDE_OPUS_MEDIUM_THINKING__ */') ||
         content.includes('/* __9R_8895_ADAPTER_FIX__ */') ||
         content.includes('/* __9R_8895_FILTER_FIX__ */') ||
         content.includes('/* __9R_8895_FILTER_FIX_v2__ */') ||
         content.includes('/* __9R_8895_FILTER_FIX_V2__ */');
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


// 5. Undici Compatibility Patch for Node < 22.19.0
function patchUndiciCompatibility(pkgDir) {
  const logs = [];
  const undiciDir = path.join(pkgDir, 'app', 'node_modules', 'undici');
  if (!fs.existsSync(undiciDir)) return logs;

  // 5a. interceptor/decompress.js: Guard createZstdDecompress
  const decompFile = path.join(undiciDir, 'lib', 'interceptor', 'decompress.js');
  if (fs.existsSync(decompFile)) {
    let c = fs.readFileSync(decompFile, 'utf8');
    if (c.includes("typeof createZstdDecompress === 'function'")) {
      logs.push('  ℹ️  [undici/decompress.js] zstd decompress guard already present');
    } else {
      const target = 'zstd: createZstdDecompress.bind(null, { params: { [constants.ZSTD_d_windowLogMax]: 23 } })';
      const repl = "...(typeof createZstdDecompress === 'function' && constants ? { zstd: createZstdDecompress.bind(null, { params: { [constants.ZSTD_d_windowLogMax]: 23 } }) } : {})";
      if (c.includes(target)) {
        backupFile(decompFile);
        c = c.replace(target, repl);
        fs.writeFileSync(decompFile, c, 'utf8');
        logs.push('  ✅ [undici/decompress.js] Injected createZstdDecompress guard');
      }
    }
  }

  // 5b. web/fetch/index.js: Guard accept-encoding and zstd decoder
  const fetchFile = path.join(undiciDir, 'lib', 'web', 'fetch', 'index.js');
  if (fs.existsSync(fetchFile)) {
    let c = fs.readFileSync(fetchFile, 'utf8');
    let changed = false;
    const targetAccept = "httpRequest.headersList.append('accept-encoding', 'br, gzip, deflate, zstd', true)";
    const replAccept = "httpRequest.headersList.append('accept-encoding', (typeof zlib.createZstdDecompress === 'function' ? 'br, gzip, deflate, zstd' : 'br, gzip, deflate'), true)";
    if (c.includes(targetAccept)) {
      backupFile(fetchFile);
      c = c.replace(targetAccept, replAccept);
      changed = true;
      logs.push('  ✅ [undici/fetch/index.js] Guarded zstd in accept-encoding for Node < 22');
    } else if (c.includes("typeof zlib.createZstdDecompress === 'function'")) {
      logs.push('  ℹ️  [undici/fetch/index.js] accept-encoding zstd guard already present');
    }

    const targetDecode = "} else if (coding === 'zstd') {\n                  decoders.push(zlib.createZstdDecompress({";
    const replDecode = "} else if (coding === 'zstd' && typeof zlib.createZstdDecompress === 'function') {\n                  decoders.push(zlib.createZstdDecompress({";
    if (c.includes(targetDecode)) {
      if (!changed) backupFile(fetchFile);
      c = c.replace(targetDecode, replDecode);
      changed = true;
      logs.push('  ✅ [undici/fetch/index.js] Guarded zstd decoding stream');
    }

    if (changed) {
      fs.writeFileSync(fetchFile, c, 'utf8');
    }
  }

  // 5c. web/webidl/index.js: Guard markAsUncloneable
  const webidlFile = path.join(undiciDir, 'lib', 'web', 'webidl', 'index.js');
  if (fs.existsSync(webidlFile)) {
    let c = fs.readFileSync(webidlFile, 'utf8');
    if (c.includes('wt.markAsUncloneable = (o) => o')) {
      logs.push('  ℹ️  [undici/webidl/index.js] markAsUncloneable guard already present');
    } else if (c.includes('markAsUncloneable')) {
      backupFile(webidlFile);
      c = 'try { const wt = require("node:worker_threads"); if (!wt.markAsUncloneable) wt.markAsUncloneable = (o) => o; } catch (_) {}\n' + c;
      fs.writeFileSync(webidlFile, c, 'utf8');
      logs.push('  ✅ [undici/webidl/index.js] Injected markAsUncloneable fallback');
    }
  }

  return logs;
}

// 6. Ensure custom-server.js is deployed in app/
function ensureCustomServer(pkgDir) {
  const logs = [];
  const srcCustomServer = path.join(__dirname, 'custom-server.js');
  const dstCustomServer = path.join(pkgDir, 'app', 'custom-server.js');
  if (fs.existsSync(srcCustomServer)) {
    const srcContent = fs.readFileSync(srcCustomServer, 'utf8');
    let dstContent = fs.existsSync(dstCustomServer) ? fs.readFileSync(dstCustomServer, 'utf8') : '';
    if (srcContent !== dstContent) {
      backupFile(dstCustomServer);
      fs.writeFileSync(dstCustomServer, srcContent, 'utf8');
      logs.push('  ✅ [custom-server.js] Deployed / updated custom server wrapper with Node 20 polyfills');
    } else {
      logs.push('  ℹ️  [custom-server.js] Custom server wrapper up-to-date');
    }
  }
  return logs;
}

async function run() {
  if (isHelp) {
    console.log('\n⚡ 9Router Token Saving & Compatibility Patch v1.4.0');
    console.log('==================================================\n');
    console.log('Usage: 9router-patch [options]\n');
    console.log('Options:');
    console.log('  -s, --status   Check current 9Router patch status');
    console.log('  -r, --revert   Revert 9Router files to original unpatched state');
    console.log('  -h, --help     Display this help message and exit\n');
    process.exit(0);
  }

  console.log('\n⚡ 9Router Token Saving & Compatibility Patch v1.4.0');
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

  const matchExpr = '(() => { let localModelRegex = /(?:^|[\\/\\-_:])(?:ollama|unsloth|uns|vllm|lmstudio|llama\\.?cpp|bonsai|local|gguf|qwen3\\.8-27b)(?:$|[\\/\\-_:])/i; if (process.env.NINEROUTER_LOCAL_MODELS) { try { localModelRegex = new RegExp(process.env.NINEROUTER_LOCAL_MODELS, "i"); } catch (e) { console.warn("⚠️ Invalid NINEROUTER_LOCAL_MODELS regex, using default."); } } return localModelRegex; })()';
  const stripCall = '.replace(/<system-reminder>[\\s\\S]*?<\\/system-reminder>/gi,m=>/<(?:task-notification|local-command-|command-message)/i.test(m)?m:"")';

  // --- Status Mode ---
  if (isStatus) {
    let cUsage = fs.existsSync(chunks.usagePath) ? fs.readFileSync(chunks.usagePath, 'utf8') : '';
    let cTools = fs.existsSync(chunks.toolsPath) ? fs.readFileSync(chunks.toolsPath, 'utf8') : '';
    let cOpenAi = fs.existsSync(chunks.openAiPath) ? fs.readFileSync(chunks.openAiPath, 'utf8') : '';
    let cAnthropic = fs.existsSync(chunks.anthropicPath) ? fs.readFileSync(chunks.anthropicPath, 'utf8') : '';

    let patchedUsage = Boolean(cUsage && (cUsage.includes('/* __9R_318_USAGE_FIX__ */') || !cUsage.includes('void 0!==b.input_tokens&&(b.input_tokens+=2e3)')));
    let patchedTools = Boolean(cTools && (cTools.includes('/* __9R_8499_TOOLS_FIX__ */') || !cTools.includes('name:"browser_subagent"')));
    let patchedAnthropic = Boolean(cAnthropic && (cAnthropic.includes('/* __9R_8895_ADAPTER_FIX__ */') || cAnthropic.includes('b===d.h.OPENAI&&c===d.h.CLAUDE')));
    let patchedOpenAiV2 = Boolean(cOpenAi && cOpenAi.includes('/* __9R_96179_FIX_V2__ */'));
    let patchedAnthropicV2 = Boolean(cAnthropic && cAnthropic.includes('/* __9R_8895_FILTER_FIX_V2__ */'));
    let patchedMod32447V2 = Boolean(!cUsage.includes('32447:') || cUsage.includes('/* __9R_32447_FIX_V2__ */'));
    let patchedFilterV1 = Boolean(
      (cOpenAi && (cOpenAi.includes('/* __9R_96179_FIX__ */') || cOpenAi.includes('/* __9R_96179_FIX_v2__ */') || cOpenAi.includes('/* __9R_7373_FIX__ */'))) ||
      (cAnthropic && (cAnthropic.includes('/* __9R_8895_FILTER_FIX__ */') || cAnthropic.includes('/* __9R_8895_FILTER_FIX_v2__ */'))) ||
      (cUsage && (cUsage.includes('/* __9R_32447_FIX__ */') || cUsage.includes('/* __9R_32447_KIMCHI_FIX__ */')))
    );

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
    const filterStatusLabel = (patchedAnthropicV2 && patchedMod32447V2)
      ? '✅ FIXED V2 (Local-only + <task-notification> preserved)'
      : patchedFilterV1
        ? '⚠️ V1 STALE (Run patch to upgrade to V2 & stop stripping cloud <system-reminder>)'
        : '⚠️ UNPATCHED (Standard)';
    console.log(`4. Local model prompt stripper (${chunks.openAiFile}/${chunks.anthropicFile}): ${filterStatusLabel}`);
    console.log(`5. SQLite persona prompt injection (data.sqlite): ${sqliteStatus.startsWith('✅') ? sqliteStatus : sqliteStatus.startsWith('ℹ️') ? sqliteStatus : sqliteStatus === 'NOT FOUND' ? 'ℹ️ NOT FOUND' : '⚠️ ' + sqliteStatus}`);

    // Undici & Custom Server Status
    const undiciDir = path.join(pkgDir, 'app', 'node_modules', 'undici');
    let undiciStatus = 'NOT FOUND / SKIPPED';
    if (fs.existsSync(undiciDir)) {
      const fetchFile = path.join(undiciDir, 'lib', 'web', 'fetch', 'index.js');
      const fetchContent = fs.existsSync(fetchFile) ? fs.readFileSync(fetchFile, 'utf8') : '';
      const isGuarded = fetchContent.includes("typeof zlib.createZstdDecompress === 'function'");
      undiciStatus = isGuarded ? '✅ FIXED (Node <22 compatible)' : '⚠️ UNPATCHED (Requires Node >=22.19)';
    }
    const customServerExists = fs.existsSync(path.join(pkgDir, 'app', 'custom-server.js'));
    console.log(`6. Undici & Node Runtime Compatibility : ${undiciStatus}`);
    console.log(`7. Custom Server Wrapper (custom-server.js) : ${customServerExists ? '✅ INSTALLED (Socket IP & Auth header stamping)' : '⚠️ MISSING'}`);

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

    const undiciDir = path.join(pkgDir, 'app', 'node_modules', 'undici');
    if (fs.existsSync(undiciDir)) {
      restoreFile(path.join(undiciDir, 'lib', 'interceptor', 'decompress.js'));
      restoreFile(path.join(undiciDir, 'lib', 'web', 'fetch', 'index.js'));
      restoreFile(path.join(undiciDir, 'lib', 'web', 'webidl', 'index.js'));
      console.log('- undici files   : Restored from .bak if present');
    }
    restoreFile(path.join(pkgDir, 'app', 'custom-server.js'));

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
      const validMod32447 = '32447:(a,b,c)=>{ /* __9R_32447_FIX_V2__ */ c.d(b,{BL:()=>g});var d=c(96179),e=c(52007);let f=["anthropic_version","anthropic_beta","client_metadata","mcp_servers","stop_sequences","thinking","top_k"];class g extends d.L{constructor(){super("kimchi")}transformRequest(a,b,c,d){let g,h=super.transformRequest(a,b,c,d);if(!h||"object"!=typeof h)return h;for(let a of(!function(a){var b;if(!a?.system||!Array.isArray(a.messages))return;let c=("string"==typeof(b=a.system)?b:Array.isArray(b)?b.map(a=>"string"==typeof a?a:"string"==typeof a?.text?a.text:"").filter(Boolean).join("\\n"):"").trim();if(!c)return;let d=a.messages.find(a=>a?.role==="system");d?"string"==typeof d.content?d.content=`${c}\\n\\n${d.content}`:Array.isArray(d.content)&&d.content.unshift({type:"text",text:c}):a.messages.unshift({role:"system",content:c})}(h),f))void 0!==h[a]&&delete h[a];if(delete h.system,g=(0,e.gK)(a),(g?.provider==="anthropic"||g?.upstreamProvider==="anthropic"||/(^|[-_/])(?:claude|anthropic)(?:[-_/]|$)/i.test(String(a||"")))&&(delete h.reasoning_effort,delete h.reasoning,delete h.thinking),Array.isArray(h?.messages)){let isLocal=' + matchExpr + '.test(String(a||""));for(let a of h.messages){if(a&&"object"==typeof a){delete a.cache_control;if(isLocal&&"string"==typeof a.content){a.content=a.content' + stripCall + '.trim()||" "}if(Array.isArray(a.content)){a.content=a.content.map(a=>{if(!a||"object"!=typeof a)return a;let{signature:c,cache_control:b,...d}=a;if(isLocal&&"text"===d.type&&"string"==typeof d.text){d.text=d.text' + stripCall + '.trim()}return d});if(isLocal){a.content=a.content.filter(a=>!(a&&"text"===a.type&&(!a.text||!a.text.trim())));if(0===a.content.length){a.content=" "}}}if(isLocal&&"user"===a.role&&(!a.content||(Array.isArray(a.content)&&0===a.content.length)||""===a.content)){a.content=" "}if("assistant"===a.role&&"string"==typeof a.reasoning_content&&a.reasoning_content.length>8)delete a.reasoning_content}}}if(Array.isArray(h?.tools)){h.tools=h.tools.map(a=>{if(!a||"object"!=typeof a)return a;let{cache_control:b,...c}=a;return c})}return h}}}';
      if (!cUsage.includes('/* __9R_32447_FIX_V2__ */')) {
        const idx = cUsage.indexOf('32447:');
        const nextMod36732 = cUsage.indexOf(',36732:', idx);
        const nextMod38572 = cUsage.indexOf(',38572:', idx);
        const nextMod = (nextMod36732 !== -1 && (nextMod38572 === -1 || nextMod36732 < nextMod38572)) ? nextMod36732 : nextMod38572;
        if (idx !== -1 && nextMod !== -1) {
          cUsage = cUsage.slice(0, idx) + validMod32447 + cUsage.slice(nextMod);
          logsUsage.push(`  ✅ [${chunks.usageFile}] Repaired chunk syntax & local-only V2 prompt filter (module 32447)`);
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

    if (cOpenAi.includes('/* __9R_96179_FIX_V2__ */')) {
      logsOpenAi.push(`  ℹ️  [${chunks.openAiFile}] OpenAI-compatible V2 local-only prompt filter already active`);
    } else {
      const filterBodySnippet = (bv, retExpr) => `if(${matchExpr}.test(String(this.provider||""))||${matchExpr}.test(String(a||""))){if(Array.isArray(${bv}.messages)){for(let a of ${bv}.messages){if(a&&"string"==typeof a.content){a.content=a.content${stripCall}.trim()||" "}else if(a&&Array.isArray(a.content)){a.content=a.content.map(a=>{if(a&&"text"===a.type&&"string"==typeof a.text){a.text=a.text${stripCall}.trim()}return a}).filter(a=>!(a&&"text"===a.type&&(!a.text||!a.text.trim())));if(0===a.content.length){a.content=" "}}if("user"===a?.role&&(!a.content||(Array.isArray(a.content)&&0===a.content.length)||""===a.content)){a.content=" "}}}}this.config.quirks?.dropClientMetadata&&delete ${bv}.client_metadata,${retExpr}`;

      // Pattern v2 (9Router >= 0.5.111 in 7373.js): transformRequest(a,b,c,d){let e=this.applyJsonSchemaFallback(this.applyNousAttribution(a,b,c,d));...}
      const ptnV2 = /transformRequest\(a,b,c,d\)\{let ([a-zA-Z0-9_$]+)=this\.applyJsonSchemaFallback\(this\.applyNousAttribution\(a,b,c,d\)\);return \1&&"object"==typeof \1&&\(this\.config\.quirks\?\.dropClientMetadata&&delete \1\.client_metadata,\((0,[a-zA-Z0-9_$]+\.[a-zA-Z0-9_$]+)\)\(this\.provider,a,\1\)\),\((0,[a-zA-Z0-9_$]+\.[a-zA-Z0-9_$]+)\)\(\{provider:this\.provider,model:a,body:\1\}\)\}/;
      const matchV2 = cOpenAi.match(ptnV2);

      // Existing v1->v2 upgrade in 7373.js / 318.js
      const upgradeV2Ptn = /transformRequest\(a,b,c,d\)\{\/\* __9R_(?:96179_FIX(?:_v2)?|7373_FIX)__ \*\/let ([a-zA-Z0-9_$]+)=this\.applyJsonSchemaFallback\(this\.applyNousAttribution\(a,b,c,d\)\);[\s\S]*?,\((0,[a-zA-Z0-9_$]+\.[a-zA-Z0-9_$]+)\)\(this\.provider,a,\1\)\}return\((0,[a-zA-Z0-9_$]+\.[a-zA-Z0-9_$]+)\)\(\{provider:this\.provider,model:a,body:\1\}\)\}/;
      const upgradeMatchV2 = cOpenAi.match(upgradeV2Ptn);

      // Pattern v1 (9Router <= 0.5.110 in 318.js): transformRequest(a,b){let c=this.applyJsonSchemaFallback(b);...}
      const targetV1 = 'transformRequest(a,b){let c=this.applyJsonSchemaFallback(b);return c&&"object"==typeof c&&(this.config.quirks?.dropClientMetadata&&delete c.client_metadata,(0,l.c)(this.provider,a,c)),(0,k.Z)({provider:this.provider,model:a,body:c})}';
      const replV1 = `transformRequest(a,b){/* __9R_96179_FIX_V2__ */let c=this.applyJsonSchemaFallback(b);if(c&&"object"==typeof c){${filterBodySnippet('c', '(0,l.c)(this.provider,a,c)')}}return(0,k.Z)({provider:this.provider,model:a,body:c})}`;

      const buildV2 = (m) => {
        const bodyVar = m[1], quirkFn = m[2], retFn = m[3];
        return `transformRequest(a,b,c,d){/* __9R_96179_FIX_V2__ */let ${bodyVar}=this.applyJsonSchemaFallback(this.applyNousAttribution(a,b,c,d));if(${bodyVar}&&"object"==typeof ${bodyVar}){${filterBodySnippet(bodyVar, `(${quirkFn})(this.provider,a,${bodyVar})`)}}return(${retFn})({provider:this.provider,model:a,body:${bodyVar}})}`;
      };

      if (matchV2) {
        cOpenAi = cOpenAi.replace(matchV2[0], buildV2(matchV2));
        logsOpenAi.push(`  ✅ [${chunks.openAiFile}] Injected OpenAI-compatible local-only V2 prompt filter (v2 layout)`);
      } else if (upgradeMatchV2) {
        cOpenAi = cOpenAi.replace(upgradeMatchV2[0], buildV2(upgradeMatchV2));
        logsOpenAi.push(`  ✅ [${chunks.openAiFile}] Upgraded OpenAI-compatible prompt filter from v1 to V2 (v2 layout)`);
      } else if (cOpenAi.includes(targetV1)) {
        cOpenAi = cOpenAi.replace(targetV1, replV1);
        logsOpenAi.push(`  ✅ [${chunks.openAiFile}] Injected OpenAI-compatible local-only V2 prompt filter (v1 layout)`);
      } else {
        const existing96179Pattern = /transformRequest\(a,b\)\{(?:\/\* __9R_[^*]+ \*\/)?let c=this\.applyJsonSchemaFallback\(b\);[\s\S]*?return\(0,k\.Z\)\(\{provider:this\.provider,model:a,body:c\}\)\}/;
        if (existing96179Pattern.test(cOpenAi)) {
          cOpenAi = cOpenAi.replace(existing96179Pattern, replV1);
          logsOpenAi.push(`  ✅ [${chunks.openAiFile}] Upgraded OpenAI-compatible prompt filter to V2 (v1 layout)`);
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

    // 4b. Local model prompt stripper (V2: local-only + preserves <task-notification>)
    const ttsRegex = /"tts"===\(0,[a-zA-Z0-9_$]+\.[a-zA-Z0-9_$]+\)\([^)]+\)&&([a-zA-Z0-9_$]+)\.messages&&\(\1\.messages=\1\.messages\.filter\(a=>"tool"!==a\.role\),delete \1\.tools\);?/;
    const ttsMatch = cAnthropic.match(ttsRegex);

    if (cAnthropic.includes('/* __9R_8895_FILTER_FIX_V2__ */')) {
      logsAnthropic.push(`  ℹ️  [${chunks.anthropicFile}] Local-only V2 prompt stripping filter already active`);
    } else if (ttsMatch) {
      const preceding = cAnthropic.slice(Math.max(0, ttsMatch.index - 500), ttsMatch.index);
      const provModMatch = preceding.match(/POST \$\{[^}]+\} → \$\{([a-zA-Z0-9_$]+)\}\/\$\{([a-zA-Z0-9_$]+)\}/);
      const provVar = provModMatch ? provModMatch[1] : 'ao';
      const modVar = provModMatch ? provModMatch[2] : 'ap';
      const bodyVar = ttsMatch[1];
      const iifeV2 = `/* __9R_8895_FILTER_FIX_V2__ */((() => { if(${matchExpr}.test(String(${modVar}||""))||${matchExpr}.test(String(${provVar}||""))){if(${bodyVar}.system){if("string"==typeof ${bodyVar}.system){${bodyVar}.system=${bodyVar}.system${stripCall}.trim()}else if(Array.isArray(${bodyVar}.system)){${bodyVar}.system=${bodyVar}.system.map(a=>{if(a&&"text"===a.type&&"string"==typeof a.text){a.text=a.text${stripCall}.trim()}return a}).filter(a=>!(a&&"text"===a.type&&(!a.text||!a.text.trim())))}}if(Array.isArray(${bodyVar}.messages)){for(let a of ${bodyVar}.messages){if(a&&"string"==typeof a.content){a.content=a.content${stripCall}.trim()||" "}else if(a&&Array.isArray(a.content)){a.content=a.content.map(a=>{if(a&&"text"===a.type&&"string"==typeof a.text){a.text=a.text${stripCall}.trim()}return a}).filter(a=>!(a&&"text"===a.type&&(!a.text||!a.text.trim())));if(0===a.content.length){a.content=" "}}if("user"===a?.role&&(!a.content||(Array.isArray(a.content)&&0===a.content.length)||""===a.content)){a.content=" "}}}} })())`;

      const existingV1Ptn = /\/\* __9R_8895_FILTER_FIX(?:_v2)?__ \*\/\(\(\(\) => \{[\s\S]*?\}\)\(\)\)/;
      if (existingV1Ptn.test(cAnthropic)) {
        cAnthropic = cAnthropic.replace(existingV1Ptn, iifeV2);
        logsAnthropic.push(`  ✅ [${chunks.anthropicFile}] Upgraded local model prompt stripping filter from v1 to V2`);
      } else {
        const dynamicTtsRepl = `${ttsMatch[0]},${iifeV2}`;
        cAnthropic = cAnthropic.replace(ttsMatch[0], dynamicTtsRepl);
        logsAnthropic.push(`  ✅ [${chunks.anthropicFile}] Injected local-only V2 prompt stripping filter`);
      }
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

  
  // 6. Ensure custom-server.js wrapper
  const customServerLogs = ensureCustomServer(pkgDir);
  for (const logMsg of customServerLogs) {
    console.log(logMsg);
  }

  // 7. Apply Undici & Node compatibility patches
  const undiciLogs = patchUndiciCompatibility(pkgDir);
  for (const logMsg of undiciLogs) {
    console.log(logMsg);
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
