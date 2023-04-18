/**
 * V-Shell (Vertical Workspaces)
 * windowSearchProvider.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 -2023
 * @license    GPL-3.0
 */

'use strict';

const { GLib, Gio, Meta, St, Shell } = imports.gi;

const Main = imports.ui.main;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Settings = Me.imports.lib.settings;
const _Util = Me.imports.lib.util;

// gettext
const _ = Settings._;

const shellVersion = Settings.shellVersion;

const ModifierType = imports.gi.Clutter.ModifierType;

let windowSearchProvider;
let _enableTimeoutId = 0;

// prefix helps to eliminate results from other search providers
// so it needs to be something less common
// needs to be accessible from vw module
var prefix = 'wq//';

let opt;

const Action = {
    NONE: 0,
    CLOSE: 1,
    CLOSE_ALL: 2,
    MOVE_TO_WS: 3,
    MOVE_ALL_TO_WS: 4,
};

function getOverviewSearchResult() {
    return Main.overview._overview.controls._searchController._searchResults;
}

function update(reset = false) {
    opt = Me.imports.lib.settings.opt;
    if (!reset && opt.WINDOW_SEARCH_PROVIDER_ENABLED && !windowSearchProvider) {
        enable();
    } else if (reset || !opt.WINDOW_SEARCH_PROVIDER_ENABLED) {
        disable();
        opt = null;
    }
}

function enable() {
    // delay because Fedora had problem to register a new provider soon after Shell restarts
    _enableTimeoutId = GLib.timeout_add(
        GLib.PRIORITY_DEFAULT,
        2000,
        () => {
            if (!windowSearchProvider) {
                windowSearchProvider = new WindowSearchProvider(opt);
                getOverviewSearchResult()._registerProvider(
                    windowSearchProvider
                );
            }
            _enableTimeoutId = 0;
            return GLib.SOURCE_REMOVE;
        }
    );
}

function disable() {
    if (windowSearchProvider) {
        getOverviewSearchResult()._unregisterProvider(
            windowSearchProvider
        );
        windowSearchProvider = null;
    }
    if (_enableTimeoutId) {
        GLib.source_remove(_enableTimeoutId);
        _enableTimeoutId = 0;
    }
}

function makeResult(window, i) {
    const app = Shell.WindowTracker.get_default().get_window_app(window);
    const appName = app ? app.get_name() : 'Unknown';
    const windowTitle = window.get_title();
    const wsIndex = window.get_workspace().index();

    return {
        'id': i,
        // convert all accented chars to their basic form and lower case for search
        'name': `${wsIndex + 1}: ${windowTitle} ${appName}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(),
        appName,
        windowTitle,
        window,
    };
}

const closeSelectedRegex = /^\/x!$/;
const closeAllResultsRegex = /^\/xa!$/;
const moveToWsRegex = /^\/m[0-9]+$/;
const moveAllToWsRegex = /^\/ma[0-9]+$/;

const WindowSearchProvider = class WindowSearchProvider {
    constructor() {
        this.id = `open-windows@${Me.metadata.uuid}`;
        this.appInfo = Gio.AppInfo.create_from_commandline('true', _('Open Windows'), null);
        this.appInfo.get_description = () => _('List of open windows');
        this.appInfo.get_name = () => _('Open Windows');
        this.appInfo.get_id = () => this.id;
        this.appInfo.get_icon = () => Gio.icon_new_for_string('focus-windows-symbolic');
        this.appInfo.should_show = () => true;

        this.canLaunchSearch = true;
        this.isRemoteProvider = false;

        this.action = 0;
    }

    _getResultSet(terms) {
        // do not modify original terms
        let termsCopy = [...terms];
        // search for terms without prefix
        termsCopy[0] = termsCopy[0].replace(prefix, '');

        /* if (gOptions.get('searchWindowsCommands')) {
            this.action = 0;
            this.targetWs = 0;

            const lastTerm = terms[terms.length - 1];
            if (lastTerm.match(closeSelectedRegex)) {
                this.action = Action.CLOSE;
            } else if (lastTerm.match(closeAllResultsRegex)) {
                this.action = Action.CLOSE_ALL;
            } else if (lastTerm.match(moveToWsRegex)) {
                this.action = Action.MOVE_TO_WS;
            } else if (lastTerm.match(moveAllToWsRegex)) {
                this.action = Action.MOVE_ALL_TO_WS;
            }
            if (this.action) {
                terms.pop();
                if (this.action === Action.MOVE_TO_WS || this.action === Action.MOVE_ALL_TO_WS) {
                    this.targetWs = parseInt(lastTerm.replace(/^[^0-9]+/, '')) - 1;
                }
            } else if (lastTerm.startsWith('/')) {
                terms.pop();
            }
        }*/

        const candidates = this.windows;
        const _terms = [].concat(termsCopy);
        // let match;

        const term = _terms.join(' ');
        /* match = s => {
            return fuzzyMatch(term, s);
        }; */

        const results = [];
        let m;
        for (let key in candidates) {
            if (opt.SEARCH_FUZZY)
                m = _Util.fuzzyMatch(term, candidates[key].name);
            else
                m = _Util.strictMatch(term, candidates[key].name);

            if (m !== -1)
                results.push({ weight: m, id: key });
        }

        results.sort((a, b) => a.weight > b.weight);
        const currentWs = global.workspace_manager.get_active_workspace_index();
        // prefer current workspace
        switch (opt.WINDOW_SEARCH_ORDER) {
        case 1: // MRU - current ws first
            results.sort((a, b) => (this.windows[a.id].window.get_workspace().index() !== currentWs) && (this.windows[b.id].window.get_workspace().index() === currentWs));
            break;
        case 2: // MRU - by workspace
            results.sort((a, b) => this.windows[a.id].window.get_workspace().index() > this.windows[b.id].window.get_workspace().index());
            break;
        case 3: // Stable sequence - by workspace
            results.sort((a, b) => this.windows[a.id].window.get_stable_sequence() > this.windows[b.id].window.get_stable_sequence());
            results.sort((a, b) => this.windows[a.id].window.get_workspace().index() > this.windows[b.id].window.get_workspace().index());
            break;
        }

        results.sort((a, b) => (_terms !== ' ') && (a.weight > 0 && b.weight === 0));

        this.resultIds = results.map(item => item.id);
        return this.resultIds;
    }

    getResultMetas(resultIds, callback = null) {
        const metas = resultIds.map(id => this.getResultMeta(id));
        if (shellVersion >= 43)
            return new Promise(resolve => resolve(metas));
        else
            callback(metas);
        return null;
    }

    getResultMeta(resultId) {
        const result = this.windows[resultId];
        const wsIndex = result.window.get_workspace().index();
        const app = Shell.WindowTracker.get_default().get_window_app(result.window);
        return {
            'id': resultId,
            'name': `${wsIndex + 1}: ${result.windowTitle}`,
            'description': result.appName,
            'createIcon': size => {
                return app
                    ? app.create_icon_texture(size)
                    : new St.Icon({ icon_name: 'icon-missing', icon_size: size });
            },
        };
    }

    launchSearch(/* terms, timeStamp*/) {
    }

    activateResult(resultId/* , terms, timeStamp*/) {
        const isCtrlPressed = _Util.isCtrlPressed();
        const isShiftPressed = _Util.isShiftPressed();

        this.action = 0;
        this.targetWs = 0;

        this.targetWs = global.workspaceManager.get_active_workspace().index() + 1;
        if (isShiftPressed && !isCtrlPressed)
            this.action = Action.MOVE_TO_WS;
        else if (isShiftPressed && isCtrlPressed)
            this.action = Action.MOVE_ALL_TO_WS;


        if (!this.action) {
            const result = this.windows[resultId];
            Main.activateWindow(result.window);
            return;
        }

        switch (this.action) {
        case Action.CLOSE:
            this._closeWindows([resultId]);
            break;
        case Action.CLOSE_ALL:
            this._closeWindows(this.resultIds);
            break;
        case Action.MOVE_TO_WS:
            this._moveWindowsToWs(resultId, [resultId]);
            break;
        case Action.MOVE_ALL_TO_WS:
            this._moveWindowsToWs(resultId, this.resultIds);
            break;
        }
    }

    _closeWindows(ids) {
        let time = global.get_current_time();
        for (let i = 0; i < ids.length; i++)
            this.windows[ids[i]].window.delete(time + i);

        Main.notify('Window Search Provider', `Closed ${ids.length} windows.`);
    }

    _moveWindowsToWs(selectedId, resultIds) {
        const workspace = global.workspaceManager.get_active_workspace();

        for (let i = 0; i < resultIds.length; i++)
            this.windows[resultIds[i]].window.change_workspace(workspace);

        const selectedWin = this.windows[selectedId].window;
        selectedWin.activate_with_workspace(global.get_current_time(), workspace);
    }

    getInitialResultSet(terms, callback/* , cancellable = null*/) {
        // In GS 43 callback arg has been removed
        /* if (shellVersion >= 43)
            cancellable = callback;*/

        let windows;
        this.windows = windows = {};
        global.display.get_tab_list(Meta.TabList.NORMAL, null).filter(w => w.get_workspace() !== null).map(
            (v, i) => {
                windows[`${i}-${v.get_id()}`] = makeResult(v, `${i}-${v.get_id()}`);
                return windows[`${i}-${v.get_id()}`];
            }
        );

        if (shellVersion >= 43)
            return new Promise(resolve => resolve(this._getResultSet(terms)));
        else
            callback(this._getResultSet(terms));

        return null;
    }

    filterResults(results /* , maxResults*/) {
        // return results.slice(0, maxResults);
        return results;
    }

    getSubsearchResultSet(previousResults, terms, callback) {
        if (shellVersion < 43) {
            this.getSubsearchResultSet42(terms, callback);
            return null;
        }
        return this.getInitialResultSet(terms);
    }

    getSubsearchResultSet42(terms, callback) {
        callback(this._getResultSet(terms));
    }
};
