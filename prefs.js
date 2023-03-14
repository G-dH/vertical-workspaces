/**
 * V-Shell (Vertical Workspaces)
 * prefs.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2023
 * @license    GPL-3.0
 */

'use strict';

const { Gtk, GLib } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me             = ExtensionUtils.getCurrentExtension();
const Settings       = Me.imports.settings;

const ItemFactory = Me.imports.optionsFactory.ItemFactory;
const AdwPrefs = Me.imports.optionsFactory.AdwPrefs;
const LegacyPrefs = Me.imports.optionsFactory.LegacyPrefs;

const shellVersion   = Settings.shellVersion;

// gettext
const _  = Settings._;

// libadwaita is available starting with GNOME Shell 42.
let Adw = null;
try {
    Adw = imports.gi.Adw;
} catch (e) {}

let gOptions;
let pageList;
let itemFactory;


function init() {
    ExtensionUtils.initTranslations(Me.metadata['gettext-domain']);
    gOptions = new Settings.Options();

    itemFactory = new ItemFactory(gOptions);

    pageList = [
        {
            name: 'layout',
            title: _('Layout'),
            iconName: 'view-grid-symbolic',
            optionList: _getLayoutOptionList(),
        },
        {
            name: 'appearance',
            title: _('Appearance'),
            iconName: 'view-reveal-symbolic',
            optionList: _getAppearanceOptionList(),
        },
        {
            name: 'behavior',
            title: _('Behavior'),
            iconName: 'system-run-symbolic',
            optionList: _getBehaviorOptionList(),
        },
        {
            name: 'profiles',
            title: _('Profiles'),
            iconName: 'open-menu-symbolic',
            optionList: _getProfilesOptionList(),
        },
        {
            name: 'misc',
            title: _('Misc'),
            iconName: 'preferences-other-symbolic',
            optionList: _getMiscOptionList(),
        },
        {
            name: 'about',
            title: _('About'),
            iconName: 'preferences-system-details-symbolic',
            optionList: _getAboutOptionList(),
        },
    ];
}

function fillPreferencesWindow(window) {
    window = new AdwPrefs(gOptions).getFilledWindow(window, pageList);
    window.connect('close-request', () => {
        gOptions.destroy();
        gOptions = null;
        itemFactory = null;
        pageList = null;
    });

    window.set_default_size(800, 800);
}

function buildPrefsWidget() {
    const prefsWidget = new LegacyPrefs(gOptions).getPrefsWidget(pageList);

    prefsWidget.connect('realize', widget => {
        const window = widget.get_root ? widget.get_root() : widget.get_toplevel();
        const width = 800;
        const height = 800;
        window.set_default_size(width, height);
        const headerbar = window.get_titlebar();
        headerbar.title_widget = prefsWidget._stackSwitcher;

        const signal = Gtk.get_major_version() === 3 ? 'destroy' : 'close-request';
        window.connect(signal, () => {
            gOptions.destroy();
            gOptions = null;
        });
    });

    return prefsWidget;
}

// ////////////////////////////////////////////////////////////////////
function _getLayoutOptionList() {
    const optionList = [];
    // options item format:
    // [text, caption, widget, settings-variable, options for combo]

    optionList.push(
        itemFactory.getRowWidget(
            _('Dash')
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Dash Position'),
            null,
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
            'dashPosition',
            [
                [_('Top'), 0],
                [_('Right'), 1],
                [_('Bottom'), 2],
                [_('Left'), 3],
                [_('Hide'), 4],
            ]
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Center Horizontal Dash to Workspace'),
            _('If the Dash Position is set to Top or Bottom, the position will be recalculated relative to the workspace preview instead of the screen. Works only with the default Dash.'),
            itemFactory.newSwitch(),
            'centerDashToWs'
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
            _('Adjusts position of the dock on chosen axis. Works only with the default Dash.'),
            dashPositionScale,
            'dashPositionAdjust'
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
            _('Position of the workspace thumbnails on the screen also sets orientation of the workspaces to vertical or horizontal. You have two options to disable workspace thumbnails, one sets workspaces to the vertical orientation, the second one to horizontal.'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
            'workspaceThumbnailsPosition',
            // this mess is just because of backward compatibility
            [
                [_('Left       \t Vertical Orientation'), 0],
                [_('Right      \t Vertical Orientation'), 1],
                [_('Hide       \t Set Vertical Orientation'), 4],
                [_('Top        \t Horizontal Orientation'), 5],
                [_('Bottom     \t Horizontal Orientation'), 6],
                [_('Hide       \t Set Horizontal Orientation'), 9],
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
            _('Allows precise adjustment of workspace thumbnails position.'),
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
        lower: 5,
        step_increment: 1,
        page_increment: 1,
    });

    const wsThumbnailScale = itemFactory.newScale(wsThumbnailScaleAdjustment);
    wsThumbnailScale.add_mark(13, Gtk.PositionType.TOP, null);
    optionList.push(
        itemFactory.getRowWidget(
            _('Workspace Thumbnails Max Scale'),
            _('Adjusts maximum size of the workspace thumbnails in the overview (% relative to display width).'),
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
    wsThumbnailAppScale.add_mark(0, Gtk.PositionType.TOP, null);
    optionList.push(
        itemFactory.getRowWidget(
            _('Workspace Thumbnails Max Scale - App View'),
            _('Set to 0 to follow "Workspace Thumbnails Max Scale" scale. Allows you to set different thumbnails scale for the Applications view.'),
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
            _('Scales down workspace previews so you can fit more of the adjacent workspaces on the screen. Default size is calculated to use all available space.'),
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
    wsSpacingScale.add_mark(350, Gtk.PositionType.TOP, null);
    optionList.push(
        itemFactory.getRowWidget(
            _('Workspaces Spacing'),
            _('Adjusts spacing between workspace previews so you can control how much of the adjacent workspaces overlap to the current workspace overview. Default value should set the adjacent workspaces out of the screen.'),
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
            _('App grid in app view page will be centered to the display instead of the available space. This option may have impact on the size of the grid, more for narrower and small resolution displays, especially if workspace thumbnails are bigger.'),
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
            _('Search view will be centered to the display instead of the available space.'),
            itemFactory.newSwitch(),
            'centerSearch'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Always Show Search Entry'),
            _('If disabled, the search entry field will be hidden when not in use, so the workspace preview and app grid may take up more space.'),
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
            _('Adjusts maximum width of search results view (% relative to default). This allows you to fit more (or less) app icons into the app search result.'),
            searchViewScale,
            'searchViewScale'
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
            _('Allows you to place the main panel at the bottom of your monitor.'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
            'panelPosition',
            [
                [_('Top (Default)'), 0],
                [_('Bottom'), 1],
            ]
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Main Panel Visibility'),
            _('Main panel can be visible always, only in the overview or never.'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
            'panelVisibility',
            [
                [_('Always Visible (Default)'), 0],
                [_('Overview Only'), 1],
                [_('Always Hidden'), 2],
                // [_('Desktop View Only'), 3],
            ]
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
            _('Allows you to place workspace thumbnails of secondary monitors on the opposite side than on the primary monitor.'),
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
            _('Adjusts workspace thumbnails position on secondary monitors.'),
            secWstPositionScale,
            'secWsTmbPositionAdjust'
        )
    );

    const secWsThumbnailScaleAdjustment = new Gtk.Adjustment({
        upper: 30,
        lower: 5,
        step_increment: 1,
        page_increment: 1,
    });

    const secWsThumbnailScale = itemFactory.newScale(secWsThumbnailScaleAdjustment);
    secWsThumbnailScale.add_mark(13, Gtk.PositionType.TOP, null);
    optionList.push(
        itemFactory.getRowWidget(
            _('Workspace Thumbnails Max Scale'),
            _('Adjusts maximum size of the workspace thumbnails (% relative to display width) for secondary monitors.'),
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
    wsScaleScale.add_mark(100, Gtk.PositionType.TOP, null);
    optionList.push(
        itemFactory.getRowWidget(
            _('Workspace Preview Scale'),
            _('Scales down workspace previews on secondary monitors.'),
            wsSecScaleScale,
            'secWsPreviewScale'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Shift Workspace Preview by Panel Height'),
            _('This option can help align overview of the secondary monitor with the primary monitor.'),
            itemFactory.newSwitch(),
            'secWsPreviewShift'
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
            _('Horizontal Position (% from left)'),
            _('This popup shows up when you switch workspace using a keyboard shortcut or gesture outside of the overview. You can disable it on the Behavior tab. If you want more control over the popup, try Workspace Switcher Manager extension.'),
            hScale,
            'wsSwPopupHPosition'
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
            _('Vertical Position (% from top)'),
            null,
            vScale,
            'wsSwPopupVPosition'
        )
    );

    return optionList;
}

function _getAppearanceOptionList() {
    const optionList = [];
    // options item format:
    // [text, caption, widget, settings-variable, options for combo]

    // ----------------------------------------------------------------
    optionList.push(
        itemFactory.getRowWidget(
            _('Dash')
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Dash Max Icon Size'),
            _('Maximum size of Dash icons in pixels. Works only with default Dash.'),
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
            ]
        )
    );

    const dashBgAdjustment = new Gtk.Adjustment({
        upper: 100,
        lower: 0,
        step_increment: 1,
        page_increment: 10,
    });

    optionList.push(
        itemFactory.getRowWidget(
            _('Show Apps Icon Position'),
            _('Sets the position of the "Show Applications" icon in the Dash.'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
            'showAppsIconPosition',
            [
                [_('Hide'), 2],
                [_('Start'), 0],
                [_('End'), 1],
            ]
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Open Windows Icon Position'),
            _('This option adds "Search Open Windows" icon into dash (if window search provider enabled on the Behavior tab) so you can directly toggle window search provider results. Even if you disable this icon, you can use the secondary mouse button click on the Show Apps Icon, or the Space hotkey to access this feature.'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
            'dashShowWindowsIcon',
            [
                [_('Hide'), 0],
                [_('Start'), 1],
                [_('End'), 2],
            ]
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Recent Files Icon Position'),
            _('This option adds "Search Recent Files" icon into dash (if recent files search provider enabled on the Behavior tab) so you can directly toggle recent files search provider results. Even if you disable this icon, you can use Ctrl + Space hotkey to access this feature.'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
            'dashShowRecentFilesIcon',
            [
                [_('Hide'), 0],
                [_('Start'), 1],
                [_('End'), 2],
            ]
        )
    );

    const dashBgOpacityScale = itemFactory.newScale(dashBgAdjustment);
    optionList.push(
        itemFactory.getRowWidget(
            _('Dash Background Opacity'),
            _('Adjusts the opacity of the dash background.'),
            dashBgOpacityScale,
            'dashBgOpacity'
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
            _('Adjusts the border radius of the dash background in pixels. 0 means default value given by current theme style.'),
            dashBgRadiusScale,
            'dashBgRadius'
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
            _('Each workspace thumbnail can show its index and name (if defined in the system settings) or name/title of its most recently used app/window.'),
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
            _('Show label only when the mouse pointer hovers over a thumbnail'),
            itemFactory.newSwitch(),
            'showWsTmbLabelsOnHover'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Show Wallpaper in Workspace Thumbnails'),
            _('All workspace thumbnails will include the current desktop background.'),
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
            _('Default size is 64.'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
            'winPreviewIconSize',
            [
                [_('64'), 0],
                [_('48'), 1],
                [_('32'), 2],
                [_('22'), 3],
                [_('Disable'), 4],
            ]
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Always Show Window Titles'),
            _('All windows on the workspace preview will show their titles, not only the one with the mouse pointer.'),
            itemFactory.newSwitch(),
            'alwaysShowWinTitles'
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
            _('Allows you to hide the scaling background of the workspace preview.'),
            itemFactory.newSwitch(),
            'showWsPreviewBg'
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
            _('Allows to force fixed icon size and bypass the default adaptive algorithm.'),
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
            ]
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Folder Icon Size'),
            _('Allows to disable the default adaptive algorithm and set a fixed size of icons inside folders.'),
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
            ]
        )
    );

    const folderIconGridCombo = itemFactory.newComboBox();
    optionList.push(
        itemFactory.getRowWidget(
            _('Max App Folder Icon Grid Size'),
            _('Each folder icon shows (up to) 4 app icons as a preview of the folder content, this option allows you to increase the number to 9 icons if folder contains more than 4 or 8 apps. The latter avoids half empty folder icons.'),
            folderIconGridCombo,
            // itemFactory.newDropDown(),
            'appGridFolderIconGrid',
            [
                [_('2x2 (Default)'), 2],
                [_('3x3 for 5+ apps'), 3],
                [_('3x3 for 9+ apps'), 4],
            ]
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
        _('Number of columns in application grid. If set to 0 (default setting) the number will be set automatically to fit available width.'),
        columnsSpinBtn,
        'appGridColumns'
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
        _('Number of rows in application grid. If set to 0 (default setting) the number will be set automatically to fit available height.'),
        rowsSpinBtn,
        'appGridRows'
    ));

    const folderColumnsAdjustment = new Gtk.Adjustment({
        upper: 8,
        lower: 0,
        step_increment: 1,
        page_increment: 1,
    });

    const folderColumnsSpinBtn = itemFactory.newSpinButton(folderColumnsAdjustment);
    optionList.push(itemFactory.getRowWidget(
        _('Folder Columns per Page (0 for adaptive grid)'),
        _('Number of columns in folder grid. If you leave the value on 0, the number of columns will be calculated to fit all folder icons.'),
        folderColumnsSpinBtn,
        'appGridFolderColumns'
    ));

    const folderRowsAdjustment = new Gtk.Adjustment({
        upper: 8,
        lower: 0,
        step_increment: 1,
        page_increment: 1,
    });

    const folderRowsSpinBtn = itemFactory.newSpinButton(folderRowsAdjustment);
    optionList.push(itemFactory.getRowWidget(
        _('Folder Rows per Page (0 for adaptive grid)'),
        _('Number of rows in folder grid. If you leave the value on 0, the number of rows will be calculated to fit all folder icons.'),
        folderRowsSpinBtn,
        'appGridFolderRows'
    ));

    optionList.push(
        itemFactory.getRowWidget(
            _('Search')
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('App Search Icon Size'),
            _('Size of results provided by the App Search Provider.'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
            'searchIconSize',
            [
                [_('128'), 128],
                [_('112'), 112],
                [_('96'), 96],
                [_('80'), 80],
                [_('64'), 64],
                [_('48'), 48],
                [_('32'), 32],
            ]
        )
    );

    const maxSearchResultsAdjustment = new Gtk.Adjustment({
        upper: 50,
        lower: 5,
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
            _('Sets the maximum number of rows for result lists of all search providers except window search provider which always lists all results.'),
            maxSearchResultsSpinButton,
            'searchMaxResultsRows'
        )
    );


    optionList.push(
        itemFactory.getRowWidget(
            _('Overview Background')
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Show Static Background'),
            _('Show static background wallpaper instead of the solid grey color.'),
            itemFactory.newSwitch(),
            'showBgInOverview'
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
            _('Brightness'),
            _('Brightness of background wallpaper in the overview.'),
            bgBrightnessScale,
            'overviewBgBrightness'
        )
    );

    const blurBgAdjustment = new Gtk.Adjustment({
        upper: 100,
        lower: 0,
        step_increment: 1,
        page_increment: 10,
    });

    const bgBlurScale = itemFactory.newScale(blurBgAdjustment);
    optionList.push(
        itemFactory.getRowWidget(
            _('Blur Window Picker Background'),
            _('Blur background wallpaper (if enabled) in the window picker view.'),
            bgBlurScale,
            'overviewBgBlurSigma'
        )
    );

    const blurAppBgAdjustment = new Gtk.Adjustment({
        upper: 100,
        lower: 0,
        step_increment: 1,
        page_increment: 10,
    });

    const bgAppBlurScale = itemFactory.newScale(blurAppBgAdjustment);
    optionList.push(
        itemFactory.getRowWidget(
            _('Blur App Grid/Search View Background'),
            _('Blur background wallpaper (if enabled) in the app grid and search results views.'),
            bgAppBlurScale,
            'appGridBgBlurSigma'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Smooth Blur Transitions'),
            _('Makes blur transitions smoother but can impact overall smoothness of overview animations.'),
            itemFactory.newSwitch(),
            'smoothBlurTransitions'
        )
    );

    return optionList;
}
// ----------------------------------------------------------------

function _getBehaviorOptionList() {
    const optionList = [];

    optionList.push(
        itemFactory.getRowWidget(
            _('Overview')
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Overview Mode'),
            _('The Expose Windows on Hover mode does not expose the workspace preview windows until the mouse pointer enters any window.\nThe Static Workspace mode does not scale the workspace preview in the overview, it only shows Dash and workspace thumbnails over the desktop. Clicking on a workspace thumbnail scales the ws preview and exposes its windows like in the default overview mode.'),
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
            _('Allows to change the state in which GNOME Shell starts a session.'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
            'startupState',
            [
                [_('Overview'), 0],
                [_('Desktop'), 1],
                [_('Applications'), 2],
            ]
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
            _('Disable or change behavior of hot corner. Holding down the Ctrl key while hitting the hot corner switches between Overview/Applications actions.'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
            'hotCornerAction',
            [
                [_('Disable'), 0],
                [_('Overview'), 1],
                [_('Applications'), 2],
            ]
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Hot Corner Position'),
            _('Choose what corner of your monitors will be active. If you choose "Follow Dash" option, the corner will be placed near the left or top edge of the dash. The last option extends the hot corner barrier to cover the whole ege of the monitor under/beside the Dock.'),
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
            ]
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Enable Hot Corner in Full-Screen Mode'),
            _('If you often work with full-screen applications and want the hot corner to be usable.'),
            itemFactory.newSwitch(),
            // itemFactory.newDropDown(),
            'hotCornerFullscreen'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Show Ripples Animation'),
            _('Ripples animation shows up when you trigger hot corner.'),
            itemFactory.newSwitch(),
            // itemFactory.newDropDown(),
            'hotCornerRipples'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Dash')
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Dash Icon Click'),
            _('if the app you clicked on has more than one window and the recently used window is not on the current workspace, the overview can switch to the workspace with the recent window.'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
            'dashShowWindowsBeforeActivation',
            [
                [_('Activate Last Used Window Immediately'), 0],
                [_('Switch to Workspace with Recently Used Window'), 1],
            ]
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
            _('The Close Workspace button appears on the workspace thumbnail when you hover over it and allows you to close all windows on the workspace. You can choose a safety lock to prevent accidental use.'),
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
            _('Always Activate Selected'),
            _('If enabled, the currently selected window will be activated when leaving the Overview even without clicking. Usage example - press Super to open the Overview, place mouse pointer over a window, press Super again to activate the window.'),
            itemFactory.newSwitch(),
            // itemFactory.newDropDown(),
            'alwaysActivateSelectedWindow'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('App Grid')
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Apps Order'),
            _('Choose sorting method for the app grid. Note that sorting by alphabet and usage ignores folders.'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
            'appGridOrder',
            [
                [_('Custom (Default)'), 0],
                [_('Alphabet'), 1],
                [_('Usage'), 2],
            ]
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('App Grid Content'),
            _('The default Shell removes favorite apps, this option lets you duplicate them in the grid or remove also running applications. Option "Favorites and Running First" only works with the Alphabet and Usage sorting.'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
            'appGridContent',
            [
                [_('Include All'), 0],
                [_('Include All - Favorites and Running First'), 1],
                [_('Exclude Favorites (Default)'), 2],
                [_('Exclude Running'), 3],
                [_('Exclude Favorites and Running'), 4],
            ]
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Active Icons in Folder Preview'),
            _('If enabled, clicking an app icon in a folder preview directly opens the app without having to open the folder first. Middle button opens new window of the app without closing the overview, so you can open multiple apps in a row on the current workspace and secondary button opens the folder.'),
            itemFactory.newSwitch(),
            // itemFactory.newDropDown(),
            'appGridActivePreview'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Center Open Folders'),
            _('App folder may open in the center of the screen or above the source folder icon.'),
            itemFactory.newSwitch(),
            // itemFactory.newDropDown(),
            'appGridFolderCenter'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Allow Incomplete Pages'),
            _('If disabled, icons from the next page (if any) are automatically moved to fill any empty slot left after an icon was (re)moved (to a folder for example).'),
            itemFactory.newSwitch(),
            // itemFactory.newDropDown(),
            'appGridIncompletePages'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('App Labels Behavior'),
            _('Choose how and when to display app names.'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
            'appGridNamesMode',
            [
                [_('Ellipsized - Expand Selected (Default)'), 0],
                [_('Always Expanded'), 1],
                [_('Hidden - Show Selected Only'), 2],
            ]
        )
    );

    optionList.push(itemFactory.getRowWidget(
        _('Reset App Grid Layout'),
        _('Removes all stored app grid icons positions, after the reset icons will be ordered alphabetically.'),
        itemFactory.newResetButton(() => {
            const settings = ExtensionUtils.getSettings('org.gnome.shell');
            settings.set_value('app-picker-layout', new GLib.Variant('aa{sv}', []));
        })
    ));

    optionList.push(itemFactory.getRowWidget(
        _('Remove App Grid Folders'),
        _('Removes all folders, folder apps move to root grid.'),
        itemFactory.newResetButton(() => {
            const settings = ExtensionUtils.getSettings('org.gnome.desktop.app-folders');
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

    optionList.push(
        itemFactory.getRowWidget(
            _('Enable Window Search Provider'),
            _('Activates the window search provider that adds open windows to the search results. You can search app names and window titles. You can also use "wq/" prefix to suppress results from other search providers.'),
            itemFactory.newSwitch(),
            'searchWindowsEnable'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Enable Recent Files Search Provider'),
            _('Activates the recent files search provider that can be triggered by a dash icon, Ctrl + Space hotkey or by typing "fq//" prefix in the search entry field. This option needs File History option enabled in the GNOME Privacy settings.'),
            itemFactory.newSwitch(),
            'searchRecentFilesEnable'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Enable Fuzzy Match'),
            _('Enabling the fuzzy match allows you to skip letters in the pattern you are searching for and find "Firefox" even if you type "ffx". Works only for the App, Window and Recent files search providers.'),
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
            _('Adjusts the global animation speed in % of the default duration - higher value means slower animation.'),
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
            _('When entering the App Grid view, the app grid animates from the edge of the screen. You can choose direction, keep it Default (direction will be chosen automatically) or disable the animation if you don\'t like it.'),
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
            _('When search is activated the search view with search results can animate from the edge of the screen. You can choose direction, keep it Default (currently Bottom to Top) or disable the animation if you don\'t like it.'),
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
            ]
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
            ]
        )
    );


    optionList.push(
        itemFactory.getRowWidget(
            _('Notifications')
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Notification Banner Position'),
            _('Choose where the notification pop-ups appear on the screen.'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
            'notificationPosition',
            [
                [_('Top Left'), 0],
                [_('Top Middle'), 1],
                [_('Top Right (Default)'), 2],
                [_('Bottom Left'), 3],
                [_('Bottom Middle'), 4],
                [_('Bottom Right'), 5],
            ]
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Window Attention Handler'),
            _('When a window requires attention (often a new window), GNOME Shell shows you a notification about it. You can disable popups of these messages (notification will be pushed into the message tray silently) or focus the source window immediately instead.'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
            'windowAttentionMode',
            [
                [_('Show Notifications (Default)'), 0],
                [_('Disable Notification Popups'), 1],
                [_('Immediately Focus Window'), 2],
            ]
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Favorites'),
            _('Disable pin/unpin app notifications.'),
            itemFactory.newComboBox(),
            // itemFactory.newDropDown(),
            'favoritesNotify',
            [
                [_('Show Notifications (Default)'), 1],
                [_('Disable Notifications'), 0],
            ]
        )
    );

    return optionList;
}

function _getProfilesOptionList() {
    const optionList = [];
    // options item format:
    // [text, caption, widget, settings-variable, options for combo]

    optionList.push(
        itemFactory.getRowWidget(
            _('Predefined Profiles'),
            _('Sets of settings that can help you with initial customization')
        )
    );

    optionList.push(itemFactory.getRowWidget(
        _('GNOME Shell 3.xx'),
        _('Vertical layout of GNOME Shell 3.xx'),
        itemFactory.newPresetButton(gOptions.loadProfile.bind(gOptions), 0)
    ));

    optionList.push(itemFactory.getRowWidget(
        _('GNOME Shell 40+'),
        _('Horizontal layout of GNOME Shell 40+ with bottom hot edge instead of the hot corner'),
        itemFactory.newPresetButton(gOptions.loadProfile.bind(gOptions), 1)
    ));

    optionList.push(itemFactory.getRowWidget(
        _('Hot Corner Centric'),
        _('Configuration focused on efficiency when using top left hot corner moves workspaces and dash to the top left corner'),
        itemFactory.newPresetButton(gOptions.loadProfile.bind(gOptions), 2)
    ));

    optionList.push(itemFactory.getRowWidget(
        _('Dock Overview'),
        _('Static overview mode, dash and workspace thumbnails at the bottom, horizontal workspaces, bottom hot edge instead the hot corner'),
        itemFactory.newPresetButton(gOptions.loadProfile.bind(gOptions), 3)
    ));

    return optionList;
}

function _getMiscOptionList() {
    const optionList = [];
    // options item format:
    // [text, caption, widget, settings-variable, options for combo]

    optionList.push(
        itemFactory.getRowWidget(
            _('Keyboard')
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Override Page Up/Down Shortcuts'),
            _('This option automatically overrides the (Shift +) Super + Page Up/Down keyboard shortcuts for the current workspace orientation. If you encounter any issues, check the configuration in the dconf editor.'),
            itemFactory.newSwitch(),
            'enablePageShortcuts'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Compatibility')
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Fix for Dash to Dock'),
            _('With the default Ubuntu Dock and other Dash To Dock forks, you may experience issues with Activities overview after you change Dock position or change monitors configuration. If you are experiencing such issues, try to enable this option, or (better) disable/replace the dock extension.'),
            itemFactory.newSwitch(),
            'fixUbuntuDock'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('V-Shell Modules that can be disabled in case of conflict or misbehavior:')
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('AppFavorites'),
            _('Pin/unpin app notification options.'),
            itemFactory.newSwitch(),
            'appFavoritesModule'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('AppDisplay / IconGrid'),
            _('App grid customization and options.'),
            itemFactory.newSwitch(),
            'appDisplayModule'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Dash'),
            _('Dash configuration options and support for vertical orientation.'),
            itemFactory.newSwitch(),
            'dashModule'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Layout'),
            _('Hot corner options, removes right panel barrier that collides with CHC-E extension.'),
            itemFactory.newSwitch(),
            'layoutModule'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('MessageTray'),
            _('Notification position options.'),
            itemFactory.newSwitch(),
            'messageTrayModule'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Panel'),
            _('Panel options.'),
            itemFactory.newSwitch(),
            'panelModule'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Search'),
            _('Search view and app search provider customization and options.'),
            itemFactory.newSwitch(),
            'searchModule'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('SwipeTracker'),
            _('Gestures for vertical workspace orientation.'),
            itemFactory.newSwitch(),
            'swipeTrackerModule'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('WindowAttentionHandler'),
            _('Window attention handler options.'),
            itemFactory.newSwitch(),
            'winAttentionHandlerModule'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('WindowManager'),
            _('Fixes an upstream bug in the minimization animation of a full-screen window.'),
            itemFactory.newSwitch(),
            'windowManagerModule'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('WindowPreview'),
            _('Window preview options, fixes an upstream bug that fills the system log with errors when you close a window from an overview or exit the overview with a gesture when any window is selected.'),
            itemFactory.newSwitch(),
            'windowPreviewModule'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Workspace'),
            _('Fixes workspace preview allocations for vertical workspaces orientation and window scaling in static overview modes.'),
            itemFactory.newSwitch(),
            'workspaceModule'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('WorkspaceAnimation'),
            _('Static workspace animation option.'),
            itemFactory.newSwitch(),
            'workspaceAnimationModule'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('WorkspaceSwitcherPopup'),
            _('Workspace switcher popup position options.'),
            itemFactory.newSwitch(),
            'workspaceSwitcherPopupModule'
        )
    );

    return optionList;
}

function _getAboutOptionList() {
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
        _('Rate and comment the extension on GNOME Extensions site.'),
        itemFactory.newLinkButton('https://extensions.gnome.org/extension/5177')
    ));

    optionList.push(itemFactory.getRowWidget(
        _('Report a bug or suggest new feature'),
        null,
        itemFactory.newLinkButton('https://github.com/G-dH/vertical-workspaces/issues')
    ));

    optionList.push(itemFactory.getRowWidget(
        _('Buy Me a Coffee'),
        _('If you like this extension, you can help me with my coffee expenses.'),
        itemFactory.newLinkButton('https://buymeacoffee.com/georgdh')
    ));

    return optionList;
}
