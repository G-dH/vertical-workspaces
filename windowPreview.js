/**
 * Vertical Workspaces
 * windowPreview.js
 * 
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2023
 * @license    GPL-3.0
 *
 */

'use strict';

const { Clutter, GLib, Graphene, Meta, Shell, St } = imports.gi;

const Main = imports.ui.main;
const WindowPreview = imports.ui.windowPreview;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const _Util = Me.imports.util;
let _overrides;

const WINDOW_SCALE_TIME = imports.ui.windowPreview.WINDOW_SCALE_TIME;
const WINDOW_ACTIVE_SIZE_INC = imports.ui.windowPreview.WINDOW_ACTIVE_SIZE_INC;
const WINDOW_OVERLAY_FADE_TIME = imports.ui.windowPreview.WINDOW_OVERLAY_FADE_TIME;
const SEARCH_WINDOWS_PREFIX = Me.imports.windowSearchProvider.prefix;

const ControlsState = imports.ui.overviewControls.ControlsState;

var opt = null;

function update(reset = false) {
    if (_overrides) {
        _overrides.removeAll();
    }

    if (reset) {
        _overrides = null;
        opt = null;
        return;
    }

    opt = Me.imports.settings.opt;
    _overrides = new _Util.Overrides();

    _overrides.addOverride('WindowPreview', WindowPreview.WindowPreview.prototype, WindowPreviewCommon);
    // move titles into window previews
    _overrides.addInjection('WindowPreview', WindowPreview.WindowPreview.prototype, WindowPreviewInjections);
}

//----- WindowPreview ------------------------------------------------------------------
var WindowPreviewInjections = {
    _init: function() {
        const ICON_OVERLAP = 0.7;

        if (opt.WIN_PREVIEW_ICON_SIZE < 64) {
            this.remove_child(this._icon);
            this._icon.destroy();
            const tracker = Shell.WindowTracker.get_default();
            const app = tracker.get_window_app(this.metaWindow);
            this._icon = app.create_icon_texture(opt.WIN_PREVIEW_ICON_SIZE);
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
            if (opt.WIN_PREVIEW_ICON_SIZE < 22) {
                // disable app icon
                this._icon.hide();
            }
            this._iconSize = opt.WIN_PREVIEW_ICON_SIZE;
        }

        const { scaleFactor } = St.ThemeContext.get_for_stage(global.stage);
        const iconOverlap = opt.WIN_PREVIEW_ICON_SIZE * ICON_OVERLAP;
        // we cannot get proper title height before it gets to the stage, so 35 is estimated height + spacing
        this._title.get_constraints()[1].offset = scaleFactor * (- iconOverlap - 35);
        this.set_child_above_sibling(this._title, null);
        // if window is created while the overview is shown, icon and title should be visible immediately
        if (Main.overview._overview._controls._stateAdjustment.value < 1) {
            this._icon.scale_x = 0;
            this._icon.scale_y = 0;
            this._title.opacity = 0;
        }

        if (opt.ALWAYS_SHOW_WIN_TITLES) {
            this._title.show();
            this._stateConId = this._workspace._background._stateAdjustment.connect('notify::value', (adj) => {
                this._title.opacity = Math.floor(adj.value) * 255;
            });

        }

        if (opt.OVERVIEW_MODE === 1) {
            // spread windows on hover
            this._wsStateConId = this.connect('enter-event', () => {
                // don't spread windows if user don't use pointer device at this moment
                if (global.get_pointer()[0] === opt.showingPointerX)
                    return;

                const adjustment = this._workspace._background._stateAdjustment;
                if (!adjustment.value && !Main.overview._animationInProgress) {
                    opt.WORKSPACE_MODE = 1;
                    if (adjustment.value === 0) {
                        adjustment.value = 0;
                        adjustment.ease(1, {
                            duration: 200,
                            mode: Clutter.AnimationMode.EASE_OUT_QUAD
                        });
                    }
                }
                this.disconnect(this._wsStateConId);
            });
        }

        if (opt.OVERVIEW_MODE) {
            // show window icon and title on ws windows spread
            this._stateAdjustmentSigId = this._workspace.stateAdjustment.connect('notify::value', this._updateIconScale.bind(this));
        }

        // replace click action with custom one
        const action = this.get_actions()[0];
        this.remove_action(action);

        const clickAction = new Clutter.ClickAction();
        clickAction.connect('clicked', (action) => {
            const button = action.get_button();
            if (button === Clutter.BUTTON_PRIMARY) {
                this._activate();
            } else if (button === Clutter.BUTTON_SECONDARY) {
                // this action cancels long-press event and the 'long-press-cancel' event is used by the Shell to actually initiate DnD
                // so the dnd initiation needs to be removed
                if (this._longPressLater) {
                    Meta.later_remove(this._longPressLater);
                    delete this._longPressLater;
                }
                const tracker = Shell.WindowTracker.get_default();
                const appName = tracker.get_window_app(this.metaWindow).get_name();
                _Util.activateSearchProvider(`${SEARCH_WINDOWS_PREFIX} ${appName}`);
                return Clutter.EVENT_STOP;
            }
        });

        clickAction.connect('long-press', this._onLongPress.bind(this));
        this.add_action(clickAction);

        this.connect('destroy', () => this._workspace.stateAdjustment.disconnect(this._stateConId));
    }
}

// WindowPreview
var WindowPreviewCommon = {
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
        if (!primaryMonitor && opt.WORKSPACE_MODE &&
            ((initialState === ControlsState.WINDOW_PICKER && finalState === ControlsState.APP_GRID) ||
            (initialState === ControlsState.APP_GRID && finalState === ControlsState.WINDOW_PICKER))
            ) {
            scale = 1;
        } else if (!primaryMonitor && opt.OVERVIEW_MODE && !opt.WORKSPACE_MODE) {
            scale = 0;
        /*} else if (primaryMonitor && ((initialState === ControlsState.WINDOW_PICKER && finalState === ControlsState.APP_GRID) ||
            initialState === ControlsState.APP_GRID && finalState === ControlsState.HIDDEN)) {*/
        } else if (primaryMonitor && currentState > ControlsState.WINDOW_PICKER) {
            scale = 0;
        }

        // in static workspace mode show icon and title on windows expose
        if (opt.OVERVIEW_MODE) {
            if (currentState === 1) {
                scale = opt.WORKSPACE_MODE;
            } else if (finalState === 1 || (finalState === 0 && !opt.WORKSPACE_MODE)) {
                return;
            }
        }

        this._icon.set({
            scale_x: scale,
            scale_y: scale,
        });

        // if titles are in 'always show' mode, we need to add transition between visible/invisible state
        // but the transition is quite expensive,
        // showing the titles at the end of the transition is good enough and workspace preview transition is much smoother
        this._title.set({
            opacity: Math.floor(scale) * 255,
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

        if (!opt.ALWAYS_SHOW_WIN_TITLES) {
            toShow.push(this._title);
        }

        toShow.forEach(a => {
            a.opacity = 0;
            a.show();
            a.ease({
                opacity: 255,
                duration: animate ? WINDOW_OVERLAY_FADE_TIME : 0,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        });

        const [width, height] = this.window_container.get_size();
        const { scaleFactor } = St.ThemeContext.get_for_stage(global.stage);
        const activeExtraSize = WINDOW_ACTIVE_SIZE_INC * 2 * scaleFactor;
        const origSize = Math.max(width, height);
        const scale = (origSize + activeExtraSize) / origSize;

        this.window_container.ease({
            scale_x: scale,
            scale_y: scale,
            duration: animate ? WINDOW_SCALE_TIME : 0,
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

        if (!opt.ALWAYS_SHOW_WIN_TITLES) {
            toHide.push(this._title);
        }
        toHide.forEach(a => {
            a.opacity = 255;
            a.ease({
                opacity: 0,
                duration: animate ? WINDOW_OVERLAY_FADE_TIME : 0,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => a.hide(),
            });
        });

        if (this.window_container) {
            this.window_container.ease({
                scale_x: 1,
                scale_y: 1,
                duration: animate ? WINDOW_SCALE_TIME : 0,
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
