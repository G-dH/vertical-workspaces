/**
 * Vertical Workspaces
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
var _activateSearchProvider;

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

    if (opt.ORIENTATION) { // 1-VERTICAL, 0-HORIZONTAL
        const settings = ExtensionUtils.getSettings('org.gnome.shell');
        const enabled = settings.get_strv('enabled-extensions');
        const allowWsPopupInjection = !(enabled.includes('workspace-switcher-manager@G-dH.github.com') || enabled.includes('WsSwitcherPopupManager@G-dH.github.com-dev'));
        if (opt.shellVersion >= 42 && allowWsPopupInjection)
            _overrides.addInjection('WorkspaceSwitcherPopup', WorkspaceSwitcherPopup.WorkspaceSwitcherPopup.prototype, WorkspaceSwitcherPopupInjections);
    }
}

const WorkspaceSwitcherPopupInjections = {
    _init() {
        if (this._list)
            this._list.vertical = true;
    },
};
