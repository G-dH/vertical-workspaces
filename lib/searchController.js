/**
 * V-Shell (Vertical Workspaces)
 * searchController.js
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

var SearchControllerModule = class {
    constructor(me) {
        Me = me;
        opt = Me.opt;

        this._firstActivation = true;
        this.moduleEnabled = false;
        this._originalOnStageKeyPress = null;
    }

    cleanGlobals() {
        Me = null;
        opt = null;
    }

    update(reset) {
        this.moduleEnabled = opt.get('searchControllerModule');
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
            console.debug('  SearchControllerModule - Keeping untouched');
    }

    _activateModule() {
        if (!this._originalOnStageKeyPress)
            this._originalOnStageKeyPress = Main.overview._overview.controls._searchController._onStageKeyPress;

        Main.overview._overview.controls._searchController._onStageKeyPress = SearchControllerCommon._onStageKeyPress;
        console.debug('  SearchControllerModule - Activated');
    }

    _disableModule() {
        if (this._originalOnStageKeyPress)
            Main.overview._overview.controls._searchController._onStageKeyPress = this._originalOnStageKeyPress;
        this._originalOnStageKeyPress = null;

        console.debug('  SearchControlerModule - Disabled');
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
