/**
 * V-Shell (Vertical Workspaces)
 * overlayKey.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2026
 * @license    GPL-3.0
 *
 */

'use strict';

import GLib from 'gi://GLib';
import St from 'gi://St';
import Meta from 'gi://Meta';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Overview from 'resource:///org/gnome/shell/ui/overview.js';
import { ControlsState } from 'resource:///org/gnome/shell/ui/overviewControls.js';
import { OverviewMode } from './overview.js';

let Me;
let opt;

const Action = {
    NONE: 0,
    FOLLOW_GLOBAL: 1,
    WINDOW_PICKER: 2,
    APP_GRID: 3,
    STATIC_WORKSPACE: 4,
    STATIC_DESKTOP: 5,
    SEARCH_WINDOWS: 6,
};

const SecondaryAction = {
    NONE: 0,
    APP_GRID: 1,
    SEARCH_WINDOWS: 2,
    WINDOW_PICKER: 3,
    SPREAD_WINDOWS: 4,
};

export const OverlayKeyModule = class {
    constructor(me) {
        Me = me;
        opt = Me.opt;

        this._firstActivation = true;
        this.moduleEnabled = false;
        this._originalOverlayKeyHandlerId = 0;
        this._overlayKeyHandlerId = 0;
    }

    cleanGlobals() {
        Me = null;
        opt = null;
    }

    update(reset) {
        this.moduleEnabled = opt.get('overlayKeyModule');
        const conflict = false;

        reset = reset || !this.moduleEnabled || conflict;

        if (reset && !this._firstActivation) {
            this._disableModule();
        } else if (!reset) {
            this._firstActivation = false;
            this._activateModule();
        }
        if (reset && this._firstActivation)
            console.debug('  OverlayKeyModule - Keeping untouched');
    }

    _activateModule() {
        if (!this._originalOverlayKeyHandlerId) {
            this._originalOverlayKeyHandlerId = GObject.signal_handler_find(global.display, { signalId: 'overlay-key' });
            if (this._originalOverlayKeyHandlerId !== null) {
                global.display.block_signal_handler(this._originalOverlayKeyHandlerId);
                this._connectOverlayKey();
            }
        }
        console.debug('  OverlayKeyModule - Activated');
    }

    _disableModule() {
        this._restoreOverlayKeyHandler();

        console.debug('  OverlayKeyModule - Disabled');
    }

    _restoreOverlayKeyHandler() {
        // Disconnect modified overlay key handler
        if (this._overlayKeyHandlerId) {
            global.display.disconnect(this._overlayKeyHandlerId);
            this._overlayKeyHandlerId = 0;
        }

        // Unblock original overlay key handler
        if (this._originalOverlayKeyHandlerId) {
            global.display.unblock_signal_handler(this._originalOverlayKeyHandlerId);
            this._originalOverlayKeyHandlerId = 0;
        }
    }

    _connectOverlayKey() {
        if (this._overlayKeyHandlerId)
            return;

        this._overlayKeyHandlerId = global.display.connect('overlay-key', () => this._onOverlayKeyPressed());
    }

    _onOverlayKeyPressed() {
        const controlsManager = Main.overview._overview.controls;
        if (controlsManager._a11ySettings.get_boolean('stickykeys-enable'))
            return;

        const { initialState, finalState } = controlsManager._stateAdjustment.getStateTransitionParams();

        const time = GLib.get_monotonic_time() / 1000;
        const timeDiff = time - this._lastOverlayKeyTime;
        this._lastOverlayKeyTime = time;

        const shouldShift = St.Settings.get().enable_animations && St.Settings.get().slow_down_factor >= 1
            ? Main.overview._visible && initialState === ControlsState.HIDDEN
            : Main.overview._visible && timeDiff < Overview.ANIMATION_TIME;


        if (shouldShift) {
            this._executeSecondaryAction();
            return;
        }

        if (Main.overview._shown && finalState !== ControlsState.HIDDEN) {
            Main.overview.hide();
            return;
        }

        Main.overview.resetOverviewMode();
        this._executePrimaryAction();
    }

    _executePrimaryAction() {
        const action = opt.OVERLAY_KEY_PRIMARY;

        if (action === Action.NONE)
            return;

        if (action === Action.APP_GRID) {
            if (Main.overview._shown)
                Main.overview.hide();
            else
                Main.overview.show(ControlsState.APP_GRID);
            return;
        }

        switch (action) {
        case Action.WINDOW_PICKER:
            Main.overview.setOverviewMode(OverviewMode.DEFAULT);
            break;
        case Action.STATIC_WORKSPACE:
            Main.overview.setOverviewMode(OverviewMode.STATIC_WORKSPACE);
            break;
        case Action.STATIC_DESKTOP:
        case Action.SEARCH_WINDOWS:
            Main.overview.setOverviewMode(OverviewMode.STATIC_DESKTOP);
            break;
        }

        const customOverviewMode = !Main.overview._shown;
        Main.overview.toggle(customOverviewMode);

        if (action === Action.SEARCH_WINDOWS)
            Me.Util.activateSearchProvider(Me.WSP_PREFIX);
    }

    _executeSecondaryAction() {
        const controlsManager = Main.overview._overview.controls;
        const action = opt.OVERLAY_KEY_SECONDARY;
        const { currentState, finalState } = controlsManager._stateAdjustment.getStateTransitionParams();

        // Deactivate search if active
        Me.Util.activateSearchProvider('');
        if (action === SecondaryAction.APP_GRID) {
            controlsManager._shiftState(Meta.MotionDirection.UP);
        } else if (action === SecondaryAction.SEARCH_WINDOWS) {
            // For now, ignore this option when primary action is set to App Grid with search mode
            if (!((finalState === ControlsState.APP_GRID || currentState === ControlsState.APP_GRID) && opt.SEARCH_APP_GRID_MODE))
                Me.Util.activateSearchProvider(Me.WSP_PREFIX);
        // Changing the overview mode, automatically changes the overview transition
        } else if (action === SecondaryAction.WINDOW_PICKER) {
            Main.overview.setOverviewMode(OverviewMode.DEFAULT);
            if (finalState === ControlsState.APP_GRID || currentState === ControlsState.APP_GRID)
                controlsManager._shiftState(Meta.MotionDirection.DOWN);
        } else if (action === SecondaryAction.SPREAD_WINDOWS) {
            if (currentState < ControlsState.WINDOW_PICKER)
                opt.WORKSPACE_MODE = 1;
            else if (!opt.WORKSPACE_MODE && currentState === ControlsState.WINDOW_PICKER)
                Me.Util.exposeWindowsWithOverviewTransition();
        }
    }
};
