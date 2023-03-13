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

const { GLib } = imports.gi;
const Main = imports.ui.main;
const Me = imports.misc.extensionUtils.getCurrentExtension();

const ANIMATION_TIME = imports.ui.overview.ANIMATION_TIME;

let opt;
let _firstRun = true;

let _showingOverviewConId;
let _hidingOverviewConId;
let _styleChangedConId;

function update(reset = false) {
    opt = Me.imports.settings.opt;
    const moduleEnabled = opt.get('panelModule', true);
    const defaultSetting = opt.PANEL_MODE && opt.PANEL_POSITION_TOP;

    // don't even touch this module if disabled
    if (_firstRun && (!moduleEnabled || defaultSetting))
        return;

    _firstRun = false;

    const panelBox = Main.layoutManager.panelBox;
    if (reset || !moduleEnabled) {
        // _disconnectPanel();
        reset = true;
        _setPanelPosition(reset);
        _updateOverviewConnection(reset);
        _reparentPanel(false);

        _updateStyleChangedConnection(reset);

        panelBox.translation_y = 0;
        Main.panel.opacity = 255;
        _setPanelStructs(true);
        return;
    }

    _setPanelPosition();
    _updateStyleChangedConnection();

    if (opt.PANEL_MODE === 0) {
        _updateOverviewConnection(true);
        _reparentPanel(false);
        panelBox.translation_y = 0;
        Main.panel.opacity = 255;
        _setPanelStructs(true);
    } else if (opt.PANEL_MODE === 1) {
        if (opt.SHOW_WS_PREVIEW_BG) {
            _reparentPanel(true);
            if (opt.OVERVIEW_MODE2) {
                // in OM2 if the panel has been moved to the overviewGroup move panel above all
                Main.layoutManager.overviewGroup.set_child_above_sibling(panelBox, null);
                _updateOverviewConnection();
            } else {
                // otherwise move the panel below overviewGroup so it can get below workspacesDisplay
                Main.layoutManager.overviewGroup.set_child_below_sibling(panelBox, Main.overview._overview);
                _updateOverviewConnection(true);
            }
            _showPanel(true);
        } else {
            // if ws preview bg is disabled, panel can stay in uiGroup
            _reparentPanel(false);
            _showPanel(false);
            _updateOverviewConnection();
        }
        // _connectPanel();
    } else if (opt.PANEL_MODE === 2) {
        _updateOverviewConnection(true);
        _reparentPanel(false);
        _showPanel(false);
        // _connectPanel();
    }
    _setPanelStructs(opt.PANEL_MODE === 0);
    Main.layoutManager._updateHotCorners();
}

function _setPanelPosition(reset = false) {
    const geometry = global.display.get_monitor_geometry(global.display.get_primary_monitor());
    const panelBox = Main.layoutManager.panelBox;
    const panelHeight = Main.panel.height; // panelBox height can be 0 after shell start

    if (opt.PANEL_POSITION_TOP || reset)
        panelBox.set_position(geometry.x, geometry.y);
    else
        panelBox.set_position(geometry.x, geometry.y + geometry.height - panelHeight);
}

function _updateStyleChangedConnection(reset = false) {
    if (reset) {
        if (_styleChangedConId) {
            Main.panel.disconnect(_styleChangedConId);
            _styleChangedConId = 0;
        }
    } else if (!_styleChangedConId) {
        Main.panel.connect('style-changed', () => {
            if (opt.PANEL_MODE === 1)
                Main.panel.add_style_pseudo_class('overview');
            else if (opt.OVERVIEW_MODE2)
                Main.panel.remove_style_pseudo_class('overview');
        });
    }
}

function _updateOverviewConnection(reset = false) {
    if (reset) {
        if (_hidingOverviewConId) {
            Main.overview.disconnect(_hidingOverviewConId);
            _hidingOverviewConId = 0;
        }
        if (_showingOverviewConId) {
            Main.overview.disconnect(_showingOverviewConId);
            _showingOverviewConId = 0;
        }
    } else {
        if (!_hidingOverviewConId) {
            _hidingOverviewConId = Main.overview.connect('hiding', () => {
                if (!opt.SHOW_WS_PREVIEW_BG || opt.OVERVIEW_MODE2)
                    _showPanel(false);
            });
        }
        if (!_showingOverviewConId) {
            _showingOverviewConId = Main.overview.connect('showing', () => {
                if (!opt.SHOW_WS_PREVIEW_BG || opt.OVERVIEW_MODE2 || Main.layoutManager.panelBox.translation_y)
                    _showPanel(true);
            });
        }
    }
}

function _reparentPanel(reparent = false) {
    const panel = Main.layoutManager.panelBox;
    if (reparent && panel.get_parent() === Main.layoutManager.uiGroup) {
        Main.layoutManager.uiGroup.remove_child(panel);
        Main.layoutManager.overviewGroup.add_child(panel);
    } else if (!reparent && panel.get_parent() === Main.layoutManager.overviewGroup) {
        Main.layoutManager.overviewGroup.remove_child(panel);
        // return the panel at default position, panel shouldn't cover objects that should be above
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
