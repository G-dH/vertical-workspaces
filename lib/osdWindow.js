/**
 * V-Shell (Vertical Workspaces)
 * osdWindow.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2024
 * @license    GPL-3.0
 *
 */

'use strict';

const Clutter = imports.gi.Clutter;

const Main = imports.ui.main;
const OsdWindow = imports.ui.osdWindow;

let Me;
let opt;

let OsdPositions;

var OsdWindowModule = class {
    constructor(me) {
        Me = me;
        opt = Me.opt;

        this._firstActivation = true;
        this.moduleEnabled = false;
        this._overrides = null;

        OsdPositions = {
            1: {
                x_align: Clutter.ActorAlign.START,
                y_align: Clutter.ActorAlign.START,
            },
            2: {
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.START,
            },
            3: {
                x_align: Clutter.ActorAlign.END,
                y_align: Clutter.ActorAlign.START,
            },
            4: {
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            },
            5: {
                x_align: Clutter.ActorAlign.START,
                y_align: Clutter.ActorAlign.END,
            },
            6: {
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.END,
            },
            7: {
                x_align: Clutter.ActorAlign.END,
                y_align: Clutter.ActorAlign.END,
            },
        };
    }

    cleanGlobals() {
        Me = null;
        opt = null;
        OsdPositions = null;
    }

    update(reset) {
        this.moduleEnabled = opt.get('osdWindowModule');
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
            console.debug('  OsdWindowModule - Keeping untouched');
    }

    _activateModule() {
        if (!this._overrides)
            this._overrides = new Me.Util.Overrides();

        this._overrides.addOverride('osdWindow', OsdWindow.OsdWindow.prototype, OsdWindowCommon);
        console.debug('  OsdWindowModule - Activated');
    }

    _disableModule() {
        if (this._overrides)
            this._overrides.removeAll();
        this._overrides = null;
        this._updateExistingOsdWindows(6);

        console.debug('  WorkspaceSwitcherPopupModule - Disabled');
    }

    _updateExistingOsdWindows(position) {
        position = position ? position : opt.OSD_POSITION;
        Main.osdWindowManager._osdWindows.forEach(osd => {
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
