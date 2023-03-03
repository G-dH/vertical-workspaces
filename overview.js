/**
 * V-Shell (Vertical Workspaces)
 * overview.js
 *
 * panel barrier should follow panel position
 * or disable it to not collide with Custom Hot Corners barriers
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2023
 * @license    GPL-3.0
 *
 */

'use strict';

const Overview = imports.ui.overview;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const _Util = Me.imports.util;

let _overrides;
let opt;

function update(reset = false) {
    if (_overrides)
        _overrides.removeAll();


    if (reset) {
        _overrides = null;
        opt = null;
        return;
    }

    opt = Me.imports.settings.opt;
    _overrides = new _Util.Overrides();

    _overrides.addOverride('Overview', Overview.Overview.prototype, OverviewCommon);
}

const OverviewCommon = {
    _showDone() {
        this._animationInProgress = false;
        this._coverPane.hide();

        this.emit('shown');
        // Handle any calls to hide* while we were showing
        if (!this._shown)
            this._animateNotVisible();

        this._syncGrab();

        // if user activates overview during startup animation, transition needs to be shifted to the state 2 here
        const controls = this._overview._controls;
        if (controls._searchController._searchActive && controls._stateAdjustment.value === 1) {
            if (opt.SEARCH_VIEW_ANIMATION)
                controls._onSearchChanged();
            else
                controls._stateAdjustment.value = 2;
        }
    },
};
