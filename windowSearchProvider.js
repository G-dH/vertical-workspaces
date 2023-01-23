/**
 * OFP - Overview Feature Pack
 * WindowSearchProvider
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022
 * @license    GPL-3.0
 */

'use strict';

const { GLib, GObject, Gio, Gtk, Meta, St, Shell } = imports.gi;

const Main = imports.ui.main;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Settings = Me.imports.settings;
const _ = Me.imports.settings._;

const shellVersion = Settings.shellVersion;

const ModifierType = imports.gi.Clutter.ModifierType;

let gOptions;
var windowSearchProvider = null;
let _enableTimeoutId = 0;

var prefix = 'wq//';

const Action = {
    NONE: 0,
    CLOSE: 1,
    CLOSE_ALL: 2,
    MOVE_TO_WS: 3,
    MOVE_ALL_TO_WS: 4
}

function init() {
}

function getOverviewSearchResult() {
        return Main.overview._overview.controls._searchController._searchResults;
}

function enable(options) {
    gOptions = options;
    // delay because Fedora had problem to register a new provider soon after Shell restarts
    _enableTimeoutId = GLib.timeout_add(
        GLib.PRIORITY_DEFAULT,
        2000,
        () => {
            if (windowSearchProvider == null) {
                windowSearchProvider = new WindowSearchProvider();
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
    gOptions = null;
}

function fuzzyMatch(term, text) {
    let pos = -1;
    const matches = [];
    // convert all accented chars to their basic form and to lower case
    const _text = text;//.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const _term =  term.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    // if term matches the substring exactly, gains the highest weight
   if (_text.includes(_term)) {
      return 0;
    }

    for (let i = 0; i < _term.length; i++) {
        let c = _term[i];
        let p;
        if (pos > 0)
            p = _term[i - 1];
        while (true) {
            pos += 1;
            if (pos >= _text.length) {
                return -1;
            }
            if (_text[pos] == c) {
                matches.push(pos);
                break;
            } else if (_text[pos] == p) {
                matches.pop();
                matches.push(pos);
            }
        }
    }

    // add all position to get a weight of the result
    // results closer to the beginning of the text and term characters closer to each other will gain more weight.
    return matches.reduce((r, p) => r + p) - matches.length * matches[0] + matches[0];
}

function strictMatch(term, text) {
    // remove diacritics and accents from letters
    let s = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    let p = term.toLowerCase();
    let ps = p.split(/ +/);

    // allows to use multiple exact patterns separated by a space in arbitrary order
    for (let w of ps) {  // escape regex control chars
        if (!s.match(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))) {
            return -1;
        }
    }
    return 0;
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
      'appName': appName,
      'windowTitle': windowTitle,
      'window': window
    }
}

const closeSelectedRegex = /^\/x!$/;
const closeAllResultsRegex = /^\/xa!$/;
const moveToWsRegex = /^\/m[0-9]+$/;
const moveAllToWsRegex = /^\/ma[0-9]+$/;

var WindowSearchProvider = class WindowSearchProvider {
    constructor() {
        this.appInfo = Gio.AppInfo.create_from_commandline('true', 'Open Windows', null);
        this.appInfo.get_description = () => 'List of open windows';
        this.appInfo.get_name = () => 'Open Windows';
        this.appInfo.get_id = () => Me.metadata.uuid;
        this.appInfo.get_icon = () => Gio.icon_new_for_string('focus-windows-symbolic');
        this.appInfo.should_show = () => true;
        this.id = Me.metadata.uuid;
        this.title = 'Window Search Provider',
        this.canLaunchSearch = true;
        this.isRemoteProvider = false;

        this.action = 0;
        // prefix helps to eliminate results from other search providers so it needs to something unique for other search providers
    }

    _getResultSet (terms) {
        // search for terms without prefix
        terms[0] = terms[0].replace(prefix, '');

        /*if (gOptions.get('searchWindowsCommands')) {
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
        const _terms = [].concat(terms);
        let match;

        const term = _terms.join(' ');
        match = (s) => {
            return fuzzyMatch(term, s);
        }

        const results = [];
        let m;
        for (let key in candidates) {
            if (gOptions.get('searchWindowsFuzzy')) {
                m = fuzzyMatch(term, candidates[key].name);
            } else {
                m = strictMatch(term, candidates[key].name);
            }
            if (m !== -1) {
                results.push({ weight: m, id: key });
            }
        }

        results.sort((a, b) => a.weight > b.weight);
        const currentWs = global.workspace_manager.get_active_workspace_index();
        // prefer current workspace
        results.sort((a, b) => (this.windows[a.id].window.get_workspace().index() !== currentWs) && (this.windows[b.id].window.get_workspace().index() === currentWs));
        results.sort((a, b) => ((_terms != ' ') && (a.weight > 0 && b.weight === 0)));

        this.resultIds = results.map((item) => item.id);
        return this.resultIds;
    }

    getResultMetas (resultIds, callback = null) {
        const metas = resultIds.map((id) => this.getResultMeta(id));
        if (shellVersion >= 43) {
            return new Promise(resolve => resolve(metas));
        } else {
            callback(metas);
        }
    }

    getResultMeta (resultId) {
        const result = this.windows[resultId];
        const wsIndex = result.window.get_workspace().index();
        const app = Shell.WindowTracker.get_default().get_window_app(result.window);
        return {
            'id': resultId,
            'name': `${wsIndex + 1}: ${result.windowTitle}`,
            'description': result.appName,
            'createIcon': (size) => {
                return app
                    ? app.create_icon_texture(size)
                    : new St.Icon({ icon_name: 'icon-missing', icon_size: size });
            }
        }
    }

    launchSearch(terms, timeStamp) {
    }

    activateResult (resultId, terms, timeStamp) {
        const [,,state] = global.get_pointer();

        const isCtrlPressed = (state & ModifierType.CONTROL_MASK) != 0;
        const isShiftPressed = (state & ModifierType.SHIFT_MASK) != 0;

        this.action = 0;
        this.targetWs = 0;

        this.targetWs = global.workspaceManager.get_active_workspace().index() + 1;
        if (isShiftPressed && !isCtrlPressed) {
            this.action = Action.MOVE_TO_WS;
        } else if (isShiftPressed && isCtrlPressed) {
            this.action = Action.MOVE_ALL_TO_WS;
        }

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
        for (let i = 0; i < ids.length; i++) {
            this.windows[ids[i]].window.delete(time + i);
        }
        Main.notify('Window Search Provider', `Closed ${ids.length} windows.`);
    }

    _moveWindowsToWs(selectedId, resultIds) {
        const workspace = global.workspaceManager.get_active_workspace();

        for (let i = 0; i < resultIds.length; i++) {
            this.windows[resultIds[i]].window.change_workspace(workspace);
        }
        const selectedWin = this.windows[selectedId].window;
        selectedWin.activate_with_workspace(global.get_current_time(), workspace);
    }

    getInitialResultSet (terms, callback, cancellable = null) {
        if (shellVersion >=43) {
            cancellable = callback;
        }
        let windows;
        this.windows = windows = {};
        global.display.get_tab_list(Meta.TabList.NORMAL, null).filter(w => w.get_workspace() !== null).map(
            (v, i) => windows[`${i}-${v.get_id()}`] = makeResult(v, `${i}-${v.get_id()}`)
        );



        if (shellVersion >= 43) {
            return new Promise(resolve => resolve(this._getResultSet(terms)));
        } else {
            callback(this._getResultSet(terms));
        }
    }

    filterResults (results, maxResults) {
        //return results.slice(0, maxResults);
        return results;
    }

    getSubsearchResultSet (previousResults, terms, callback, cancellable) {
        // if we return previous results, quick typers get non-actual results
        callback(this._getResultSet(terms));
    }

    createResultOjbect(resultMeta) {
        const app = Shell.WindowTracker.get_default().get_window_app(resultMeta.id);
        return new AppIcon(app);
    }
}
