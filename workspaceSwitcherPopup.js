/**
 * V-Shell (Vertical Workspaces)
 * workspacesSwitcherPopup.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2023
 * @license    GPL-3.0
 *
 */

'use strict';

const Main = imports.ui.main;
const WorkspaceSwitcherPopup = imports.ui.workspaceSwitcherPopup;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const _Util = Me.imports.util;
let _overrides;

let opt;

function update(reset = false) {
    if (_overrides)
        _overrides.removeAll();


    if (reset) {
        _overrides = null;
        opt = null;
        return;
    }

    opt = Me.imports.settings.opt;

    _overrides = new _Util.Overrides();

    const enabled = global.settings.get_strv('enabled-extensions');
    const allowWsPopupInjection = !(enabled.includes('workspace-switcher-manager@G-dH.github.com') || enabled.includes('WsSwitcherPopupManager@G-dH.github.com-dev'));
    if (allowWsPopupInjection) { // 1-VERTICAL, 0-HORIZONTAL
        _overrides.addOverride('WorkspaceSwitcherPopup', WorkspaceSwitcherPopup.WorkspaceSwitcherPopup.prototype, WorkspaceSwitcherPopupOverride);
    }
}

const WorkspaceSwitcherPopupOverride = {
    // injection to _init()
    after__init() {
        if (opt.ORIENTATION) { // 1-VERTICAL, 0-HORIZONTAL
            this._list.vertical = true;
        }
        this._list.set_style('margin: 0;');
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
        if (opt.WS_SW_POPUP_MODE === 1) {
            // workArea = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);*/
            workArea = global.display.get_monitor_geometry(Main.layoutManager.primaryIndex);
        } else {
            // workArea = Main.layoutManager.getWorkAreaForMonitor(global.display.get_current_monitor());
            workArea = global.display.get_monitor_geometry(global.display.get_current_monitor());
        }

        let [, natHeight] = this.get_preferred_height(global.screen_width);
        let [, natWidth] = this.get_preferred_width(natHeight);
        let h = opt.WS_SW_POPUP_H_POSITION;
        let v = opt.WS_SW_POPUP_V_POSITION;
        this.x = workArea.x + Math.floor((workArea.width - natWidth) * h);
        this.y = workArea.y + Math.floor((workArea.height - natHeight) * v);
        this.set_position(this.x, this.y);
    },
};
