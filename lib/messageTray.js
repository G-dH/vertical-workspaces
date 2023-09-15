/**
 * V-Shell (Vertical Workspaces)
 * messageTray.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2023
 * @license    GPL-3.0
 *
 */

'use strict';

let Gi;
let Ui;
let Me;

let opt;

var MessageTrayModule = class {
    constructor(gi, ui, misc, me) {
        Gi = gi;
        Ui = ui;
        Me = me;

        opt = Me.opt;
        this._firstActivation = true;
        this._moduleEnabled = false;
    }

    cleanGlobals() {
        Gi = null;
        Ui = null;
        Me = null;
        opt = null;
    }

    update(reset) {
        this._moduleEnabled = opt.get('messageTrayModule');
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
        this._setNotificationPosition(opt.NOTIFICATION_POSITION);
    }

    _disableModule() {
        this._setNotificationPosition(1);

    }

    _setNotificationPosition(position) {
        switch (position) {
        case 0:
            Ui.Main.messageTray._bannerBin.x_align = Gi.Clutter.ActorAlign.START;
            Ui.Main.messageTray._bannerBin.y_align = Gi.Clutter.ActorAlign.START;
            break;
        case 1:
            Ui.Main.messageTray._bannerBin.x_align = Gi.Clutter.ActorAlign.CENTER;
            Ui.Main.messageTray._bannerBin.y_align = Gi.Clutter.ActorAlign.START;
            break;
        case 2:
            Ui.Main.messageTray._bannerBin.x_align = Gi.Clutter.ActorAlign.END;
            Ui.Main.messageTray._bannerBin.y_align = Gi.Clutter.ActorAlign.START;
            break;
        case 3:
            Ui.Main.messageTray._bannerBin.x_align = Gi.Clutter.ActorAlign.START;
            Ui.Main.messageTray._bannerBin.y_align = Gi.Clutter.ActorAlign.END;
            break;
        case 4:
            Ui.Main.messageTray._bannerBin.x_align = Gi.Clutter.ActorAlign.CENTER;
            Ui.Main.messageTray._bannerBin.y_align = Gi.Clutter.ActorAlign.END;
            break;
        case 5:
            Ui.Main.messageTray._bannerBin.x_align = Gi.Clutter.ActorAlign.END;
            Ui.Main.messageTray._bannerBin.y_align = Gi.Clutter.ActorAlign.END;
            break;
        }
    }
};
