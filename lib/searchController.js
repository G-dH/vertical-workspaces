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
const { Clutter, Gdk } = imports.gi;
const Main = imports.ui.main;

const SearchController = imports.ui.searchController;

const Me = imports.misc.extensionUtils.getCurrentExtension();

let opt;
let _firstRun = true;
let _originalOnStageKeyPress;

function update(reset = false) {
    opt = Me.imports.lib.settings.opt;
    const moduleEnabled = opt.get('searchControllerModule', true);
    reset = reset || !moduleEnabled;
    // don't even touch this module if disabled
    if (_firstRun && reset)
        return;

    _firstRun = false;

    if (reset) {
        if (!_originalOnStageKeyPress)
            Main.overview._overview.controls._searchController._onStageKeyPress = _originalOnStageKeyPress;
        _originalOnStageKeyPress = null;

        opt = null;
        return;
    }

    if (!_originalOnStageKeyPress)
        _originalOnStageKeyPress = Main.overview._overview.controls._searchController._onStageKeyPress;

    Main.overview._overview.controls._searchController._onStageKeyPress = SearchControllerCommon._onStageKeyPress;
}

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
