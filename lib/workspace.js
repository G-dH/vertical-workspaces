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
