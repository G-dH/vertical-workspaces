/**
 * V-Shell (Vertical Workspaces)
 * osdWindow.js
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

let OsdPositions;

export var OsdWindowModule = class {
    constructor(gi, ui, misc, me) {
        Gi = gi;
        Ui = ui;
        Misc = misc;
        Me = me;

        opt = Me.Opt;

        this._firstActivation = true;
        this._moduleEnabled = false;
        this._overrides = null;

        OsdPositions = {
            1: {
                x_align: Gi.Clutter.ActorAlign.START,
                y_align: Gi.Clutter.ActorAlign.START,
            },
            2: {
                x_align: Gi.Clutter.ActorAlign.CENTER,
                y_align: Gi.Clutter.ActorAlign.START,
            },
            3: {
                x_align: Gi.Clutter.ActorAlign.END,
                y_align: Gi.Clutter.ActorAlign.START,
            },
            4: {
                x_align: Gi.Clutter.ActorAlign.CENTER,
                y_align: Gi.Clutter.ActorAlign.CENTER,
            },
            5: {
                x_align: Gi.Clutter.ActorAlign.START,
                y_align: Gi.Clutter.ActorAlign.END,
            },
            6: {
                x_align: Gi.Clutter.ActorAlign.CENTER,
                y_align: Gi.Clutter.ActorAlign.END,
            },
            7: {
                x_align: Gi.Clutter.ActorAlign.END,
                y_align: Gi.Clutter.ActorAlign.END,
            },
        };
    }

    _clearGlobals() {
        Gi = null;
        Ui = null;
        Misc = null;
        Me = null;
        opt = null;
    }

    update(reset) {
        this._moduleEnabled = opt.get('osdWindowModule');
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
        if (!this._overrides)
            this._overrides = new Me.Util.Overrides();

        this._overrides.addOverride('osdWindow', Ui.OsdWindow.OsdWindow.prototype, OsdWindowCommon);
    }

    _disableModule() {
        if (this._overrides)
            this._overrides.removeAll();
        this._overrides = null;
        this._updateExistingOsdWindows(6);
        this._clearGlobals();
    }

    _updateExistingOsdWindows(position) {
        position = position ? position : opt.OSD_POSITION;
        Ui.Main.osdWindowManager._osdWindows.forEach(osd => {
            osd.set(OsdPositions[position]);
        });
    }
};

const OsdWindowCommon = {
    after_show() {
        if (!opt.OSD_POSITION)
            this.opacity = 0;
        this.set(OsdPositions[opt.OSD_POSITION]);
    },
};
