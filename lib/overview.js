/**
 * V-Shell (Vertical Workspaces)
 * overview.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2025
 * @license    GPL-3.0
 *
 */

'use strict';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Overview from 'resource:///org/gnome/shell/ui/overview.js';
import * as OverviewControls from 'resource:///org/gnome/shell/ui/overviewControls.js';

let Me;
let opt;

export const OverviewModule = class {
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
        this.moduleEnabled = true;
        const conflict = false;

        reset = reset || !this.moduleEnabled || conflict;

        // don't touch the original code if module disabled
        if (reset && !this._firstActivation) {
            this._disableModule();
        } else if (!reset) {
            this._firstActivation = false;
            this._activateModule();
        }
        if (reset && this._firstActivation)
            console.debug('  OverviewModule - Keeping untouched');
    }

    _activateModule() {
        if (!this._overrides)
            this._overrides = new Me.Util.Overrides();

        this._overrides.addOverride('Overview', Overview.Overview.prototype, OverviewCommon);
        console.debug('  OverviewModule - Activated');
    }

    _disableModule() {
        if (this._overrides)
            this._overrides.removeAll();
        this._overrides = null;

        console.debug('  OverviewModule - Disabled');
    }
};

const OverviewCommon = {
    show(state = OverviewControls.ControlsState.WINDOW_PICKER, customOverviewMode) {
        if (!customOverviewMode)
            this.resetOverviewMode();

        if (state === OverviewControls.ControlsState.HIDDEN)
            throw new Error('Invalid state, use hide() to hide');

        if (this.isDummy)
            return;
        if (this._shown)
            return;
        this._shown = true;

        if (!this._syncGrab())
            return;

        Main.layoutManager.showOverview();
        this._animateVisible(state);
    },

    toggle(customOverviewMode) {
        if (this.isDummy)
            return;

        if (this._visible)
            this.hide();
        else
            this.show(OverviewControls.ControlsState.WINDOW_PICKER, customOverviewMode);
    },

    resetOverviewMode() {
        // reset Overview Mode do default
        opt.OVERVIEW_MODE = opt.get('overviewMode');
        opt.OVERVIEW_MODE2 = opt.OVERVIEW_MODE === 2;
        opt.WORKSPACE_MODE = opt.OVERVIEW_MODE > 0 ? 0 : 1;
    },

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
        if (opt.OVERVIEW_SELECT_WINDOW && controls._stateAdjustment.value <= 1 && !controls._searchController.searchActive)
            Me.Util.activateKeyboardForWorkspaceView();
    },

    after__hideDone() {
        this.resetOverviewMode();
        Me.opt._activeMonitor = undefined;

        if (!opt.FIX_NEW_WINDOW_FOCUS)
            return;

        // Workaround - should probably be fixed elsewhere in the upstream code
        // If a new window is opened from the overview
        // and is realized before the overview animation is complete,
        // the new window will not get focus
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

