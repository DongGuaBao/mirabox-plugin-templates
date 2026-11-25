import { Action, Plugin } from "mirabox-plugin-sdk/web";
import type { Action1Settings } from "../../share/action1.js";
import { ColorPreview, previewColor } from "../../share/color-preview.js";

const plugin = Plugin.getInstance();

class ColorAction extends Action {
    declare settings: Action1Settings;
    private preview = new ColorPreview();

    willAppear(data: StreamDockEvents.WillAppear) {
        this.setImage(this.preview.draw(this.settings, data, plugin.isCraft));
    }

    didReceiveSettings(data: StreamDockEvents.DidReceiveSettings) {
        this.setImage(this.preview.draw(this.settings, data, plugin.isCraft));
    }

    getColor() {
        return previewColor(this.settings.color);
    }
}

plugin.regActionClass("action1", ColorAction);
