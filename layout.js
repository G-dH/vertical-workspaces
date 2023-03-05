/**
 * V-Shell (Vertical Workspaces)
 * layout.js
 *
 * panel barrier should follow panel position
 * or disable it to not collide with Custom Hot Corners barriers
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2023
 * @license    GPL-3.0
 *
 */

'use strict';

const { Meta, GLib } = imports.gi;

const Main = imports.ui.main;
const Layout = imports.ui.layout;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const _Util = Me.imports.util;

let _overrides;
let _timeouts;
let opt;
let _firstRun = true;

function update(reset = false) {
    opt = Me.imports.settings.opt;
    const moduleEnabled = opt.get('layoutModule', true);

    // don't even touch this module if disabled
    if (_firstRun && !moduleEnabled)
        return;

    _firstRun = false;

    if (_overrides)
        _overrides.removeAll();

    if (_timeouts) {
        Object.values(_timeouts).forEach(t => {
            if (t)
                GLib.source_remove(t);
        });
    }

    if (reset || !moduleEnabled) {
        _overrides = null;
        opt = null;
        _timeouts = null;
        Main.layoutManager._updateHotCorners();
        return;
    }

    _timeouts = {};
    _overrides = new _Util.Overrides();

    _overrides.addOverride('LayoutManager', Layout.LayoutManager.prototype, LayoutManagerCommon);
    _overrides.addOverride('HotCorner', Layout.HotCorner.prototype, HotCornerCommon);
    Main.layoutManager._updatePanelBarrier();
    Main.layoutManager._updateHotCorners();
}

const LayoutManagerCommon = {
    _updatePanelBarrier() {
        if (this._rightPanelBarrier) {
            this._rightPanelBarrier.destroy();
            this._rightPanelBarrier = null;
        }

        // disable the barrier
        /* if (!this.primaryMonitor)
            return;

        if (this.panelBox.height) {
            let primary = this.primaryMonitor;

            this._rightPanelBarrier = new Meta.Barrier({
                display: global.display,
                x1: primary.x + primary.width, y1: opt.PANEL_POSITION_TOP ? primary.y : primary.y + primary.height - this.panelBox.height,
                x2: primary.x + primary.width, y2: opt.PANEL_POSITION_TOP ? primary.y + this.panelBox.height : primary.y + primary.height,
                directions: Meta.BarrierDirection.NEGATIVE_X,
            });
        } */
    },
};

const HotCornerCommon = {
    _toggleOverview() {
        if (!opt.HOT_CORNER_ACTION || (!opt.HOT_CORNER_FULLSCREEN && this._monitor.inFullscreen && !Main.overview.visible))
            return;

        if (Main.overview.shouldToggleByCornerOrButton()) {
            if ((opt.HOT_CORNER_ACTION === 1 && !_Util.isCtrlPressed()) || (opt.HOT_CORNER_ACTION === 2 && _Util.isCtrlPressed()))
                this._toggleWindowPicker(true);
            else if ((opt.HOT_CORNER_ACTION === 2 && !_Util.isCtrlPressed()) || (opt.HOT_CORNER_ACTION === 1 && _Util.isCtrlPressed()))
                this._toggleApplications(true);
            if (opt.HOT_CORNER_RIPPLES && Main.overview.animationInProgress)
                this._ripples.playAnimation(this._x, this._y);
        }
    },

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
    },

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
    },
};
