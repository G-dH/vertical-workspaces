/**
 * V-Shell (Vertical Workspaces)
 * swipeTracker.js
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

export var SwipeTrackerModule = class {
    constructor(gi, ui, misc, me) {
        Gi = gi;
        Ui = ui;
        Misc = misc;
        Me = me;

        opt = Me.Opt;

        this._firstActivation = true;
        this._moduleEnabled = false;
    }

    cleanGlobals() {
        Gi = null;
        Ui = null;
        Misc = null;
        Me = null;
        opt = null;
    }

    update(reset) {
        this._moduleEnabled = opt.get('swipeTrackerModule');
        const conflict = false;

        reset = reset || !this._moduleEnabled || conflict;

        // don't touch the original code if module disabled
        if (reset && !this._firstActivation) {
            this._disableModule();
        } else if (!reset) {
            this._firstActivation = false;
            this._activateModule();
        }
    }

    _activateModule() {
        if (opt.ORIENTATION) { // 1-VERTICAL, 0-HORIZONTAL
            this._setVertical();
        } else {
            this._setHorizontal();
        }
    }

    _disableModule() {
        this._setHorizontal();

    }

    _setVertical() {
        // reverse swipe gestures for enter/leave overview and ws switching
        Ui.Main.overview._swipeTracker.orientation = Gi.Clutter.Orientation.HORIZONTAL;
        Ui.Main.wm._workspaceAnimation._swipeTracker.orientation = Gi.Clutter.Orientation.VERTICAL;
        // overview's updateGesture() function should reflect ws tmb position to match appGrid/ws animation direction
        // function in connection cannot be overridden in prototype of its class because connected is actually another copy of the original function
        if (!this._originalGestureUpdateId) {
            this._originalGestureUpdateId = Gi.GObject.signal_handler_find(Ui.Main.overview._swipeTracker._touchpadGesture, { signalId: 'update' });
            Ui.Main.overview._swipeTracker._touchpadGesture.block_signal_handler(this._originalGestureUpdateId);
            Ui.Main.overview._swipeTracker._updateGesture = SwipeTrackerVertical._updateGesture;
            this._vwGestureUpdateId = Ui.Main.overview._swipeTracker._touchpadGesture.connect('update', SwipeTrackerVertical._updateGesture.bind(Ui.Main.overview._swipeTracker));
        }
    }

    _setHorizontal() {
        // original swipeTrackers' orientation and updateGesture function
        Ui.Main.overview._swipeTracker.orientation = Gi.Clutter.Orientation.VERTICAL;
        Ui.Main.wm._workspaceAnimation._swipeTracker.orientation = Gi.Clutter.Orientation.HORIZONTAL;
        Ui.Main.overview._swipeTracker._updateGesture = Ui.SwipeTracker.SwipeTracker.prototype._updateGesture;
        if (this._vwGestureUpdateId) {
            Ui.Main.overview._swipeTracker._touchpadGesture.disconnect(this._vwGestureUpdateId);
            this._vwGestureUpdateId = 0;
        }
        if (this._originalGestureUpdateId) {
            Ui.Main.overview._swipeTracker._touchpadGesture.unblock_signal_handler(this._originalGestureUpdateId);
            this._originalGestureUpdateId = 0;
        }
    }
};

const SwipeTrackerVertical = {
    _updateGesture(gesture, time, delta, distance) {
        if (this._state !== 1) // State.SCROLLING)
            return;

        if ((this._allowedModes & Ui.Main.actionMode) === 0 || !this.enabled) {
            this._interrupt();
            return;
        }

        if (opt.WS_TMB_RIGHT)
            delta = -delta;
        this._progress += delta / distance;
        this._history.append(time, delta);

        this._progress = Math.clamp(this._progress, ...this._getBounds(this._initialProgress));
        this.emit('update', this._progress);
    },
};
