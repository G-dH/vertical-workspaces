/**
 * V-Shell (Vertical Workspaces)
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

let opt;
let _overrides;

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

    if (shellVersion < 43 && IconGridCommon._findBestModeForSize) {
        IconGridCommon['findBestModeForSize'] = IconGridCommon._findBestModeForSize;
        IconGridCommon['_findBestModeForSize'] = undefined;
    }
    _overrides.addOverride('IconGrid', IconGrid.IconGrid.prototype, IconGridCommon);
}
// workaround - silence page -2 error on gnome 43 while cleaning app grid

const IconGridCommon = {
    getItemsAtPage(page) {
        if (page < 0 || page > this.nPages)
            return [];
            // throw new Error(`Page ${page} does not exist at IconGrid`);

        const layoutManager = this.layout_manager;
        return layoutManager.getItemsAtPage(page);
    },

    _findBestModeForSize(width, height) {
        const { pagePadding } = this.layout_manager;
        width -= pagePadding.left + pagePadding.right;
        height -= pagePadding.top + pagePadding.bottom;

        // calculate grid exactly for the available space
        const iconSize = opt.APP_GRID_ICON_SIZE;
        // if this._gridModes.length === 1, custom grid should be used
        if (iconSize > 0 && this._gridModes.length > 1) {
            let columns = opt.APP_GRID_COLUMNS;
            let rows = opt.APP_GRID_ROWS;
            // 0 means adaptive size
            if (!columns)
                columns = Math.floor(width / (iconSize + 64));
            if (!rows)
                rows = Math.floor(height / (iconSize + 64));
            this._gridModes = [{ columns, rows }];
        }

        const sizeRatio = width / height;
        let closestRatio = Infinity;
        let bestMode = -1;

        for (let modeIndex in this._gridModes) {
            const mode = this._gridModes[modeIndex];
            const modeRatio = mode.columns / mode.rows;

            if (Math.abs(sizeRatio - modeRatio) < Math.abs(sizeRatio - closestRatio)) {
                closestRatio = modeRatio;
                bestMode = modeIndex;
            }
        }

        this._setGridMode(bestMode);
    },
};
