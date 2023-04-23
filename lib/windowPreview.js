/**
 * V-Shell (Vertical Workspaces)
 * windowPreview.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2023
 * @license    GPL-3.0
 *
 */

'use strict';

const { Clutter, GLib, GObject, Graphene, Meta, Shell, St } = imports.gi;

const Main = imports.ui.main;
const WindowPreview = imports.ui.windowPreview;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const _Util = Me.imports.lib.util;

let _overrides;

const WINDOW_SCALE_TIME = imports.ui.windowPreview.WINDOW_SCALE_TIME;
const WINDOW_ACTIVE_SIZE_INC = imports.ui.windowPreview.WINDOW_ACTIVE_SIZE_INC;
const WINDOW_OVERLAY_FADE_TIME = imports.ui.windowPreview.WINDOW_OVERLAY_FADE_TIME;
const SEARCH_WINDOWS_PREFIX = Me.imports.lib.windowSearchProvider.prefix;

const ControlsState = imports.ui.overviewControls.ControlsState;

let opt;
let _firstRun = true;

function update(reset = false) {
    opt = Me.imports.lib.settings.opt;
    const moduleEnabled = opt.get('windowPreviewModule', true);
    reset = reset || !moduleEnabled;

    // don't even touch this module if disabled
    if (_firstRun && reset)
        return;

    _firstRun = false;

    if (_overrides)
        _overrides.removeAll();


    if (reset) {
        _overrides = null;
        opt = null;
        WindowPreview.WINDOW_OVERLAY_IDLE_HIDE_TIMEOUT = 750;
        return;
    }

    _overrides = new _Util.Overrides();

    _overrides.addOverride('WindowPreview', WindowPreview.WindowPreview.prototype, WindowPreviewCommon);
    // A shorter timeout allows user to quickly cancel the selection by leaving the preview with the mouse pointer
    if (opt.ALWAYS_ACTIVATE_SELECTED_WINDOW)
        WindowPreview.WINDOW_OVERLAY_IDLE_HIDE_TIMEOUT = 150;
}

const WindowPreviewCommon = {
    // injection to _init()
    after__init() {
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
        this._title.get_constraints()[1].offset = scaleFactor * (-iconOverlap - 35);
        this.set_child_above_sibling(this._title, null);
        // if window is created while the overview is shown, icon and title should be visible immediately
        if (Main.overview._overview._controls._stateAdjustment.value < 1) {
            this._icon.scale_x = 0;
            this._icon.scale_y = 0;
            this._title.opacity = 0;
        }

        if (opt.ALWAYS_SHOW_WIN_TITLES)
            this._title.show();

        if (opt.OVERVIEW_MODE === 1) {
            // spread windows on hover
            this._wsStateConId = this.connect('enter-event', () => {
                // don't spread windows if user don't use pointer device at this moment
                if (global.get_pointer()[0] === opt.showingPointerX || Main.overview._overview._controls._stateAdjustment.value < 1)
                    return;

                const adjustment = this._workspace._background._stateAdjustment;
                opt.WORKSPACE_MODE = 1;
                _Util.exposeWindows(adjustment, false);
                this.disconnect(this._wsStateConId);
            });
        }

        if (opt.OVERVIEW_MODE) {
            // show window icon and title on ws windows spread
            this._stateAdjustmentSigId = this._workspace.stateAdjustment.connect('notify::value', this._updateIconScale.bind(this));
        }

        // replace click action with custom one
        const action = this.get_actions()[0];

        const handlerId = GObject.signal_handler_find(action, { signalId: 'clicked' });
        if (handlerId)
            action.disconnect(handlerId);

        action.connect('clicked', act => {
            const button = act.get_button();
            if (button === Clutter.BUTTON_PRIMARY) {
                this._activate();
                return Clutter.EVENT_STOP;
            } else if (button === Clutter.BUTTON_SECONDARY) {
                if (!opt.WIN_PREVIEW_SEC_BTN_ACTION) {
                    return Clutter.EVENT_PROPAGATE;
                } else if (opt.WIN_PREVIEW_SEC_BTN_ACTION === 1) {
                    this._closeWinAction();
                    return Clutter.EVENT_STOP;
                } else if (opt.WIN_PREVIEW_SEC_BTN_ACTION === 2) {
                    this._searchAppWindowsAction();
                    return Clutter.EVENT_STOP;
                }
            } else if (button === Clutter.BUTTON_MIDDLE) {
                if (!opt.WIN_PREVIEW_MID_BTN_ACTION) {
                    return Clutter.EVENT_PROPAGATE;
                } else if (opt.WIN_PREVIEW_MID_BTN_ACTION === 1) {
                    this._closeWinAction();
                    return Clutter.EVENT_STOP;
                } else if (opt.WIN_PREVIEW_MID_BTN_ACTION === 2) {
                    this._searchAppWindowsAction();
                    return Clutter.EVENT_STOP;
                }
            }
            return Clutter.EVENT_PROPAGATE;
        });

        if (opt.WINDOW_ICON_CLICK_SEARCH) {
            const iconClickAction = new Clutter.ClickAction();
            iconClickAction.connect('clicked', act => {
                if (act.get_button() === Clutter.BUTTON_PRIMARY) {
                    const tracker = Shell.WindowTracker.get_default();
                    const appName = tracker.get_window_app(this.metaWindow).get_name();
                    _Util.activateSearchProvider(`${SEARCH_WINDOWS_PREFIX} ${appName}`);
                    return Clutter.EVENT_STOP;
                }
                return Clutter.EVENT_PROPAGATE;
            });
            this._icon.add_action(iconClickAction);
        }
    },

    _closeWinAction() {
        this.hide();
        this._deleteAll();
    },

    _searchAppWindowsAction() {
        // this action cancels long-press event and the 'long-press-cancel' event is used by the Shell to actually initiate DnD
        // so the dnd initiation needs to be removed
        if (this._longPressLater) {
            if (global.compositor) {
                const laters = global.compositor.get_laters();
                laters.remove(this._longPressLater);
            } else {
                Meta.later_remove(this._longPressLater);
                delete this._longPressLater;
            }
        }
        const tracker = Shell.WindowTracker.get_default();
        const appName = tracker.get_window_app(this.metaWindow).get_name();
        _Util.activateSearchProvider(`${SEARCH_WINDOWS_PREFIX} ${appName}`);
    },

    _updateIconScale() {
        let { currentState, initialState, finalState } =
            this._overviewAdjustment.getStateTransitionParams();

        // Current state - 0 - HIDDEN, 1 - WINDOW_PICKER, 2 - APP_GRID
        const primaryMonitor = this.metaWindow.get_monitor() === global.display.get_primary_monitor();

        const visible =
            (initialState > ControlsState.HIDDEN || finalState > ControlsState.HIDDEN) &&
            !(finalState === ControlsState.APP_GRID && opt.WS_ANIMATION && primaryMonitor);

        let scale = 0;
        if (visible)
            scale = currentState >= 1 ? 1 : currentState % 1;

        if (!primaryMonitor && opt.WORKSPACE_MODE &&
            ((initialState === ControlsState.WINDOW_PICKER && finalState === ControlsState.APP_GRID) ||
            (initialState === ControlsState.APP_GRID && finalState === ControlsState.WINDOW_PICKER))
        )
            scale = 1;
        else if (!primaryMonitor && opt.OVERVIEW_MODE && !opt.WORKSPACE_MODE)
            scale = 0;
        /* } else if (primaryMonitor && ((initialState === ControlsState.WINDOW_PICKER && finalState === ControlsState.APP_GRID) ||
            initialState === ControlsState.APP_GRID && finalState === ControlsState.HIDDEN)) {*/
        else if (primaryMonitor && currentState > ControlsState.WINDOW_PICKER)
            scale = 0;


        // in static workspace mode show icon and title on windows expose
        if (opt.OVERVIEW_MODE) {
            if (currentState === 1)
                scale = opt.WORKSPACE_MODE;
            else if (finalState === 1 || (finalState === 0 && !opt.WORKSPACE_MODE))
                return;
        }

        if (!opt.WS_ANIMATION &&
            ((initialState === ControlsState.WINDOW_PICKER && finalState === ControlsState.APP_GRID) ||
             (initialState === ControlsState.APP_GRID && finalState === ControlsState.WINDOW_PICKER))
        )
            return;


        if (scale === 1) {
            this._icon.ease({
                duration: 50,
                scale_x: scale,
                scale_y: scale,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
            this._title.ease({
                duration: 100,
                opacity: 255,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        } else if (this._icon.scale_x !== 0) {
            this._icon.set({
                scale_x: 0,
                scale_y: 0,
            });
            this._title.opacity = 0;
        }

        // if titles are in 'always show' mode, we need to add transition between visible/invisible state
        // but the transition is quite expensive,
        // showing the titles at the end of the transition is good enough and workspace preview transition is much smoother
    },

    showOverlay(animate) {
        if (!this._overlayEnabled)
            return;

        if (this._overlayShown)
            return;

        this._overlayShown = true;
        if (!opt.ALWAYS_ACTIVATE_SELECTED_WINDOW)
            this._restack();

        // If we're supposed to animate and an animation in our direction
        // is already happening, let that one continue
        const ongoingTransition = this._title.get_transition('opacity');
        if (animate &&
            ongoingTransition &&
            ongoingTransition.get_interval().peek_final_value() === 255)
            return;

        const toShow = this._windowCanClose() && opt.SHOW_CLOSE_BUTTON
            ? [this._closeButton]
            : [];

        if (!opt.ALWAYS_SHOW_WIN_TITLES)
            toShow.push(this._title);


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

    hideOverlay(animate) {
        if (!this._overlayShown)
            return;
        this._overlayShown = false;
        if (opt.ALWAYS_ACTIVATE_SELECTED_WINDOW && Main.overview._overview.controls._stateAdjustment.value < 1) {
            this.get_parent()?.set_child_above_sibling(this, null);
            this._activateSelected = true;
        }

        if (!opt.ALWAYS_ACTIVATE_SELECTED_WINDOW)
            this._restack();

        // If we're supposed to animate and an animation in our direction
        // is already happening, let that one continue
        const ongoingTransition = this._title.get_transition('opacity');
        if (animate &&
            ongoingTransition &&
            ongoingTransition.get_interval().peek_final_value() === 0)
            return;

        const toHide = [this._closeButton];

        if (!opt.ALWAYS_SHOW_WIN_TITLES)
            toHide.push(this._title);

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
        // workaround for upstream bug - hideOverlay is called after windowPreview is destroyed, from the leave event callback
        // hiding the preview now avoids firing the post-mortem leave event
        this.hide();
        if (this._activateSelected)
            this._activate();

        this.metaWindow._delegate = null;
        this._delegate = null;

        if (this._longPressLater) {
            if (global.compositor) {
                const laters = global.compositor.get_laters();
                laters.remove(this._longPressLater);
                delete this._longPressLater;
            } else {
                Meta.later_remove(this._longPressLater);
                delete this._longPressLater;
            }
        }

        if (this._idleHideOverlayId > 0) {
            GLib.source_remove(this._idleHideOverlayId);
            this._idleHideOverlayId = 0;
        }

        if (this.inDrag) {
            this.emit('drag-end');
            this.inDrag = false;
        }

        if (this._stateAdjustmentSigId)
            this._workspace.stateAdjustment.disconnect(this._stateAdjustmentSigId);
    },
};
