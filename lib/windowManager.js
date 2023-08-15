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

let Gi;
let Ui;
let Me;

let opt;

export const WindowManagerModule = class {
    constructor(gi, ui, misc, me) {
        Gi = gi;
        Ui = ui;
        Me = me;

        opt = Me.Opt;

        this._firstActivation = true;
        this._moduleEnabled = false;
        this._overrides = null;

        this._originalMinimizeSigId = 0;
        this._minimizeSigId = 0;
        this._originalUnminimizeSigId = 0;
        this._unminimizeSigId = 0;
    }

    cleanGlobals() {
        Gi = null;
        Ui = null;
        Me = null;
        opt = null;
    }

    update(reset) {
        this._moduleEnabled = opt.get('windowManagerModule');
        const conflict = false;

        reset = reset || !this._moduleEnabled || conflict;

        // don't even touch the original code if module disabled
        if (reset && !this._firstActivation) {
            this._disableModule();
        } else if (!reset) {
            this._firstActivation = false;
            this._activateModule();
        }
    }

    _activateModule() {
        if (!this._overrides)
            this._overrides = new Me.Util.Overrides();

        this._overrides.addOverride('WindowManager', Ui.WindowManager.WindowManager.prototype, WindowManagerCommon);

        if (!this._minimizeSigId) {
            this._originalMinimizeSigId = Gi.GObject.signal_handler_find(Ui.Main.wm._shellwm, { signalId: 'minimize' });
            if (this._originalMinimizeSigId) {
                Ui.Main.wm._shellwm.block_signal_handler(this._originalMinimizeSigId);
                this._minimizeSigId = Ui.Main.wm._shellwm.connect('minimize', WindowManagerCommon._minimizeWindow.bind(Ui.Main.wm));
            }

            this._originalUnminimizeSigId = Gi.GObject.signal_handler_find(Ui.Main.wm._shellwm, { signalId: 'unminimize' });
            if (this._originalUnminimizeSigId) {
                Ui.Main.wm._shellwm.block_signal_handler(this._originalUnminimizeSigId);
                this._unminimizeSigId = Ui.Main.wm._shellwm.connect('unminimize', WindowManagerCommon._unminimizeWindow.bind(Ui.Main.wm));
            }
        }
    }

    _disableModule() {
        if (this._overrides)
            this._overrides.removeAll();
        this._overrides = null;

        if (this._minimizeSigId) {
            Ui.Main.wm._shellwm.disconnect(this._minimizeSigId);
            this._minimizeSigId = 0;
        }
        if (this._originalMinimizeSigId) {
            Ui.Main.wm._shellwm.unblock_signal_handler(this._originalMinimizeSigId);
            this._originalMinimizeSigId = 0;
        }

        if (this._unminimizeSigId) {
            Ui.Main.wm._shellwm.disconnect(this._unminimizeSigId);
            this._unminimizeSigId = 0;
        }
        if (this._originalUnminimizeSigId) {
            Ui.Main.wm._shellwm.unblock_signal_handler(this._originalUnminimizeSigId);
            this._originalUnminimizeSigId = 0;
        }


    }
};

// fix for mainstream bug - fullscreen windows should minimize using opacity transition
// but its being applied directly on window actor and that doesn't work
// anyway, animation is better, even if the Activities button is not visible...
// and also add support for bottom position of the panel
const WindowManagerCommon = {
    _minimizeWindow(shellwm, actor) {
        const types = [
            Gi.Meta.WindowType.NORMAL,
            Gi.Meta.WindowType.MODAL_DIALOG,
            Gi.Meta.WindowType.DIALOG,
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
                duration: Ui.WindowManager.MINIMIZE_WINDOW_ANIMATION_TIME,
                mode: Ui.WindowManager.MINIMIZE_WINDOW_ANIMATION_MODE,
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
            let monitor = Ui.Main.layoutManager.monitors[actor.meta_window.get_monitor()];
            if (!monitor) {
                this._minimizeWindowDone();
                return;
            }
            xDest = monitor.x;
            yDest = opt.PANEL_POSITION_TOP ? monitor.y : monitor.y + monitor.height;
            if (Gi.Clutter.get_default_text_direction() === Gi.Clutter.TextDirection.RTL)
                xDest += monitor.width;
            xScale = 0;
            yScale = 0;
        }

        actor.ease({
            scale_x: xScale,
            scale_y: yScale,
            x: xDest,
            y: yDest,
            duration: Ui.WindowManager.MINIMIZE_WINDOW_ANIMATION_TIME,
            mode: Ui.WindowManager.MINIMIZE_WINDOW_ANIMATION_MODE,
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
            Gi.Meta.WindowType.NORMAL,
            Gi.Meta.WindowType.MODAL_DIALOG,
            Gi.Meta.WindowType.DIALOG,
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
                duration: Ui.WindowManager.MINIMIZE_WINDOW_ANIMATION_TIME,
                mode: Ui.WindowManager.MINIMIZE_WINDOW_ANIMATION_MODE,
                onStopped: () => this._unminimizeWindowDone(shellwm, actor),
            });
        } else { */
        let [success, geom] = actor.meta_window.get_icon_geometry();
        if (success) {
            actor.set_position(geom.x, geom.y);
            actor.set_scale(geom.width / actor.width,
                geom.height / actor.height);
        } else {
            let monitor = Ui.Main.layoutManager.monitors[actor.meta_window.get_monitor()];
            if (!monitor) {
                actor.show();
                this._unminimizeWindowDone();
                return;
            }
            actor.set_position(monitor.x, opt.PANEL_POSITION_TOP ? monitor.y : monitor.y + monitor.height);
            if (Gi.Clutter.get_default_text_direction() === Gi.Clutter.TextDirection.RTL)
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
            duration: Ui.WindowManager.MINIMIZE_WINDOW_ANIMATION_TIME,
            mode: Ui.WindowManager.MINIMIZE_WINDOW_ANIMATION_MODE,
            onStopped: () => this._unminimizeWindowDone(shellwm, actor),
        });
        // }
    },
};
