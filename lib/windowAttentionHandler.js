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

let Gi;
let Ui;
let Misc;
let Me;

let opt;

export var WindowAttentionHandlerModule = class {
    constructor(gi, ui, misc, me) {
        Gi = gi;
        Ui = ui;
        Misc = misc;
        Me = me;

        opt = Me.Opt;
        this._firstActivation = true;
        this._moduleEnabled = false;
        this._overrides = null;
    }

    _clearGlobals() {
        Gi = null;
        Ui = null;
        Misc = null;
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
        this._clearGlobals();
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
        //const source = new Ui.WindowAttentionHandler.WindowAttentionSource(app, window);
        const source = new Ui.MessageTray.Source(app.get_name());
        new Me.Util.Overrides().addOverride('MessageSource', source, WindowAttentionSourceCommon);
        source._init(app, window);
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
            return new Ui.MessageTray.NotificationApplicationPolicy(id);
        } else {
            return new Ui.MessageTray.NotificationGenericPolicy();
        }
    },

    createIcon(size) {
        return this._app.create_icon_texture(size);
    },

    destroy(params) {
        this._window.disconnectObject(this);

        Ui.MessageTray.Source.prototype.destroy.bind(this)(params);
    },

    open() {
        Ui.Main.activateWindow(this._window);
    }
};
