/**
 * Vertical Workspaces
 * settings.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022
 * @license    GPL-3.0
 */

'use strict';

const { GLib, Gio } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Config = imports.misc.config;
var   shellVersion = parseFloat(Config.PACKAGE_VERSION);

const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
var _ = Gettext.gettext;
const _schema = Me.metadata['settings-schema'];


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
                100,
                () => {
                    this._gsettings.apply();
                    this._updateCachedSettings();
                    this._writeTimeoutId = 0;
                    return GLib.SOURCE_REMOVE;
                }
            );
        });
        this.options = {
            workspaceThumbnailsPosition: ['int', 'ws-thumbnails-position'],
            wsMaxSpacing: ['int', 'ws-max-spacing'],
            wsPreviewScale: ['int', 'ws-preview-scale'],
            WsThumbnailsFull: ['bool', 'ws-thumbnails-full'],
            secondaryWsThumbnailsPosition: ['int', 'secondary-ws-thumbnails-position'],
            dashPosition: ['int', 'dash-position'],
            dashPositionAdjust: ['int', 'dash-position-adjust'],
            wsTmbPositionAdjust: ['int', 'wst-position-adjust'],
            showWsTmbLabels: ['int', 'show-wst-labels'],
            showWsTmbLabelsOnHover: ['boolean', 'show-wst-labels-on-hover'],
            SecWsTmbPositionAdjust: ['int', 'sec-wst-position-adjust'],
            dashMaxIconSize: ['int', 'dash-max-icon-size'],
            centerDashToWs: ['boolean', 'center-dash-to-ws'],
            showAppsIconPosition: ['int', 'show-app-icon-position'],
            wsThumbnailScale: ['int', 'ws-thumbnail-scale'],
            showSearchEntry: ['boolean', 'show-search-entry'],
            centerSearch: ['boolean', 'center-search'],
            centerAppGrid: ['boolean', 'center-app-grid'],
            dashBgOpacity: ['int', 'dash-bg-opacity'],
            dashBgRadius: ['int', 'dash-bg-radius'],
            enablePageShortcuts: ['boolean', 'enable-page-shortcuts'],
            showWsSwitcherBg: ['boolean', 'show-ws-switcher-bg'],
            showWsPreviewBg: ['boolean', 'show-ws-preview-bg'],
            showBgInOverview: ['boolean', 'show-bg-in-overview'],
            overviewBgBlurSigma: ['int', 'overview-bg-blur-sigma'],
            appGridBgBlurSigma: ['int', 'app-grid-bg-blur-sigma'],
            smoothBlurTransitions: ['boolean', 'smooth-blur-transitions'],
            appGridAnimation: ['int', 'app-grid-animation'],
            workspaceAnimation: ['int', 'workspace-animation'],
            animationSpeedFactor: ['int', 'animation-speed-factor'],
            fixUbuntuDock: ['boolean', 'fix-ubuntu-dock'],
            winPreviewIconSize: ['int', 'win-preview-icon-size'],
            alwaysShowWinTitles: ['int', 'always-show-win-titles'],
            startupState: ['int', 'startup-state'],
            overviewMode: ['int', 'overview-mode'],
            workspaceSwitcherAnimation: ['int', 'workspace-switcher-animation'],
            searchIconSize: ['int', 'search-icon-size'],
            searchViewScale: ['int', 'search-width-scale'],
            appGridAllowCustom: ['int', 'app-grid-allow-custom'],
            appGridIconSize: ['int', 'app-grid-icon-size'],
            appGridColumns: ['int', 'app-grid-columns'],
            appGridRows: ['int', 'app-grid-rows'],
            appGridFolderIconSize: ['int', 'app-grid-folder-icon-size'],
            appGridFolderColumns: ['int', 'app-grid-folder-columns'],
            appGridFolderRows: ['int', 'app-grid-folder-rows']
        }
        this.cachedOptions = {};
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
