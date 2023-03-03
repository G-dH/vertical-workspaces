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
const _Util = Me.imports.util;

let opt;
let _overrides;

function update(reset = false) {
    if (_overrides)
        _overrides.removeAll();

    opt = Me.imports.settings.opt;

    // if notifications are enabled no override is needed
    if (reset || opt.SHOW_FAV_NOTIFICATION) {
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
