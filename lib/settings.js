/**
 * V-Shell (Vertical Workspaces)
 * settings.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2023
 * @license    GPL-3.0
 */

'use strict';

const { GLib } = imports.gi;

const Config = imports.misc.config;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

var   shellVersion = parseFloat(Config.PACKAGE_VERSION);

const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
var _ = Gettext.gettext;
const _schema = Me.metadata['settings-schema'];

// common instance of Options accessible from all modules
var opt;

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
                400,
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
            secWsPreviewScale: ['int', 'secondary-ws-preview-scale'],
            secWsPreviewShift: ['bool', 'secondary-ws-preview-shift'],
            wsThumbnailsFull: ['bool', 'ws-thumbnails-full'],
            secWsThumbnailsPosition: ['int', 'secondary-ws-thumbnails-position'],
            dashPosition: ['int', 'dash-position'],
            dashPositionAdjust: ['int', 'dash-position-adjust'],
            wsTmbPositionAdjust: ['int', 'wst-position-adjust'],
            showWsTmbLabels: ['int', 'show-wst-labels'],
            showWsTmbLabelsOnHover: ['boolean', 'show-wst-labels-on-hover'],
            closeWsButtonMode: ['int', 'close-ws-button-mode'],
            secWsTmbPositionAdjust: ['int', 'sec-wst-position-adjust'],
            dashMaxIconSize: ['int', 'dash-max-icon-size'],
            dashShowWindowsIcon: ['int', 'dash-show-windows-icon'],
            dashShowRecentFilesIcon: ['int', 'dash-show-recent-files-icon'],
            centerDashToWs: ['boolean', 'center-dash-to-ws'],
            showAppsIconPosition: ['int', 'show-app-icon-position'],
            wsThumbnailScale: ['int', 'ws-thumbnail-scale'],
            wsThumbnailScaleAppGrid: ['int', 'ws-thumbnail-scale-appgrid'],
            secWsThumbnailScale: ['int', 'secondary-ws-thumbnail-scale'],
            showSearchEntry: ['boolean', 'show-search-entry'],
            centerSearch: ['boolean', 'center-search'],
            centerAppGrid: ['boolean', 'center-app-grid'],
            dashBgOpacity: ['int', 'dash-bg-opacity'],
            dashBgRadius: ['int', 'dash-bg-radius'],
            dashBgGS3Style: ['boolean', 'dash-bg-gs3-style'],
            enablePageShortcuts: ['boolean', 'enable-page-shortcuts'],
            showWsSwitcherBg: ['boolean', 'show-ws-switcher-bg'],
            showWsPreviewBg: ['boolean', 'show-ws-preview-bg'],
            wsPreviewBgRadius: ['int', 'ws-preview-bg-radius'],
            showBgInOverview: ['boolean', 'show-bg-in-overview'],
            overviewBgBrightness: ['int', 'overview-bg-brightness'],
            overviewBgBlurSigma: ['int', 'overview-bg-blur-sigma'],
            appGridBgBlurSigma: ['int', 'app-grid-bg-blur-sigma'],
            smoothBlurTransitions: ['boolean', 'smooth-blur-transitions'],
            appGridAnimation: ['int', 'app-grid-animation'],
            searchViewAnimation: ['int', 'search-view-animation'],
            workspaceAnimation: ['int', 'workspace-animation'],
            animationSpeedFactor: ['int', 'animation-speed-factor'],
            fixUbuntuDock: ['boolean', 'fix-ubuntu-dock'],
            winPreviewIconSize: ['int', 'win-preview-icon-size'],
            winTitlePosition: ['int', 'win-title-position'],
            startupState: ['int', 'startup-state'],
            overviewMode: ['int', 'overview-mode'],
            workspaceSwitcherAnimation: ['int', 'workspace-switcher-animation'],
            searchIconSize: ['int', 'search-icon-size'],
            searchViewScale: ['int', 'search-width-scale'],
            appGridIconSize: ['int', 'app-grid-icon-size'],
            appGridColumns: ['int', 'app-grid-columns'],
            appGridRows: ['int', 'app-grid-rows'],
            appGridFolderIconSize: ['int', 'app-grid-folder-icon-size'],
            appGridFolderColumns: ['int', 'app-grid-folder-columns'],
            appGridFolderRows: ['int', 'app-grid-folder-rows'],
            appGridFolderIconGrid: ['int', 'app-grid-folder-icon-grid'],
            appGridContent: ['int', 'app-grid-content'],
            appGridIncompletePages: ['boolean', 'app-grid-incomplete-pages'],
            appGridOrder: ['int', 'app-grid-order'],
            appGridNamesMode: ['int', 'app-grid-names'],
            appGridActivePreview: ['boolean', 'app-grid-active-preview'],
            appGridFolderCenter: ['boolean', 'app-grid-folder-center'],
            appGridPageWidthScale: ['int', 'app-grid-page-width-scale'],
            appGridSpacing: ['int', 'app-grid-spacing'],
            searchWindowsEnable: ['boolean', 'search-windows-enable'],
            searchWindowsOrder: ['int', 'search-windows-order'],
            searchRecentFilesEnable: ['boolean', 'search-recent-files-enable'],
            searchFuzzy: ['boolean', 'search-fuzzy'],
            searchMaxResultsRows: ['int', 'search-max-results-rows'],
            dashShowWindowsBeforeActivation: ['int', 'dash-show-windows-before-activation'],
            dashIconScroll: ['int', 'dash-icon-scroll'],
            searchWindowsIconScroll: ['int', 'search-windows-icon-scroll'],
            panelVisibility: ['int', 'panel-visibility'],
            panelPosition: ['int', 'panel-position'],
            windowAttentionMode: ['int', 'window-attention-mode'],
            wsSwPopupHPosition: ['int', 'ws-sw-popup-h-position'],
            wsSwPopupVPosition: ['int', 'ws-sw-popup-v-position'],
            wsSwPopupMode: ['int', 'ws-sw-popup-mode'],
            favoritesNotify: ['int', 'favorites-notify'],
            notificationPosition: ['int', 'notification-position'],
            osdPosition: ['int', 'osd-position'],
            hotCornerAction: ['int', 'hot-corner-action'],
            hotCornerPosition: ['int', 'hot-corner-position'],
            hotCornerFullscreen: ['boolean', 'hot-corner-fullscreen'],
            hotCornerRipples: ['boolean', 'hot-corner-ripples'],
            alwaysActivateSelectedWindow: ['boolean', 'always-activate-selected-window'],
            winPreviewSecBtnAction: ['int', 'win-preview-sec-mouse-btn-action'],
            winPreviewMidBtnAction: ['int', 'win-preview-mid-mouse-btn-action'],
            winPreviewShowCloseButton: ['int', 'win-preview-show-close-button'],
            windowIconClickSearch: ['boolean', 'window-icon-click-search'],
            overlayKeySecondary: ['int', 'overlay-key-secondary'],
            overviewEscBehavior: ['int', 'overview-esc-behavior'],

            workspaceThumbnailsModule: ['boolean', 'workspace-thumbnails-module'],
            workspaceSwitcherPopupModule: ['boolean', 'workspace-switcher-popup-module'],
            workspaceAnimationModule: ['boolean', 'workspace-animation-module'],
            workspaceModule: ['boolean', 'workspace-module'],
            windowManagerModule: ['boolean', 'window-manager-module'],
            windowPreviewModule: ['boolean', 'window-preview-module'],
            winAttentionHandlerModule: ['boolean', 'win-attention-handler-module'],
            swipeTrackerModule: ['boolean', 'swipe-tracker-module'],
            searchControllerModule: ['boolean', 'search-controller-module'],
            searchModule: ['boolean', 'search-module'],
            panelModule: ['boolean', 'panel-module'],
            overlayKeyModule: ['boolean', 'overlay-key-module'],
            osdWindowModule: ['boolean', 'osd-window-module'],
            messageTrayModule: ['boolean', 'message-tray-module'],
            layoutModule: ['boolean', 'layout-module'],
            dashModule: ['boolean', 'dash-module'],
            appFavoritesModule: ['boolean', 'app-favorites-module'],
            appDisplayModule: ['boolean', 'app-display-module'],

            profileName1: ['string', 'profile-name-1'],
            profileName2: ['string', 'profile-name-2'],
            profileName3: ['string', 'profile-name-3'],
            profileName4: ['string', 'profile-name-4'],
        };
        this.cachedOptions = {};

        this.shellVersion = shellVersion;
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

    _updateCachedSettings() {
        Object.keys(this.options).forEach(v => this.get(v, true));
    }

    get(option, updateCache = false) {
        if (!this.options[option]) {
            log(`[${Me.metadata.name}] Error: Option ${option} is undefined.`);
            return null;
        }

        if (updateCache || this.cachedOptions[option] === undefined) {
            const [, key, settings] = this.options[option];
            let gSettings;
            if (settings !== undefined)
                gSettings = settings();
            else
                gSettings = this._gsettings;


            this.cachedOptions[option] = gSettings.get_value(key).deep_unpack();
        }

        return this.cachedOptions[option];
    }

    set(option, value) {
        const [format, key, settings] = this.options[option];

        let gSettings = this._gsettings;

        if (settings !== undefined)
            gSettings = settings();


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
        const [, key, settings] = this.options[option];

        let gSettings = this._gsettings;

        if (settings !== undefined)
            gSettings = settings();


        return gSettings.get_default_value(key).deep_unpack();
    }

    storeProfile(index) {
        const profile = {};
        Object.keys(this.options).forEach(v => {
            if (!v.startsWith('profileName'))
                profile[v] = this.get(v).toString();
        });

        this._gsettings.set_value(`profile-data-${index}`, new GLib.Variant('a{ss}', profile));
    }

    loadProfile(index) {
        const options = this._gsettings.get_value(`profile-data-${index}`).deep_unpack();
        // set the aaa-loading-data so extension.js doesn't reset V-Shell after each profile item
        // delayed gsettings writes are processed alphabetically, so this key will be processed first
        this._gsettings.set_boolean('aaa-loading-profile', !this._gsettings.get_boolean('aaa-loading-profile'));
        for (let o of Object.keys(options)) {
            if (!this.options[o]) {
                log(`[${Me.metadata.name}] Error: "${o}" is not a valid profile key -> Update your profile`);
                continue;
            }
            const [type] = this.options[o];
            let value = options[o];
            switch (type) {
            case 'string':
                break;
            case 'boolean':
                value = value === 'true';
                break;
            case 'int':
                value = parseInt(value);
                break;
            }

            this.set(o, value);
        }
    }

    resetProfile(index) {
        this._gsettings.reset(`profile-data-${index}`);
        this._gsettings.reset(`profile-name-${index}`);
    }

    _updateSettings() {
        this.DASH_BG_ALPHA = this.get('dashBgOpacity', true) / 100;
        this.DASH_BG_OPACITY = this.get('dashBgOpacity', true) * 2.5;
        this.DASH_BG_GS3_STYLE = this.get('dashBgGS3Style', true);
        this.DASH_POSITION = this.get('dashPosition', true);
        this.DASH_TOP = this.DASH_POSITION === 0;
        this.DASH_RIGHT = this.DASH_POSITION === 1;
        this.DASH_BOTTOM = this.DASH_POSITION === 2;
        this.DASH_LEFT = this.DASH_POSITION === 3;
        this.DASH_VERTICAL = this.DASH_LEFT || this.DASH_RIGHT;
        this.DASH_VISIBLE = this.DASH_POSITION !== 4; // 4 - disable
        this.DASH_FOLLOW_RECENT_WIN = false;

        this.DASH_CLICK_ACTION = this.get('dashShowWindowsBeforeActivation', true);
        this.DASH_ICON_SCROLL = this.get('dashIconScroll', true);
        this.DASH_SHIFT_CLICK_MV = true;

        this.SEARCH_WINDOWS_ICON_SCROLL = this.get('searchWindowsIconScroll', true);

        this.DASH_POSITION_ADJUSTMENT = this.get('dashPositionAdjust', true);
        this.DASH_POSITION_ADJUSTMENT = this.DASH_POSITION_ADJUSTMENT * -1 / 100; // range 1 to -1
        this.CENTER_DASH_WS = this.get('centerDashToWs', true);

        this.MAX_ICON_SIZE = 64; // updates from main module
        this.SHOW_WINDOWS_ICON = this.get('dashShowWindowsIcon', true);
        this.SHOW_RECENT_FILES_ICON = this.get('dashShowRecentFilesIcon', true);

        this.WS_TMB_POSITION = this.get('workspaceThumbnailsPosition', true);
        this.ORIENTATION = this.WS_TMB_POSITION > 4 ? 0 : 1;
        this.WORKSPACE_MAX_SPACING = this.get('wsMaxSpacing', true);
        // ORIENTATION || DASH_LEFT || DASH_RIGHT ? 350 : 80;
        this.SHOW_WS_TMB = ![4, 9].includes(this.WS_TMB_POSITION); // 4, 9 - disable
        this.WS_TMB_FULL = this.get('wsThumbnailsFull', true);
        // translate ws tmb position to 0 top, 1 right, 2 bottom, 3 left
        // 0L 1R, 2LF, 3RF, 4DV, 5T, 6B, 7TF, 8BF, 9DH
        this.WS_TMB_POSITION = [3, 1, 3, 1, 4, 0, 2, 0, 2, 8][this.WS_TMB_POSITION];
        this.WS_TMB_TOP = this.WS_TMB_POSITION === 0;
        this.WS_TMB_RIGHT = this.WS_TMB_POSITION === 1;
        this.WS_TMB_BOTTOM = this.WS_TMB_POSITION === 2;
        this.WS_TMB_LEFT = this.WS_TMB_POSITION === 3;
        this.WS_TMB_POSITION_ADJUSTMENT = this.get('wsTmbPositionAdjust', true) * -1 / 100; // range 1 to -1
        this.SEC_WS_TMB_POSITION = this.get('secWsThumbnailsPosition', true);
        this.SHOW_SEC_WS_TMB = this.SEC_WS_TMB_POSITION !== 3 && this.SHOW_WS_TMB;
        this.SEC_WS_TMB_TOP = (this.SEC_WS_TMB_POSITION === 0 && !this.ORIENTATION) || (this.SEC_WS_TMB_POSITION === 2 && this.WS_TMB_TOP);
        this.SEC_WS_TMB_RIGHT = (this.SEC_WS_TMB_POSITION === 1 && this.ORIENTATION) || (this.SEC_WS_TMB_POSITION === 2 && this.WS_TMB_RIGHT);
        this.SEC_WS_TMB_BOTTOM = (this.SEC_WS_TMB_POSITION === 1 && !this.ORIENTATION) || (this.SEC_WS_TMB_POSITION === 2 && this.WS_TMB_BOTTOM);
        this.SEC_WS_TMB_LEFT = (this.SEC_WS_TMB_POSITION === 0 && this.ORIENTATION) || (this.SEC_WS_TMB_POSITION === 2 && this.WS_TMB_LEFT);

        this.SEC_WS_TMB_POSITION_ADJUSTMENT = this.get('secWsTmbPositionAdjust', true) * -1 / 100; // range 1 to -1
        this.SEC_WS_PREVIEW_SHIFT = this.get('secWsPreviewShift', true);
        this.SHOW_WST_LABELS = this.get('showWsTmbLabels', true);
        this.SHOW_WST_LABELS_ON_HOVER = this.get('showWsTmbLabelsOnHover', true);
        this.CLOSE_WS_BUTTON_MODE = this.get('closeWsButtonMode', true);

        this.MAX_THUMBNAIL_SCALE = this.get('wsThumbnailScale', true) / 100;
        this.MAX_THUMBNAIL_SCALE_APPGRID = this.get('wsThumbnailScaleAppGrid', true) / 100;
        if (this.MAX_THUMBNAIL_SCALE_APPGRID === 0)
            this.MAX_THUMBNAIL_SCALE_APPGRID = this.MAX_THUMBNAIL_SCALE;
        this.MAX_THUMBNAIL_SCALE_STABLE = this.MAX_THUMBNAIL_SCALE === this.MAX_THUMBNAIL_SCALE_APPGRID;
        this.SEC_MAX_THUMBNAIL_SCALE = this.get('secWsThumbnailScale', true) / 100;

        this.WS_PREVIEW_SCALE = this.get('wsPreviewScale', true) / 100;
        this.SEC_WS_PREVIEW_SCALE = this.get('secWsPreviewScale', true) / 100;
        // calculate number of possibly visible neighbor previews according to ws scale
        this.NUMBER_OF_VISIBLE_NEIGHBORS = Math.round(1 + (1 - this.WS_PREVIEW_SCALE) / 4);

        this.SHOW_WS_TMB_BG = this.get('showWsSwitcherBg', true) && this.SHOW_WS_TMB;
        this.WS_PREVIEW_BG_RADIUS = this.get('wsPreviewBgRadius', true);
        this.SHOW_WS_PREVIEW_BG = this.get('showWsPreviewBg', true);

        this.CENTER_APP_GRID = this.get('centerAppGrid', true);

        this.SHOW_SEARCH_ENTRY = this.get('showSearchEntry', true);
        this.CENTER_SEARCH_VIEW = this.get('centerSearch', true);
        this.APP_GRID_ANIMATION = this.get('appGridAnimation', true);
        if (this.APP_GRID_ANIMATION === 4)
            this.APP_GRID_ANIMATION = this._getAnimationDirection();

        this.SEARCH_VIEW_ANIMATION = this.get('searchViewAnimation', true);
        if (this.SEARCH_VIEW_ANIMATION === 4)
            this.SEARCH_VIEW_ANIMATION = 3;

        this.WS_ANIMATION = this.get('workspaceAnimation', true);

        this.WIN_PREVIEW_ICON_SIZE = [64, 48, 32, 22, 8][this.get('winPreviewIconSize', true)];
        this.WIN_TITLES_POSITION = this.get('winTitlePosition', true);
        this.ALWAYS_SHOW_WIN_TITLES = this.WIN_TITLES_POSITION === 1;

        this.STARTUP_STATE = this.get('startupState', true);
        this.SHOW_BG_IN_OVERVIEW = this.get('showBgInOverview', true);
        this.OVERVIEW_BG_BRIGHTNESS = this.get('overviewBgBrightness', true) / 100;
        this.OVERVIEW_BG_BLUR_SIGMA = this.get('overviewBgBlurSigma', true);
        this.APP_GRID_BG_BLUR_SIGMA = this.get('appGridBgBlurSigma', true);
        this.SMOOTH_BLUR_TRANSITIONS = this.get('smoothBlurTransitions', true);

        this.OVERVIEW_MODE = this.get('overviewMode', true);
        this.OVERVIEW_MODE2 = this.OVERVIEW_MODE === 2;
        this.WORKSPACE_MODE = this.OVERVIEW_MODE ? 0 : 1;

        this.STATIC_WS_SWITCHER_BG = this.get('workspaceSwitcherAnimation', true);

        this.ANIMATION_TIME_FACTOR = this.get('animationSpeedFactor', true) / 100;

        this.SEARCH_ICON_SIZE = this.get('searchIconSize', true);
        this.SEARCH_VIEW_SCALE = this.get('searchViewScale', true) / 100;
        this.SEARCH_MAX_ROWS = this.get('searchMaxResultsRows', true);
        this.SEARCH_FUZZY = this.get('searchFuzzy', true);

        this.APP_GRID_ALLOW_INCOMPLETE_PAGES = this.get('appGridIncompletePages', true);
        this.APP_GRID_ICON_SIZE = this.get('appGridIconSize', true);
        this.APP_GRID_COLUMNS = this.get('appGridColumns', true);
        this.APP_GRID_ROWS = this.get('appGridRows', true);
        this.APP_GRID_ADAPTIVE = !this.APP_GRID_COLUMNS && !this.APP_GRID_ROWS;
        this.APP_GRID_ORDER = this.get('appGridOrder', true);

        this.APP_GRID_INCLUDE_DASH = this.get('appGridContent', true);
        /*  APP_GRID_INCLUDE_DASH
                0 - Include All
                1 - Include All - Favorites and Runnings First
                2 - Exclude Favorites (Default)
                3 - Exclude Running
                4 - Exclude Favorites and Running
        */
        this.APP_GRID_EXCLUDE_FAVORITES = this.APP_GRID_INCLUDE_DASH === 2 || this.APP_GRID_INCLUDE_DASH === 4;
        this.APP_GRID_EXCLUDE_RUNNING = this.APP_GRID_INCLUDE_DASH === 3 || this.APP_GRID_INCLUDE_DASH === 4;
        this.APP_GRID_DASH_FIRST = this.APP_GRID_INCLUDE_DASH === 1;

        this.APP_GRID_NAMES_MODE = this.get('appGridNamesMode', true);

        this.APP_GRID_FOLDER_ICON_SIZE = this.get('appGridFolderIconSize', true);
        this.APP_GRID_FOLDER_ICON_GRID = this.get('appGridFolderIconGrid', true);
        this.APP_GRID_FOLDER_COLUMNS = this.get('appGridFolderColumns', true);
        this.APP_GRID_FOLDER_ROWS = this.get('appGridFolderRows', true);
        this.APP_GRID_SPACING = this.get('appGridSpacing', true);
        this.APP_GRID_FOLDER_DEFAULT = this.APP_GRID_FOLDER_ROWS === 3 && this.APP_GRID_FOLDER_COLUMNS === 3;
        this.APP_GRID_FOLDER_ADAPTIVE = !this.APP_GRID_FOLDER_COLUMNS && !this.APP_GRID_FOLDER_ROWS;
        this.APP_GRID_ACTIVE_PREVIEW = this.get('appGridActivePreview', true);
        this.APP_GRID_FOLDER_CENTER = this.get('appGridFolderCenter', true);
        this.APP_GRID_PAGE_WIDTH_SCALE = this.get('appGridPageWidthScale', true) / 100;

        this.APP_GRID_ICON_SIZE_DEFAULT = this.APP_GRID_ACTIVE_PREVIEW && !this.APP_GRID_ORDER ? 176 : 96;
        this.APP_GRID_FOLDER_ICON_SIZE_DEFAULT = 96;

        this.WINDOW_SEARCH_PROVIDER_ENABLED = this.get('searchWindowsEnable', true);
        this.WINDOW_SEARCH_ORDER = this.get('searchWindowsOrder', true);
        this.RECENT_FILES_SEARCH_PROVIDER_ENABLED = this.get('searchRecentFilesEnable', true);

        this.PANEL_POSITION_TOP = this.get('panelPosition', true) === 0;
        this.PANEL_MODE = this.get('panelVisibility', true);
        this.PANEL_DISABLED = this.PANEL_MODE === 2;
        this.PANEL_OVERVIEW_ONLY = this.PANEL_MODE === 1;
        this.START_Y_OFFSET = 0; // set from main module
        this.FIX_UBUNTU_DOCK = this.get('fixUbuntuDock', true);

        this.WINDOW_ATTENTION_MODE = this.get('windowAttentionMode', true);
        this.WINDOW_ATTENTION_DISABLE_NOTIFICATIONS = this.WINDOW_ATTENTION_MODE === 1;
        this.WINDOW_ATTENTION_FOCUS_IMMEDIATELY = this.WINDOW_ATTENTION_MODE === 2;

        this.WS_SW_POPUP_H_POSITION = this.get('wsSwPopupHPosition', true) / 100;
        this.WS_SW_POPUP_V_POSITION = this.get('wsSwPopupVPosition', true) / 100;
        this.WS_SW_POPUP_MODE = this.get('wsSwPopupMode', true);

        this.SHOW_FAV_NOTIFICATION = this.get('favoritesNotify', true);
        this.NOTIFICATION_POSITION = this.get('notificationPosition', true);

        this.OSD_POSITION = this.get('osdPosition', true);

        this.HOT_CORNER_ACTION = this.get('hotCornerAction', true);
        this.HOT_CORNER_POSITION = this.get('hotCornerPosition', true);
        if (this.HOT_CORNER_POSITION === 6 && this.DASH_VISIBLE)
            this.HOT_CORNER_EDGE = true;
        else
            this.HOT_CORNER_EDGE = false;
        if ([5, 6].includes(this.HOT_CORNER_POSITION)) {
            if (this.DASH_TOP || this.DASH_LEFT)
                this.HOT_CORNER_POSITION = 1;
            else if (this.DASH_RIGHT)
                this.HOT_CORNER_POSITION = 2;
            else if (this.DASH_BOTTOM)
                this.HOT_CORNER_POSITION = 3;
            else
                this.HOT_CORNER_POSITION = 0;
        }
        this.HOT_CORNER_FULLSCREEN = this.get('hotCornerFullscreen', true);
        this.HOT_CORNER_RIPPLES = this.get('hotCornerRipples', true);

        this.ALWAYS_ACTIVATE_SELECTED_WINDOW = this.get('alwaysActivateSelectedWindow', true);
        this.WIN_PREVIEW_SEC_BTN_ACTION = this.get('winPreviewSecBtnAction', true);
        this.WIN_PREVIEW_MID_BTN_ACTION = this.get('winPreviewMidBtnAction', true);
        this.SHOW_CLOSE_BUTTON = this.get('winPreviewShowCloseButton', true);
        this.WINDOW_ICON_CLICK_SEARCH = this.get('windowIconClickSearch', true);

        this.OVERLAY_KEY_SECONDARY = this.get('overlayKeySecondary', true);

        this.ESC_BEHAVIOR = this.get('overviewEscBehavior', true);
    }

    _getAnimationDirection() {
        if (this.ORIENTATION)
            return this.WS_TMB_LEFT || !this.SHOW_WS_TMB ? 1 : 2; // 1 right, 2 left
        else
            return this.WS_TMB_TOP  || !this.SHOW_WS_TMB ? 3 : 5; // 3 bottom, 5 top
    }
};
