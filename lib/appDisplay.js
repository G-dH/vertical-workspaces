/**
 * V-Shell (Vertical Workspaces)
 * appDisplay.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2025
 * @license    GPL-3.0
 *
 */

'use strict';

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as AppDisplay from 'resource:///org/gnome/shell/ui/appDisplay.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as PageIndicators from 'resource:///org/gnome/shell/ui/pageIndicators.js';

import { IconSize } from './iconGrid.js';

let Me;
let opt;
// gettext
let _;

let _appDisplay;
let _timeouts;

const APP_ICON_TITLE_EXPAND_TIME = 200;
const APP_ICON_TITLE_COLLAPSE_TIME = 100;

const shellVersion46 = !Clutter.Container; // Container has been removed in 46

function _getCategories(info) {
    let categoriesStr = info.get_categories();
    if (!categoriesStr)
        return [];
    return categoriesStr.split(';');
}

function _listsIntersect(a, b) {
    for (let itemA of a) {
        if (b.includes(itemA))
            return true;
    }
    return false;
}

export const AppDisplayModule = class {
    constructor(me) {
        Me = me;
        opt = Me.opt;
        _  = Me.gettext;

        _appDisplay = Main.overview._overview.controls._appDisplay;

        this._firstActivation = true;
        this.moduleEnabled = false;
        this._overrides = null;

        this._appSystemStateConId =  0;
        this._appGridLayoutConId =  0;
        this._origAppViewItemAcceptDrop =  null;
        this._updateFolderIcons =  0;

        // By default appDisplay.name (which can be used to address styling) is not set
        // In GS 46+ we need to adapt the appDisplay style even if the appDisplay module is disabled,
        // to allow the use of wallpaper in the overview
        if (shellVersion46)
            Main.overview._overview.controls._appDisplay.name = 'app-display';
    }

    cleanGlobals() {
        Me = null;
        opt = null;
        _ = null;
        _appDisplay = null;
        Main.overview._overview.controls._appDisplay.name = null;
    }

    update(reset) {
        this._removeTimeouts();
        this.moduleEnabled = opt.get('appDisplayModule');
        const conflict = false;

        reset = reset || !this.moduleEnabled || conflict;

        // don't touch the original code if module disabled
        if (reset && !this._firstActivation) {
            this._disableModule();
            this.moduleEnabled = false;
        } else if (!reset) {
            this._firstActivation = false;
            this._activateModule();
        }
        if (reset && this._firstActivation) {
            this.moduleEnabled = false;
            console.debug('  AppDisplayModule - Keeping untouched');
        }
    }

    _activateModule() {
        Me.Modules.iconGridModule.update();

        if (!this._overrides)
            this._overrides = new Me.Util.Overrides();

        _timeouts = {};

        this._applyOverrides();
        this._updateAppDisplay();

        console.debug('  AppDisplayModule - Activated');
    }

    _disableModule() {
        Me.Modules.iconGridModule.update(true);
        _appDisplay.setGridPageNulling(true);

        if (this._overrides)
            this._overrides.removeAll();
        this._overrides = null;

        const reset = true;
        this._updateAppDisplay(reset);
        this._restoreOverviewGroup();

        console.debug('  AppDisplayModule - Disabled');
    }

    _removeTimeouts() {
        if (_timeouts) {
            Object.values(_timeouts).forEach(t => {
                if (t)
                    GLib.source_remove(t);
            });
            _timeouts = null;
        }
    }

    _applyOverrides() {
        // Common/appDisplay
        // this._overrides.addOverride('BaseAppViewCommon', AppDisplay.BaseAppView.prototype, BaseAppViewCommon);
        // instead of overriding inaccessible BaseAppView class, we override its subclasses - AppDisplay and FolderView
        this._overrides.addOverride('BaseAppViewCommonApp', AppDisplay.AppDisplay.prototype, BaseAppViewCommon);
        this._overrides.addOverride('AppDisplay', AppDisplay.AppDisplay.prototype, AppDisplayCommon);
        this._overrides.addOverride('AppViewItem', AppDisplay.AppViewItem.prototype, AppViewItemCommon);
        this._overrides.addOverride('AppGridCommon', AppDisplay.AppGrid.prototype, AppGridCommon);
        this._overrides.addOverride('AppIcon', AppDisplay.AppIcon.prototype, AppIcon);
        if (opt.ORIENTATION) {
            this._overrides.removeOverride('AppGridLayoutHorizontal');
            this._overrides.addOverride('AppGridLayoutVertical', _appDisplay._appGridLayout, BaseAppViewGridLayoutVertical);
        } else {
            this._overrides.removeOverride('AppGridLayoutVertical');
            this._overrides.addOverride('AppGridLayoutHorizontal', _appDisplay._appGridLayout, BaseAppViewGridLayoutHorizontal);
        }

        // Custom folders
        this._overrides.addOverride('BaseAppViewCommonFolder', AppDisplay.FolderView.prototype, BaseAppViewCommon);
        this._overrides.addOverride('FolderView', AppDisplay.FolderView.prototype, FolderView);
        this._overrides.addOverride('AppFolderDialog', AppDisplay.AppFolderDialog.prototype, AppFolderDialog);
        this._overrides.addOverride('FolderIcon', AppDisplay.FolderIcon.prototype, FolderIcon);

        // Prevent changing grid page size when showing/hiding _pageIndicators
        this._overrides.addOverride('PageIndicators', PageIndicators.PageIndicators.prototype, PageIndicatorsCommon);
    }

    _updateAppDisplay(reset) {
        const orientation = reset ? Clutter.Orientation.HORIZONTAL : opt.ORIENTATION;
        BaseAppViewCommon._adaptForOrientation.bind(_appDisplay)(orientation);

        this._updateFavoritesConnection(reset);

        _appDisplay.visible = true;
        if (reset) {
            _appDisplay._grid.layoutManager.fixedIconSize = -1;
            _appDisplay._grid.layoutManager.allow_incomplete_pages = true;
            _appDisplay._grid._currentMode = -1;
            _appDisplay._grid.setGridModes();
            _appDisplay._grid.set_style('');
            _appDisplay._prevPageArrow.set_scale(1, 1);
            _appDisplay._nextPageArrow.set_scale(1, 1);
            if (this._appGridLayoutConId) {
                global.settings.disconnect(this._appGridLayoutConId);
                this._appGridLayoutConId = 0;
            }
            this._repopulateAppDisplay(reset);
        } else {
            _appDisplay._grid._currentMode = -1;
            // update grid on layout reset
            if (!this._appGridLayoutConId)
                this._appGridLayoutConId = global.settings.connect('changed::app-picker-layout', this._updateLayout.bind(this));

            // avoid resetting appDisplay before startup animation
            // x11 shell restart skips startup animation
            if (!Main.layoutManager._startingUp) {
                this._repopulateAppDisplay();
            } else if (Main.layoutManager._startingUp && Meta.is_restart()) {
                _timeouts.three = GLib.idle_add(GLib.PRIORITY_LOW, () => {
                    this._repopulateAppDisplay();
                    _timeouts.three = 0;
                    return GLib.SOURCE_REMOVE;
                });
            }
            _appDisplay.setGridPageNulling(!opt.APP_GRID_REMEMBER_PAGE);
        }
    }

    _updateFavoritesConnection(reset) {
        if (!reset) {
            if (!this._appSystemStateConId && opt.APP_GRID_INCLUDE_DASH >= 3) {
                this._appSystemStateConId = Shell.AppSystem.get_default().connect(
                    'app-state-changed',
                    () => {
                        this._updateFolderIcons = true;
                        _appDisplay._redisplay();
                    }
                );
            }
        } else if (this._appSystemStateConId) {
            Shell.AppSystem.get_default().disconnect(this._appSystemStateConId);
            this._appSystemStateConId = 0;
        }
    }

    _restoreOverviewGroup() {
        Main.overview.dash.showAppsButton.checked = false;
        Main.layoutManager.overviewGroup.opacity = 255;
        Main.layoutManager.overviewGroup.scale_x = 1;
        Main.layoutManager.overviewGroup.scale_y = 1;
        Main.layoutManager.overviewGroup.hide();
        _appDisplay.translation_x = 0;
        _appDisplay.translation_y = 0;
        _appDisplay.visible = true;
        _appDisplay.opacity = 255;
    }

    _updateLayout(settings, key) {
        // Reset the app grid only if the user layout has been completely removed
        if (!settings.get_value(key).deep_unpack().length)
            this._repopulateAppDisplay();
    }

    _repopulateAppDisplay(reset = false, callback) {
        // Remove all icons so they can be re-created with the current configuration
        // Updating appGrid content while rebasing extensions when session is locked makes no sense (relevant for GS version < 46)
        if (!Main.sessionMode.isLocked)
            AppDisplayCommon.removeAllItems.bind(_appDisplay)();

        // appDisplay disabled
        if (reset) {
            _appDisplay._redisplay();
            return;
        }

        _appDisplay._readyToRedisplay = true;
        _appDisplay._redisplay();

        // Setting OffscreenRedirect should improve performance when opacity transitions are used
        _appDisplay.offscreen_redirect = Clutter.OffscreenRedirect.ALWAYS;

        if (opt.APP_GRID_PERFORMANCE)
            this._realizeAppDisplay(callback);
        else if (callback)
            callback();
    }

    _realizeAppDisplay(callback) {
        // Workaround - silently realize appDisplay
        // The realization takes some time and affects animations during the first use
        // If we do it invisibly before the user needs the app grid, it can improve the user's experience
        _appDisplay.opacity = 1;

        this._exposeAppGrid();
        _appDisplay._redisplay();
        this._exposeAppFolders();

        // Let the main loop process our changes before we continue
        _timeouts.updateAppGrid = GLib.idle_add(GLib.PRIORITY_LOW, () => {
            this._restoreAppGrid();
            Me._resetInProgress = false;

            if (callback)
                callback();

            _timeouts.updateAppGrid = 0;
            return GLib.SOURCE_REMOVE;
        });
    }

    _exposeAppGrid() {
        const overviewGroup = Main.layoutManager.overviewGroup;
        if (!overviewGroup.visible) {
            // scale down the overviewGroup so it don't cover uiGroup
            overviewGroup.scale_y = 0.001;
            // make it invisible to the eye, but visible for the renderer
            overviewGroup.opacity = 1;
            // if overview is hidden, show it
            overviewGroup.visible = true;
        }
    }

    _restoreAppGrid() {
        if (opt.APP_GRID_PERFORMANCE)
            this._hideAppFolders();

        const overviewGroup = Main.layoutManager.overviewGroup;
        if (!Main.overview._shown)
            overviewGroup.hide();
        overviewGroup.scale_y = 1;
        overviewGroup.opacity = 255;
        _appDisplay.opacity = 0;
        _appDisplay.visible = false;
    }

    _exposeAppFolders() {
        _appDisplay._folderIcons.forEach(d => {
            d._ensureFolderDialog();
            d._dialog.scale_y = 0.0001;
            d._dialog.show();
            d._dialog._updateFolderSize();
        });
    }

    _hideAppFolders() {
        _appDisplay._folderIcons.forEach(d => {
            if (d._dialog) {
                d._dialog.hide();
                d._dialog.scale_y = 1;
            }
        });
    }
};

function _getViewFromIcon(icon) {
    icon = icon._sourceItem ? icon._sourceItem : icon;
    for (let parent = icon.get_parent(); parent; parent = parent.get_parent()) {
        if (parent instanceof AppDisplay.AppDisplay || parent instanceof AppDisplay.FolderView)
            return parent;
    }
    return null;
}

const AppDisplayCommon = {
    _ensureDefaultFolders() {
        // disable creation of default folders if user deleted them
    },

    removeAllItems() {
        this._orderedItems.slice().forEach(item => {
            if (item._dialog)
                Main.layoutManager.overviewGroup.remove_child(item._dialog);

            this._removeItem(item);
            item.destroy();
        });
        this._folderIcons = [];
    },

    // apps load adapted for custom sorting and including dash items
    _loadApps(results) {
        let appIcons = [];
        const runningApps = Shell.AppSystem.get_default().get_running().map(a => a.id);

        this._appInfoList = Shell.AppSystem.get_default().get_installed().filter(appInfo => {
            try {
                appInfo.get_id(); // catch invalid file encodings
            } catch {
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
        if (!(opt.APP_GRID_USAGE || results)) {
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
                } else if (this._updateFolderIcons && opt.APP_GRID_EXCLUDE_RUNNING) {
                // if any app changed its running state, update folder icon
                    icon.icon.update();
                }

                // remove empty folder icons
                if (!icon.visible) {
                    icon.destroy();
                    return;
                }

                appIcons.push(icon);
                this._folderIcons.push(icon);

                icon.getAppIds().forEach(appId => appsInsideFolders.add(appId));
            });
        }

        // reset request to update active icon
        this._updateFolderIcons = false;

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
            if (!opt.APP_GRID_USAGE && appsInsideFolders.has(appId))
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

    _onDragBegin(overview, source) {
        // let sourceId;
        // support active preview icons
        if (source._sourceItem) {
            // sourceId = source._sourceFolder._id;
            source = source._sourceItem;
        } /* else {
            sourceId = source.id;
        }*/
        // Prevent switching page when an item on another page is selected
        // by removing the focus from all icons
        // This is an upstream bug
        // this.selectApp(sourceId);
        this.grab_key_focus();

        this._dragMonitor = {
            dragMotion: this._onDragMotion.bind(this),
            dragDrop: this._onDragDrop.bind(this),
        };
        DND.addDragMonitor(this._dragMonitor);

        this._appGridLayout.showPageIndicators();
        this._dragFocus = null;
        this._swipeTracker.enabled = false;

        // When dragging from a folder dialog, the dragged app icon doesn't
        // exist in AppDisplay. We work around that by adding a placeholder
        // icon that is either destroyed on cancel, or becomes the effective
        // new icon when dropped.
        if (/* AppDisplay.*/_getViewFromIcon(source) instanceof AppDisplay.FolderView ||
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

    // accept source from active folder preview
    acceptDrop(source) {
        if (opt.APP_GRID_USAGE)
            return false;
        if (source._sourceItem)
            source = source._sourceItem;
        if (!this._acceptDropCommon(source))
            return false;

        this._savePages();

        const view = /* AppDisplay.*/_getViewFromIcon(source);
        if (view instanceof AppDisplay.FolderView)
            view.removeApp(source.app);

        if (this._currentDialog)
            this._currentDialog.popdown();

        if (opt.APP_GRID_EXCLUDE_FAVORITES && this._appFavorites.isFavorite(source.id))
            this._appFavorites.removeFavorite(source.id);
        return true;
    },

    _savePages() {
        // Skip saving pages when search app grid mode is active
        // and the grid is showing search results
        if (Main.overview._overview.controls._origAppGridContent)
            return;

        const pages = [];

        for (let i = 0; i < this._grid.nPages; i++) {
            const pageItems =
                this._grid.getItemsAtPage(i).filter(c => c.visible);
            const pageData = {};

            pageItems.forEach((item, index) => {
                pageData[item.id] = {
                    position: GLib.Variant.new_int32(index),
                };
            });
            pages.push(pageData);
        }

        this._pageManager.pages = pages;
    },
};

const BaseAppViewCommon = {
    after__init() {
        // Only folders can run this init
        this._isFolder = true;

        this._adaptForOrientation(opt.ORIENTATION, true);

        // Because the original class prototype is not exported, we need to inject every instance
        const overrides = new Me.Util.Overrides();
        if (opt.ORIENTATION) {
            overrides.addOverride('FolderGridLayoutVertical', this._appGridLayout, BaseAppViewGridLayoutVertical);
            this._pageIndicators.set_style('margin-right: 22px;');
        } else {
            overrides.addOverride('FolderGridLayoutHorizontal', this._appGridLayout, BaseAppViewGridLayoutHorizontal);
            this._pageIndicators.set_style('margin-bottom: 22px;');
        }

        this.setGridPageNulling(!opt.APP_GRID_REMEMBER_PAGE);
        // This callback is executed after the overrides are removed
        this.connect('destroy', () => {
            if (this._overviewHiddenId) {
                Main.overview.disconnect(this._overviewHiddenId);
                this._overviewHiddenId = 0;
            }
        });
    },

    _adaptForOrientation(orientation, folder) {
        const vertical = !!orientation;

        this._grid.layoutManager.fixedIconSize = folder ? opt.APP_GRID_FOLDER_ICON_SIZE : opt.APP_GRID_ICON_SIZE;
        this._grid.layoutManager._orientation = orientation;
        this._orientation = orientation;
        this._swipeTracker.orientation = orientation;
        this._swipeTracker._reset();

        if (this._scrollView.get_vadjustment) {
            this._adjustment = vertical
                ? this._scrollView.get_vadjustment()
                : this._scrollView.get_hadjustment();
        } else {
            this._adjustment = vertical
                ? this._scrollView.get_vscroll_bar().adjustment
                : this._scrollView.get_hscroll_bar().adjustment;
        }

        this._prevPageArrow.set_pivot_point(0.5, 0.5);
        this._prevPageArrow.rotation_angle_z = vertical ? 90 : 0;

        this._nextPageArrow.set_pivot_point(0.5, 0.5);
        this._nextPageArrow.rotation_angle_z = vertical ? 90 : 0;

        const pageIndicators = this._pageIndicators;
        if (pageIndicators.orientation !== undefined) { // since GNOME 48
            pageIndicators.orientation = orientation;
            this._box.orientation = vertical
                ? Clutter.Orientation.HORIZONTAL
                : Clutter.Orientation.VERTICAL;
        } else {
            pageIndicators.vertical = vertical;
            this._box.vertical = !vertical;
        }

        pageIndicators.x_expand = !vertical;
        pageIndicators.y_align = vertical ? Clutter.ActorAlign.CENTER : Clutter.ActorAlign.START;
        pageIndicators.x_align = vertical ? Clutter.ActorAlign.START : Clutter.ActorAlign.CENTER;

        this._grid.layoutManager.allow_incomplete_pages = folder ? false : opt.APP_GRID_ALLOW_INCOMPLETE_PAGES;
        const spacing = folder ? opt.APP_GRID_FOLDER_SPACING : opt.APP_GRID_SPACING;
        this._grid.set_style(`column-spacing: ${spacing}px; row-spacing: ${spacing}px;`);

        if (vertical) {
            this._scrollView.set_policy(St.PolicyType.NEVER, St.PolicyType.EXTERNAL);
            if (!this._scrollConId) {
                this._scrollConId = this._adjustment.connect('notify::value', adj => {
                    const value = adj.value / adj.page_size;
                    this._pageIndicators.setCurrentPosition(value);
                });
            }
            pageIndicators.remove_style_class_name('page-indicators-horizontal');
            pageIndicators.add_style_class_name('page-indicators-vertical');
            this._prevPageIndicator.add_style_class_name('prev-page-indicator');
            this._nextPageIndicator.add_style_class_name('next-page-indicator');
            this._nextPageArrow.translationY = 0;
            this._prevPageArrow.translationY = 0;
            this._nextPageIndicator.translationX = 0;
            this._prevPageIndicator.translationX = 0;
        } else {
            this._scrollView.set_policy(St.PolicyType.EXTERNAL, St.PolicyType.NEVER);
            if (this._scrollConId) {
                this._adjustment.disconnect(this._scrollConId);
                this._scrollConId = 0;
            }
            pageIndicators.remove_style_class_name('page-indicators-vertical');
            pageIndicators.add_style_class_name('page-indicators-horizontal');
            this._prevPageIndicator.remove_style_class_name('prev-page-indicator');
            this._nextPageIndicator.remove_style_class_name('next-page-indicator');
            this._nextPageArrow.translationX = 0;
            this._prevPageArrow.translationX = 0;
            this._nextPageIndicator.translationY = 0;
            this._prevPageIndicator.translationY = 0;
        }

        const scale = opt.APP_GRID_SHOW_PAGE_ARROWS ? 1 : 0;
        this._prevPageArrow.set_scale(scale, scale);
        this._nextPageArrow.set_scale(scale, scale);
    },

    _sortItemsByName(items) {
        items.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    },

    _updateItemPositions(icons, allowIncompletePages = false) {
        // Avoid recursion when relocating icons
        this._grid.layoutManager._skipRelocateSurplusItems = true;

        const { itemsPerPage } = this._grid;

        icons.slice().forEach((icon, index) => {
            const [currentPage, currentPosition] = this._grid.layoutManager.getItemPosition(icon);

            let page, position;
            if (allowIncompletePages) {
                [page, position] = this._getItemPosition(icon);
            } else {
                page = Math.floor(index / itemsPerPage);
                position = index % itemsPerPage;
            }

            if (currentPage !== page || currentPosition !== position)
                this._moveItem(icon, page, position);
        });

        this._grid.layoutManager._skipRelocateSurplusItems = false;
        // Disable animating the icons to their new positions
        // since it can cause glitches when the app grid search mode is active
        // and many icons are repositioning at once
        this._grid.layoutManager._shouldEaseItems = false;
    },

    // Adds sorting options / support app search provider
    _redisplay(results) {
        // different options for main app grid and app folders
        const thisIsFolder = this instanceof AppDisplay.FolderView;
        const thisIsAppDisplay = !thisIsFolder;

        // When an app was dragged from a folder and dropped to the main grid
        // folders (if exist) need to be redisplayed even if we temporary block it for the appDisplay
        this._folderIcons?.forEach(icon => {
            icon.view._redisplay();
        });

        // Avoid unwanted updates
        if (thisIsAppDisplay && !this._readyToRedisplay)
            return;

        const oldApps = this._orderedItems.slice();
        const oldAppIds = oldApps.map(icon => icon.id);

        const newApps = this._loadApps(results);
        const newAppIds = newApps.map(icon => icon.id);

        const addedApps = newApps.filter(icon => !oldAppIds.includes(icon.id));
        const removedApps = oldApps.filter(icon => !newAppIds.includes(icon.id));

        // Don't update folder without dialog if its content didn't change
        if (!addedApps.length && !removedApps.length && thisIsFolder && !this.get_parent())
            return;

        // Remove old app icons
        removedApps.forEach(icon => {
            if (this._items.has(icon.id))
                this._removeItem(icon);
            icon.destroy();
        });

        // For the main app grid only
        let allowIncompletePages = thisIsAppDisplay && opt.APP_GRID_ALLOW_INCOMPLETE_PAGES;

        const customOrder = !((opt.APP_GRID_ORDER && thisIsAppDisplay) || (opt.APP_FOLDER_ORDER && thisIsFolder));

        if (results) {
            newApps.sort((a, b) => results.indexOf(a.app.id) > results.indexOf(b.app.id));
        } else if (!customOrder) {
            allowIncompletePages = false;

            // Sort by name
            this._sortItemsByName(newApps);

            // Sort by usage
            if ((opt.APP_GRID_USAGE && thisIsAppDisplay) ||
                (opt.APP_FOLDER_USAGE && thisIsFolder))
                newApps.sort((a, b) => Shell.AppUsage.get_default().compare(a.app?.id, b.app?.id));


            // Sort favorites first
            if (!opt.APP_GRID_EXCLUDE_FAVORITES && opt.APP_GRID_DASH_FIRST) {
                const fav = Object.keys(this._appFavorites._favorites);
                newApps.sort((a, b) => {
                    let aFav = fav.indexOf(a.id);
                    if (aFav < 0)
                        aFav = 999;
                    let bFav = fav.indexOf(b.id);
                    if (bFav < 0)
                        bFav = 999;
                    return bFav < aFav;
                });
            }

            // Sort running first
            if (!opt.APP_GRID_EXCLUDE_RUNNING && opt.APP_GRID_DASH_FIRST)
                newApps.sort((a, b) => a.app?.get_state() !== Shell.AppState.RUNNING && b.app?.get_state() === Shell.AppState.RUNNING);


            // Sort folders first
            if (thisIsAppDisplay && opt.APP_GRID_FOLDERS_FIRST)
                newApps.sort((a, b) => b._folder && !a._folder);

            // Sort folders last
            else if (thisIsAppDisplay && opt.APP_GRID_FOLDERS_LAST)
                newApps.sort((a, b) => a._folder && !b._folder);
        } else {
            // Sort items according to the custom order stored in pageManager
            newApps.sort(this._compareItems.bind(this));
        }

        // Add new app icons to the grid
        newApps.forEach(icon => {
            const [page, position] = this._grid.getItemPosition(icon);
            if (page === -1 && position === -1)
                this._addItem(icon, -1, -1);
        });
        // When a placeholder icon was added to the custom sorted grid during DND from a folder
        // update its initial position on the page
        if (customOrder && !results)
            newApps.sort(this._compareItems.bind(this));

        this._orderedItems = newApps;

        // Update icon positions if needed
        this._updateItemPositions(this._orderedItems, allowIncompletePages);

        // Relocate items with invalid positions
        if (thisIsAppDisplay) {
            const nPages = this._grid.layoutManager.nPages;
            for (let pageIndex = 0; pageIndex < nPages; pageIndex++)
                this._grid.layoutManager._relocateSurplusItems(pageIndex);
        }

        this.emit('view-loaded');
    },

    _canAccept(source) {
        return source instanceof AppDisplay.AppViewItem;
    },

    // this method is replacing BaseAppVew.acceptDrop which can't be overridden directly
    _acceptDropCommon(source) {
        const dropTarget = this._dropTarget;
        delete this._dropTarget;
        if (!this._canAccept(source))
            return false;

        if (dropTarget === this._prevPageIndicator ||
            dropTarget === this._nextPageIndicator) {
            let increment;
            increment = dropTarget === this._prevPageIndicator ? -1 : 1;
            const { currentPage, nPages } = this._grid;
            const page = Math.min(currentPage + increment, nPages);
            const position = page < nPages ? -1 : 0;

            this._moveItem(source, page, position);
            this.goToPage(page);
        } else if (this._delayedMoveData) {
            // Dropped before the icon was moved
            const { page, position } = this._delayedMoveData;
            try {
                this._moveItem(source, page, position);
            } catch (e) {
                console.warn(`Warning:${e}`);
            }
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

        if (appIcon instanceof AppDisplay.AppViewItem) {
            if (!this._dragMaybeSwitchPageImmediately(dragEvent)) {
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

        const thisIsFolder = this instanceof AppDisplay.FolderView;
        const thisIsAppDisplay = !thisIsFolder;

        // Prevent reorganizing the main app grid icons when an app folder is open and when sorting is not custom
        // For some reason in V-Shell the drag motion events propagate from folder to main grid, which is not a problem in default code - so test the open dialog
        if (!this._currentDialog && (!opt.APP_GRID_ORDER && thisIsAppDisplay) || (!opt.APP_FOLDER_ORDER  && thisIsFolder))
            this._maybeMoveItem(dragEvent);

        return DND.DragMotionResult.CONTINUE;
    },

    setGridPageNulling(active = false) {
        if (active && !this._overviewHiddenId) {
            this._overviewHiddenId = Main.overview.connect('hidden', () => this.goToPage(0));
        } else if (!active && this._overviewHiddenId) {
            Main.overview.disconnect(this._overviewHiddenId);
            this._overviewHiddenId = 0;
        }
    },
};

const BaseAppViewGridLayoutHorizontal = {
    _getIndicatorsWidth(box) {
        const [width, height] = box.get_size();
        const arrows = [
            this._nextPageArrow,
            this._previousPageArrow,
        ];

        let minArrowsWidth;

        minArrowsWidth = arrows.reduce(
            (previousWidth, accessory) => {
                const [min] = accessory.get_preferred_width(height);
                return Math.max(previousWidth, min);
            }, 0);

        minArrowsWidth = opt.APP_GRID_SHOW_PAGE_ARROWS ? minArrowsWidth : 0;

        const indicatorWidth = !this._grid._isFolder
            ? minArrowsWidth + ((width - minArrowsWidth) * (1 - opt.APP_GRID_PAGE_WIDTH_SCALE)) / 2
            : minArrowsWidth + 6;

        return Math.round(indicatorWidth);
    },

    vfunc_allocate(container, box) {
        const ltr = container.get_text_direction() !== Clutter.TextDirection.RTL;
        const indicatorsWidth = this._getIndicatorsWidth(box);

        const pageIndicatorsHeight = 20; // _appDisplay._pageIndicators.height is unstable, 20 is determined by the style
        const availHeight = box.get_height() - pageIndicatorsHeight;
        const vPadding = Math.round((availHeight - availHeight * opt.APP_GRID_PAGE_HEIGHT_SCALE) / 2);
        this._grid.indicatorsPadding = new Clutter.Margin({
            left: indicatorsWidth,
            right: indicatorsWidth,
            top: vPadding + pageIndicatorsHeight,
            bottom: vPadding,
        });

        this._scrollView.allocate(box);

        const leftBox = box.copy();
        leftBox.x2 = leftBox.x1 + indicatorsWidth;

        const rightBox = box.copy();
        rightBox.x1 = rightBox.x2 - indicatorsWidth;

        this._previousPageIndicator.allocate(ltr ? leftBox : rightBox);
        this._previousPageArrow.allocate_align_fill(ltr ? leftBox : rightBox,
            0.5, 0.5, false, false);
        this._nextPageIndicator.allocate(ltr ? rightBox : leftBox);
        this._nextPageArrow.allocate_align_fill(ltr ? rightBox : leftBox,
            0.5, 0.5, false, false);

        this._pageWidth = box.get_width();

        // Center page arrow buttons
        const arrowOffset = this._grid._isFolder ? -pageIndicatorsHeight : pageIndicatorsHeight / 2;
        this._previousPageArrow.translationY = arrowOffset;
        this._nextPageArrow.translationY = arrowOffset;
        // Reset page indicators vertical position
        this._nextPageIndicator.translationY = 0;
        this._previousPageIndicator.translationY = 0;
    },
};

const BaseAppViewGridLayoutVertical = {
    _getIndicatorsHeight(box) {
        const [width, height] = box.get_size();
        const arrows = [
            this._nextPageArrow,
            this._previousPageArrow,
        ];

        let minArrowsHeight;

        minArrowsHeight = arrows.reduce(
            (previousHeight, accessory) => {
                const [min] = accessory.get_preferred_height(width);
                return Math.max(previousHeight, min);
            }, 0);

        minArrowsHeight = opt.APP_GRID_SHOW_PAGE_ARROWS ? minArrowsHeight : 0;

        const indicatorHeight = !this._grid._isFolder
            ? minArrowsHeight + ((height - minArrowsHeight) * (1 - opt.APP_GRID_PAGE_HEIGHT_SCALE)) / 2
            : minArrowsHeight + 6;

        return Math.round(indicatorHeight);
    },

    _syncPageIndicators() {
        if (!this._container)
            return;

        const { value } = this._pageIndicatorsAdjustment;

        const { top, bottom } = this._grid.indicatorsPadding;
        const topIndicatorOffset = -top * (1 - value);
        const bottomIndicatorOffset = bottom * (1 - value);

        this._previousPageIndicator.translationY =
            topIndicatorOffset;
        this._nextPageIndicator.translationY =
            bottomIndicatorOffset;

        const leftArrowOffset = -top * value;
        const rightArrowOffset = bottom * value;

        this._previousPageArrow.translationY =
            leftArrowOffset;
        this._nextPageArrow.translationY =
            rightArrowOffset;

        // Page icons
        this._translatePreviousPageIcons(value);
        this._translateNextPageIcons(value);

        if (this._grid.nPages > 0) {
            this._grid.getItemsAtPage(this._currentPage).forEach(icon => {
                icon.translationY = 0;
            });
        }
    },

    _translatePreviousPageIcons(value) {
        if (this._currentPage === 0)
            return;

        const pageHeight = this._grid.layoutManager._pageHeight;
        const previousPage = this._currentPage - 1;
        const icons = this._grid.getItemsAtPage(previousPage).filter(i => i.visible);
        if (icons.length === 0)
            return;

        const { top } = this._grid.indicatorsPadding;
        const { rowSpacing } = this._grid.layoutManager;
        const endIcon = icons[icons.length - 1];
        let iconOffset;

        const currentPageOffset = pageHeight * this._currentPage;
        iconOffset = currentPageOffset - endIcon.allocation.y1 - endIcon.width + top - rowSpacing;

        for (const icon of icons)
            icon.translationY = iconOffset * value;
    },

    _translateNextPageIcons(value) {
        if (this._currentPage >= this._grid.nPages - 1)
            return;

        const nextPage = this._currentPage + 1;
        const icons = this._grid.getItemsAtPage(nextPage).filter(i => i.visible);
        if (icons.length === 0)
            return;

        const { bottom } = this._grid.indicatorsPadding;
        const { rowSpacing } = this._grid.layoutManager;
        let iconOffset;

        const pageOffset = this._pageHeight * nextPage;
        iconOffset = pageOffset - icons[0].allocation.y1 - bottom + rowSpacing;

        for (const icon of icons)
            icon.translationY = iconOffset * value;
    },

    vfunc_allocate(container, box) {
        const indicatorsHeight = this._getIndicatorsHeight(box);

        const pageIndicatorsWidth = 20; // _appDisplay._pageIndicators.width is not stable, 20 is determined by the style
        const availWidth = box.get_width() - pageIndicatorsWidth;
        const hPadding = Math.round((availWidth - availWidth * opt.APP_GRID_PAGE_WIDTH_SCALE) / 2);

        this._grid.indicatorsPadding = new Clutter.Margin({
            top: indicatorsHeight,
            bottom: indicatorsHeight,
            left: hPadding + pageIndicatorsWidth,
            right: hPadding,
        });

        this._scrollView.allocate(box);

        const topBox = box.copy();
        topBox.y2 = topBox.y1 + indicatorsHeight;

        const bottomBox = box.copy();
        bottomBox.y1 = bottomBox.y2 - indicatorsHeight;

        this._previousPageIndicator.allocate(topBox);
        this._previousPageArrow.allocate_align_fill(topBox,
            0.5, 0.5, false, false);
        this._nextPageIndicator.allocate(bottomBox);
        this._nextPageArrow.allocate_align_fill(bottomBox,
            0.5, 0.5, false, false);

        this._pageHeight = box.get_height();

        // Center page arrow buttons
        this._previousPageArrow.translationX = pageIndicatorsWidth / 2;
        this._nextPageArrow.translationX = pageIndicatorsWidth / 2;
        // Reset page indicators vertical position
        this._nextPageIndicator.translationX = 0;
        this._previousPageIndicator.translationX = 0;
    },
};

const AppGridCommon = {
    _updatePadding() {
        const { rowSpacing, columnSpacing } = this.layoutManager;

        const padding = this._indicatorsPadding.copy();

        padding.left += rowSpacing;
        padding.right += rowSpacing;
        padding.top += columnSpacing;
        padding.bottom += columnSpacing;

        this.layoutManager.pagePadding = padding;
    },
};

const FolderIcon = {
    after__init() {
        this.button_mask = St.ButtonMask.ONE | St.ButtonMask.TWO | St.ButtonMask.THREE;
    },

    // Add support for dropping folder on workspace preview and workspace thumbnails
    // shellWorkspaceLaunch() is the official support for extensions
    shellWorkspaceLaunch(data) {
        for (let app of this.view._apps)
            app.open_new_window(data.workspace);

        const actor = data.actor;
        if (actor)
            Me.Util.zoomOutActorAtPos(this, actor.x, actor.y);
    },

    open() {
        // Prevent switching page when an item on another page is selected
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            // Select folder icon to prevent switching page to the one with currently selected icon
            this._parentView._selectAppInternal(this._id);
            // Remove key focus from the selected icon to prevent switching page after dropping the removed folder icon on another page of the main grid
            this._parentView.grab_key_focus();
            this._ensureFolderDialog();
            this._dialog.popup();
        });
    },

    vfunc_clicked() {
        this.open();
    },

    _canAccept(source) {
        if (!(source instanceof AppDisplay.AppIcon))
            return false;

        const view = _getViewFromIcon(source);
        if (!view /* || !(view instanceof AppDisplay.AppDisplay)*/)
            return false;

        // Disable this test to allow the user to cancel the current DND by dropping the icon on its original source
        /* if (this._folder.get_strv('apps').includes(source.id))
            return false;*/

        return true;
    },

    acceptDrop(source) {
        if (source._sourceItem)
            source = source._sourceItem;

        const accepted = AppViewItemCommon.acceptDrop.bind(this)(source);

        if (!accepted)
            return false;

        // If the icon is already in the folder (user dropped it back on the same folder), skip re-adding it
        if (this._folder.get_strv('apps').includes(source.id))
            return true;

        this._onDragEnd();

        this.view.addApp(source.app);

        return true;
    },
};

const FolderView = {
    _createGrid() {
        let grid = new FolderGrid();
        grid._view = this;
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
            bin.set_pivot_point(0.5, 0.5);
            if (i < numItems) {
                if (!opt.APP_GRID_ACTIVE_PREVIEW) {
                    bin.child = this._orderedItems[i].app.create_icon_texture(subSize);
                } else {
                    const app = this._orderedItems[i].app;
                    const child = new AppDisplay.AppIcon(app, {
                        setSizeManually: true,
                        showLabel: false,
                    });

                    child._sourceItem = this._orderedItems[i];
                    child._sourceFolder = this;
                    child.icon.style_class = '';
                    child.set_style_class_name('');
                    child.icon.set_style('margin: 0; padding: 0;');
                    child._dot.set_style('margin-bottom: 1px;');
                    child.icon.setIconSize(subSize);
                    child._canAccept = () => false;

                    bin.child = child;

                    bin.connect('enter-event', () => {
                        bin.ease({
                            duration: 100,
                            translation_y: -3,
                            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                        });
                    });
                    bin.connect('leave-event', () => {
                        bin.ease({
                            duration: 100,
                            translation_y: 0,
                            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                        });
                    });
                }
            }

            layout.attach(bin, rtl ? (i + 1) % gridSize : i % gridSize, Math.floor(i / gridSize), 1, 1);
        }

        return icon;
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
            let appCategories = /* AppDisplay.*/_getCategories(appInfo);
            if (!_listsIntersect(folderCategories, appCategories))
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

    acceptDrop(source) {
        /* if (!BaseAppViewCommon.acceptDrop.bind(this)(source))
            return false;*/
        if (opt.APP_FOLDER_ORDER)
            return false;
        if (source._sourceItem)
            source = source._sourceItem;

        if (!this._acceptDropCommon(source))
            return false;

        const folderApps = this._orderedItems.map(item => item.id);
        this._folder.set_strv('apps', folderApps);

        return true;
    },
};

const FolderGrid = GObject.registerClass({
    // Registered name should be unique
    GTypeName: `FolderGrid${Math.floor(Math.random() * 1000)}`,
}, class FolderGrid extends AppDisplay.AppGrid {
    _init() {
        super._init({
            allow_incomplete_pages: false,
            // For adaptive size (0), set the numbers high enough to fit all the icons
            // to avoid splitting the icons to pages upon creating the grid
            columns_per_page: 20,
            rows_per_page: 20,
            page_halign: Clutter.ActorAlign.CENTER,
            page_valign: Clutter.ActorAlign.CENTER,
        });
        this.layoutManager._isFolder = true;
        this._isFolder = true;
        const spacing = opt.APP_GRID_FOLDER_SPACING;
        this.set_style(`column-spacing: ${spacing}px; row-spacing: ${spacing}px;`);
        this.layoutManager.fixedIconSize = opt.APP_GRID_FOLDER_ICON_SIZE;

        this.setGridModes([
            {
                columns: 20,
                rows: 20,
            },
        ]);
    }

    _updatePadding() {
        const { scaleFactor } = St.ThemeContext.get_for_stage(global.stage);
        const padding = this._indicatorsPadding.copy();
        let pageIndicatorSize = 0;
        if (opt.ORIENTATION || this._view._pageIndicators._nPages > 1) {
            pageIndicatorSize = Math.round(opt.ORIENTATION
                ? this._view._pageIndicators.get_preferred_width(1000)[1] / scaleFactor
                : this._view._pageIndicators.get_preferred_height(1000)[1] / scaleFactor);
        }

        padding.left = opt.ORIENTATION ? pageIndicatorSize : 0;
        padding.right = 0;
        padding.top = 0;
        padding.bottom = pageIndicatorSize;
        this.layoutManager.pagePadding = padding;
    }
});


const FOLDER_DIALOG_ANIMATION_TIME = 200; // AppDisplay.FOLDER_DIALOG_ANIMATION_TIME
const AppFolderDialog = {
    // injection to _init()
    after__init() {
        // GS 46 changed the aligning to CENTER which restricts max folder dialog size
        this._viewBox.set({
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
        });

        // delegate this dialog to the FolderIcon._view
        // so its _createFolderIcon function can update the dialog if folder content changed
        this._view._dialog = this;

        // right click into the folder popup should close it
        this.child.reactive = true;
        const clickAction = new Clutter.ClickAction();
        clickAction.connect('clicked', act => {
            if (act.get_button() === Clutter.BUTTON_PRIMARY)
                return Clutter.EVENT_STOP;
            const [x, y] = clickAction.get_coords();
            const actor = global.stage.get_actor_at_pos(Clutter.PickMode.ALL, x, y);
            // if it's not entry for editing folder title
            if (actor !== this._entry)
                this.popdown();
            return Clutter.EVENT_STOP;
        });

        this.child.add_action(clickAction);
        // Redundant, added just because of extensions.gnome.org rules
        this.connect('destroy', this._removePopdownTimeout.bind(this));
        this._viewBox.add_style_class_name('app-folder-dialog-translucent');

        // Hide the dialog immediately after an app is activated and overview is hiding
        Main.overview.connectObject('hiding', () => this.hide(), this);
    },

    after__addFolderNameEntry() {
        // edit-folder-button class has been replaced with icon-button class which is not transparent in 46
        this._editButton.add_style_class_name('edit-folder-button');

        // Center title
        if (!opt.APP_FOLDER_CLOSE_BUTTON !== !opt.APP_FOLDER_REMOVE_BUTTON) {
            if (opt.APP_FOLDER_CLOSE_BUTTON) {
                // Add second empty actor to keep the title centered
                const ghostButton = new Clutter.Actor();
                this._entryBox.add_child(ghostButton);
                ghostButton.add_constraint(new Clutter.BindConstraint({
                    source: this._editButton,
                    coordinate: Clutter.BindCoordinate.SIZE,
                }));
                this._entryBox.set_child_at_index(ghostButton, 0);
            } else {
                // Remove the default empty actor which will be replaced by the remove folder button
                this._entryBox.remove_child(this._entryBox.get_first_child());
            }
        }

        // Remove Button
        if (opt.APP_FOLDER_REMOVE_BUTTON) {
            this._removeButton = new St.Button({
                style_class: 'icon-button edit-folder-button',
                button_mask: St.ButtonMask.ONE,
                toggle_mode: false,
                reactive: true,
                can_focus: true,
                x_align: Clutter.ActorAlign.END,
                y_align: Clutter.ActorAlign.CENTER,
                child: new St.Icon({
                    icon_name: 'user-trash-symbolic',
                    icon_size: 16,
                }),
            });

            this._removeButton.connect('clicked', () => {
                if (opt.APP_FOLDER_REMOVE_BUTTON === 1 ||
                    (opt.APP_FOLDER_REMOVE_BUTTON === 2 && Date.now() - this._removeButton._lastClick < Clutter.Settings.get_default().double_click_time)) {
                    // Close dialog to avoid crashes
                    this._isOpen = false;
                    this._grabHelper.ungrab({ actor: this });
                    this.emit('open-state-changed', false);
                    this.hide();
                    this._popdownCallbacks.forEach(func => func());
                    this._popdownCallbacks = [];
                    _appDisplay.ease({
                        opacity: 255,
                        duration: FOLDER_DIALOG_ANIMATION_TIME,
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    });

                    // Reset all keys to delete the relocatable schema
                    this._view._deletingFolder = true; // Upstream property
                    let keys = this._folder.settings_schema.list_keys();
                    for (const key of keys)
                        this._folder.reset(key);

                    let settings = new Gio.Settings({ schema_id: 'org.gnome.desktop.app-folders' });
                    let folders = settings.get_strv('folder-children');
                    folders.splice(folders.indexOf(this._view._id), 1);

                    // remove all abandoned folders (usually my own garbage and unwanted default folders...)
                    /* const appFolders = _appDisplay._folderIcons.map(icon => icon._id);
                    folders.forEach(folder => {
                        if (!appFolders.includes(folder)) {
                            folders.splice(folders.indexOf(folder._id), 1);
                        }
                    });*/
                    settings.set_strv('folder-children', folders);

                    this._view._deletingFolder = false;
                    return;
                }
                this._removeButton._lastClick = Date.now();
            });

            this._entryBox.add_child(this._removeButton);
            this._entryBox.set_child_at_index(this._removeButton, 0);
        }

        // Close button
        if (opt.APP_FOLDER_CLOSE_BUTTON) {
            this._closeButton = new St.Button({
                style_class: 'icon-button edit-folder-button',
                button_mask: St.ButtonMask.ONE,
                toggle_mode: false,
                reactive: true,
                can_focus: true,
                x_align: Clutter.ActorAlign.END,
                y_align: Clutter.ActorAlign.CENTER,
                child: new St.Icon({
                    icon_name: 'window-close-symbolic',
                    icon_size: 16,
                }),
            });

            this._closeButton.connect('clicked', () => {
                this.popdown();
            });

            this._entryBox.add_child(this._closeButton);
        }
    },

    popup() {
        if (this._isOpen)
            return;

        this._isOpen = this._grabHelper.grab({
            actor: this,
            focus: this._editButton,
            onUngrab: () => this.popdown(),
        });

        if (!this._isOpen)
            return;

        this.get_parent().set_child_above_sibling(this, null);

        // _zoomAndFadeIn() is called from the dialog's allocate()
        this._needsZoomAndFade = true;

        this.show();
        // force update folder size
        this._folderAreaBox = null;
        this._updateFolderSize();

        this.emit('open-state-changed', true);
    },

    _setupPopdownTimeout() {
        if (this._popdownTimeoutId > 0)
            return;

        // This timeout is handled in the original code and removed in _onDestroy()
        // All dialogs are destroyed on extension disable()
        this._popdownTimeoutId =
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                this._popdownTimeoutId = 0;
                // Following line fixes upstream bug
                // https://gitlab.gnome.org/GNOME/gnome-shell/-/issues/6164
                this._view._onDragEnd();
                this.popdown();
                return GLib.SOURCE_REMOVE;
            });
    },

    _removePopdownTimeout() {
        if (this._popdownTimeoutId === 0)
            return;

        GLib.source_remove(this._popdownTimeoutId);
        this._popdownTimeoutId = 0;
    },

    vfunc_allocate(box) {
        this._updateFolderSize();

        // super.allocate(box)
        St.Bin.prototype.vfunc_allocate.bind(this)(box);

        // Override any attempt to resize the folder dialog, that happens when some child gets wild
        // Re-allocate the child only if necessary, because it terminates grid animations
        if (this._width && this._height && (this._width !== this.child.width || this._height !== this.child.height))
            this._allocateChild();

        // We can only start zooming after receiving an allocation
        if (this._needsZoomAndFade)
            this._zoomAndFadeIn();
    },

    _allocateChild() {
        const childBox = new Clutter.ActorBox();
        childBox.set_size(this._width, this._height);
        this.child.allocate(childBox);
    },

    // Note that the appDisplay may be off-screen so its coordinates may be shifted
    // However, for _updateFolderSize() it doesn't matter
    // and when _zoomAndFadeIn() is called, appDisplay is on the right place
    _getFolderAreaBox() {
        const appDisplay = this._source._parentView;
        const folderAreaBox = appDisplay.get_allocation_box().copy();
        const searchEntryHeight = opt.SHOW_SEARCH_ENTRY ? Main.overview._overview.controls._searchEntryBin.height : 0;
        folderAreaBox.y1 -= searchEntryHeight;

        // _zoomAndFadeIn() needs an absolute position within a multi-monitor workspace
        const monitorGeometry = global.display.get_monitor_geometry(global.display.get_primary_monitor());
        folderAreaBox.x1 += monitorGeometry.x;
        folderAreaBox.x2 += monitorGeometry.x;
        folderAreaBox.y1 += monitorGeometry.y;
        folderAreaBox.y2 += monitorGeometry.y;

        return folderAreaBox;
    },

    _updateFolderSize() {
        const view = this._view;
        const nItems = view._orderedItems.length;
        const [firstItem] = view._grid.layoutManager._container;
        if (!firstItem)
            return;

        const { scaleFactor } = St.ThemeContext.get_for_stage(global.stage);
        const margin = 18; // see stylesheet .app-folder-dialog-container;

        const folderAreaBox = this._getFolderAreaBox();

        const maxDialogWidth = folderAreaBox.get_width() / scaleFactor;
        const maxDialogHeight = folderAreaBox.get_height() / scaleFactor;

        // We can't build folder if the available space is not available
        if (!isFinite(maxDialogWidth) || !isFinite(maxDialogHeight) || !maxDialogWidth || !maxDialogHeight)
            return;

        // We don't need to recalculate grid if nothing changed
        if (
            this._folderAreaBox?.get_width() === folderAreaBox.get_width() &&
            this._folderAreaBox?.get_height() === folderAreaBox.get_height() &&
            nItems === this._nItems
        )
            return;

        const layoutManager = view._grid.layoutManager;
        const spacing = opt.APP_GRID_FOLDER_SPACING;
        const padding = 40;

        const titleBoxHeight =
            Math.round(this._entryBox.get_preferred_height(-1)[1] / scaleFactor); // ~75
        const minDialogWidth = Math.max(640,
            Math.round(this._entryBox.get_preferred_width(-1)[1] / scaleFactor + 2 * margin));
        const navigationArrowsSize = !opt.APP_GRID_SHOW_PAGE_ARROWS ? 0// padding + one arrow width is sufficient for both arrows
            : Math.round(view._nextPageArrow.get_preferred_width(-1)[1] / scaleFactor);
        let pageIndicatorSize = 0;
        if (opt.ORIENTATION || view._pageIndicators._nPages > 1) {
            pageIndicatorSize = opt.ORIENTATION
                ? view._pageIndicators.get_preferred_width(1000)[1] / scaleFactor
                : view._pageIndicators.get_preferred_height(1000)[1] / scaleFactor;
        }
        const horizontalNavigation = opt.ORIENTATION ? pageIndicatorSize : navigationArrowsSize; // either add padding or arrows
        const verticalNavigation = opt.ORIENTATION ? navigationArrowsSize : pageIndicatorSize;

        // Horizontal size
        const baseWidth = horizontalNavigation + 3 * padding + 2 * margin;
        const maxGridPageWidth = maxDialogWidth - baseWidth;
        // Vertical size
        const baseHeight = titleBoxHeight + verticalNavigation + 2 * padding + 2 * margin;
        const maxGridPageHeight = maxDialogHeight - baseHeight;

        // Will be updated to the actual value later
        let itemPadding = 55;
        const minItemSize = 48 + itemPadding;

        let columns = opt.APP_GRID_FOLDER_COLUMNS;
        let rows = opt.APP_GRID_FOLDER_ROWS;
        const maxColumns = columns ? columns : 100;
        const maxRows = rows ? rows : 100;

        // Find best icon size
        let iconSize = opt.APP_GRID_FOLDER_ICON_SIZE < 0 ? opt.APP_GRID_FOLDER_ICON_SIZE_DEFAULT : opt.APP_GRID_FOLDER_ICON_SIZE;
        if (opt.APP_GRID_FOLDER_ICON_SIZE === -1) {
            let maxIconSize;
            if (columns) {
                const maxItemWidth = (maxGridPageWidth - (columns - 1) * opt.APP_GRID_FOLDER_SPACING) / columns;
                maxIconSize = maxItemWidth - itemPadding;
            }
            if (rows) {
                const maxItemHeight = (maxGridPageHeight - (rows - 1) * spacing) / rows;
                maxIconSize = Math.min(maxItemHeight - itemPadding, maxIconSize);
            }

            if (maxIconSize) {
                // We only need sizes from the default to the smallest
                let iconSizes = Object.values(IconSize).sort((a, b) => b - a);
                iconSizes = iconSizes.slice(iconSizes.indexOf(iconSize));
                for (const size of iconSizes) {
                    iconSize = size;
                    if (iconSize <= maxIconSize)
                        break;
                }
            }
        }

        if ((!columns && !rows) || opt.APP_GRID_FOLDER_ICON_SIZE !== -1) {
            columns = Math.ceil(Math.sqrt(nItems));
            rows = columns;
            if (columns * (columns - 1) >= nItems) {
                rows = columns - 1;
            } else if ((columns + 1) * (columns - 1) >= nItems) {
                rows = columns - 1;
                columns += 1;
            }
        } else if (columns && !rows) {
            rows = Math.ceil(nItems / columns);
        } else if (rows && !columns) {
            columns = Math.ceil(nItems / rows);
        }

        columns = Math.clamp(columns, 1, maxColumns);
        columns = Math.min(nItems, columns);
        rows = Math.clamp(rows, 1, maxRows);

        let itemSize = iconSize + itemPadding;
        // First run sets the grid before we can read the real icon size
        // so we estimate the size from default properties
        // and correct it in the second run
        if (this.realized) {
            firstItem.icon.setIconSize(iconSize);
            // Item height is inconsistent because it depends on its label height
            const [, firstItemWidth] = firstItem.get_preferred_width(-1);
            const realSize = firstItemWidth / scaleFactor;
            itemSize = realSize;
            itemPadding = realSize - iconSize;
        }

        const gridWidth = columns * (itemSize + spacing);
        let width = gridWidth + baseWidth;
        const gridHeight = rows * (itemSize + spacing);
        let height = gridHeight + baseHeight;

        // Folder must fit the appDisplay area plus searchEntryBin if visible
        // reduce columns/rows if needed
        while (height > maxDialogHeight && rows > 1) {
            height -= itemSize + spacing;
            rows -= 1;
        }

        while (width > maxDialogWidth && columns > 1) {
            width -= itemSize + spacing;
            columns -= 1;
        }

        // Try to compensate for the previous reduction if there is a space
        while ((nItems > columns * rows) && ((width + (itemSize + spacing)) <= maxDialogWidth) && (columns < maxColumns)) {
            width += itemSize + spacing;
            columns += 1;
        }

        // remove columns that cannot be displayed
        if (((columns * minItemSize  + (columns - 1) * spacing)) > maxDialogWidth)
            columns = Math.floor(maxDialogWidth / (minItemSize + spacing));

        while ((nItems > columns * rows) && ((height + (itemSize + spacing)) <= maxDialogHeight) && (rows < maxRows)) {
            height += itemSize + spacing;
            rows += 1;
        }
        // remove rows that cannot be displayed
        if ((((rows * minItemSize  + (rows - 1) * spacing))) > maxDialogHeight)
            rows = Math.floor(maxDialogWidth / (minItemSize + spacing));

        // remove size for rows that are empty
        const rowsNeeded = Math.ceil(nItems / columns);
        if (rows > rowsNeeded) {
            height -= (rows - rowsNeeded) * (itemSize + spacing);
            rows -= rows - rowsNeeded;
        }

        // Remove space reserved for page controls and indicator if not used
        if (rows * columns >= nItems) {
            width -= horizontalNavigation;
            height -= verticalNavigation;
        }

        width = Math.clamp(width, minDialogWidth, maxDialogWidth);
        height = Math.min(height, maxDialogHeight);

        layoutManager.columns_per_page = columns;
        layoutManager.rows_per_page = rows;

        layoutManager.fixedIconSize = iconSize;


        // Store data for further use
        this._width = width * scaleFactor;
        this._height = height * scaleFactor;
        this._folderAreaBox = folderAreaBox;
        this._nItems = nItems;

        // Set fixed dialog size to prevent size instability
        this.child.set_size(this._width, this._height);
        this._viewBox.set_style(`width: ${this._width - 2 * margin}px; height: ${this._height - 2 * margin}px;`);
        this._viewBox.set_size(this._width - 2 * margin, this._height - 2 * margin);

        view._redisplay();
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

        const appDisplay = this._source._parentView;

        const folderAreaBox = this._getFolderAreaBox();

        let folderAreaX = folderAreaBox.x1;
        let folderAreaY = folderAreaBox.y1;
        const folderAreaWidth = folderAreaBox.get_width();
        const folderAreaHeight = folderAreaBox.get_height();
        const folder = this.child;

        if (opt.APP_GRID_FOLDER_CENTER) {
            dialogTargetX = folderAreaX + folderAreaWidth / 2 - folder.width / 2;
            dialogTargetY = folderAreaY + (folderAreaHeight / 2 - folder.height / 2) / 2;
        } else {
            const { pagePadding } = appDisplay._grid.layoutManager;
            const hPadding = (pagePadding.left + pagePadding.right) / 2;
            const vPadding = (pagePadding.top + pagePadding.bottom) / 2;
            const minX = Math.min(folderAreaX + hPadding, folderAreaX + (folderAreaWidth - folder.width) / 2);
            const maxX = Math.max(folderAreaX + folderAreaWidth - hPadding - folder.width, folderAreaX + folderAreaWidth / 2 - folder.width / 2);
            const minY = Math.min(folderAreaY + vPadding, folderAreaY + (folderAreaHeight - folder.height) / 2);
            const maxY = Math.max(folderAreaY + folderAreaHeight - vPadding - folder.height, folderAreaY + folderAreaHeight / 2 - folder.height / 2);

            dialogTargetX = sourceCenterX - folder.width / 2;
            dialogTargetX = Math.clamp(dialogTargetX, minX, maxX);
            dialogTargetY = sourceCenterY - folder.height / 2;
            dialogTargetY = Math.clamp(dialogTargetY, minY, maxY);

            // keep the dialog in the appDisplay area
            dialogTargetX = Math.clamp(
                dialogTargetX,
                folderAreaX,
                folderAreaX + folderAreaWidth - folder.width
            );

            dialogTargetY = Math.clamp(
                dialogTargetY,
                folderAreaY,
                folderAreaY + folderAreaHeight - folder.height
            );
        }

        const dialogOffsetX = Math.round(dialogTargetX - dialogX);
        const dialogOffsetY = Math.round(dialogTargetY - dialogY);

        this.child.set({
            translation_x: sourceX - dialogX,
            translation_y: sourceY - dialogY,
            scale_x: this._source.width / this.child.width,
            scale_y: this._source.height / this.child.height,
            opacity: 0,
        });

        // Add a short delay to account for the dialog update time
        // and prevent incomplete animation that disrupts the user experience
        const delay = 20;
        this.child.ease({
            delay,
            translation_x: dialogOffsetX,
            translation_y: dialogOffsetY,
            scale_x: 1,
            scale_y: 1,
            opacity: 255,
            duration: FOLDER_DIALOG_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });

        appDisplay.ease({
            delay,
            opacity: 0,
            duration: FOLDER_DIALOG_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });

        if (opt.SHOW_SEARCH_ENTRY) {
            Main.overview.searchEntry.ease({
                opacity: 0,
                duration: FOLDER_DIALOG_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }

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

        // if the dialog was shown silently, skip animation
        if (this.scale_y < 1) {
            this._needsZoomAndFade = false;
            this.hide();
            this._popdownCallbacks.forEach(func => func());
            this._popdownCallbacks = [];
            return;
        }

        let [sourceX, sourceY] =
            this._source.get_transformed_position();
        let [dialogX, dialogY] =
            this.child.get_transformed_position();

        this.child.ease({
            translation_x: sourceX - dialogX + this.child.translation_x,
            translation_y: sourceY - dialogY + this.child.translation_y,
            scale_x: this._source.width / this.child.width,
            scale_y: this._source.height / this.child.height,
            opacity: 0,
            duration: FOLDER_DIALOG_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
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

        const appDisplay = this._source._parentView;
        appDisplay.ease({
            opacity: 255,
            duration: FOLDER_DIALOG_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
        });

        if (opt.SHOW_SEARCH_ENTRY) {
            Main.overview.searchEntry.ease({
                opacity: 255,
                duration: FOLDER_DIALOG_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_IN_QUAD,
            });
        }

        this._needsZoomAndFade = false;
    },

    _setLighterBackground(lighter) {
        let opacity = 255;
        if (this._isOpen)
            opacity = lighter ? 20 : 0;

        _appDisplay.ease({
            opacity,
            duration: FOLDER_DIALOG_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    },

    vfunc_key_press_event(event) {
        if (global.focus_manager.navigate_from_event(event))
            return Clutter.EVENT_STOP;
        return Clutter.EVENT_PROPAGATE;
    },

    _showFolderLabel() {
        if (this._editButton.checked)
            this._editButton.checked = false;

        this._maybeUpdateFolderName();
        this._switchActor(this._entry, this._folderNameLabel);
        // This line has been added in 47 to fix focus after editing the folder name
        this.navigate_focus(this, St.DirectionType.TAB_FORWARD, false);
    },

    after__onDestroy() {
        Main.overview.disconnectObject(this);
    },
};

const AppIcon = {
    after__init() {
        // update the app label behavior
        this._updateMultiline();
    },

    // avoid accepting by placeholder when dragging active preview
    // and also by icon if usage sorting is used
    _canAccept(source) {
        if (source._sourceItem)
            source = source._sourceItem;

        // Folders in folder are not supported
        if (!(_getViewFromIcon(this) instanceof AppDisplay.AppDisplay) || !this.opacity)
            return false;

        const view = /* AppDisplay.*/_getViewFromIcon(source);
        return source !== this &&
               (source instanceof this.constructor) &&
               // Include drops from folders
               // (view instanceof AppDisplay.AppDisplay &&
               (view &&
                !opt.APP_GRID_USAGE);
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
            ? APP_ICON_TITLE_EXPAND_TIME
            : APP_ICON_TITLE_COLLAPSE_TIME);
        clutterText.set({
            line_wrap: expand,
            line_wrap_mode: expand ? Pango.WrapMode.WORD_CHAR : Pango.WrapMode.NONE,
            ellipsize: expand ? Pango.EllipsizeMode.NONE : Pango.EllipsizeMode.END,
        });
    },

    // support active preview icons
    acceptDrop(source, _actor, x) {
        if (opt.APP_GRID_USAGE)
            return DND.DragMotionResult.NO_DROP;

        this._setHoveringByDnd(false);

        if (!this._canAccept(source))
            return false;

        if (this._withinLeeways(x))
            return false;

        // added - remove app from the source folder after dnd to other folder
        let view = /* AppDisplay.*/_getViewFromIcon(source);
        if (view instanceof AppDisplay.FolderView)
            view.removeApp(source.app);

        return true;
    },

};

const PageIndicatorsCommon = {
    after_setNPages() {
        this.visible = true;
        this.opacity = this._nPages > 1 ? 255 : 0;
    },
};
