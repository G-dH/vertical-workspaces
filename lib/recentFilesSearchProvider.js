/**
 * Vertical Workspaces
 * recentFilesSearchProvider.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2023
 * @license    GPL-3.0
 */

'use strict';

import GLib from 'gi://GLib';
import St from 'gi://St';
import Gio from 'gi://Gio';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

let Me;

let opt;
// gettext
let _;


// prefix helps to eliminate results from other search providers
// so it needs to be something less common
// needs to be accessible from vw module
export const PREFIX = 'fq//';

export const RecentFilesSearchProviderModule = class {
    // export for other modules
    static _PREFIX = PREFIX;
    constructor(me) {
        Me = me;

        _  = Me.gettext;
        opt = Me.opt;
        this._firstActivation = true;
        this._moduleEnabled = false;

        this._recentFilesSearchProvider = null;
        this._enableTimeoutId = 0;
    }

    cleanGlobals() {
        Me = null;
        opt = null;
    }

    update(reset) {
        this._moduleEnabled = opt.get('recentFilesSearchProviderModule');

        reset = reset || !this._moduleEnabled;

        if (reset && !this._firstActivation) {
            this._disableModule();
        } else if (!reset) {
            this._firstActivation = false;
            this._activateModule();
        }
    }

    _activateModule() {
        // delay because Fedora had problem to register a new provider soon after Shell restarts
        this._enableTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            2000,
            () => {
                if (!this._recentFilesSearchProvider) {
                    this._recentFilesSearchProvider = new RecentFilesSearchProvider(opt);
                    this._getOverviewSearchResult()._registerProvider(this._recentFilesSearchProvider);
                }
                this._enableTimeoutId = 0;
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _disableModule() {
        if (this._recentFilesSearchProvider) {
            this._getOverviewSearchResult()._unregisterProvider(this._recentFilesSearchProvider);
            this._recentFilesSearchProvider = null;
        }
        if (this._enableTimeoutId) {
            GLib.source_remove(this._enableTimeoutId);
            this._enableTimeoutId = 0;
        }


    }

    _getOverviewSearchResult() {
        return Main.overview._overview.controls._searchController._searchResults;
    }
};

/* const closeSelectedRegex = /^\/x!$/;
const closeAllResultsRegex = /^\/xa!$/;
const moveToWsRegex = /^\/m[0-9]+$/;
const moveAllToWsRegex = /^\/ma[0-9]+$/;*/

const RecentFilesSearchProvider = class RecentFilesSearchProvider {
    constructor() {
        this.id = 'recent-files';
        const appInfo = Gio.AppInfo.create_from_commandline('/usr/bin/nautilus -w', _('Recent Files'), null);
        appInfo.get_description = () => _('Search recent files');
        appInfo.get_name = () => _('Recent Files');
        appInfo.get_id = () => 'org.gnome.Nautilus.desktop';
        appInfo.get_icon = () => Gio.icon_new_for_string('document-open-recent-symbolic');
        appInfo.should_show = () => true;

        this.appInfo = appInfo;
        this.canLaunchSearch = true;
        this.isRemoteProvider = false;

        this._recentFile = GLib.build_filenamev([GLib.get_user_data_dir(), 'recently-used.xbel']);
        this._bookmarks = new GLib.BookmarkFile();
    }

    getInitialResultSet(terms/* , callback*/) {
        try {
            this._bookmarks.load_from_file(this._recentFile);
        } catch (e) {
            if (!e.matches(GLib.BookmarkFileError, GLib.BookmarkFileError.FILE_NOT_FOUND)) {
                log(`Could not open recent files: ${e.message}`);
                return;
            }
        }

        const uris = this._bookmarks.get_uris();

        const dict = {};
        for (let uri of uris) {
            // GLib.filename_from_uri() removes uri schema and converts string to utf-8
            const path = GLib.filename_from_uri(uri)[0]; // result is array
            const filename  = GLib.filename_display_basename(path);
            const dir = path.replace(`${filename}`, '');
            const mimeType = this._bookmarks.get_mime_type(uri);
            const appInfo = Gio.AppInfo.get_default_for_type(mimeType, false);
            const age = (Date.now() / 1000 - this._bookmarks.get_added(uri)) / 60 / 60 / 24;

            dict[uri] = {};
            dict[uri]['uri'] = uri;
            dict[uri]['path'] = path;
            dict[uri]['filename'] = filename;
            dict[uri]['dir'] = dir;
            dict[uri]['age'] = age;
            dict[uri]['appInfo'] = appInfo;
        }
        this.files = dict;

        return new Promise(resolve => resolve(this._getResultSet(terms)));
    }

    _getResultSet(terms) {
        if (!terms[0].startsWith(PREFIX))
            return [];
        // do not modify original terms
        let termsCopy = [...terms];
        // search for terms without prefix
        termsCopy[0] = termsCopy[0].replace(PREFIX, '');

        const candidates = Object.values(this.files);
        const _terms = [].concat(termsCopy);
        // let match;

        const term = _terms.join(' ');
        /* match = s => {
            return fuzzyMatch(term, s);
        }; */

        const results = [];
        let m;
        for (let file of candidates) {
            if (opt.SEARCH_FUZZY)
                m = Me.Util.fuzzyMatch(term, file.filename);
            else
                m = Me.Util.strictMatch(term, file.filename);

            if (m !== -1)
                results.push(file);
        }

        results.sort((a, b) => a.age > b.age);

        const resultIds = results.map(item => item.uri);
        return resultIds;
    }

    getResultMetas(resultIds/* , callback = null*/) {
        const metas = resultIds.map(id => this.getResultMeta(id));
        return new Promise(resolve => resolve(metas));
    }

    getResultMeta(resultId) {
        const result = this.files[resultId];
        return {
            'id': resultId,
            'name': `${Math.floor(result.age)}:  ${result.filename}`,
            'description': `${result.dir}`,
            'createIcon': size => {
                let icon = this.getIcon(result, size);
                return icon;
            },
        };
    }

    getIcon(result, size) {
        let icon, gicon;

        const appInfo = result.appInfo;
        if (appInfo)
            gicon = appInfo.get_icon();

        if (gicon)
            icon = new St.Icon({ gicon, icon_size: size });
        else
            icon = new St.Icon({ icon_name: 'icon-missing', icon_size: size });

        return icon;
    }

    launchSearch(terms, timeStamp) {
        const appInfo = Gio.AppInfo.create_from_commandline('/usr/bin/nautilus -w recent:///', 'Nautilus', null);
        appInfo.launch([], global.create_app_launch_context(timeStamp, -1));

        // unlike on 42, on 44 if a window with the same uri is already open it will not get focus/activation
        // Gio.app_info_launch_default_for_uri('recent:///', global.create_app_launch_context(timeStamp, -1));

        // following solution for some reason ignores the recent:/// uri
        // this.appInfo.launch_uris(['recent:///'], global.create_app_launch_context(timeStamp, -1));
    }

    activateResult(resultId, terms, timeStamp) {
        const uri = resultId;
        const context = global.create_app_launch_context(timeStamp, -1);
        if (Me.Util.isShiftPressed()) {
            Main.overview.toggle();
            this.appInfo.launch_uris([uri], context);
        } else if (Gio.app_info_launch_default_for_uri(uri, context)) {
            // update recent list after (hopefully) successful activation
            this._bookmarks.set_added_date_time(resultId, GLib.DateTime.new_now_local());
            try {
                this._bookmarks.to_file(this._recentFile);
            } catch (e) {
                if (!e.matches(GLib.BookmarkFileError, GLib.BookmarkFileError.FILE_NOT_FOUND))
                    log(`Could not open recent files: ${e.message}`);
            }
        } else {
            this.appInfo.launch_uris([uri], context);
        }
    }

    filterResults(results /* , maxResults*/) {
        // return results.slice(0, maxResults);
        return results.slice(0, 20);
    }

    getSubsearchResultSet(previousResults, terms/* , callback*/) {
        return this.getInitialResultSet(terms);
    }

    getSubsearchResultSet42(terms, callback) {
        callback(this._getResultSet(terms));
    }
};
