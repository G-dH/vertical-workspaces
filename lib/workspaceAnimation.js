/**
 * V-Shell (Vertical Workspaces)
 * workspacesAnimation.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2024
 * @license    GPL-3.0
 *
 */

'use strict';

const Meta = imports.gi.Meta;

const Main = imports.ui.main;
const WorkspaceAnimation = imports.ui.workspaceAnimation;
const WorkspaceSwitcherPopup = imports.ui.workspaceSwitcherPopup;

let Me;
let opt;

var WorkspaceAnimationModule = class {
    constructor(me) {
        Me = me;
        opt = Me.opt;

        // first reference to constant defined using const in other module returns undefined, the MonitorGroup const will remain empty and unused
        this.dummy = WorkspaceAnimation.MonitorGroup;

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
            console.debug('  WorkspaceAnimationModule - Keeping untouched');
    }

    _activateModule() {
        if (!this._overrides)
            this._overrides = new Me.Util.Overrides();

        if (opt.STATIC_WS_SWITCHER_BG) {
            this._overrideMonitorGroupProperty();
            this._overrides.addOverride('WorkspaceAnimationMonitorGroup', WorkspaceAnimation.MonitorGroup.prototype, MonitorGroup);
        } else if (this._overrides) {
            this._overrides.removeAll();
        }
        // NOTE that following override has been moved to the windowManager module in order to have feature code in one place
        // this._overrides.addOverride('WorkspaceAnimationController', WorkspaceAnimation.WorkspaceAnimationController.prototype, WorkspaceAnimationController);

        this._connectWsAnimationSwipeTracker();
        console.debug('  WorkspaceAnimationModule - Activated');
    }

    _disableModule() {
        if (this._overrides)
            this._overrides.removeAll();
        this._overrides = null;
        const reset = true;
        this._connectWsAnimationSwipeTracker(reset);
        this._overrideMonitorGroupProperty(reset);
        console.debug('  WorkspaceAnimationModule - Disabled');
    }

    _overrideMonitorGroupProperty(reset = false) {
        if (!this._origBaseDistance)
            this._origBaseDistance = Object.getOwnPropertyDescriptor(WorkspaceAnimation.MonitorGroup.prototype, 'baseDistance').get;

        let getter;
        if (reset) {
            if (this._origBaseDistance)
                getter = { get: this._origBaseDistance };
        } else {
            getter = {
                get() {
                    // const spacing = 100 * imports.gi.St.ThemeContext.get_for_stage(global.stage).scale_factor;
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

const MonitorGroup = {
    // injection to _init()
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
};
