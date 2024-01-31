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

// workaround for upstream bug (that is not that invisible in default shell)
// smaller window cannot be scaled below 0.95 (WINDOW_PREVIEW_MAXIMUM_SCALE)
// when its target scale for exposed windows view (workspace state 1) is bigger than the scale needed for ws state 0.
// in workspace state 0 where windows are not spread and window scale should follow workspace scale,
// this window follows proper top left corner position, but doesn't scale with the workspace
// so it looks bad and the window can exceed border of the workspace
// extremely annoying in OVERVIEW_MODE 1 with single smaller window on the workspace, also affects appGrid transition animation

// disadvantage of following workaround - the WINDOW_PREVIEW_MAXIMUM_SCALE value is common for every workspace,
// on multi-monitor system can be visible unwanted scaling of windows on workspace in WORKSPACE_MODE 0 (windows not spread)
// when leaving overview while any other workspace is in the WORKSPACE_MODE 1.
const WorkspaceLayout = {
    // injection to _init()
    after__init() {
        if (opt.OVERVIEW_MODE === 1) {
            this._stateAdjustment.connect('notify::value', () => {
                // scale 0.1 for window state 0 just needs to be smaller then possible scale of any window in spread view
                const scale = this._stateAdjustment.value ? 0.95 : 0.1;
                if (scale !== this.WINDOW_PREVIEW_MAXIMUM_SCALE) {
                    this.WINDOW_PREVIEW_MAXIMUM_SCALE = scale;
                    // when transition to ws state 1 (WINDOW_PICKER) begins, replace the constant with the original one
                    Workspace.WINDOW_PREVIEW_MAXIMUM_SCALE = scale;
                    // and force recalculation of the target layout, so the transition will be smooth
                    this._needsLayout = true;
                }
            });
        }
    },

    // this fixes wrong size and position calculation of window clones while moving overview to the next (+1) workspace if vertical ws orientation is enabled in GS
    _adjustSpacingAndPadding(rowSpacing, colSpacing, containerBox) {
        if (this._sortedWindows.length === 0)
            return [rowSpacing, colSpacing, containerBox];

        // All of the overlays have the same chrome sizes,
        // so just pick the first one.
        const window = this._sortedWindows[0];

        const [topOversize, bottomOversize] = window.chromeHeights();
        const [leftOversize, rightOversize] = window.chromeWidths();

        const oversize = Math.max(topOversize, bottomOversize, leftOversize, rightOversize);

        if (rowSpacing !== null)
            rowSpacing += oversize;
        if (colSpacing !== null)
            colSpacing += oversize;

        if (containerBox) {
            const vertical = global.workspaceManager.layout_rows === -1;

            const monitor = Main.layoutManager.monitors[this._monitorIndex];

            const bottomPoint = new Graphene.Point3D();
            if (vertical)
                bottomPoint.x = containerBox.x2;
            else
                bottomPoint.y = containerBox.y2;


            const transformedBottomPoint =
                this._container.apply_transform_to_point(bottomPoint);
            const bottomFreeSpace = vertical
                ? (monitor.x + monitor.height) - transformedBottomPoint.x
                : (monitor.y + monitor.height) - transformedBottomPoint.y;

            const [, bottomOverlap] = window.overlapHeights();

            if ((bottomOverlap + oversize) > bottomFreeSpace && !vertical)
                containerBox.y2 -= (bottomOverlap + oversize) - bottomFreeSpace;
        }

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
