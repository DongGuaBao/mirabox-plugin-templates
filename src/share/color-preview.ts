import type { Action1Settings } from "./action1.js";

export class ColorPreview {
    private width = 144;
    private height = 144;

    draw(settings: Action1Settings, event: StreamDockEvents.WillAppear | StreamDockEvents.DidReceiveSettings, craft: boolean) {
        const size = craft ? settings.ActionGeometry : event.payload;
        if (size?.width && size.width > 0) this.width = size.width;
        if (size?.height && size.height > 0) this.height = size.height;
        const color = previewColor(settings.color);
        const rgb = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16)).join(",");
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${this.height}"><rect width="100%" height="100%" fill="rgb(${rgb})"/></svg>`;
        return "data:image/svg+xml;base64," + btoa(svg);
    }
}

export function previewColor(value: string): string {
    return /^#[0-9a-f]{6}$/i.test(value) ? value : "#36a5e1";
}
