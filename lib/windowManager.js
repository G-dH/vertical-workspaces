/**
 * V-Shell (Vertical Workspaces)
 * windowManager.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2025
 * @license    GPL-3.0
 *
 */

'use strict';

import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as WindowManager from 'resource:///org/gnome/shell/ui/windowManager.js';
import * as WorkspaceAnimation from 'resource:///org/gnome/shell/ui/workspaceAnimation.js';

const MINIMIZE_WINDOW_ANIMATION_TIME = 400; // windowManager.MINIMIZE_WINDOW_ANIMATION_TIME
const MINIMIZE_WINDOW_ANIMATION_MODE = Clutter.AnimationMode.EASE_OUT_EXPO; // WindowManager.MINIMIZE_WINDOW_ANIMATION_MODE

let Me;
let opt;

export const WindowManagerModule = class {
    constructor(me) {
        Me = me;
        opt = Me.opt;

        this._firstActivation = true;
        this.moduleEnabled = false;
        this._overrides = null;

        this._originalMinimizeSigId = 0;
        this._minimizeSigId = 0;
        this._originalUnminimizeSigId = 0;
        this._unminimizeSigId = 0;
    }

    cleanGlobals() {
        Me = null;
        opt = null;
    }

    update(reset) {
        this.moduleEnabled = opt.get('windowManagerModule');
        const conflict = false;

        reset = reset || !this.moduleEnabled || conflict;

        // don't even touch the original code if module disabled
        if (reset && !this._firstActivation) {
            this._disableModule();
        } else if (!reset) {
            this._firstActivation = false;
            this._activateModule();
        }
        if (reset && this._firstActivation)
            console.debug('  WindowManagerModule - Keeping untouched');
    }

    _activateModule() {
        if (!this._overrides)
            this._overrides = new Me.Util.Overrides();

        this._overrides.addOverride('WindowManager', WindowManager.WindowManager.prototype, WindowManagerCommon);
        if (opt.WS_SWITCHER_CURRENT_MONITOR)
            this._overrides.addOverride('WorkspaceAnimationController', WorkspaceAnimation.WorkspaceAnimationController.prototype, WorkspaceAnimationController);

        if (!this._minimizeSigId) {
            this._originalMinimizeSigId = GObject.signal_handler_find(Main.wm._shellwm, { signalId: 'minimize' });
            if (this._originalMinimizeSigId) {
                Main.wm._shellwm.block_signal_handler(this._originalMinimizeSigId);
                this._minimizeSigId = Main.wm._shellwm.connect('minimize', WindowManagerCommon._minimizeWindow.bind(Main.wm));
            }

            this._originalUnminimizeSigId = GObject.signal_handler_find(Main.wm._shellwm, { signalId: 'unminimize' });
            if (this._originalUnminimizeSigId) {
                Main.wm._shellwm.block_signal_handler(this._originalUnminimizeSigId);
                this._unminimizeSigId = Main.wm._shellwm.connect('unminimize', WindowManagerCommon._unminimizeWindow.bind(Main.wm));
            }
        }
        console.debug('  WindowManagerModule - Activated');
    }

    _disableModule() {
        if (this._overrides)
            this._overrides.removeAll();
        this._overrides = null;

        if (this._minimizeSigId) {
            Main.wm._shellwm.disconnect(this._minimizeSigId);
            this._minimizeSigId = 0;
        }
        if (this._originalMinimizeSigId) {
            Main.wm._shellwm.unblock_signal_handler(this._originalMinimizeSigId);
            this._originalMinimizeSigId = 0;
        }

        if (this._unminimizeSigId) {
            Main.wm._shellwm.disconnect(this._unminimizeSigId);
            this._unminimizeSigId = 0;
        }
        if (this._originalUnminimizeSigId) {
            Main.wm._shellwm.unblock_signal_handler(this._originalUnminimizeSigId);
            this._originalUnminimizeSigId = 0;
        }

        console.debug('  WindowManagerModule - Disabled');
    }
};

const WindowManagerCommon = {
    actionMoveWorkspace(workspace) {
        if (!Main.sessionMode.hasWorkspaces)
            return;

        if (opt.WS_SWITCHER_CURRENT_MONITOR) {
            this._switchWorkspaceCurrentMonitor(workspace);
        } else if (!workspace.active) {
            workspace.activate(global.get_current_time());
            // Remove focus from the previous workspace view
            // Part of the merge request https://gitlab.gnome.org/GNOME/gnome-shell/-/merge_requests/2591
            global.stage.set_key_focus(null);
        }
    },

    actionMoveWindow(window, workspace) {
        if (!Main.sessionMode.hasWorkspaces)
            return;

        if (!workspace.active) {
            // This won't have any effect for "always sticky" windows
            // (like desktop windows or docks)

            this._workspaceAnimation.movingWindow = window;
            window.change_workspace(workspace);

            global.display.clear_mouse_mode();

            if (opt.SWITCH_ONLY_CURRENT_MONITOR_WS) {
                this._switchWorkspaceCurrentMonitor(workspace, window.get_monitor());
                window.activate(global.get_current_time());
            } else {
                workspace.activate_with_focus(window, global.get_current_time());
            }
        }
    },

    _switchWorkspaceCurrentMonitor(workspace, monitor) {
        // const focusedWindow = global.display.get_focus_window();
        // const currentMonitor = focusedWindow ? focusedWindow.get_monitor() : global.display.get_current_monitor();
        // using focused window to determine the current monitor can lead to inconsistent behavior and switching monitors between switches
        // depending on which window takes focus on each workspace
        // mouse pointer is more stable and predictable source
        const currentMonitor = monitor ? monitor : global.display.get_current_monitor();
        const primaryMonitor = currentMonitor === Main.layoutManager.primaryIndex;
        const nMonitors = Main.layoutManager.monitors.length;
        const lastIndexCorrection = Meta.prefs_get_dynamic_workspaces() ? 2 : 1;
        const lastIndex = global.workspaceManager.get_n_workspaces() - lastIndexCorrection;
        const targetWsIndex = workspace.index();
        const activeWs = global.workspaceManager.get_active_workspace();
        const activeWsIndex = activeWs.index();
        const diff = activeWsIndex - targetWsIndex;

        let direction = diff > 0 ? Meta.MotionDirection.UP : Meta.MotionDirection.DOWN;
        if (diff === 0) {
            // no actual ws to switch, but secondary monitors are always in wraparound mode so we need to get direction
            direction = activeWsIndex >= lastIndex ? Meta.MotionDirection.DOWN : Meta.MotionDirection.UP;
        }
        if (Math.abs(diff) > 1) {
            // workspace is probably in wraparound mode and just wrapped so so we need to translate direction
            direction = diff > 0 ? Meta.MotionDirection.DOWN : Meta.MotionDirection.UP;
        }

        if (!primaryMonitor) {
            this._rotateWorkspaces(direction, currentMonitor);
            return;
        }

        // avoid ws rotations if the last empty dynamic workspace is involved, but allow to rotate from the last to the first, if wraparound is enabled
        if (workspace !== activeWs && !((targetWsIndex > lastIndex && direction === Meta.MotionDirection.DOWN) || (activeWsIndex > lastIndex && targetWsIndex >= lastIndex))) {
            for (let i = 0; i < nMonitors; i++) {
                if (i !== currentMonitor) {
                    const oppositeDirection = direction === Meta.MotionDirection.UP ? Meta.MotionDirection.DOWN : Meta.MotionDirection.UP;
                    this._rotateWorkspaces(oppositeDirection, i);
                }
            }
        }
        workspace.activate(global.get_current_time());
    },

    _rotateWorkspaces(direction = 0, monitorIndex = -1, step = 1) {
        step = direction === Meta.MotionDirection.UP ? Number(step) : -step;
        const monitor = monitorIndex > -1 ? monitorIndex : global.display.get_current_monitor();
        // don't move windows to the last empty workspace if dynamic workspaces are enabled
        const lastIndexCorrection = Meta.prefs_get_dynamic_workspaces() ? 2 : 1;
        const lastIndex = global.workspaceManager.get_n_workspaces() - lastIndexCorrection;
        let windows = Me.Util.getWindows(null);
        for (let win of windows.reverse()) {
            // avoid moving modal windows as they move with their parents (and vice versa) immediately, before we move the parent window.
            if (win.get_monitor() === monitor && !win.is_always_on_all_workspaces() && !win.is_attached_dialog() && !win.get_transient_for()) {
                let wWs = win.get_workspace().index();
                wWs += step;
                if (wWs < 0)
                    wWs = lastIndex;
                if (wWs > lastIndex)
                    wWs = 0;
                const ws = global.workspaceManager.get_workspace_by_index(wWs);
                win.change_workspace(ws);
            }
        }
    },

    // fix for mainstream bug - fullscreen windows should minimize using opacity transition
    // but its being applied directly on window actor and that doesn't work
    // anyway, animation is better, even if the Activities button is not visible...
    // and also add support for bottom position of the panel
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

const WorkspaceAnimationController = {
    _prepareWorkspaceSwitch(workspaceIndices) {
        if (this._switchData)
            return;

        const workspaceManager = global.workspace_manager;
        const nWorkspaces = workspaceManager.get_n_workspaces();

        const switchData = {};

        this._switchData = switchData;
        switchData.monitors = [];

        switchData.gestureActivated = false;
        switchData.inProgress = false;

        if (!workspaceIndices)
            workspaceIndices = [...Array(nWorkspaces).keys()];

        let monitors = opt.WS_SWITCHER_CURRENT_MONITOR
            ? [Main.layoutManager.currentMonitor] : Main.layoutManager.monitors;
        monitors = Meta.prefs_get_workspaces_only_on_primary()
            ? [Main.layoutManager.primaryMonitor] : monitors;

        for (const monitor of monitors) {
            if (Meta.prefs_get_workspaces_only_on_primary() &&
                monitor.index !== Main.layoutManager.primaryIndex)
                continue;

            const group = new WorkspaceAnimation.MonitorGroup(monitor, workspaceIndices, this.movingWindow);

            Main.uiGroup.insert_child_above(group, global.window_group);

            switchData.monitors.push(group);
        }

        if (Meta.disable_unredirect_for_display)
            Meta.disable_unredirect_for_display(global.display);
        else // new in GS 48
            global.compositor.disable_unredirect();
    },
};
