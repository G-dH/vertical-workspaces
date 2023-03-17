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

const { Shell } = imports.gi;
const AppFavorites = imports.ui.appFavorites;
const Main = imports.ui.main;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const _Util = Me.imports.lib.util;

let opt;
let _overrides;
let _firstRun = true;

function update(reset = false) {
    opt = Me.imports.lib.settings.opt;
    const moduleEnabled = opt.get('appFavoritesModule', true);

    // don't even touch this module if disabled
    if (_firstRun && !moduleEnabled)
        return;

    _firstRun = false;

    if (_overrides)
        _overrides.removeAll();


    // if notifications are enabled no override is needed
    if (reset || opt.SHOW_FAV_NOTIFICATION || !moduleEnabled) {
        _overrides = null;
        opt = null;
        return;
    }

    _overrides = new _Util.Overrides();

    // AppFavorites.AppFavorites is const, first access returns undefined
    const dummy = AppFavorites.AppFavorites;
    _overrides.addOverride('AppFavorites', AppFavorites.AppFavorites.prototype, AppFavoritesCommon);
}

const AppFavoritesCommon = {
    addFavoriteAtPos(appId, pos) {
        this._addFavorite(appId, pos);
    },

    removeFavorite(appId) {
        this._removeFavorite(appId);
    },
};
