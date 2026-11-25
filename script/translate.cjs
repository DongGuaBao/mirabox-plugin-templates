const path = require("path");
const fs = require("fs");
const target_language = [
    { name: "Simplified Chinese", value: "zh_CN" },
    { name: "Traditional Chinese", value: "zh_HK" },
    { name: "English", value: "en" },
    { name: "German", value: "de" },
    { name: "Greek", value: "el" },
    { name: "Spanish", value: "es" },
    { name: "French", value: "fr" },
    { name: "Japanese", value: "ja" },
    { name: "Korean", value: "ko" },
    { name: "Italian", value: "it" },
    { name: "Portuguese", value: "pt" },
    { name: "Polish", value: "pl" },
    { name: "Russian", value: "ru" },
    { name: "Arabic", value: "ar" },
];
/** 两个参考语言：优先中文，中文缺失时回退英文。 */
const PRIMARY_SOURCE = "zh_CN";
const FALLBACK_SOURCE = "en";
/** 上一轮翻译失败留下的占位值，下次运行应当重试而不是当作已完成。 */
const FAILED_MARK = "(translation failed)";
const MAX_CONCURRENCY = 3;
const BATCH_SIZE = 40;
/**
 * 读取 JSON 文件
 */
function readJsonSync(filePath) {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
}
/**
 * 写入 JSON 文件
 */
function writeJsonSync(filePath, data, options) {
    const spaces = options?.spaces ?? 2;
    const content = JSON.stringify(data, null, spaces);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, "utf-8");
}
/**
 * 加载 .env 文件到 process.env
 */
function loadEnv(envPath) {
    const filePath = envPath || path.join(__dirname, "../.env");
    if (!fs.existsSync(filePath)) {
        return;
    }
    const content = fs.readFileSync(filePath, "utf-8");
    for (const line of content.split("\n")) {
        // 跳过空行和注释
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
            continue;
        }
        // 解析 KEY=VALUE
        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (!match) {
            continue;
        }
        const key = match[1].trim();
        let value = match[2].trim();
        // 移除引号
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        // 只在环境变量不存在时设置
        if (process.env[key] === undefined) {
            process.env[key] = value;
        }
    }
}
loadEnv();
class OpenAIClient {
    baseURL;
    apiKey;
    constructor(options = {}) {
        this.baseURL = options.baseURL || "https://api.openai.com/v1";
        this.apiKey = options.apiKey || "";
    }
    async chatCompletionsCreate(params) {
        const url = `${this.baseURL}/chat/completions`;
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify(params),
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
        }
        return await response.json();
    }
}
// 单例实例
let _client = null;
function getOpenAIClient() {
    if (!_client) {
        _client = new OpenAIClient({
            baseURL: process.env.OPENAI_BASE_URL,
            apiKey: process.env.OPENAI_API_KEY,
        });
    }
    return _client;
}
/** 测试用：注入替身 client，避免真实联网。 */
function setOpenAIClient(client) {
    _client = client;
}

function checkPlaceholders(original, translated) {
    if (typeof translated !== "string") return false;
    const orig = original.match(/\{\d+\}/g) || [];
    const trans = translated.match(/\{\d+\}/g) || [];
    return orig.length === trans.length && orig.every((p) => trans.includes(p));
}
function createLimiter(max) {
    let activeCount = 0;
    const queue = [];
    const next = () => {
        activeCount--;
        if (queue.length > 0) {
            const { fn, resolve, reject } = queue.shift();
            run(fn).then(resolve).catch(reject);
        }
    };
    const run = async (fn) => {
        activeCount++;
        try {
            const result = await fn();
            next();
            return result;
        } catch (err) {
            next();
            throw err;
        }
    };
    return async (fn) => {
        if (activeCount < max) {
            return run(fn);
        }
        return new Promise((resolve, reject) => {
            queue.push({ fn, resolve, reject });
        });
    };
}

// ---------------------------------------------------------------------------
// 条目路径工具
//
// 语言文件形状固定为三类可翻译位置：
//   Localization.<key> / Name|Description|Category / <actionUUID>.Tooltip|Name
// Localization 的 key 本身可能含 "."，所以路径统一用数组表示，不用点号拼接。
// ---------------------------------------------------------------------------
const TOP_LEVEL_FIELDS = ["Name", "Description", "Category"];
const ACTION_FIELDS = ["Tooltip", "Name"];

/** 列出一个语言文件里所有可翻译条目：`{ path, value }`。 */
function collectEntries(data) {
    const entries = [];
    if (!data || typeof data !== "object") return entries;
    if (data.Localization && typeof data.Localization === "object") {
        for (const [key, value] of Object.entries(data.Localization)) {
            if (typeof value === "string") entries.push({ path: ["Localization", key], value });
        }
    }
    for (const field of TOP_LEVEL_FIELDS) {
        if (typeof data[field] === "string") entries.push({ path: [field], value: data[field] });
    }
    for (const [key, value] of Object.entries(data)) {
        if (key === "Localization" || TOP_LEVEL_FIELDS.includes(key)) continue;
        if (!value || typeof value !== "object" || Array.isArray(value)) continue;
        for (const field of ACTION_FIELDS) {
            if (typeof value[field] === "string") entries.push({ path: [key, field], value: value[field] });
        }
    }
    return entries;
}
/** 路径的字符串形式，仅用于 Map 键与日志。 */
function pathId(p) {
    return JSON.stringify(p);
}
function getByPath(data, p) {
    let node = data;
    for (const seg of p) {
        if (!node || typeof node !== "object") return undefined;
        node = node[seg];
    }
    return node;
}
function setByPath(data, p, value) {
    let node = data;
    for (let i = 0; i < p.length - 1; i++) {
        const seg = p[i];
        if (!node[seg] || typeof node[seg] !== "object") node[seg] = {};
        node = node[seg];
    }
    node[p[p.length - 1]] = value;
}
/** 已有译文是否可用：非空字符串且不是上次的失败占位。 */
function isTranslated(value) {
    return typeof value === "string" && value.trim() !== "" && value !== FAILED_MARK;
}

/**
 * 合并 zh_CN 与 en 建立参考表（两者 key 的并集）。
 * 同一个 key 同时存在时优先取中文；中文缺失才用英文。
 * 返回 Map<pathId, { path, text, sourceLang }>，sourceLang 用于告知模型源语言。
 */
function buildReference(primaryData, fallbackData) {
    const reference = new Map();
    const primaryLang = target_language.find((l) => l.value === PRIMARY_SOURCE);
    const fallbackLang = target_language.find((l) => l.value === FALLBACK_SOURCE);
    for (const { path: p, value } of collectEntries(fallbackData)) {
        if (isTranslated(value)) reference.set(pathId(p), { path: p, text: value, sourceLang: fallbackLang });
    }
    // 中文后写入以覆盖英文，实现「优先中文」。
    for (const { path: p, value } of collectEntries(primaryData)) {
        if (isTranslated(value)) reference.set(pathId(p), { path: p, text: value, sourceLang: primaryLang });
    }
    return reference;
}

async function translateBatch(texts, target, sourceName) {
    const from = sourceName ? ` from ${sourceName}` : "";
    let tries = 0;
    while (tries < 3) {
        tries++;
        try {
            const chatCompletion = await getOpenAIClient().chatCompletionsCreate({
                model: process.env.OPENAI_MODEL || "gpt-4o-mini",
                messages: [
                    {
                        role: "user",
                        content: `You are a translation assistant.
Translate the following texts${from} into ${target}.
The text may include placeholders in the format {0}, {1}, etc.
Your translation must:
1. Keep all placeholders exactly as they appear, without changing numbers or braces.
2. Adjust the position of placeholders to match ${target} grammar if necessary, but do not remove them.
3. Only output translation results as an array of strings in the same order as input.
Texts: ${JSON.stringify(texts)}`,
                    },
                ],
            });
            const result = JSON.parse(chatCompletion.choices[0].message.content || "{}");
            const translations = result;
            if (!Array.isArray(translations) || translations.length !== texts.length) {
                console.log(`Batch size mismatch: expected ${texts.length}, got ${Array.isArray(translations) ? translations.length : "none"}`);
                continue;
            }
            let allValid = true;
            for (let k = 0; k < texts.length; k++) {
                if (!checkPlaceholders(texts[k], translations[k])) {
                    console.log(`Placeholder mismatch: ${texts[k]} -> ${translations[k]}`);
                    allValid = false;
                    break;
                }
            }
            if (allValid) {
                return translations;
            }
        } catch (err) {
            console.error("Batch translation error", err);
        }
    }
    return texts.map(() => FAILED_MARK);
}

/**
 * 增量翻译整个 language 目录。
 *
 * - 参考表 = zh_CN 与 en 的 key 并集，优先中文，中文缺失用英文；
 * - 每个目标语言只翻译**自身缺失**的 key，已有译文一律保留、不再调用 AI；
 * - zh_CN / en 自身也参与补全（互为来源）；
 * - 目标语言齐备时完全跳过，不发任何请求。
 */
async function translateDirectory(dir, options = {}) {
    const { dryRun = false } = options;
    const languageDir = path.resolve(dir);
    if (!fs.existsSync(languageDir)) {
        throw new Error(`Language directory not found: ${languageDir}`);
    }
    console.log(`Language directory: ${languageDir}`);
    if (dryRun) console.log("(dry-run：只报告缺失项，不调用 AI)");

    // 目录里出现列表外的 json（manifest.json / tsconfig.json 等）只警告并跳过。
    const known = new Set(target_language.map((l) => l.value));
    for (const file of fs.readdirSync(languageDir)) {
        if (!file.endsWith(".json")) continue;
        const base = path.basename(file, ".json");
        if (!known.has(base)) {
            console.warn(`! 跳过非目标语言文件：${file}`);
        }
    }

    const load = (value) => {
        const file = path.join(languageDir, `${value}.json`);
        if (!fs.existsSync(file)) return {};
        try {
            return readJsonSync(file);
        } catch (err) {
            throw new Error(`${value}.json 不是合法 JSON：${err.message}`);
        }
    };

    const primaryData = load(PRIMARY_SOURCE);
    const fallbackData = load(FALLBACK_SOURCE);
    const reference = buildReference(primaryData, fallbackData);
    if (reference.size === 0) {
        throw new Error(`${PRIMARY_SOURCE}.json 与 ${FALLBACK_SOURCE}.json 均无可用条目，无法建立翻译参考`);
    }

    const primaryCount = [...reference.values()].filter((e) => e.sourceLang.value === PRIMARY_SOURCE).length;
    const fallbackCount = reference.size - primaryCount;
    console.log(`参考条目 ${reference.size} 条：${PRIMARY_SOURCE} 提供 ${primaryCount} 条，${FALLBACK_SOURCE} 补充 ${fallbackCount} 条`);
    if (fallbackCount > 0) {
        for (const entry of reference.values()) {
            if (entry.sourceLang.value === FALLBACK_SOURCE) {
                console.log(`  · ${PRIMARY_SOURCE} 缺失，改用 ${FALLBACK_SOURCE}：${entry.path.join(" / ")}`);
            }
        }
    }

    const limit = createLimiter(MAX_CONCURRENCY);
    const orphanReport = new Map();
    let totalRequests = 0;
    let totalEntries = 0;
    let totalUnique = 0;

    await Promise.all(
        target_language.map((lang) =>
            limit(async () => {
                const outputPath = path.join(languageDir, `${lang.value}.json`);
                const existing = load(lang.value);

                // 目标文件里有、但两个参考源都没有的 key —— 大概率是已废弃的残留。
                for (const { path: p } of collectEntries(existing)) {
                    if (!reference.has(pathId(p))) {
                        const id = pathId(p);
                        if (!orphanReport.has(id)) orphanReport.set(id, { path: p, langs: [] });
                        orphanReport.get(id).langs.push(lang.value);
                    }
                }

                // 只挑缺失项；已有译文不动，也不送给 AI。
                const missing = [];
                for (const entry of reference.values()) {
                    // 该语言就是这条的来源，本身即原文，跳过。
                    if (entry.sourceLang.value === lang.value) continue;
                    if (isTranslated(getByPath(existing, entry.path))) continue;
                    missing.push(entry);
                }

                if (missing.length === 0) {
                    console.log(`= ${lang.value} 已齐备（${reference.size} 条），跳过`);
                    return;
                }

                // 按源语言分组：prompt 要声明真实源语言，中英混合时需分开请求。
                // 组内再按原文去重：同一段文本（如 action 的 Tooltip 与 Name 常相同）
                // 只送一次给 AI，拿到译文后回填到所有引用它的路径。
                const groups = new Map();
                for (const entry of missing) {
                    const key = entry.sourceLang.value;
                    if (!groups.has(key)) groups.set(key, { lang: entry.sourceLang, units: new Map() });
                    const units = groups.get(key).units;
                    if (!units.has(entry.text)) units.set(entry.text, { text: entry.text, paths: [] });
                    units.get(entry.text).paths.push(entry.path);
                }
                const uniqueCount = [...groups.values()].reduce((n, g) => n + g.units.size, 0);
                const batches = [...groups.values()].reduce((n, g) => n + Math.ceil(g.units.size / BATCH_SIZE), 0);
                totalRequests += batches;
                totalEntries += missing.length;
                totalUnique += uniqueCount;

                const detail = [...groups.values()].map((g) => `${g.units.size} from ${g.lang.value}`).join(", ");
                const dedup = missing.length > uniqueCount ? `，去重省 ${missing.length - uniqueCount} 条` : "";
                console.log(`+ ${lang.name} (${lang.value})：缺 ${missing.length} 条 -> 待译 ${uniqueCount} 条（${detail}${dedup}），${batches} 个批次`);
                if (dryRun) {
                    for (const group of groups.values()) {
                        for (const unit of group.units.values()) {
                            const dup = unit.paths.length > 1 ? `  ×${unit.paths.length}` : "";
                            console.log(`    · ${unit.paths.map((p) => p.join(" / ")).join("  =  ")}${dup}`);
                        }
                    }
                    return;
                }

                const merged = existing;
                for (const group of groups.values()) {
                    const units = [...group.units.values()];
                    for (let k = 0; k < units.length; k += BATCH_SIZE) {
                        const batch = units.slice(k, k + BATCH_SIZE);
                        const translated = await translateBatch(
                            batch.map((u) => u.text),
                            lang.name,
                            group.lang.name,
                        );
                        // 一份译文回填到所有重复路径。
                        batch.forEach((unit, idx) => {
                            for (const p of unit.paths) setByPath(merged, p, translated[idx]);
                        });
                    }
                }
                writeJsonSync(outputPath, merged, { spaces: 2 });
                console.log(`✓ Updated ${outputPath}`);
            }),
        ),
    );

    if (orphanReport.size > 0) {
        console.warn(`\n! 以下 ${orphanReport.size} 个 key 在 ${PRIMARY_SOURCE} 和 ${FALLBACK_SOURCE} 中都不存在，可能是已废弃的残留条目：`);
        for (const { path: p, langs } of orphanReport.values()) {
            console.warn(`  · ${p.join(" / ")}    （出现在：${langs.join(", ")}）`);
        }
        console.warn("  已原样保留。确认无用后请手动删除。");
    }

    const saved = totalEntries - totalUnique;
    const summary = `缺失条目 ${totalEntries} 条，去重后实际待译 ${totalUnique} 条${saved > 0 ? `（省下 ${saved} 条）` : ""}，共 ${totalRequests} 个批次请求。`;
    console.log(dryRun ? `\nDry-run 完成：${summary}` : `\nTranslation completed! ${summary}`);
    return { referenceSize: reference.size, requests: totalRequests, entries: totalEntries, unique: totalUnique };
}

module.exports = { translateDirectory, buildReference, collectEntries, isTranslated, setOpenAIClient, target_language };

if (require.main === module) {
    const args = process.argv.slice(2);
    const dryRun = args.includes("--dry-run");
    const positional = args.filter((a) => !a.startsWith("--"));
    const dir = positional[0] || path.join(__dirname, "../language");
    translateDirectory(path.isAbsolute(dir) ? dir : path.join(__dirname, "../", dir), { dryRun }).catch((err) => {
        console.error(err.message);
        process.exit(1);
    });
}
