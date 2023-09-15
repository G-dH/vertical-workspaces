/**
 * V-Shell (Vertical Workspaces)
 * panel.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2023
 * @license    GPL-3.0
 *
 */

'use strict';

let Gi;
let Ui;
let Me;

let opt;

let ANIMATION_TIME;

var PanelModule = class {
    constructor(gi, ui, misc, me) {
        Gi = gi;
        Ui = ui;
        Me = me;

        opt = Me.opt;

        ANIMATION_TIME = Ui.Overview.ANIMATION_TIME;

        this._firstActivation = true;
        this._moduleEnabled = false;
        this._overrides = null;

        this._showingOverviewConId = 0;
        this._hidingOverviewConId = 0;
        this._styleChangedConId = 0;
    }

    cleanGlobals() {
        Gi = null;
        Ui = null;
        Me = null;
        opt = null;
    }

    update(reset) {
        this._moduleEnabled = opt.get('panelModule');
        const conflict = Me.Util.getEnabledExtensions('dash-to-panel').length ||
                         Me.Util.getEnabledExtensions('hidetopbar').length;

        if (conflict && !reset)
            log(`[${Me.metadata.name}] Warning: "Panel" module disabled due to potential conflict with another extension`);

        reset = reset || !this._moduleEnabled || conflict || Ui.Main.sessionMode.isLocked;

        // don't touch original code if module disabled
        if (reset && !this._firstActivation) {
            this._disableModule();
        } else if (!reset) {
            this._firstActivation = false;
            this._activateModule();
        }
    }

    _activateModule() {
        if (!this._overrides)
            this._overrides = new Me.Util.Overrides();

        const panelBox = Ui.Main.layoutManager.panelBox;

        this._setPanelPosition();
        this._updateStyleChangedConnection();

        if (opt.PANEL_MODE === 0) {
            this._updateOverviewConnection(true);
            this._reparentPanel(false);
            panelBox.translation_y = 0;
            Ui.Main.panel.opacity = 255;
            this._setPanelStructs(true);
        } else if (opt.PANEL_MODE === 1) {
            if (opt.SHOW_WS_PREVIEW_BG) {
                this._reparentPanel(true);
                if (opt.OVERVIEW_MODE2) {
                    // in OM2 if the panel has been moved to the overviewGroup move panel above all
                    Ui.Main.layoutManager.overviewGroup.set_child_above_sibling(panelBox, null);
                    this._updateOverviewConnection();
                } else {
                    // otherwise move the panel below overviewGroup so it can get below workspacesDisplay
                    Ui.Main.layoutManager.overviewGroup.set_child_below_sibling(panelBox, Ui.Main.overview._overview);
                    this._updateOverviewConnection(true);
                }
                this._showPanel(true);
            } else {
                // if ws preview bg is disabled, panel can stay in uiGroup
                this._reparentPanel(false);
                this._showPanel(false);
                this._updateOverviewConnection();
            }
            // _connectPanel();
        } else if (opt.PANEL_MODE === 2) {
            this._updateOverviewConnection(true);
            this._reparentPanel(false);
            this._showPanel(false);
            // _connectPanel();
        }
        this._setPanelStructs(opt.PANEL_MODE === 0);
        Ui.Main.layoutManager._updateHotCorners();

        this._overrides.addOverride('ActivitiesButton', Ui.Panel.ActivitiesButton.prototype, ActivitiesButton);
    }

    _disableModule() {
        const reset = true;
        this._setPanelPosition(reset);
        this._updateOverviewConnection(reset);
        this._reparentPanel(false);

        this._updateStyleChangedConnection(reset);

        const panelBox = Ui.Main.layoutManager.panelBox;
        panelBox.translation_y = 0;
        Ui.Main.panel.opacity = 255;
        this._setPanelStructs(true);
        if (this._overrides)
            this._overrides.removeAll();
        this._overrides = null;

    }

    _setPanelPosition(reset = false) {
        const geometry = global.display.get_monitor_geometry(global.display.get_primary_monitor());
        const panelBox = Ui.Main.layoutManager.panelBox;
        const panelHeight = Ui.Main.panel.height; // panelBox height can be 0 after shell start

        if (opt.PANEL_POSITION_TOP || reset)
            panelBox.set_position(geometry.x, geometry.y);
        else
            panelBox.set_position(geometry.x, geometry.y + geometry.height - panelHeight);
    }

    _updateStyleChangedConnection(reset = false) {
        if (reset) {
            if (this._styleChangedConId) {
                Ui.Main.panel.disconnect(this._styleChangedConId);
                this._styleChangedConId = 0;
            }
        } else if (!this._styleChangedConId) {
            this._styleChangedConId = Ui.Main.panel.connect('style-changed', () => {
                if (opt.PANEL_MODE === 1 && !opt.OVERVIEW_MODE2)
                    Ui.Main.panel.add_style_pseudo_class('overview');
                else if (opt.OVERVIEW_MODE2)
                    Ui.Main.panel.remove_style_pseudo_class('overview');
            });
        }
    }

    _updateOverviewConnection(reset = false) {
        if (reset) {
            if (this._hidingOverviewConId) {
                Ui.Main.overview.disconnect(this._hidingOverviewConId);
                this._hidingOverviewConId = 0;
            }
            if (this._showingOverviewConId) {
                Ui.Main.overview.disconnect(this._showingOverviewConId);
                this._showingOverviewConId = 0;
            }
        } else {
            if (!this._hidingOverviewConId) {
                this._hidingOverviewConId = Ui.Main.overview.connect('hiding', () => {
                    if (!opt.SHOW_WS_PREVIEW_BG || opt.OVERVIEW_MODE2)
                        this._showPanel(false);
                });
            }
            if (!this._showingOverviewConId) {
                this._showingOverviewConId = Ui.Main.overview.connect('showing', () => {
                    if (!opt.SHOW_WS_PREVIEW_BG || opt.OVERVIEW_MODE2 || Ui.Main.layoutManager.panelBox.translation_y)
                        this._showPanel(true);
                });
            }
        }
    }

    _reparentPanel(reparent = false) {
        const panel = Ui.Main.layoutManager.panelBox;
        if (reparent && panel.get_parent() === Ui.Main.layoutManager.uiGroup) {
            Ui.Main.layoutManager.uiGroup.remove_child(panel);
            Ui.Main.layoutManager.overviewGroup.add_child(panel);
        } else if (!reparent && panel.get_parent() === Ui.Main.layoutManager.overviewGroup) {
            Ui.Main.layoutManager.overviewGroup.remove_child(panel);
            // return the panel at default position, panel shouldn't cover objects that should be above
            Ui.Main.layoutManager.uiGroup.insert_child_at_index(panel, 4);
        }
    }

    _setPanelStructs(state) {
        Ui.Main.layoutManager._trackedActors.forEach(a => {
            if (a.actor === Ui.Main.layoutManager.panelBox)
                a.affectsStruts = state;
        });

        // workaround to force maximized windows to resize after removing affectsStruts
        // simulation of minimal swipe gesture to the opposite direction
        // todo - needs better solution!!!!!!!!!!!
        // const direction = _getAppGridAnimationDirection() === 2 ? 1 : -1;
        // Ui.Main.overview._swipeTracker._beginTouchSwipe(null, global.get_current_time(), 1, 1);
        // Ui.Main.overview._swipeTracker._updateGesture(null, global.get_current_time(), direction, 1);
        // GLib.timeout_add(0, 50, () => Ui.Main.overview._swipeTracker._endGesture(global.get_current_time(), 1, true));*/
    }

    _showPanel(show = true) {
        if (show) {
            Ui.Main.panel.opacity = 255;
            Ui.Main.layoutManager.panelBox.ease({
                duration: ANIMATION_TIME,
                translation_y: 0,
                onComplete: () => {
                    this._setPanelStructs(opt.PANEL_MODE === 0);
                },
            });
        } else {
            const panelHeight = Ui.Main.panel.height;
            Ui.Main.layoutManager.panelBox.ease({
                duration: ANIMATION_TIME,
                translation_y: opt.PANEL_POSITION_TOP ? -panelHeight + 1 : panelHeight - 1,
                onComplete: () => {
                    Ui.Main.panel.opacity = 0;
                    this._setPanelStructs(opt.PANEL_MODE === 0);
                },
            });
        }
    }
};

const ActivitiesButton = {
    vfunc_event(event) {
        if (event.type() === Gi.Clutter.EventType.TOUCH_END ||
            event.type() === Gi.Clutter.EventType.BUTTON_RELEASE) {
            if (Ui.Main.overview.shouldToggleByCornerOrButton()) {
                if (event.get_button() === Gi.Clutter.BUTTON_SECONDARY && !Ui.Main.overview.dash.showAppsButton.checked) {
                    Ui.Main.overview.show(2);
                    Ui.Main.overview.dash.showAppsButton.checked = true;
                } else {
                    Ui.Main.overview.toggle();
                }
            }
        } else if (event.type() === Gi.Clutter.EventType.SCROLL) {
            Ui.Main.wm.handleWorkspaceScroll(event);
        }

        return Gi.Clutter.EVENT_PROPAGATE;
    },
};
