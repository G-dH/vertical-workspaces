/**
 * Vertical Workspaces
 * extension.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2023
 * @license    GPL-3.0
 *
 */

'use strict';

const { GLib, GObject, Meta, Shell, St } = imports.gi;

const Main = imports.ui.main;

const Util = imports.misc.util;
const Background = imports.ui.background;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Settings = Me.imports.settings;
const _Util = Me.imports.util;

const WindowSearchProvider = Me.imports.windowSearchProvider;
const RecentFilesSearchProvider = Me.imports.recentFilesSearchProvider;
const LayoutOverride = Me.imports.layout;
const AppDisplayOverride = Me.imports.appDisplay;
const WorkspaceThumbnailOverride = Me.imports.workspaceThumbnail;
const WorkspaceOverride = Me.imports.workspace;
const WorkspacesViewOverride = Me.imports.workspacesView;
const WindowPreviewOverride = Me.imports.windowPreview;
const IconGridOverride = Me.imports.iconGrid;
const WorkspaceAnimationOverride = Me.imports.workspaceAnimation;
const WindowManagerOverride = Me.imports.windowManager;
const OverviewOverride = Me.imports.overview;
const OverviewControlsOverride = Me.imports.overviewControls;
const SwipeTrackerOverride = Me.imports.swipeTracker;
const WorkspaceSwitcherPopupOverride = Me.imports.workspaceSwitcherPopup;
const SearchOverride = Me.imports.search;
const PanelOverride = Me.imports.panel;
const DashOverride = Me.imports.dash;


let opt = null;

let _bgManagers;
let _shellSettings;

let _enabled;
let _resetExtensionIfEnabled;
let _prevDash;

let _showingOverviewConId;
let _monitorsChangedSigId;
let _watchDockSigId;

let _resetTimeoutId;

// drop control for app grid sorting modes
let _appSystemStateSigId;
let _origAppViewItemAcceptDrop;
let _origAppViewItemHandleDragOver;
let _origAppDisplayAcceptDrop;

let _enableTimeoutId = 0;



function init() {
    ExtensionUtils.initTranslations();
}

function enable() {
    // globally readable flag for other extensions
    global.verticalWorkspacesEnabled = true;

    _enableTimeoutId = GLib.timeout_add(
        GLib.PRIORITY_DEFAULT,
        200,
        () => {
            activate();
            log(`${Me.metadata.name}: enabled`);
            _enableTimeoutId = 0;
            return GLib.SOURCE_REMOVE;
        }
    );
}

function disable() {
    if (_enableTimeoutId) {
        GLib.source_remove(_enableTimeoutId);
        _enableTimeoutId = 0;
    } else {
        reset();
    }
    global.verticalWorkspacesEnabled = undefined;
    log(`${Me.metadata.name}: disabled`);
}

//------------------------------------------------------------------------------------------

function activate() {
    _enabled = true;

    _bgManagers = [];

    Settings.opt = new Settings.Options();
    opt = Settings.opt;

    _updateSettings();

    opt.connect('changed', _updateSettings);

    _updateOverrides();

    _prevDash = {};
    const dash = Main.overview.dash;
    _prevDash.dash = dash;
    _prevDash.position = dash.position;

    _monitorsChangedSigId = Main.layoutManager.connect('monitors-changed', () => _resetExtension(3000));

    // static bg animations conflict with startup animation
    // enable it on first hiding from the overview and disconnect the signal
    _showingOverviewConId = Main.overview.connect('showing', _onShowingOverview);

    // if Dash to Dock detected force enable "Fix for DtD" option
    if (_Util.dashIsDashToDock()) {
        opt.set('fixUbuntuDock', true);
        _fixUbuntuDock(true);
    } else {
        _fixUbuntuDock(opt.get('fixUbuntuDock'));
    }

    // switch PageUp/PageDown workspace switcher shortcuts
    _switchPageShortcuts();
    _setStaticBackground(!opt.SHOW_BG_IN_OVERVIEW);
}

function reset() {
    _enabled = 0;

    _fixUbuntuDock(false);

    const reset = true;
    _updateOverrides(reset);

    if (_monitorsChangedSigId) {
        Main.layoutManager.disconnect(_monitorsChangedSigId);
        _monitorsChangedSigId = 0;
    }

    _prevDash = null;

    // switch PageUp/PageDown workspace switcher shortcuts
    _switchPageShortcuts();

    _setStaticBackground(reset);

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

    St.Settings.get().slow_down_factor = 1;

    Main.overview.dash._background.set_style('');

    opt.destroy();
    opt = null;
}

function _updateOverrides(reset = false) {
    WorkspacesViewOverride.update(reset);
    WorkspaceThumbnailOverride.update(reset);
    OverviewControlsOverride.update(reset);
    OverviewOverride.update(reset);

    WorkspaceOverride.update(reset);
    WindowPreviewOverride.update(reset);
    WindowManagerOverride.update(reset);
    
    AppDisplayOverride.update(reset);
    LayoutOverride.update(reset);
    DashOverride.update(reset);
    PanelOverride.update(reset);

    WorkspaceAnimationOverride.update(reset);
    WorkspaceSwitcherPopupOverride.update(reset);

    SwipeTrackerOverride.update(reset);

    SearchOverride.update(reset);
    WindowSearchProvider.update(reset);
    RecentFilesSearchProvider.update(reset);
}

function _onShowingOverview() {
    // store pointer X coordinate for OVERVIEW_MODE 1 window spread - if mouse pointer is steady, don't spread
    opt.showingPointerX = global.get_pointer()[0];

    if (opt.FIX_UBUNTU_DOCK) {
        // workaround for Ubuntu Dock breaking overview allocations after changing position
        const dash = Main.overview.dash;
        if (_prevDash.dash !== dash || _prevDash.position !== dash._position) {
            _resetExtensionIfEnabled(0);
        }
    }
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

//-----------------------------------------------------

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

    if (!activate) {
        return;
    }

    _shellSettings = ExtensionUtils.getSettings( 'org.gnome.shell');
    _watchDockSigId = _shellSettings.connect('changed::enabled-extensions', () => _resetExtension());
    _resetExtensionIfEnabled = _resetExtension;
}

function _updateSettings(settings, key) {
    opt._updateSettings();

    opt.WORKSPACE_MIN_SPACING = Main.overview._overview._controls._thumbnailsBox.get_theme_node().get_length('spacing');
    // update variables that cannot be processed within settings
    const dash = Main.overview.dash;
    if (_Util.dashIsDashToDock()) {
        opt.DASH_POSITION = dash._position;
        opt.DASH_TOP = DASH_POSITION === 0;
        opt.DASH_RIGHT = DASH_POSITION === 1;
        opt.DASH_BOTTOM = DASH_POSITION === 2;
        opt.DASH_LEFT = DASH_POSITION === 3;
        opt.DASH_VERTICAL = DASH_LEFT || DASH_RIGHT;
    }

    opt.MAX_ICON_SIZE = opt.get('dashMaxIconSize', true);
    if (opt.MAX_ICON_SIZE < 16) {
        opt.MAX_ICON_SIZE = 64;
        opt.set('dashMaxIconSize', 64);
    }

    imports.ui.workspace.WINDOW_PREVIEW_MAXIMUM_SCALE = 0.95;

    if (!_Util.dashIsDashToDock()) {// DtD has its own opacity control
        Main.overview.dash._background.opacity = Math.round(opt.get('dashBgOpacity', true) * 2.5); // conversion % to 0-255
        const radius = opt.get('dashBgRadius', true);
        if (radius) {
            let style;
            switch (opt.DASH_POSITION) {
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

    Main.overview.searchEntry.visible = opt.SHOW_SEARCH_ENTRY;
    St.Settings.get().slow_down_factor = opt.ANIMATION_TIME_FACTOR;
    imports.ui.search.MAX_LIST_SEARCH_RESULTS_ROWS = opt.SEARCH_MAX_ROWS;
    opt.START_Y_OFFSET = (opt.PANEL_MODE === 1 && opt.PANEL_POSITION_TOP) ? Main.panel.height : 0;
   
    if (settings)
        _applySettings(key);
}

function _applySettings(key) {
    _setStaticBackground(!opt.SHOW_BG_IN_OVERVIEW);
    _updateOverviewTranslations();
    _switchPageShortcuts();

    if (key === 'fix-ubuntu-dock')
        _fixUbuntuDock(opt.get('fixUbuntuDock', true));
    if (key === 'ws-thumbnails-position') {
        OverviewControlsOverride.update();
        WorkspaceThumbnailOverride.update();
        WorkspacesViewOverride.update();
    }
    if (key?.includes('app-grid')) {
        AppDisplayOverride.update();
    }
    if (key?.includes('panel')) {
        PanelOverride.update();
    }
    if (key?.includes('dash') || key?.includes('app')) {
        DashOverride.update();
    }
    if (key === 'workspace-animation') {
        WorkspaceAnimationOverride.update();
    }
}

function _switchPageShortcuts() {
    if (!opt.get('enablePageShortcuts', true))
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

    const [tmbTranslation_x, tmbTranslation_y, dashTranslation_x, dashTranslation_y, searchTranslation_y] = _Util.getOverviewTranslations(opt, dash, tmbBox, searchEntryBin);
    tmbBox.translation_x = tmbTranslation_x;
    tmbBox.translation_y = tmbTranslation_y;
    if (!_Util.dashNotDefault()) { // only if dash is not dash to dock
        dash.translation_x = dashTranslation_x;
        dash.translation_y = dashTranslation_y;
    }
    searchEntryBin.translation_y = searchTranslation_y;
}

function _setStaticBackground(reset = false) {
    _bgManagers.forEach((bg)=> {
        Main.overview._overview._controls._stateAdjustment.disconnect(bg._fadeSignal);
        bg.destroy();
    });

    _bgManagers = [];
    // if (!SHOW_BG_IN_OVERVIEW && SHOW_WS_PREVIEW_BG) the background is used for static transition from wallpaper to empty bg in the overview
    if (reset || (!opt.SHOW_BG_IN_OVERVIEW && opt.SHOW_WS_PREVIEW_BG))
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
            _updateStaticBackground(bgManager, v.value, v);
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

function _updateStaticBackground(bgManager, stateValue, stateAdjustment = null) {
    if (!opt.SHOW_BG_IN_OVERVIEW && !opt.SHOW_WS_PREVIEW_BG) {
        // if no bg shown in the overview, fade out the wallpaper
        if (!(opt.OVERVIEW_MODE2 && opt.WORKSPACE_MODE && stateAdjustment?.getStateTransitionParams().finalState === 1))
            bgManager.backgroundActor.opacity = Util.lerp(255, 0, Math.min(stateValue, 1));
    } else {
        let VIGNETTE, BRIGHTNESS, bgValue;
        if (opt.OVERVIEW_MODE2 && stateValue <= 1 && !opt.WORKSPACE_MODE) {
            VIGNETTE = 0;
            BRIGHTNESS = 1;
            bgValue = stateValue;
        } else {
            VIGNETTE = 0.2;
            BRIGHTNESS = 0.95;
            if (opt.OVERVIEW_MODE2 && stateValue > 1 && !opt.WORKSPACE_MODE) {
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
        if (opt.SHOW_BG_IN_OVERVIEW && opt.SHOW_WS_PREVIEW_BG) {
            vignetteInit = VIGNETTE;
            brightnessInit = BRIGHTNESS;
            sigmaInit = opt.OVERVIEW_BG_BLUR_SIGMA;
        } else {
            vignetteInit = 0;
            brightnessInit = 1;
            sigmaInit = 0
        }

        if (opt.OVERVIEW_MODE2) {
            bgManager.backgroundActor.content.vignette_sharpness = Util.lerp(vignetteInit, VIGNETTE, bgValue);
            bgManager.backgroundActor.content.brightness = Util.lerp(brightnessInit, BRIGHTNESS, bgValue);
        } else {
            bgManager.backgroundActor.content.vignette_sharpness = Util.lerp(vignetteInit, VIGNETTE, Math.min(stateValue, 1));
            bgManager.backgroundActor.content.brightness = Util.lerp(brightnessInit, BRIGHTNESS, Math.min(stateValue, 1));
        }

        if (opt.OVERVIEW_BG_BLUR_SIGMA || opt.APP_GRID_BG_BLUR_SIGMA) {
            // reduce number of steps of blur transition to improve performance
            const step = opt.SMOOTH_BLUR_TRANSITIONS ? 0.05 : 0.2;
            const progress = stateValue - (stateValue % step);
            if (opt.SHOW_WS_PREVIEW_BG && stateValue < 1) { // no need to animate transition, unless appGrid state is involved, static bg is covered by the ws preview bg
                if (blurEffect.sigma !== opt.OVERVIEW_BG_BLUR_SIGMA)
                    blurEffect.sigma = opt.OVERVIEW_BG_BLUR_SIGMA;
            } else if (stateValue < 1) {
                const sigma = Math.round(Util.lerp(0, opt.OVERVIEW_BG_BLUR_SIGMA, progress));
                if (sigma !== blurEffect.sigma) {
                    blurEffect.sigma = sigma;
                }
            } else if (stateValue > 1  && bgManager._primary) {
                const sigma = Math.round(Util.lerp(opt.OVERVIEW_BG_BLUR_SIGMA, opt.APP_GRID_BG_BLUR_SIGMA, progress - 1));
                if (sigma !== blurEffect.sigma) {
                    blurEffect.sigma = sigma;
                }
            } else if (stateValue === 1) {
                blurEffect.sigma = opt.OVERVIEW_BG_BLUR_SIGMA;
            } else if (stateValue === 0) {
                blurEffect.sigma = 0;
            }
        }
    }
}
