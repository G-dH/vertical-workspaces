/**
 * V-Shell (Vertical Workspaces)
 * overviewControls.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2024
 * @license    GPL-3.0
 *
 */

'use strict';

const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Shell = imports.gi.Shell;
const St = imports.gi.St;

const Background = imports.ui.background;
const Main = imports.ui.main;
const Overview = imports.ui.overview;
const OverviewControls = imports.ui.overviewControls;
const Workspace = imports.ui.workspace;
const WorkspaceThumbnail = imports.ui.workspaceThumbnail;
const WorkspacesView = imports.ui.workspacesView;
const Util = imports.misc.util;

let Me;
let opt;
// gettext
let _;

const ControlsState = OverviewControls.ControlsState;
const FitMode = WorkspacesView.FitMode;

const STARTUP_ANIMATION_TIME = 500;
const ANIMATION_TIME = Overview.ANIMATION_TIME;
const SIDE_CONTROLS_ANIMATION_TIME = Overview.ANIMATION_TIME;
const DASH_MAX_SIZE_RATIO = 0.35;

let _timeouts;

var OverviewControlsModule = class {
    constructor(me) {
        Me = me;
        opt = Me.opt;
        _  = Me.gettext;

        this._firstActivation = true;
        this.moduleEnabled = false;
        this._overrides = null;
    }

    cleanGlobals() {
        Me = null;
        opt = null;
        _ = null;
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
        if (!this._overrides)
            this._overrides = new  Me.Util.Overrides();

        _timeouts = {};

        this._replaceOnSearchChanged();

        this._overrides.addOverride('ControlsManager', OverviewControls.ControlsManager.prototype, ControlsManagerCommon);
        this._overrides.addOverride('ControlsManagerLayoutCommon', OverviewControls.ControlsManagerLayout.prototype, ControlsManagerLayoutCommon);
        if (opt.ORIENTATION === Clutter.Orientation.VERTICAL)
            this._overrides.addOverride('ControlsManagerLayout', OverviewControls.ControlsManagerLayout.prototype, ControlsManagerLayoutVertical);
        else
            this._overrides.addOverride('ControlsManagerLayout', OverviewControls.ControlsManagerLayout.prototype, ControlsManagerLayoutHorizontal);

        // Allow user to close the overview by clicking on an empty space on the primary monitor's overview
        // Secondary monitors are handled in workspacesView
        this._addClickToCloseOverview();

        // Update custom workAreaBox
        Main.overview._overview.controls.layoutManager._updateWorkAreaBox();

        console.debug('  OverviewControlsModule - Activated');
    }

    _disableModule() {
        if (this._overrides)
            this._overrides.removeAll();
        this._overrides = null;

        const reset = true;
        this._replaceOnSearchChanged(reset);
        Main.overview._overview._controls._appDisplay.opacity = 255;
        this._addClickToCloseOverview(reset);

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

    _replaceOnSearchChanged(reset) {
        const searchController = Main.overview._overview.controls._searchController;
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
            Main.overview.searchEntry.visible = true;
            Main.overview.searchEntry.opacity = 255;
        } else {
            // reconnect signal to use custom function (callbacks cannot be overridden in class prototype, they are already in memory as a copy for the given callback)
            if (!this._originalSearchControllerSigId) {
                this._originalSearchControllerSigId = GObject.signal_handler_find(searchController, { signalId: 'notify', detail: 'search-active' });
                if (this._originalSearchControllerSigId)
                    searchController.block_signal_handler(this._originalSearchControllerSigId);
            }

            if (!this._searchControllerSigId)
                this._searchControllerSigId = searchController.connect('notify::search-active', () => Main.overview._overview.controls._onSearchChanged());
        }
    }

    _addClickToCloseOverview(reset) {
        const overview = Main.overview._overview;
        const thumbnailsBox = overview.controls._thumbnailsBox;

        overview.reactive = false;
        if (this._clickEmptyConId) {
            overview.disconnect(this._clickEmptyConId);
            this._clickEmptyConId = 0;
        }

        if (this._tmbBoxClickConnection) {
            thumbnailsBox.disconnect(this._tmbBoxClickConnection);
            this._tmbBoxClickConnection = 0;
        }

        if (this._tmbClickAction) {
            thumbnailsBox.remove_action(this._tmbClickAction);
            delete this._tmbClickAction;
        }

        if (reset || !opt.CLICK_EMPTY_CLOSE)
            return;

        // This click action is implemented in GS 45+
        if (!this._tmbClickAction) {
            const clickAction = new Clutter.ClickAction();
            clickAction.connect('clicked', () => {
                thumbnailsBox._activateThumbnailAtPoint(
                    ...clickAction.get_coords(),
                    Clutter.get_current_event_time());
            });
            thumbnailsBox.add_action(clickAction);
            this._tmbClickAction = clickAction;
        }

        this._tmbBoxClickConnection = thumbnailsBox.connect('button-release-event', () => Clutter.EVENT_STOP);

        overview.reactive = true;
        this._clickEmptyConId = overview.connect('button-release-event', (actor, event) => {
            const button = event.get_button();
            const overviewState = overview.controls._stateAdjustment.value;
            const buttonPrimary = button === Clutter.BUTTON_PRIMARY;
            const buttonSecondary = button === Clutter.BUTTON_SECONDARY;
            const buttonAny = buttonPrimary || buttonSecondary;

            if ((overviewState === 1 && buttonAny) || (overviewState === 2 && buttonSecondary))
                Main.overview.hide();
        });
    }
};

const ControlsManagerCommon = {
    // this function is used as a callback by a signal handler, needs to be reconnected after modification as the original callback uses a copy of the original function
    /* _update: function() {
        ...
    }*/

    prepareToEnterOverview() {
        this._searchController.prepareToEnterOverview();
        this._workspacesDisplay.prepareToEnterOverview();

        // Workaround for thumbnailsBox not re-scaling after switching workspace outside of overview using a trackpad
        this._thumbnailsBox._updateIndicator();

        Main.overview._overview.controls.opacity = 255;

        // Ensure that overview backgrounds are ready when needed
        if (!this._bgManagers && (opt.SHOW_BG_IN_OVERVIEW || !opt.SHOW_WS_PREVIEW_BG))
            this._setBackground();
        else if (this._bgManagers && !(opt.SHOW_BG_IN_OVERVIEW || !opt.SHOW_WS_PREVIEW_BG))
            this._setBackground(true);

        // Force updating the app grid order
        if (opt.APP_GRID_USAGE)
            this._appDisplay._redisplay();

        // store pointer X coordinate for OVERVIEW_MODE 1 - to prevent immediate switch to WORKSPACE_MODE 1 if the mouse pointer is steady
        opt.showingPointerX = global.get_pointer()[0];

        this._updateSearchStyle();
    },

    // this function has duplicate in WorkspaceView so we use one function for both to avoid issues with syncing them
    _getFitModeForState(state) {
        return _getFitModeForState(state);
    },

    _updateThumbnailsBox() {
        const { shouldShow } = this._thumbnailsBox;
        const thumbnailsBoxVisible = shouldShow;
        this._thumbnailsBox.visible = thumbnailsBoxVisible;

        // this call should be directly in _update(), but it's used as a callback function and it would require to reconnect the signal
        this._updateOverview();
    },

    // this function is pure addition to the original code and handles wsDisp transition to APP_GRID view
    _updateOverview() {
        this._workspacesDisplay.translation_x = 0;
        this._workspacesDisplay.translation_y = 0;
        this._workspacesDisplay.scale_x = 1;
        this._workspacesDisplay.scale_y = 1;
        const { initialState, finalState, progress, currentState } = this._stateAdjustment.getStateTransitionParams();

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

        let workspacesDisplayVisible = opacity !== 0;

        // improve transition from search results to desktop
        if (finalState === 0 && this._searchController._searchResults.visible)
            this._searchController.hide();

        // reset Static Workspace window picker mode
        if (currentState === 0 && opt.OVERVIEW_MODE && opt.WORKSPACE_MODE)
            opt.WORKSPACE_MODE = 0;

        if (currentState < 2 && currentState > 1)
            WorkspaceThumbnail.RESCALE_ANIMATION_TIME = 0;
        else
            WorkspaceThumbnail.RESCALE_ANIMATION_TIME = 200;

        if (!opt.WS_ANIMATION || (!opt.SHOW_WS_TMB && opt.SHOW_WS_PREVIEW_BG)) {
            this._workspacesDisplay.opacity = opacity;
        } else if (!opt.SHOW_WS_TMB_BG && opt.SHOW_WS_PREVIEW_BG) {
            // fade out ws wallpaper during transition to ws switcher if ws switcher background disabled

            /* const ws = this._workspacesDisplay._workspacesViews[global.display.get_primary_monitor()]?._workspaces[this._workspaceAdjustment.value];
            if (ws)
                ws._background.opacity = opacity;*/

            const workspaces = this._workspacesDisplay._workspacesViews[global.display.get_primary_monitor()]?._workspaces;
            // Speed up the workspace background opacity transition
            if (opt.WORKSPACE_MAX_SPACING < opt.WS_MAX_SPACING_OFF_SCREEN && workspaces)
                // If workspacesDisplay max spacing is set so adjacent workspaces could be visible on the screen
                workspaces.forEach(w => w._background.set_opacity(Math.max(0, opacity - (255 - opacity))));
            else if (workspaces)
                // If adjacent workspaces should not be visible on the screen, set the opacity only for the visible one
                workspaces[this._workspaceAdjustment.value]?._background.set_opacity(Math.max(0, opacity - (255 - opacity)));
        }

        if (opt.WORKSPACE_MODE)
            Workspace.WINDOW_PREVIEW_MAXIMUM_SCALE = 0.95;

        // if ws preview background is disabled, animate tmb box and dash
        const tmbBox = this._thumbnailsBox;
        const dash = this.dash;
        const searchEntryBin = this._searchEntryBin;
        // this dash transition collides with startup animation and freezes GS for good, needs to be delayed (first Main.overview 'hiding' event enables it)
        const skipDash =  Me.Util.dashNotDefault();

        // OVERVIEW_MODE 2 should animate dash and wsTmbBox only if WORKSPACE_MODE === 0 (windows not spread)
        const animateOverviewMode2 = opt.OVERVIEW_MODE2 && !(finalState === 1 && opt.WORKSPACE_MODE && !Main.overview.animationInProgress);
        if (!Main.layoutManager._startingUp && ((!opt.SHOW_WS_PREVIEW_BG && !opt.OVERVIEW_MODE2) || animateOverviewMode2)) {
            if (!tmbBox._translationOriginal || Math.abs(tmbBox._translationOriginal[0]) > 500) {
                // swipe gesture can call this calculation before tmbBox gets its allocation, giving nonsense width
                const [dashTranslationX, dashTranslationY, tmbTranslationX, tmbTranslationY, searchTranslationY] =
                    this._getOverviewTranslations(dash, tmbBox, searchEntryBin);
                tmbBox._translationOriginal = [tmbTranslationX, tmbTranslationY];
                dash._translationOriginal = [dashTranslationX, dashTranslationY];
                searchEntryBin._translationOriginal = searchTranslationY;
            }
            if (finalState === 0 || initialState === 0) {
                const prg = Math.abs((finalState === 0 ? 0 : 1) - progress);
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
                if (!skipDash)
                    dash._translationOriginal = 0;

                searchEntryBin._translationOriginal = 0;
            }
        } else if (!Main.layoutManager._startingUp && (tmbBox.translation_x || tmbBox.translation_y)) {
            tmbBox.translation_x = 0;
            tmbBox.translation_y = 0;
            if (!skipDash) {
                dash.translation_x = 0;
                dash.translation_y = 0;
            }
            searchEntryBin.translation_y = 0;
        }

        if (!Main.layoutManager._startingUp) {
            if (initialState === ControlsState.HIDDEN && finalState === ControlsState.APP_GRID)
                this._appDisplay.opacity = Math.round(progress * 255);
            else
                this._appDisplay.opacity = 255 - opacity;
        }

        if (currentState === ControlsState.APP_GRID) {
            // in app grid hide workspaces so they're not blocking app grid or ws thumbnails
            this._workspacesDisplay.scale_x = 0;
        } else {
            this._workspacesDisplay.scale_x = 1;
        }

        this._workspacesDisplay.setPrimaryWorkspaceVisible(workspacesDisplayVisible);

        if (!this.dash._isAbove && progress > 0 && opt.OVERVIEW_MODE2) {
            // set searchEntry above appDisplay
            this.set_child_above_sibling(this._searchEntryBin, null);
            // move dash above wsTmb for case that dash and wsTmb animate from the same side
            if (!Me.Util.dashNotDefault())
                this.set_child_above_sibling(dash, null);
            this.set_child_below_sibling(this._thumbnailsBox, null);
            this.set_child_below_sibling(this._workspacesDisplay, null);
            this.set_child_below_sibling(this._appDisplay, null);
        } else if (!this.dash._isAbove && progress === 1 && finalState > ControlsState.HIDDEN) {
            // set dash above workspace in the overview
            this.set_child_above_sibling(this._thumbnailsBox, null);
            this.set_child_above_sibling(this._searchEntryBin, null);
            if (!Me.Util.dashNotDefault())
                this.set_child_above_sibling(this.dash, null);
            if (Main.layoutManager.panelBox.get_parent() === Main.layoutManager.overviewGroup)
                Main.layoutManager.overviewGroup.set_child_above_sibling(Main.layoutManager.panelBox, Main.overview._overview);
            this.dash._isAbove = true;
        } else if (this.dash._isAbove && progress < 1) {
            // keep dash below for ws transition between the overview and hidden state
            this.set_child_above_sibling(this._workspacesDisplay, null);
            if (Main.layoutManager.panelBox.get_parent() === Main.layoutManager.overviewGroup)
                Main.layoutManager.overviewGroup.set_child_below_sibling(Main.layoutManager.panelBox, Main.overview._overview);
            this.dash._isAbove = false;
        }

    },

    // fix for upstream bug - appGrid.visible after transition from APP_GRID to HIDDEN
    _updateAppDisplayVisibility(stateTransitionParams = null) {
        if (!stateTransitionParams)
            stateTransitionParams = this._stateAdjustment.getStateTransitionParams();

        const { currentState } = stateTransitionParams;

        // if !APP_GRID_ANIMATION, appGrid needs to be hidden in WINDOW_PICKER mode (1)
        // but needs to be visible for transition from HIDDEN (0) to APP_GRID (2)
        this._appDisplay.visible =
            currentState > ControlsState.HIDDEN && this._appDisplay.opacity > 0 &&
            (!this._searchController.searchActive || (opt.SEARCH_APP_GRID_MODE && this.dash.showAppsButton.checked)) &&
            !(currentState === ControlsState.WINDOW_PICKER && !opt.APP_GRID_ANIMATION) &&
            !this._searchInProgress;
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
        }
    },

    _deactivateSearchAppGridMode() {
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
        if (searchActive && appSearchModeActive)
            this._activateSearchAppGridMode();
        else
            this._deactivateSearchAppGridMode();
        return appSearchModeActive;
    },

    _onSearchChanged() {
        const { finalState } = this._stateAdjustment.getStateTransitionParams();
        const { searchActive } = this._searchController;

        this._updateSearchEntryVisibility(searchActive);

        // If the user starts typing or activates the search provider during the overview animation,
        // this function will be called again after the overview animation finishes
        if (opt.SEARCH_VIEW_ANIMATION && Main.overview._animationInProgress && finalState === ControlsState.WINDOW_PICKER)
            return;

        this._updateSearchStyle();
        this._searchInProgress = true;

        if (this._searchAppGridMode(searchActive) && searchActive)
            return;

        if (opt.SHOW_BG_IN_OVERVIEW && this._bgManagers)
            this._updateBackground(this._bgManagers[0]);

        this._fadeWorkspaces(searchActive);
        this._fadeSearchResults(searchActive);
        this._fadeAppDisplay(searchActive);
        // reuse overview transition, just replace APP_GRID with the search view
        this._shiftOverviewStateIfNeeded(searchActive, finalState);
        this._animateSearchResultsIfNeeded(searchActive);
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
                this._searchInProgress = searchActive;
                this._workspacesDisplay.setPrimaryWorkspaceVisible(true);
            },
        });
    },

    _updateSearchEntryVisibility(searchActive) {
        const entry = this._searchEntry;

        entry.remove_all_transitions();
        if (opt.SHOW_SEARCH_ENTRY) {
            entry.visible = true;
            entry.opacity = 255;
        } else if (!(searchActive && entry.visible)) {
            entry.visible = true;
            entry.opacity = searchActive ? 0 : 255;
            // show search entry only if the user starts typing, and hide it when leaving the search mode
            entry.ease({
                opacity: searchActive ? 255 : 0,
                duration: SIDE_CONTROLS_ANIMATION_TIME / 2,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onStopped: () => {
                    entry.visible = searchActive;
                    entry.opacity = 255;
                },
            });
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
                    this._searchInProgress = searchActive;
                this._updateAppDisplayVisibility();
            },
        });
    },

    _fadeWorkspaces(searchActive) {
        if (/* searchActive &&*/ !opt.SEARCH_VIEW_ANIMATION && !(opt.OVERVIEW_MODE2 && !opt.WORKSPACE_MODE)) {
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
                duration: SIDE_CONTROLS_ANIMATION_TIME,
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

        this._searchController._searchResults._statusBin.opacity = 1;

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
                this._searchController._searchResults._statusBin.opacity = 255;
            },
        });
    },

    _updateSearchStyle(reset) {
        if (!reset && (opt.OVERVIEW_MODE2 && !opt.WORKSPACE_MODE && !this.dash.showAppsButton.checked)) {
            this._searchController._searchResults._content.add_style_class_name('search-section-content-bg-om2');
            this._searchEntry.add_style_class_name('search-entry-om2');
        } else {
            this._searchController._searchResults._content.remove_style_class_name('search-section-content-bg-om2');
            this._searchEntry.remove_style_class_name('search-entry-om2');
        }
    },

    async runStartupAnimation(callback) {
        this._ignoreShowAppsButtonToggle = true;

        this.prepareToEnterOverview();
        this._stateAdjustment.value = ControlsState.HIDDEN;
        this._stateAdjustment.ease(ControlsState.WINDOW_PICKER, {
            duration: ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });

        this.dash.showAppsButton.checked = false;
        this._ignoreShowAppsButtonToggle = false;

        // Set the opacity here to avoid a 1-frame flicker
        this.opacity = 1;
        this._appDisplay.opacity = 1;
        // We can't run the animation before the first allocation happens
        await this.layout_manager.ensureAllocation();
        this._setBackground();
        Me.Modules.panelModule.update();
        Main.panel.opacity = 255;

        // Opacity
        this.ease({
            opacity: opt.STARTUP_STATE === 1 ? 0 : 255,
            duration: STARTUP_ANIMATION_TIME,
            mode: Clutter.AnimationMode.LINEAR,
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
        const [dashTranslationX, dashTranslationY, tmbTranslationX, tmbTranslationY, searchTranslationY] =
             this._getOverviewTranslations(dash, tmbBox, searchEntryBin);

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
        }.bind(this);

        if (searchEntryBin.visible) {
            searchEntryBin.translation_y = searchTranslationY;
            searchEntryBin.ease({
                translation_y: 0,
                delay: STARTUP_ANIMATION_TIME / 2,
                duration: STARTUP_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }

        if (tmbBox.visible) {
            tmbBox.translation_x = tmbTranslationX;
            tmbBox.translation_y = tmbTranslationY;
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
                    const secTmbBox = view._thumbnails;

                    if (opt.SEC_WS_TMB_LEFT)
                        secTmbBox.translation_x = -(secTmbBox.width + 12); // compensate for padding
                    else if (opt.SEC_WS_TMB_RIGHT)
                        secTmbBox.translation_x = secTmbBox.width + 12;
                    else if (opt.SEC_WS_TMB_TOP)
                        secTmbBox.translation_y = -(secTmbBox.height + 12);
                    else if (opt.SEC_WS_TMB_BOTTOM)
                        secTmbBox.translation_y = secTmbBox.height + 12;

                    secTmbBox.opacity = 255;

                    secTmbBox.ease({
                        translation_y: 0,
                        delay: STARTUP_ANIMATION_TIME / 2,
                        duration: STARTUP_ANIMATION_TIME,
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    });
                }
            }
        }

        if (dash.visible && !Me.Util.dashNotDefault()) {
            dash.translation_x = dashTranslationX;
            dash.translation_y = dashTranslationY;
            dash.opacity = 255;
            dash.ease({
                translation_x: 0,
                translation_y: 0,
                delay: STARTUP_ANIMATION_TIME / 2,
                duration: STARTUP_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onStopped,
            });
        } else {
            // set dash opacity to make it visible if user enable it later
            dash.opacity = 255;
            // if dash is hidden, substitute the ease timeout with GLib.timeout
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
        }
    },

    _realizeAppDisplayAndFinishSequence() {
        const appDisplayModule = Me.Modules.appDisplayModule;
        // realize app grid for smoother first animation
        appDisplayModule._repopulateAppDisplay(false, this._finishStartupSequence.bind(this));
    },

    _finishStartupSequence() {
        if (!this._bgManagers)
            this._setBackground();

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

    setInitialTranslations() {
        const dash = this.dash;
        const tmbBox = this._thumbnailsBox;
        const searchEntryBin = this._searchEntryBin;
        const [dashTranslationX, dashTranslationY, tmbTranslationX, tmbTranslationY, searchTranslationY] =
             this._getOverviewTranslations(dash, tmbBox, searchEntryBin);
        if (!Me.Util.dashNotDefault()) {
            dash.translation_x = dashTranslationX;
            dash.translation_y = dashTranslationY;
        }
        tmbBox.translation_x = tmbTranslationX;
        tmbBox.translation_y = tmbTranslationY;
        searchEntryBin.translation_y = searchTranslationY;
    },

    _getOverviewTranslations(dash, tmbBox, searchEntryBin) {
        const animationsDisabled = !St.Settings.get().enable_animations || ((opt.SHOW_WS_PREVIEW_BG && !opt.OVERVIEW_MODE2) && !Main.layoutManager._startingUp);
        if (animationsDisabled)
            return [0, 0, 0, 0, 0];

        let searchTranslationY = 0;
        if (searchEntryBin.visible) {
            const offset = (dash.visible && (!opt.DASH_VERTICAL ? dash.height + 12 : 0)) +
                (opt.WS_TMB_TOP ? tmbBox.height + 12 : 0);
            searchTranslationY = -searchEntryBin.height - offset - 30;
        }

        let tmbTranslationX = 0;
        let tmbTranslationY = 0;
        let offset;
        if (tmbBox.visible) {
            const tmbWidth = tmbBox.width === Infinity ? 0 : tmbBox.width;
            const tmbHeight = tmbBox.height === Infinity ? 0 : tmbBox.height;
            switch (opt.WS_TMB_POSITION) {
            case 3: // left
                offset = 10 + (dash?.visible && opt.DASH_LEFT ? dash.width : 0);
                tmbTranslationX = -tmbWidth - offset;
                tmbTranslationY = 0;
                break;
            case 1: // right
                offset = 10 + (dash?.visible && opt.DASH_RIGHT ? dash.width : 0);
                tmbTranslationX = tmbWidth + offset;
                tmbTranslationY = 0;
                break;
            case 0: // top
                offset = 10 + (dash?.visible && opt.DASH_TOP ? dash.height : 0) + Main.panel.height;
                tmbTranslationX = 0;
                tmbTranslationY = -tmbHeight - offset;
                break;
            case 2: // bottom
                offset = 10 + (dash?.visible && opt.DASH_BOTTOM ? dash.height : 0) + Main.panel.height;  // just for case the panel is at bottom
                tmbTranslationX = 0;
                tmbTranslationY = tmbHeight + offset;
                break;
            }
        }

        let dashTranslationX = 0;
        let dashTranslationY = 0;
        let position = opt.DASH_POSITION;
        // if DtD replaced the original Dash, read its position
        if (Me.Util.dashIsDashToDock())
            position = dash._position;

        if (dash?.visible) {
            const dashWidth = dash.width === Infinity ? 0 : dash.width;
            const dashHeight = dash.height === Infinity ? 0 : dash.height;
            switch (position) {
            case 0: // top
                dashTranslationX = 0;
                dashTranslationY = -dashHeight - dash.margin_bottom - Main.panel.height;
                break;
            case 1: // right
                dashTranslationX = dashWidth;
                dashTranslationY = 0;
                break;
            case 2: // bottom
                dashTranslationX = 0;
                dashTranslationY = dashHeight + dash.margin_bottom + Main.panel.height;
                break;
            case 3: // left
                dashTranslationX = -dashWidth;
                dashTranslationY = 0;
                break;
            }
        }

        return [dashTranslationX, dashTranslationY, tmbTranslationX, tmbTranslationY, searchTranslationY];
    },

    animateToOverview(state, callback) {
        this._ignoreShowAppsButtonToggle = true;
        this._searchInProgress = false;

        this._stateAdjustment.value = ControlsState.HIDDEN;

        // building window thumbnails takes some time and with many windows on the workspace
        // the time can be close to or longer than ANIMATION_TIME
        // in which case the the animation is greatly delayed, stuttering, or even skipped
        // for user it is more acceptable to watch delayed smooth animation,
        // even if it takes little more time, than jumping frames
        let delay = 0;
        if (opt.DELAY_OVERVIEW_ANIMATION)
            delay = global.display.get_tab_list(0, null).length * opt.DELAY_PER_WINDOW;

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

    _setBackground(reset = false) {
        if (this._bgManagers) {
            this._bgManagers.forEach(bg => {
                this._stateAdjustment.disconnect(bg._fadeSignal);
                bg.destroy();
            });
        }

        // if (!SHOW_BG_IN_OVERVIEW && !SHOW_WS_PREVIEW_BG) the background is used for static transition from wallpaper to empty bg in the overview
        if (reset || (!opt.SHOW_BG_IN_OVERVIEW && opt.SHOW_WS_PREVIEW_BG)) {
            delete this._bgManagers;
            return;
        }

        this._bgManagers = [];
        for (const monitor of Main.layoutManager.monitors) {
            const bgManager = new Background.BackgroundManager({
                monitorIndex: monitor.index,
                container: Main.layoutManager.overviewGroup,
                vignette: true,
            });

            bgManager.backgroundActor.content.vignette_sharpness = 0;
            bgManager.backgroundActor.content.brightness = 1;

            bgManager._fadeSignal = this._stateAdjustment.connect('notify::value', v => {
                this._updateBackground(bgManager, v.value, v);
            });

            if (monitor.index === global.display.get_primary_monitor()) {
                bgManager._primary = true;
                this._bgManagers.unshift(bgManager); // primary monitor first
            } else {
                bgManager._primary = false;
                this._bgManagers.push(bgManager);
            }
        }
    },

    _updateBackground(bgManager, stateValue = 2/* , stateAdjustment = null*/) {
        if (this._checkConflict())
            return;

        const searchActive = this._searchController.searchActive;
        const staticWorkspace = opt.OVERVIEW_MODE2 && !opt.WORKSPACE_MODE && !this.dash.showAppsButton.checked;

        if (!opt.SHOW_BG_IN_OVERVIEW && !opt.SHOW_WS_PREVIEW_BG) {
            if (!(staticWorkspace && stateValue <= 1))
                this._fadeWallpaper(bgManager, stateValue, staticWorkspace);
        } else {
            this._setBgBrightness(bgManager, stateValue, staticWorkspace, searchActive);
            if (opt.OVERVIEW_BG_BLUR_SIGMA || opt.APP_GRID_BG_BLUR_SIGMA)
                this._setBlurEffect(bgManager, stateValue, staticWorkspace, searchActive);
        }
    },

    _setBgBrightness(bgManager, stateValue, staticWorkspace, searchActive) {
        bgManager.backgroundActor.opacity = 255;
        const overviewBrightness = !opt.SHOW_WS_PREVIEW_BG && staticWorkspace ? 1 : opt.OVERVIEW_BG_BRIGHTNESS;
        let secBrightness = searchActive ? opt.SEARCH_BG_BRIGHTNESS : opt.OVERVIEW_BG_BRIGHTNESS;
        if (staticWorkspace && !this._appDisplay.visible)
            secBrightness = overviewBrightness;

        const vignette = !opt.SHOW_WS_PREVIEW_BG && staticWorkspace ? 0 : 0.2;

        let currentBrightness = 1;
        let currentVignette = 0;
        if ((opt.SHOW_WS_PREVIEW_BG && stateValue < 1) || (opt.SHOW_WS_PREVIEW_BG && staticWorkspace)) {
            // No need to animate transition unless appGrid state is involved, static bg is covered by the ws preview bg
            currentBrightness = overviewBrightness;
            currentVignette = vignette;
        } else if (stateValue === 1 || (stateValue > 1 && !bgManager._primary)) {
            currentBrightness = overviewBrightness;
            currentVignette = vignette;
        } else if (stateValue === 0) {
            currentBrightness = 1;
            currentVignette = 0;
        } else if (stateValue < 1 /* && !searchActive*/) {
            currentBrightness = Util.lerp(1, overviewBrightness, stateValue);
            currentVignette = Util.lerp(0, vignette, stateValue);
        } else if (stateValue > 1 && bgManager._primary) {
            currentBrightness = Util.lerp(overviewBrightness, secBrightness, stateValue - 1);
            currentVignette = vignette;
        }

        bgManager.backgroundActor.content.vignette_sharpness = currentVignette;
        bgManager.backgroundActor.content.brightness = currentBrightness;
    },

    _setBlurEffect(bgManager, stateValue, staticWorkspace) {
        const blurEffect = this._getBlurEffect(bgManager);
        // In GNOME 46 the "sigma" property has been renamed to "radius"
        const radiusProperty = blurEffect.sigma === undefined ? 'radius' : 'sigma';

        // reduce number of steps of blur transition to improve performance
        const step = opt.SMOOTH_BLUR_TRANSITIONS ? 0.05 : 0.2;
        const progress = stateValue - (stateValue % step);

        const overviewBlurRadius = !opt.SHOW_WS_PREVIEW_BG && staticWorkspace ? 0 : opt.OVERVIEW_BG_BLUR_SIGMA;
        const appGridBlurRadius = staticWorkspace && !blurEffect[radiusProperty] && !this._appDisplay.visible ? overviewBlurRadius : opt.APP_GRID_BG_BLUR_SIGMA;
        let radius = overviewBlurRadius;

        if ((opt.SHOW_WS_PREVIEW_BG && stateValue < 1) || (opt.SHOW_WS_PREVIEW_BG && staticWorkspace)) {
            // No need to animate transition unless appGrid state is involved, static bg is covered by the ws preview bg
            radius = overviewBlurRadius;
        } else if (stateValue === 0) {
            radius = 0;
        } else if (stateValue === 1 || (stateValue > 1 && !bgManager._primary)) {
            radius = overviewBlurRadius;
        } else if (stateValue === 2) {
            radius = appGridBlurRadius;
        } else if (stateValue < 1) {
            radius = Math.round(Util.lerp(0, overviewBlurRadius, progress));
        } else if (stateValue > 1 && bgManager._primary) {
            radius = Math.round(Util.lerp(overviewBlurRadius, appGridBlurRadius, progress - 1));
        }

        if (blurEffect[radiusProperty] !== radius)
            blurEffect[radiusProperty] = radius;
    },

    _fadeWallpaper(bgManager, stateValue, staticWorkspace) {
        // if no bg shown in the overview, fade out the wallpaper
        if (bgManager.backgroundActor.get_effect('blur'))
            bgManager.backgroundActor.remove_effect_by_name('blur');
        let value = stateValue;
        if (staticWorkspace && stateValue > 1)
            value = stateValue - 1;
        bgManager.backgroundActor.opacity = Util.lerp(255, 0, Math.min(value, 1));
    },

    _getBlurEffect(bgManager) {
        let blurEffect = bgManager.backgroundActor.get_effect('blur');
        if (!blurEffect) {
            blurEffect = new Shell.BlurEffect({
                brightness: 1,
                mode: Shell.BlurMode.ACTOR,
            });
            bgManager.backgroundActor.add_effect_with_name('blur', blurEffect);
        }
        return blurEffect;
    },

    _checkConflict() {
        // Just in case something destroys our background (like older versions of Blur My Shell)
        if (this._bgManagers[0] && !Main.layoutManager.overviewGroup.get_children().includes(this._bgManagers[0].backgroundActor)) {
            console.error(`[${Me.metadata.name}]`, 'Error: The overview background has been destroyed, possibly by another incompatible extension');
            // remove and disconnect our destroyed backgrounds to avoid further errors
            this._setBackground(true);
            return true;
        }

        return false;
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
};

const ControlsManagerLayoutVertical = {
    _computeWorkspacesBoxForState(state, box, wsTmbWidth, wsTmbHeight, leftBoxOffset, rightBoxOffset, topBoxOffset, bottomBoxOffset, centeredBoxOffset) {
        const workspaceBox = box.copy();
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
                workspaceBox.set_origin(...this._workspacesThumbnails.get_position());
                workspaceBox.set_size(wsTmbWidth, wsTmbHeight);
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
                if (centeredBoxX < centeredBoxOffset) {
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

    vfunc_allocate(container, box) {
        const childBox = new Clutter.ActorBox();
        const startX = this._workAreaBoxForVShellConfig.x1;
        const startY = this._workAreaBoxForVShellConfig.y1;
        let [width, height] = this._workAreaBoxForVShellConfig.get_size();

        const transitionParams = this._stateAdjustment.getStateTransitionParams();
        const spacing = opt.SPACING;

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
            // default dock
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
        let wsTmbHeight = 0;

        if (opt.SHOW_WS_TMB) {
            let maxWsTmbScale = this._dash.showAppsButton.checked
                ? opt.MAX_THUMBNAIL_SCALE_APPGRID
                : opt.MAX_THUMBNAIL_SCALE;
            const searchActive =  Main.overview._overview.controls._searchInProgress;
            if (!opt.MAX_THUMBNAIL_SCALE_STABLE && !searchActive) {
                const initState = transitionParams.initialState === ControlsState.APP_GRID ? opt.MAX_THUMBNAIL_SCALE_APPGRID : opt.MAX_THUMBNAIL_SCALE;
                const finalState = transitionParams.finalState === ControlsState.APP_GRID ? opt.MAX_THUMBNAIL_SCALE_APPGRID : opt.MAX_THUMBNAIL_SCALE;
                maxWsTmbScale = Util.lerp(initState, finalState, transitionParams.progress);
            }

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

            childBox.set_origin(wsTmbX, wsTmbY);
            childBox.set_size(Math.max(wsTmbWidth, 1), Math.max(wsTmbHeight, 1));

            this._workspacesThumbnails.allocate(childBox);
        }

        if (this._dash.visible) {
            const wMaxWidth = width - spacing - wsTmbWidth - 2 * spacing - (opt.DASH_VERTICAL ? dashWidth + spacing : 0);
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
                const dashLeftOffset = (opt.WS_TMB_FULL || opt.CENTER_DASH_WS) && opt.WS_TMB_LEFT ? wsTmbWidth + spacing : 0;
                const dashRightOffset = (opt.WS_TMB_FULL || opt.CENTER_DASH_WS) && opt.WS_TMB_RIGHT ? wsTmbWidth + spacing : 0;
                let offset = (width - dashWidth - (opt.CENTER_DASH_WS && !this._xAlignCenter ? dashLeftOffset + dashRightOffset : 0)) / 2;
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
            this._dash.allocate(childBox);
        }

        // Main view offsets
        const leftBoxOffset = (opt.DASH_LEFT ? dashWidth : spacing) + (opt.WS_TMB_LEFT ? wsTmbWidth + spacing : 0);
        const rightBoxOffset = (opt.DASH_RIGHT ? dashWidth : spacing) + (opt.WS_TMB_RIGHT ? wsTmbWidth + spacing : 0);
        let topBoxOffset = (opt.DASH_TOP ? dashHeight : spacing) + (opt.WS_TMB_TOP ? wsTmbHeight + spacing : 0);
        const bottomBoxOffset = (opt.DASH_BOTTOM ? dashHeight : spacing) + (opt.WS_TMB_BOTTOM ? wsTmbHeight + spacing : 0);
        const centeredBoxOffset = Math.max(leftBoxOffset, rightBoxOffset);

        // App grid needs to be calculated for the max wsTmbWidth in app grid, independently on the current wsTmb scale
        const wsTmbWidthAppGrid = Math.round(width * opt.MAX_THUMBNAIL_SCALE_APPGRID);
        const leftBoxOffsetAppGrid = (opt.DASH_LEFT ? dashWidth : spacing) + (opt.WS_TMB_LEFT ? wsTmbWidthAppGrid + spacing : 0);
        const rightBoxOffsetAppGrid = (opt.DASH_RIGHT ? dashWidth : spacing) + (opt.WS_TMB_RIGHT ? wsTmbWidthAppGrid + spacing : 0);

        // searchEntry
        const [searchEntryHeight] = this._searchEntry.get_preferred_height(width - wsTmbWidth);
        const searchEntryY = startY + topBoxOffset;

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

        this._searchEntry.allocate(childBox);

        // searchResults
        const searchY = startY + topBoxOffset + searchEntryHeight + spacing;
        const searchHeight = height - topBoxOffset - bottomBoxOffset - searchEntryHeight - 2 * spacing;

        childBox.set_origin(searchX, searchY);
        childBox.set_size(searchWidth, searchHeight);
        this._searchController.allocate(childBox);

        // Add searchEntry height if needed
        topBoxOffset += opt.SHOW_SEARCH_ENTRY ? searchEntryHeight + spacing : 0;

        // workspace
        let params = [
            box,
            wsTmbWidth,
            wsTmbHeight,
            leftBoxOffset,
            rightBoxOffset,
            topBoxOffset,
            bottomBoxOffset,
            centeredBoxOffset,
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
    _computeWorkspacesBoxForState: ControlsManagerLayoutVertical._computeWorkspacesBoxForState,

    _getAppDisplayBoxForState: ControlsManagerLayoutVertical._getAppDisplayBoxForState,

    vfunc_allocate(container, box) {
        const childBox = new Clutter.ActorBox();
        const startX = this._workAreaBoxForVShellConfig.x1;
        const startY = this._workAreaBoxForVShellConfig.y1;
        let [width, height] = this._workAreaBoxForVShellConfig.get_size();

        const transitionParams = this._stateAdjustment.getStateTransitionParams();
        const spacing = opt.SPACING;

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
            // default dock
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
        let wsTmbWidth = 0;
        let wsTmbHeight = 0;

        if (opt.SHOW_WS_TMB) {
            let maxWsTmbScale = this._dash.showAppsButton.checked
                ? opt.MAX_THUMBNAIL_SCALE_APPGRID
                : opt.MAX_THUMBNAIL_SCALE;
            const searchActive =  Main.overview._overview.controls._searchInProgress;
            if (!opt.MAX_THUMBNAIL_SCALE_STABLE && !searchActive) {
                const initState = transitionParams.initialState === ControlsState.APP_GRID ? opt.MAX_THUMBNAIL_SCALE_APPGRID : opt.MAX_THUMBNAIL_SCALE;
                const finalState = transitionParams.finalState === ControlsState.APP_GRID ? opt.MAX_THUMBNAIL_SCALE_APPGRID : opt.MAX_THUMBNAIL_SCALE;
                maxWsTmbScale = Util.lerp(initState, finalState, transitionParams.progress);
            }

            wsTmbHeight = Math.round(height * maxWsTmbScale);

            let totalTmbSpacing;
            [totalTmbSpacing, wsTmbWidth] = this._workspacesThumbnails.get_preferred_width(wsTmbHeight);
            wsTmbWidth += totalTmbSpacing;

            const wstLeftOffset = !opt.WS_TMB_FULL && opt.DASH_LEFT ? dashWidth : spacing;
            const wstRightOffset = !opt.WS_TMB_FULL && opt.DASH_RIGHT ? dashWidth : spacing;
            const wstTopOffset = opt.DASH_TOP ? dashHeight : spacing;
            const wstBottomOffset = opt.DASH_BOTTOM ? dashHeight : spacing;

            const wsTmbWidthMax = width - wstLeftOffset - wstRightOffset;
            // Reduce size to fit wsTmb to the screen
            if (wsTmbWidth > wsTmbWidthMax) {
                wsTmbWidth = wsTmbWidthMax;
                wsTmbHeight = this._workspacesThumbnails.get_preferred_height(wsTmbWidth)[1];
            }

            let wsTmbY = opt.WS_TMB_TOP
                ? startY + wstTopOffset
                : startY + height - wstBottomOffset - wsTmbHeight;

            let offset = (width - wstLeftOffset - wsTmbWidth - wstRightOffset) / 2;
            offset = Math.round(offset - (opt.WS_TMB_POSITION_ADJUSTMENT * offset));
            const wsTmbX = startX + wstLeftOffset + offset;

            childBox.set_origin(wsTmbX, wsTmbY);
            childBox.set_size(Math.max(wsTmbWidth, 1), Math.max(wsTmbHeight, 1));
            this._workspacesThumbnails.allocate(childBox);
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
                const dashTopOffset = (opt.WS_TMB_FULL || opt.CENTER_DASH_WS) && opt.WS_TMB_TOP ? wsTmbHeight + spacing : 0;
                const dashBottomOffset = (opt.WS_TMB_FULL || opt.CENTER_DASH_WS) && opt.WS_TMB_BOTTOM ? wsTmbHeight + spacing : 0;
                let offset = (height - dashHeight - (opt.CENTER_DASH_WS ? dashTopOffset + dashBottomOffset : 0)) / 2;
                offset -= opt.DASH_POSITION_ADJUSTMENT * (offset - spacing);
                dashY = (opt.CENTER_DASH_WS ? dashTopOffset : 0) + offset;
                if (opt.WS_TMB_FULL) // Limit the adjustment while keeping the center of adjustment on the screen center
                    dashY = Math.clamp(dashTopOffset + spacing, dashY, height - dashBottomOffset - spacing - dashHeight);
            } else {
                const offset = (width - dashWidth) / 2;
                dashX = startX + (offset - opt.DASH_POSITION_ADJUSTMENT * (offset - spacing));
            }
            dashX = Math.round(startX + dashX);
            dashY = Math.round(startY + dashY);

            childBox.set_origin(dashX, dashY);
            childBox.set_size(dashWidth, dashHeight);
            this._dash.allocate(childBox);
        }

        // Main view offsets
        const leftBoxOffset = opt.DASH_LEFT ? dashWidth : spacing;
        const rightBoxOffset = opt.DASH_RIGHT ? dashWidth : spacing;
        let topBoxOffset = (opt.DASH_TOP ? dashHeight : spacing) + (opt.WS_TMB_TOP ? wsTmbHeight + spacing : 0);
        const bottomBoxOffset = (opt.DASH_BOTTOM ? dashHeight : spacing) + (opt.WS_TMB_BOTTOM ? wsTmbHeight + spacing : 0);
        const centeredBoxOffset = Math.max(leftBoxOffset, rightBoxOffset);

        // App grid needs to be calculated for the max wsTmbWidth in app grid, independently on the current wsTmb scale
        const wsTmbHeightAppGrid = Math.round(height * opt.MAX_THUMBNAIL_SCALE_APPGRID);
        const topBoxOffsetAppGrid = (opt.DASH_TOP ? dashHeight : spacing) + (opt.WS_TMB_TOP ? wsTmbHeightAppGrid + spacing : 0) + (opt.SHOW_SEARCH_ENTRY ? searchEntryHeight + spacing : 0);
        const bottomBoxOffsetAppGrid = (opt.DASH_BOTTOM ? dashHeight : spacing) + (opt.WS_TMB_BOTTOM ? wsTmbHeightAppGrid + spacing : 0);

        // searchEntry
        const searchEntryY = startY + topBoxOffset;

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

        this._searchEntry.allocate(childBox);

        // searchResults
        const searchY = startY + topBoxOffset + searchEntryHeight + spacing;
        const searchHeight = height - topBoxOffset - bottomBoxOffset - searchEntryHeight - 2 * spacing;

        childBox.set_origin(searchX, searchY);
        childBox.set_size(searchWidth, searchHeight);
        this._searchController.allocate(childBox);

        // Add searchEntry height if needed
        topBoxOffset += opt.SHOW_SEARCH_ENTRY ? searchEntryHeight + spacing : 0;

        // Workspace
        let params = [
            box,
            wsTmbWidth,
            wsTmbHeight,
            leftBoxOffset,
            rightBoxOffset,
            topBoxOffset,
            bottomBoxOffset,
            centeredBoxOffset,
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
