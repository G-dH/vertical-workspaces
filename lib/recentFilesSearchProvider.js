/**
* V-Shell (Vertical Workspaces)
 * recentFilesSearchProvider.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2023
 * @license    GPL-3.0
 */

'use strict';

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const RecentManager = imports.gi.Gtk.RecentManager;
const St = imports.gi.St;
const Shell = imports.gi.Shell;

const Main = imports.ui.main;

let Me;
let opt;
// gettext
let _;

// prefix helps to eliminate results from other search providers
// so it needs to be something less common
// needs to be accessible from vw module
const PREFIX = 'fq//';

var RecentFilesSearchProviderModule = class {
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
                    this._recentFilesSearchProvider = new RecentFilesSearchProvider(opt);
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
    }

    getInitialResultSet(terms, callback /* , cancellable = null*/) {
        // In GS 43 callback arg has been removed
        /* if (Me.shellVersion >= 43)
            cancellable = callback; */

        const filesDict = {};
        let files = [];
        if (terms[0].startsWith(PREFIX))
            files = RecentManager.get_default().get_items();

        // Detect whether time stamps are in int, or in GLib.DateTime object
        this._timeNeedsConversion = files[0]?.get_modified().to_unix;

        for (let file of files)
            filesDict[file.get_uri()] = file;

        this.files = filesDict;

        if (Me.shellVersion >= 43)
            return new Promise(resolve => resolve(this._getResultSet(terms)));
        else
            callback(this._getResultSet(terms));

        return null;
    }

    _getResultSet(terms) {
        if (!terms[0].startsWith(PREFIX))
            return [];
        // do not modify original terms
        let termsCopy = [...terms];
        // search for terms without prefix
        termsCopy[0] = termsCopy[0].replace(PREFIX, '');

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
            if (opt.SEARCH_FUZZY)
                m = Me.Util.fuzzyMatch(term, name);
            else
                m = Me.Util.strictMatch(term, name);

            if (m !== -1)
                results.push({ weight: m, id });
        }

        if (this._timeNeedsConversion)
            results.sort((a, b) => this.files[a.id].get_modified().to_unix() < this.files[b.id].get_modified().to_unix());
        else
            results.sort((a, b) => this.files[a.id].get_modified() < this.files[b.id].get_modified());

        this.resultIds = results.map(item => item.id);
        return this.resultIds;
    }

    getResultMetas(resultIds, callback = null) {
        const metas = resultIds.map(id => this.getResultMeta(id));
        if (Me.shellVersion >= 43)
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
        let icon, gicon;

        const appInfo = Gio.AppInfo.get_default_for_type(result.get_mime_type(), false);
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
    }

    activateResult(resultId, terms, timeStamp) {
        const uri = resultId;
        const context = global.create_app_launch_context(timeStamp, -1);
        if (Me.Util.isShiftPressed()) {
            Main.overview.toggle();
            this.appInfo.launch_uris([uri], context);
        } else if (Gio.app_info_launch_default_for_uri(uri, context)) {
            // update recent list after (hopefully) successful activation
            const recentManager = RecentManager.get_default();
            recentManager.add_item(resultId);
        } else {
            this.appInfo.launch_uris([uri], context);
        }
    }

    filterResults(results /* , maxResults*/) {
        // return results.slice(0, maxResults);
        return results.slice(0, 20);
    }

    getSubsearchResultSet(previousResults, terms, callback) {
        if (Me.shellVersion < 43) {
            this.getSubsearchResultSet42(terms, callback);
            return null;
        }
        return this.getInitialResultSet(terms);
    }

    getSubsearchResultSet42(terms, callback) {
        callback(this._getResultSet(terms));
    }
}
