/**
 * V-Shell (Vertical Workspaces)
 * workspacesView.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2023
 * @license    GPL-3.0
 *
 */

'use strict';

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import Meta from 'gi://Meta';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Overview from 'resource:///org/gnome/shell/ui/overview.js';
import * as OverviewControls from 'resource:///org/gnome/shell/ui/overviewControls.js';
import * as WorkspacesView from 'resource:///org/gnome/shell/ui/workspacesView.js';

import * as Util from 'resource:///org/gnome/shell/misc/util.js';

let Me;

let opt;

let ControlsState;
let FitMode;

export const WorkspacesViewModule = class {
    constructor(me) {
        Me = me;

        ControlsState = OverviewControls.ControlsState;
        FitMode = WorkspacesView.FitMode;

        opt = Me.opt;

        this._firstActivation = true;
        this.moduleEnabled = false;
        this._overrides = null;
    }

    cleanGlobals() {
        Me = null;
        opt = null;
    }

    update(reset) {
        this.moduleEnabled = true;
        const conflict = false;

        reset = reset || !this.moduleEnabled || conflict;

        // don't touch the original code if module disabled
        if (reset && !this._firstActivation) {
            this._disableModule();
        } else if (!reset) {
            this._firstActivation = false;
            this._activateModule();
        }
    }

    _activateModule() {
        if (!this._overrides)
            this._overrides = new Me.Util.Overrides();

        const desktopCubeEnabled = Me.Util.getEnabledExtensions('desktop-cube@schneegans.github.com').length;
        const desktopCubeConflict = desktopCubeEnabled && !opt.ORIENTATION && !opt.OVERVIEW_MODE;

        if (!desktopCubeConflict)
            this._overrides.addOverride('WorkspacesView', WorkspacesView.WorkspacesView.prototype, WorkspacesViewCommon);

        this._overrides.addOverride('WorkspacesDisplay', WorkspacesView.WorkspacesDisplay.prototype, WorkspacesDisplayCommon);
        this._overrides.addOverride('ExtraWorkspaceView', WorkspacesView.ExtraWorkspaceView.prototype, ExtraWorkspaceViewCommon);
        this._overrides.addOverride('SecondaryMonitorDisplayCommon', WorkspacesView.SecondaryMonitorDisplay.prototype, SecondaryMonitorDisplayCommon);

        if (opt.ORIENTATION) {
            // switch internal workspace orientation in GS
            global.workspace_manager.override_workspace_layout(Meta.DisplayCorner.TOPLEFT, false, -1, 1);
            this._overrides.addOverride('SecondaryMonitorDisplay', WorkspacesView.SecondaryMonitorDisplay.prototype, SecondaryMonitorDisplayVertical);
        } else {
            global.workspace_manager.override_workspace_layout(Meta.DisplayCorner.TOPLEFT, false, 1, -1);
            this._overrides.addOverride('SecondaryMonitorDisplay', WorkspacesView.SecondaryMonitorDisplay.prototype, SecondaryMonitorDisplayHorizontal);
        }
    }

    _disableModule() {
        global.workspace_manager.override_workspace_layout(Meta.DisplayCorner.TOPLEFT, false, 1, -1);
        if (this._overrides)
            this._overrides.removeAll();
        this._overrides = null;

    }
};

const WorkspacesViewCommon = {
    _getFirstFitSingleWorkspaceBox(box, spacing, vertical) {
        let [width, height] = box.get_size();
        const [workspace] = this._workspaces;

        const rtl = this.text_direction === Clutter.TextDirection.RTL;
        const adj = this._scrollAdjustment;
        const currentWorkspace = vertical || !rtl
            ? adj.value : adj.upper - adj.value - 1;

        // Single fit mode implies centered too
        let [x1, y1] = box.get_origin();
        const [, workspaceWidth] = workspace ? workspace.get_preferred_width(Math.floor(height)) : [0, width];
        const [, workspaceHeight] = workspace ? workspace.get_preferred_height(workspaceWidth) : [0, height];

        if (vertical) {
            x1 += (width - workspaceWidth) / 2;
            y1 -= currentWorkspace * (workspaceHeight + spacing);
        } else {
            x1 += (width - workspaceWidth) / 2;
            x1 -= currentWorkspace * (workspaceWidth + spacing);
        }

        const fitSingleBox = new Clutter.ActorBox({ x1, y1 });

        fitSingleBox.set_size(workspaceWidth, workspaceHeight);

        return fitSingleBox;
    },

    // set spacing between ws previews
    _getSpacing(box, fitMode, vertical) {
        const [width, height] = box.get_size();
        const [workspace] = this._workspaces;

        if (!workspace)
            return 0;

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
            opt.WORKSPACE_MIN_SPACING * scaleFactor,
            opt.WORKSPACE_MAX_SPACING * scaleFactor);
    },

    // this function has duplicate in OverviewControls so we use one function for both to avoid issues with syncing them
    _getFitModeForState(state) {
        return _getFitModeForState(state);
    },

    // normal view 0, spread windows 1
    _getWorkspaceModeForOverviewState(state) {

        switch (state) {
        case ControlsState.HIDDEN:
            return 0;
        case ControlsState.WINDOW_PICKER:
            return opt.WORKSPACE_MODE;
        case ControlsState.APP_GRID:
            return (this._monitorIndex !== global.display.get_primary_monitor() || !opt.WS_ANIMATION) && !opt.OVERVIEW_MODE ? 1 : 0;
        }

        return 0;
    },

    _updateVisibility() {
        // visibility handles _updateWorkspacesState()
    },

    // disable scaling and hide inactive workspaces
    _updateWorkspacesState() {
        const adj = this._scrollAdjustment;
        const fitMode = this._fitModeAdjustment.value;

        let { initialState, finalState, progress, currentState } =
            this._overviewAdjustment.getStateTransitionParams();

        const workspaceMode = (1 - fitMode) * Util.lerp(
            this._getWorkspaceModeForOverviewState(initialState),
            this._getWorkspaceModeForOverviewState(finalState),
            progress);

        const primaryMonitor = Main.layoutManager.primaryMonitor.index;

        const wsScrollProgress = adj.value % 1;
        const secondaryMonitor = this._monitorIndex !== global.display.get_primary_monitor();
        const blockSecondaryAppGrid = opt.OVERVIEW_MODE && currentState > 1;

        // Hide inactive workspaces
        this._workspaces.forEach((w, index) => {
            if (!(blockSecondaryAppGrid && secondaryMonitor))
                w.stateAdjustment.value = workspaceMode;

            let distance = adj.value - index;
            const distanceToCurrentWorkspace = Math.abs(distance);

            const scaleProgress = 1 - Math.clamp(distanceToCurrentWorkspace, 0, 1);
            // const scale = Util.lerp(0.94, 1, scaleProgress);
            // w.set_scale(scale, scale);

            // if we disable workspaces that we can't or don't need to see, transition animations will be noticeably smoother
            // only the current ws needs to be visible during overview transition animations
            //                        and only current and adjacent ws when switching ws
            w.visible = (this._animating && wsScrollProgress && distanceToCurrentWorkspace <= (opt.NUMBER_OF_VISIBLE_NEIGHBORS + 1)) || scaleProgress === 1 ||
                    (opt.WORKSPACE_MAX_SPACING > 340 && distanceToCurrentWorkspace <= opt.NUMBER_OF_VISIBLE_NEIGHBORS && currentState === ControlsState.WINDOW_PICKER) ||
                    (this._monitorIndex !== primaryMonitor && distanceToCurrentWorkspace <= opt.NUMBER_OF_VISIBLE_NEIGHBORS) || (!opt.WS_ANIMATION && distanceToCurrentWorkspace < opt.NUMBER_OF_VISIBLE_NEIGHBORS) ||
                    (opt.WORKSPACE_MAX_SPACING < 340 && distanceToCurrentWorkspace <= opt.NUMBER_OF_VISIBLE_NEIGHBORS && currentState <= ControlsState.WINDOW_PICKER &&
                        ((initialState < ControlsState.APP_GRID && finalState < ControlsState.APP_GRID))
                    );

            // after transition from APP_GRID to WINDOW_PICKER state,
            // adjacent workspaces are hidden and we need them to show up
            // make them visible during animation can impact smoothness of the animation
            // so we show them after the animation finished, move them to their position from outside of the monitor
            if (!w.visible && distanceToCurrentWorkspace === 1 && initialState === ControlsState.APP_GRID && currentState === ControlsState.WINDOW_PICKER) {
                w.visible = true;
                const directionNext = distance > 0;
                if (!opt.ORIENTATION) {
                    const width = w.width * 0.6 * opt.WS_PREVIEW_SCALE;
                    w.translation_x = directionNext ? -width : width;
                }
                if (opt.ORIENTATION) {
                    const height = w.height * 0.6 * opt.WS_PREVIEW_SCALE;
                    w.translation_y = directionNext ? -height : height;
                }

                w.opacity = 10;
                w.get_parent().set_child_below_sibling(w, null);
                w.ease({
                    duration: 300,
                    translation_x: 0,
                    translation_y: 0,
                    opacity: 255,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
            }

            // force ws preview bg corner radiuses where GS doesn't do it
            if (opt.SHOW_WS_PREVIEW_BG && opt.OVERVIEW_MODE === 1 && distanceToCurrentWorkspace < 2)
                w._background._updateBorderRadius(Math.min(1, w._overviewAdjustment.value));


            // hide workspace background
            if (!opt.SHOW_WS_PREVIEW_BG && w._background.opacity)
                w._background.opacity = 0;
        });
    },

    exposeWindows(workspaceIndex = null, callback) {
        let adjustments = [];
        if (workspaceIndex === null) {
            this._workspaces.forEach(ws => {
                adjustments.push(ws._background._stateAdjustment);
            });
        } else {
            adjustments.push(this._workspaces[workspaceIndex]._background._stateAdjustment);
        }

        adjustments.forEach(adj => {
            if (adj.value === 0) {
                adj.value = 0;
                adj.ease(1, {
                    duration: 200,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    onComplete: () => {
                        opt.WORKSPACE_MODE = 1;
                        if (callback)
                            callback();
                    },
                });
            }
        });
    },
};

const SecondaryMonitorDisplayCommon = {
    exposeWindows(...args) {
        this._workspacesView.exposeWindows(...args);
    },
};

const SecondaryMonitorDisplayVertical = {
    _getThumbnailParamsForState(state) {

        let opacity, scale, translationX;
        switch (state) {
        case ControlsState.HIDDEN:
            opacity = 255;
            scale = 1;
            translationX = 0;
            if (!Main.layoutManager._startingUp && (!opt.SHOW_WS_PREVIEW_BG || opt.OVERVIEW_MODE2))
                translationX = this._thumbnails.width * (opt.SEC_WS_TMB_LEFT ? -1 : 1);

            break;
        case ControlsState.WINDOW_PICKER:
        case ControlsState.APP_GRID:
            opacity = 255;
            scale = 1;
            translationX = 0;
            break;
        default:
            opacity = 255;
            scale = 1;
            translationX = 0;
            break;
        }

        return { opacity, scale, translationX };
    },

    _getThumbnailsWidth(box, spacing) {
        if (opt.SEC_WS_TMB_HIDDEN)
            return 0;

        const [width, height] = box.get_size();
        const { expandFraction } = this._thumbnails;
        const [, thumbnailsWidth] = this._thumbnails.get_preferred_width(height - 2 * spacing);
        let scaledWidth;
        if (opt.SEC_WS_PREVIEW_SHIFT && !opt.PANEL_DISABLED)
            scaledWidth = ((height - Main.panel.height) * opt.SEC_MAX_THUMBNAIL_SCALE) * (width / height);
        else
            scaledWidth = width * opt.SEC_MAX_THUMBNAIL_SCALE;

        return Math.min(
            thumbnailsWidth * expandFraction,
            Math.round(scaledWidth));
    },

    _getWorkspacesBoxForState(state, box, padding, thumbnailsWidth, spacing) {
        // const { ControlsState } = OverviewControls;
        const workspaceBox = box.copy();
        const [width, height] = workspaceBox.get_size();

        let wWidth, wHeight, wsbX, wsbY, offset, yShift;
        switch (state) {
        case ControlsState.HIDDEN:
            break;
        case ControlsState.WINDOW_PICKER:
        case ControlsState.APP_GRID:
            if (opt.OVERVIEW_MODE2 && !opt.WORKSPACE_MODE)
                break;

            yShift = 0;
            if (opt.SEC_WS_PREVIEW_SHIFT && !opt.PANEL_DISABLED) {
                if (opt.PANEL_POSITION_TOP)
                    yShift = Main.panel.height;
                else
                    yShift = -Main.panel.height;
            }

            wWidth = width - thumbnailsWidth - 5 * spacing;
            wHeight = Math.min(wWidth / (width / height) - Math.abs(yShift), height - 4 * spacing);
            wWidth = Math.round(wWidth * opt.SEC_WS_PREVIEW_SCALE);
            wHeight = Math.round(wHeight * opt.SEC_WS_PREVIEW_SCALE);

            offset = Math.round(width - thumbnailsWidth - wWidth) / 2;
            if (opt.SEC_WS_TMB_LEFT)
                wsbX = thumbnailsWidth + offset;
            else
                wsbX = offset;

            wsbY = Math.round((height - wHeight - Math.abs(yShift)) / 2 + yShift);

            workspaceBox.set_origin(wsbX, wsbY);
            workspaceBox.set_size(wWidth, wHeight);
            break;
        }

        return workspaceBox;
    },

    vfunc_allocate(box) {
        this.set_allocation(box);

        const themeNode = this.get_theme_node();
        const contentBox = themeNode.get_content_box(box);
        const [width, height] = contentBox.get_size();
        const { expandFraction } = this._thumbnails;
        const spacing = themeNode.get_length('spacing') * expandFraction;
        const padding = Math.round(0.1 * height);

        let thumbnailsWidth = 0;
        let thumbnailsHeight = 0;
        this._thumbnails.visible = !opt.SEC_WS_TMB_HIDDEN;
        if (this._thumbnails.visible) {
            const reduceBoxHeight = opt.SEC_WS_PREVIEW_SHIFT && Main.panel.visible ? Main.panel.height : 0;

            thumbnailsWidth = width * opt.SEC_MAX_THUMBNAIL_SCALE;

            let totalTmbSpacing;
            [totalTmbSpacing, thumbnailsHeight] = this._thumbnails.get_preferred_height(thumbnailsWidth);
            thumbnailsHeight = Math.round(thumbnailsHeight + totalTmbSpacing);

            const thumbnailsHeightMax = height - spacing - reduceBoxHeight;

            if (thumbnailsHeight > thumbnailsHeightMax) {
                thumbnailsHeight = thumbnailsHeightMax;
                thumbnailsWidth = Math.round(this._thumbnails.get_preferred_width(thumbnailsHeight)[1]);
            }

            let wsTmbX;
            if (opt.SEC_WS_TMB_LEFT) { // left
                wsTmbX = spacing / 2;
                this._thumbnails._positionLeft = true;
            } else {
                wsTmbX = width - spacing / 2 - thumbnailsWidth;
                this._thumbnails._positionLeft = false;
            }

            const childBox = new Clutter.ActorBox();
            const availSpace = height - thumbnailsHeight;

            let wsTmbY =  availSpace / 2;
            wsTmbY -= opt.SEC_WS_TMB_POSITION_ADJUSTMENT * wsTmbY;
            wsTmbY += opt.SEC_WS_PREVIEW_SHIFT && Main.panel.visible ? Main.panel.height : 0;

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

    _updateThumbnailVisibility() {
        if (opt.OVERVIEW_MODE2)
            this.set_child_above_sibling(this._thumbnails, null);


        const visible = !opt.SEC_WS_TMB_HIDDEN;

        if (this._thumbnails.visible === visible)
            return;

        this._thumbnails.show();
        this._updateThumbnailParams();
        this._thumbnails.ease_property('expand-fraction', visible ? 1 : 0, {
            duration: Overview.ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this._thumbnails.visible = visible;
                this._thumbnails._indicator.visible = visible;
            },
        });
    },

    _updateThumbnailParams() {
        if (opt.SEC_WS_TMB_HIDDEN)
            return;

        // workaround for upstream bug - secondary thumbnails boxes don't catch 'showing' signal on the shell startup and don't populate the box with thumbnails
        // the tmbBox contents is also destroyed when overview state adjustment gets above 1 when swiping gesture from window picker to app grid
        if (!this._thumbnails._thumbnails.length)
            this._thumbnails._createThumbnails();

        const { initialState, finalState, progress } =
            this._overviewAdjustment.getStateTransitionParams();

        const initialParams = this._getThumbnailParamsForState(initialState);
        const finalParams = this._getThumbnailParamsForState(finalState);

        /* const opacity =
            Util.lerp(initialParams.opacity, finalParams.opacity, progress);
        const scale =
            Util.lerp(initialParams.scale, finalParams.scale, progress);*/

        // OVERVIEW_MODE 2 should animate dash and wsTmbBox only if WORKSPACE_MODE === 0 (windows not spread)
        const animateOverviewMode2 = opt.OVERVIEW_MODE2 && !(finalState === 1 && opt.WORKSPACE_MODE);
        const translationX = !Main.layoutManager._startingUp && ((!opt.SHOW_WS_PREVIEW_BG && !opt.OVERVIEW_MODE2) || animateOverviewMode2)
            ? Util.lerp(initialParams.translationX, finalParams.translationX, progress)
            : 0;

        this._thumbnails.set({
            opacity: 255,
            // scale_x: scale,
            // scale_y: scale,
            translation_x: translationX,
        });
    },

    _updateWorkspacesView() {
        if (this._workspacesView)
            this._workspacesView.destroy();

        if (this._settings.get_boolean('workspaces-only-on-primary')) {
            opt.SEC_WS_TMB_HIDDEN = true;
            this._workspacesView = new WorkspacesView.ExtraWorkspaceView(
                this._monitorIndex,
                this._overviewAdjustment);
        } else {
            opt.SEC_WS_TMB_HIDDEN  = !opt.SHOW_SEC_WS_TMB;
            this._workspacesView = new WorkspacesView.WorkspacesView(
                this._monitorIndex,
                this._controls,
                this._scrollAdjustment,
                // Secondary monitors don't need FitMode.ALL since there is workspace switcher always visible
                // this._fitModeAdjustment,
                new St.Adjustment({
                    actor: this,
                    value: 0, // FitMode.SINGLE,
                    lower: 0, // FitMode.SINGLE,
                    upper: 0, // FitMode.SINGLE,
                }),
                // secondaryOverviewAdjustment);
                this._overviewAdjustment);
        }
        this.add_child(this._workspacesView);
        this._thumbnails.opacity = 0;
    },
};

const SecondaryMonitorDisplayHorizontal = {
    _getThumbnailParamsForState(state) {
        // const { ControlsState } = OverviewControls;

        let opacity, scale, translationY;
        switch (state) {
        case ControlsState.HIDDEN:
            opacity = 255;
            scale = 1;
            translationY = 0;
            if (!Main.layoutManager._startingUp && (!opt.SHOW_WS_PREVIEW_BG || opt.OVERVIEW_MODE2))
                translationY = this._thumbnails.height * (opt.SEC_WS_TMB_TOP ? -1 : 1);

            break;
        case ControlsState.WINDOW_PICKER:
        case ControlsState.APP_GRID:
            opacity = 255;
            scale = 1;
            translationY = 0;
            break;
        default:
            opacity = 255;
            scale = 1;
            translationY = 0;
            break;
        }

        return { opacity, scale, translationY };
    },

    _getWorkspacesBoxForState(state, box, padding, thumbnailsHeight, spacing) {
        // const { ControlsState } = OverviewControls;
        const workspaceBox = box.copy();
        const [width, height] = workspaceBox.get_size();

        let wWidth, wHeight, wsbX, wsbY, offset, yShift;
        switch (state) {
        case ControlsState.HIDDEN:
            break;
        case ControlsState.WINDOW_PICKER:
        case ControlsState.APP_GRID:
            if (opt.OVERVIEW_MODE2 && !opt.WORKSPACE_MODE)
                break;

            yShift = 0;
            if (opt.SEC_WS_PREVIEW_SHIFT && !opt.PANEL_DISABLED) {
                if (opt.PANEL_POSITION_TOP)
                    yShift = Main.panel.height;
                else
                    yShift = -Main.panel.height;
            }

            wHeight = height - Math.abs(yShift) - (thumbnailsHeight ? thumbnailsHeight + 4 * spacing : padding);
            wWidth = Math.min(wHeight * (width / height), width - 5 * spacing);
            wWidth = Math.round(wWidth * opt.SEC_WS_PREVIEW_SCALE);
            wHeight = Math.round(wHeight * opt.SEC_WS_PREVIEW_SCALE);

            offset = Math.round((height - thumbnailsHeight - wHeight - Math.abs(yShift)) / 2);
            if (opt.SEC_WS_TMB_TOP)
                wsbY = thumbnailsHeight + offset;
            else
                wsbY = offset;

            wsbY += yShift;
            wsbX = Math.round((width - wWidth) / 2);

            workspaceBox.set_origin(wsbX, wsbY);
            workspaceBox.set_size(wWidth, wHeight);
            break;
        }

        return workspaceBox;
    },

    vfunc_allocate(box) {
        this.set_allocation(box);

        const themeNode = this.get_theme_node();
        const contentBox = themeNode.get_content_box(box);
        const [width, height] = contentBox.get_size();
        const { expandFraction } = this._thumbnails;
        const spacing = themeNode.get_length('spacing') * expandFraction;
        const padding = Math.round(0.1 * height);

        let thumbnailsWidth = 0;
        let thumbnailsHeight = 0;
        this._thumbnails.visible = !opt.SEC_WS_TMB_HIDDEN;
        if (this._thumbnails.visible) {
            const reservedHeight = opt.SEC_WS_PREVIEW_SHIFT && Main.panel.visible ? Main.panel.height : 0;

            thumbnailsHeight = height * opt.SEC_MAX_THUMBNAIL_SCALE;

            let totalTmbSpacing;
            [totalTmbSpacing, thumbnailsWidth] = this._thumbnails.get_preferred_width(thumbnailsHeight);
            thumbnailsWidth = Math.round(thumbnailsWidth + totalTmbSpacing);

            const thumbnailsWidthMax = width - spacing;

            if (thumbnailsWidth > thumbnailsWidthMax) {
                thumbnailsWidth = thumbnailsWidthMax;
                thumbnailsHeight = Math.round(this._thumbnails.get_preferred_height(thumbnailsWidth)[1]);
            }

            let wsTmbY;
            if (opt.SEC_WS_TMB_TOP)
                wsTmbY = spacing / 2 + reservedHeight;
            else
                wsTmbY = height - spacing / 2 - thumbnailsHeight;

            const childBox = new Clutter.ActorBox();
            const availSpace = width - thumbnailsWidth;

            let wsTmbX = availSpace / 2;
            wsTmbX -= opt.SEC_WS_TMB_POSITION_ADJUSTMENT * wsTmbX;

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

    _updateThumbnailVisibility: SecondaryMonitorDisplayVertical._updateThumbnailVisibility,

    _updateThumbnailParams() {
        if (opt.SEC_WS_TMB_HIDDEN)
            return;

        // workaround for upstream bug - secondary thumbnails boxes don't catch 'showing' signal on the shell startup and don't populate the box with thumbnails
        // the tmbBox contents is also destroyed when overview state adjustment gets above 1 when swiping gesture from window picker to app grid
        if (!this._thumbnails._thumbnails.length)
            this._thumbnails._createThumbnails();


        const { initialState, finalState, progress } =
            this._overviewAdjustment.getStateTransitionParams();

        const initialParams = this._getThumbnailParamsForState(initialState);
        const finalParams = this._getThumbnailParamsForState(finalState);

        /* const opacity =
            Util.lerp(initialParams.opacity, finalParams.opacity, progress);
        const scale =
            Util.lerp(initialParams.scale, finalParams.scale, progress);*/

        // OVERVIEW_MODE 2 should animate dash and wsTmbBox only if WORKSPACE_MODE === 0 (windows not spread)
        const animateOverviewMode2 = opt.OVERVIEW_MODE2 && !(finalState === 1 && opt.WORKSPACE_MODE);
        const translationY = !Main.layoutManager._startingUp && ((!opt.SHOW_WS_PREVIEW_BG && !opt.OVERVIEW_MODE2) || animateOverviewMode2)
            ? Util.lerp(initialParams.translationY, finalParams.translationY, progress)
            : 0;

        this._thumbnails.set({
            opacity: 255,
            // scale_x: scale,
            // scale_y: scale,
            translation_y: translationY,
        });
    },

    _updateWorkspacesView() {
        if (this._workspacesView)
            this._workspacesView.destroy();

        if (this._settings.get_boolean('workspaces-only-on-primary')) {
            opt.SEC_WS_TMB_HIDDEN = true;
            this._workspacesView = new WorkspacesView.ExtraWorkspaceView(
                this._monitorIndex,
                this._overviewAdjustment);
        } else {
            opt.SEC_WS_TMB_HIDDEN  = !opt.SHOW_SEC_WS_TMB;
            this._workspacesView = new WorkspacesView.WorkspacesView(
                this._monitorIndex,
                this._controls,
                this._scrollAdjustment,
                // Secondary monitors don't need FitMode.ALL since there is workspace switcher always visible
                // this._fitModeAdjustment,
                new St.Adjustment({
                    actor: this,
                    value: 0, // FitMode.SINGLE,
                    lower: 0, // FitMode.SINGLE,
                    upper: 0, // FitMode.SINGLE,
                }),
                // secondaryOverviewAdjustment);
                this._overviewAdjustment);
        }
        this.add_child(this._workspacesView);
        this._thumbnails.opacity = 0;
    },
};

const ExtraWorkspaceViewCommon = {
    _updateWorkspaceMode() {
        const overviewState = this._overviewAdjustment.value;

        const progress = Math.clamp(overviewState,
            ControlsState.HIDDEN,
            opt.OVERVIEW_MODE && !opt.WORKSPACE_MODE ? ControlsState.HIDDEN : ControlsState.WINDOW_PICKER);

        this._workspace.stateAdjustment.value = progress;

        // force ws preview bg corner radiuses where GS doesn't do it
        if (opt.SHOW_WS_PREVIEW_BG && opt.OVERVIEW_MODE === 1)
            this._workspace._background._updateBorderRadius(Math.min(1, this._workspace._overviewAdjustment.value));


        // hide workspace background
        if (!opt.SHOW_WS_PREVIEW_BG && this._workspace._background.opacity)
            this._workspace._background.opacity = 0;
    },

    exposeWindows() {
        const adjustment = this._workspace._background._stateAdjustment;
        if (adjustment.value === 0) {
            adjustment.value = 0;
            adjustment.ease(1, {
                duration: 200,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    opt.WORKSPACE_MODE = 1;
                },
            });
        }
    },
};

const WorkspacesDisplayCommon = {
    _updateWorkspacesViews() {
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
                    // this._fitModeAdjustment,
                    new St.Adjustment({
                        actor: this,
                        value: 0, // FitMode.SINGLE,
                        lower: 0, // FitMode.SINGLE,
                        upper: 0, // FitMode.SINGLE,
                    }),
                    this._overviewAdjustment);
                Main.layoutManager.overviewGroup.add_actor(view);
            }

            this._workspacesViews.push(view);
        }
    },

    _onScrollEvent(actor, event) {
        if (this._swipeTracker.canHandleScrollEvent(event))
            return Clutter.EVENT_PROPAGATE;

        if (!this.mapped)
            return Clutter.EVENT_PROPAGATE;

        if (this._workspacesOnlyOnPrimary &&
            this._getMonitorIndexForEvent(event) !== this._primaryIndex)
            return Clutter.EVENT_PROPAGATE;

        if (opt.PANEL_MODE === 1) {
            const panelBox = Main.layoutManager.panelBox;
            const [, y] = global.get_pointer();
            if (y > panelBox.allocation.y1 && y < panelBox.allocation.y2)
                return Clutter.EVENT_STOP;
        }

        if (Me.Util.isShiftPressed()) {
            let direction = Me.Util.getScrollDirection(event);
            if (direction === null || (Date.now() - this._lastScrollTime) < 150)
                return Clutter.EVENT_STOP;
            this._lastScrollTime = Date.now();

            if (direction === Clutter.ScrollDirection.UP)
                direction = -1;

            else if (direction === Clutter.ScrollDirection.DOWN)
                direction = 1;
            else
                direction = 0;


            if (direction) {
                Me.Util.reorderWorkspace(direction);
                // make all workspaces on primary monitor visible for case the new position is hidden
                const primaryMonitorIndex = global.display.get_primary_monitor();
                Main.overview._overview._controls._workspacesDisplay._workspacesViews[primaryMonitorIndex]._workspaces.forEach(w => {
                    w.visible = true;
                });
                return Clutter.EVENT_STOP;
            }
        }

        return Main.wm.handleWorkspaceScroll(event);
    },

    _onKeyPressEvent(actor, event) {
        const symbol = event.get_key_symbol();
        /* const { ControlsState } = OverviewControls;
        if (this._overviewAdjustment.value !== ControlsState.WINDOW_PICKER && symbol !== Clutter.KEY_space)
            return Clutter.EVENT_PROPAGATE;*/

        /* if (!this.reactive)
            return Clutter.EVENT_PROPAGATE; */
        const { workspaceManager } = global;
        const vertical = workspaceManager.layout_rows === -1;
        const rtl = this.get_text_direction() === Clutter.TextDirection.RTL;
        const state = this._overviewAdjustment.value;

        let which;
        switch (symbol) {
        case Clutter.KEY_Return:
        case Clutter.KEY_KP_Enter:
            if (Me.Util.isCtrlPressed()) {
                Main.ctrlAltTabManager._items.forEach(i => {
                    if (i.sortGroup === 1 && i.name === 'Dash')
                        Main.ctrlAltTabManager.focusGroup(i);
                });
            }
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Page_Up:
            if (vertical)
                which = Meta.MotionDirection.UP;
            else if (rtl)
                which = Meta.MotionDirection.RIGHT;
            else
                which = Meta.MotionDirection.LEFT;
            break;
        case Clutter.KEY_Page_Down:
            if (vertical)
                which = Meta.MotionDirection.DOWN;
            else if (rtl)
                which = Meta.MotionDirection.LEFT;
            else
                which = Meta.MotionDirection.RIGHT;
            break;
        case Clutter.KEY_Home:
            which = 0;
            break;
        case Clutter.KEY_End:
            which = workspaceManager.n_workspaces - 1;
            break;
        case Clutter.KEY_space:
            if (Me.Util.isCtrlPressed() && Me.Util.isShiftPressed()) {
                Me.Util.openPreferences();
            } else if (Me.Util.isAltPressed()) {
                Main.ctrlAltTabManager._items.forEach(i => {
                    if (i.sortGroup === 1 && i.name === 'Dash')
                        Main.ctrlAltTabManager.focusGroup(i);
                });
            } else if (opt.get('recentFilesSearchProviderModule') && Me.Util.isCtrlPressed()) {
                Me.Util.activateSearchProvider(Me.RFSP_PREFIX);
            } else if (opt.get('windowSearchProviderModule')) {
                Me.Util.activateSearchProvider(Me.WSP_PREFIX);
            }

            return Clutter.EVENT_STOP;
        case Clutter.KEY_Down:
        case Clutter.KEY_Left:
        case Clutter.KEY_Right:
        case Clutter.KEY_Up:
        case Clutter.KEY_Tab:
            if (Main.overview._overview._controls._searchController.searchActive) {
                Main.overview.searchEntry.grab_key_focus();
            } else if (opt.OVERVIEW_MODE2 && !opt.WORKSPACE_MODE && state === 1) {
                // expose windows by "clicking" on ws thumbnail
                // in this case overview stateAdjustment will be used for transition
                Main.overview._overview.controls._thumbnailsBox._activateThumbnailAtPoint(0, 0, global.get_current_time(), true);
                Main.ctrlAltTabManager._items.forEach(i => {
                    if (i.sortGroup === 1 && i.name === 'Windows')
                        Main.ctrlAltTabManager.focusGroup(i);
                });
            } else if (opt.OVERVIEW_MODE && !opt.WORKSPACE_MODE && state === 1) {
                // expose windows for OVERVIEW_MODE 1
                const wsIndex = global.workspace_manager.get_active_workspace().index();
                // after expose animation activate keyboard for window selection
                const callback = Me.Util.activateKeyboardForWorkspaceView;
                this._workspacesViews.forEach(
                    view => {
                        view.exposeWindows(wsIndex, callback);
                    }
                );
            } else {
                if (state === 2)
                    return Clutter.EVENT_PROPAGATE;
                Me.Util.activateKeyboardForWorkspaceView();
            }

            return Clutter.EVENT_STOP;
        default:
            return Clutter.EVENT_PROPAGATE;
        }

        if (state === 2)
            return Clutter.EVENT_PROPAGATE;

        let ws;
        if (which < 0)
            // Negative workspace numbers are directions
            ws = workspaceManager.get_active_workspace().get_neighbor(which);
        else
            // Otherwise it is a workspace index
            ws = workspaceManager.get_workspace_by_index(which);

        if (Me.Util.isShiftPressed()) {
            let direction;
            if (which === Meta.MotionDirection.UP || which === Meta.MotionDirection.LEFT)
                direction = -1;
            else if (which === Meta.MotionDirection.DOWN || which === Meta.MotionDirection.RIGHT)
                direction = 1;
            if (direction)
                Me.Util.reorderWorkspace(direction);
                // make all workspaces on primary monitor visible for case the new position is hidden
            Main.overview._overview._controls._workspacesDisplay._workspacesViews[0]._workspaces.forEach(w => {
                w.visible = true;
            });
            return Clutter.EVENT_STOP;
        }

        if (ws)
            Main.wm.actionMoveWorkspace(ws);

        return Clutter.EVENT_STOP;
    },
};

// same copy of this function should be available in OverviewControls and WorkspacesView
function _getFitModeForState(state) {
    switch (state) {
    case ControlsState.HIDDEN:
    case ControlsState.WINDOW_PICKER:
        return FitMode.SINGLE;
    case ControlsState.APP_GRID:
        if (opt.WS_ANIMATION && opt.SHOW_WS_TMB)
            return FitMode.ALL;
        else
            return FitMode.SINGLE;
    default:
        return FitMode.SINGLE;
    }
}
