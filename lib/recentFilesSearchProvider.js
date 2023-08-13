/**
 * Vertical Workspaces
 * recentFilesSearchProvider.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2023
 * @license    GPL-3.0
 */

'use strict';

let Gi;
let Ui;
let Misc;
let Me;

let opt;
// gettext
let _; // = Settings._;

// const ModifierType = imports.gi.Clutter.ModifierType;

let recentFilesSearchProvider;

// prefix helps to eliminate results from other search providers
// so it needs to be something less common
// needs to be accessible from vw module
export var prefix = 'fq//';

export var RecentFilesSearchProviderModule = class {
    constructor(gi, ui, misc, me) {
        Gi = gi;
        Ui = ui;
        Misc = misc;
        Me = me;

        _  = Me.gettext;
        opt = Me.Opt;
        this._firstActivation = true;
        this._moduleEnabled = false;

        this._recentFilesSearchProvider = null;
        this._enableTimeoutId = 0;
    }

    cleanGlobals() {
        Gi = null;
        Ui = null;
        Misc = null;
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
        this._enableTimeoutId = Gi.GLib.timeout_add(
            Gi.GLib.PRIORITY_DEFAULT,
            2000,
            () => {
                if (!this._recentFilesSearchProvider) {
                    this._recentFilesSearchProvider = new RecentFilesSearchProvider(opt);
                    this._getOverviewSearchResult()._registerProvider(this._recentFilesSearchProvider);
                }
                this._enableTimeoutId = 0;
                return Gi.GLib.SOURCE_REMOVE;
            }
        );
    }

    _disableModule() {
        if (this._recentFilesSearchProvider) {
            this._getOverviewSearchResult()._unregisterProvider(this._recentFilesSearchProvider);
            this._recentFilesSearchProvider = null;
        }
        if (this._enableTimeoutId) {
            Gi.GLib.source_remove(this._enableTimeoutId);
            this._enableTimeoutId = 0;
        }


    }

    _getOverviewSearchResult() {
        return Ui.Main.overview._overview.controls._searchController._searchResults;
    }
};

const closeSelectedRegex = /^\/x!$/;
const closeAllResultsRegex = /^\/xa!$/;
const moveToWsRegex = /^\/m[0-9]+$/;
const moveAllToWsRegex = /^\/ma[0-9]+$/;

const RecentFilesSearchProvider = class RecentFilesSearchProvider {
    constructor() {
        this.id = 'recent-files';
        this.appInfo = Gi.Gio.AppInfo.create_from_commandline('/usr/bin/nautilus -w', _('Recent Files'), null);
        this.appInfo.get_description = () => _('Search recent files');
        this.appInfo.get_name = () => _('Recent Files');
        this.appInfo.get_id = () => 'org.gnome.Nautilus.desktop';
        this.appInfo.get_icon = () => Gi.Gio.icon_new_for_string('document-open-recent-symbolic');
        this.appInfo.should_show = () => true;

        this.canLaunchSearch = true;
        this.isRemoteProvider = false;
    }

    getInitialResultSet(terms, callback) {
        const filesDict = {};
        const files = Gi.Gtk.RecentManager.get_default().get_items().filter(f => f.exists());

        // Detect whether time stamps are in int, or in Gi.GLib.DateTime object
        this._timeNeedsConversion = files[0]?.get_modified().to_unix;

        for (let file of files)
            filesDict[file.get_uri()] = file;


        this.files = filesDict;

        return new Promise(resolve => resolve(this._getResultSet(terms)));
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
        return new Promise(resolve => resolve(metas));
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
        let file = Gi.Gio.File.new_for_uri(result.get_uri());
        let info = file.query_info(Gi.Gio.FILE_ATTRIBUTE_THUMBNAIL_PATH,
            Gi.Gio.FileQueryInfoFlags.NONE, null);
        let path = info.get_attribute_byte_string(
            Gi.Gio.FILE_ATTRIBUTE_THUMBNAIL_PATH);

        let icon, gicon;

        if (path) {
            gicon = Gi.Gio.FileIcon.new(Gi.Gio.File.new_for_path(path));
        } else {
            const appInfo = Gi.Gio.AppInfo.get_default_for_type(result.get_mime_type(), false);
            if (appInfo)
                gicon = appInfo.get_icon();
        }

        if (gicon)
            icon = new Gi.St.Icon({ gicon, icon_size: size });
        else
            icon = new Gi.St.Icon({ icon_name: 'icon-missing', icon_size: size });


        return icon;
    }

    launchSearch(terms, timeStamp) {
        const appInfo = Gi.Gio.AppInfo.create_from_commandline('/usr/bin/nautilus -w recent:///', 'Nautilus', null);
        appInfo.launch([], global.create_app_launch_context(timeStamp, -1));

        // unlike on 42, on 44 if a window with the same uri is already open it will not get focus/activation
        // Gi.Gio.app_info_launch_default_for_uri('recent:///', global.create_app_launch_context(timeStamp, -1));

        // following solution for some reason ignores the recent:/// uri
        // this.appInfo.launch_uris(['recent:///'], global.create_app_launch_context(timeStamp, -1));
    }

    activateResult(resultId, terms, timeStamp) {
        const uri = resultId;
        const context = global.create_app_launch_context(timeStamp, -1);
        if (Me.Util.isShiftPressed()) {
            Ui.Main.overview.toggle();
            this.appInfo.launch_uris([uri], context);
        } else if (Gi.Gio.app_info_launch_default_for_uri(uri, context)) {
            // update recent list after (hopefully) successful activation
            const recentManager = Gi.Gtk.RecentManager.get_default();
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
        return this.getInitialResultSet(terms);
    }

    getSubsearchResultSet42(terms, callback) {
        callback(this._getResultSet(terms));
    }
};
