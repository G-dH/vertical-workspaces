/**
 * V-Shell (Vertical Workspaces)
 * appDisplay.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2023
 * @license    GPL-3.0
 *
 */

'use strict';

const { Clutter, GLib, GObject, Meta, Shell, St, Graphene, Pango } = imports.gi;

const DND = imports.ui.dnd;
const Main = imports.ui.main;
const AppDisplay = imports.ui.appDisplay;
const IconGrid = imports.ui.iconGrid;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const IconGridOverride = Me.imports.lib.iconGrid;
const _Util = Me.imports.lib.util;

const DIALOG_SHADE_NORMAL = Clutter.Color.from_pixel(0x00000022);
const DIALOG_SHADE_HIGHLIGHT = Clutter.Color.from_pixel(0x00000000);

// gettext
const _ = Me.imports.lib.settings._;

let _overrides;

let _appGridLayoutSettings;
let _appDisplayScrollConId;
let _appSystemStateConId;
let _appGridLayoutConId;
let _origAppViewItemAcceptDrop;
let _updateFolderIcons;

let opt;
let shellVersion = _Util.shellVersion;
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
        reset = true;
        _setAppDisplayOrientation(false);
        _updateAppGridProperties(reset);
        _updateAppGridDND(reset);
        _restoreOverviewGroup();
        _overrides = null;
        opt = null;
        return;
    }

    _overrides = new _Util.Overrides();

    if (opt.ORIENTATION === Clutter.Orientation.VERTICAL) {
        _overrides.addOverride('AppDisplayVertical', AppDisplay.AppDisplay.prototype, AppDisplayVertical);
        _overrides.addOverride('BaseAppViewVertical', AppDisplay.BaseAppView.prototype, BaseAppViewVertical);
    }

    // Custom App Grid
    _overrides.addOverride('AppFolderDialog', AppDisplay.AppFolderDialog.prototype, AppFolderDialog);
    if (shellVersion >= 43) {
        // const defined class needs to be touched before real access
        AppDisplay.BaseAppViewGridLayout;
        _overrides.addOverride('BaseAppViewGridLayout', AppDisplay.BaseAppViewGridLayout.prototype, BaseAppViewGridLayout);
    }
    _overrides.addOverride('FolderView', AppDisplay.FolderView.prototype, FolderView);
    _overrides.addOverride('FolderIcon', AppDisplay.FolderIcon.prototype, FolderIcon);
    _overrides.addOverride('AppIcon', AppDisplay.AppIcon.prototype, AppIcon);
    _overrides.addOverride('AppDisplay', AppDisplay.AppDisplay.prototype, AppDisplayCommon);
    _overrides.addOverride('AppViewItem', AppDisplay.AppViewItem.prototype, AppViewItemCommon);
    _overrides.addOverride('BaseAppViewCommon', AppDisplay.BaseAppView.prototype, BaseAppViewCommon);

    _setAppDisplayOrientation(opt.ORIENTATION === Clutter.Orientation.VERTICAL);
    _updateAppGridProperties();
    _updateAppGridDND();
    opt._appGridNeedsRedisplay = true;
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
            if (appDisplay._hintContainer && appDisplay._hintContainer.get_parent())
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
        if (appDisplay._hintContainer && !appDisplay._hintContainer.get_parent()) {
            scrollContainer.add_child(appDisplay._hintContainer);
            // the hit container covers the entire app grid and added at the top of the stack blocks DND drops
            // so it needs to be pushed below
            scrollContainer.set_child_below_sibling(appDisplay._hintContainer, null);
        }

        appDisplay._nextPageArrow.scale_x = 1;
        appDisplay._prevPageArrow.scale_x = 1;

        appDisplay._nextPageIndicator.remove_style_class_name('nextPageIndicator');
        appDisplay._prevPageIndicator.remove_style_class_name('prevPageIndicator');
    }

    // value for page indicator is calculated from scroll adjustment, horizontal needs to be replaced by vertical
    appDisplay._adjustment = appDisplay._scrollView[scroll].adjustment;

    // no need to connect already connected signal (wasn't removed the original one before)
    if (!vertical) {
        // reset used appDisplay properties
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
    opt._appGridNeedsRedisplay = false;
    // columns, rows, icon size
    const appDisplay = Main.overview._overview._controls._appDisplay;
    appDisplay.visible = true;

    if (reset) {
        _resetAppGrid();
        appDisplay._grid.layoutManager.fixedIconSize = -1;
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
        appDisplay._grid.layoutManager.allow_incomplete_pages = opt.APP_GRID_ALLOW_INCOMPLETE_PAGES;
        // remove icons from App Grid
        _resetAppGrid();

        // force redisplay
        appDisplay._grid._currentMode = -1;
        appDisplay._grid.setGridModes();
        appDisplay._grid.layoutManager.fixedIconSize = opt.APP_GRID_ICON_SIZE;

        // force rebuild icons. size shouldn't be the same as the current one, otherwise can be arbitrary
        appDisplay._grid.layoutManager.adaptToSize(200, 200);
        appDisplay._redisplay();

        // update app icon labels in case APP_GRID FULL_NAMES changed
        appDisplay._orderedItems.forEach(icon => {
            if (icon._updateMultiline)
                icon._updateMultiline();
        });
    }
}

function _updateAppGridDND(reset) {
    if (!reset) {
        if (!_appSystemStateConId && opt.APP_GRID_INCLUDE_DASH >= 3) {
            _appSystemStateConId = Shell.AppSystem.get_default().connect(
                'app-state-changed',
                () => {
                    _updateFolderIcons = true;
                    Main.overview._overview._controls._appDisplay._redisplay();
                }
            );
        }
    } else if (_appSystemStateConId) {
        Shell.AppSystem.get_default().disconnect(_appSystemStateConId);
        _appSystemStateConId = 0;
    }
    if (opt.APP_GRID_ORDER && !reset) {
        if (!_origAppViewItemAcceptDrop)
            _origAppViewItemAcceptDrop = AppDisplay.AppViewItem.prototype.acceptDrop;
        AppDisplay.AppViewItem.prototype.acceptDrop = () => false;
    } else if (_origAppViewItemAcceptDrop) {
        AppDisplay.AppViewItem.prototype.acceptDrop = _origAppViewItemAcceptDrop;
    }
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

const AppDisplayCommon = {
    _ensureDefaultFolders() {
        // disable creation of default folders if user deleted them
    },

    // apps load adapted for custom sorting and including dash items
    _loadApps() {
        let appIcons = [];
        const runningApps = Shell.AppSystem.get_default().get_running().map(a => a.id);

        this._appInfoList = Shell.AppSystem.get_default().get_installed().filter(appInfo => {
            try {
                appInfo.get_id(); // catch invalid file encodings
            } catch (e) {
                return false;
            }

            const appIsRunning = runningApps.includes(appInfo.get_id());
            const appIsFavorite = this._appFavorites.isFavorite(appInfo.get_id());
            const excludeApp = (opt.APP_GRID_EXCLUDE_RUNNING && appIsRunning) || (opt.APP_GRID_EXCLUDE_FAVORITES && appIsFavorite);

            return this._parentalControlsManager.shouldShowApp(appInfo) && !excludeApp;
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
                } else if (_updateFolderIcons && opt.APP_GRID_EXCLUDE_RUNNING) {
                    // if any app changed its running state, update folder icon
                    icon.icon.update();
                }

                if (!icon.visible) {
                    icon.destroy();
                    return;
                }

                appIcons.push(icon);
                this._folderIcons.push(icon);

                icon.getAppIds().forEach(appId => appsInsideFolders.add(appId));
            });
        }
        // reset request for active icon update
        _updateFolderIcons = false;

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

    // support active preview icons
    _onDragBegin(overview, source) {
        if (source._sourceItem)
            source = source._sourceItem;

        this._dragMonitor = {
            dragMotion: this._onDragMotion.bind(this),
        };
        DND.addDragMonitor(this._dragMonitor);
        if (shellVersion < 43)
            this._slideSidePages(AppDisplay.SidePages.PREVIOUS | AppDisplay.SidePages.NEXT | AppDisplay.SidePages.DND);
        else
            this._appGridLayout.showPageIndicators();
        this._dragFocus = null;
        this._swipeTracker.enabled = false;

        // When dragging from a folder dialog, the dragged app icon doesn't
        // exist in AppDisplay. We work around that by adding a placeholder
        // icon that is either destroyed on cancel, or becomes the effective
        // new icon when dropped.
        if (AppDisplay._getViewFromIcon(source) instanceof AppDisplay.FolderView ||
            (opt.APP_GRID_EXCLUDE_FAVORITES && this._appFavorites.isFavorite(source.id)))
            this._ensurePlaceholder(source);
    },

    _ensurePlaceholder(source) {
        if (this._placeholder)
            return;

        if (source._sourceItem)
            source = source._sourceItem;

        const appSys = Shell.AppSystem.get_default();
        const app = appSys.lookup_app(source.id);

        const isDraggable =
            global.settings.is_writable('favorite-apps') ||
            global.settings.is_writable('app-picker-layout');

        this._placeholder = new AppDisplay.AppIcon(app, { isDraggable });
        this._placeholder.connect('notify::pressed', () => {
            if (this._placeholder?.pressed)
                this.updateDragFocus(this._placeholder);
        });
        this._placeholder.scaleAndFade();
        this._redisplay();
    },

    // accept source from active preview
    acceptDrop(source) {
        if (opt.APP_GRID_ORDER)
            return false;
        if (source._sourceItem)
            source = source._sourceItem;

        let dropTarget = null;
        if (shellVersion >= 43) {
            dropTarget = this._dropTarget;
            delete this._dropTarget;
        }

        if (!this._canAccept(source))
            return false;

        if ((shellVersion < 43 && this._dropPage) ||
            (shellVersion >= 43 && (dropTarget === this._prevPageIndicator ||
            dropTarget === this._nextPageIndicator))) {
            let increment;

            if (shellVersion < 43)
                increment = this._dropPage === AppDisplay.SidePages.NEXT ? 1 : -1;
            else
                increment = dropTarget === this._prevPageIndicator ? -1 : 1;

            const { currentPage, nPages } = this._grid;
            const page = Math.min(currentPage + increment, nPages);
            const position = page < nPages ? -1 : 0;

            this._moveItem(source, page, position);
            this.goToPage(page);
        } else if (this._delayedMoveData) {
            // Dropped before the icon was moved
            const { page, position } = this._delayedMoveData;

            this._moveItem(source, page, position);
            this._removeDelayedMove();
        }

        this._savePages();

        let view = AppDisplay._getViewFromIcon(source);
        if (view instanceof AppDisplay.FolderView)
            view.removeApp(source.app);

        if (this._currentDialog)
            this._currentDialog.popdown();

        if (opt.APP_GRID_EXCLUDE_FAVORITES && this._appFavorites.isFavorite(source.id))
            this._appFavorites.removeFavorite(source.id);

        return true;
    },
};

const BaseAppViewVertical = {
    // <= 42 only, this fixes dnd from appDisplay to the workspace thumbnail on the left if appDisplay is on page 1 because of appgrid left overshoot
    _pageForCoords() {
        return AppDisplay.SidePages.NONE;
    },
};

const BaseAppViewCommon = {
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
            try {
                this._removeItem(icon);
            } catch (e) {
                log(`Warning:${e}`);
            } finally {
                if (icon)
                    icon.destroy();
            }
        });

        // Add new app icons, or move existing ones
        newApps.forEach(icon => {
            const [page, position] = this._getItemPosition(icon);
            if (addedApps.includes(icon)) {
                try {
                    this._addItem(icon, page, position);
                } catch (e) {
                    log(`Warning:${e}`);
                }
            } else if (page !== -1 && position !== -1) {
                try {
                    this._moveItem(icon, page, position);
                } catch (e) {
                    log(`Warning:${e}`);
                }
            }
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
            if (opt.APP_GRID_DASH_FIRST) {
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
            if (opt.APP_GRID_DASH_FIRST)
                appIcons.sort((a, b) => a.app.get_state() !== Shell.AppState.RUNNING && b.app.get_state() === Shell.AppState.RUNNING);


            appIcons.forEach((icon, i) => {
                const page = Math.floor(i / itemsPerPage);
                const position = i % itemsPerPage;
                try {
                    this._moveItem(icon, page, position);
                } catch (e) {
                    log(`Warning:${e}`);
                }
            });

            this._orderedItems = appIcons;
        }

        this.emit('view-loaded');
    },

    _canAccept(source) {
        return opt.APP_GRID_ORDER ? false : source instanceof AppDisplay.AppViewItem;
    },

    // support active preview icons
    acceptDrop(source) {
        if (!this._canAccept(source))
            return false;

        if (source._sourceItem)
            source = source._sourceItem;


        if (this._dropPage) {
            const increment = this._dropPage === AppDisplay.SidePages.NEXT ? 1 : -1;
            const { currentPage, nPages } = this._grid;
            const page = Math.min(currentPage + increment, nPages);
            const position = page < nPages ? -1 : 0;

            this._moveItem(source, page, position);
            this.goToPage(page);
        } else if (this._delayedMoveData) {
            // Dropped before the icon was moved
            const { page, position } = this._delayedMoveData;

            this._moveItem(source, page, position);
            this._removeDelayedMove();
        }

        return true;
    },

    // support active preview icons
    _onDragMotion(dragEvent) {
        if (!(dragEvent.source instanceof AppDisplay.AppViewItem))
            return DND.DragMotionResult.CONTINUE;

        if (dragEvent.source._sourceItem)
            dragEvent.source = dragEvent.source._sourceItem;

        const appIcon = dragEvent.source;

        if (shellVersion < 43) {
            this._dropPage = this._pageForCoords(dragEvent.x, dragEvent.y);
            if (this._dropPage &&
               this._dropPage === AppDisplay.SidePages.PREVIOUS &&
               this._grid.currentPage === 0) {
                delete this._dropPage;
                return DND.DragMotionResult.NO_DROP;
            }
        }

        if (appIcon instanceof AppDisplay.AppViewItem) {
            if (shellVersion < 44) {
                // Handle the drag overshoot. When dragging to above the
                // icon grid, move to the page above; when dragging below,
                // move to the page below.
                this._handleDragOvershoot(dragEvent);
            } else if (!this._dragMaybeSwitchPageImmediately(dragEvent)) {
                // Two ways of switching pages during DND:
                // 1) When "bumping" the cursor against the monitor edge, we switch
                //    page immediately.
                // 2) When hovering over the next-page indicator for a certain time,
                //    we also switch page.

                const { targetActor } = dragEvent;

                if (targetActor === this._prevPageIndicator ||
                            targetActor === this._nextPageIndicator)
                    this._maybeSetupDragPageSwitchInitialTimeout(dragEvent);
                else
                    this._resetDragPageSwitch();
            }
        }

        this._maybeMoveItem(dragEvent);

        return DND.DragMotionResult.CONTINUE;
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

function _openFolderDialog(folderIcon) {
    if (!folderIcon._dialog)
        folderIcon._ensureFolderDialog();
    else if (folderIcon._dialog._designCapacity !== folderIcon._orderedItems.length)
        folderIcon._dialog._updateFolderSize();

    folderIcon._dialog.toggle();
}

const FolderIcon = {
    after__init() {
        /* // If folder preview icons are clickable,
        // disable opening the folder with primary mouse button and enable the secondary one
         const buttonMask = opt.APP_GRID_ACTIVE_PREVIEW
            ? St.ButtonMask.TWO | St.ButtonMask.THREE
            : St.ButtonMask.ONE | St.ButtonMask.TWO;
        this.button_mask = buttonMask;*/
        this.button_mask = St.ButtonMask.ONE | St.ButtonMask.TWO;

        // build the folders now to avoid node errors when dragging active folder preview icons
        if (opt.APP_GRID_ACTIVE_PREVIEW)
            this._ensureFolderDialog();
    },

    open() {
        this._ensureFolderDialog();
        if (this._dialog._designCapacity !== this.view._orderedItems.length)
            this._dialog._updateFolderSize();

        this.view._scrollView.vscroll.adjustment.value = 0;
        this._dialog.popup();
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

    createFolderIcon(size) {
        const layout = new Clutter.GridLayout({
            row_homogeneous: true,
            column_homogeneous: true,
        });

        let icon = new St.Widget({
            layout_manager: layout,
            x_align: Clutter.ActorAlign.CENTER,
            style: `width: ${size}px; height: ${size}px;`,
        });

        const numItems = this._orderedItems.length;
        // decide what number of icons switch to 3x3 grid
        // APP_GRID_FOLDER_ICON_GRID: 3 -> more than 4
        //                          : 4 -> more than 8
        const threshold = opt.APP_GRID_FOLDER_ICON_GRID % 3 ? 8 : 4;
        const gridSize = opt.APP_GRID_FOLDER_ICON_GRID > 2 && numItems > threshold ? 3 : 2;
        const FOLDER_SUBICON_FRACTION = gridSize === 2 ? 0.4 : 0.27;

        let subSize = Math.floor(FOLDER_SUBICON_FRACTION * size);
        let rtl = icon.get_text_direction() === Clutter.TextDirection.RTL;
        for (let i = 0; i < gridSize * gridSize; i++) {
            const style = `width: ${subSize}px; height: ${subSize}px;`;
            let bin = new St.Bin({ style, reactive: true });
            bin.pivot_point = new Graphene.Point({ x: 0.5, y: 0.5 });
            if (i < numItems) {
                if (!opt.APP_GRID_ACTIVE_PREVIEW) {
                    bin.child = this._orderedItems[i].app.create_icon_texture(subSize);
                } else {
                    const app = this._orderedItems[i].app;
                    const child = new ActiveFolderIcon(app);
                    child._sourceItem = this._orderedItems[i];
                    child._sourceFolder = this;
                    child.icon.style_class = '';
                    child.icon.set_style('margin: 0; padding: 0;');
                    child.icon.setIconSize(subSize);

                    bin.child = child;

                    bin.connect('enter-event', () => {
                        bin.ease({
                            duration: 100,
                            scale_x: 1.14,
                            scale_y: 1.14,
                            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                        });
                    });
                    bin.connect('leave-event', () => {
                        bin.ease({
                            duration: 100,
                            scale_x: 1,
                            scale_y: 1,
                            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                        });
                    });
                }
            }

            layout.attach(bin, rtl ? (i + 1) % gridSize : i % gridSize, Math.floor(i / gridSize), 1, 1);
        }

        // if folder content changed, update folder size
        if (this._dialog && this._dialog._designCapacity !== this._orderedItems.length)
            this._dialog._updateFolderSize();

        return icon;
    },

    // this just overrides _redisplay() for GS < 44
    _redisplay() {
        // super._redisplay(); - super doesn't work in my overrides
        AppDisplay.BaseAppView.prototype._redisplay.bind(this)();
    },

    _loadApps() {
        this._apps = [];
        const excludedApps = this._folder.get_strv('excluded-apps');
        const appSys = Shell.AppSystem.get_default();
        const addAppId = appId => {
            if (excludedApps.includes(appId))
                return;

            if (opt.APP_GRID_EXCLUDE_FAVORITES && this._appFavorites.isFavorite(appId))
                return;

            const app = appSys.lookup_app(appId);
            if (!app)
                return;

            if (opt.APP_GRID_EXCLUDE_RUNNING) {
                const runningApps = Shell.AppSystem.get_default().get_running().map(a => a.id);
                if (runningApps.includes(appId))
                    return;
            }

            if (!this._parentalControlsManager.shouldShowApp(app.get_app_info()))
                return;

            if (this._apps.indexOf(app) !== -1)
                return;

            this._apps.push(app);
        };

        const folderApps = this._folder.get_strv('apps');
        folderApps.forEach(addAppId);

        const folderCategories = this._folder.get_strv('categories');
        const appInfos = this._parentView.getAppInfos();
        appInfos.forEach(appInfo => {
            let appCategories = AppDisplay._getCategories(appInfo);
            if (!AppDisplay._listsIntersect(folderCategories, appCategories))
                return;

            addAppId(appInfo.get_id());
        });

        let items = [];
        this._apps.forEach(app => {
            let icon = this._items.get(app.get_id());
            if (!icon)
                icon = new AppDisplay.AppIcon(app);

            items.push(icon);
        });

        return items;
    },

    _getFolderApps() {
        const appIds = [];
        const excludedApps = this._folder.get_strv('excluded-apps');
        const appSys = Shell.AppSystem.get_default();
        const addAppId = appId => {
            if (excludedApps.includes(appId))
                return;

            if (opt.APP_GRID_EXCLUDE_FAVORITES && this._appFavorites.isFavorite(appId))
                return;

            if (opt.APP_GRID_EXCLUDE_RUNNING) {
                const runningApps = Shell.AppSystem.get_default().get_running().map(a => a.id);
                if (runningApps.includes(appId))
                    return;
            }

            const app = appSys.lookup_app(appId);
            if (!app)
                return;

            if (!this._parentalControlsManager.shouldShowApp(app.get_app_info()))
                return;

            if (appIds.indexOf(appId) !== -1)
                return;

            appIds.push(appId);
        };

        const folderApps = this._folder.get_strv('apps');
        folderApps.forEach(addAppId);

        const folderCategories = this._folder.get_strv('categories');
        const appInfos = this._parentView.getAppInfos();
        appInfos.forEach(appInfo => {
            let appCategories = AppDisplay._getCategories(appInfo);
            if (!AppDisplay._listsIntersect(folderCategories, appCategories))
                return;

            addAppId(appInfo.get_id());
        });

        return appIds;
    },
};

// folder columns and rows
const FolderGrid = GObject.registerClass(
class FolderGrid extends IconGrid.IconGrid {
    _init() {
        super._init({
            allow_incomplete_pages: false,
            columns_per_page: opt.APP_GRID_FOLDER_COLUMNS ? opt.APP_GRID_FOLDER_COLUMNS : 3,
            rows_per_page: opt.APP_GRID_FOLDER_ROWS ? opt.APP_GRID_FOLDER_ROWS : 3,
            page_halign: Clutter.ActorAlign.CENTER,
            page_valign: Clutter.ActorAlign.CENTER,
        });

        // if (!opt.APP_GRID_FOLDER_DEFAULT)
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
                columns_per_page: opt.APP_GRID_FOLDER_COLUMNS ? opt.APP_GRID_FOLDER_COLUMNS : 3,
                rows_per_page: opt.APP_GRID_FOLDER_ROWS ? opt.APP_GRID_FOLDER_ROWS : 3,
                page_halign: Clutter.ActorAlign.CENTER,
                page_valign: Clutter.ActorAlign.CENTER,
            });

            // if (!opt.APP_GRID_FOLDER_DEFAULT)
            this.set_style('column-spacing: 10px; row-spacing: 10px;');
            this.layout_manager.fixedIconSize = opt.APP_GRID_FOLDER_ICON_SIZE;

            this.setGridModes([
                {
                    columns: opt.APP_GRID_FOLDER_COLUMNS ? opt.APP_GRID_FOLDER_COLUMNS : 3,
                    rows: opt.APP_GRID_FOLDER_ROWS ? opt.APP_GRID_FOLDER_ROWS : 3,
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
        // delegate this dialog to the FolderIcon._view
        // so its _createFolderIcon function can update the dialog if folder content changed
        this._view._dialog = this;

        // click into the folder popup should close it
        this.child.reactive = true;
        const clickAction = new Clutter.ClickAction();
        clickAction.connect('clicked', () => {
            const [x, y] = clickAction.get_coords();
            const actor = global.stage.get_actor_at_pos(Clutter.PickMode.ALL, x, y);
            // if it's not entry for editing folder title
            if (actor !== this._entry)
                this.popdown();
        });

        this.child.add_action(clickAction);

        this._updateFolderSize();
    },

    _updateFolderSize() {
        // adapt folder size according to the settings and number of icons
        const view = this._view;

        const nItems = view._orderedItems.length;
        let columns = opt.APP_GRID_FOLDER_COLUMNS;
        let rows = opt.APP_GRID_FOLDER_ROWS;

        if (!columns && !rows) {
            columns = Math.round(Math.sqrt(nItems) + 0.49);
            rows = columns;
            if (columns * (columns - 1) >= nItems) {
                rows = columns - 1;
            } else if ((columns + 1) * (columns - 1) >= nItems) {
                rows = columns - 1;
                columns += 1;
            }
        } else if (!columns && rows) {
            columns = Math.ceil(nItems / rows);
        } else if (columns && !rows) {
            rows = Math.ceil(nItems / columns);
        }

        view._grid.layoutManager.rows_per_page = rows;
        view._grid.layoutManager.columns_per_page = columns;

        // this line is required by GS 43
        view._grid.setGridModes([{ columns, rows }]);

        const iconSize = opt.APP_GRID_FOLDER_ICON_SIZE < 0 ? 96 : opt.APP_GRID_FOLDER_ICON_SIZE;
        let width = columns * (iconSize + /* icon padding*/64) + /* padding for nav arrows*/64;
        width = Math.max(540, Math.round(width + width / 10));
        let height = rows * (iconSize + /* icon padding*/64) + /* header*/75 + /* padding*/100;
        this.child.set_style(`
            width: ${width}px;
            height: ${height}px;
            padding: 30px;
        `);

        // store original item count
        view._redisplay();
        this._designCapacity = nItems;
    },

    _zoomAndFadeIn() {
        let [sourceX, sourceY] =
            this._source.get_transformed_position();
        let [dialogX, dialogY] =
            this.child.get_transformed_position();

        const sourceCenterX = sourceX + this._source.width / 2;
        const sourceCenterY = sourceY + this._source.height / 2;

        // this. covers the whole screen
        let dialogTargetX = dialogX;
        let dialogTargetY = dialogY;
        if (!opt.APP_GRID_FOLDER_CENTER) {
            const appDisplay = this._source._parentView;
            dialogTargetX = Math.round(sourceCenterX - this.child.width / 2);

            // keep the dialog in appDisplay area if possible
            dialogTargetX = Math.clamp(
                dialogTargetX,
                this.x + appDisplay.x,
                this.x + appDisplay.x + appDisplay.width - this.child.width
            );

            dialogTargetY = Math.round(sourceCenterY - this.child.height / 2);
            dialogTargetY = Math.clamp(
                dialogTargetY,
                this.y + appDisplay.y,
                this.y + appDisplay.y + appDisplay.height - this.child.height
            );

            // or at least in the monitor area
            const monitor = global.display.get_monitor_geometry(global.display.get_primary_monitor());
            dialogTargetX = Math.clamp(
                dialogTargetX,
                this.x + monitor.x,
                this.x + monitor.x + monitor.width - this.child.width
            );

            dialogTargetY = Math.clamp(
                dialogTargetY,
                this.y + monitor.y,
                this.y + monitor.y + monitor.height - this.child.height
            );
        }
        const dialogOffsetX = -dialogX + dialogTargetX;
        const dialogOffsetY = -dialogY + dialogTargetY;

        this.child.set({
            translation_x: sourceX - dialogX,
            translation_y: sourceY - dialogY,
            scale_x: this._source.width / this.child.width,
            scale_y: this._source.height / this.child.height,
            opacity: 0,
        });

        this.ease({
            background_color: DIALOG_SHADE_NORMAL,
            duration: FOLDER_DIALOG_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                // update folder icons name mode
                this._view._orderedItems.forEach(icon =>
                    icon._updateMultiline());
            },
        });

        this.child.ease({
            translation_x: dialogOffsetX,
            translation_y: dialogOffsetY,
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

    _zoomAndFadeOut() {
        if (!this._isOpen)
            return;

        if (!this._source.mapped) {
            this.hide();
            return;
        }

        let [sourceX, sourceY] =
            this._source.get_transformed_position();
        let [dialogX, dialogY] =
            this.child.get_transformed_position();

        this.ease({
            background_color: Clutter.Color.from_pixel(0x00000000),
            duration: FOLDER_DIALOG_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });

        this.child.ease({
            translation_x: sourceX - dialogX + this.child.translation_x,
            translation_y: sourceY - dialogY + this.child.translation_y,
            scale_x: this._source.width / this.child.width,
            scale_y: this._source.height / this.child.height,
            opacity: 0,
            duration: FOLDER_DIALOG_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this.child.set({
                    translation_x: 0,
                    translation_y: 0,
                    scale_x: 1,
                    scale_y: 1,
                    opacity: 255,
                });
                this.hide();

                this._popdownCallbacks.forEach(func => func());
                this._popdownCallbacks = [];
            },
        });

        this._needsZoomAndFade = false;
    },

    _setLighterBackground(lighter) {
        const backgroundColor = lighter
            ? DIALOG_SHADE_HIGHLIGHT
            : DIALOG_SHADE_NORMAL;

        this.ease({
            backgroundColor,
            duration: FOLDER_DIALOG_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
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
    for (let i = items.length - 1; i > -1; i--) {
        try {
            Main.overview._overview._controls._appDisplay._removeItem(items[i]);
        } catch (e) {
            log(`Warning:${e}`);
        }
    }

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
    /* activate(button) {
        // moved to dash module
    },*/

    // avoid accepting by placeholder when dragging active preview
    _canAccept(source) {
        if (source._sourceItem)
            source = source._sourceItem;
        let view = AppDisplay._getViewFromIcon(source);

        return source !== this &&
               (source instanceof this.constructor) &&
               (view instanceof AppDisplay.AppDisplay);
    },
};

const AppViewItemCommon = {
    _updateMultiline() {
        const { label } = this.icon;
        if (label)
            label.opacity = 255;
        if (!this._expandTitleOnHover || !this.icon.label)
            return;

        const { clutterText } = label;

        const isHighlighted = this.has_key_focus() || this.hover || this._forcedHighlight;

        if (opt.APP_GRID_NAMES_MODE === 2 && this._expandTitleOnHover) { // !_expandTitleOnHover indicates search result icon
            label.opacity = isHighlighted || !this.app ? 255 : 0;
        }
        if (isHighlighted)
            this.get_parent()?.set_child_above_sibling(this, null);

        if (!opt.APP_GRID_NAMES_MODE) {
            const layout = clutterText.get_layout();
            if (!layout.is_wrapped() && !layout.is_ellipsized())
                return;
        }

        label.remove_transition('allocation');

        const id = label.connect('notify::allocation', () => {
            label.restore_easing_state();
            label.disconnect(id);
        });

        const expand = opt.APP_GRID_NAMES_MODE === 1 || this._forcedHighlight || this.hover || this.has_key_focus();

        label.save_easing_state();
        label.set_easing_duration(expand
            ? AppDisplay.APP_ICON_TITLE_EXPAND_TIME
            : AppDisplay.APP_ICON_TITLE_COLLAPSE_TIME);
        clutterText.set({
            line_wrap: expand,
            line_wrap_mode: expand ? Pango.WrapMode.WORD_CHAR : Pango.WrapMode.NONE,
            ellipsize: expand ? Pango.EllipsizeMode.NONE : Pango.EllipsizeMode.END,
        });
    },

    // support active preview icons
    acceptDrop(source, _actor, x) {
        if (opt.APP_GRID_ORDER)
            return DND.DragMotionResult.NO_DROP;

        this._setHoveringByDnd(false);

        if (!this._canAccept(source))
            return false;

        if (this._withinLeeways(x))
            return false;

        // added - remove app from the source folder after dnd to other folder
        if (source._sourceItem) {
            const app = source._sourceItem.app;
            source._sourceFolder.removeApp(app);
        }

        return true;
    },

};

const ActiveFolderIcon = GObject.registerClass(
class ActiveFolderIcon extends AppDisplay.AppIcon {
    _init(app) {
        super._init(app, {
            setSizeManually: true,
            showLabel: false,
        });
    }

    handleDragOver() {
        return DND.DragMotionResult.CONTINUE;
    }

    acceptDrop() {
        return false;
    }

    _onDragEnd() {
        this._dragging = false;
        this.undoScaleAndFade();
        Main.overview.endItemDrag(this._sourceItem.icon);
    }
});
