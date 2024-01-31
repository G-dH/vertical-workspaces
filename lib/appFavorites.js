/**
 * V-Shell (Vertical Workspaces)
 * appFavorites.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2024
 * @license    GPL-3.0
 *
 */

'use strict';

const AppFavorites = imports.ui.appFavorites;

let Me;
let opt;

var AppFavoritesModule = class {
    constructor(me) {
        Me = me;
        opt = Me.opt;

        this._firstActivation = true;
        this.moduleEnabled = false;
        this._overrides = null;
    }

    cleanGlobals() {
        Me = null;
        opt = null;
    }

    update(reset) {
        this.moduleEnabled = opt.get('appFavoritesModule');

        // if notifications are enabled no override is needed
        reset = reset || !this.moduleEnabled || opt.SHOW_FAV_NOTIFICATION;

        // don't touch original code if module disabled
        if (reset && !this._firstActivation) {
            this._disableModule();
        } else if (!reset) {
            this._firstActivation = false;
            this._activateModule();
        }
        if (reset && this._firstActivation) {
            this.moduleEnabled = false;
            console.debug('   AppFavoritesModule - Keeping untouched');
        }
    }

    _activateModule() {
        if (!this._overrides)
            this._overrides = new Me.Util.Overrides();

        // use actual instance instead of prototype
        this._overrides.addOverride('AppFavorites', AppFavorites.getAppFavorites(), AppFavoritesCommon);

        console.debug('   AppFavoritesModule - Activated');
    }

    _disableModule() {
        if (this._overrides)
            this._overrides.removeAll();
        this._overrides = null;

        console.debug('   AppFavoritesModule - Deactivated');
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
