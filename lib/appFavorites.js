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

const Shell = imports.gi.Shell;
const AppFavorites = imports.ui.appFavorites;
const Main = imports.ui.main;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Settings = Me.imports.lib.settings;
const _Util = Me.imports.lib.util;

let opt;

var AppFavoritesModule = class {
    constructor() {
        opt = Settings.opt;
        this._firstActivation = true;
        this._moduleEnabled = false;
        this._overrides = null;

        // AppFavorites.AppFavorites is const, first access returns undefined
        this._dummy = AppFavorites.AppFavorites;
        delete this._dummy;
    }

    update(reset) {
        this._moduleEnabled = opt.get('appFavoritesModule', true);

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
            this._overrides = new _Util.Overrides();

        this._overrides.addOverride('AppFavorites', AppFavorites.AppFavorites.prototype, AppFavoritesCommon);
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
