/**
 * Vertical Workspaces
 * recentFilesSearchProvider.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2023
 * @license    GPL-3.0
 */

'use strict';

const { GLib, GObject, Gio, Gtk, Meta, St, Shell } = imports.gi;

const Main = imports.ui.main;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Settings = Me.imports.settings;

// gettext
const _ = Settings._;

const shellVersion = Settings.shellVersion;

const ModifierType = imports.gi.Clutter.ModifierType;

let recentFilesSearchProvider;
let _enableTimeoutId = 0;

// prefix helps to eliminate results from other search providers
// so it needs to be something less common
// needs to be accessible from vw module
var prefix = 'fq//';

var opt;

const Action = {
    NONE: 0,
    CLOSE: 1,
    CLOSE_ALL: 2,
    MOVE_TO_WS: 3,
    MOVE_ALL_TO_WS: 4,
};

function init() {
}

function getOverviewSearchResult() {
    return Main.overview._overview.controls._searchController._searchResults;
}


function update(reset = false) {
    opt = Me.imports.settings.opt;
    if (!reset && opt.RECENT_FILES_SEARCH_PROVIDER_ENABLED && !recentFilesSearchProvider) {
        enable();
    } else if (reset || !opt.RECENT_FILES_SEARCH_PROVIDER_ENABLED) {
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
            if (!recentFilesSearchProvider) {
                recentFilesSearchProvider = new RecentFilesSearchProvider(opt);
                getOverviewSearchResult()._registerProvider(recentFilesSearchProvider);
            }
            _enableTimeoutId = 0;
            return GLib.SOURCE_REMOVE;
        }
    );
}

function disable() {
    if (recentFilesSearchProvider) {
        getOverviewSearchResult()._unregisterProvider(recentFilesSearchProvider);
        recentFilesSearchProvider = null;
    }
    if (_enableTimeoutId) {
        GLib.source_remove(_enableTimeoutId);
        _enableTimeoutId = 0;
    }
}

function fuzzyMatch(term, text) {
    let pos = -1;
    const matches = [];
    // convert all accented chars to their basic form and to lower case
    const _text = text;// .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const _term =  term.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    // if term matches the substring exactly, gains the highest weight
    if (_text.includes(_term))
        return 0;


    for (let i = 0; i < _term.length; i++) {
        let c = _term[i];
        let p;
        if (pos > 0)
            p = _term[i - 1];
        while (true) {
            pos += 1;
            if (pos >= _text.length)
                return -1;

            if (_text[pos] === c) {
                matches.push(pos);
                break;
            } else if (_text[pos] === p) {
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
        if (!s.match(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
            return -1;
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
        appName,
        windowTitle,
        window,
    };
}

const closeSelectedRegex = /^\/x!$/;
const closeAllResultsRegex = /^\/xa!$/;
const moveToWsRegex = /^\/m[0-9]+$/;
const moveAllToWsRegex = /^\/ma[0-9]+$/;

var RecentFilesSearchProvider = class RecentFilesSearchProvider {
    constructor(gOptions) {
        this._gOptions = gOptions;
        this.appInfo = Gio.AppInfo.create_from_commandline('/usr/bin/nautilus -ws recent:///', 'Recent Files', null);
        // this.appInfo = Shell.AppSystem.get_default().lookup_app('org.gnome.Nautilus.desktop').appInfo;
        this.appInfo.get_description = () => _('Search recent files');
        this.appInfo.get_name = () => _('Recent Files');
        this.appInfo.get_id = () => 'org.gnome.Nautilus.desktop';
        this.appInfo.get_icon = () => Gio.icon_new_for_string('document-open-recent-symbolic');
        this.appInfo.should_show = () => true;
        // this.title = _('Recent Files Search Provider'),
        this.canLaunchSearch = true;
        this.isRemoteProvider = false;
    }

    _getResultSet(terms) {
        if (!terms[0].startsWith(prefix))
            return [];
        // do not modify original terms
        let termsCopy = [...terms];
        // search for terms without prefix
        termsCopy[0] = termsCopy[0].replace(prefix, '');

        const candidates = this.files;
        const _terms = [].concat(termsCopy);
        // let match;

        const term = _terms.join(' ');
        /* match = s => {
            return fuzzyMatch(term, s);
        }; */

        const results = [];
        let m;
        for (let id in candidates) {
            const file = this.files[id];
            const name = `${file.get_age()}d: ${file.get_display_name()} ${file.get_uri_display().replace(`/${file.get_display_name()}`, '')}`;
            if (this._gOptions.get('searchFuzzy'))
                m = fuzzyMatch(term, name);
            else
                m = strictMatch(term, name);

            if (m !== -1)
                results.push({ weight: m, id });
        }

        results.sort((a, b) => this.files[a.id].get_visited() < this.files[b.id].get_visited());

        this.resultIds = results.map(item => item.id);
        return this.resultIds;
    }

    getResultMetas(resultIds, callback = null) {
        const metas = resultIds.map(id => this.getResultMeta(id));
        if (shellVersion >= 43)
            return new Promise(resolve => resolve(metas));
        else if (callback)
            callback(metas);
        return null;
    }

    getResultMeta(resultId) {
        const result = this.files[resultId];
        return {
            'id': resultId,
            'name': `${result.get_age()}:  ${result.get_display_name()}`,
            'description': `${result.get_uri_display().replace(`/${result.get_display_name()}`, '')}`,
            'createIcon': size => {
                let icon = this.getIcon(result, size);
                return icon;
            },
        };
    }

    getIcon(result, size) {
        let file = Gio.File.new_for_uri(result.get_uri());
        let info = file.query_info(Gio.FILE_ATTRIBUTE_THUMBNAIL_PATH,
            Gio.FileQueryInfoFlags.NONE, null);
        let path = info.get_attribute_byte_string(
            Gio.FILE_ATTRIBUTE_THUMBNAIL_PATH);

        let icon, gicon;

        if (path) {
            gicon = Gio.FileIcon.new(Gio.File.new_for_path(path));
        } else {
            const appInfo = Gio.AppInfo.get_default_for_type(result.get_mime_type(), false);
            if (appInfo)
                gicon = appInfo.get_icon();
        }

        if (gicon)
            icon = new St.Icon({ gicon, icon_size: size });
        else
            icon = new St.Icon({ icon_name: 'icon-missing', icon_size: size });


        return icon;
    }

    launchSearch(/* terms, timeStamp */) {
        this._openNautilus('recent:///');
    }

    _openNautilus(uri) {
        try {
            GLib.spawn_command_line_async(`nautilus -ws ${uri}`);
        } catch (e) {
            log(e);
        }
    }

    activateResult(resultId /* , terms, timeStamp */) {
        const file = this.files[resultId];

        const [,, state] = global.get_pointer();
        // const isCtrlPressed = (state & ModifierType.CONTROL_MASK) != 0;
        const isShiftPressed = (state & ModifierType.SHIFT_MASK) !== 0;

        if (isShiftPressed) {
            Main.overview.toggle();
            this._openNautilus(file.get_uri());
        } else {
            const appInfo = Gio.AppInfo.get_default_for_type(file.get_mime_type(), false);
            if (!(appInfo && appInfo.launch_uris([file.get_uri()], null)))
                this._openNautilus(file.get_uri());
        }
    }

    getInitialResultSet(terms, callback /* , cancellable = null*/) {
        /* if (shellVersion >= 43)
            cancellable = callback; */

        const filesDict = {};
        const files = Gtk.RecentManager.get_default().get_items().filter(f => f.exists());

        for (let file of files)
            filesDict[file.get_uri()] = file;


        this.files = filesDict;

        if (shellVersion >= 43)
            return new Promise(resolve => resolve(this._getResultSet(terms)));
        else
            callback(this._getResultSet(terms));

        return null;
    }

    filterResults(results, maxResults) {
        return results.slice(0, maxResults);
    }

    getSubsearchResultSet(previousResults, terms, callback /* , cancellable*/) {
        // if we return previous results, quick typers get non-actual results
        callback(this._getResultSet(terms));
    }

    /* createResultObject(resultMeta) {
        return this.files[resultMeta.id];
    }*/
};
