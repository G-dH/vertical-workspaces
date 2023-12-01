/**
* V-Shell (Vertical Workspaces)
 * extensionsSearchProvider.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2023
 * @license    GPL-3.0
 */

'use strict';

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const St = imports.gi.St;
const Shell = imports.gi.Shell;

const Main = imports.ui.main;

const ExtensionState = {
    1: 'ENABLED',
    2: 'DISABLED',
    3: 'ERROR',
    4: 'INCOMPATIBLE',
    5: 'DOWNLOADING',
    6: 'INITIALIZED',
    7: 'DISABLING',
    8: 'ENABLING',
};

let Me;
let opt;
// gettext
let _;

// prefix helps to eliminate results from other search providers
// so it needs to be something less common
// needs to be accessible from vw module
const PREFIX = 'eq//';

var ExtensionsSearchProviderModule = class {
    // export for other modules
    static _PREFIX = PREFIX;
    constructor(me) {
        Me = me;

        _  = Me.gettext;
        opt = Me.opt;
        this._firstActivation = true;
        this.moduleEnabled = false;

        this._extensionsSearchProvider = null;
        this._enableTimeoutId = 0;
    }

    cleanGlobals() {
        Me = null;
        opt = null;
        _ = null;
    }

    update(reset) {
        this.moduleEnabled = opt.get('extensionsSearchProviderModule');

        reset = reset || !this.moduleEnabled;

        if (reset && !this._firstActivation) {
            this._disableModule();
        } else if (!reset) {
            this._firstActivation = false;
            this._activateModule();
        }
            console.debug(' ExtensionsSearchProviderModule - Keeping untouched');
    }

    _activateModule() {
        // delay because Fedora had problem to register a new provider soon after Shell restarts
        this._enableTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            2000,
            () => {
                if (!this._extensionsSearchProvider) {
                    this._extensionsSearchProvider = new extensionsSearchProvider(opt);
                    this._getOverviewSearchResult()._registerProvider(this._extensionsSearchProvider);
                }
                this._enableTimeoutId = 0;
                return GLib.SOURCE_REMOVE;
            }
        );
        console.debug(' ExtensionsSearchProviderModule - Activated');
    }

    _disableModule() {
        if (this._enableTimeoutId) {
            GLib.source_remove(this._enableTimeoutId);
            this._enableTimeoutId = 0;
        }
        console.debug(' ExtensionsSearchProviderModule - Disabled');
    }

    _getOverviewSearchResult() {
        return Main.overview._overview.controls._searchController._searchResults;
    }
};

class extensionsSearchProvider {
    constructor() {
        this.id = 'extensions';
        const appSystem = Shell.AppSystem.get_default();
        let appInfo = appSystem.lookup_app('com.matjakeman.ExtensionManager.desktop')?.get_app_info();
        if (!appInfo)
            appInfo = appSystem.lookup_app('org.gnome.Extensions.desktop')?.get_app_info();
        if (!appInfo)
            appInfo = Gio.AppInfo.create_from_commandline('/usr/bin/gnome-extensions-app', 'Extensions', null);
        this.appInfo = appInfo;
        this.appInfo.get_description = () => _('Search extensions');
        this.appInfo.get_name = () => _('Extensions');
        this.appInfo.get_id = () => 'org.gnome.Extensions.desktop';
        this.appInfo.get_icon = () => Gio.icon_new_for_string('application-x-addon');
        this.appInfo.should_show = () => true;

        this.canLaunchSearch = true;
        this.isRemoteProvider = false;
    }

    getInitialResultSet(terms, callback /* , cancellable = null*/) {
        // In GS 43 callback arg has been removed
        /* if (Me.shellVersion >= 43)
            cancellable = callback; */

        const extensions = {};
        Main.extensionManager._extensions.forEach(
            e => {
                extensions[e.uuid] = e;
            }
        );
        this.extensions = extensions;

        if (Me.shellVersion >= 43)
            return new Promise(resolve => resolve(this._getResultSet(terms)));
        else
            callback(this._getResultSet(terms));

        return null;
    }

    _getResultSet(terms) {
        // do not modify original terms
        let termsCopy = [...terms];
        // search for terms without prefix
        termsCopy[0] = termsCopy[0].replace(PREFIX, '');

        const candidates = this.extensions;
        const _terms = [].concat(termsCopy);

        const term = _terms.join(' ');

        const results = [];
        let m;
        for (let id in candidates) {
            const extension = this.extensions[id];
            const name = extension.metadata.name;
            if (opt.SEARCH_FUZZY)
                m = Me.Util.fuzzyMatch(term, name);
            else
                m = Me.Util.strictMatch(term, name);

            if (m !== -1)
                results.push({ weight: m, id });
        }

        // sort alphabetically
        results.sort((a, b) => this.extensions[a.id].metadata.name.localeCompare(this.extensions[b.id].metadata.name));
        // enabled first
        // results.sort((a, b) => this.extensions[a.id].state !== 1 && this.extensions[b.id].state === 1);
        // incompatible last
        results.sort((a, b) => this.extensions[a.id].state === 4 && this.extensions[b.id].state !== 4);

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
        const result = this.extensions[resultId];
        return {
            'id': resultId,
            'name': result.metadata.name,
            'description': `${ExtensionState[result.state]} ${result.error}${result.hasUpdate ? ' | UPDATE' : ''}${result.hasPrefs ? ' | SETTINGS' : ''}`,
            'createIcon': size => {
                let icon = this.getIcon(result, size);
                return icon;
            },
        };
    }

    getIcon(extension, size) {
        let iconName = 'process-stop-symbolic';
        switch (extension.state) {
        case 1:
            if (extension.hasUpdate)
                iconName = 'software-update-available-symbolic';
            else
                iconName = 'object-select-symbolic';
            break;
        case 3:
            if (Main.extensionManager._enabledExtensions.includes(extension.uuid))
                iconName = 'emblem-ok-symbolic';
            else
                iconName = 'dialog-error-symbolic';
            break;
        case 4:
            iconName = 'software-update-urgent-symbolic';
            break;
        }

        if (extension.hasUpdate)
            iconName = 'software-update-available-symbolic';

        const icon = new St.Icon({ icon_name: iconName, icon_size: size });
        icon.set({
            reactive: true,
            opacity: iconName === 'object-select-symbolic' ? 255 : 100,
        });
        icon.connect('button-press-event', () => {
            this._toggleExtension(extension);
            return true;
        });
        return icon;
    }

    _toggleExtension(extension) {
        const state = extension.state;
        if (![1, 2, 6, 3].includes(state) || extension.metadata.name.includes('vertical-workspaces'))
            return;

        if ([2, 6].includes(state))
            Main.extensionManager.enableExtension(extension.uuid);
        else if ([1, 3].includes(state))
            Main.extensionManager.disableExtension(extension.uuid);

        const entryText = Main.overview.searchEntry.get_text();
        Main.overview.searchEntry.set_text('');
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            Main.overview.searchEntry.set_text(entryText);
        });
    }

    launchSearch(terms, timeStamp) {
        this.appInfo.launch([], global.create_app_launch_context(timeStamp, -1), null);
    }

    activateResult(resultId/* terms, timeStamp*/) {
        const extension = this.extensions[resultId];
        if (Me.Util.isShiftPressed())
            this._toggleExtension(extension);
        else if (extension.hasPrefs)
            Me.Util.openPreferences(extension.metadata);
    }

    filterResults(results /* , maxResults*/) {
        // return results.slice(0, maxResults);
        return results;
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
