/**
 * V-Shell (Vertical Workspaces)
 * overlayKey.js
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


var OverlayKeyModule = class {
    constructor(gi, ui, misc, me) {
        Gi = gi;
        Ui = ui;
        Me = me;

        opt = Me.Opt;

        this._firstActivation = true;
        this._moduleEnabled = false;

        this._originalOverlayKeyHandlerId = 0;
        this._overlayKeyHandlerId = 0;
    }

    cleanGlobals() {
        Gi = null;
        Ui = null;
        Me = null;
        opt = null;
    }

    update(reset) {
        this._moduleEnabled = opt.get('overlayKeyModule');
        const conflict = false;

        reset = reset || !this._moduleEnabled || conflict;

        if (reset && !this._firstActivation) {
            this._disableModule();
        } else if (!reset) {
            this._firstActivation = false;
            this._activateModule();
        }
    }

    _activateModule() {
        if (!this._originalOverlayKeyHandlerId) {
            this._originalOverlayKeyHandlerId = Gi.GObject.signal_handler_find(global.display, { signalId: 'overlay-key' });
            if (this._originalOverlayKeyHandlerId !== null) {
                global.display.block_signal_handler(this._originalOverlayKeyHandlerId);
                this._connectOverlayKey();
            }
        }
    }

    _disableModule() {
        this._restoreOverlayKeyHandler();

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

        this._overlayKeyHandlerId = global.display.connect('overlay-key', this._onOverlayKeyPressed.bind(Ui.Main.overview._overview.controls));
    }

    _onOverlayKeyPressed() {

        if (this._a11ySettings.get_boolean('stickykeys-enable'))
            return;

        const { initialState, finalState, transitioning } =
                        this._stateAdjustment.getStateTransitionParams();

        const time = Gi.GLib.get_monotonic_time() / 1000;
        const timeDiff = time - this._lastOverlayKeyTime;
        this._lastOverlayKeyTime = time;

        const shouldShift = Gi.St.Settings.get().enable_animations
            ? transitioning && finalState > initialState
            : Ui.Main.overview.visible && timeDiff < Ui.Overview.ANIMATION_TIME;

        const mode = opt.OVERLAY_KEY_SECONDARY;
        if (shouldShift) {
            Me.Util.activateSearchProvider('');
            if (mode === 1) {
                this._shiftState(Gi.Meta.MotionDirection.UP);
            } else if (mode === 2) {
                Me.Util.activateSearchProvider(Me.WSP_PREFIX);
            } else if (mode === 3) {
                // Changing the overview mode automatically changes the overview transition
                opt.OVERVIEW_MODE = 0;
                opt.OVERVIEW_MODE2 = false;
                opt.WORKSPACE_MODE = 1;
            }
        } else {
            if (Ui.Main.overview._shown) {
                Ui.Main.overview.hide();
                return;
            }
            switch (opt.OVERLAY_KEY_PRIMARY) {
            case 0: // Disabled
                return;
            case 1: // Follow global overview mode
                Ui.Main.overview.resetOverviewMode();
                break;
            case 2: // Default overview
                opt.OVERVIEW_MODE = 0;
                opt.OVERVIEW_MODE2 = false;
                opt.WORKSPACE_MODE = 1;
                break;
            case 3: // Default overview
                if (Ui.Main.overview._shown)
                    Ui.Main.overview.hide();
                else
                    Ui.Main.overview.show(2);
                return;
            case 4: // Static WS preview
                opt.OVERVIEW_MODE = 1;
                opt.OVERVIEW_MODE2 = false;
                if (!Ui.Main.overview._shown)
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
                if (!Ui.Main.overview._shown)
                    opt.WORKSPACE_MODE = 0;
                break;
            }
            const customOverviewMode = !Ui.Main.overview._shown;
            Ui.Main.overview.toggle(customOverviewMode);
            if (opt.OVERLAY_KEY_PRIMARY === 6)
                Me.Util.activateSearchProvider(Me.WSP_PREFIX);
        }
    }
};
