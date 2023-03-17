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
const { St } = imports.gi;
const IconGrid = imports.ui.iconGrid;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const _Util = Me.imports.lib.util;
const shellVersion = _Util.shellVersion;

let opt;
let _overrides;
let _firstRun = true;

function update(reset = false) {
    opt = Me.imports.lib.settings.opt;
    const moduleEnabled = opt.get('appDisplayModule', true);

    // don't even touch this module if disabled
    if (_firstRun && !moduleEnabled)
        return;

    _firstRun = false;

    if (_overrides)
        _overrides.removeAll();


    if (reset || !moduleEnabled) {
        _overrides = null;
        opt = null;
        return;
    }

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
        const { scaleFactor } = St.ThemeContext.get_for_stage(global.stage);
        const padding = 64 * scaleFactor;
        width -= pagePadding.left + pagePadding.right;
        height -= pagePadding.top + pagePadding.bottom;

        // calculate grid exactly for the available space
        const iconSize = opt.APP_GRID_ICON_SIZE * scaleFactor;
        // if this._gridModes.length === 1, custom grid should be used
        if (iconSize > 0 && this._gridModes.length > 1) {
            let columns = opt.APP_GRID_COLUMNS;
            let rows = opt.APP_GRID_ROWS;
            // 0 means adaptive size
            if (!columns)
                columns = Math.floor(width / (iconSize + padding));
            if (!rows)
                rows = Math.floor(height / (iconSize + padding));
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
