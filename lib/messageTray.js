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

const { Clutter } = imports.gi;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Main = imports.ui.main;

let opt;
let _firstRun = true;

function update(reset = false) {
    opt = Me.imports.lib.settings.opt;
    const moduleEnabled = opt.get('messageTrayModule', true);
    reset = reset || !moduleEnabled;

    // don't even touch this module if disabled
    if (_firstRun && reset)
        return;

    _firstRun = false;

    if (reset) {
        setNotificationPosition(1);
        opt = null;
        return;
    }

    setNotificationPosition(opt.NOTIFICATION_POSITION);
}

function setNotificationPosition(position) {
    const constraint = Main.messageTray.get_constraints()[0];
    if(opt.SEC_NOTIFICATIONS_SHIFT == true && constraint) {
        print("Moving notf to second : " + opt.MOVE_TO_MONITOR_INDEX);
        print("Primary Index : " + global.display.get_primary_monitor());

        constraint.index = opt.MOVE_TO_MONITOR_INDEX;
        Main.messageTray._constraint = constraint;
        Main.messageTray._constraint.index = opt.MOVE_TO_MONITOR_INDEX;

        print("Moved? : " + Main.messageTray._constraint.index);
    }
    else {
        print("Moving notf to primary : " + global.display.get_primary_monitor());
        constraint.index = global.display.get_primary_monitor();
        Main.messageTray._constraint.index = constraint;
    }

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