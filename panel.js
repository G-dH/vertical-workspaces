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

const Main = imports.ui.main;
const Me = imports.misc.extensionUtils.getCurrentExtension();

const ANIMATION_TIME = imports.ui.overview.ANIMATION_TIME;

let opt;

let _showingOverviewConId;
let _hidingOverviewConId;
let _styleChangedConId;

function update(reset = false) {
    opt = Me.imports.settings.opt;

    const panelBox = Main.layoutManager.panelBox;
    const panelHeight = Main.panel.height; // panelBox height can be 0 after shell start

    const geometry = global.display.get_monitor_geometry(global.display.get_primary_monitor());
    if (reset || opt.PANEL_POSITION_TOP)
        panelBox.set_position(geometry.x, geometry.y);
    else
        panelBox.set_position(geometry.x, geometry.y + geometry.height - panelHeight);

    if (!_styleChangedConId)
        Main.panel.connect('style-changed', () => Main.panel.remove_style_pseudo_class('overview'));

    if (reset || opt.PANEL_MODE === 0) {
        // _disconnectPanel();
        _disconnectOverview();
        _reparentPanel(false);
        _showPanel();

        if (_styleChangedConId) {
            Main.panel.disconnect(_styleChangedConId);
            _styleChangedConId = 0;
        }

        panelBox.translation_y = 0;
        panelBox.opacity = 255;
    } else if (opt.PANEL_MODE === 1) {
        if (opt.SHOW_WS_PREVIEW_BG) {
            _reparentPanel(true);
            if (opt.OVERVIEW_MODE2) {
                // in OM2 if the panel has been moved to the overviewGroup move panel above all
                Main.layoutManager.overviewGroup.set_child_above_sibling(panelBox, null);
            } else {
                // otherwise move the panel below overviewGroup so it can get below workspacesDisplay
                Main.layoutManager.overviewGroup.set_child_below_sibling(panelBox, Main.overview._overview);
            }
            _showPanel(true);
        } else {
            // if ws preview bg is disabled, panel can stay in uiGroup
            _reparentPanel(false);
            _showPanel(false);
            if (!_hidingOverviewConId) {
                _hidingOverviewConId = Main.overview.connect('hiding', () => {
                    if (!opt.SHOW_WS_PREVIEW_BG || opt.OVERVIEW_MODE2)
                        _showPanel(false);
                });
            }
            if (!_showingOverviewConId) {
                _showingOverviewConId = Main.overview.connect('showing', () => {
                    if (!opt.SHOW_WS_PREVIEW_BG || opt.OVERVIEW_MODE2)
                        _showPanel(true);
                });
            }
        }
        // _connectPanel();
    } else if (opt.PANEL_MODE === 2) {
        _disconnectOverview();
        _reparentPanel(false);
        _showPanel(false);
        // _connectPanel();
    }
    _setPanelStructs(reset || opt.PANEL_MODE === 0);
}

function _disconnectOverview() {
    if (_hidingOverviewConId) {
        Main.overview.disconnect(_hidingOverviewConId);
        _hidingOverviewConId = 0;
    }
    if (_showingOverviewConId) {
        Main.overview.disconnect(_showingOverviewConId);
        _showingOverviewConId = 0;
    }
}

function _reparentPanel(reparent = false) {
    const panel = Main.layoutManager.panelBox;
    if (reparent && panel.get_parent() === Main.layoutManager.uiGroup) {
        Main.layoutManager.uiGroup.remove_child(panel);
        Main.layoutManager.overviewGroup.add_child(panel);
    } else if (!reparent && panel.get_parent() === Main.layoutManager.overviewGroup) {
        Main.layoutManager.overviewGroup.remove_child(panel);
        // return the panel at default position, pane shouldn't cover objects that should be above
        Main.layoutManager.uiGroup.insert_child_at_index(panel, 4);
    }
}

function _setPanelStructs(state) {
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

function _showPanel(show = true) {
    if (show) {
        Main.panel.opacity = 255;
        Main.layoutManager.panelBox.ease({
            duration: ANIMATION_TIME,
            translation_y: 0,
            onComplete: () => {
                _setPanelStructs(opt.PANEL_MODE === 0);
            },
        });
    } else {
        const panelHeight = Main.panel.height;
        Main.layoutManager.panelBox.ease({
            duration: ANIMATION_TIME,
            translation_y: opt.PANEL_POSITION_TOP ? -panelHeight + 1 : panelHeight - 1,
            onComplete: () => {
                Main.panel.opacity = 0;
                _setPanelStructs(opt.PANEL_MODE === 0);
            },
        });
    }
}
