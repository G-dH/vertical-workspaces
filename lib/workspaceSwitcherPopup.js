/**
 * V-Shell (Vertical Workspaces)
 * workspacesSwitcherPopup.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2025
 * @license    GPL-3.0
 *
 */

'use strict';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as WorkspaceSwitcherPopup from 'resource:///org/gnome/shell/ui/workspaceSwitcherPopup.js';

const ANIMATION_TIME = 100;
const DISPLAY_TIMEOUT = 600;

let Me;
let opt;

export const WorkspaceSwitcherPopupModule = class {
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
        this.moduleEnabled = opt.get('workspaceSwitcherPopupModule');
        const conflict = Me.Util.getEnabledExtensions('workspace-switcher-manager').length ||
                         Me.Util.getEnabledExtensions('WsSwitcherPopupManager').length;
        if (conflict && !reset)
            console.warn(`[${Me.metadata.name}] Warning: "WorkspaceSwitcherPopup" module disabled due to potential conflict with another extension`);

        reset = reset || !this.moduleEnabled || conflict;

        // don't touch original code if module disabled
        if (reset && !this._firstActivation) {
            this._disableModule();
        } else if (!reset) {
            this._firstActivation = false;
            this._activateModule();
        }
        if (reset && this._firstActivation)
            console.debug('  WorkspaceSwitcherPopupModule - Keeping untouched');
    }

    _activateModule() {
        if (!this._overrides)
            this._overrides = new Me.Util.Overrides();

        this._overrides.addOverride(
            'WorkspaceSwitcherPopup',
            WorkspaceSwitcherPopup.WorkspaceSwitcherPopup.prototype,
            WorkspaceSwitcherPopupMod
        );
        console.debug('  WorkspaceSwitcherPopupModule - Activated');
    }

    _disableModule() {
        if (this._overrides)
            this._overrides.removeAll();
        this._overrides = null;

        console.debug('  WorkspaceSwitcherPopupModule - Disabled');
    }
};

const MonitorWorkspaceSwitcherPopup = GObject.registerClass({
    // Registered name should be unique
    GTypeName: `MonitorWorkspaceSwitcherPopup${Math.floor(Math.random() * 100000)}`,
}, class MonitorWorkspaceSwitcherPopup extends Clutter.Actor {
    constructor(monitorIndex) {
        super({
            offscreen_redirect: Clutter.OffscreenRedirect.ALWAYS,
            x_expand: false,
            y_expand: false,
        });
        this._monitorIndex = monitorIndex;

        this._list = new St.BoxLayout({
            style_class: 'workspace-switcher',
        });
        this.add_child(this._list);

        if (opt.ORIENTATION) { // 1-VERTICAL, 0-HORIZONTAL
            if (this._list.orientation !== undefined) // since GNOME 48
                this._list.orientation = opt.ORIENTATION;
            else
                this._list.vertical = true;
            this._list.add_style_class_name('ws-switcher-vertical');
        }
        this._list.set_style('margin: 0;');
    }

    redisplay(activeWorkspaceIndex) {
        if ((opt.WS_SW_POPUP_MODE === 2 || opt.WS_SWITCHER_CURRENT_MONITOR) &&
            this._monitorIndex !== global.display.get_current_monitor()
        )
            this.opacity = 0;
        else
            this.opacity = 255;


        const workspaceManager = global.workspace_manager;

        this._list.destroy_all_children();

        for (let i = 0; i < workspaceManager.n_workspaces; i++) {
            const indicator = new St.Bin({
                style_class: 'ws-switcher-indicator',
            });

            if (i === activeWorkspaceIndex)
                indicator.add_style_pseudo_class('active');

            this._list.add_child(indicator);
        }
        this._setPopupPosition();
    }

    _setPopupPosition() {
        let workArea;
        workArea = global.display.get_monitor_geometry(this._monitorIndex);

        let [, natHeight] = this.get_preferred_height(global.screen_width);
        let [, natWidth] = this.get_preferred_width(natHeight);
        let h = opt.WS_SW_POPUP_H_POSITION;
        let v = opt.WS_SW_POPUP_V_POSITION;
        this.x = workArea.x + Math.floor((workArea.width - natWidth) * h);
        this.y = workArea.y + Math.floor((workArea.height - natHeight) * v);
        this.set_position(this.x, this.y);
    }
});

const WorkspaceSwitcherPopupMod = {
    // GS 49 replaces _init() with constructor(), which is supported since ESM and GS 45
    // However, constructor() cannot be overridden and _init() is executed before constructor()
    _init() {
        // super();
        Clutter.Actor.prototype._init.bind(this)();

        this._timeoutId = 0;

        if (Me.shellVersion < 49) // Since GNOME 49 the child will be added to uiGroup in the constructor
            Main.uiGroup.add_child(this);

        this.hide();
        this._popups = [];

        if (Meta.prefs_get_workspaces_only_on_primary() || !opt.WS_SW_POPUP_MODE) {
            const popup = new MonitorWorkspaceSwitcherPopup(global.display.get_primary_monitor());
            this.add_child(popup);
            this._popups.push(popup);
        } else {
            const monitors = Main.layoutManager.monitors;
            monitors.forEach((_, index) => {
                const popup = new MonitorWorkspaceSwitcherPopup(index);
                this.add_child(popup);
                this._popups.push(popup);
            });
        }

        const workspaceManager = global.workspace_manager;
        workspaceManager.connectObject(
            'workspace-added', this._redisplayAllPopups.bind(this),
            'workspace-removed', this._redisplayAllPopups.bind(this), this);
        this.connect('destroy', this._onDestroy.bind(this));
    },

    _redisplayAllPopups() {
        for (const popup of this)
            popup.redisplay(this._activeWorkspaceIndex);
    },

    display(activeWorkspaceIndex) {
        // Remove unwanted popups created in the constructor() since GS 49
        if (this._popups) {
            this.get_children().forEach(p => {
                if (this._popups.indexOf(p) < 0)
                    p.destroy();
            });
        }

        this._activeWorkspaceIndex = activeWorkspaceIndex;

        if (this._timeoutId !== 0)
            GLib.source_remove(this._timeoutId);
        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, DISPLAY_TIMEOUT, this._onTimeout.bind(this));
        GLib.Source.set_name_by_id(this._timeoutId, '[gnome-shell] this._onTimeout');

        this.opacity = 0;
        if (opt.WS_SW_POPUP_MODE) {
            const duration = this.visible ? 0 : ANIMATION_TIME;
            this.show();
            this.ease({
                opacity: 255,
                duration,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }

        this._redisplayAllPopups();
    },

    _onTimeout() {
        GLib.source_remove(this._timeoutId);
        this._timeoutId = 0;
        this.ease({
            opacity: 0.0,
            duration: ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => this.destroy(),
        });
        return GLib.SOURCE_REMOVE;
    },

    _onDestroy() {
        if (this._timeoutId)
            GLib.source_remove(this._timeoutId);
        this._timeoutId = 0;
    },
};
