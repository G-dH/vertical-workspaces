/**
 * V-Shell (Vertical Workspaces)
 * layout.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2026
 * @license    GPL-3.0
 *
 */

'use strict';

import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Gio from 'gi://Gio';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Layout from 'resource:///org/gnome/shell/ui/layout.js';
import { ControlsState } from 'resource:///org/gnome/shell/ui/overviewControls.js';
import { OverviewMode } from './overview.js';

let Me;
let opt;

const Position = {
    DEFAULT: 0,
    TOP_LEFT: 1,
    TOP_RIGHT: 2,
    BOTTOM_LEFT: 3,
    BOTTOM_RIGHT: 4,
};

const Action = {
    NONE: 0,
    FOLLOW_GLOBAL: 1,
    WINDOW_PICKER: 2,
    APP_GRID: 3,
    STATIC_WORKSPACE: 4,
    STATIC_DESKTOP: 5,
    SEARCH_WINDOWS: 6,
};

export const LayoutModule = class {
    constructor(me) {
        Me = me;
        opt = Me.opt;

        this._firstActivation = true;
        this.moduleEnabled = false;
        this._overrides = null;
        this._originalUpdateHotCorners = null;
    }

    cleanGlobals() {
        Me = null;
        opt = null;
    }

    update(reset) {
        this._removeTimeouts();

        this.moduleEnabled = opt.get('layoutModule');
        const conflict = Me.Util.getEnabledExtensions('custom-hot-corners').length ||
                         Me.Util.getEnabledExtensions('dash-to-panel').length;

        if (conflict && !reset)
            console.warn(`[${Me.metadata.name}] Warning: "Layout" module disabled due to potential conflict with another extension`);

        reset = reset || !this.moduleEnabled || conflict;

        // don't touch the original code if module disabled
        if (reset && !this._firstActivation) {
            this._disableModule();
        } else if (!reset) {
            this._firstActivation = false;
            this._activateModule();
        }
        if (reset && this._firstActivation)
            console.debug('  LayoutModule - Keeping untouched');
    }

    _activateModule() {
        if (!this._overrides)
            this._overrides = new Me.Util.Overrides();

        this._overrides.addOverride('LayoutManager', Main.layoutManager, LayoutManagerCommon);
        this._overrides.addOverride('HotCorner', Layout.HotCorner.prototype, HotCornerCommon);

        Main.layoutManager._updatePanelBarrier();
        Main.layoutManager._updateHotCorners();

        if (!this._hotCornersEnabledConId) {
            this._interfaceSettings = new Gio.Settings({
                schema_id: 'org.gnome.desktop.interface',
            });
            this._hotCornersEnabledConId = this._interfaceSettings.connect('changed::enable-hot-corners',
                () => {
                    // If the user activates or deactivates the GNOME hot corner while V-Shell is running,
                    // update the V-Shell hot corner action accordingly
                    const hotCornerAction = this._interfaceSettings.get_boolean('enable-hot-corners') ? 2 : 0;
                    opt.set('hotCornerAction', hotCornerAction);

                    // Override the system update (which still calls the original function)
                    // with our custom implementation
                    Main.layoutManager._updateHotCorners();
                }
            );
        }

        // Set the system hot corner toggle based on the V-Shell configuration
        this._interfaceSettings.set_boolean('enable-hot-corners', !!opt.HOT_CORNER_ACTION);

        console.debug('  LayoutModule - Activated');
    }

    _disableModule() {
        if (this._overrides)
            this._overrides.removeAll();
        this._overrides = null;

        Main.layoutManager._updateHotCorners();

        if (this._hotCornersEnabledConId) {
            this._interfaceSettings.disconnect(this._hotCornersEnabledConId);
            this._hotCornersEnabledConId = 0;
            this._interfaceSettings = null;
        }

        console.debug('  LayoutModule - Disabled');
    }

    _removeTimeouts() {
        if (Me.run.timeouts.releaseKeyboardTimeout) {
            GLib.source_remove(Me.run.timeouts.releaseKeyboardTimeout);
            Me.run.timeouts.releaseKeyboardTimeout = 0;
        }
    }
};

const LayoutManagerCommon = {
    _updatePanelBarrier() {
        const position = opt.HOT_CORNER_POSITION;

        if (this._rightPanelBarrier) {
            this._rightPanelBarrier.destroy();
            this._rightPanelBarrier = null;
        }

        if (this._leftPanelBarrier) {
            this._leftPanelBarrier.destroy();
            this._leftPanelBarrier = null;
        }

        if (!this.primaryMonitor || !opt || Me.Util.getEnabledExtensions('hidetopbar'))
            return;

        if (this.panelBox.height) {
            const backend = !!Meta.Barrier.prototype.backend;
            let params = {};
            if (backend)
                params['backend'] = global.backend;
            else
                params['display'] = global.display;

            let primary = this.primaryMonitor;
            if ([Position.DEFAULT, Position.TOP_LEFT, Position.BOTTOM_LEFT].includes(position)) {
                params = Object.assign({}, params, {
                    x1: primary.x + primary.width, y1: this.panelBox.allocation.y1,
                    x2: primary.x + primary.width, y2: this.panelBox.allocation.y2,
                    directions: Meta.BarrierDirection.NEGATIVE_X,
                });
                this._rightPanelBarrier = new Meta.Barrier(params);
            }

            if ([Position.TOP_RIGHT, Position.BOTTOM_RIGHT].includes(position)) {
                params = Object.assign({}, params, {
                    x1: primary.x, y1: this.panelBox.allocation.y1,
                    x2: primary.x, y2: this.panelBox.allocation.y2,
                    directions: Meta.BarrierDirection.POSITIVE_X,
                });
                this._leftPanelBarrier = new Meta.Barrier(params);
            }
        }
    },

    _updateHotCorners() {
        // avoid errors if called from foreign override
        if (!opt)
            return;

        // destroy old hot corners
        this.hotCorners.forEach(corner => corner?.destroy());
        this.hotCorners = [];

        if (!this._interfaceSettings.get_boolean('enable-hot-corners')) {
            this.emit('hot-corners-changed');
            return;
        }

        let size = this.panelBox.height ? this.panelBox.height : 27;

        const position = opt.HOT_CORNER_POSITION;

        // Build new hot corners
        for (let i = 0; i < this.monitors.length; i++) {
            let monitor = this.monitors[i];
            let cornerX, cornerY;

            if (position === Position.DEFAULT) {
                cornerX = this._rtl ? monitor.x + monitor.width : monitor.x;
                cornerY = monitor.y;
            } else if (position === Position.TOP_LEFT) {
                cornerX = monitor.x;
                cornerY = monitor.y;
            } else if (position === Position.TOP_RIGHT) {
                cornerX = monitor.x + monitor.width;
                cornerY = monitor.y;
            } else if (position === Position.BOTTOM_LEFT) {
                cornerX = monitor.x;
                cornerY = monitor.y + monitor.height;
            } else {
                cornerX = monitor.x + monitor.width;
                cornerY = monitor.y + monitor.height;
            }

            let haveCorner = true;

            if (i !== this.primaryIndex) {
                // Check if we have a top left (right for RTL) corner.
                // I.e. if there is no monitor directly above or to the left(right)
                let besideX = this._rtl ? monitor.x + 1 : cornerX - 1;
                let besideY = cornerY;
                let aboveX = cornerX;
                let aboveY = cornerY - 1;

                for (let j = 0; j < this.monitors.length; j++) {
                    if (i === j)
                        continue;
                    let otherMonitor = this.monitors[j];
                    if (besideX >= otherMonitor.x &&
                        besideX < otherMonitor.x + otherMonitor.width &&
                        besideY >= otherMonitor.y &&
                        besideY < otherMonitor.y + otherMonitor.height) {
                        haveCorner = false;
                        break;
                    }
                    if (aboveX >= otherMonitor.x &&
                        aboveX < otherMonitor.x + otherMonitor.width &&
                        aboveY >= otherMonitor.y &&
                        aboveY < otherMonitor.y + otherMonitor.height) {
                        haveCorner = false;
                        break;
                    }
                }
            }

            if (haveCorner) {
                let corner = new Layout.HotCorner(this, monitor, cornerX, cornerY);
                corner.setBarrierSize(size, false);
                this.hotCorners.push(corner);
            } else {
                this.hotCorners.push(null);
            }
        }

        this.emit('hot-corners-changed');
    },
};

const HotCornerCommon = {
    after__init() {
        let angle = 0;
        switch (opt.HOT_CORNER_POSITION) {
        case Position.TOP_RIGHT:
            angle = 90;
            break;
        case Position.BOTTOM_LEFT:
            angle = 270;
            break;
        case Position.BOTTOM_RIGHT:
            angle = 180;
            break;
        }

        this._ripples._ripple1.rotation_angle_z = angle;
        this._ripples._ripple2.rotation_angle_z = angle;
        this._ripples._ripple3.rotation_angle_z = angle;
    },

    setBarrierSize(size, notMyCall = true) {
        // ignore calls from the original _updateHotCorners() callback to avoid building barriers outside screen
        if (notMyCall && size > 0)
            return;

        if (this._verticalBarrier) {
            this._pressureBarrier.removeBarrier(this._verticalBarrier);
            this._verticalBarrier.destroy();
            this._verticalBarrier = null;
        }

        if (this._horizontalBarrier) {
            this._pressureBarrier.removeBarrier(this._horizontalBarrier);
            this._horizontalBarrier.destroy();
            this._horizontalBarrier = null;
        }

        if (size > 0) {
            const position = opt.HOT_CORNER_POSITION;
            const primaryMonitor = global.display.get_primary_monitor();
            const monitor = this._monitor;
            const extendV = opt && opt.HOT_CORNER_ACTION && opt.HOT_CORNER_EDGE && opt.DASH_VERTICAL && monitor.index === primaryMonitor;
            const extendH = opt && opt.HOT_CORNER_ACTION && opt.HOT_CORNER_EDGE && !opt.DASH_VERTICAL && monitor.index === primaryMonitor;

            const backend = !!Meta.Barrier.prototype.backend;
            let params = {};
            if (backend)
                params['backend'] = global.backend;
            else
                params['display'] = global.display;

            if (position <= Position.TOP_LEFT) {
                params = Object.assign({}, params, {
                    x1: this._x, x2: this._x,
                    y1: this._y, y2: this._y + (extendV ? monitor.height : size),
                    directions: Meta.BarrierDirection.POSITIVE_X,
                });
                this._verticalBarrier = new Meta.Barrier(params);
                params = Object.assign({}, params, {
                    x1: this._x, x2: this._x + (extendH ? monitor.width : size),
                    y1: this._y, y2: this._y,
                    directions: Meta.BarrierDirection.POSITIVE_Y,
                });
                this._horizontalBarrier = new Meta.Barrier(params);
            } else if (position === Position.TOP_RIGHT) {
                params = Object.assign({}, params, {
                    x1: this._x, x2: this._x,
                    y1: this._y, y2: this._y + (extendV ? monitor.height : size),
                    directions: Meta.BarrierDirection.NEGATIVE_X,
                });
                this._verticalBarrier = new Meta.Barrier(params);
                params = Object.assign({}, params, {
                    x1: this._x - size, x2: this._x,
                    y1: this._y, y2: this._y,
                    directions: Meta.BarrierDirection.POSITIVE_Y,
                });
                this._horizontalBarrier = new Meta.Barrier(params);
            } else if (position === Position.BOTTOM_LEFT) {
                params = Object.assign({}, params, {
                    x1: this._x, x2: this._x,
                    y1: this._y, y2: this._y - size,
                    directions: Meta.BarrierDirection.POSITIVE_X,
                });
                this._verticalBarrier = new Meta.Barrier(params);
                params = Object.assign({}, params, {
                    x1: this._x, x2: this._x + (extendH ? monitor.width : size),
                    y1: this._y, y2: this._y,
                    directions: Meta.BarrierDirection.NEGATIVE_Y,
                });
                this._horizontalBarrier = new Meta.Barrier(params);
            } else if (position === Position.BOTTOM_RIGHT) {
                params = Object.assign({}, params, {
                    x1: this._x, x2: this._x,
                    y1: this._y, y2: this._y - size,
                    directions: Meta.BarrierDirection.NEGATIVE_X,
                });
                this._verticalBarrier = new Meta.Barrier(params);
                params = Object.assign({}, params, {
                    x1: this._x, x2: this._x - size,
                    y1: this._y, y2: this._y,
                    directions: Meta.BarrierDirection.NEGATIVE_Y,
                });
                this._horizontalBarrier = new Meta.Barrier(params);
            }

            this._pressureBarrier.addBarrier(this._verticalBarrier);
            this._pressureBarrier.addBarrier(this._horizontalBarrier);
        }
    },

    _toggleOverview() {
        if (!Main.overview.shouldToggleByCornerOrButton())
            return;

        const action = opt.HOT_CORNER_ACTION;

        if (!action || (!opt.HOT_CORNER_FULLSCREEN && this._monitor.inFullscreen && !Main.overview.visible))
            return;

        const ctrl = Me.Util.isCtrlPressed();

        if (Main.overview._shown) {
            this._toggleWindowPicker(true);
        } else if (action === Action.FOLLOW_GLOBAL) {
            Main.overview.resetOverviewMode();
            this._toggleWindowPicker(true, true);
        } else if ((!ctrl && action === Action.WINDOW_PICKER) ||
                (ctrl && [Action.APP_GRID, Action.STATIC_WORKSPACE, Action.STATIC_DESKTOP, Action.SEARCH_WINDOWS].includes(action))) {
            // Default overview
            Main.overview.setOverviewMode(OverviewMode.DEFAULT);
            this._toggleWindowPicker(true, true);
        } else if ((!ctrl && action === Action.APP_GRID) ||
                (ctrl && action === Action.WINDOW_PICKER) ||
                (ctrl && action === Action.SEARCH_WINDOWS)) {
            // App Grid
            this._toggleApplications(true);
        } else if (!ctrl && action === Action.STATIC_WORKSPACE) {
            // Overview - static workspace
            Main.overview.setOverviewMode(OverviewMode.STATIC_WORKSPACE);
            this._toggleWindowPicker(true, true);
        } else if (!ctrl && action === Action.STATIC_DESKTOP) {
            // Overview - static desktop
            Main.overview.setOverviewMode(OverviewMode.STATIC_DESKTOP);
            this._toggleWindowPicker(true, true);
        } else if (!ctrl && action === Action.SEARCH_WINDOWS) {
            // Window search provider
            Main.overview.setOverviewMode(OverviewMode.STATIC_DESKTOP);
            this._toggleWindowSearchProvider();
        }

        if (opt.HOT_CORNER_RIPPLES && Main.overview.animationInProgress)
            this._ripples.playAnimation(this._x, this._y);
    },

    _toggleWindowPicker(leaveOverview = false, customOverviewMode = false) {
        if (Main.overview._shown && (leaveOverview || !Main.overview.dash.showAppsButton.checked))
            Main.overview.hide();
        else if (Main.overview.dash.showAppsButton.checked)
            Main.overview.dash.showAppsButton.checked = false;
        else if (!this._showOverviewWithDelay(1, customOverviewMode))
            Main.overview.show(ControlsState.WINDOW_PICKER, customOverviewMode);
    },

    _toggleApplications(leaveOverview = false) {
        if ((leaveOverview && Main.overview._shown) || Main.overview.dash.showAppsButton.checked) {
            Main.overview.hide();
        } else if (!this._showOverviewWithDelay(ControlsState.APP_GRID)) {
            if (Main.overview._shown)
                Main.overview.dash.showAppsButton.checked = true;
            else
                Main.overview.show(ControlsState.APP_GRID);
        }
    },

    // A workaround for case when the GNOME Shell is unable to show overview in X11 session
    // if VirtualBox Machine window grabbed the keyboard
    _showOverviewWithDelay(state, customOverviewMode = false) {
        const focusWindow = global.display.get_focus_window();
        if (Meta.is_wayland_compositor() || !focusWindow || !focusWindow.wm_class.includes('VirtualBox Machine'))
            return false;

        global.stage.set_key_focus(Main.panel);
        // key focus doesn't take the effect immediately, we must wait for it
        Me.run.timeouts.releaseKeyboardTimeout = GLib.timeout_add(
            // delay cannot be too short
            GLib.PRIORITY_DEFAULT, 200, () => {
                Main.overview.show(state, customOverviewMode);
                Me.run.timeouts.releaseKeyboardTimeout = 0;
                return GLib.SOURCE_REMOVE;
            }
        );
        return true;
    },

    _toggleWindowSearchProvider() {
        if (!Main.overview.searchController._searchActive) {
            opt.OVERVIEW_MODE = 2;
            opt.OVERVIEW_MODE2 = true;
            opt.WORKSPACE_MODE = 0;
            this._toggleWindowPicker(false, true);
            const prefix = Me.WSP_PREFIX;
            const position = prefix.length;
            const searchEntry = Main.overview.searchEntry;
            searchEntry.set_text(prefix);
            // searchEntry.grab_key_focus();
            searchEntry.get_first_child().set_cursor_position(position);
            searchEntry.get_first_child().set_selection(position, position);
        } else {
            // Main.overview.searchEntry.text = '';
            Main.overview.hide();
        }
    },
};
