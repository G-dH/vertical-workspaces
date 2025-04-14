/**
 * V-Shell (Vertical Workspaces)
 * windowAttentionHandler.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2025
 * @license    GPL-3.0
 *
 */

'use strict';

import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

const shellVersion46 = !Clutter.Container;

let Me;
let opt;

export const WindowAttentionHandlerModule = class {
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
                // Switch to workspace and activate window
                Main.activateWindow(window);
            // Ensure the window is focused, especially targets Settings panel launchers
            window.activate(global.get_current_time());
            return;
        }

        const app = this._tracker.get_window_app(window);
        let args;
        if (shellVersion46)
            args = { title: app.get_name() };
        else
            args = app.get_name();

        const source = new MessageTray.Source(args);
        new Me.Util.Overrides().addOverride('MessageSource', source, WindowAttentionSourceCommon);
        source._init(app, window);
        Main.messageTray.add(source);

        let [title, body] = this._getTitleAndBanner(app, window);
        args = shellVersion46
            ? [{ source, title, body, forFeedback: true }]
            : [source, title, body];

        const notification = new MessageTray.Notification(...args);
        if (!shellVersion46)
            notification.setForFeedback(true);

        notification.connect('activated', () => {
            source.open();
        });

        if (shellVersion46) {
            notification.acknowledged = opt.WINDOW_ATTENTION_DISABLE_NOTIFICATIONS;
            source.addNotification(notification);
            if (opt.WINDOW_ATTENTION_DISABLE_NOTIFICATIONS) {
                // just push the notification to the message tray without showing notification
                notification.acknowledged = true;
                Main.messageTray._notificationQueue.push(notification);
                Main.panel.statusArea.dateMenu._indicator.show();
            }
            window.connectObject('notify::title', () => {
                [title, body] = this._getTitleAndBanner(app, window);
                notification.set({ title, body });
            }, source);
        } else {
            if (opt.WINDOW_ATTENTION_DISABLE_NOTIFICATIONS)
                // just push the notification to the message tray without showing notification
                source.pushNotification(notification);
            else
                source.showNotification(notification);

            window.connectObject('notify::title', () => {
                [title, body] = this._getTitleAndBanner(app, window);
                notification.update(title, body);
            }, source);
        }
    },
};

const WindowAttentionSourceCommon = {
    _init(app, window) {
        this._window = window;
        this._app = app;

        this._window.connectObject(
            'notify::demands-attention', this._sync.bind(this),
            'notify::urgent', this._sync.bind(this),
            'focus', () => this.destroy(),
            'unmanaged', () => this.destroy(), this);
    },

    _sync() {
        if (this._window.demands_attention || this._window.urgent)
            return;
        this.destroy();
    },

    _createPolicy() {
        if (this._app && this._app.get_app_info()) {
            let id = this._app.get_id().replace(/\.desktop$/, '');
            return new MessageTray.NotificationApplicationPolicy(id);
        } else {
            return new MessageTray.NotificationGenericPolicy();
        }
    },

    createIcon(size) {
        return this._app.create_icon_texture(size);
    },

    destroy(params) {
        this._window.disconnectObject(this);

        MessageTray.Source.prototype.destroy.bind(this)(params);
    },

    open() {
        Main.activateWindow(this._window);
    },
};
