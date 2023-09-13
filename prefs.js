/**
 * V-Shell (Vertical Workspaces)
 * prefs.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2023
 * @license    GPL-3.0
 */

'use strict';

const ExtensionUtils = imports.misc.extensionUtils;
const Import = ExtensionUtils.getCurrentExtension().imports.lib.import;
const GObject = imports.gi.GObject;

let Gi;
let Misc;
let Me;
let _;

let gOptions;

function init() {
    Import.init(true);
    Gi = Import.Gi;
    Misc = Import.Misc;
    Me = Import.Me;

    _ = Me.gettext;
    gOptions = Me.Opt;

    Gi.DropDownItem = DropDownItem;
    Me.OptionsFactory.init(Gi, Misc, Me);
}

function _getPageList() {
    const itemFactory = new Me.OptionsFactory.ItemFactory();
    const pageList = [
        {
            name: 'profiles',
            title: _('Profiles'),
            iconName: 'open-menu-symbolic',
            optionList: _getProfilesOptionList(itemFactory),
        },
        {
            name: 'layout',
            title: _('Layout'),
            iconName: 'view-grid-symbolic',
            optionList: _getLayoutOptionList(itemFactory),
        },
        {
            name: 'appearance',
            title: _('Appearance'),
            iconName: 'view-reveal-symbolic',
            optionList: _getAppearanceOptionList(itemFactory),
        },
        {
            name: 'behavior',
            title: _('Behavior'),
            iconName: 'system-run-symbolic',
            optionList: _getBehaviorOptionList(itemFactory),
        },
        {
            name: 'modules',
            title: _('Modules'),
            iconName: 'application-x-addon-symbolic',
            optionList: _getModulesOptionList(itemFactory),
        },
        {
            name: 'misc',
            title: _('Misc'),
            iconName: 'preferences-other-symbolic',
            optionList: _getMiscOptionList(itemFactory),
        },
        {
            name: 'about',
            title: _('About'),
            iconName: 'preferences-system-details-symbolic',
            optionList: _getAboutOptionList(itemFactory),
        },
    ];

    return pageList;
}

function fillPreferencesWindow(window) {
    window = new Me.OptionsFactory.AdwPrefs(gOptions).getFilledWindow(window, _getPageList());
    window.connect('close-request', () => {
        gOptions.destroy();
        gOptions = null;
        Gi = null;
        Misc = null;
        Me = null;
        _ = null;
        Import.cleanGlobals();
    });

    window.set_default_size(800, 800);
}

const DropDownItem = GObject.registerClass({
    GTypeName: 'DropdownItem',
    Properties: {
        'text': GObject.ParamSpec.string(
            'text',
            'Text',
            'DropDown item text',
            GObject.ParamFlags.READWRITE,
            ''
        ),
        'id': GObject.ParamSpec.int(
            'id',
            'Id',
            'Item id stored in settings',
            GObject.ParamFlags.READWRITE,
            0, 100, 0
        ),
    },
}, class DropDownItem extends GObject.Object {
    get text() {
        return this._text;
    }

    set text(text) {
        this._text = text;
    }

    get id() {
        return this._id;
    }

    set id(id) {
        this._id = id;
    }
}
);

// ////////////////////////////////////////////////////////////////////
function _getProfilesOptionList(itemFactory) {
    const optionList = [];
    // options item format:
    // (text, caption, widget, settings-variable, [options for combo], sensitivity-depends-on-bool-variable)

    optionList.push(
        itemFactory.getRowWidget(
            _('Custom Profiles'),
            _('Sets of settings that can help you with the initial customization')
        )
    );

    optionList.push(itemFactory.getRowWidget(
        _('Profile 1'),
        null,
        itemFactory.newPresetButton(gOptions, 1)
    ));

    optionList.push(itemFactory.getRowWidget(
        _('Profile 2'),
        null,
        itemFactory.newPresetButton(gOptions, 2)
    ));

    optionList.push(itemFactory.getRowWidget(
        _('Profile 3'),
        null,
        itemFactory.newPresetButton(gOptions, 3)
    ));

    optionList.push(itemFactory.getRowWidget(
        _('Profile 4'),
        null,
        itemFactory.newPresetButton(gOptions, 4)
    ));

    return optionList;
}

function _getLayoutOptionList(itemFactory) {
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
            // itemFactory.newComboBox(),
            itemFactory.newDropDown(),
            'dashPosition',
            [
                [_('Top'), 0],
                [_('Right'), 1],
                [_('Bottom'), 2],
                [_('Left'), 3],
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

    const dashPositionAdjustment = new Gi.Gtk.Adjustment({
        upper: 100,
        lower: -100,
        step_increment: 1,
        page_increment: 10,
    });

    const dashPositionScale = itemFactory.newScale(dashPositionAdjustment);
    dashPositionScale.add_mark(0, Gi.Gtk.PositionType.TOP, null);
    optionList.push(
        itemFactory.getRowWidget(
            _('Fine Tune Dash Position'),
            _('Adjusts the position of the dash on the axis given by the orientation of the workspaces'),
            dashPositionScale,
            'dashPositionAdjust',
            null,
            'dashModule'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Show Apps Icon Position'),
            _('Sets the position of the "Show Applications" icon in the Dash'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
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
            _('Open Windows Icon Position'),
            _('Allows to add "Search Open Windows" icon into Dash (if window search provider enabled on the Behavior tab) so you can directly toggle window search provider results. You can also use the secondary mouse button click on the Show Apps Icon, or the Space hotkey'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
            'dashShowWindowsIcon',
            [
                [_('Hide'), 0],
                [_('Start'), 1],
                [_('End'), 2],
            ],
            'dashModule'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Recent Files Icon Position'),
            _('Allows to add "Search Recent Files" icon into Dash (if recent files search provider enabled on the Behavior tab) so you can directly toggle recent files search provider results. You can also use Ctrl + Space hotkey'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
            'dashShowRecentFilesIcon',
            [
                [_('Hide'), 0],
                [_('Start'), 1],
                [_('End'), 2],
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
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
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

    const wstPositionAdjustment = new Gi.Gtk.Adjustment({
        upper: 100,
        lower: -100,
        step_increment: 1,
        page_increment: 10,
    });

    const wstPositionScale = itemFactory.newScale(wstPositionAdjustment);
    wstPositionScale.add_mark(0, Gi.Gtk.PositionType.TOP, null);
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

    const wsThumbnailScaleAdjustment = new Gi.Gtk.Adjustment({
        upper: 30,
        lower: 0,
        step_increment: 1,
        page_increment: 1,
    });

    const wsThumbnailScale = itemFactory.newScale(wsThumbnailScaleAdjustment);
    wsThumbnailScale.add_mark(13, Gi.Gtk.PositionType.TOP, null);
    optionList.push(
        itemFactory.getRowWidget(
            _('Workspace Thumbnails Max Scale'),
            _('Adjusts maximum size of the workspace thumbnails in the overview (% relative to display width)'),
            wsThumbnailScale,
            'wsThumbnailScale'
        )
    );

    const wsThumbnailAppScaleAdjustment = new Gi.Gtk.Adjustment({
        upper: 30,
        lower: 0,
        step_increment: 1,
        page_increment: 1,
    });

    const wsThumbnailAppScale = itemFactory.newScale(wsThumbnailAppScaleAdjustment);
    wsThumbnailAppScale.add_mark(0, Gi.Gtk.PositionType.TOP, null);
    optionList.push(
        itemFactory.getRowWidget(
            _('Workspace Thumbnails Max Scale - App View'),
            _('Set to 0 to follow "Workspace Thumbnails Max Scale" scale. Allows you to set different thumbnails scale for the Applications view'),
            wsThumbnailAppScale,
            'wsThumbnailScaleAppGrid'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Workspace Preview')
        )
    );

    const wsScaleAdjustment = new Gi.Gtk.Adjustment({
        upper: 100,
        lower: 30,
        step_increment: 1,
        page_increment: 10,
    });

    const wsScaleScale = itemFactory.newScale(wsScaleAdjustment);
    wsScaleScale.add_mark(100, Gi.Gtk.PositionType.TOP, null);
    optionList.push(
        itemFactory.getRowWidget(
            _('Workspaces Scale'),
            _('Allows to shrink workspace previews to adjust spacing or fit more of the adjacent workspaces on the screen. Default size is calculated to use all available space with minimal spacing'),
            wsScaleScale,
            'wsPreviewScale'
        )
    );

    const wsSpacingAdjustment = new Gi.Gtk.Adjustment({
        upper: 500,
        lower: 10,
        step_increment: 1,
        page_increment: 10,
    });

    const wsSpacingScale = itemFactory.newScale(wsSpacingAdjustment);
    wsSpacingScale.add_mark(350, Gi.Gtk.PositionType.TOP, null);
    optionList.push(
        itemFactory.getRowWidget(
            _('Workspaces Spacing'),
            _('Adjusts spacing between workspace previews so you can control how much of the adjacent workspaces overlap to the current workspace overview. Default value should set the adjacent workspaces off-screen.'),
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

    const agPageAdjustment = new Gi.Gtk.Adjustment({
        upper: 100,
        lower: 50,
        step_increment: 1,
        page_increment: 10,
    });

    const agPageWidthScale = itemFactory.newScale(agPageAdjustment);
    agPageWidthScale.add_mark(90, Gi.Gtk.PositionType.TOP, null);
    optionList.push(
        itemFactory.getRowWidget(
            _('App Grid Page Width Scale'),
            _('Adjusts max app grid page width relative to the available space.'),
            agPageWidthScale,
            'appGridPageWidthScale',
            null,
            'appDisplayModule'
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

    const searchViewScaleAdjustment = new Gi.Gtk.Adjustment({
        upper: 150,
        lower: 50,
        step_increment: 1,
        page_increment: 1,
    });

    const searchViewScale = itemFactory.newScale(searchViewScaleAdjustment);
    searchViewScale.add_mark(100, Gi.Gtk.PositionType.TOP, null);
    optionList.push(
        itemFactory.getRowWidget(
            _('Search Results Width'),
            _('Adjusts maximum width of search results view (% relative to default). This allows to fit more (or less) app icons into the app search result'),
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
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
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
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
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

    const hAdjustment = new Gi.Gtk.Adjustment({
        lower: 0,
        upper: 100,
        step_increment: 1,
        page_increment: 1,
    });

    const hScale = itemFactory.newScale(hAdjustment);
    hScale.add_mark(50, Gi.Gtk.PositionType.TOP, null);

    optionList.push(
        itemFactory.getRowWidget(
            _('Horizontal Position (% from left)'),
            _('This popup shows up when you switch workspace using a keyboard shortcut or gesture outside of the overview. You can disable it on the "Behavior" tab. If you want more control over the popup, try the "Workspace Switcher Manager" extension'),
            hScale,
            'wsSwPopupHPosition',
            null,
            'workspaceSwitcherPopupModule'
        )
    );

    const vAdjustment = new Gi.Gtk.Adjustment({
        lower: 0,
        upper: 100,
        step_increment: 1,
        page_increment: 1,
    });

    const vScale = itemFactory.newScale(vAdjustment);
    vScale.add_mark(50, Gi.Gtk.PositionType.TOP, null);

    optionList.push(
        itemFactory.getRowWidget(
            _('Vertical Position (% from top)'),
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
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
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
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
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
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
            'secWsThumbnailsPosition',
            [
                [_('Same as Primary'), 2],
                [_('Left / Top'), 0],
                [_('Right / Bottom'), 1],
                [_('Hide'), 3],
            ]
        )
    );

    const secWstPositionAdjustment = new Gi.Gtk.Adjustment({
        upper: 100,
        lower: -100,
        step_increment: 1,
        page_increment: 10,
    });

    const secWstPositionScale = itemFactory.newScale(secWstPositionAdjustment);
    secWstPositionScale.add_mark(0, Gi.Gtk.PositionType.TOP, null);
    optionList.push(
        itemFactory.getRowWidget(
            _('Fine Tune Workspace Thumbnails Position'),
            _('Adjusts the position of the thumbnails on the axis given by the orientation of the workspaces'),
            secWstPositionScale,
            'secWsTmbPositionAdjust'
        )
    );

    const secWsThumbnailScaleAdjustment = new Gi.Gtk.Adjustment({
        upper: 30,
        lower: 5,
        step_increment: 1,
        page_increment: 1,
    });

    const secWsThumbnailScale = itemFactory.newScale(secWsThumbnailScaleAdjustment);
    secWsThumbnailScale.add_mark(13, Gi.Gtk.PositionType.TOP, null);
    optionList.push(
        itemFactory.getRowWidget(
            _('Workspace Thumbnails Max Scale'),
            _('Adjusts maximum size of the workspace thumbnails (% relative to display width / height) for secondary monitors'),
            secWsThumbnailScale,
            'secWsThumbnailScale'
        )
    );

    const wsSecScaleAdjustment = new Gi.Gtk.Adjustment({
        upper: 100,
        lower: 30,
        step_increment: 1,
        page_increment: 10,
    });

    const wsSecScaleScale = itemFactory.newScale(wsSecScaleAdjustment);
    wsScaleScale.add_mark(100, Gi.Gtk.PositionType.TOP, null);
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
            _('Shift Workspace Preview by Panel Height'),
            _('This option can help align overview of the secondary monitor with the primary monitor'),
            itemFactory.newSwitch(),
            'secWsPreviewShift'
        )
    );



    return optionList;
}

function _getAppearanceOptionList(itemFactory) {
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
            _('Maximum size of Dash icons in pixels'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
            'dashMaxIconSize',
            [
                [_('128'), 128],
                [_('112'), 112],
                [_('96'),   96],
                [_('80'),   80],
                [_('64'),   64],
                [_('48'),   48],
                [_('32'),   32],
                [_('24'),   24],
                [_('16'),   16],
            ],
            'dashModule'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Dash Background Style'),
            _('Allows you to change the background color of the dash to match the search results an app folders'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
            'dashBgColor',
            [
                [_('Default'), 0],
                [_('Light'), 1],
            ],
            'dashModule'
        )
    );

    const dashBgAdjustment = new Gi.Gtk.Adjustment({
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

    const dashRadAdjustment = new Gi.Gtk.Adjustment({
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
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
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
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
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
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
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
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
            'winTitlePosition',
            [
                [_('Inside Window'), 0],
                [_('Inside Window Always Visible'), 1],
                [_('Below Window (Default)'), 2],
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

    const wsPreviewBgRadiusAdjustment = new Gi.Gtk.Adjustment({
        upper: 60,
        lower: 5,
        step_increment: 1,
        page_increment: 5,
    });

    const wsPreviewBgRadiusSpinButton = itemFactory.newScale(wsPreviewBgRadiusAdjustment);
    wsPreviewBgRadiusSpinButton.add_mark(30, Gi.Gtk.PositionType.TOP, null);
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
            _('App Grid')
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Icon Size'),
            _('Allows to set a fixed app grid icon size and bypass the default adaptive algorithm'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
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

    optionList.push(
        itemFactory.getRowWidget(
            _('Folder Icon Size'),
            _('Allows to set a fixed icon size and bypass the default adaptive algorithm in the open folder dialog'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
            'appGridFolderIconSize',
            [
                [_('Adaptive (Default)'), -1],
                [_('128'), 128],
                [_('112'), 112],
                [_('96'), 96],
                [_('80'), 80],
                [_('64'), 64],
                [_('48'), 48],
                [_('32'), 32],
            ],
            'appDisplayModule'
        )
    );

    const folderIconGridCombo = itemFactory.newComboBox();
    optionList.push(
        itemFactory.getRowWidget(
            _('Max App Folder Icon Grid Size'),
            _('Sets a grid size (number of icons) in the folder preview. 3x3 options automatically switches between 2x2 and 3x3 grid depending on the number of icons in the folder'),
            folderIconGridCombo,
            // itemFactory.newDropDown(),
            'appGridFolderIconGrid',
            [
                [_('2x2 (Default)'), 2],
                [_('3x3 for 5+ apps'), 3],
                [_('3x3 for 9+ apps'), 4],
            ],
            'appDisplayModule'
        )
    );

    const columnsAdjustment = new Gi.Gtk.Adjustment({
        upper: 15,
        lower: 0,
        step_increment: 1,
        page_increment: 1,
    });

    const columnsSpinBtn = itemFactory.newSpinButton(columnsAdjustment);
    optionList.push(itemFactory.getRowWidget(
        _('Columns per Page (0 for adaptive grid)'),
        _('Number of columns in the application grid. If set to 0 (the default), the number will be set automatically to fit the available width'),
        columnsSpinBtn,
        'appGridColumns',
        null,
        'appDisplayModule'
    ));

    const rowsAdjustment = new Gi.Gtk.Adjustment({
        upper: 15,
        lower: 0,
        step_increment: 1,
        page_increment: 1,
    });

    const rowsSpinBtn = itemFactory.newSpinButton(rowsAdjustment);
    optionList.push(itemFactory.getRowWidget(
        _('Rows per Page (0 for adaptive grid)'),
        _('Number of rows in the application grid. If set to 0 (the default), the number will be set automatically to fit the available height'),
        rowsSpinBtn,
        'appGridRows',
        null,
        'appDisplayModule'
    ));

    const folderColumnsAdjustment = new Gi.Gtk.Adjustment({
        upper: 15,
        lower: 0,
        step_increment: 1,
        page_increment: 1,
    });

    const folderColumnsSpinBtn = itemFactory.newSpinButton(folderColumnsAdjustment);
    optionList.push(itemFactory.getRowWidget(
        _('Folder Columns per Page (0 for adaptive grid)'),
        _('Number of columns in folder grid. If you leave the value at 0, the number of columns will be calculated to fit all the folder icons on one page'),
        folderColumnsSpinBtn,
        'appGridFolderColumns',
        null,
        'appDisplayModule'
    ));

    const folderRowsAdjustment = new Gi.Gtk.Adjustment({
        upper: 15,
        lower: 0,
        step_increment: 1,
        page_increment: 1,
    });

    const folderRowsSpinBtn = itemFactory.newSpinButton(folderRowsAdjustment);
    optionList.push(itemFactory.getRowWidget(
        _('Folder Rows per Page (0 for adaptive grid)'),
        _('Number of rows in folder grid. If you leave the value at 0, the number of rows will be calculated to fit all the folder icons on one page'),
        folderRowsSpinBtn,
        'appGridFolderRows',
        null,
        'appDisplayModule'
    ));

    const appGridSpacingAdjustment = new Gi.Gtk.Adjustment({
        upper: 30,
        lower: 5,
        step_increment: 1,
        page_increment: 5,
    });

    const appGridSpacingScale = itemFactory.newScale(appGridSpacingAdjustment);
    appGridSpacingScale.add_mark(12, Gi.Gtk.PositionType.TOP, null);
    optionList.push(
        itemFactory.getRowWidget(
            _('Grid Spacing'),
            _('Adjusts the spacing between icons in a grid, the real impact is on folders'),
            appGridSpacingScale,
            'appGridSpacing',
            null,
            'appDisplayModule'
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
            _('Size of results provided by the App Search Provider - smaller size allows to fit more results'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
            'searchIconSize',
            [
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

    const maxSearchResultsAdjustment = new Gi.Gtk.Adjustment({
        upper: 50,
        lower: 5,
        step_increment: 1,
        page_increment: 5,
    });

    const maxSearchResultsSpinButton = itemFactory.newScale(maxSearchResultsAdjustment);
    maxSearchResultsSpinButton.add_mark(10, Gi.Gtk.PositionType.TOP, null);
    maxSearchResultsSpinButton.add_mark(20, Gi.Gtk.PositionType.TOP, null);
    maxSearchResultsSpinButton.add_mark(30, Gi.Gtk.PositionType.TOP, null);
    maxSearchResultsSpinButton.add_mark(40, Gi.Gtk.PositionType.TOP, null);
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
            _('Overview Background')
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Show Wallpaper'),
            _('Replaces the solid grey background in the overview with the current desktop wallpaper'),
            itemFactory.newSwitch(),
            'showBgInOverview'
        )
    );

    const brightnessBgAdjustment = new Gi.Gtk.Adjustment({
        upper: 100,
        lower: 0,
        step_increment: 1,
        page_increment: 10,
    });

    const bgBrightnessScale = itemFactory.newScale(brightnessBgAdjustment);
    optionList.push(
        itemFactory.getRowWidget(
            _('Brightness'),
            _('Brightness of the background wallpaper in the overview'),
            bgBrightnessScale,
            'overviewBgBrightness'
        )
    );

    const blurBgAdjustment = new Gi.Gtk.Adjustment({
        upper: 100,
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
            'overviewBgBlurSigma'
        )
    );

    const blurAppBgAdjustment = new Gi.Gtk.Adjustment({
        upper: 100,
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
            'appGridBgBlurSigma'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Smooth Blur Transitions'),
            _('Allows for smoother blur transitions, but can affect the overall smoothness of overview animations on weak hardware'),
            itemFactory.newSwitch(),
            'smoothBlurTransitions'
        )
    );

    return optionList;
}
// ----------------------------------------------------------------

function _getBehaviorOptionList(itemFactory) {
    const optionList = [];

    optionList.push(
        itemFactory.getRowWidget(
            _('Overview')
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Activities Overview Mode'),
            _('The Expose Windows on Hover mode does not expose the workspace preview windows until the mouse pointer enters any window\nThe Static Workspace mode keeps the workspace static when you activate the overview, it only shows Dash, workspace thumbnails and search entry over the workspace and only clicking on an active workspace thumbnail activates the default overview'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
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
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
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
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
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
            _('Overlay Key (Super/Windows)')
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Single-Press Action'),
            _('Disable or change behavior when you press and release the Super key. The "Search Windows" options requires the WindowSearchProvider module to be activated'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
            'overlayKeyPrimary',
            [
                [_('Disable'), 0],
                [_('Follow Global Overview Mode (Default)'), 1],
                [_('Overview (Default)'), 2],
                [_('Applications'), 3],
                [_('Overview - Static WS Preview'), 4],
                [_('Overview - Static Workspace'), 5],
                [_('Search Windows'), 6],
                // [_('Search Recent Files'), 7],
            ],
            'overlayKeyModule'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Double-Press Action'),
            _('Disable or change behavior when you double-press the Super key. The "Search Windows" option requires the WindowSearchProvider module to be activated. The "Static WS Overview - Expose Windows" option allows you to switch to default Activities Overview window picker view if you set static workspace (preview) for the single press/release Super key action'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
            'overlayKeySecondary',
            [
                [_('Disable'), 0],
                [_('Applications (Default)'), 1],
                [_('Search Windows'), 2],
                [_('Activities Overview - Window Picker'), 3],
                // [_('Search Recent Files'), 4],
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
            _('Disable or change behavior of the hot corner. Holding down the Ctrl key while hitting the hot corner switches between Overview/Applications actions'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
            'hotCornerAction',
            [
                [_('Disable'), 0],
                [_('Follow Global Overview Mode'), 1],
                [_('Overview - Window Picker'), 2],
                [_('Applications'), 3],
                [_('Overview - Static WS Preview'), 4],
                [_('Overview - Static Workspace'), 5],
                [_('Search Windows'), 6],
            ],
            'layoutModule'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Hot Corner Position'),
            _('Choose which corner of your monitors will be active. If you choose "Follow Dash" option, the corner will be placed near the left or top edge of the Dash. The last option extends the hot corner trigger to cover the entire ege of the monitor where Dash is located'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
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
            // itemFactory.newDropDown(),
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
            // itemFactory.newDropDown(),
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
            _('App Icon - Click Behavior'),
            _('Choose your preferred behavior when clicking on an app icon. The "Prefer Current Workspace" option opens a new app window if not present in the current workspace. The "Open New Window" option also switches behavior of the middle click to "Activate" since its default behavior is to open a new window'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
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
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
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
            _('Search Windows Icon - Scroll Action'),
            _('Choose the behavior when scrolling over the Search Windows icon. The window cycler works with a list of windows sorted by "Most Recently Used" of the current workspace or all workspaces. Scrolling up cycles through previously used windows on the same workspace, or all windows regardless workspace. This option is mainly useful for the static workspace overview mode.'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
            'searchWindowsIconScroll',
            [
                [_('Default'), 0],
                [_('Cycle All Windows'), 1],
                [_('Cycle Windows On Current WS'), 2],
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
            _('Close Workspace Button'),
            _('The Close Workspace button appears on the workspace thumbnail when you hover over it and allows you to close all windows on the workspace. You can choose a "safety lock" to prevent accidental use'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
            'closeWsButtonMode',
            [
                [_('Disable'), 0],
                [_('Single Click'), 1],
                [_('Double Click'), 2],
                [_('Ctrl Key + Click'), 3],
            ]
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
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
            'winPreviewSecBtnAction',
            [
                [_('Activate Window (Default)'), 0],
                [_('Close Window'), 1],
                [_('Search For Same App Windows'), 2],
            ],
            'windowPreviewModule'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Middle Button Click Action'),
            _('Allows you to add a middle mouse click action to the window preview'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
            'winPreviewMidBtnAction',
            [
                [_('Activate Window (Default)'), 0],
                [_('Close Window'), 1],
                [_('Search For Same App Windows'), 2],
            ],
            'windowPreviewModule'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('App Icon Click Action'),
            _('Select the action to take when the application icon on the window preview is clicked'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
            'windowIconClickAction',
            [
                [_('Activate Window (Default)'), 0],
                [_('Search For Same App Windows'), 1],
            ],
            'windowPreviewModule'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Always Activate Selected'),
            _('If enabled, the currently selected window will be activated when leaving the Overview even without clicking. Usage example - press Super to open the Overview, place mouse pointer over a window, press Super again to activate the window'),
            itemFactory.newSwitch(),
            // itemFactory.newDropDown(),
            'alwaysActivateSelectedWindow',
            null,
            'windowPreviewModule'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('App Grid')
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('App Grid Order'),
            _('Choose sorting method for the app grid. Note that sorting by usage ignores folders'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
            'appGridOrder',
            [
                [_('Custom (Default)'), 0],
                [_('Alphabet - Folders First'), 1],
                [_('Alphabet - Folders Last'), 2],
                [_('Usage - No Folders'), 3],
            ],
            'appDisplayModule'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('App Folder Order'),
            _('Choose sorting method for app folders'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
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
            _('App Grid Content'),
            _('The default Shell removes favorite apps, this option allows to duplicate them in the grid or remove also running applications. Option "Favorites and Running First" only works with the Alphabet and Usage sorting'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
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
            _('Active Icons in Folder Preview'),
            _('If enabled, icons in the folder review behaves like normal icons, you can activate or even drag them directly, without having to open the folder first'),
            itemFactory.newSwitch(),
            // itemFactory.newDropDown(),
            'appGridActivePreview',
            null,
            'appDisplayModule'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Center Open Folders'),
            _('App folder may open in the center of the screen or above the source folder icon'),
            itemFactory.newSwitch(),
            // itemFactory.newDropDown(),
            'appGridFolderCenter',
            null,
            'appDisplayModule'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Allow Incomplete Pages'),
            _('If disabled, icons from the next page (if any) are automatically moved to fill any empty slot left after an icon was (re)moved (to a folder for example)'),
            itemFactory.newSwitch(),
            // itemFactory.newDropDown(),
            'appGridIncompletePages',
            null,
            'appDisplayModule'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('App Labels Behavior'),
            _('Choose how and when to display app names'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
            'appGridNamesMode',
            [
                [_('Ellipsized - Expand Selected (Default)'), 0],
                [_('Always Expanded'), 1],
                [_('Hidden - Show Selected Only'), 2],
            ],
            'appDisplayModule'
        )
    );

    optionList.push(itemFactory.getRowWidget(
        _('Reset App Grid Layout'),
        _('Removes all stored app grid positions, after reset icons will be sorted alphabetically, except folder contents'),
        itemFactory.newResetButton(() => {
            const settings = Misc.ExtensionUtils.getSettings('org.gnome.shell');
            settings.set_value('app-picker-layout', new Gi.GLib.Variant('aa{sv}', []));
        })
    ));

    optionList.push(itemFactory.getRowWidget(
        _('Remove App Grid Folders'),
        _('Removes all folders, folder apps will move to the root grid'),
        itemFactory.newResetButton(() => {
            const settings = Misc.ExtensionUtils.getSettings('org.gnome.desktop.app-folders');
            settings.set_strv('folder-children', []);
        })
    ));


    optionList.push(
        itemFactory.getRowWidget(
            _('Search')
        )
    );

    /* optionList.push(
        itemFactory.getRowWidget(
            _('Window Search Provider'),
        )
    );*/

    /* optionList.push(
        itemFactory.getRowWidget(
            _('Enable Window Search Provider'),
            _('Activates the window search provider that adds open windows to the search results. You can search app names and window titles. You can also use "wq//" prefix (also by pressing the Space hotkey in the overview, or clicking dash icon) to suppress results from other search providers'),
            itemFactory.newSwitch(),
            'searchWindowsEnable'
        )
    );*/

    optionList.push(
        itemFactory.getRowWidget(
            _('Window Search Provider - Sorting'),
            _('Choose the window sorting method'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
            'searchWindowsOrder',
            [
                [_('Most Recently Used (MRU)'), 0],
                [_('MRU - Current Workspace First'), 1],
                [_('MRU - By Workspaces'), 2],
                [_('Stable Sequence - By Workspaces'), 3],
            ],
            'windowSearchProviderModule'
        )
    );

    /* optionList.push(
        itemFactory.getRowWidget(
            _('Enable Recent Files Search Provider'),
            _('Activates the recent files search provider that can be triggered by a dash icon, Ctrl + Space hotkey or by typing "fq//" prefix in the search entry field. This option needs File History option enabled in the GNOME Privacy settings'),
            itemFactory.newSwitch(),
            'searchRecentFilesEnable'
        )
    );*/

    optionList.push(
        itemFactory.getRowWidget(
            _('Enable Fuzzy Match'),
            _('Enabling the fuzzy match allows you to skip letters in the pattern you are searching for and find "Firefox" even if you type "ffx". Works only for the App, Window and Recent files search providers'),
            itemFactory.newSwitch(),
            'searchFuzzy'
        )
    );

    /* const wspCommandSwitch = itemFactory.newSwitch();
    optionList.push(
        itemFactory.getRowWidget(
            _('Enable Commands in Search Entry'),
            _('You can use following commands separated by the space at the end of entered pattern:\n/x!   \t\t\t- close selected window\n/xa! \t\t\t- close all found windows\n/m[number] \t\t- (e.g. /m6) move selected window to workspace with given index\n/ma[number] \t- move all found windows to workspace with given index'),
            wspCommandSwitch,
            'searchWindowsCommands'
        )
    );*/

    optionList.push(
        itemFactory.getRowWidget(
            _('Animations - General')
        )
    );

    const animationSpeedAdjustment = new Gi.Gtk.Adjustment({
        upper: 500,
        lower: 1,
        step_increment: 10,
        page_increment: 100,
    });

    const animationSpeedScale = itemFactory.newScale(animationSpeedAdjustment);
    animationSpeedScale.add_mark(100, Gi.Gtk.PositionType.TOP, null);
    optionList.push(
        itemFactory.getRowWidget(
            _('Animation Speed'),
            _('Adjusts the global animation speed in % of the default duration - higher value means slower animation'),
            animationSpeedScale,
            'animationSpeedFactor'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Animations - Overview')
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('App Grid Animation'),
            _('When entering the App Grid view, the app grid animates from the edge of the screen. You can choose the direction, keep the Default (direction will be selected automatically) or disable the animation if you don\'t like it'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
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
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
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
            _('When entering / leaving the App Grid / Search view, the workspace preview can animate to/from workspace thumbnail.'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
            'workspaceAnimation',
            [
                [_('Disable'), 0],
                [_('Enable'), 1],
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
            _('Workspace Switcher Animation'),
            _('Allows you to disable movement of the desktop background during workspace switcher animation outside of the overview. The Static Background mode also keeps Conky and desktop icons on their place during switching.'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
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
            _('Workspace Switcher Popup Mode'),
            _('This popup shows up when you switch workspace using a keyboard shortcut or gesture outside of the overview. You can to disable the popup at all, or show it on the current monitor (the one with mouse pointer) instead of the primary.'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
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
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
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
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
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

function _getModulesOptionList(itemFactory) {
    const optionList = [];
    // options item format:
    // (text, caption, widget, settings-variable, [options for combo], sensitivity-depends-on-bool-variable)
    optionList.push(
        itemFactory.getRowWidget(
            _('V-Shell Modules (allows you to disable modules that conflict with another extension)')
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('WindowSearchProvider'),
            _('Activates the window search provider that adds open windows to the search results. You can search app names and window titles. You can also use "wq//" prefix (also by pressing the Space hotkey in the overview, or clicking dash icon) to suppress results from other search providers'),
            itemFactory.newSwitch(),
            'windowSearchProviderModule'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('RecentFilesSearchProvider'),
            _('Activates the recent files search provider that can be triggered by a dash icon, Ctrl + Space hotkey or by typing "fq//" prefix in the search entry field. This option needs File History option enabled in the GNOME Privacy settings'),
            itemFactory.newSwitch(),
            'recentFilesSearchProviderModule'
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
            _('Workspace switcher popup position options'),
            itemFactory.newSwitch(),
            'workspaceSwitcherPopupModule'
        )
    );

    return optionList;
}

function _getMiscOptionList(itemFactory) {
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

    /* optionList.push(
        itemFactory.getRowWidget(
            _('Compatibility')
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Improve compatibility with Dash to Dock'),
            _('With the default Ubuntu Dock and other Dash To Dock forks, you may experience issues with Activities overview after you change Dock position or re-enable the extension. This option is enabled automatically if a replacement for the Dash is detected. In any case, using Dash to Dock extension with V-Shell is problematic and not recommended.'),
            itemFactory.newSwitch(),
            'fixUbuntuDock'
        )
    );*/

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

    optionList.push(
        itemFactory.getRowWidget(
            _('Workarounds')
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

    return optionList;
}

function _getAboutOptionList(itemFactory) {
    const optionList = [];

    optionList.push(itemFactory.getRowWidget(
        Me.metadata.name
    ));

    optionList.push(itemFactory.getRowWidget(
        _('Version'),
        null,
        itemFactory.newLabel(Me.metadata.version.toString())
    ));

    optionList.push(itemFactory.getRowWidget(
        _('Reset all options'),
        _('Set all options to default values.'),
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
        _('If you like V-Shell, you can help me with my coffee expenses'),
        itemFactory.newLinkButton('https://buymeacoffee.com/georgdh')
    ));

    return optionList;
}
