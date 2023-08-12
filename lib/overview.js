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

let Gi;
let Ui;
let Misc;
let Me;

let opt;

export var OverviewModule = class {
    constructor(gi, ui, misc, me) {
        Gi = gi;
        Ui = ui;
        Misc = misc;
        Me = me;

        opt = Me.Opt;
        this._firstActivation = true;
        this._moduleEnabled = false;
        this._overrides = null;
    }

    _clearGlobals() {
        Gi = null;
        Ui = null;
        Misc = null;
        Me = null;
        opt = null;
    }

    update(reset) {
        this._moduleEnabled = true;
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
        if (!this._overrides)
            this._overrides = new Me.Util.Overrides();

        this._overrides.addOverride('Overview', Ui.Overview.Overview.prototype, OverviewCommon);
    }

    _disableModule() {
        if (this._overrides)
            this._overrides.removeAll();
        this._overrides = null;
        this._clearGlobals();
    }
};

const OverviewCommon = {
    _showDone() {
        this._animationInProgress = false;
        this._coverPane.hide();

        if (this._shownState !== 'SHOWN')
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
