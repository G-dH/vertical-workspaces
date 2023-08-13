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
let Misc;
let Me;

let opt;

const A11Y_SCHEMA = 'org.gnome.desktop.a11y.keyboard';

var OverlayKeyModule = class {
    constructor(gi, ui, misc, me) {
        Gi = gi;
        Ui = ui;
        Misc = misc;
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
        Misc = null;
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
        if (!Ui.Main.overview._shown)
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
            if (mode === 1)
                this._shiftState(Gi.Meta.MotionDirection.UP);
            else if (mode === 2)
                Me.Util.activateSearchProvider(Me.WindowSearchProvider.prefix);
            else if (mode === 3)
                Me.Util.activateSearchProvider(Me.RecentFilesSearchProvider.prefix);
        } else {
            Ui.Main.overview.toggle();
        }
    }
};
