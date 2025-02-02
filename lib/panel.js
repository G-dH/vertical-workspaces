/**
 * V-Shell (Vertical Workspaces)
 * panel.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2025
 * @license    GPL-3.0
 *
 */

'use strict';

const Clutter = imports.gi.Clutter;

const Main = imports.ui.main;
const Overview = imports.ui.overview;
const Panel = imports.ui.panel;

let Me;
let opt;

const ANIMATION_TIME = Overview.ANIMATION_TIME;

var PanelModule = class {
    constructor(me) {
        Me = me;
        opt = Me.opt;

        this._firstActivation = true;
        this.moduleEnabled = false;
        this._overrides = null;

        this._showingOverviewConId = 0;
        this._hidingOverviewConId = 0;
        this._styleChangedConId = 0;
    }

    cleanGlobals() {
        Me = null;
        opt = null;
    }

    update(reset) {
        this.moduleEnabled = opt.get('panelModule');
        const conflict = Me.Util.getEnabledExtensions('dash-to-panel').length ||
                         Me.Util.getEnabledExtensions('hidetopbar').length;

        if (conflict && !reset)
            console.warn(`[${Me.metadata.name}] Warning: "Panel" module disabled due to potential conflict with another extension`);

        reset = reset || !this.moduleEnabled || conflict;

        this.moduleEnabled = !reset;

        // don't touch original code if module disabled
        if (reset && !this._firstActivation) {
            this._disableModule();
        } else if (!reset) {
            this._firstActivation = false;
            this._activateModule();
        }
        if (reset && this._firstActivation)
            console.debug('  PanelModule - Keeping untouched');
    }

    _activateModule() {
        if (!this._overrides)
            this._overrides = new Me.Util.Overrides();

        const panelBox = Main.layoutManager.panelBox;

        this._setPanelPosition();
        this._updateStyleChangedConnection();

        if (!opt.PANEL_MODE) {
            this._updateOverviewConnection(true);
            this._reparentPanel(false);
            panelBox.translation_y = 0;
            Main.panel.opacity = 255;
            this._setPanelStructs(true);
        } else if (opt.PANEL_OVERVIEW_ONLY) {
            if (opt.SHOW_WS_PREVIEW_BG) {
                this._reparentPanel(true);
                this._showPanel(true);
            } else {
                // if ws preview bg is disabled, panel can stay in uiGroup
                this._reparentPanel(false);
                this._showPanel(false);
            }
            this._updateOverviewConnection();
            // _connectPanel();
        } else if (opt.PANEL_DISABLED) {
            this._updateOverviewConnection(true);
            this._reparentPanel(false);
            this._showPanel(false);
            // _connectPanel();
        }
        this._setPanelStructs(!opt.PANEL_MODE);
        Main.layoutManager._updateHotCorners();
        Main.overview._overview.controls.layoutManager._updateWorkAreaBox();

        this._overrides.addOverride('ActivitiesButton', Panel.ActivitiesButton.prototype, ActivitiesButton);

        console.debug('  PanelModule - Activated');
    }

    _disableModule() {
        const reset = true;
        this._setPanelPosition(reset);
        this._updateOverviewConnection(reset);
        this._reparentPanel(false);

        this._updateStyleChangedConnection(reset);

        const panelBox = Main.layoutManager.panelBox;
        panelBox.translation_y = 0;
        Main.panel.opacity = 255;
        this._setPanelStructs(true);
        if (this._overrides)
            this._overrides.removeAll();
        this._overrides = null;

        console.debug('  PanelModule - Disabled');
    }

    _setPanelPosition(reset = false) {
        const geometry = global.display.get_monitor_geometry(global.display.get_primary_monitor());
        const panelBox = Main.layoutManager.panelBox;
        const panelHeight = Main.panel.height; // panelBox height can be 0 after shell start

        if (opt.PANEL_POSITION_TOP || reset)
            panelBox.set_position(geometry.x, geometry.y);
        else
            panelBox.set_position(geometry.x, geometry.y + geometry.height - panelHeight);
    }

    _updateStyleChangedConnection(reset = false) {
        if (reset) {
            if (this._styleChangedConId) {
                Main.panel.disconnect(this._styleChangedConId);
                this._styleChangedConId = 0;
            }
        } else if (!this._styleChangedConId) {
            this._styleChangedConId = Main.panel.connect('style-changed', () => {
                this._updateStyle();
            });
        }
    }

    _updateStyle() {
        if (opt.OVERVIEW_MODE2 || !opt.PANEL_OVERVIEW_STYLE)
            Main.panel.remove_style_pseudo_class('overview');
        else if (opt.PANEL_OVERVIEW_ONLY && !opt.OVERVIEW_MODE2)
            Main.panel.add_style_pseudo_class('overview');
    }

    _updateOverviewConnection(reset = false) {
        if (reset) {
            if (this._hidingOverviewConId) {
                Main.overview.disconnect(this._hidingOverviewConId);
                this._hidingOverviewConId = 0;
            }
            if (this._showingOverviewConId) {
                Main.overview.disconnect(this._showingOverviewConId);
                this._showingOverviewConId = 0;
            }
        } else {
            if (!this._hidingOverviewConId) {
                this._hidingOverviewConId = Main.overview.connect('hiding', () => {
                    if (!opt.SHOW_WS_PREVIEW_BG || opt.OVERVIEW_MODE2)
                        this._showPanel(false);
                });
            }
            if (!this._showingOverviewConId) {
                this._showingOverviewConId = Main.overview.connect('showing', () => {
                    if (Main.layoutManager._startingUp)
                        return;
                    this._updateStyle();
                    if (!opt.SHOW_WS_PREVIEW_BG || opt.OVERVIEW_MODE2 || Main.layoutManager.panelBox.translation_y)
                        this._showPanel(true);
                });
            }
        }
    }

    _reparentPanel(reparent = false) {
        const panel = Main.layoutManager.panelBox;
        if (reparent && panel.get_parent() === Main.layoutManager.uiGroup && !Main.sessionMode.isLocked) {
            Main.layoutManager.uiGroup.remove_child(panel);
            Main.layoutManager.overviewGroup.add_child(panel);
        } else if ((!reparent || Main.sessionMode.isLocked) && panel.get_parent() === Main.layoutManager.overviewGroup) {
            Main.layoutManager.overviewGroup.remove_child(panel);
            // return the panel at default position, panel shouldn't cover objects that should be above
            Main.layoutManager.uiGroup.insert_child_at_index(panel, 4);
        }
    }

    _setPanelStructs(state) {
        Main.layoutManager._trackedActors.forEach(a => {
            if (a.actor === Main.layoutManager.panelBox)
                a.affectsStruts = state;
        });

        // workaround to force maximized windows to resize after removing affectsStruts
        // simulation of minimal swipe gesture to the opposite direction
        // todo - needs better solution!!!!!!!!!!!
        // const direction = _getAppGridAnimationDirection() === 2 ? 1 : -1;
        // Main.overview._swipeTracker._beginTouchSwipe(null, global.get_current_time(), 1, 1);
        // Main.overview._swipeTracker._updateGesture(null, global.get_current_time(), direction, 1);
        // GLib.timeout_add(0, 50, () => Main.overview._swipeTracker._endGesture(global.get_current_time(), 1, true));*/
    }

    _showPanel(show = true) {
        const panelBox = Main.layoutManager.panelBox;
        const panelHeight = Main.panel.height;
        const overviewGroup = Main.layoutManager.overviewGroup;

        if (panelBox.get_parent() === overviewGroup)
            overviewGroup.set_child_above_sibling(panelBox, null);

        if (show) {
            panelBox.translation_y = opt.PANEL_POSITION_TOP ? -panelHeight : panelHeight;
            Main.panel.opacity = 255;
            let delay = 0;
            // Panel animation needs to wait until overview is visible
            if (opt.DELAY_OVERVIEW_ANIMATION)
                delay = global.display.get_tab_list(0, null).length * opt.DELAY_PER_WINDOW + 50;
            panelBox.ease({
                delay,
                duration: ANIMATION_TIME,
                translation_y: 0,
                onComplete: () => {
                    this._setPanelStructs(!opt.PANEL_MODE);
                },
            });
        } else if (!Main.layoutManager._startingUp) {
            panelBox.translation_y = 0;
            panelBox.ease({
                duration: ANIMATION_TIME,
                translation_y: opt.PANEL_POSITION_TOP ? -panelHeight : panelHeight,
                onComplete: () => {
                    Main.panel.opacity = 0;
                    this._setPanelStructs(!opt.PANEL_MODE);
                },
            });
        }
    }
};

const ActivitiesButton = {
    vfunc_event(event) {
        if (event.type() === Clutter.EventType.TOUCH_END ||
            event.type() === Clutter.EventType.BUTTON_RELEASE) {
            if (Main.overview.shouldToggleByCornerOrButton()) {
                if (event.get_button() === Clutter.BUTTON_SECONDARY && !Main.overview.dash.showAppsButton.checked) {
                    Main.overview.show(2);
                    Main.overview.dash.showAppsButton.checked = true;
                } else {
                    Main.overview.toggle();
                }
            }
        } else if (event.type() === Clutter.EventType.SCROLL) {
            Main.wm.handleWorkspaceScroll(event);
        }

        return Clutter.EVENT_PROPAGATE;
    },
};
