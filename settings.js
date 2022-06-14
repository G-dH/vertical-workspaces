// Vertical Vorkspaces
// GPL v3 ©G-dH@Github.com
'use strict';

const { GLib, Gio } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Config = imports.misc.config;
var   shellVersion = parseFloat(Config.PACKAGE_VERSION);

const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
var _ = Gettext.gettext;

const _schema = 'org.gnome.shell.extensions.vertical-workspaces';

var Options = class Options {
    constructor() {
        this._gsettings = ExtensionUtils.getSettings(_schema);
        this._connectionIds = [];
        this._writeTimeoutId = 0;
        this._gsettings.delay();
        this.connect('changed', () => {
            if (this._writeTimeoutId)
                GLib.Source.remove(this._writeTimeoutId);

            this._writeTimeoutId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                300,
                () => {
                    this._gsettings.apply();
                    this._writeTimeoutId = 0;
                    return GLib.SOURCE_REMOVE;
                }
            );
        });
        this.options = {
            workspaceThumbnailsPosition: ['int', 'ws-thumbnails-position'],
            secondaryWsThumbnailsPosition: ['int', 'secondary-ws-thumbnails-position'],
            dashPosition: ['int', 'dash-position'],
            centerDashToWs: ['boolean', 'center-dash-to-ws'],
            showAppsIconPosition: ['int', 'show-app-icon-position'],
            wsThumbnailScale: ['int', 'ws-thumbnail-scale'],
            dashMaxScale: ['int', 'dash-max-scale'],
            centerSearch: ['boolean', 'center-search'],
            centerAppGrid: ['boolean', 'center-app-grid'],
            dashBgOpacity: ['int', 'dash-bg-opacity']
        }
        this.cachedOptions = {};

        this.connect('changed', this._updateCachedSettings.bind(this));
    }

    connect(name, callback) {
        const id = this._gsettings.connect(name, callback);
        this._connectionIds.push(id);
        return id;
    }

    destroy() {
        this._connectionIds.forEach(id => this._gsettings.disconnect(id));
        if (this._writeTimeoutId) {
            GLib.source_remove(this._writeTimeoutId);
            this._writeTimeoutId = 0;
        }
    }

    _updateCachedSettings(settings, key) {
        Object.keys(this.options).forEach(v => this.get(v, true));
    }

    get(option, updateCache = false) {
        if (updateCache || this.cachedOptions[option] === undefined) {
            const [format, key, settings] = this.options[option];
            let gSettings;
            if (settings !== undefined) {
                gSettings = settings();
            } else {
                gSettings = this._gsettings;
            }
    
            this.cachedOptions[option] = gSettings.get_value(key).deep_unpack();
        }

        return this.cachedOptions[option];
    }

    set(option, value) {
        const [format, key, settings] = this.options[option];

        let gSettings = this._gsettings;

        if (settings !== undefined) {
            gSettings = settings();
        }

        switch (format) {
            case 'boolean':
                gSettings.set_boolean(key, value);
                break;
            case 'int':
                gSettings.set_int(key, value);
                break;
            case 'string':
                gSettings.set_string(key, value);
                break;
            case 'strv':
                gSettings.set_strv(key, value);
                break;
        }
    }

    getDefault(option) {
        const [format, key, settings] = this.options[option];

        let gSettings = this._gsettings;

        if (settings !== undefined) {
            gSettings = settings();
        }

        return gSettings.get_default_value(key).deep_unpack();
    }
};
