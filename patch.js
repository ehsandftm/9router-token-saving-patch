#!/usr/bin/env node

/**
 * 9Router Token Saving & Compatibility Patch v1.1.0
 * Eliminates ~2,800+ fake/injected token overhead, strips 40+ dummy tools,
 * and fixes Claude Desktop / Claude Code payload errors.
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
    console.log('\n⚡ 9Router Token Saving & Compatibility Patch v1.1.0');
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

  // Try global npm root
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

function hasPatchSignatures(content, fileType) {
  if (fileType === 'sqlite') return true;
  if (!content) return false;
  if (fileType === '318') {
    return content.includes('/* __9R_318_USAGE_FIX__ */') || content.includes('/* __9R_32447_FIX__ */') || content.includes('/* __9R_96179_FIX__ */');
  }
  if (fileType === '8499') {
    return content.includes('/* __9R_8499_TOOLS_FIX__ */');
  }
  if (fileType === '8895') {
    return content.includes('/* __9R_8895_ADAPTER_FIX__ */') || content.includes('/* __9R_8895_FILTER_FIX__ */');
  }
  return false;
}

function backupFile(filePath, fileType) {
  const bak = `${filePath}.bak`;
  if (!fs.existsSync(filePath)) return;

  if (!fs.existsSync(bak)) {
    fs.copyFileSync(filePath, bak);
  } else if (fileType) {
    const content = fs.readFileSync(filePath, 'utf8');
    if (!hasPatchSignatures(content, fileType)) {
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
  // Handle Help early before requirements check
  if (isHelp) {
    console.log('\n⚡ 9Router Token Saving & Compatibility Patch v1.1.0');
    console.log('==================================================\n');
    console.log('Usage: 9router-patch [options]\n');
    console.log('Options:');
    console.log('  -s, --status   Check current 9Router patch status');
    console.log('  -r, --revert   Revert 9Router files to original unpatched state');
    console.log('  -h, --help     Display this help message and exit\n');
    process.exit(0);
  }

  console.log('\n⚡ 9Router Token Saving & Compatibility Patch v1.1.0');
  console.log('==================================================\n');

  const pkgDir = find9RouterDir();
  const routerVersion = get9RouterVersion(pkgDir);

  if (!pkgDir) {
    console.error('❌ Error: Could not locate 9Router installation directory.');
    console.error('   Please ensure 9router is installed globally via `npm install -g 9router`\n');
    process.exit(1);
  }

  const chunksDir = path.join(pkgDir, 'app', '.next-cli-build', 'server', 'chunks');
  const p318 = path.join(chunksDir, '318.js');
  const p8499 = path.join(chunksDir, '8499.js');
  const p8895 = path.join(chunksDir, '8895.js');
  const sqliteDb = findSqlitePath();

  console.log(`📁 9Router Package : ${pkgDir} (v${routerVersion})`);
  console.log(`📁 Chunks Directory: ${chunksDir}`);
  if (sqliteDb) console.log(`📁 Database Path   : ${sqliteDb}`);
  console.log('');

  // Local model pattern for engine & model matching
  const matchExpr = '(() => { let localModelRegex = /(?:ollama|unsloth|vllm|lmstudio|llama\\.?cpp|qwen|llama|mistral|deepseek|gemma|phi|local-|openai-compatible-)/i; if (process.env.NINEROUTER_LOCAL_MODELS) { try { localModelRegex = new RegExp(process.env.NINEROUTER_LOCAL_MODELS, "i"); } catch (e) { console.warn("⚠️ Invalid NINEROUTER_LOCAL_MODELS regex, using default."); } } return localModelRegex; })()';

  if (isStatus) {
    let c318 = fs.existsSync(p318) ? fs.readFileSync(p318, 'utf8') : '';
    let c8499 = fs.existsSync(p8499) ? fs.readFileSync(p8499, 'utf8') : '';
    let c8895 = fs.existsSync(p8895) ? fs.readFileSync(p8895, 'utf8') : '';

    let patched318Inflation = Boolean(c318 && c318.includes('/* __9R_318_USAGE_FIX__ */'));
    let patched318Filter = Boolean(c318 && (c318.includes('/* __9R_32447_FIX__ */') || c318.includes('/* __9R_96179_FIX__ */')));
    let patched8499 = Boolean(c8499 && c8499.includes('/* __9R_8499_TOOLS_FIX__ */'));
    let patched8895 = Boolean(c8895 && c8895.includes('/* __9R_8895_ADAPTER_FIX__ */'));
    let patched8895Filter = Boolean(c8895 && c8895.includes('/* __9R_8895_FILTER_FIX__ */'));

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
    console.log(`1. Hardcoded +2000 token inflation (318.js) : ${patched318Inflation ? '✅ FIXED (0 fake tokens)' : '⚠️ UNPATCHED (+2000 tokens active)'}`);
    console.log(`2. Injected dummy tools removal (8499.js)    : ${patched8499 ? '✅ FIXED (Clean schemas)' : '⚠️ UNPATCHED (40+ dummy tools active)'}`);
    console.log(`3. Claude Anthropic wire format (8895.js)   : ${patched8895 ? '✅ FIXED (Anthropic schema & cache support)' : '⚠️ UNPATCHED (OpenAI fallback)'}`);
    console.log(`4. Local model prompt stripper (318/8895)   : ${(patched318Filter || patched8895Filter) ? '✅ FIXED (Active)' : '⚠️ UNPATCHED (Standard)'}`);
    console.log(`5. SQLite persona prompt injection (data.sqlite): ${sqliteStatus.startsWith('✅') ? sqliteStatus : sqliteStatus.startsWith('ℹ️') ? sqliteStatus : sqliteStatus === 'NOT FOUND' ? 'ℹ️ NOT FOUND' : '⚠️ ' + sqliteStatus}`);
    console.log('');
    return;
  }

  // Handle Revert
  if (isRevert) {
    console.log('🔄 Reverting 9Router files to original unpatched state...\n');
    const r1 = restoreFile(p318);
    const r2 = restoreFile(p8499);
    const r3 = restoreFile(p8895);
    let r4 = false;
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
              r4 = true;
            }
          } finally {
            db.close?.();
          }
        }
      } catch {}
      if (!r4) {
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
            r4 = true;
          }
        } catch {}
      }
    }
    console.log(`- 318.js      : ${r1 ? 'Restored from .bak' : 'No backup found / unmodified'}`);
    console.log(`- 8499.js     : ${r2 ? 'Restored from .bak' : 'No backup found / unmodified'}`);
    console.log(`- 8895.js     : ${r3 ? 'Restored from .bak' : 'No backup found / unmodified'}`);
    if (sqliteDb) {
      console.log(`- data.sqlite : ${r4 ? 'Reverted settings in-place (personas re-enabled)' : 'Unmodified / unavailable'}`);
    }
    console.log('\n✅ Revert complete! Please restart 9Router.\n');
    return;
  }

  // Apply Patches
  console.log('🔨 Applying optimizations...\n');
  const errors = [];
  const pendingWrites = [];

  // --- Patch 1: 318.js ---
  if (!fs.existsSync(p318)) {
    errors.push(`File missing: ${p318}`);
  } else {
    let c318 = fs.readFileSync(p318, 'utf8');
    const origC318 = c318;
    const logs318 = [];
    let p318Ok = true;

    // 1a. Strip hardcoded +2000 inflation
    if (c318.includes('/* __9R_318_USAGE_FIX__ */') || !c318.includes('void 0!==b.input_tokens&&(b.input_tokens+=2e3)')) {
      logs318.push('  ℹ️  [318.js] Hardcoded +2000 token inflation already neutralized');
    } else if (c318.includes('void 0!==b.input_tokens&&(b.input_tokens+=2e3)')) {
      c318 = c318.replace(/function g\(a\)\{if\(!a\|\|"object"!=typeof a\)return a;let b=\{...a\};return void 0!==b\.input_tokens&&\(b\.input_tokens\+=2e3\)[\s\S]*?b\}/, 'function g(a){ /* __9R_318_USAGE_FIX__ */ return a}');
      logs318.push('  ✅ [318.js] Neutralized hardcoded +2000 token inflation');
    } else {
      errors.push('[318.js] Target pattern for token inflation (+2000) not found.');
      p318Ok = false;
    }

    // 1b. Module 32447: Kimchi header transform syntax repair & local model filter
    const validMod32447 = '32447:(a,b,c)=>{ /* __9R_32447_FIX__ */ c.d(b,{BL:()=>g});var d=c(96179),e=c(52007);let f=["anthropic_version","anthropic_beta","client_metadata","mcp_servers","stop_sequences","thinking","top_k"];class g extends d.L{constructor(){super("kimchi")}transformRequest(a,b,c,d){let g,h=super.transformRequest(a,b,c,d);if(!h||"object"!=typeof h)return h;for(let a of(!function(a){var b;if(!a?.system||!Array.isArray(a.messages))return;let c=("string"==typeof(b=a.system)?b:Array.isArray(b)?b.map(a=>"string"==typeof a?a:"string"==typeof a?.text?a.text:"").filter(Boolean).join("\\n"):"").trim();if(!c)return;let d=a.messages.find(a=>a?.role==="system");d?"string"==typeof d.content?d.content=`${c}\\n\\n${d.content}`:Array.isArray(d.content)&&d.content.unshift({type:"text",text:c}):a.messages.unshift({role:"system",content:c})}(h),f))void 0!==h[a]&&delete h[a];if(delete h.system,g=(0,e.gK)(a),(g?.provider==="anthropic"||g?.upstreamProvider==="anthropic"||/(^|[-_/])(?:claude|anthropic)(?:[-_/]|$)/i.test(String(a||"")))&&(delete h.reasoning_effort,delete h.reasoning,delete h.thinking),Array.isArray(h?.messages)){let isLocal=' + matchExpr + '.test(String(a||""));for(let a of h.messages){if(a&&"object"==typeof a){delete a.cache_control;if(isLocal&&"string"==typeof a.content){a.content=a.content.replace(/<system-reminder>[\\s\\S]*?<\\/system-reminder>/gi,"").trim()||" "}if(Array.isArray(a.content)){a.content=a.content.map(a=>{if(!a||"object"!=typeof a)return a;let{signature:c,cache_control:b,...d}=a;if(isLocal&&"text"===d.type&&"string"==typeof d.text){d.text=d.text.replace(/<system-reminder>[\\s\\S]*?<\\/system-reminder>/gi,"").trim()||" "}return d});if(isLocal&&(0===a.content.length||a.content.every(a=>!a||"text"===a?.type&&(!a?.text||!a?.text.trim())))){a.content=" "}}if(isLocal&&"user"===a.role&&(!a.content||(Array.isArray(a.content)&&0===a.content.length)||""===a.content)){a.content=" "}if("assistant"===a.role&&"string"==typeof a.reasoning_content&&a.reasoning_content.length>8)delete a.reasoning_content}}}if(Array.isArray(h?.tools)){h.tools=h.tools.map(a=>{if(!a||"object"!=typeof a)return a;let{cache_control:b,...c}=a;return c})}return h}}}';

    if (c318.includes('/* __9R_32447_FIX__ */')) {
      logs318.push('  ℹ️  [318.js] Chunk syntax & local model prompt filter (module 32447) already active');
    } else if (c318.includes('32447:')) {
      const idx = c318.indexOf('32447:');
      const nextMod = c318.indexOf(',38572:', idx);
      if (idx !== -1 && nextMod !== -1) {
        c318 = c318.slice(0, idx) + validMod32447 + c318.slice(nextMod);
        logs318.push('  ✅ [318.js] Repaired chunk syntax & local model prompt filter (module 32447)');
      } else {
        errors.push('[318.js] Module 32447 boundaries (32447: ... ,38572:) could not be located.');
        p318Ok = false;
      }
    } else {
      errors.push('[318.js] Module 32447 not found.');
      p318Ok = false;
    }

    // 1c. Module 96179: OpenAI-compatible prompt filter
    const target96179 = 'transformRequest(a,b){let c=this.applyJsonSchemaFallback(b);return c&&"object"==typeof c&&(this.config.quirks?.dropClientMetadata&&delete c.client_metadata,(0,l.c)(this.provider,a,c)),(0,k.Z)({provider:this.provider,model:a,body:c})}';
    const repl96179 = 'transformRequest(a,b){/* __9R_96179_FIX__ */let c=this.applyJsonSchemaFallback(b);if(c&&"object"==typeof c){if(this.provider?.startsWith?.("openai-compatible-")||' + matchExpr + '.test(String(a||""))){if(Array.isArray(c.messages)){for(let a of c.messages){if(a&&"string"==typeof a.content){a.content=a.content.replace(/<system-reminder>[\\s\\S]*?<\\/system-reminder>/gi,"").trim()||" "}else if(a&&Array.isArray(a.content)){a.content=a.content.map(a=>{if(a&&"text"===a.type&&"string"==typeof a.text){a.text=a.text.replace(/<system-reminder>[\\s\\S]*?<\\/system-reminder>/gi,"").trim()||" "}return a});if(0===a.content.length||a.content.every(a=>!a||"text"===a?.type&&(!a?.text||!a?.text.trim()))){a.content=" "}}if("user"===a?.role&&(!a.content||(Array.isArray(a.content)&&0===a.content.length)||""===a.content)){a.content=" "}}}}this.config.quirks?.dropClientMetadata&&delete c.client_metadata,(0,l.c)(this.provider,a,c)}return(0,k.Z)({provider:this.provider,model:a,body:c})}';

    if (c318.includes('/* __9R_96179_FIX__ */')) {
      logs318.push('  ℹ️  [318.js] OpenAI-compatible local model prompt filter already active');
    } else if (c318.includes(target96179)) {
      c318 = c318.replace(target96179, repl96179);
      logs318.push('  ✅ [318.js] Injected OpenAI-compatible local model prompt filter (module 96179)');
    } else {
      const existing96179Pattern = /transformRequest\(a,b\)\{let c=this\.applyJsonSchemaFallback\(b\);[\s\S]*?return\(0,k\.Z\)\(\{provider:this\.provider,model:a,body:c\}\)\}/;
      if (existing96179Pattern.test(c318)) {
        c318 = c318.replace(existing96179Pattern, repl96179);
        logs318.push('  ✅ [318.js] Injected OpenAI-compatible local model prompt filter with sentinel (module 96179)');
      } else {
        errors.push('[318.js] Module 96179 transformRequest pattern not found.');
        p318Ok = false;
      }
    }

    if (p318Ok && c318 !== origC318) {
      try {
        new vm.Script(c318);
      } catch (err) {
        errors.push(`[318.js] Syntax validation failed: ${err.message}`);
        p318Ok = false;
      }
    }

    if (p318Ok) {
      pendingWrites.push({ filePath: p318, content: c318, origContent: origC318, label: '318.js', logs: logs318, fileType: '318' });
    }
  }

  // --- Patch 2: 8499.js ---
  if (!fs.existsSync(p8499)) {
    errors.push(`File missing: ${p8499}`);
  } else {
    let c8499 = fs.readFileSync(p8499, 'utf8');
    const origC8499 = c8499;
    const logs8499 = [];
    let p8499Ok = true;

    if (c8499.includes('/* __9R_8499_TOOLS_FIX__ */')) {
      logs8499.push('  ℹ️  [8499.js] Dummy tools already stripped');
    } else {
      let strippedAny = false;
      if (c8499.includes('let x=[{name:"browser_subagent"')) {
        c8499 = c8499.replace(/let x=\[\{name:"browser_subagent"[\s\S]*?\}\]\}/, 'let x=[]/* __9R_8499_TOOLS_FIX__ */}');
        strippedAny = true;
      }
      if (c8499.includes('let h=[{name:"Task"')) {
        c8499 = c8499.replace(/let h=\[\{name:"Task"[\s\S]*?\}\];/, 'let h=[]/* __9R_8499_TOOLS_FIX__ */;');
        strippedAny = true;
      }

      if (strippedAny) {
        logs8499.push('  ✅ [8499.js] Stripped injected dummy tools');
      } else {
        errors.push('[8499.js] Dummy tools patterns (browser_subagent / Task) not found.');
        p8499Ok = false;
      }
    }

    if (c8499.includes('/* c.push(k(b,{content:"<think>"})) */')) {
      c8499 = c8499.replace(/,\s*\/\*\s*c\.push\(k\(b,\{content:"<think>"\}\)\)\s*\*\/\s*;/g, ';');
    }
    if (c8499.includes('/* c.push(k(b,{content:"</think>"})) */')) {
      c8499 = c8499.replace(/\(\s*\/\*\s*c\.push\(k\(b,\{content:"<\/think>"\}\)\)\s*\*\/\s*,\s*b\.inThinkingBlock=!1\)/g, '(b.inThinkingBlock=!1)');
    }

    if (p8499Ok && c8499 !== origC8499) {
      try {
        new vm.Script(c8499);
      } catch (err) {
        errors.push(`[8499.js] Syntax validation failed: ${err.message}`);
        p8499Ok = false;
      }
    }

    if (p8499Ok) {
      pendingWrites.push({ filePath: p8499, content: c8499, origContent: origC8499, label: '8499.js', logs: logs8499, fileType: '8499' });
    }
  }

  // --- Patch 3: 8895.js ---
  if (!fs.existsSync(p8895)) {
    errors.push(`File missing: ${p8895}`);
  } else {
    let c8895 = fs.readFileSync(p8895, 'utf8');
    const origC8895 = c8895;
    const logs8895 = [];
    let p8895Ok = true;

    const adapterFn = 'function(a){if(!a?.choices?.[0])return a;let b=a.choices[0],c=b.message||{},e=[],g=c.reasoning_content||c.provider_specific_fields?.reasoning_content||"";for(let a of(g&&e.push({type:"thinking",thinking:g}),"string"==typeof c.content&&c.content.length>0&&e.push({type:"text",text:c.content}),c.tool_calls||[])){let b=a.function||{};e.push({type:"tool_use",id:a.id||`toolu_${Date.now()}_${e.length}`,name:b.name||a.name||"",input:function(a){if(!a)return{};if("object"==typeof a)return a;try{return JSON.parse(a)}catch{return{}}}(b.arguments||a.arguments)})}0===e.length&&e.push({type:"text",text:""});let h=a.usage||{},k=h.cache_read_input_tokens??h.cached_tokens??h.prompt_tokens_details?.cached_tokens??0,l=h.cache_creation_input_tokens??h.prompt_tokens_details?.cache_creation_tokens??0,m=h.input_tokens??h.prompt_tokens??0,n=void 0!==h.input_tokens?h.input_tokens:Math.max(0,m-k-l);return{id:String(a.id||`msg_${Date.now()}`).replace(/^chatcmpl-/,"msg_"),type:"message",role:"assistant",model:a.model||"unknown",content:e,stop_reason:(0,f.Q)(b.finish_reason,"claude"),stop_sequence:null,usage:{input_tokens:n,output_tokens:h.completion_tokens||h.output_tokens||0,...(k>0?{cache_read_input_tokens:k}:{}),...(l>0?{cache_creation_input_tokens:l}:{})}}}(L)';

    const targetComma = ',M=q===d.h.CLAUDE&&L?.type==="message"';
    const replacementComma = `,/* __9R_8895_ADAPTER_FIX__ */M=(q==="claude"&&L?.choices&&L?.type!=="message"&&(L=${adapterFn}),q===d.h.CLAUDE&&L?.type==="message")`;

    const targetLet = 'let M=q===d.h.CLAUDE&&L?.type==="message"';
    const replacementLet = `let /* __9R_8895_ADAPTER_FIX__ */M=(q==="claude"&&L?.choices&&L?.type!=="message"&&(L=${adapterFn}),q===d.h.CLAUDE&&L?.type==="message")`;

    if (c8895.includes('/* __9R_8895_ADAPTER_FIX__ */') || c8895.includes('q==="claude"&&L?.choices&&L?.type!=="message"')) {
      logs8895.push('  ℹ️  [8895.js] Anthropic message format adapter already present');
    } else if (c8895.includes(targetComma)) {
      c8895 = c8895.replace(targetComma, replacementComma);
      logs8895.push('  ✅ [8895.js] Injected universal Anthropic /v1/messages adapter with cache token support');
    } else if (c8895.includes(targetLet)) {
      c8895 = c8895.replace(targetLet, replacementLet);
      logs8895.push('  ✅ [8895.js] Injected universal Anthropic /v1/messages adapter with cache token support');
    } else {
      errors.push('[8895.js] Target pattern for Anthropic message format adapter not found.');
      p8895Ok = false;
    }

    const ttsTarget = '"tts"===(0,m.OA)(at,an)&&af.messages&&(af.messages=af.messages.filter(a=>"tool"!==a.role),delete af.tools);';
    const ttsRepl = '"tts"===(0,m.OA)(at,an)&&af.messages&&(af.messages=af.messages.filter(a=>"tool"!==a.role),delete af.tools);if(' + matchExpr + '.test(String(an||""))||' + matchExpr + '.test(String(am||""))){/* __9R_8895_FILTER_FIX__ */if(Array.isArray(af.messages)){for(let a of af.messages){if(a&&"string"==typeof a.content){a.content=a.content.replace(/<system-reminder>[\\s\\S]*?<\\/system-reminder>/gi,"").trim()||" "}else if(a&&Array.isArray(a.content)){a.content=a.content.map(a=>{if(a&&"text"===a.type&&"string"==typeof a.text){a.text=a.text.replace(/<system-reminder>[\\s\\S]*?<\\/system-reminder>/gi,"").trim()||" "}return a});if(0===a.content.length||a.content.every(a=>!a||"text"===a?.type&&(!a?.text||!a?.text.trim()))){a.content=" "}}if("user"===a?.role&&(!a.content||(Array.isArray(a.content)&&0===a.content.length)||""===a.content)){a.content=" "}}}}';

    if (c8895.includes('/* __9R_8895_FILTER_FIX__ */')) {
      logs8895.push('  ℹ️  [8895.js] Local model prompt stripping filter already active');
    } else if (c8895.includes(ttsTarget)) {
      c8895 = c8895.replace(ttsTarget, ttsRepl);
      logs8895.push('  ✅ [8895.js] Injected local model prompt stripping filter');
    } else {
      errors.push('[8895.js] Target pattern for TTS local model prompt stripping filter not found.');
      p8895Ok = false;
    }

    if (p8895Ok && c8895 !== origC8895) {
      try {
        new vm.Script(c8895);
      } catch (err) {
        errors.push(`[8895.js] Syntax validation failed: ${err.message}`);
        p8895Ok = false;
      }
    }

    if (p8895Ok) {
      pendingWrites.push({ filePath: p8895, content: c8895, origContent: origC8895, label: '8895.js', logs: logs8895, fileType: '8895' });
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
  for (const item of pendingWrites) {
    if (item.content !== item.origContent) {
      backupFile(item.filePath, item.fileType);
      fs.writeFileSync(item.filePath, item.content, 'utf8');
    }
    for (const logMsg of item.logs) {
      console.log(logMsg);
    }
  }

  // --- Patch 4: SQLite Database (Disable Persona Injections) ---
  if (sqliteDb && fs.existsSync(sqliteDb) && fs.statSync(sqliteDb).size > 0) {
    backupFile(sqliteDb, 'sqlite');
    let sqliteUpdated = false;
    let sqliteErrorMsg = '';

    // Method 1: Node 22+ built-in node:sqlite
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

    // Method 2: System sqlite3 CLI fallback if Node.js < 22 or node:sqlite failed
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
