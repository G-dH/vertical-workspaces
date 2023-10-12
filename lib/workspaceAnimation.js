/**
 * V-Shell (Vertical Workspaces)
 * workspacesAnimation.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2023
 * @license    GPL-3.0
 *
 */

'use strict';

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import Meta from 'gi://Meta';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Layout from 'resource:///org/gnome/shell/ui/layout.js';
import * as Background from 'resource:///org/gnome/shell/ui/background.js';
import * as WorkspaceSwitcherPopup from 'resource:///org/gnome/shell/ui/workspaceSwitcherPopup.js';
import * as WorkspaceAnimation from 'resource:///org/gnome/shell/ui/workspaceAnimation.js';

let Me;
let opt;

export const WorkspaceAnimationModule = class {
    constructor(me) {
        Me = me;
        opt = Me.opt;

        this._firstActivation = true;
        this._moduleEnabled = false;
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
        /* if (!WorkspaceAnimation.MonitorGroup)
            return;*/

        this._moduleEnabled = opt.get('workspaceAnimationModule');
        const conflict = false;

        reset = reset || !this._moduleEnabled || conflict;

        // don't touch the original code if module disabled
        if (reset && !this._firstActivation) {
            this._disableModule();
        } else if (!reset) {
            this._firstActivation = false;
            this._activateModule();
        }
    }

    _activateModule() {
        if (opt.STATIC_WS_SWITCHER_BG) {
            if (!this._overrides)
                this._overrides = new Me.Util.Overrides();
            this._overrides.addOverride('WorkspaceAnimationController', WorkspaceAnimation.WorkspaceAnimationController.prototype, WorkspaceAnimationController);
        } else if (this._overrides) {
            this._overrides.removeAll();
        }


        this._connectWsAnimationSwipeTracker();
    }

    _disableModule() {
        if (this._overrides)
            this._overrides.removeAll();
        this._overrides = null;
        const reset = true;
        this._connectWsAnimationSwipeTracker(reset);

    }

    _connectWsAnimationSwipeTracker(reset = false) {
        if (reset) {
            if (this._wsAnimationSwipeBeginId) {
                Main.wm._workspaceAnimation._swipeTracker.disconnect(this._wsAnimationSwipeBeginId);
                this._wsAnimationSwipeBeginId = 0;
            }
            if (this._wsAnimationSwipeEndId) {
                Main.wm._workspaceAnimation._swipeTracker.disconnect(this._wsAnimationSwipeEndId);
                this._wsAnimationSwipeEndId = 0;
            }
        } else if (!this._wsAnimationSwipeBeginId) {
            // display ws switcher popup when gesture begins and connect progress
            this._wsAnimationSwipeBeginId = Main.wm._workspaceAnimation._swipeTracker.connect('begin', () => this._connectWsAnimationProgress(true));
            // we want to be sure that popup with the final ws index show up when gesture ends
            this._wsAnimationSwipeEndId = Main.wm._workspaceAnimation._swipeTracker.connect('end', (tracker, duration, endProgress) => this._connectWsAnimationProgress(false, endProgress));
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

        const monitors = Meta.prefs_get_workspaces_only_on_primary()
            ? [Main.layoutManager.primaryMonitor] : Main.layoutManager.monitors;

        for (const monitor of monitors) {
            if (Meta.prefs_get_workspaces_only_on_primary() &&
                monitor.index !== Main.layoutManager.primaryIndex)
                continue;

            const group = new MonitorGroup(monitor, workspaceIndices, this.movingWindow);

            Main.uiGroup.insert_child_above(group, global.window_group);

            switchData.monitors.push(group);
        }

        Meta.disable_unredirect_for_display(global.display);
    },
};

const WorkspaceGroup = GObject.registerClass(
    class WorkspaceGroup extends Clutter.Actor {
        _init(workspace, monitor, movingWindow) {
            super._init();

            this._workspace = workspace;
            this._monitor = monitor;
            this._movingWindow = movingWindow;
            this._windowRecords = [];

            if (this._workspace) {
                this._background = new Meta.BackgroundGroup();

                this.add_actor(this._background);

                this._bgManager = new Background.BackgroundManager({
                    container: this._background,
                    monitorIndex: this._monitor.index,
                    controlPosition: false,
                });
            }

            this.width = monitor.width;
            this.height = monitor.height;
            this.clip_to_allocation = true;

            this._createWindows();

            this.connect('destroy', this._onDestroy.bind(this));
            global.display.connectObject('restacked',
                this._syncStacking.bind(this), this);
        }

        get workspace() {
            return this._workspace;
        }

        _shouldShowWindow(window) {
            if (!window.showing_on_its_workspace())
                return false;

            const geometry = global.display.get_monitor_geometry(this._monitor.index);
            const [intersects] = window.get_frame_rect().intersect(geometry);
            if (!intersects)
                return false;

            const isSticky =
                window.is_on_all_workspaces() || window === this._movingWindow;

            // No workspace means we should show windows that are on all workspaces
            if (!this._workspace)
                return isSticky;

            // Otherwise only show windows that are (only) on that workspace
            return !isSticky && window.located_on_workspace(this._workspace);
        }

        _syncStacking() {
            const windowActors = global.get_window_actors().filter(w =>
                this._shouldShowWindow(w.meta_window));

            let lastRecord;
            const bottomActor = this._background ?? null;

            for (const windowActor of windowActors) {
                const record = this._windowRecords.find(r => r.windowActor === windowActor);

                this.set_child_above_sibling(record.clone,
                    lastRecord ? lastRecord.clone : bottomActor);
                lastRecord = record;
            }
        }

        _createWindows() {
            const windowActors = global.get_window_actors().filter(w =>
                this._shouldShowWindow(w.meta_window));

            for (const windowActor of windowActors) {
                const clone = new Clutter.Clone({
                    source: windowActor,
                    x: windowActor.x - this._monitor.x,
                    y: windowActor.y - this._monitor.y,
                });

                this.add_child(clone);

                const record = { windowActor, clone };

                windowActor.connectObject('destroy', () => {
                    clone.destroy();
                    this._windowRecords.splice(this._windowRecords.indexOf(record), 1);
                }, this);

                this._windowRecords.push(record);
            }
        }

        _removeWindows() {
            for (const record of this._windowRecords)
                record.clone.destroy();

            this._windowRecords = [];
        }

        _onDestroy() {
            this._removeWindows();

            if (this._workspace)
                this._bgManager.destroy();
        }
    });

const MonitorGroup = GObject.registerClass({
    Properties: {
        'progress': GObject.ParamSpec.double(
            'progress', 'progress', 'progress',
            GObject.ParamFlags.READWRITE,
            -Infinity, Infinity, 0),
    },
}, class MonitorGroup extends St.Widget {
    _init(monitor, workspaceIndices, movingWindow) {
        super._init({
            clip_to_allocation: true,
            style_class: 'workspace-animation',
        });

        this._monitor = monitor;

        const constraint = new Layout.MonitorConstraint({ index: monitor.index });
        this.add_constraint(constraint);

        this._container = new Clutter.Actor();
        this.add_child(this._container);

        const stickyGroup = new WorkspaceGroup(null, monitor, movingWindow);
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

            const group = new WorkspaceGroup(ws, monitor, movingWindow);

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
    }

    get baseDistance() {
        const spacing = 0;

        if (global.workspace_manager.layout_rows === -1)
            return this._monitor.height + spacing;
        else
            return this._monitor.width + spacing;
    }

    get progress() {
        if (global.workspace_manager.layout_rows === -1)
            return -this._container.y / this.baseDistance;
        else if (this.get_text_direction() === Clutter.TextDirection.RTL)
            return this._container.x / this.baseDistance;
        else
            return -this._container.x / this.baseDistance;
    }

    set progress(p) {
        if (global.workspace_manager.layout_rows === -1)
            this._container.y = -Math.round(p * this.baseDistance);
        else if (this.get_text_direction() === Clutter.TextDirection.RTL)
            this._container.x = Math.round(p * this.baseDistance);
        else
            this._container.x = -Math.round(p * this.baseDistance);
    }

    get index() {
        return this._monitor.index;
    }

    getWorkspaceProgress(workspace) {
        const group = this._workspaceGroups.find(g =>
            g.workspace.index() === workspace.index());
        return this._getWorkspaceGroupProgress(group);
    }

    _getWorkspaceGroupProgress(group) {
        if (global.workspace_manager.layout_rows === -1)
            return group.y / this.baseDistance;
        else if (this.get_text_direction() === Clutter.TextDirection.RTL)
            return -group.x / this.baseDistance;
        else
            return group.x / this.baseDistance;
    }

    getSnapPoints() {
        return this._workspaceGroups.map(g =>
            this._getWorkspaceGroupProgress(g));
    }

    findClosestWorkspace(progress) {
        const distances = this.getSnapPoints().map(p =>
            Math.abs(p - progress));
        const index = distances.indexOf(Math.min(...distances));
        return this._workspaceGroups[index].workspace;
    }

    _interpolateProgress(progress, monitorGroup) {
        if (this.index === monitorGroup.index)
            return progress;

        const points1 = monitorGroup.getSnapPoints();
        const points2 = this.getSnapPoints();

        const upper = points1.indexOf(points1.find(p => p >= progress));
        const lower = points1.indexOf(points1.slice().reverse().find(p => p <= progress));

        if (points1[upper] === points1[lower])
            return points2[upper];

        const t = (progress - points1[lower]) / (points1[upper] - points1[lower]);

        return points2[lower] + (points2[upper] - points2[lower]) * t;
    }

    updateSwipeForMonitor(progress, monitorGroup) {
        this.progress = this._interpolateProgress(progress, monitorGroup);
    }
});
