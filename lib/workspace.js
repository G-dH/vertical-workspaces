/**
 * V-Shell (Vertical Workspaces)
 * workspace.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2024
 * @license    GPL-3.0
 *
 */

'use strict';

const Graphene = imports.gi.Graphene;
const St = imports.gi.St;

const Main = imports.ui.main;
const Workspace = imports.ui.workspace;
const Util = imports.misc.util;

let Me;
let opt;

var WorkspaceModule = class {
    constructor(me) {
        Me = me;
        opt = Me.opt;

        this._firstActivation = true;
        this.moduleEnabled = false;
        this._overrides = null;
    }

    cleanGlobals() {
        Me = null;
        opt = null;
    }

    update(reset) {
        this.moduleEnabled = opt.get('workspaceModule');
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
            console.debug('  WorkspaceModule - Keeping untouched');
    }

    _activateModule() {
        if (!this._overrides)
            this._overrides = new Me.Util.Overrides();

        this._overrides.addOverride('WorkspaceBackground', Workspace.WorkspaceBackground.prototype, WorkspaceBackground);

        // fix overlay base for Vertical Workspaces
        this._overrides.addOverride('WorkspaceLayout', Workspace.WorkspaceLayout.prototype, WorkspaceLayout);

        // Add support for Tab key navigation in the overview
        this._overrides.addOverride('Workspace', Workspace.Workspace.prototype, WorkspaceCommon);

        console.debug('  WorkspaceModule - Activated');
    }

    _disableModule() {
        if (this._overrides)
            this._overrides.removeAll();
        this._overrides = null;
        Workspace.WINDOW_PREVIEW_MAXIMUM_SCALE = 0.95;

        console.debug('  WorkspaceModule - Disabled');
    }
};

const WorkspaceCommon = {
    _init(metaWorkspace, monitorIndex, overviewAdjustment) {
        St.Widget.prototype._init.bind(this)({
            style_class: 'window-picker',
            pivot_point: new Graphene.Point({ x: 0.5, y: 0.5 }),
            layout_manager: new Clutter.BinLayout(),
        });

        const layoutManager = new Workspace.WorkspaceLayout(metaWorkspace, monitorIndex,
            overviewAdjustment);

        // Background
        this._background =
            new Workspace.WorkspaceBackground(monitorIndex, layoutManager.stateAdjustment);
        this.add_child(this._background);

        // Window previews
        // Replace the default Actor container with St.Widget
        // to allow Tab navigation between window previews
        // GNOME Shell upstream bug report https://gitlab.gnome.org/GNOME/gnome-shell/-/issues/5345
        // A part of an implementation of the merge request:
        // https://gitlab.gnome.org/GNOME/gnome-shell/-/merge_requests/2591
        this._container = new WorkspaceWindowContainer({ layoutManager, reactive: true });
        this.add_child(this._container);
        global.focus_manager.add_group(this._container);

        this.metaWorkspace = metaWorkspace;

        this._overviewAdjustment = overviewAdjustment;

        this.monitorIndex = monitorIndex;
        this._monitor = Main.layoutManager.monitors[this.monitorIndex];

        if (monitorIndex !== Main.layoutManager.primaryIndex)
            this.add_style_class_name('external-monitor');

        const clickAction = new Clutter.ClickAction();
        clickAction.connect('clicked', action => {
            // Switch to the workspace when not"v-shell" the active one, leave the
            // overview otherwise.
            if (action.get_button() === 1 || action.get_button() === 0) {
                const leaveOverview = this._shouldLeaveOverview();

                this.metaWorkspace?.activate(global.get_current_time());
                if (leaveOverview)
                    Main.overview.hide();
            }
        });
        this.bind_property('mapped', clickAction, 'enabled', GObject.BindingFlags.SYNC_CREATE);
        this._container.add_action(clickAction);

        this.connect('style-changed', this._onStyleChanged.bind(this));
        this.connect('destroy', this._onDestroy.bind(this));

        this._skipTaskbarSignals = new Map();
        this._windows = [];
        this._layoutFrozenId = 0;

        // DND requires this to be set
        this._delegate = this;

        // Track window changes, but let the window tracker process them first
        this.metaWorkspace?.connectObject(
            'window-added', this._windowAdded.bind(this), GObject.ConnectFlags.AFTER,
            'window-removed', this._windowRemoved.bind(this), GObject.ConnectFlags.AFTER,
            'notify::active', () => layoutManager.syncOverlays(), this);
        global.display.connectObject(
            'window-entered-monitor', this._windowEnteredMonitor.bind(this), GObject.ConnectFlags.AFTER,
            'window-left-monitor', this._windowLeftMonitor.bind(this), GObject.ConnectFlags.AFTER,
            this);

        // Create clones for windows that should be
        // visible in the Overview
        global.get_window_actors().map(a => this._doAddWindow(a.meta_window));
    },
};

// Workaround for an upstream bug affecting window scaling and positioning:
//
// Issue:
// - Smaller windows cannot scale below 0.95 (WINDOW_PREVIEW_MAXIMUM_SCALE)
//   when their target scale for the spread windows view (workspace state 1)
//   exceeds the scale needed for workspace state 0.
// - In workspace state 0 (where windows are not spread and scale matches the workspace),
//   the window aligns correctly to the top-left corner but does not scale with the workspace,
//   causing visual issues and the window may exceed the workspace border.
//
// Effects:
// - Particularly noticeable in OVERVIEW_MODE 1 with a single smaller window on the workspace.
// - Also impacts the appGrid transition animation.
const WorkspaceLayout = {
    // injection to _init()
    after__init() {
        if (opt.OVERVIEW_MODE !== 1)
            this.WINDOW_PREVIEW_MAXIMUM_SCALE = 0.95;
        if (opt.OVERVIEW_MODE === 1) {
            this._stateAdjustment.connect('notify::value', () => {
                // When transitioning to workspace state 1 (WINDOW_PICKER),
                // replace the constant with the original value.
                // Ensure that the scale for workspace state 0 is smaller
                // than the minimum possible scale of any window on the workspace,
                // so they stay at their real size relative to ws preview
                const scale = this._stateAdjustment.value ? 0.95 : 0.1;
                if (scale !== this.WINDOW_PREVIEW_MAXIMUM_SCALE) {
                    this.WINDOW_PREVIEW_MAXIMUM_SCALE = scale;
                    Workspace.WINDOW_PREVIEW_MAXIMUM_SCALE = scale;
                }
                // Force recalculation of the target layout
                // to ensure that the new WINDOW_PREVIEW_MAXIMUM_SCALE is applied
                if (this._stateAdjustment.value < 0.5)
                    this._needsLayout = true;
            });
        }
    },

    _adjustSpacingAndPadding(rowSpacing, colSpacing, containerBox) {
        if (this._sortedWindows.length === 0)
            return [rowSpacing, colSpacing, containerBox];

        // All of the overlays have the same chrome sizes,
        // so just pick the first one.
        const window = this._sortedWindows[0];

        const [topOversize, bottomOversize] = window.chromeHeights();
        const [leftOversize, rightOversize] = window.chromeWidths();

        let oversize = Math.max(topOversize, bottomOversize, leftOversize, rightOversize);

        if (rowSpacing !== null)
            rowSpacing += oversize;
        if (colSpacing !== null)
            colSpacing += oversize;

        /* if (containerBox) {
            const [, bottomOverlap] = window.overlapHeights();

            // Chrome highlights and window titles should never exceed the workspace preview area
            // Unfortunately adjusting x1/x2 here is pointless,
            // x1 only moves window previews to the right and down, x2 has no effect
            oversize *= 1.5;
            containerBox.y1 += oversize;
            containerBox.y2 -= bottomOverlap + oversize;
        }*/

        return [rowSpacing, colSpacing, containerBox];
    },
};

const WorkspaceBackground = {
    _updateBorderRadius(value = false) {
        // don't round already rounded corners during exposing windows
        if (value === false && opt.OVERVIEW_MODE === 1)
            return;

        const { scaleFactor } = St.ThemeContext.get_for_stage(global.stage);
        const cornerRadius = scaleFactor * opt.WS_PREVIEW_BG_RADIUS;

        const backgroundContent = this._bgManager.backgroundActor.content;
        value = value !== false
            ? value
            : this._stateAdjustment.value;

        backgroundContent.rounded_clip_radius =
            Util.lerp(0, cornerRadius, value);
    },
};

const WorkspaceWindowContainer = GObject.registerClass({
    // Registered name should be unique
    GTypeName: `FolderGrid${Math.floor(Math.random() * 1000)}`,
}, class WorkspaceWindowContainer extends St.Widget {
    vfunc_get_focus_chain() {
        return this.layout_manager.getFocusChain();
    }
});
