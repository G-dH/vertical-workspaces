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

const { GLib, Shell, St, Clutter, Meta } = imports.gi;

const Main = imports.ui.main;

const Util = imports.misc.util;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Settings = Me.imports.lib.settings;
const _Util = Me.imports.lib.util;

// gettext
const _  = Settings._;

const WindowSearchProvider = Me.imports.lib.windowSearchProvider;
const RecentFilesSearchProvider = Me.imports.lib.recentFilesSearchProvider;
const LayoutOverride = Me.imports.lib.layout;
const AppDisplayOverride = Me.imports.lib.appDisplay;
const WorkspaceThumbnailOverride = Me.imports.lib.workspaceThumbnail;
const WorkspaceOverride = Me.imports.lib.workspace;
const WorkspacesViewOverride = Me.imports.lib.workspacesView;
const WindowPreviewOverride = Me.imports.lib.windowPreview;
const IconGridOverride = Me.imports.lib.iconGrid;
const WorkspaceAnimationOverride = Me.imports.lib.workspaceAnimation;
const WindowManagerOverride = Me.imports.lib.windowManager;
const OverviewOverride = Me.imports.lib.overview;
const OverviewControlsOverride = Me.imports.lib.overviewControls;
const SwipeTrackerOverride = Me.imports.lib.swipeTracker;
const WorkspaceSwitcherPopupOverride = Me.imports.lib.workspaceSwitcherPopup;
const SearchOverride = Me.imports.lib.search;
const PanelOverride = Me.imports.lib.panel;
const DashOverride = Me.imports.lib.dash;
const WindowAttentionHandlerOverride = Me.imports.lib.windowAttentionHandler;
const AppFavoritesOverride = Me.imports.lib.appFavorites;
const MessageTrayOverride = Me.imports.lib.messageTray;
const OsdWindowOverride = Me.imports.lib.osdWindow;
const SearchControllerOverride = Me.imports.lib.searchController;
const OverlayKey = Me.imports.lib.overlayKey;

let opt;

let _bgManagers;

let _enabled;
let _resetVShellIfEnabled;
let _prevDash;

let _showingOverviewConId;
let _monitorsChangedConId;
let _loadingProfileTimeoutId;
let _watchDockSigId;

let _resetTimeoutId;
let _statusLabelTimeoutId;

let _sessionModeConId;
let _sessionLockActive;


function init() {
    ExtensionUtils.initTranslations();
}

function enable() {
    activateVShell();
    log(`${Me.metadata.name}: enabled`);
}

function disable() {
    removeVShell();
    global.verticalWorkspacesEnabled = undefined;
    log(`${Me.metadata.name}: disabled`);
}

// ------------------------------------------------------------------------------------------

async function activateVShell() {
    // workaround to survive conflict with Dash to Dock with certain V-Shell config that can freeze GNOME
    if (Main.layoutManager._startingUp && _Util.getEnabledExtensions('dash-to-dock').length)
        await Main.overview._overview.controls.layout_manager.ensureAllocation();

    _enabled = true;

    _bgManagers = [];

    Settings.opt = new Settings.Options();
    opt = Settings.opt;

    _updateSettings();

    opt.connect('changed', _updateSettings);

    _updateOverrides();

    // If we missed our startup animation because of the DtD, we need to update some parts now
    if (Main.layoutManager._startingUp && _Util.getEnabledExtensions('dash-to-dock').length)
        Main.overview._overview.controls.compensateForMissedStartupAnimation();


    _prevDash = {};
    const dash = Main.overview.dash;
    _prevDash.dash = dash;
    _prevDash.position = dash.position;

    _monitorsChangedConId = Main.layoutManager.connect('monitors-changed', () => _resetVShell(2000));

    // static bg animations conflict with startup animation
    // enable it on first hiding from the overview and disconnect the signal
    _showingOverviewConId = Main.overview.connect('showing', _onShowingOverview);

    // switch PageUp/PageDown workspace switcher shortcuts
    _switchPageShortcuts();
    Main.overview._overview.controls._setBackground();

    // the panel must be visible when screen is locked
    _sessionModeConId = Main.sessionMode.connect('updated', () => {
        if (Main.sessionMode.isLocked) {
            PanelOverride.update(true);
        } else {
            PanelOverride.update();
        }
    });

    // if Dash to Dock detected force enable "Fix for DtD" option
    if (_Util.dashIsDashToDock()) {
        opt.set('fixUbuntuDock', true);
        _fixUbuntuDock(true);
    } else {
        _fixUbuntuDock(opt.get('fixUbuntuDock'));
    }

    // workaround for upstream bug - overview always shows workspace 1 instead of the active one after restart
    if (Main.layoutManager._startingUp) {
        GLib.idle_add(GLib.PRIORITY_LOW, () => {
            Main.overview._overview.controls._workspaceAdjustment.set_value(global.workspace_manager.get_active_workspace_index());
        });
    }
}

function removeVShell() {
    _enabled = 0;

    if (_monitorsChangedConId) {
        Main.layoutManager.disconnect(_monitorsChangedConId);
        _monitorsChangedConId = 0;
    }

    // remove _resetTimeoutId and reset function
    _fixUbuntuDock(false);

    const reset = true;

    Main.overview._overview.controls._setBackground(reset);
    _updateOverrides(reset);

    _prevDash = null;

    if (_sessionModeConId) {
        Main.sessionMode.disconnect(_sessionModeConId);
        _sessionModeConId = 0;
    }

    // switch PageUp/PageDown workspace switcher shortcuts
    _switchPageShortcuts();

    // remove any position offsets from dash and ws thumbnails
    if (!_Util.dashNotDefault()) {
        Main.overview.dash.translation_x = 0;
        Main.overview.dash.translation_y = 0;
    }
    Main.overview._overview._controls._thumbnailsBox.translation_x = 0;
    Main.overview._overview._controls._thumbnailsBox.translation_y = 0;
    Main.overview._overview._controls._searchEntryBin.translation_y = 0;

    Main.overview._overview._controls.set_child_above_sibling(Main.overview._overview._controls._workspacesDisplay, null);

    if (_showingOverviewConId) {
        Main.overview.disconnect(_showingOverviewConId);
        _showingOverviewConId = 0;
    }

    if (_loadingProfileTimeoutId) {
        GLib.source_remove(_loadingProfileTimeoutId);
        _loadingProfileTimeoutId = 0;
    }

    St.Settings.get().slow_down_factor = 1;

    Main.overview.dash._background.set_style('');

    showStatusMessage(false);

    opt.destroy();
    opt = null;
}

function _updateOverrides(reset = false) {
    WorkspacesViewOverride.update(reset);
    WorkspaceThumbnailOverride.update(reset);
    OverviewOverride.update(reset);
    OverviewControlsOverride.update(reset);

    WorkspaceOverride.update(reset);
    WindowPreviewOverride.update(reset);
    WindowManagerOverride.update(reset);

    LayoutOverride.update(reset);
    DashOverride.update(reset);
    PanelOverride.update(reset);
    // the panel must be visible when screen is locked
    // at startup time, panel will be updated from the startupAnimation after allocation
    if (!reset && Main.sessionMode.isLocked && !Main.layoutManager._startingUp)
        PanelOverride._showPanel(true);
        // hide panel so it appears directly on the final place
    /* else if (Main.layoutManager._startingUp && !Meta.is_restart())
        Main.panel.opacity = 0;*/

    WorkspaceAnimationOverride.update(reset);
    WorkspaceSwitcherPopupOverride.update(reset);

    SwipeTrackerOverride.update(reset);

    SearchOverride.update(reset);
    WindowSearchProvider.update(reset);
    RecentFilesSearchProvider.update(reset);

    // don't rebuild app grid on any screen lock
    // even if the extension includes unlock-screen session mode
    // disable/enable is called at least once even on GS44
    // when screen lock is activated for the first time
    // because every first disable of each extension rebases
    // the entire extensions stack that was enabled later
    if (Main.sessionMode.isLocked)
        _sessionLockActive = true;

    // This covers unnecessary enable/disable cycles during first screen lock, but is not allowed by the EGO rules
    // if (!_sessionLockActive || !Main.extensionManager._getEnabledExtensions().includes(Me.metadata.uuid)) {
    // Avoid showing status at startup, can cause freeze
    //    if (!Main.layoutManager._startingUp)
    //        showStatusMessage();
    // IconGrid needs to be patched before AppDisplay
    //    IconGridOverride.update(reset);
    //    AppDisplayOverride.update(reset);
    // } else {
    //    _sessionLockActive = false;
    //    showStatusMessage(false);
    // }

    if (!_sessionLockActive && !Main.layoutManager._startingUp) {
        // Avoid showing status at startup, can cause freeze
        showStatusMessage();
    } else if (_sessionLockActive) {
        _sessionLockActive = false;
        showStatusMessage(false);
    }
    // IconGrid needs to be patched before AppDisplay
    IconGridOverride.update(reset);
    AppDisplayOverride.update(reset);

    WindowAttentionHandlerOverride.update(reset);
    AppFavoritesOverride.update(reset);
    MessageTrayOverride.update(reset);
    OsdWindowOverride.update(reset);
    OverlayKey.update(reset);
    SearchControllerOverride.update(reset);
}

function _onShowingOverview() {
    // store pointer X coordinate for OVERVIEW_MODE 1 window spread - if mouse pointer is steady, don't spread
    opt.showingPointerX = global.get_pointer()[0];

    if (opt.FIX_UBUNTU_DOCK) {
        // workaround for Ubuntu Dock breaking overview allocations after changing position
        const dash = Main.overview.dash;
        if (_prevDash.dash !== dash || _prevDash.position !== dash._position)
            _resetVShellIfEnabled(0);
    }
}

function _resetVShell(timeout = 200) {
    if (Main.layoutManager._startingUp)
        return;

    if (_resetTimeoutId)
        GLib.source_remove(_resetTimeoutId);
    _resetTimeoutId = GLib.timeout_add(
        GLib.PRIORITY_DEFAULT,
        timeout,
        () => {
            if (!_enabled)
                return GLib.SOURCE_REMOVE;

            const dash = Main.overview.dash;
            if (!timeout && _prevDash.dash && dash !== _prevDash.dash) { // !timeout means DtD workaround callback
                _prevDash.dash = dash;
                log(`[${Me.metadata.name}]: Dash has been replaced, resetting extension...`);
                Settings._resetInProgress = true;
                activateVShell();
                Settings._resetInProgress = false;
            } else if (timeout) {
                log(`[${Me.metadata.name}]: resetting extension...`);
                Settings._resetInProgress = true;
                activateVShell();
                Settings._resetInProgress = false;
            }
            _resetTimeoutId = 0;
            return GLib.SOURCE_REMOVE;
        }
    );
}

function _fixUbuntuDock(activate = true) {
    // Workaround for Ubuntu Dock breaking overview allocations after changing monitor configuration and deactivating dock
    if (_watchDockSigId) {
        global.settings.disconnect(_watchDockSigId);
        _watchDockSigId = 0;
    }

    if (_resetTimeoutId) {
        GLib.source_remove(_resetTimeoutId);
        _resetTimeoutId = 0;
    }

    _resetVShellIfEnabled = () => {};

    if (!activate)
        return;

    _watchDockSigId = global.settings.connect('changed::enabled-extensions', () => _resetVShell());
    _resetVShellIfEnabled = _resetVShell;
}

function _updateSettings(settings, key) {
    // avoid overload while loading profile - update only once
    // delayed gsettings writes are processed alphabetically
    if (key === 'aaa-loading-profile') {
        showStatusMessage();
        if (_loadingProfileTimeoutId)
            GLib.source_remove(_loadingProfileTimeoutId);
        _loadingProfileTimeoutId = GLib.timeout_add(100, 0, () => {
            _resetVShell();
            _loadingProfileTimeoutId = 0;
            return GLib.SOURCE_REMOVE;
        });
    }
    if (_loadingProfileTimeoutId)
        return;

    if (key?.includes('profile-data')) {
        const index = key.replace('profile-data-', '');
        Main.notify(`${Me.metadata.name}`, `Profile ${index} has been updated`);
    }

    opt._updateSettings();

    opt.WORKSPACE_MIN_SPACING = Main.overview._overview._controls._thumbnailsBox.get_theme_node().get_length('spacing');
    // update variables that cannot be processed within settings
    const dash = Main.overview.dash;
    if (_Util.dashIsDashToDock()) {
        opt.DASH_POSITION = dash._position;
        opt.DASH_TOP = opt.DASH_POSITION === 0;
        opt.DASH_RIGHT = opt.DASH_POSITION === 1;
        opt.DASH_BOTTOM = opt.DASH_POSITION === 2;
        opt.DASH_LEFT = opt.DASH_POSITION === 3;
        opt.DASH_VERTICAL = opt.DASH_LEFT || opt.DASH_RIGHT;
    }

    opt.DASH_VISIBLE = opt.DASH_VISIBLE && !_Util.getEnabledExtensions('dash-to-panel@jderose9.github.com').length;

    opt.MAX_ICON_SIZE = opt.get('dashMaxIconSize', true);
    if (opt.MAX_ICON_SIZE < 16) {
        opt.MAX_ICON_SIZE = 64;
        opt.set('dashMaxIconSize', 64);
    }

    const monitorWidth = global.display.get_monitor_geometry(global.display.get_primary_monitor()).width;
    if (monitorWidth < 1600) {
        opt.APP_GRID_ICON_SIZE_DEFAULT = opt.APP_GRID_ACTIVE_PREVIEW && !opt.APP_GRID_ORDER ? 128 : 64;
        opt.APP_GRID_FOLDER_ICON_SIZE_DEFAULT = 64;
    }

    imports.ui.workspace.WINDOW_PREVIEW_MAXIMUM_SCALE = opt.OVERVIEW_MODE === 1 ? 0.1 : 0.95;

    if (!_Util.dashIsDashToDock()) { // DtD has its own opacity control
        dash._background.opacity = Math.round(opt.get('dashBgOpacity', true) * 2.5); // conversion % to 0-255
        let radius = opt.get('dashBgRadius', true);
        if (radius) {
            let style;
            switch (opt.DASH_POSITION) {
            case 1:
                style = opt.DASH_BG_GS3_STYLE ? `border-radius: ${radius}px 0 0 ${radius}px;` : `border-radius: ${radius}px;`;
                break;
            case 3:
                style = opt.DASH_BG_GS3_STYLE ? `border-radius: 0 ${radius}px ${radius}px 0;` : `border-radius: ${radius}px;`;
                break;
            default:
                style = `border-radius: ${radius}px;`;
            }
            dash._background.set_style(style);
        } else {
            dash._background.set_style('');
        }
        if (opt.DASH_BG_LIGHT && !opt.OVERVIEW_MODE2)
            dash._background.add_style_class_name('dash-background-light');
        else
            dash._background.remove_style_class_name('dash-background-light');
    }

    // adjust search entry style for OM2
    if (opt.OVERVIEW_MODE2)
        Main.overview.searchEntry.add_style_class_name('search-entry-om2');
    else
        Main.overview.searchEntry.remove_style_class_name('search-entry-om2');

    Main.overview.searchEntry.visible = opt.SHOW_SEARCH_ENTRY;
    Main.overview.searchEntry.opacity = 255;
    St.Settings.get().slow_down_factor = opt.ANIMATION_TIME_FACTOR;
    imports.ui.search.MAX_LIST_SEARCH_RESULTS_ROWS = opt.SEARCH_MAX_ROWS;

    opt.START_Y_OFFSET = (opt.get('panelModule', true) && opt.PANEL_OVERVIEW_ONLY && opt.PANEL_POSITION_TOP) ||
        // better to add unnecessary space than to have a panel overlapping other objects
        _Util.getEnabledExtensions('hidetopbar@mathieu.bidon.ca').length
        ? Main.panel.height
        : 0;

    if (settings)
        _applySettings(key);
}

function _applySettings(key) {
    if (key?.endsWith('-module')) {
        _updateOverrides();
        return;
    }

    Main.overview._overview.controls._setBackground();
    _updateOverviewTranslations();
    _switchPageShortcuts();

    if (key?.includes('panel'))
        PanelOverride.update();

    if (key?.includes('dash') || key?.includes('search') || key?.includes('icon'))
        DashOverride.update();

    if (key?.includes('hot-corner') || key?.includes('dash'))
        LayoutOverride.update();

    switch (key) {
    case 'fix-ubuntu-dock':
        _fixUbuntuDock(opt.get('fixUbuntuDock', true));
        break;
    case 'ws-thumbnails-position':
        _updateOverrides();
        break;
    case 'workspace-switcher-animation':
        WorkspaceAnimationOverride.update();
        break;
    case 'search-width-scale':
        SearchOverride.update();
        break;
    case 'favorites-notify':
        AppFavoritesOverride.update();
        break;
    case 'window-attention-mode':
        WindowAttentionHandlerOverride.update();
        break;
    case 'show-ws-preview-bg':
        PanelOverride.update();
        break;
    case 'notification-position':
        MessageTrayOverride.update();
        break;
    case 'osd-position':
        OsdWindowOverride.update();
        break;
    case 'overlay-key':
        OverlayKey.update();
        break;
    case 'always-activate-selected-window':
        WindowPreviewOverride.update();
        break;
    }

    if (key?.includes('app-grid') ||
        key === 'show-search-entry' ||
        key === 'ws-thumbnail-scale' ||
        key === 'ws-thumbnail-scale-appgrid') {
        showStatusMessage();
        AppDisplayOverride.update();
    }
}

function _switchPageShortcuts() {
    //                                          ignore screen lock
    if (!opt.get('enablePageShortcuts', true || _sessionLockActive))
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


function _shouldAnimateOverview() {
    return !opt.SHOW_WS_PREVIEW_BG || opt.OVERVIEW_MODE2;
}

function _updateOverviewTranslations(dash = null, tmbBox = null, searchEntryBin = null) {
    dash = dash ?? Main.overview.dash;
    tmbBox = tmbBox ?? Main.overview._overview._controls._thumbnailsBox;
    searchEntryBin = searchEntryBin ?? Main.overview._overview._controls._searchEntryBin;

    if (!_shouldAnimateOverview()) {
        tmbBox.translation_x = 0;
        tmbBox.translation_y = 0;
        dash.translation_x = 0;
        dash.translation_y = 0;
        searchEntryBin.translation_x = 0;
        searchEntryBin.translation_y = 0;
        return;
    }

    const [tmbTranslationX, tmbTranslationY, dashTranslationX, dashTranslationY, searchTranslationY] = _Util.getOverviewTranslations(opt, dash, tmbBox, searchEntryBin);
    tmbBox.translation_x = tmbTranslationX;
    tmbBox.translation_y = tmbTranslationY;
    if (!_Util.dashNotDefault()) { // only if dash is not dash to dock
        dash.translation_x = dashTranslationX;
        dash.translation_y = dashTranslationY;
    }
    searchEntryBin.translation_y = searchTranslationY;
}

// Status dialog that appears during updating V-Shell configuration and blocks inputs
function showStatusMessage(show = true) {
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
