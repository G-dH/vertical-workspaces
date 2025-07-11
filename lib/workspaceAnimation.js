/**
 * V-Shell (Vertical Workspaces)
 * workspacesAnimation.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2025
 * @license    GPL-3.0
 *
 */

'use strict';

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Layout from 'resource:///org/gnome/shell/ui/layout.js';
import * as WorkspaceSwitcherPopup from 'resource:///org/gnome/shell/ui/workspaceSwitcherPopup.js';
import * as WorkspaceAnimation from 'resource:///org/gnome/shell/ui/workspaceAnimation.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';

let Me;
let opt;

export const WorkspaceAnimationModule = class {
    constructor(me) {
        Me = me;
        opt = Me.opt;

        this._firstActivation = true;
        this.moduleEnabled = false;
        this._overrides = null;
        this._origBaseDistance = null;
        this._wsAnimationSwipeBeginId = 0;
        this._wsAnimationSwipeUpdateId = 0;
        this._wsAnimationSwipeEndId = 0;
    }

    cleanGlobals() {
        Me = null;
        opt = null;
    }

    update(reset) {
        this.moduleEnabled = opt.get('workspaceAnimationModule');
        const conflict = !WorkspaceAnimation.MonitorGroup;
        if (conflict)
            console.warn(`[${Me.metadata.name}] Warning: "WorkspaceAnimation" module disabled due to compatibility - GNOME Shell 45.1 or later is required`);

        reset = reset || !this.moduleEnabled || conflict;

        // don't touch the original code if module disabled
        if (reset && !this._firstActivation) {
            this._disableModule();
        } else if (!reset) {
            this._firstActivation = false;
            this._activateModule();
        }
        if (reset && this._firstActivation)
            console.debug('  WorkspaceAnimationModule - Keeping untouched');
    }

    _activateModule() {
        if (!this._overrides)
            this._overrides = new Me.Util.Overrides();

        this._overrides.addOverride('MonitorGroup', WorkspaceAnimation.MonitorGroup.prototype, MonitorGroup);
        if (opt.WS_SWITCHER_CURRENT_MONITOR)
            this._overrides.addOverride('WorkspaceAnimationController', Main.wm._workspaceAnimation, WorkspaceAnimationController);
        this._connectWsAnimationSwipeTracker();

        console.debug('  WorkspaceAnimationModule - Activated');
    }

    _disableModule() {
        if (this._overrides)
            this._overrides.removeAll();
        this._overrides = null;
        const reset = true;
        this._connectWsAnimationSwipeTracker(reset);

        console.debug('  WorkspaceAnimationModule - Disabled');
    }

    _connectWsAnimationSwipeTracker(reset = false) {
        const animationController = Main.wm._workspaceAnimation;
        const swipeTracker = animationController._swipeTracker;
        if (reset) {
            if (this._wsAnimationSwipeBeginId) {
                swipeTracker.disconnect(this._wsAnimationSwipeBeginId);
                this._wsAnimationSwipeBeginId = 0;
            }
            if (this._wsAnimationSwipeEndId) {
                swipeTracker.disconnect(this._wsAnimationSwipeEndId);
                this._wsAnimationSwipeEndId = 0;
            }
            if (this._originalGestureEndId) {
                swipeTracker.disconnect(this._newGestureEndId);
                swipeTracker.unblock_signal_handler(this._originalGestureEndId);
                this._newGestureEndId = 0;
                this._originalGestureEndId = 0;
            }
        } else {
            // Overview's updateGesture() function should reflect ws tmb position to match appGrid/ws animation direction
            // The function connected to the signal cannot be overridden in the class prototype because
            // the connection callback invokes the original function via a stored pointer (reference) rather than by name.
            if (opt.WS_SWITCHER_CURRENT_MONITOR && !this._originalGestureEndId) {
                this._originalGestureEndId = GObject.signal_handler_find(swipeTracker, { signalId: 'end' });
                swipeTracker.block_signal_handler(this._originalGestureEndId);
                this._newGestureEndId = swipeTracker.connect('end', animationController._switchWorkspaceEnd.bind(animationController));
            }
            if (!this._wsAnimationSwipeBeginId) {
            // display ws switcher popup when gesture begins and connect progress
                this._wsAnimationSwipeBeginId = swipeTracker.connect('begin', () => this._connectWsAnimationProgress(true));
            // we want to be sure that popup with the final ws index show up when gesture ends
            }
            this._wsAnimationSwipeEndId = swipeTracker.connect('end', (tracker, duration, endProgress) => this._connectWsAnimationProgress(false, endProgress));
        }
    }

    _connectWsAnimationProgress(connect, endProgress = null) {
        if (Main.overview.visible)
            return;

        if (connect && !this._wsAnimationSwipeUpdateId) {
            this._wsAnimationSwipeUpdateId = Main.wm._workspaceAnimation._swipeTracker.connect('update', (tracker, progress) => this._showWsSwitcherPopup(progress));
        } else if (!connect && this._wsAnimationSwipeUpdateId) {
            Main.wm._workspaceAnimation._swipeTracker.disconnect(this._wsAnimationSwipeUpdateId);
            this._wsAnimationSwipeUpdateId = 0;
            this._showWsSwitcherPopup(Math.round(endProgress));
        }
    }

    _showWsSwitcherPopup(progress) {
        if (Main.overview.visible)
            return;

        const wsIndex = Math.round(progress);
        if (Main.wm._workspaceSwitcherPopup === null) {
            Main.wm._workspaceSwitcherPopup = new WorkspaceSwitcherPopup.WorkspaceSwitcherPopup();
            Main.wm._workspaceSwitcherPopup.connect('destroy', () => {
                Main.wm._workspaceSwitcherPopup = null;
            });
        }

        Main.wm._workspaceSwitcherPopup.display(wsIndex);
    }
};

const MonitorGroup = {
    _init(monitor, workspaceIndices, movingWindow) {
        St.Widget.prototype._init.bind(this)({
            clip_to_allocation: true,
            style_class: 'workspace-animation',
        });

        this._monitor = monitor;

        const constraint = new Layout.MonitorConstraint({ index: monitor.index });
        this.add_constraint(constraint);

        this._container = new Clutter.Actor();
        this.add_child(this._container);

        const stickyGroup = new WorkspaceAnimation.WorkspaceGroup(null, monitor, movingWindow);
        stickyGroup._windowRecords.forEach(r => {
            const metaWin = r.windowActor.metaWindow;
            // conky is sticky but should never get above other windows during ws animation
            // so we hide it from the overlay group, we will see the original if not covered by other windows
            if (metaWin.wm_class === 'conky')
                r.clone.opacity = 0;
        });
        this.add_child(stickyGroup);

        this._workspaceGroups = [];

        const workspaceManager = global.workspace_manager;
        const vertical = workspaceManager.layout_rows === -1;
        const activeWorkspace = workspaceManager.get_active_workspace();

        let x = 0;
        let y = 0;

        for (const i of workspaceIndices) {
            const ws = workspaceManager.get_workspace_by_index(i);
            const fullscreen = ws.list_windows().some(w => w.get_monitor() === monitor.index && w.is_fullscreen());

            if (i > 0 && vertical && !fullscreen && monitor.index === Main.layoutManager.primaryIndex) {
                // We have to shift windows up or down by the height of the panel to prevent having a
                // visible gap between the windows while switching workspaces. Since fullscreen windows
                // hide the panel, they don't need to be shifted up or down.
                y -= Main.panel.height;
            }

            const group = new WorkspaceAnimation.WorkspaceGroup(ws, monitor, movingWindow);

            this._workspaceGroups.push(group);
            this._container.add_child(group);
            group.set_position(x, y);

            if (vertical)
                y += this.baseDistance;
            else if (Clutter.get_default_text_direction() === Clutter.TextDirection.RTL)
                x -= this.baseDistance;
            else
                x += this.baseDistance;
        }

        this.progress = this.getWorkspaceProgress(activeWorkspace);

        if (monitor.index === Main.layoutManager.primaryIndex) {
            this._workspacesAdjustment = Main.createWorkspacesAdjustment(this);
            this.bind_property_full('progress',
                this._workspacesAdjustment, 'value',
                GObject.BindingFlags.SYNC_CREATE,
                (bind, source) => {
                    const indices = [
                        workspaceIndices[Math.floor(source)],
                        workspaceIndices[Math.ceil(source)],
                    ];
                    return [true, Util.lerp(...indices, source % 1.0)];
                },
                null);

            this.connect('destroy', () => {
                // for some reason _workspaceAdjustment bound to the progress property in V-Shell
                // causes the adjustment doesn't reach a whole number
                // when switching ws up and that breaks the showing overview animation
                // as a workaround round workspacesDisplay._scrollAdjustment value on destroy
                // but it should be handled elsewhere as this workaround doesn't work when this module is disabled
                const workspacesAdj = Main.overview._overview.controls._workspacesDisplay._scrollAdjustment;
                workspacesAdj.value = Math.round(workspacesAdj.value);
                delete this._workspacesAdjustment;
            });
        }

        if (!opt.STATIC_WS_SWITCHER_BG)
            return;

        // we have two options to implement static bg feature
        // one is adding background to monitorGroup
        // but this one has disadvantage - sticky windows will be always on top of animated windows
        // which is bad for conky, for example, that window should be always below
        /* this._bgManager = new Background.BackgroundManager({
            container: this,
            monitorIndex: this._monitor.index,
            controlPosition: false,
        });*/

        // the second option is to make background of the monitorGroup transparent so the real desktop content will stay visible,
        // hide windows that should be animated and keep only sticky windows
        // we can keep certain sticky windows bellow and also extensions like DING (icons on desktop) will stay visible
        this.set_style('background-color: transparent;');
        // stickyGroup holds the Always on Visible Workspace windows to keep them static and above other windows during animation
        this._hiddenWindows = [];
        // remove (hide) background wallpaper from the animation, we will see the original one
        this._workspaceGroups.forEach(w => {
            w._background.opacity = 0;
        });
        // hide (scale to 0) all non-sticky windows, their clones will be animated
        global.get_window_actors().forEach(actor => {
            const metaWin = actor.metaWindow;
            if (metaWin?.get_monitor() === this._monitor.index &&
                !(metaWin?.wm_class === 'conky' && metaWin?.is_on_all_workspaces()) &&
                !(metaWin?.wm_class === 'Gjs' && metaWin?.is_on_all_workspaces())) { // DING extension uses window with Gjs class
                // hide original window. we cannot use opacity since it also affects clones.
                // scaling them to 0 works well
                actor.scale_x = 0;
                this._hiddenWindows.push(actor);
            }
        });

        // restore all hidden windows at the end of animation
        // todo - actors removed during transition need to be removed from the list  to avoid access to destroyed actor
        this.connect('destroy', () => {
            this._hiddenWindows.forEach(actor => {
                actor.scale_x = 1;
            });
        });
    },

    property_baseDistance: {
        get() {
            const primaryMonitor = this._monitor.index === Main.layoutManager.primaryIndex;
            // Height needs to be compensated even if panel is hidden
            const spacing = opt.WORKSPACE_MIN_SPACING * St.ThemeContext.get_for_stage(global.stage).scale_factor;
            if (global.workspace_manager.layout_rows === -1)
                return this._monitor.height + spacing + (primaryMonitor ? Main.panel.height : 0);
            else
                return this._monitor.width + spacing;
        },
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

    _switchWorkspaceEnd(tracker, duration, endProgress) {
        if (!this._switchData)
            return;

        const switchData = this._switchData;
        switchData.gestureActivated = true;

        const newWs = switchData.baseMonitorGroup.findClosestWorkspace(endProgress);
        const endTime = Clutter.get_current_event_time();

        let switchWs = true;
        for (const monitorGroup of this._switchData.monitors) {
            const progress = monitorGroup.getWorkspaceProgress(newWs);

            const params = {
                duration,
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            };

            if (opt.WS_SWITCHER_CURRENT_MONITOR && switchWs) {
                const monitor = global.display.get_current_monitor();
                params.onComplete = () => {
                    if (!newWs.active)
                        Main.wm.actionMoveWorkspace(newWs, monitor);
                    this._finishWorkspaceSwitch(switchData);
                };
                switchWs = false;
            } else if (!opt.WS_SWITCHER_CURRENT_MONITOR && monitorGroup.index === Main.layoutManager.primaryIndex) {
                params.onComplete = () => {
                    if (!newWs.active)
                        newWs.activate(endTime);
                    this._finishWorkspaceSwitch(switchData);
                };
            }


            monitorGroup.ease_property('progress', progress, params);
        }
    },
};
