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
const { GLib, St, Meta } = imports.gi;
const IconGrid = imports.ui.iconGrid;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const _Util = Me.imports.lib.util;
const shellVersion = _Util.shellVersion;

// added sizes for better scaling
const IconSize = {
    LARGEST: 256,
    224: 224,
    208: 208,
    192: 192,
    176: 176,
    160: 160,
    144: 144,
    128: 128,
    112: 112,
    LARGE: 96,
    80: 80,
    64: 64,
    48: 48,
    TINY: 32,
};

let opt;
let _overrides;
let _firstRun = true;

function update(reset = false) {
    opt = Me.imports.lib.settings.opt;
    const moduleEnabled = opt.get('appDisplayModule', true);
    reset = reset || !moduleEnabled;

    // don't even touch this module if disabled
    if (_firstRun && reset)
        return;

    _firstRun = false;

    if (_overrides)
        _overrides.removeAll();


    if (reset) {
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
    _overrides.addOverride('IconGridLayout', IconGrid.IconGridLayout.prototype, IconGridLayoutCommon);
}
// workaround - silence page -2 error on gnome 43 while cleaning app grid

const IconGridCommon = {
    getItemsAtPage(page) {
        if (page < 0 || page >= this.nPages)
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
        if (!this._isFolder)
            width *= opt.APP_GRID_PAGE_WIDTH_SCALE;

        height -= pagePadding.top + pagePadding.bottom;

        // calculate grid exactly for the available space
        const defaultSize = opt.APP_GRID_ACTIVE_PREVIEW && !opt.APP_GRID_ORDER ? 176 : IconSize.LARGE;
        const iconSize = (opt.APP_GRID_ICON_SIZE < 0 ? defaultSize : opt.APP_GRID_ICON_SIZE) * scaleFactor;
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

const IconGridLayoutCommon = {
    _findBestIconSize() {
        const nColumns = this.columnsPerPage;
        const nRows = this.rowsPerPage;
        // exclude spacing from calculation so bigger icons have better chance to be selected
        // in most situations bigger icon fits better than smaller one
        const columnSpacingPerPage = 0; // this.columnSpacing * (nColumns - 1);
        const rowSpacingPerPage = 0; // this.rowSpacing * (nRows - 1);
        const [firstItem] = this._container;

        if (this.fixedIconSize !== -1)
            return this.fixedIconSize;

        let iconSizes = Object.values(IconSize).sort((a, b) => b - a);

        // limit max icon size for folders, the whole range is for the main grid with active folders
        if (this._isFolder)
            iconSizes = iconSizes.slice(iconSizes.indexOf(IconSize.LARGE), -1);

        for (const size of iconSizes) {
            let usedWidth, usedHeight;

            if (firstItem) {
                firstItem.icon.setIconSize(size);
                const [firstItemWidth, firstItemHeight] =
                    firstItem.get_preferred_size();

                const itemSize = Math.max(firstItemWidth, firstItemHeight);

                usedWidth = itemSize * nColumns;
                usedHeight = itemSize * nRows;
            } else {
                usedWidth = size * nColumns;
                usedHeight = size * nRows;
            }

            const emptyHSpace =
                this._pageWidth * (shellVersion < 43 || this._isFolder ? 1 : opt.APP_GRID_PAGE_WIDTH_SCALE) - usedWidth - columnSpacingPerPage -
                this.pagePadding.left - this.pagePadding.right;
            const emptyVSpace =
                this._pageHeight - usedHeight -  rowSpacingPerPage -
                this.pagePadding.top - this.pagePadding.bottom;

            if (emptyHSpace >= 0 && emptyVSpace > 0)
                return size;
        }

        return IconSize.TINY;
    },

    removeItem(item) {
        if (!this._items.has(item)) {
            log(`Item ${item} is not part of the IconGridLayout`);
            return;
            // throw new Error(`Item ${item} is not part of the IconGridLayout`);
        }

        if (!this._container)
            return;

        this._shouldEaseItems = true;

        this._container.remove_child(item);
        this._removeItemData(item);
    },

    addItem(item, page = -1, index = -1) {
        if (this._items.has(item)) {
            log(`iconGrid: Item ${item} already added to IconGridLayout`);
            return;
            // throw new Error(`Item ${item} already added to IconGridLayout`);
        }

        if (page > this._pages.length) {
            log(`iconGrid: Cannot add ${item} to page ${page}`);
            page = -1;
            index = -1;
            // throw new Error(`Cannot add ${item} to page ${page}`);
        }

        if (!this._container)
            return;

        if (page !== -1 && index === -1)
            page = this._findBestPageToAppend(page);

        this._shouldEaseItems = true;
        this._container.add_child(item);
        this._addItemToPage(item, page, index);
    },

    moveItem(item, newPage, newPosition) {
        if (!this._items.has(item)) {
            log(`iconGrid: Item ${item} is not part of the IconGridLayout`);
            return;
            // throw new Error(`Item ${item} is not part of the IconGridLayout`);
        }

        this._shouldEaseItems = true;

        this._removeItemData(item);

        if (newPage !== -1 && newPosition === -1)
            newPage = this._findBestPageToAppend(newPage);
        this._addItemToPage(item, newPage, newPosition);
    },

    _addItemToPage(item, pageIndex, index) {
        // Ensure we have at least one page
        if (this._pages.length === 0)
            this._appendPage();

        // Append a new page if necessary
        if (pageIndex === this._pages.length)
            this._appendPage();

        if (pageIndex >= this._pages.length) {
            pageIndex = -1;
            index = -1;
        }


        if (pageIndex === -1)
            pageIndex = this._pages.length - 1;

        if (index === -1)
            index = this._pages[pageIndex].children.length;

        this._items.set(item, {
            actor: item,
            pageIndex,
            destroyId: item.connect('destroy', () => this._removeItemData(item)),
            visibleId: item.connect('notify::visible', () => {
                const itemData = this._items.get(item);

                this._updateVisibleChildrenForPage(itemData.pageIndex);

                if (item.visible)
                    this._relocateSurplusItems(itemData.pageIndex);
                else if (!this.allowIncompletePages)
                    this._fillItemVacancies(itemData.pageIndex);
            }),
            queueRelayoutId: item.connect('queue-relayout', () => {
                this._childrenMaxSize = -1;
            }),
        });

        item.icon.setIconSize(this._iconSize);
        this._pages[pageIndex].children.splice(index, 0, item);
        this._updateVisibleChildrenForPage(pageIndex);
        this._relocateSurplusItems(pageIndex);
    },

    _findBestPageToAppend(startPage) {
        const itemsPerPage = this.columnsPerPage * this.rowsPerPage;

        for (let i = startPage; i < this._pages.length; i++) {
            const visibleItems = this._pages[i].visibleChildren;

            if (visibleItems.length < itemsPerPage)
                return i;
        }

        return this._pages.length;
    },
};
