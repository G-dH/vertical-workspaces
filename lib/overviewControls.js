/**
 * V-Shell (Vertical Workspaces)
 * overviewControls.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2025
 * @license    GPL-3.0
 *
 */

'use strict';

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as OverviewControls from 'resource:///org/gnome/shell/ui/overviewControls.js';
import * as WorkspacesView from 'resource:///org/gnome/shell/ui/workspacesView.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';

let Me;
let opt;

const ControlsState = OverviewControls.ControlsState;
const FitMode = WorkspacesView.FitMode;

const STARTUP_ANIMATION_TIME = 500;
const SIDE_CONTROLS_ANIMATION_TIME = 250; // OverviewControls.SIDE_CONTROLS_ANIMATION_TIME = Overview.ANIMATION_TIME = 250
const DASH_MAX_SIZE_RATIO = 0.35;

let _timeouts;

export const OverviewControlsModule = class {
    constructor(me) {
        Me = me;
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
        this._removeTimeouts();
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
        if (reset && this._firstActivation)
            console.debug('  OverviewControlsModule - Keeping untouched');
    }

    _activateModule() {
        const controlsManager = Main.overview._overview.controls;

        if (!this._overrides)
            this._overrides = new  Me.Util.Overrides();

        _timeouts = {};

        this._replaceOnSearchChanged();

        this._overrides.addOverride('ControlsManager', OverviewControls.ControlsManager.prototype, ControlsManagerCommon);
        this._overrides.addOverride('ControlsManagerLayoutCommon', controlsManager.layoutManager, ControlsManagerLayoutCommon);
        if (opt.ORIENTATION === Clutter.Orientation.VERTICAL)
            this._overrides.addOverride('ControlsManagerLayout', controlsManager.layoutManager, ControlsManagerLayoutVertical);
        else
            this._overrides.addOverride('ControlsManagerLayout', controlsManager.layoutManager, ControlsManagerLayoutHorizontal);

        controlsManager.layoutManager._searchEntryBin = controlsManager._searchEntryBin;

        // Allow user to close the overview by clicking on an empty space on the primary monitor's overview
        // Secondary monitors are handled in workspacesView
        this._addClickToCloseOverview();
        this._connectActiveWorkspaceChanged();

        // Update custom workAreaBox
        controlsManager.layoutManager._updateWorkAreaBox();

        // Don't style the search entry directly
        // as its default style may be used by other extensions
        controlsManager._searchEntry.add_style_class_name('search-entry-mod');

        console.debug('  OverviewControlsModule - Activated');
    }

    _disableModule() {
        const reset = true;

        const controlsManager = Main.overview._overview.controls;

        this._removeAllTransitions();
        if (this._overrides)
            this._overrides.removeAll();
        this._overrides = null;

        this._replaceOnSearchChanged(reset);
        controlsManager._appDisplay.opacity = 255;
        this._addClickToCloseOverview(reset);
        this._connectActiveWorkspaceChanged(reset);
        this._removeWinPreviewOverlayDelay();

        controlsManager._searchEntry.remove_style_class_name('search-entry-mod');

        console.debug('  OverviewControlsModule - Disabled');
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

    _removeAllTransitions() {
        const controlsManager = Main.overview._overview.controls;
        controlsManager._searchEntryBin.remove_all_transitions();
        controlsManager._appDisplay.remove_all_transitions();
        controlsManager._workspacesDisplay.remove_all_transitions();
        controlsManager._thumbnailsBox.remove_all_transitions();
        controlsManager._searchController._searchResults.remove_all_transitions();
    }

    _connectActiveWorkspaceChanged(reset) {
        if (!reset && !this._wsChangedConnId) {
            this._wsChangedConnId = global.workspaceManager.connect('active-workspace-changed',
                () => {
                    // Don't activate keyboard navigation, if the ws was switched using a mouse or trackpad
                    if (!Main.overview._shown || global.get_pointer()[0] !== Me.run.initialPointerX)
                        return;
                    // Selecting window preview during workspace animation can cause visible glitches
                    // especially if the title position is set "On Top", syncing its width with the window
                    const delay = 230; // Workspace animation time
                    const slowDownFactor = St.Settings.get().slow_down_factor;
                    this._removeWinPreviewOverlayDelay();
                    this._winPreviewOverlayDelayId = GLib.timeout_add(GLib.PRIORITY_LOW, delay * slowDownFactor, () => {
                        Me.Util.activateKeyboardForWorkspaceView();
                        this._winPreviewOverlayDelayId = 0;
                        return GLib.SOURCE_REMOVE;
                    });
                }
            );
        } else if (reset && this._wsChangedConnId) {
            global.workspaceManager.disconnect(this._wsChangedConnId);
            this._wsChangedConnId = null;
        }
    }

    _removeWinPreviewOverlayDelay() {
        if (this._winPreviewOverlayDelayId) {
            GLib.source_remove(this._winPreviewOverlayDelayId);
            this._winPreviewOverlayDelayId = 0;
        }
    }

    _replaceOnSearchChanged(reset) {
        const searchController = Main.overview.searchController;
        const controlsManager = Main.overview._overview.controls;
        if (reset) {
            if (this._searchControllerSigId) {
                searchController.disconnect(this._searchControllerSigId);
                this._searchControllerSigId = 0;
            }
            if (this._originalSearchControllerSigId) {
                searchController.unblock_signal_handler(this._originalSearchControllerSigId);
                this._originalSearchControllerSigId = 0;
            }
            searchController._searchResults.translation_x = 0;
            searchController._searchResults.translation_y = 0;
            controlsManager._searchEntryBin.visible = true;
            controlsManager._searchEntryBin.opacity = 255;
        } else {
            // Reconnect signal to use custom function.
            // The function connected to the signal cannot be overridden in the class prototype because
            // the connection callback invokes the original function via a stored pointer (reference) rather than by name.
            if (!this._originalSearchControllerSigId) {
                this._originalSearchControllerSigId = GObject.signal_handler_find(searchController, { signalId: 'notify', detail: 'search-active' });
                if (this._originalSearchControllerSigId)
                    searchController.block_signal_handler(this._originalSearchControllerSigId);
            }

            if (!this._searchControllerSigId)
                this._searchControllerSigId = searchController.connect('notify::search-active', () => controlsManager._onSearchChanged());
        }
    }

    _addClickToCloseOverview(reset) {
        const overview = Main.overview._overview;

        overview.reactive = false;

        if (this._clickEmptyAction) {
            overview.remove_action(this._clickEmptyAction);
            this._clickEmptyAction = null;
        }

        if (this._tmbBoxClickConnection) {
            overview.controls._thumbnailsBox.disconnect(this._tmbBoxClickConnection);
            this._tmbBoxClickConnection = 0;
        }

        if (reset || !opt.CLICK_EMPTY_CLOSE)
            return;

        this._tmbBoxClickConnection = overview.controls._thumbnailsBox.connect(
            'button-release-event', () => Clutter.EVENT_STOP);

        overview.reactive = true;

        const clickHandler = gesture => {
            const button = gesture.get_button();
            const overviewState = overview.controls._stateAdjustment.value;
            const buttonPrimary = button === Clutter.BUTTON_PRIMARY;
            const buttonSecondary = button === Clutter.BUTTON_SECONDARY;
            const buttonAny = buttonPrimary || buttonSecondary;

            if ((overviewState === 1 && buttonAny) || (overviewState === 2 && buttonSecondary))
                Main.overview.hide();
        };

        const clickActionConstructor = Clutter.ClickAction || Clutter.ClickGesture;
        const clickedSignal = Clutter.ClickAction ? 'clicked' : 'recognize';
        const clickAction = new clickActionConstructor();
        clickAction.connect(clickedSignal, clickHandler);
        this._clickEmptyAction = clickAction;
        overview.add_action(this._clickEmptyAction);
    }
};

const ControlsManagerCommon = {
    prepareToEnterOverview() {
        this._searchController.prepareToEnterOverview();
        this._workspacesDisplay.prepareToEnterOverview();

        if (!Main.layoutManager._startingUp) {
            this.opacity = 255;
            this._searchInProgress = false;

            // Prevent overview from getting out of sync with workspace manager
            // This may happen after unfinished workspace switching using a gesture
            this._workspaceAdjustment.set_value(global.workspace_manager.get_active_workspace_index());

            // Fix thumbnailsBox not re-scaling after switching workspace outside of overview using a gesture
            this._thumbnailsBox._updateIndicator();

            // Store pointer X coordinate for OVERVIEW_MODE 1 - to prevent immediate switch to WORKSPACE_MODE 1 if the mouse pointer is steady
            Me.Util.resetInitialPointerX();

            this._updateSearchEntryVisibility(false, false);
            this._updateSearchStyle();

            // Prevent various glitches after configuration changed, including unlocking screen
            this._setWorkspacesDisplayAboveSiblings();
            opt.CANCEL_ALWAYS_ACTIVATE_SELECTED = false;
            Me.run.activateSelectedWindow = false;
            this._enableOverviewTransitionAnimationsIfNeeded();

            // Sometimes the app grid is empty after the appDisplay module was updated
            // Needs to be fixed in appDisplay module!
            if (!this._appDisplay._orderedItems.length) {
                Me.Modules.appDisplayModule.update();
                Main.notify('V-Shell', 'AppDisplay module hed to be restarted');
            }
        }
    },

    _shiftState(direction) {
        let { currentState, finalState, transitioning } = this._stateAdjustment.getStateTransitionParams();

        // Prevent initiating a new transition
        // to the same final state as the one already running
        currentState = transitioning ? finalState : currentState;
        // Shift could have been called before the initial overview animation started.
        // In this case, shift the finalState to avoid redundant call of Main.overview.show();
        finalState = Main.overview._visible && !transitioning && currentState === ControlsState.HIDDEN
            ? 1 : finalState;

        if (direction === Meta.MotionDirection.DOWN)
            finalState = Math.max(finalState - 1, ControlsState.HIDDEN);
        else if (direction === Meta.MotionDirection.UP)
            finalState = Math.min(finalState + 1, ControlsState.APP_GRID);

        if (finalState === currentState)
            return;

        if (currentState === ControlsState.HIDDEN &&
            finalState === ControlsState.WINDOW_PICKER) {
            Main.overview.show();
        } else if (finalState === ControlsState.HIDDEN) {
            Main.overview.hide();
        // Prevent state shifting before starting the initial overview transition.
        } else if (Me.run.overviewShiftAllowed) {
            this._stateAdjustment.remove_transition('value');
            this._stateAdjustment.ease(finalState, {
                duration: SIDE_CONTROLS_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onStopped: () => {
                    if (this._animationInProgress)
                        Main.overview._showDone();
                    this.dash.showAppsButton.checked =
                            finalState === ControlsState.APP_GRID;
                },
            });
        } else {
            Me.run.shiftedOverviewState = finalState;
        }
    },

    gestureBegin(tracker) {
        const searchActive = this._searchController.searchActive;
        // If search is active, return to the initial state before search is destroyed
        if (searchActive) {
            if (!this.dash.showAppsButton.checked)
                this._stateAdjustment.value = ControlsState.WINDOW_PICKER;
            // Close search if active
            this._searchEntry.set_text('');
        }

        const baseDistance = global.screen_height;
        const progress = this._stateAdjustment.value;
        const points = [
            ControlsState.HIDDEN,
            ControlsState.WINDOW_PICKER,
            ControlsState.APP_GRID,
        ];

        const transition = this._stateAdjustment.get_transition('value');
        const cancelProgress = transition
            ? transition.get_interval().peek_final_value()
            : Math.round(progress);
        this._stateAdjustment.remove_transition('value');

        tracker.confirmSwipe(baseDistance, points, progress, cancelProgress);
        if (progress === ControlsState.HIDDEN)
            this.prepareToEnterOverview();
        this._stateAdjustment.gestureInProgress = true;
    },

    _enableOverviewTransitionAnimationsIfNeeded() {
        Me.run.enableOverviewTransitionAnimations =
            St.Settings.get().enable_animations &&
            (Main.layoutManager._startingUp || !(opt.SHOW_WS_PREVIEW_BG && !opt.OVERVIEW_MODE2));
    },

    // this function has duplicate in WorkspaceView so we use one function for both to avoid issues with syncing them
    _getFitModeForState(state) {
        return _getFitModeForState(state);
    },

    // this function is used as a callback by a signal handler, needs to be reconnected after modification as the original callback uses a copy of the original function
    /* _update: function() {
        ...
    }*/

    _updateThumbnailsBox(animate) {
        const { currentState } = this._stateAdjustment.getStateTransitionParams();
        const { searchActive } = this._searchController;
        const { shouldShow } = this._thumbnailsBox;
        const show = shouldShow &&
            !(opt.MAX_THUMBNAIL_SCALE === opt.TMB_ZERO_SCALE && currentState <= 1) &&
            !(opt.MAX_THUMBNAIL_SCALE_APPGRID === opt.TMB_ZERO_SCALE && currentState === 2) &&
            !(opt.MAX_THUMBNAIL_SCALE === opt.TMB_ZERO_SCALE && opt.MAX_THUMBNAIL_SCALE_APPGRID === opt.TMB_ZERO_SCALE) &&
            !(opt.MAX_THUMBNAIL_SCALE === opt.TMB_ZERO_SCALE && currentState > 1 && opt.WS_ANIMATION_ALL);
        this._thumbnailsBox.visible = show;

        if ((opt.WS_ANIMATION_ALL && currentState > ControlsState.WINDOW_PICKER && currentState < 1.99 /* ControlsState.APP_GRID*/) || !opt.USE_THUMBNAILS_IN_APP_GRID) {
            if (!opt.SHOW_WS_TMB_BG) {
                this._thumbnailsBox._thumbnails.forEach(t => {
                    t._bgManager?.backgroundActor.set_opacity(0);
                });
            }
            this._updateThumbnailsBoxDefault(animate);
        } else {
            this._thumbnailsBox.scale_x = 1;
            this._thumbnailsBox.scale_y = 1;
            this._thumbnailsBox.opacity = 255;
            if (!searchActive && opt.USE_THUMBNAILS_IN_APP_GRID && opt.WS_ANIMATION_ALL && !opt.SHOW_WS_TMB_BG && currentState > 1.99) {
                this._thumbnailsBox._thumbnails.forEach(t => {
                    t._bgManager?.backgroundActor.set_opacity(255);
                });
            } else if (!opt.SHOW_WS_TMB_BG) {
                this._thumbnailsBox._thumbnails.forEach(t => {
                    t._bgManager?.backgroundActor.set_opacity(0);
                });
            }
        }

        // this call should be directly in _update(), but it's used as a callback function and it would require to reconnect the signal
        this._updateOverview();
    },

    _updateThumbnailsBoxDefault(animate = false) {
        const { shouldShow } = this._thumbnailsBox;
        const { searchActive } = this._searchController;
        const [opacity, scale, translationY] = this._getThumbnailsBoxParams();

        const thumbnailsBoxVisible = shouldShow && !searchActive && opacity !== 0;
        if (thumbnailsBoxVisible) {
            this._thumbnailsBox.opacity = 0;
            this._thumbnailsBox.visible = thumbnailsBoxVisible;
        }

        const params = {
            opacity: searchActive ? 0 : opacity,
            duration: animate ? SIDE_CONTROLS_ANIMATION_TIME : 0,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onStopped: () => {
                this._thumbnailsBox.set({
                    visible: thumbnailsBoxVisible,
                    translation_y: 0,
                });
            },
        };

        if (!searchActive) {
            params.scale_x = scale;
            params.scale_y = scale;
            params.translation_y = opt.ORIENTATION ? 0 : translationY;
        }

        this._thumbnailsBox.ease(params);
    },

    _updateOverview() {
        const { initialState, finalState, progress, currentState } = this._stateAdjustment.getStateTransitionParams();
        const initialParams = this._getOpacityForState(initialState);
        const finalParams = this._getOpacityForState(finalState);
        const fullTransition = Math.abs(finalState - initialState) > 1;
        const opacity = Math.round(Util.lerp(initialParams.opacity, finalParams.opacity, progress));
        const staticWorkspace = opt.OVERVIEW_MODE2 && (!opt.WORKSPACE_MODE || !Main.overview._animationInProgress);

        this._currentParams = {
            initialState,
            finalState,
            fullTransition,
            progress,
            currentState,
            opacity,
            staticWorkspace,
        };

        // reset Static Workspace window picker mode
        if (currentState === 0 && opt.OVERVIEW_MODE && opt.WORKSPACE_MODE)
            opt.WORKSPACE_MODE = 0;

        this._updateWorkspacesDisplay();
        this._updateAppDisplay();
        this._updateSearchEntry();
        this._updateOverviewStackOrder();
        if (currentState === ControlsState.WINDOW_PICKER)
            this._enableOverviewTransitionAnimationsIfNeeded();
    },

    _getOpacityForState(state) {
        let opacity;
        switch (state) {
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
    },

    _updateWorkspacesDisplay() {
        const currentState = this._currentParams.currentState;
        const fullTransition = this._currentParams.fullTransition;
        const staticWorkspace = opt.OVERVIEW_MODE2 && !opt.WORKSPACE_MODE;
        let opacity = this._currentParams.opacity;

        this._workspacesDisplay.translation_x = 0;
        this._workspacesDisplay.translation_y = 0;
        this._workspacesDisplay.scale_x = 1;
        this._workspacesDisplay.scale_y = 1;

        const fadeOutWs = !opt.WS_ANIMATION;

        // If Static Background ws switcher animation is required in the Static Workspace overview:
        //   - the ws preview bg is hidden while the static workspace overview is active, but needs to be visible
        //     when transitioning between this and any other state or between HIDDEN and APP_GRID states
        // Note that the initial bg visibility is set in WorkspacesView -> _updateWorkspacesState()
        let bgOpacity = (opt.SHOW_WS_PREVIEW_BG && !(staticWorkspace && opt.STATIC_WS_SWITCHER_BG)) ||
                        (!opt.SHOW_WS_PREVIEW_BG && opt.WS_ANIMATION_ALL && fullTransition) ||
                        (staticWorkspace && opt.SHOW_WS_PREVIEW_BG && opt.STATIC_WS_SWITCHER_BG &&
                            (currentState > ControlsState.WINDOW_PICKER || fullTransition))
            ? 255 : 0;

        if (fadeOutWs) {
            this._workspacesDisplay.opacity = Math.max(0, opacity - (255 - opacity));
        } else if (currentState > ControlsState.WINDOW_PICKER || fullTransition) {
            // Direction of the referenced fade transition is always WINDOW_PICKER to APP_GRID
            const fadeInBg = !opt.SHOW_WS_PREVIEW_BG && opt.WS_ANIMATION_ALL && !fullTransition;
            const fadeOutBg = opt.SHOW_WS_PREVIEW_BG && opt.WS_ANIMATION === 1 /* <- Single WS animation*/ && !opt.SHOW_WS_TMB_BG;

            if (fadeInBg)
                bgOpacity = 255 - opacity;
            else if (fadeOutBg)
                bgOpacity = Math.max(0, opacity - (255 - opacity));
        }

        const workspaces = this._workspacesDisplay._workspacesViews[global.display.get_primary_monitor()]?._workspaces;

        if (!Main.layoutManager._startingUp)
            workspaces?.forEach(w => w._background.set_opacity(bgOpacity));

        if (opt.USE_THUMBNAILS_IN_APP_GRID && currentState === ControlsState.APP_GRID) {
            // Hide workspaces in the app grid state,
            // so they're not blocking ws thumbnails or the app grid if ws animation is disabled
            this._workspacesDisplay.scale_x = 0;
        } else {
            this._workspacesDisplay.scale_x = 1;
        }
    },

    _updateAppDisplay() {
        if (!Main.layoutManager._startingUp)
            this._appDisplay.opacity = 255 - this._currentParams.opacity;
    },

    _updateSearchEntry() {
        const staticWorkspace = this._currentParams.staticWorkspace;
        const currentState = this._currentParams.currentState;
        const opacity = this._currentParams.opacity;
        const fullTransition = this._currentParams.fullTransition;

        // Avoid workspacesDisplay animate below searchEntry

        // Show SearchEntry even when disabled and search not active
        // to indicate App Grid search mode
        if (currentState > ControlsState.WINDOW_PICKER) {
            this._searchEntry.remove_style_class_name('search-entry-om2');
            if (opt.SEARCH_APP_GRID_MODE && !opt.SHOW_SEARCH_ENTRY) {
                this._searchEntryBin.visible = true;
                this._searchEntryBin.opacity = 255 - opacity;
            }
            if (!this._searchInProgress && !staticWorkspace)
                this._setSearchEntryBelow();
            else
                this._setSearchEntryAbove();
        } else {
            this._searchEntryBin.visible =
                opt.SHOW_SEARCH_ENTRY || this._searchInProgress ||
                (opt.SEARCH_APP_GRID_MODE && this.dash.showAppsButton.checked);
            if ((staticWorkspace || currentState === ControlsState.WINDOW_PICKER) &&
                !fullTransition)
                this._setSearchEntryAbove();
            else
                this._setSearchEntryBelow();
        }
    },

    _setSearchEntryAbove() {
        if (this._currentParams.staticWorkspace || opt.SEARCH_RESULTS_BG_STYLE) {
            this.set_child_above_sibling(this._searchController, null);
            this.set_child_above_sibling(this._searchEntryBin, this._searchController);
        } else {
            this.set_child_above_sibling(this._searchEntryBin, this._workspacesDisplay);
        }
    },

    _setSearchEntryBelow() {
        this.set_child_below_sibling(this._searchEntryBin, this._workspacesDisplay);
    },

    _updateOverviewStackOrder() {
        const currentState = this._currentParams.currentState;
        const fullTransition = this._currentParams.fullTransition;

        // getStateTransitionParams() doesn't recognize reverse direction of a swipe gesture
        // which means that initialState is always lower than finalState when swipe gesture is used
        const staticWorkspace  = opt.OVERVIEW_MODE2 && (!opt.WORKSPACE_MODE || !Main.overview._animationInProgress);
        const dashShouldBeAbove = staticWorkspace ||
            (currentState >= 1 && !(opt.DASH_BOTTOM && opt.WIN_TITLES_POSITION_BELOW) && !fullTransition);
        if (!this._dashIsAbove && dashShouldBeAbove)
            this._setDashAboveSiblings();
        else if (this._dashIsAbove && !dashShouldBeAbove)
            this._setWorkspacesDisplayAboveSiblings();

        if (currentState >= 1)
            this._setWsTmbStackPosition();
    },

    _setWorkspacesDisplayAboveSiblings() {
        this.set_child_above_sibling(this._workspacesDisplay, null);
        if (Main.layoutManager.panelBox.get_parent() === Main.overview._overview.controls)
            Main.overview._overview.controls.set_child_below_sibling(Main.layoutManager.panelBox, this._workspacesDisplay);
        this._dashIsAbove = false;
    },

    _setDashAboveSiblings() {
        this.set_child_below_sibling(this._appDisplay, null);
        this.set_child_above_sibling(this._workspacesDisplay, this._appDisplay);
        if (!Me.Util.dashNotDefault())
            this.set_child_above_sibling(this.dash, null);
        if (Main.layoutManager.panelBox.get_parent() === Main.overview._overview.controls)
            Main.overview._overview.controls.set_child_above_sibling(Main.layoutManager.panelBox, null);
        this._dashIsAbove = true;
    },

    _setWsTmbStackPosition() {
        const windowsExposed = !opt.OVERVIEW_MODE2 || opt.WORKSPACE_MODE;
        if (windowsExposed)
            this.set_child_below_sibling(this._thumbnailsBox, this._workspacesDisplay);
        else if (!windowsExposed)
            this.set_child_below_sibling(this._thumbnailsBox, this.dash);
    },

    // fix for upstream bug - appGrid.visible after transition from APP_GRID to HIDDEN
    _updateAppDisplayVisibility(stateTransitionParams = null) {
        if (!stateTransitionParams)
            stateTransitionParams = this._stateAdjustment.getStateTransitionParams();

        const { currentState } = stateTransitionParams;
        const previousVisibility = this._appDisplay.visible;

        // if !APP_GRID_ANIMATION, appGrid needs to be hidden in WINDOW_PICKER mode (1)
        // but needs to be visible for transition from HIDDEN (0) to APP_GRID (2)
        this._appDisplay.visible =
            currentState > ControlsState.HIDDEN && this._appDisplay.opacity > 0 &&
            (!this._searchController.searchActive || (opt.SEARCH_APP_GRID_MODE && this.dash.showAppsButton.checked)) &&
            !(currentState === ControlsState.WINDOW_PICKER && !opt.APP_GRID_ANIMATION) &&
            !this._searchInProgress;

        // Update the app grid before it gets visible - the usage order could have changed
        if (opt.APP_GRID_USAGE && !previousVisibility && this._appDisplay.visible)
            this._appDisplay._redisplay();
    },

    _activateSearchAppGridMode() {
        if (!this._origAppGridContent) {
            this._origAppGridContent = {
                usage: opt.APP_GRID_USAGE,
                favorites: opt.APP_GRID_EXCLUDE_FAVORITES,
                running: opt.APP_GRID_EXCLUDE_RUNNING,
                incompletePages: this._appDisplay._grid.layoutManager.allowIncompletePages,
                order: opt.APP_GRID_ORDER,
            };
            opt.APP_GRID_ORDER = 3;
            opt.APP_GRID_USAGE = true;
            opt.APP_GRID_EXCLUDE_FAVORITES = false;
            opt.APP_GRID_EXCLUDE_RUNNING = false;
            this._appDisplay._grid.layoutManager.allowIncompletePages = false;

            Me.run.appGridFilterActive = true;
        }
    },

    _deactivateSearchAppGridMode() {
        Me.run.appGridFilterActive = false;

        if (this._origAppGridContent) {
            const icons = this._appDisplay._orderedItems;
            icons.forEach(icon => {
                icon.visible = true;
            });

            opt.APP_GRID_ORDER = this._origAppGridContent.order;
            opt.APP_GRID_USAGE = this._origAppGridContent.usage;
            opt.APP_GRID_EXCLUDE_FAVORITES = this._origAppGridContent.favorites;
            opt.APP_GRID_EXCLUDE_RUNNING = this._origAppGridContent.running;
            this._appDisplay._grid.layoutManager.allowIncompletePages = this._origAppGridContent.incompletePages;
            this._origAppGridContent = null;
            this._appDisplay._redisplay();
            this._searchInProgress = false;
        }
    },

    _searchAppGridMode(searchActive) {
        const appSearchModeActive = opt.SEARCH_APP_GRID_MODE && this.dash.showAppsButton.checked;
        if (searchActive && appSearchModeActive) {
            this._activateSearchAppGridMode();
        } else if (Main.overview._shown) {
            this._deactivateSearchAppGridMode();
        } else {
            // If the overview is hiding at this moment,
            // an app might be activated
            // Wait until the launch animation finishes
            _timeouts.cancelAppGridSearch = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                250 * St.Settings.get().slow_down_factor,
                () => {
                    this._deactivateSearchAppGridMode();
                    _timeouts.cancelAppGridSearch = 0;
                    return GLib.SOURCE_REMOVE;
                }
            );
        }
        return appSearchModeActive;
    },

    _onSearchChanged() {
        const { finalState } = this._stateAdjustment.getStateTransitionParams();
        const { searchActive } = this._searchController;

        this._updateSearchEntryVisibility(searchActive);
        this._updateSearchStyle();

        if (searchActive)
            this._searchInProgress = true;

        if (this._searchAppGridMode(searchActive) && searchActive)
            return;

        this.set_child_above_sibling(this._searchEntryBin, this._searchController);
        this._fadeWorkspaces(searchActive);
        this._fadeSearchResults(searchActive);
        this._fadeAppDisplay(searchActive);
        // reuse overview transition, just replace APP_GRID with the search view
        this._shiftOverviewStateIfNeeded(searchActive, finalState);
        this._animateSearchResultsIfNeeded(searchActive);
        if (opt.SHOW_BG_IN_OVERVIEW && searchActive)
            this._overviewBackgroundController?.resetMainBackground(searchActive);
    },

    _updateSearchInProgress() {
        const currentSearchState = this._searchInProgress;
        this._searchInProgress = this._searchController.searchActive;
        // Update bg brightness after leaving search mode
        if (!this._searchInProgress && currentSearchState !== this._searchInProgress)
            this._overviewBackgroundController?.resetMainBackground(this._searchController.searchActive);
        this._updateSearchEntry();
    },

    _shiftOverviewStateIfNeeded(searchActive, finalState) {
        if ((opt.OVERVIEW_MODE2 && !opt.WORKSPACE_MODE) ||
            Main.overview._animationInProgress ||
            finalState === ControlsState.HIDDEN ||
            this.dash.showAppsButton.checked)
            return;

        // Delay to allow the workspace preview to fade out instead of animating
        const delay = searchActive && !opt.SEARCH_VIEW_ANIMATION ? opt.SEARCH_DELAY : 0;
        // duration: 0 skips the delay for some reason
        // Animation needs to be shorter than the search delay to avoid stuttering
        const inDuration = 1;
        const outDuration = opt.SEARCH_VIEW_ANIMATION ? SIDE_CONTROLS_ANIMATION_TIME : 1;
        this._stateAdjustment.ease(searchActive ? ControlsState.APP_GRID : ControlsState.WINDOW_PICKER, {
            // shorter animation time when entering search view can avoid stuttering in transition
            // collecting search results take some time and the problematic part is the realization of the object on the screen
            // if the ws animation ends before this event, the whole transition is smoother
            // removing the ws transition (duration: 0) seems like the best solution here
            delay,
            duration: searchActive ? inDuration : outDuration,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onStopped: () => {
                if (this._updateSearchInProgress) {
                    this._updateSearchInProgress();
                    this._updateSearchStyle();
                    this._workspacesDisplay.setPrimaryWorkspaceVisible(true);
                }
            },
        });
    },

    _updateSearchEntryVisibility(searchActive, animate = true) {
        const entryBin = this._searchEntryBin;

        entryBin.remove_all_transitions();
        if (opt.SHOW_SEARCH_ENTRY ||
            (opt.SEARCH_APP_GRID_MODE && this.dash.showAppsButton.checked)
        ) {
            entryBin.visible = true;
            entryBin.opacity = 255;
        } else if (animate) {
            entryBin.visible = true;
            entryBin.opacity = searchActive ? 0 : 255;
            // show search entryBin only if the user starts typing, and hide it when leaving the search mode
            entryBin.ease({
                opacity: searchActive ? 255 : 0,
                duration: SIDE_CONTROLS_ANIMATION_TIME / 2,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onStopped: () => {
                    entryBin.visible = searchActive;
                    entryBin.opacity = searchActive ? 255 : 0;
                },
            });
        } else {
            entryBin.visible = searchActive;
            entryBin.opacity = searchActive ? 255 : 0;
        }
    },

    _fadeSearchResults(searchActive) {
        this._searchController.opacity = 255;
        this._searchController._searchResults.opacity = searchActive ? 0 : 255;
        if (searchActive)
            this._searchController.visible = searchActive;
        else // hide "No search results" during transition
            this._searchController.opacity = 1;

        this._searchController._searchResults.ease({
            opacity: searchActive ? 255 : 0,
            duration: SIDE_CONTROLS_ANIMATION_TIME / 2,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onStopped: () => {
                this._searchController.visible = searchActive;
                if ((opt.OVERVIEW_MODE2 && !opt.WORKSPACE_MODE) || this.dash.showAppsButton.checked)
                    this._updateSearchInProgress();
                this._updateAppDisplayVisibility();
            },
        });
    },

    _fadeWorkspaces(searchActive) {
        if (!(opt.OVERVIEW_MODE2 && !opt.WORKSPACE_MODE) && // ↓↓↓ Search triggered during overview animation
            (!opt.WS_ANIMATION || this._stateAdjustment.value < ControlsState.WINDOW_PICKER)
        ) {
            this._workspacesDisplay.reactive = false;
            this._workspacesDisplay.ease({
                opacity: searchActive ? 0 : 255,
                // duration needs to be short enough to complete before the search results load, preventing stuttering
                duration: searchActive ? opt.SEARCH_DELAY : 150,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        } else {
            this._workspacesDisplay.setPrimaryWorkspaceVisible(true);
            this._workspacesDisplay.opacity = 255;
            this._workspacesDisplay.reactive = true;
        }
    },

    _fadeAppDisplay(searchActive) {
        if (this.dash.showAppsButton.checked) {
            this._appDisplay.visible = true;

            this._appDisplay.ease({
                opacity: searchActive ? 1 : 255,
                duration: SIDE_CONTROLS_ANIMATION_TIME / 2,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }
    },

    _animateSearchResultsIfNeeded(searchActive) {
        if (!opt.SEARCH_VIEW_ANIMATION) {
            this._searchController._searchResults.translation_x = 0;
            this._searchController._searchResults.translation_y = 0;
            return;
        }

        const statusContainer = this._searchController._searchResults._statusBin
            ? this._searchController._searchResults._statusBin
            : this._searchController._searchResults._statusContainer; // Since GS 49
        statusContainer.opacity = 1;

        let translationX = 0;
        let translationY = 0;
        const geometry = global.display.get_monitor_geometry(global.display.get_primary_monitor());

        switch (opt.SEARCH_VIEW_ANIMATION) {
        case 1:
            // make it longer to cover the delay before results appears
            translationX = geometry.width;
            translationY = 0;
            break;
        case 2:
            translationX = -geometry.width;
            translationY = 0;
            break;
        case 3:
            translationX = 0;
            translationY = geometry.height;
            break;
        case 5:
            translationX = 0;
            translationY = -geometry.height;
            break;
        }

        if (searchActive) {
            this._searchController._searchResults.translation_x = translationX;
            this._searchController._searchResults.translation_y = translationY;
        } else {
            this._searchController._searchResults.translation_x = 0;
            this._searchController._searchResults.translation_y = 0;
        }

        this._searchController._searchResults.ease({
            delay: 150, // wait for results
            opacity: searchActive ? 255 : 0,
            translation_x: searchActive ? 0 : translationX,
            translation_y: searchActive ? 0 : translationY,
            duration: SIDE_CONTROLS_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this._searchController.visible = searchActive;
                statusContainer.opacity = 255;
            },
        });
    },

    _updateSearchStyle(reset) {
        if (!reset && !(this.dash.showAppsButton.checked && opt.SEARCH_APP_GRID_MODE) && (
            (opt.OVERVIEW_MODE2 && !opt.WORKSPACE_MODE && !this.dash.showAppsButton.checked) ||
            (opt.SEARCH_RESULTS_BG_STYLE && this._searchController.searchActive)
        )) {
            this._searchController._searchResults.add_style_class_name('search-results-bg-dark');
            this._searchEntry.add_style_class_name('search-entry-om2');
        } else {
            this._searchController._searchResults.remove_style_class_name('search-results-bg-dark');
            this._searchEntry.remove_style_class_name('search-entry-om2');
        }
    },

    async runStartupAnimation(callback) {
        this._ignoreShowAppsButtonToggle = true;

        this.prepareToEnterOverview();
        this._enableOverviewTransitionAnimationsIfNeeded();

        this.dash.showAppsButton.checked = false;
        this._ignoreShowAppsButtonToggle = false;

        // Set the opacity here to avoid a 1-frame flicker
        this.opacity = 1;
        this._appDisplay.opacity = 1;
        // It seems that setting the value above 0
        // reduces the chance of a black flicker before the transition
        this._stateAdjustment.value = 0.001;

        // We can't run the animation before the first allocation happens
        await this.layout_manager.ensureAllocation();

        this._overviewBackgroundController.runStartupAnimation();
        Me.Modules.panelModule.update();

        // Skip transition to the Window Picker if user wants to stay on Desktop
        if (opt.STARTUP_STATE !== 1) {
            this._stateAdjustment.ease(ControlsState.WINDOW_PICKER, {
                delay: 10,
                duration: STARTUP_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }

        // Opacity
        this.ease({
            opacity: 255,
            duration: STARTUP_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });

        for (const view of this._workspacesDisplay._workspacesViews) {
            if (view._monitorIndex !== global.display.get_primary_monitor())
                view._thumbnails.opacity = 0;
        }

        const onStopped = function () {
            // running init callback again causes issues (multiple connections)
            if (callback && !Main.overview._startupInitComplete)
                callback();

            const appDisplayModule = Me.Modules.appDisplayModule;
            if (!appDisplayModule.moduleEnabled)
                this._finishStartupSequence();
            else
                this._realizeAppDisplayAndFinishSequence();

            Main.overview._startupInitComplete = true;
            this._enableOverviewTransitionAnimationsIfNeeded();
        }.bind(this);

        if (!callback) { // GS 47+
            return new Promise(resolve => {
                _timeouts.startupAnim2 = GLib.timeout_add(
                    GLib.PRIORITY_DEFAULT,
                    // delay + animation time
                    STARTUP_ANIMATION_TIME * 2 * St.Settings.get().slow_down_factor,
                    () => {
                        onStopped();
                        resolve();
                        _timeouts.startupAnim2 = 0;
                        return GLib.SOURCE_REMOVE;
                    }
                );
            });
        }

        _timeouts.startupAnim2 = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            // delay + animation time
            STARTUP_ANIMATION_TIME * 2 * St.Settings.get().slow_down_factor,
            () => {
                onStopped();
                _timeouts.startupAnim2 = 0;
                return GLib.SOURCE_REMOVE;
            }
        );
        return null;
    },

    _realizeAppDisplayAndFinishSequence() {
        const appDisplayModule = Me.Modules.appDisplayModule;
        // realize app grid for smoother first animation
        appDisplayModule._repopulateAppDisplay(false, this._finishStartupSequence.bind(this));
    },

    _finishStartupSequence() {
        _timeouts.finishStartup = GLib.idle_add(
            GLib.PRIORITY_LOW, () => {
                this._appDisplay.opacity = 255;
                if (opt.STARTUP_STATE === 1) {
                    Main.overview.hide();
                } else if (opt.STARTUP_STATE === 2) {
                    Main.overview.show(2); // just because of DtD, because we skipped startup animation
                    this.dash.showAppsButton.checked = true;
                } else if (!opt.STARTUP_STATE &&  Me.Util.dashNotDefault()) {
                    Main.overview.show();
                }

                _timeouts.finishStartup = 0;
                return GLib.SOURCE_REMOVE;
            }
        );
    },

    animateToOverview(state, callback) {
        this._ignoreShowAppsButtonToggle = true;

        this._stateAdjustment.value = ControlsState.HIDDEN;

        // Building window thumbnails takes some time, and with many windows on the workspace
        // this time can be close to or longer than ANIMATION_TIME,
        // in which case the animation is greatly delayed, stutters, or is even skipped.
        // I believe that for most users, it is more acceptable to watch a delayed but smooth animation,
        // even if it takes a little more time, than to see jumping frames with the same delay.
        let delay = 0;
        if (opt.DELAY_OVERVIEW_ANIMATION) {
            delay = global.display.get_tab_list(0, null).length * opt.DELAY_PER_WINDOW;
            // The delay property used by the ease method respects the global slowdown factor
            const slowDownFactor = St.Settings.get().slow_down_factor;
            delay = Math.round(delay / slowDownFactor);
        }
        // Store the delay for _shiftState()
        this._overviewAnimationDelay = delay;

        this._stateAdjustment.ease(state, {
            delay,
            duration: 250, // Overview.ANIMATION_TIME,
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
};

const ControlsManagerLayoutCommon = {
    after__updateWorkAreaBox() {
        const workArea = this._workAreaBox.copy();

        // opt.PANEL_OVERVIEW_ONLY removes affectsStruts panel property
        if (opt.get('panelModule') && opt.PANEL_OVERVIEW_ONLY) {
            let offsetY = 0;
            let reduction = 0;
            reduction = Main.panel.height;
            offsetY = opt.PANEL_POSITION_TOP ? reduction : 0;

            const startX = workArea.x1;
            const startY = workArea.y1 + offsetY;
            const width = workArea.get_width();
            const height = workArea.get_height() - reduction;

            workArea.set_origin(startX, startY);
            workArea.set_size(width, height);
        }

        this._workAreaBoxForVShellConfig = workArea;
    },

    _updatePositionFromDashToDock() {
        // update variables that cannot be processed within settings
        const dash = Main.overview.dash;
        opt.DASH_POSITION = dash._position;
        opt.DASH_TOP = opt.DASH_POSITION === 0;
        opt.DASH_RIGHT = opt.DASH_POSITION === 1;
        opt.DASH_BOTTOM = opt.DASH_POSITION === 2;
        opt.DASH_LEFT = opt.DASH_POSITION === 3;
        opt.DASH_VERTICAL = opt.DASH_LEFT || opt.DASH_RIGHT;
    },

    _dashToDockAffectsWorkArea() {
        const dash = Main.overview.dash;
        const dtd = dash.get_parent()?.get_parent()?.get_parent();
        const layoutManager = Main.layoutManager;
        const index = layoutManager._findActor(dtd);
        const data = index > -1 ? layoutManager._trackedActors[index] : null;
        const affectsStruts = data?.affectsStruts;
        return !!affectsStruts;
    },

    _computeWorkspacesBoxForState(state, box, leftBoxOffset, rightBoxOffset, topBoxOffset, bottomBoxOffset, centeredBoxOffset, dashWidth, dashHeight, searchEntryHeight, searchEntryPositionTop) {
        let workspaceBox = box.copy();
        let [width, height] = this._workAreaBoxForVShellConfig.get_size();
        const startX = this._workAreaBoxForVShellConfig.x1;
        const startY = this._workAreaBoxForVShellConfig.y1;

        let wsBoxWidth, wsBoxHeight, wsBoxY, wsBoxX;

        switch (state) {
        case ControlsState.HIDDEN:
            workspaceBox.set_origin(...this._workAreaBox.get_origin());
            workspaceBox.set_size(...this._workAreaBox.get_size());
            break;
        case ControlsState.WINDOW_PICKER:
        case ControlsState.APP_GRID:
            if (opt.WS_ANIMATION && opt.SHOW_WS_TMB && state === ControlsState.APP_GRID) {
                if (opt.ORIENTATION)
                    workspaceBox = this._getThumbnailsBoxForState(state, dashWidth, dashHeight);
                else
                    workspaceBox = this._getThumbnailsBoxForState(state, dashWidth, dashHeight, searchEntryHeight, searchEntryPositionTop);
            } else if (opt.OVERVIEW_MODE2 && !opt.WORKSPACE_MODE) {
                workspaceBox.set_origin(...this._workAreaBox.get_origin());
                workspaceBox.set_size(...this._workAreaBox.get_size());
            } else {
                wsBoxWidth = width - leftBoxOffset - rightBoxOffset;
                wsBoxHeight = height - topBoxOffset - bottomBoxOffset;

                const ratio = width / height;
                let wRatio = wsBoxWidth / wsBoxHeight;
                let scale = ratio / wRatio;

                if (scale > 1) {
                    wsBoxHeight /= scale;
                    wsBoxWidth = wsBoxHeight * ratio;
                } else {
                    wsBoxWidth *= scale;
                    wsBoxHeight = wsBoxWidth / ratio;
                }

                // height decides the actual size, ratio is given by the workArea
                wsBoxHeight = Math.round(wsBoxHeight * opt.WS_PREVIEW_SCALE);
                wsBoxWidth = Math.round(wsBoxWidth * opt.WS_PREVIEW_SCALE);

                let xOffset = 0;
                let yOffset = 0;

                const yAvailableSpace = Math.round((height - topBoxOffset - wsBoxHeight - bottomBoxOffset) / 2);
                yOffset = topBoxOffset + yAvailableSpace;

                const centeredBoxX = Math.round((width - wsBoxWidth) / 2);

                this._xAlignCenter = false;
                // Try to center the workspace preview if possible,
                // but prevent it from glitching during the transition between WINDOW_PICKER and APP_GRID,
                // which is caused by using the current thumbnail size instead of the target-state size.
                if (centeredBoxX < centeredBoxOffset || !opt.MAX_THUMBNAIL_SCALE_STABLE) {
                    xOffset = Math.round(leftBoxOffset + (width - leftBoxOffset - wsBoxWidth - rightBoxOffset) / 2);
                } else {
                    xOffset = centeredBoxX;
                    this._xAlignCenter = true;
                }

                wsBoxX = startX + xOffset;
                wsBoxY = startY + yOffset;
                workspaceBox.set_origin(wsBoxX, wsBoxY);
                workspaceBox.set_size(wsBoxWidth, wsBoxHeight);
            }
        }

        return workspaceBox;
    },

    _getAppDisplayBoxForState(state, box, leftBoxOffset, rightBoxOffset, topBoxOffset, bottomBoxOffset) {
        const appDisplayBox = new Clutter.ActorBox();
        const startX = this._workAreaBoxForVShellConfig.x1;
        const startY = this._workAreaBoxForVShellConfig.y1;
        let [width, height] = this._workAreaBoxForVShellConfig.get_size();
        const centeredBoxOffset = Math.max(leftBoxOffset, rightBoxOffset);

        const adWidth = opt.CENTER_APP_GRID
            ? width - 2 * centeredBoxOffset
            : width - leftBoxOffset - rightBoxOffset;
        const adHeight = height - topBoxOffset - bottomBoxOffset;

        const appDisplayX = startX +
            (opt.CENTER_APP_GRID
                ? Math.round((width - adWidth) / 2)
                : leftBoxOffset
            );
        const appDisplayY = startY + topBoxOffset;

        switch (state) {
        case ControlsState.HIDDEN:
        case ControlsState.WINDOW_PICKER:
            // 1 - left, 2 - right, 3 - bottom, 5 - top
            switch (opt.APP_GRID_ANIMATION) {
            case 0:
                appDisplayBox.set_origin(appDisplayX, appDisplayY);
                break;
            case 1:
                appDisplayBox.set_origin(startX + width, appDisplayY);
                break;
            case 2:
                appDisplayBox.set_origin(box.x1 - adWidth, appDisplayY);
                break;
            case 3:
                appDisplayBox.set_origin(appDisplayX, box.y2);
                break;
            case 5:
                appDisplayBox.set_origin(appDisplayX, box.y1 - adHeight);
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

    _adjustChildBoxPositionForState(box, childBox, position, transitionParams, offset) {
        const currentState = transitionParams.currentState;
        if (currentState >= ControlsState.WINDOW_PICKER)
            return;

        let hiddenX, hiddenY;
        switch (position) {
        case 0: // Top
            hiddenY = box.y1 - childBox.get_height() - offset;
            childBox.set_origin(childBox.x1, Math.round(hiddenY + (childBox.y1 - hiddenY) * currentState));
            break;
        case 1: // Right
            hiddenX = box.x2 + offset;
            childBox.set_origin(Math.round(hiddenX - (hiddenX - childBox.x1) * currentState), childBox.y1);
            break;
        case 2: // Bottom
            hiddenY = box.y2 + offset;
            childBox.set_origin(childBox.x1, Math.round(hiddenY - (hiddenY - childBox.y1) * currentState));
            break;
        case 3: // Left
            hiddenX = box.x1 - childBox.get_width() - offset;
            childBox.set_origin(Math.round(hiddenX + (childBox.x1 - hiddenX) * currentState), childBox.y1);
            break;
        }
    },
};

const ControlsManagerLayoutVertical = {
    _getThumbnailsBoxForState(state, dashWidth, dashHeight) {
        const wsTmbBox = new Clutter.ActorBox();
        const [width, height] = this._workAreaBoxForVShellConfig.get_size();
        const startX = this._workAreaBoxForVShellConfig.x1;
        const startY = this._workAreaBoxForVShellConfig.y1;
        const spacing = opt.SPACING;

        let wsTmbWidth = 0;
        let wsTmbHeight = 0;

        let maxWsTmbScale = state === ControlsState.APP_GRID
            ? opt.MAX_THUMBNAIL_SCALE_APPGRID
            : opt.MAX_THUMBNAIL_SCALE;

        wsTmbWidth = Math.round(width * maxWsTmbScale);

        let totalTmbSpacing;
        [totalTmbSpacing, wsTmbHeight] = this._workspacesThumbnails.get_preferred_height(wsTmbWidth);
        wsTmbHeight += totalTmbSpacing;

        const wstTopOffset = !opt.WS_TMB_FULL && opt.DASH_TOP ? dashHeight : spacing;
        const wstBottomOffset = !opt.WS_TMB_FULL && opt.DASH_BOTTOM ? dashHeight : spacing;
        const wstLeftOffset = opt.DASH_LEFT ? dashWidth : spacing;
        const wstRightOffset = opt.DASH_RIGHT ? dashWidth : spacing;

        const wsTmbHeightMax = height - wstTopOffset - wstBottomOffset;

        // Reduce size to fit wsTmb to the screen
        if (wsTmbHeight > wsTmbHeightMax) {
            wsTmbHeight = wsTmbHeightMax;
            wsTmbWidth = this._workspacesThumbnails.get_preferred_width(wsTmbHeight)[1];
        }

        let wsTmbX = opt.WS_TMB_LEFT
            ? startX + wstLeftOffset
            : startX + width - wstRightOffset - wsTmbWidth;

        let offset = (height - wstTopOffset - wsTmbHeight - wstBottomOffset) / 2;
        offset = Math.round(offset - (opt.WS_TMB_POSITION_ADJUSTMENT * offset));
        const wsTmbY = startY + wstTopOffset + offset;

        wsTmbBox.set_origin(wsTmbX, wsTmbY);
        wsTmbBox.set_size(Math.max(wsTmbWidth, 1), Math.max(wsTmbHeight, 1));

        return wsTmbBox;
    },

    vfunc_allocate(container, box) {
        const childBox = new Clutter.ActorBox();
        const startX = this._workAreaBoxForVShellConfig.x1;
        const startY = this._workAreaBoxForVShellConfig.y1;
        let [width, height] = this._workAreaBoxForVShellConfig.get_size();

        const spacing = opt.SPACING;
        const halfSpacing = opt.HALF_SPACING;

        const opaqueSearchResults =
        (opt.OVERVIEW_MODE2 && !opt.WORKSPACE_MODE) ||
        opt.SEARCH_RESULTS_BG_STYLE;

        const transitionParams = this._stateAdjustment.getStateTransitionParams();
        const controlsManager = Main.overview._overview.controls;

        // Panel
        const panelX = 0;
        let panelY = 0;
        if (Main.layoutManager.panelBox.get_parent() === controlsManager) {
            const [, pWidth] = Main.panel.get_preferred_width(height);
            const [, pHeight] = Main.panel.get_preferred_height(width);
            if (!opt.PANEL_POSITION_TOP)
                panelY = height; // box height is reduced by panel height

            childBox.set_origin(0, 0);
            childBox.set_size(pWidth, pHeight);
            Main.panel.allocate(childBox);
            childBox.set_origin(panelX, panelY);

            // Animate panel if needed
            if (Me.run.enableOverviewTransitionAnimations) {
                this._adjustChildBoxPositionForState(
                    box, childBox,
                    opt.PANEL_POSITION_TOP ? 0 : 2,
                    transitionParams,
                    6 // offset
                );
            }

            Main.layoutManager.panelBox.allocate(childBox);
        }

        // Dash
        const maxDashHeight = Math.round(box.get_height() * DASH_MAX_SIZE_RATIO);
        const maxDashWidth = Math.round(maxDashHeight * 0.8);
        let dashHeight = 0;
        let dashWidth = 0;

        // dash cloud be overridden by the Dash to Dock clone
        if (Me.Util.dashIsDashToDock()) {
            this._updatePositionFromDashToDock();
            // If DtD affects workArea, dash size needs to be 0 + spacing
            const dash = Main.overview.dash;
            if (this._dashToDockAffectsWorkArea()) {
                if (opt.DASH_VERTICAL)
                    dashWidth = spacing;
                else
                    dashHeight = spacing;
            } else {
                dashHeight = dash.height;
                dashWidth = dash.width;
                if (opt.DASH_VERTICAL)
                    dashWidth += spacing;
                else
                    dashHeight += spacing;
            }
        } else if (this._dash.visible) {
            // Default dash
            if (opt.DASH_VERTICAL) {
                this._dash.setMaxSize(maxDashWidth, height);
                [, dashWidth] = this._dash.get_preferred_width(height);
                [, dashHeight] = this._dash.get_preferred_height(dashWidth);
                dashWidth = Math.min(dashWidth, maxDashWidth);
                dashHeight = Math.min(dashHeight, height);
            } else if (!opt.WS_TMB_FULL) {
                this._dash.setMaxSize(width, maxDashHeight);
                [, dashHeight] = this._dash.get_preferred_height(width);
                [, dashWidth] = this._dash.get_preferred_width(dashHeight);
                dashHeight = Math.min(dashHeight, maxDashHeight);
                dashWidth = Math.min(dashWidth, width);
            }
        }

        // Workspace Thumbnails
        let wsTmbWidth = 0;
        // let wsTmbHeight = 0;

        if (opt.SHOW_WS_TMB) {
            /* const searchActive = controlsManager._searchInProgress &&
                                !(opt.SEARCH_APP_GRID_MODE && Main.overview.dash.showAppsButton.checked);*/
            const getState = state =>
                state <= ControlsState.WINDOW_PICKER ||
                // searchActive || // Show the thumbnails before workspacesDisplay is hidden to avoid glitches
                (opt.WS_ANIMATION_ALL && transitionParams.currentState < 1.99 /* ControlsState.APP_GRID*/)
                    ? ControlsState.WINDOW_PICKER
                    : ControlsState.APP_GRID;
            const initialState = getState(transitionParams.initialState);
            const finalState = getState(transitionParams.finalState);
            const params = [dashWidth, dashHeight];
            const initialBox = this._getThumbnailsBoxForState(initialState, ...params);
            let wsTmbBox;
            if (opt.MAX_THUMBNAIL_SCALE_STABLE) {
                wsTmbBox = initialBox;
            } else {
                const finalBox = this._getThumbnailsBoxForState(finalState, ...params);
                wsTmbBox = initialBox.interpolate(finalBox, transitionParams.progress);
            }
            wsTmbWidth = Math.round(wsTmbBox.get_width());
            // wsTmbHeight = Math.round(wsTmbBox.get_height());

            // Animate ws thumbnails if needed
            if (Me.run.enableOverviewTransitionAnimations) {
                this._adjustChildBoxPositionForState(
                    box, wsTmbBox,
                    opt.WS_TMB_POSITION,
                    transitionParams,
                    6 // offset
                );
            }

            this._workspacesThumbnails.allocate(wsTmbBox);
        }

        if (this._dash.visible) {
            const wMaxWidth = width - spacing - wsTmbWidth - 2 * spacing -
                              (opt.DASH_VERTICAL ? dashWidth + spacing : 0);
            if (opt.WS_TMB_FULL && !opt.DASH_VERTICAL) {
                this._dash.setMaxSize(wMaxWidth, maxDashHeight);
                [, dashHeight] = this._dash.get_preferred_height(wMaxWidth);
                [, dashWidth] = this._dash.get_preferred_width(dashHeight);
                dashHeight = Math.min(dashHeight, maxDashHeight);
                dashWidth = Math.min(dashWidth, wMaxWidth);
            }

            let dashX = opt.DASH_RIGHT ? width - dashWidth : 0;
            let dashY = opt.DASH_TOP ? 0 : height - dashHeight;

            if (!opt.DASH_VERTICAL) {
                const dashLeftOffset = (opt.WS_TMB_FULL || opt.CENTER_DASH_WS) &&
                                        opt.WS_TMB_LEFT ? wsTmbWidth + spacing : 0;
                const dashRightOffset = (opt.WS_TMB_FULL || opt.CENTER_DASH_WS) &&
                                        opt.WS_TMB_RIGHT ? wsTmbWidth + spacing : 0;
                let offset = (width - dashWidth -
                    (opt.CENTER_DASH_WS && !this._xAlignCenter ? dashLeftOffset + dashRightOffset : 0)) / 2;
                offset -= opt.DASH_POSITION_ADJUSTMENT * (offset - spacing);
                dashX = (opt.CENTER_DASH_WS ? dashLeftOffset : 0) + offset;
                if (opt.WS_TMB_FULL) // Limit the adjustment while keeping the center of adjustment on the screen center
                    dashX = Math.clamp(dashLeftOffset + spacing, dashX, width - dashRightOffset - spacing - dashWidth);
            } else {
                const offset = (height - dashHeight) / 2;
                dashY = offset - opt.DASH_POSITION_ADJUSTMENT * (offset - spacing);
            }

            dashX = Math.round(startX + dashX);
            dashY = Math.round(startY + dashY);

            childBox.set_origin(dashX, dashY);
            childBox.set_size(dashWidth, dashHeight);

            // Animate dash if needed
            if (Me.run.enableOverviewTransitionAnimations) {
                this._adjustChildBoxPositionForState(
                    box, childBox,
                    opt.DASH_POSITION,
                    transitionParams,
                    6 // offset
                );
            }

            this._dash.allocate(childBox);
        }

        // Main view offsets
        const leftBoxOffset = (opt.DASH_LEFT ? dashWidth : spacing) +
                              (opt.WS_TMB_LEFT ? wsTmbWidth + spacing : 0);
        const rightBoxOffset = (opt.DASH_RIGHT ? dashWidth : spacing) +
                               (opt.WS_TMB_RIGHT ? wsTmbWidth + spacing : 0);
        let topBoxOffset = opt.DASH_TOP ? dashHeight - spacing : halfSpacing;
        const bottomBoxOffset = opt.DASH_BOTTOM ? dashHeight : spacing;
        const centeredBoxOffset = Math.max(leftBoxOffset, rightBoxOffset);

        // App grid needs to be calculated for the max wsTmbWidth in app grid, independently on the current wsTmb scale
        const wsTmbWidthAppGrid = Math.round(width * opt.MAX_THUMBNAIL_SCALE_APPGRID);
        const leftBoxOffsetAppGrid = (opt.DASH_LEFT ? dashWidth : spacing) +
                                     (opt.WS_TMB_LEFT ? wsTmbWidthAppGrid + spacing : 0);
        const rightBoxOffsetAppGrid = (opt.DASH_RIGHT ? dashWidth : spacing) +
                                      (opt.WS_TMB_RIGHT ? wsTmbWidthAppGrid + spacing : 0);

        // searchEntry
        const [searchEntryHeight] = this._searchEntry.get_preferred_height(width);
        const searchEntryY = startY + topBoxOffset + halfSpacing;

        const searchX = startX +
            (opt.CENTER_SEARCH_VIEW || this._xAlignCenter
                ? centeredBoxOffset
                : leftBoxOffset); // xAlignCenter is set by wsBox

        const searchWidth =
            width - (opt.CENTER_SEARCH_VIEW || this._xAlignCenter
                ? 2 * centeredBoxOffset
                : leftBoxOffset + rightBoxOffset);

        childBox.set_origin(searchX, searchEntryY);
        childBox.set_size(searchWidth, searchEntryHeight);

        // Animate searchEntry in/out if needed
        const searchActive = controlsManager._searchController.searchActive;
        if (Me.run.enableOverviewTransitionAnimations && !searchActive) {
            this._adjustChildBoxPositionForState(
                box, childBox,
                0, // Position TOP
                transitionParams,
                6 // offset
            );
        }

        this._searchEntry.allocate(childBox);

        // searchResults
        const searchY = opaqueSearchResults
            ? searchEntryY
            : searchEntryY + searchEntryHeight + spacing;
        const searchHeight = opaqueSearchResults
            ? height - topBoxOffset - bottomBoxOffset
            : height - topBoxOffset - bottomBoxOffset - searchEntryHeight - 2 * spacing;

        childBox.set_origin(searchX, searchY);
        childBox.set_size(searchWidth, searchHeight);
        this._searchController.allocate(childBox);

        // Add searchEntry height if needed
        topBoxOffset += opt.SHOW_SEARCH_ENTRY ? searchEntryHeight + spacing : 0;

        // workspace
        let params = [
            box,
            leftBoxOffset,
            rightBoxOffset,
            topBoxOffset,
            bottomBoxOffset,
            centeredBoxOffset,
            dashWidth,
            dashHeight,
        ];

        // Update cached boxes
        for (const state of Object.values(ControlsState)) {
            this._cachedWorkspaceBoxes.set(
                state, this._computeWorkspacesBoxForState(state, ...params));
        }

        let workspacesBox;
        if (!transitionParams.transitioning)
            workspacesBox = this._cachedWorkspaceBoxes.get(transitionParams.currentState);

        if (!workspacesBox) {
            const initialBox = this._cachedWorkspaceBoxes.get(transitionParams.initialState);
            const finalBox = this._cachedWorkspaceBoxes.get(transitionParams.finalState);
            workspacesBox = initialBox.interpolate(finalBox, transitionParams.progress);
        }

        this._workspacesDisplay.allocate(workspacesBox);

        // appDisplay
        // Keep space for the search entry above the the app grid if app grid search mode is enabled
        if (!opt.SHOW_SEARCH_ENTRY && opt.SEARCH_APP_GRID_MODE)
            topBoxOffset += searchEntryHeight  + spacing;
        params = [
            box,
            leftBoxOffsetAppGrid,
            rightBoxOffsetAppGrid,
            topBoxOffset,
            bottomBoxOffset,
        ];
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

        this._runPostAllocation();
    },
};

const ControlsManagerLayoutHorizontal = {
    _getThumbnailsBoxForState(state, dashWidth, dashHeight, searchEntryHeight, searchEntryPositionTop) {
        const wsTmbBox = new Clutter.ActorBox();
        const [width, height] = this._workAreaBoxForVShellConfig.get_size();
        const startX = this._workAreaBoxForVShellConfig.x1;
        const startY = this._workAreaBoxForVShellConfig.y1;
        const spacing = opt.SPACING;

        let wsTmbWidth = 0;
        let wsTmbHeight = 0;

        let maxWsTmbScale = state === ControlsState.APP_GRID
            ? opt.MAX_THUMBNAIL_SCALE_APPGRID
            : opt.MAX_THUMBNAIL_SCALE;

        wsTmbHeight = Math.round(height * maxWsTmbScale);

        let totalTmbSpacing;
        [totalTmbSpacing, wsTmbWidth] = this._workspacesThumbnails.get_preferred_width(wsTmbHeight);
        wsTmbWidth += totalTmbSpacing;

        const wstLeftOffset = !opt.WS_TMB_FULL && opt.DASH_LEFT ? dashWidth : spacing;
        const wstRightOffset = !opt.WS_TMB_FULL && opt.DASH_RIGHT ? dashWidth : spacing;
        const wstTopOffset = opt.DASH_TOP
            ? dashHeight
            : 0 + (searchEntryPositionTop
                ? searchEntryHeight + 2 * spacing
                : spacing);
        const wstBottomOffset = opt.DASH_BOTTOM ? dashHeight : spacing;

        const wsTmbWidthMax = width - wstLeftOffset - wstRightOffset;
        // Reduce size to fit wsTmb to the screen
        if (wsTmbWidth > wsTmbWidthMax) {
            wsTmbWidth = wsTmbWidthMax;
            wsTmbHeight = this._workspacesThumbnails.get_preferred_height(wsTmbWidth)[1];
        }

        wsTmbWidth = Math.max(wsTmbWidth, 1);
        wsTmbHeight = Math.max(wsTmbHeight, 1);

        let wsTmbY = opt.WS_TMB_TOP
            ? startY + wstTopOffset
            : startY + height - wstBottomOffset - wsTmbHeight;

        // Center wsTmb always to screen
        let offset = (width - wsTmbWidth) / 2;
        offset -= opt.WS_TMB_POSITION_ADJUSTMENT * offset;
        offset = Math.clamp(offset, wstLeftOffset, width - wsTmbWidth - wstRightOffset);
        let wsTmbX = Math.round(startX + offset);

        wsTmbBox.set_origin(wsTmbX, wsTmbY);
        wsTmbBox.set_size(wsTmbWidth, wsTmbHeight);

        return wsTmbBox;
    },

    vfunc_allocate(container, box) {
        const childBox = new Clutter.ActorBox();
        const startX = this._workAreaBoxForVShellConfig.x1;
        const startY = this._workAreaBoxForVShellConfig.y1;
        let [width, height] = this._workAreaBoxForVShellConfig.get_size();

        const spacing = opt.SPACING;
        const halfSpacing = opt.HALF_SPACING;

        const transitionParams = this._stateAdjustment.getStateTransitionParams();
        const controlsManager = Main.overview._overview.controls;
        const searchActive = controlsManager._searchController.searchActive;

        const opaqueSearchResults =
                (opt.OVERVIEW_MODE2 && !opt.WORKSPACE_MODE && transitionParams.currentState <= ControlsState.WINDOW_PICKER) ||
                opt.SEARCH_RESULTS_BG_STYLE;

        const searchEntryPositionTop =
                opt.SEARCH_ENTRY_POSITION_TOP &&
                opt.WS_TMB_TOP;

        // Panel
        const panelX = 0;
        let panelY = 0;
        if (Main.layoutManager.panelBox.get_parent() === controlsManager) {
            const [, pWidth] = Main.panel.get_preferred_width(height);
            const [, pHeight] = Main.panel.get_preferred_height(width);
            if (!opt.PANEL_POSITION_TOP)
                panelY = height; // box height is reduced by panel height

            childBox.set_origin(0, 0);
            childBox.set_size(pWidth, pHeight);
            Main.panel.allocate(childBox);
            childBox.set_origin(panelX, panelY);

            // Animate panel if needed
            if (Me.run.enableOverviewTransitionAnimations) {
                this._adjustChildBoxPositionForState(
                    box, childBox,
                    opt.PANEL_POSITION_TOP ? 0 : 2,
                    transitionParams,
                    6 // offset
                );
            }

            Main.layoutManager.panelBox.allocate(childBox);
        }

        // Dash
        const maxDashHeight = Math.round(box.get_height() * DASH_MAX_SIZE_RATIO);
        const maxDashWidth = Math.round(maxDashHeight * 0.8);
        let dashHeight = 0;
        let dashWidth = 0;

        // dash cloud be overridden by the Dash to Dock clone
        if (Me.Util.dashIsDashToDock()) {
            this._updatePositionFromDashToDock();
            // If DtD affects workArea, dash size needs to be 0
            const dash = Main.overview.dash;
            if (this._dashToDockAffectsWorkArea()) {
                if (opt.DASH_VERTICAL)
                    dashWidth = spacing;
                else
                    dashHeight = spacing;
            } else {
                dashHeight = dash.height;
                dashWidth = dash.width;
                if (opt.DASH_VERTICAL)
                    dashWidth += spacing;
                else
                    dashHeight += spacing;
            }
        } else if (this._dash.visible) {
            // Default dash
            if (!opt.DASH_VERTICAL) {
                this._dash.setMaxSize(width, maxDashHeight);
                [, dashHeight] = this._dash.get_preferred_height(width);
                [, dashWidth] = this._dash.get_preferred_width(dashHeight);
                dashHeight = Math.min(dashHeight, maxDashHeight);
                dashWidth = Math.min(dashWidth, width - spacing);
            } else if (!opt.WS_TMB_FULL) {
                this._dash.setMaxSize(maxDashWidth, height);
                [, dashWidth] = this._dash.get_preferred_width(height);
                [, dashHeight] = this._dash.get_preferred_height(dashWidth);
                dashHeight = Math.min(dashHeight, height - spacing);
                dashWidth = Math.min(dashWidth, width);
            }
        }

        const [searchEntryHeight] = this._searchEntry.get_preferred_height(width);

        // Workspace Thumbnails
        // let wsTmbWidth = 0;
        let wsTmbHeight = 0;
        let wsTmbHeightForSearchEntry = 0;

        if (opt.SHOW_WS_TMB) {
            const searchInProgress =
                controlsManager._searchInProgress &&
                !(opt.SEARCH_APP_GRID_MODE && Main.overview.dash.showAppsButton.checked);
            const getState = state =>
                state <= ControlsState.WINDOW_PICKER ||
                searchInProgress || // Show the thumbnails before workspacesDisplay is hidden to avoid glitches
                (opt.WS_ANIMATION_ALL && transitionParams.currentState < 1.99 /* ControlsState.APP_GRID*/)
                    ? ControlsState.WINDOW_PICKER
                    : ControlsState.APP_GRID;
            const initialState = getState(transitionParams.initialState);
            const finalState = getState(transitionParams.finalState);
            const params = [dashWidth, dashHeight, searchEntryHeight, searchEntryPositionTop];
            const initialBox = this._getThumbnailsBoxForState(initialState, ...params);
            let wsTmbBox;
            if (opt.MAX_THUMBNAIL_SCALE_STABLE) {
                wsTmbBox = initialBox;
            } else {
                const finalBox = this._getThumbnailsBoxForState(finalState, ...params);
                wsTmbBox = initialBox.interpolate(finalBox, transitionParams.progress);
            }
            // wsTmbWidth = Math.round(wsTmbBox.get_width());
            wsTmbHeight = Math.round(wsTmbBox.get_height());

            if (!searchActive && !opt.SHOW_SEARCH_ENTRY && opt.SEARCH_APP_GRID_MODE &&
                transitionParams.currentState > ControlsState.WINDOW_PICKER &&
                opt.WS_ANIMATION_ALL && !opt.MAX_THUMBNAIL_SCALE_STABLE
            ) {
                const wsTmbBoxForSearch = this._getThumbnailsBoxForState(ControlsState.APP_GRID, ...params);
                wsTmbHeightForSearchEntry = wsTmbBoxForSearch.get_height();
            } else {
                wsTmbHeightForSearchEntry = wsTmbHeight;
            }

            // Animate ws thumbnails if needed
            if (Me.run.enableOverviewTransitionAnimations) {
                this._adjustChildBoxPositionForState(
                    box, wsTmbBox,
                    opt.WS_TMB_POSITION,
                    transitionParams,
                    6 // offset
                );
            }

            this._workspacesThumbnails.allocate(wsTmbBox);
        }

        if (this._dash.visible) {
            if (opt.WS_TMB_FULL && opt.DASH_VERTICAL) {
                const wMaxHeight = height - spacing - wsTmbHeight;
                this._dash.setMaxSize(maxDashWidth, wMaxHeight);
                [, dashWidth] = this._dash.get_preferred_width(wMaxHeight);
                [, dashHeight] = this._dash.get_preferred_height(dashWidth);
                dashWidth = Math.min(dashWidth, maxDashWidth);
                dashHeight = Math.min(dashHeight, wMaxHeight);
            }

            let dashX = opt.DASH_RIGHT ? width - dashWidth : 0;
            let dashY = opt.DASH_TOP ? 0 : height - dashHeight;

            if (opt.DASH_VERTICAL) {
                const dashTopOffset = (opt.WS_TMB_FULL || opt.CENTER_DASH_WS) &&
                                      opt.WS_TMB_TOP ? wsTmbHeight + spacing : 0;
                const dashBottomOffset = (opt.WS_TMB_FULL || opt.CENTER_DASH_WS) &&
                                         opt.WS_TMB_BOTTOM ? wsTmbHeight + spacing : 0;
                let offset = (height - dashHeight - (opt.CENTER_DASH_WS ? dashTopOffset + dashBottomOffset : 0)) / 2;
                offset -= opt.DASH_POSITION_ADJUSTMENT * (offset - spacing);
                dashY = (opt.CENTER_DASH_WS ? dashTopOffset : 0) + offset;
                if (opt.WS_TMB_FULL) { // Limit the adjustment while keeping the center of adjustment on the screen center
                    dashY = Math.clamp(
                        dashTopOffset + spacing,
                        dashY,
                        height - dashBottomOffset - spacing - dashHeight
                    );
                }
            } else {
                const offset = (width - dashWidth) / 2;
                dashX = offset - opt.DASH_POSITION_ADJUSTMENT * (offset - spacing);
            }

            dashX = Math.round(startX + dashX);
            dashY = Math.round(startY + dashY);

            childBox.set_origin(dashX, dashY);
            childBox.set_size(dashWidth, dashHeight);

            // Animate dash if needed
            if (Me.run.enableOverviewTransitionAnimations) {
                this._adjustChildBoxPositionForState(
                    box, childBox,
                    opt.DASH_POSITION,
                    transitionParams,
                    6 // offset
                );
            }

            this._dash.allocate(childBox);
        }

        // Main view offsets
        const leftBoxOffset = opt.DASH_LEFT ? dashWidth : spacing;
        const rightBoxOffset = opt.DASH_RIGHT ? dashWidth : spacing;
        let topBoxOffset = (opt.DASH_TOP ? dashHeight : halfSpacing) +
                           (opt.WS_TMB_TOP ? wsTmbHeight + spacing : 0);
        const bottomBoxOffset = (opt.DASH_BOTTOM ? dashHeight : spacing) +
                                (opt.WS_TMB_BOTTOM ? wsTmbHeight + spacing : 0);
        const centeredBoxOffset = Math.max(leftBoxOffset, rightBoxOffset);

        // App grid needs to be calculated for the max wsTmbWidth in app grid, independently on the current wsTmb scale
        const wsTmbHeightAppGrid = Math.round(height * opt.MAX_THUMBNAIL_SCALE_APPGRID);
        let topBoxOffsetAppGrid = (opt.DASH_TOP ? dashHeight : halfSpacing) +
                                  (opt.WS_TMB_TOP ? wsTmbHeightAppGrid + spacing : 0) +
                                  (opt.SHOW_SEARCH_ENTRY ? searchEntryHeight : 0);
        const bottomBoxOffsetAppGrid = (opt.DASH_BOTTOM ? dashHeight : spacing) +
                                       (opt.WS_TMB_BOTTOM ? wsTmbHeightAppGrid + spacing : 0);

        // searchEntry
        let topBoxOffsetForSearch = topBoxOffset;
        if (opt.WS_TMB_TOP && wsTmbHeight !== wsTmbHeightForSearchEntry)
            topBoxOffsetForSearch -= wsTmbHeight - wsTmbHeightForSearchEntry;

        let searchEntryY = startY +
            (searchEntryPositionTop ? halfSpacing : topBoxOffsetForSearch);

        const searchX = startX +
            (opt.CENTER_SEARCH_VIEW || this._xAlignCenter
                ? centeredBoxOffset
                : leftBoxOffset); // xAlignCenter is set by wsBox

        const searchWidth =
            width - (opt.CENTER_SEARCH_VIEW || this._xAlignCenter
                ? 2 * centeredBoxOffset
                : leftBoxOffset + rightBoxOffset);

        childBox.set_origin(searchX, searchEntryY);
        childBox.set_size(searchWidth, searchEntryHeight);

        // Animate searchEntry in/out if needed
        if (Me.run.enableOverviewTransitionAnimations && !searchActive) {
            this._adjustChildBoxPositionForState(
                box, childBox,
                0, // Position TOP
                transitionParams,
                6 // offset
            );
        }

        this._searchEntry.allocate(childBox);

        // searchResults
        const searchResultsOffset = opt.SEARCH_ENTRY_POSITION_TOP && opt.WS_TMB_TOP ? wsTmbHeight + 2 * spacing : 0;
        const searchY = opaqueSearchResults
            ? searchEntryY
            : searchEntryY + searchEntryHeight + spacing + searchResultsOffset;
        const searchHeight = opaqueSearchResults
            ? height - topBoxOffset - bottomBoxOffset
            : height - topBoxOffset - bottomBoxOffset - searchEntryHeight - 2 * spacing;

        childBox.set_origin(searchX, searchY);
        childBox.set_size(searchWidth, searchHeight);
        this._searchController.allocate(childBox);

        // Add searchEntry height if needed
        topBoxOffset += opt.SHOW_SEARCH_ENTRY ? searchEntryHeight + spacing : 0;

        // Workspace
        let params = [
            box,
            leftBoxOffset,
            rightBoxOffset,
            topBoxOffset,
            bottomBoxOffset,
            centeredBoxOffset,
            dashWidth, dashHeight, searchEntryHeight, searchEntryPositionTop,
        ];

        // Update cached boxes
        for (const state of Object.values(ControlsState)) {
            this._cachedWorkspaceBoxes.set(
                state, this._computeWorkspacesBoxForState(state, ...params));
        }

        let workspacesBox;
        if (!transitionParams.transitioning)
            workspacesBox = this._cachedWorkspaceBoxes.get(transitionParams.currentState);

        if (!workspacesBox) {
            const initialBox = this._cachedWorkspaceBoxes.get(transitionParams.initialState);
            const finalBox = this._cachedWorkspaceBoxes.get(transitionParams.finalState);
            workspacesBox = initialBox.interpolate(finalBox, transitionParams.progress);
        }

        this._workspacesDisplay.allocate(workspacesBox);

        // appDisplay
        // Keep space for the search entry above app grid if app grid search mode is enabled
        if (!opt.SHOW_SEARCH_ENTRY && opt.SEARCH_APP_GRID_MODE)
            topBoxOffsetAppGrid += searchEntryHeight + spacing;
        params = [
            box,
            leftBoxOffset === spacing ? 0 : leftBoxOffset,
            rightBoxOffset === spacing ? 0 : rightBoxOffset,
            topBoxOffsetAppGrid,
            bottomBoxOffsetAppGrid,
        ];
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

        this._runPostAllocation();
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
