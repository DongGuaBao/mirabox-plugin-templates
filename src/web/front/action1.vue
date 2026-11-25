<script setup lang="ts">
    import { Property, useToast, copyText } from "mirabox-plugin-sdk/property";
    import {
        MiPanel,
        MiSection,
        MiGrid,
        MiField,
        MiTextInput,
        MiTextarea,
        MiNumberInput,
        MiSelect,
        MiSlider,
        MiColorInput,
        MiCheckbox,
        MiSwitch,
        MiCoordinate,
        MiPathPicker,
        MiButton,
        MiButtonGroup,
        MiHint,
        MiToastHost,
    } from "mirabox-plugin-sdk/ui";
    import type { Action1Settings } from "../../share/action1";
    const i18n = Property.getI18n();

    const property = Property.getReactiveInstance<Action1Settings>();
    const toast = useToast();
    property.willAppear = function (data: StreamDockEvents.DidReceiveSettings) {
        // websocket 建立且初始化完成触发事件，在这里做依赖 settings / RPC 的初始化
        console.log(data.payload.settings);
    };
    property.didReceiveSettings = function (data: StreamDockEvents.DidReceiveSettings) {
        // Action 级 Settings 变更时触发
        console.log(data.payload.settings);
    };
    property.didReceiveGlobalSettings = function (data: StreamDockEvents.DidReceiveGlobalSettings) {
        // 插件级 Settings 变更时触发
        console.log(data.payload.settings);
    };

    // 在 property 上挂载任意函数或数据，给子窗口调用
    property.test = () => console.log("test");
    property.mainmessage = "子窗口未启动";

    // rpc 调用后端函数（仅 nodejs 与 web 后端支持），并获取返回值
    async function rpcTest() {
        const plugin = property.getPluginProxy<{ getColor(): string }>(1000);
        try {
            const color = await plugin.getColor();
            toast.success(i18n["RPC 调用成功"] + " · " + color);
        } catch (error) {
            console.error("RPC 调用失败或超时", error);
            toast.error(i18n["RPC 调用失败"]);
        }
    }

    async function copySettings() {
        const ok = await copyText(JSON.stringify(property.settings, null, 2));
        ok ? toast.success(i18n["已复制"]) : toast.error(i18n["复制失败"]);
    }
</script>

<template>
    <MiPanel>
        <MiSection :title="i18n['文本输入']">
            <MiField :label="i18n['单行文本']" :hint="i18n['绑定即自动持久化']">
                <MiTextInput v-model="property.settings.template" :placeholder="i18n['请输入']" />
            </MiField>
            <MiField :label="i18n['多行文本']">
                <MiTextarea v-model="property.settings.note" :rows="3" :maxlength="500" />
            </MiField>
        </MiSection>

        <MiSection :title="i18n['数值与选择']">
            <MiGrid :columns="2">
                <MiField :label="i18n['间隔']"><MiNumberInput v-model="property.settings.interval" :min="1" :max="3600" suffix="s" /></MiField>
                <MiField :label="i18n['模式']"><MiSelect v-model="property.settings.mode" :options="['auto', 'manual']" /></MiField>
            </MiGrid>
            <MiField :label="i18n['音量']"><MiSlider v-model="property.settings.volume" :min="0" :max="100" suffix="%" /></MiField>
            <MiField :label="i18n['文字颜色']"><MiColorInput v-model="property.settings.color" /></MiField>
        </MiSection>

        <MiSection :title="i18n['开关']">
            <MiSwitch v-model="property.settings.enabled" :label="i18n['启用功能']" />
            <MiCheckbox v-model="property.settings.showTips" :label="i18n['显示提示']" />
        </MiSection>

        <MiSection :title="i18n['坐标与路径']">
            <MiField :label="i18n['坐标']" :hint="i18n['Craft 下可用方向键微调']">
                <MiCoordinate />
            </MiField>
            <MiField :label="i18n['文件']">
                <MiPathPicker v-model="property.settings.filePath" accept="image/*" :button-text="i18n['选择文件']" :empty-text="i18n['未选择文件']" />
            </MiField>
        </MiSection>

        <MiSection :title="i18n['操作']">
            <MiButtonGroup>
                <!-- 子窗口仅 StreamDock 支持，Craft 宿主没有这个能力 -->
                <template v-if="property.isStreamDock">
                    <MiButton @click="property.openSubWindows('sub', 600, 600)">{{ i18n["打开子窗口"] }}</MiButton>
                    <MiButton variant="ghost" @click="property.closeSubWindowsByName('sub')">{{ i18n["关闭子窗口"] }}</MiButton>
                </template>
                <MiButton @click="property.sendToPlugin({ test: 'test msg' })">{{ i18n["发送消息"] }}</MiButton>
                <MiButton variant="primary" @click="rpcTest">{{ i18n["RPC 调用"] }}</MiButton>
                <MiButton @click="copySettings">{{ i18n["复制配置"] }}</MiButton>
            </MiButtonGroup>
            <MiHint>{{ property.mainmessage }}</MiHint>
        </MiSection>

        <MiToastHost />
    </MiPanel>
</template>
