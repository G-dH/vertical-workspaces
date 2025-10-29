/**
 * V-Shell (Vertical Workspaces)
 * swipeTracker.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2025
 * @license    GPL-3.0
 *
 */

'use strict';

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

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
        if (!this._overrides)
            this._overrides = new Me.Util.Overrides();

        // The updateGesture() method should reflect ws tmb position to match appGrid/ws animation direction.
        // The method connected to the signal cannot be overridden in the class prototype because
        // the connection callback invokes the original function via a stored pointer (reference) rather than by name.
        this._overrides.addOverride('SwipeTracker', Main.overview._swipeTracker, SwipeTrackerCommon);

        if (!this._originalGestureUpdateId) {
            this._originalGestureUpdateId = GObject.signal_handler_find(Main.overview._swipeTracker._touchpadGesture, { signalId: 'update' });
            Main.overview._swipeTracker._touchpadGesture.block_signal_handler(this._originalGestureUpdateId);
            this._vwGestureUpdateId = Main.overview._swipeTracker._touchpadGesture.connect('update', SwipeTrackerCommon._updateGesture.bind(Main.overview._swipeTracker));
        }

        if (opt.ORIENTATION) { // 1-VERTICAL, 0-HORIZONTAL
            this._setVertical();
        } else {
            this._setHorizontal();
        }

        console.debug('  SwipeTrackerModule - Activated');
    }

    _disableModule() {
        if (this._overrides)
            this._overrides.removeAll();
        this._overrides = null;

        if (this._vwGestureUpdateId) {
            Main.overview._swipeTracker._touchpadGesture.disconnect(this._vwGestureUpdateId);
            this._vwGestureUpdateId = 0;
        }
        if (this._originalGestureUpdateId) {
            Main.overview._swipeTracker._touchpadGesture.unblock_signal_handler(this._originalGestureUpdateId);
            this._originalGestureUpdateId = 0;
        }

        this._setHorizontal();

        console.debug('  SwipeTrackerModule - Disabled');
    }

    _setVertical() {
        // reverse swipe gestures for enter/leave overview and ws switching
        Main.overview._swipeTracker.orientation = Clutter.Orientation.HORIZONTAL;
        Main.wm._workspaceAnimation._swipeTracker.orientation = Clutter.Orientation.VERTICAL;
    }

    _setHorizontal() {
        // original swipeTrackers' orientation and updateGesture function
        Main.overview._swipeTracker.orientation = Clutter.Orientation.VERTICAL;
        Main.wm._workspaceAnimation._swipeTracker.orientation = Clutter.Orientation.HORIZONTAL;
    }
};

const SwipeTrackerCommon = {
    _updateGesture(a, b, c, d) {
        // GNOME 49 switched to ClutterPanGesture
        if (c === undefined) {
            // a, b <- delta, distance
            SwipeTrackerCommon._updateGestureCommon.bind(this)(a, b);
        } else {
            // a, b, c, d <- gesture, time, delta, distance
            if ((this._allowedModes & Main.actionMode) === 0 || !this.enabled) {
                this._interrupt();
                return;
            }
            SwipeTrackerCommon._updateGestureCommon.bind(this)(c, d, b);
        }
    },

    _updateGestureCommon(delta, distance, time) {
        if (this._state !== 1) // State.SCROLLING)
            return;

        if (opt.WS_TMB_RIGHT ||
            (this.orientation === Clutter.Orientation.HORIZONTAL &&
            Clutter.get_default_text_direction() === Clutter.TextDirection.RTL)
        )
            delta = -delta;

        // Allow using a gesture to move from the static workspace overview to the window picker
        // Since it's a transition from the state 1 to the state 1,
        // we need to invisibly shift the progress to state 0 and block the OM2 transition animations
        if (opt.OVERVIEW_MODE2 && !opt.WORKSPACE_MODE && this._progress === 1 && delta > 0 && this._initialProgress === 1) {
            Me.run.enableOverviewTransitionAnimations = false;
            opt.WORKSPACE_MODE = 1;
            this._progress = 0;
            this._initialProgress = 0;
            this._cancelProgress = 1;
            this._shiftProgress = true;
        }

        this._progress += delta / distance;
        if (time)
            this._history.append(time, delta);
        this._progress = Math.clamp(this._progress, ...this._getBounds(this._initialProgress));

        this.emit('update', this._progress);
    },

    _getEndProgress(velocity, distance, isTouchpad) {
        const VELOCITY_THRESHOLD_TOUCH = 0.3;
        const VELOCITY_THRESHOLD_TOUCHPAD = 0.6;
        const DECELERATION_TOUCH = 0.998;
        const DECELERATION_TOUCHPAD = 0.997;
        const VELOCITY_CURVE_THRESHOLD = 2;
        const DECELERATION_PARABOLA_MULTIPLIER = 0.35;

        if (this._cancelled)
            return this._cancelProgress;

        const threshold = isTouchpad ? VELOCITY_THRESHOLD_TOUCHPAD : VELOCITY_THRESHOLD_TOUCH;

        if (Math.abs(velocity) < threshold) {
            if (this._shiftProgress && this._progress < 0.5) {
                this._progress += 1;
                opt.WORKSPACE_MODE = 0;
                this._shiftProgress = false;
            }
            return this._snapPoints[this._findClosestPoint(this._progress)];
        }

        const decel = isTouchpad ? DECELERATION_TOUCHPAD : DECELERATION_TOUCH;
        const slope = decel / (1.0 - decel) / 1000.0;

        let pos;
        if (Math.abs(velocity) > VELOCITY_CURVE_THRESHOLD) {
            const c = slope / 2 / DECELERATION_PARABOLA_MULTIPLIER;
            const x = Math.abs(velocity) - VELOCITY_CURVE_THRESHOLD + c;

            pos = slope * VELOCITY_CURVE_THRESHOLD +
                DECELERATION_PARABOLA_MULTIPLIER * x * x -
                DECELERATION_PARABOLA_MULTIPLIER * c * c;
        } else {
            pos = Math.abs(velocity) * slope;
        }

        pos = pos * Math.sign(velocity) + this._progress;
        pos = Math.clamp(pos, ...this._getBounds(this._initialProgress));

        const index = this._findPointForProjection(pos, velocity);

        this._shiftProgress = false;

        return this._snapPoints[index];
    },
};
