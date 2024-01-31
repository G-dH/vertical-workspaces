/**
 * V-Shell (Vertical Workspaces)
 * layout.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2024
 * @license    GPL-3.0
 *
 */

'use strict';

const GLib = imports.gi.GLib;
const Meta = imports.gi.Meta;
const Gio = imports.gi.Gio;

const Layout = imports.ui.layout;
const Main = imports.ui.main;

let Me;
let opt;

let _timeouts;

var LayoutModule = class {
    constructor(me) {
        Me = me;
        opt = Me.opt;
        _timeouts = {};

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

        _timeouts = {};

        this._overrides.addOverride('LayoutManager', Main.layoutManager, LayoutManagerCommon);
        this._overrides.addOverride('HotCorner', Layout.HotCorner.prototype, HotCornerCommon);

        Main.layoutManager._updatePanelBarrier();
        Main.layoutManager._updateHotCorners();

        if (!this._hotCornersEnabledConId) {
            this._interfaceSettings = new Gio.Settings({
                schema_id: 'org.gnome.desktop.interface',
            });
            this._hotCornersEnabledConId = this._interfaceSettings.connect('changed::enable-hot-corners',
                () => Main.layoutManager._updateHotCorners());
        }

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
        if (_timeouts) {
            Object.values(_timeouts).forEach(t => {
                if (t)
                    GLib.source_remove(t);
            });
            _timeouts = null;
        }
    }
};

const LayoutManagerCommon = {
    _updatePanelBarrier() {
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
            let primary = this.primaryMonitor;
            if ([0, 1, 3].includes(opt.HOT_CORNER_POSITION)) {
                this._rightPanelBarrier = new Meta.Barrier({
                    display: global.display,
                    x1: primary.x + primary.width, y1: this.panelBox.allocation.y1,
                    x2: primary.x + primary.width, y2: this.panelBox.allocation.y2,
                    directions: Meta.BarrierDirection.NEGATIVE_X,
                });
            }

            if ([2, 4].includes(opt.HOT_CORNER_POSITION)) {
                this._leftPanelBarrier = new Meta.Barrier({
                    display: global.display,
                    x1: primary.x, y1: this.panelBox.allocation.y1,
                    x2: primary.x, y2: this.panelBox.allocation.y2,
                    directions: Meta.BarrierDirection.POSITIVE_X,
                });
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

        // position 0 - default, 1-TL, 2-TR, 3-BL, 4-BR
        const position = opt.HOT_CORNER_POSITION;

        // build new hot corners
        for (let i = 0; i < this.monitors.length; i++) {
            let monitor = this.monitors[i];
            let cornerX, cornerY;

            if (position === 0) {
                cornerX = this._rtl ? monitor.x + monitor.width : monitor.x;
                cornerY = monitor.y;
            } else if (position === 1) {
                cornerX = monitor.x;
                cornerY = monitor.y;
            } else if (position === 2) {
                cornerX = monitor.x + monitor.width;
                cornerY = monitor.y;
            } else if (position === 3) {
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
        case 2:
            angle = 90;
            break;
        case 3:
            angle = 270;
            break;
        case 4:
            angle = 180;
            break;
        }

        this._ripples._ripple1.rotation_angle_z = angle;
        this._ripples._ripple2.rotation_angle_z = angle;
        this._ripples._ripple3.rotation_angle_z = angle;
    },

    setBarrierSize(size, notMyCall = true) {
        // ignore calls from the original _updateHotCorners() callback to avoid building barriers outside screen
        if (notMyCall && size > 0) {
            return;
        }

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
            const primaryMonitor = global.display.get_primary_monitor();
            const monitor = this._monitor;
            const extendV = opt && opt.HOT_CORNER_ACTION && opt.HOT_CORNER_EDGE && opt.DASH_VERTICAL && monitor.index === primaryMonitor;
            const extendH = opt && opt.HOT_CORNER_ACTION && opt.HOT_CORNER_EDGE && !opt.DASH_VERTICAL && monitor.index === primaryMonitor;

            if (opt.HOT_CORNER_POSITION <= 1) {
                this._verticalBarrier = new Meta.Barrier({
                    display: global.display,
                    x1: this._x, x2: this._x, y1: this._y, y2: this._y + (extendV ? monitor.height : size),
                    directions: Meta.BarrierDirection.POSITIVE_X,
                });
                this._horizontalBarrier = new Meta.Barrier({
                    display: global.display,
                    x1: this._x, x2: this._x + (extendH ? monitor.width : size), y1: this._y, y2: this._y,
                    directions: Meta.BarrierDirection.POSITIVE_Y,
                });
            } else if (opt.HOT_CORNER_POSITION === 2) {
                this._verticalBarrier = new Meta.Barrier({
                    display: global.display,
                    x1: this._x, x2: this._x, y1: this._y, y2: this._y + (extendV ? monitor.height : size),
                    directions: Meta.BarrierDirection.NEGATIVE_X,
                });
                this._horizontalBarrier = new Meta.Barrier({
                    display: global.display,
                    x1: this._x - size, x2: this._x, y1: this._y, y2: this._y,
                    directions: Meta.BarrierDirection.POSITIVE_Y,
                });
            } else if (opt.HOT_CORNER_POSITION === 3) {
                this._verticalBarrier = new Meta.Barrier({
                    display: global.display,
                    x1: this._x, x2: this._x, y1: this._y, y2: this._y - size,
                    directions: Meta.BarrierDirection.POSITIVE_X,
                });
                this._horizontalBarrier = new Meta.Barrier({
                    display: global.display,
                    x1: this._x, x2: this._x + (extendH ? monitor.width : size), y1: this._y, y2: this._y,
                    directions: Meta.BarrierDirection.NEGATIVE_Y,
                });
            } else if (opt.HOT_CORNER_POSITION === 4) {
                this._verticalBarrier = new Meta.Barrier({
                    display: global.display,
                    x1: this._x, x2: this._x, y1: this._y, y2: this._y - size,
                    directions: Meta.BarrierDirection.NEGATIVE_X,
                });
                this._horizontalBarrier = new Meta.Barrier({
                    display: global.display,
                    x1: this._x, x2: this._x - size, y1: this._y, y2: this._y,
                    directions: Meta.BarrierDirection.NEGATIVE_Y,
                });
            }

            this._pressureBarrier.addBarrier(this._verticalBarrier);
            this._pressureBarrier.addBarrier(this._horizontalBarrier);
        }
    },

    _toggleOverview() {
        if (!opt.HOT_CORNER_ACTION || (!opt.HOT_CORNER_FULLSCREEN && this._monitor.inFullscreen && !Main.overview.visible))
            return;

        if (Main.overview.shouldToggleByCornerOrButton()) {
            if (Main.overview._shown) {
                this._toggleWindowPicker(true);
            } else if ((opt.HOT_CORNER_ACTION === 2 && !Me.Util.isCtrlPressed()) || ([3, 4, 5, 6].includes(opt.HOT_CORNER_ACTION) && Me.Util.isCtrlPressed())) {
                // Default overview
                opt.OVERVIEW_MODE = 0;
                opt.OVERVIEW_MODE2 = false;
                opt.WORKSPACE_MODE = 1;
                this._toggleWindowPicker(true, true);
            } else if (opt.HOT_CORNER_ACTION === 1) {
                Main.overview.resetOverviewMode();
                this._toggleWindowPicker(true, true);
            } else if ((opt.HOT_CORNER_ACTION === 3 && !Me.Util.isCtrlPressed()) || (opt.HOT_CORNER_ACTION === 2 && Me.Util.isCtrlPressed()) || (opt.HOT_CORNER_ACTION === 6 && Me.Util.isCtrlPressed())) {
                // Applications
                this._toggleApplications(true);
            } else if (opt.HOT_CORNER_ACTION === 4 && !Me.Util.isCtrlPressed()) {
                // Overview - static ws preview
                opt.OVERVIEW_MODE = 1;
                opt.OVERVIEW_MODE2 = false;
                opt.WORKSPACE_MODE = 0;
                this._toggleWindowPicker(true, true);
            } else if (opt.HOT_CORNER_ACTION === 5 && !Me.Util.isCtrlPressed()) {
                // Overview - static ws
                opt.OVERVIEW_MODE = 2;
                opt.OVERVIEW_MODE2 = true;
                opt.WORKSPACE_MODE = 0;
                this._toggleWindowPicker(true, true);
            } else if (opt.HOT_CORNER_ACTION === 6 && !Me.Util.isCtrlPressed()) {
                // Window search provider
                opt.OVERVIEW_MODE = 2;
                opt.OVERVIEW_MODE2 = true;
                opt.WORKSPACE_MODE = 0;
                this._toggleWindowSearchProvider();
            }
            if (opt.HOT_CORNER_RIPPLES && Main.overview.animationInProgress)
                this._ripples.playAnimation(this._x, this._y);
        }
    },

    _toggleWindowPicker(leaveOverview = false, customOverviewMode = false) {
        if (Main.overview._shown && (leaveOverview || !Main.overview.dash.showAppsButton.checked)) {
            Main.overview.hide();
        } else if (Main.overview.dash.showAppsButton.checked) {
            Main.overview.dash.showAppsButton.checked = false;
        } else {
            const focusWindow = global.display.get_focus_window();
            // at least GS 42 is unable to show overview in X11 session if VirtualBox Machine window grabbed keyboard
            if (!Meta.is_wayland_compositor() && focusWindow && focusWindow.wm_class.includes('VirtualBox Machine')) {
                // following should help when windowed VBox Machine has focus.
                global.stage.set_key_focus(Main.panel);
                // key focus doesn't take the effect immediately, we must wait for it
                // still looking for better solution!
                _timeouts.releaseKeyboardTimeoutId = GLib.timeout_add(
                    GLib.PRIORITY_DEFAULT,
                    // delay cannot be too short
                    200,
                    () => {
                        Main.overview.show(1, customOverviewMode);

                        _timeouts.releaseKeyboardTimeoutId = 0;
                        return GLib.SOURCE_REMOVE;
                    }
                );
            } else {
                Main.overview.show(1, customOverviewMode);
            }
        }
    },

    _toggleApplications(leaveOverview = false) {
        if ((leaveOverview && Main.overview._shown) || Main.overview.dash.showAppsButton.checked) {
            Main.overview.hide();
        } else {
            const focusWindow = global.display.get_focus_window();
            // at least GS 42 is unable to show overview in X11 session if VirtualBox Machine window grabbed keyboard
            if (!Meta.is_wayland_compositor() && focusWindow && focusWindow.wm_class.includes('VirtualBox Machine')) {
                // following should help when windowed VBox Machine has focus.
                global.stage.set_key_focus(Main.panel);
                // key focus doesn't take the effect immediately, we must wait for it
                // still looking for better solution!
                _timeouts.releaseKeyboardTimeoutId = GLib.timeout_add(
                    GLib.PRIORITY_DEFAULT,
                    // delay cannot be too short
                    200,
                    () => {
                        Main.overview.show(2);

                        _timeouts.releaseKeyboardTimeoutId = 0;
                        return GLib.SOURCE_REMOVE;
                    }
                );
            } else if (Main.overview._shown) {
                Main.overview.dash.showAppsButton.checked = true;
            } else {
                Main.overview.show(2); // 2 for App Grid
            }
        }
    },

    _toggleWindowSearchProvider() {
        if (!Main.overview._overview._controls._searchController._searchActive) {
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
