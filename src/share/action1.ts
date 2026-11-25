import type { ActionSettings } from "mirabox-plugin-sdk/types";

export type Action1Settings = ActionSettings & {
    template: string;
    note: string;
    enabled: boolean;
    interval: number;
    mode: string;
    showTips: boolean;
    volume: number;
    color: string;
    filePath: string;
    x: number;
    y: number;
};
