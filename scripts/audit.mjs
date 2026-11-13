#!/usr/bin/env node
/**
 * Discord bot repo audit — read-only, zero dependencies, Node 18+.
 *
 * Usage:
 *   node scripts/audit.mjs [path] [--json] [--max 400] [--fail-on high|medium|low]
 *
 * What it does:
 *   1. Detects language, Discord library + installed version, data stores, queues, deploy files.
 *   2. Flags candidate problems (interaction lifecycle, secrets, state, rate limits, CV2, SQL).
 *   3. Prints a report. It never edits files and never touches the network.
 *
 * Findings are candidates for human review, not proof of a bug.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = resolve(fileURLToPath(import.meta.url));

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', 'dist', 'build', 'out', 'coverage',
  'vendor', 'target', '.venv', 'venv', '__pycache__', '.next', '.nuxt', '.svelte-kit',
  '.turbo', '.cache', 'bin', 'obj', '.idea', '.vscode', 'Pods',
]);

const TEXT_EXT = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.jsx', '.tsx', '.py', '.rs',
  '.java', '.kt', '.kts', '.cs', '.go', '.rb', '.php', '.lua', '.dart', '.swift',
  '.json', '.toml', '.yaml', '.yml', '.env', '.md', '.sql', '.sh', '.ps1', '.cfg', '.ini',
]);

const EXTRA_FILES = new Set([
  'Dockerfile', 'Procfile', 'Makefile', 'bun.lock', 'bun.lockb', 'Cargo.lock',
  'poetry.lock', 'uv.lock', 'go.sum', '.gitignore', '.dockerignore', '.env.example',
]);

const MAX_BYTES = 512 * 1024;
const DEFAULT_MAX_FILES = 4000;

function parseArgs(argv) {
  const args = { path: process.cwd(), json: false, max: DEFAULT_MAX_FILES, failOn: null, all: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--all') args.all = true;
    else if (a === '--max') args.max = Number(argv[++i]) || DEFAULT_MAX_FILES;
    else if (a === '--fail-on') args.failOn = argv[++i] ?? 'high';
    else if (a === '--help' || a === '-h') args.help = true;
    else if (!a.startsWith('-')) args.path = a;
  }
  return args;
}

const HELP = `Discord bot audit (read-only)

  node scripts/audit.mjs [path] [--json] [--max N] [--fail-on high|medium|low]

  --json       machine-readable output
  --all        print every finding (default caps each severity at 15)
  --max N      stop after N source files (default ${DEFAULT_MAX_FILES})
  --fail-on S  exit 1 when a finding at severity S or worse exists
`;

function walk(root, maxFiles) {
  const files = [];
  let skipped = 0;
  const stack = [root];

  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      skipped++;
      continue;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith('.') && entry.name !== '.github' && entry.name !== '.env') continue;
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = extname(entry.name).toLowerCase();
      const isNamedEnv = entry.name === '.env' || entry.name.startsWith('.env.');
      if (!TEXT_EXT.has(ext) && !isNamedEnv && !EXTRA_FILES.has(entry.name)) continue;
      let size = 0;
      try {
        size = statSync(full).size;
      } catch {
        continue;
      }
      if (size > MAX_BYTES) continue;
      files.push(full);
      if (files.length >= maxFiles) return { files, skipped, truncated: true };
    }
  }
  files.sort();
  return { files, skipped, truncated: false };
}

function readText(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

const rel = (root, file) => relative(root, file).split(sep).join('/');

/* ------------------------------------------------------------------ */
/* Stack detection                                                     */
/* ------------------------------------------------------------------ */

const LIB_HINTS = [
  ['discord.js', ['discord.js'], 'js'],
  ['discordeno', ['discordeno', '@discordeno/bot', '@discordeno/core'], 'js'],
  ['@discordjs/core', ['@discordjs/core', '@discordjs/ws', '@discordjs/rest'], 'js'],
  ['seyfert', ['seyfert'], 'js'],
  ['@sapphire/framework', ['@sapphire/framework'], 'js'],
  ['commandkit', ['commandkit'], 'js'],
  ['discord.py', ['discord.py'], 'py'],
  ['nextcord', ['nextcord'], 'py'],
  ['disnake', ['disnake'], 'py'],
  ['pycord', ['py-cord', 'pycord'], 'py'],
  ['interactions.py', ['interactions.py'], 'py'],
  ['hikari', ['hikari'], 'py'],
  ['lightbulb', ['hikari-lightbulb'], 'py'],
  ['serenity', ['serenity =', 'serenity=', '"serenity"'], 'rs'],
  ['poise', ['poise =', 'poise=', '"poise"'], 'rs'],
  ['twilight', ['twilight-gateway', 'twilight-http'], 'rs'],
  ['JDA', ['net.dv8tion:jda', 'net.dv8tion/jda', 'net.dv8tion:JDA'], 'java'],
  ['discord4j', ['discord4j'], 'java'],
  ['Discord.Net', ['discord.net'], 'cs'],
  ['DSharpPlus', ['dsharpplus'], 'cs'],
  ['discordgo', ['discordgo'], 'go'],
  ['disgord', ['disgord'], 'go'],
];

function detectStack(root, files) {
  const MANIFEST = {
    js: /(^|\/)(package\.json|bun\.lock|bun\.lockb|pnpm-lock\.yaml|yarn\.lock|package-lock\.json)$/i,
    py: /(^|\/)(pyproject\.toml|requirements\.txt|poetry\.lock|uv\.lock|Pipfile)$/i,
    rs: /(^|\/)(Cargo\.toml|Cargo\.lock)$/i,
    java: /(^|\/)(pom\.xml|build\.gradle|build\.gradle\.kts)$/i,
    cs: /\.(csproj|sln)$|(^|\/)packages\.lock\.json$/i,
    go: /(^|\/)go\.(mod|sum)$/i,
  };
  const text = new Map();
  const byScope = { js: [], py: [], rs: [], java: [], cs: [], go: [] };
  for (const f of files) {
    const norm = rel(root, f);
    for (const [scope, re] of Object.entries(MANIFEST)) {
      if (!re.test(norm)) continue;
      const t = readText(f);
      if (t) {
        text.set(f, t);
        byScope[scope].push(t);
      }
      break;
    }
  }

  const libs = [];
  for (const [lib, keys, scope] of LIB_HINTS) {
    const blob = byScope[scope].join('\n').toLowerCase();
    if (keys.some((k) => blob.includes(k.toLowerCase()))) libs.push(lib);
  }

  const languages = new Set();
  let packageManager = null;
  const names = files.map((f) => basename(f).toLowerCase());
  if (names.includes('package.json') || names.includes('bun.lock') || names.includes('pnpm-lock.yaml')) languages.add('JavaScript/TypeScript');
  if (names.includes('pyproject.toml') || names.includes('requirements.txt') || names.includes('poetry.lock')) languages.add('Python');
  if (names.includes('cargo.toml') || names.includes('cargo.lock')) languages.add('Rust');
  if (names.includes('pom.xml')) { languages.add('Java/Kotlin'); packageManager = 'maven'; }
  if (names.includes('build.gradle') || names.includes('build.gradle.kts')) { languages.add('Java/Kotlin'); packageManager ??= 'gradle'; }
  if (names.some((n) => n.endsWith('.csproj')) || names.some((n) => n.endsWith('.sln'))) { languages.add('C#/.NET'); packageManager ??= 'nuget'; }
  if (names.includes('go.mod')) languages.add('Go');

  if (names.includes('bun.lock') || names.includes('bun.lockb')) packageManager ??= 'bun';
  else if (names.includes('pnpm-lock.yaml')) packageManager ??= 'pnpm';
  else if (names.includes('yarn.lock')) packageManager ??= 'yarn';
  else if (names.includes('package-lock.json')) packageManager ??= 'npm';
  else if (names.includes('poetry.lock')) packageManager ??= 'poetry';
  else if (names.includes('uv.lock')) packageManager ??= 'uv';
  else if (names.includes('cargo.lock')) packageManager ??= 'cargo';

  const version = detectVersion(root, files, libs);

  return {
    languages: [...languages],
    libs,
    version,
    packageManager,
    entry: detectEntry(root, files),
    data: detectData(files),
    sharding: detectSharding(root, files),
    deploy: detectDeploy(files),
    tests: detectTests(files, text),
    envExample: names.includes('.env.example') || names.includes('.env.sample'),
    envCommitted: detectCommittedEnv(root, files),
  };
}

function detectVersion(root, files, libs) {
  if (!libs.length) return null;
  const wanted = LIB_HINTS.filter(([lib]) => libs.includes(lib)).flatMap(([, keys]) => keys);
  const lockCandidates = files.filter((f) => /(bun\.lock|pnpm-lock\.yaml|package-lock\.json|yarn\.lock|poetry\.lock|uv\.lock|Cargo\.lock|packages\.lock\.json|pom\.xml|build\.gradle(\.kts)?|\.csproj)$/i.test(f));
  for (const f of lockCandidates) {
    const t = readText(f);
    if (!t) continue;
    for (const key of wanted) {
      const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const patterns = [
        new RegExp(`["']?${esc}["']?\\s*[:=]\\s*["']?\\^?~?([0-9]+\\.[0-9]+(?:\\.[0-9]+)?)`, 'i'),
        new RegExp(`${esc}@([0-9]+\\.[0-9]+(?:\\.[0-9]+)?)`, 'i'),
      ];
      for (const re of patterns) {
        const m = t.match(re);
        if (m) return { package: key, version: m[1], source: rel(root, f) };
      }
    }
  }
  return null;
}

function detectEntry(root, files) {
  const candidates = files.filter((f) => /(^|[\\/])(index|main|bot|app|shard|client)\.(js|mjs|cjs|ts|py|rs|java|cs)$/i.test(f));
  return candidates.length ? rel(root, candidates[0]) : null;
}

function detectData(files) {
  const found = new Set();
  const names = files.map((f) => f.toLowerCase());
  if (names.some((n) => /\.(sqlite|sqlite3|db)$/.test(n))) found.add('SQLite file');
  if (names.some((n) => n.endsWith('.sql'))) found.add('SQL migrations');
  if (names.some((n) => n.includes('prisma'))) found.add('Prisma');
  if (names.some((n) => n.includes('drizzle'))) found.add('Drizzle');
  if (names.some((n) => n.includes('migration'))) found.add('migrations');
  const manifests = files.filter((f) => /(package\.json|pyproject\.toml|requirements\.txt|Cargo\.toml|pom\.xml|\.csproj)$/i.test(f));
  const blob = manifests.map((f) => readText(f) ?? '').join('\n').toLowerCase();
  if (/better-sqlite3|sqlite3|aiosqlite|rusqlite|microsoft\.data\.sqlite/.test(blob)) found.add('SQLite');
  if (/pg\b|postgres|psycopg|sqlx|tokio-postgres/.test(blob)) found.add('PostgreSQL');
  if (/mysql|mariadb/.test(blob)) found.add('MySQL');
  if (/mongodb|mongoose|pymongo/.test(blob)) found.add('MongoDB');
  if (/ioredis|redis|bullmq|bee-queue/.test(blob)) found.add('Redis');
  if (/bullmq|bee-queue|celery|rq\b|sidekiq|hangfire/.test(blob)) found.add('queue');
  return [...found];
}

function detectSharding(root, files) {
  const hits = [];
  const strong = /new\s+(?:ShardingManager|ClusterManager|DiscordShardedClient|AutoShardedBot)\s*\(|start_autosharded\s*\(|\.useSharding\s*\(|from\s+['"`](?:discord-hybrid-sharding|@discordjs\/brokers)|require\(\s*['"]discord-hybrid-sharding|ClusterClient\b|shardsPerCluster\s*:|shard_count\s*=\s*\d|createBot\s*\(\s*\{[^}]*totalShards/s;
  for (const f of files) {
    if (resolve(f) === SELF) continue;
    if (!/\.(js|mjs|cjs|ts|py|rs|java|cs)$/i.test(f)) continue;
    const t = readText(f);
    if (!t) continue;
    if (strong.test(t)) hits.push(rel(root, f));
  }
  return hits.slice(0, 8);
}

function detectDeploy(files) {
  const found = [];
  const names = files.map((f) => basename(f));
  if (names.includes('Dockerfile')) found.push('Docker');
  if (names.includes('docker-compose.yml') || names.includes('compose.yaml')) found.push('Compose');
  if (names.includes('Procfile')) found.push('Procfile');
  if (names.includes('fly.toml')) found.push('Fly.io');
  if (names.includes('railway.json') || names.includes('railway.toml')) found.push('Railway');
  if (names.includes('render.yaml')) found.push('Render');
  if (files.some((f) => /ecosystem\.config\.(js|cjs|json)$/.test(f))) found.push('PM2');
  if (files.some((f) => /[\\/]k8s[\\/]|[\\/]kubernetes[\\/]/.test(f))) found.push('Kubernetes');
  if (files.some((f) => /[\\/]\.github[\\/]workflows[\\/]/.test(f))) found.push('GitHub Actions');
  return found;
}

function detectTests(files, text) {
  const runners = new Set();
  if (files.some((f) => /\.(test|spec)\.(js|mjs|ts|tsx)$/.test(f))) runners.add('JS test files');
  if (files.some((f) => /(^|[\\/])tests?[\\/].*\.py$/.test(f))) runners.add('pytest');
  if (files.some((f) => /(^|[\\/])tests?[\\/].*\.rs$/.test(f))) runners.add('cargo test');
  const blob = [...text.values()].join('\n');
  for (const [name, re] of [['vitest', /"vitest"/], ['jest', /"jest"/], ['pytest', /pytest/], ['JUnit', /junit/], ['xUnit', /xunit/], ['NUnit', /nunit/]]) {
    if (re.test(blob)) runners.add(name);
  }
  return [...runners];
}

function detectCommittedEnv(root, files) {
  const envFiles = files.filter((f) => basename(f) === '.env');
  const gitignore = files.find((f) => basename(f) === '.gitignore');
  const ignored = gitignore ? (readText(gitignore) ?? '').split(/\r?\n/).some((l) => l.trim() === '.env' || l.trim() === '.env*') : false;
  return { present: envFiles.length > 0, gitignored: ignored, sample: envFiles.map((f) => rel(root, f)) };
}

/* ------------------------------------------------------------------ */
/* Findings                                                            */
/* ------------------------------------------------------------------ */

const SEV = { high: 3, medium: 2, low: 1, info: 0 };

function makeFinding(rule, severity, file, line, message, hint) {
  return { rule, severity, file, line, message, hint };
}

function scanFile(root, file, content) {
  const out = [];
  const lines = content.split(/\r?\n/);
  const path = rel(root, file);
  const isCode = /\.(js|mjs|cjs|ts|mts|cts|jsx|tsx|py|rs|java|kt|cs|go|rb|php|lua)$/i.test(file);
  const isEnv = basename(file) === '.env';

  // Skip the audit script itself and non-source files (docs, lockfiles, configs).
  // Secrets in .env are still worth flagging.
  if (resolve(file) === SELF) return out;
  if (!isCode && !isEnv) return out;

  const push = (rule, severity, ln, message, hint) => out.push(makeFinding(rule, severity, path, ln, message, hint));

  // Only files that actually register an interaction listener are candidates. Mere mentions of
  // "slashCommand", a handler import, or a stats field are not.
  const interactionFile = /\.on\(\s*(?:Events\.)?['"]?interactionCreate|addEventListener\(\s*['"]interactionCreate|Events\.InteractionCreate\b|InteractionCreateEvent\b[^\n]*\.(?:listen|subscribe)|@bot\.listen\(\s*hikari\.InteractionCreateEvent|on_interaction_create\b|SlashCommandExecuted\s*\+=|@client\.event[^\n]*interaction|onSlashCommandInteraction\s*\(|interaction_create\s*@/i.test(content);
  const delegatingFile = /(?:^|[\\/])(handlers?|routers?|loaders?)([\\/]|$)|handler\.js$/i.test(path) ||
    /\.(?:handle|route|dispatch|execute)(?:Interaction|Component|Command)\s*\(/.test(content);

  if (isCode && interactionFile && !delegatingFile) {
    if (!/defer|Defer|deferred|acknowledge|create_initial_response|createInitialResponse|send_initial_response|reply|respond|RespondAsync|create_response/.test(content)) {
      push('interaction-no-ack', 'high', 1, 'Interaction handler file has no visible acknowledgement call.', 'Ack within 3s: defer or reply. See references/02-interactions.md');
    }
  }

  // Acknowledgement ordering: the first ack should come before slow work, not after it.
  if (isCode) {
    const ackRe = /\b(?:interaction|ctx|event|i)\.(?:(?:response|followup)\.)?(reply|reply_with|respond|send_message|defer|deferReply|defer_reply|defer_update|deferUpdate|defer_edit|deferEdit|create_initial_response|createInitialResponse|send_initial_response|edit_original_response|modify_original_response|respond_async|respondAsync|send_modal)\s*\(/i;
    lines.forEach((line, i) => {
      if (!ackRe.test(line)) return;
      if (/\b(defer|deferReply|defer_reply|deferUpdate|defer_update|defer_edit|create_initial_response|createInitialResponse|send_initial_response|send_modal)\b/i.test(line)) return;
      // Walk back only inside this function/handler; stop at the previous signature or closing brace.
      let slowAwait = false;
      for (let j = i - 1; j >= Math.max(0, i - 14); j--) {
        const prev = lines[j];
        if (/^\s*}\s*;?\s*$/.test(prev) ||
          /^\s*(?:async\s+)?(?:def|function|func|fn)\s+[A-Za-z_$][\w$]*\s*\(/.test(prev) ||
          /^\s*(?:public|private|protected|internal)\s+.*\([^;]*\)\s*\{?\s*$/.test(prev) ||
          /^\s*(?:async\s+)?(?:function\s+)?[A-Za-z_$][\w$]*\s*\([^;]*\)\s*\{?\s*$/.test(prev) ||
          /=>\s*\{?\s*$/.test(prev)) break;
        if (!/\bawait\b/.test(prev) || /^import /.test(prev)) continue;
        if (/\bawait\s+[\w.$]*\.(?:reply|send|respond|defer|deferReply|defer_reply|edit|editReply|edit_reply|create|update|followUp|follow_up|send_message)\s*\(/.test(prev)) continue;
        slowAwait = true;
        break;
      }
      if (slowAwait) {
        push('late-ack', 'medium', i + 1, 'Reply happens after an await; the 3s ack window may already be gone.', 'Defer (or reply) before the first slow await. See references/02-interactions.md');
      }
    });
  }

  // Long synchronous sleeps used as throttling.
  const rateWords = /\b(rate[- ]?limit|ratelimit|throttl\w*|retry-after|429)\b/i;
  lines.forEach((line, i) => {
    if (/setTimeout\s*\([^,]+,\s*(\d{3,})\)/.test(line) && rateWords.test(line)) {
      push('sleep-throttle', 'medium', i + 1, 'Fixed-duration sleep near rate-limit wording.', 'Honor X-RateLimit-* / Retry-After instead of fixed sleeps.');
    }
    if (/\btime\.Sleep\s*\(|\bThread\.sleep\s*\(|asyncio\.sleep\s*\(/i.test(line) && rateWords.test(line)) {
      push('sleep-throttle', 'medium', i + 1, 'Fixed sleep near rate-limit wording.', 'Parse rate-limit headers and back off with jitter.');
    }
  });

  // Direct reply and follow-up within one short block (double response smell).
  if (isCode) {
    lines.forEach((line, i) => {
      if (!/followUp|followup|FollowupAsync|send_message\(.*followup/i.test(line)) return;
      const window = lines.slice(Math.max(0, i - 8), i + 3).join('\n');
      if (/\.reply\s*\(|RespondAsync\s*\(|\.respond\s*\(/.test(window) && !/deferred|replied|alreadyResponded|already_responded|interaction\.replied/i.test(window)) {
        push('possible-double-response', 'low', i + 1, 'Reply and follow-up appear in the same block.', 'After defer use editReply/edit_original_response; follow-ups only add new content.');
      }
    });
  }

  // Empty catch blocks.
  lines.forEach((line, i) => {
    if (/catch\s*(\([^)]*\))?\s*\{\s*\}/.test(line) || /except[^:]*:\s*pass\s*$/.test(line)) {
      push('empty-catch', 'low', i + 1, 'Swallowed error with no logging or response.', 'Log with a correlation ID and return a specific user-facing message.');
    }
  });

  // process.exit inside handlers
  const isScript = /(^|[\\/])(scripts?|tools|bin|bins|cmd)[\\/]/i.test(path);
  lines.forEach((line, i) => {
    if (/process\.exit\s*\(|sys\.exit\s*\(|Environment\.Exit\s*\(/.test(line)) {
      push('process-exit', isScript ? 'info' : 'medium', i + 1, 'Hard process exit found.', 'Shut down gracefully: stop intake, drain, close DB, then exit.');
    }
  });

  // Secret-like literals
  lines.forEach((line, i) => {
    if (/(discord.{0,20}token|bot.{0,10}token|client_secret)\s*[:=]\s*['"][A-Za-z0-9._-]{20,}['"]/i.test(line)) {
      push('hardcoded-secret', 'high', i + 1, 'Possible hardcoded credential.', 'Move to env/secret manager, rotate the token, and purge it from history.');
    }
    if (/(Bot|Bearer)\s+[A-Za-z0-9._-]{25,}/.test(line) && !/example|placeholder|xxx|your[_-]?token/i.test(line)) {
      push('hardcoded-secret', 'high', i + 1, 'Possible hardcoded Authorization header.', 'Never inline tokens; redact in logs.');
    }
  });

  // Module-level state collection whose name suggests ownership/session data
  if (isCode) {
    lines.forEach((line, i) => {
      const m = line.match(/^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+(?:Map|Set|Collection)\s*[(<]/);
      if (!m) return;
      if (!/owner|ticket|session|state|pending|active|queue|cache|cooldown|afk|snipe|claim/i.test(m[1])) return;
      push('in-memory-state', 'info', i + 1, `Module-level ${m[1]} collection may hold ownership/session state.`, 'If it is authoritative, persist it; sharding makes memory lie.');
    });
  }

  // custom_id built by joining multiple parts with "_" (e.g. `action_${userId}_${id}`)
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\/\*|\*)/.test(line)) return;
    if (/throw\s+new\s+Error|console\./.test(line)) return;
    if (!/setCustomId|custom_?id\s*[:=]/i.test(line)) return;
    const tpl = line.match(/`[^`]*`/);
    if (!tpl) return;
    if (/\$\{[^}]+\}_|_\$\{[^}]+\}/.test(tpl[0])) {
      push('ambiguous-custom-id', 'info', i + 1, 'custom_id joins multiple dynamic parts with "_".', 'Prefer a delimiter that cannot appear in parts (like ":"), or a fixed positional parse.');
    }
  });

  // CV2 flag and a content field in the same payload block
  if (isCode) {
    lines.forEach((line, i) => {
      if (!/1\s*<<\s*15|32768|IsComponentsV2|IS_COMPONENTS_V2|components_v2/i.test(line)) return;
      // Scope the search to the object literal that contains the flag, not neighbouring payloads.
      const closes = (s) => /\}\s*\)?\s*[,;]?\s*$/.test(s);
      let start = i;
      for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
        if (closes(lines[j])) break;
        start = j;
      }
      let end = i;
      const isField = (s) => /^\s*['"]?[A-Za-z_$][\w$]*['"]?\s*:/.test(s);
      const endLine = (s) => /^\s*[)\]}]+[,;]?\s*$/.test(s);
      for (let j = i + 1; j <= Math.min(lines.length - 1, i + 8); j++) {
        if (endLine(lines[j])) {
          end = j;
          break;
        }
        if (!isField(lines[j])) break;
        end = j;
      }
      const window = lines.slice(start, end + 1).join('\n');
      if (/flags?\s*[:=]/.test(window) && /\bcontent\s*:|"content"\s*:/.test(window)) {
        push('cv2-with-content', 'low', i + 1, 'CV2 flag and a content field appear in the same payload block.', 'CV2 disables content/embeds; confirm they are not sent together.');
      }
    });
  }

  // Raw webhook execution carrying components without with_components
  if (isCode) {
    lines.forEach((line, i) => {
      if (!/executeWebhook|webhooks\//i.test(line)) return;
      const window = lines.slice(i, i + 20).join('\n');
      if (/components/i.test(window) && !/with_components/.test(window) && !/WithComponents/.test(window)) {
        push('webhook-components-flag', 'low', i + 1, 'Webhook execution with components but no with_components.', 'Raw webhook URLs need ?with_components=true for CV2 payloads.');
      }
    });
  }

  // SQL built by string concatenation
  lines.forEach((line, i) => {
    if (/['"`]\s*(SELECT|INSERT|UPDATE|DELETE)\b[^'"`]*['"`]\s*\+/.test(line) || /['"`]\s*(SELECT|INSERT|UPDATE|DELETE)\b.*%s/.test(line)) {
      push('sql-concatenation', 'high', i + 1, 'SQL string built with concatenation/formatting.', 'Use parameterized queries; never interpolate user input.');
    }
  });

  // Missing await on interaction replies (heuristic)
  lines.forEach((line, i) => {
    if (/\binteraction\.(reply|deferReply|editReply|followUp|update|deferUpdate)\s*\(/.test(line) && !/await|return|\.then|\.catch|void\s/.test(line)) {
      push('unawaited-response', 'low', i + 1, 'Interaction response not awaited.', 'Unawaited responses race and can produce 10062/40060.');
    }
  });

  // Permission metadata without a runtime check
  if (/setDefaultMemberPermissions|default_permissions|RequireUserPermission|has_permissions/.test(content) && !/hasPermission|permissions\.has|permissions_for|GuildPermissions|has_permission|canInteract|manageable|isOwner|is_owner/i.test(content)) {
    push('permission-ui-only', 'medium', 1, 'Permission declared at registration/UI level but no runtime check found.', 'Re-check actor, bot, hierarchy and ownership in the handler.');
  }

  // Unbounded interval
  if (/setInterval\s*\(/.test(content) && !/clearInterval/.test(content)) {
    push('interval-no-clear', 'info', firstLine(lines, /setInterval\s*\(/), 'setInterval without clearInterval in this file.', 'Clear timers on shutdown and on resource deletion.');
  }

  // Dynamic code execution (eval/new Function; child_process exec on input)
  lines.forEach((line, i) => {
    if (/\beval\s*\(|new\s+Function\s*\(/.test(line) && !/RegExp|regex/i.test(line)) {
      push('dynamic-exec', 'medium', i + 1, 'Dynamic code execution.', 'Avoid eval/new Function on user input; use a parser.');
    }
    if (/child_process/.test(content) && /\bexec(Sync)?\s*\(\s*[`'"]/.test(line) && /\$\{|[+]\s*[a-zA-Z_]/.test(line)) {
      push('dynamic-exec', 'medium', i + 1, 'Shell execution with interpolated input.', 'Use execFile/spawn with an argument array and validate input.');
    }
  });

  // Unbounded concurrency in loops
  if (/Promise\.all\s*\(\s*[^)]*\.map\s*\(/.test(content) && !/p-limit|pLimit|Semaphore|concurrency|chunk/i.test(content)) {
    push('unbounded-concurrency', 'low', firstLine(lines, /Promise\.all\s*\(/), 'Promise.all over a map without a limiter.', 'Bound concurrency for REST-heavy work; chunk large batches.');
  }

  // v13 / outdated API smells
  if (/MessageEmbed|MessageActionRow|MessageButton|Intents\.FLAGS/.test(content)) {
    push('discordjs-v13-api', 'medium', firstLine(lines, /MessageEmbed|MessageActionRow|MessageButton|Intents\.FLAGS/), 'discord.js v13-era API in use.', 'Check the installed major; v14 renamed these to *Builder.');
  }

  // Command synchronization inside ready event
  if (isCode && !isScript) {
    lines.forEach((line, i) => {
      if (/\b(?:client\s*\.\s*(?:once|on)\s*\(\s*['"`](?:ready|ClientReady)['"`]|@(?:bot|client)\.event|def\s+on_ready)/i.test(line)) {
        const window = lines.slice(i, Math.min(lines.length, i + 35)).join('\n');
        if (/Routes\.application(?:Guild)?Commands|\.commands\s*\.\s*set\s*\(|\.tree\.sync\s*\(|application\.bulk_overwrite/i.test(window)) {
          push('command-sync-on-ready', 'medium', i + 1, 'Commands synchronized inside the ready/on_ready handler.', 'Sync commands via a separate deploy script or content-hashed startup check; ready fires on every reconnect and triggers rate limits.');
        }
      }
    });
  }

  // Modal opened after interaction already acknowledged or deferred
  if (isCode) {
    lines.forEach((line, i) => {
      if (/\b(?:interaction\s*\.\s*showModal|show_modal)\s*\(/.test(line)) {
        const prevWindow = lines.slice(Math.max(0, i - 15), i).join('\n');
        if (/\binteraction\s*\.\s*(?:deferReply|reply|deferUpdate|update)\s*\(/.test(prevWindow)) {
          push('modal-after-defer', 'high', i + 1, 'showModal invoked after deferReply or reply.', 'showModal MUST be the initial response to an interaction; you cannot defer or reply before showing a modal.');
        }
      }
    });
  }

  // Keep per-file noise down: repeated low/info findings of the same rule add no information.
  const LIMITS = { high: 50, medium: 4, low: 2, info: 2 };
  const capped = [];
  const counts = new Map();
  for (const f of out) {
    const limit = LIMITS[f.severity] ?? 2;
    const n = counts.get(f.rule) ?? 0;
    if (n >= limit) continue;
    counts.set(f.rule, n + 1);
    capped.push(f);
  }
  return capped;
}

function firstLine(lines, re) {
  for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) return i + 1;
  return 1;
}

/* ------------------------------------------------------------------ */
/* Report                                                              */
/* ------------------------------------------------------------------ */

function severityRank(s) {
  return SEV[s] ?? 0;
}

function printHuman(root, stack, findings, meta) {
  const out = [];
  const line = (s = '') => out.push(s);
  line(`Discord bot audit — ${root}`);
  line('='.repeat(64));
  line('');
  line('STACK');
  line(`  languages     ${stack.languages.join(', ') || 'unknown'}`);
  line(`  library       ${stack.libs.join(', ') || 'unknown'}${stack.version ? `  (${stack.version.version}, from ${stack.version.source})` : ''}`);
  line(`  package mgr   ${stack.packageManager ?? 'unknown'}`);
  line(`  entry         ${stack.entry ?? 'unknown'}`);
  line(`  data          ${stack.data.join(', ') || 'none detected'}`);
  line(`  sharding      ${stack.sharding.length ? stack.sharding.join(', ') : 'none detected'}`);
  line(`  deploy        ${stack.deploy.join(', ') || 'none detected'}`);
  line(`  tests         ${stack.tests.join(', ') || 'none detected'}`);
  line(`  env sample    ${stack.envExample ? 'yes' : 'no'}`);
  line('');
  line(`FILES  scanned ${meta.scanned}${meta.truncated ? ` (stopped at --max ${meta.max})` : ''}${meta.skipped ? `, unreadable dirs ${meta.skipped}` : ''}`);
  line('');

  if (!findings.length) {
    line('No candidate issues matched. This is not a proof of correctness — read the code.');
  } else {
    line(`FINDINGS  ${findings.length}`);
    line('');
    const bySeverity = ['high', 'medium', 'low', 'info'];
    for (const sev of bySeverity) {
      const group = findings.filter((f) => f.severity === sev);
      if (!group.length) continue;
      line(`${sev.toUpperCase()} (${group.length})`);
      const shown = meta.all ? group : group.slice(0, 15);
      for (const f of shown) {
        line(`  ${f.file}:${f.line}  [${f.rule}]`);
        line(`    ${f.message}`);
        line(`    -> ${f.hint}`);
      }
      if (shown.length < group.length) {
        line(`  ... ${group.length - shown.length} more at this severity (use --all)`);
      }
      line('');
    }
  }

  if (stack.envCommitted.present && !stack.envCommitted.gitignored) {
    line('NOTE  .env exists and does not appear in .gitignore. Add it and rotate any committed secrets.');
  }

  const next = [
    'Read references/00-detection.md for the full checklist.',
    'Findings are heuristics: confirm each one by reading the code path.',
  ];
  line('');
  line('NEXT');
  for (const n of next) line(`  - ${n}`);
  console.log(out.join('\n'));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return 0;
  }

  const root = resolve(args.path);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    console.error(`Not a directory: ${root}`);
    return 2;
  }

  const { files, skipped, truncated } = walk(root, args.max);
  const stack = detectStack(root, files);
  const findings = [];

  // Repo-level checks (only meaningful when this looks like an application repo)
  if (stack.languages.length || stack.libs.length) {
    if (stack.envCommitted.present && !stack.envCommitted.gitignored) {
      findings.push(makeFinding('env-not-ignored', 'high', '.env', 1, '.env exists but .gitignore does not ignore it.', 'Add .env to .gitignore; rotate anything committed.'));
    }
    if (!stack.envExample) {
      findings.push(makeFinding('no-env-example', 'low', '.', 1, 'No .env.example found.', 'Document every required env var with safe placeholders.'));
    }
    if (!stack.tests.length) {
      findings.push(makeFinding('no-tests', 'low', '.', 1, 'No test setup detected.', 'Add unit tests for domain logic and interaction ack behaviour.'));
    }
    const usesSqlite = stack.data.some((d) => /sqlite/i.test(d));
    if (usesSqlite && stack.sharding.length) {
      findings.push(makeFinding(
        'sqlite-with-sharding',
        'high',
        '.',
        1,
        'SQLite and sharding/clustering both detected in this repo.',
        'Never share a SQLite file across shard/cluster processes; move shared state to Postgres/Redis or give each process its own file. See references/05-data-layer.md',
      ));
    }
  }

  let scanned = 0;
  for (const file of files) {
    const content = readText(file);
    if (content == null) continue;
    scanned++;
    findings.push(...scanFile(root, file, content));
  }

  const seen = new Set();
  const unique = findings
    .filter((f) => {
      const key = `${f.rule}|${f.file}|${f.line}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.file.localeCompare(b.file) || a.line - b.line);

  if (args.json) {
    const payload = {
      root,
      stack: {
        languages: stack.languages,
        libs: stack.libs,
        version: stack.version,
        packageManager: stack.packageManager,
        entry: stack.entry,
        data: stack.data,
        sharding: stack.sharding,
        deploy: stack.deploy,
        tests: stack.tests,
        envExample: stack.envExample,
      },
      scanned,
      truncated,
      findings: unique,
    };
    console.log(JSON.stringify(payload, null, 2));
  } else {
    printHuman(root, stack, unique, { scanned, skipped, truncated, max: args.max, all: args.all });
  }

  if (args.failOn) {
    const threshold = severityRank(args.failOn);
    const failing = unique.filter((f) => severityRank(f.severity) >= threshold);
    if (failing.length) return 1;
  }
  return 0;
}

process.exitCode = main();
