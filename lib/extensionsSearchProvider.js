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
const Clutter = imports.gi.Clutter;
const GObject = imports.gi.GObject;

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
let _toggleTimeout;

// prefix helps to eliminate results from other search providers
// so it needs to be something less common
// needs to be accessible from vw module
const PREFIX = 'eq//';

var ExtensionsSearchProviderModule = class {
    // export for other modules
    static _PREFIX = PREFIX;
    constructor(me) {
        Me = me;
        opt = Me.opt;
        _  = Me.gettext;

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
        if (_toggleTimeout)
            GLib.source_remove(_toggleTimeout);

        this.moduleEnabled = opt.get('extensionsSearchProviderModule');

        reset = reset || !this.moduleEnabled;

        if (reset && !this._firstActivation) {
            this._disableModule();
        } else if (!reset) {
            this._firstActivation = false;
            this._activateModule();
        }
        if (reset && this._firstActivation)
            console.debug('  ExtensionsSearchProviderModule - Keeping untouched');
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
        console.debug('  ExtensionsSearchProviderModule - Activated');
    }

    _disableModule() {
        if (this._enableTimeoutId) {
            GLib.source_remove(this._enableTimeoutId);
            this._enableTimeoutId = 0;
        }

        if (this._extensionsSearchProvider) {
            this._getOverviewSearchResult()._unregisterProvider(this._extensionsSearchProvider);
            this._extensionsSearchProvider = null;
        }

        console.debug('  ExtensionsSearchProviderModule - Disabled');
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
        appInfo.get_description = () => _('Search extensions');
        appInfo.get_name = () => _('Extensions');
        appInfo.get_id = () => 'org.gnome.Extensions.desktop';
        appInfo.get_icon = () => Gio.icon_new_for_string('application-x-addon');
        appInfo.should_show = () => true;

        this.appInfo = appInfo;
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
        this._listAllResults = terms[0].startsWith(PREFIX);
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
            const text = extension.metadata.name + (extension.state === 1 ? 'enabled' : '') + ([6, 2].includes(extension.state) ? 'disabled' : '');
            if (opt.SEARCH_FUZZY)
                m = Me.Util.fuzzyMatch(term, text);
            else
                m = Me.Util.strictMatch(term, text);

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

        const versionName = result.metadata['version-name'] ?? '';
        let version = result.metadata['version'] ?? '';
        version = versionName && version ? `/${version}` : version;
        const versionStr = `${versionName}${version}`;

        return {
            'id': resultId,
            'name': `${result.metadata.name}`,
            'version': versionStr,
            'description': versionStr, // description will be updated in result object
            'createIcon': size => {
                let icon = this.getIcon(result, size);
                return icon;
            },
        };
    }

    getIcon(extension, size) {
        let opacity = 0;
        let iconName = 'process-stop-symbolic';

        switch (extension.state) {
        case 1:
            if (extension.hasUpdate)
                iconName = 'software-update-available'; // 'software-update-available-symbolic';
            else
                iconName = 'object-select';// 'object-select-symbolic';

            opacity = 255;
            break;
        case 3:
            if (Main.extensionManager._enabledExtensions.includes(extension.uuid))
                iconName = 'emblem-ok-symbolic';
            else
                iconName = 'dialog-error';
            opacity = 180;
            break;
        case 4:
            iconName = 'software-update-urgent'; // 'software-update-urgent-symbolic';
            opacity = 180;
            break;
        }

        if (extension.hasUpdate) {
            iconName = 'software-update-available'; // 'software-update-available-symbolic';
            opacity = 180;
        }

        const icon = new St.Icon({ icon_name: iconName, icon_size: size });
        icon.set({
            reactive: true,
            opacity,
        });

        return icon;
    }

    createResultObject(meta) {
        return new ListSearchResult(this, meta, this.extensions[meta.id]);
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

    filterResults(results, maxResults) {
        return this._listAllResults
            ? results
            : results.slice(0, maxResults);
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

const ListSearchResult = GObject.registerClass(
class ListSearchResult extends St.Button {
    _init(provider, metaInfo, extension) {
        this.provider = provider;
        this.metaInfo = metaInfo;
        this.extension = extension;

        super._init({
            reactive: true,
            can_focus: true,
            track_hover: true,
        });

        this.style_class = 'list-search-result';

        let content = new St.BoxLayout({
            style_class: 'list-search-result-content',
            vertical: false,
            x_align: Clutter.ActorAlign.START,
            x_expand: true,
            y_expand: true,
        });
        this.set_child(content);

        let titleBox = new St.BoxLayout({
            style_class: 'list-search-result-title',
            y_align: Clutter.ActorAlign.CENTER,
        });

        content.add_child(titleBox);

        // An icon for, or thumbnail of, content
        let icon = this.metaInfo['createIcon'](this.ICON_SIZE);
        let iconBox = new St.Button();
        iconBox.set_child(icon);
        titleBox.add(iconBox);
        iconBox.set_style('border: 1px solid rgba(200,200,200,0.2); padding: 2px; border-radius: 8px;');
        this._iconBox = iconBox;
        this.icon = icon;

        iconBox.connect('clicked', () => {
            this._toggleExtension();
            return Clutter.EVENT_STOP;
        });

        let title = new St.Label({
            text: this.metaInfo['name'],
            y_align: Clutter.ActorAlign.CENTER,
            opacity: extension.hasPrefs ? 255 : 150,
        });
        titleBox.add_child(title);

        this.label_actor = title;

        this._descriptionLabel = new St.Label({
            style_class: 'list-search-result-description',
            y_align: Clutter.ActorAlign.CENTER,
        });
        content.add_child(this._descriptionLabel);

        this._highlightTerms();

        this.connect('destroy', () => {
            if (_toggleTimeout) {
                GLib.source_remove(_toggleTimeout);
                _toggleTimeout = 0;
            }
        });
    }

    _toggleExtension() {
        const state = this.extension.state;
        if (![1, 2, 6, 3].includes(state) || this.extension.metadata.uuid.includes('vertical-workspaces'))
            return;

        if ([2, 6].includes(state))
            Main.extensionManager.enableExtension(this.extension.uuid);
        else if ([1, 3].includes(state))
            Main.extensionManager.disableExtension(this.extension.uuid);

        if (_toggleTimeout)
            GLib.source_remove(_toggleTimeout);

        _toggleTimeout = GLib.timeout_add(GLib.PRIORITY_LOW, 200,
            () => {
                if ([7, 8].includes(this.extension.state))
                    return GLib.SOURCE_CONTINUE;

                this.icon?.destroy();
                this.icon = this.metaInfo['createIcon'](this.ICON_SIZE);
                this._iconBox.set_child(this.icon);
                this._highlightTerms();

                _toggleTimeout = 0;
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    get ICON_SIZE() {
        return 24;
    }

    _highlightTerms() {
        const extension = this.extension;
        const state = extension.state === 4 ? ExtensionState[this.extension.state] : '';
        const error = extension.state === 3 ? ` ERROR: ${this.extension.error}` : '';
        const update = extension.hasUpdate ? ' | UPDATE PENDING' : '';
        const text = `${this.metaInfo.version}    ${state}${error}${update}`;
        let markup = text;// this.metaInfo['description'].split('\n')[0];
        this._descriptionLabel.clutter_text.set_markup(markup);
    }

    vfunc_clicked() {
        this.activate();
    }

    activate() {
        this.provider.activateResult(this.metaInfo.id);

        if (this.metaInfo.clipboardText) {
            St.Clipboard.get_default().set_text(
                St.ClipboardType.CLIPBOARD, this.metaInfo.clipboardText);
        }
        Main.overview.toggle();
    }
});
