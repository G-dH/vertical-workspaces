/**
 * V-Shell (Vertical Workspaces)
 * prefs.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2025
 * @license    GPL-3.0
 */

'use strict';

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import * as Settings from './lib/settings.js';
import * as OptionsFactory from './lib/optionsFactory.js';

// gettext
let _;

export default class VShell extends ExtensionPreferences {
    _getPageList() {
        const itemFactory = new OptionsFactory.ItemFactory();
        const pageList = [
            {
                title: _('Profiles'),
                iconName: 'open-menu-symbolic',
                optionList: this._getProfilesOptionList(itemFactory),
            },
            {
                title: _('Layout'),
                iconName: 'view-grid-symbolic',
                optionList: this._getLayoutOptionList(itemFactory),
            },
            {
                title: _('Appearance'),
                iconName: 'view-reveal-symbolic',
                optionList: this._getAppearanceOptionList(itemFactory),
            },
            {
                title: _('Behavior'),
                iconName: 'system-run-symbolic',
                optionList: this._getBehaviorOptionList(itemFactory),
            },
            {
                title: _('App Grid'),
                iconName: 'view-app-grid-symbolic',
                optionList: this._getAppGridOptionList(itemFactory),
            },
            {
                title: _('Modules'),
                iconName: 'application-x-addon-symbolic',
                optionList: this._getModulesOptionList(itemFactory),
            },
            {
                title: _('Misc'),
                iconName: 'preferences-other-symbolic',
                optionList: this._getMiscOptionList(itemFactory),
            },
            {
                title: _('About'),
                iconName: 'preferences-system-details-symbolic',
                optionList: this._getAboutOptionList(itemFactory),
            },
        ];

        return pageList;
    }

    fillPreferencesWindow(window) {
        this.Me = {};
        this.Me.Settings = Settings;

        this.Me.gSettings = this.getSettings();
        this.Me.gettext = this.gettext.bind(this);
        _ = this.Me.gettext;
        this.Me.metadata = this.metadata;

        this.opt = new this.Me.Settings.Options(this.Me);
        this.Me.opt = this.opt;

        OptionsFactory.init(this.Me);

        window = new OptionsFactory.AdwPrefs(this.opt).getFilledWindow(window, this._getPageList());
        window.connect('close-request', () => {
            this.opt.destroy();
            this.opt = null;
            this.Me = null;
            _ = null;
        });

        window.set_default_size(840, 800);
    }


    // ////////////////////////////////////////////////////////////////////
    _getProfilesOptionList(itemFactory) {
        const optionList = [];
        // options item format:
        // (text, caption, widget, settings-variable, [options for combo], sensitivity-depends-on-bool-variable)

        optionList.push(itemFactory.getRowWidget(
            _('Custom Profiles'),
            null
        ));

        optionList.push(itemFactory.getRowWidget(
            _('Save your configurations'),
            _("The predefined sets of settings, which can help you with the initial configuration and exploring V-Shell's possibilities, can be renamed and overridden by your own configurations"),
            itemFactory.newLabel()
        ));

        optionList.push(itemFactory.getRowWidget(
            _('Profile 1'),
            null,
            itemFactory.newPresetButton(this.opt, 1)
        ));

        optionList.push(itemFactory.getRowWidget(
            _('Profile 2'),
            null,
            itemFactory.newPresetButton(this.opt, 2)
        ));

        optionList.push(itemFactory.getRowWidget(
            _('Profile 3'),
            null,
            itemFactory.newPresetButton(this.opt, 3)
        ));

        optionList.push(itemFactory.getRowWidget(
            _('Profile 4'),
            null,
            itemFactory.newPresetButton(this.opt, 4)
        ));

        return optionList;
    }

    _getLayoutOptionList(itemFactory) {
        const optionList = [];
        // options item format:
        // (text, caption, widget, settings-variable, [options for combo], sensitivity-depends-on-bool-variable)

        optionList.push(
            itemFactory.getRowWidget(
                _('Dash')
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Dash Position'),
                null,
                itemFactory.newDropDown(),
                'dashPosition',
                [
                    [_('Bottom'), 2],
                    [_('Left'), 3],
                    [_('Top'), 0],
                    [_('Right'), 1],
                    [_('Hide'), 4],
                ],
                'dashModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Center Horizontal Dash to Workspace'),
                _('If the Dash Position is set to Top or Bottom, the position will be recalculated relative to the workspace preview instead of the screen'),
                itemFactory.newSwitch(),
                'centerDashToWs',
                null,
                'dashModule'
            )
        );

        const dashPositionAdjustment = new Gtk.Adjustment({
            upper: 100,
            lower: -100,
            step_increment: 1,
            page_increment: 10,
        });

        const dashPositionScale = itemFactory.newScale(dashPositionAdjustment);
        dashPositionScale.add_mark(0, Gtk.PositionType.TOP, null);
        optionList.push(
            itemFactory.getRowWidget(
                _('Fine Tune Dash Position'),
                _('Adjusts the position of the dash on the axis given by the orientation of the workspaces'),
                dashPositionScale,
                'dashPositionAdjust',
                null
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Show Apps Icon Position'),
                _('Sets the position of the "Show Applications" icon in the Dash'),
                itemFactory.newDropDown(),
                'showAppsIconPosition',
                [
                    [_('Hide'), 2],
                    [_('Start'), 0],
                    [_('End'), 1],
                ],
                'dashModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Workspace Thumbnails / Orientation')
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Thumbnails Position / Workspaces Orientation'),
                _('Position of the workspace thumbnails on the screen also sets orientation of the workspaces to vertical or horizontal. You have two options to disable workspace thumbnails, one sets workspaces to vertical orientation, the second one to horizontal.'),
                itemFactory.newDropDown(),
                'workspaceThumbnailsPosition',
                // this mess is just because of backward compatibility
                [
                    [_('Left        \t Vertical Orientation'), 0],
                    [_('Right       \t Vertical Orientation'), 1],
                    [_('Hide        \t Vertical Orientation'), 4],
                    [_('Top         \t Horizontal Orientation'), 5],
                    [_('Bottom     \t Horizontal Orientation'), 6],
                    [_('Hide        \t Horizontal Orientation'), 9],
                ]
            )
        );

        const wstPositionAdjustment = new Gtk.Adjustment({
            upper: 100,
            lower: -100,
            step_increment: 1,
            page_increment: 10,
        });

        const wstPositionScale = itemFactory.newScale(wstPositionAdjustment);
        wstPositionScale.add_mark(0, Gtk.PositionType.TOP, null);
        optionList.push(
            itemFactory.getRowWidget(
                _('Fine Tune Workspace Thumbnails Position'),
                _('Adjusts the position of the thumbnails on the axis given by the orientation of the workspaces'),
                wstPositionScale,
                'wsTmbPositionAdjust'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Reserve Full Screen Height/Width for Thumbnails'),
                _('The whole screen height/width will be reserved for workspace thumbnails at the expense of space available for Dash (if the Dash is oriented in a different axis).'),
                itemFactory.newSwitch(),
                'wsThumbnailsFull'
            )
        );

        const wsThumbnailScaleAdjustment = new Gtk.Adjustment({
            upper: 30,
            lower: 0,
            step_increment: 1,
            page_increment: 1,
        });

        const wsThumbnailScale = itemFactory.newScale(wsThumbnailScaleAdjustment);
        wsThumbnailScale.add_mark(13, Gtk.PositionType.TOP, null);
        optionList.push(
            itemFactory.getRowWidget(
                _('Workspace Thumbnails Max Scale - Window Picker'),
                _('Adjusts the maximum size of the workspace thumbnails in the overview (percentage relative to display width)'),
                wsThumbnailScale,
                'wsThumbnailScale'
            )
        );

        const wsThumbnailAppScaleAdjustment = new Gtk.Adjustment({
            upper: 30,
            lower: 0,
            step_increment: 1,
            page_increment: 1,
        });

        const wsThumbnailAppScale = itemFactory.newScale(wsThumbnailAppScaleAdjustment);
        wsThumbnailAppScale.add_mark(13, Gtk.PositionType.TOP, null);
        optionList.push(
            itemFactory.getRowWidget(
                _('Workspace Thumbnails Max Scale - App View'),
                _('Allows you to set different thumbnails scale for the Applications view'),
                wsThumbnailAppScale,
                'wsThumbnailScaleAppGrid'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Workspace Preview')
            )
        );

        const wsScaleAdjustment = new Gtk.Adjustment({
            upper: 100,
            lower: 30,
            step_increment: 1,
            page_increment: 10,
        });

        const wsScaleScale = itemFactory.newScale(wsScaleAdjustment);
        wsScaleScale.add_mark(100, Gtk.PositionType.TOP, null);
        optionList.push(
            itemFactory.getRowWidget(
                _('Workspaces Scale'),
                _('Allows to shrink workspace previews to adjust spacing or fit more of the adjacent workspaces on the screen. Default size is calculated to use all available space with minimal spacing'),
                wsScaleScale,
                'wsPreviewScale'
            )
        );

        const wsSpacingAdjustment = new Gtk.Adjustment({
            upper: 500,
            lower: 10,
            step_increment: 1,
            page_increment: 10,
        });

        const wsSpacingScale = itemFactory.newScale(wsSpacingAdjustment);
        wsSpacingScale.add_mark(this.opt.WS_MAX_SPACING_OFF_SCREEN, Gtk.PositionType.TOP, null);
        optionList.push(
            itemFactory.getRowWidget(
                _('Workspaces Spacing'),
                _('Adjusts spacing in pixels between workspace previews, allowing you to control how much the adjacent workspaces overlap in the current workspace overview. Setting the value above 349 pixels disables the visibility of workspaces other than the current one during transitions to/from the app grid view, which can also save some graphical resources if many windows are open on other workspaces'),
                wsSpacingScale,
                'wsMaxSpacing'
            )
        );


        optionList.push(
            itemFactory.getRowWidget(
                _('App Grid')
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Center App Grid'),
                _('Centers the app grid relative to the display instead of available space'),
                itemFactory.newSwitch(),
                'centerAppGrid'
            )
        );


        optionList.push(
            itemFactory.getRowWidget(
                _('Search View')
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Center Search View'),
                _('Centers the search view relative to the display instead of available space'),
                itemFactory.newSwitch(),
                'centerSearch'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Always Show Search Entry'),
                _('If disabled, the search entry field will be hidden when not in use, so the workspace preview and app grid may take up more space'),
                itemFactory.newSwitch(),
                'showSearchEntry'
            )
        );

        const searchViewScaleAdjustment = new Gtk.Adjustment({
            upper: 150,
            lower: 50,
            step_increment: 1,
            page_increment: 1,
        });

        const searchViewScale = itemFactory.newScale(searchViewScaleAdjustment);
        searchViewScale.add_mark(100, Gtk.PositionType.TOP, null);
        optionList.push(
            itemFactory.getRowWidget(
                _('Search Results Width'),
                _('Adjusts the maximum width of search results view (percentage relative to default). This allows to fit more (or less) app icons into the app search result'),
                searchViewScale,
                'searchViewScale',
                null,
                'searchModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Panel')
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Main Panel Position'),
                _('Allows to place the main panel at the bottom of the primary display'),
                itemFactory.newDropDown(),
                'panelPosition',
                [
                    [_('Top (Default)'), 0],
                    [_('Bottom'), 1],
                ],
                'panelModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Main Panel Visibility'),
                _('Allows to hide main panel when not needed'),
                itemFactory.newDropDown(),
                'panelVisibility',
                [
                    [_('Always Visible (Default)'), 0],
                    [_('Overview Only'), 1],
                    [_('Always Hidden'), 2],
                // [_('Desktop View Only'), 3],
                ],
                'panelModule'
            )
        );


        optionList.push(
            itemFactory.getRowWidget(
                _('Workspace Switcher Popup')
            )
        );

        const hAdjustment = new Gtk.Adjustment({
            lower: 0,
            upper: 100,
            step_increment: 1,
            page_increment: 1,
        });

        const hScale = itemFactory.newScale(hAdjustment);
        hScale.add_mark(50, Gtk.PositionType.TOP, null);

        optionList.push(
            itemFactory.getRowWidget(
                _('Horizontal Position (percentage from the left)'),
                _('This popup shows up when you switch workspace using a keyboard shortcut or gesture outside of the overview. You can disable it on the "Behavior" tab. If you want more control over the popup, try the "Workspace Switcher Manager" extension'),
                hScale,
                'wsSwPopupHPosition',
                null,
                'workspaceSwitcherPopupModule'
            )
        );

        const vAdjustment = new Gtk.Adjustment({
            lower: 0,
            upper: 100,
            step_increment: 1,
            page_increment: 1,
        });

        const vScale = itemFactory.newScale(vAdjustment);
        vScale.add_mark(50, Gtk.PositionType.TOP, null);

        optionList.push(
            itemFactory.getRowWidget(
                _('Vertical Position (percentage from the top)'),
                null,
                vScale,
                'wsSwPopupVPosition',
                null,
                'workspaceSwitcherPopupModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Notifications and OSD')
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Notification Banner Position'),
                _('Choose where the notification banners appear on the screen'),
                itemFactory.newDropDown(),
                'notificationPosition',
                [
                    [_('Top Left'), 0],
                    [_('Top Center (Default)'), 1],
                    [_('Top Right'), 2],
                    [_('Bottom Left'), 3],
                    [_('Bottom Center'), 4],
                    [_('Bottom Right'), 5],
                ],
                'messageTrayModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('OSD Popup Position'),
                _('Choose where the OSD pop-ups (like sound volume level) appear on the screen'),
                itemFactory.newDropDown(),
                'osdPosition',
                [
                    [_('Disable'), 0],
                    [_('Top Left'), 1],
                    [_('Top Center'), 2],
                    [_('Top Right'), 3],
                    [_('Center'), 4],
                    [_('Bottom Left'), 5],
                    [_('Bottom Center (Default)'), 6],
                    [_('Bottom Right'), 7],
                ],
                'osdWindowModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Secondary Monitors')
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Workspace Thumbnails Position'),
                _('Allows to place workspace thumbnails of secondary monitors on the opposite side than on the primary monitor'),
                itemFactory.newDropDown(),
                'secWsThumbnailsPosition',
                [
                    [_('Same as Primary'), 2],
                    [_('Left / Top'), 0],
                    [_('Right / Bottom'), 1],
                    [_('Hide'), 3],
                ]
            )
        );

        const secWstPositionAdjustment = new Gtk.Adjustment({
            upper: 100,
            lower: -100,
            step_increment: 1,
            page_increment: 10,
        });

        const secWstPositionScale = itemFactory.newScale(secWstPositionAdjustment);
        secWstPositionScale.add_mark(0, Gtk.PositionType.TOP, null);
        optionList.push(
            itemFactory.getRowWidget(
                _('Fine Tune Workspace Thumbnails Position'),
                _('Adjusts the position of the thumbnails on the axis given by the orientation of the workspaces'),
                secWstPositionScale,
                'secWsTmbPositionAdjust'
            )
        );

        const secWsThumbnailScaleAdjustment = new Gtk.Adjustment({
            upper: 30,
            lower: 0,
            step_increment: 1,
            page_increment: 1,
        });

        const secWsThumbnailScale = itemFactory.newScale(secWsThumbnailScaleAdjustment);
        secWsThumbnailScale.add_mark(13, Gtk.PositionType.TOP, null);
        optionList.push(
            itemFactory.getRowWidget(
                _('Workspace Thumbnails Max Scale'),
                _('Adjusts maximum size of the workspace thumbnails (percentage relative to the display width / height) for secondary monitors'),
                secWsThumbnailScale,
                'secWsThumbnailScale'
            )
        );

        const wsSecScaleAdjustment = new Gtk.Adjustment({
            upper: 100,
            lower: 30,
            step_increment: 1,
            page_increment: 10,
        });

        const wsSecScaleScale = itemFactory.newScale(wsSecScaleAdjustment);
        wsScaleScale.add_mark(95, Gtk.PositionType.TOP, null);
        optionList.push(
            itemFactory.getRowWidget(
                _('Workspace Preview Scale'),
                _('Allows to scale down workspace previews on secondary monitors'),
                wsSecScaleScale,
                'secWsPreviewScale'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Shift Overview by Panel Height'),
                _('This option can help align the overview of the secondary monitor with the primary one'),
                itemFactory.newSwitch(),
                'secWsPreviewShift'
            )
        );



        return optionList;
    }

    _getAppearanceOptionList(itemFactory) {
        const optionList = [];
        // options item format:
        // (text, caption, widget, settings-variable, [options for combo], sensitivity-depends-on-bool-variable)

        // ----------------------------------------------------------------
        optionList.push(
            itemFactory.getRowWidget(
                _('Dash')
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Dash Max Icon Size'),
                _('Maximum size of Dash icons in pixels. Adaptive option switches between default 64 and 48 for low resolution displays'),
                itemFactory.newDropDown(),
                'dashMaxIconSize',
                [
                    [_('Adaptive (Default)'),  0],
                    [_('128'),     128],
                    [_('112'),     112],
                    [_('96'),       96],
                    [_('80'),       80],
                    [_('64'),       64],
                    [_('48'),       48],
                    [_('32'),       32],
                ],
                'dashModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Dash Background Style'),
                _('Allows you to change the background color of the dash to match the search results an app folders'),
                itemFactory.newDropDown(),
                'dashBgColor',
                [
                    [_('Default'), 0],
                    [_('Light'), 1],
                ],
                'dashModule'
            )
        );

        const dashBgAdjustment = new Gtk.Adjustment({
            upper: 100,
            lower: 0,
            step_increment: 1,
            page_increment: 10,
        });

        const dashBgOpacityScale = itemFactory.newScale(dashBgAdjustment);
        optionList.push(
            itemFactory.getRowWidget(
                _('Dash Background Opacity'),
                _('Adjusts the opacity of the Dash background'),
                dashBgOpacityScale,
                'dashBgOpacity',
                null,
                'dashModule'
            )
        );

        const dashRadAdjustment = new Gtk.Adjustment({
            upper: 50,
            lower: 0,
            step_increment: 1,
            page_increment: 1,
        });

        const dashBgRadiusScale = itemFactory.newScale(dashRadAdjustment);
        optionList.push(
            itemFactory.getRowWidget(
                _('Dash Background Radius'),
                _('Adjusts the border radius of the Dash background in pixels. 0 means the default value given by the current theme style'),
                dashBgRadiusScale,
                'dashBgRadius',
                null,
                'dashModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Dash Background GNOME 3 Style'),
                _('Background of the vertically oriented dash will imitate the GNOME 3 style'),
                itemFactory.newSwitch(),
                'dashBgGS3Style',
                null,
                'dashModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Running App Indicator'),
                _('Allows you to change style of the running app indicator under the app icon'),
                itemFactory.newDropDown(),
                'runningDotStyle',
                [
                    [_('Dot (Default)'), 0],
                    [_('Line'), 1],
                ],
                'dashModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Workspace Thumbnails')
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Show Workspace Thumbnail Labels'),
                _('Each workspace thumbnail can show label with its index and name (if defined in the system settings) or name/title of its most recently used app/window'),
                itemFactory.newDropDown(),
                'showWsTmbLabels',
                [
                    [_('Disable'), 0],
                    [_('Index'), 1],
                    [_('Index + WS Name'), 2],
                    [_('Index + App Name'), 3],
                    [_('Index + Window Title'), 4],
                ]
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Show WS Thumbnail Label on Hover'),
                _('Show the label only when the mouse pointer hovers over the thumbnail'),
                itemFactory.newSwitch(),
                'showWsTmbLabelsOnHover'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Show Wallpaper in Workspace Thumbnails'),
                _('All workspace thumbnails will include the current desktop background'),
                itemFactory.newSwitch(),
                'showWsSwitcherBg'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Window Preview')
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Window Preview App Icon Size'),
                null,
                itemFactory.newDropDown(),
                'winPreviewIconSize',
                [
                    [_('64 (Default)'), 0],
                    [_('48'), 1],
                    [_('32'), 2],
                    [_('22'), 3],
                    [_('Disable'), 4],
                ],
                'windowPreviewModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Window Title Position / Visibility'),
                _('Sets the position of the window title that is displayed when the mouse hovers over the window or can always be visible'),
                itemFactory.newDropDown(),
                'winTitlePosition',
                [
                    [_('Below Window (Default)'), 2],
                    [_('Inside Window'), 0],
                    [_('Inside - Always Visible'), 1],
                    [_('On Top'), 3],
                    [_('On Top - Always Visible'), 4],
                ],
                'windowPreviewModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Show Close Window Button'),
                _('Allows you to hide close window button'),
                itemFactory.newSwitch(),
                'winPreviewShowCloseButton',
                null,
                'windowPreviewModule'
            )
        );


        optionList.push(
            itemFactory.getRowWidget(
                _('Workspace Preview')
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Show Workspace Preview Background'),
                _('Allows to hide the background of the workspace preview'),
                itemFactory.newSwitch(),
                'showWsPreviewBg'
            )
        );

        const wsPreviewBgRadiusAdjustment = new Gtk.Adjustment({
            upper: 60,
            lower: 5,
            step_increment: 1,
            page_increment: 5,
        });

        const wsPreviewBgRadiusSpinButton = itemFactory.newScale(wsPreviewBgRadiusAdjustment);
        wsPreviewBgRadiusSpinButton.add_mark(30, Gtk.PositionType.TOP, null);
        optionList.push(
            itemFactory.getRowWidget(
                _('Workspace Background Corner Radius'),
                _('Adjusts the corner radius of the workspace preview in the overview'),
                wsPreviewBgRadiusSpinButton,
                'wsPreviewBgRadius'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Search')
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('App Search Icon Size'),
                _('Size of results provided by the App Search Provider - smaller size allows to fit more results. Adaptive option switches between default 96 and 64 for low resolution displays'),
                itemFactory.newDropDown(),
                'searchIconSize',
                [
                    [_('Adaptive'), 0],
                    [_('128'), 128],
                    [_('112'), 112],
                    [_('96 (Default)'), 96],
                    [_('80'), 80],
                    [_('64'), 64],
                    [_('48'), 48],
                    [_('32'), 32],
                ],
                'searchModule'
            )
        );

        const maxSearchResultsAdjustment = new Gtk.Adjustment({
            upper: 50,
            lower: 1,
            step_increment: 1,
            page_increment: 5,
        });

        const maxSearchResultsSpinButton = itemFactory.newScale(maxSearchResultsAdjustment);
        maxSearchResultsSpinButton.add_mark(10, Gtk.PositionType.TOP, null);
        maxSearchResultsSpinButton.add_mark(20, Gtk.PositionType.TOP, null);
        maxSearchResultsSpinButton.add_mark(30, Gtk.PositionType.TOP, null);
        maxSearchResultsSpinButton.add_mark(40, Gtk.PositionType.TOP, null);
        optionList.push(
            itemFactory.getRowWidget(
                _('Max Search Results Rows'),
                _('Sets the maximum number of rows for result lists of all search providers except the window search provider which always lists all results'),
                maxSearchResultsSpinButton,
                'searchMaxResultsRows',
                null,
                'searchModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Search Results Style'),
                _('Sets style of the search results background. When the Static Workspace Overview Mode is active, the Dark style is used despite this option. The Dark style also ignores the overview background blur and brightness configured for the search view'),
                itemFactory.newDropDown(),
                'searchResultsBgStyle',
                [
                    [_('Transparent (Default)'), 0],
                    [_('Dark'), 1],
                ]
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Highlighting'),
                _('The GNOME default highlighting style (bold) causes strings to be "randomly" ellipsized, often preventing you from seeing the whole string, even if there is space for it. The selected style will be applied to all search results globally. If you are using other extensions that offer this option, make sure you set the same setting in all of them.'),
                itemFactory.newDropDown(),
                'highlightingStyle',
                [
                    [_('Bold (Default)'), 0],
                    [_('Underline'), 1],
                    [_('None'), 2],
                ]
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Panel')
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Overview Panel Style'),
                _('Panel background style in overview'),
                itemFactory.newDropDown(),
                'panelOverviewStyle',
                [
                    [_('Same as Desktop'), 0],
                    [_('Transparent (Default)'), 1],
                ]
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Overview Background')
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Show wallpaper'),
                _('Replaces the solid grey background in the overview with the current desktop wallpaper. If you have a weak computer or prefer low system load and want to blur the wallpaper, the "Fast Blur Transitions" option is for you'),
                itemFactory.newDropDown(),
                'showOverviewBackground',
                [
                    [_('Disable (Default)'), 0],
                    [_('Enable - Fast Blur Transitions'), 1],
                    [_('Enable - Smooth Blur Transitions'), 2],
                ]
            )
        );

        const brightnessBgAdjustment = new Gtk.Adjustment({
            upper: 100,
            lower: 0,
            step_increment: 1,
            page_increment: 10,
        });

        const bgBrightnessScale = itemFactory.newScale(brightnessBgAdjustment);
        optionList.push(
            itemFactory.getRowWidget(
                _('Brightness - Window Picker'),
                _('Brightness of the background wallpaper in the overview'),
                bgBrightnessScale,
                'overviewBgBrightness',
                null,
                'showOverviewBackground'
            )
        );

        const appGridBrightnessBgAdjustment = new Gtk.Adjustment({
            upper: 100,
            lower: 0,
            step_increment: 1,
            page_increment: 10,
        });

        const appGridBrightnessScale = itemFactory.newScale(appGridBrightnessBgAdjustment);
        optionList.push(
            itemFactory.getRowWidget(
                _('Brightness - App Grid'),
                _('Brightness of the background wallpaper in the application menu'),
                appGridBrightnessScale,
                'appGridBgBrightness',
                null,
                'showOverviewBackground'
            )
        );

        const searchBrightnessBgAdjustment = new Gtk.Adjustment({
            upper: 100,
            lower: 0,
            step_increment: 1,
            page_increment: 10,
        });

        const searchBgBrightnessScale = itemFactory.newScale(searchBrightnessBgAdjustment);
        optionList.push(
            itemFactory.getRowWidget(
                _('Brightness - Search View'),
                _('Allows you to set a lower background brightness for search view where text visibility is more important'),
                searchBgBrightnessScale,
                'searchBgBrightness',
                null,
                'showOverviewBackground'
            )
        );

        const blurBgAdjustment = new Gtk.Adjustment({
            upper: 300,
            lower: 0,
            step_increment: 1,
            page_increment: 10,
        });

        const bgBlurScale = itemFactory.newScale(blurBgAdjustment);
        optionList.push(
            itemFactory.getRowWidget(
                _('Blur Window Picker Background'),
                _('Sets the amount of background blur in the window picker view'),
                bgBlurScale,
                'overviewBgBlurSigma',
                null,
                'showOverviewBackground'
            )
        );

        const blurAppBgAdjustment = new Gtk.Adjustment({
            upper: 300,
            lower: 0,
            step_increment: 1,
            page_increment: 10,
        });

        const bgAppBlurScale = itemFactory.newScale(blurAppBgAdjustment);
        optionList.push(
            itemFactory.getRowWidget(
                _('Blur App Grid/Search View Background'),
                _('Sets the amount of background blur in the app grid and search results views'),
                bgAppBlurScale,
                'appGridBgBlurSigma',
                null,
                'showOverviewBackground'
            )
        );

        return optionList;
    }
    // ----------------------------------------------------------------

    _getBehaviorOptionList(itemFactory) {
        const optionList = [];

        optionList.push(
            itemFactory.getRowWidget(
                _('Overview')
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Overview Mode'),
                _('The Expose Windows on Hover mode does not expose the workspace preview windows until the mouse pointer enters any window\nThe Static Workspace mode keeps the workspace static when you activate the overview, it only shows Dash, workspace thumbnails and search entry over the workspace and only clicking on an active workspace thumbnail activates the default overview'),
                itemFactory.newDropDown(),
                'overviewMode',
                [
                    [_('Default'), 0],
                    [_('Expose Windows on Hover'), 1],
                    [_('Static Workspace'), 2],
                ]
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Startup State'),
                _('Allows to change the state in which GNOME Shell starts a session'),
                itemFactory.newDropDown(),
                'startupState',
                [
                    [_('Overview (Default)'), 0],
                    [_('Desktop'), 1],
                    [_('Applications'), 2],
                ]
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Escape Key Behavior'),
                _('Allows you to close the overview with a single press of the Escape key, even from the application grid or from search, if the search entry field does not have focus'),
                itemFactory.newDropDown(),
                'overviewEscBehavior',
                [
                    [_('Default'), 0],
                    [_('Close Overview'), 1],
                ],
                'searchControllerModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Click Empty Space To Close'),
                _('Enables clicking on an empty space in the overview to close it'),
                itemFactory.newSwitch(),
                'clickEmptyClose',
                null
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Overlay Key (Super/Windows)')
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Single-Press Action'),
                _('Disable or change behavior when you press and release the Super key. The "Search Windows" options requires the "WSP (Window Search Provider)" extension installed and enabled. Link is available on the Modules tab in Settings. If you want another extension (like AATWS) to handle the overlay key, set this option to "Overview - Window Picker (Default)" and the "Double-Press Action" option to "Applications (Default)"'),
                itemFactory.newDropDown(),
                'overlayKeyPrimary',
                [
                    [_('Disable'), 0],
                    [_('Follow Global Overview Mode'), 1],
                    [_('Overview - Window Picker (Default)'), 2],
                    [_('Applications'), 3],
                    [_('Overview - Static WS Preview'), 4],
                    [_('Overview - Static Workspace'), 5],
                    [_('Search Windows (requires WSP extension)'), 6],
                // [_('Search Recent Files'), 7],
                ],
                'overlayKeyModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Double-Press Action'),
                _('Disable or change behavior when you double-press the Super key. The "Search Windows" option requires the "WSP (Window Search Provider)" extension installed and enabled. The "Static WS Overview - Expose Windows" option allows you to switch to default Activities Overview window picker view if you set static workspace (preview) for the single press/release Super key action'),
                itemFactory.newDropDown(),
                'overlayKeySecondary',
                [
                    [_('Disable'), 0],
                    [_('Applications (Default)'), 1],
                    [_('Search Windows (requires WSP extension)'), 2],
                    [_('Overview - Window Picker'), 3],
                ],
                'overlayKeyModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Hot Corner (Install Custom Hot Corners - Extended for more options)')
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Hot Corner Action'),
                _('Disable or change behavior of the hot corner. Holding down the Ctrl key while hitting the hot corner switches between Overview/Applications actions. The "Search Windows" option requires the "WSP (Window Search Provider)" extension installed and enabled'),
                itemFactory.newDropDown(),
                'hotCornerAction',
                [
                    [_('Disable'), 0],
                    [_('Follow Global Overview Mode'), 1],
                    [_('Overview - Window Picker (Default)'), 2],
                    [_('Applications'), 3],
                    [_('Overview - Static WS Preview'), 4],
                    [_('Overview - Static Workspace'), 5],
                    [_('Search Windows (requires WSP extension)'), 6],
                ],
                'layoutModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Hot Corner Position'),
                _('Choose which corner of your monitors will be active. If you choose "Follow Dash" option, the corner will be placed near the left or top edge of the Dash. The last option extends the hot corner trigger to cover the entire ege of the monitor where Dash is located'),
                itemFactory.newDropDown(),
                'hotCornerPosition',
                [
                    [_('Default'), 0],
                    [_('Top Left'), 1],
                    [_('Top Right'), 2],
                    [_('Bottom Left'), 3],
                    [_('Bottom Right'), 4],
                    [_('Follow Dash'), 5],
                    [_('Follow Dash - Hot Edge'), 6],
                ],
                'layoutModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Enable Hot Corner in Full-Screen Mode'),
                _('If you often work with full-screen applications and want the hot corner to be usable'),
                itemFactory.newSwitch(),
                'hotCornerFullscreen',
                null,
                'layoutModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Show Ripples Animation'),
                _('The ripple animation is played when the hot corner is activated. The ripple size has been reduced to be less distracting'),
                itemFactory.newSwitch(),
                'hotCornerRipples',
                null,
                'layoutModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Dash')
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Isolate Workspaces'),
                _('Dash will only show apps and windows from the current workspace'),
                itemFactory.newSwitch(),
                'dashIsolateWorkspaces',
                null,
                'dashModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('App Icon - Click Behavior'),
                _('Choose your preferred behavior when clicking on an app icon. The "Prefer Current Workspace" option opens a new app window if not present in the current workspace. The "Open New Window" option also switches behavior of the middle click to "Activate" since its default behavior is to open a new window'),
                itemFactory.newDropDown(),
                'dashShowWindowsBeforeActivation',
                [
                    [_('Activate App Immediately'), 0],
                    [_('First Switch to Workspace'), 1],
                    [_('Open New Window (if supported)'), 2],
                    [_('Prefer Current Workspace'), 3],
                ],
                'dashModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('App Icon - Scroll Action'),
                _('Choose the behavior when scrolling over an app icon. The window cycler works with a list of windows sorted by the "Most Recently Used" and grouped by workspaces. Scrolling up cycles through previously used windows on the same workspace and then switches to another workspace, if any'),
                itemFactory.newDropDown(),
                'dashIconScroll',
                [
                    [_('Default'), 0],
                    [_('Cycle App Windows - Highlight Selected'), 1],
                    [_('Cycle App Windows - Highlight App'), 2],
                ],
                'dashModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('App Menu')
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Add Force Quit'),
                _('Adds a "Force Quit" menu item to the application menu that appears when right-clicking an app icon'),
                itemFactory.newSwitch(),
                'appMenuForceQuit',
                null,
                'dashModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Add Close Windows on Current Workspace'),
                _('Adds a "Close Windows on Current Workspace" menu item to the application menu that appears when right-clicking an app icon'),
                itemFactory.newSwitch(),
                'appMenuCloseWinsWs',
                null,
                'dashModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Add Move App to Current Workspace'),
                _('Adds a "Move App to Current Workspace" menu item to the application menu that appears when right-clicking an app icon'),
                itemFactory.newSwitch(),
                'appMenuMoveApp',
                null,
                'dashModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Add Create Window Thumbnail'),
                _('Requires WTMB extension installed and enabled. Adds a "Create Window Thumbnail" menu item to the application menu that appears when right-clicking an app icon'),
                itemFactory.newSwitch(),
                'appMenuWindowTmb',
                null,
                'dashModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Workspace Thumbnails')
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Close Workspace Button'),
                _('The Close Workspace button appears on the workspace thumbnail when you hover over it and allows you to close all windows on the workspace. You can choose a "safety lock" to prevent accidental use'),
                itemFactory.newDropDown(),
                'closeWsButtonMode',
                [
                    [_('Hide'), 0],
                    [_('Single Click'), 1],
                    [_('Double Click'), 2],
                    [_('Ctrl Key + Click'), 3],
                ]
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Workspace Preview')
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Sort Windows'),
                _('Sort windows in the overview differently from the default screen position. The stable sequence is determined by the order in which the windows were opened'),
                itemFactory.newDropDown(),
                'overviewSortWindows',
                [
                    [_('Position (Default)'), 0],
                    [_('Most Recently Used'), 1],
                    [_('Stable Sequence'), 2],
                ],
                'windowPreviewModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Initial Window Selection'),
                _('Automatically select a window in the overview and ignore the pointer to speed up keyboard navigation'),
                itemFactory.newDropDown(),
                'overviewSelectWindow',
                [
                    [_('Pointer (Default)'), 0],
                    [_('First'), 1],
                    [_('Currently Focused'), 2],
                    [_('Previously Focused'), 3],
                ]
            )
        );

        const winHeightCompAdjustment = new Gtk.Adjustment({
            upper: 100,
            lower: 0,
            step_increment: 10,
            page_increment: 10,
        });

        const winHeightCompScale = itemFactory.newScale(winHeightCompAdjustment);
        winHeightCompScale.add_mark(50, Gtk.PositionType.TOP, null);
        winHeightCompScale.add_mark(100, Gtk.PositionType.TOP, null);
        optionList.push(
            itemFactory.getRowWidget(
                _('Window Height Compensation'),
                _('Controls the amount of height compensation for smaller window thumbnails relative to the tallest one. 0 keeps the original scale ratio, while 100 makes all thumbnails the same height'),
                winHeightCompScale,
                'winPreviewHeightCompensation',
                null,
                'workspaceModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Window Preview')
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Secondary Button Click Action'),
                _('Allows you to add a secondary mouse click action to the window preview'),
                itemFactory.newDropDown(),
                'winPreviewSecBtnAction',
                [
                    [_('Activate Window (Default)'), 0],
                    [_('Close Window'), 1],
                    [_('Search For Same App Windows'), 2],
                    [_('Create Window Thumbnail/PiP (requires WTMB extension)'), 3],
                ],
                'windowPreviewModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Middle Button Click Action'),
                _('Allows you to add a middle mouse click action to the window preview'),
                itemFactory.newDropDown(),
                'winPreviewMidBtnAction',
                [
                    [_('Activate Window (Default)'), 0],
                    [_('Close Window'), 1],
                    [_('Search For Same App Windows'), 2],
                    [_('Create Window Thumbnail/PiP (requires WTMB extension)'), 3],
                ],
                'windowPreviewModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('App Icon Click Action'),
                _('Select the action to take when the application icon on the window preview is clicked'),
                itemFactory.newDropDown(),
                'windowIconClickAction',
                [
                    [_('Activate Window (Default)'), 0],
                    [_('Search For Same App Windows'), 1],
                    [_('Create Window Thumbnail/PiP (requires WTMB extension)'), 2],
                ],
                'windowPreviewModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Always Activate Selected'),
                _('If enabled, the currently selected window will be activated when leaving the Overview even without clicking. Usage example - press Super to open the Overview, place mouse pointer over a window, press Super again to activate the window'),
                itemFactory.newSwitch(),
                'alwaysActivateSelectedWindow',
                null,
                'windowPreviewModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Search')
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('App Grid Search Mode'),
                _('Select how the search should behave when initiated from the app grid view. The "Filtered App Grid View" option shows all resulting app icons sorted by usage in the app grid view instead of switching to the default search view'),
                itemFactory.newDropDown(),
                'searchAppGridMode',
                [
                    [_('Search View (Default)'), 0],
                    [_('Filtered App Grid View'), 1],
                ],
                'searchModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Enable Fuzzy Match'),
                _('Enabling the fuzzy match allows you to skip letters in the pattern you are searching for and find "Firefox" even if you type "ffx". Works only for the App, Windows, Extensions and Recent files search providers'),
                itemFactory.newSwitch(),
                'searchFuzzy',
                null,
                'searchModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Include Settings Panels in App Results'),
                _('The GNOME Settings app provides launchers for all its panels/sections. This option adds them alongside other apps, allowing you to access individual settings more quickly'),
                itemFactory.newSwitch(),
                'searchIncludeSettings',
                null,
                'searchModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Animations')
            )
        );

        const animationSpeedAdjustment = new Gtk.Adjustment({
            upper: 500,
            lower: 1,
            step_increment: 10,
            page_increment: 100,
        });

        const animationSpeedScale = itemFactory.newScale(animationSpeedAdjustment);
        animationSpeedScale.add_mark(100, Gtk.PositionType.TOP, null);
        optionList.push(
            itemFactory.getRowWidget(
                _('Animation Speed'),
                _('Adjusts the global animation speed in percentage of the default duration - higher value means slower animation'),
                animationSpeedScale,
                'animationSpeedFactor'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('App Grid Animation'),
                _('When entering the App Grid view, the app grid animates from the edge of the screen. You can choose the direction, keep the Default (direction will be selected automatically) or disable the animation if you don\'t like it'),
                itemFactory.newDropDown(),
                'appGridAnimation',
                [
                    [_('Default'), 4],
                    [_('Disable'), 0],
                    [_('Right to Left'), 1],
                    [_('Left to Right'), 2],
                    [_('Bottom to Top'), 3],
                    [_('Top to Bottom'), 5],
                ]
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Search View Animation'),
                _('When search is activated the search view with search results can animate from the edge of the screen. You can choose the direction, keep the Default (currently Bottom to Top) or disable the animation if you don\'t like it.'),
                itemFactory.newDropDown(),
                'searchViewAnimation',
                [
                    [_('Default'), 4],
                    [_('Disable'), 0],
                    [_('Right to Left'), 1],
                    [_('Left to Right'), 2],
                    [_('Bottom to Top'), 3],
                    [_('Top to Bottom'), 5],
                ]
            )
        );


        optionList.push(
            itemFactory.getRowWidget(
                _('Workspace Preview Animation'),
                _('When entering or leaving the App Grid, the workspace preview can animate to/from workspace thumbnails'),
                itemFactory.newDropDown(),
                'workspaceAnimation',
                [
                    [_('Disable'), 0],
                    [_('Active Workspace Only'), 1],
                    [_('All Workspaces'), 2],
                ]
            )
        );


        optionList.push(
            itemFactory.getRowWidget(
                _('Workspace Switcher')
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Wraparound'),
                _('Continue from the last workspace to the first and vice versa'),
                itemFactory.newSwitch(),
                'wsSwitcherWraparound'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Ignore Last (empty) Workspace'),
                _('In Dynamic workspaces mode, there is always one empty workspace at the end. Switcher can ignore this last workspace'),
                itemFactory.newSwitch(),
                'wsSwitcherIgnoreLast'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Workspace Switcher Animation'),
                _('Allows you to disable movement of the desktop background during workspace switcher animation outside of the overview. The Static Background mode also keeps Conky and desktop icons on their place during switching.'),
                itemFactory.newDropDown(),
                'workspaceSwitcherAnimation',
                [
                    [_('Default'), 0],
                    [_('Static Background'), 1],
                ],
                'workspaceAnimationModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Workspace Switcher Mode (Isolate Monitors)'),
                _('Note that this is a workaround, not full-fledged feature. GNOME Shell does not support separate workspaces for each monitor, so V-Shell switches workspaces only on the primary monitor and moves windows across workspaces on secondary monitors in order to simulate independent behavior. The current monitor is determined by the position of the mouse pointer'),
                itemFactory.newDropDown(),
                'wsSwitcherMode',
                [
                    [_('Default'), 0],
                    [_('Current Monitor'), 1],
                ],
                'windowManagerModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Workspace Switcher Popup Mode'),
                _('This popup shows up when you switch workspace using a keyboard shortcut or gesture outside of the overview. You can to disable the popup at all, or show it on the current monitor (the one with mouse pointer) instead of the primary.'),
                itemFactory.newDropDown(),
                'wsSwPopupMode',
                [
                    [_('Disable'), 0],
                    [_('Show on Primary Monitor (Default)'), 1],
                    [_('Show on Current Monitor'), 2],
                ],
                'workspaceSwitcherPopupModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Notifications')
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Window Attention Handler'),
                _('When a window requires attention (often a new window), GNOME Shell shows you a notification about it. You can disable popups of these messages (notification will be pushed into the message tray silently) or focus the source window immediately instead'),
                itemFactory.newDropDown(),
                'windowAttentionMode',
                [
                    [_('Show Notifications (Default)'), 0],
                    [_('Disable Notification Popups'), 1],
                    [_('Immediately Focus Window'), 2],
                ],
                'windowAttentionHandlerModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Favorites'),
                _('Disable pin/unpin app notifications'),
                itemFactory.newDropDown(),
                'favoritesNotify',
                [
                    [_('Show Notifications (Default)'), 1],
                    [_('Disable Notifications'), 0],
                ],
                'appFavoritesModule'
            )
        );

        return optionList;
    }

    // -----------------------------------------------------------------------------------------------------------------

    _getAppGridOptionList(itemFactory) {
        const optionList = [];
        // options item format:
        // (text, caption, widget, settings-variable, [options for combo], sensitivity-depends-on-bool-variable)

        optionList.push(
            itemFactory.getRowWidget(
                _('Main App Grid')
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Apps Sorting'),
                _('Choose sorting method for the app grid. Note that sorting by usage ignores folders'),
                itemFactory.newDropDown(),
                'appGridOrder',
                [
                    [_('Custom (Default)'), 0],
                    [_('Alphabet'), 4],
                    [_('Alphabet - Folders First'), 1],
                    [_('Alphabet - Folders Last'), 2],
                    [_('Usage - No Folders'), 3],
                ],
                'appDisplayModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Icon Size'),
                _('Allows to set a fixed app grid icon size and bypass the default adaptive algorithm'),
                itemFactory.newDropDown(),
                'appGridIconSize',
                [
                    [_('Adaptive (Default)'), -1],
                    [_('256'), 256],
                    [_('224'), 224],
                    [_('208'), 208],
                    [_('192'), 192],
                    [_('176'), 176],
                    [_('160'), 160],
                    [_('144'), 144],
                    [_('128'), 128],
                    [_('112'), 112],
                    [_('96'), 96],
                    [_('80'), 80],
                    [_('64'), 64],
                    [_('48'), 48],
                // [_('32'), 32],
                ],
                'appDisplayModule'
            )
        );

        const columnsAdjustment = new Gtk.Adjustment({
            upper: 15,
            lower: 0,
            step_increment: 1,
            page_increment: 1,
        });

        const columnsSpinBtn = itemFactory.newSpinButton(columnsAdjustment);
        optionList.push(itemFactory.getRowWidget(
            _('Columns per Page (0 for adaptive grid)'),
            _('Number of columns in the application grid. If set to 0, the number will be set automatically to fit the available width'),
            columnsSpinBtn,
            'appGridColumns',
            null,
            'appDisplayModule'
        ));

        const rowsAdjustment = new Gtk.Adjustment({
            upper: 15,
            lower: 0,
            step_increment: 1,
            page_increment: 1,
        });

        const rowsSpinBtn = itemFactory.newSpinButton(rowsAdjustment);
        optionList.push(itemFactory.getRowWidget(
            _('Rows per Page (0 for adaptive grid)'),
            _('Number of rows in the application grid. If set to 0, the number will be set automatically to fit the available height'),
            rowsSpinBtn,
            'appGridRows',
            null,
            'appDisplayModule'
        ));

        const folderColumnsAdjustment = new Gtk.Adjustment({
            upper: 15,
            lower: 0,
            step_increment: 1,
            page_increment: 1,
        });

        const agPageAdjustment = new Gtk.Adjustment({
            upper: 100,
            lower: 50,
            step_increment: 1,
            page_increment: 10,
        });

        const agPageWidthScale = itemFactory.newScale(agPageAdjustment);
        agPageWidthScale.add_mark(60, Gtk.PositionType.TOP, null);
        agPageWidthScale.add_mark(70, Gtk.PositionType.TOP, null);
        agPageWidthScale.add_mark(80, Gtk.PositionType.TOP, null);
        agPageWidthScale.add_mark(90, Gtk.PositionType.TOP, null);
        optionList.push(
            itemFactory.getRowWidget(
                _('App Grid Page Width Scale'),
                _('Adjusts maximum app grid page width relative to the available space'),
                agPageWidthScale,
                'appGridPageWidthScale',
                null,
                'appDisplayModule'
            )
        );

        const aghPageAdjustment = new Gtk.Adjustment({
            upper: 100,
            lower: 50,
            step_increment: 1,
            page_increment: 10,
        });

        const agPageHeightScale = itemFactory.newScale(aghPageAdjustment);
        agPageHeightScale.add_mark(60, Gtk.PositionType.TOP, null);
        agPageHeightScale.add_mark(70, Gtk.PositionType.TOP, null);
        agPageHeightScale.add_mark(80, Gtk.PositionType.TOP, null);
        agPageHeightScale.add_mark(90, Gtk.PositionType.TOP, null);
        optionList.push(
            itemFactory.getRowWidget(
                _('App Grid Page Height Scale'),
                _('Adjusts maximum app grid page height relative to the available space'),
                agPageHeightScale,
                'appGridPageHeightScale',
                null,
                'appDisplayModule'
            )
        );

        const appGridSpacingAdjustment = new Gtk.Adjustment({
            upper: 30,
            lower: 5,
            step_increment: 1,
            page_increment: 5,
        });

        const appGridSpacingScale = itemFactory.newScale(appGridSpacingAdjustment);
        appGridSpacingScale.add_mark(12, Gtk.PositionType.TOP, null);
        optionList.push(
            itemFactory.getRowWidget(
                _('Grid Spacing'),
                _('V-Shell uses this value to calculate grid dimensions for adaptive options. However, the main grid automatically adjusts the spacing based on the grid and available space'),
                appGridSpacingScale,
                'appGridSpacing',
                null,
                'appDisplayModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Allow Incomplete Pages'),
                _('If disabled, icons from the next page (if any) are automatically moved to fill any empty slot left after an icon was (re)moved (to a folder for example)'),
                itemFactory.newSwitch(),
                'appGridIncompletePages',
                null,
                'appDisplayModule'
            )
        );

        // --------------------------------------------------------------------------------------

        optionList.push(
            itemFactory.getRowWidget(
                _('App Folders')
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Folder Apps Sorting'),
                _('Choose sorting method for app folders'),
                itemFactory.newDropDown(),
                'appFolderOrder',
                [
                    [_('Custom (Default)'), 0],
                    [_('Alphabet'), 1],
                    [_('Usage'), 2],
                ],
                'appDisplayModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Active Icons in Folder Preview'),
                _('If enabled, icons in the folder preview behaves like normal icons, you can activate or even drag them directly, without having to open the folder first. This option also affects the app grid default icon size'),
                itemFactory.newSwitch(),
                'appGridActivePreview',
                null,
                'appDisplayModule'
            )
        );

        const folderIconGridCombo = itemFactory.newDropDown();
        optionList.push(
            itemFactory.getRowWidget(
                _('App Folder Preview Grid Size'),
                _('Sets a grid size (number of icons) in the folder icon preview. 3x3 options automatically switches between 2x2 and 3x3 grid depending on the number of icons in the folder'),
                folderIconGridCombo,
                'appGridFolderIconGrid',
                [
                    [_('2x2 (Default)'), 2],
                    [_('3x3 for 5+ apps'), 3],
                    [_('3x3 for 9+ apps'), 4],
                ],
                'appDisplayModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Folder Icon Size'),
                _('Allows to set a fixed icon size and bypass the default adaptive algorithm in the open folder dialog'),
                itemFactory.newDropDown(),
                'appGridFolderIconSize',
                [
                    [_('Adaptive (Default)'), -1],
                    [_('128'), 128],
                    [_('112'), 112],
                    [_('96'), 96],
                    [_('80'), 80],
                    [_('64'), 64],
                    [_('48'), 48],
                ],
                'appDisplayModule'
            )
        );

        const folderColumnsSpinBtn = itemFactory.newSpinButton(folderColumnsAdjustment);
        optionList.push(itemFactory.getRowWidget(
            _('Maximum Number Of Columns (0 for automatic)'),
            _('Specifies the maximum number of columns per page in folder grids. If you leave the value at 0, the maximum number of columns will be calculated based on available space. The actual folder grid dimensions will be determined by the number of items within the set limits'),
            folderColumnsSpinBtn,
            'appGridFolderColumns',
            null,
            'appDisplayModule'
        ));

        const folderRowsAdjustment = new Gtk.Adjustment({
            upper: 15,
            lower: 0,
            step_increment: 1,
            page_increment: 1,
        });

        const folderRowsSpinBtn = itemFactory.newSpinButton(folderRowsAdjustment);
        optionList.push(itemFactory.getRowWidget(
            _('Maximum Number Of Rows (0 for automatic)'),
            _('Specifies the maximum number of rows per page in folder grids. If you leave the value at 0, the maximum number of rows will be calculated based on available space. The actual folder grid dimensions will be determined by the number of items within the set limits'),
            folderRowsSpinBtn,
            'appGridFolderRows',
            null,
            'appDisplayModule'
        ));

        const appFolderSpacingAdjustment = new Gtk.Adjustment({
            upper: 30,
            lower: 5,
            step_increment: 1,
            page_increment: 5,
        });

        const appFolderSpacingScale = itemFactory.newScale(appFolderSpacingAdjustment);
        appFolderSpacingScale.add_mark(12, Gtk.PositionType.TOP, null);
        optionList.push(
            itemFactory.getRowWidget(
                _('Folder Grid Spacing'),
                _('Adjusts the spacing between icons in a folder grid'),
                appFolderSpacingScale,
                'appGridFolderSpacing',
                null,
                'appDisplayModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Center Open Folders'),
                _("App folders may open in the center of the screen or be centered on the folder's source icon"),
                itemFactory.newSwitch(),
                'appGridFolderCenter',
                null,
                'appDisplayModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Show Close Folder Button'),
                _('The folder can be closed by right-clicking on the folder dialog or by left-clicking outside of it. However, in some situations, the close button can be useful'),
                itemFactory.newSwitch(),
                'appFolderCloseButton',
                null,
                'appDisplayModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Remove Folder Button'),
                _('The Remove Folder button lets you move all icons from the folder to the main app grid and delete the folder at once'),
                itemFactory.newDropDown(),
                'appFolderRemoveButton',
                [
                    [_('Hide (Default)'), 0],
                    [_('Single Click'), 1],
                    [_('Double Click'), 2],
                ],
                'appDisplayModule'
            )
        );

        // --------------------------------------------------------------------------------------

        optionList.push(
            itemFactory.getRowWidget(
                _('Content and Behavior')
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('App Grid Content'),
                _('The default Shell removes favorite apps, this option allows to duplicate them in the grid or remove also running applications. Option "Favorites and Running First" only works with the Alphabet and Usage sorting'),
                itemFactory.newDropDown(),
                'appGridContent',
                [
                    [_('Include All'), 0],
                    [_('Include All - Favorites and Running First'), 1],
                    [_('Exclude Favorites (Default)'), 2],
                    [_('Exclude Running'), 3],
                    [_('Exclude Favorites and Running'), 4],
                ],
                'appDisplayModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('App Labels Behavior'),
                _('Choose how and when to display app names'),
                itemFactory.newDropDown(),
                'appGridNamesMode',
                [
                    [_('Ellipsized - Expand Selected (Default)'), 0],
                    [_('Always Expanded'), 1],
                    [_('Hidden - Show Selected Only'), 2],
                ],
                'appDisplayModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Show Page Navigation Buttons'),
                _("You can hide the page navigation buttons if you don't need them or want to get more space for icons. The buttons are hidden automatically when there is only one page in the app grid"),
                itemFactory.newSwitch(),
                'appGridShowPageArrows',
                null,
                'appDisplayModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Remember Page'),
                _('Disables the default behavior in which app grid and folders always open on the first page'),
                itemFactory.newSwitch(),
                'appGridRememberPage',
                null,
                'appDisplayModule'
            )
        );


        // --------------------------------------------------------------------------------------

        optionList.push(
            itemFactory.getRowWidget(
                _('Performance')
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Smooth App Grid Animations'),
                _('This option allows V-Shell to pre-realize app grid and app folders during session startup in order to avoid stuttering animations when using them for the first time. If enabled, the session startup needs a little bit more time to finish and necessary memory will be allocated at this time'),
                itemFactory.newSwitch(),
                'appGridPerformance'
            )
        );

        // --------------------------------------------------------------------------------------

        optionList.push(
            itemFactory.getRowWidget(
                _('Reset')
            )
        );

        optionList.push(itemFactory.getRowWidget(
            _('Reset App Grid Layout'),
            _('Removes all stored app grid positions, after reset icons will be sorted alphabetically, except folder contents'),
            itemFactory.newResetButton(() => {
                const settings = new Gio.Settings({ schema_id: 'org.gnome.shell' });
                settings.set_value('app-picker-layout', new GLib.Variant('aa{sv}', []));
            })
        ));

        optionList.push(itemFactory.getRowWidget(
            _('Remove App Grid Folders'),
            _('Removes all folders, folder apps will move to the root grid'),
            itemFactory.newResetButton(() => {
                const settings = new Gio.Settings({ schema_id: 'org.gnome.desktop.app-folders' });
                settings.set_strv('folder-children', []);
            })
        ));

        return optionList;
    }

    _getModulesOptionList(itemFactory) {
        const optionList = [];
        // options item format:
        // (text, caption, widget, settings-variable, [options for combo], sensitivity-depends-on-bool-variable)
        optionList.push(
            itemFactory.getRowWidget(
                _('Optional Modules')
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Windows Search Provider - Moved from V-Shell to the standalone "WSP" extension'),
                _('NOTE: This module has been released as a standalone extension with new features, click to learn more. Related V-Shell options are still available if you install the WSP extension.\n\nWSP adds adds open windows to the search results. You can search app names and window titles. You can also use "wq//" or custom prefix (also by pressing the Space hotkey in the overview, or clicking dash icon) to suppress results from other search providers'),
                itemFactory.newLinkButton('https://github.com/G-dH/windows-search-provider?tab=readme-ov-file#wsp-windows-search-provider')
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Extensions Search Provider - Moved from V-Shell to the standalone "ESP" extension'),
                _('NOTE: This module has been released as a standalone extension with new features, click to learn more. Related V-Shell options are still available if you install the ESP extension.\n\nESP adds extensions to the search results. You can also use "eq//" or custom prefix (also by pressing the Ctrl + Shift + Space hotkey in the overview, or clicking dash icon) to suppress results from other search providers'),
                itemFactory.newLinkButton('https://github.com/G-dH/extensions-search-provider?tab=readme-ov-file#esp-extensions-search-provider')
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Window Thumbnails (PiP) - Moved from V-Shell to the standalone "WTMB" extension'),
                _('NOTE: This module has been released as a standalone extension with new features, click to learn more. Related V-Shell options are still available if you install the WTMB extension.\n\nWTMB allows the creation of Picture-in-Picture like window thumbnails that you can use for monitoring of windows on another workspace'),
                itemFactory.newLinkButton('https://github.com/G-dH/window-thumbnails?tab=readme-ov-file#wtmb-window-thumbnails')
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Built-in Modules (allows to disable modules that conflict with another extension)')
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('AppDisplay / IconGrid'),
                _('App grid customization and options'),
                itemFactory.newSwitch(),
                'appDisplayModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('AppFavorites'),
                _('Pin/unpin app notification options'),
                itemFactory.newSwitch(),
                'appFavoritesModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Dash'),
                _('Dash customization and options, support for vertical orientation'),
                itemFactory.newSwitch(),
                'dashModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Layout'),
                _('Hot corner options'),
                itemFactory.newSwitch(),
                'layoutModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('MessageTray'),
                _('Notification position options'),
                itemFactory.newSwitch(),
                'messageTrayModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('OsdWindow'),
                _('OSD position options'),
                itemFactory.newSwitch(),
                'osdWindowModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('OverlayKey'),
                _('Overlay (Super/Window) key options'),
                itemFactory.newSwitch(),
                'overlayKeyModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Panel'),
                _('Panel options'),
                itemFactory.newSwitch(),
                'panelModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Search'),
                _('Search view and app search provider customization and options'),
                itemFactory.newSwitch(),
                'searchModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('SearchController'),
                _('Escape key behavior options in the overview'),
                itemFactory.newSwitch(),
                'searchControllerModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('SwipeTracker'),
                _('Gestures for vertical workspace orientation'),
                itemFactory.newSwitch(),
                'swipeTrackerModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('WindowAttentionHandler'),
                _('Window attention handler options'),
                itemFactory.newSwitch(),
                'windowAttentionHandlerModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('WindowManager'),
                _('Fixes an upstream bug in the minimization animation of a full-screen window'),
                itemFactory.newSwitch(),
                'windowManagerModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('WindowPreview'),
                _('Window preview options, fixes an upstream bug that fills the system log with errors when you close a window from the overview or exit the overview with a gesture when any window is selected'),
                itemFactory.newSwitch(),
                'windowPreviewModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Workspace'),
                _('Fixes workspace preview allocations for vertical workspaces orientation and window scaling in static overview modes'),
                itemFactory.newSwitch(),
                'workspaceModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('WorkspaceAnimation'),
                _('Static workspace animation option'),
                itemFactory.newSwitch(),
                'workspaceAnimationModule'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('WorkspaceSwitcherPopup'),
                _('Workspace switcher popup orientation and position options'),
                itemFactory.newSwitch(),
                'workspaceSwitcherPopupModule'
            )
        );

        return optionList;
    }

    _getMiscOptionList(itemFactory) {
        const optionList = [];
        // options item format:
        // (text, caption, widget, settings-variable, [options for combo], sensitivity-depends-on-bool-variable)

        optionList.push(
            itemFactory.getRowWidget(
                _('Keyboard')
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Override Page Up/Down Shortcuts'),
                _('This option automatically overrides the (Shift +) Super + Page Up/Down keyboard shortcuts for the current workspace orientation. If you encounter any issues, check the configuration in the dconf editor'),
                itemFactory.newSwitch(),
                'enablePageShortcuts'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Workarounds / Hacks')
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Delay at Startup'),
                _("If you encounter issues during GNOME Shell startup after logging in, which could be caused by V-Shell's incompatibility with another extension, try enabling this option. When enabled, V-Shell is activated after the startup is complete. It will activate automatically when Dash to Dock, Ubuntu Dock or Dash to Panel extensions are detected."),
                itemFactory.newSwitch(),
                'delayStartup'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Fix New Window Not In Focus'),
                _('If you often find that the app window you open from the Activities overview does not get focus, try enabling this option.'),
                itemFactory.newSwitch(),
                'newWindowFocusFix'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Fix New Window Not On Current Monitor (experimental)'),
                _('If you use multiple monitors, you may encounter the issue of new windows opening on a different monitor than expected. This option moves those windows to the current monitor, determined by the position of the mouse pointer. However, this is a workaround, and some windows may override it, moving the window back to the previous monitor during initialization'),
                itemFactory.newSwitch(),
                'newWindowMonitorFix'
            )
        );

        return optionList;
    }

    // --------------------------------------------------------------------------------------------------

    _getAboutOptionList(itemFactory) {
        const optionList = [];

        optionList.push(itemFactory.getRowWidget(
            this.Me.metadata.name
        ));

        const versionName = this.Me.metadata['version-name'] ?? '';
        let version = this.Me.metadata['version'] ?? '';
        version = versionName && version ? `/${version}` : version;
        const versionStr = `${versionName}${version}`;
        optionList.push(itemFactory.getRowWidget(
            _('Version'),
            null,
            itemFactory.newLabel(versionStr)
        ));

        optionList.push(itemFactory.getRowWidget(
            _('Reset all options'),
            _('Reset all options to their default values'),
            itemFactory.newOptionsResetButton()
        ));


        optionList.push(itemFactory.getRowWidget(
            _('Links')
        ));

        optionList.push(itemFactory.getRowWidget(
            _('Homepage'),
            _('Source code and more info about this extension'),
            itemFactory.newLinkButton('https://github.com/G-dH/vertical-workspaces')
        ));

        optionList.push(itemFactory.getRowWidget(
            _('Changelog'),
            _("See what's changed."),
            itemFactory.newLinkButton('https://github.com/G-dH/vertical-workspaces/blob/main/CHANGELOG.md')
        ));

        optionList.push(itemFactory.getRowWidget(
            _('GNOME Extensions'),
            _('Rate and comment V-Shell on the GNOME Extensions site'),
            itemFactory.newLinkButton('https://extensions.gnome.org/extension/5177')
        ));

        optionList.push(itemFactory.getRowWidget(
            _('Report a bug or suggest new feature'),
            _('Help me to help you!'),
            itemFactory.newLinkButton('https://github.com/G-dH/vertical-workspaces/issues')
        ));

        optionList.push(itemFactory.getRowWidget(
            _('Buy Me a Coffee'),
            _('Enjoying V-Shell? Consider supporting it by buying me a coffee!'),
            itemFactory.newLinkButton('https://buymeacoffee.com/georgdh')
        ));

        return optionList;
    }
}
