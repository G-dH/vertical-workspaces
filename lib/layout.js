/**
 * V-Shell (Vertical Workspaces)
 * layout.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2023
 * @license    GPL-3.0
 *
 */

'use strict';

const { Meta, GLib, Shell, Clutter, GObject } = imports.gi;

const Main = imports.ui.main;
const Layout = imports.ui.layout;
const Ripples = imports.ui.ripples;
const DND = imports.ui.dnd;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const _Util = Me.imports.lib.util;

let _overrides;
let _timeouts;
let opt;
let _firstRun = true;
let _originalUpdateHotCorners;

function update(reset = false) {
    opt = Me.imports.lib.settings.opt;
    const moduleEnabled = opt.get('layoutModule', true);
    const conflict = _Util.getEnabledExtensions('custom-hot-corners').length ||
                     _Util.getEnabledExtensions('dash-to-panel').length;
    reset = reset || !moduleEnabled;

    // don't even touch this module if disabled or in conflict
    if (_firstRun && (reset || conflict))
        return;

    _firstRun = false;

    if (!_originalUpdateHotCorners)
        _originalUpdateHotCorners = Layout.LayoutManager.prototype._updateHotCorners;

    if (_overrides)
        _overrides.removeAll();

    if (_timeouts) {
        Object.values(_timeouts).forEach(t => {
            if (t)
                GLib.source_remove(t);
        });
    }

    if (reset) {
        _overrides = null;
        opt = null;
        _timeouts = null;
        Main.layoutManager._updateHotCorners = _originalUpdateHotCorners;
        Main.layoutManager._updateHotCorners();
        return;
    }

    _timeouts = {};

    _overrides = new _Util.Overrides();
    _overrides.addOverride('LayoutManager', Layout.LayoutManager.prototype, LayoutManagerCommon);

    Main.layoutManager._updateHotCorners = LayoutManagerCommon._updateHotCorners.bind(Main.layoutManager);

    Main.layoutManager._updatePanelBarrier();
    Main.layoutManager._updateHotCorners();
}

const LayoutManagerCommon = {
    _updatePanelBarrier() {
        if (this._rightPanelBarrier) {
            this._rightPanelBarrier.destroy();
            this._rightPanelBarrier = null;
        }

        if (this._leftPanelBarrier) {
            this._leftPanelBarrier.destroy();
            this._leftPanelBarrier = null;
        }

        if (!this.primaryMonitor || !opt || _Util.getEnabledExtensions('hidetopbar'))
            return;

        if (this.panelBox.height) {
            let primary = this.primaryMonitor;
            if ([0, 1, 3].includes(opt.HOT_CORNER_POSITION)) {
                this._rightPanelBarrier = new Meta.Barrier({
                    display: global.display,
                    x1: primary.x + primary.width, y1: this.panelBox.allocation.y1,
                    x2: primary.x + primary.width, y2: this.panelBox.allocation.y2,
                    directions: Meta.BarrierDirection.NEGATIVE_X,
                });
            }

            if ([2, 4].includes(opt.HOT_CORNER_POSITION)) {
                this._leftPanelBarrier = new Meta.Barrier({
                    display: global.display,
                    x1: primary.x, y1: this.panelBox.allocation.y1,
                    x2: primary.x, y2: this.panelBox.allocation.y2,
                    directions: Meta.BarrierDirection.POSITIVE_X,
                });
            }
        }
    },

    _updateHotCorners() {
        // avoid errors if called from foreign override
        if (!opt)
            return;
        // destroy old hot corners
        this.hotCorners.forEach(corner => corner?.destroy());
        this.hotCorners = [];

        if (!this._interfaceSettings.get_boolean('enable-hot-corners')) {
            this.emit('hot-corners-changed');
            return;
        }

        let size = this.panelBox.height;

        // position 0 - default, 1-TL, 2-TR, 3-BL, 4-BR
        const position = opt.HOT_CORNER_POSITION;

        // build new hot corners
        for (let i = 0; i < this.monitors.length; i++) {
            let monitor = this.monitors[i];
            let cornerX, cornerY;

            if (position === 0) {
                cornerX = this._rtl ? monitor.x + monitor.width : monitor.x;
                cornerY = monitor.y;
            } else if (position === 1) {
                cornerX = monitor.x;
                cornerY = monitor.y;
            } else if (position === 2) {
                cornerX = monitor.x + monitor.width;
                cornerY = monitor.y;
            } else if (position === 3) {
                cornerX = monitor.x;
                cornerY = monitor.y + monitor.height;
            } else {
                cornerX = monitor.x + monitor.width;
                cornerY = monitor.y + monitor.height;
            }

            let haveCorner = true;

            if (i !== this.primaryIndex) {
                // Check if we have a top left (right for RTL) corner.
                // I.e. if there is no monitor directly above or to the left(right)
                let besideX = this._rtl ? monitor.x + 1 : cornerX - 1;
                let besideY = cornerY;
                let aboveX = cornerX;
                let aboveY = cornerY - 1;

                for (let j = 0; j < this.monitors.length; j++) {
                    if (i === j)
                        continue;
                    let otherMonitor = this.monitors[j];
                    if (besideX >= otherMonitor.x &&
                        besideX < otherMonitor.x + otherMonitor.width &&
                        besideY >= otherMonitor.y &&
                        besideY < otherMonitor.y + otherMonitor.height) {
                        haveCorner = false;
                        break;
                    }
                    if (aboveX >= otherMonitor.x &&
                        aboveX < otherMonitor.x + otherMonitor.width &&
                        aboveY >= otherMonitor.y &&
                        aboveY < otherMonitor.y + otherMonitor.height) {
                        haveCorner = false;
                        break;
                    }
                }
            }

            if (haveCorner) {
                let corner = new HotCorner(this, monitor, cornerX, cornerY);
                corner.setBarrierSize(size);
                this.hotCorners.push(corner);
            } else {
                this.hotCorners.push(null);
            }
        }

        this.emit('hot-corners-changed');
    },
};

var HotCorner = GObject.registerClass(
class HotCorner extends Layout.HotCorner {
    _init(layoutManager, monitor, x, y) {
        super._init(layoutManager, monitor, x, y);

        let angle = 0;
        switch (opt.HOT_CORNER_POSITION) {
        case 2:
            angle = 90;
            break;
        case 3:
            angle = 270;
            break;
        case 4:
            angle = 180;
            break;
        }

        this._ripples._ripple1.rotation_angle_z = angle;
        this._ripples._ripple2.rotation_angle_z = angle;
        this._ripples._ripple3.rotation_angle_z = angle;
    }

    setBarrierSize(size) {
        if (this._verticalBarrier) {
            this._pressureBarrier.removeBarrier(this._verticalBarrier);
            this._verticalBarrier.destroy();
            this._verticalBarrier = null;
        }

        if (this._horizontalBarrier) {
            this._pressureBarrier.removeBarrier(this._horizontalBarrier);
            this._horizontalBarrier.destroy();
            this._horizontalBarrier = null;
        }

        if (size > 0) {
            const primaryMonitor = global.display.get_primary_monitor();
            const monitor = this._monitor;
            const extendV = opt && opt.HOT_CORNER_EDGE && opt.DASH_VERTICAL && monitor.index === primaryMonitor;
            const extendH = opt && opt.HOT_CORNER_EDGE && !opt.DASH_VERTICAL && monitor.index === primaryMonitor;

            if (opt.HOT_CORNER_POSITION <= 1) {
                this._verticalBarrier = new Meta.Barrier({
                    display: global.display,
                    x1: this._x, x2: this._x, y1: this._y, y2: this._y + (extendV ? monitor.height : size),
                    directions: Meta.BarrierDirection.POSITIVE_X,
                });
                this._horizontalBarrier = new Meta.Barrier({
                    display: global.display,
                    x1: this._x, x2: this._x + (extendH ? monitor.width : size), y1: this._y, y2: this._y,
                    directions: Meta.BarrierDirection.POSITIVE_Y,
                });
            } else if (opt.HOT_CORNER_POSITION === 2) {
                this._verticalBarrier = new Meta.Barrier({
                    display: global.display,
                    x1: this._x, x2: this._x, y1: this._y, y2: this._y + (extendV ? monitor.height : size),
                    directions: Meta.BarrierDirection.NEGATIVE_X,
                });
                this._horizontalBarrier = new Meta.Barrier({
                    display: global.display,
                    x1: this._x - size, x2: this._x, y1: this._y, y2: this._y,
                    directions: Meta.BarrierDirection.POSITIVE_Y,
                });
            } else if (opt.HOT_CORNER_POSITION === 3) {
                this._verticalBarrier = new Meta.Barrier({
                    display: global.display,
                    x1: this._x, x2: this._x, y1: this._y, y2: this._y - size,
                    directions: Meta.BarrierDirection.POSITIVE_X,
                });
                this._horizontalBarrier = new Meta.Barrier({
                    display: global.display,
                    x1: this._x, x2: this._x + (extendH ? monitor.width : size), y1: this._y, y2: this._y,
                    directions: Meta.BarrierDirection.NEGATIVE_Y,
                });
            } else if (opt.HOT_CORNER_POSITION === 4) {
                this._verticalBarrier = new Meta.Barrier({
                    display: global.display,
                    x1: this._x, x2: this._x, y1: this._y, y2: this._y - size,
                    directions: Meta.BarrierDirection.NEGATIVE_X,
                });
                this._horizontalBarrier = new Meta.Barrier({
                    display: global.display,
                    x1: this._x, x2: this._x - size, y1: this._y, y2: this._y,
                    directions: Meta.BarrierDirection.NEGATIVE_Y,
                });
            }

            this._pressureBarrier.addBarrier(this._verticalBarrier);
            this._pressureBarrier.addBarrier(this._horizontalBarrier);
        }
    }

    _toggleOverview() {
        if (!opt.HOT_CORNER_ACTION || (!opt.HOT_CORNER_FULLSCREEN && this._monitor.inFullscreen && !Main.overview.visible))
            return;

        if (Main.overview.shouldToggleByCornerOrButton()) {
            if ((opt.HOT_CORNER_ACTION === 1 && !_Util.isCtrlPressed()) || (opt.HOT_CORNER_ACTION === 2 && _Util.isCtrlPressed()))
                this._toggleWindowPicker(true);
            else if ((opt.HOT_CORNER_ACTION === 2 && !_Util.isCtrlPressed()) || (opt.HOT_CORNER_ACTION === 1 && _Util.isCtrlPressed()) || (opt.HOT_CORNER_ACTION === 3 && _Util.isCtrlPressed()))
                this._toggleApplications(true);
            else if (opt.HOT_CORNER_ACTION === 3 && !_Util.isCtrlPressed())
                this._toggleWindowSearchProvider();
            if (opt.HOT_CORNER_RIPPLES && Main.overview.animationInProgress)
                this._ripples.playAnimation(this._x, this._y);
        }
    }

    _toggleWindowPicker(leaveOverview = false) {
        if (Main.overview._shown && (leaveOverview || !Main.overview.dash.showAppsButton.checked)) {
            Main.overview.hide();
        } else if (Main.overview.dash.showAppsButton.checked) {
            Main.overview.dash.showAppsButton.checked = false;
        } else {
            const focusWindow = global.display.get_focus_window();
            // at least GS 42 is unable to show overview in X11 session if VirtualBox Machine window grabbed keyboard
            if (!Meta.is_wayland_compositor() && focusWindow && focusWindow.wm_class.includes('VirtualBox Machine')) {
                // following should help when windowed VBox Machine has focus.
                global.stage.set_key_focus(Main.panel);
                // key focus doesn't take the effect immediately, we must wait for it
                // still looking for better solution!
                _timeouts.releaseKeyboardTimeoutId = GLib.timeout_add(
                    GLib.PRIORITY_DEFAULT,
                    // delay cannot be too short
                    200,
                    () => {
                        Main.overview.show();

                        _timeouts.releaseKeyboardTimeoutId = 0;
                        return GLib.SOURCE_REMOVE;
                    }
                );
            } else {
                Main.overview.show();
            }
        }
    }

    _toggleApplications(leaveOverview = false) {
        if ((leaveOverview && Main.overview._shown) || Main.overview.dash.showAppsButton.checked) {
            Main.overview.hide();
        } else {
            const focusWindow = global.display.get_focus_window();
            // at least GS 42 is unable to show overview in X11 session if VirtualBox Machine window grabbed keyboard
            if (!Meta.is_wayland_compositor() && focusWindow && focusWindow.wm_class.includes('VirtualBox Machine')) {
                // following should help when windowed VBox Machine has focus.
                global.stage.set_key_focus(Main.panel);
                // key focus doesn't take the effect immediately, we must wait for it
                // still looking for better solution!
                _timeouts.releaseKeyboardTimeoutId = GLib.timeout_add(
                    GLib.PRIORITY_DEFAULT,
                    // delay cannot be too short
                    200,
                    () => {
                        Main.overview.show(2);

                        _timeouts.releaseKeyboardTimeoutId = 0;
                        return GLib.SOURCE_REMOVE;
                    }
                );
            } else if (Main.overview._shown) {
                Main.overview.dash.showAppsButton.checked = true;
            } else {
                Main.overview.show(2); // 2 for App Grid
            }
        }
    }

    _toggleWindowSearchProvider() {
        if (!Main.overview._overview._controls._searchController._searchActive) {
            this._toggleWindowPicker();
            const prefix = 'wq// ';
            const position = prefix.length;
            const searchEntry = Main.overview.searchEntry;
            searchEntry.set_text(prefix);
            // searchEntry.grab_key_focus();
            searchEntry.get_first_child().set_cursor_position(position);
            searchEntry.get_first_child().set_selection(position, position);
        } else {
            // Main.overview.searchEntry.text = '';
            Main.overview.hide();
        }
    }
});
