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

let Gi;
let Ui;
let Me;

let opt;

export const SearchControllerModule = class {
    constructor(gi, ui, misc, me) {
        Gi = gi;
        Ui = ui;
        Me = me;

        opt = Me.Opt;
        this._firstActivation = true;
        this._moduleEnabled = false;
        this._originalOnStageKeyPress = null;
    }

    cleanGlobals() {
        Gi = null;
        Ui = null;
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
            this._originalOnStageKeyPress = Ui.Main.overview._overview.controls._searchController._onStageKeyPress;

        Ui.Main.overview._overview.controls._searchController._onStageKeyPress = SearchControllerCommon._onStageKeyPress;
    }

    _disableModule() {
        if (this._originalOnStageKeyPress)
            Ui.Main.overview._overview.controls._searchController._onStageKeyPress = this._originalOnStageKeyPress;
        this._originalOnStageKeyPress = null;

    }
};

// if opt.ESC_BEHAVIOR > 0 force close the overview
const SearchControllerCommon = {
    _onStageKeyPress(actor, event) {
        // Ignore events while anything but the overview has
        // pushed a modal (system modals, looking glass, ...)
        if (Ui.Main.modalCount > 1)
            return Gi.Clutter.EVENT_PROPAGATE;

        let symbol = event.get_key_symbol();
        if (symbol === Gi.Clutter.KEY_Escape) {
            if (this._searchActive && !opt.ESC_BEHAVIOR) {
                this.reset();
            } else if (this._showAppsButton.checked && !opt.ESC_BEHAVIOR) {
                this._showAppsButton.checked = false;
            } else {
                this.reset();
                Ui.Main.overview.hide();
            }

            return Gi.Clutter.EVENT_STOP;
        } else if (this._shouldTriggerSearch(symbol)) {
            this.startSearch(event);
        }
        return Gi.Clutter.EVENT_PROPAGATE;
    },
};
