/**
 * Vertical Workspaces
 * iconGrid.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2023
 * @license    GPL-3.0
 *
 */

'use strict';

const IconGrid = imports.ui.iconGrid;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const _Util = Me.imports.util;
const shellVersion = _Util.shellVersion;

let _overrides;

function update(reset = false) {
    if (_overrides)
        _overrides.removeAll();


    if (reset || shellVersion < 43) {
        _overrides = null;
        return;
    }

    _overrides = new _Util.Overrides();

    _overrides.addOverride('IconGrid', IconGrid.IconGrid.prototype, IconGrid43);
}
// workaround - silence page -2 error on gnome 43 while cleaning app grid

const IconGrid43 = {
    getItemsAtPage(page) {
        if (page < 0 || page > this.nPages)
            return [];
            // throw new Error(`Page ${page} does not exist at IconGrid`);

        const layoutManager = this.layout_manager;
        return layoutManager.getItemsAtPage(page);
    },
};
