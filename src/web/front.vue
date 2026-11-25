<!-- 请勿修改此文件 -->
<script setup lang="ts">
    import { defineAsyncComponent, Component } from "vue";
    import { Property } from "mirabox-plugin-sdk/property";
    const modules = import.meta.glob<{ default: Component }>("./front/*.vue");
    function loadComponent(name: string) {
        const path = `./front/${name}.vue`;
        const importer = modules[path];
        if (!importer) {
            throw new Error(`Component ${name} not found`);
        }
        return defineAsyncComponent(async () => {
            const module = await importer();
            return module.default;
        });
    }
    const PropertyInspector = loadComponent(Property.getCurrentActionName());
</script>

<template>
    <PropertyInspector></PropertyInspector>
</template>

<style>
    * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
    }
    html,
    body {
        height: 100vh;
        width: 100vw;
        color: #e6e6e6;
        overflow: hidden;
        user-select: none;
        background-color: rgba(0, 0, 0, 0) !important;
    }
</style>
