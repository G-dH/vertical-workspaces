// Vertical Workspaces
// GPL v3 ©G-dH@Github.com
// used parts of https://github.com/RensAlthuis/vertical-overview extension

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

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Settings = Me.imports.settings;
const shellVersion = Settings.shellVersion;

const _Util = Me.imports.util;


// touching modul properties defined by const/let for the first time returns undefined in GS 42, so we touch it here before we use it
WorkspacesView.SecondaryMonitorDisplay;
WorkspacesView.SECONDARY_WORKSPACE_SCALE;
WindowPreview.ICON_SIZE;

let gOptions = null;
let original_MAX_THUMBNAIL_SCALE;

var WORKSPACE_CUT_SIZE = 10;

// keep adjacent workspaces out of the screen
const WORKSPACE_MAX_SPACING = 350;
const WORKSPACE_MIN_SPACING = 350;

var DASH_MAX_HEIGHT_RATIO = 0.15;
var DASH_ITEM_LABEL_SHOW_TIME = 150;

var ControlsState = {
    HIDDEN: 0,
    WINDOW_PICKER: 1,
    APP_GRID: 2,
};

var DashPosition = {
    TOP_LEFT: 0,
    TOP_CENTER: 1,
    TOP_RIGHT: 2,
    BOTTOM_LEFT: 3,
    BOTTOM_CENTER: 4,
    BOTTOM_RIGHT: 5
}

let verticalOverrides = {};
let _windowPreviewInjections = {};
let _stateAdjustmentValueSigId;
let _appDisplayScrollConId;

let _shownOverviewSigId;
let _hidingOverviewSigId;
let _searchControllerSigId;
let _wsTmbBoxResizeDelayId;
let _verticalOverview;
let _prevDash;

var _correctInitialOverviewWsBug;

function activate() {
    gOptions = new Settings.Options();
    gOptions.connect('changed', _updateSettings);
    if (Object.keys(verticalOverrides).length != 0)
        reset();

    // switch internal workspace orientation in GS to vertical
    global.workspace_manager.override_workspace_layout(Meta.DisplayCorner.TOPLEFT, false, -1, 1);

    // fix overlay base for vertical workspaces
    verticalOverrides['WorkspaceLayout'] = _Util.overrideProto(Workspace.WorkspaceLayout.prototype, WorkspaceLayoutOverride);
    verticalOverrides['WorkspacesView'] = _Util.overrideProto(WorkspacesView.WorkspacesView.prototype, WorkspacesViewOverride);

    // move titles into window previews
    _injectWindowPreview();

    // re-layout overview to better serve for vertical orientation
    verticalOverrides['ThumbnailsBox'] = _Util.overrideProto(WorkspaceThumbnail.ThumbnailsBox.prototype, ThumbnailsBoxOverride);
    verticalOverrides['WorkspaceThumbnail'] = _Util.overrideProto(WorkspaceThumbnail.WorkspaceThumbnail.prototype, WorkspaceThumbnailOverride);
    verticalOverrides['ControlsManager'] = _Util.overrideProto(OverviewControls.ControlsManager.prototype, ControlsManagerOverride);
    verticalOverrides['ControlsManagerLayout'] = _Util.overrideProto(OverviewControls.ControlsManagerLayout.prototype, ControlsManagerLayoutOverride);
    verticalOverrides['SecondaryMonitorDisplay'] = _Util.overrideProto(WorkspacesView.SecondaryMonitorDisplay.prototype, SecondaryMonitorDisplayOverride);
    verticalOverrides['BaseAppView'] = _Util.overrideProto(AppDisplay.BaseAppView.prototype, AppDisplayOverride);
    verticalOverrides['DashItemContainer'] = _Util.overrideProto(Dash.DashItemContainer.prototype, DashItemContainerOverride);

    original_MAX_THUMBNAIL_SCALE = WorkspaceThumbnail.MAX_THUMBNAIL_SCALE;
    WorkspaceThumbnail.MAX_THUMBNAIL_SCALE = gOptions.get('wsThumbnailScale') / 100;

    const controlsManager = Main.overview._overview._controls;

    _stateAdjustmentValueSigId = controlsManager._stateAdjustment.connect('notify::value', _updateWorkspacesDisplay.bind(controlsManager));

    _prevDash = Main.overview.dash;
    _shownOverviewSigId = Main.overview.connect('shown', () => {
        _moveDashAppGridIcon();
        const dash = Main.overview.dash;
        if (dash !== _prevDash) {
            reset();
            activate(_verticalOverview);
            _prevDash = dash;
            dash._background.opacity = 0;
            return true;
        }

        // Move dash above workspaces
        dash.get_parent().set_child_above_sibling(dash, null);
    });

    _hidingOverviewSigId = Main.overview.connect('hiding', () => {
        // Move dash below workspaces before hiding the overview
        const appDisplay = Main.overview._overview.controls._workspacesDisplay;
        const parent = appDisplay.get_parent();
        parent.set_child_above_sibling(appDisplay, null);
    });

    Main.overview.dash._background.opacity = Math.round(gOptions.get('dashBgOpacity') * 2.5);
    Main.overview.searchEntry.visible = false;
    _moveDashAppGridIcon();

    _searchControllerSigId =  Main.overview._overview.controls._searchController.connect('notify::search-active', _updateSearchControlerView);

    _setAppDisplayOrientation(true);
    _updateSettings();

    // workaround for mainstream bug - overview always shows workspace 1 instead of the active one after restart
    if (_correctInitialOverviewWsBug) {
        Main.wm.actionMoveWorkspace(global.workspace_manager.get_active_workspace().get_neighbor(-2));
        Main.wm.actionMoveWorkspace(global.workspace_manager.get_active_workspace().get_neighbor(-1));
        _correctInitialOverviewWsBug = false;
    }

    // reverse swipe gestures for enter/leave overview and ws switching
    Main.overview._swipeTracker.orientation = Clutter.Orientation.HORIZONTAL;

    // switch PageUp/PageDown workspace switcher shortcuts
    _switchPageShortcuts();
}

function reset() {
    // switch workspace orientation back to horizontal
    global.workspace_manager.override_workspace_layout(Meta.DisplayCorner.TOPLEFT, false, 1, -1);

    if (original_MAX_THUMBNAIL_SCALE)
        WorkspaceThumbnail.MAX_THUMBNAIL_SCALE = original_MAX_THUMBNAIL_SCALE;

    const controlsManager = Main.overview._overview._controls;
    if (_stateAdjustmentValueSigId) {
        controlsManager._stateAdjustment.disconnect(_stateAdjustmentValueSigId);
        _stateAdjustmentValueSigId = 0;
    }

    if (_shownOverviewSigId) {
        Main.overview.disconnect(_shownOverviewSigId);
        _shownOverviewSigId = 0;
    }

    if (_hidingOverviewSigId) {
        Main.overview.disconnect(_hidingOverviewSigId);
        _hidingOverviewSigId = 0;
    }

    if (_searchControllerSigId) {
        Main.overview._overview.controls._searchController.disconnect(_searchControllerSigId);
        _searchControllerSigId = 0;
    }

    if (_wsTmbBoxResizeDelayId) {
        GLib.source_remove(_wsTmbBoxResizeDelayId);
        _wsTmbBoxResizeDelayId = 0;
    }

    for (let name in _windowPreviewInjections) {
        _Util.removeInjection(WindowPreview.WindowPreview.prototype, _windowPreviewInjections, name);
    }
    _windowPreviewInjections = {};

    _Util.overrideProto(WorkspacesView.WorkspacesView.prototype, verticalOverrides['WorkspacesView']);
    _Util.overrideProto(WorkspacesView.SecondaryMonitorDisplay.prototype, verticalOverrides['SecondaryMonitorDisplay']);

    _Util.overrideProto(WorkspaceThumbnail.ThumbnailsBox.prototype, verticalOverrides['ThumbnailsBox']);
    _Util.overrideProto(WorkspaceThumbnail.WorkspaceThumbnail.prototype, verticalOverrides['WorkspaceThumbnail']);
    _Util.overrideProto(OverviewControls.ControlsManagerLayout.prototype, verticalOverrides['ControlsManagerLayout']);
    _Util.overrideProto(OverviewControls.ControlsManager.prototype, verticalOverrides['ControlsManager']);
    _Util.overrideProto(Workspace.WorkspaceLayout.prototype, verticalOverrides['WorkspaceLayout']);
    _Util.overrideProto(AppDisplay.BaseAppView.prototype, verticalOverrides['BaseAppView']);
    _Util.overrideProto(Dash.DashItemContainer.prototype, verticalOverrides['DashItemContainer']);

    Main.overview._swipeTracker.orientation = Clutter.Orientation.VERTICAL;

    verticalOverrides = {}

    _setAppDisplayOrientation(false);

    Main.overview.searchEntry.visible = true;

    Main.overview.dash._background.opacity = 255;
    const reset = true;
    _moveDashAppGridIcon(reset);
    _prevDash = null;

    // switch PageUp/PageDown workspace switcher shortcuts
    _switchPageShortcuts();

    gOptions.destroy();
    gOptions = null;
}

//*************************************************************************************************

function _updateSettings(settings, key) {
    switch (key) {
        case 'ws-thumbnail-scale':
            WorkspaceThumbnail.MAX_THUMBNAIL_SCALE = gOptions.get('wsThumbnailScale', true) / 100;
            // in case we adjusted actual thumbnail scale before, we need to update the value,
            // otherwise the new scale constant can limit the size to smaller values but not above them
            const width = global.display.get_monitor_geometry(global.display.get_primary_monitor()).width;
            Main.overview._overview._controls._thumbnailsBox.width = WorkspaceThumbnail.MAX_THUMBNAIL_SCALE * width;
            break;
        case 'dash-max-scale':
            DASH_MAX_HEIGHT_RATIO = gOptions.get('dashMaxScale', true) / 100;
            break;
        case 'dash-bg-opacity':
            Main.overview.dash._background.opacity = Math.round(gOptions.get('dashBgOpacity', true) * 2.5);
            break;
        case 'enable-page-shortcuts':
            _switchPageShortcuts();
    }
}

function _updateSearchControlerView() {
    // show search entry only if the user starts typing, and hide it when leaving the search mode
    Main.overview.searchEntry.visible = Main.overview._overview.controls._searchController._searchActive;

    // adjust size of workspace thumbnails if needed
    if (!gOptions.get('centerSearch'))
        return;

    const searchController = Main.overview._overview._controls._searchController;
    const searchActive = searchController._searchActive;
    let timeout = 0;
    // before first search activation the search container is not yet allocated, we must wait until the transition animation ends
    if (searchController._searchResults._content.allocation.x2 === -Infinity)
        timeout = 300;
    _wsTmbBoxResizeDelayId =  GLib.timeout_add(GLib.PRIORITY_DEFAULT, timeout, () => {
        // the real width needs to be calculated from allocation coordinates
        const searchAllocation = searchController._searchResults._content.allocation;
        const searchWidth = searchAllocation.x2 - searchAllocation.x1;
        const tmbBox = Main.overview._overview._controls._thumbnailsBox;
        const geometry = global.display.get_monitor_geometry(global.display.get_primary_monitor());
        const tmbBoxMaxWidth = (geometry.width - searchWidth - 50) / 2;
        if (searchActive && tmbBox.width > tmbBoxMaxWidth) {
            tmbBox._originalWidth = tmbBox.width;
            tmbBox.width = Math.round(tmbBoxMaxWidth);
        } else {
            if (tmbBox._originalWidth)
                tmbBox.width = tmbBox._originalWidth;
        }
        _wsTmbBoxResizeDelayId = 0;
        return GLib.SOURCE_REMOVE;
    });
}

function _switchPageShortcuts() {
    if (!gOptions.get('enablePageShortcuts'))
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

//----- WindowPreview ------------------------------------------------------------------

function _injectWindowPreview() {
    _windowPreviewInjections['_init'] = _Util.injectToFunction(
        WindowPreview.WindowPreview.prototype, '_init', function() {
            this._title.get_constraints()[1].offset = - 1.3 * WindowPreview.ICON_SIZE;
            this.set_child_above_sibling(this._title, null);
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
    if (vertical) {
        appDisplay._scrollView.set_policy(St.PolicyType.NEVER, St.PolicyType.EXTERNAL);
    } else {
        appDisplay._scrollView.set_policy(St.PolicyType.EXTERNAL, St.PolicyType.NEVER);
        if (_appDisplayScrollConId) {
            appDisplay._adjustment.disconnect(_appDisplayScrollConId);
            _appDisplayScrollConId = 0;
        }
    }

    // vertical page indicator is not practical in given configuration...
    //appDisplay._pageIndicators.vertical = true;

    // value for page indicator is calculated from scroll adjustment, horizontal needs to be replaced by vertical
    appDisplay._adjustment = appDisplay._scrollView[scroll].adjustment;

    // no need to connect already connected signal (wasn't removed the original one before)
    if (!vertical)
        return;

    _appDisplayScrollConId = appDisplay._adjustment.connect('notify::value', adj => {
        appDisplay._updateFade();
        const value = adj.value / adj.page_size;
        appDisplay._pageIndicators.setCurrentPosition(value);

        const distanceToPage = Math.abs(Math.round(value) - value);
        if (distanceToPage < 0.001) {
            appDisplay._hintContainer.opacity = 255;
            appDisplay._hintContainer.translationX = 0;
        } else {
            appDisplay._hintContainer.remove_transition('opacity');
            let opacity = Math.clamp(
                255 * (1 - (distanceToPage * 2)),
                0, 255);

            appDisplay._hintContainer.translationX = (Math.round(value) - value) * adj.page_size;
            appDisplay._hintContainer.opacity = opacity;
        }
    });
}

function _moveDashAppGridIcon(reset = false) {
    // move dash app grid icon to the front
    const dash = Main.overview.dash;
    let target;
    if (reset || gOptions.get('showAppsIconPosition'))
        target = dash._showAppsIcon;
    else
        target = dash._box;
    const container = dash._dashContainer;
    // swap the children only if needed
    if (container.get_first_child() === target) {
        container.remove_actor(target);
        container.add_actor(target);
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
        const [, workspaceWidth] = workspace.get_preferred_width(Math.floor(height));
        const [, workspaceHeight] = workspace.get_preferred_height(workspaceWidth);

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
            availableSpace = (width - workspaceSize) / 2;
        }

        const spacing = (availableSpace - workspaceSize * 0.4) * (1 - fitMode);
        const { scaleFactor } = St.ThemeContext.get_for_stage(global.stage);

        return Math.clamp(spacing, WORKSPACE_MIN_SPACING * scaleFactor,
            WORKSPACE_MAX_SPACING * scaleFactor);
    },

    // this function has duplicate in OverviewControls so we use one function for both to avoid issues with syncing them
    _getFitModeForState: function(state) {
        return _getFitModeForState(state);
    },

    // spread windows during entering appDisplay page from HIDDEN state to add some action (looks more natural)
    _getWorkspaceModeForOverviewState: function(state) {
        const { ControlsState } = OverviewControls;

        switch (state) {
        case ControlsState.HIDDEN:
            return 0;
        case ControlsState.WINDOW_PICKER:
            return 1;
        case ControlsState.APP_GRID:
            return 1;
        }

        return 0;
    },

    // this is only changing WORKSPACE_INACTIVE_SCALE to 1
    _updateWorkspacesState: function() {
        const adj = this._scrollAdjustment;
        const fitMode = this._fitModeAdjustment.value;

        const { initialState, finalState, progress } =
            this._overviewAdjustment.getStateTransitionParams();

        const workspaceMode = (1 - fitMode) * Util.lerp(
            this._getWorkspaceModeForOverviewState(initialState),
            this._getWorkspaceModeForOverviewState(finalState),
            progress);

        // Fade and scale inactive workspaces
        this._workspaces.forEach((w, index) => {
            w.stateAdjustment.value = workspaceMode;

            const distanceToCurrentWorkspace = Math.abs(adj.value - index);

            const scaleProgress = 1 - Math.clamp(distanceToCurrentWorkspace, 0, 1);

            const scale = Util.lerp(1, 1, scaleProgress);
            w.set_scale(scale, scale);
        });
    }
}

// common for OverviewControls and Vertical Workspaces
function _getFitModeForState(state) {
    switch (state) {
    case ControlsState.HIDDEN:
    case ControlsState.WINDOW_PICKER:
        return WorkspacesView.FitMode.SINGLE;
    case ControlsState.APP_GRID:
        return WorkspacesView.FitMode.SINGLE;
        //return WorkspacesView.FitMode.ALL;
    default:
        return WorkspacesView.FitMode.SINGLE;
    }
}

//  SecondaryMonitorDisplay
var SecondaryMonitorDisplayOverride = {
    _getThumbnailParamsForState: function(state) {
        const { ControlsState } = OverviewControls;

        let opacity, scale;
        switch (state) {
        case ControlsState.HIDDEN:
        case ControlsState.WINDOW_PICKER:
        case ControlsState.APP_GRID:
            opacity = 255;
            scale = 1;
            break;
        default:
            opacity = 255;
            scale = 1;
            break;
        }

        return { opacity, scale };
    },

    _getThumbnailsWidth: function(box) {
        if (!this._thumbnails.visible)
            return 0;

        const [width, height] = box.get_size();
        const { expandFraction } = this._thumbnails;
        const [, thumbnailsWidth] = this._thumbnails.get_preferred_width(height);
        return Math.min(
            thumbnailsWidth * expandFraction,
            width * WorkspaceThumbnail.MAX_THUMBNAIL_SCALE);
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
            let wsbX;
            if (this._thumbnails._positionLeft) {
                wsbX = 2 * spacing + thumbnailsWidth;
            } else {
                wsbX = spacing;
            }
            const wWidth = width - thumbnailsWidth - 5 * spacing;
            const wHeight = Math.min(wWidth / (width / height), height - 1.7 * padding);
            workspaceBox.set_origin(wsbX, (height - wHeight) / 2);
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
        const padding =
            Math.round((1 - WorkspacesView.SECONDARY_WORKSPACE_SCALE) * height / 2);

        const thumbnailsWidth = this._getThumbnailsWidth(contentBox);
        let [, thumbnailsHeight] = this._thumbnails.get_preferred_height(thumbnailsWidth);

        thumbnailsHeight = Math.min(thumbnailsHeight, height - 2 * spacing);

        if (this._thumbnails.visible) {
            // 2 - default, 0 - left, 1 - right
            const wsThumbnailsPosition = gOptions.get('secondaryWsThumbnailsPosition') === 2
                                            ? gOptions.get('workspaceThumbnailsPosition')
                                            : gOptions.get('secondaryWsThumbnailsPosition');
            let wstX;
            if (wsThumbnailsPosition) {
                wstX = width - spacing - thumbnailsWidth;
                this._thumbnails._positionLeft = false;
            } else {
                wstX = spacing;
                this._thumbnails._positionLeft = true;
            }

            const childBox = new Clutter.ActorBox();
            childBox.set_origin(wstX, Math.min(padding, (height - thumbnailsHeight) / 2));
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
    }
}

//------workspaceThumbnail------------------------------------------------------------------------
Background.FADE_ANIMATION_TIME = 0;
// WorkspaceThumbnail
var WorkspaceThumbnailOverride = {
    after__init: function () {
        this._bgManager = new Background.BackgroundManager({
            monitorIndex: this.monitorIndex,
            container: this._viewport,
            vignette: false,
            controlPosition: false,
        });
        this.set_style('border-radius: 8px;');
        //this._bgManager.backgroundActor.opacity = 100;
        this._viewport.set_child_below_sibling(this._bgManager.backgroundActor, null);
        this.connect('destroy', function () {
            this._bgManager.destroy();
            this._bgManager = null;
        }.bind(this));
    }
}

// ThumbnailsBox
var ThumbnailsBoxOverride = {
    _activateThumbnailAtPoint: function(stageX, stageY, time) {
        const [r_, x, y] = this.transform_stage_point(stageX, stageY);

        const thumbnail = this._thumbnails.find(t => y >= t.y && y <= t.y + t.height);
        if (thumbnail)
            thumbnail.activate(time);
    },

    _getPlaceholderTarget: function(index, spacing, rtl) {
        const workspace = this._thumbnails[index];

        let targetY1;
        let targetY2;

        if (rtl) {
            const baseY = workspace.y + workspace.height;
            targetY1 = baseX - WORKSPACE_CUT_SIZE;
            targetY2 = baseX + spacing + WORKSPACE_CUT_SIZE;
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

    vfunc_get_preferred_width: function(forHeight) {
        if (forHeight === -1)
            return this.get_preferred_height(forHeight);

        let themeNode = this.get_theme_node();

        forHeight = themeNode.adjust_for_width(forHeight);

        let spacing = themeNode.get_length('spacing');
        let nWorkspaces = this._thumbnails.length;
        let totalSpacing = (nWorkspaces - 1) * spacing;

        const avail = forHeight - totalSpacing;

        let scale = (avail / nWorkspaces) / this._porthole.height;
        scale = Math.min(scale, WorkspaceThumbnail.MAX_THUMBNAIL_SCALE);

        const width = Math.round(this._porthole.width * scale);
        return themeNode.adjust_preferred_height(width, width);
    },

    vfunc_get_preferred_height: function(_forWidth) {
        // Note that for getPreferredHeight/Width we cheat a bit and skip propagating
        // the size request to our children because we know how big they are and know
        // that the actors aren't depending on the virtual functions being called.
        let themeNode = this.get_theme_node();

        let spacing = themeNode.get_length('spacing');
        let nWorkspaces = this._thumbnails.length;
        let totalSpacing = (nWorkspaces - 1) * spacing;

        const naturalheight = this._thumbnails.reduce((accumulator, thumbnail, index) => {
            let workspaceSpacing = 0;

            /*if (index > 0)
                workspaceSpacing += spacing / 2;
            if (index < this._thumbnails.length - 1)
                workspaceSpacing += spacing / 2;*/

            const progress = 1 - thumbnail.collapse_fraction;
            const height = (this._porthole.height * WorkspaceThumbnail.MAX_THUMBNAIL_SCALE + workspaceSpacing) * progress;
            return accumulator + height;
        }, 0);

        return themeNode.adjust_preferred_width(totalSpacing, naturalheight);
    },

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

        // We always request size for MAX_THUMBNAIL_SCALE, distribute
        // space evently if we use smaller thumbnails
        const extraHeight =
            (WorkspaceThumbnail.MAX_THUMBNAIL_SCALE * portholeHeight - thumbnailHeight) * nWorkspaces;
        box.y2 -= Math.round(extraHeight / 2);

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
        if (this._shouldShow === true)
            return;

        this._shouldShow = true;
        this.notify('should-show');
    }
}

//------- overviewControls --------------------------------

// ControlsManager

var ControlsManagerOverride = {
    // this function has duplicate in WorkspaceView so we use one function for both to avoid issues with syncing them
    _getFitModeForState: function(state) {
        return _getFitModeForState(state);
    },

    _getThumbnailsBoxParams: function() {
        const opacity = 255;
        const scale = 1;
        return [ opacity, scale];
    },

    _updateThumbnailsBox: function() {
        const { shouldShow } = this._thumbnailsBox;

        const thumbnailsBoxVisible = shouldShow;
        if (thumbnailsBoxVisible) {
            this._thumbnailsBox.opacity = 255;
            this._thumbnailsBox.visible = thumbnailsBoxVisible;
        }
    },
}

//-------ControlsManagerLayout-----------------------------

var ControlsManagerLayoutOverride = {
    _computeWorkspacesBoxForState: function(state, box, workAreaBox, dashHeight, thumbnailsWidth) {
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
            // this is compensation for a bug relative to DtD bottom non-inteli hide position
            // when workspace box width is caluculated well, but output width is bigger, although if you read the width, you get the originally calculated value
            if (dash._isHorizontal && dash._position === 2) {
                height -= dash.height
            }
        }

        const dashPosition = dash._position;
        const dashVertical = [1, 3].includes(dash._position);
        const dashTop = dash._position === 0 && dash.visible;

        const wsTmbLeft = this._workspacesThumbnails._positionLeft;

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
            dashHeight = dash.visible ? dashHeight : 0;
            wWidth = width
                        - spacing
                        - (dashVertical ? dash.width + spacing : spacing)
                        - (thumbnailsWidth ? thumbnailsWidth + spacing : 0)
                        - 2 * spacing;
            wHeight = height
                        - (dashVertical ? 4 * spacing : (dashHeight ? dashHeight + spacing : 4 * spacing))
                        - 3 * spacing;
            const ratio = width / height;
            let wRatio = wWidth / wHeight;
            let scale = ratio / wRatio;

            if (scale > 1) {
                wHeight = Math.round(wHeight / scale);
                wWidth = Math.round(wHeight * ratio);
            } else {
                wWidth = Math.round(wWidth * scale);
                wHeight = Math.round(wWidth / ratio);
            }

            let xOffset = 0;
            let yOffset = 0;

            yOffset = dashTop ? spacing : (((height - wHeight - (!dashVertical ? dashHeight : 0)) / 3));

            // move the workspace box to the middle of the screen, if possible
            const centeredBoxX = (width - wWidth) / 2;
            xOffset = Math.min(centeredBoxX, width - wWidth - thumbnailsWidth - 2 * spacing);

            this._xAlignCenter = false;
            if (xOffset !== centeredBoxX) { // in this case xOffset holds max possible wsBoxX coordinance
                xOffset = (dashPosition === 3 ? dash.width + spacing : 0) + (thumbnailsWidth && wsTmbLeft ? thumbnailsWidth + spacing : 0)
                        + (width - wWidth - 2 * spacing - thumbnailsWidth - ((dashVertical && dash.visible) ? dash.width + spacing : 0)) / 2;
            } else {
                this._xAlignCenter = true;
            }

            const wsBoxX = Math.round(xOffset);
            wsBoxY = Math.round(startY + yOffset + ((dashHeight && dashTop) ? dashHeight : spacing)/* + (searchHeight ? searchHeight + spacing : 0)*/);

            workspaceBox.set_origin(Math.round(wsBoxX), Math.round(wsBoxY));
            workspaceBox.set_size(wWidth, wHeight);

            break;
        }

        return workspaceBox;
    },

    _getAppDisplayBoxForState: function(state, box, workAreaBox, /*searchHeight, dashHeight,*/ appGridBox, thumbnailsWidth) {
        const [width] = box.get_size();
        const { x1: startX } = workAreaBox;
        const { y1: boxY } = appGridBox;
        const boxHeight = appGridBox.get_height();
        const appDisplayBox = new Clutter.ActorBox();
        const { spacing } = this;


        const wsTmbLeft = this._workspacesThumbnails._positionLeft;
        const dash = Main.overview.dash;
        const dashPosition = dash._position;
        const centerAppGrid = gOptions.get('centerAppGrid');

        const appDisplayX = centerAppGrid ? spacing + thumbnailsWidth : (dashPosition === 3 ? dash.width + spacing : 0) + (wsTmbLeft ? thumbnailsWidth : 0) + spacing;

        const adWidth = centerAppGrid ? width - 2 * (thumbnailsWidth + spacing) : width - thumbnailsWidth - spacing;
        switch (state) {
        case ControlsState.HIDDEN:
        case ControlsState.WINDOW_PICKER:
            appDisplayBox.set_origin(startX + width, boxY);
            break;
        case ControlsState.APP_GRID:
            appDisplayBox.set_origin(appDisplayX, boxY);
            break;
        }

        appDisplayBox.set_size(adWidth, boxHeight);
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
        const [width, height] = box.get_size();
        let availableHeight = height;

        // Dash
        const maxDashHeight = Math.round(box.get_height() * DASH_MAX_HEIGHT_RATIO);
        let dashHeight;
        let dashWidth;

        this._dash.setMaxSize(width, maxDashHeight);
        [, dashHeight] = this._dash.get_preferred_height(width);
        [, dashWidth] = this._dash.get_preferred_width(dashHeight);
        dashHeight = Math.min(dashHeight, maxDashHeight);
        dashWidth = Math.min(dashWidth, width - 2 * spacing);

        let dashPosition = gOptions.get('dashPosition');
        const DASH_CENTERED = (dashPosition === DashPosition.TOP_CENTER) || (dashPosition === DashPosition.BOTTOM_CENTER);
        const DASH_CENTERED_WS = DASH_CENTERED && gOptions.get('centerDashToWs');
        const DASH_LEFT = dashPosition === DashPosition.TOP_LEFT || dashPosition === DashPosition.BOTTOM_LEFT;
        // convert position of the dock to Ubuntu Dock / Dash to Dock language
        dashPosition = dashPosition < DashPosition.BOTTOM_LEFT ? 0 : 2; // 0 - top, 2 - bottom
        let DASH_TOP = dashPosition === 0;
        this._dash._position = dashPosition;

        let dashX, dashY;
        if (DASH_CENTERED) {
            dashX = 0;//Math.max(spacing, (width - dashWidth) / 2);
            if (!DASH_CENTERED_WS) {
                dashWidth = width;
            }
        } else if (DASH_LEFT) {
            dashX = spacing;
        } else {
            dashX = width - spacing - dashWidth;
        }

        if (DASH_TOP) {
            dashY = startY;
        } else {
            dashY = startY + height - dashHeight;
        }

        /*childBox.set_origin(dashX, dashY);
        childBox.set_size(dashWidth, dashHeight);

        this._dash.allocate(childBox);*/
        // dash cloud be other than the default, could be Dash to Dock
        // Dash to Dock has property _isHorizontal
        const dash = Main.overview.dash;
        let externalDock = dash._isHorizontal !== undefined;

        if (externalDock) {
            dashHeight = dash.height;
            dashWidth = dash.width;
            dashPosition = dash._position;
            DASH_TOP = dash._position === 0;
        }
        const dashVertical = [1, 3].includes(dashPosition);

        dashHeight = dash.visible ? dashHeight : 0;
        dashWidth = dash.visible ? dashWidth : 0;

        availableHeight -= dashVertical ? 0 : dashHeight + spacing;

        // Workspace Thumbnails
        let thumbnailsWidth = 0;
        let thumbnailsHeight = 0;

        const { expandFraction } = this._workspacesThumbnails;
        thumbnailsHeight = height - 2 * spacing - (dashVertical ? 0 : dashHeight + spacing);

        thumbnailsWidth = this._workspacesThumbnails.get_preferred_width(thumbnailsHeight)[0];
        thumbnailsWidth = Math.round(Math.min(
            thumbnailsWidth * expandFraction,
            width * WorkspaceThumbnail.MAX_THUMBNAIL_SCALE));

        thumbnailsHeight = this._workspacesThumbnails.get_preferred_height(thumbnailsWidth)[1];
        let wstX;
        // 0 - left, 1 - right
        const wsThumbnailsPosition = gOptions.get('workspaceThumbnailsPosition');
        if (wsThumbnailsPosition) {
            wstX = width - (dashPosition === 1 ? dashWidth : 0) - spacing - thumbnailsWidth;
            this._workspacesThumbnails._positionLeft = false;
        } else {
            wstX = startX + (dashPosition === 3 ? dashWidth : 0) + spacing;
            this._workspacesThumbnails._positionLeft = true;
        }

        let wstYOffset = ((dashHeight && DASH_TOP && !dashVertical) ? dashHeight + spacing : (3 * spacing));
        if (gOptions.get('centerWsSwitcher')) {
            wstYOffset += Math.max(0, (height - 5*spacing - thumbnailsHeight - (dashVertical ? 0 : dashHeight)) / 2);
        }

        childBox.set_origin(wstX, startY + wstYOffset);

        childBox.set_size(thumbnailsWidth, thumbnailsHeight);
        this._workspacesThumbnails.allocate(childBox);

        // Dash center to ws
        if (DASH_CENTERED_WS) {
            const wWidth = width - spacing - thumbnailsWidth - spacing - (dashVertical ? dashWidth + spacing : 0);
            const offSet = Math.floor((wWidth - dashWidth) / 2);
            if (offSet < 0) {
                dashWidth = width;
                dashX = 0;
            } else {
                dashX = (wsThumbnailsPosition ? 0 : thumbnailsWidth + spacing) + offSet;
            }
        }

        childBox.set_origin(dashX, dashY);
        childBox.set_size(dashWidth, dashHeight);

        this._dash.allocate(childBox);

        // Workspaces
        let params = [box, workAreaBox, dashHeight, thumbnailsWidth];
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
        const searchXoffset = spacing + (wsThumbnailsPosition ? 0 : thumbnailsWidth + spacing);
        let [searchHeight] = this._searchEntry.get_preferred_height(width - thumbnailsWidth - dashVertical ? dashWidth : 0);

        // Y possition under top Dash
        let searchEntryX, searchEntryY;
        if (DASH_TOP) {
            searchEntryY = startY + (dashVertical ? spacing : dashHeight - spacing);
        } else {
            searchEntryY = startY + spacing;
        }

        searchEntryX = startX + searchXoffset;
        const searchEntryWidth = this._xAlignCenter ? width : width - 2 * spacing - thumbnailsWidth; // xAlignCenter is given by wsBox

        let centerSearchView = gOptions.get('centerSearch');
        if (centerSearchView) {
            childBox.set_origin(0, searchEntryY);
            childBox.set_size(width, searchHeight);
        } else {
            childBox.set_origin(this._xAlignCenter ? 0 : searchEntryX, searchEntryY);
            childBox.set_size(this._xAlignCenter ? width : searchEntryWidth, searchHeight);
        }

        this._searchEntry.allocate(childBox);

        availableHeight -= searchHeight + spacing;

        // AppDisplay - state, box, workAreaBox, searchHeight, dashHeight, appGridBox, thumbnailsWidth
        if (this._appDisplay.visible) {
            const workspaceAppGridBox =
                this._cachedWorkspaceBoxes.get(ControlsState.APP_GRID);

            params = [box, workAreaBox, /*searchHeight, dashHeight,*/ workspaceAppGridBox, thumbnailsWidth];
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
        }

        // Search
        let searchWidth = width;
        if (centerSearchView) {
            childBox.set_origin(0, startY + (DASH_TOP ? dashHeight + spacing : spacing) + searchHeight + spacing);
        } else {
            childBox.set_origin(this._xAlignCenter ? 0 : searchXoffset, startY + (DASH_TOP ? dashHeight + spacing : spacing) + searchHeight + spacing);
            searchWidth = this._xAlignCenter ? width : width - 2 * spacing - thumbnailsWidth;
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

var DashItemContainerOverride = {
    // move labels under the icons
    showLabel() {
        if (!this._labelText)
            return;

        this.label.set_text(this._labelText);
        this.label.opacity = 0;
        this.label.show();

        let [stageX, stageY] = this.get_transformed_position();

        const itemWidth = this.allocation.get_width();
        const itemHeight = this.allocation.get_height();

        const labelWidth = this.label.get_width();
        const labelHeight = this.label.get_height();
        const xOffset = Math.floor((itemWidth - labelWidth) / 2);
        const x = Math.clamp(stageX + xOffset, 0, global.stage.width - labelWidth);

        let node = this.label.get_theme_node();
        let yOffset, y;

        const positionBottom = Main.overview.dash._position === 0;

        if (positionBottom) {
            yOffset = itemHeight - labelHeight + 3 * node.get_length('-y-offset');
            y = stageY + yOffset;
        } else {
            yOffset = node.get_length('-y-offset');
            y = stageY - this.label.height - yOffset;
        }

        this.label.set_position(x, y);
        this.label.ease({
            opacity: 255,
            duration: DASH_ITEM_LABEL_SHOW_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }
}

//------ appDisplay --------------------------------------------------------------------------------

// Appdisplay
var AppDisplayOverride  = {
    // this fixes dnd from appDisplay to workspace switcher if appDisplay is on page 1. weird bug, weird solution..
    _pageForCoords: function(x, y) {
        if (this._dragMonitor != null)
            return AppDisplay.SidePages.NONE;

        const rtl = this.get_text_direction() === Clutter.TextDirection.RTL;
        const { allocation } = this._grid;

        const [success, pointerX] = this._scrollView.transform_stage_point(x, y);
        if (!success)
            return AppDisplay.SidePages.NONE;

        if (pointerX < allocation.x1)
            return rtl ? AppDisplay.SidePages.NEXT : AppDisplay.SidePages.PREVIOUS;
        else if (pointerX > allocation.x2)
            return rtl ? AppDisplay.SidePages.PREVIOUS : AppDisplay.SidePages.NEXT;

        return AppDisplay.SidePages.NONE;
    }
}

// --------------------------------------------------------------------------------------------------------------------
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

function _updateWorkspacesDisplay() {
    const { initialState, finalState, progress } = this._stateAdjustment.getStateTransitionParams();
    const { searchActive } = this._searchController;

    const paramsForState = s => {
        let opacity;
        let scale;
        switch (s) {
        case ControlsState.HIDDEN:
        case ControlsState.WINDOW_PICKER:
            opacity = 255;
            scale = 1;
            break;
        case ControlsState.APP_GRID:
            opacity = 0;
            scale = 0;
            break;
        default:
            opacity = 255;
            scale = 1;
            break;
        }
        return { opacity, scale };
    };

    let initialParams = paramsForState(initialState);
    let finalParams = paramsForState(finalState);

    let opacity = Math.round(Util.lerp(initialParams.opacity, finalParams.opacity, progress));
    let scale = Util.lerp(initialParams.scale, finalParams.scale, progress);

    let workspacesDisplayVisible = (opacity != 0) && !(searchActive);
    let params = {
        opacity: opacity,
        scale_x: scale,
        duration: 0,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        onComplete: () => {
            // workspacesDisplay needs to go off screen, otherwise it blocks DND operations within the App Display
            // but the 'visibile' property ruins transition animation and breakes workspace control
            // scale_y = 0 works like visibile = false but without collateral damage
            this._workspacesDisplay.scale_y = (progress == 1 && finalState == ControlsState.APP_GRID) ? 0 : 1;
            this._workspacesDisplay.reactive = workspacesDisplayVisible;
            this._workspacesDisplay.setPrimaryWorkspaceVisible(workspacesDisplayVisible);
        }
    }

    // scale workspaces back to normal size before transition from AppGrid view
    if (progress < 1 && !this._workspacesDisplay.scale_y) {
        this._workspacesDisplay.scale_y = 1;
    }

    this._workspacesDisplay.ease(params);
}
