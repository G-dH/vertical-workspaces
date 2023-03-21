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
const { GObject, Gio, GLib, Meta, St } = imports.gi;

const Main = imports.ui.main;
const Overview = imports.ui.overview;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const _Util = Me.imports.lib.util;

const _ = Me.imports.lib.settings._;
const shellVersion = _Util.shellVersion;
const WIN_SEARCH_PREFIX = Me.imports.lib.windowSearchProvider.prefix;
const RECENT_FILES_PREFIX = Me.imports.lib.recentFilesSearchProvider.prefix;
const A11Y_SCHEMA = 'org.gnome.desktop.a11y.keyboard';

let opt;
let _firstRun = true;

let _originalOverlayKeyHandlerId;
let _overlayKeyHandlerId;

function update(reset = false) {
    opt = Me.imports.lib.settings.opt;
    const moduleEnabled = opt.get('overlayKeyModule', true);
    reset = reset || (!_firstRun && !moduleEnabled);

    // don't even touch this module if disabled
    if (_firstRun && !moduleEnabled)
        return;

    _firstRun = false;

    if (reset) {
        _updateOverlayKey(reset);
        opt = null;
        return;
    }

    _updateOverlayKey();
}

function _updateOverlayKey(reset = false) {
    if (reset) {
        _restoreOverlayKeyHandler();
    } else if (!_originalOverlayKeyHandlerId) {
        _originalOverlayKeyHandlerId = GObject.signal_handler_find(global.display, { signalId: 'overlay-key' });
        if (_originalOverlayKeyHandlerId !== null)
            global.display.block_signal_handler(_originalOverlayKeyHandlerId);
        _connectOverlayKey.bind(Main.overview._overview.controls)();
    }
}

function _restoreOverlayKeyHandler() {
    // Disconnect modified overlay key handler
    if (_overlayKeyHandlerId !== null) {
        global.display.disconnect(_overlayKeyHandlerId);
        _overlayKeyHandlerId = null;
    }

    // Unblock original overlay key handler
    if (_originalOverlayKeyHandlerId !== null) {
        global.display.unblock_signal_handler(_originalOverlayKeyHandlerId);
        _originalOverlayKeyHandlerId = null;
    }
}

function _connectOverlayKey() {
    this._a11ySettings = new Gio.Settings({ schema_id: A11Y_SCHEMA });

    this._lastOverlayKeyTime = 0;
    _overlayKeyHandlerId = global.display.connect('overlay-key', () => {
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
    });
}
