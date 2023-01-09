/**
 * Vertical Workspaces
 * verticalworkspaces.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022
 * @license    GPL-3.0
 * contains parts of https://github.com/RensAlthuis/vertical-overview extension
 */

'use strict';

const { Clutter, Gio, GLib, GObject, Graphene, Meta, Shell, St } = imports.gi;

const DND = imports.ui.dnd;
const Main = imports.ui.main;
const AppDisplay = imports.ui.appDisplay;
const Dash = imports.ui.dash;
const Layout = imports.ui.layout;
const Overview = imports.ui.overview;
const Util = imports.misc.util;
const WorkspaceThumbnail = imports.ui.workspaceThumbnail;
const Background = imports.ui.background;
const WorkspacesView = imports.ui.workspacesView;
const Workspace = imports.ui.workspace;
const OverviewControls = imports.ui.overviewControls;
const WindowPreview = imports.ui.windowPreview;
const WorkspaceSwitcherPopup = imports.ui.workspaceSwitcherPopup;
const SwipeTracker = imports.ui.swipeTracker;
const WorkspaceAnimation = imports.ui.workspaceAnimation;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Settings = Me.imports.settings;
const shellVersion = Settings.shellVersion;

const VerticalDash = Me.imports.dash;

const _Util = Me.imports.util;


// touching module properties defined by const/let for the first time returns undefined in GS 42, so we touch it here before we use it
WorkspacesView.SecondaryMonitorDisplay;

let gOptions = null;
let original_MAX_THUMBNAIL_SCALE;

const BACKGROUND_CORNER_RADIUS_PIXELS = 40;
const WS_TMB_CORNER_RADIUS = 8;

const WORKSPACE_CUT_SIZE = 10;

// keep adjacent workspaces out of the screen
let WORKSPACE_MAX_SPACING = 350;
let WORKSPACE_MIN_SPACING = 6;

let DASH_MAX_SIZE_RATIO = 0.15;

let MAX_THUMBNAIL_SCALE = WorkspaceThumbnail.MAX_THUMBNAIL_SCALE;

const ControlsState = {
    HIDDEN: 0,
    WINDOW_PICKER: 1,
    APP_GRID: 2,
};

let _verticalOverrides;
let _windowPreviewInjections;
let _wsSwitcherPopupInjections;
let _controlsManagerInjections;
let _workspaceAnimationInjections;
let _bgManagers;
let _shellSettings;

let _originalGestureUpdateId;

let _enabled;
let _startupInitComplete;
let _resetExtensionIfEnabled;
let _prevDash;
let _staticBgAnimationEnabled;

let _overviewHiddenSigId;
let _appDisplayScrollConId;
let _monitorsChangedSigId;
let _vwGestureUpdateId;
let _watchDockSigId;
let _showingOverviewSigId;
let _searchControllerSigId;
let _originalSearchControllerSigId;
let _showAppsIconBtnPressId;

let _resetTimeoutId;
let _startupAnimTimeoutId1;
let _startupAnimTimeoutId2;

// constants from settings
let ORIENTATION;
let WS_PREVIEW_SCALE;
let NUMBER_OF_VISIBLE_NEIGHBORS;
let WS_TMB_POSITION;
let WS_TMB_TOP;
let WS_TMB_RIGHT;
let WS_TMB_BOTTOM;
let WS_TMB_LEFT;
let WS_TMB_FULL;
let WS_TMB_POSITION_ADJUSTMENT
let SEC_WS_TMB_POSITION_ADJUSTMENT;
let SEC_WS_TMB_POSITION;
let SEC_WS_TMB_TOP;
let SEC_WS_TMB_RIGHT;
let SEC_WS_TMB_BOTTOM;
let SEC_WS_TMB_LEFT;
let SHOW_WS_TMB;
let SHOW_WS_TMB_BG;
let SHOW_WS_PREVIEW_BG;
let SHOW_WST_LABELS_ON_HOVER;
let SHOW_WST_LABELS;
let DASH_POSITION;
let DASH_TOP;
let DASH_RIGHT;
let DASH_BOTTOM;
let DASH_LEFT;
let DASH_VERTICAL;
let DASH_POSITION_ADJUSTMENT;
let CENTER_DASH_WS;
let SHOW_SEARCH_ENTRY;
let CENTER_SEARCH_VIEW;
let CENTER_APP_GRID;
let APP_GRID_ANIMATION;
let WS_ANIMATION;
let WIN_PREVIEW_ICON_SIZE;
let ALWAYS_SHOW_WIN_TITLES;
let STARTUP_STATE;
let SHOW_BG_IN_OVERVIEW;
let OVERVIEW_BG_BLUR_SIGMA;
let APP_GRID_BG_BLUR_SIGMA;
let SMOOTH_BLUR_TRANSITIONS;
let OVERVIEW_MODE;
let WORKSPACE_MODE;
let ANIMATION_TIME_FACTOR;
let STATIC_WS_SWITCHER_BG;


function activate() {
    _enabled = true;
    _verticalOverrides = {};
    _windowPreviewInjections = {};
    _wsSwitcherPopupInjections = {};
    _controlsManagerInjections = {};
    _workspaceAnimationInjections = {};
    _bgManagers = [];
    WORKSPACE_MIN_SPACING = Main.overview._overview._controls._thumbnailsBox.get_theme_node().get_length('spacing');

    original_MAX_THUMBNAIL_SCALE = WorkspaceThumbnail.MAX_THUMBNAIL_SCALE;

    gOptions = new Settings.Options();
    _updateSettings();
    gOptions.connect('changed', _updateSettings);
    if (Object.keys(_verticalOverrides).length != 0)
        reset();

    // common adjustments
    _verticalOverrides['WorkspacesView'] = _Util.overrideProto(WorkspacesView.WorkspacesView.prototype, WorkspacesViewOverride);
    _verticalOverrides['WorkspacesDisplay'] = _Util.overrideProto(WorkspacesView.WorkspacesDisplay.prototype, workspacesDisplayOverride);

    // adjust overview layout to better serve vertical workspaces orientation
    if (ORIENTATION === Clutter.Orientation.VERTICAL) {
        // switch internal workspace orientation in GS
        global.workspace_manager.override_workspace_layout(Meta.DisplayCorner.TOPLEFT, false, -1, 1);

        // fix overlay base for Vertical Workspaces
        _verticalOverrides['WorkspaceLayout'] = _Util.overrideProto(Workspace.WorkspaceLayout.prototype, WorkspaceLayoutOverride);
        _verticalOverrides['ThumbnailsBox'] = _Util.overrideProto(WorkspaceThumbnail.ThumbnailsBox.prototype, ThumbnailsBoxVerticalOverride);
        _verticalOverrides['BaseAppView'] = _Util.overrideProto(AppDisplay.BaseAppView.prototype, BaseAppViewOverride);
        _verticalOverrides['AppDisplay'] = _Util.overrideProto(AppDisplay.AppDisplay.prototype, AppDisplayOverride);
        _verticalOverrides['SecondaryMonitorDisplay'] = _Util.overrideProto(WorkspacesView.SecondaryMonitorDisplay.prototype, SecondaryMonitorDisplayVerticalOverride);
        _verticalOverrides['ControlsManagerLayout'] = _Util.overrideProto(OverviewControls.ControlsManagerLayout.prototype, ControlsManagerLayoutVerticalOverride);

        // reverse swipe gestures for enter/leave overview and ws switching
        Main.overview._swipeTracker.orientation = Clutter.Orientation.HORIZONTAL;
        Main.wm._workspaceAnimation._swipeTracker.orientation = Clutter.Orientation.VERTICAL;
        // overview's updateGesture() function should reflect ws tmb position to match appGrid/ws animation direction
        // function in connection cannot be overridden in prototype of its class because connected is actually another copy of the original function
        _originalGestureUpdateId = GObject.signal_handler_find(Main.overview._swipeTracker._touchpadGesture, { signalId: 'update' });
        Main.overview._swipeTracker._touchpadGesture.block_signal_handler(_originalGestureUpdateId);
        Main.overview._swipeTracker._updateGesture = SwipeTrackerOverride._updateGesture;
        _vwGestureUpdateId = Main.overview._swipeTracker._touchpadGesture.connect('update', SwipeTrackerOverride._updateGesture.bind(Main.overview._swipeTracker));


        // GS 42+ needs to help with the workspace switcher popup, older versions reflects new orientation automatically
        // avoid the injection is WSM extension is enabled because it brakes the popup
        const settings = ExtensionUtils.getSettings('org.gnome.shell');
        const enabled = settings.get_strv('enabled-extensions');
        const allowWsPopupInjection = !(enabled.includes('workspace-switcher-manager@G-dH.github.com') || enabled.includes('WsSwitcherPopupManager@G-dH.github.com-dev'));
        if (shellVersion >= 42 && allowWsPopupInjection)
            _injectWsSwitcherPopup();

    } else {
        // switch internal workspace orientation in GS
        global.workspace_manager.override_workspace_layout(Meta.DisplayCorner.TOPLEFT, false, 1, -1);

        _verticalOverrides['ThumbnailsBox'] = _Util.overrideProto(WorkspaceThumbnail.ThumbnailsBox.prototype, ThumbnailsBoxHorizontalOverride);
        _verticalOverrides['SecondaryMonitorDisplay'] = _Util.overrideProto(WorkspacesView.SecondaryMonitorDisplay.prototype, SecondaryMonitorDisplayHorizontalOverride);
        _verticalOverrides['ControlsManagerLayout'] = _Util.overrideProto(OverviewControls.ControlsManagerLayout.prototype, ControlsManagerLayoutHorizontalOverride);
    }
    _verticalOverrides['WorkspaceThumbnail'] = _Util.overrideProto(WorkspaceThumbnail.WorkspaceThumbnail.prototype, WorkspaceThumbnailOverride);
    _verticalOverrides['ControlsManager'] = _Util.overrideProto(OverviewControls.ControlsManager.prototype, ControlsManagerOverride);
    _verticalOverrides['WindowPreview'] = _Util.overrideProto(WindowPreview.WindowPreview.prototype, WindowPreviewOverride);
    _verticalOverrides['WorkspaceBackground'] = _Util.overrideProto(Workspace.WorkspaceBackground.prototype, WorkspaceBackgroundOverride);

    _prevDash = {};
    const dash = Main.overview.dash;
    _prevDash.dash = dash;
    _prevDash.position = dash.position;

    // move titles into window previews
    _injectWindowPreview();

    _moveDashAppGridIcon();

    /*_updateSearchEntryVisibility();
    _searchControllerSigId =  Main.overview._overview.controls._searchController.connect('notify::search-active', _updateSearchEntryVisibility);*/

    _setAppDisplayOrientation(ORIENTATION === Clutter.Orientation.VERTICAL);

    // switch PageUp/PageDown workspace switcher shortcuts
    _switchPageShortcuts();

    // set Dash orientation
    _updateDashPosition();

    // if Dash to Dock detected force enable "Fix for DtD" option
    if (Main.overview.dash._isHorizontal !== undefined) {
        gOptions.set('fixUbuntuDock', true);
        _fixUbuntuDock(true);
    } else {
        _fixUbuntuDock(gOptions.get('fixUbuntuDock'));
    }

    _setStaticBackground();
    _monitorsChangedSigId = Main.layoutManager.connect('monitors-changed', () => _resetExtension(3000));

    // static bg animations conflict with startup animation
    // enable it on first hiding from the overview and disconnect the signal
    _overviewHiddenSigId = Main.overview.connect('hiding', _enableStaticBgAnimation);

    // allow static bg during switching ws
    _injectWorkspaceAnimation();

    _connectShowAppsIcon();

    _replaceOnSearchChanged();
}

function reset() {
    _enabled = 0;

    _fixUbuntuDock(false);
    if (_monitorsChangedSigId) {
        Main.layoutManager.disconnect(_monitorsChangedSigId);
        _monitorsChangedSigId = 0;
    }

    // switch workspace orientation back to horizontal
    global.workspace_manager.override_workspace_layout(Meta.DisplayCorner.TOPLEFT, false, 1, -1);

    if (original_MAX_THUMBNAIL_SCALE)
        WorkspaceThumbnail.MAX_THUMBNAIL_SCALE = original_MAX_THUMBNAIL_SCALE;

    if (_searchControllerSigId) {
        Main.overview._overview.controls._searchController.disconnect(_searchControllerSigId);
        _searchControllerSigId = 0;
    }

    for (let name in _windowPreviewInjections) {
        _Util.removeInjection(WindowPreview.WindowPreview.prototype, _windowPreviewInjections, name);
    }
    _windowPreviewInjections = undefined;

    if (shellVersion >= 42) {
        for (let name in _wsSwitcherPopupInjections) {
            _Util.removeInjection(WorkspaceSwitcherPopup.WorkspaceSwitcherPopup.prototype, _wsSwitcherPopupInjections, name);
        }
        _wsSwitcherPopupInjections = undefined;
    }

    for (let name in _controlsManagerInjections) {
        _Util.removeInjection(OverviewControls.ControlsManager.prototype, _controlsManagerInjections, name);
    }
    _controlsManagerInjections = undefined;

    for (let name in _workspaceAnimationInjections) {
        _Util.removeInjection(WorkspaceAnimation.WorkspaceAnimationController.prototype, _workspaceAnimationInjections, name);
    }

    _Util.overrideProto(WorkspacesView.WorkspacesView.prototype, _verticalOverrides['WorkspacesView']);
    _Util.overrideProto(WorkspacesView.WorkspacesDisplay.prototype, _verticalOverrides['WorkspacesDisplay']);
    _Util.overrideProto(WorkspacesView.SecondaryMonitorDisplay.prototype, _verticalOverrides['SecondaryMonitorDisplay']);

    _Util.overrideProto(WorkspaceThumbnail.ThumbnailsBox.prototype, _verticalOverrides['ThumbnailsBox']);
    _Util.overrideProto(WorkspaceThumbnail.WorkspaceThumbnail.prototype, _verticalOverrides['WorkspaceThumbnail']);
    _Util.overrideProto(OverviewControls.ControlsManagerLayout.prototype, _verticalOverrides['ControlsManagerLayout']);
    _Util.overrideProto(OverviewControls.ControlsManager.prototype, _verticalOverrides['ControlsManager']);
    _Util.overrideProto(Workspace.WorkspaceLayout.prototype, _verticalOverrides['WorkspaceLayout']);
    _Util.overrideProto(AppDisplay.BaseAppView.prototype, _verticalOverrides['BaseAppView']);
    _Util.overrideProto(AppDisplay.AppDisplay.prototype, _verticalOverrides['AppDisplay']);
    _Util.overrideProto(WindowPreview.WindowPreview.prototype, _verticalOverrides['WindowPreview']);
    _Util.overrideProto(Workspace.WorkspaceBackground.prototype, _verticalOverrides['WorkspaceBackground']);

    // original swipeTrackers' orientation and updateGesture function
    Main.overview._swipeTracker.orientation = Clutter.Orientation.VERTICAL;
    Main.wm._workspaceAnimation._swipeTracker.orientation = Clutter.Orientation.HORIZONTAL;
    Main.overview._swipeTracker._updateGesture = SwipeTracker.SwipeTracker.prototype._updateGesture;
    if (_vwGestureUpdateId) {
        Main.overview._swipeTracker._touchpadGesture.disconnect(_vwGestureUpdateId);
        _vwGestureUpdateId = 0;
    }
    if (_originalGestureUpdateId) {
        Main.overview._swipeTracker._touchpadGesture.unblock_signal_handler(_originalGestureUpdateId);
        _originalGestureUpdateId = 0;
    }
    _verticalOverrides = {}


    _setAppDisplayOrientation(false);

    Main.overview.dash.visible = true;
    Main.overview.dash._background.opacity = 255;
    Main.overview.searchEntry.visible = true;
    Main.overview.searchEntry.opacity = 255;

    //Main.overview._overview._controls._thumbnailsBox._indicator.set_style()

    const reset = true;
    _moveDashAppGridIcon(reset);
    _prevDash = null;

    // switch PageUp/PageDown workspace switcher shortcuts
    _switchPageShortcuts();

    // remove Dash overrides if needed
    VerticalDash.reset();

    gOptions.destroy();
    gOptions = null;

    _setStaticBackground(reset);

    // remove any position offsets from dash and ws thumbnails
    Main.overview.dash.translation_x = 0;
    Main.overview.dash.translation_y = 0;
    Main.overview._overview._controls._thumbnailsBox.translation_x = 0;
    Main.overview._overview._controls._thumbnailsBox.translation_y = 0;
    Main.overview._overview._controls._searchEntryBin.translation_y = 0;

    Main.overview._overview._controls.set_child_above_sibling(Main.overview._overview._controls._workspacesDisplay, null);

    if (_overviewHiddenSigId) {
        Main.overview.disconnect(_overviewHiddenSigId);
    }

    St.Settings.get().slow_down_factor = 1;

    if (_startupAnimTimeoutId1)
        GLib.source_remove(_startupAnimTimeoutId1);

    if (_startupAnimTimeoutId2)
        GLib.source_remove(_startupAnimTimeoutId2);

    Main.overview._hideDone = Overview.Overview.prototype._hideDone;
    Main.overview.dash._background.set_style('');

    _replaceOnSearchChanged(reset);

    _connectShowAppsIcon(reset);
}

function _replaceOnSearchChanged(reset = false) {
    const searchController = Main.overview._overview.controls._searchController;
    if (reset) {
        if (_searchControllerSigId) {
            searchController.disconnect(_searchControllerSigId);
            _searchControllerSigId = 0;
        }
        if (_originalSearchControllerSigId) {
            searchController.unblock_signal_handler(_originalSearchControllerSigId);
            _originalSearchControllerSigId = 0;
        }
    } else {
        // reconnect signal to use custom function (callbacks cannot be overridden in class prototype, they are already in memory as a copy for the given callback)
        _originalSearchControllerSigId = GObject.signal_handler_find(searchController, { signalId: 'notify', detail: 'search-active' });
        if (_originalSearchControllerSigId) {
            searchController.block_signal_handler(_originalSearchControllerSigId);
        }
        _searchControllerSigId = searchController.connect('notify::search-active', ControlsManagerOverride._onSearchChanged.bind(Main.overview._overview.controls));
    }

}

function _enableStaticBgAnimation() {
    _staticBgAnimationEnabled = true;
    Main.overview.disconnect(_overviewHiddenSigId);
    _overviewHiddenSigId = 0;
}

function _resetExtension(timeout = 200) {
    if (_resetTimeoutId)
        GLib.source_remove(_resetTimeoutId);
    _resetTimeoutId = GLib.timeout_add(
        GLib.PRIORITY_DEFAULT,
        timeout,
        () => {
            if (!_enabled)
                return;

            const dash = Main.overview.dash;
            if (!timeout && _prevDash.dash && dash !== _prevDash.dash) { // !timeout means DtD workaround callback
                _prevDash.dash = dash;
                log(`[${Me.metadata.name}]: Dash has been replaced, resetting extension...`);
                reset();
                activate();
            } else if (timeout) {
                log(`[${Me.metadata.name}]: resetting extension...`);
                reset();
                activate();
            }
            _resetTimeoutId = 0;
            return GLib.SOURCE_REMOVE;
        }
    );
}

function _fixUbuntuDock(activate = true) {
    // Workaround for Ubuntu Dock breaking overview allocations after changing monitor configuration and deactivating dock
    if (_shellSettings && _watchDockSigId) {
        _shellSettings.disconnect(_watchDockSigId);
        _watchDockSigId = 0;
    }
    _shellSettings = null;

    if (_resetTimeoutId) {
        GLib.source_remove(_resetTimeoutId);
        _resetTimeoutId = 0;
    }

    _resetExtensionIfEnabled = () => {};

    if (_showingOverviewSigId) {
        Main.overview.disconnect(_showingOverviewSigId);
        _showingOverviewSigId = 0;
    }

    if (!activate) {
        return;
    }

    _shellSettings = ExtensionUtils.getSettings( 'org.gnome.shell');
    _watchDockSigId = _shellSettings.connect('changed::enabled-extensions', () => _resetExtension());
    _resetExtensionIfEnabled = _resetExtension;
    _showingOverviewSigId = Main.overview.connect('showing', () => {
        // workaround for Ubuntu Dock breaking overview allocations after changing position
        const dash = Main.overview.dash;
        if (_prevDash.dash !== dash || _prevDash.position !== dash._position) {
            _resetExtensionIfEnabled(0);
        }
    });
}

//*************************************************************************************************

function _updateSettings(settings, key) {
    const dash = Main.overview.dash;
    if (dash._isHorizontal !== undefined) {
        DASH_POSITION = dash._position;
    } else {
        DASH_POSITION = gOptions.get('dashPosition', true);
    }
    DASH_TOP = DASH_POSITION === 0;
    DASH_RIGHT = DASH_POSITION === 1;
    DASH_BOTTOM = DASH_POSITION === 2;
    DASH_LEFT = DASH_POSITION === 3;
    DASH_VERTICAL = DASH_LEFT || DASH_RIGHT;
    Main.overview.dash.visible = DASH_POSITION !== 4; // 4 - disable

    DASH_POSITION_ADJUSTMENT = gOptions.get('dashPositionAdjust', true);
    DASH_POSITION_ADJUSTMENT = DASH_POSITION_ADJUSTMENT * -1 / 100; // range 1 to -1
    CENTER_DASH_WS = gOptions.get('centerDashToWs', true);

    VerticalDash.DASH_TOP = DASH_TOP;
    VerticalDash.DASH_RIGHT = DASH_RIGHT;
    VerticalDash.DASH_BOTTOM = DASH_BOTTOM;
    VerticalDash.DASH_LEFT = DASH_LEFT;
    VerticalDash.MAX_ICON_SIZE = VerticalDash.BaseIconSizes[gOptions.get('dashMaxIconSize', true)];

    if (Main.overview.dash._isHorizontal === undefined) {// DtD has its own opacity control
        Main.overview.dash._background.opacity = Math.round(gOptions.get('dashBgOpacity', true) * 2.5); // conversion % to 0-255
        const radius = gOptions.get('dashBgRadius', true);
        if (radius) {
            let style;
            switch (DASH_POSITION) {
            case 1:
                style = `border-radius: ${radius}px 0 0 ${radius}px;`
                break;
            case 3:
                style = `border-radius: 0 ${radius}px ${radius}px 0;`
                break;
            default:
                style = `border-radius: ${radius}px;`
            }
            Main.overview.dash._background.set_style(style);
        } else {
            Main.overview.dash._background.set_style('');
        }
    }

    WS_TMB_POSITION = gOptions.get('workspaceThumbnailsPosition', true);
    ORIENTATION = WS_TMB_POSITION > 4 ? Clutter.Orientation.HORIZONTAL : Clutter.Orientation.VERTICAL;
    WORKSPACE_MAX_SPACING = gOptions.get('wsMaxSpacing', true);
                            //ORIENTATION || DASH_LEFT || DASH_RIGHT ? 350 : 80;
    SHOW_WS_TMB = ![4, 9].includes(WS_TMB_POSITION); // 4, 9 - disable
    WS_TMB_FULL = gOptions.get('WsThumbnailsFull', true);
    // translate ws tmb position to 0 top, 1 right, 2 bottom, 3 left
    //0L 1R, 2LF, 3RF, 4DV, 5T, 6B, 7TF, 8BF, 9DH
    WS_TMB_POSITION = [3, 1, 3, 1, 4, 0, 2, 0, 2, 8][WS_TMB_POSITION];
    WS_TMB_TOP = WS_TMB_POSITION === 0;
    WS_TMB_RIGHT = WS_TMB_POSITION === 1;
    WS_TMB_BOTTOM = WS_TMB_POSITION === 2;
    WS_TMB_LEFT = WS_TMB_POSITION === 3;
    WS_TMB_POSITION_ADJUSTMENT = gOptions.get('wsTmbPositionAdjust', true) * -1 / 100; // range 1 to -1
    SEC_WS_TMB_POSITION = gOptions.get('secondaryWsThumbnailsPosition', true);
    SEC_WS_TMB_TOP = (SEC_WS_TMB_POSITION === 0 && !ORIENTATION) || (SEC_WS_TMB_POSITION === 2 && WS_TMB_TOP);
    SEC_WS_TMB_RIGHT = (SEC_WS_TMB_POSITION === 1 && ORIENTATION) || (SEC_WS_TMB_POSITION === 2 && WS_TMB_RIGHT);
    SEC_WS_TMB_BOTTOM = (SEC_WS_TMB_POSITION === 1 && !ORIENTATION) || (SEC_WS_TMB_POSITION === 2 && WS_TMB_BOTTOM);
    SEC_WS_TMB_LEFT = (SEC_WS_TMB_POSITION === 0 && ORIENTATION) || (SEC_WS_TMB_POSITION === 2 && WS_TMB_LEFT);

    SEC_WS_TMB_POSITION_ADJUSTMENT = gOptions.get('SecWsTmbPositionAdjust', true) * -1 / 100; // range 1 to -1
    SHOW_WST_LABELS = gOptions.get('showWsTmbLabels', true);
    SHOW_WST_LABELS_ON_HOVER = gOptions.get('showWsTmbLabelsOnHover', true);

    MAX_THUMBNAIL_SCALE = gOptions.get('wsThumbnailScale', true) / 100;
    WorkspaceThumbnail.MAX_THUMBNAIL_SCALE = MAX_THUMBNAIL_SCALE;

    WS_PREVIEW_SCALE = gOptions.get('wsPreviewScale', true) / 100;
    // calculate number of possibly visible neighbor previews according to ws scale
    NUMBER_OF_VISIBLE_NEIGHBORS = Math.round(1 + (100 - WS_PREVIEW_SCALE) / 40);

    SHOW_WS_TMB_BG = gOptions.get('showWsSwitcherBg', true) && SHOW_WS_TMB;
    SHOW_WS_PREVIEW_BG = gOptions.get('showWsPreviewBg', true);

    CENTER_APP_GRID = gOptions.get('centerAppGrid', true);

    SHOW_SEARCH_ENTRY = gOptions.get('showSearchEntry', true);
    Main.overview.searchEntry.visible = SHOW_SEARCH_ENTRY;
    CENTER_SEARCH_VIEW = gOptions.get('centerSearch', true);
    APP_GRID_ANIMATION = gOptions.get('appGridAnimation', true);
    if (APP_GRID_ANIMATION === 4) {
        if (ORIENTATION === Clutter.Orientation.VERTICAL) {
            APP_GRID_ANIMATION = (WS_TMB_LEFT || !SHOW_WS_TMB) ? 1 : 2; // 1 right, 2 left
        } else {
            APP_GRID_ANIMATION = (WS_TMB_TOP  || !SHOW_WS_TMB) ? 3 : 5; // 3 bottom, 5 top
        }
    }
    WS_ANIMATION = gOptions.get('workspaceAnimation', true);

    WIN_PREVIEW_ICON_SIZE = [64, 48, 32, 22, 8][gOptions.get('winPreviewIconSize', true)];
    ALWAYS_SHOW_WIN_TITLES = gOptions.get('alwaysShowWinTitles', true);

    STARTUP_STATE = gOptions.get('startupState', true);
    SHOW_BG_IN_OVERVIEW = gOptions.get('showBgInOverview', true);
    OVERVIEW_BG_BLUR_SIGMA = gOptions.get('overviewBgBlurSigma', true);
    APP_GRID_BG_BLUR_SIGMA = gOptions.get('appGridBgBlurSigma', true);
    SMOOTH_BLUR_TRANSITIONS = gOptions.get('smoothBlurTransitions', true);

    OVERVIEW_MODE = gOptions.get('overviewMode', true);
    WORKSPACE_MODE = OVERVIEW_MODE ? 0 : 1;

    STATIC_WS_SWITCHER_BG = gOptions.get('workspaceSwitcherAnimation', true);

    ANIMATION_TIME_FACTOR = gOptions.get('animationSpeedFactor', true) / 100;
    St.Settings.get().slow_down_factor = ANIMATION_TIME_FACTOR;

    _switchPageShortcuts();
    _setStaticBackground();
    if (key === 'fix-ubuntu-dock')
        _fixUbuntuDock(gOptions.get('fixUbuntuDock', true));
    if (key === 'show-app-icon-position')
        _moveDashAppGridIcon();
    if (key === 'dash-position')
        _updateDashPosition();
    if (key === 'dash-max-icon-size')
        Main.overview.dash._redisplay();
    if (key === 'ws-thumbnails-position') {
        reset();
        activate();
    }
}

function _updateDashPosition() {
    switch (DASH_POSITION) {
    case 0: // TOP
    case 2: // BOTTOM
        //VerticalDash.reset();
        const horizontal = true;
        VerticalDash.override(horizontal);
        VerticalDash.gOptions = null;
        break;
    case 3: // LEFT
    case 1: // RIGHT
        VerticalDash.gOptions = gOptions;
        // avoid conflict with DtD extension
        if (Main.overview.dash._isHorizontal === undefined)
            VerticalDash.override();
        break;
    default:
        VerticalDash.reset();
    }
    Main.overview.dash._redisplay();
}

function _connectShowAppsIcon(reset = false) {
    if (!reset) {
        if (_showAppsIconBtnPressId) {
            // button is already connected
            return;
        }

        Main.overview.dash._showAppsIcon.reactive = true;
        _showAppsIconBtnPressId = Main.overview.dash._showAppsIcon.connect('button-press-event', (actor, event) => {
            if (event.get_button() === Clutter.BUTTON_MIDDLE) {
                _openPreferences();
            } else {
                return Clutter.EVENT_PROPAGATE;
            }
        });
    } else {
        if (_showAppsIconBtnPressId) {
            Main.overview.dash._showAppsIcon.disconnect(_showAppsIconBtnPressId);
            _showAppsIconBtnPressId = 0;
        }
        Main.overview.dash._showAppsIcon.reactive = false;
    }
}

function _openPreferences() {
    const windows = global.display.get_tab_list(Meta.TabList.NORMAL_ALL, null);
    let tracker = Shell.WindowTracker.get_default();
    let metaWin, isVW = null;

    for (let win of windows) {
        const app = tracker.get_window_app(win);
        if (win.get_title().includes(Me.metadata.name) && app.get_name() === 'Extensions') {
            // this is our existing window
            metaWin = win;
            isVW = true;
            break;
        } else if (win.wm_class.includes('org.gnome.Shell.Extensions')) {
            // this is prefs window of another extension
            metaWin = win;
            isVW = false;
        }
    }

    if (metaWin && !isVW) {
        // other prefs window blocks opening another prefs window, so close it
        metaWin.delete(global.get_current_time());
    } else if (metaWin && isVW) {
        // if prefs window already exist, move it to the current WS and activate it
        metaWin.change_workspace(global.workspace_manager.get_active_workspace());
        metaWin.activate(global.get_current_time());
    }

    if (!metaWin || (metaWin && !isVW)) {
        try {
            Main.extensionManager.openExtensionPrefs(Me.metadata.uuid, '', {});
        } catch (e) {
            log(e);
        }
    }
}

function _switchPageShortcuts() {
    if (!gOptions.get('enablePageShortcuts', true))
        return;

    const vertical = global.workspaceManager.layout_rows === -1;
    const schema  = 'org.gnome.desktop.wm.keybindings';
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
        switchLeft.includes(switchPrevSc)  && switchLeft.splice(switchLeft.indexOf(switchPrevSc), 1);
        switchRight.includes(switchNextSc) && switchRight.splice(switchRight.indexOf(switchNextSc), 1);
        moveLeft.includes(movePrevSc)      && moveLeft.splice(moveLeft.indexOf(movePrevSc), 1);
        moveRight.includes(moveNextSc)     && moveRight.splice(moveRight.indexOf(moveNextSc), 1);

        switchUp.includes(switchPrevSc)    || switchUp.push(switchPrevSc);
        switchDown.includes(switchNextSc)  || switchDown.push(switchNextSc);
        moveUp.includes(movePrevSc)        || moveUp.push(movePrevSc);
        moveDown.includes(moveNextSc)      || moveDown.push(moveNextSc);
    } else {
        switchLeft.includes(switchPrevSc)  || switchLeft.push(switchPrevSc);
        switchRight.includes(switchNextSc) || switchRight.push(switchNextSc);
        moveLeft.includes(movePrevSc)      || moveLeft.push(movePrevSc);
        moveRight.includes(moveNextSc)     || moveRight.push(moveNextSc);

        switchUp.includes(switchPrevSc)    && switchUp.splice(switchUp.indexOf(switchPrevSc), 1);
        switchDown.includes(switchNextSc)  && switchDown.splice(switchDown.indexOf(switchNextSc), 1);
        moveUp.includes(movePrevSc)        && moveUp.splice(moveUp.indexOf(movePrevSc), 1);
        moveDown.includes(moveNextSc)      && moveDown.splice(moveDown.indexOf(moveNextSc), 1);
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


//----- WorkspaceSwitcherPopup --------------------------------------------------------
function _injectWsSwitcherPopup() {
    _wsSwitcherPopupInjections['_init'] = _Util.injectToFunction(
        WorkspaceSwitcherPopup.WorkspaceSwitcherPopup.prototype, '_init', function() {
            if (this._list) {
                this._list.vertical = true;
            }
        }
    );
}

//----- WindowPreview ------------------------------------------------------------------
function _injectWindowPreview() {
    _windowPreviewInjections['_init'] = _Util.injectToFunction(
        WindowPreview.WindowPreview.prototype, '_init', function() {
            const ICON_OVERLAP = 0.7;

            if (WIN_PREVIEW_ICON_SIZE < 64) {
                this.remove_child(this._icon);
                this._icon.destroy();
                const tracker = Shell.WindowTracker.get_default();
                const app = tracker.get_window_app(this.metaWindow);
                this._icon = app.create_icon_texture(WIN_PREVIEW_ICON_SIZE);
                this._icon.add_style_class_name('icon-dropshadow');
                this._icon.set({
                    reactive: true,
                    pivot_point: new Graphene.Point({ x: 0.5, y: 0.5 }),
                });
                this._icon.add_constraint(new Clutter.BindConstraint({
                    source: this.windowContainer,
                    coordinate: Clutter.BindCoordinate.POSITION,
                }));
                this._icon.add_constraint(new Clutter.AlignConstraint({
                    source: this.windowContainer,
                    align_axis: Clutter.AlignAxis.X_AXIS,
                    factor: 0.5,
                }));
                this._icon.add_constraint(new Clutter.AlignConstraint({
                    source: this.windowContainer,
                    align_axis: Clutter.AlignAxis.Y_AXIS,
                    pivot_point: new Graphene.Point({ x: -1, y: ICON_OVERLAP }),
                    factor: 1,
                }));
                this.add_child(this._icon);
                if (WIN_PREVIEW_ICON_SIZE < 22) {
                    // disable app icon
                    this._icon.hide();
                }
                this._iconSize = WIN_PREVIEW_ICON_SIZE;
            }

            const { scaleFactor } = St.ThemeContext.get_for_stage(global.stage);
            const iconOverlap = WIN_PREVIEW_ICON_SIZE * ICON_OVERLAP;
            // we cannot get proper title height before it gets to the stage, so 35 is estimated height + spacing
            this._title.get_constraints()[1].offset = scaleFactor * (- iconOverlap - 35);
            this.set_child_above_sibling(this._title, null);
            // if window is created while the overview is shown, icon and title should visible immediately
            if (Main.overview._overview._controls._stateAdjustment.value < 1) {
                this._icon.scale_x = 0;
                this._icon.scale_y = 0;
                this._title.opacity = 0;
            }

            if (ALWAYS_SHOW_WIN_TITLES) {
                this._title.show();
                if (!OVERVIEW_MODE)
                    this._title.opacity = 255;
            }

            if (OVERVIEW_MODE === 1) {
                // spread windows on hover
                this._wsStateConId = this.connect('enter-event', () => {
                    const adjustment = this._workspace._background._stateAdjustment;
                    if (!adjustment.value && !Main.overview._animationInProgress) {
                        WORKSPACE_MODE = 1;
                        if (adjustment.value === 0) {
                            adjustment.value = 0;
                            adjustment.ease(1, {
                                duration: 200,
                                mode: Clutter.AnimationMode.EASE_OUT_QUAD
                            });
                        }
                    }
                });
            }
            if (OVERVIEW_MODE) {
                // show window icon and title on ws windows spread
                this._stateAdjustmentSigId = this._workspace.stateAdjustment.connect('notify::value', this._updateIconScale.bind(this));
            }
        }
    );
}

//----- AppDisplay -------------------------------------------------------------------
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
            appDisplay._hintContainer && scrollContainer.remove_child(appDisplay._hintContainer);
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
        appDisplay._hintContainer && appDisplay._hintContainer.get_parent() == null && scrollContainer.add_child(appDisplay._hintContainer);
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

function _moveDashAppGridIcon(reset = false) {
    // move dash app grid icon to the front
    const dash = Main.overview.dash;
    // don't touch DtD
    if (dash._isHorizontal !== undefined)
        return;

    const appIconPosition = gOptions.get('showAppsIconPosition', true);
    dash._showAppsIcon.visible = true;
    if (reset || appIconPosition === 0) // 0 - start
        dash._dashContainer.set_child_at_index(dash._showAppsIcon, 0);
    if (!reset && appIconPosition === 1) // 1 - end
        dash._dashContainer.set_child_at_index(dash._showAppsIcon, 1);
    if (!reset && appIconPosition === 2) // 2 - disable
        dash._showAppsIcon.visible = false;
}

// ---- workspace ---------------------------------------------
// WorkspaceBackground
var WorkspaceBackgroundOverride = {
    _updateBorderRadius: function(value = false) {
        // don't round already rounded corners during exposing windows
        if (value === false && OVERVIEW_MODE === 1) {
            return;
        }
        const { scaleFactor } = St.ThemeContext.get_for_stage(global.stage);
        const cornerRadius = scaleFactor * BACKGROUND_CORNER_RADIUS_PIXELS;

        const backgroundContent = this._bgManager.backgroundActor.content;
        value = (value !==false)
                ? value
                : this._stateAdjustment.value;

        backgroundContent.rounded_clip_radius =
            Util.lerp(0, cornerRadius, value);
    }
}

// ---- workspacesView ----------------------------------------
// WorkspacesView
var WorkspacesViewOverride = {
    _getFirstFitSingleWorkspaceBox: function(box, spacing, vertical) {
        let [width, height] = box.get_size();
        const [workspace] = this._workspaces;

        const rtl = this.text_direction === Clutter.TextDirection.RTL;
        const adj = this._scrollAdjustment;
        const currentWorkspace = vertical || !rtl
            ? adj.value : adj.upper - adj.value - 1;

        // Single fit mode implies centered too
        let [x1, y1] = box.get_origin();
        const [, workspaceWidth] = workspace ? workspace.get_preferred_width(Math.floor(height)) : [,width];
        const [, workspaceHeight] = workspace ? workspace.get_preferred_height(workspaceWidth) : [,height];

        if (vertical) {
            x1 += (width - workspaceWidth) / 2;
            y1 -= currentWorkspace * (workspaceHeight + spacing);
        } else {
            x1 += (width - workspaceWidth) / 2;
            x1 -= currentWorkspace * (workspaceWidth + spacing);
        }

        const fitSingleBox = new Clutter.ActorBox({x1, y1});

        fitSingleBox.set_size(workspaceWidth, workspaceHeight);

        return fitSingleBox;
    },

    // avoid overlapping of adjacent workspaces with the current view
    _getSpacing: function(box, fitMode, vertical) {
        const [width, height] = box.get_size();
        const [workspace] = this._workspaces;

        if (!workspace) return;

        let availableSpace;
        let workspaceSize;
        if (vertical) {
            [, workspaceSize] = workspace.get_preferred_height(width);
            availableSpace = height;
        } else {
            [, workspaceSize] = workspace.get_preferred_width(height);
            availableSpace = width;
        }

        const spacing = (availableSpace - workspaceSize * 0.4) * (1 - fitMode);
        const { scaleFactor } = St.ThemeContext.get_for_stage(global.stage);

        return Math.clamp(spacing,
            WORKSPACE_MIN_SPACING * scaleFactor,
            WORKSPACE_MAX_SPACING * scaleFactor);
    },

    // this function has duplicate in OverviewControls so we use one function for both to avoid issues with syncing them
    _getFitModeForState: function(state) {
        return _getFitModeForState(state);
    },

    // normal view 0, spread windows 1
    _getWorkspaceModeForOverviewState: function(state) {
        const { ControlsState } = OverviewControls;

        switch (state) {
        case ControlsState.HIDDEN:
            return 0;
        case ControlsState.WINDOW_PICKER:
            return WORKSPACE_MODE;
        case ControlsState.APP_GRID:
            return ((this._monitorIndex !== global.display.get_primary_monitor() || !WS_ANIMATION) && !OVERVIEW_MODE) ? 1 : 0;
        }

        return 0;
    },

    _updateVisibility: function() {
        let workspaceManager = global.workspace_manager;
        let active = workspaceManager.get_active_workspace_index();

        const fitMode = this._fitModeAdjustment.value;
        const singleFitMode = fitMode === WorkspacesView.FitMode.SINGLE;

        for (let w = 0; w < this._workspaces.length; w++) {
            let workspace = this._workspaces[w];

            if (this._animating || this._gestureActive || !singleFitMode) {
                //workspace.show();
            } else {
                workspace.visible = Math.abs(w - active) <= NUMBER_OF_VISIBLE_NEIGHBORS;
            }

        }
    },

    // disable scaling and hide inactive workspaces
    _updateWorkspacesState: function() {
        const adj = this._scrollAdjustment;
        const fitMode = this._fitModeAdjustment.value;

        let { initialState, finalState, progress, currentState } =
            this._overviewAdjustment.getStateTransitionParams();

        const workspaceMode = (1 - fitMode) * Util.lerp(
            this._getWorkspaceModeForOverviewState(initialState),
            this._getWorkspaceModeForOverviewState(finalState),
            progress);

        const currentMonitor = Main.layoutManager.primaryMonitor.index;

        // define the transition values here to save time in each ws
        let scaleX, scaleY;
        if (ORIENTATION) { //vertical 1 / horizontal 0
            scaleX = 1;
            scaleY = 0.1;
        } else {
            scaleX = 0.1;
            scaleY = 1;
        }
        // Hide inactive workspaces
        this._workspaces.forEach((w, index) => {
            w.stateAdjustment.value = workspaceMode;

            const distanceToCurrentWorkspace = Math.abs(adj.value - index);

            const scaleProgress = 1 - Math.clamp(distanceToCurrentWorkspace, 0, 1);

            // if we disable workspaces that we can't or don't need to see, transition animations will be noticeably smoother

            // only the current ws needs to be visible during overview transition animations
            //                        and only current and adjacent ws when switching ws
            if (WORKSPACE_MAX_SPACING > 340) { // large spacing - only one workspace needs to be visible at once in the overview
                w.visible = scaleProgress || ((currentState % 1) && !distanceToCurrentWorkspace);

            // horizontal orientation - 2 adjacent workspaces can be visible on the screen with the current one
            // in order to keep animations as smooth as possible, hide all ws that cannot/shouldn't be visible at the given time
            } else {
                //
                w.visible = w.monitorIndex !== currentMonitor || scaleProgress || (!WS_ANIMATION && distanceToCurrentWorkspace < NUMBER_OF_VISIBLE_NEIGHBORS)
                    || (distanceToCurrentWorkspace < NUMBER_OF_VISIBLE_NEIGHBORS && currentState <= ControlsState.WINDOW_PICKER
                        && ((initialState < ControlsState.APP_GRID && finalState < ControlsState.APP_GRID))
                );

                // after transition from APP_GRID to WINDOW_PICKER state,
                // adjacent workspaces are hidden and we need them to show up
                // make them visible during animation can impact smoothness of the animation
                // so we show them after the animation finished, scaling animation will make impression that they move in from outside the monitor
                if (!w.visible && distanceToCurrentWorkspace <= NUMBER_OF_VISIBLE_NEIGHBORS && currentState === ControlsState.WINDOW_PICKER) {
                    w.scale_x = scaleX;
                    w.scale_y = scaleY;
                    w.visible = true;
                    w.ease({
                        duration: 100,
                        scale_x: 1,
                        scale_y: 1,
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    });
                }
            }

            // force ws preview bg corner radiuses where GS doesn't do it
            if (SHOW_WS_PREVIEW_BG && OVERVIEW_MODE === 1 && distanceToCurrentWorkspace < 2) {
                w._background._updateBorderRadius(w._overviewAdjustment.value);
            }

            // hide workspace background
            if (!SHOW_WS_PREVIEW_BG && w._background.opacity) {
                w._background.opacity = 0;
            }
        });
    }
}

var workspacesDisplayOverride = {
    _updateWorkspacesViews: function() {
        for (let i = 0; i < this._workspacesViews.length; i++)
            this._workspacesViews[i].destroy();

        this._primaryIndex = Main.layoutManager.primaryIndex;
        this._workspacesViews = [];
        let monitors = Main.layoutManager.monitors;
        for (let i = 0; i < monitors.length; i++) {
            let view;
            if (i === this._primaryIndex) {
                view = new WorkspacesView.WorkspacesView(i,
                    this._controls,
                    this._scrollAdjustment,
                    this._fitModeAdjustment,
                    this._overviewAdjustment);

                view.visible = this._primaryVisible;
                this.bind_property('opacity', view, 'opacity', GObject.BindingFlags.SYNC_CREATE);
                this.add_child(view);
            } else {
                view = new WorkspacesView.SecondaryMonitorDisplay(i,
                    this._controls,
                    this._scrollAdjustment,
                    // Secondary monitors don't need FitMode.ALL since there is workspace switcher always visible
                    //this._fitModeAdjustment,
                    new St.Adjustment({
                        actor: this,
                        value: 0,//FitMode.SINGLE,
                        lower: 0,//FitMode.SINGLE,
                        upper: 0,//FitMode.SINGLE,
                    }),
                    this._overviewAdjustment);
                Main.layoutManager.overviewGroup.add_actor(view);
            }

            this._workspacesViews.push(view);
        }
    }
}

// common for OverviewControls and Vertical Workspaces
function _getFitModeForState(state) {
    switch (state) {
    case ControlsState.HIDDEN:
    case ControlsState.WINDOW_PICKER:
        return WorkspacesView.FitMode.SINGLE;
    case ControlsState.APP_GRID:
        if (WS_ANIMATION && SHOW_WS_TMB)
            return WorkspacesView.FitMode.ALL;
        else
            return WorkspacesView.FitMode.SINGLE;
    default:
        return WorkspacesView.FitMode.SINGLE;
    }
}

// WindowPreview
var WindowPreviewOverride = {
    _updateIconScale: function() {
        let { currentState, initialState, finalState } =
            this._overviewAdjustment.getStateTransitionParams();

        // Current state - 0 - HIDDEN, 1 - WINDOW_PICKER, 2 - APP_GRID
        const primaryMonitor = this.metaWindow.get_monitor() === global.display.get_primary_monitor();

        const visible =
            (initialState > ControlsState.HIDDEN || finalState > ControlsState.HIDDEN)
            && !(finalState === ControlsState.APP_GRID && primaryMonitor);

        let scale = visible
            ? (currentState >= 1 ? 1 : currentState % 1) : 0;
        if (!primaryMonitor &&
            ((initialState === ControlsState.WINDOW_PICKER && finalState === ControlsState.APP_GRID) ||
            (initialState === ControlsState.APP_GRID && finalState === ControlsState.WINDOW_PICKER))
            ) {
            scale = 1;
        } else if (primaryMonitor && ((initialState === ControlsState.WINDOW_PICKER && finalState === ControlsState.APP_GRID) ||
            initialState === ControlsState.APP_GRID && finalState === ControlsState.HIDDEN)) {
            scale = 0;
        }

        // in static workspace mode show icon and title on ws windows spread
        if (OVERVIEW_MODE) {
            const windowsSpread = this._workspace.stateAdjustment.value;
            if (currentState === 1) {
                scale = windowsSpread;
            } else if (finalState === 1 || (finalState === 0 && !windowsSpread)) {
                return;
            }
        }

        this._icon.set({
            scale_x: scale,
            scale_y: scale,
        });

        // if titles are in 'always show' mode, we need to add transition between visible/invisible state
        this._title.set({
            opacity: Math.round(scale * 255),
            //scale_y: scale,
        });
    },

    showOverlay: function(animate) {
        if (!this._overlayEnabled)
            return;

        if (this._overlayShown)
            return;

        this._overlayShown = true;
        //this._restack();

        // If we're supposed to animate and an animation in our direction
        // is already happening, let that one continue
        const ongoingTransition = this._title.get_transition('opacity');
        if (animate &&
            ongoingTransition &&
            ongoingTransition.get_interval().peek_final_value() === 255)
            return;

        const toShow = this._windowCanClose()
            ? [this._closeButton]
            : [];

        if (!ALWAYS_SHOW_WIN_TITLES) {
            toShow.push(this._title);
        }

        toShow.forEach(a => {
            a.opacity = 0;
            a.show();
            a.ease({
                opacity: 255,
                duration: animate ? WindowPreview.WINDOW_OVERLAY_FADE_TIME : 0,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        });

        const [width, height] = this.window_container.get_size();
        const { scaleFactor } = St.ThemeContext.get_for_stage(global.stage);
        const activeExtraSize = WindowPreview.WINDOW_ACTIVE_SIZE_INC * 2 * scaleFactor;
        const origSize = Math.max(width, height);
        const scale = (origSize + activeExtraSize) / origSize;

        this.window_container.ease({
            scale_x: scale,
            scale_y: scale,
            duration: animate ? WindowPreview.WINDOW_SCALE_TIME : 0,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });

        this.emit('show-chrome');
    },

    hideOverlay: function(animate) {
        if (!this._overlayShown)
            return;
        this._overlayShown = false;
        //this._restack();

        // If we're supposed to animate and an animation in our direction
        // is already happening, let that one continue
        const ongoingTransition = this._title.get_transition('opacity');
        if (animate &&
            ongoingTransition &&
            ongoingTransition.get_interval().peek_final_value() === 0)
            return;

        const toHide = [this._closeButton];

        if (!ALWAYS_SHOW_WIN_TITLES) {
            toHide.push(this._title);
        }
        toHide.forEach(a => {
            a.opacity = 255;
            a.ease({
                opacity: 0,
                duration: animate ? WindowPreview.WINDOW_OVERLAY_FADE_TIME : 0,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => a.hide(),
            });
        });

        if (this.window_container) {
            this.window_container.ease({
                scale_x: 1,
                scale_y: 1,
                duration: animate ? WindowPreview.WINDOW_SCALE_TIME : 0,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }
    },

    _onDestroy() {
        // fix for upstream bug - hideOverlay is called after windowPreview is destroyed, from the leave event callback
        // but it still throws:
        //  clutter_actor_get_preferred_width: assertion 'CLUTTER_IS_ACTOR (self)' failed
        //  clutter_actor_get_preferred_height: assertion 'CLUTTER_IS_ACTOR (self)' failed
        this.hideOverlay(false);

        this.metaWindow._delegate = null;
        this._delegate = null;

        if (this._longPressLater) {
            Meta.later_remove(this._longPressLater);
            delete this._longPressLater;
        }

        if (this._idleHideOverlayId > 0) {
            GLib.source_remove(this._idleHideOverlayId);
            this._idleHideOverlayId = 0;
        }

        if (this.inDrag) {
            this.emit('drag-end');
            this.inDrag = false;
        }

        if (this._stateAdjustmentSigId) {
            this._workspace.stateAdjustment.disconnect(this._stateAdjustmentSigId);
        }
    }
}

//  SecondaryMonitorDisplay Vertical

var SecondaryMonitorDisplayVerticalOverride = {
    _getThumbnailParamsForState: function(state) {
        const { ControlsState } = OverviewControls;

        let opacity, scale, translation_x;
        switch (state) {
        case ControlsState.HIDDEN:
            opacity = 255;
            scale = 1;
            translation_x = 0;
            if (_staticBgAnimationEnabled && (!SHOW_WS_PREVIEW_BG || OVERVIEW_MODE === 2)) {
                translation_x = this._thumbnails.width * (SEC_WS_TMB_LEFT ? -1 : 1);
            }
            break;
        case ControlsState.WINDOW_PICKER:
        case ControlsState.APP_GRID:
            opacity = 255;
            scale = 1;
            translation_x = 0;
            break;
        default:
            opacity = 255;
            scale = 1;
            translation_x = 0;
            break;
        }

        return { opacity, scale, translation_x };
    },

    _getThumbnailsWidth: function(box, spacing) {
        if (!this._thumbnails.visible)
            return 0;

        const [width, height] = box.get_size();
        const { expandFraction } = this._thumbnails;
        const [, thumbnailsWidth] = this._thumbnails.get_preferred_custom_width(height - 2 * spacing);
        return Math.min(
            thumbnailsWidth * expandFraction,
            width * MAX_THUMBNAIL_SCALE);
    },

    _getWorkspacesBoxForState: function(state, box, padding, thumbnailsWidth, spacing) {
        const { ControlsState } = OverviewControls;
        const workspaceBox = box.copy();
        const [width, height] = workspaceBox.get_size();

        switch (state) {
        case ControlsState.HIDDEN:
            break;
        case ControlsState.WINDOW_PICKER:
        case ControlsState.APP_GRID:
            if (OVERVIEW_MODE === 2) {
                break;
            }
            let wsbX;
            if (this._thumbnails._positionLeft) {
                wsbX = Math.round(2 * spacing + thumbnailsWidth);
            } else {
                wsbX = spacing;
            }

            const wWidth = Math.round(width - thumbnailsWidth - 5 * spacing);
            const wHeight = Math.round(Math.min(wWidth / (width / height), height - 1.7 * padding));
            const wsbY = Math.round((height - wHeight) / 2);

            workspaceBox.set_origin(wsbX, wsbY);
            workspaceBox.set_size(wWidth, wHeight);
            break;
        }

        return workspaceBox;
    },

    vfunc_allocate: function(box) {
        this.set_allocation(box);

        const themeNode = this.get_theme_node();
        const contentBox = themeNode.get_content_box(box);
        const [width, height] = contentBox.get_size();
        const { expandFraction } = this._thumbnails;
        const spacing = themeNode.get_length('spacing') * expandFraction;
        const padding = Math.round(0.1 * height);

        let thumbnailsWidth = this._getThumbnailsWidth(contentBox, spacing);
        let [, thumbnailsHeight] = this._thumbnails.get_preferred_custom_height(thumbnailsWidth);
        thumbnailsHeight = Math.min(thumbnailsHeight, height - 2 * spacing);

        this._thumbnails.visible = SHOW_WS_TMB;
        if (this._thumbnails.visible) {
            let wsTmbX;
            if (SEC_WS_TMB_LEFT) { // left
                wsTmbX = Math.round(spacing / 4);
                this._thumbnails._positionLeft = true;
            } else {
                wsTmbX = Math.round(width - spacing / 4 - thumbnailsWidth);
                this._thumbnails._positionLeft = false;
            }

            const childBox = new Clutter.ActorBox();
            const availSpace = height - thumbnailsHeight - 2 * spacing;

            let wsTmbY =  availSpace / 2;
            wsTmbY -= SEC_WS_TMB_POSITION_ADJUSTMENT * wsTmbY - spacing;

            childBox.set_origin(Math.round(wsTmbX), Math.round(wsTmbY));
            childBox.set_size(thumbnailsWidth, thumbnailsHeight);
            this._thumbnails.allocate(childBox);
        }

        const {
            currentState, initialState, finalState, transitioning, progress,
        } = this._overviewAdjustment.getStateTransitionParams();

        let workspacesBox;
        const workspaceParams = [contentBox, padding, thumbnailsWidth, spacing];
        if (!transitioning) {
            workspacesBox =
                this._getWorkspacesBoxForState(currentState, ...workspaceParams);
        } else {
            const initialBox =
                this._getWorkspacesBoxForState(initialState, ...workspaceParams);
            const finalBox =
                this._getWorkspacesBoxForState(finalState, ...workspaceParams);
            workspacesBox = initialBox.interpolate(finalBox, progress);
        }
        this._workspacesView.allocate(workspacesBox);
    },

    _updateThumbnailVisibility: function() {
        if (OVERVIEW_MODE === 2) {
            this.set_child_above_sibling(this._thumbnails, null);
        }

        const visible = !(this._settings.get_boolean('workspaces-only-on-primary') ||
                         SEC_WS_TMB_POSITION === 3); // 3 - disabled

        if (this._thumbnails.visible === visible)
            return;

        this._thumbnails.show();
        this._updateThumbnailParams();
        this._thumbnails.ease_property('expand-fraction', visible ? 1 : 0, {
            duration: OverviewControls.SIDE_CONTROLS_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this._thumbnails.visible = visible;
                this._thumbnails._indicator.visible = visible;
            },
        });
    },

    _updateThumbnailParams: function() {
        // workaround for upstream bug - secondary thumbnails boxes don't catch 'showing' signal on the shell startup and don't populate the box with thumbnails
        // the tmbBox contents is also destroyed when overview state adjustment gets above 1 when swiping gesture from window picker to app grid
        if (!this._thumbnails._thumbnails.length) {
            this._thumbnails._createThumbnails();
        }

        if (!this._thumbnails.visible)
            return;

        const { initialState, finalState, progress } =
            this._overviewAdjustment.getStateTransitionParams();

        const initialParams = this._getThumbnailParamsForState(initialState);
        const finalParams = this._getThumbnailParamsForState(finalState);

        const opacity =
            Util.lerp(initialParams.opacity, finalParams.opacity, progress);
        const scale =
            Util.lerp(initialParams.scale, finalParams.scale, progress);
        const translation_x =
            Util.lerp(initialParams.translation_x, finalParams.translation_x, progress);

        this._thumbnails.set({
            opacity,
            scale_x: scale,
            scale_y: scale,
            translation_x,
        });
    },

    _updateWorkspacesView: function() {
        if (this._workspacesView)
            this._workspacesView.destroy();

        if (this._settings.get_boolean('workspaces-only-on-primary')) {
            this._workspacesView = new WorkspacesView.ExtraWorkspaceView(
                this._monitorIndex,
                this._overviewAdjustment);
        } else {
            this._workspacesView = new WorkspacesView.WorkspacesView(
                this._monitorIndex,
                this._controls,
                this._scrollAdjustment,
                // Secondary monitors don't need FitMode.ALL since there is workspace switcher always visible
                //this._fitModeAdjustment,
                new St.Adjustment({
                    actor: this,
                    value: 0,//FitMode.SINGLE,
                    lower: 0,//FitMode.SINGLE,
                    upper: 0,//FitMode.SINGLE,
                }),
                //secondaryOverviewAdjustment);
                this._overviewAdjustment);
        }
        this.add_child(this._workspacesView);
        this._thumbnails.opacity = 0;
    }
}

//  SecondaryMonitorDisplay Horizontal

var SecondaryMonitorDisplayHorizontalOverride = {
    _getThumbnailParamsForState: function(state) {
        const { ControlsState } = OverviewControls;

        let opacity, scale, translation_y;
        switch (state) {
        case ControlsState.HIDDEN:
            opacity = 255;
            scale = 1;
            translation_y = 0;
            if (_staticBgAnimationEnabled && (!SHOW_WS_PREVIEW_BG || OVERVIEW_MODE === 2)) {
                translation_y = this._thumbnails.height * (SEC_WS_TMB_TOP ? -1 : 1);
            }
            break;
        case ControlsState.WINDOW_PICKER:
        case ControlsState.APP_GRID:
            opacity = 255;
            scale = 1;
            translation_y = 0;
            break;
        default:
            opacity = 255;
            scale = 1;
            translation_y = 0;
            break;
        }

        return { opacity, scale, translation_y };
    },

    _getWorkspacesBoxForState: function(state, box, padding, thumbnailsHeight, spacing) {
        const { ControlsState } = OverviewControls;
        const workspaceBox = box.copy();
        const [width, height] = workspaceBox.get_size();

        switch (state) {
        case ControlsState.HIDDEN:
            break;
        case ControlsState.WINDOW_PICKER:
        case ControlsState.APP_GRID:
            if (OVERVIEW_MODE === 2 && !WORKSPACE_MODE) {
                break;
            }
            let wsbY;
            if (WS_TMB_TOP) {
                wsbY = Math.round(spacing + thumbnailsHeight);
            } else {
                wsbY = spacing;
            }

            const wHeight = Math.round(Math.min(height - thumbnailsHeight - 5 * spacing));
            const wWidth = Math.round(Math.min(wHeight * (width / height), width - 1.7 * padding));
            const wsbX = Math.round((width - wWidth) / 2);

            workspaceBox.set_origin(wsbX, wsbY);
            workspaceBox.set_size(wWidth, wHeight);
            break;
        }

        return workspaceBox;
    },

    _getThumbnailsHeight: function(box) {
        if (!this._thumbnails.visible)
            return 0;

        const [width, height] = box.get_size();
        const { expandFraction } = this._thumbnails;
        const [thumbnailsHeight] = this._thumbnails.get_preferred_height(width);
        return Math.min(
            thumbnailsHeight * expandFraction,
            height * MAX_THUMBNAIL_SCALE);
    },

    vfunc_allocate: function(box) {
        this.set_allocation(box);

        const themeNode = this.get_theme_node();
        const contentBox = themeNode.get_content_box(box);
        const [width, height] = contentBox.get_size();
        const { expandFraction } = this._thumbnails;
        const spacing = themeNode.get_length('spacing') * expandFraction;
        const padding = Math.round(0.1 * height);

        let thumbnailsHeight = this._getThumbnailsHeight(contentBox);
        let [, thumbnailsWidth] = this._thumbnails.get_preferred_custom_width(thumbnailsHeight);
        thumbnailsWidth = Math.min(thumbnailsWidth, width - 2 * spacing);

        this._thumbnails.visible = SHOW_WS_TMB;
        if (this._thumbnails.visible) {
            let wsTmbY;
            if (SEC_WS_TMB_TOP) {
                wsTmbY = Math.round(spacing / 4);
                this._thumbnails._positionTop = true;
            } else {
                wsTmbY = Math.round(height - spacing / 4 - thumbnailsHeight);
                this._thumbnails._positionTop = false;
            }

            const childBox = new Clutter.ActorBox();
            const availSpace = width - thumbnailsWidth - 2 * spacing;

            let wsTmbX = availSpace / 2;
            wsTmbX -= SEC_WS_TMB_POSITION_ADJUSTMENT * wsTmbX - spacing;

            childBox.set_origin(Math.round(wsTmbX), Math.round(wsTmbY));
            childBox.set_size(thumbnailsWidth, thumbnailsHeight);
            this._thumbnails.allocate(childBox);
        }

        const {
            currentState, initialState, finalState, transitioning, progress,
        } = this._overviewAdjustment.getStateTransitionParams();

        let workspacesBox;
        const workspaceParams = [contentBox, padding, thumbnailsHeight, spacing];
        if (!transitioning) {
            workspacesBox =
                this._getWorkspacesBoxForState(currentState, ...workspaceParams);
        } else {
            const initialBox =
                this._getWorkspacesBoxForState(initialState, ...workspaceParams);
            const finalBox =
                this._getWorkspacesBoxForState(finalState, ...workspaceParams);
            workspacesBox = initialBox.interpolate(finalBox, progress);
        }
        this._workspacesView.allocate(workspacesBox);
    },

    _updateThumbnailVisibility: SecondaryMonitorDisplayVerticalOverride._updateThumbnailVisibility,

    _updateThumbnailParams: function() {
        // workaround for upstream bug - secondary thumbnails boxes don't catch 'showing' signal on the shell startup and don't populate the box with thumbnails
        // the tmbBox contents is also destroyed when overview state adjustment gets above 1 when swiping gesture from window picker to app grid
        if (!this._thumbnails._thumbnails.length) {
            this._thumbnails._createThumbnails();
        }

        if (!this._thumbnails.visible)
            return;

        const { initialState, finalState, progress } =
            this._overviewAdjustment.getStateTransitionParams();

        const initialParams = this._getThumbnailParamsForState(initialState);
        const finalParams = this._getThumbnailParamsForState(finalState);

        const opacity =
            Util.lerp(initialParams.opacity, finalParams.opacity, progress);
        const scale =
            Util.lerp(initialParams.scale, finalParams.scale, progress);
        const translation_y =
            Util.lerp(initialParams.translation_y, finalParams.translation_y, progress);

        this._thumbnails.set({
            opacity,
            scale_x: scale,
            scale_y: scale,
            translation_y,
        });
    },

    _updateWorkspacesView: function() {
        if (this._workspacesView)
            this._workspacesView.destroy();

        if (this._settings.get_boolean('workspaces-only-on-primary')) {
            this._workspacesView = new WorkspacesView.ExtraWorkspaceView(
                this._monitorIndex,
                this._overviewAdjustment);
        } else {
            this._workspacesView = new WorkspacesView.WorkspacesView(
                this._monitorIndex,
                this._controls,
                this._scrollAdjustment,
                // Secondary monitors don't need FitMode.ALL since there is workspace switcher always visible
                //this._fitModeAdjustment,
                new St.Adjustment({
                    actor: this,
                    value: 0,//FitMode.SINGLE,
                    lower: 0,//FitMode.SINGLE,
                    upper: 0,//FitMode.SINGLE,
                }),
                //secondaryOverviewAdjustment);
                this._overviewAdjustment);
        }
        this.add_child(this._workspacesView);
        this._thumbnails.opacity = 0;
    }
}

//------workspaceThumbnail------------------------------------------------------------------------
//Background.FADE_ANIMATION_TIME = 0;

// WorkspaceThumbnail

var WorkspaceThumbnailOverride = {
    after__init: function () {

        //radius of ws thumbnail background
        this.add_style_class_name('ws-tmb');

        // add workspace thumbnails labels if enabled
        if (SHOW_WST_LABELS) { // 0 - disable
            // layout manager allows aligning widget children
            this.layout_manager = new Clutter.BinLayout();
            // adding layout manager to tmb widget breaks wallpaper background aligning and rounded corners
            // unless border is removed
            if (SHOW_WS_TMB_BG)
                this.add_style_class_name('ws-tmb-labeled');

            const wsIndex = this.metaWorkspace.index();

            let label = `${wsIndex + 1}`;

            if (SHOW_WST_LABELS === 2) { // 2 - index + workspace name
                const settings = ExtensionUtils.getSettings('org.gnome.desktop.wm.preferences');
                const wsLabels = settings.get_strv('workspace-names');
                if (wsLabels.length > wsIndex && wsLabels[wsIndex]) {
                    label += `: ${wsLabels[wsIndex]}`;
                }
            } else if (SHOW_WST_LABELS === 3) { // 3- index + app name
                // global.display.get_tab_list offers workspace filtering using the second argument, but...
                // ... it sometimes includes windows from other workspaces, like minimized VBox machines, after Shell restarts
                const metaWin = global.display.get_tab_list(0, null).filter(
                    w => w.get_monitor() === this.monitorIndex && w.get_workspace().index() === wsIndex
                )[0];

                if (metaWin) {
                    let tracker = Shell.WindowTracker.get_default();
                    label += `: ${tracker.get_window_app(metaWin).get_name()}`;
                }
            }
            this._wsLabel = new St.Label({
                text: label,
                style_class: 'ws-tmb-label',
                x_align: Clutter.ActorAlign.FILL,
                y_align: Clutter.ActorAlign.END,
                x_expand: true,
                y_expand: true,
            });

            this._wsLabel._maxOpacity = 255;
            this._wsLabel.opacity = this._wsLabel._maxOpacity;

            this.add_child(this._wsLabel);
            this.set_child_above_sibling(this._wsLabel, null);

            if (SHOW_WST_LABELS_ON_HOVER) {
                this._wsLabel.opacity = 0;
                this.reactive = true;
                this.connect('enter-event', ()=> this._wsLabel.ease({
                    duration: 100,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    opacity: this._wsLabel._maxOpacity
                }));
                this.connect('leave-event', ()=> this._wsLabel.ease({
                    duration: 100,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    opacity: 0
                }));
            }
        }

        if (SHOW_WS_TMB_BG) {
            this._bgManager = new Background.BackgroundManager({
                monitorIndex: this.monitorIndex,
                container: this._viewport,
                vignette: false,
                controlPosition: false,
            });

            this._viewport.set_child_below_sibling(this._bgManager.backgroundActor, null);

            this.connect('destroy', function () {
                if (this._bgManager)
                    this._bgManager.destroy();
                this._bgManager = null;
            }.bind(this));

            this._bgManager.backgroundActor.opacity = 220;

            // this all is just for the small border radius...
            /*const { scaleFactor } = St.ThemeContext.get_for_stage(global.stage);
            const cornerRadius = scaleFactor * BACKGROUND_CORNER_RADIUS_PIXELS;
            const backgroundContent = this._bgManager.backgroundActor.content;
            backgroundContent.rounded_clip_radius = cornerRadius;

            // the original clip has some addition at the bottom
            const rect = new Graphene.Rect();
            rect.origin.x = this._viewport.x;
            rect.origin.y = this._viewport.y;
            rect.size.width = this._viewport.width;
            rect.size.height = this._viewport.height;

            this._bgManager.backgroundActor.content.set_rounded_clip_bounds(rect);*/
        }
    },

    activate: function(time) {
        if (this.state > WorkspaceThumbnail.ThumbnailState.NORMAL)
            return;

        // if Static Workspace overview mode active, a click on the already active workspace should activate the window picker mode
        const wsIndex = this.metaWorkspace.index();
        const lastWsIndex = global.display.get_workspace_manager().get_n_workspaces() - 1;
        const stateAdjustment = Main.overview._overview.controls._stateAdjustment;

        if (stateAdjustment.value === ControlsState.APP_GRID) {
            if (this.metaWorkspace.active) {
                Main.overview.dash.showAppsButton.checked = false;
            } else {
                this.metaWorkspace.activate(time);
            }
        } else {
            if (OVERVIEW_MODE === 2 && !WORKSPACE_MODE && wsIndex < lastWsIndex) {
                if (stateAdjustment.value > 1) {
                    stateAdjustment.value = 1;
                }
                // spread windows
                // in OVERVIEW MODE 2 windows are not spread and workspace is not scaled
                // we need to repeat transition to the overview state 1 (window picker), but with spreading windows animation
                if (this.metaWorkspace.active) {
                    WORKSPACE_MODE = 1;
                    const stateAdjustment = Main.overview._overview.controls._stateAdjustment
                    // setting value to 0 would reset WORKSPACE_MODE
                    stateAdjustment.value = 0.01;
                    stateAdjustment.ease(1, {
                        duration: 200,
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    });

                    /*const adjustment = Main.overview._overview.controls._workspacesDisplay._workspacesViews[0]._workspaces[wsIndex].stateAdjustment;
                    adjustment.value = 0;
                    adjustment.ease(1, {
                        duration: 200,
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    });*/
                } else {
                    // switch ws
                    this.metaWorkspace.activate(time);
                }
            // a click on the current workspace should go back to the main view
            } else if (this.metaWorkspace.active) {
                Main.overview.hide();
            } else {
                this.metaWorkspace.activate(time);
            }
        }
    }
}

// ThumbnailsBox Vertical

var ThumbnailsBoxVerticalOverride = {
    _activateThumbnailAtPoint: function(stageX, stageY, time) {
        const [r_, x, y] = this.transform_stage_point(stageX, stageY);

        const thumbnail = this._thumbnails.find(t => y >= t.y && y <= t.y + t.height);
        if (thumbnail) {
            thumbnail.activate(time);
        }
    },

    _getPlaceholderTarget: function(index, spacing, rtl) {
        const workspace = this._thumbnails[index];

        let targetY1;
        let targetY2;

        if (rtl) {
            const baseY = workspace.y + workspace.height;
            targetY1 = baseY - WORKSPACE_CUT_SIZE;
            targetY2 = baseY + spacing + WORKSPACE_CUT_SIZE;
        } else {
            targetY1 = workspace.y - spacing - WORKSPACE_CUT_SIZE;
            targetY2 = workspace.y + WORKSPACE_CUT_SIZE;
        }

        if (index === 0) {
            if (rtl)
                targetY2 -= spacing + WORKSPACE_CUT_SIZE;
            else
                targetY1 += spacing + WORKSPACE_CUT_SIZE;
        }

        if (index === this._dropPlaceholderPos) {
            const placeholderHeight = this._dropPlaceholder.get_height() + spacing;
            if (rtl)
                targetY2 += placeholderHeight;
            else
                targetY1 -= placeholderHeight;
        }

        return [targetY1, targetY2];
    },

     _withinWorkspace: function(y, index, rtl) {
        const length = this._thumbnails.length;
        const workspace = this._thumbnails[index];

        let workspaceY1 = workspace.y + WORKSPACE_CUT_SIZE;
        let workspaceY2 = workspace.y + workspace.height - WORKSPACE_CUT_SIZE;

        if (index === length - 1) {
            if (rtl)
                workspaceY1 -= WORKSPACE_CUT_SIZE;
            else
                workspaceY2 += WORKSPACE_CUT_SIZE;
        }

        return y > workspaceY1 && y <= workspaceY2;
    },

    handleDragOver: function(source, actor, x, y, time) {
        if (!source.metaWindow &&
            (!source.app || !source.app.can_open_new_window()) &&
            (source.app || !source.shellWorkspaceLaunch) &&
            source != Main.xdndHandler)
            return DND.DragMotionResult.CONTINUE;

        const rtl = Clutter.get_default_text_direction() === Clutter.TextDirection.RTL;
        let canCreateWorkspaces = Meta.prefs_get_dynamic_workspaces();
        let spacing = this.get_theme_node().get_length('spacing');

        this._dropWorkspace = -1;
        let placeholderPos = -1;
        let length = this._thumbnails.length;
        for (let i = 0; i < length; i++) {
            const index = rtl ? length - i - 1 : i;

            if (canCreateWorkspaces && source !== Main.xdndHandler) {
                const [targetStart, targetEnd] =
                    this._getPlaceholderTarget(index, spacing, rtl);

                if (y > targetStart && y <= targetEnd) {
                    placeholderPos = index;
                    break;
                }
            }

            if (this._withinWorkspace(y, index, rtl)) {
                this._dropWorkspace = index;
                break;
            }
        }

        if (this._dropPlaceholderPos != placeholderPos) {
            this._dropPlaceholderPos = placeholderPos;
            this.queue_relayout();
        }

        if (this._dropWorkspace != -1)
            return this._thumbnails[this._dropWorkspace].handleDragOverInternal(source, actor, time);
        else if (this._dropPlaceholderPos != -1)
            return source.metaWindow ? DND.DragMotionResult.MOVE_DROP : DND.DragMotionResult.COPY_DROP;
        else
            return DND.DragMotionResult.CONTINUE;
    },

    //vfunc_get_preferred_width: function(forHeight) {
    // override of this vfunc doesn't work for some reason (tested on Ubuntu and Fedora), it's not reachable
    get_preferred_custom_width: function(forHeight) {
        if (forHeight === -1)
            return this.get_preferred_custom_height(forHeight);

        let themeNode = this.get_theme_node();

        forHeight = themeNode.adjust_for_width(forHeight);

        let spacing = themeNode.get_length('spacing');
        let nWorkspaces = this._thumbnails.length;
        let totalSpacing = (nWorkspaces - 1) * spacing;

        const avail = forHeight - totalSpacing;

        let scale = (avail / nWorkspaces) / this._porthole.height;
        scale = Math.min(scale, MAX_THUMBNAIL_SCALE);

        const width = Math.round(this._porthole.width * scale);

        return themeNode.adjust_preferred_width(width, width);
    },

    get_preferred_custom_height: function(_forWidth) {
        // Note that for getPreferredHeight/Width we cheat a bit and skip propagating
        // the size request to our children because we know how big they are and know
        // that the actors aren't depending on the virtual functions being called.
        let themeNode = this.get_theme_node();

        let spacing = themeNode.get_length('spacing');
        let nWorkspaces = this._thumbnails.length;

        let totalSpacing = (nWorkspaces - 1) * spacing;

        const ratio = this._porthole.width / this._porthole.height;
        const tmbHeight = _forWidth / ratio;

        const naturalheight = this._thumbnails.reduce((accumulator, thumbnail, index) => {
            //let workspaceSpacing = 0;

            const progress = 1 - thumbnail.collapse_fraction;
            //const height = (this._porthole.height * MAX_THUMBNAIL_SCALE + workspaceSpacing) * progress;
            const height = (tmbHeight) * progress;
            return accumulator + height;
        }, 0);

        //return themeNode.adjust_preferred_height(totalSpacing, naturalheight);
        // we need to calculate the height precisely as it need to align with the workspacesDisplay because of transition animation
        // This works perfectly for fullHD monitor, for some reason 5:4 aspect ratio monitor adds unnecessary pixels to the final height of the thumbnailsBox
        return [totalSpacing, naturalheight];
    },

    // removes extra space (extraWidth in the original function), we need the box as accurate as possible
    // for precise app grid transition animation
    vfunc_allocate: function(box) {
        this.set_allocation(box);

        let rtl = Clutter.get_default_text_direction() == Clutter.TextDirection.RTL;

        if (this._thumbnails.length == 0) // not visible
            return;

        let themeNode = this.get_theme_node();
        box = themeNode.get_content_box(box);

        const portholeWidth = this._porthole.width;
        const portholeHeight = this._porthole.height;
        const spacing = themeNode.get_length('spacing');

        const nWorkspaces = this._thumbnails.length;

        // Compute the scale we'll need once everything is updated,
        // unless we are currently transitioning
        if (this._expandFraction === 1) {
            const totalSpacing = (nWorkspaces - 1) * spacing;
            const availableHeight = (box.get_height() - totalSpacing) / nWorkspaces;

            const hScale = box.get_width() / portholeWidth;
            const vScale = availableHeight / portholeHeight;
            const newScale = Math.min(hScale, vScale);

            if (newScale !== this._targetScale) {
                if (this._targetScale > 0) {
                    // We don't ease immediately because we need to observe the
                    // ordering in queueUpdateStates - if workspaces have been
                    // removed we need to slide them out as the first thing.
                    this._targetScale = newScale;
                    this._pendingScaleUpdate = true;
                } else {
                    this._targetScale = this._scale = newScale;
                }

                this._queueUpdateStates();
            }
        }

        const ratio = portholeWidth / portholeHeight;
        const thumbnailFullHeight = Math.round(portholeHeight * this._scale);
        const thumbnailWidth = Math.round(thumbnailFullHeight * ratio);
        const thumbnailHeight = thumbnailFullHeight * this._expandFraction;
        const roundedVScale = thumbnailHeight / portholeHeight;

        let indicatorValue = this._scrollAdjustment.value;
        let indicatorUpperWs = Math.ceil(indicatorValue);
        let indicatorLowerWs = Math.floor(indicatorValue);

        let indicatorLowerY1 = 0;
        let indicatorLowerY2 = 0;
        let indicatorUpperY1 = 0;
        let indicatorUpperY2 = 0;

        let indicatorThemeNode = this._indicator.get_theme_node();
        let indicatorTopFullBorder = indicatorThemeNode.get_padding(St.Side.TOP) + indicatorThemeNode.get_border_width(St.Side.TOP);
        let indicatorBottomFullBorder = indicatorThemeNode.get_padding(St.Side.BOTTOM) + indicatorThemeNode.get_border_width(St.Side.BOTTOM);
        let indicatorLeftFullBorder = indicatorThemeNode.get_padding(St.Side.LEFT) + indicatorThemeNode.get_border_width(St.Side.LEFT);
        let indicatorRightFullBorder = indicatorThemeNode.get_padding(St.Side.RIGHT) + indicatorThemeNode.get_border_width(St.Side.RIGHT);

        let y = box.y1;

        if (this._dropPlaceholderPos == -1) {
            this._dropPlaceholder.allocate_preferred_size(
                ...this._dropPlaceholder.get_position());

            Meta.later_add(Meta.LaterType.BEFORE_REDRAW, () => {
                this._dropPlaceholder.hide();
            });
        }

        let childBox = new Clutter.ActorBox();

        for (let i = 0; i < this._thumbnails.length; i++) {
            const thumbnail = this._thumbnails[i];
            if (i > 0)
                y += spacing - Math.round(thumbnail.collapse_fraction * spacing);

            const x1 = box.x1;
            const x2 = x1 + thumbnailWidth;

            if (i === this._dropPlaceholderPos) {
                let [, placeholderHeight] = this._dropPlaceholder.get_preferred_height(-1);
                childBox.x1 = x1;
                childBox.x2 = x2;

                if (rtl) {
                    childBox.y2 = box.y2 - Math.round(y);
                    childBox.y1 = box.y2 - Math.round(y + placeholderHeight);
                } else {
                    childBox.y1 = Math.round(y);
                    childBox.y2 = Math.round(y + placeholderHeight);
                }

                this._dropPlaceholder.allocate(childBox);

                Meta.later_add(Meta.LaterType.BEFORE_REDRAW, () => {
                    this._dropPlaceholder.show();
                });
                y += placeholderHeight + spacing;
            }

            // We might end up with thumbnailWidth being something like 99.33
            // pixels. To make this work and not end up with a gap at the end,
            // we need some thumbnails to be 99 pixels and some 100 pixels width;
            // we compute an actual scale separately for each thumbnail.
            const y1 = Math.round(y);
            const y2 = Math.round(y + thumbnailHeight);
            const roundedHScale = (y2 - y1) / portholeHeight;

            // Allocating a scaled actor is funny - x1/y1 correspond to the origin
            // of the actor, but x2/y2 are increased by the *unscaled* size.
            if (rtl) {
                childBox.y2 = box.y2 - y1;
                childBox.y1 = box.y2 - (y1 + thumbnailHeight);
            } else {
                childBox.y1 = y1;
                childBox.y2 = y1 + thumbnailHeight;
            }
            childBox.x1 = x1;
            childBox.x2 = x1 + thumbnailWidth;

            thumbnail.setScale(roundedHScale, roundedVScale);
            thumbnail.allocate(childBox);

            if (i === indicatorUpperWs) {
                indicatorUpperY1 = childBox.y1;
                indicatorUpperY2 = childBox.y2;
            }
            if (i === indicatorLowerWs) {
                indicatorLowerY1 = childBox.y1;
                indicatorLowerY2 = childBox.y2;
            }

            // We round the collapsing portion so that we don't get thumbnails resizing
            // during an animation due to differences in rounded, but leave the uncollapsed
            // portion unrounded so that non-animating we end up with the right total
            y += thumbnailHeight - Math.round(thumbnailHeight * thumbnail.collapse_fraction);
        }

        childBox.x1 = box.x1;
        childBox.x2 = box.x1 + thumbnailWidth;

        const indicatorY1 = indicatorLowerY1 +
            (indicatorUpperY1 - indicatorLowerY1) * (indicatorValue % 1);
        const indicatorY2 = indicatorLowerY2 +
            (indicatorUpperY2 - indicatorLowerY2) * (indicatorValue % 1);

        childBox.y1 = indicatorY1 - indicatorTopFullBorder;
        childBox.y2 = indicatorY2 + indicatorBottomFullBorder;
        childBox.x1 -= indicatorLeftFullBorder;
        childBox.x2 += indicatorRightFullBorder;
        this._indicator.allocate(childBox);
    },

    _updateShouldShow: function() {
        // set current workspace indicator border radius
        // here just 'cause it's easier than adding to init
        this._indicator.add_style_class_name('ws-tmb');

        const shouldShow = SHOW_WS_TMB;
        if (this._shouldShow === shouldShow)
            return;

        this._shouldShow = shouldShow;
        this.notify('should-show');
    }
}

// ThumbnailsBox Horizontal

var ThumbnailsBoxHorizontalOverride = {
    get_preferred_custom_width: function(_forHeight) {
        // Note that for getPreferredHeight/Width we cheat a bit and skip propagating
        // the size request to our children because we know how big they are and know
        // that the actors aren't depending on the virtual functions being called.
        let themeNode = this.get_theme_node();

        let spacing = themeNode.get_length('spacing');
        let nWorkspaces = this._thumbnails.length;
        let totalSpacing = (nWorkspaces - 1) * spacing;

        const ratio = this._porthole.height / this._porthole.width;
        const tmbWidth = (_forHeight - 2 * spacing) / ratio;

        const naturalWidth = this._thumbnails.reduce((accumulator, thumbnail, index) => {
            const progress = 1 - thumbnail.collapse_fraction;
            const width = tmbWidth * progress;
            return accumulator + width;
        }, 0);

        return themeNode.adjust_preferred_width(totalSpacing, naturalWidth);
    },

    vfunc_allocate(box) {
        this.set_allocation(box);

        let rtl = Clutter.get_default_text_direction() == Clutter.TextDirection.RTL;

        if (this._thumbnails.length == 0) // not visible
            return;

        let themeNode = this.get_theme_node();
        box = themeNode.get_content_box(box);

        const portholeWidth = this._porthole.width;
        const portholeHeight = this._porthole.height;
        const spacing = themeNode.get_length('spacing');

        const nWorkspaces = this._thumbnails.length;

        // Compute the scale we'll need once everything is updated,
        // unless we are currently transitioning
        if (this._expandFraction === 1) {
            const totalSpacing = (nWorkspaces - 1) * spacing;
            const availableWidth = (box.get_width() - totalSpacing) / nWorkspaces;

            const hScale = availableWidth / portholeWidth;
            const vScale = box.get_height() / portholeHeight;
            const newScale = Math.min(hScale, vScale);

            if (newScale !== this._targetScale) {
                if (this._targetScale > 0) {
                    // We don't ease immediately because we need to observe the
                    // ordering in queueUpdateStates - if workspaces have been
                    // removed we need to slide them out as the first thing.
                    this._targetScale = newScale;
                    this._pendingScaleUpdate = true;
                } else {
                    this._targetScale = this._scale = newScale;
                }

                this._queueUpdateStates();
            }
        }

        const ratio = portholeWidth / portholeHeight;
        const thumbnailFullHeight = Math.round(portholeHeight * this._scale);
        const thumbnailWidth = Math.round(thumbnailFullHeight * ratio);
        const thumbnailHeight = thumbnailFullHeight * this._expandFraction;
        const roundedVScale = thumbnailHeight / portholeHeight;

        let indicatorValue = this._scrollAdjustment.value;
        let indicatorUpperWs = Math.ceil(indicatorValue);
        let indicatorLowerWs = Math.floor(indicatorValue);

        let indicatorLowerX1 = 0;
        let indicatorLowerX2 = 0;
        let indicatorUpperX1 = 0;
        let indicatorUpperX2 = 0;

        let indicatorThemeNode = this._indicator.get_theme_node();
        let indicatorTopFullBorder = indicatorThemeNode.get_padding(St.Side.TOP) + indicatorThemeNode.get_border_width(St.Side.TOP);
        let indicatorBottomFullBorder = indicatorThemeNode.get_padding(St.Side.BOTTOM) + indicatorThemeNode.get_border_width(St.Side.BOTTOM);
        let indicatorLeftFullBorder = indicatorThemeNode.get_padding(St.Side.LEFT) + indicatorThemeNode.get_border_width(St.Side.LEFT);
        let indicatorRightFullBorder = indicatorThemeNode.get_padding(St.Side.RIGHT) + indicatorThemeNode.get_border_width(St.Side.RIGHT);

        let x = box.x1;

        if (this._dropPlaceholderPos == -1) {
            this._dropPlaceholder.allocate_preferred_size(
                ...this._dropPlaceholder.get_position());

            Meta.later_add(Meta.LaterType.BEFORE_REDRAW, () => {
                this._dropPlaceholder.hide();
            });
        }

        let childBox = new Clutter.ActorBox();

        for (let i = 0; i < this._thumbnails.length; i++) {
            const thumbnail = this._thumbnails[i];
            if (i > 0)
                x += spacing - Math.round(thumbnail.collapse_fraction * spacing);

            const y1 = box.y1;
            const y2 = y1 + thumbnailHeight;

            if (i === this._dropPlaceholderPos) {
                const [, placeholderWidth] = this._dropPlaceholder.get_preferred_width(-1);
                childBox.y1 = y1;
                childBox.y2 = y2;

                if (rtl) {
                    childBox.x2 = box.x2 - Math.round(x);
                    childBox.x1 = box.x2 - Math.round(x + placeholderWidth);
                } else {
                    childBox.x1 = Math.round(x);
                    childBox.x2 = Math.round(x + placeholderWidth);
                }

                this._dropPlaceholder.allocate(childBox);

                Meta.later_add(Meta.LaterType.BEFORE_REDRAW, () => {
                    this._dropPlaceholder.show();
                });
                x += placeholderWidth + spacing;
            }

            // We might end up with thumbnailWidth being something like 99.33
            // pixels. To make this work and not end up with a gap at the end,
            // we need some thumbnails to be 99 pixels and some 100 pixels width;
            // we compute an actual scale separately for each thumbnail.
            const x1 = Math.round(x);
            const x2 = Math.round(x + thumbnailWidth);
            const roundedHScale = (x2 - x1) / portholeWidth;

            // Allocating a scaled actor is funny - x1/y1 correspond to the origin
            // of the actor, but x2/y2 are increased by the *unscaled* size.
            if (rtl) {
                childBox.x2 = box.x2 - x1;
                childBox.x1 = box.x2 - (x1 + thumbnailWidth);
            } else {
                childBox.x1 = x1;
                childBox.x2 = x1 + thumbnailWidth;
            }
            childBox.y1 = y1;
            childBox.y2 = y1 + thumbnailHeight;

            thumbnail.setScale(roundedHScale, roundedVScale);
            thumbnail.allocate(childBox);

            if (i === indicatorUpperWs) {
                indicatorUpperX1 = childBox.x1;
                indicatorUpperX2 = childBox.x2;
            }
            if (i === indicatorLowerWs) {
                indicatorLowerX1 = childBox.x1;
                indicatorLowerX2 = childBox.x2;
            }

            // We round the collapsing portion so that we don't get thumbnails resizing
            // during an animation due to differences in rounded, but leave the uncollapsed
            // portion unrounded so that non-animating we end up with the right total
            x += thumbnailWidth - Math.round(thumbnailWidth * thumbnail.collapse_fraction);
        }

        childBox.y1 = box.y1;
        childBox.y2 = box.y1 + thumbnailHeight;

        const indicatorX1 = indicatorLowerX1 +
            (indicatorUpperX1 - indicatorLowerX1) * (indicatorValue % 1);
        const indicatorX2 = indicatorLowerX2 +
            (indicatorUpperX2 - indicatorLowerX2) * (indicatorValue % 1);

        childBox.x1 = indicatorX1 - indicatorLeftFullBorder;
        childBox.x2 = indicatorX2 + indicatorRightFullBorder;
        childBox.y1 -= indicatorTopFullBorder;
        childBox.y2 += indicatorBottomFullBorder;
        this._indicator.allocate(childBox);
    },

    _updateShouldShow: ThumbnailsBoxVerticalOverride._updateShouldShow
}

//------- overviewControls --------------------------------

// ControlsManager

var ControlsManagerOverride = {
    // this function is used as a callback by a signal handler, needs to be reconnected after modification as the original callback uses a copy of the original function
    /*_update: function() {
        ...
    }*/

    // this function has duplicate in WorkspaceView so we use one function for both to avoid issues with syncing them
    _getFitModeForState: function(state) {
        return _getFitModeForState(state);
    },

    _updateThumbnailsBox: function() {
        const { shouldShow } = this._thumbnailsBox;
        const thumbnailsBoxVisible = shouldShow;
        this._thumbnailsBox.visible = thumbnailsBoxVisible;

        // this call should be directly in _update(), but it's used as a callback function and it would require to reconnect the signal
        this._updateWorkspacesDisplay();
    },

    // this function is pure addition to the original code and handles wsDisp transition to APP_GRID view
    _updateWorkspacesDisplay: function() {
        const { initialState, finalState, progress, currentState } = this._stateAdjustment.getStateTransitionParams();
        const { searchActive } = this._searchController;

        const paramsForState = s => {
            let opacity;
            switch (s) {
            case ControlsState.HIDDEN:
            case ControlsState.WINDOW_PICKER:
                opacity = 255;
                break;
            case ControlsState.APP_GRID:
                opacity = 0;
                break;
            default:
                opacity = 255;
                break;
            }
            return { opacity };
        };

        let initialParams = paramsForState(initialState);
        let finalParams = paramsForState(finalState);

        let opacity = Math.round(Util.lerp(initialParams.opacity, finalParams.opacity, progress));

        let workspacesDisplayVisible = (opacity != 0) && !(searchActive);

        // improve transition from search results to desktop
        if (finalState === 0 && this._searchController._searchResults.visible) {
            this._searchController.hide();
        }

        // reset Static Workspace window picker mode
        if (currentState === 0/*finalState === 0 && progress === 1*/ && OVERVIEW_MODE && WORKSPACE_MODE) {
            WORKSPACE_MODE = 0;
        }

        if (!WS_ANIMATION || !SHOW_WS_TMB) {
            //this._workspacesDisplay.opacity = opacity;
        } else if (!SHOW_WS_TMB_BG) {
            // fade out ws wallpaper during transition to ws switcher if ws switcher background disabled
            this._workspacesDisplay._workspacesViews[global.display.get_primary_monitor()]._workspaces[this._workspaceAdjustment.value]._background.opacity = opacity;
        }

        // if ws preview background is disabled, animate tmb box and dash
        const tmbBox = this._thumbnailsBox;
        const dash = this.dash;
        const searchEntryBin = this._searchEntryBin;
        // this dash transition collides with startup animation and freezes GS for good, needs to be delayed (first Main.overview 'hiding' event enables it)
        const skipDash = Main.overview.dash._isHorizontal !== undefined;

        // OVERVIEW_MODE 2 should animate dash and wsTmbBox only if WORKSPACE_MODE === 0 (windows not spread)
        const animateOverviewMode2 = OVERVIEW_MODE === 2 && !(finalState === 1 && WORKSPACE_MODE);

        if (_staticBgAnimationEnabled && ((!SHOW_WS_PREVIEW_BG && !(OVERVIEW_MODE === 2)) || animateOverviewMode2)) {
            if (!tmbBox._translationOriginal || Math.abs(tmbBox._translationOriginal) > 500) { // swipe gesture can call this calculation before tmbBox is finalized, giving nonsense width
                const [tmbTranslation_x, tmbTranslation_y, dashTranslation_x, dashTranslation_y, searchTranslation_y] = _getOverviewTranslations(dash, tmbBox, searchEntryBin);
                tmbBox._translationOriginal = [tmbTranslation_x, tmbTranslation_y];
                dash._translationOriginal = [dashTranslation_x, dashTranslation_y];
                searchEntryBin._translationOriginal = searchTranslation_y;
            }
            if (finalState === 0 || initialState === 0) {
                const prg = Math.abs((finalState == 0 ? 0 : 1) - progress);
                tmbBox.translation_x = Math.round(prg * tmbBox._translationOriginal[0]);
                tmbBox.translation_y = Math.round(prg * tmbBox._translationOriginal[1]);
                if (!skipDash) {
                    dash.translation_x = Math.round(prg * dash._translationOriginal[0]);
                    dash.translation_y = Math.round(prg * dash._translationOriginal[1]);
                }
                searchEntryBin.translation_y = Math.round(prg * searchEntryBin._translationOriginal);
            }
            if (progress === 1) {
                tmbBox._translationOriginal = 0;
                if (!skipDash) {
                    dash._translationOriginal = 0;
                }
                searchEntryBin._translationOriginal = 0;
            }
        } else if (_staticBgAnimationEnabled && (tmbBox.translation_x || tmbBox.translation_y) && _staticBgAnimationEnabled) {
            tmbBox.translation_x = 0;
            tmbBox.translation_y = 0;
            if (!skipDash) {
                dash.translation_x = 0;
                dash.translation_y = 0;
            }
            searchEntryBin.translation_y = 0;
        }

        if (!this._startupAnimationInProgress) {
            if (initialState === ControlsState.HIDDEN && finalState === ControlsState.APP_GRID) {
                this._appDisplay.opacity = Math.round(progress * 255);
            } else {
                this._appDisplay.opacity = 255 - opacity;
            }
        }

        if (currentState === ControlsState.APP_GRID) {
            // in app grid hide workspaces so they're not blocking app grid or ws thumbnails
            this._workspacesDisplay.scale_x = 0;
        } else {
            this._workspacesDisplay.scale_x = 1;
        }
        this._workspacesDisplay.setPrimaryWorkspaceVisible(workspacesDisplayVisible);

        if (!this.dash._isAbove && progress > 0 && OVERVIEW_MODE === 2) {
            // set searchEntry above appDisplay
            this.set_child_above_sibling(this._searchEntryBin, null);
            // move dash above wsTmb for case that dash and wsTmb animate from the same side
            this.set_child_above_sibling(dash, null);
            this.set_child_below_sibling(this._workspacesDisplay, null);
            this.set_child_below_sibling(this._appDisplay, null);
        } else if (!this.dash._isAbove && progress === 1 && finalState > ControlsState.HIDDEN) {
            // set dash above workspace in the overview
            if (this.dash._isHorizontal === undefined) {
                this.set_child_above_sibling(this._searchEntryBin, null);
                this.set_child_above_sibling(this.dash, null);
                this.dash._isAbove = true;
            }

            // update max tmb scale in case some other extension changed it
            WorkspaceThumbnail.MAX_THUMBNAIL_SCALE = MAX_THUMBNAIL_SCALE;

        } else if (this.dash._isAbove && progress < 1) {
            // keep dash below for ws transition between the overview and hidden state
            this.set_child_above_sibling(this._workspacesDisplay, null);
            this.dash._isAbove = false;
        }
    },

    // fix for upstream bug - appGrid.visible after transition from APP_GRID to HIDDEN
    _updateAppDisplayVisibility: function(stateTransitionParams = null) {
        if (!stateTransitionParams)
            stateTransitionParams = this._stateAdjustment.getStateTransitionParams();

        const { currentState } = stateTransitionParams;

        // if !APP_GRID_ANIMATION appGrid needs to be hidden in WINDOW_PICKER mode (1)
        // but needs to be visible for transition from HIDDEN (0) to APP_GRID (2)
        this._appDisplay.visible =
            currentState > ControlsState.HIDDEN &&
            !this._searchController.searchActive &&
            !(currentState === 1 && !APP_GRID_ANIMATION);
    },

    _onSearchChanged: function() {
        const { searchActive } = this._searchController;
        const SIDE_CONTROLS_ANIMATION_TIME = 150; // OverviewControls.SIDE_CONTROLS_ANIMATION_TIME = Overview.ANIMATION_TIME = 250

        if (!searchActive) {
            this._updateAppDisplayVisibility();
            this._workspacesDisplay.reactive = true;
            this._workspacesDisplay.setPrimaryWorkspaceVisible(true);
        } else {
            this._searchController.show();
        }

        this._updateThumbnailsBox(true);

        const state = this._stateAdjustment.value;

        this._appDisplay.ease({
            opacity: (searchActive || state < 2) ? 0 : 255,
            duration: SIDE_CONTROLS_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => this._updateAppDisplayVisibility(),
        });

        this._searchController.ease({
            opacity: searchActive ? 255 : 0,
            duration: SIDE_CONTROLS_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => (this._searchController.visible = searchActive),
        });


        if (OVERVIEW_MODE === 2) {
            const workspacesDisplay = this._workspacesDisplay;
            workspacesDisplay.reactive = !searchActive;
            workspacesDisplay.setPrimaryWorkspaceVisible(!searchActive);
            this._workspacesDisplay.setPrimaryWorkspaceVisible(!searchActive);
            /*workspacesDisplay.setPrimaryWorkspaceVisible(true);
            workspacesDisplay.opacity = 255;
            if (!workspacesDisplay.get_effect('blur')) {
                const blurEffect = new Shell.BlurEffect({
                    brightness: 1,
                    sigma: 0,
                    mode: Shell.BlurMode.ACTOR,
                });
                workspacesDisplay.add_effect_with_name('blur', blurEffect);
            } else {
                workspacesDisplay.get_effect('blur').sigma = searchActive ? 5 : 0;
                workspacesDisplay.get_effect('blur').brightness = searchActive ? 0.8 : 1;
            }*/
        } else {
            this._workspacesDisplay.ease({
                opacity: searchActive ? 0 : 255,
                duration: SIDE_CONTROLS_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    this._workspacesDisplay.reactive = !searchActive;
                    this._workspacesDisplay.setPrimaryWorkspaceVisible(!searchActive);
                },
            });
        }

        const entry = this._searchEntry;
        if (SHOW_SEARCH_ENTRY) {
            entry.visible = true;
            entry.opacity = 255;
        } else {
            // show search entry only if the user starts typing, and hide it when leaving the search mode
            entry.ease({
                opacity: searchActive ? 255 : 0,
                duration: SIDE_CONTROLS_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    entry.visible = searchActive;
                },
            });
        }

        // if static background enabled, blur bg of search results with the value for AppGrid
        if (SHOW_BG_IN_OVERVIEW) {
            if (searchActive && _bgManagers.length) {
                _updateStaticBackground(_bgManagers[0], 2);
            } else if (_bgManagers.length) {
                // when search view is hidden update the blur according the current overview state
                _updateStaticBackground(_bgManagers[0], Main.overview._overview._controls._stateAdjustment.value);
            }
        }
    },

    runStartupAnimation: async function(callback) {
        // fix for upstream bug - overview always shows workspace 1 instead of the active one after restart
        this._workspaceAdjustment.set_value(global.workspace_manager.get_active_workspace_index());
        this._ignoreShowAppsButtonToggle = true;

        this._searchController.prepareToEnterOverview();
        this._workspacesDisplay.prepareToEnterOverview();

        this._stateAdjustment.value = ControlsState.HIDDEN;
        this._stateAdjustment.ease(ControlsState.WINDOW_PICKER, {
            duration: Overview.ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });

        this.dash.showAppsButton.checked = false;
        this._ignoreShowAppsButtonToggle = false;

        // Set the opacity here to avoid a 1-frame flicker
        this.opacity = 0;

        // We can't run the animation before the first allocation happens
        await this.layout_manager.ensureAllocation();

        const { STARTUP_ANIMATION_TIME } = Layout;

        // Opacity
        this.ease({
            opacity: 255,
            duration: STARTUP_ANIMATION_TIME,
            mode: Clutter.AnimationMode.LINEAR,
            onComplete: () => {
                // part of the workaround for stuttering first app grid animation
                this._appDisplay.visible = true;
            }
        });

        const dash = this.dash;
        const tmbBox = this._thumbnailsBox;

        // Set the opacity here to avoid a 1-frame flicker
        dash.opacity = 0;
        for (const view of this._workspacesDisplay._workspacesViews) {
            if (view._monitorIndex !== global.display.get_primary_monitor())
                view._thumbnails.opacity = 0;
        }

        const searchEntryBin = this._searchEntryBin;
        const [tmbTranslation_x, tmbTranslation_y, dashTranslation_x, dashTranslation_y, searchTranslation_y] =
            _getOverviewTranslations(dash, tmbBox, searchEntryBin);

        const onComplete = function() {
            // running init callback again causes issues (multiple connections)
            if (!_startupInitComplete)
                callback();
            _startupInitComplete = true;

            // force app grid to build before the first visible animation to remove possible stuttering
            this._appDisplay.opacity = 1;

            const [x, y] = this._appDisplay.get_position();
            const translation_x = - x;
            const translation_y = - y;
            this._appDisplay.translation_x = translation_x;
            this._appDisplay.translation_y = translation_y;

            // let the main loop realize previous changes before continuing
            _startupAnimTimeoutId1 = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                10,
                () => {
                    this._appDisplay.translation_x = 0;
                    this._appDisplay.translation_y = 0;
                    this._appDisplay.visible = false;
                    if (STARTUP_STATE === 1) {
                        Main.overview.hide();
                    } else if (STARTUP_STATE === 2) {
                        this._appDisplay.opacity = 255;
                        this.dash.showAppsButton.checked = true;
                    }
                    _startupAnimTimeoutId1 = 0;
                    return GLib.SOURCE_REMOVE;
                }
            );
        }.bind(this);

        if (dash.visible) {
            dash.translation_x = dashTranslation_x;
            dash.translation_y = dashTranslation_y;
            dash.opacity = 255;
            dash.ease({
                translation_x: 0,
                translation_y: 0,
                delay: STARTUP_ANIMATION_TIME / 2,
                duration: STARTUP_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    onComplete();
                },
            });
        } else {
            // set dash opacity to make it visible if user enable it later
            dash.opacity = 255;
            // if dash is hidden, substitute the ease timeout with GLib.timeout
            _startupAnimTimeoutId2 = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                // delay + animation time
                STARTUP_ANIMATION_TIME * 2 * ANIMATION_TIME_FACTOR,
                () => {
                    onComplete();
                    _startupAnimTimeoutId2 = 0;
                    return GLib.SOURCE_REMOVE;
                }
            );
        }

        if (searchEntryBin.visible) {
            searchEntryBin.translation_y = searchTranslation_y;
            searchEntryBin.ease({
                translation_y: 0,
                delay: STARTUP_ANIMATION_TIME / 2,
                duration: STARTUP_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }

        if (tmbBox.visible) {
            tmbBox.translation_x = tmbTranslation_x;
            tmbBox.translation_y = tmbTranslation_y;
            tmbBox.ease({
                translation_x: 0,
                translation_y: 0,
                delay: STARTUP_ANIMATION_TIME / 2,
                duration: STARTUP_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }

        // upstream bug - following animation will be cancelled, don't know where
        // needs further investigation
        const  workspacesViews = this._workspacesDisplay._workspacesViews;
        if (workspacesViews.length > 1) {
            for (const view of workspacesViews) {
                if (view._monitorIndex !== global.display.get_primary_monitor() && view._thumbnails.visible) {
                    const tmbBox = view._thumbnails;

                    _getOverviewTranslations(dash, tmbBox, searchEntryBin);
                    if (SEC_WS_TMB_LEFT) {
                        tmbBox.translation_x = - (tmbBox.width + 12); // compensate for padding
                    } else if (SEC_WS_TMB_RIGHT) {
                        tmbBox.translation_x = (tmbBox.width + 12);
                    } else if (SEC_WS_TMB_TOP) {
                        tmbBox.translation_y = - (tmbBox.height + 12);
                    } else if (SEC_WS_TMB_BOTTOM) {
                        tmbBox.translation_y = (tmbBox.height + 12);
                    }
                    tmbBox.opacity = 255;

                    tmbBox.ease({
                        translation_y: 0,
                        delay: STARTUP_ANIMATION_TIME / 2,
                        duration: STARTUP_ANIMATION_TIME,
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    });
                }
            }
        }
    },

    animateToOverview: function(state, callback) {
        this._ignoreShowAppsButtonToggle = true;

        this._searchController.prepareToEnterOverview();
        this._workspacesDisplay.prepareToEnterOverview();

        this._stateAdjustment.value = ControlsState.HIDDEN;

        // building window thumbnails takes some time and with many windows on the workspace
        // the time can be close to or longer than ANIMATION_TIME
        // in which case the the animation is greatly delayed, stuttering, or even skipped
        // for user it is more acceptable to watch delayed smooth animation,
        // even if it takes little more time, than jumping frames
        const delay = 50 + global.display.get_tab_list(0, global.workspace_manager.get_active_workspace()).length * 1;
        this._stateAdjustment.ease(state, {
            delay,
            duration: Overview.ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onStopped: () => {
                if (callback)
                    callback();
            },
        });

        this.dash.showAppsButton.checked =
            state === ControlsState.APP_GRID;

        this._ignoreShowAppsButtonToggle = false;
    },
}

function _getOverviewTranslations(dash, tmbBox, searchEntryBin) {
    //const tmbBox = Main.overview._overview._controls._thumbnailsBox;
    let searchTranslation_y = 0;
    if (searchEntryBin.visible) {
        const offset = (dash.visible && (!DASH_VERTICAL ? dash.height + 12 : 0))
            + (tmbBox._positionTop ? tmbBox.height + 12 : 0);
        searchTranslation_y = - searchEntryBin.height - offset - 30;
    }

    let tmbTranslation_x = 0;
    let tmbTranslation_y = 0;
    let offset;
    if (tmbBox.visible) {
        switch (WS_TMB_POSITION) {
            case 3: // left
                offset = 10 + ((dash?.visible && DASH_LEFT) ? dash.width : 0);
                tmbTranslation_x = - tmbBox.width - offset;
                tmbTranslation_y = 0;
                break;
            case 1: // right
                offset = 10 + ((dash?.visible && DASH_RIGHT) ? dash.width : 0);
                tmbTranslation_x = tmbBox.width + offset;
                tmbTranslation_y = 0;
                break;
            case 0: // top
                offset = 10 + ((dash?.visible && DASH_TOP) ? dash.height : 0) + Main.panel.height;
                tmbTranslation_x = 0;
                tmbTranslation_y = - tmbBox.height - offset;
                break;
            case 2: // bottom
                offset = 10 + ((dash?.visible && DASH_BOTTOM) ? dash.height : 0) + Main.panel.height;  // just for case the panel is at bottom
                tmbTranslation_x = 0;
                tmbTranslation_y = tmbBox.height + offset;
                break;
        }
    }

    let dashTranslation_x = 0;
    let dashTranslation_y = 0;
    let position = DASH_POSITION;
    // if DtD replaced the original Dash, read its position
    if (dash._isHorizontal !== undefined) {
        position = dash._position;
    }
    if (dash?.visible) {
        switch (position) {
            case 0: // top
                dashTranslation_x = 0;
                dashTranslation_y = - dash.height - dash.margin_bottom - Main.panel.height;
                break;
            case 1: // right
                dashTranslation_x = dash.width;
                dashTranslation_y = 0;
                break;
            case 2: // bottom
                dashTranslation_x = 0;
                dashTranslation_y = dash.height + dash.margin_bottom + Main.panel.height;
                break;
            case 3: // left
                dashTranslation_x = - dash.width;
                dashTranslation_y = 0;
                break;
        }
    }

    return [tmbTranslation_x, tmbTranslation_y, dashTranslation_x, dashTranslation_y, searchTranslation_y];
}

//-------ControlsManagerLayout-----------------------------

var ControlsManagerLayoutVerticalOverride = {
    _computeWorkspacesBoxForState: function(state, box, workAreaBox, dashWidth, dashHeight, thumbnailsWidth, thumbnailsHeight, searchHeight) {
        const workspaceBox = box.copy();
        let [width, height] = workspaceBox.get_size();
        const { x1: startX, y1: startY } = workAreaBox;
        const { spacing } = this;
        //const { expandFraction } = this._workspacesThumbnails;

        const dash = Main.overview.dash;
        // including Dash to Dock and clones properties for compatibility
        const dashToDock = dash._isHorizontal !== undefined;
        if (dashToDock) {
            dashHeight = dash.height;
            // compensation for a bug related to Dash to Dock bottom non-auto-hide position
            // ...when workspace box width is calculated correctly, but the output width is bigger
            // ...although if you read the width back from workspaceDisplay, you get the originally calculated value, not the real one
            if (dash._position === 2 && !dash.get_parent()?.get_parent()?.get_parent()?._intellihideIsEnabled) {
                height -= dash.height
            } else if ([1, 3].includes(dash._position)) {
                // if Dash to Dock reduces workAreaBox, compensate for this
                Main.layoutManager._trackedActors.forEach((actor) => {
                    if (actor.affectsStruts && actor.actor.width === dash.width) {
                        width += dash.width;
                    }
                });
            }
        }

        let wWidth;
        let wHeight;
        let wsBoxY;

        switch (state) {
        case ControlsState.HIDDEN:
            workspaceBox.set_origin(...workAreaBox.get_origin());
            workspaceBox.set_size(...workAreaBox.get_size());
            break;
        case ControlsState.WINDOW_PICKER:
        case ControlsState.APP_GRID:
            if (WS_ANIMATION && SHOW_WS_TMB && state === ControlsState.APP_GRID) {
                workspaceBox.set_origin(...this._workspacesThumbnails.get_position());
                workspaceBox.set_size(...this._workspacesThumbnails.get_size());
            } else if (OVERVIEW_MODE === 2 && !WORKSPACE_MODE) {
                workspaceBox.set_origin(...workAreaBox.get_origin());
                workspaceBox.set_size(...workAreaBox.get_size());
            } else {
                searchHeight = SHOW_SEARCH_ENTRY ? searchHeight : 0;
                wWidth = width
                            - spacing
                            - (DASH_VERTICAL ? dash.width + spacing : spacing)
                            - (thumbnailsWidth ? thumbnailsWidth + spacing : 0)
                            - 2 * spacing;
                wHeight = height
                            - (DASH_VERTICAL ? 4 * spacing : (dashHeight ? dashHeight + spacing : 4 * spacing))
                            - searchHeight
                            - 3 * spacing;

                const ratio = width / height;
                let wRatio = wWidth / wHeight;
                let scale = ratio / wRatio;

                if (scale > 1) {
                    wHeight = wHeight / scale;
                    wWidth = wHeight * ratio;
                } else {
                    wWidth = wWidth * scale;
                    wHeight = wWidth / ratio;
                }

                wHeight *= WS_PREVIEW_SCALE;
                wWidth *= WS_PREVIEW_SCALE;

                let xOffset = 0;
                let yOffset = 0;

                yOffset = searchHeight + (DASH_TOP ? dashHeight + spacing : spacing);
                yOffset = yOffset + ((height - wHeight - searchHeight - (!DASH_VERTICAL ? dashHeight + spacing : 0)) / 2);

                const centeredBoxX = (width - wWidth) / 2;

                const xOffsetL = (DASH_LEFT ? dashWidth : 0) + (WS_TMB_LEFT ? thumbnailsWidth : 0) + 2 * spacing;
                const xOffsetR = (DASH_RIGHT ? dashWidth : 0) + (WS_TMB_RIGHT ? thumbnailsWidth : 0) + 2 * spacing;

                this._xAlignCenter = false;
                if (centeredBoxX < Math.max(xOffsetL, xOffsetR)) {
                    xOffset = xOffsetL + spacing + (width - xOffsetL - wWidth - xOffsetR - 2 * spacing) / 2;
                } else {
                    xOffset = centeredBoxX;
                    this._xAlignCenter = true;
                }

                const wsBoxX = /*startX + */xOffset;
                wsBoxY = Math.round(startY + yOffset);
                workspaceBox.set_origin(Math.round(wsBoxX), Math.round(wsBoxY));
                workspaceBox.set_size(Math.round(wWidth), Math.round(wHeight));
            }
        }

        return workspaceBox;
    },

    _getAppDisplayBoxForState: function(state, box, workAreaBox, searchHeight, dashWidth, dashHeight, appGridBox, thumbnailsWidth) {
        const [width] = box.get_size();
        const { x1: startX } = workAreaBox;
        const { y1: startY } = workAreaBox;
        const height = workAreaBox.get_height();
        const appDisplayBox = new Clutter.ActorBox();
        const { spacing } = this;

        const dash = Main.overview.dash;
        searchHeight = SHOW_SEARCH_ENTRY ? searchHeight : 0;

        const appDisplayX = startX + (CENTER_APP_GRID ? spacing + thumbnailsWidth : (DASH_LEFT ? dash.width + spacing : 0) + (WS_TMB_LEFT ? thumbnailsWidth : 0) + spacing);
        const appDisplayY = startY + searchHeight + (DASH_TOP ? dashHeight + spacing : spacing);

        const adWidth = CENTER_APP_GRID ? width - 2 * (thumbnailsWidth + spacing) : width - ((DASH_LEFT || DASH_RIGHT) ? dashWidth + 2 * spacing : spacing) - thumbnailsWidth - spacing;
        const adHeight = height - searchHeight - ((DASH_TOP || DASH_BOTTOM) ? dashHeight + 2 * spacing : 2 * spacing);
        switch (state) {
        case ControlsState.HIDDEN:
        case ControlsState.WINDOW_PICKER:
            // 1 - left, 2 - right, 3 - bottom, 5 - top
            switch (APP_GRID_ANIMATION) {
            case 0:
                appDisplayBox.set_origin(appDisplayX, appDisplayY);
                break;
            case 1:
                appDisplayBox.set_origin(startX + width, appDisplayY);
                break;
            case 2:
                appDisplayBox.set_origin(startX - adWidth, appDisplayY);
                break;
            case 3:
                appDisplayBox.set_origin(appDisplayX, workAreaBox.y2);
                break;
            case 5:
                appDisplayBox.set_origin(appDisplayX, workAreaBox.y1 - adHeight);
                break;
            }
            break;
        case ControlsState.APP_GRID:
            appDisplayBox.set_origin(appDisplayX, appDisplayY);
            break;
        }

        appDisplayBox.set_size(adWidth, adHeight);
        return appDisplayBox;
    },

    vfunc_allocate: function(container, box) {
        const childBox = new Clutter.ActorBox();

        const { spacing } = this;

        const monitor = Main.layoutManager.findMonitorForActor(this._container);
        const workArea = Main.layoutManager.getWorkAreaForMonitor(monitor.index);
        const startX = workArea.x - monitor.x;
        const startY = workArea.y - monitor.y;
        const workAreaBox = new Clutter.ActorBox();
        workAreaBox.set_origin(startX, startY);
        workAreaBox.set_size(workArea.width, workArea.height);
        box.y1 += startY;
        box.x1 += startX;
        const [width, height] = box.get_size();
        let availableHeight = height;

        // Dash
        const maxDashHeight = Math.round(box.get_height() * DASH_MAX_SIZE_RATIO);
        const maxDashWidth = maxDashHeight * 0.8;
        let dashHeight = 0;
        let dashWidth = 0;

        // dash cloud be overridden by the Dash to Dock clone
        // Dash to Dock has property _isHorizontal
        const dash = Main.overview.dash;
        if (dash._isHorizontal !== undefined) {
            dashHeight = dash.height;
            dashWidth = dash.width;
            DASH_VERTICAL = [1, 3].includes(dash._position);
            this._dash.allocate(childBox);
        } else if (this._dash.visible) {
            // default dock
            if (DASH_VERTICAL) {
                this._dash.setMaxSize(maxDashWidth, height);
                [, dashWidth] = this._dash.get_preferred_width(height);
                [, dashHeight] = this._dash.get_preferred_height(dashWidth);
                dashWidth = Math.min(dashWidth, maxDashWidth);
                dashHeight = Math.min(dashHeight, height/* - 2 * spacing*/);

            } else if (!WS_TMB_FULL) {
                    this._dash.setMaxSize(width, maxDashHeight);
                [, dashHeight] = this._dash.get_preferred_height(width);
                [, dashWidth] = this._dash.get_preferred_width(dashHeight);
                dashHeight = Math.min(dashHeight, maxDashHeight);
                dashWidth = Math.min(dashWidth, width - 2 * spacing);
            }
        }

        // Workspace Thumbnails
        let wsTmbWidth = 0;
        let wsTmbHeight = 0;

        this._workspacesThumbnails._positionTop = false;
        if (this._workspacesThumbnails.visible) {
            const REDUCE_WS_TMB_IF_NEEDED = this._searchController._searchActive && CENTER_SEARCH_VIEW;

            const { expandFraction } = this._workspacesThumbnails;
            const dashHeightReservation = (!WS_TMB_FULL && !DASH_VERTICAL) ? dashHeight : 0;
            wsTmbHeight = WS_TMB_FULL
                                ? height - 2 * spacing
                                : height - 3 * spacing - (DASH_VERTICAL ? 0 : dashHeightReservation + spacing);

            wsTmbWidth = this._workspacesThumbnails.get_preferred_custom_width(wsTmbHeight)[0];
            wsTmbWidth = Math.round(Math.min(
                wsTmbWidth * expandFraction,
                width * MAX_THUMBNAIL_SCALE
            ));

            if (REDUCE_WS_TMB_IF_NEEDED) {
                const searchAllocation = this._searchController._searchResults._content.allocation;
                const searchWidth = searchAllocation.x2 - searchAllocation.x1;
                wsTmbWidth = Math.clamp((width - searchWidth) / 2 - spacing, width * 0.05, wsTmbWidth);
            }

            wsTmbHeight = Math.round(Math.min(this._workspacesThumbnails.get_preferred_custom_height(wsTmbWidth)[1], wsTmbHeight));

            let wsTmbX;
            if (WS_TMB_RIGHT) {
                wsTmbX = Math.round(startX + width - (DASH_RIGHT ? dashWidth : 0) - wsTmbWidth);
            } else {
                wsTmbX = Math.round((DASH_LEFT ? dashWidth : 0) + spacing / 2);
            }

            let wstOffset = (height - spacing - wsTmbHeight - spacing - (DASH_VERTICAL ? 0 : dashHeightReservation)) / 2;
            wstOffset = wstOffset - WS_TMB_POSITION_ADJUSTMENT * wstOffset;
            let wsTmbY = Math.round(startY + ((dashHeightReservation && DASH_TOP) ? dashHeight + spacing : spacing) + wstOffset);

            childBox.set_origin(wsTmbX, wsTmbY);
            childBox.set_size(wsTmbWidth, wsTmbHeight);

            this._workspacesThumbnails.allocate(childBox);
        }


        if (this._dash.visible) {
            const wMaxWidth = width - spacing - wsTmbWidth - 2 * spacing - (DASH_VERTICAL ? dashWidth + spacing : 0);
            if (WS_TMB_FULL && !DASH_VERTICAL) {
                this._dash.setMaxSize(wMaxWidth, maxDashHeight);
                [, dashHeight] = this._dash.get_preferred_height(wMaxWidth);
                [, dashWidth] = this._dash.get_preferred_width(dashHeight);
                dashHeight = Math.round(Math.min(dashHeight, maxDashHeight));
                dashWidth = Math.round(Math.min(dashWidth, wMaxWidth));
            }

            let dashX, dashY, offset;
            if (DASH_RIGHT)
                dashX = width - dashWidth;
            else if (DASH_LEFT) {
                dashX = 0;
            }
            else if (DASH_TOP)
                dashY = startY;
            else
                dashY = startY + height - dashHeight;

            if (!DASH_VERTICAL) {
                offset = (width - (((WS_TMB_FULL || CENTER_DASH_WS) && !this._xAlignCenter) ? wsTmbWidth : 0) - dashWidth) / 2;
                offset = offset - DASH_POSITION_ADJUSTMENT * offset;
                dashX = offset;

                if ((WS_TMB_FULL || CENTER_DASH_WS) && !this._xAlignCenter) {
                    if (WS_TMB_RIGHT) {
                        dashX = Math.min(dashX, width - dashWidth - (wsTmbWidth ? wsTmbWidth + 2 * spacing : spacing));
                    } else {
                        dashX = (wsTmbWidth ? wsTmbWidth + 2 * spacing : spacing) + offset;
                        dashX = Math.max(dashX, wsTmbWidth ? wsTmbWidth + 2 * spacing : spacing);
                        dashX = Math.min(dashX, width - dashWidth - spacing);
                    }
                }
                if (WS_TMB_FULL && !CENTER_DASH_WS) {
                    dashX = WS_TMB_RIGHT
                                ? Math.min(width - 3 * spacing - wsTmbWidth - dashWidth, dashX + (wsTmbWidth + spacing) / 2 * (1 - Math.abs(DASH_POSITION_ADJUSTMENT)))
                                : Math.max(wsTmbWidth + 2 * spacing, dashX - (wsTmbWidth + 3 * spacing) / 2 * (1 - Math.abs(DASH_POSITION_ADJUSTMENT)));
                }
            } else {
                const offset = (height - dashHeight) / 2;
                dashY = startY + ((offset - DASH_POSITION_ADJUSTMENT * offset));
            }

            childBox.set_origin(Math.round(startX + dashX), Math.round(dashY));
            childBox.set_size(dashWidth, dashHeight);
            this._dash.allocate(childBox);
        }

        availableHeight -= (DASH_VERTICAL ? 0 : dashHeight + spacing);

        let [searchHeight] = this._searchEntry.get_preferred_height(width - wsTmbWidth);

        // Workspaces
        let params = [box, workAreaBox, dashWidth, dashHeight, wsTmbWidth, wsTmbHeight, searchHeight];
        const transitionParams = this._stateAdjustment.getStateTransitionParams();

        // Update cached boxes
        for (const state of Object.values(ControlsState)) {
            this._cachedWorkspaceBoxes.set(
                state, this._computeWorkspacesBoxForState(state, ...params));
        }

        let workspacesBox;
        if (!transitionParams.transitioning) {
            workspacesBox = this._cachedWorkspaceBoxes.get(transitionParams.currentState);
        } else {
            const initialBox = this._cachedWorkspaceBoxes.get(transitionParams.initialState);
            const finalBox = this._cachedWorkspaceBoxes.get(transitionParams.finalState);
            workspacesBox = initialBox.interpolate(finalBox, transitionParams.progress);
        }

        this._workspacesDisplay.allocate(workspacesBox);

        // Search entry
        const searchXoffset = (DASH_LEFT ? dashWidth : 0) + spacing + (WS_TMB_RIGHT ? 0 : wsTmbWidth + spacing);
        //let [searchHeight] = this._searchEntry.get_preferred_height(width - wsTmbWidth);

        // Y position under top Dash
        let searchEntryX, searchEntryY;
        if (OVERVIEW_MODE === 2 && !DASH_TOP && !WS_TMB_TOP) {
            searchEntryY = 7;
        } else if (DASH_TOP) {
            searchEntryY = startY + dashHeight - spacing;
        } else {
            searchEntryY = startY;
        }

        searchEntryX = searchXoffset;
        let searchWidth = width - 2 * spacing - wsTmbWidth - (DASH_VERTICAL ? dashWidth : 0); // xAlignCenter is given by wsBox
        searchWidth = this._xAlignCenter ? width - 2 * (wsTmbWidth + spacing) : searchWidth;

        if (CENTER_SEARCH_VIEW) {
            childBox.set_origin(0, searchEntryY);
            childBox.set_size(width, searchHeight);
        } else {
            childBox.set_origin(this._xAlignCenter ? 0 : searchEntryX, searchEntryY);
            childBox.set_size(this._xAlignCenter ? width : searchWidth - spacing, searchHeight);
        }

        this._searchEntry.allocate(childBox);

        availableHeight -= searchHeight + spacing;

        // AppDisplay - state, box, workAreaBox, searchHeight, dashHeight, appGridBox, wsTmbWidth
        //if (this._appDisplay.visible) {
            const workspaceAppGridBox =
                this._cachedWorkspaceBoxes.get(ControlsState.WINDOW_PICKER);

            params = [box, workAreaBox, searchHeight, dashWidth, dashHeight, workspaceAppGridBox, wsTmbWidth];
            let appDisplayBox;
            if (!transitionParams.transitioning) {
                appDisplayBox =
                    this._getAppDisplayBoxForState(transitionParams.currentState, ...params);
            } else {
                const initialBox =
                    this._getAppDisplayBoxForState(transitionParams.initialState, ...params);
                const finalBox =
                    this._getAppDisplayBoxForState(transitionParams.finalState, ...params);

                appDisplayBox = initialBox.interpolate(finalBox, transitionParams.progress);
            }
            this._appDisplay.allocate(appDisplayBox);
        //}

        // Search
        if (CENTER_SEARCH_VIEW) {
            searchWidth = width - 2 * wsTmbWidth;
            childBox.set_origin(wsTmbWidth, startY + (DASH_TOP ? dashHeight : 0) + searchHeight);
        } else {
            childBox.set_origin(this._xAlignCenter ? wsTmbWidth + spacing : searchXoffset, startY + (DASH_TOP ? dashHeight : 0) + searchHeight);
        }

        childBox.set_size(searchWidth, availableHeight);
        this._searchController.allocate(childBox);

        this._runPostAllocation();
    }
}

var ControlsManagerLayoutHorizontalOverride = {
    _computeWorkspacesBoxForState: function(state, box, workAreaBox, dashWidth, dashHeight, thumbnailsWidth, thumbnailsHeight, searchHeight) {
        const workspaceBox = box.copy();
        let [width, height] = workspaceBox.get_size();
        const { x1: startX, y1: startY } = workAreaBox;
        const { spacing } = this;
        //const { expandFraction } = this._workspacesThumbnails;

        const dash = Main.overview.dash;
        // including Dash to Dock and clones properties for compatibility
        const dashToDock = dash._isHorizontal !== undefined;
        if (dashToDock) {
            // compensation for a bug related to Dash to Dock bottom non-auto-hide position
            // ...when workspace box width is calculated correctly, but the output width is bigger
            // ...although if you read the width back from workspaceDisplay, you get the originally calculated value, not the real one
            if (dash._position === 2 && !dash.get_parent()?.get_parent()?.get_parent()?._intellihideIsEnabled) {
                height -= dash.height
            } else if ([1, 3].includes(dash._position)) {
                // if Dash to Dock reduces workAreaBox, compensate for this
                Main.layoutManager._trackedActors.forEach((actor) => {
                    if (actor.affectsStruts && actor.actor.width === dash.width) {
                        width += dash.width;
                    }
                });
            }
        }

        let wWidth, wHeight, wsBoxY, wsBoxX;

        switch (state) {
        case ControlsState.HIDDEN:
            workspaceBox.set_origin(...workAreaBox.get_origin());
            workspaceBox.set_size(...workAreaBox.get_size());
            break;
        case ControlsState.WINDOW_PICKER:
        case ControlsState.APP_GRID:
            if (WS_ANIMATION && SHOW_WS_TMB && state === ControlsState.APP_GRID) {
                workspaceBox.set_origin(...this._workspacesThumbnails.get_position());
                workspaceBox.set_size(...this._workspacesThumbnails.get_size());
            } else if (OVERVIEW_MODE === 2 && !WORKSPACE_MODE) {
                workspaceBox.set_origin(...workAreaBox.get_origin());
                workspaceBox.set_size(...workAreaBox.get_size());
            } else {
                searchHeight = SHOW_SEARCH_ENTRY ? searchHeight : 0;
                wWidth = width
                            - spacing
                            - (DASH_VERTICAL ? dashWidth + spacing : spacing)
                            - 2 * spacing;
                wHeight = height
                            - (DASH_VERTICAL ? spacing : (dashHeight ? dashHeight + spacing : spacing))
                            - (thumbnailsHeight ? thumbnailsHeight + spacing : 0)
                            - searchHeight
                            - 2 * spacing;

                const ratio = width / height;
                let wRatio = wWidth / wHeight;
                let scale = ratio / wRatio;

                if (scale > 1) {
                    wHeight = wHeight / scale;
                    wWidth = wHeight * ratio;
                } else {
                    wWidth = wWidth * scale;
                    wHeight = wWidth / ratio;
                }

                // height decides the actual size, ratio is given by the workarea
                wHeight *= WS_PREVIEW_SCALE;
                wWidth *= WS_PREVIEW_SCALE;

                let xOffset = 0;
                let yOffset = 0;

                const yOffsetT = (DASH_TOP ? dashHeight : 0) + (WS_TMB_TOP ? thumbnailsHeight : 0) + searchHeight;
                const yOffsetB = (DASH_BOTTOM ? dashHeight : 0) + (WS_TMB_BOTTOM ? thumbnailsHeight + spacing : 0);
                const yAvailableSpace = (height - yOffsetT - wHeight - yOffsetB) / 2;
                yOffset = yOffsetT + yAvailableSpace;

                const xOffsetL = (DASH_LEFT ? dashWidth : 0) + spacing;
                const xOffsetR = (DASH_RIGHT ? dashWidth : 0) + spacing;
                const centeredBoxX = (width - wWidth) / 2;

                this._xAlignCenter = false;
                if (centeredBoxX < Math.max(xOffsetL, xOffsetR)) {
                    xOffset = xOffsetL + spacing + (width - xOffsetL - wWidth - xOffsetR - 2 * spacing) / 2;
                } else {
                    xOffset = centeredBoxX;
                    this._xAlignCenter = true;
                }

                wsBoxX = /*startX + */xOffset;
                wsBoxY = Math.round(startY + yOffset)
                workspaceBox.set_origin(Math.round(wsBoxX), Math.round(wsBoxY));
                workspaceBox.set_size(Math.round(wWidth), Math.round(wHeight));
            }
        }

        return workspaceBox;
    },

    _getAppDisplayBoxForState: function(state, box, workAreaBox, searchHeight, dashWidth, dashHeight, appGridBox, thumbnailsHeight) {
        const [width] = box.get_size();
        const { x1: startX } = workAreaBox;
        const { y1: startY } = workAreaBox;
        const height = workAreaBox.get_height();
        const appDisplayBox = new Clutter.ActorBox();
        const { spacing } = this;

        const dash = Main.overview.dash;
        searchHeight = SHOW_SEARCH_ENTRY ? searchHeight : 0;

        const appDisplayX = startX + (CENTER_APP_GRID ? spacing + thumbnailsWidth : (DASH_LEFT ? dash.width + spacing : 0));
        const appDisplayY = startY + searchHeight + (DASH_TOP ? dashHeight + spacing : spacing) + (WS_TMB_BOTTOM ? 0 : thumbnailsHeight + spacing);

        const adWidth = CENTER_APP_GRID ? width : width - ((DASH_LEFT || DASH_RIGHT) ? dashWidth + 2 * spacing : spacing);
        const adHeight = height - searchHeight - ((DASH_TOP || DASH_BOTTOM) ? dashHeight + 2 * spacing : 2 * spacing) - thumbnailsHeight;
        switch (state) {
        case ControlsState.HIDDEN:
        case ControlsState.WINDOW_PICKER:
            // 1 - left, 2 - right, 3 - bottom, 5 - top
            switch (APP_GRID_ANIMATION) {
            case 0:
                appDisplayBox.set_origin(appDisplayX, appDisplayY);
                break;
            case 1:
                appDisplayBox.set_origin(startX + width, appDisplayY);
                break;
            case 2:
                appDisplayBox.set_origin(startX - adWidth, appDisplayY);
                break;
            case 3:
                appDisplayBox.set_origin(appDisplayX, workAreaBox.y2);
                break;
            case 5:
                appDisplayBox.set_origin(appDisplayX, workAreaBox.y1 - adHeight);
                break;
            }
            break;
        case ControlsState.APP_GRID:
            appDisplayBox.set_origin(appDisplayX, appDisplayY);
            break;
        }

        appDisplayBox.set_size(adWidth, adHeight);
        return appDisplayBox;
    },

    vfunc_allocate: function(container, box) {
        const childBox = new Clutter.ActorBox();

        const { spacing } = this;

        const monitor = Main.layoutManager.findMonitorForActor(this._container);
        const workArea = Main.layoutManager.getWorkAreaForMonitor(monitor.index);
        const startX = workArea.x - monitor.x;
        const startY = workArea.y - monitor.y;
        const workAreaBox = new Clutter.ActorBox();
        workAreaBox.set_origin(startX, startY);
        workAreaBox.set_size(workArea.width, workArea.height);
        box.y1 += startY;
        box.x1 += startX;
        const [width, height] = box.get_size();
        let availableHeight = height;

        // Dash
        const maxDashHeight = Math.round(box.get_height() * DASH_MAX_SIZE_RATIO);
        const maxDashWidth = maxDashHeight * 0.8;
        let dashHeight = 0;
        let dashWidth = 0;

        // dash cloud be overridden by the Dash to Dock clone
        // Dash to Dock has property _isHorizontal
        const dash = Main.overview.dash;
        if (dash._isHorizontal !== undefined) {
            dashHeight = dash.height;
            dashWidth = dash.width;
            DASH_TOP = dash._position === 0;
            DASH_VERTICAL = [1, 3].includes(dash._position);
            this._dash.allocate(childBox);
        } else if (this._dash.visible) {
            // default dock
            if (!DASH_VERTICAL) {
                this._dash.setMaxSize(width, maxDashHeight);
                [, dashHeight] = this._dash.get_preferred_height(width);
                [, dashWidth] = this._dash.get_preferred_width(dashHeight);
                dashHeight = Math.min(dashHeight, maxDashHeight);
                dashWidth = Math.min(dashWidth, width);

            } else if (!WS_TMB_FULL) {
                this._dash.setMaxSize(maxDashWidth, height);
                [, dashWidth] = this._dash.get_preferred_width(height);
                [, dashHeight] = this._dash.get_preferred_height(dashWidth);
                dashHeight = Math.min(dashHeight, height - 2 * spacing);
                dashWidth = Math.min(dashWidth, width);
            }
        }

        let [searchHeight] = this._searchEntry.get_preferred_height(width);

        /*// Search entry
        const searchXoffset = (DASH_POSITION === 3 ? dashWidth : 0) + spacing;
        //let [searchHeight] = this._searchEntry.get_preferred_height(width - wsTmbWidth);

        // Y position under top Dash
        let searchEntryX, searchEntryY;
        if (DASH_TOP) {
            searchEntryY = startY + dashHeight - spacing;
        } else {
            searchEntryY = startY;
        }

        searchEntryX = searchXoffset;
        let searchWidth = width - 2 * spacing - (DASH_VERTICAL ? dashWidth : 0); // xAlignCenter is given by wsBox
        searchWidth = this._xAlignCenter ? width : searchWidth;

        if (CENTER_SEARCH_VIEW) {
            childBox.set_origin(0, searchEntryY);
            childBox.set_size(width, searchHeight);
        } else {
            childBox.set_origin(this._xAlignCenter ? 0 : searchEntryX, searchEntryY);
            childBox.set_size(this._xAlignCenter ? width : searchWidth - spacing, searchHeight);
        }

        this._searchEntry.allocate(childBox);

        availableHeight -= searchHeight + spacing;*/

        // Workspace Thumbnails
        let wsTmbWidth = 0;
        let wsTmbHeight = 0;

        if (this._workspacesThumbnails.visible) {
            const { expandFraction } = this._workspacesThumbnails;
            const dashWidthReservation = (!WS_TMB_FULL && DASH_VERTICAL) ? dashWidth : 0;

            wsTmbWidth = WS_TMB_FULL
                                ? width - 2 * spacing
                                : width - 2 * spacing - (DASH_VERTICAL ? 0 : dashWidthReservation + spacing);

            wsTmbHeight = this._workspacesThumbnails.get_preferred_height(wsTmbWidth)[0];
            wsTmbHeight = Math.round(Math.min(
                wsTmbHeight * expandFraction,
                height * MAX_THUMBNAIL_SCALE
            ));

            wsTmbWidth = Math.round(Math.min(this._workspacesThumbnails.get_preferred_custom_width(wsTmbHeight)[1], wsTmbWidth));

            let wsTmbY;
            if (WS_TMB_TOP) {
                wsTmbY = Math.round(startY + /*searchHeight + */(DASH_TOP ? dashHeight : spacing / 2));
                this._workspacesThumbnails._positionTop = true;
            } else {
                wsTmbY = Math.round(startY + height - (DASH_BOTTOM ? dashHeight : 0) - /*searchHeight - */wsTmbHeight);
                this._workspacesThumbnails._positionTop = false;
            }

            let wstOffset = (width - wsTmbWidth) / 2;
            wstOffset = wstOffset - WS_TMB_POSITION_ADJUSTMENT * wstOffset;
            let wsTmbX = Math.round(Math.clamp(
                startX + wstOffset,
                startX + (DASH_LEFT ? dashWidthReservation + spacing / 2 : spacing / 2),
                width - wsTmbWidth - startX - (DASH_RIGHT ? dashWidthReservation + spacing / 2 : spacing / 2)
            ));

            childBox.set_origin(wsTmbX, wsTmbY);
            childBox.set_size(wsTmbWidth, wsTmbHeight);

            this._workspacesThumbnails.allocate(childBox);

            availableHeight -= wsTmbHeight + spacing;
        }


        if (this._dash.visible) {
            const wMaxHeight = height - spacing - wsTmbHeight - 2 * spacing - (DASH_VERTICAL ? 0 : dashHeight + spacing);
            if (WS_TMB_FULL && DASH_VERTICAL) {
                this._dash.setMaxSize(maxDashWidth, wMaxHeight);
                [, dashWidth] = this._dash.get_preferred_width(wMaxHeight);
                [, dashHeight] = this._dash.get_preferred_height(dashWidth);
                dashWidth = Math.round(Math.min(dashWidth, maxDashWidth));
                dashHeight = Math.round(Math.min(dashHeight, wMaxHeight));
            }

            let dashX, dashY, offset;
            if (DASH_RIGHT) {
                dashX = width - dashWidth;
            } else if (DASH_LEFT) {
                dashX = 0;
            } else if (DASH_TOP) {
                dashY = startY;
            } else {
                dashY = startY + height - dashHeight;
            }

            if (DASH_VERTICAL) {
                if (WS_TMB_FULL) {
                    offset = (height - dashHeight - wsTmbHeight) / 2;
                    if (WS_TMB_TOP) {
                        offset = offset - DASH_POSITION_ADJUSTMENT * offset;
                        dashY = startY + offset + wsTmbHeight;
                        dashY = Math.max(dashY, startY + wsTmbHeight);
                    } else {
                        offset = offset - DASH_POSITION_ADJUSTMENT * offset;
                        dashY = startY + offset;
                        dashY = Math.max(dashY, height - wsTmbHeight - dashHeight - 3 * spacing);
                    }
                } else {
                    offset = (height - dashHeight) / 2;
                    offset = offset - DASH_POSITION_ADJUSTMENT * offset;
                    dashY = startY + offset;
                }
            } else {
                offset = (width - dashWidth) / 2;
                dashX = startX + ((offset - DASH_POSITION_ADJUSTMENT * offset));
            }

            childBox.set_origin(Math.round(startX + dashX), Math.round(dashY));
            childBox.set_size(dashWidth, dashHeight);
            this._dash.allocate(childBox);
        }

        availableHeight -= (DASH_VERTICAL ? 0 : dashHeight);

        /*let [searchHeight] = this._searchEntry.get_preferred_height(width);*/

        // Workspaces
        let params = [box, workAreaBox, dashWidth, dashHeight, wsTmbWidth, wsTmbHeight, searchHeight];
        const transitionParams = this._stateAdjustment.getStateTransitionParams();

        // Update cached boxes
        for (const state of Object.values(ControlsState)) {
            this._cachedWorkspaceBoxes.set(
                state, this._computeWorkspacesBoxForState(state, ...params));
        }

        let workspacesBox;
        if (!transitionParams.transitioning) {
            workspacesBox = this._cachedWorkspaceBoxes.get(transitionParams.currentState);
        } else {
            const initialBox = this._cachedWorkspaceBoxes.get(transitionParams.initialState);
            const finalBox = this._cachedWorkspaceBoxes.get(transitionParams.finalState);
            workspacesBox = initialBox.interpolate(finalBox, transitionParams.progress);
        }

        this._workspacesDisplay.allocate(workspacesBox);

        // Search entry
        const searchXoffset = (DASH_LEFT ? dashWidth : 0) + spacing;
        //let [searchHeight] = this._searchEntry.get_preferred_height(width - wsTmbWidth);

        // Y position under top Dash
        let searchEntryX, searchEntryY;
        if (OVERVIEW_MODE === 2 && !DASH_TOP && !WS_TMB_TOP) {
            searchEntryY = 7;
        } else if (DASH_TOP) {
            searchEntryY = startY + (WS_TMB_TOP ? wsTmbHeight : 0) + dashHeight - spacing;
        } else {
            searchEntryY = startY + (WS_TMB_TOP ? wsTmbHeight + spacing : 0);
        }

        searchEntryX = searchXoffset;
        let searchWidth = width - 2 * spacing - (DASH_VERTICAL ? dashWidth : 0); // xAlignCenter is given by wsBox
        searchWidth = this._xAlignCenter ? width : searchWidth;

        if (CENTER_SEARCH_VIEW) {
            childBox.set_origin(0, searchEntryY);
            childBox.set_size(width, searchHeight);
        } else {
            childBox.set_origin(this._xAlignCenter ? 0 : searchEntryX, searchEntryY);
            childBox.set_size(this._xAlignCenter ? width : searchWidth - spacing, searchHeight);
        }

        this._searchEntry.allocate(childBox);

        availableHeight -= searchHeight + spacing;

        // AppDisplay - state, box, workAreaBox, searchHeight, dashHeight, appGridBox, wsTmbWidth
        //if (this._appDisplay.visible) {
            const workspaceAppGridBox =
                this._cachedWorkspaceBoxes.get(ControlsState.WINDOW_PICKER);

            params = [box, workAreaBox, searchHeight, dashWidth, dashHeight, workspaceAppGridBox, wsTmbHeight];
            let appDisplayBox;
            if (!transitionParams.transitioning) {
                appDisplayBox =
                    this._getAppDisplayBoxForState(transitionParams.currentState, ...params);
            } else {
                const initialBox =
                    this._getAppDisplayBoxForState(transitionParams.initialState, ...params);
                const finalBox =
                    this._getAppDisplayBoxForState(transitionParams.finalState, ...params);

                appDisplayBox = initialBox.interpolate(finalBox, transitionParams.progress);
            }
            this._appDisplay.allocate(appDisplayBox);
        //}

        // Search
        if (CENTER_SEARCH_VIEW) {
            searchWidth = width;
            childBox.set_origin(0, startY + (DASH_TOP ? dashHeight : 0) + (WS_TMB_TOP ? wsTmbHeight + spacing : 0) + searchHeight);
        } else {
            childBox.set_origin(this._xAlignCenter ? spacing : searchXoffset, startY + (DASH_TOP ? dashHeight : 0) + (WS_TMB_TOP ? wsTmbHeight + spacing : 0) + searchHeight);
        }

        childBox.set_size(searchWidth, availableHeight);
        this._searchController.allocate(childBox);

        this._runPostAllocation();
    }
}


// ------ Workspace -----------------------------------------------------------------
var WorkspaceLayoutOverride = {
    // this fixes wrong size and position calculation of window clones while moving overview to the next (+1) workspace if vertical ws orintation is enabled in GS
    _adjustSpacingAndPadding: function(rowSpacing, colSpacing, containerBox) {
        if (this._sortedWindows.length === 0)
            return [rowSpacing, colSpacing, containerBox];

        // All of the overlays have the same chrome sizes,
        // so just pick the first one.
        const window = this._sortedWindows[0];

        const [topOversize, bottomOversize] = window.chromeHeights();
        const [leftOversize, rightOversize] = window.chromeWidths();

        const oversize = Math.max(topOversize, bottomOversize, leftOversize, rightOversize);

        if (rowSpacing !== null)
            rowSpacing += oversize;
        if (colSpacing !== null)
            colSpacing += oversize;

        if (containerBox) {
            const vertical = global.workspaceManager.layout_rows === -1;

            const monitor = Main.layoutManager.monitors[this._monitorIndex];

            const bottomPoint = new Graphene.Point3D();
            if (vertical) {
                bottomPoint.x = containerBox.x2;
            } else {
                bottomPoint.y = containerBox.y2;
            }

            const transformedBottomPoint =
                this._container.apply_transform_to_point(bottomPoint);
            const bottomFreeSpace = vertical
                ? (monitor.x + monitor.height) - transformedBottomPoint.x
                : (monitor.y + monitor.height) - transformedBottomPoint.y;

            const [, bottomOverlap] = window.overlapHeights();

            if ((bottomOverlap + oversize) > bottomFreeSpace && !vertical) {
                containerBox.y2 -= (bottomOverlap + oversize) - bottomFreeSpace;
            }
        }

        return [rowSpacing, colSpacing, containerBox];
    }
}

//------ appDisplay --------------------------------------------------------------------------------

// this fixes dnd from appDisplay to the workspace thumbnail on the left if appDisplay is on page 1 because of appgrid left overshoot
var BaseAppViewOverride  = {
    _pageForCoords: function(x, y) {
        return AppDisplay.SidePages.NONE;
    }
}

// correction of the appGrid size when page indicators were moved from the bottom to the right
var AppDisplayOverride = {
    adaptToSize: function(width, height) {
        const [, indicatorWidth] = this._pageIndicators.get_preferred_width(-1);
        width -= indicatorWidth;

        this._grid.findBestModeForSize(width, height);

        const adaptToSize = AppDisplay.BaseAppView.prototype.adaptToSize.bind(this);
        adaptToSize(width, height);
    }
}

//---- SwipeTracker -----------------------------------------------------------------------------------
// switch overview's state gesture direction
var SwipeTrackerOverride = {
    _updateGesture: function(gesture, time, delta, distance) {
        if (this._state !== 1) //State.SCROLLING)
            return;

        if ((this._allowedModes & Main.actionMode) === 0 || !this.enabled) {
            this._interrupt();
            return;
        }

        if (WS_TMB_RIGHT)
            delta = -delta;
        this._progress += delta / distance;
        this._history.append(time, delta);

        this._progress = Math.clamp(this._progress, ...this._getBounds(this._initialProgress));
        this.emit('update', this._progress);
    }
}

function _setStaticBackground(reset = false) {
    _bgManagers.forEach((bg)=> {
        Main.overview._overview._controls._stateAdjustment.disconnect(bg._fadeSignal);
        bg.destroy();
    });

    _bgManagers = [];

    if (reset || (!SHOW_BG_IN_OVERVIEW && SHOW_WS_PREVIEW_BG))
        return;

    for (const monitor of Main.layoutManager.monitors) {
		const bgManager = new Background.BackgroundManager({
			monitorIndex: monitor.index,
			container: Main.layoutManager.overviewGroup,
			vignette: true,
		});

        bgManager.backgroundActor.content.vignette_sharpness = 0;
        bgManager.backgroundActor.content.brightness = 1;


        bgManager._fadeSignal = Main.overview._overview._controls._stateAdjustment.connect('notify::value', (v) => {
            _updateStaticBackground(bgManager, v.value);
		});

        if (monitor.index === global.display.get_primary_monitor()) {
            bgManager._primary = true;
            _bgManagers.unshift(bgManager); // primary monitor first
        } else {
            bgManager._primary = false;
            _bgManagers.push(bgManager);
        }
    }
}

function _updateStaticBackground(bgManager, stateValue) {
    if (!SHOW_BG_IN_OVERVIEW && !SHOW_WS_PREVIEW_BG) {
        // if no bg shown in the overview, fade out the wallpaper
        bgManager.backgroundActor.opacity = Util.lerp(255, 0, Math.min(stateValue, 1));
    } else {
        // in case user activated search during overview transition
        if (Main.overview._overview._controls._searchController._searchActive) {
            stateValue = 2;
        }

        let VIGNETTE, BRIGHTNESS, bgValue;
        if (OVERVIEW_MODE === 2 && stateValue <= 1 && !WORKSPACE_MODE) {
            VIGNETTE = 0;
            BRIGHTNESS = 1;
            bgValue = stateValue;
        } else {
            VIGNETTE = 0.4;
            BRIGHTNESS = 0.85;
            if (OVERVIEW_MODE === 2 && stateValue > 1 && !WORKSPACE_MODE) {
                bgValue = stateValue - 1;
            } else {
                bgValue = stateValue;
            }
        }

        let blurEffect = bgManager.backgroundActor.get_effect('blur');
        if (!blurEffect) {
            blurEffect = new Shell.BlurEffect({
                brightness: 1,
                sigma: 0,
                mode: Shell.BlurMode.ACTOR,
            })
            bgManager.backgroundActor.add_effect_with_name('blur', blurEffect);
        }

        bgManager.backgroundActor.content.vignette_sharpness = VIGNETTE;
        bgManager.backgroundActor.content.brightness = BRIGHTNESS;

        let vignetteInit, brightnessInit, sigmaInit;
        if (SHOW_BG_IN_OVERVIEW && SHOW_WS_PREVIEW_BG) {
            vignetteInit = VIGNETTE;
            brightnessInit = BRIGHTNESS;
            sigmaInit = OVERVIEW_BG_BLUR_SIGMA;
        } else {
            vignetteInit = 0;
            brightnessInit = 1;
            sigmaInit = 0
        }

        //bgManager.backgroundActor.content.vignette_sharpness = Util.lerp(vignetteInit, VIGNETTE, Math.min(stateValue, 1));
        //bgManager.backgroundActor.content.brightness = Util.lerp(brightnessInit, BRIGHTNESS, Math.min(stateValue, 1));
        bgManager.backgroundActor.content.vignette_sharpness = Util.lerp(vignetteInit, VIGNETTE, bgValue);
        bgManager.backgroundActor.content.brightness = Util.lerp(brightnessInit, BRIGHTNESS, bgValue);

        if (OVERVIEW_BG_BLUR_SIGMA || APP_GRID_BG_BLUR_SIGMA) {
            // reduce number of steps of blur transition to improve performance
            const step = SMOOTH_BLUR_TRANSITIONS ? 0.05 : 0.2;
            const progress = stateValue - (stateValue % step);
            if (SHOW_WS_PREVIEW_BG && stateValue < 1) { // no need to animate transition, unless appGrid state is involved, static bg is covered by the ws preview bg
                if (blurEffect.sigma !== OVERVIEW_BG_BLUR_SIGMA)
                    blurEffect.sigma = OVERVIEW_BG_BLUR_SIGMA;
            } else if (stateValue < 1) {
                const sigma = Math.round(Util.lerp(0, OVERVIEW_BG_BLUR_SIGMA, progress));
                if (sigma !== blurEffect.sigma) {
                    blurEffect.sigma = sigma;
                }
            } else if (stateValue > 1  && bgManager._primary) {
                const sigma = Math.round(Util.lerp(OVERVIEW_BG_BLUR_SIGMA, APP_GRID_BG_BLUR_SIGMA, progress - 1));
                if (sigma !== blurEffect.sigma) {
                    blurEffect.sigma = sigma;
                }
            } else if (stateValue === 1) {
                blurEffect.sigma = OVERVIEW_BG_BLUR_SIGMA;
            } else if (stateValue === 0) {
                blurEffect.sigma = 0;
            }
        }
    }
}

WorkspaceAnimation.MonitorGroup
function _injectWorkspaceAnimation() {
    _workspaceAnimationInjections['_init'] = _Util.injectToFunction(
        WorkspaceAnimation.MonitorGroup.prototype, '_init', function() {
            if (!STATIC_WS_SWITCHER_BG) return;

            // we have two options to implement static bg feature
            // one is adding background to monitorGroup
            // but this one has disadvantage - sticky windows will be always on top of animated windows
            // which is bad for conky, for example, that window should be always below
            /*this._bgManager = new Background.BackgroundManager({
                container: this,
                monitorIndex: this._monitor.index,
                controlPosition: false,
            });*/

            // the second option is to make background of the monitorGroup transparent so the real desktop content will stay visible,
            // hide windows that should be animated and keep only sticky windows
            // we can keep certain sticky windows bellow and also extensions like DING (icons on desktop) will stay visible
            this.set_style('background-color: transparent;');
            // stickyGroup holds the Always on Visible Workspace windows to keep them static and above other windows during animation
            const stickyGroup = this.get_children()[1];
            stickyGroup._windowRecords.forEach((r, index) => {
                const metaWin = r.windowActor.metaWindow;
                // conky is sticky but should never get above other windows during ws animation
                // so we hide it from the overlay group, we will see the original if not covered by other windows
                if (metaWin.wm_class == 'conky') {
                    r.clone.opacity = 0;
                }
            })
            this._hiddenWindows = [];
            // remove (hide) background wallpaper from the animation, we will see the original one
            this._workspaceGroups.forEach(w => w._background.opacity = 0);
            // hide (scale to 0) all non-sticky windows, their clones will be animated
            global.get_window_actors().forEach(actor => {
                const metaWin = actor.metaWindow;
                if (metaWin?.get_monitor() === this._monitor.index && !(metaWin?.wm_class == 'conky' && metaWin?.is_on_all_workspaces())) { //* && !w.is_on_all_workspaces()*/) {
                    // hide original window. we cannot use opacity since it also affects clones.
                    // scaling them to 0 works well
                    actor.scale_x = 0;
                    this._hiddenWindows.push(actor);
                }
            });


            // restore all hidden windows at the end of animation
            this.connect('destroy', () =>{
                this._hiddenWindows.forEach(actor => {
                    actor.scale_x = 1;
                });
            });
        }
    );
}
