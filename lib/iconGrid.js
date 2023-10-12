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

const St = imports.gi.St;

const IconGrid = imports.ui.iconGrid;

let Me;
let opt;

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

const PAGE_WIDTH_CORRECTION = 100;

var IconGridModule = class {
    constructor(me) {
        Me = me;
        opt = Me.opt;

        this._firstActivation = true;
        this._moduleEnabled = false;
        this._overrides = null;
    }

    cleanGlobals() {
        Me = null;
        opt = null;
    }

    update(reset) {
        this._moduleEnabled = opt.get('appDisplayModule');
        // if notifications are enabled no override is needed
        reset = reset || !this._moduleEnabled;

        // don't touch original code if module disabled
        if (reset && !this._firstActivation) {
            this._disableModule();
        } else if (!reset) {
            this._firstActivation = false;
            this._activateModule();
        }
    }

    _activateModule() {
        if (!this._overrides)
            this._overrides = new Me.Util.Overrides();

        if (Me.shellVersion < 43 && IconGridCommon._findBestModeForSize) {
            IconGridCommon['findBestModeForSize'] = IconGridCommon._findBestModeForSize;
            delete IconGridCommon['_findBestModeForSize'];
        }
        this._overrides.addOverride('IconGrid', IconGrid.IconGrid.prototype, IconGridCommon);
        this._overrides.addOverride('IconGridLayout', IconGrid.IconGridLayout.prototype, IconGridLayoutCommon);
    }

    _disableModule() {
        if (this._overrides)
            this._overrides.removeAll();
        this._overrides = null;
    }
};

const IconGridCommon = {
    getItemsAtPage(page) {
        if (page < 0 || page >= this.nPages)
            return [];
            // throw new Error(`Page ${page} does not exist at IconGrid`);

        const layoutManager = this.layout_manager;
        return layoutManager.getItemsAtPage(page);
    },

    _findBestModeForSize(width, height) {
        // this function is for main grid only, folder grid calculation is in appDisplay.AppFolderDialog class
        if (this._currentMode > -1 || this.layoutManager._isFolder)
            return;
        const { pagePadding } = this.layout_manager;
        const { scaleFactor } = St.ThemeContext.get_for_stage(global.stage);
        const iconPadding = 51 * scaleFactor;
        // provided width is usually about 100px wider in horizontal orientation with prev/next page indicators
        const pageIndicatorCompensation = opt.ORIENTATION ? 0 : PAGE_WIDTH_CORRECTION;

        width -= pagePadding.left + pagePadding.right + pageIndicatorCompensation;
        width *= opt.APP_GRID_PAGE_WIDTH_SCALE;
        height -= pagePadding.top + pagePadding.bottom;

        // store grid max dimensions for icon size algorithm
        this.layoutManager._gridWidth = width;
        this.layoutManager._gridHeight = height;

        width -=  80; // compensation for default padding
        height -= 80;

        const spacing = opt.APP_GRID_SPACING;
        // set the icon size as fixed to avoid changes in size later
        const iconSize = opt.APP_GRID_ICON_SIZE > 0 ? opt.APP_GRID_ICON_SIZE : opt.APP_GRID_ICON_SIZE_DEFAULT;
        this.layout_manager.fixedIconSize = iconSize;
        const itemSize = iconSize * scaleFactor + iconPadding;
        // if this._gridModes.length === 1, custom grid should be used
        // if (iconSize > 0 && this._gridModes.length > 1) {
        let columns = opt.APP_GRID_COLUMNS;
        let rows = opt.APP_GRID_ROWS;
        // 0 means adaptive size
        let unusedSpaceH = -1;
        let unusedSpaceV = -1;
        if (!columns) {
            // calculate #columns + 1 without spacing
            columns = Math.floor(width / itemSize) + 1;
            // check if columns with spacing fits the available width
            // and reduce the number until it fits
            while (unusedSpaceH < 0) {
                columns -= 1;
                unusedSpaceH = width - columns * itemSize - (columns - 1) * spacing;
            }
        }
        if (!rows) {
            rows = Math.floor(height / itemSize) + 1;
            while (unusedSpaceV < 0) {
                rows -= 1;
                unusedSpaceV = height - rows * itemSize - ((rows - 1) * spacing);
            }
        }

        this._gridModes = [{ columns, rows }];
        // }

        this._setGridMode(0);
    },
};

const IconGridLayoutCommon = {
    _findBestIconSize() {
        const { scaleFactor } = St.ThemeContext.get_for_stage(global.stage);
        const nColumns = this.columnsPerPage;
        const nRows = this.rowsPerPage;

        // if grid is not defined return default icon size
        if (nColumns < 1 || nRows < 1) {
            return this._isFolder
                ? opt.APP_GRID_FOLDER_ICON_SIZE_DEFAULT : opt.APP_GRID_ICON_SIZE_DEFAULT;
        }

        const columnSpacingPerPage = opt.APP_GRID_SPACING * (nColumns - 1);
        const rowSpacingPerPage = opt.APP_GRID_SPACING * (nRows - 1);
        const iconPadding = 55 * scaleFactor;

        const paddingH = this._isFolder ? this.pagePadding.left + this.pagePadding.right : 0;
        const paddingV = this._isFolder ? this.pagePadding.top + this.pagePadding.bottom : 0;

        const width = this._gridWidth ? this._gridWidth : this._pageWidth;
        const height = this._gridHeight ? this._gridHeight : this._pageHeight;
        if (!width || !height)
            return opt.APP_GRID_ICON_SIZE_DEFAULT;

        const [firstItem] = this._container;

        if (this.fixedIconSize !== -1)
            return this.fixedIconSize;

        /* if (opt.APP_GRID_ADAPTIVE && !this._isFolder)
            return opt.APP_GRID_ICON_SIZE_DEFAULT;*/

        let iconSizes = Object.values(IconSize).sort((a, b) => b - a);
        // limit max icon size for folders and fully adaptive folder grids, the whole range is for the main grid with active folders
        if (this._isFolder && opt.APP_GRID_FOLDER_ADAPTIVE && opt.APP_GRID_FOLDER_ICON_SIZE < 0)
            iconSizes = iconSizes.slice(iconSizes.indexOf(opt.APP_GRID_FOLDER_ICON_SIZE_DEFAULT), -1);
        else if (this._isFolder)
            iconSizes = iconSizes.slice(iconSizes.indexOf(IconSize.LARGE), -1);
        else if (opt.APP_GRID_ADAPTIVE && opt.APP_GRID_ICON_SIZE < 0)
            iconSizes = iconSizes.slice(iconSizes.indexOf(opt.APP_GRID_ICON_SIZE_DEFAULT), -1);


        let sizeInvalid = false;
        for (const size of iconSizes) {
            let usedWidth, usedHeight;

            if (firstItem) {
                firstItem.icon.setIconSize(size);
                const [firstItemWidth] = firstItem.get_preferred_size();

                const itemSize = firstItemWidth;
                if (itemSize < size)
                    sizeInvalid = true;

                usedWidth = itemSize * nColumns;
                usedHeight = itemSize * nRows;
            }

            if (!firstItem || sizeInvalid) {
                usedWidth = (size + iconPadding) * nColumns;
                usedHeight = (size + iconPadding) * nRows;
            }
            const emptyHSpace =
                width - usedWidth - columnSpacingPerPage - paddingH;
                // this.pagePadding.left - this.pagePadding.right;
            const emptyVSpace =
                height - usedHeight - rowSpacingPerPage - paddingV;
                // this.pagePadding.top - this.pagePadding.bottom;

            if (emptyHSpace >= 0 && emptyVSpace >= 0) {
                return size;
            }
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
