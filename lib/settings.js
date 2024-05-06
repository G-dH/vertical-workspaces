/**
 * V-Shell (Vertical Workspaces)
 * settings.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2024
 * @license    GPL-3.0
 */

'use strict';

const GLib = imports.gi.GLib;

let Me;

var Options = class Options {
    constructor(me) {
        Me = me;

        this._gsettings = Me.gSettings;
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
            secWsPreviewShift: ['boolean', 'secondary-ws-preview-shift'],
            wsThumbnailsFull: ['boolean', 'ws-thumbnails-full'],
            secWsThumbnailsPosition: ['int', 'secondary-ws-thumbnails-position'],
            dashPosition: ['int', 'dash-position'],
            dashPositionAdjust: ['int', 'dash-position-adjust'],
            wsTmbPositionAdjust: ['int', 'wst-position-adjust'],
            showWsTmbLabels: ['int', 'show-wst-labels'],
            showWsTmbLabelsOnHover: ['boolean', 'show-wst-labels-on-hover'],
            closeWsButtonMode: ['int', 'close-ws-button-mode'],
            secWsTmbPositionAdjust: ['int', 'sec-wst-position-adjust'],
            dashMaxIconSize: ['int', 'dash-max-icon-size'],
            centerDashToWs: ['boolean', 'center-dash-to-ws'],
            showAppsIconPosition: ['int', 'show-app-icon-position'],
            wsThumbnailScale: ['int', 'ws-thumbnail-scale'],
            wsThumbnailScaleAppGrid: ['int', 'ws-thumbnail-scale-appgrid'],
            secWsThumbnailScale: ['int', 'secondary-ws-thumbnail-scale'],
            showSearchEntry: ['boolean', 'show-search-entry'],
            centerSearch: ['boolean', 'center-search'],
            centerAppGrid: ['boolean', 'center-app-grid'],
            dashBgOpacity: ['int', 'dash-bg-opacity'],
            dashBgColor: ['int', 'dash-bg-color'],
            dashBgRadius: ['int', 'dash-bg-radius'],
            dashBgGS3Style: ['boolean', 'dash-bg-gs3-style'],
            runningDotStyle: ['int', 'running-dot-style'],
            enablePageShortcuts: ['boolean', 'enable-page-shortcuts'],
            showWsSwitcherBg: ['boolean', 'show-ws-switcher-bg'],
            showWsPreviewBg: ['boolean', 'show-ws-preview-bg'],
            wsPreviewBgRadius: ['int', 'ws-preview-bg-radius'],
            showBgInOverview: ['boolean', 'show-bg-in-overview'],
            overviewBgBrightness: ['int', 'overview-bg-brightness'],
            searchBgBrightness: ['int', 'search-bg-brightness'],
            overviewBgBlurSigma: ['int', 'overview-bg-blur-sigma'],
            appGridBgBlurSigma: ['int', 'app-grid-bg-blur-sigma'],
            smoothBlurTransitions: ['boolean', 'smooth-blur-transitions'],
            appGridAnimation: ['int', 'app-grid-animation'],
            searchViewAnimation: ['int', 'search-view-animation'],
            workspaceAnimation: ['int', 'workspace-animation'],
            animationSpeedFactor: ['int', 'animation-speed-factor'],
            winPreviewIconSize: ['int', 'win-preview-icon-size'],
            winTitlePosition: ['int', 'win-title-position'],
            startupState: ['int', 'startup-state'],
            overviewMode: ['int', 'overview-mode'],
            workspaceSwitcherAnimation: ['int', 'workspace-switcher-animation'],
            wsSwitcherMode: ['int', 'ws-switcher-mode'],
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
            appFolderOrder: ['int', 'app-folder-order'],
            appGridNamesMode: ['int', 'app-grid-names'],
            appGridActivePreview: ['boolean', 'app-grid-active-preview'],
            appGridFolderCenter: ['boolean', 'app-grid-folder-center'],
            appGridPageWidthScale: ['int', 'app-grid-page-width-scale'],
            appGridSpacing: ['int', 'app-grid-spacing'],
            searchWindowsOrder: ['int', 'search-windows-order'],
            searchFuzzy: ['boolean', 'search-fuzzy'],
            searchMaxResultsRows: ['int', 'search-max-results-rows'],
            dashShowWindowsBeforeActivation: ['int', 'dash-show-windows-before-activation'],
            dashIconScroll: ['int', 'dash-icon-scroll'],
            dashIsolateWorkspaces: ['boolean', 'dash-isolate-workspaces'],
            searchWindowsIconScroll: ['int', 'search-windows-icon-scroll'],
            panelVisibility: ['int', 'panel-visibility'],
            panelPosition: ['int', 'panel-position'],
            windowAttentionMode: ['int', 'window-attention-mode'],
            wsSwPopupHPosition: ['int', 'ws-sw-popup-h-position'],
            wsSwPopupVPosition: ['int', 'ws-sw-popup-v-position'],
            wsSwPopupMode: ['int', 'ws-sw-popup-mode'],
            wsSwitcherWraparound: ['boolean', 'ws-switcher-wraparound'],
            wsSwitcherIgnoreLast: ['boolean', 'ws-switcher-ignore-last'],
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
            winPreviewShowCloseButton: ['boolean', 'win-preview-show-close-button'],
            windowIconClickAction: ['int', 'window-icon-click-action'],
            overlayKeyPrimary: ['int', 'overlay-key-primary'],
            overlayKeySecondary: ['int', 'overlay-key-secondary'],
            overviewEscBehavior: ['int', 'overview-esc-behavior'],
            clickEmptyClose: ['boolean', 'click-empty-close'],
            newWindowFocusFix: ['boolean', 'new-window-focus-fix'],
            newWindowMonitorFix: ['boolean', 'new-window-monitor-fix'],
            appGridPerformance: ['boolean', 'app-grid-performance'],
            highlightingStyle: ['int', 'highlighting-style'],
            delayStartup: ['boolean', 'delay-startup'],

            workspaceSwitcherPopupModule: ['boolean', 'workspace-switcher-popup-module'],
            workspaceAnimationModule: ['boolean', 'workspace-animation-module'],
            workspaceModule: ['boolean', 'workspace-module'],
            windowManagerModule: ['boolean', 'window-manager-module'],
            windowPreviewModule: ['boolean', 'window-preview-module'],
            windowAttentionHandlerModule: ['boolean', 'win-attention-handler-module'],
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
    }

    cleanGlobals() {
        Me = null;
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
            console.error(`[${Me.metadata.name}] Error: Option ${option} is undefined.`);
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
                console.error(`[${Me.metadata.name}] Error: "${o}" is not a valid profile key -> Update your profile`);
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
        this._updateCachedSettings();
        this.DASH_BG_ALPHA = this.get('dashBgOpacity') / 100;
        this.DASH_BG_OPACITY = this.get('dashBgOpacity') * 2.5;
        this.DASH_BG_COLOR = this.get('dashBgColor');
        this.DASH_BG_RADIUS = this.get('dashBgRadius');
        this.DASH_BG_LIGHT = this.DASH_BG_COLOR === 1;
        this.DASH_BG_GS3_STYLE = this.get('dashBgGS3Style');
        this.DASH_POSITION = this.get('dashModule') ? this.get('dashPosition') : 2;
        this.DASH_TOP = this.DASH_POSITION === 0;
        this.DASH_RIGHT = this.DASH_POSITION === 1;
        this.DASH_BOTTOM = this.DASH_POSITION === 2;
        this.DASH_LEFT = this.DASH_POSITION === 3;
        this.DASH_VERTICAL = this.DASH_LEFT || this.DASH_RIGHT;
        this.DASH_VISIBLE = this.DASH_POSITION !== 4; // 4 - disable
        this.DASH_FOLLOW_RECENT_WIN = false;

        this.DASH_ISOLATE_WS = this.get('dashIsolateWorkspaces');

        this.DASH_CLICK_ACTION = this.get('dashShowWindowsBeforeActivation');
        this.DASH_CLICK_SWITCH_BEFORE_ACTIVATION = this.DASH_CLICK_ACTION === 1;
        this.DASH_CLICK_OPEN_NEW_WIN = this.DASH_CLICK_ACTION === 2;
        this.DASH_CLICK_PREFER_WORKSPACE = this.DASH_CLICK_ACTION === 3;

        this.DASH_ICON_SCROLL = this.get('dashIconScroll');
        this.DASH_SHIFT_CLICK_MV = true;

        this.RUNNING_DOT_STYLE = this.get('runningDotStyle');

        this.SEARCH_WINDOWS_ICON_SCROLL = this.get('searchWindowsIconScroll');

        this.DASH_POSITION_ADJUSTMENT = this.get('dashPositionAdjust');
        this.DASH_POSITION_ADJUSTMENT = this.DASH_POSITION_ADJUSTMENT * -1 / 100; // range 1 to -1
        this.CENTER_DASH_WS = this.get('centerDashToWs');

        this.MAX_ICON_SIZE = this.get('dashMaxIconSize');

        this.WS_TMB_POSITION = this.get('workspaceThumbnailsPosition');
        this.ORIENTATION = this.WS_TMB_POSITION > 4 ? 0 : 1;
        this.WORKSPACE_MAX_SPACING = this.get('wsMaxSpacing');
        // ORIENTATION || DASH_LEFT || DASH_RIGHT ? 350 : 80;
        this.SHOW_WS_TMB = ![4, 9].includes(this.WS_TMB_POSITION); // 4, 9 - disable
        this.WS_TMB_FULL = this.get('wsThumbnailsFull');
        // translate ws tmb position to 0 top, 1 right, 2 bottom, 3 left
        // 0L 1R, 2LF, 3RF, 4DV, 5T, 6B, 7TF, 8BF, 9DH
        this.WS_TMB_POSITION = [3, 1, 3, 1, 4, 0, 2, 0, 2, 8][this.WS_TMB_POSITION];
        this.WS_TMB_TOP = this.WS_TMB_POSITION === 0;
        this.WS_TMB_RIGHT = this.WS_TMB_POSITION === 1;
        this.WS_TMB_BOTTOM = this.WS_TMB_POSITION === 2;
        this.WS_TMB_LEFT = this.WS_TMB_POSITION === 3;
        this.WS_TMB_POSITION_ADJUSTMENT = this.get('wsTmbPositionAdjust') * -1 / 100; // range 1 to -1
        this.SEC_WS_TMB_POSITION = this.get('secWsThumbnailsPosition');
        this.SHOW_SEC_WS_TMB = this.SEC_WS_TMB_POSITION !== 3 && this.SHOW_WS_TMB;
        this.SEC_WS_TMB_TOP = (this.SEC_WS_TMB_POSITION === 0 && !this.ORIENTATION) || (this.SEC_WS_TMB_POSITION === 2 && this.WS_TMB_TOP);
        this.SEC_WS_TMB_RIGHT = (this.SEC_WS_TMB_POSITION === 1 && this.ORIENTATION) || (this.SEC_WS_TMB_POSITION === 2 && this.WS_TMB_RIGHT);
        this.SEC_WS_TMB_BOTTOM = (this.SEC_WS_TMB_POSITION === 1 && !this.ORIENTATION) || (this.SEC_WS_TMB_POSITION === 2 && this.WS_TMB_BOTTOM);
        this.SEC_WS_TMB_LEFT = (this.SEC_WS_TMB_POSITION === 0 && this.ORIENTATION) || (this.SEC_WS_TMB_POSITION === 2 && this.WS_TMB_LEFT);

        this.SEC_WS_TMB_POSITION_ADJUSTMENT = this.get('secWsTmbPositionAdjust') * -1 / 100; // range 1 to -1
        this.SEC_WS_PREVIEW_SHIFT = this.get('secWsPreviewShift');
        this.SHOW_WST_LABELS = this.get('showWsTmbLabels');
        this.SHOW_WST_LABELS_ON_HOVER = this.get('showWsTmbLabelsOnHover');
        this.CLOSE_WS_BUTTON_MODE = this.get('closeWsButtonMode');

        this.MAX_THUMBNAIL_SCALE = this.get('wsThumbnailScale') / 100;
        if (this.MAX_THUMBNAIL_SCALE === 0) {
            this.MAX_THUMBNAIL_SCALE = 0.01;
            this.SHOW_WS_TMB = false;
        }
        this.MAX_THUMBNAIL_SCALE_APPGRID = this.get('wsThumbnailScaleAppGrid') / 100;
        this.SHOW_WS_TMB_APPGRID = true;
        if (this.MAX_THUMBNAIL_SCALE_APPGRID === 0) {
            this.MAX_THUMBNAIL_SCALE_APPGRID = 0.01;
            this.SHOW_WS_TMB_APPGRID = false;
        }
        this.MAX_THUMBNAIL_SCALE_STABLE = this.MAX_THUMBNAIL_SCALE === this.MAX_THUMBNAIL_SCALE_APPGRID;

        this.SEC_MAX_THUMBNAIL_SCALE = this.get('secWsThumbnailScale') / 100;
        if (this.SEC_MAX_THUMBNAIL_SCALE === 0) {
            this.SEC_MAX_THUMBNAIL_SCALE = 0.01;
            this.SHOW_SEC_WS_TMB = false;
        }

        this.WS_PREVIEW_SCALE = this.get('wsPreviewScale') / 100;
        this.SEC_WS_PREVIEW_SCALE = this.get('secWsPreviewScale') / 100;
        // calculate number of possibly visible neighbor previews according to ws scale
        this.NUMBER_OF_VISIBLE_NEIGHBORS = Math.round(1 + (1 - this.WS_PREVIEW_SCALE) / 4);

        this.SHOW_WS_TMB_BG = this.get('showWsSwitcherBg') && this.SHOW_WS_TMB;
        this.WS_PREVIEW_BG_RADIUS = this.get('wsPreviewBgRadius');
        this.SHOW_WS_PREVIEW_BG = this.get('showWsPreviewBg');

        this.CENTER_APP_GRID = this.get('centerAppGrid');

        this.SHOW_SEARCH_ENTRY = this.get('showSearchEntry');
        this.CENTER_SEARCH_VIEW = this.get('centerSearch');
        this.APP_GRID_ANIMATION = this.get('appGridAnimation');
        if (this.APP_GRID_ANIMATION === 4)
            this.APP_GRID_ANIMATION = this._getAnimationDirection();

        this.SEARCH_VIEW_ANIMATION = this.get('searchViewAnimation');
        if (this.SEARCH_VIEW_ANIMATION === 4)
            this.SEARCH_VIEW_ANIMATION = 3;

        this.WIN_PREVIEW_ICON_SIZE = [64, 48, 32, 22, 8][this.get('winPreviewIconSize')];
        this.WIN_TITLES_POSITION = this.get('winTitlePosition');
        this.ALWAYS_SHOW_WIN_TITLES = this.WIN_TITLES_POSITION === 1;

        this.STARTUP_STATE = this.get('startupState');
        this.SHOW_BG_IN_OVERVIEW = this.get('showBgInOverview');
        this.OVERVIEW_BG_BRIGHTNESS = this.get('overviewBgBrightness') / 100;
        this.SEARCH_BG_BRIGHTNESS = this.get('searchBgBrightness') / 100;
        this.OVERVIEW_BG_BLUR_SIGMA = this.get('overviewBgBlurSigma');
        this.APP_GRID_BG_BLUR_SIGMA = this.get('appGridBgBlurSigma');
        this.SMOOTH_BLUR_TRANSITIONS = this.get('smoothBlurTransitions');

        this.OVERVIEW_MODE = this.get('overviewMode');
        this.OVERVIEW_MODE2 = this.OVERVIEW_MODE === 2;
        this.WORKSPACE_MODE = this.OVERVIEW_MODE ? 0 : 1;

        this.STATIC_WS_SWITCHER_BG = this.get('workspaceSwitcherAnimation');

        this.ANIMATION_TIME_FACTOR = this.get('animationSpeedFactor') / 100;

        this.SEARCH_ICON_SIZE = this.get('searchIconSize');
        this.SEARCH_VIEW_SCALE = this.get('searchViewScale') / 100;
        this.SEARCH_MAX_ROWS = this.get('searchMaxResultsRows');
        this.SEARCH_FUZZY = this.get('searchFuzzy');
        this.SEARCH_DELAY = 0;

        this.APP_GRID_ALLOW_INCOMPLETE_PAGES = this.get('appGridIncompletePages');
        this.APP_GRID_ICON_SIZE = this.get('appGridIconSize');
        this.APP_GRID_COLUMNS = this.get('appGridColumns');
        this.APP_GRID_ROWS = this.get('appGridRows');
        this.APP_GRID_ADAPTIVE = !this.APP_GRID_COLUMNS && !this.APP_GRID_ROWS;

        this.APP_GRID_ORDER = this.get('appGridOrder');
        this.APP_GRID_ALPHABET = [1, 2].includes(this.APP_GRID_ORDER);
        this.APP_GRID_FOLDERS_FIRST = this.APP_GRID_ORDER === 1;
        this.APP_GRID_FOLDERS_LAST = this.APP_GRID_ORDER === 2;
        this.APP_GRID_USAGE = this.APP_GRID_ORDER === 3;

        this.APP_FOLDER_ORDER = this.get('appFolderOrder');
        this.APP_FOLDER_ALPHABET = this.APP_FOLDER_ORDER === 1;
        this.APP_FOLDER_USAGE = this.APP_FOLDER_ORDER === 2;

        this.APP_GRID_INCLUDE_DASH = this.get('appGridContent');
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

        this.APP_GRID_NAMES_MODE = this.get('appGridNamesMode');

        this.APP_GRID_FOLDER_ICON_SIZE = this.get('appGridFolderIconSize');
        this.APP_GRID_FOLDER_ICON_GRID = this.get('appGridFolderIconGrid');
        this.APP_GRID_FOLDER_COLUMNS = this.get('appGridFolderColumns');
        this.APP_GRID_FOLDER_ROWS = this.get('appGridFolderRows');
        this.APP_GRID_SPACING = this.get('appGridSpacing');
        this.APP_GRID_FOLDER_DEFAULT = this.APP_GRID_FOLDER_ROWS === 3 && this.APP_GRID_FOLDER_COLUMNS === 3;
        this.APP_GRID_FOLDER_ADAPTIVE = !this.APP_GRID_FOLDER_COLUMNS && !this.APP_GRID_FOLDER_ROWS;
        this.APP_GRID_ACTIVE_PREVIEW = this.get('appGridActivePreview');
        this.APP_GRID_FOLDER_CENTER = this.get('appGridFolderCenter');
        this.APP_GRID_PAGE_WIDTH_SCALE = this.get('appGridPageWidthScale') / 100;

        this.APP_GRID_ICON_SIZE_DEFAULT = this.APP_GRID_ACTIVE_PREVIEW && !this.APP_GRID_USAGE ? 176 : 96;
        this.APP_GRID_FOLDER_ICON_SIZE_DEFAULT = 96;

        this.APP_GRID_PERFORMANCE = this.get('appGridPerformance');

        this.WINDOW_SEARCH_ORDER = this.get('searchWindowsOrder');

        this.PANEL_POSITION_TOP = this.get('panelPosition') === 0;
        this.PANEL_MODE = this.get('panelVisibility');
        this.PANEL_DISABLED = this.PANEL_MODE === 2;
        this.PANEL_OVERVIEW_ONLY = this.PANEL_MODE === 1;

        this.WINDOW_ATTENTION_MODE = this.get('windowAttentionMode');
        this.WINDOW_ATTENTION_DISABLE_NOTIFICATIONS = this.WINDOW_ATTENTION_MODE === 1;
        this.WINDOW_ATTENTION_FOCUS_IMMEDIATELY = this.WINDOW_ATTENTION_MODE === 2;

        this.WS_SW_POPUP_H_POSITION = this.get('wsSwPopupHPosition') / 100;
        this.WS_SW_POPUP_V_POSITION = this.get('wsSwPopupVPosition') / 100;
        this.WS_SW_POPUP_MODE = this.get('wsSwPopupMode');

        this.WS_ANIMATION = this.get('workspaceAnimation');
        this.WS_WRAPAROUND = this.get('wsSwitcherWraparound');
        this.WS_IGNORE_LAST = this.get('wsSwitcherIgnoreLast');
        this.WS_SWITCHER_CURRENT_MONITOR = this.get('wsSwitcherMode') === 1;

        this.SHOW_FAV_NOTIFICATION = this.get('favoritesNotify');
        this.NOTIFICATION_POSITION = this.get('notificationPosition');

        this.OSD_POSITION = this.get('osdPosition');

        this.HOT_CORNER_ACTION = this.get('hotCornerAction');
        this.HOT_CORNER_POSITION = this.get('hotCornerPosition');
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
        this.HOT_CORNER_FULLSCREEN = this.get('hotCornerFullscreen');
        this.HOT_CORNER_RIPPLES = this.get('hotCornerRipples');

        this.ALWAYS_ACTIVATE_SELECTED_WINDOW = this.get('alwaysActivateSelectedWindow');
        this.WIN_PREVIEW_SEC_BTN_ACTION = this.get('winPreviewSecBtnAction');
        this.WIN_PREVIEW_MID_BTN_ACTION = this.get('winPreviewMidBtnAction');
        this.SHOW_CLOSE_BUTTON = this.get('winPreviewShowCloseButton');
        this.WINDOW_ICON_CLICK_ACTION = this.get('windowIconClickAction');

        this.OVERLAY_KEY_PRIMARY = this.get('overlayKeyPrimary');
        this.OVERLAY_KEY_SECONDARY = this.get('overlayKeySecondary');

        this.ESC_BEHAVIOR = this.get('overviewEscBehavior');
        this.CLICK_EMPTY_CLOSE = this.get('clickEmptyClose');

        this.WINDOW_THUMBNAIL_ENABLED = !!Me.Util.getEnabledExtensions('window-thumbnails').length;

        this.FIX_NEW_WINDOW_FOCUS = this.get('newWindowFocusFix');
        this.FIX_NEW_WINDOW_MONITOR = this.get('newWindowMonitorFix');

        this.HIGHLIGHTING_STYLE = this.get('highlightingStyle');
        this.HIGHLIGHT_DEFAULT = this.HIGHLIGHTING_STYLE === 0;
        this.HIGHLIGHT_UNDERLINE = this.HIGHLIGHTING_STYLE === 1;
        this.HIGHLIGHT_NONE = this.HIGHLIGHTING_STYLE === 2;

        this.DELAY_STARTUP = this.get('delayStartup');
    }

    _getAnimationDirection() {
        if (this.ORIENTATION)
            return this.WS_TMB_LEFT || !this.SHOW_WS_TMB ? 1 : 2; // 1 right, 2 left
        else
            return this.WS_TMB_TOP  || !this.SHOW_WS_TMB ? 3 : 5; // 3 bottom, 5 top
    }
};
