/**
 * V-Shell (Vertical Workspaces)
 * windowManager.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2023
 * @license    GPL-3.0
 *
 */

'use strict';

const { GObject, Clutter, Meta } = imports.gi;

const Main = imports.ui.main;
const WindowManager = imports.ui.windowManager;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const _Util = Me.imports.lib.util;
let _overrides;

const MINIMIZE_WINDOW_ANIMATION_TIME = WindowManager.MINIMIZE_WINDOW_ANIMATION_TIME;
const MINIMIZE_WINDOW_ANIMATION_MODE = WindowManager.MINIMIZE_WINDOW_ANIMATION_MODE;

let opt;
let _firstRun = true;

function update(reset = false) {
    opt = Me.imports.lib.settings.opt;
    const moduleEnabled = opt.get('windowManagerModule', true);
    reset = reset || !moduleEnabled;

    // don't even touch this module if disabled
    if (_firstRun && reset)
        return;

    _firstRun = false;

    if (_overrides)
        _overrides.removeAll();


    _replaceMinimizeFunction(reset);


    if (reset) {
        _overrides = null;
        opt = null;
        return;
    }

    _overrides = new _Util.Overrides();

    _overrides.addOverride('WindowManager', WindowManager.WindowManager.prototype, WindowManagerCommon);
}

// ------------- Fix and adapt minimize/unminimize animations --------------------------------------

let _originalMinimizeSigId;
let _minimizeSigId;
let _originalUnminimizeSigId;
let _unminimizeSigId;

function _replaceMinimizeFunction(reset = false) {
    if (reset) {
        Main.wm._shellwm.disconnect(_minimizeSigId);
        _minimizeSigId = 0;
        Main.wm._shellwm.unblock_signal_handler(_originalMinimizeSigId);
        _originalMinimizeSigId = 0;

        Main.wm._shellwm.disconnect(_unminimizeSigId);
        _unminimizeSigId = 0;
        Main.wm._shellwm.unblock_signal_handler(_originalUnminimizeSigId);
        _originalUnminimizeSigId = 0;
    } else if (!_minimizeSigId) {
        _originalMinimizeSigId = GObject.signal_handler_find(Main.wm._shellwm, { signalId: 'minimize' });
        if (_originalMinimizeSigId) {
            Main.wm._shellwm.block_signal_handler(_originalMinimizeSigId);
            _minimizeSigId = Main.wm._shellwm.connect('minimize', WindowManagerCommon._minimizeWindow.bind(Main.wm));
        }

        _originalUnminimizeSigId = GObject.signal_handler_find(Main.wm._shellwm, { signalId: 'unminimize' });
        if (_originalUnminimizeSigId) {
            Main.wm._shellwm.block_signal_handler(_originalUnminimizeSigId);
            _unminimizeSigId = Main.wm._shellwm.connect('unminimize', WindowManagerCommon._unminimizeWindow.bind(Main.wm));
        }
    }
}

// fix for mainstream bug - fullscreen windows should minimize using opacity transition
// but its being applied directly on window actor and that doesn't work
// anyway, animation is better, even if the Activities button is not visible...
// and also add support for bottom position of the panel
const WindowManagerCommon = {
    _minimizeWindow(shellwm, actor) {
        const types = [
            Meta.WindowType.NORMAL,
            Meta.WindowType.MODAL_DIALOG,
            Meta.WindowType.DIALOG,
        ];
        if (!this._shouldAnimateActor(actor, types)) {
            shellwm.completed_minimize(actor);
            return;
        }

        actor.set_scale(1.0, 1.0);

        this._minimizing.add(actor);

        /* if (actor.meta_window.is_monitor_sized()) {
            actor.get_first_child().ease({
                opacity: 0,
                duration: MINIMIZE_WINDOW_ANIMATION_TIME,
                mode: MINIMIZE_WINDOW_ANIMATION_MODE,
                onStopped: () => this._minimizeWindowDone(shellwm, actor),
            });
        } else { */
        let xDest, yDest, xScale, yScale;
        let [success, geom] = actor.meta_window.get_icon_geometry();
        if (success) {
            xDest = geom.x;
            yDest = geom.y;
            xScale = geom.width / actor.width;
            yScale = geom.height / actor.height;
        } else {
            let monitor = Main.layoutManager.monitors[actor.meta_window.get_monitor()];
            if (!monitor) {
                this._minimizeWindowDone();
                return;
            }
            xDest = monitor.x;
            yDest = opt.PANEL_POSITION_TOP ? monitor.y : monitor.y + monitor.height;
            if (Clutter.get_default_text_direction() === Clutter.TextDirection.RTL)
                xDest += monitor.width;
            xScale = 0;
            yScale = 0;
        }

        actor.ease({
            scale_x: xScale,
            scale_y: yScale,
            x: xDest,
            y: yDest,
            duration: MINIMIZE_WINDOW_ANIMATION_TIME,
            mode: MINIMIZE_WINDOW_ANIMATION_MODE,
            onStopped: () => this._minimizeWindowDone(shellwm, actor),
        });
        // }
    },

    _minimizeWindowDone(shellwm, actor) {
        if (this._minimizing.delete(actor)) {
            actor.remove_all_transitions();
            actor.set_scale(1.0, 1.0);
            actor.get_first_child().set_opacity(255);
            actor.set_pivot_point(0, 0);

            shellwm.completed_minimize(actor);
        }
    },

    _unminimizeWindow(shellwm, actor) {
        const types = [
            Meta.WindowType.NORMAL,
            Meta.WindowType.MODAL_DIALOG,
            Meta.WindowType.DIALOG,
        ];
        if (!this._shouldAnimateActor(actor, types)) {
            shellwm.completed_unminimize(actor);
            return;
        }

        this._unminimizing.add(actor);

        /* if (false/* actor.meta_window.is_monitor_sized()) {
            actor.opacity = 0;
            actor.set_scale(1.0, 1.0);
            actor.ease({
                opacity: 255,
                duration: MINIMIZE_WINDOW_ANIMATION_TIME,
                mode: MINIMIZE_WINDOW_ANIMATION_MODE,
                onStopped: () => this._unminimizeWindowDone(shellwm, actor),
            });
        } else { */
        let [success, geom] = actor.meta_window.get_icon_geometry();
        if (success) {
            actor.set_position(geom.x, geom.y);
            actor.set_scale(geom.width / actor.width,
                geom.height / actor.height);
        } else {
            let monitor = Main.layoutManager.monitors[actor.meta_window.get_monitor()];
            if (!monitor) {
                actor.show();
                this._unminimizeWindowDone();
                return;
            }
            actor.set_position(monitor.x, opt.PANEL_POSITION_TOP ? monitor.y : monitor.y + monitor.height);
            if (Clutter.get_default_text_direction() === Clutter.TextDirection.RTL)
                actor.x += monitor.width;
            actor.set_scale(0, 0);
        }

        let rect = actor.meta_window.get_buffer_rect();
        let [xDest, yDest] = [rect.x, rect.y];

        actor.show();
        actor.ease({
            scale_x: 1,
            scale_y: 1,
            x: xDest,
            y: yDest,
            duration: MINIMIZE_WINDOW_ANIMATION_TIME,
            mode: MINIMIZE_WINDOW_ANIMATION_MODE,
            onStopped: () => this._unminimizeWindowDone(shellwm, actor),
        });
        // }
    },
};
