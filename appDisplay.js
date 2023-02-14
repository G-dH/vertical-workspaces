/**
 * Vertical Workspaces
 * appDisplay.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2023
 * @license    GPL-3.0
 *
 */

'use strict';

const { Clutter, GLib, GObject, Meta, Shell, St } = imports.gi;

const DND = imports.ui.dnd;
const Main = imports.ui.main;
const AppDisplay = imports.ui.appDisplay;
const IconGrid = imports.ui.iconGrid;
const { AppMenu } = imports.ui.appMenu;
const PopupMenu = imports.ui.popupMenu;
const BoxPointer = imports.ui.boxpointer;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const IconGridOverride = Me.imports.iconGrid;
const _Util = Me.imports.util;

// gettext
const _ = Me.imports.settings._;

let _overrides;

let _appGridLayoutSettings;
let _appDisplayScrollConId;
let _appSystemStateConId;
let _appGridLayoutConId;
let _updateAppGridTimeoutId;
let _origAppDisplayAcceptDrop;
let _origAppViewItemAcceptDrop;
let _origAppViewItemHandleDragOver;

let opt;
let shellVersion = _Util.shellVersion;


function update(reset = false) {
    if (_overrides)
        _overrides.removeAll();


    if (reset) {
        _setAppDisplayOrientation(false);
        _updateAppGridProperties(reset);
        _updateAppGridDND(reset);
        _restoreOverviewGroup();
        _overrides = null;
        opt = null;
        return;
    }

    opt = Me.imports.settings.opt;

    _overrides = new _Util.Overrides();

    if (opt.ORIENTATION === Clutter.Orientation.VERTICAL) {
        _overrides.addOverride('AppDisplayVertical', AppDisplay.AppDisplay.prototype, AppDisplayVertical);
        _overrides.addOverride('BaseAppViewVertical', AppDisplay.BaseAppView.prototype, BaseAppViewVertical);
    }

    _overrides.addOverride('AppSearchProvider', AppDisplay.AppSearchProvider.prototype, AppSearchProvider);

    // Custom App Grid
    _overrides.addOverride('AppFolderDialog', AppDisplay.AppFolderDialog.prototype, AppFolderDialog);
    if (shellVersion >= 43) {
        // const defined class needs to be touched before real access
        AppDisplay.BaseAppViewGridLayout;
        _overrides.addOverride('BaseAppViewGridLayout', AppDisplay.BaseAppViewGridLayout.prototype, BaseAppViewGridLayout);
        _overrides.addOverride('IconGrid', IconGrid.IconGrid.prototype, IconGridOverride.IconGrid);
    }
    _overrides.addOverride('FolderView', AppDisplay.FolderView.prototype, FolderView);
    _overrides.addOverride('AppIcon', AppDisplay.AppIcon.prototype, AppIcon);
    _overrides.addOverride('BaseAppView', AppDisplay.BaseAppView.prototype, BaseAppView);
    _overrides.addOverride('AppDisplay', AppDisplay.AppDisplay.prototype, AppDisplayCommon);


    _setAppDisplayOrientation(opt.ORIENTATION === Clutter.Orientation.VERTICAL);
    _updateAppGridProperties();
    _updateAppGridDND();
}

function _setAppDisplayOrientation(vertical = false) {
    const CLUTTER_ORIENTATION = vertical ? Clutter.Orientation.VERTICAL : Clutter.Orientation.HORIZONTAL;
    const scroll = vertical ? 'vscroll' : 'hscroll';
    // app display to vertical has issues - page indicator not working
    // global appDisplay orientation switch is not built-in
    let appDisplay = Main.overview._overview._controls._appDisplay;
    // following line itself only changes in which axis will operate overshoot detection which switches appDisplay pages while dragging app icon to vertical
    appDisplay._orientation = CLUTTER_ORIENTATION;
    appDisplay._grid.layoutManager._orientation = CLUTTER_ORIENTATION;
    appDisplay._swipeTracker.orientation = CLUTTER_ORIENTATION;
    appDisplay._swipeTracker._reset();
    if (vertical) {
        appDisplay._scrollView.set_policy(St.PolicyType.NEVER, St.PolicyType.EXTERNAL);

        // move and change orientation of page indicators
        // needs corrections in appgrid page calculations, e.g. appDisplay.adaptToSize() fnc,
        // which complicates use of super call inside the function
        const pageIndicators = appDisplay._pageIndicators;
        pageIndicators.vertical = true;
        appDisplay._box.vertical = false;
        pageIndicators.x_expand = false;
        pageIndicators.y_align = Clutter.ActorAlign.CENTER;
        pageIndicators.x_align = Clutter.ActorAlign.START;

        const scrollContainer = appDisplay._scrollView.get_parent();
        if (shellVersion < 43) {
            // remove touch friendly side navigation bars / arrows
            if (appDisplay._hintContainer)
                scrollContainer.remove_child(appDisplay._hintContainer);
        } else {
            // moving these bars needs more patching of the appDisplay's code
            // for now we just change bars style to be more like vertically oriented arrows indicating direction to prev/next page
            appDisplay._nextPageIndicator.add_style_class_name('nextPageIndicator');
            appDisplay._prevPageIndicator.add_style_class_name('prevPageIndicator');
        }

        // setting their x_scale to 0 removes the arrows and avoid allocation issues compared to .hide() them
        appDisplay._nextPageArrow.scale_x = 0;
        appDisplay._prevPageArrow.scale_x = 0;
    } else {
        appDisplay._scrollView.set_policy(St.PolicyType.EXTERNAL, St.PolicyType.NEVER);
        if (_appDisplayScrollConId) {
            appDisplay._adjustment.disconnect(_appDisplayScrollConId);
            _appDisplayScrollConId = 0;
        }

        // restore original page indicators
        const pageIndicators = appDisplay._pageIndicators;
        pageIndicators.vertical = false;
        appDisplay._box.vertical = true;
        pageIndicators.x_expand = true;
        pageIndicators.y_align = Clutter.ActorAlign.END;
        pageIndicators.x_align = Clutter.ActorAlign.CENTER;

        // put back touch friendly navigation bars/buttons
        const scrollContainer = appDisplay._scrollView.get_parent();
        if (appDisplay._hintContainer && !appDisplay._hintContainer.get_parent())
            scrollContainer.add_child(appDisplay._hintContainer);
        appDisplay._nextPageArrow.scale_x = 1;
        appDisplay._prevPageArrow.scale_x = 1;

        appDisplay._nextPageIndicator.remove_style_class_name('nextPageIndicator');
        appDisplay._prevPageIndicator.remove_style_class_name('prevPageIndicator');
    }

    // value for page indicator is calculated from scroll adjustment, horizontal needs to be replaced by vertical
    appDisplay._adjustment = appDisplay._scrollView[scroll].adjustment;

    // no need to connect already connected signal (wasn't removed the original one before)
    if (!vertical) {
        // reset used appdisplay properties
        Main.overview._overview._controls._appDisplay.scale_y = 1;
        Main.overview._overview._controls._appDisplay.scale_x = 1;
        Main.overview._overview._controls._appDisplay.opacity = 255;
        return;
    }

    // update appGrid dot pages indicators
    _appDisplayScrollConId = appDisplay._adjustment.connect('notify::value', adj => {
        const value = adj.value / adj.page_size;
        appDisplay._pageIndicators.setCurrentPosition(value);
    });
}

// Set App Grid columns, rows, icon size, incomplete pages
function _updateAppGridProperties(reset = false) {
    // columns, rows, icon size
    const appDisplay = Main.overview._overview._controls._appDisplay;
    appDisplay.visible = true;

    // replace isFavorite function to always return false to allow dnd with favorite apps
    if (!reset && opt.APP_GRID_INCLUDE_DASH) {
        if (!appDisplay._appFavorites._backupIsFavorite)
            appDisplay._appFavorites._backupIsFavorite = appDisplay._appFavorites.isFavorite;

        appDisplay._appFavorites.isFavorite = () => false;
    } else if (appDisplay._appFavorites._backupIsFavorite) {
        appDisplay._appFavorites.isFavorite = appDisplay._appFavorites._backupIsFavorite;
        appDisplay._appFavorites._backupIsFavorite = undefined;
    }

    if (reset) {
        appDisplay._grid.layout_manager.fixedIconSize = -1;
        appDisplay._grid.layoutManager.allow_incomplete_pages = true;
        appDisplay._grid.setGridModes();
        if (_appGridLayoutSettings) {
            _appGridLayoutSettings.disconnect(_appGridLayoutConId);
            _appGridLayoutConId = 0;
            _appGridLayoutSettings = null;
        }
        appDisplay._redisplay();
        // secondary call is necessary to properly update app grid
        appDisplay._redisplay();
    } else {
        // update grid on layout reset
        if (!_appGridLayoutSettings) {
            _appGridLayoutSettings = ExtensionUtils.getSettings('org.gnome.shell');
            _appGridLayoutConId = _appGridLayoutSettings.connect('changed::app-picker-layout', _resetAppGrid);
        }

        // remove icons from App Grid
        _resetAppGrid();

        const updateGrid = (rows, columns) => {
            if (rows === -1 || columns === -1) {
                appDisplay._grid.setGridModes();
            } else {
                appDisplay._grid.setGridModes(
                    [{ rows, columns }]
                );
            }
            appDisplay._grid._setGridMode(0);
        };

        appDisplay._grid._currentMode = -1;
        if (opt.APP_GRID_ALLOW_CUSTOM) {
            updateGrid(opt.APP_GRID_ROWS, opt.APP_GRID_COLUMNS);
        } else {
            appDisplay._grid.setGridModes();
            updateGrid(-1, -1);
        }
        appDisplay._grid.layoutManager.fixedIconSize = opt.APP_GRID_ICON_SIZE;
        appDisplay._grid.layoutManager.allow_incomplete_pages = opt.APP_GRID_ALLOW_INCOMPLETE_PAGES;

        // force rebuild icons. size shouldn't be the same as the current one, otherwise can be arbitrary
        appDisplay._grid.layoutManager.adaptToSize(200, 200);
        appDisplay._redisplay();

        _realizeAppDisplay();
    }
}

function _updateAppGridDND(reset) {
    if (opt.APP_GRID_ORDER && !reset) {
        if (!_appSystemStateConId)
            _appSystemStateConId = Shell.AppSystem.get_default().connect('app-state-changed', () => Main.overview._overview._controls._appDisplay._redisplay());

        // deny dnd from dash to app grid
        if (!_origAppDisplayAcceptDrop)
            _origAppDisplayAcceptDrop = AppDisplay.AppDisplay.prototype.acceptDrop;
        AppDisplay.AppDisplay.prototype.acceptDrop = () => false;

        // deny creating folders by dnd on other icon
        if (!_origAppViewItemHandleDragOver)
            _origAppViewItemHandleDragOver = AppDisplay.AppViewItem.prototype.handleDragOver;
        AppDisplay.AppViewItem.prototype.handleDragOver = () => DND.DragMotionResult.NO_DROP;

        if (!_origAppViewItemAcceptDrop)
            _origAppViewItemAcceptDrop = AppDisplay.AppViewItem.prototype.acceptDrop;
        AppDisplay.AppViewItem.prototype.acceptDrop = () => false;
    } else {
        if (_appSystemStateConId) {
            Shell.AppSystem.get_default().disconnect(_appSystemStateConId);
            _appSystemStateConId = 0;
        }

        if (_origAppDisplayAcceptDrop)
            AppDisplay.AppDisplay.prototype.acceptDrop = _origAppDisplayAcceptDrop;

        if (_origAppViewItemHandleDragOver)
            AppDisplay.AppViewItem.prototype.handleDragOver = _origAppViewItemHandleDragOver;

        if (_origAppViewItemAcceptDrop)
            AppDisplay.AppViewItem.prototype.acceptDrop = _origAppViewItemAcceptDrop;
    }
}

function _realizeAppDisplay() {
    // force app grid to build all icons before the first visible animation to remove possible stuttering
    // let the main loop realize previous changes before continuing

    // don't do this during shell startup
    if (Main.layoutManager._startingUp || !opt.APP_GRID_ALLOW_CUSTOM)
        return;

    if (_updateAppGridTimeoutId)
        GLib.source_remove(_updateAppGridTimeoutId);


    _updateAppGridTimeoutId = GLib.timeout_add(
        GLib.PRIORITY_DEFAULT,
        1000,
        () => {
            Main.layoutManager.overviewGroup.opacity = 1;
            Main.layoutManager.overviewGroup.scale_x = 0.1;
            Main.layoutManager.overviewGroup.show();
            Main.overview.dash.showAppsButton.checked = true;

            GLib.source_remove(_updateAppGridTimeoutId);

            _updateAppGridTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
                500,
                () => {
                    _restoreOverviewGroup();
                    _updateAppGridTimeoutId = 0;
                    return GLib.SOURCE_REMOVE;
                });
        }
    );
}

function _restoreOverviewGroup() {
    Main.overview.dash.showAppsButton.checked = false;
    Main.layoutManager.overviewGroup.opacity = 255;
    Main.layoutManager.overviewGroup.scale_x = 1;
    Main.layoutManager.overviewGroup.hide();
}

const AppDisplayVertical = {
    // correction of the appGrid size when page indicators were moved from the bottom to the right
    adaptToSize(width, height) {
        const [, indicatorWidth] = this._pageIndicators.get_preferred_width(-1);
        width -= indicatorWidth;

        this._grid.findBestModeForSize(width, height);

        const adaptToSize = AppDisplay.BaseAppView.prototype.adaptToSize.bind(this);
        adaptToSize(width, height);
    },
};


// AppDisplay.AppSearchProvider
// App search result size
const AppSearchProvider = {
    createResultObject(resultMeta) {
        if (resultMeta.id.endsWith('.desktop')) {
            const icon = new AppDisplay.AppIcon(this._appSys.lookup_app(resultMeta['id']), {
                expandTitleOnHover: false,
            });
            icon.icon.setIconSize(opt.SEARCH_ICON_SIZE);
            return icon;
        } else {
            const icon = new AppDisplay.SystemActionIcon(this, resultMeta);
            icon.icon._setSizeManually = true;
            icon.icon.setIconSize(opt.SEARCH_ICON_SIZE);
            return icon;
        }
    },
};

const BaseAppViewVertical = {
    // this fixes dnd from appDisplay to the workspace thumbnail on the left if appDisplay is on page 1 because of appgrid left overshoot
    _pageForCoords() {
        return AppDisplay.SidePages.NONE;
    },
};

const AppDisplayCommon = {
    _ensureDefaultFolders() {
        // disable creation of default folders if user deleted them
    },

    // apps load adapted for custom sorting and including dash items
    _loadApps() {
        let appIcons = [];
        this._appInfoList = Shell.AppSystem.get_default().get_installed().filter(appInfo => {
            try {
                appInfo.get_id(); // catch invalid file encodings
            } catch (e) {
                return false;
            }
            return (opt.APP_GRID_INCLUDE_DASH || !this._appFavorites.isFavorite(appInfo.get_id())) &&
                this._parentalControlsManager.shouldShowApp(appInfo);
        });

        let apps = this._appInfoList.map(app => app.get_id());

        let appSys = Shell.AppSystem.get_default();

        const appsInsideFolders = new Set();
        this._folderIcons = [];
        if (!opt.APP_GRID_ORDER) {
            let folders = this._folderSettings.get_strv('folder-children');
            folders.forEach(id => {
                let path = `${this._folderSettings.path}folders/${id}/`;
                let icon = this._items.get(id);
                if (!icon) {
                    icon = new AppDisplay.FolderIcon(id, path, this);
                    icon.connect('apps-changed', () => {
                        this._redisplay();
                        this._savePages();
                    });
                    icon.connect('notify::pressed', () => {
                        if (icon.pressed)
                            this.updateDragFocus(icon);
                    });
                }

                // Don't try to display empty folders
                if (!icon.visible) {
                    icon.destroy();
                    return;
                }

                appIcons.push(icon);
                this._folderIcons.push(icon);

                icon.getAppIds().forEach(appId => appsInsideFolders.add(appId));
            });
        }

        // Allow dragging of the icon only if the Dash would accept a drop to
        // change favorite-apps. There are no other possible drop targets from
        // the app picker, so there's no other need for a drag to start,
        // at least on single-monitor setups.
        // This also disables drag-to-launch on multi-monitor setups,
        // but we hope that is not used much.
        const isDraggable =
            global.settings.is_writable('favorite-apps') ||
            global.settings.is_writable('app-picker-layout');

        apps.forEach(appId => {
            if (!opt.APP_GRID_ORDER && appsInsideFolders.has(appId))
                return;

            let icon = this._items.get(appId);
            if (!icon) {
                let app = appSys.lookup_app(appId);

                icon = new AppDisplay.AppIcon(app, { isDraggable });
                icon.connect('notify::pressed', () => {
                    if (icon.pressed)
                        this.updateDragFocus(icon);
                });
            }

            appIcons.push(icon);
        });

        // At last, if there's a placeholder available, add it
        if (this._placeholder)
            appIcons.push(this._placeholder);

        return appIcons;
    },
};

const BaseAppView = {
    // adds sorting options and option to add favorites and running apps
    _redisplay() {
        let oldApps = this._orderedItems.slice();
        let oldAppIds = oldApps.map(icon => icon.id);

        let newApps = this._loadApps().sort(this._compareItems.bind(this));
        let newAppIds = newApps.map(icon => icon.id);

        let addedApps = newApps.filter(icon => !oldAppIds.includes(icon.id));
        let removedApps = oldApps.filter(icon => !newAppIds.includes(icon.id));

        // Remove old app icons
        removedApps.forEach(icon => {
            this._removeItem(icon);
            icon.destroy();
        });

        // Add new app icons, or move existing ones
        newApps.forEach(icon => {
            const [page, position] = this._getItemPosition(icon);
            if (addedApps.includes(icon))
                this._addItem(icon, page, position);
            else if (page !== -1 && position !== -1)
                this._moveItem(icon, page, position);
        });

        // Reorder App Grid by usage
        // sort all alphabetically
        if (opt.APP_GRID_ORDER > 0) {
            const { itemsPerPage } = this._grid;
            let appIcons = this._orderedItems;
            appIcons.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
            // then sort used apps by usage
            if (opt.APP_GRID_ORDER === 2)
                appIcons.sort((a, b) => Shell.AppUsage.get_default().compare(a.app.id, b.app.id));

            // sort favorites first
            if (opt.APP_GRID_INCLUDE_DASH === 2) {
                const fav = Object.keys(this._appFavorites._favorites);
                appIcons.sort((a, b) => {
                    let aFav = fav.indexOf(a.id);
                    if (aFav < 0)
                        aFav = 999;
                    let bFav = fav.indexOf(b.id);
                    if (bFav < 0)
                        bFav = 999;
                    return bFav < aFav;
                });
            }

            // sort running first
            if (opt.APP_GRID_INCLUDE_DASH === 2)
                appIcons.sort((a, b) => a.app.get_state() !== Shell.AppState.RUNNING && b.app.get_state() === Shell.AppState.RUNNING);


            appIcons.forEach((icon, i) => {
                const page = Math.floor(i / itemsPerPage);
                const position = i % itemsPerPage;
                this._moveItem(icon, page, position);
            });

            this._orderedItems = appIcons;
        }

        this.emit('view-loaded');
    },

    _canAccept(source) {
        return opt.APP_GRID_ORDER ? false : source instanceof AppDisplay.AppViewItem;
    },

    // GS <= 42 only, Adapt app grid so it can use all available space
    adaptToSize(width, height) {
        let box = new Clutter.ActorBox({
            x2: width,
            y2: height,
        });
        box = this.get_theme_node().get_content_box(box);
        box = this._scrollView.get_theme_node().get_content_box(box);
        box = this._grid.get_theme_node().get_content_box(box);

        const availWidth = box.get_width();
        const availHeight = box.get_height();

        const gridRatio = this._grid.layout_manager.columnsPerPage /
            this._grid.layout_manager.rowsPerPage;
        const spaceRatio = availWidth / availHeight;
        let pageWidth, pageHeight;

        if (spaceRatio > gridRatio * 1.1) {
            // Enough room for some preview
            pageHeight = availHeight;
            pageWidth = Math.ceil(availHeight * gridRatio);

            if (spaceRatio > gridRatio * 1.5) {
                // Ultra-wide layout, give some extra space for
                // the page area, but up to an extent.
                const extraPageSpace = Math.min(
                    Math.floor((availWidth - pageWidth) / 2), 200); // AppDisplay.MAX_PAGE_PADDING == 200
                pageWidth += extraPageSpace;
                this._grid.layout_manager.pagePadding.left =
                    Math.floor(extraPageSpace / 2);
                this._grid.layout_manager.pagePadding.right =
                    Math.ceil(extraPageSpace / 2);
            }
        } else {
            // Not enough room, needs to shrink horizontally
            pageWidth = Math.ceil(availWidth * 0.95); // width limiter, original is 0.8
            pageHeight = availHeight;
            this._grid.layout_manager.pagePadding.left =
                Math.floor(availWidth * 0.02);
            this._grid.layout_manager.pagePadding.right =
                Math.ceil(availWidth * 0.02);
        }

        this._grid.adaptToSize(pageWidth, pageHeight);

        const leftPadding = Math.floor(
            (availWidth - this._grid.layout_manager.pageWidth) / 2);
        const rightPadding = Math.ceil(
            (availWidth - this._grid.layout_manager.pageWidth) / 2);
        const topPadding = Math.floor(
            (availHeight - this._grid.layout_manager.pageHeight) / 2);
        const bottomPadding = Math.ceil(
            (availHeight - this._grid.layout_manager.pageHeight) / 2);

        this._scrollView.content_padding = new Clutter.Margin({
            left: leftPadding,
            right: rightPadding,
            top: topPadding,
            bottom: bottomPadding,
        });

        this._availWidth = availWidth;
        this._availHeight = availHeight;

        this._pageIndicatorOffset = leftPadding;
        this._pageArrowOffset = Math.max(
            leftPadding - 80, 0); // 80 is AppDisplay.PAGE_PREVIEW_MAX_ARROW_OFFSET
    },
};

const BaseAppViewGridLayout = {
    _getIndicatorsWidth(box) {
        const [width, height] = box.get_size();
        const arrows = [
            this._nextPageArrow,
            this._previousPageArrow,
        ];

        const minArrowsWidth = arrows.reduce(
            (previousWidth, accessory) => {
                const [min] = accessory.get_preferred_width(height);
                return Math.max(previousWidth, min);
            }, 0);

        const idealIndicatorWidth = (width * 0.1/* PAGE_PREVIEW_RATIO*/) / 2;

        return Math.max(idealIndicatorWidth, minArrowsWidth);
    },
};

const FolderView = {
    _createGrid() {
        let grid;
        if (shellVersion < 43)
            grid = new FolderGrid();
        else
            grid = new FolderGrid43();

        return grid;
    },
};

// folder columns and rows
const FolderGrid = GObject.registerClass(
class FolderGrid extends IconGrid.IconGrid {
    _init() {
        super._init({
            allow_incomplete_pages: false,
            columns_per_page: opt.APP_GRID_ALLOW_CUSTOM ? opt.APP_GRID_FOLDER_COLUMNS : 3,
            rows_per_page: opt.APP_GRID_ALLOW_CUSTOM ? opt.APP_GRID_FOLDER_ROWS : 3,
            page_halign: Clutter.ActorAlign.CENTER,
            page_valign: Clutter.ActorAlign.CENTER,
        });

        if (opt.APP_GRID_ALLOW_CUSTOM)
            this.set_style('column-spacing: 10px; row-spacing: 10px;');
        this.layout_manager.fixedIconSize = opt.APP_GRID_FOLDER_ICON_SIZE;
    }

    adaptToSize(width, height) {
        this.layout_manager.adaptToSize(width, height);
    }
});


let FolderGrid43;
// first reference to constant defined using const in other module returns undefined, the AppGrid const will remain empty and unused
const AppGrid = AppDisplay.AppGrid;
if (AppDisplay.AppGrid) {
    FolderGrid43 = GObject.registerClass(
    class FolderGrid43 extends AppDisplay.AppGrid {
        _init() {
            super._init({
                allow_incomplete_pages: false,
                columns_per_page: opt.APP_GRID_ALLOW_CUSTOM ? opt.APP_GRID_FOLDER_COLUMNS : 3,
                rows_per_page: opt.APP_GRID_ALLOW_CUSTOM ? opt.APP_GRID_FOLDER_ROWS : 3,
                page_halign: Clutter.ActorAlign.CENTER,
                page_valign: Clutter.ActorAlign.CENTER,
            });

            if (opt.APP_GRID_ALLOW_CUSTOM)
                this.set_style('column-spacing: 10px; row-spacing: 10px;');
            this.layout_manager.fixedIconSize = opt.APP_GRID_FOLDER_ICON_SIZE;

            this.setGridModes([
                {
                    rows: opt.APP_GRID_ALLOW_CUSTOM ? opt.APP_GRID_FOLDER_ROWS : 3,
                    columns: opt.APP_GRID_ALLOW_CUSTOM ? opt.APP_GRID_FOLDER_COLUMNS : 3,
                },
            ]);
        }

        adaptToSize(width, height) {
            this.layout_manager.adaptToSize(width, height);
        }
    });
}

const FOLDER_DIALOG_ANIMATION_TIME = 200; // AppDisplay.FOLDER_DIALOG_ANIMATION_TIME
const AppFolderDialog = {
    // injection to _init()
    after__init() {
        const iconSize = opt.APP_GRID_FOLDER_ICON_SIZE < 0 ? 96 : opt.APP_GRID_FOLDER_ICON_SIZE;
        let width = opt.APP_GRID_FOLDER_COLUMNS * (iconSize + 64);
        width = Math.max(640, Math.round(width + width / 10));
        let height = opt.APP_GRID_FOLDER_ROWS * (iconSize + 64) + 150;
        if (opt.APP_GRID_ALLOW_CUSTOM) {
            this.child.set_style(`
                width: ${width}px;
                height: ${height}px;
                padding: 30px;
            `);
        }
    },

    _zoomAndFadeIn() {
        let [sourceX, sourceY] =
            this._source.get_transformed_position();
        let [dialogX, dialogY] =
            this.child.get_transformed_position();

        this.child.set({
            translation_x: sourceX - dialogX,
            translation_y: sourceY - dialogY,
            scale_x: this._source.width / this.child.width,
            scale_y: this._source.height / this.child.height,
            opacity: 0,
        });

        this.ease({
            background_color: Clutter.Color.from_pixel(0x00000033), // DIALOG_SHADE_NORMAL
            duration: FOLDER_DIALOG_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });


        this.child.ease({
            translation_x: 0,
            translation_y: 0,
            scale_x: 1,
            scale_y: 1,
            opacity: 255,
            duration: FOLDER_DIALOG_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });

        this._needsZoomAndFade = false;

        if (this._sourceMappedId === 0) {
            this._sourceMappedId = this._source.connect(
                'notify::mapped', this._zoomAndFadeOut.bind(this));
        }
    },
};

function _resetAppGrid(settings = null, key = null) {
    if (settings) {
        const currentValue = JSON.stringify(settings.get_value('app-picker-layout').deep_unpack());
        const emptyValue = JSON.stringify([]);
        if (key === 'app-picker-layout' && currentValue !== emptyValue)
            return;
    }
    const appDisplay = Main.overview._overview._controls._appDisplay;
    const items = appDisplay._orderedItems;
    for (let i = items.length - 1; i > -1; i--)
        Main.overview._overview._controls._appDisplay._removeItem(items[i]);

    // redisplay only from callback
    if (settings)
        appDisplay._redisplay();
}

function _getWindowApp(metaWin) {
    const tracker = Shell.WindowTracker.get_default();
    return tracker.get_window_app(metaWin);
}

function _getAppLastUsedWindow(app) {
    let recentWin;
    global.display.get_tab_list(Meta.TabList.NORMAL_ALL, null).forEach(metaWin => {
        const winApp = _getWindowApp(metaWin);
        if (!recentWin && winApp === app)
            recentWin = metaWin;
    });
    return recentWin;
}

function _getAppRecentWorkspace(app) {
    const recentWin = _getAppLastUsedWindow(app);
    if (recentWin)
        return recentWin.get_workspace();

    return null;
}

const AppIcon = {
    activate(button) {
        const event = Clutter.get_current_event();
        const modifiers = event ? event.get_state() : 0;
        const isMiddleButton = button && button === Clutter.BUTTON_MIDDLE;
        const isCtrlPressed = (modifiers & Clutter.ModifierType.CONTROL_MASK) !== 0;
        const isShiftPressed = (modifiers & Clutter.ModifierType.SHIFT_MASK) !== 0;
        const openNewWindow = this.app.can_open_new_window() &&
                            this.app.state === Shell.AppState.RUNNING &&
                            (isCtrlPressed || isMiddleButton);

        const currentWS = global.workspace_manager.get_active_workspace();
        const appRecentWorkspace = _getAppRecentWorkspace(this.app);

        let targetWindowOnCurrentWs = false;
        if (opt.DASH_FOLLOW_RECENT_WIN) {
            targetWindowOnCurrentWs = appRecentWorkspace === currentWS;
        } else {
            this.app.get_windows().forEach(
                w => {
                    targetWindowOnCurrentWs = targetWindowOnCurrentWs || (w.get_workspace() === currentWS);
                }
            );
        }

        if ((this.app.state === Shell.AppState.STOPPED || openNewWindow) && !isShiftPressed)
            this.animateLaunch();

        if (openNewWindow) {
            this.app.open_new_window(-1);
        // if DASH_SHOW_WINS_BEFORE, the app has more than one window and has no window on the current workspace,
        // don't activate the app immediately, only move the overview to the workspace with the app's recent window
        } else if (opt.DASH_SHOW_WINS_BEFORE && !isShiftPressed && this.app.get_n_windows() > 1 && !targetWindowOnCurrentWs/* && !(opt.OVERVIEW_MODE && !opt.WORKSPACE_MODE)*/) {
            // this._scroll = true;
            // this._scrollTime = Date.now();
            Main.wm.actionMoveWorkspace(appRecentWorkspace);
            Main.overview.dash.showAppsButton.checked = false;
            return;
        } else if (opt.DASH_SHIFT_CLICK_MV && isShiftPressed && this.app.get_windows().length) {
            this._moveAppToCurrentWorkspace();
            return;
        } else if (isShiftPressed) {
            return;
        } else {
            this.app.activate();
        }

        Main.overview.hide();
    },

    _moveAppToCurrentWorkspace() {
        this.app.get_windows().forEach(w => w.change_workspace(global.workspace_manager.get_active_workspace()));
    },

    popupMenu(side = St.Side.LEFT) {
        if (shellVersion >= 42)
            this.setForcedHighlight(true);
        this._removeMenuTimeout();
        this.fake_release();

        if (!this._getWindowsOnCurrentWs) {
            this._getWindowsOnCurrentWs = function () {
                const winList = [];
                this.app.get_windows().forEach(w => {
                    if (w.get_workspace() === global.workspace_manager.get_active_workspace())
                        winList.push(w);
                });
                return winList;
            };

            this._windowsOnOtherWs = function () {
                return (this.app.get_windows().length - this._getWindowsOnCurrentWs().length) > 0;
            };
        }

        if (!this._menu) {
            this._menu = new AppMenu(this, side, {
                favoritesSection: true,
                showSingleWindows: true,
            });

            this._menu.setApp(this.app);
            this._openSigId = this._menu.connect('open-state-changed', (menu, isPoppedUp) => {
                if (!isPoppedUp)
                    this._onMenuPoppedDown();
            });
            // Main.overview.connectObject('hiding',
            this._hidingSigId = Main.overview.connect('hiding',
                () => this._menu.close(), this);

            Main.uiGroup.add_actor(this._menu.actor);
            this._menuManager.addMenu(this._menu);
        }

        // once the menu is created, it stays unchanged and we need to modify our items based on current situation
        if (this._addedMenuItems && this._addedMenuItems.length)
            this._addedMenuItems.forEach(i => i.destroy());


        const popupItems = [];

        const separator = new PopupMenu.PopupSeparatorMenuItem();
        this._menu.addMenuItem(separator);

        if (this.app.get_n_windows()) {
            // if (/* opt.APP_MENU_FORCE_QUIT*/true) {}
            popupItems.push([_('Force Quit'), () => {
                this.app.get_windows()[0].kill();
            }]);

            // if (opt.APP_MENU_CLOSE_WS) {}
            const nWin = this._getWindowsOnCurrentWs().length;
            if (nWin) {
                popupItems.push([_(`Close ${nWin} Windows on Current Workspace`), () => {
                    const windows = this._getWindowsOnCurrentWs();
                    let time = global.get_current_time();
                    for (let win of windows) {
                    // increase time by 1 ms for each window to avoid errors from GS
                        win.delete(time++);
                    }
                }]);
            }

            if (/* opt.APP_MENU_MV_TO_WS && */this._windowsOnOtherWs())
                popupItems.push([_('Move App to Current Workspace'), this._moveAppToCurrentWorkspace]);
        }

        this._addedMenuItems = [];
        this._addedMenuItems.push(separator);
        popupItems.forEach(i => {
            let item = new PopupMenu.PopupMenuItem(i[0]);
            this._menu.addMenuItem(item);
            item.connect('activate', i[1].bind(this));
            this._addedMenuItems.push(item);
        });

        this.emit('menu-state-changed', true);

        this._menu.open(BoxPointer.PopupAnimation.FULL);
        this._menuManager.ignoreRelease();
        this.emit('sync-tooltip');

        return false;
    },
};
