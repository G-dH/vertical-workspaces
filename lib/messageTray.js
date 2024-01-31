/**
 * V-Shell (Vertical Workspaces)
 * messageTray.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2024
 * @license    GPL-3.0
 *
 */

'use strict';

const Clutter = imports.gi.Clutter;

const Main = imports.ui.main;

let Me;
let opt;

var MessageTrayModule = class {
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
        this.moduleEnabled = opt.get('messageTrayModule');
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
            console.debug('  MessageTrayModule - Keeping untouched');
    }

    _activateModule() {
        this._setNotificationPosition(opt.NOTIFICATION_POSITION);

        console.debug('  MessageTrayModule - Activated');
    }

    _disableModule() {
        this._setNotificationPosition(1);

        console.debug('  MessageTrayModule - Disabled');
    }

    _setNotificationPosition(position) {
        switch (position) {
        case 0:
            Main.messageTray._bannerBin.x_align = Clutter.ActorAlign.START;
            Main.messageTray._bannerBin.y_align = Clutter.ActorAlign.START;
            break;
        case 1:
            Main.messageTray._bannerBin.x_align = Clutter.ActorAlign.CENTER;
            Main.messageTray._bannerBin.y_align = Clutter.ActorAlign.START;
            break;
        case 2:
            Main.messageTray._bannerBin.x_align = Clutter.ActorAlign.END;
            Main.messageTray._bannerBin.y_align = Clutter.ActorAlign.START;
            break;
        case 3:
            Main.messageTray._bannerBin.x_align = Clutter.ActorAlign.START;
            Main.messageTray._bannerBin.y_align = Clutter.ActorAlign.END;
            break;
        case 4:
            Main.messageTray._bannerBin.x_align = Clutter.ActorAlign.CENTER;
            Main.messageTray._bannerBin.y_align = Clutter.ActorAlign.END;
            break;
        case 5:
            Main.messageTray._bannerBin.x_align = Clutter.ActorAlign.END;
            Main.messageTray._bannerBin.y_align = Clutter.ActorAlign.END;
            break;
        }
    }
};
