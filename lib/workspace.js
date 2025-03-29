/**
 * V-Shell (Vertical Workspaces)
 * workspace.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2025
 * @license    GPL-3.0
 *
 */

'use strict';

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import Graphene from 'gi://Graphene';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Workspace from 'resource:///org/gnome/shell/ui/workspace.js';
import * as Params from 'resource:///org/gnome/shell/misc/params.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';

let Me;
let opt;

let WINDOW_PREVIEW_MAXIMUM_SCALE = 0.95;

export const WorkspaceModule = class {
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
        console.debug('  WorkspaceModule - Disabled');
    }

    setWindowPreviewMaxScale(scale) {
        WINDOW_PREVIEW_MAXIMUM_SCALE = scale;
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
            // Switch to the workspace when not the active one, leave the
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
            WINDOW_PREVIEW_MAXIMUM_SCALE = 0.95;
        if (opt.OVERVIEW_MODE === 1) {
            this._stateAdjustment.connect('notify::value', adjustment => {
            // When transitioning to workspace state 1 (WINDOW_PICKER),
            // replace the constant with the original value.
            // Ensure that the scale for workspace state 0 is smaller
            // than the minimum possible scale of any window on the workspace,
            // so they stay at their real size relative to ws preview
                const scale = adjustment.value ? 0.95 : 0.1; // The condition below introduces some redundancy to ensure the new scale is applied
                if (scale !== WINDOW_PREVIEW_MAXIMUM_SCALE || Main.overview._overview.controls._stateAdjustment.value === 1) {
                    WINDOW_PREVIEW_MAXIMUM_SCALE = scale;
                    // Force recalculation of the target layout
                    // to ensure that the new WINDOW_PREVIEW_MAXIMUM_SCALE is applied
                    // User can change the workspace mode at aby time during the transition to the window picker state
                    // Note: Re-layout at the end of the transition from the app grid slows down the end of the animation
                    this._needsLayout = true;
                }
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

        // Chrome highlights and window titles may exceed the workspace preview area
        // and also the screen area if there is no overview element below/above/on_the_right of the workspace
        // The original code tests whether window titles are out of the screen and applies correction accordingly
        // That is a problem when workspaces are vertically stacked, because this method is called even during transitions between workspaces
        // In V-Shell, this issue can be solved by reducing the workspace preview scale in the Settings

        // Original code - horizontal orientation only
        /* if (containerBox) {
            const monitor = Main.layoutManager.monitors[this._monitorIndex];

            const bottomPoint = new Graphene.Point3D({ y: containerBox.y2 });
            const transformedBottomPoint =
                this._container.apply_transform_to_point(bottomPoint);
            const bottomFreeSpace =
                (monitor.y + monitor.height) - transformedBottomPoint.y;

            const [, bottomOverlap] = window.overlapHeights();

            if ((bottomOverlap + oversize) > bottomFreeSpace)
                containerBox.y2 -= (bottomOverlap + oversize) - bottomFreeSpace;
        }*/

        // Alternative code reducing the box size unconditionally
        /* if (containerBox) {
            const [, bottomOverlap] = window.overlapHeights();

            // Adjusting x1/x2 here is pointless,
            // x1 only moves window previews to the right and down, x2 has no effect
            // Prevent window previews from overlapping a workspace preview
            oversize *= 1.5;
            containerBox.y1 += oversize;
            containerBox.y2 -= bottomOverlap + oversize;
        }*/

        return [rowSpacing, colSpacing, containerBox];
    },

    _createBestLayout(area) {
        const [rowSpacing, columnSpacing] =
            this._adjustSpacingAndPadding(this._spacing, this._spacing, null);

        // We look for the largest scale that allows us to fit the
        // largest row/tallest column on the workspace.
        this._layoutStrategy = new UnalignedLayoutStrategy({
            monitor: Main.layoutManager.monitors[this._monitorIndex],
            rowSpacing,
            columnSpacing,
        });

        let lastLayout = null;
        let lastNumColumns = -1;
        let lastScale = 0;
        let lastSpace = 0;

        for (let numRows = 1; ; numRows++) {
            const numColumns = Math.ceil(this._sortedWindows.length / numRows);

            // If adding a new row does not change column count just stop
            // (for instance: 9 windows, with 3 rows -> 3 columns, 4 rows ->
            // 3 columns as well => just use 3 rows then)
            if (numColumns === lastNumColumns)
                break;

            const layout = this._layoutStrategy.computeLayout(this._sortedWindows, {
                numRows,
            });

            const [scale, space] = this._layoutStrategy.computeScaleAndSpace(layout, area);

            if (lastLayout && !this._isBetterScaleAndSpace(lastScale, lastSpace, scale, space))
                break;

            lastLayout = layout;
            lastNumColumns = numColumns;
            lastScale = scale;
            lastSpace = space;
        }

        return lastLayout;
    },
};

class UnalignedLayoutStrategy extends Workspace.LayoutStrategy {
    _newRow() {
        // Row properties:
        //
        // * x, y are the position of row, relative to area
        //
        // * width, height are the scaled versions of fullWidth, fullHeight
        //
        // * width also has the spacing in between windows. It's not in
        //   fullWidth, as the spacing is constant, whereas fullWidth is
        //   meant to be scaled
        //
        // * neither height/fullHeight have any sort of spacing or padding
        return {
            x: 0, y: 0,
            width: 0, height: 0,
            fullWidth: 0, fullHeight: 0,
            windows: [],
        };
    }

    // Computes and returns an individual scaling factor for @window,
    // to be applied in addition to the overall layout scale.
    _computeWindowScale(window) {
        // Since we align windows next to each other, the height of the
        // thumbnails is much more important to preserve than the width of
        // them, so two windows with equal height, but maybe differering
        // widths line up.
        const ratio = window.boundingBox.height / this._monitor.height;

        // The purpose of this manipulation here is to prevent windows
        // from getting too small. For something like a calculator window,
        // we need to bump up the size just a bit to make sure it looks
        // good. We'll use a multiplier of 1.5 for this.

        // Map from [0, 1] to [1.5, 1]
        // return Util.lerp(1.5, 1, ratio);

        // Add an option to control height compensation for smaller windows:
        // opt.WINDOW_HEIGHT_COMPENSATION ranges from 0 to 1:
        //    1 - Maintains the same scale ratio for all windows in a row
        //    0 - Scales all windows in a row to the same height
        //    0.5 - Default value

        return 1 / (ratio + (1 - ratio) * opt.WIN_HEIGHT_COMPENSATION);
    }

    _computeRowSizes(layout) {
        let { rows, scale } = layout;
        for (let i = 0; i < rows.length; i++) {
            let row = rows[i];
            row.width = row.fullWidth * scale + (row.windows.length - 1) * this._columnSpacing;
            row.height = row.fullHeight * scale;
        }
    }

    _keepSameRow(row, window, width, idealRowWidth) {
        if (row.fullWidth + width <= idealRowWidth)
            return true;

        let oldRatio = row.fullWidth / idealRowWidth;
        let newRatio = (row.fullWidth + width) / idealRowWidth;

        if (Math.abs(1 - newRatio) < Math.abs(1 - oldRatio))
            return true;

        return false;
    }

    _sortRow(row) {
        // Sort windows horizontally to minimize travel distance.
        // This affects in what order the windows end up in a row.
        row.windows.sort((a, b) => a.windowCenter.x - b.windowCenter.x);
    }

    computeLayout(windows, layoutParams) {
        layoutParams = Params.parse(layoutParams, {
            numRows: 0,
        });

        if (layoutParams.numRows === 0)
            throw new Error(`${this.constructor.name}: No numRows given in layout params`);

        const numRows = layoutParams.numRows;

        let rows = [];
        let totalWidth = 0;
        for (let i = 0; i < windows.length; i++) {
            let window = windows[i];
            let s = this._computeWindowScale(window);
            totalWidth += window.boundingBox.width * s;
        }

        let idealRowWidth = totalWidth / numRows;

        // Sort windows vertically to minimize travel distance.
        // This affects what rows the windows get placed in.
        let sortedWindows = windows.slice();
        sortedWindows.sort((a, b) => a.windowCenter.y - b.windowCenter.y);

        let windowIdx = 0;
        for (let i = 0; i < numRows; i++) {
            let row = this._newRow();
            rows.push(row);

            for (; windowIdx < sortedWindows.length; windowIdx++) {
                let window = sortedWindows[windowIdx];
                let s = this._computeWindowScale(window);
                let width = window.boundingBox.width * s;
                let height = window.boundingBox.height * s;
                row.fullHeight = Math.max(row.fullHeight, height);

                // either new width is < idealWidth or new width is nearer from idealWidth then oldWidth
                if (this._keepSameRow(row, window, width, idealRowWidth) || (i === numRows - 1)) {
                    row.windows.push(window);
                    row.fullWidth += width;
                } else {
                    break;
                }
            }
        }

        let gridHeight = 0;
        let maxRow;
        for (let i = 0; i < numRows; i++) {
            let row = rows[i];
            this._sortRow(row);

            if (!maxRow || row.fullWidth > maxRow.fullWidth)
                maxRow = row;
            gridHeight += row.fullHeight;
        }

        return {
            numRows,
            rows,
            maxColumns: maxRow.windows.length,
            gridWidth: maxRow.fullWidth,
            gridHeight,
        };
    }

    computeScaleAndSpace(layout, area) {
        let hspacing = (layout.maxColumns - 1) * this._columnSpacing;
        let vspacing = (layout.numRows - 1) * this._rowSpacing;

        let spacedWidth = area.width - hspacing;
        let spacedHeight = area.height - vspacing;

        let horizontalScale = spacedWidth / layout.gridWidth;
        let verticalScale = spacedHeight / layout.gridHeight;

        // Thumbnails should be less than 70% of the original size
        let scale = Math.min(
            horizontalScale, verticalScale, WINDOW_PREVIEW_MAXIMUM_SCALE);

        let scaledLayoutWidth = layout.gridWidth * scale + hspacing;
        let scaledLayoutHeight = layout.gridHeight * scale + vspacing;
        let space = (scaledLayoutWidth * scaledLayoutHeight) / (area.width * area.height);

        layout.scale = scale;

        return [scale, space];
    }

    computeWindowSlots(layout, area) {
        this._computeRowSizes(layout);

        let { rows, scale } = layout;

        let slots = [];

        // Do this in three parts.
        let heightWithoutSpacing = 0;
        for (let i = 0; i < rows.length; i++) {
            let row = rows[i];
            heightWithoutSpacing += row.height;
        }

        let verticalSpacing = (rows.length - 1) * this._rowSpacing;
        let additionalVerticalScale = Math.min(1, (area.height - verticalSpacing) / heightWithoutSpacing);

        // keep track how much smaller the grid becomes due to scaling
        // so it can be centered again
        let compensation = 0;
        let y = 0;

        for (let i = 0; i < rows.length; i++) {
            let row = rows[i];

            // If this window layout row doesn't fit in the actual
            // geometry, then apply an additional scale to it.
            let horizontalSpacing = (row.windows.length - 1) * this._columnSpacing;
            let widthWithoutSpacing = row.width - horizontalSpacing;
            let additionalHorizontalScale = Math.min(1, (area.width - horizontalSpacing) / widthWithoutSpacing);

            if (additionalHorizontalScale < additionalVerticalScale) {
                row.additionalScale = additionalHorizontalScale;
                // Only consider the scaling in addition to the vertical scaling for centering.
                compensation += (additionalVerticalScale - additionalHorizontalScale) * row.height;
            } else {
                row.additionalScale = additionalVerticalScale;
                // No compensation when scaling vertically since centering based on a too large
                // height would undo what vertical scaling is trying to achieve.
            }

            row.x = area.x + (Math.max(area.width - (widthWithoutSpacing * row.additionalScale + horizontalSpacing), 0) / 2);
            row.y = area.y + (Math.max(area.height - (heightWithoutSpacing + verticalSpacing), 0) / 2) + y;
            y += row.height * row.additionalScale + this._rowSpacing;
        }

        compensation /= 2;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowY = row.y + compensation;
            const rowHeight = row.height * row.additionalScale;

            let x = row.x;
            for (let j = 0; j < row.windows.length; j++) {
                let window = row.windows[j];

                let s = scale * this._computeWindowScale(window) * row.additionalScale;
                let cellWidth = window.boundingBox.width * s;
                let cellHeight = window.boundingBox.height * s;

                s = Math.min(s, WINDOW_PREVIEW_MAXIMUM_SCALE);
                let cloneWidth = window.boundingBox.width * s;
                const cloneHeight = window.boundingBox.height * s;

                let cloneX = x + (cellWidth - cloneWidth) / 2;
                let cloneY;

                // If there's only one row, align windows vertically centered inside the row
                if (rows.length === 1)
                    cloneY = rowY + (rowHeight - cloneHeight) / 2;
                    // If there are multiple rows, align windows to the bottom edge of the row
                else
                    cloneY = rowY + rowHeight - cellHeight;

                // Align with the pixel grid to prevent blurry windows at scale = 1
                cloneX = Math.floor(cloneX);
                cloneY = Math.floor(cloneY);

                slots.push([cloneX, cloneY, cloneWidth, cloneHeight, window]);
                x += cellWidth + this._columnSpacing;
            }
        }
        return slots;
    }
}

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
