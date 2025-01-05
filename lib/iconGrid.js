/**
 * V-Shell (Vertical Workspaces)
 * iconGrid.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2024
 * @license    GPL-3.0
 *
 */

'use strict';

const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
const St = imports.gi.St;

const Main = imports.ui.main;
const IconGrid = imports.ui.iconGrid;

let Me;
let opt;

// added sizes for better scaling
var IconSize = {
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
        this.moduleEnabled = false;
        this._overrides = null;
    }

    cleanGlobals() {
        Me = null;
        opt = null;
    }

    update(reset) {
        this.moduleEnabled = opt.get('appDisplayModule');
        // if notifications are enabled no override is needed
        reset = reset || !this.moduleEnabled;

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

    _shouldUpdateGrid(width, height) {
        if (this.layoutManager._isFolder)
            return false;
        else if (this._currentMode === -1)
            return true;

        // Update if page size changed
        // Page dimensions may change within a small range
        const range = 5;
        return (Math.abs(width - (this._gridForWidth ?? 0)) > range) ||
               (Math.abs(height - (this._gridForHeight ?? 0)) > range);
    },

    _findBestModeForSize(width, height) {
        // this function is for main grid only, folder grid calculation is in appDisplay.AppFolderDialog class
        if (!this._shouldUpdateGrid(width, height))
            return;

        this._gridForWidth = width;
        this._gridForHeight = height;

        this._updateDefaultIconSize();
        const { pagePadding } = this.layout_manager;
        const { scaleFactor } = St.ThemeContext.get_for_stage(global.stage);
        const itemPadding = 55;

        // pagePadding is already affected by the scaleFactor
        width -= pagePadding.left + pagePadding.right;
        height -= pagePadding.top + pagePadding.bottom;

        if (Me.shellVersion < 43 && !this._isFolder) {
            width -= width - width * opt.APP_GRID_PAGE_WIDTH_SCALE;
            height -= height - height * opt.APP_GRID_PAGE_HEIGHT_SCALE;
        }

        // Sync with _findBestIconSize()
        this.layoutManager._gridSizeChanged = true;
        this.layoutManager._gridWidth = width;
        this.layoutManager._gridHeight = height;

        // All widgets are affected by the scaleFactor so we need to apply it also on the page size
        width /= scaleFactor;
        height /= scaleFactor;

        const spacing = opt.APP_GRID_SPACING;
        const iconSize = opt.APP_GRID_ICON_SIZE > 0 ? opt.APP_GRID_ICON_SIZE : opt.APP_GRID_ICON_SIZE_DEFAULT;
        const itemSize = iconSize + itemPadding;
        let columns = opt.APP_GRID_COLUMNS;
        let rows = opt.APP_GRID_ROWS;
        // 0 means adaptive size
        let unusedSpaceH = -1;
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
        let unusedSpaceV = -1;
        if (!rows) {
            rows = Math.floor(height / itemSize) + 1;
            while (unusedSpaceV < 0) {
                rows -= 1;
                unusedSpaceV = height - rows * itemSize - ((rows - 1) * spacing);
            }
        }

        this._gridModes = [{ columns, rows }];
        this._currentMode = -1;
        this._setGridMode(0);
        this.layoutManager.updateIconSize();
        // Call _redisplay() from timeout to avoid allocation errors
        GLib.idle_add(GLib.PRIORITY_LOW, () =>
            Main.overview._overview.controls.appDisplay._redisplay()
        );
    },

    // Adjust the IconGrid height for the current page height
    vfunc_allocate(box) {
        box.set_size(this.layoutManager._pageWidth ?? box.get_width(), this.layoutManager._pageHeight ?? box.get_height());
        // box.set_size(box.get_width(), box.get_height() * opt.APP_GRID_PAGE_HEIGHT_SCALE);
        St.Viewport.prototype.vfunc_allocate.bind(this)(box);
    },

    _updateDefaultIconSize() {
        // Reduce default icon size for low resolution screens and high screen scales
        if (Me.Util.monitorHasLowResolution()) {
            opt.APP_GRID_ICON_SIZE_DEFAULT = opt.APP_GRID_ACTIVE_PREVIEW && !opt.APP_GRID_USAGE ? 128 : 64;
            opt.APP_GRID_FOLDER_ICON_SIZE_DEFAULT = 64;
        } else {
            opt.APP_GRID_ICON_SIZE_DEFAULT = opt.APP_GRID_ACTIVE_PREVIEW && !opt.APP_GRID_USAGE ? 192 : 96;
        }
    },

    // Workaround for the upstream bug
    // https://gitlab.gnome.org/GNOME/gnome-shell/-/issues/5753
    // https://gitlab.gnome.org/GNOME/gnome-shell/-/issues/5240
    // https://gitlab.gnome.org/GNOME/gnome-shell/-/issues/6892
    // The appGridLayout._currentPage is not updated when the page is changed in the grid
    // For example, when user navigates app icons using a keyboard
    // GS >= 43
    after_goToPage() {
        if (this._delegate._appGridLayout?._currentPage !== this._currentPage)
            this._delegate._appGridLayout?.goToPage(this._currentPage);
    },

    // Workaround for the upstream bug
    // https://gitlab.gnome.org/GNOME/gnome-shell/-/issues/7700
    // Return INVALID target if x or y is out of the grid view
    getDropTarget(x, y) {
        /* if (x < 0 || y < 0)
            return [0, 0, 0]; // [0, 0, DragLocation.INVALID]*/
        const layoutManager = this.layout_manager;
        return layoutManager.getDropTarget(x, y, this._currentPage);
    },
};

const IconGridLayoutCommon = {
    _findBestIconSize() {
        if (this.fixedIconSize !== -1)
            return this.fixedIconSize;

        if (!this._isFolder && !this._gridSizeChanged)
            return this._iconSize;
        this._gridSizeChanged = false;

        const { scaleFactor } = St.ThemeContext.get_for_stage(global.stage);
        const nColumns = this.columnsPerPage;
        const nRows = this.rowsPerPage;

        // If grid is not defined, return default icon size
        if (nColumns < 1 && nRows < 1) {
            return this._isFolder
                ? opt.APP_GRID_FOLDER_ICON_SIZE_DEFAULT
                : opt.APP_GRID_ICON_SIZE_DEFAULT;
        }

        const spacing = this._isFolder
            ? opt.APP_GRID_FOLDER_SPACING
            : opt.APP_GRID_SPACING;

        const columnSpacingPerPage = spacing * (nColumns - 1);
        const rowSpacingPerPage = spacing * (nRows - 1);
        const itemPadding = 55;

        const width = (this._gridWidth ? this._gridWidth : this._pageWidth) / scaleFactor;
        let height = (this._gridHeight ? this._gridHeight : this._pageHeight) / scaleFactor;

        /* if (!this._isFolder)
            height = Math.floor(height * opt.APP_GRID_PAGE_HEIGHT_SCALE);*/
        if (!width || !height)
            return opt.APP_GRID_ICON_SIZE_DEFAULT;

        const [firstItem] = this._container;

        let iconSizes = Object.values(IconSize).sort((a, b) => b - a);
        // limit max icon size for folders and fully adaptive folder grids, the whole range is for the main grid with active folders
        if (this._isFolder && opt.APP_GRID_FOLDER_ICON_SIZE < 0)
            iconSizes = iconSizes.slice(iconSizes.indexOf(opt.APP_GRID_FOLDER_ICON_SIZE_DEFAULT), -1);
        else if (this._isFolder)
            iconSizes = iconSizes.slice(iconSizes.indexOf(IconSize.LARGE), -1);
        else if (opt.APP_GRID_ICON_SIZE < 0)
            iconSizes = iconSizes.slice(iconSizes.indexOf(opt.APP_GRID_ICON_SIZE_DEFAULT), -1);

        let sizeInvalid = false;
        for (const size of iconSizes) {
            let usedWidth, usedHeight;

            if (firstItem) {
                firstItem.icon.setIconSize(size);
                const [firstItemWidth] = firstItem.get_preferred_size();

                const itemSize = firstItemWidth / scaleFactor;
                if (itemSize < size)
                    sizeInvalid = true;

                usedWidth = itemSize * nColumns;
                usedHeight = itemSize * nRows;
            }

            if (!firstItem || sizeInvalid) {
                usedWidth = (size + itemPadding) * nColumns;
                usedHeight = (size + itemPadding) * nRows;
            }
            const emptyHSpace =
                width - usedWidth - columnSpacingPerPage;
            const emptyVSpace =
                height - usedHeight - rowSpacingPerPage;

            if (emptyHSpace >= 0 && emptyVSpace >= 0)
                return size;
        }

        return IconSize.TINY;
    },

    removeItem(item) {
        if (!this._items.has(item)) {
            console.error(`IconGrid: Item ${item} is not part of the IconGridLayout`);
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
            console.error(`IconGrid: Item ${item} already added to IconGridLayout`);
            return;
            // throw new Error(`Item ${item} already added to IconGridLayout`);
        }

        if (page > this._pages.length) {
            console.error(`IconGrid: Cannot add ${item} to page ${page}`);
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
            console.error(`iconGrid: Item ${item} is not part of the IconGridLayout`);
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

    _relocateSurplusItems(pageIndex) {
        // Avoid recursion during relocations in _redisplay()
        if (this._skipRelocateSurplusItems)
            return;

        const visiblePageItems = this._pages[pageIndex].visibleChildren;
        const itemsPerPage = this.columnsPerPage * this.rowsPerPage;

        // No overflow
        if (visiblePageItems.length <= itemsPerPage)
            return;

        const nExtraItems = visiblePageItems.length - itemsPerPage;
        for (let i = 0; i < nExtraItems; i++) {
            const overflowIndex = visiblePageItems.length - i - 1;
            const overflowItem = visiblePageItems[overflowIndex];

            this._removeItemData(overflowItem);
            this._addItemToPage(overflowItem, pageIndex + 1, 0);
        }
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

    updateIconSize() {
        const iconSize = this._findBestIconSize();

        if (this._iconSize !== iconSize) {
            this._iconSize = iconSize;
            for (const child of this._container)
                child.icon.setIconSize(iconSize);

            this.notify('icon-size');
        }
    },
};
