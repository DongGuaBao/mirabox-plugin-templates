const path = require("path");
const os = require("os");
const fs = require("fs");

/** 宿主差异只有两处：插件目录后缀，以及上位机的 plugins 安装目录。 */
const HOSTS = {
    streamdock: { suffix: ".sdPlugin", dirName: "StreamDock" },
    craft: { suffix: ".mPanelPlugin", dirName: "MiraBox Craft" },
};

/** 从命令行参数解析目标宿主，默认 streamdock。 */
function resolveHost(argv = process.argv) {
    const wantCraft = argv.some((a) => a === "-craft" || a === "--craft");
    const wantStreamDock = argv.some((a) => a === "-streamdock" || a === "--streamdock");
    if (wantCraft && wantStreamDock) {
        throw new Error("不能同时指定 -streamdock 和 -craft，请分两次构建");
    }
    return wantCraft ? "craft" : "streamdock";
}

/** 由 manifest 推导插件目录名（带宿主对应后缀）。 */
function resolvePluginName(manifest, host) {
    const { suffix } = HOSTS[host];
    if (manifest["Actions"] && manifest["Actions"].length > 0) {
        const uuid = manifest["Actions"][0]["UUID"];
        return `${uuid.substring(0, uuid.lastIndexOf("."))}${suffix}`;
    }
    if (manifest["Name"].includes("com")) {
        return `${manifest["Name"]}${suffix}`;
    }
    return `com.mirabox.streamdock.${manifest["Name"]}${suffix}`;
}

/** 上位机 plugins 安装目录下的插件完整路径。 */
function resolvePluginPath(pluginName, host) {
    const { dirName } = HOSTS[host];
    if (os.type() === "Windows_NT") {
        return path.join(os.homedir(), "Appdata/Roaming/HotSpot", dirName, "plugins", pluginName);
    }
    if (os.type() === "Darwin") {
        return path.join(os.homedir(), "Library/Application Support/HotSpot", dirName, "plugins", pluginName);
    }
    throw new Error(`不支持的操作系统: ${os.type()}`);
}

function getDateYYMMDD() {
    const formatter = new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "2-digit",
        month: "2-digit",
        day: "2-digit",
    });
    const parts = formatter.formatToParts(new Date());
    const year = parts.find((p) => p.type === "year").value;
    const month = parts.find((p) => p.type === "month").value;
    const day = parts.find((p) => p.type === "day").value;
    return `${year}${month}${day}`;
}

/**
 * 打包给 Craft 时，每个 action 的 Settings 都必须声明 ActionGeometry —— 它决定动作
 * 从列表拖到副屏画布上时的默认尺寸。漏写会导致该动作尺寸不可预期，所以在构建期
 * 直接拦下。StreamDock 忽略该字段，因此只在 craft 目标校验。
 */
function assertCraftGeometry(manifest) {
    const actions = manifest["Actions"] || [];
    const bad = [];
    for (const action of actions) {
        const geometry = action["Settings"] && action["Settings"]["ActionGeometry"];
        const width = Number(geometry && geometry.width);
        const height = Number(geometry && geometry.height);
        if (!geometry) bad.push(`${action["UUID"]}：缺少 Settings.ActionGeometry`);
        else if (!(width > 0) || !(height > 0)) {
            bad.push(`${action["UUID"]}：ActionGeometry 的 width/height 必须为正数，当前 ${JSON.stringify(geometry)}`);
        }
    }
    if (bad.length > 0) {
        throw new Error(
            "打包 Craft 需要每个 action 都声明 ActionGeometry（拖出时的默认尺寸）：\n" +
                bad.map((m) => `  - ${m}`).join("\n") +
                '\n请在对应 action 的 Settings 中补充，例如：\n  "Settings": { "ActionGeometry": { "width": 462, "height": 462 } }'
        );
    }
}

/**
 * 一次性解析出构建目标：宿主、manifest（Version 已展开 auto）、插件名与安装路径。
 * 同一份源码构建到不同宿主时，运行期差异由 SDK 的 `isCraft` / `isStreamDock` 处理，
 * 构建期差异仅此模块负责。
 */
function resolveTarget(argv = process.argv, root = path.resolve(__dirname, "../")) {
    const host = resolveHost(argv);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf-8"));
    manifest["Version"] = manifest["Version"].replaceAll("auto", getDateYYMMDD());
    if (host === "craft") {
        assertCraftGeometry(manifest);
        manifest.SDKVersion = 1;
        for (const action of manifest.Actions) action.Controllers = ["SecondaryScreen"];
    }
    const pluginName = resolvePluginName(manifest, host);
    return { host, manifest, pluginName, pluginPath: resolvePluginPath(pluginName, host) };
}

module.exports = { HOSTS, resolveHost, resolvePluginName, resolvePluginPath, getDateYYMMDD, assertCraftGeometry, resolveTarget };
