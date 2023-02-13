/**
 * Vertical Workspaces
 * workspacesAnimation.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2023
 * @license    GPL-3.0
 *
 */

'use strict';

const { St } = imports.gi;

const Main = imports.ui.main;
const WorkspaceSwitcherPopup = imports.ui.workspaceSwitcherPopup;
const WorkspaceAnimation = imports.ui.workspaceAnimation;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const _Util = Me.imports.util;

// first reference to constant defined using const in other module returns undefined, the MonitorGroup const will remain empty and unused
const MonitorGroup = WorkspaceAnimation.MonitorGroup;

let _origBaseDistance;
let _wsAnimationSwipeBeginId;
let _wsAnimationSwipeEndId;
let _overrides;
let opt;

function update(reset = false) {
    if (_overrides)
        _overrides.removeAll();


    opt = Me.imports.settings.opt;
    if (reset || !opt.STATIC_WS_SWITCHER_BG) {
        _connectWsAnimationSwipeTracker(true);
        _overrideMonitorGroupProperty(true);
        _overrides = null;
        opt = null;
        return;
    }

    _overrides = new _Util.Overrides();
    _connectWsAnimationSwipeTracker();
    _overrideMonitorGroupProperty();

    _overrides.addOverride('WorkspaceAnimationMonitorGroup', WorkspaceAnimation.MonitorGroup.prototype, MonitorGroupOverride);
}

// remove spacing between workspaces during transition to remove flashing wallpaper between workspaces with maximized windows
function _overrideMonitorGroupProperty(reset = false) {
    if (!_origBaseDistance)
        _origBaseDistance = Object.getOwnPropertyDescriptor(WorkspaceAnimation.MonitorGroup.prototype, 'baseDistance').get;

    let getter;
    if (reset) {
        if (_origBaseDistance)
            getter = { get: _origBaseDistance };
    } else {
        getter = {
            get() {
                // const spacing = 100 * St.ThemeContext.get_for_stage(global.stage).scale_factor;
                const spacing = 0;
                if (global.workspace_manager.layout_rows === -1)
                    return this._monitor.height + spacing + (opt.PANEL_MODE ? Main.panel.height : 0); // compensation for hidden panel
                else
                    return this._monitor.width + spacing;
            },
        };
    }

    if (getter)
        Object.defineProperty(WorkspaceAnimation.MonitorGroup.prototype, 'baseDistance', getter);
}

const MonitorGroupOverride = {
    after__init() {
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
        const stickyGroup = this.get_children()[1];
        stickyGroup._windowRecords.forEach(r => {
            const metaWin = r.windowActor.metaWindow;
            // conky is sticky but should never get above other windows during ws animation
            // so we hide it from the overlay group, we will see the original if not covered by other windows
            if (metaWin.wm_class === 'conky')
                r.clone.opacity = 0;
        });
        this._hiddenWindows = [];
        // remove (hide) background wallpaper from the animation, we will see the original one
        this._workspaceGroups.forEach(w => {
            w._background.opacity = 0;
        });
        // hide (scale to 0) all non-sticky windows, their clones will be animated
        global.get_window_actors().forEach(actor => {
            const metaWin = actor.metaWindow;
            if (metaWin?.get_monitor() === this._monitor.index && !(metaWin?.wm_class === 'conky' && metaWin?.is_on_all_workspaces())) { //* && !w.is_on_all_workspaces()*/) {
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
};


// ------ connect Ws Animation Swipe Tracker --------------

function _connectWsAnimationSwipeTracker(reset = false) {
    if (reset) {
        if (_wsAnimationSwipeBeginId) {
            Main.wm._workspaceAnimation._swipeTracker.disconnect(_wsAnimationSwipeBeginId);
            _wsAnimationSwipeBeginId = 0;
        }
        if (_wsAnimationSwipeEndId) {
            Main.wm._workspaceAnimation._swipeTracker.disconnect(_wsAnimationSwipeEndId);
            _wsAnimationSwipeEndId = 0;
        }
    } else if (!_wsAnimationSwipeBeginId) {
        // display ws switcher popup when gesture begins and connect progress
        _wsAnimationSwipeBeginId = Main.wm._workspaceAnimation._swipeTracker.connect('begin', _connectWsAnimationProgress);
        // we want to be sure that popup with the final ws index show up when gesture ends
        _wsAnimationSwipeEndId = Main.wm._workspaceAnimation._swipeTracker.connect('end', () => _showWsSwitcherPopup(0));
    }
}

function _connectWsAnimationProgress() {
    if (Main.overview.visible)
        return;

    // progress is being updated only when user finished gesture and the animation continues on "autopilot"
    Main.wm._workspaceAnimation._switchData.monitors[0].connect('notify::progress', actor => {
        const progress = actor.progress % 1;
        let direction = 0;
        if (!actor._prg)
            actor._prg = progress;
        else if (!progress)
            return;
        else if (progress < actor._prg)
            direction = -1;
        else if (progress > actor._prg)
            direction = 1;
        if (progress < 0.6 && progress > 0.4)
            _showWsSwitcherPopup(direction);
    });

    // display popup when gesture begins
    _showWsSwitcherPopup(0);
}

function _showWsSwitcherPopup(direction) {
    if (Main.overview.visible)
        return;

    const wsIndex = global.workspaceManager.get_active_workspace_index() + direction;
    if (Main.wm._workspaceSwitcherPopup === null) {
        Main.wm._workspaceSwitcherPopup = new WorkspaceSwitcherPopup.WorkspaceSwitcherPopup();
        Main.wm._workspaceSwitcherPopup.connect('destroy', () => {
            Main.wm._workspaceSwitcherPopup = null;
        });
    }

    Main.wm._workspaceSwitcherPopup.display(wsIndex);
}
