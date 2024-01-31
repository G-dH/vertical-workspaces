/**
 * Vertical Workspaces
 * recentFilesSearchProvider.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2024
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
const ID = 'recent-files';

export const RecentFilesSearchProviderModule = class {
    // export for other modules
    static _PREFIX = PREFIX;
    constructor(me) {
        Me = me;
        opt = Me.opt;
        _  = Me.gettext;

        this._firstActivation = true;
        this.moduleEnabled = false;
        this._recentFilesSearchProvider = null;
        this._enableTimeoutId = 0;
    }

    cleanGlobals() {
        Me = null;
        opt = null;
        _ = null;
    }

    update(reset) {
        this.moduleEnabled = opt.get('recentFilesSearchProviderModule');

        reset = reset || !this.moduleEnabled;

        if (reset && !this._firstActivation) {
            this._disableModule();
        } else if (!reset) {
            this._firstActivation = false;
            this._activateModule();
        }
        if (reset && this._firstActivation)
            console.debug('  RecentFilesSearchProviderModule - Keeping untouched');
    }

    _activateModule() {
        // delay because Fedora had problem to register a new provider soon after Shell restarts
        this._enableTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            2000,
            () => {
                if (!this._recentFilesSearchProvider) {
                    this._recentFilesSearchProvider = new RecentFilesSearchProvider();
                    this._getOverviewSearchResult()._registerProvider(this._recentFilesSearchProvider);
                }
                this._enableTimeoutId = 0;
                return GLib.SOURCE_REMOVE;
            }
        );

        console.debug('  RecentFilesSearchProviderModule - Activated');
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

        console.debug('  RecentFilesSearchProviderModule - Disabled');
    }

    _getOverviewSearchResult() {
        return Main.overview._overview.controls._searchController._searchResults;
    }
};

class RecentFilesSearchProvider {
    constructor() {
        this.id = ID;
        const appId = 'org.gnome.Nautilus.desktop';

        // A real appInfo created from a commandline has often issues with overriding get_id() method, so we use dict instead
        this.appInfo = {
            get_id: () => appId,
            get_name: () => _('Recent Files'),
            get_icon: () => Gio.icon_new_for_string('focus-windows-symbolic'),
            should_show: () => true,
            get_commandline: () => '/usr/bin/nautilus -w recent:///',
            launch: () => {},
        };

        this.canLaunchSearch = true;
        this.isRemoteProvider = false;

        this._recentFilesManager = new RecentFilesManager();
    }

    getInitialResultSet(terms/* , cancellable*/) {
        const rfm = this._recentFilesManager;
        rfm.loadFromFile();

        const uris = rfm.getUris();
        const dict = {};
        for (let uri of uris) {
            dict[uri] = {};
            dict[uri]['uri'] = uri;
            dict[uri]['path'] = rfm.getPath(uri);
            dict[uri]['filename'] = rfm.getDisplayName(uri);
            dict[uri]['dir'] = rfm.getDirPath(uri);
            dict[uri]['age'] = rfm.getAge(uri);
            dict[uri]['appInfo'] = rfm.getDefaultAppAppInfo(uri);
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

        const term = _terms.join(' ');

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
            'createIcon': size =>
                this._recentFilesManager.getDefaultAppIcon(resultId, size),
        };
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
            // update recent list after successful activation
            this._recentFilesManager.updateAdded(resultId);
            this._recentFilesManager.saveToFile();
        } else {
            this.appInfo.launch_uris([uri], context);
        }
    }

    filterResults(results /* , maxResults*/) {
        // return results.slice(0, maxResults);
        return results.slice(0, 20);
    }

    getSubsearchResultSet(previousResults, terms/* , cancellable*/) {
        return this.getInitialResultSet(terms);
    }
}

class RecentFilesManager {
    constructor(path)  {
        path = path ?? GLib.build_filenamev([GLib.get_user_data_dir(), 'recently-used.xbel']);
        this._recentlyUsedPath = path;
        this._bookmarks = new GLib.BookmarkFile();
    }

    loadFromFile() {
        try {
            this._bookmarks.load_from_file(this._recentlyUsedPath);
        } catch (e) {
            if (!e.matches(GLib.BookmarkFileError, GLib.BookmarkFileError.FILE_NOT_FOUND))
                console.error(`Could not open recent files: ${e.message}`);
        }
    }

    saveToFile() {
        try {
            this._bookmarks.to_file(this._recentlyUsedPath);
        } catch (e) {
            if (!e.matches(GLib.BookmarkFileError, GLib.BookmarkFileError.FILE_NOT_FOUND))
                console.error(`Could not open recent files to save data: ${e.message}`);
        }
    }

    getUris() {
        return this._bookmarks.get_uris();
    }

    getPath(uri) {
        // GLib.filename_from_uri() removes uri schema and converts string to utf-8
        return GLib.filename_from_uri(uri)[0]; // result is array
    }

    getDisplayName(uri) {
        const path = this.getPath(uri);
        return GLib.filename_display_basename(path);
    }

    getDirPath(uri) {
        const path = this.getPath(uri);
        const filename = this.getDisplayName(uri);
        return path.replace(`${filename}`, '');
    }

    getMimeType(uri) {
        return this._bookmarks.get_mime_type(uri);
    }

    getAdded(uri) {
        return this._bookmarks.get_added(uri);
    }

    updateAdded(uri) {
        this._bookmarks.set_added_date_time(uri, GLib.DateTime.new_now_local());
    }

    // age in days (float)
    getAge(uri) {
        return (Date.now() / 1000 - this._bookmarks.get_added(uri)) / 60 / 60 / 24;
    }

    getDefaultAppAppInfo(uri) {
        const mimeType = this.getMimeType(uri);
        return Gio.AppInfo.get_default_for_type(mimeType, false);
    }

    getDefaultAppIcon(uri, size) {
        let icon, gicon;

        const appInfo = this.getDefaultAppAppInfo(uri);
        if (appInfo)
            gicon = appInfo.get_icon();

        if (gicon)
            icon = new St.Icon({ gicon, icon_size: size });
        else
            icon = new St.Icon({ icon_name: 'icon-missing', icon_size: size });

        return icon;
    }
}
