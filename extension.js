/**
 * V-Shell (Vertical Workspaces)
 * extension.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2025
 * @license    GPL-3.0
 *
 */

'use strict';

import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import * as Config from 'resource:///org/gnome/shell/misc/config.js';

import * as Extension from 'resource:///org/gnome/shell/extensions/extension.js';

// Me imports
import * as Settings from './lib/settings.js';
import * as _Util from './lib/util.js';

// Me Modules import
import { LayoutModule } from './lib/layout.js';
import { WorkspacesViewModule } from './lib/workspacesView.js';
import { WorkspaceThumbnailModule } from './lib/workspaceThumbnail.js';
import { AppDisplayModule } from './lib/appDisplay.js';
import { AppFavoritesModule } from './lib/appFavorites.js';
import { DashModule } from './lib/dash.js';
import { IconGridModule } from './lib/iconGrid.js';
import { MessageTrayModule } from './lib/messageTray.js';
import { OsdWindowModule } from './lib/osdWindow.js';
import { OverlayKeyModule } from './lib/overlayKey.js';
import { OverviewModule } from './lib/overview.js';
import { OverviewControlsModule } from './lib/overviewControls.js';
import { PanelModule } from './lib/panel.js';
import { SearchControllerModule } from './lib/searchController.js';
import { SearchModule } from './lib/search.js';
import { SwipeTrackerModule } from './lib/swipeTracker.js';
import { WindowAttentionHandlerModule } from './lib/windowAttentionHandler.js';
import { WindowManagerModule } from './lib/windowManager.js';
import { WindowPreviewModule } from './lib/windowPreview.js';
import { WorkspaceAnimationModule } from './lib/workspaceAnimation.js';
import { WorkspaceModule } from './lib/workspace.js';
import { WorkspaceSwitcherPopupModule } from './lib/workspaceSwitcherPopup.js';

let Me;
// gettext
let _;
let opt;

export default class VShell extends Extension.Extension {
    _init() {
        Me = {};

        Me.getSettings = this.getSettings.bind(this);
        Me.shellVersion = parseFloat(Config.PACKAGE_VERSION);
        Me.metadata = this.metadata;
        Me.gSettings = this.getSettings();
        Me.Settings = Settings;
        Me.Util = _Util;
        Me.gettext = this.gettext.bind(this);
        _ = Me.gettext;

        // search prefixes for supported search providers
        Me.WSP_PREFIX = 'wq//';
        Me.RFSP_PREFIX = 'fq//';
        Me.ESP_PREFIX = 'eq//';

        Me.opt = new Me.Settings.Options(Me);
        opt = Me.opt;

        Me.Util.init(Me);

        Me.updateMessageDialog = new Me.Util.RestartMessage();
    }

    _cleanGlobals() {
        Me = null;
        opt = null;
        _ = null;
    }

    enable() {
        this._init();
        this._initModules();

        // prevent conflicts during startup
        let skipStartup = Me.gSettings.get_boolean('delay-startup') ||
                Me.Util.getEnabledExtensions('ubuntu-dock').length ||
                Me.Util.getEnabledExtensions('dash-to-dock').length ||
                Me.Util.getEnabledExtensions('dash2dock').length ||
                Me.Util.getEnabledExtensions('dash-to-panel').length;
        if (skipStartup && Main.layoutManager._startingUp) {
            this._startupConId = Main.layoutManager.connect('startup-complete', () => {
                this._delayedStartup = true;
                this._activateVShell();
                // Since VShell has been activated with a delay, move it in extensionOrder
                let extensionOrder = Main.extensionManager._extensionOrder;
                const idx = extensionOrder.indexOf(this.metadata.uuid);
                extensionOrder.push(extensionOrder.splice(idx, 1)[0]);
                Main.layoutManager.disconnect(this._startupConId);
                this._startupConId = 0;
            });
        } else {
            this._activateVShell();
        }

        console.debug(`${Me.metadata.name}: enabled`);
    }

    // Reason for using "unlock-dialog" session mode:
    // Updating the "appDisplay" content every time the screen is locked/unlocked takes quite a lot of time and affects the user experience.
    disable() {
        if (this._startupConId)
            Main.layoutManager.disconnect(this._startupConId);
        this.removeVShell();
        this._disposeModules();

        console.debug(`${Me.metadata.name}: disabled`);
        Me.updateMessageDialog.destroy();
        Me.updateMessageDialog = null;
        this._cleanGlobals();
    }

    _getModuleList() {
        return Object.keys(Me.Modules);
    }

    _initModules() {
        Me.Modules = {};
        Me.Modules.appDisplayModule = new AppDisplayModule(Me);
        Me.Modules.appFavoritesModule = new AppFavoritesModule(Me);
        Me.Modules.dashModule = new DashModule(Me);
        Me.Modules.iconGridModule = new IconGridModule(Me);
        Me.Modules.layoutModule = new LayoutModule(Me);
        Me.Modules.messageTrayModule = new MessageTrayModule(Me);
        Me.Modules.overviewModule = new OverviewModule(Me);
        Me.Modules.overviewControlsModule = new OverviewControlsModule(Me);
        Me.Modules.osdWindowModule = new OsdWindowModule(Me);
        Me.Modules.overlayKeyModule = new OverlayKeyModule(Me);
        Me.Modules.panelModule = new PanelModule(Me);
        Me.Modules.searchModule = new SearchModule(Me);
        Me.Modules.searchControllerModule = new SearchControllerModule(Me);
        Me.Modules.swipeTrackerModule = new SwipeTrackerModule(Me);
        Me.Modules.windowAttentionHandlerModule = new WindowAttentionHandlerModule(Me);
        Me.Modules.windowPreviewModule = new WindowPreviewModule(Me);
        Me.Modules.windowManagerModule = new WindowManagerModule(Me);
        Me.Modules.workspaceModule = new WorkspaceModule(Me);
        Me.Modules.workspaceAnimationModule = new WorkspaceAnimationModule(Me);
        Me.Modules.workspaceSwitcherPopupModule = new WorkspaceSwitcherPopupModule(Me);
        Me.Modules.workspaceThumbnailModule = new WorkspaceThumbnailModule(Me);
        Me.Modules.workspacesViewModule = new WorkspacesViewModule(Me);
    }

    _disposeModules() {
        for (let module of this._getModuleList()) {
            if (!Me.Modules[module].moduleEnabled)
                Me.Modules[module].cleanGlobals();
        }

        Me.Util.cleanGlobals();
        Me.Modules = null;
        Me.opt.destroy();
        Me.opt = null;
    }

    _activateVShell() {
        this._enabled = true;

        if (!this._delayedStartup && !Main.sessionMode.isLocked) {
            Me.updateMessageDialog.showMessage();
            this._delayedStartup = false;
        }

        this._originalGetNeighbor = Meta.Workspace.prototype.get_neighbor;

        this._removeTimeouts();
        this._timeouts = {};

        if (!Main.layoutManager._startingUp)
            this._ensureOverviewIsHidden();

        // store dash _workId so we will be able to detect replacement when entering overview
        this._storeDashId();

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

        // workaround for upstream bug - overview always shows workspace 1 instead of the active one after restart
        this._setInitialWsIndex();

        // this._resetShellProperties();
    }

    removeVShell() {
        // Rebasing V-Shell when overview is open causes problems
        // also if Dash to Dock is enabled, disabling V-Shell can result in a broken overview
        this._ensureOverviewIsHidden();

        this._enabled = false;

        const reset = true;
        this._removeTimeouts();

        this._removeConnections();
        Main.overview._overview.controls._setBackground(reset);

        // remove changes made by VShell modules
        this._updateOverrides(reset);

        this._resetShellProperties();

        // switch PageUp/PageDown workspace switcher shortcuts
        this._switchPageShortcuts();

        this._prevDash = null;

        // restore default animation speed
        St.Settings.get().slow_down_factor = 1;

        Meta.Workspace.prototype.get_neighbor = this._originalGetNeighbor;
    }

    _ensureOverviewIsHidden() {
        if (Main.overview._shown) {
            Main.overview._shown = false;
            Main.overview._visibleTarget = false;
            Main.overview._overview.prepareToLeaveOverview();
            Main.overview._changeShownState('HIDING');
            Main.overview._hideDone();
            Main.overview.dash.showAppsButton.checked = false;
        }
    }

    _resetShellProperties() {
        const controls = Main.overview._overview.controls;
        // layoutManager._dash retains reference to the default dash even when DtD is enabled
        const dash = controls.layoutManager._dash;
        // Restore default dash background style
        dash._background.set_style('');
        dash.translation_x = 0;
        dash.translation_y = 0;
        controls._thumbnailsBox.translation_x = 0;
        controls._thumbnailsBox.translation_y = 0;
        controls._searchEntryBin.translation_y = 0;
        controls._workspacesDisplay.scale_x = 1;
        controls.set_child_above_sibling(controls._workspacesDisplay, null);
        delete controls._dashIsAbove;

        // following properties may be reduced if extensions are rebased while the overview is open
        controls._thumbnailsBox.remove_all_transitions();
        controls._thumbnailsBox.scale_x = 1;
        controls._thumbnailsBox.scale_y = 1;
        controls._thumbnailsBox.opacity = 255;

        controls._searchEntry.visible = true;
        controls._searchController._searchResults.opacity = 255;
        Main.layoutManager.panelBox.translationY = 0;
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
        this._prevDash = Main.overview.dash._workId;
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
        if (!this._monitorsChangedConId) {
            this._monitorsChangedConId = Main.layoutManager.connect(
                'monitors-changed', () => Main.overview._overview.controls._setBackground()
            );
        }

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

                            this._timeouts.unlock = 0;
                            return GLib.SOURCE_REMOVE;
                        }
                    );
                } else if (session.currentMode === 'unlock-dialog') {
                    Me.Modules.panelModule.update();
                    Main.layoutManager.panelBox.translation_y = 0;
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
                    //  - if DtD was enabled before VShell, VShell will be rebased by the extensionSystem
                    //  - If DtD was enabled after VShell, the first _showingOverview detects the replacement of the dash and repairs VShell
                    const reset = [1, 2].includes(extension.state);
                    const dashReplacement = uuid.includes('dash-to-dock') || uuid.includes('ubuntu-dock') || uuid.includes('dash-to-panel');
                    if (dashReplacement && reset)
                        this._watchDashToDock = true;
                    if (!Main.layoutManager._startingUp && reset && dashReplacement)
                        this._adaptToSystemChange(2000);
                }
            );
        }

        this._updateNewWindowConnection();
    }

    _updateNewWindowConnection() {
        const nMonitors = global.display.get_n_monitors();
        if (nMonitors > 1 && opt.FIX_NEW_WINDOW_MONITOR && !this._newWindowCreatedConId) {
            this._newWindowCreatedConId = global.display.connect_after('window-created', (w, win) => {
                if (Main.layoutManager._startingUp || win.get_window_type() !== Meta.WindowType.NORMAL)
                    return;
                const winActor = win.get_compositor_private();
                const _moveWinToMonitor = () => {
                    const currentMonitor = global.display.get_current_monitor();
                    if (win.get_monitor() !== currentMonitor) {
                        // some windows ignore this action if executed immediately
                        GLib.idle_add(GLib.PRIORITY_LOW, () => {
                            win.move_to_monitor(currentMonitor);
                            return GLib.SOURCE_REMOVE;
                        });
                    }
                };
                if (!winActor.realized) {
                    const realizeId = winActor.connect('realize', () => {
                        winActor.disconnect(realizeId);
                        _moveWinToMonitor();
                    });
                } else {
                    _moveWinToMonitor();
                }
            });
        } else if ((nMonitors.length === 1 || !opt.FIX_NEW_WINDOW_MONITOR) && this._newWindowCreatedConId) {
            global.display.disconnect(this._newWindowCreatedConId);
            this._newWindowCreatedConId = 0;
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

        if (this._newWindowCreatedConId) {
            global.display.disconnect(this._newWindowCreatedConId);
            this._newWindowCreatedConId = 0;
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
        Me.Modules.panelModule.update(reset);

        Me.Modules.workspaceAnimationModule.update(reset);
        Me.Modules.workspaceSwitcherPopupModule.update(reset);
        Me.Modules.swipeTrackerModule.update(reset);
        Me.Modules.searchModule.update(reset);

        Me.Modules.appDisplayModule.update(reset);

        Me.Modules.windowAttentionHandlerModule.update(reset);
        Me.Modules.appFavoritesModule.update(reset);
        Me.Modules.messageTrayModule.update(reset);
        Me.Modules.osdWindowModule.update(reset);
        Me.Modules.overlayKeyModule.update(reset);
        Me.Modules.searchControllerModule.update(reset);

        if (Main.sessionMode.isLocked)
            this._sessionLockActive = true;

        if (!Main.sessionMode.isLocked)
            this._sessionLockActive = false;

        if (!reset && !Main.layoutManager._startingUp)
            Main.overview._overview.controls.setInitialTranslations();
        if (this._sessionLockActive)
            Main.layoutManager.panelBox.translation_y = 0;
    }

    _onShowingOverview() {
        if (Main.layoutManager._startingUp)
            return;

        if (this._watchDashToDock) {
            // Workaround for Dash to Dock (Ubuntu Dock) breaking overview allocations after enabling and changing its position
            // DtD replaces its _workId on every position change
            const dash = Main.overview.dash;
            if (this._prevDash !== dash._workId)
                this._adaptToSystemChange(0);
        }
    }

    _adaptToSystemChange(timeout = 200, full = false) {
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
                if (!full) {
                    console.warn(`[${Me.metadata.name}] Warning: Updating overrides ...`);
                    this._prevDash = dash._workId;
                    Me._resetInProgress = true;
                    // Only update modules that might be affected by the dock extension
                    this._repairOverrides();
                    Me._resetInProgress = false;
                } else {
                    console.warn(`[${Me.metadata.name}] Warning: Rebuilding V-Shell ...`);
                    Me._resetInProgress = true;
                    this._activateVShell();
                    Me._resetInProgress = false;
                }
                this._timeouts.reset = 0;
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    // Modules possibly affected by supported but incompatible extensions
    _repairOverrides() {
        Me.Modules.overviewModule.update();
        Me.Modules.overviewControlsModule.update();
        Me.Modules.layoutModule.update();
        Me.Modules.workspacesViewModule.update();
        Me.Modules.windowPreviewModule.update();
        Me.Modules.panelModule.update();
        Me.Modules.dashModule.update();
        this._updateSettings();
        Main.overview._overview.controls._setBackground();
    }

    _updateSettings(settings, key) {
        // update settings cache and option variables
        opt._updateSettings();
        this._resetShellProperties();

        // avoid overload while loading profile - update only once
        // delayed gsettings writes are processed alphabetically
        if (key === 'aaa-loading-profile') {
            if (this._timeouts.loadingProfile)
                GLib.source_remove(this._timeouts.loadingProfile);
            this._timeouts.loadingProfile = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                100, () => {
                    this._activateVShell();
                    this._timeouts.loadingProfile = 0;
                    return GLib.SOURCE_REMOVE;
                }
            );
            Me.updateMessageDialog.showMessage();
        }
        if (this._timeouts.loadingProfile)
            return;

        if (key?.includes('profile-data')) {
            const index = key.replace('profile-data-', '');
            Main.notify(`${Me.metadata.name}`, _('Profile %d has been updated').format(index));
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

        // adjust search entry style for OM2
        if (opt.OVERVIEW_MODE2)
            Main.overview.searchEntry.add_style_class_name('search-entry-om2');
        else
            Main.overview.searchEntry.remove_style_class_name('search-entry-om2');

        if (opt.OVERVIEW_MODE === 1)
            Me.Modules.workspaceModule.setWindowPreviewMaxScale(0.1);
        else
            Me.Modules.workspaceModule.setWindowPreviewMaxScale(0.95);

        Main.overview.searchEntry.visible = opt.SHOW_SEARCH_ENTRY;
        Main.overview.searchEntry.opacity = 255;
        St.Settings.get().slow_down_factor = opt.ANIMATION_TIME_FACTOR;

        // Options for workspace switcher, apply custom function only if needed
        /* if (opt.WS_WRAPAROUND || opt.WS_IGNORE_LAST)*/
        Meta.Workspace.prototype.get_neighbor = this._getNeighbor;
        /* else
            Meta.Workspace.prototype.get_neighbor = this._originalGetNeighbor;*/

        // delay search so it doesn't make the search view transition stuttering
        // 150 is the default value in GNOME Shell, but the search feels laggy
        // Of course there is some overload for fast keyboard typist
        if (opt.SEARCH_VIEW_ANIMATION)
            opt.SEARCH_DELAY = 150;

        if (Main.overview._overview.controls._setBackground)
            Main.overview._overview.controls._setBackground();

        if (settings)
            this._applySettings(key);
    }

    _applySettings(key) {
        if (key?.endsWith('-module')) {
            for (let module of this._getModuleList()) {
                if (opt.options[module] && key === opt.options[module][1]) {
                    Me.Modules[module].update();
                    break;
                }
            }
        }

        this._switchPageShortcuts();

        if (key?.includes('panel'))
            Me.Modules.panelModule.update();

        if (key?.includes('dash') || key?.includes('icon') || key?.includes('dot-style') || key?.includes('provider'))
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
        case 'new-window-monitor-fix':
            this._updateNewWindowConnection();
            break;
        case 'click-empty-close':
            Me.Modules.overviewControlsModule.update();
        }

        if (key?.includes('app-grid') ||
            key?.includes('app-folder') ||
            key?.includes('dot-style') ||
            key === 'show-search-entry' ||
            key === 'ws-thumbnail-scale' ||
            key === 'ws-thumbnail-scale-appgrid')
            Me.Modules.appDisplayModule.update();
    }

    _switchPageShortcuts() {
        //                                          ignore screen lock
        if (!opt.get('enablePageShortcuts') || this._sessionLockActive)
            return;

        const vertical = global.workspaceManager.layout_rows === -1;
        const schema = 'org.gnome.desktop.wm.keybindings';
        const settings = Me.getSettings(schema);

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

    _getNeighbor(direction) {
        // workspace matrix is supported
        const activeIndex = this.index();
        const ignoreLast = Meta.prefs_get_dynamic_workspaces() && ((opt.WS_IGNORE_LAST && !Main.overview._shown) || opt.forceIgnoreLast) ? 1 : 0;
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
