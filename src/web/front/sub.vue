<script setup lang="ts">
    // 仅StreamDock支持子窗口
    import { Property } from "mirabox-plugin-sdk/property";
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
    const i18n = Property.getI18n();
    const property = Property.getReactiveInstance();
    // 在property上挂载任意函数或数据,给主窗口调用
    property.test1 = () => {
        console.log("test");
    };
    property.mainmessage = "子窗口已启动";
</script>

<template>
    <MiPanel>
        <MiSection>
            <MiHint>{{ i18n["模板文本"] }}</MiHint>
            <MiHint>{{ property.submessage }}</MiHint>
            <!-- 子窗口父窗口数据同步的 -->
            <MiTextInput v-model="property.settings.template" />
            <!-- property上任何数据都支持Vue响应式 -->
            <MiTextInput v-model="property.mainmessage" />
            <MiHint>子窗口获取当前窗口Id:{{ property.currentSubWindowId }}</MiHint>
            <MiButton @click="property.closeSubWindow(property.currentSubWindowId)">关闭任意子窗口,这里只关闭自己</MiButton>
            <MiButton @click="property.sendToPlugin({ test: 'test msg' })">发送Json消息给后端</MiButton>
        </MiSection>
    </MiPanel>
</template>

<style scoped></style>
