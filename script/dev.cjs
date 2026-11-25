const path = require("path");
const fs = require("fs");
const { resolveTarget, HOSTS } = require("./target.cjs");

// 构建目标：默认 StreamDock，传 -craft 构建 Craft。
const { host, manifest, pluginName: PluginName, pluginPath: PluginPath } = resolveTarget(process.argv);
console.log(`开始执行自动化构建... 目标宿主: ${host}（${HOSTS[host].suffix}）`);

try {
    fs.mkdirSync(path.join(PluginPath, "plugin"), { recursive: true });
} catch {}

try {
    fs.writeFileSync(path.join(PluginPath, "manifest.json"), JSON.stringify(manifest, null, 2), { encoding: "utf-8" });
    fs.cpSync(path.resolve(__dirname, "../build/vite_build"), path.join(PluginPath), { recursive: true });
    const content = `import { spawnSync, execSync } from 'node:child_process';
try {
  console.log('编译 TypeScript 文件...');
  execSync('npx tsc --project tsconfig.ncc.json', {
    stdio: 'inherit',
    cwd:"${process.cwd().replaceAll("\\", "\\\\")}"
  });
} catch (err) {
  console.error('TypeScript 编译失败:', err);
  process.exit(1);
}
const target = '${path.resolve(__dirname, "../build/tsc_build/node/index.js").replaceAll("\\", "\\\\")}';
const args = [
  target,
  ...process.argv.slice(2),
  "-dev"
];
const ret = spawnSync("node.exe", args, { stdio: 'inherit', windowsHide: true,cwd:"${process.cwd().replaceAll("\\", "\\\\")}" });
process.exit(ret.status ?? 1);`;
    fs.writeFileSync(path.join(PluginPath, "plugin", "index.js"), content, {
        encoding: "utf8",
        flag: "w",
    });
    fs.writeFileSync(path.join(PluginPath, "plugin", "package.json"), `{"type": "module"}`, {
        encoding: "utf8",
        flag: "w",
    });
    console.log(`插件 "${PluginName}" 已成功复制到 "${PluginPath}"`);
    console.log("构建成功-------------");
} catch (err) {
    console.error(`复制出错 "${PluginName}":`, err);
}
