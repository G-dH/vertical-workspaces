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

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as WorkspaceSwitcherPopup from 'resource:///org/gnome/shell/ui/workspaceSwitcherPopup.js';

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

        this._overrides.addOverride('WorkspaceSwitcherPopup', WorkspaceSwitcherPopup.WorkspaceSwitcherPopup.prototype, WorkspaceSwitcherPopupCommon);
        console.debug('  WorkspaceSwitcherPopupModule - Activated');
    }

    _disableModule() {
        if (this._overrides)
            this._overrides.removeAll();
        this._overrides = null;

        console.debug('  WorkspaceSwitcherPopupModule - Disabled');
    }
};

const WorkspaceSwitcherPopupCommon = {
    // injection to _init()
    after__init() {
        if (opt.ORIENTATION) { // 1-VERTICAL, 0-HORIZONTAL
            if (this._list.orientation !== undefined) // since GNOME 48
                this._list.orientation = opt.ORIENTATION;
            else
                this._list.vertical = true;
            this._list.add_style_class_name('ws-switcher-vertical');
        }
        this._list.set_style('margin: 0;');
        if (this.get_constraints()[0])
            this.remove_constraint(this.get_constraints()[0]);
    },

    // injection to display()
    after_display() {
        if (opt.WS_SW_POPUP_MODE)
            this._setPopupPosition();
        else
            this.opacity = 0;
    },

    _setPopupPosition() {
        let workArea;
        if (opt.WS_SW_POPUP_MODE === 1)
            workArea = global.display.get_monitor_geometry(Main.layoutManager.primaryIndex);
        else
            workArea = global.display.get_monitor_geometry(global.display.get_current_monitor());

        let [, natHeight] = this.get_preferred_height(global.screen_width);
        let [, natWidth] = this.get_preferred_width(natHeight);
        let h = opt.WS_SW_POPUP_H_POSITION;
        let v = opt.WS_SW_POPUP_V_POSITION;
        this.x = workArea.x + Math.floor((workArea.width - natWidth) * h);
        this.y = workArea.y + Math.floor((workArea.height - natHeight) * v);
        this.set_position(this.x, this.y);
    },
};
