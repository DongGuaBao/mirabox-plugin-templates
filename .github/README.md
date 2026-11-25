# mirabox-plugin-templates

从仓库页面选择 **Use this template → Create a new repository**，克隆生成的项目，在项目根目录安装依赖并选择宿主构建。

```sh
npm ci
npm run build
```

`npm run build` 构建并安装到当前用户的 StreamDock 插件目录。为 MiraBox Craft 构建时运行 `npm run build:craft`。构建及安装脚本支持 Windows 和 macOS。

模板内置 SDK 2.2.2。默认示例在按键或副屏上显示所选颜色，修改属性后会重新绘制。Node 后端入口位于 `src/node/index.ts`，属性页位于 `src/web/front/action1.vue`。创建自己的插件时，更新 `manifest.json` 中的插件信息，并保持 Action UUID 的末段与注册名一致。

- [MiraBox 插件 SDK](https://github.com/DongGuaBao/mirabox-plugin-sdk)
- [Codex 开发 Skill](https://github.com/DongGuaBao/mirabox-plugin-builder)
