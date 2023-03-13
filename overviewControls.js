/**
 * V-Shell (Vertical Workspaces)
 * overviewControls.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2023
 * @license    GPL-3.0
 *
 */

'use strict';

const { Clutter, GLib, GObject } = imports.gi;
const Main = imports.ui.main;
const Util = imports.misc.util;
const OverviewControls = imports.ui.overviewControls;
const WorkspaceThumbnail = imports.ui.workspaceThumbnail;

const ControlsState = imports.ui.overviewControls.ControlsState;
const FitMode = imports.ui.workspacesView.FitMode;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const _Util = Me.imports.util;

let _overrides;
let opt;

const ANIMATION_TIME = imports.ui.overview.ANIMATION_TIME;
const DASH_MAX_SIZE_RATIO = 0.25;

let _originalSearchControllerSigId;
let _searchControllerSigId;
let _timeouts;
let _startupInitComplete = false;

function update(reset = false) {
    if (_overrides)
        _overrides.removeAll();

    if (_timeouts) {
        Object.values(_timeouts).forEach(id => {
            if (id)
                GLib.source_remove(id);
        });
    }

    _replaceOnSearchChanged(reset);

    if (reset) {
        _overrides = null;
        opt = null;
        _timeouts = null;
        return;
    }

    _timeouts = {};

    opt = Me.imports.settings.opt;
    _overrides = new _Util.Overrides();

    _overrides.addOverride('ControlsManager', OverviewControls.ControlsManager.prototype, ControlsManager);

    if (opt.ORIENTATION === Clutter.Orientation.VERTICAL)
        _overrides.addOverride('ControlsManagerLayout', OverviewControls.ControlsManagerLayout.prototype, ControlsManagerLayoutVertical);
    else
        _overrides.addOverride('ControlsManagerLayout', OverviewControls.ControlsManagerLayout.prototype, ControlsManagerLayoutHorizontal);
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
        if (_originalSearchControllerSigId)
            searchController.block_signal_handler(_originalSearchControllerSigId);

        _searchControllerSigId = searchController.connect('notify::search-active', ControlsManager._onSearchChanged.bind(Main.overview._overview.controls));
    }
}

const ControlsManager = {
    // this function is used as a callback by a signal handler, needs to be reconnected after modification as the original callback uses a copy of the original function
    /* _update: function() {
        ...
    }*/

    // this function has duplicate in WorkspaceView so we use one function for both to avoid issues with syncing them
    _getFitModeForState(state) {
        return _getFitModeForState(state);
    },

    _updateThumbnailsBox() {
        const { shouldShow } = this._thumbnailsBox;
        const thumbnailsBoxVisible = shouldShow;
        this._thumbnailsBox.visible = thumbnailsBoxVisible;

        // this call should be directly in _update(), but it's used as a callback function and it would require to reconnect the signal
        this._updateWorkspacesDisplay();
    },

    // this function is pure addition to the original code and handles wsDisp transition to APP_GRID view
    _updateWorkspacesDisplay() {
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

        let workspacesDisplayVisible = opacity !== 0/* && !(searchActive)*/;

        // improve transition from search results to desktop
        if (finalState === 0 && this._searchController._searchResults.visible)
            this._searchController.hide();


        // reset Static Workspace window picker mode
        if (currentState === 0/* finalState === 0 && progress === 1*/ && opt.OVERVIEW_MODE && opt.WORKSPACE_MODE)
            opt.WORKSPACE_MODE = 0;


        if (!opt.WS_ANIMATION || !opt.SHOW_WS_TMB) {
            this._workspacesDisplay.opacity = opacity;
        } else if (!opt.SHOW_WS_TMB_BG) {
            // fade out ws wallpaper during transition to ws switcher if ws switcher background disabled
            const ws = this._workspacesDisplay._workspacesViews[global.display.get_primary_monitor()]._workspaces[this._workspaceAdjustment.value];
            if (ws)
                ws._background.opacity = opacity;
        }

        // if ws preview background is disabled, animate tmb box and dash
        const tmbBox = this._thumbnailsBox;
        const dash = this.dash;
        const searchEntryBin = this._searchEntryBin;
        // this dash transition collides with startup animation and freezes GS for good, needs to be delayed (first Main.overview 'hiding' event enables it)
        const skipDash = _Util.dashNotDefault();

        // OVERVIEW_MODE 2 should animate dash and wsTmbBox only if WORKSPACE_MODE === 0 (windows not spread)
        const animateOverviewMode2 = opt.OVERVIEW_MODE2 && !(finalState === 1 && opt.WORKSPACE_MODE);
        if (!Main.layoutManager._startingUp && ((!opt.SHOW_WS_PREVIEW_BG && !opt.OVERVIEW_MODE2) || animateOverviewMode2)) {
            if (!tmbBox._translationOriginal || Math.abs(tmbBox._translationOriginal[0]) > 500) { // swipe gesture can call this calculation before tmbBox is finalized, giving nonsense width
                const [tmbTranslationX, tmbTranslationY, dashTranslationX, dashTranslationY, searchTranslationY] = _Util.getOverviewTranslations(opt, dash, tmbBox, searchEntryBin);
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
            if (!_Util.dashNotDefault())
                this.set_child_above_sibling(dash, null);
            this.set_child_below_sibling(this._thumbnailsBox, null);
            this.set_child_below_sibling(this._workspacesDisplay, null);
            this.set_child_below_sibling(this._appDisplay, null);
        } else if (!this.dash._isAbove && progress === 1 && finalState > ControlsState.HIDDEN) {
            // set dash above workspace in the overview
            this.set_child_above_sibling(this._thumbnailsBox, null);
            this.set_child_above_sibling(this._searchEntryBin, null);
            if (!_Util.dashNotDefault())
                this.set_child_above_sibling(this.dash, null);

            this.dash._isAbove = true;
        } else if (this.dash._isAbove && progress < 1) {
            // keep dash below for ws transition between the overview and hidden state
            this.set_child_above_sibling(this._workspacesDisplay, null);
            this.dash._isAbove = false;
        }
    },

    // fix for upstream bug - appGrid.visible after transition from APP_GRID to HIDDEN
    _updateAppDisplayVisibility(stateTransitionParams = null) {
        if (!stateTransitionParams)
            stateTransitionParams = this._stateAdjustment.getStateTransitionParams();

        const { currentState } = stateTransitionParams;
        if (this.dash.showAppsButton.checked)
            this._searchTransition = false;

        // update App Grid after settings changed
        // only if the App Grid is currently visible on the screen, the paging updates correctly
        if (currentState === ControlsState.APP_GRID && this._appDisplay.visible && opt._appGridNeedsRedisplay) {
            Me.imports.appDisplay._updateAppGridProperties();
            _timeouts.appRedisplay = GLib.idle_add(0, () => {
                Main.overview._overview._controls._appDisplay._redisplay();
                _timeouts.appRedisplay = 0;
            });
            opt._appGridNeedsRedisplay = false;
        }
        // if !APP_GRID_ANIMATION, appGrid needs to be hidden in WINDOW_PICKER mode (1)
        // but needs to be visible for transition from HIDDEN (0) to APP_GRID (2)
        this._appDisplay.visible =
            currentState > ControlsState.HIDDEN &&
            !this._searchController.searchActive &&
            !(currentState === ControlsState.WINDOW_PICKER && !opt.APP_GRID_ANIMATION) &&
            !this._searchTransition;
    },

    _onSearchChanged() {
        const { finalState, currentState } = this._stateAdjustment.getStateTransitionParams();

        const { searchActive } = this._searchController;
        const SIDE_CONTROLS_ANIMATION_TIME = 250; // OverviewControls.SIDE_CONTROLS_ANIMATION_TIME = Overview.ANIMATION_TIME = 250

        const entry = this._searchEntry;
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
                onComplete: () => {
                    entry.visible = searchActive;
                },
            });
        }

        // if user start typing or activated search provider during overview animation, this switcher will be called again after animation ends
        if (opt.SEARCH_VIEW_ANIMATION && Main.overview._animationInProgress && finalState !== ControlsState.HIDDEN)
            return;

        if (!searchActive) {
            this._workspacesDisplay.reactive = true;
            this._workspacesDisplay.setPrimaryWorkspaceVisible(true);
        } else {
            this._searchController.show();
            entry.visible = true;
            entry.opacity = 255;
        }

        this._searchTransition = true;

        this._searchController._searchResults.translation_x = 0;
        this._searchController._searchResults.translation_y = 0;
        this._searchController.visible = true;

        if (opt.SEARCH_VIEW_ANIMATION && !this.dash.showAppsButton.checked && ![4, 8].includes(opt.WS_TMB_POSITION) /* && !opt.OVERVIEW_MODE2*/) {
            this._updateAppDisplayVisibility();

            this._searchController.opacity = searchActive ? 255 : 0;
            let translationX = 0;
            let translationY = 0;
            const geometry = global.display.get_monitor_geometry(global.display.get_primary_monitor());

            if (currentState < ControlsState.APP_GRID) {
                switch (opt.SEARCH_VIEW_ANIMATION) {
                case 0:
                    translationX = 0;
                    translationY = 0;
                    break;
                case 1:
                    // make it longer to cover the delay before results appears
                    translationX = geometry.x + geometry.width - this._searchController.x + this._workspacesDisplay.width;
                    translationY = 0;
                    break;
                case 2:
                    translationX = -this._searchController.x - 2 * this._workspacesDisplay.width;
                    translationY = 0;
                    break;
                case 3:
                    translationX = 0;
                    translationY = geometry.y + geometry.height + this._searchController.y + this._workspacesDisplay.height;
                    break;
                case 5:
                    translationX = 0;
                    translationY = -this._searchController.y - 2 * this._workspacesDisplay.height;
                    break;
                }
            }

            if (searchActive) {
                this._searchController._searchResults.translation_x = translationX;
                this._searchController._searchResults.translation_y = translationY;
            } else {
                this._searchController._searchResults.translation_x = 0;
                this._searchController._searchResults.translation_y = 0;
            }

            this._searchController._searchResults.ease({
                // opacity: searchActive ? 255 : 0,
                translation_x: searchActive ? 0 : translationX,
                translation_y: searchActive ? 0 : translationY,
                duration: SIDE_CONTROLS_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    this._searchController.visible = searchActive;
                    this._searchTransition = false;
                },
            });

            this._workspacesDisplay.opacity = 255;
        } else {
            this._appDisplay.ease({
                opacity: searchActive || currentState < 2 ? 0 : 255,
                duration: SIDE_CONTROLS_ANIMATION_TIME / 2,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => this._updateAppDisplayVisibility(),
            });

            // this._updateAppDisplayVisibility();
            this._workspacesDisplay.setPrimaryWorkspaceVisible(true);
            this._workspacesDisplay.ease({
                opacity: searchActive ? 0 : 255,
                duration: searchActive ? SIDE_CONTROLS_ANIMATION_TIME / 2 : 0,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    this._workspacesDisplay.reactive = !searchActive;
                    this._workspacesDisplay.setPrimaryWorkspaceVisible(!searchActive);
                },
            });

            this._searchController.ease({
                opacity: searchActive ? 255 : 0,
                duration: searchActive ? SIDE_CONTROLS_ANIMATION_TIME / 2 : 0,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => (this._searchController.visible = searchActive),
            });
        }

        // reuse already tuned overview transition, just replace APP_GRID with the search view
        if (!(opt.OVERVIEW_MODE2 && !opt.WORKSPACE_MODE) && !Main.overview._animationInProgress && finalState !== ControlsState.HIDDEN && !this.dash.showAppsButton.checked) {
            Main.overview._overview._controls.layoutManager._searchController._searchResults._content.remove_style_class_name('search-section-content-om2');
            Main.overview.searchEntry.remove_style_class_name('search-entry-om2');
            this._stateAdjustment.ease(searchActive ? ControlsState.APP_GRID : ControlsState.WINDOW_PICKER, {
                // shorter animation time when entering search view can avoid stuttering in transition
                // collecting search results take some time and the problematic part is the realization of the object on the screen
                // if the ws animation ends before this event, the whole transition is smoother
                // removing the ws transition (duration: 0) seems like the best solution here
                duration: searchActive || (opt.OVERVIEW_MODE && !opt.WORKSPACE_MODE) ? 0 : SIDE_CONTROLS_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    this._workspacesDisplay.setPrimaryWorkspaceVisible(!searchActive);
                },
            });
        } else if (opt.OVERVIEW_MODE2 && !(opt.WORKSPACE_MODE || this.dash.showAppsButton.checked)) {
            // add background to search results and make searchEntry border thicker for better visibility
            Main.overview._overview._controls.layoutManager._searchController._searchResults._content.add_style_class_name('search-section-content-om2');
            Main.overview.searchEntry.add_style_class_name('search-entry-om2');
        } else {
            Main.overview._overview._controls.layoutManager._searchController._searchResults._content.remove_style_class_name('search-section-content-om2');
            Main.overview.searchEntry.remove_style_class_name('search-entry-om2');
        }
    },

    async runStartupAnimation(callback) {
        this._ignoreShowAppsButtonToggle = true;
        this._searchController.prepareToEnterOverview();
        this._workspacesDisplay.prepareToEnterOverview();

        this._stateAdjustment.value = ControlsState.HIDDEN;
        this._stateAdjustment.ease(ControlsState.WINDOW_PICKER, {
            duration: ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });

        this.dash.showAppsButton.checked = false;
        this._ignoreShowAppsButtonToggle = false;

        // Set the opacity here to avoid a 1-frame flicker
        this.opacity = 0;

        // We can't run the animation before the first allocation happens
        await this.layout_manager.ensureAllocation();

        const { STARTUP_ANIMATION_TIME } = imports.ui.layout;

        // Opacity
        this.ease({
            opacity: 255,
            duration: STARTUP_ANIMATION_TIME,
            mode: Clutter.AnimationMode.LINEAR,
            onComplete: () => {
                // part of the workaround for stuttering first app grid animation
                this._appDisplay.visible = true;
            },
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
        const [tmbTranslationX, tmbTranslationY, dashTranslationX, dashTranslationY, searchTranslationY] =
            _Util.getOverviewTranslations(opt, dash, tmbBox, searchEntryBin);

        const onComplete = function () {
            // running init callback again causes issues (multiple connections)
            if (!_startupInitComplete)
                callback();
            _startupInitComplete = true;

            // force app grid to build before the first visible animation to remove possible stuttering
            this._appDisplay.opacity = 1;

            const [x, y] = this._appDisplay.get_position();
            const translationX = -x;
            const translationY = -y;
            this._appDisplay.translation_x = translationX;
            this._appDisplay.translation_y = translationY;

            // let the main loop realize previous changes before continuing
            _timeouts.startupAnim1 = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                10,
                () => {
                    this._appDisplay.translation_x = 0;
                    this._appDisplay.translation_y = 0;
                    this._appDisplay.visible = false;
                    if (opt.STARTUP_STATE === 1) {
                        Main.overview.hide();
                    } else if (opt.STARTUP_STATE === 2) {
                        this._appDisplay.opacity = 255;
                        this.dash.showAppsButton.checked = true;
                    }
                    _timeouts.startupAnim1 = 0;
                    return GLib.SOURCE_REMOVE;
                }
            );
        }.bind(this);

        if (dash.visible && !_Util.dashNotDefault()) {
            dash.translation_x = dashTranslationX;
            dash.translation_y = dashTranslationY;
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
            _timeouts.startupAnim2 = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                // delay + animation time
                STARTUP_ANIMATION_TIME * 2 * opt.ANIMATION_TIME_FACTOR,
                () => {
                    onComplete();
                    _timeouts.startupAnim2 = 0;
                    return GLib.SOURCE_REMOVE;
                }
            );
        }

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

                    _Util.getOverviewTranslations(opt, dash, secTmbBox, searchEntryBin);
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
    },

    animateToOverview(state, callback) {
        this._ignoreShowAppsButtonToggle = true;
        this._searchTransition = false;

        this._searchController.prepareToEnterOverview();
        this._workspacesDisplay.prepareToEnterOverview();

        this._stateAdjustment.value = ControlsState.HIDDEN;

        // building window thumbnails takes some time and with many windows on the workspace
        // the time can be close to or longer than ANIMATION_TIME
        // in which case the the animation is greatly delayed, stuttering, or even skipped
        // for user it is more acceptable to watch delayed smooth animation,
        // even if it takes little more time, than jumping frames
        let delay = 0;
        if (opt.DELAY_OVERVIEW_ANIMATION)
            delay = global.display.get_tab_list(0, global.workspace_manager.get_active_workspace()).length * 3;

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

const ControlsManagerLayoutVertical = {
    _computeWorkspacesBoxForState(state, box, workAreaBox, dashWidth, dashHeight, thumbnailsWidth, searchHeight, startY) {
        const workspaceBox = box.copy();
        let [width, height] = workspaceBox.get_size();
        // const { x1: startX/* y1: startY*/ } = workAreaBox;
        const { spacing } = this;
        // const { expandFraction } = this._workspacesThumbnails;

        const dash = Main.overview.dash;
        // including Dash to Dock and clones properties for compatibility

        if (_Util.dashIsDashToDock()) {
            // Dash to Dock also always affects workAreaBox
            Main.layoutManager._trackedActors.forEach(actor => {
                if (actor.affectsStruts && actor.actor.width === dash.width) {
                    if (dash._isHorizontal) {
                        // disabled inteli-hide don't needs compensation
                        // startY needs to be corrected in allocate()
                        if (dash.get_parent()?.get_parent()?.get_parent()?._intellihideIsEnabled)
                            height += dash.height;
                    } else {
                        width += dash.width;
                    }
                }
            });
        }

        let wWidth;
        let wHeight;
        let wsBoxY;

        switch (state) {
        case ControlsState.HIDDEN:
            // if PANEL_OVERVIEW_ONLY, the affectStruts property is set to false to avoid stuttering
            // therefore we added panel height to startY for the overview allocation,
            // but here we need to remove the correction because the panel will be in the hidden state
            if (opt.START_Y_OFFSET) {
                let [x, y] = workAreaBox.get_origin();
                y -= opt.START_Y_OFFSET;
                workspaceBox.set_origin(x, y);
            } else {
                workspaceBox.set_origin(...workAreaBox.get_origin());
            }
            workspaceBox.set_size(...workAreaBox.get_size());
            break;
        case ControlsState.WINDOW_PICKER:
        case ControlsState.APP_GRID:
            if (opt.WS_ANIMATION && opt.SHOW_WS_TMB && state === ControlsState.APP_GRID) {
                workspaceBox.set_origin(...this._workspacesThumbnails.get_position());
                workspaceBox.set_size(...this._workspacesThumbnails.get_size());
            } else if (opt.OVERVIEW_MODE2 && !opt.WORKSPACE_MODE) {
                if (opt.START_Y_OFFSET) {
                    let [x, y] = workAreaBox.get_origin();
                    y -= opt.START_Y_OFFSET;
                    workspaceBox.set_origin(x, y);
                } else {
                    workspaceBox.set_origin(...workAreaBox.get_origin());
                }
                workspaceBox.set_size(...workAreaBox.get_size());
            } else {
                // if PANEL_OVERVIEW_ONLY, panel doesn't affect workArea height (affectStruts === false), it is necessary to compensate
                height = opt.PANEL_POSITION_TOP ? height : height - Main.panel.height;
                searchHeight = opt.SHOW_SEARCH_ENTRY ? searchHeight : 0;
                wWidth = width -
                            (opt.DASH_VERTICAL ? dash.width : 0) -
                            thumbnailsWidth -
                            4 * spacing;
                wHeight = height -
                            (opt.DASH_VERTICAL ? 0 : dashHeight) -
                            searchHeight -
                            4 * spacing;

                const ratio = width / height;
                let wRatio = wWidth / wHeight;
                let scale = ratio / wRatio;

                if (scale > 1) {
                    wHeight /= scale;
                    wWidth = wHeight * ratio;
                } else {
                    wWidth *= scale;
                    wHeight = wWidth / ratio;
                }

                // height decides the actual size, ratio is given by the workarea
                wHeight *= opt.WS_PREVIEW_SCALE;
                wWidth *= opt.WS_PREVIEW_SCALE;

                let xOffset = 0;
                let yOffset = 0;

                const yOffsetT = (opt.DASH_TOP ? dashHeight : 0) + searchHeight;
                const yOffsetB = opt.DASH_BOTTOM ? dashHeight : 0;
                const yAvailableSpace = (height - yOffsetT - wHeight - yOffsetB) / 2;
                yOffset = yOffsetT + yAvailableSpace;

                const centeredBoxX = (width - wWidth) / 2;

                const xOffsetL = (opt.DASH_LEFT ? dashWidth : 0) + (opt.WS_TMB_LEFT ? thumbnailsWidth : 0) + 2 * spacing;
                const xOffsetR = (opt.DASH_RIGHT ? dashWidth : 0) + (opt.WS_TMB_RIGHT ? thumbnailsWidth : 0) + 2 * spacing;

                this._xAlignCenter = false;
                if (centeredBoxX < Math.max(xOffsetL, xOffsetR)) {
                    xOffset = xOffsetL + spacing + (width - xOffsetL - wWidth - xOffsetR - 2 * spacing) / 2;
                } else {
                    xOffset = centeredBoxX;
                    this._xAlignCenter = true;
                }

                const wsBoxX = /* startX + */xOffset;
                wsBoxY = Math.round(startY + yOffset);
                workspaceBox.set_origin(Math.round(wsBoxX), Math.round(wsBoxY));
                workspaceBox.set_size(Math.round(wWidth), Math.round(wHeight));
            }
        }

        return workspaceBox;
    },

    _getAppDisplayBoxForState(state, box, workAreaBox, searchHeight, dashWidth, dashHeight, thumbnailsWidth, startY) {
        const [width] = box.get_size();
        const { x1: startX } = workAreaBox;
        // const { y1: startY } = workAreaBox;
        let height = workAreaBox.get_height();
        const appDisplayBox = new Clutter.ActorBox();
        const { spacing } = this;

        searchHeight = opt.SHOW_SEARCH_ENTRY ? searchHeight : 0;

        const xOffsetL = (opt.WS_TMB_LEFT ? thumbnailsWidth : 0) + (opt.DASH_LEFT ? dashWidth : 0);
        const xOffsetR = (opt.WS_TMB_RIGHT ? thumbnailsWidth : 0) + (opt.DASH_RIGHT ? dashWidth : 0);
        const yOffsetT = (opt.DASH_TOP ? dashHeight : 0) + (opt.SHOW_SEARCH_ENTRY ? searchHeight : 0);
        const yOffsetB = opt.DASH_BOTTOM ? dashHeight : 0;
        const adWidth = opt.CENTER_APP_GRID ? width - 2 * Math.max(xOffsetL, xOffsetR) - 4 * spacing : width - xOffsetL - xOffsetR - 4 * spacing;
        const adHeight = height - yOffsetT - yOffsetB - 4 * spacing;

        const appDisplayX = opt.CENTER_APP_GRID ? (width - adWidth) / 2 : xOffsetL + 2 * spacing;
        const appDisplayY = startY + yOffsetT + 2 * spacing;

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

    vfunc_allocate(container, box) {
        const childBox = new Clutter.ActorBox();

        const { spacing } = this;

        const monitor = Main.layoutManager.findMonitorForActor(this._container);
        const workArea = Main.layoutManager.getWorkAreaForMonitor(monitor.index);
        const startX = workArea.x - monitor.x;
        // if PANEL_OVERVIEW_ONLY, the affectStruts property is set to false to avoid stuttering
        // therefore we need to add panel height to startY
        let startY = workArea.y - monitor.y + opt.START_Y_OFFSET;

        const workAreaBox = new Clutter.ActorBox();
        workAreaBox.set_origin(startX, startY);
        workAreaBox.set_size(workArea.width, workArea.height);
        box.y1 += startY;
        box.x1 += startX;
        let [width, height] = box.get_size();
        // if panel is at bottom position,
        // compensate the height of the available box (the box size is calculated for top panel)
        height = opt.PANEL_POSITION_TOP ? height : height - Main.panel.height;
        let availableHeight = height;

        // Dash
        const maxDashHeight = Math.round(box.get_height() * DASH_MAX_SIZE_RATIO);
        const maxDashWidth = maxDashHeight * 0.8;
        let dashHeight = 0;
        let dashWidth = 0;

        // dash cloud be overridden by the Dash to Dock clone
        const dash = Main.overview.dash;
        if (_Util.dashIsDashToDock()) {
            // if Dash to Dock replaced the default dash and its inteli-hide id disabled we need to compensate for affected startY
            if (!Main.overview.dash.get_parent()?.get_parent()?.get_parent()?._intellihideIsEnabled) {
                if (Main.panel.y === monitor.y)
                    startY = Main.panel.height + spacing;
            }
            dashHeight = dash.height;
            dashWidth = dash.width;
            opt.DASH_VERTICAL = [1, 3].includes(dash._position);
            this._dash.allocate(childBox);
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

        if (this._workspacesThumbnails.visible) {
            // const { expandFraction } = this._workspacesThumbnails;
            const dashHeightReservation = !opt.WS_TMB_FULL && !opt.DASH_VERTICAL ? dashHeight : 0;

            wsTmbWidth = width * opt.MAX_THUMBNAIL_SCALE;
            let totalTmbSpacing;
            [totalTmbSpacing, wsTmbHeight] = this._workspacesThumbnails.get_preferred_custom_height(wsTmbWidth);
            wsTmbHeight += totalTmbSpacing;

            const wsTmbHeightMax = height - dashHeightReservation;

            if (wsTmbHeight > wsTmbHeightMax) {
                wsTmbHeight = wsTmbHeightMax;
                wsTmbWidth = this._workspacesThumbnails.get_preferred_custom_width(wsTmbHeight)[1];
            }

            let wsTmbX;
            if (opt.WS_TMB_RIGHT)
                wsTmbX = Math.round(startX + width - (opt.DASH_RIGHT ? dashWidth : 0) - wsTmbWidth - spacing / 2);
            else
                wsTmbX = Math.round((opt.DASH_LEFT ? dashWidth : 0) + spacing / 2);


            let wstOffset = (height - wsTmbHeight - (opt.DASH_VERTICAL ? 0 : dashHeightReservation)) / 2;
            wstOffset -= opt.WS_TMB_POSITION_ADJUSTMENT * (wstOffset - spacing / 2);
            let wsTmbY = Math.round(startY + (dashHeightReservation && opt.DASH_TOP ? dashHeight : 0) + wstOffset);

            childBox.set_origin(wsTmbX, wsTmbY);
            childBox.set_size(Math.round(wsTmbWidth), Math.round(wsTmbHeight));

            this._workspacesThumbnails.allocate(childBox);
        }


        if (this._dash.visible) {
            const wMaxWidth = width - spacing - wsTmbWidth - 2 * spacing - (opt.DASH_VERTICAL ? dashWidth + spacing : 0);
            if (opt.WS_TMB_FULL && !opt.DASH_VERTICAL) {
                this._dash.setMaxSize(wMaxWidth, maxDashHeight);
                [, dashHeight] = this._dash.get_preferred_height(wMaxWidth);
                [, dashWidth] = this._dash.get_preferred_width(dashHeight);
                dashHeight = Math.round(Math.min(dashHeight, maxDashHeight));
                dashWidth = Math.round(Math.min(dashWidth, wMaxWidth));
            }

            let dashX, dashY, offset;
            if (opt.DASH_RIGHT)
                dashX = width - dashWidth;
            else if (opt.DASH_LEFT)
                dashX = 0;

            else if (opt.DASH_TOP)
                dashY = startY;
            else
                dashY = startY + height - dashHeight;

            if (!opt.DASH_VERTICAL) {
                offset = (width - ((opt.WS_TMB_FULL || opt.CENTER_DASH_WS) && !this._xAlignCenter ? wsTmbWidth : 0) - dashWidth) / 2;
                offset -= opt.DASH_POSITION_ADJUSTMENT * (offset - spacing / 2);
                dashX = offset;

                if ((opt.WS_TMB_FULL || opt.CENTER_DASH_WS) && !this._xAlignCenter) {
                    if (!opt.WS_TMB_RIGHT) {
                        dashX = (wsTmbWidth ? wsTmbWidth : 0) + offset;
                        dashX = Math.max(dashX, wsTmbWidth ? wsTmbWidth + spacing : 0);
                        dashX = Math.min(dashX, width - dashWidth - spacing);
                    }
                }
                if (opt.WS_TMB_FULL && !opt.CENTER_DASH_WS) {
                    dashX = opt.WS_TMB_RIGHT
                        ? Math.min(width - wsTmbWidth - dashWidth, dashX + wsTmbWidth / 2 * (1 - Math.abs(opt.DASH_POSITION_ADJUSTMENT)))
                        : Math.max(wsTmbWidth, dashX - wsTmbWidth / 2 * (1 - Math.abs(opt.DASH_POSITION_ADJUSTMENT)));
                }
            } else {
                offset = (height - dashHeight) / 2;
                dashY = startY + (offset - opt.DASH_POSITION_ADJUSTMENT * offset);
            }

            childBox.set_origin(Math.round(startX + dashX), Math.round(dashY));
            childBox.set_size(dashWidth, dashHeight);
            this._dash.allocate(childBox);
        }

        availableHeight -= opt.DASH_VERTICAL ? 0 : dashHeight + spacing;

        let [searchHeight] = this._searchEntry.get_preferred_height(width - wsTmbWidth);

        // Workspaces
        let params = [box, workAreaBox, dashWidth, dashHeight, wsTmbWidth, searchHeight, startY];
        const transitionParams = this._stateAdjustment.getStateTransitionParams();

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

        // Search entry
        const searchXoffset = (opt.DASH_LEFT ? dashWidth : 0) + spacing + (opt.WS_TMB_RIGHT ? 0 : wsTmbWidth + spacing);

        // Y position under top Dash
        let searchEntryX, searchEntryY;
        if (opt.DASH_TOP)
            searchEntryY = startY + dashHeight - spacing;
        else
            searchEntryY = startY;


        searchEntryX = searchXoffset;
        let searchWidth = width - 2 * spacing - wsTmbWidth - (opt.DASH_VERTICAL ? dashWidth : 0); // xAlignCenter is given by wsBox
        searchWidth = this._xAlignCenter ? width - 2 * (wsTmbWidth + spacing) : searchWidth;

        if (opt.CENTER_SEARCH_VIEW) {
            childBox.set_origin(0, searchEntryY);
            childBox.set_size(width, searchHeight);
        } else {
            childBox.set_origin(this._xAlignCenter ? 0 : searchEntryX, searchEntryY);
            childBox.set_size(this._xAlignCenter ? width : searchWidth - spacing, searchHeight);
        }

        this._searchEntry.allocate(childBox);

        availableHeight -= searchHeight + spacing;

        // if (this._appDisplay.visible)... ? Can cause problems
        params = [box, workAreaBox, searchHeight, dashWidth, dashHeight, wsTmbWidth, startY]; // send startY, can be corrected
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

        // Search
        if (opt.CENTER_SEARCH_VIEW) {
            const dashW = (opt.DASH_VERTICAL ? dashWidth : 0) + spacing;
            searchWidth = width - 2 * wsTmbWidth - 2 * dashW;
            childBox.set_origin(wsTmbWidth + dashW, startY + (opt.DASH_TOP ? dashHeight : spacing) + searchHeight);
        } else {
            childBox.set_origin(this._xAlignCenter ? wsTmbWidth + spacing : searchXoffset, startY + (opt.DASH_TOP ? dashHeight : spacing) + searchHeight);
        }

        childBox.set_size(searchWidth, availableHeight);
        this._searchController.allocate(childBox);

        this._runPostAllocation();
    },
};

const ControlsManagerLayoutHorizontal = {
    _computeWorkspacesBoxForState(state, box, workAreaBox, dashWidth, dashHeight, thumbnailsHeight, searchHeight, startY) {
        const workspaceBox = box.copy();
        let [width, height] = workspaceBox.get_size();
        // let { x1: startX/* , y1: startY*/ } = workAreaBox;
        const { spacing } = this;
        // const { expandFraction } = this._workspacesThumbnails;

        const dash = Main.overview.dash;
        // including Dash to Dock and clones properties for compatibility
        if (_Util.dashIsDashToDock()) {
            // Dash to Dock always affects workAreaBox
            Main.layoutManager._trackedActors.forEach(actor => {
                if (actor.affectsStruts && actor.actor.width === dash.width) {
                    if (dash._isHorizontal) {
                        // disabled inteli-hide don't need compensation
                        // startY needs to be corrected in allocate()
                        if (dash.get_parent()?.get_parent()?.get_parent()?._intellihideIsEnabled)
                            height += dash.height;
                        else if (opt.DASH_TOP)
                            height += dash.height;
                    } else {
                        width += dash.width;
                    }
                }
            });
        }

        let wWidth, wHeight, wsBoxY, wsBoxX;

        switch (state) {
        case ControlsState.HIDDEN:
            // if PANEL_OVERVIEW_ONLY, the affectStruts property is set to false to avoid stuttering
            // therefore we added panel height to startY for the overview allocation,
            // but here we need to remove the correction since the panel will be in the hidden state
            if (opt.START_Y_OFFSET) {
                let [x, y] = workAreaBox.get_origin();
                y -= opt.START_Y_OFFSET;
                workspaceBox.set_origin(x, y);
            } else {
                workspaceBox.set_origin(...workAreaBox.get_origin());
            }
            workspaceBox.set_size(...workAreaBox.get_size());
            break;
        case ControlsState.WINDOW_PICKER:
        case ControlsState.APP_GRID:
            if (opt.WS_ANIMATION && opt.SHOW_WS_TMB && state === ControlsState.APP_GRID) {
                workspaceBox.set_origin(...this._workspacesThumbnails.get_position());
                workspaceBox.set_size(...this._workspacesThumbnails.get_size());
            } else if (opt.OVERVIEW_MODE2 && !opt.WORKSPACE_MODE) {
                if (opt.START_Y_OFFSET) {
                    let [x, y] = workAreaBox.get_origin();
                    y -= opt.START_Y_OFFSET;
                    workspaceBox.set_origin(x, y);
                } else {
                    workspaceBox.set_origin(...workAreaBox.get_origin());
                }
                workspaceBox.set_size(...workAreaBox.get_size());
            } else {
                // if PANEL_OVERVIEW_ONLY, panel doesn't affect workArea height (affectStruts === false), it is necessary to compensate
                height = opt.PANEL_POSITION_TOP ? height : height - Main.panel.height;
                searchHeight = opt.SHOW_SEARCH_ENTRY ? searchHeight : 0;
                wWidth = width -
                            spacing -
                            (opt.DASH_VERTICAL ? dashWidth : 0) -
                            4 * spacing;
                wHeight = height -
                            (opt.DASH_VERTICAL ? spacing : dashHeight) -
                            thumbnailsHeight -
                            searchHeight -
                            4 * spacing;

                const ratio = width / height;
                let wRatio = wWidth / wHeight;
                let scale = ratio / wRatio;

                if (scale > 1) {
                    wHeight /= scale;
                    wWidth = wHeight * ratio;
                } else {
                    wWidth *= scale;
                    wHeight = wWidth / ratio;
                }

                // height decides the actual size, ratio is given by the workarea
                wHeight *= opt.WS_PREVIEW_SCALE;
                wWidth *= opt.WS_PREVIEW_SCALE;

                let xOffset = 0;
                let yOffset = 0;

                const yOffsetT = (opt.DASH_TOP ? dashHeight : 0) + (opt.WS_TMB_TOP ? thumbnailsHeight : 0) + searchHeight;
                const yOffsetB = (opt.DASH_BOTTOM ? dashHeight : 0) + (opt.WS_TMB_BOTTOM ? thumbnailsHeight : 0);

                const yAvailableSpace = (height - yOffsetT - wHeight - yOffsetB) / 2;
                yOffset = yOffsetT + yAvailableSpace;

                const xOffsetL = (opt.DASH_LEFT ? dashWidth : 0) + spacing;
                const xOffsetR = (opt.DASH_RIGHT ? dashWidth : 0) + spacing;
                const centeredBoxX = (width - wWidth) / 2;

                this._xAlignCenter = false;
                if (centeredBoxX < Math.max(xOffsetL, xOffsetR)) {
                    xOffset = xOffsetL + spacing + (width - xOffsetL - wWidth - xOffsetR) / 2;
                } else {
                    xOffset = centeredBoxX;
                    this._xAlignCenter = true;
                }

                wsBoxX = /* startX + */xOffset;
                wsBoxY = Math.round(startY + yOffset);
                workspaceBox.set_origin(Math.round(wsBoxX), Math.round(wsBoxY));
                workspaceBox.set_size(Math.round(wWidth), Math.round(wHeight));
            }
        }

        return workspaceBox;
    },

    _getAppDisplayBoxForState(state, box, workAreaBox, searchHeight, dashWidth, dashHeight, thumbnailsHeight, startY) {
        const [width] = box.get_size();
        const { x1: startX } = workAreaBox;
        // const { y1: startY } = workAreaBox;
        let height = workAreaBox.get_height();
        const appDisplayBox = new Clutter.ActorBox();
        const { spacing } = this;

        const yOffsetT = (opt.WS_TMB_TOP ? thumbnailsHeight : 0) + (opt.DASH_TOP ? dashHeight : 0) + (opt.SHOW_SEARCH_ENTRY ? searchHeight : 0);
        const yOffsetB = (opt.WS_TMB_BOTTOM ? thumbnailsHeight : 0) + (opt.DASH_BOTTOM ? dashHeight : 0);
        const xOffsetL = opt.DASH_LEFT ? dashWidth : 0;
        const xOffsetR = opt.DASH_RIGHT ? dashWidth : 0;
        const adWidth = opt.CENTER_APP_GRID ? width - 2 * Math.max(xOffsetL, xOffsetR) - 4 * spacing : width - xOffsetL - xOffsetR - 4 * spacing;
        const adHeight = height - yOffsetT - yOffsetB - 4 * spacing;

        const appDisplayX = opt.CENTER_APP_GRID ? (width - adWidth) / 2 : xOffsetL + 2 * spacing;
        const appDisplayY = startY + yOffsetT + 2 * spacing;

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

    vfunc_allocate(container, box) {
        const childBox = new Clutter.ActorBox();

        const { spacing } = this;

        const monitor = Main.layoutManager.findMonitorForActor(this._container);
        const workArea = Main.layoutManager.getWorkAreaForMonitor(monitor.index);
        const startX = workArea.x - monitor.x;
        // if PANEL_OVERVIEW_ONLY, the affectStruts property is set to false to avoid stuttering
        // therefore we need to add panel height to startY
        let startY = workArea.y - monitor.y + opt.START_Y_OFFSET;
        const workAreaBox = new Clutter.ActorBox();
        workAreaBox.set_origin(startX, startY);
        workAreaBox.set_size(workArea.width, workArea.height);
        box.y1 += startY;
        box.x1 += startX;
        let [width, height] = box.get_size();
        // if panel is at bottom position,
        // compensate for the height of the available box (the box size is calculated for top panel)
        height = opt.PANEL_POSITION_TOP ? height : height - Main.panel.height;
        let availableHeight = height;

        // Dash
        const maxDashHeight = Math.round(box.get_height() * DASH_MAX_SIZE_RATIO);
        const maxDashWidth = maxDashHeight * 0.8;
        let dashHeight = 0;
        let dashWidth = 0;

        // dash cloud be overridden by the Dash to Dock clone
        const dash = Main.overview.dash;
        if (_Util.dashIsDashToDock()) {
            // if Dash to Dock replaced the default dash and its inteli-hide is disabled we need to compensate for affected startY
            if (!Main.overview.dash.get_parent()?.get_parent()?.get_parent()?._intellihideIsEnabled) {
                // if (Main.panel.y === monitor.y)
                // startY = Main.panel.height + spacing;
            }
            dashHeight = dash.height;
            dashWidth = dash.width;
            opt.DASH_TOP = dash._position === 0;
            opt.DASH_VERTICAL = [1, 3].includes(dash._position);
            this._dash.allocate(childBox);
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

        let [searchHeight] = this._searchEntry.get_preferred_height(width);

        let wsTmbWidth = 0;
        let wsTmbHeight = 0;

        if (this._workspacesThumbnails.visible) {
            // const { expandFraction } = this._workspacesThumbnails;
            const dashWidthReservation = !opt.WS_TMB_FULL && opt.DASH_VERTICAL ? dashWidth : 0;

            wsTmbHeight = height * opt.MAX_THUMBNAIL_SCALE;
            let totalTmbSpacing;
            [totalTmbSpacing, wsTmbWidth] = this._workspacesThumbnails.get_preferred_custom_width(wsTmbHeight);
            wsTmbWidth += totalTmbSpacing;

            const wsTmbWidthMax = opt.WS_TMB_FULL
                ? width
                : width - (opt.DASH_VERTICAL ? 0 : dashWidthReservation);

            if (wsTmbWidth > wsTmbWidthMax) {
                wsTmbWidth = wsTmbWidthMax;
                wsTmbHeight = this._workspacesThumbnails.get_preferred_custom_height(wsTmbWidth)[1];
            }

            let wsTmbY;
            if (opt.WS_TMB_TOP)
                wsTmbY = Math.round(startY + /* searchHeight + */(opt.DASH_TOP ? dashHeight : spacing / 2));
            else
                wsTmbY = Math.round(startY + height - (opt.DASH_BOTTOM ? dashHeight : 0) - wsTmbHeight);

            let wstOffset = (width - wsTmbWidth) / 2;
            wstOffset -= opt.WS_TMB_POSITION_ADJUSTMENT * (wstOffset - spacing / 2);
            let wsTmbX = Math.round(Math.clamp(
                startX + wstOffset,
                startX + (opt.DASH_LEFT ? dashWidthReservation : 0),
                width - wsTmbWidth - startX - (opt.DASH_RIGHT ? dashWidthReservation : 0)
            ));

            childBox.set_origin(wsTmbX, wsTmbY);
            childBox.set_size(Math.round(wsTmbWidth), Math.round(wsTmbHeight));

            this._workspacesThumbnails.allocate(childBox);

            availableHeight -= wsTmbHeight + spacing;
        }


        if (this._dash.visible) {
            if (opt.WS_TMB_FULL && opt.DASH_VERTICAL) {
                const wMaxHeight = height - spacing - wsTmbHeight;
                this._dash.setMaxSize(maxDashWidth, wMaxHeight);
                [, dashWidth] = this._dash.get_preferred_width(wMaxHeight);
                [, dashHeight] = this._dash.get_preferred_height(dashWidth);
                dashWidth = Math.round(Math.min(dashWidth, maxDashWidth));
                dashHeight = Math.round(Math.min(dashHeight, wMaxHeight));
            }

            let dashX, dashY, offset;
            if (opt.DASH_RIGHT)
                dashX = width - dashWidth;
            else if (opt.DASH_LEFT)
                dashX = 0;
            else if (opt.DASH_TOP)
                dashY = startY;
            else
                dashY = startY + height - dashHeight;


            if (opt.DASH_VERTICAL) {
                if (opt.WS_TMB_FULL) {
                    offset = (height - dashHeight - wsTmbHeight) / 2;
                    if (opt.WS_TMB_TOP) {
                        offset -= opt.DASH_POSITION_ADJUSTMENT * (offset - spacing / 2);
                        dashY = startY + offset + wsTmbHeight;
                    } else {
                        offset -= opt.DASH_POSITION_ADJUSTMENT * (offset - spacing / 2);
                        dashY = startY + offset;
                    }
                } else {
                    offset = (height - dashHeight) / 2;
                    offset -= opt.DASH_POSITION_ADJUSTMENT * (offset - spacing / 2);
                    dashY = startY + offset;
                }
            } else {
                offset = (width - dashWidth) / 2;
                dashX = startX + (offset - opt.DASH_POSITION_ADJUSTMENT * (offset - spacing));
            }

            childBox.set_origin(Math.round(startX + dashX), Math.round(dashY));
            childBox.set_size(dashWidth, dashHeight);
            this._dash.allocate(childBox);
        }

        availableHeight -= opt.DASH_VERTICAL ? 0 : dashHeight;

        // Workspaces
        let params = [box, workAreaBox, dashWidth, dashHeight, wsTmbHeight, searchHeight, startY];
        const transitionParams = this._stateAdjustment.getStateTransitionParams();

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

        // Search entry
        const searchXoffset = (opt.DASH_LEFT ? dashWidth : 0) + spacing;

        // Y position under top Dash
        let searchEntryX, searchEntryY;
        if (opt.DASH_TOP)
            searchEntryY = startY + (opt.WS_TMB_TOP ? wsTmbHeight : 0) + dashHeight - spacing;
        else
            searchEntryY = startY + (opt.WS_TMB_TOP ? wsTmbHeight + spacing : 0);


        searchEntryX = searchXoffset;
        let searchWidth = width - 2 * spacing - (opt.DASH_VERTICAL ? dashWidth : 0); // xAlignCenter is given by wsBox
        searchWidth = this._xAlignCenter ? width : searchWidth;

        if (opt.CENTER_SEARCH_VIEW) {
            childBox.set_origin(0, searchEntryY);
            childBox.set_size(width, searchHeight);
        } else {
            childBox.set_origin(this._xAlignCenter ? 0 : searchEntryX, searchEntryY);
            childBox.set_size(this._xAlignCenter ? width : searchWidth - spacing, searchHeight);
        }

        this._searchEntry.allocate(childBox);

        availableHeight -= searchHeight + spacing;

        // if (this._appDisplay.visible)... ? Can cause problems
        params = [box, workAreaBox, searchHeight, dashWidth, dashHeight, wsTmbHeight, startY];
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

        // Search
        if (opt.CENTER_SEARCH_VIEW) {
            const dashW = (opt.DASH_VERTICAL ? dashWidth : 0) + spacing;
            searchWidth = width - 2 * dashW;
            childBox.set_origin(dashW, startY + (opt.DASH_TOP ? dashHeight : spacing) + (opt.WS_TMB_TOP ? wsTmbHeight + spacing : 0) + searchHeight);
        } else {
            childBox.set_origin(this._xAlignCenter ? spacing : searchXoffset, startY + (opt.DASH_TOP ? dashHeight : spacing) + (opt.WS_TMB_TOP ? wsTmbHeight + spacing : 0) + searchHeight);
        }

        childBox.set_size(searchWidth, availableHeight);
        this._searchController.allocate(childBox);

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
