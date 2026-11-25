const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const { resolveTarget, HOSTS } = require("./target.cjs");
const ROOT = path.resolve(__dirname, "../");

// 构建目标：默认 StreamDock，传 -craft 构建 Craft。
const { host, manifest, pluginName: PluginName, pluginPath: PluginPath } = resolveTarget(process.argv, ROOT);
console.log(`开始执行自动化构建... 目标宿主: ${host}（${HOSTS[host].suffix}）`);

// 构建目标开关：-web / -node / -native。宿主开关（-craft 等）不参与这里的判断，
// 否则 `build -craft` 会被误判为「只构建指定目标」而什么都不构建。
const TARGET_FLAGS = ["-web", "-node", "-native"];
const hasTargetFlag = process.argv.some((ele) => TARGET_FLAGS.includes(ele));
let buildWeb = false;
let buildNode = false;
let buildNative = false;
if (!hasTargetFlag) {
    buildWeb = true;
    buildNode = true;
    buildNative = false;
}
if (process.argv.some((ele) => ele == "-web")) {
    buildWeb = true;
}
if (process.argv.some((ele) => ele == "-node")) {
    buildNode = true;
}
if (process.argv.some((ele) => ele == "-native")) {
    buildNative = true;
}
try {
    fs.rmSync(path.resolve(__dirname, "../build"), { recursive: true });
} catch {}

const SRC_FILE = path.join(ROOT, "./src/node/index.ts");
if (!fs.existsSync(SRC_FILE)) {
    buildNode = false;
}
if (!fs.existsSync(path.join(__dirname, "../src/native"))) {
    buildNative = false;
}
if (buildWeb) execSync("npx vite build", { stdio: "inherit" });
if (buildNode) {
    execSync(`tsc -p "${path.join(ROOT, "./tsconfig.ncc.json")}"`, { stdio: "inherit" });
    execSync(`ncc build --no-cache -m "${path.join(ROOT, "./build/tsc_build/node/index.js")}" -o "${path.join(ROOT, "./build/ncc_build")}"`, { stdio: "inherit" });
}
if (buildNative) {
    let nativeModules = [];
    const items = fs.readdirSync(path.join(__dirname, "../src/native"), {
        withFileTypes: true,
    });
    items.forEach((item) => {
        if (item.isDirectory() && item.name !== "shared") {
            nativeModules.push(item.name);
        }
    });
    for (const module of nativeModules) {
        try {
            execSync("node-gyp configure build", {
                cwd: path.join(__dirname, "../src/native", module),
                stdio: "inherit",
            });
            console.log(`✓ ${module} built successfully`);
        } catch (error) {
            throw new Error(`Failed to build ${module}`, { cause: error });
        }
    }
}

try {
    fs.mkdirSync(path.join(PluginPath, "plugin"), { recursive: true });
} catch {}

try {
    fs.writeFileSync(path.join(PluginPath, "manifest.json"), JSON.stringify(manifest, null, 2), { encoding: "utf-8" });

    if (buildWeb) fs.cpSync(path.resolve(__dirname, "../build/vite_build"), PluginPath, { recursive: true });
    if (buildNode) fs.cpSync(path.resolve(__dirname, "../build/ncc_build"), path.join(PluginPath, "plugin"), { recursive: true });
    if (fs.existsSync(path.join(__dirname, "../src/native"))) {
        let nativeModules = [];
        let sourcePath = path.join(__dirname, "../src/native");
        let targetPath = path.join(PluginPath, "plugin");
        const items = fs.readdirSync(sourcePath, { withFileTypes: true });
        items.forEach((item) => {
            if (item.isDirectory()) {
                nativeModules.push(item.name);
            }
        });
        for (const module of nativeModules) {
            if (module == "shared") continue;
            console.log(path.join(sourcePath, module, "build/Release"));
            console.log(path.join(targetPath, "build/Release"));
            fs.cpSync(path.join(sourcePath, module, "build/Release"), path.join(targetPath, "build/Release"), {
                recursive: true,
                filter: (src) => {
                    return src.endsWith(".node") || src.endsWith("Release");
                },
            });
        }
    }
    const tempPath = path.resolve(__dirname, "../language");
    if (fs.existsSync(tempPath)) fs.cpSync(tempPath, PluginPath, { recursive: true });
    console.log(`插件 "${PluginName}" 已成功复制到 "${PluginPath}"`);
    console.log("构建成功-------------");
} catch (err) {
    console.error(`复制出错 "${PluginName}":`, err);
    process.exitCode = 1;
}
