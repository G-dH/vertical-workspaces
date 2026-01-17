/**
 * V-Shell (Vertical Workspaces)
 * overlayKey.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2025
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

let Me;
let opt;

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

        this._overlayKeyHandlerId = global.display.connect('overlay-key', this._onOverlayKeyPressed.bind(Main.overview._overview.controls));
    }

    _onOverlayKeyPressed() {
        // Note: this === Main.overview._overview.controls
        if (this._a11ySettings.get_boolean('stickykeys-enable'))
            return;

        const { currentState, initialState, finalState } =
                        this._stateAdjustment.getStateTransitionParams();

        const time = GLib.get_monotonic_time() / 1000;
        const timeDiff = time - this._lastOverlayKeyTime;
        this._lastOverlayKeyTime = time;

        const shouldShift = St.Settings.get().enable_animations && St.Settings.get().slow_down_factor >= 1
            ? Main.overview._visible && initialState === ControlsState.HIDDEN
            : Main.overview._visible && timeDiff < Overview.ANIMATION_TIME;

        const secondaryAction = opt.OVERLAY_KEY_SECONDARY;
        if (shouldShift) {
            // Deactivate search if active
            Me.Util.activateSearchProvider('');
            if (secondaryAction === 1) {
                this._shiftState(Meta.MotionDirection.UP);
            } else if (secondaryAction === 2) {
                // For now, ignore this option when primary action is set to App Grid with search mode
                if (!((finalState === ControlsState.APP_GRID || currentState === ControlsState.APP_GRID) && opt.SEARCH_APP_GRID_MODE))
                    Me.Util.activateSearchProvider(Me.WSP_PREFIX);
            } else if (secondaryAction === 3) {
                // Changing the overview mode automatically changes the overview transition
                opt.OVERVIEW_MODE = 0;
                opt.OVERVIEW_MODE2 = false;
                opt.WORKSPACE_MODE = 1;
                if (finalState === ControlsState.APP_GRID || currentState === ControlsState.APP_GRID)
                    this._shiftState(Meta.MotionDirection.DOWN);
            }
        } else {
            if (Main.overview._shown && finalState !== ControlsState.HIDDEN) {
                Main.overview.hide();
                return;
            }
            switch (opt.OVERLAY_KEY_PRIMARY) {
            case 0: // Disabled
                return;
            case 1: // Follow global overview mode
                Main.overview.resetOverviewMode();
                break;
            case 2: // Default overview
                opt.OVERVIEW_MODE = 0;
                opt.OVERVIEW_MODE2 = false;
                opt.WORKSPACE_MODE = 1;
                break;
            case 3: // App grid
                if (Main.overview._shown)
                    Main.overview.hide();
                else
                    Main.overview.show(ControlsState.APP_GRID);
                return;
            case 4: // Static WS preview
                opt.OVERVIEW_MODE = 1;
                opt.OVERVIEW_MODE2 = false;
                if (!Main.overview._shown)
                    opt.WORKSPACE_MODE = 0;
                break;
            case 5: // Static WS
                opt.OVERVIEW_MODE = 2;
                opt.OVERVIEW_MODE2 = true;
                opt.WORKSPACE_MODE = 0;
                break;
            case 6: // Window Search
                opt.OVERVIEW_MODE = 2;
                opt.OVERVIEW_MODE2 = true;
                if (!Main.overview._shown)
                    opt.WORKSPACE_MODE = 0;
                break;
            }
            const customOverviewMode = !Main.overview._shown;
            Main.overview.toggle(customOverviewMode);
            if (opt.OVERLAY_KEY_PRIMARY === 6)
                Me.Util.activateSearchProvider(Me.WSP_PREFIX);
        }
    }
};
