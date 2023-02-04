/**
 * Vertical Workspaces
 * swipeTracker.js
 * 
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2023
 * @license    GPL-3.0
 *
 */

'use strict';

const { Clutter, GObject } = imports.gi;
const Main = imports.ui.main;
const SwipeTracker = imports.ui.swipeTracker;

const Me = imports.misc.extensionUtils.getCurrentExtension();
let opt;

let _vwGestureUpdateId;
let _originalGestureUpdateId;

function update(reset = false) {
    opt = Me.imports.settings.opt;

    if (reset || !opt.ORIENTATION) { // 1-VERTICAL, 0-HORIZONTAL
        // original swipeTrackers' orientation and updateGesture function
        Main.overview._swipeTracker.orientation = Clutter.Orientation.VERTICAL;
        Main.wm._workspaceAnimation._swipeTracker.orientation = Clutter.Orientation.HORIZONTAL;
        Main.overview._swipeTracker._updateGesture = SwipeTracker.SwipeTracker.prototype._updateGesture;
        if (_vwGestureUpdateId) {
            Main.overview._swipeTracker._touchpadGesture.disconnect(_vwGestureUpdateId);
            _vwGestureUpdateId = 0;
        }
        if (_originalGestureUpdateId) {
            Main.overview._swipeTracker._touchpadGesture.unblock_signal_handler(_originalGestureUpdateId);
            _originalGestureUpdateId = 0;
        }

        opt = null;
        return;
    }

    if (opt.ORIENTATION) { // 1-VERTICAL, 0-HORIZONTAL
        // reverse swipe gestures for enter/leave overview and ws switching
        Main.overview._swipeTracker.orientation = Clutter.Orientation.HORIZONTAL;
        Main.wm._workspaceAnimation._swipeTracker.orientation = Clutter.Orientation.VERTICAL;
        // overview's updateGesture() function should reflect ws tmb position to match appGrid/ws animation direction
        // function in connection cannot be overridden in prototype of its class because connected is actually another copy of the original function
        if (!_originalGestureUpdateId) {
            _originalGestureUpdateId = GObject.signal_handler_find(Main.overview._swipeTracker._touchpadGesture, { signalId: 'update' });
            Main.overview._swipeTracker._touchpadGesture.block_signal_handler(_originalGestureUpdateId);
            Main.overview._swipeTracker._updateGesture = SwipeTrackerVertical._updateGesture;
            _vwGestureUpdateId = Main.overview._swipeTracker._touchpadGesture.connect('update', SwipeTrackerVertical._updateGesture.bind(Main.overview._swipeTracker));
        }
    }
}

//---- SwipeTracker -----------------------------------------------------------------------------------
// switch overview's state gesture direction
var SwipeTrackerVertical = {
    _updateGesture: function(gesture, time, delta, distance) {
        if (this._state !== 1) //State.SCROLLING)
            return;

        if ((this._allowedModes & Main.actionMode) === 0 || !this.enabled) {
            this._interrupt();
            return;
        }

        if (opt.WS_TMB_RIGHT)
            delta = -delta;
        this._progress += delta / distance;
        this._history.append(time, delta);

        this._progress = Math.clamp(this._progress, ...this._getBounds(this._initialProgress));
        this.emit('update', this._progress);
    }
}
