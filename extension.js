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

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Meta = imports.gi.Meta;
const St = imports.gi.St;

const Main = imports.ui.main;
const Search = imports.ui.search;
const Workspace = imports.ui.workspace;

const ExtensionUtils = imports.misc.extensionUtils;
const MyExtension = ExtensionUtils.getCurrentExtension();

let Me;
// gettext
let _;
let opt;

function init() {
    ExtensionUtils.initTranslations();
    return new Extension();
}

class Extension {
    _init() {
        Me = {};

        Me.shellVersion = parseFloat(imports.misc.config.PACKAGE_VERSION);
        Me.imports = MyExtension.imports;
        Me.metadata = MyExtension.metadata;
        Me.gSettings = ExtensionUtils.getSettings(Me.metadata['settings-schema']);
        Me.Settings = MyExtension.imports.lib.settings;
        Me.gettext = imports.gettext.domain(Me.metadata['gettext-domain']).gettext;
        Me.Util = MyExtension.imports.lib.util;

        Me.Modules = this._importModules();
        Me.moduleList = this._getModuleList();

        Me.WSP_PREFIX = Me.Modules.windowSearchProviderModule._PREFIX;
        Me.RFSP_PREFIX = Me.Modules.recentFilesSearchProviderModule._PREFIX;
        Me.ESP_PREFIX = Me.Modules.extensionsSearchProviderModule._PREFIX;

        Me.opt = new Me.Settings.Options(Me);
        _ = Me.gettext;
        opt = Me.opt;

        Me.Util.init(Me);

        Me.moduleList.forEach(module => {
            Me.Modules[module] = new Me.Modules[module](Me);
        });

        Me.repairOverrides = this._repairOverrides;
    }

    _importModules() {
        return {
            appDisplayModule:                   Me.imports.lib.appDisplay.AppDisplayModule,
            appFavoritesModule:                 Me.imports.lib.appFavorites.AppFavoritesModule,
            dashModule:                         Me.imports.lib.dash.DashModule,
            iconGridModule:                     Me.imports.lib.iconGrid.IconGridModule,
            layoutModule:                       Me.imports.lib.layout.LayoutModule,
            messageTrayModule:                  Me.imports.lib.messageTray.MessageTrayModule,
            osdWindowModule:                    Me.imports.lib.osdWindow.OsdWindowModule,
            overviewModule:                     Me.imports.lib.overview.OverviewModule,
            overlayKeyModule:                   Me.imports.lib.overlayKey.OverlayKeyModule,
            overviewControlsModule:             Me.imports.lib.overviewControls.OverviewControlsModule,
            panelModule:                        Me.imports.lib.panel.PanelModule,
            searchModule:                       Me.imports.lib.search.SearchModule,
            searchControllerModule:             Me.imports.lib.searchController.SearchControllerModule,
            swipeTrackerModule:                 Me.imports.lib.swipeTracker.SwipeTrackerModule,
            windowAttentionHandlerModule:       Me.imports.lib.windowAttentionHandler.WindowAttentionHandlerModule,
            windowManagerModule:                Me.imports.lib.windowManager.WindowManagerModule,
            windowPreviewModule:                Me.imports.lib.windowPreview.WindowPreviewModule,
            workspaceAnimationModule:           Me.imports.lib.workspaceAnimation.WorkspaceAnimationModule,
            workspaceModule:                    Me.imports.lib.workspace.WorkspaceModule,
            workspaceSwitcherPopupModule:       Me.imports.lib.workspaceSwitcherPopup.WorkspaceSwitcherPopupModule,
            workspaceThumbnailModule:           Me.imports.lib.workspaceThumbnail.WorkspaceThumbnailModule,
            workspacesViewModule:               Me.imports.lib.workspacesView.WorkspacesViewModule,
            windowSearchProviderModule:         Me.imports.lib.windowSearchProvider.WindowSearchProviderModule,
            winTmbModule:                       Me.imports.lib.winTmb.WinTmbModule,
            recentFilesSearchProviderModule:    Me.imports.lib.recentFilesSearchProvider.RecentFilesSearchProviderModule,
            extensionsSearchProviderModule:     Me.imports.lib.extensionsSearchProvider.ExtensionsSearchProviderModule,
        };
    }

    _getModuleList() {
        return Object.keys(Me.Modules);
    }

    _cleanGlobals() {
        Me = null;
        opt = null;
        _ = null;
    }

    enable() {
        this._init();
        // flag for Util.getEnabledExtensions()
        Me.extensionsLoadIncomplete = Main.layoutManager._startingUp;

        this._activateVShell();
        Me.extensionsLoadIncomplete = false;
        console.debug(`${Me.metadata.name}: enabled`);
    }

    // Reason for using "unlock-dialog" session mode:
    // Updating the "appDisplay" content every time the screen is locked/unlocked takes quite a lot of time and affects the user experience.
    disable() {
        this._removeVShell();
        this._disposeModules();

        // If Dash to Dock is enabled, disabling V-Shell can end in broken overview
        Main.overview.hide();

        console.debug(`${Me.metadata.name}: disabled`);

        this._cleanGlobals();
    }

    _disposeModules() {
        Me.opt.destroy();
        Me.opt = null;

        for (let module of Me.moduleList) {
            if (!Me.Modules[module].moduleEnabled)
                Me.Modules[module].cleanGlobals();
        }

        Me.Util.cleanGlobals();
        Me.Modules = null;
    }

    _activateVShell() {
        this._enabled = true;

        this._originalGetNeighbor = Meta.Workspace.prototype.get_neighbor;

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

        // update overview background wallpaper if enabled, but don't set it too early on session startup
        // because it crashes wayland
        if (!Main.layoutManager._startingUp || Meta.is_restart())
            Main.overview._overview.controls._setBackground();

        this._updateSettingsConnection();

        // store dash _workId so we will be able to detect replacement when entering overview
        this._storeDashId();

        // workaround for upstream bug - overview always shows workspace 1 instead of the active one after restart
        this._setInitialWsIndex();
    }

    _removeVShell() {
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
        if (!Me.Util.dashNotDefault()) {
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

        Meta.Workspace.prototype.get_neighbor = this._originalGetNeighbor;
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
        if (!opt._extensionUpdateId)
            opt._extensionUpdateId = opt.connect('changed', this._updateSettings.bind(this));
    }

    _updateFixDashToDockOption() {
        const dtdEnabled = !!(Me.Util.getEnabledExtensions('dash-to-dock').length ||
                              Me.Util.getEnabledExtensions('ubuntu-dock').length);
        // force enable Fix Dash to Dock option if DtD detected
        this._watchDashToDock = dtdEnabled;
    }

    _updateConnections() {
        if (!this._monitorsChangedConId)
            this._monitorsChangedConId = Main.layoutManager.connect('monitors-changed', () => this._updateVShell(2000));


        if (!this._showingOverviewConId)
            this._showingOverviewConId = Main.overview.connect('showing', this._onShowingOverview.bind(this));

        if (!this._sessionModeConId) {
            // the panel must be visible when screen is locked
            this._sessionModeConId = Main.sessionMode.connect('updated', session => {
                if (session.currentMode === 'user' || session.parentMode === 'user') {
                    this._timeouts.unlock = GLib.idle_add(GLib.PRIORITY_LOW,
                        () => {
                            Me.Modules.panelModule.update();
                            Me.Modules.overviewControlsModule.update();
                            Me.Modules.winTmbModule.showThumbnails();

                            this._timeouts.unlock = 0;
                            return GLib.SOURCE_REMOVE;
                        }
                    );
                } else if (session.currentMode === 'unlock-dialog') {
                    Me.Modules.panelModule.update(true);
                    Me.Modules.winTmbModule.hideThumbnails();
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
                        this._watchDashToDock = true;
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
        Me.Modules.workspacesViewModule.update(reset);
        Me.Modules.workspaceThumbnailModule.update(reset);
        Me.Modules.overviewModule.update(reset);
        Me.Modules.overviewControlsModule.update(reset);

        Me.Modules.workspaceModule.update(reset);
        Me.Modules.windowPreviewModule.update(reset);
        Me.Modules.windowManagerModule.update(reset);

        Me.Modules.layoutModule.update(reset);
        Me.Modules.dashModule.update(reset);
        // avoid enabling panel module when session is locked
        if (reset || (!reset && !Main.sessionMode.isLocked))
            Me.Modules.panelModule.update(reset);
        // the panel must be visible when screen is locked
        // at startup time, panel will be updated from the startupAnimation after allocation
        if (!reset && Main.sessionMode.isLocked && !Main.layoutManager._startingUp)
            Me.Modules.panelModule._showPanel(true);
            // PanelModule._showPanel(true);
            // hide panel so it appears directly on the final place
        /* else if (Main.layoutManager._startingUp && !Meta.is_restart())
            Main.panel.opacity = 0;*/

        Me.Modules.workspaceAnimationModule.update(reset);
        Me.Modules.workspaceSwitcherPopupModule.update(reset);

        Me.Modules.swipeTrackerModule.update(reset);

        Me.Modules.searchModule.update(reset);

        Me.Modules.windowSearchProviderModule.update(reset);
        Me.Modules.recentFilesSearchProviderModule.update(reset);
        Me.Modules.extensionsSearchProviderModule.update(reset);

        if (Main.sessionMode.isLocked)
            this._sessionLockActive = true;

        if (!this._sessionLockActive && !Main.layoutManager._startingUp && opt.APP_GRID_PERFORMANCE) {
            // Avoid showing status at startup, can cause freeze
            this._showStatusMessage();
        }

        if (!Main.sessionMode.isLocked)
            this._sessionLockActive = false;

        // iconGridModule will be updated from appDisplayModule
        Me.Modules.appDisplayModule.update(reset);

        Me.Modules.windowAttentionHandlerModule.update(reset);
        Me.Modules.appFavoritesModule.update(reset);
        Me.Modules.messageTrayModule.update(reset);
        Me.Modules.osdWindowModule.update(reset);
        Me.Modules.overlayKeyModule.update(reset);
        Me.Modules.searchControllerModule.update(reset);
        Me.Modules.winTmbModule.update(reset);

        if (!reset && !Main.layoutManager._startingUp)
            Main.overview._overview.controls.setInitialTranslations();
    }

    _onShowingOverview() {
        if (Main.layoutManager._startingUp)
            return;

        Main.overview._overview.controls.opacity = 255;

        // store pointer X coordinate for OVERVIEW_MODE 1 window spread - if mouse pointer is steady, don't spread
        opt.showingPointerX = global.get_pointer()[0];

        if (!Main.overview._overview.controls._bgManagers && (opt.SHOW_BG_IN_OVERVIEW || opt.SHOW_WS_PREVIEW_BG))
            Main.overview._overview.controls._setBackground();

        if (this._watchDashToDock) {
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
                    console.warn(`[${Me.metadata.name}]: Dash has been replaced, updating extension ...`);
                    Me._resetInProgress = true;
                    // update only necessary modules if dash has been replaced
                    this._repairOverrides();
                    Me._resetInProgress = false;
                } else {
                    console.warn(`[${Me.metadata.name}]: Updating extension ...`);
                    // for case the monitor configuration has been changed, update all
                    Me._resetInProgress = true;
                    this._activateVShell();
                    Me._resetInProgress = false;
                }
                this._timeouts.reset = 0;
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    // the key modules that can be affected by the supported incompatible extensions
    _repairOverrides() {
        Me.Modules.overviewModule.update();
        Me.Modules.overviewControlsModule.update();
        Me.Modules.workspacesViewModule.update();
        Me.Modules.windowPreviewModule.update();
        Me.Modules.panelModule.update();
        Me.Modules.dashModule.update();
    }

    _updateSettings(settings, key) {
        // update settings cache and option variables
        opt._updateSettings();

        // avoid overload while loading profile - update only once
        // delayed gsettings writes are processed alphabetically
        if (key === 'aaa-loading-profile') {
            this._showStatusMessage();
            if (this._timeouts.loadingProfile)
                GLib.source_remove(this._timeouts.loadingProfile);
            this._timeouts.loadingProfile = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                100, () => {
                    this._activateVShell();
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

        opt.WORKSPACE_MIN_SPACING = Main.overview._overview._controls._thumbnailsBox.get_theme_node().get_length('spacing');
        // update variables that cannot be processed within settings
        const dash = Main.overview.dash;
        if (Me.Util.dashIsDashToDock()) {
            opt.DASH_POSITION = dash._position;
            opt.DASH_TOP = opt.DASH_POSITION === 0;
            opt.DASH_RIGHT = opt.DASH_POSITION === 1;
            opt.DASH_BOTTOM = opt.DASH_POSITION === 2;
            opt.DASH_LEFT = opt.DASH_POSITION === 3;
            opt.DASH_VERTICAL = opt.DASH_LEFT || opt.DASH_RIGHT;
        }

        opt.DASH_VISIBLE = opt.DASH_VISIBLE && !Me.Util.getEnabledExtensions('dash-to-panel@jderose9.github.com').length;

        const monitorWidth = global.display.get_monitor_geometry(global.display.get_primary_monitor()).width;
        if (monitorWidth < 1600) {
            opt.APP_GRID_ICON_SIZE_DEFAULT = opt.APP_GRID_ACTIVE_PREVIEW && !opt.APP_GRID_USAGE ? 128 : 64;
            opt.APP_GRID_FOLDER_ICON_SIZE_DEFAULT = 64;
        }

        Workspace.WINDOW_PREVIEW_MAXIMUM_SCALE = opt.OVERVIEW_MODE === 1 ? 0.1 : 0.95;

        // adjust search entry style for OM2
        if (opt.OVERVIEW_MODE2)
            Main.overview.searchEntry.add_style_class_name('search-entry-om2');
        else
            Main.overview.searchEntry.remove_style_class_name('search-entry-om2');

        Main.overview.searchEntry.visible = opt.SHOW_SEARCH_ENTRY;
        Main.overview.searchEntry.opacity = 255;
        St.Settings.get().slow_down_factor = opt.ANIMATION_TIME_FACTOR;
        Search.MAX_LIST_SEARCH_RESULTS_ROWS = opt.SEARCH_MAX_ROWS;

        opt.START_Y_OFFSET = (opt.get('panelModule') && opt.PANEL_OVERVIEW_ONLY && opt.PANEL_POSITION_TOP) ||
            // better to add unnecessary space than to have a panel overlapping other objects
            Me.Util.getEnabledExtensions('hidetopbar').length
            ? Main.panel.height
            : 0;

        // Options for workspace switcher, apply custom function only if needed
        if (opt.WS_WRAPAROUND || opt.WS_IGNORE_LAST)
            Meta.Workspace.prototype.get_neighbor = this._getNeighbor;
        else
            Meta.Workspace.prototype.get_neighbor = this._originalGetNeighbor;

        if (settings)
            this._applySettings(key);
    }

    _applySettings(key) {
        if (key?.endsWith('-module')) {
            for (let module of Me.moduleList) {
                if (opt.options[module] && key === opt.options[module][1]) {
                    if (key === 'app-display-module')
                        this._showStatusMessage();
                    Me.Modules[module].update();
                    break;
                }
            }
            return;
        }

        Main.overview._overview.controls._setBackground();
        this._switchPageShortcuts();

        if (key?.includes('panel'))
            Me.Modules.panelModule.update();

        if (key?.includes('dash') || key?.includes('icon') || key?.includes('dot-style'))
            Me.Modules.dashModule.update();

        if (key?.includes('hot-corner') || key?.includes('dash'))
            Me.Modules.layoutModule.update();

        if (key?.includes('overlay-key'))
            Me.Modules.overlayKeyModule.update();

        switch (key) {
        case 'ws-thumbnails-position':
            this._updateOverrides();
            break;
        case 'workspace-switcher-animation':
            Me.Modules.workspaceAnimationModule.update();
            break;
        case 'search-width-scale':
            Me.Modules.searchModule.update();
            break;
        case 'favorites-notify':
            Me.Modules.appFavoritesModule.update();
            break;
        case 'window-attention-mode':
            Me.Modules.windowAttentionHandlerModule.update();
            break;
        case 'show-ws-preview-bg':
            Me.Modules.panelModule.update();
            break;
        case 'notification-position':
            Me.Modules.messageTrayModule.update();
            break;
        case 'osd-position':
            Me.Modules.osdWindowModule.update();
            break;
        case 'always-activate-selected-window':
            Me.Modules.windowPreviewModule.update();
            break;
        case 'ws-switcher-mode':
            Me.Modules.windowManagerModule.update();
            break;
        }

        if (key?.includes('app-grid') ||
            key?.includes('app-folder') ||
            key?.includes('dot-style') ||
            key === 'show-search-entry' ||
            key === 'ws-thumbnail-scale' ||
            key === 'ws-thumbnail-scale-appgrid') {
            this._showStatusMessage();
            Me.Modules.appDisplayModule.update();
        }
    }

    _switchPageShortcuts() {
        //                                          ignore screen lock
        if (!opt.get('enablePageShortcuts') || this._sessionLockActive)
            return;

        const vertical = global.workspaceManager.layout_rows === -1;
        const schema = 'org.gnome.desktop.wm.keybindings';
        const settings = new Gio.Settings({ schema_id: schema });

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
        if ((show && Me._resetInProgress) || Main.layoutManager._startingUp || !Main.overview._overview.controls._appDisplay._sortOrderedItemsAlphabetically)
            return;

        if (Me._vShellMessageTimeoutId) {
            GLib.source_remove(Me._vShellMessageTimeoutId);
            Me._vShellMessageTimeoutId = 0;
        }

        if (Me._vShellStatusMessage && !show) {
            Me._vShellStatusMessage.close();
            Me._vShellStatusMessage.destroy();
            Me._vShellStatusMessage = null;
        }

        if (!show)
            return;

        if (!Me._vShellStatusMessage) {
            const sm = new Main.RestartMessage(_('Updating V-Shell...'));
            sm.set_style('background-color: rgba(0,0,0,0.3);');
            sm.open();
            Me._vShellStatusMessage = sm;
        }

        // just for case the message wasn't removed from appDisplay after App Grid realization
        Me._vShellMessageTimeoutId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            5,
            () => {
                if (Me._vShellStatusMessage) {
                    Me._vShellStatusMessage.close();
                    Me._vShellStatusMessage.destroy();
                    Me._vShellStatusMessage = null;
                    Me._resetInProgress = false;
                }

                Me._vShellMessageTimeoutId = 0;
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _getNeighbor(direction) {
        // workspace matrix is supported
        const activeIndex = this.index();
        const ignoreLast = opt.WS_IGNORE_LAST && Meta.prefs_get_dynamic_workspaces() && !Main.overview._shown ? 1 : 0;
        const wraparound = opt.WS_WRAPAROUND;
        const nWorkspaces = global.workspace_manager.n_workspaces;
        const lastIndex = nWorkspaces - 1 - ignoreLast;
        const rows = global.workspace_manager.layout_rows > -1 ? global.workspace_manager.layout_rows : nWorkspaces;
        const columns = global.workspace_manager.layout_columns > -1 ? global.workspace_manager.layout_columns : nWorkspaces;

        let index = activeIndex;
        let neighborExists;

        if (direction === Meta.MotionDirection.LEFT) {
            index -= 1;
            const currentRow = Math.floor(activeIndex / columns);
            const indexRow = Math.floor(index / columns);
            neighborExists = index > -1 && indexRow === currentRow;
            if (wraparound && !neighborExists) {
                index = currentRow * columns + columns - 1;
                const maxIndexOnLastRow = lastIndex % columns;
                index = index < (lastIndex - ignoreLast) ? index : currentRow * columns + maxIndexOnLastRow;
            }
        } else if (direction === Meta.MotionDirection.RIGHT) {
            index += 1;
            const currentRow = Math.floor(activeIndex / columns);
            const indexRow = Math.floor(index / columns);
            neighborExists = index <= lastIndex && indexRow === currentRow;
            if (wraparound && !neighborExists)
                index = currentRow * columns;
        } else if (direction === Meta.MotionDirection.UP) {
            index -= columns;
            neighborExists = index > -1;
            if (wraparound && !neighborExists) {
                index = rows * columns + index;
                index = index < nWorkspaces - ignoreLast ? index : index - columns;
            }
        } else if (direction === Meta.MotionDirection.DOWN) {
            index += columns;
            neighborExists = index <= lastIndex;
            if (wraparound && !neighborExists)
                index %= columns;
        }

        return global.workspace_manager.get_workspace_by_index(neighborExists || wraparound ? index : activeIndex);
    }
}
