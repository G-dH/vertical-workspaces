/**
 * V-Shell (Vertical Workspaces)
 * extension.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2023
 * @license    GPL-3.0
 *
 */

'use strict';

const GLib = imports.gi.GLib;
const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;

const Main = imports.ui.main;

const Util = imports.misc.util;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Settings = Me.imports.lib.settings;
const _Util = Me.imports.lib.util;

// gettext
const _  = Settings._;

const AppDisplayModule = Me.imports.lib.appDisplay.AppDisplayModule;
const AppFavoritesModule = Me.imports.lib.appFavorites.AppFavoritesModule;
const DashModule = Me.imports.lib.dash.DashModule;
const IconGridModule = Me.imports.lib.iconGrid.IconGridModule;
const LayoutModule = Me.imports.lib.layout.LayoutModule;
const MessageTrayModule = Me.imports.lib.messageTray.MessageTrayModule;
const OsdWindowModule = Me.imports.lib.osdWindow.OsdWindowModule;
const OverlayKeyModule = Me.imports.lib.overlayKey.OverlayKeyModule;
const OverviewModule = Me.imports.lib.overview.OverviewModule;
const OverviewControlsModule = Me.imports.lib.overviewControls.OverviewControlsModule;
const PanelModule = Me.imports.lib.panel.PanelModule;
const SearchControllerModule = Me.imports.lib.searchController.SearchControllerModule;
const SearchModule = Me.imports.lib.search.SearchModule;
const SwipeTrackerModule = Me.imports.lib.swipeTracker.SwipeTrackerModule;
const WindowAttentionHandlerModule = Me.imports.lib.windowAttentionHandler.WindowAttentionHandlerModule;
const WindowManagerModule  = Me.imports.lib.windowManager.WindowManagerModule;
const WindowPreviewModule = Me.imports.lib.windowPreview.WindowPreviewModule;
const WorkspaceAnimationModule = Me.imports.lib.workspaceAnimation.WorkspaceAnimationModule;
const WorkspaceModule = Me.imports.lib.workspace.WorkspaceModule;
const WorkspaceSwitcherPopupModule = Me.imports.lib.workspaceSwitcherPopup.WorkspaceSwitcherPopupModule;
const WorkspaceThumbnailModule = Me.imports.lib.workspaceThumbnail.WorkspaceThumbnailModule;
const WorkspacesViewModule = Me.imports.lib.workspacesView.WorkspacesViewModule;

const RecentFilesSearchProviderModule = Me.imports.lib.recentFilesSearchProvider.RecentFilesSearchProviderModule;
const WindowSearchProviderModule = Me.imports.lib.windowSearchProvider.WindowSearchProviderModule;

let extension;

function init() {
    ExtensionUtils.initTranslations();
    return new Extension();
}

class Extension {
    enable() {
        Settings.opt = new Settings.Options();
        this.opt = Settings.opt;

        this._initModules();
        this.activateVShell();

        log(`${Me.metadata.name}: enabled`);
    }

    // Reason for using "unlock-dialog" session mode:
    // Updating the "appDisplay" content every time the screen is locked/unlocked takes quite a lot of time and affects the user experience.
    disable() {
        this.removeVShell();
        this._disposeModules();

        // If Dash to Dock is enabled, disabling V-Shell can end in broken overview
        Main.overview.hide();
        log(`${Me.metadata.name}: disabled`);
    }

    _getModuleList() {
        return [
            'workspaceSwitcherPopupModule',
            'workspaceAnimationModule',
            'workspaceModule',
            'windowManagerModule',
            'windowPreviewModule',
            'windowAttentionHandlerModule',
            'swipeTrackerModule',
            'searchControllerModule',
            'searchModule',
            'panelModule',
            'overlayKeyModule',
            'osdWindowModule',
            'messageTrayModule',
            'layoutModule',
            'dashModule',
            'appFavoritesModule',
            'appDisplayModule',
            'windowSearchProviderModule',
            'recentFilesSearchProviderModule',
        ];
    }

    _initModules() {
        this.appDisplayModule = new AppDisplayModule();
        this.appFavoritesModule = new AppFavoritesModule();
        this.dashModule = new DashModule();
        this.iconGridModule = new IconGridModule();
        this.layoutModule = new LayoutModule();
        this.messageTrayModule = new MessageTrayModule();
        this.overviewModule = new OverviewModule();
        this.overviewControlsModule = new OverviewControlsModule();
        this.osdWindowModule = new OsdWindowModule();
        this.overlayKeyModule = new OverlayKeyModule();
        this.panelModule = new PanelModule();
        this.searchModule = new SearchModule();
        this.searchControllerModule = new SearchControllerModule();
        this.swipeTrackerModule = new SwipeTrackerModule();
        this.windowAttentionHandlerModule = new WindowAttentionHandlerModule();
        this.windowPreviewModule = new WindowPreviewModule();
        this.windowManagerModule = new WindowManagerModule();
        this.workspaceModule = new WorkspaceModule();
        this.workspaceAnimationModule = new WorkspaceAnimationModule();
        this.workspaceSwitcherPopupModule = new WorkspaceSwitcherPopupModule();
        this.workspaceThumbnailModule = new WorkspaceThumbnailModule();
        this.workspacesViewModule = new WorkspacesViewModule();
        this.windowSearchProviderModule = new WindowSearchProviderModule();
        this.recentFilesSearchProviderModule = new RecentFilesSearchProviderModule();
    }

    _disposeModules() {
        Settings.opt.destroy();
        Settings.opt = null;

        for (let module of this._getModuleList())
            delete this[module];

        delete this.opt;
    }

    activateVShell() {
        this._enabled = true;

        this._removeTimeouts();
        this._timeouts = {};

        // load VShell configuration
        this._updateSettings();

        // activate all enabled VShell modules
        this._updateOverrides();

        // connect signals to help VShell adapt to changes in DE configuration
        this._updateConnections();

        // switch PageUp/PageDown workspace switcher shortcuts
        this._switchPageShortcuts();

        // if Dash to Dock detected force enable "Fix for DtD" option
        this._updateFixDashToDockOption();

        // update overview background wallpaper if enabled
        Main.overview._overview.controls._setBackground();
        this._updateSettingsConnection();

        // store dash _workId so we will be able to detect replacement when entering overview
        this._storeDashId();

        // workaround for upstream bug - overview always shows workspace 1 instead of the active one after restart
        this._setInitialWsIndex();
    }

    removeVShell() {
        this._enabled = false;

        const reset = true;
        this._removeTimeouts();

        this._removeConnections();
        Main.overview._overview.controls._setBackground(reset);

        // remove changes mede by VShell modules
        this._updateOverrides(reset);

        // switch PageUp/PageDown workspace switcher shortcuts
        this._switchPageShortcuts();

        // remove any position offsets from dash and ws thumbnails
        if (!_Util.dashNotDefault()) {
            Main.overview.dash.translation_x = 0;
            Main.overview.dash.translation_y = 0;
        }
        Main.overview._overview._controls._thumbnailsBox.translation_x = 0;
        Main.overview._overview._controls._thumbnailsBox.translation_y = 0;
        Main.overview._overview._controls._searchEntryBin.translation_y = 0;
        Main.overview._overview._controls.set_child_above_sibling(Main.overview._overview._controls._workspacesDisplay, null);
        // restore default animation speed
        St.Settings.get().slow_down_factor = 1;

        // restore default dash background style
        Main.overview.dash._background.set_style('');
        // hide status message if shown
        this._showStatusMessage(false);
        this._prevDash = null;
    }

    _removeTimeouts() {
        if (this._timeouts) {
            Object.values(this._timeouts).forEach(id => {
                if (id)
                    GLib.source_remove(id);
            });
        }
        this._timeouts = null;
    }

    _storeDashId() {
        const dash = Main.overview.dash;
        this._prevDash = dash._workId;
    }

    _setInitialWsIndex() {
        if (Main.layoutManager._startingUp) {
            GLib.idle_add(GLib.PRIORITY_LOW, () => {
                Main.overview._overview.controls._workspaceAdjustment.set_value(global.workspace_manager.get_active_workspace_index());
            });
        }
    }

    _updateSettingsConnection() {
        if (!this.opt._extensionUpdateId)
            this.opt._extensionUpdateId = this.opt.connect('changed', this._updateSettings.bind(this));
    }

    _updateFixDashToDockOption() {
        const dtdEnabled = !!(_Util.getEnabledExtensions('dash-to-dock').length ||
                              _Util.getEnabledExtensions('ubuntu-dock').length);

        // force enable Fix Dash to Dock option if DtD detected
        this.opt._watchDashToDock = dtdEnabled;
        // this.opt.set('fixUbuntuDock', dtdEnabled);
    }

    _updateConnections() {
        if (!this._monitorsChangedConId)
            this._monitorsChangedConId = Main.layoutManager.connect('monitors-changed', () => this._updateVShell(2000));


        if (!this._showingOverviewConId)
            this._showingOverviewConId = Main.overview.connect('showing', this._onShowingOverview.bind(this));

        if (!this._sessionModeConId) {
            // the panel must be visible when screen is locked
            this._sessionModeConId = Main.sessionMode.connect('updated', () => {
                if (Main.sessionMode.isLocked) {
                    this.panelModule.update(true);
                } else {
                    // delayed because we need to be able to fix potential damage caused by other extensions during unlock
                    this._timeouts.unlock = GLib.idle_add(GLib.PRIORITY_LOW,
                        () => {
                            this.panelModule.update();
                            this.overviewControlsModule.update();

                            this._timeouts.unlock = 0;
                            return GLib.SOURCE_REMOVE;
                        }
                    );
                }
            });
        }

        if (!this._watchDockSigId) {
            this._watchDockSigId = Main.extensionManager.connect('extension-state-changed',
                (source, extension) => {
                    const uuid = extension.uuid;
                    // ExtensionState = {
                    //     ENABLED: 1,
                    //     DISABLED: 2,
                    //     ERROR: 3,
                    //     OUT_OF_DATE: 4,
                    //     DOWNLOADING: 5,
                    //     INITIALIZED: 6,
                    //     DISABLING: 7,
                    //     ENABLING: 8,
                    //
                    //     // Used as an error state for operations on unknown extensions,
                    //     // should never be in a real extensionMeta object.
                    //     UNINSTALLED: 99,
                    // };
                    // no need to restart on disable/remove
                    //  - if DtD was enabled before VShell, VShell will be rebased by extensionSystem
                    //  - if DtD was enabled after VShell, the first _showingOverview detect replacement of the dash and repair VShell
                    const reset = [1, 2].includes(extension.state);
                    const dashReplacement = uuid.includes('dash-to-dock') || uuid.includes('ubuntu-dock') || uuid.includes('dash-to-panel');
                    if (dashReplacement && reset)
                        this.opt._watchDashToDock = true;
                    if (!Main.layoutManager._startingUp && reset && dashReplacement)
                        this._updateVShell(1999);
                }
            );
        }
    }

    _removeConnections() {
        if (this._monitorsChangedConId) {
            Main.layoutManager.disconnect(this._monitorsChangedConId);
            this._monitorsChangedConId = 0;
        }

        if (this._showingOverviewConId) {
            Main.overview.disconnect(this._showingOverviewConId);
            this._showingOverviewConId = 0;
        }

        if (this._sessionModeConId) {
            Main.sessionMode.disconnect(this._sessionModeConId);
            this._sessionModeConId = 0;
        }

        if (this._watchDockSigId) {
            Main.extensionManager.disconnect(this._watchDockSigId);
            this._watchDockSigId = 0;
        }
    }

    _updateOverrides(reset = false) {
        this.workspacesViewModule.update(reset);
        this.workspaceThumbnailModule.update(reset);
        this.overviewModule.update(reset);
        this.overviewControlsModule.update(reset);

        this.workspaceModule.update(reset);
        this.windowPreviewModule.update(reset);
        this.windowManagerModule.update(reset);

        this.layoutModule.update(reset);
        this.dashModule.update(reset);
        this.panelModule.update(reset);
        // the panel must be visible when screen is locked
        // at startup time, panel will be updated from the startupAnimation after allocation
        if (!reset && Main.sessionMode.isLocked && !Main.layoutManager._startingUp)
            this.panelModule._showPanel(true);
            // PanelModule._showPanel(true);
            // hide panel so it appears directly on the final place
        /* else if (Main.layoutManager._startingUp && !Meta.is_restart())
            Main.panel.opacity = 0;*/

        this.workspaceAnimationModule.update(reset);
        this.workspaceSwitcherPopupModule.update(reset);

        this.swipeTrackerModule.update(reset);

        this.searchModule.update(reset);

        this.windowSearchProviderModule.update(reset);
        this.recentFilesSearchProviderModule.update(reset);

        // don't rebuild app grid on any screen lock
        // even if the extension includes unlock-screen session mode
        // disable/enable is called at least once even on GS44
        // when screen lock is activated for the first time
        // because every first disable of each extension rebases
        // the entire extensions stack that was enabled later
        if (Main.sessionMode.isLocked)
            this._sessionLockActive = true;

        // This covers unnecessary enable/disable cycles during first screen lock, but is not allowed by the EGO rules
        // if (!this._sessionLockActive || !Main.extensionManager._getEnabledExtensions().includes(Me.metadata.uuid)) {
        // Avoid showing status at startup, can cause freeze
        //    if (!Main.layoutManager._startingUp)
        //        this._showStatusMessage();
        // IconGrid needs to be patched before AppDisplay
        //    this.iconGridModule.update(reset);
        //    this.appDisplayModule.update(reset);
        // } else {
        //    this._sessionLockActive = false;
        //    this._showStatusMessage(false);
        // }

        if (!this._sessionLockActive && !Main.layoutManager._startingUp) {
            // Avoid showing status at startup, can cause freeze
            this._showStatusMessage();
        } else if (this._sessionLockActive) {
            this._sessionLockActive = false;
            this._showStatusMessage(false);
        }
        // IconGrid needs to be patched before AppDisplay
        this.iconGridModule.update(reset);
        this.appDisplayModule.update(reset);

        this.windowAttentionHandlerModule.update(reset);
        this.appFavoritesModule.update(reset);
        this.messageTrayModule.update(reset);
        this.osdWindowModule.update(reset);
        this.overlayKeyModule.update(reset);
        this.searchControllerModule.update(reset);

        if (!reset)
            Main.overview._overview.controls.setInitialTranslations();
    }

    _onShowingOverview() {
        // store pointer X coordinate for OVERVIEW_MODE 1 window spread - if mouse pointer is steady, don't spread
        this.opt.showingPointerX = global.get_pointer()[0];

        if (this.opt._watchDashToDock) {
            // workaround for Dash to Dock (Ubuntu Dock) breaking overview allocations after enabled and changed position
            // DtD replaces dock and its _workId on every position change
            const dash = Main.overview.dash;
            if (this._prevDash !== dash._workId)
                this._updateVShell(0);
        }
    }

    _updateVShell(timeout = 200) {
        if (!this._enabled || Main.layoutManager._startingUp)
            return;

        if (this._timeouts.reset)
            GLib.source_remove(this._timeouts.reset);
        this._timeouts.reset = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            timeout,
            () => {
                if (!this._enabled)
                    return GLib.SOURCE_REMOVE;

                const dash = Main.overview.dash;
                if (timeout < 2000) { // timeout < 2000 for partial update
                    this._prevDash = dash._workId;
                    log(`[${Me.metadata.name}]: Dash has been replaced, updating extension ...`);
                    Settings._resetInProgress = true;
                    // update only necessary modules if dash has been replaced
                    this._repairOverrides();
                    Settings._resetInProgress = false;
                } else {
                    log(`[${Me.metadata.name}]: Updating extension ...`);
                    // for case the monitor configuration has been changed, update all
                    Settings._resetInProgress = true;
                    this.activateVShell();
                    Settings._resetInProgress = false;
                }
                this._timeouts.reset = 0;
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    // the key modules that can be affected by the supported incompatible extensions
    _repairOverrides() {
        this.overviewModule.update();
        this.overviewControlsModule.update();
        this.windowPreviewModule.update();
        this.panelModule.update();
        this.dashModule.update();
    }

    _updateSettings(settings, key) {
        // update settings cache and option variables
        this.opt._updateSettings();

        // avoid overload while loading profile - update only once
        // delayed gsettings writes are processed alphabetically
        if (key === 'aaa-loading-profile') {
            this._showStatusMessage();
            if (this._timeouts.loadingProfile)
                GLib.source_remove(this._timeouts.loadingProfile);
            this._timeouts.loadingProfile = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                100, () => {
                    this.activateVShell();
                    this._timeouts.loadingProfile = 0;
                    return GLib.SOURCE_REMOVE;
                });
        }
        if (this._timeouts.loadingProfile)
            return;

        if (key?.includes('profile-data')) {
            const index = key.replace('profile-data-', '');
            Main.notify(`${Me.metadata.name}`, `Profile ${index} has been updated`);
        }

        this.opt.WORKSPACE_MIN_SPACING = Main.overview._overview._controls._thumbnailsBox.get_theme_node().get_length('spacing');
        // update variables that cannot be processed within settings
        const dash = Main.overview.dash;
        if (_Util.dashIsDashToDock()) {
            this.opt.DASH_POSITION = dash._position;
            this.opt.DASH_TOP = this.opt.DASH_POSITION === 0;
            this.opt.DASH_RIGHT = this.opt.DASH_POSITION === 1;
            this.opt.DASH_BOTTOM = this.opt.DASH_POSITION === 2;
            this.opt.DASH_LEFT = this.opt.DASH_POSITION === 3;
            this.opt.DASH_VERTICAL = this.opt.DASH_LEFT || this.opt.DASH_RIGHT;
        }

        this.opt.DASH_VISIBLE = this.opt.DASH_VISIBLE && !_Util.getEnabledExtensions('dash-to-panel@jderose9.github.com').length;

        this.opt.MAX_ICON_SIZE = this.opt.get('dashMaxIconSize');
        if (this.opt.MAX_ICON_SIZE < 16) {
            this.opt.MAX_ICON_SIZE = 64;
            this.opt.set('dashMaxIconSize', 64);
        }

        const monitorWidth = global.display.get_monitor_geometry(global.display.get_primary_monitor()).width;
        if (monitorWidth < 1600) {
            this.opt.APP_GRID_ICON_SIZE_DEFAULT = this.opt.APP_GRID_ACTIVE_PREVIEW && !this.opt.APP_GRID_ORDER ? 128 : 64;
            this.opt.APP_GRID_FOLDER_ICON_SIZE_DEFAULT = 64;
        }

        imports.ui.workspace.WINDOW_PREVIEW_MAXIMUM_SCALE = this.opt.OVERVIEW_MODE === 1 ? 0.1 : 0.95;

        /* if (!_Util.dashIsDashToDock()) { // DtD has its own opacity control
            this.dashModule.updateStyle(dash);
        }*/

        // adjust search entry style for OM2
        if (this.opt.OVERVIEW_MODE2)
            Main.overview.searchEntry.add_style_class_name('search-entry-om2');
        else
            Main.overview.searchEntry.remove_style_class_name('search-entry-om2');

        Main.overview.searchEntry.visible = this.opt.SHOW_SEARCH_ENTRY;
        Main.overview.searchEntry.opacity = 255;
        St.Settings.get().slow_down_factor = this.opt.ANIMATION_TIME_FACTOR;
        imports.ui.search.MAX_LIST_SEARCH_RESULTS_ROWS = this.opt.SEARCH_MAX_ROWS;

        this.opt.START_Y_OFFSET = (this.opt.get('panelModule') && this.opt.PANEL_OVERVIEW_ONLY && this.opt.PANEL_POSITION_TOP) ||
            // better to add unnecessary space than to have a panel overlapping other objects
            _Util.getEnabledExtensions('hidetopbar').length
            ? Main.panel.height
            : 0;

        if (settings)
            this._applySettings(key);
    }

    _applySettings(key) {
        if (key?.endsWith('-module')) {
            for (let module of this._getModuleList()) {
                if (key === this.opt.options[module][1]) {
                    if (key === 'app-display-module')
                        this._showStatusMessage();
                    this[module].update();
                    break;
                }
            }
            return;
        }

        Main.overview._overview.controls._setBackground();
        this._switchPageShortcuts();

        if (key?.includes('panel'))
            this.panelModule.update();

        if (key?.includes('dash') || key?.includes('icon'))
            this.dashModule.update();

        if (key?.includes('hot-corner') || key?.includes('dash'))
            this.layoutModule.update();

        switch (key) {
        case 'ws-thumbnails-position':
            this._updateOverrides();
            break;
        case 'workspace-switcher-animation':
            this.workspaceAnimationModule.update();
            break;
        case 'search-width-scale':
            this.searchModule.update();
            break;
        case 'favorites-notify':
            this.appFavoritesModule.update();
            break;
        case 'window-attention-mode':
            this.windowAttentionHandlerModule.update();
            break;
        case 'show-ws-preview-bg':
            this.panelModule.update();
            break;
        case 'notification-position':
            this.messageTrayModule.update();
            break;
        case 'osd-position':
            this.osdWindowModule.update();
            break;
        case 'overlay-key':
            this.overlayKeyModule.update();
            break;
        case 'always-activate-selected-window':
            this.windowPreviewModule.update();
            break;
        }

        if (key?.includes('app-grid') ||
            key === 'show-search-entry' ||
            key === 'ws-thumbnail-scale' ||
            key === 'ws-thumbnail-scale-appgrid') {
            this._showStatusMessage();
            this.iconGridModule.update();
            this.appDisplayModule.update();
        }
    }

    _switchPageShortcuts() {
        //                                          ignore screen lock
        if (!this.opt.get('enablePageShortcuts') || this._sessionLockActive)
            return;

        const vertical = global.workspaceManager.layout_rows === -1;
        const schema = 'org.gnome.desktop.wm.keybindings';
        const settings = ExtensionUtils.getSettings(schema);

        const keyLeft = 'switch-to-workspace-left';
        const keyRight = 'switch-to-workspace-right';
        const keyUp = 'switch-to-workspace-up';
        const keyDown = 'switch-to-workspace-down';

        const keyMoveLeft = 'move-to-workspace-left';
        const keyMoveRight = 'move-to-workspace-right';
        const keyMoveUp = 'move-to-workspace-up';
        const keyMoveDown = 'move-to-workspace-down';

        const switchPrevSc = '<Super>Page_Up';
        const switchNextSc = '<Super>Page_Down';
        const movePrevSc = '<Super><Shift>Page_Up';
        const moveNextSc = '<Super><Shift>Page_Down';

        let switchLeft = settings.get_strv(keyLeft);
        let switchRight = settings.get_strv(keyRight);
        let switchUp = settings.get_strv(keyUp);
        let switchDown = settings.get_strv(keyDown);

        let moveLeft = settings.get_strv(keyMoveLeft);
        let moveRight = settings.get_strv(keyMoveRight);
        let moveUp = settings.get_strv(keyMoveUp);
        let moveDown = settings.get_strv(keyMoveDown);

        if (vertical) {
            if (switchLeft.includes(switchPrevSc))
                switchLeft.splice(switchLeft.indexOf(switchPrevSc), 1);
            if (switchRight.includes(switchNextSc))
                switchRight.splice(switchRight.indexOf(switchNextSc), 1);
            if (moveLeft.includes(movePrevSc))
                moveLeft.splice(moveLeft.indexOf(movePrevSc), 1);
            if (moveRight.includes(moveNextSc))
                moveRight.splice(moveRight.indexOf(moveNextSc), 1);

            if (!switchUp.includes(switchPrevSc))
                switchUp.push(switchPrevSc);
            if (!switchDown.includes(switchNextSc))
                switchDown.push(switchNextSc);
            if (!moveUp.includes(movePrevSc))
                moveUp.push(movePrevSc);
            if (!moveDown.includes(moveNextSc))
                moveDown.push(moveNextSc);
        } else {
            if (!switchLeft.includes(switchPrevSc))
                switchLeft.push(switchPrevSc);
            if (!switchRight.includes(switchNextSc))
                switchRight.push(switchNextSc);
            if (!moveLeft.includes(movePrevSc))
                moveLeft.push(movePrevSc);
            if (!moveRight.includes(moveNextSc))
                moveRight.push(moveNextSc);

            if (switchUp.includes(switchPrevSc))
                switchUp.splice(switchUp.indexOf(switchPrevSc), 1);
            if (switchDown.includes(switchNextSc))
                switchDown.splice(switchDown.indexOf(switchNextSc), 1);
            if (moveUp.includes(movePrevSc))
                moveUp.splice(moveUp.indexOf(movePrevSc), 1);
            if (moveDown.includes(moveNextSc))
                moveDown.splice(moveDown.indexOf(moveNextSc), 1);
        }

        settings.set_strv(keyLeft, switchLeft);
        settings.set_strv(keyRight, switchRight);
        settings.set_strv(keyUp, switchUp);
        settings.set_strv(keyDown, switchDown);

        settings.set_strv(keyMoveLeft, moveLeft);
        settings.set_strv(keyMoveRight, moveRight);
        settings.set_strv(keyMoveUp, moveUp);
        settings.set_strv(keyMoveDown, moveDown);
    }

    // Status dialog that appears during updating V-Shell configuration and blocks inputs
    _showStatusMessage(show = true) {
        if ((show && Settings._resetInProgress) || Main.layoutManager._startingUp)
            return;

        if (Settings._vShellMessageTimeoutId) {
            GLib.source_remove(Settings._vShellMessageTimeoutId);
            Settings._vShellMessageTimeoutId = 0;
        }

        if (Settings._vShellStatusMessage && !show) {
            Settings._vShellStatusMessage.close();
            Settings._vShellStatusMessage.destroy();
            Settings._vShellStatusMessage = null;
        }

        if (!show)
            return;

        if (!Settings._vShellStatusMessage) {
            const sm = new Main.RestartMessage(_('Updating V-Shell...'));
            sm.set_style('background-color: rgba(0,0,0,0.3);');
            sm.open();
            Settings._vShellStatusMessage = sm;
        }

        // just for case the message wasn't removed from appDisplay after App Grid realization
        Settings._vShellMessageTimeoutId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            5,
            () => {
                if (Settings._vShellStatusMessage) {
                    Settings._vShellStatusMessage.close();
                    Settings._vShellStatusMessage.destroy();
                    Settings._vShellStatusMessage = null;
                    Settings._resetInProgress = false;
                }

                Settings._vShellMessageTimeoutId = 0;
                return GLib.SOURCE_REMOVE;
            }
        );
    }
}
