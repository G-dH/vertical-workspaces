/**
 * V-Shell (Vertical Workspaces)
 * windowAttentionHandler.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2023
 * @license    GPL-3.0
 *
 */

'use strict';

let Ui;
let Me;

let opt;

var WindowAttentionHandlerModule = class {
    constructor(gi, ui, misc, me) {
        Ui = ui;
        Me = me;

        opt = Me.opt;
        this._firstActivation = true;
        this._moduleEnabled = false;
        this._overrides = null;
    }

    cleanGlobals() {
        Ui = null;
        Me = null;
        opt = null;
    }

    update(reset) {
        this._moduleEnabled = opt.get('windowAttentionHandlerModule');
        const conflict = false;

        reset = reset || !this._moduleEnabled || conflict;

        // don't touch the original code if module disabled
        if (reset && !this._firstActivation) {
            this._disableModule();
        } else if (!reset) {
            this._firstActivation = false;
            this._activateModule();
        }
    }

    _activateModule() {
        this._updateConnections();
    }

    _disableModule() {
        const reset = true;
        this._updateConnections(reset);

    }

    _updateConnections(reset) {
        global.display.disconnectObject(Ui.Main.windowAttentionHandler);

        const handlerFnc = reset
            ? Ui.Main.windowAttentionHandler._onWindowDemandsAttention
            : WindowAttentionHandlerCommon._onWindowDemandsAttention;

        global.display.connectObject(
            'window-demands-attention', handlerFnc.bind(Ui.Main.windowAttentionHandler),
            'window-marked-urgent', handlerFnc.bind(Ui.Main.windowAttentionHandler),
            Ui.Main.windowAttentionHandler);
    }
};

const WindowAttentionHandlerCommon = {
    _onWindowDemandsAttention(display, window) {
        // Deny attention notifications if the App Grid is open, to avoid notification spree when opening a folder
        if (Ui.Main.overview._shown && Ui.Main.overview.dash.showAppsButton.checked) {
            return;
        } else if (opt.WINDOW_ATTENTION_FOCUS_IMMEDIATELY) {
            if (!Ui.Main.overview._shown)
                Ui.Main.activateWindow(window);
            return;
        }

        const app = this._tracker.get_window_app(window);
        const source = new Ui.WindowAttentionHandler.WindowAttentionSource(app, window);
        Ui.Main.messageTray.add(source);

        let [title, banner] = this._getTitleAndBanner(app, window);

        const notification = new Ui.MessageTray.Notification(source, title, banner);
        notification.connect('activated', () => {
            source.open();
        });
        notification.setForFeedback(true);

        if (opt.WINDOW_ATTENTION_DISABLE_NOTIFICATIONS)
            // just push the notification to the message tray without showing notification
            source.pushNotification(notification);
        else
            source.showNotification(notification);

        window.connectObject('notify::title', () => {
            [title, banner] = this._getTitleAndBanner(app, window);
            notification.update(title, banner);
        }, source);
    },
};
