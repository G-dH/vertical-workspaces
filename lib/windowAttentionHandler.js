/**
 * V-Shell (Vertical Workspaces)
 * windowAttentionHandler.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2024
 * @license    GPL-3.0
 *
 */

'use strict';

const Main = imports.ui.main;
const MessageTray = imports.ui.messageTray;
const WindowAttentionHandler = imports.ui.windowAttentionHandler;

let Me;
let opt;

var WindowAttentionHandlerModule = class {
    constructor(me) {
        Me = me;
        opt = Me.opt;

        this._firstActivation = true;
        this.moduleEnabled = false;
        this._overrides = null;
    }

    cleanGlobals() {
        Me = null;
        opt = null;
    }

    update(reset) {
        this.moduleEnabled = opt.get('windowAttentionHandlerModule');
        const conflict = false;

        reset = reset || !this.moduleEnabled || conflict;

        // don't touch the original code if module disabled
        if (reset && !this._firstActivation) {
            this._disableModule();
        } else if (!reset) {
            this._firstActivation = false;
            this._activateModule();
        }
        if (reset && this._firstActivation)
            console.debug('  WindowAttentionHandlerModule - Keeping untouched');
    }

    _activateModule() {
        this._updateConnections();
        console.debug('  WindowAttentionHandlerModule - Activated');
    }

    _disableModule() {
        const reset = true;
        this._updateConnections(reset);

        console.debug('  WindowAttentionHandlerModule - Disabled');
    }

    _updateConnections(reset) {
        global.display.disconnectObject(Main.windowAttentionHandler);

        const handlerFnc = reset
            ? Main.windowAttentionHandler._onWindowDemandsAttention
            : WindowAttentionHandlerCommon._onWindowDemandsAttention;

        global.display.connectObject(
            'window-demands-attention', handlerFnc.bind(Main.windowAttentionHandler),
            'window-marked-urgent', handlerFnc.bind(Main.windowAttentionHandler),
            Main.windowAttentionHandler);
    }
};

const WindowAttentionHandlerCommon = {
    _onWindowDemandsAttention(display, window) {
        // Deny attention notifications if the App Grid is open, to avoid notification spree when opening a folder
        if (Main.overview._shown && Main.overview.dash.showAppsButton.checked) {
            return;
        } else if (opt.WINDOW_ATTENTION_FOCUS_IMMEDIATELY) {
            if (!Main.overview._shown)
                Main.activateWindow(window);
            return;
        }

        const app = this._tracker.get_window_app(window);
        const source = new WindowAttentionHandler.WindowAttentionSource(app, window);
        Main.messageTray.add(source);

        let [title, banner] = this._getTitleAndBanner(app, window);

        const notification = new MessageTray.Notification(source, title, banner);
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
