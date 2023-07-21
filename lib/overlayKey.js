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
const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;
const GLib = imports.gi.GLib;
const Meta = imports.gi.Meta;
const St = imports.gi.St;

const Main = imports.ui.main;
const Overview = imports.ui.overview;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Settings = Me.imports.lib.settings;
const _Util = Me.imports.lib.util;
const _ = Me.imports.lib.settings._;
const shellVersion = _Util.shellVersion;

const WIN_SEARCH_PREFIX = Me.imports.lib.windowSearchProvider.prefix;
const RECENT_FILES_PREFIX = Me.imports.lib.recentFilesSearchProvider.prefix;
const A11Y_SCHEMA = 'org.gnome.desktop.a11y.keyboard';

let opt;

var OverlayKeyModule = class {
    constructor() {
        opt = Settings.opt;
        this._firstActivation = true;
        this._moduleEnabled = false;

        this._originalOverlayKeyHandlerId = 0;
        this._overlayKeyHandlerId = 0;
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
            this._originalOverlayKeyHandlerId = GObject.signal_handler_find(global.display, { signalId: 'overlay-key' });
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
            if (mode === 1)
                this._shiftState(Meta.MotionDirection.UP);
            else if (mode === 2)
                _Util.activateSearchProvider(WIN_SEARCH_PREFIX);
            else if (mode === 3)
                _Util.activateSearchProvider(RECENT_FILES_PREFIX);
        } else {
            Main.overview.toggle();
        }
    }
};
