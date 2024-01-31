/**
 * V-Shell (Vertical Workspaces)
 * overlayKey.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2024
 * @license    GPL-3.0
 *
 */

'use strict';

const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Meta = imports.gi.Meta;
const St = imports.gi.St;

const Main = imports.ui.main;
const Overview = imports.ui.overview;

let Me;
let opt;

var OverlayKeyModule = class {
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
        // Avoid modifying the overlay key if its configuration is consistent with the GNOME default
        const defaultConfig = opt.OVERVIEW_MODE === 0 && opt.OVERLAY_KEY_PRIMARY === 2 && opt.OVERLAY_KEY_SECONDARY === 1;

        reset = reset || !this.moduleEnabled || conflict || defaultConfig;

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
        if (this._a11ySettings.get_boolean('stickykeys-enable'))
            return;

        const { initialState, finalState, transitioning } =
                        this._stateAdjustment.getStateTransitionParams();

        const time = GLib.get_monotonic_time() / 1000;
        const timeDiff = time - this._lastOverlayKeyTime;
        this._lastOverlayKeyTime = time;

        const shouldShift = St.Settings.get().enable_animations
            ? transitioning && finalState > initialState
            : Main.overview.visible && timeDiff < Overview.ANIMATION_TIME;

        const mode = opt.OVERLAY_KEY_SECONDARY;
        if (shouldShift) {
            Me.Util.activateSearchProvider('');
            if (mode === 1) {
                this._shiftState(Meta.MotionDirection.UP);
            } else if (mode === 2) {
                Me.Util.activateSearchProvider(Me.WSP_PREFIX);
            } else if (mode === 3) {
                // Changing the overview mode automatically changes the overview transition
                opt.OVERVIEW_MODE = 0;
                opt.OVERVIEW_MODE2 = false;
                opt.WORKSPACE_MODE = 1;
            }
        } else {
            if (Main.overview._shown) {
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
                    Main.overview.show(2);
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
