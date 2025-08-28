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

import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Overview from 'resource:///org/gnome/shell/ui/overview.js';

let Me;
let opt;

const ANIMATION_TIME = Overview.ANIMATION_TIME;

export const PanelModule = class {
    constructor(me) {
        Me = me;
        opt = Me.opt;

        this._firstActivation = true;
        this.moduleEnabled = false;
        this._overrides = null;

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

        this._setPanelPosition();
        this._updateStyleChangedConnection();
        this._updatePanelVisibility();
        this._setPanelStructs(!opt.PANEL_MODE);
        Main.layoutManager._updateHotCorners();
        Main.overview._overview.controls.layoutManager._updateWorkAreaBox();

        this._overrides.addOverride('ActivitiesButton', Main.panel.statusArea.activities, ActivitiesButton);

        console.debug('  PanelModule - Activated');
    }

    _disableModule() {
        const reset = true;
        this._setPanelPosition(reset);
        this._reparentPanel(false);
        this._updatePanelVisibility(reset);
        this._updateStyleChangedConnection(reset);

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
        if (opt.OVERVIEW_MODE2 || !opt.PANEL_OVERVIEW_STYLE) {
            Main.panel.remove_style_pseudo_class('overview');
            Main.panel.set_style('transition-duration: 0ms;');
        } else if (opt.PANEL_OVERVIEW_ONLY && !opt.OVERVIEW_MODE2) {
            Main.panel.add_style_pseudo_class('overview');
        }
    }

    _reparentPanel(reparent = false) {
        const panelBox = Main.layoutManager.panelBox;
        const controlsManager = Main.overview._overview.controls;
        if (reparent && panelBox.get_parent() !== controlsManager && !Main.sessionMode.isLocked) {
            Main.layoutManager.uiGroup.remove_child(panelBox);
            controlsManager.add_child(panelBox);
        } else if ((!reparent || Main.sessionMode.isLocked) && panelBox.get_parent() === controlsManager) {
            controlsManager.remove_child(panelBox);
            // return the panel at default position, panelshouldn't cover objects that should be above
            Main.layoutManager.uiGroup.insert_child_at_index(panelBox, 4);
        }
    }

    _setPanelStructs(state) {
        Main.layoutManager._trackedActors.forEach(a => {
            if (a.actor === Main.layoutManager.panelBox)
                a.affectsStruts = state;
        });
    }

    _updatePanelVisibility(reset = false) {
        if (Main.layoutManager._startingUp && !opt.PANEL_MODE)
            return;

        const panelBox = Main.layoutManager.panelBox;
        const controlsManager = Main.overview._overview.controls;

        let scale_y = 0;

        if (!reset) {
            if (!opt.PANEL_MODE) { // panel always visible
                if (panelBox.get_parent() === controlsManager)
                    panelBox.scale_y = 0;
                scale_y = 1;
                this._reparentPanel(false);
            } else if (opt.PANEL_OVERVIEW_ONLY) {
                if (panelBox.get_parent() !== controlsManager && !Main.layoutManager.overviewGroup.visible)
                    scale_y = 0.;
                else
                    scale_y = 1;
                if (panelBox.get_parent() === controlsManager)
                    controlsManager.set_child_below_sibling(panelBox, controlsManager._workspacesDisplay);
            }

            // Panel should always scale towards the monitor edge
            // Pivot point sets the stable point for transformations
            panelBox.set_pivot_point(0, opt.PANEL_POSITION_TOP ? 0 : 1);

            panelBox.ease({
                duration: Main.layoutManager._startingUp ? 0 : ANIMATION_TIME,
                scale_y,
                onStopped: () => {
                    this._reparentPanel(opt.PANEL_OVERVIEW_ONLY);
                    panelBox.scale_y = opt.PANEL_DISABLED ? 0 : 1;
                    this._setPanelStructs(!opt.PANEL_MODE);
                },
            });
        } else {
            panelBox.set_pivot_point(0, 0);
            this._reparentPanel(false);
            panelBox.scale_y = 1;
            this._setPanelStructs(true);
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
        }

        return Main.wm.handleWorkspaceScroll(event);
    },
};
