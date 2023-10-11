/**
 * V-Shell (Vertical Workspaces)
 * WinTmb
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2021-2023
 * @license    GPL-3.0
 */

'use strict';

let Gi;
let Ui;
let Me;

let opt;

const SCROLL_ICON_OPACITY = 240;
const DRAG_OPACITY = 200;
const CLOSE_BTN_OPACITY = 240;


var WinTmbModule = class {
    constructor(gi, ui, misc, me) {
        Gi = gi;
        Ui = ui;
        Me = me;

        opt = Me.opt;

        this._firstActivation = true;
        this._moduleEnabled = false;
    }

    cleanGlobals() {
        Gi = null;
        Ui = null;
        Me = null;
        opt = null;
    }

    update(reset) {
        this._removeTimeouts();

        this._moduleEnabled = opt.get('windowThumbnailModule');

        reset = reset || !this._moduleEnabled;

        // don't touch the original code if module disabled
        if (reset && !this._firstActivation) {
            this._disableModule();
        } else if (!reset) {
            this._firstActivation = false;
            this._activateModule();
        }
    }

    _activateModule() {
        this._timeouts = {};
        if (!this._windowThumbnails)
            this._windowThumbnails = [];

        Ui.Main.overview.connectObject('hidden', () => this.showThumbnails(), this);
    }

    _disableModule() {
        Ui.Main.overview.disconnectObject(this);
        this._disconnectStateAdjustment();
        this.removeAllThumbnails();
    }

    _removeTimeouts() {
        if (this._timeouts) {
            Object.values(this._timeouts).forEach(t => {
                if (t)
                    Gi.GLib.source_remove(t);
            });
            this._timeouts = null;
        }
    }

    createThumbnail(metaWin) {
        const tmb = new WindowThumbnail(metaWin, {
            'height': Math.floor(opt.WINDOW_THUMBNAIL_SCALE * global.display.get_monitor_geometry(global.display.get_current_monitor()).height),
            'thumbnailsOnScreen': this._windowThumbnails.length,
        });

        this._windowThumbnails.push(tmb);
        tmb.connect('removed', tmb => {
            this._windowThumbnails.splice(this._windowThumbnails.indexOf(tmb), 1);
            tmb.destroy();
            if (!this._windowThumbnails.length)
                this._disconnectStateAdjustment();
        });


        if (!this._stateAdjustmentConId) {
            this._stateAdjustmentConId = Ui.Main.overview._overview.controls._stateAdjustment.connectObject('notify::value', () => {
                if (!this._thumbnailsHidden && (!opt.OVERVIEW_MODE2 || opt.WORKSPACE_MODE))
                    this.hideThumbnails();
            }, this);
        }
    }

    hideThumbnails() {
        this._windowThumbnails.forEach(tmb => {
            tmb.ease({
                opacity: 0,
                duration: 200,
                mode: Gi.Clutter.AnimationMode.LINEAR,
                onComplete: () => tmb.hide(),
            });
        });
        this._thumbnailsHidden = true;
    }

    showThumbnails() {
        this._windowThumbnails.forEach(tmb => {
            tmb.show();
            tmb.ease({
                opacity: 255,
                duration: 100,
                mode: Gi.Clutter.AnimationMode.LINEAR,
            });
        });
        this._thumbnailsHidden = false;
    }

    removeAllThumbnails() {
        this._windowThumbnails.forEach(tmb => tmb.remove());
        this._windowThumbnails = [];
    }

    _disconnectStateAdjustment() {
        Ui.Main.overview._overview.controls._stateAdjustment.disconnectObject(this);
    }
};

const { GObject, St } = imports.gi;
const WindowThumbnail = GObject.registerClass({
    Signals: { 'removed': {} },
}, class WindowThumbnail extends St.Widget {
    _init(metaWin, args) {
        this._hoverShowsPreview = false;
        this._customOpacity = 255;
        this._initTmbHeight = args.height;
        this._minimumHeight = Math.floor(5 / 100 * global.display.get_monitor_geometry(global.display.get_current_monitor()).height);
        this._scrollTimeout = 100;
        this._positionOffset = args.thumbnailsOnScreen;
        this._reverseTmbWheelFunc = false;
        this._click_count = 1;
        this._prevBtnPressTime = 0;
        this.w = metaWin;
        super._init({
            layout_manager: new Gi.Clutter.BinLayout(),
            visible: true,
            reactive: true,
            can_focus: true,
            track_hover: true,
        });
        this.connect('button-release-event', this._onBtnReleased.bind(this));
        this.connect('scroll-event', this._onScrollEvent.bind(this));
        // this.connect('motion-event', this._onMouseMove.bind(this)); // may be useful in the future..

        this._delegate = this;
        this._draggable = Ui.DND.makeDraggable(this, { dragActorOpacity: DRAG_OPACITY });
        this._draggable.connect('drag-end', this._end_drag.bind(this));
        this._draggable.connect('drag-cancelled', this._end_drag.bind(this));
        this._draggable._animateDragEnd = eventTime => {
            this._draggable._animationInProgress = true;
            this._draggable._onAnimationComplete(this._draggable._dragActor, eventTime);
            this.opacity = this._customOpacity;
        };

        this.clone = new Gi.Clutter.Clone({ reactive: true });
        Ui.Main.layoutManager.addChrome(this);

        this.window = this.w.get_compositor_private();

        this.clone.set_source(this.window);

        this.add_child(this.clone);
        this._addCloseButton();
        this._addScrollModeIcon();

        this.connect('enter-event', () => {
            global.display.set_cursor(Gi.Meta.Cursor.POINTING_HAND);
            this._closeButton.opacity = CLOSE_BTN_OPACITY;
            this._scrollModeBin.opacity = SCROLL_ICON_OPACITY;
            if (this._hoverShowsPreview && !Ui.Main.overview._shown) {
                this._closeButton.opacity = 50;
                this._showWindowPreview(false, true);
            }
        });

        this.connect('leave-event', () => {
            global.display.set_cursor(Gi.Meta.Cursor.DEFAULT);
            this._closeButton.opacity = 0;
            this._scrollModeBin.opacity = 0;
            if (this._winPreview)
                this._destroyWindowPreview();
        });

        this._setSize(true);
        this.set_position(...this._getInitialPosition());
        this.show();
        this.window_id = this.w.get_id();
        this.tmbRedrawDirection = true;

        // remove thumbnail content and hide thumbnail if its window is destroyed
        this.windowConnect = this.window.connect('destroy', () => {
            if (this)
                this.remove();
        });
    }

    _getInitialPosition() {
        const offset = 20;
        let monitor = Ui.Main.layoutManager.monitors[global.display.get_current_monitor()];
        let x = Math.min(monitor.x + monitor.width  - (this.window.width  * this.scale) - offset);
        let y = Math.min(monitor.y + monitor.height - (this.window.height * this.scale) - offset - ((this._positionOffset * this._initTmbHeight) % (monitor.height - this._initTmbHeight)));
        return [x, y];
    }

    _setSize(resetScale = false) {
        if (resetScale)
            this.scale = Math.min(1.0, this._initTmbHeight / this.window.height);

        const width = this.window.width * this.scale;
        const height = this.window.height * this.scale;
        this.set_size(width, height);
        if (this.icon) {
            this.icon.scale_x = this.scale;
            this.icon.scale_y = this.scale;
        }

        // when the scale of this. actor change, this.clone resize accordingly,
        // but the reactive area of the actor doesn't change until the actor is redrawn
        // this updates the actor's input region area:
        Ui.Main.layoutManager._queueUpdateRegions();
    }

    /* _onMouseMove(actor, event) {
        let [pos_x, pos_y] = event.get_coords();
        let state = event.get_state();
        if (this._ctrlPressed(state)) {
        }
    }*/

    _onBtnReleased(actor, event) {
        // Clutter.Event.click_count property in no longer available, since GS42
        if ((event.get_time() - this._prevBtnPressTime) < Gi.Clutter.Settings.get_default().double_click_time)
            this._click_count += 1;
        else
            this._click_count = 1;

        this._prevBtnPressTime = event.get_time();

        if (this._click_count === 2 && event.get_button() === Gi.Clutter.BUTTON_PRIMARY)
            this.w.activate(global.get_current_time());


        const button = event.get_button();
        const state = event.get_state();
        switch (button) {
        case Gi.Clutter.BUTTON_PRIMARY:
            if (this._ctrlPressed(state)) {
                this._setSize();
            } else {
                this._reverseTmbWheelFunc = !this._reverseTmbWheelFunc;
                this._scrollModeBin.set_child(this._reverseTmbWheelFunc ? this._scrollModeSourceIcon : this._scrollModeResizeIcon);
            }
            return Gi.Clutter.EVENT_STOP;
        case Gi.Clutter.BUTTON_SECONDARY:
            if (this._ctrlPressed(state)) {
                this.remove();
            } else {
                this._hoverShowsPreview = !this._hoverShowsPreview;
                this._showWindowPreview();
            }
            return Gi.Clutter.EVENT_STOP;
        case Gi.Clutter.BUTTON_MIDDLE:
            if (this._ctrlPressed(state))
                this.w.delete(global.get_current_time());
            return Gi.Clutter.EVENT_STOP;
        default:
            return Gi.Clutter.EVENT_PROPAGATE;
        }
    }

    _onScrollEvent(actor, event) {
        let direction = Me.Util.getScrollDirection(event);

        if (this._actionTimeoutActive())
            return Gi.Clutter.EVENT_PROPAGATE;
        let state = event.get_state();
        switch (direction) {
        case Gi.Clutter.ScrollDirection.UP:
            if (this._shiftPressed(state)) {
                this.opacity = Math.min(255, this.opacity + 24);
                this._customOpacity = this.opacity;
            } else if (this._reverseTmbWheelFunc !== this._ctrlPressed(state)) {
                this._switchSourceWin(-1);
            } else if (this._reverseTmbWheelFunc === this._ctrlPressed(state)) {
                this.scale = Math.max(0.05, this.scale - 0.025);
            }
            break;
        case Gi.Clutter.ScrollDirection.DOWN:
            if (this._shiftPressed(state)) {
                this.opacity = Math.max(48, this.opacity - 24);
                this._customOpacity = this.opacity;
            } else if (this._reverseTmbWheelFunc !== this._ctrlPressed(state)) {
                this._switchSourceWin(+1);
            } else if (this._reverseTmbWheelFunc === this._ctrlPressed(state)) {
                this.scale = Math.min(1, this.scale + 0.025);
            }
            break;
        default:
            return Gi.Clutter.EVENT_PROPAGATE;
        }
        this._setSize();
        return Gi.Clutter.EVENT_STOP;
    }

    remove() {
        if (this.clone) {
            this.window.disconnect(this.windowConnect);
            this.clone.set_source(null);
        }
        if (this._winPreview)
            this._destroyWindowPreview();

        this.emit('removed');
    }

    _end_drag() {
        this.set_position(this._draggable._dragOffsetX + this._draggable._dragX, this._draggable._dragOffsetY + this._draggable._dragY);
        this._setSize();
    }

    _ctrlPressed(state) {
        return (state & Gi.Clutter.ModifierType.CONTROL_MASK) !== 0;
    }

    _shiftPressed(state) {
        return (state & Gi.Clutter.ModifierType.SHIFT_MASK) !== 0;
    }

    _switchSourceWin(direction) {
        let windows = global.display.get_tab_list(Gi.Meta.TabList.NORMAL_ALL, null);
        windows = windows.filter(w => !(w.skip_taskbar || w.minimized));
        let idx = -1;
        for (let i = 0; i < windows.length; i++) {
            if (windows[i] === this.w) {
                idx = i + direction;
                break;
            }
        }
        idx = idx >= windows.length ? 0 : idx;
        idx = idx < 0 ? windows.length - 1 : idx;
        let w = windows[idx];
        let win = w.get_compositor_private();
        this.clone.set_source(win);
        this.window.disconnect(this.windowConnect);
        // the new thumbnail should be the same height as the previous one
        this.scale = (this.scale * this.window.height) / win.height;
        this.window = win;
        this.windowConnect = this.window.connect('destroy', () => {
            if (this)
                this.remove();
        });
        this.w = w;

        if (this._winPreview)
            this._showWindowPreview(true);
    }

    _actionTimeoutActive() {
        const timeout = this._reverseTmbWheelFunc ? this._scrollTimeout : this._scrollTimeout / 4;
        if (!this._lastActionTime || Date.now() - this._lastActionTime > timeout) {
            this._lastActionTime = Date.now();
            return false;
        }
        return true;
    }

    /* _setIcon() {
        let tracker = Gi.Shell.WindowTracker.get_default();
        let app = tracker.get_window_app(this.w);
        let icon = app
            ? app.create_icon_texture(this.height)
            : new St.Icon({ icon_name: 'icon-missing', icon_size: this.height });
        icon.x_expand = icon.y_expand = true;
        if (this.icon)
            this.icon.destroy();
        this.icon = icon;
    }*/

    _addCloseButton() {
        const closeButton = new St.Button({
            opacity: 0,
            style_class: 'window-close',
            child: new St.Icon({ icon_name: 'preview-close-symbolic' }),
            x_align: Gi.Clutter.ActorAlign.END,
            y_align: Gi.Clutter.ActorAlign.START,
            x_expand: true,
            y_expand: true,
        });

        closeButton.set_style(`
            margin: 3px;
            background-color: rgba(200, 0, 0, 0.9);
        `);

        closeButton.connect('clicked', () => {
            this.remove();
            return Gi.Clutter.EVENT_STOP;
        });

        this._closeButton = closeButton;
        this.add_child(this._closeButton);
    }

    _addScrollModeIcon() {
        this._scrollModeBin = new St.Bin({
            x_expand: true,
            y_expand: true,
        });
        this._scrollModeResizeIcon = new St.Icon({
            icon_name: 'view-fullscreen-symbolic',
            x_align: Gi.Clutter.ActorAlign.CENTER,
            y_align: Gi.Clutter.ActorAlign.END,
            x_expand: true,
            y_expand: true,
            opacity: SCROLL_ICON_OPACITY,
            style_class: 'icon-dropshadow',
            scale_x: 0.5,
            scale_y: 0.5,
        });
        this._scrollModeResizeIcon.set_style(`
            margin: 13px;
            color: rgb(255, 255, 255);
            box-shadow: 0 0 40px 40px rgba(0,0,0,0.7);
        `);
        this._scrollModeSourceIcon = new St.Icon({
            icon_name: 'media-skip-forward-symbolic',
            x_align: Gi.Clutter.ActorAlign.CENTER,
            y_align: Gi.Clutter.ActorAlign.END,
            x_expand: true,
            y_expand: true,
            opacity: SCROLL_ICON_OPACITY,
            style_class: 'icon-dropshadow',
            scale_x: 0.5,
            scale_y: 0.5,
        });
        this._scrollModeSourceIcon.set_style(`
            margin: 13px;
            color: rgb(255, 255, 255);
            box-shadow: 0 0 40px 40px rgba(0,0,0,0.7);
        `);
        this._scrollModeBin.set_child(this._scrollModeResizeIcon);
        this.add_child(this._scrollModeBin);
        this._scrollModeBin.opacity = 0;
    }

    _showWindowPreview(update = false, dontDestroy = false) {
        if (this._winPreview && !dontDestroy) {
            this._destroyWindowPreview();
            this._previewCreationTime = 0;
            this._closeButton.opacity = CLOSE_BTN_OPACITY;
            if (!update)
                return;
        }

        if (!this._winPreview) {
            this._winPreview = new Ui.AltTab.CyclerHighlight();
            global.window_group.add_actor(this._winPreview);
            [this._winPreview._xPointer, this._winPreview._yPointer] = global.get_pointer();
        }

        if (!update) {
            this._winPreview.opacity = 0;
            this._winPreview.ease({
                opacity: 255,
                duration: 70,
                mode: Gi.Clutter.AnimationMode.LINEAR,
                /* onComplete: () => {
                    this._closeButton.opacity = 50;
                },*/
            });

            this.ease({
                opacity: Math.min(50, this._customOpacity),
                duration: 70,
                mode: Gi.Clutter.AnimationMode.LINEAR,
                onComplete: () => {
                },
            });
        } else {
            this._winPreview.opacity = 255;
        }
        this._winPreview.window = this.w;
        this._winPreview._window = this.w;
        global.window_group.set_child_above_sibling(this._winPreview, null);
    }

    _destroyWindowPreview() {
        if (this._winPreview) {
            this._winPreview.ease({
                opacity: 0,
                duration: 100,
                mode: Gi.Clutter.AnimationMode.LINEAR,
                onComplete: () => {
                    this._winPreview.destroy();
                    this._winPreview = null;
                    this.opacity = this._customOpacity;
                },
            });
        }
    }
});
