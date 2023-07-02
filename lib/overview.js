/**
 * V-Shell (Vertical Workspaces)
 * overview.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2023
 * @license    GPL-3.0
 *
 */

'use strict';
const Overview = imports.ui.overview;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const _Util = Me.imports.lib.util;

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

    opt = Me.imports.lib.settings.opt;
    _overrides = new _Util.Overrides();

    _overrides.addOverride('Overview', Overview.Overview.prototype, OverviewCommon);
}

const OverviewCommon = {
    _showDone() {
        this._animationInProgress = false;
        this._coverPane.hide();

        if (_Util.shellVersion < 44)
            this.emit('shown');
        else if (this._shownState !== 'SHOWN')
            this._changeShownState('SHOWN');

        // Handle any calls to hide* while we were showing
        if (!this._shown)
            this._animateNotVisible();

        // if user activates overview during startup animation, transition needs to be shifted to the state 2 here
        const controls = this._overview._controls;
        if (controls._searchController._searchActive && controls._stateAdjustment.value === 1) {
            if (opt.SEARCH_VIEW_ANIMATION)
                controls._onSearchChanged();
            else if (!opt.OVERVIEW_MODE2)
                controls._stateAdjustment.value = 2;
        }

        this._syncGrab();
    },

    // Workaround - should probably be fixed elsewhere in the upstream code
    // If a new window is opened from the overview
    // and is realized before the overview animation is complete,
    // the new window will not get focus
    after__hideDone() {
        if (!opt.FIX_NEW_WINDOW_FOCUS)
            return;

        const workspace = global.workspace_manager.get_active_workspace();
        const recentDesktopWin = global.display.get_tab_list(1, workspace)[0];
        let recentNormalWin = null;
        const tabList = global.display.get_tab_list(0, workspace);

        for (let i = 0; i < tabList.length; i++) {
            if (tabList[i].minimized === false) {
                recentNormalWin = tabList[i];
                break;
            }
        }

        let recentWin = recentNormalWin;
        if (recentNormalWin && recentDesktopWin) {
            recentWin =  recentNormalWin.get_user_time() > recentDesktopWin.get_user_time()
                ? recentNormalWin
                : recentDesktopWin;
        }

        const focusedWin = global.display.focus_window;

        if (recentWin && focusedWin !== recentWin)
            recentWin.activate(global.get_current_time());
    },
};
