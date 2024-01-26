/**
 * V-Shell (Vertical Workspaces)
 * swipeTracker.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2024
 * @license    GPL-3.0
 *
 */

'use strict';

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as SwipeTracker from 'resource:///org/gnome/shell/ui/swipeTracker.js';

let Me;
let opt;

export const SwipeTrackerModule = class {
    constructor(me) {
        Me = me;
        opt = Me.opt;

        this._firstActivation = true;
        this.moduleEnabled = false;
    }

    cleanGlobals() {
        Me = null;
        opt = null;
    }

    update(reset) {
        this.moduleEnabled = opt.get('swipeTrackerModule');
        const conflict = false;

        reset = reset || !this.moduleEnabled || conflict;

        // don't touch the original code if module disabled
        if (reset && !this._firstActivation) {
            this._disableModule();
        } else if (!reset) {
            this._firstActivation = false;
            this._activateModule();
        }
        if (reset && this._firstActivation)
            console.debug('  SwipeTrackerModule - Keeping untouched');
    }

    _activateModule() {
        if (opt.ORIENTATION) { // 1-VERTICAL, 0-HORIZONTAL
            this._setVertical();
        } else {
            this._setHorizontal();
        }
        console.debug('  SwipeTrackerModule - Activated');
    }

    _disableModule() {
        this._setHorizontal();

        console.debug('  SwipeTrackerModule - Disabled');
    }

    _setVertical() {
        // reverse swipe gestures for enter/leave overview and ws switching
        Main.overview._swipeTracker.orientation = Clutter.Orientation.HORIZONTAL;
        Main.wm._workspaceAnimation._swipeTracker.orientation = Clutter.Orientation.VERTICAL;
        // overview's updateGesture() function should reflect ws tmb position to match appGrid/ws animation direction
        // function in connection cannot be overridden in prototype of its class because connected is actually another copy of the original function
        if (!this._originalGestureUpdateId) {
            this._originalGestureUpdateId = GObject.signal_handler_find(Main.overview._swipeTracker._touchpadGesture, { signalId: 'update' });
            Main.overview._swipeTracker._touchpadGesture.block_signal_handler(this._originalGestureUpdateId);
            Main.overview._swipeTracker._updateGesture = SwipeTrackerVertical._updateGesture;
            this._vwGestureUpdateId = Main.overview._swipeTracker._touchpadGesture.connect('update', SwipeTrackerVertical._updateGesture.bind(Main.overview._swipeTracker));
        }
    }

    _setHorizontal() {
        // original swipeTrackers' orientation and updateGesture function
        Main.overview._swipeTracker.orientation = Clutter.Orientation.VERTICAL;
        Main.wm._workspaceAnimation._swipeTracker.orientation = Clutter.Orientation.HORIZONTAL;
        Main.overview._swipeTracker._updateGesture = SwipeTracker.SwipeTracker.prototype._updateGesture;
        if (this._vwGestureUpdateId) {
            Main.overview._swipeTracker._touchpadGesture.disconnect(this._vwGestureUpdateId);
            this._vwGestureUpdateId = 0;
        }
        if (this._originalGestureUpdateId) {
            Main.overview._swipeTracker._touchpadGesture.unblock_signal_handler(this._originalGestureUpdateId);
            this._originalGestureUpdateId = 0;
        }
    }
};

const SwipeTrackerVertical = {
    _updateGesture(gesture, time, delta, distance) {
        if (this._state !== 1) // State.SCROLLING)
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
    },
};
