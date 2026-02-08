/**
 * V-Shell (Vertical Workspaces)
 * windowAttentionHandler.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2026
 * @license    GPL-3.0
 *
 */

'use strict';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import GObject from 'gi://GObject';

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
        // Avoid unnecessary re-connections
        if (!reset && this._customHandlerConnected)
            return;

        global.display.disconnectObject(Main.windowAttentionHandler);

        const handler = reset
            ? Main.windowAttentionHandler._onWindowDemandsAttention
            : WindowAttentionHandlerCommon._onWindowDemandsAttention;

        global.display.connectObject(
            'window-demands-attention', handler.bind(Main.windowAttentionHandler),
            'window-marked-urgent', handler.bind(Main.windowAttentionHandler),
            Main.windowAttentionHandler);

        this._customHandlerConnected = !reset;
    }
};

const WindowAttentionHandlerCommon = {
    _onWindowDemandsAttention(display, window) {
        if (!window || window.has_focus() || window.is_skip_taskbar())
            return;

        // Deny attention notifications if the App Grid is open, to avoid notification spree when opening a folder
        if (Main.overview._shown && Main.overview.dash.showAppsButton.checked) {
            return;
        } else if (!Main.overview._shown && opt.WINDOW_ATTENTION_FOCUS_IMMEDIATELY) {
            // Switch to workspace and activate window
            Main.activateWindow(window);
            return;
        // This is a backup solution when the dash module (which implements this directly to the app icon) is disabled
        } else if (!opt.get('dashModule') && opt.ACTIVATE_SETTINGS_WINDOW && window.wm_class === 'org.gnome.Settings') {
            const moveToWorkspace = opt.ACTIVATE_SETTINGS_WINDOW === 2;
            Me.Util.openPreferences({ wmClass: 'org.gnome.Settings', moveToWorkspace });
            return;
        }

        const app = this._tracker.get_window_app(window);

        let source = new WindowAttentionSource(app, window);
        if (Me.shellVersion < 46)
            source = new WindowAttentionSource45(app, window);

        Main.messageTray.add(source);

        let [title, body] = this._getTitleAndBanner(app, window);
        const args = Me.shellVersion >= 46
            ? [{ source, title, body, forFeedback: true }]
            : [source, title, body];

        const notification = new MessageTray.Notification(...args);

        notification.connect('activated', () => {
            source.open();
        });

        if (Me.shellVersion >= 46) {
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
                // Just push the notification to the message tray without showing notification
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


// The following class is here only because it's not exported in the upstream code

// GNOME 46+
const WindowAttentionSource = GObject.registerClass({
    // Registered name should be unique
    GTypeName: `WindowAttentionSource${Math.floor(Math.random() * 100000)}`,
}, class WindowAttentionSource extends MessageTray.Source {
    constructor(app, window) {
        super({
            title: app.get_name(),
            icon: app.get_icon(),
            policy: MessageTray.NotificationPolicy.newForApp(app),
        });

        this._window = window;
        this._window.connectObject(
            'notify::demands-attention', this._sync.bind(this),
            'notify::urgent', this._sync.bind(this),
            'focus', () => this.destroy(),
            'unmanaged', () => this.destroy(), this);
    }

    _sync() {
        if (this._window.demands_attention || this._window.urgent)
            return;
        this.destroy();
    }

    destroy(params) {
        this._window.disconnectObject(this);

        super.destroy(params);
    }

    open() {
        Main.activateWindow(this._window);
    }
});

// Only for GNOME 45
const WindowAttentionSource45 = GObject.registerClass({
    // Registered name should be unique
    GTypeName: `WindowAttentionSource${Math.floor(Math.random() * 100000)}`,
}, class WindowAttentionSource extends MessageTray.Source {
    _init(app, window) {
        this._window = window;
        this._app = app;

        super._init(app.get_name());

        this._window.connectObject(
            'notify::demands-attention', this._sync.bind(this),
            'notify::urgent', this._sync.bind(this),
            'focus', () => this.destroy(),
            'unmanaged', () => this.destroy(), this);
    }

    _sync() {
        if (this._window.demands_attention || this._window.urgent)
            return;
        this.destroy();
    }

    _createPolicy() {
        if (this._app && this._app.get_app_info()) {
            let id = this._app.get_id().replace(/\.desktop$/, '');
            return new MessageTray.NotificationApplicationPolicy(id);
        } else {
            return new MessageTray.NotificationGenericPolicy();
        }
    }

    createIcon(size) {
        return this._app.create_icon_texture(size);
    }

    destroy(params) {
        this._window.disconnectObject(this);

        super.destroy(params);
    }

    open() {
        Main.activateWindow(this._window);
    }
});
