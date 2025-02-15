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

        if (!opt.PANEL_MODE) {
            this._reparentPanel(false);
            this._showPanel(); // panelBox.translation_y = 0;
        } else if (opt.PANEL_OVERVIEW_ONLY) {
            this._showPanel(false);
        } else if (opt.PANEL_DISABLED) {
            this._showPanel(false);
        }

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
        this._updateStyleChangedConnection(reset);

        const panelBox = Main.layoutManager.panelBox;
        panelBox.scale_y = 1;
        panelBox.translation_y = 0;
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

        // workaround to force maximized windows to resize after removing affectsStruts
        // simulation of minimal swipe gesture to the opposite direction
        // todo - needs better solution!!!!!!!!!!!
        // const direction = _getAppGridAnimationDirection() === 2 ? 1 : -1;
        // Main.overview._swipeTracker._beginTouchSwipe(null, global.get_current_time(), 1, 1);
        // Main.overview._swipeTracker._updateGesture(null, global.get_current_time(), direction, 1);
        // GLib.timeout_add(0, 50, () => Main.overview._swipeTracker._endGesture(global.get_current_time(), 1, true));*/
    }

    _showPanel(show = true) {
        if (Main.layoutManager._startingUp && !opt.PANEL_MODE)
            return;

        const panelBox = Main.layoutManager.panelBox;
        const panelHeight = Main.panel.height;
        const overviewGroup = Main.layoutManager.overviewGroup;

        if (panelBox.get_parent() === overviewGroup) {
            if (opt.OVERVIEW_MODE2)
                overviewGroup.set_child_above_sibling(panelBox, null);
            else
                overviewGroup.set_child_below_sibling(panelBox, Main.overview._overview);
        }

        panelBox.scale_y = 1;
        let translation_y = 0;

        if (show) {
            if (!opt.PANEL_MODE) {
                // Ensure that panel is not hidden before it's animated
                panelBox.translation_y = opt.PANEL_POSITION_TOP ? -panelHeight : panelHeight;
                this._reparentPanel(false);
            }
        } else if (!Main.layoutManager.overviewGroup.visible || opt.PANEL_DISABLED) {
            translation_y = opt.PANEL_POSITION_TOP ? -panelHeight : panelHeight;
        }

        panelBox.ease({
            duration: Main.layoutManager._startingUp ? 0 : ANIMATION_TIME,
            translation_y,
            onComplete: () => {
                this._reparentPanel(opt.PANEL_OVERVIEW_ONLY);
                panelBox.scale_y = opt.PANEL_DISABLED ? 0 : 1;
                if (opt.PANEL_OVERVIEW_ONLY && opt.SHOW_WS_PREVIEW_BG)
                    panelBox.translation_y = 0;
                this._setPanelStructs(!opt.PANEL_MODE);
            },
        });
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
