const fs = require('fs');
const path = require('path');

const VERIFIER_STATE_FILE = path.join(__dirname, '.hames_verifier_last.json');

function writeVerifierState(status, files) {
    try {
        const state = {
            status,
            file: files.length === 1 ? path.basename(files[0]) : `${files.length} files`,
            timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19)
        };
        fs.writeFileSync(VERIFIER_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
    } catch (_) { /* non-fatal */ }
}

const MODULES = [
    'prompt_engineering.md',
    'context_engineering.md',
    'agent_engineering.md',
    'harness_engineering.md'
];

const WORKSPACES = [
    'workspaces/Investment',
    'workspaces/Business',
    'workspaces/Company',
    'workspaces/Hobby'
];

// Frontmatter value vocabularies \u2014 loaded from audit_exclusions.json so each fork
// controls its own taxonomy. Empty list (default) \u2192 presence-checked only: any
// non-empty value is accepted. Populate frontmatter_vocab.{related,topic,type} in
// audit_exclusions.json to enforce a controlled vocabulary.
const EXCLUSIONS_PATH = path.join(__dirname, 'audit_exclusions.json');
function loadFrontmatterVocab() {
    try {
        const cfg = JSON.parse(fs.readFileSync(EXCLUSIONS_PATH, 'utf-8'));
        return cfg.frontmatter_vocab || {};
    } catch (_) {
        return {};
    }
}
const VOCAB = loadFrontmatterVocab();

const ALLOWED_RELATED = new Set(VOCAB.related || []);
const ALLOWED_TOPIC   = new Set(VOCAB.topic || []);
const ALLOWED_TYPE    = new Set(VOCAB.type || []);

// Canonical tags that always pass. Non-canonical tags are still accepted when they
// look like proper nouns or contain non-ASCII (see isAllowedTag), so this is a
// convenience set, not a hard gate. Override via frontmatter_vocab.canonical_tags.
const CANONICAL_TAGS = new Set(VOCAB.canonical_tags || [
    'Analysis', 'Proposal', 'Report', 'Spec', 'Strategy', 'Internal_Guide',
    'Competitors', 'Risk', 'Protocol', 'Agenda', 'USP', 'Branding', 'Design',
    'Portfolio', 'System', 'Worklog', 'MOC', 'Investment', 'Macro', 'Insight',
    'Hames_System'
]);

function checkSystem() {
    const hamesRoot = path.resolve(__dirname, '..', '..');
    const rulesDir = path.join(hamesRoot, '.cursor', 'rules');
    const claudeFile = path.join(hamesRoot, 'CLAUDE.md');
    const failures = [];

    const check = (label, condition) => {
        if (!condition) failures.push(label);
        return condition;
    };

    MODULES.forEach(moduleName => {
        check(`missing module file: .cursor/rules/${moduleName}`, fs.existsSync(path.join(rulesDir, moduleName)));
    });

    MODULES.forEach(moduleName => {
        const modulePath = path.join(rulesDir, moduleName);
        if (!fs.existsSync(modulePath)) return;
        const content = fs.readFileSync(modulePath, 'utf8');
        check(`missing alwaysApply: true in ${moduleName}`, content.includes('alwaysApply: true'));
    });

    if (fs.existsSync(claudeFile)) {
        const claudeContent = fs.readFileSync(claudeFile, 'utf8');
        MODULES.forEach(moduleName => {
            check(`missing @import in CLAUDE.md: ${moduleName}`, claudeContent.includes(moduleName));
        });
        check(
            'missing Arsenal import in CLAUDE.md',
            claudeContent.includes('@arsenal/AGENTS.md') || claudeContent.includes('@arsenal/CLAUDE.md')
        );
    } else {
        failures.push('missing CLAUDE.md');
    }

    WORKSPACES.forEach(workspace => {
        const workspaceClaude = path.join(hamesRoot, workspace, 'CLAUDE.md');
        if (!fs.existsSync(workspaceClaude)) {
            failures.push(`missing workspace CLAUDE.md: ${workspace}`);
            return;
        }
        const content = fs.readFileSync(workspaceClaude, 'utf8');
        check(`missing harness block in ${workspace}/CLAUDE.md`, content.includes('## \ud558\ub124\uc2a4 \uaddc\uce59'));
    });

    console.log('\n[HAMES SYSTEM CHECK] v5.0 integrity');
    console.log('='.repeat(50));
    if (failures.length === 0) {
        console.log('status: PASS');
        console.log('='.repeat(50) + '\n');
        process.exit(0);
    }

    failures.forEach(failure => console.error(`[FAIL] ${failure}`));
    console.log('='.repeat(50));
    console.error(`status: FAIL (${failures.length} issue${failures.length === 1 ? '' : 's'})`);
    console.log('='.repeat(50) + '\n');
    process.exit(1);
}

if (process.argv[2] === '--check-system') {
    checkSystem();
}

console.log('\n=== HAMES SYSTEM: VERIFY TASKS (Harness Hook) ===');

let hasErrors = false;

function normalizePath(filePath) {
    return filePath.replace(/\\/g, '/');
}

function stripWrappingQuotes(value) {
    if (value.length >= 2 && (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
    )) {
        return value.slice(1, -1);
    }
    return value;
}

function isWorkspaceMarkdown(filePath) {
    return /(?:^|\/)workspaces\/[^/]+\//.test(normalizePath(filePath));
}

function isWorkspaceIndex(filePath) {
    return isWorkspaceMarkdown(filePath) && path.basename(filePath) === '_Index.md';
}

function isHobbyFile(filePath) {
    return normalizePath(filePath).includes('workspaces/Hobby/');
}

function isDatedMarkdown(filePath) {
    return /^\d{4}-\d{2}-\d{2}_.+\.md$/i.test(path.basename(filePath));
}

function isTaskMarkdownFile(filePath) {
    const baseName = path.basename(filePath);

    if (path.extname(filePath).toLowerCase() !== '.md') return false;
    if (!isWorkspaceMarkdown(filePath)) return false;
    if (isWorkspaceIndex(filePath)) return true;
    if (baseName === 'README.md' || baseName === 'CLAUDE.md' || baseName === 'Project_A.md' || /_MOC\.md$/i.test(baseName)) return false;
    if (isHobbyFile(filePath)) return isDatedMarkdown(filePath);
    return isDatedMarkdown(filePath);
}

function parseFrontmatter(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
    if (!content.startsWith('---')) {
        console.error(`[ERROR] Missing Frontmatter (---) at the start of ${filePath}`);
        hasErrors = true;
        return null;
    }

    const lines = content.split(/\r?\n/);
    let frontmatterEnd = -1;
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '---') {
            frontmatterEnd = i;
            break;
        }
    }

    if (frontmatterEnd === -1) {
        console.error(`[ERROR] Unclosed Frontmatter section in ${filePath}`);
        hasErrors = true;
        return null;
    }

    const frontmatter = {};
    let currentArrayKey = null;

    lines.slice(1, frontmatterEnd).forEach(line => {
        if (!line.trim()) return;

        const keyValueMatch = line.match(/^([A-Za-z_]+):\s*(.*)$/);
        if (keyValueMatch) {
            const [, key, rawValue] = keyValueMatch;
            if (rawValue === '') {
                frontmatter[key] = [];
                currentArrayKey = key;
            } else {
                frontmatter[key] = stripWrappingQuotes(rawValue.trim());
                currentArrayKey = null;
            }
            return;
        }

        const arrayItemMatch = line.match(/^\s*-\s+(.+)$/);
        if (arrayItemMatch && currentArrayKey) {
            if (!Array.isArray(frontmatter[currentArrayKey])) {
                frontmatter[currentArrayKey] = [];
            }
            frontmatter[currentArrayKey].push(stripWrappingQuotes(arrayItemMatch[1].trim()));
        }
    });

    return frontmatter;
}

function isAllowedTag(tag) {
    if (CANONICAL_TAGS.has(tag)) return true;

    // Allow non-canonical proper nouns and technical terms, but reject loose free-text tags.
    return /^[A-Z0-9][A-Za-z0-9_-]*$/.test(tag) || /[^\u0000-\u007F]/.test(tag);
}

function checkFrontmatter(filePath) {
    const frontmatter = parseFrontmatter(filePath);
    if (!frontmatter) return;

    ['Related', 'Topic', 'Type', 'tags'].forEach(key => {
        if (!(key in frontmatter)) {
            console.error(`[ERROR] Missing required key '${key}' in Frontmatter of ${filePath}`);
            hasErrors = true;
        }
    });

    if (ALLOWED_RELATED.size > 0 && typeof frontmatter.Related === 'string' && !ALLOWED_RELATED.has(frontmatter.Related)) {
        console.error(`[ERROR] Invalid Related value in ${filePath}: ${frontmatter.Related}`);
        hasErrors = true;
    }

    if (ALLOWED_TOPIC.size > 0 && typeof frontmatter.Topic === 'string' && !ALLOWED_TOPIC.has(frontmatter.Topic)) {
        console.error(`[ERROR] Invalid Topic value in ${filePath}: ${frontmatter.Topic}`);
        hasErrors = true;
    }

    if (ALLOWED_TYPE.size > 0 && typeof frontmatter.Type === 'string' && !ALLOWED_TYPE.has(frontmatter.Type)) {
        console.error(`[ERROR] Invalid Type value in ${filePath}: ${frontmatter.Type}`);
        hasErrors = true;
    }

    if (!Array.isArray(frontmatter.tags) || frontmatter.tags.length === 0) {
        console.error(`[ERROR] Frontmatter tags must be a non-empty list in ${filePath}`);
        hasErrors = true;
        return;
    }

    frontmatter.tags.forEach(tag => {
        if (!isAllowedTag(tag)) {
            console.error(`[ERROR] Invalid tag in ${filePath}: ${tag}`);
            hasErrors = true;
        }
    });
}

function checkIndexLinks(indexPath) {
    if (!fs.existsSync(indexPath)) return;
    const content = fs.readFileSync(indexPath, 'utf-8');
    const linkRegex = /\[.*?\]\((.*?)\)/g;
    const indexDir = path.dirname(indexPath);
    let match;

    while ((match = linkRegex.exec(content)) !== null) {
        const linkPath = match[1];
        if (linkPath.startsWith('http://') || linkPath.startsWith('https://') || linkPath.startsWith('#')) {
            continue;
        }

        const localPath = decodeURIComponent(linkPath.split('#')[0]);
        const absolutePath = path.resolve(indexDir, localPath);

        if (!fs.existsSync(absolutePath)) {
            console.error(`[ERROR] Broken link (Target File Not Found) in ${indexPath}: ${linkPath}`);
            hasErrors = true;
        }
    }
}

const targetFiles = process.argv.slice(2);

function runVerification(files) {
    files.forEach(file => {
        if (!fs.existsSync(file)) {
            console.error(`[WARNING] File not found to verify: ${file}`);
            hasErrors = true;
            return;
        }

        if (path.extname(file).toLowerCase() !== '.md') {
            console.log(`Skipping unsupported file type: ${file}`);
            return;
        }

        if (!isTaskMarkdownFile(file)) {
            console.log(`Skipping non-task markdown: ${file}`);
            return;
        }

        if (path.basename(file) === '_Index.md') {
            console.log(`Verifying Index File Links: ${file}...`);
            checkIndexLinks(file);
        } else if (isHobbyFile(file)) {
            console.log(`Skipping frontmatter (Hobby workspace policy): ${file}`);
        } else {
            console.log(`Verifying Standard MD Frontmatter: ${file}...`);
            checkFrontmatter(file);
        }
    });

    if (hasErrors) {
        writeVerifierState('FAIL', files);
        console.error('\n[VERIFICATION FAILED] Please correct the errors and SELF-CORRECT before proceeding.');
        process.exit(1);
    }

    writeVerifierState('PASS', files);
    console.log('[VERIFICATION PASSED] All checks green. Safe to index & merge.');
    process.exit(0);
}

if (targetFiles.length === 0) {
    let raw = '';
    process.stdin.on('data', chunk => { raw += chunk; });
    process.stdin.on('end', () => {
        if (!raw.trim()) process.exit(0);

        try {
            const toolCall = JSON.parse(raw);
            const toolInput = toolCall.tool_input || toolCall.input || {};
            const filePath = toolInput.file_path;
            if (!filePath || !isTaskMarkdownFile(filePath)) process.exit(0);
            runVerification([filePath]);
        } catch {
            process.exit(0);
        }
    });
} else {
    runVerification(targetFiles);
}
