/**
 * V-Shell (Vertical Workspaces)
 * windowPreview.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2025
 * @license    GPL-3.0
 *
 */

'use strict';

import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import Pango from 'gi://Pango';
import Graphene from 'gi://Graphene';
import Atk from 'gi://Atk';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as OverviewControls from 'resource:///org/gnome/shell/ui/overviewControls.js';
import * as WindowPreview from 'resource:///org/gnome/shell/ui/windowPreview.js';

let Me;
let opt;

const WINDOW_SCALE_TIME = 200;
const WINDOW_ACTIVE_SIZE_INC = 8;
const WINDOW_OVERLAY_FADE_TIME = 200;
const WINDOW_DND_SIZE = 256;
const DRAGGING_WINDOW_OPACITY = 100;
const ICON_OVERLAP = 0.7;
const ICON_TITLE_SPACING = 6;

const ControlsState = OverviewControls.ControlsState;

export const WindowPreviewModule = class {
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
        this.moduleEnabled = opt.get('windowPreviewModule');
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
            console.debug('  WindowPreviewModule - Keeping untouched');
    }

    _activateModule() {
        if (!this._overrides)
            this._overrides = new Me.Util.Overrides();

        this._overrides.addOverride('WindowPreview', WindowPreview.WindowPreview.prototype, WindowPreviewCommon);
        // A shorter timeout allows user to quickly cancel the selection by leaving the preview with the mouse pointer
        // if (opt.ALWAYS_ACTIVATE_SELECTED_WINDOW)
        // WindowPreview.WINDOW_OVERLAY_IDLE_HIDE_TIMEOUT = 150; // incompatible
        console.debug('  WindowPreviewModule - Activated');
    }

    _disableModule() {
        // If WindowPreview._init was injected by another extension (like Burn My Windows)
        // which enables/disables before V-Shell
        // don't restore the original if it's not injected,
        // because it would restore injected _init and recursion would freeze GS when extensions are enabled again.
        // This can happen when all extension re-enabled, not only when screen is locked/unlocked
        // If _init doesn't include "fn.apply(this, args)" when reset === true, some extension already restored the original
        const skipReset = WindowPreview.WindowPreview.prototype._init.toString().includes('fn.apply(this, args)');
        if (this._overrides && skipReset) {
            // skip restoring original _init()
            this._overrides['_init'] = null;
        }

        if (this._overrides)
            this._overrides.removeAll();

        this._overrides = null;

        console.debug('  WindowPreviewModule - Disabled');
    }
};

const WindowPreviewCommon = {
    _init(metaWindow, workspace, overviewAdjustment) {
        this.metaWindow = metaWindow;
        this.metaWindow._delegate = this;
        this._windowActor = metaWindow.get_compositor_private();
        this._workspace = workspace;
        this._overviewAdjustment = overviewAdjustment;

        const ICON_SIZE = opt.WIN_PREVIEW_ICON_SIZE;

        const windowContainer = new Clutter.Actor({
            pivot_point: new Graphene.Point({ x: 0.5, y: 0.5 }),
        });

        Shell.WindowPreview.prototype._init.bind(this)({
            reactive: true,
            can_focus: true,
            accessible_role: Atk.Role.PUSH_BUTTON,
            offscreen_redirect: Clutter.OffscreenRedirect.AUTOMATIC_FOR_OPACITY,
            windowContainer,
        });

        windowContainer.connect('notify::scale-x',
            () => this._adjustOverlayOffsets());
        // gjs currently can't handle setting an actors layout manager during
        // the initialization of the actor if that layout manager keeps track
        // of its container, so set the layout manager after creating the
        // container
        windowContainer.layout_manager = new Shell.WindowPreviewLayout();
        this.add_child(windowContainer);

        this._addWindow(metaWindow);

        this._delegate = this;

        this._stackAbove = null;

        this._cachedBoundingBox = {
            x: windowContainer.layout_manager.bounding_box.x1,
            y: windowContainer.layout_manager.bounding_box.y1,
            width: windowContainer.layout_manager.bounding_box.get_width(),
            height: windowContainer.layout_manager.bounding_box.get_height(),
        };

        windowContainer.layout_manager.connect(
            'notify::bounding-box', layout => {
                this._cachedBoundingBox = {
                    x: layout.bounding_box.x1,
                    y: layout.bounding_box.y1,
                    width: layout.bounding_box.get_width(),
                    height: layout.bounding_box.get_height(),
                };

                // A bounding box of 0x0 means all windows were removed
                if (layout.bounding_box.get_area() > 0)
                    this.emit('size-changed');
            });

        this._windowActor.connectObject('destroy', () => this.destroy(), this);

        this._updateAttachedDialogs();

        let clickAction = new Clutter.ClickAction();
        clickAction.connect('clicked', act => {
            const button = act.get_button();
            if (button === Clutter.BUTTON_SECONDARY) {
                if (opt.WIN_PREVIEW_SEC_BTN_ACTION === 1) {
                    this._closeWinAction();
                    return Clutter.EVENT_STOP;
                } else if (opt.WIN_PREVIEW_SEC_BTN_ACTION === 2) {
                    this._searchAppWindowsAction();
                    return Clutter.EVENT_STOP;
                } else if (opt.WIN_PREVIEW_SEC_BTN_ACTION === 3 && global.windowThumbnails) {
                    this._removeLaters();
                    global.windowThumbnails?.createThumbnail(metaWindow);
                    return Clutter.EVENT_STOP;
                }
            } else if (button === Clutter.BUTTON_MIDDLE) {
                if (opt.WIN_PREVIEW_MID_BTN_ACTION === 1) {
                    this._closeWinAction();
                    return Clutter.EVENT_STOP;
                } else if (opt.WIN_PREVIEW_MID_BTN_ACTION === 2) {
                    this._searchAppWindowsAction();
                    return Clutter.EVENT_STOP;
                } else if (opt.WIN_PREVIEW_MID_BTN_ACTION === 3 && global.windowThumbnails) {
                    this._removeLaters();
                    global.windowThumbnails?.createThumbnail(metaWindow);
                    return Clutter.EVENT_STOP;
                }
            }
            return this._activate();
        });


        if (this._onLongPress) {
            clickAction.connect('long-press', this._onLongPress.bind(this));
        } else {
            clickAction.connect('long-press', (action, actor, state) => {
                if (state === Clutter.LongPressState.ACTIVATE)
                    this.showOverlay(true);
                return true;
            });
        }

        this.connect('destroy', this._onDestroy.bind(this));

        this._draggable = DND.makeDraggable(this, {
            restoreOnSuccess: true,
            manualMode: !!this._onLongPress,
            dragActorMaxSize: WINDOW_DND_SIZE,
            dragActorOpacity: DRAGGING_WINDOW_OPACITY,
        });

        // _draggable.addClickAction is new in GS45
        if (this._draggable.addClickAction)
            this._draggable.addClickAction(clickAction);
        else
            this.add_action(clickAction);

        this._draggable.connect('drag-begin', this._onDragBegin.bind(this));
        this._draggable.connect('drag-cancelled', this._onDragCancelled.bind(this));
        this._draggable.connect('drag-end', this._onDragEnd.bind(this));
        this.inDrag = false;

        this._selected = false;
        this._overlayEnabled = true;
        this._overlayShown = false;
        this._closeRequested = false;
        this._idleHideOverlayId = 0;

        const tracker = Shell.WindowTracker.get_default();
        const app = tracker.get_window_app(this.metaWindow);
        this._icon = app.create_icon_texture(ICON_SIZE);
        this._icon.add_style_class_name('icon-dropshadow');
        this._icon.set({
            reactive: true,
            pivot_point: new Graphene.Point({ x: 0.5, y: 0.5 }),
        });
        this._icon.add_constraint(new Clutter.BindConstraint({
            source: windowContainer,
            coordinate: Clutter.BindCoordinate.POSITION,
        }));
        this._icon.add_constraint(new Clutter.AlignConstraint({
            source: windowContainer,
            align_axis: Clutter.AlignAxis.X_AXIS,
            factor: 0.5,
        }));
        this._icon.add_constraint(new Clutter.AlignConstraint({
            source: windowContainer,
            align_axis: Clutter.AlignAxis.Y_AXIS,
            pivot_point: new Graphene.Point({ x: -1, y: ICON_OVERLAP }),
            factor: 1,
        }));

        if (opt.WINDOW_ICON_CLICK_ACTION) {
            const iconClickAction = new Clutter.ClickAction();
            iconClickAction.connect('clicked', act => {
                if (act.get_button() === Clutter.BUTTON_PRIMARY) {
                    if (opt.WINDOW_ICON_CLICK_ACTION === 1) {
                        this._searchAppWindowsAction();
                        return Clutter.EVENT_STOP;
                    } else if (opt.WINDOW_ICON_CLICK_ACTION === 2 && global.windowThumbnails) {
                        this._removeLaters();
                        global.windowThumbnails?.createThumbnail(metaWindow);
                        return Clutter.EVENT_STOP;
                    }
                } /* else if (act.get_button() === Clutter.BUTTON_SECONDARY) {
                    return Clutter.EVENT_STOP;
                }*/
                return Clutter.EVENT_PROPAGATE;
            });
            this._icon.add_action(iconClickAction);
        }
        const { scaleFactor } = St.ThemeContext.get_for_stage(global.stage);
        this._title = new St.Label({
            visible: false,
            style_class: opt.WIN_TITLES_POSITION_TOP ? 'window-caption window-caption-top' : 'window-caption',
            text: this._getCaption(),
            reactive: true,
        });
        this._title.clutter_text.single_line_mode = true;
        this._title.clutter_text.x_align = Clutter.ActorAlign.CENTER;

        this._title.add_constraint(new Clutter.BindConstraint({
            source: windowContainer,
            coordinate: Clutter.BindCoordinate.X,
        }));

        let offset, pivotY;
        const spacing = 4;
        if (this.WIN_TITLES_POSITION_BELOW) {
            offset = scaleFactor * (ICON_SIZE * (1 - ICON_OVERLAP) + spacing);
            pivotY = 0;
        } else if (opt.WIN_TITLES_POSITION_TOP) {
            offset = Math.round(-5 * scaleFactor);
            pivotY = 0;

            this._titleWidthConstraint = new Clutter.BindConstraint({
                source: windowContainer,
                coordinate: Clutter.BindCoordinate.WIDTH,
                offset: 2,
            });
            this._title.add_constraint(this._titleWidthConstraint);
        } else {
            offset = -scaleFactor * (ICON_SIZE * ICON_OVERLAP + spacing);
            pivotY = 1;
        }

        this._title.add_constraint(new Clutter.BindConstraint({
            source: windowContainer,
            coordinate: Clutter.BindCoordinate.Y,
            offset,
        }));
        this._title.add_constraint(new Clutter.AlignConstraint({
            source: windowContainer,
            align_axis: Clutter.AlignAxis.X_AXIS,
            factor: 0.5,
        }));
        this._title.add_constraint(new Clutter.AlignConstraint({
            source: windowContainer,
            align_axis: Clutter.AlignAxis.Y_AXIS,
            pivot_point: new Graphene.Point({ x: -1, y: pivotY }),
            factor: opt.WIN_TITLES_POSITION_TOP ? 0 : 1,
        }));
        this._title.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this.label_actor = this._title;
        this.metaWindow.connectObject(
            'notify::title', () => (this._title.text = this._getCaption()),
            this);

        const layout = Meta.prefs_get_button_layout();
        this._closeButtonSide =
            layout.left_buttons.includes(Meta.ButtonFunction.CLOSE)
                ? St.Side.LEFT : St.Side.RIGHT;
        this._closeButton = new St.Button({
            visible: false,
            style_class: 'window-close',
            icon_name: 'preview-close-symbolic',
        });
        this._closeButton.add_constraint(new Clutter.BindConstraint({
            source: windowContainer,
            coordinate: Clutter.BindCoordinate.POSITION,
        }));
        this._closeButton.add_constraint(new Clutter.AlignConstraint({
            source: windowContainer,
            align_axis: Clutter.AlignAxis.X_AXIS,
            pivot_point: new Graphene.Point({ x: 0.5, y: -1 }),
            factor: this._closeButtonSide === St.Side.LEFT ? 0 : 1,
        }));
        this._closeButton.add_constraint(new Clutter.AlignConstraint({
            source: windowContainer,
            align_axis: Clutter.AlignAxis.Y_AXIS,
            pivot_point: new Graphene.Point({ x: -1, y: 0.5 }),
            factor: 0,
        }));
        this._closeButton.connect('clicked', () => this._deleteAll());

        this.add_child(this._title);
        this.add_child(this._icon);
        this.add_child(this._closeButton);

        this._overviewAdjustment.connectObject(
            'notify::value', () => this._updateIconScale(), this);
        this._updateIconScale();

        this.connect('notify::realized', () => {
            if (!this.realized)
                return;

            this._title.ensure_style();
            this._icon.ensure_style();
        });

        if (ICON_SIZE < 22) {
            // disable app icon
            this._icon.hide();
        } else {
            this._updateIconScale();
        }

        // if window is created while the overview is shown, icon and title should be visible immediately
        if (Main.overview._overview._controls._stateAdjustment.value < 1) {
            this._icon.scale_x = 0;
            this._icon.scale_y = 0;
            this._title.opacity = 0;
        }

        if (opt.ALWAYS_SHOW_WIN_TITLES)
            this._title.show();

        if (opt.OVERVIEW_MODE) {
            // show window icon and title on ws windows spread
            this._stateAdjustmentSigId = this._workspace.stateAdjustment.connect('notify::value', this._updateIconScale.bind(this));
        }

        const metaWin = this.metaWindow;
        if (opt.DASH_ISOLATE_WS && !metaWin._wsChangedConId) {
            metaWin._wsChangedConId = metaWin.connect('workspace-changed',
                () => Main.overview.dash._queueRedisplay());
        } else if (!opt.DASH_ISOLATE_WS && metaWin._wsChangedConId) {
            metaWin.disconnect(metaWin._wsChangedConId);
        }
    },

    _closeWinAction() {
        this.hide();
        this._deleteAll();
    },

    _removeLaters() {
        if (this._longPressLater) {
            const laters = global.compositor.get_laters();
            laters.remove(this._longPressLater);
            delete this._longPressLater;
        }
    },

    _activate() {
        // If another window is currently selected,
        // show the overlay without animation
        // to keep this window on top of others
        // during the transition from the overview.
        this.showOverlay(false);

        opt.CANCEL_ALWAYS_ACTIVATE_SELECTED = true;
        this.emit('selected', global.get_current_time());
    },

    vfunc_enter_event(event) {
        // Ignore this event if the mouse hasn't been used since triggering the overview
        if (global.get_pointer()[0] === opt.initialPointerX)
            return Clutter.EVENT_PROPAGATE;

        if (opt.OVERVIEW_MODE === 1 && !opt.WORKSPACE_MODE && Main.overview._overview._controls._stateAdjustment.value === 1) {
            // Spread windows on hover
            Me.Util.exposeWindows();
        }

        this.showOverlay(true);
        return Shell.WindowPreview.prototype.vfunc_enter_event.bind(this)(event);
    },

    vfunc_leave_event(event) {
        // Ignore this event if the mouse hasn't been used since triggering the overview,
        // or when using keyboard to switch workspace
        if (global.get_pointer()[0] === opt.initialPointerX)
            return Clutter.EVENT_PROPAGATE;
        return WindowPreview.WindowPreview.prototype.vfunc_leave_event.bind(this)(event);
    },

    vfunc_key_press_event(event) {
        let symbol = event.get_key_symbol();

        const modifierState = event.get_state();
        const isShiftPressed = Me.Util.isShiftPressed(modifierState);
        const isCtrlPressed = Me.Util.isCtrlPressed(modifierState);
        const isAltPressed = Me.Util.isAltPressed(modifierState);
        const isSuperPressed = Me.Util.isSuperPressed(modifierState);

        switch (symbol) {
        case Clutter.KEY_Return:
        case Clutter.KEY_KP_Enter:
            if (isSuperPressed) {
                // This action is handled in the workspacesView module
                return Clutter.EVENT_PROPAGATE;
            } else if (isCtrlPressed && isShiftPressed) {
                // Move all app windows to the next monitor
                Me.Util.moveWindowsToMonitor(this.metaWindow, true);
                return Clutter.EVENT_STOP;
            } else if (!isCtrlPressed && isShiftPressed) {
                // Move window to the next monitor
                Me.Util.moveWindowsToMonitor(this.metaWindow);
                return Clutter.EVENT_STOP;
            } else {
                this._activate();
            }
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Delete:
            if (!isCtrlPressed && !isShiftPressed) {
                // Close window
                this._deleteAll();
                return Clutter.EVENT_STOP;
            } else if (isCtrlPressed && isShiftPressed) {
                // Close all windows on this monitor
                Me.Util.closeWorkspace(
                    this.metaWindow.get_workspace(),
                    this.metaWindow.get_monitor()
                );
                return Clutter.EVENT_STOP;
            }
            break;
        case Clutter.KEY_Tab:
        case Clutter.KEY_ISO_Left_Tab:
            if (isSuperPressed &&
                !isCtrlPressed &&
                global.display.get_n_monitors() > 1
            ) {
                this._switchMonitorFocus();
                return Clutter.EVENT_STOP;
            }

            if (Me.Util.handleOverviewTabKeyPress(event))
                return Clutter.EVENT_STOP;
            break;
        case Clutter.KEY_Left:
        case Clutter.KEY_Right:
        case Clutter.KEY_Up:
        case Clutter.KEY_Down:
            if (isShiftPressed && !isSuperPressed && !isAltPressed) {
                this._moveWindowToWs(symbol);
                return Clutter.EVENT_STOP;
            }
            break;
        }

        return Shell.WindowPreview.prototype.vfunc_key_press_event.bind(this)(event);
    },

    _moveWindowToWs(symbol) {
        const direction = [Clutter.KEY_Left, Clutter.KEY_Up].includes(symbol) ? -1 : 1;
        let wsIndex = this.metaWindow.get_workspace().index() + direction;
        let createNewWS = Me.Util.isCtrlPressed();
        if (wsIndex === -1 || createNewWS) {
            wsIndex = wsIndex === -1 ? 0 : wsIndex;
            createNewWS = true;
        }

        this.hideOverlay(false);

        Me.Util.moveWindowToMonitorAndWorkspace(
            this.metaWindow,
            this.metaWindow.get_monitor(),
            wsIndex,
            createNewWS,
            false // don't create new workspace if it doesn't exist and workspaces are set to fixed number
        );
    },

    _switchMonitorFocus() {
        const nMonitors = global.display.get_n_monitors();
        const currentMonitorIndex = this.metaWindow.get_monitor();
        const nextMonitorIndex = (currentMonitorIndex + 1) % nMonitors;
        Me.Util.activateKeyboardForWorkspaceView(nextMonitorIndex);
    },

    _searchAppWindowsAction() {
        // this action cancels long-press event and the 'long-press-cancel' event is used by the Shell to actually initiate DnD
        // so the dnd initiation needs to be removed
        this._removeLaters();
        const tracker = Shell.WindowTracker.get_default();
        const appName = tracker.get_window_app(this.metaWindow).get_name();
        Me.Util.activateSearchProvider(`${Me.WSP_PREFIX} ${appName}`);
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
                scale = this._workspace._background._stateAdjustment.value;
            else if ((finalState === 1 && !opt.WORKSPACE_MODE) || (finalState === 0 && !opt.WORKSPACE_MODE))
                return;
        }

        if (!opt.WS_ANIMATION && (Main.overview.searchController.searchActive ||
            ((initialState === ControlsState.WINDOW_PICKER && finalState === ControlsState.APP_GRID) ||
             (initialState === ControlsState.APP_GRID && finalState === ControlsState.WINDOW_PICKER)))
        )
            return;

        // if titles are in 'always show' mode, we need to add transition between visible/invisible state
        // but the transition is quite expensive,
        // showing the titles at the end of the transition is good enough and workspace preview transition is much smoother
        if (scale === 1) {
            this._icon.set({
                scale_x: 1,
                scale_y: 1,
            });
            this._title.ease({
                duration: 100,
                opacity: 255,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        } else {
            this._title.opacity = 0;
            this._icon.set({
                scale_x: scale,
                scale_y: scale,
            });
        }
    },

    showOverlay(animate) {
        if (!this._overlayEnabled)
            return;

        if (this._overlayShown)
            return;

        this._overlayShown = true;
        this._restack();

        // If we're supposed to animate and an animation in our direction
        // is already happening, let that one continue
        /* const ongoingTransition = this._title.get_transition('opacity');
        if (animate &&
            ongoingTransition &&
            ongoingTransition.get_interval().peek_final_value() === 255)
            return;*/

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

        // When leaving overview, mark the window for activation if needed
        // The marked window is activated during _onDestroy()
        const leavingOverview = Main.overview._overview.controls._stateAdjustment.value < 1;
        if (opt.ALWAYS_ACTIVATE_SELECTED_WINDOW && leavingOverview)
            this._activateSelected = true;

        if (this._destroyed)
            return;

        // Prevent restacking the preview if it should remain on top
        // while leaving overview
        if (!(opt.ALWAYS_ACTIVATE_SELECTED_WINDOW && leavingOverview))
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

    _adjustOverlayOffsets() {
        // Assume that scale-x and scale-y update always set
        // in lock-step; that allows us to not use separate
        // handlers for horizontal and vertical offsets
        const previewScale = this.window_container.scale_x;
        const [previewWidth, previewHeight] =
            this.window_container.allocation.get_size();

        // Skip this if container's allocation is not complete
        if (!Number.isFinite(previewWidth) || !Number.isFinite(previewHeight))
            return;

        const heightIncrease =
            Math.floor(previewHeight * (previewScale - 1) / 2);
        const widthIncrease =
            Math.ceil(previewWidth * (previewScale - 1) / 2);

        const closeAlign = this._closeButtonSide === St.Side.LEFT ? -1 : 1;

        this._icon.translation_y = heightIncrease;
        if (this._titleWidthConstraint) {
            this._titleWidthConstraint.offset = 2 + widthIncrease * 2;
            this._title.translation_y = -heightIncrease;
        } else {
            this._title.translation_y = heightIncrease;
        }
        this._closeButton.set({
            translation_x: closeAlign * widthIncrease,
            translation_y: -heightIncrease,
        });
    },

    overlapHeights() {
        const [, titleHeight] = this._title.get_preferred_height(-1);

        const topOverlap = 0;
        const bottomOverlap = opt.WIN_TITLES_POSITION === 2 ? titleHeight + ICON_TITLE_SPACING : 0;

        return [topOverlap, bottomOverlap];
    },

    property_windowCenter: {
        get() {
            // This the easiest way to change the default window sorting in the overview
            // which uses position of the windows on the screen to minimize travel
            if (opt.SORT_OVERVIEW_WINDOWS_MRU) {
                return {
                    x: global.display.get_tab_list(0, null).indexOf(this.metaWindow),
                    y: global.display.get_tab_list(0, null).indexOf(this.metaWindow),
                };
            } else if (opt.SORT_OVERVIEW_WINDOWS_STABLE) {
                return {
                    x: this.metaWindow.get_stable_sequence(),
                    y: this.metaWindow.get_stable_sequence(),
                };
            } else {
                return {
                    x: this._cachedBoundingBox.x + this._cachedBoundingBox.width / 2,
                    y: this._cachedBoundingBox.y + this._cachedBoundingBox.height / 2,
                };
            }
        },
    },

    property_overlayEnabled: {
        set(enabled) {
            this._overlayEnabled = enabled;
            this.notify('overlay-enabled');

            if (!enabled)
                this.hideOverlay(false);
            else if (global.get_pointer()[0] !== opt.initialPointerX && (this['has-pointer'] || global.stage.key_focus === this))
                this.showOverlay(true);
        },
    },

    removeOverlayTimeout() {
        if (this._idleHideOverlayId) {
            GLib.source_remove(this._idleHideOverlayId);
            this._idleHideOverlayId = 0;
        }
    },

    _onDestroy() {
        this._destroyed = true;
        if (this._activateSelected && !opt.CANCEL_ALWAYS_ACTIVATE_SELECTED)
            this._activate();

        this.metaWindow._delegate = null;
        this._delegate = null;

        if (this._longPressLater) {
            const laters = global.compositor.get_laters();
            laters.remove(this._longPressLater);
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

        if (this._stateAdjustmentSigId)
            this._workspace.stateAdjustment.disconnect(this._stateAdjustmentSigId);
    },
};
