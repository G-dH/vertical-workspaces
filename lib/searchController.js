/**
 * V-Shell (Vertical Workspaces)
 * searchController.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2023
 * @license    GPL-3.0
 *
 */

'use strict';

import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

let Me;

let opt;

export const SearchControllerModule = class {
    constructor(me) {
        Me = me;

        opt = Me.opt;
        this._firstActivation = true;
        this._moduleEnabled = false;
        this._originalOnStageKeyPress = null;
    }

    cleanGlobals() {
        Me = null;
        opt = null;
    }

    update(reset) {
        this._moduleEnabled = opt.get('searchControllerModule');
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
        if (!this._originalOnStageKeyPress)
            this._originalOnStageKeyPress = Main.overview._overview.controls._searchController._onStageKeyPress;

        Main.overview._overview.controls._searchController._onStageKeyPress = SearchControllerCommon._onStageKeyPress;
    }

    _disableModule() {
        if (this._originalOnStageKeyPress)
            Main.overview._overview.controls._searchController._onStageKeyPress = this._originalOnStageKeyPress;
        this._originalOnStageKeyPress = null;

    }
};

// if opt.ESC_BEHAVIOR > 0 force close the overview
const SearchControllerCommon = {
    _onStageKeyPress(actor, event) {
        // Ignore events while anything but the overview has
        // pushed a modal (system modals, looking glass, ...)
        if (Main.modalCount > 1)
            return Clutter.EVENT_PROPAGATE;

        let symbol = event.get_key_symbol();
        if (symbol === Clutter.KEY_Escape) {
            if (this._searchActive && !opt.ESC_BEHAVIOR) {
                this.reset();
            } else if (this._showAppsButton.checked && !opt.ESC_BEHAVIOR) {
                this._showAppsButton.checked = false;
            } else {
                this.reset();
                Main.overview.hide();
            }

            return Clutter.EVENT_STOP;
        } else if (this._shouldTriggerSearch(symbol)) {
            this.startSearch(event);
        }
        return Clutter.EVENT_PROPAGATE;
    },
};
