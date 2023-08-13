/**
 * V-Shell (Vertical Workspaces)
 * appFavorites.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2023
 * @license    GPL-3.0
 *
 */

'use strict';

let Ui;
let Me;

let opt;

var AppFavoritesModule = class {
    constructor(gi, ui, misc, me) {
        Ui = ui;
        Me = me;

        opt = Me.Opt;
        this._firstActivation = true;
        this._moduleEnabled = false;
        this._overrides = null;
    }

    cleanGlobals() {
        Ui = null;
        Me = null;
        opt = null;
    }

    update(reset) {
        this._moduleEnabled = opt.get('appFavoritesModule');

        // if notifications are enabled no override is needed
        reset = reset || !this._moduleEnabled || opt.SHOW_FAV_NOTIFICATION;

        // don't touch original code if module disabled
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

        // use actual instance instead of prototype
        this._overrides.addOverride('AppFavorites', Ui.AppFavorites.getAppFavorites(), AppFavoritesCommon);
    }

    _disableModule() {
        if (this._overrides)
            this._overrides.removeAll();
        this._overrides = null;
    }
};

const AppFavoritesCommon = {
    addFavoriteAtPos(appId, pos) {
        this._addFavorite(appId, pos);
    },

    removeFavorite(appId) {
        this._removeFavorite(appId);
    },
};
