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

const { Clutter } = imports.gi;
const Main = imports.ui.main;
const OsdWindow = imports.ui.osdWindow;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const _Util = Me.imports.lib.util;

const OsdPositions = {
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

let _overrides;
let opt;
let _firstRun = true;

function update(reset = false) {
    opt = Me.imports.lib.settings.opt;
    const moduleEnabled = opt.get('osdWindowModule', true);
    reset = reset || !moduleEnabled;

    // don't even touch this module if disabled
    if (_firstRun && reset)
        return;

    _firstRun = false;

    if (_overrides)
        _overrides.removeAll();

    if (reset || !moduleEnabled) {
        updateExistingOsdWindows(6);
        _overrides = null;
        opt = null;
        return;
    }

    _overrides = new _Util.Overrides();
    _overrides.addOverride('osdWindow', OsdWindow.OsdWindow.prototype, OsdWindowCommon);
}

function updateExistingOsdWindows(position) {
    position = position ? position : opt.OSD_POSITION;
    Main.osdWindowManager._osdWindows.forEach(osd => {
        osd.set(OsdPositions[position]);
    });
}

const OsdWindowCommon = {
    after_show() {
        if (!opt.OSD_POSITION)
            this.opacity = 0;
        this.set(OsdPositions[opt.OSD_POSITION]);
    },
};
