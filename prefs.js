/**
 * Vertical Workspaces
 * prefs.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022
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
try { Adw = imports.gi.Adw; } catch (e) {}

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
            optionList: _getLayoutOptionList()
        },
        {
            name: 'appearance',
            title: _('Appearance'),
            iconName: 'view-reveal-symbolic',
            optionList: _getAppearanceOptionList()
        },
        {
            name: 'behavior',
            title: _('Behavior'),
            iconName: 'preferences-other-symbolic',
            optionList: _getBehaviorOptionList()
        },
        {
            name: 'misc',
            title: _('Misc'),
            iconName: 'input-keyboard-symbolic',
            optionList: _getMiscOptionList()
        },
        {
            name: 'about',
            title: _('About'),
            iconName: 'preferences-system-details-symbolic',
            optionList: _getAboutOptionList()
        }
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

    prefsWidget.connect('realize', (widget) => {
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

//////////////////////////////////////////////////////////////////////
function _getLayoutOptionList() {
    const optionList = [];
    // options item format:
    // [text, caption, widget, settings-variable, options for combo]

    optionList.push(
        itemFactory.getRowWidget(
            _('Dash'),
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Dash Position'),
            null,
            itemFactory.newComboBox(),
            //itemFactory.newDropDown(),
            'dashPosition',
            [   [_('Top'), 0],
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
            'centerDashToWs',
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
            _('Show Apps Icon Position'),
            _('Sets the position of the "Show Applications" icon in the Dash.'),
            itemFactory.newComboBox(),
            //itemFactory.newDropDown(),
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
            _('List Windows Icon Position'),
            _('This option adds "List Open Windows" icon into dash so you can directly toggle window search provider results. Even if you disable this icon, you can use the secondary mouse button click on the Show Apps Icon, or the Space key press to access this feature.'),
            itemFactory.newComboBox(),
            //itemFactory.newDropDown(),
            'dashShowWindowsIcon',
            [   [_('Hide'), 0],
                [_('Start'), 1],
                [_('End'), 2],
            ]
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Dash Max Icon Size'),
            _('Maximum size of Dash icons in pixels. Works only with default Dash.'),
            itemFactory.newComboBox(),
            //itemFactory.newDropDown(),
            'dashMaxIconSize',
            [   [_('128'), 8],
                [_('112'), 7],
                [_('96'), 6],
                [_('80'), 5],
                [_('64'), 4],
                [_('48'), 3],
                [_('32'), 2],
                [_('24'), 1],
                [_('16'), 0],
            ]
        )
    );


    optionList.push(
        itemFactory.getRowWidget(
            _('Workspaces Thumbnails / Orientation'),
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Thumbnails Position / Workspaces Orientation'),
            _('Position of the workspaces thumbnails on the screen also sets orientation of the workspaces to vertical or horizontal. You have two options to disable workspaces thumbnails, one sets workspaces to the vertical orientation, the second one to horizontal.'),
            itemFactory.newComboBox(),
            //itemFactory.newDropDown(),
            'workspaceThumbnailsPosition',
            // this mess is just because of backward compatibility
            [   [_('Left       \t Vertical Orientation'), 0],
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
            _('Fine Tune Workspaces Thumbnails Position'),
            _('Adjusts workspaces thumbnails vertical position.'),
            wstPositionScale,
            'wsTmbPositionAdjust'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Reserve Full Screen Height/Width for Thumbnails'),
            _('The whole screen height/width will be reserved for workspaces thumbnails at the expense of space available for Dash (if the Dash is oriented in a different axis).'),
            itemFactory.newSwitch(),
            'WsThumbnailsFull',
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Workspaces Thumbnails Position on Secondary Monitor'),
            _('Allows you to place workspaces thumbnails of secondary monitors on the opposite side than on the primary monitor.'),
            itemFactory.newComboBox(),
            //itemFactory.newDropDown(),
            'secondaryWsThumbnailsPosition',
            [   [_('Left / Top'), 0],
                [_('Right / Bottom'), 1],
                [_('Same as Primary'), 2],
                [_('Disable'), 3],
            ]
        )
    );

    const SecWstPositionAdjustment = new Gtk.Adjustment({
        upper: 100,
        lower: -100,
        step_increment: 1,
        page_increment: 10,
    });

    const SecWstPositionScale = itemFactory.newScale(SecWstPositionAdjustment);
    SecWstPositionScale.add_mark(0, Gtk.PositionType.TOP, null);
    optionList.push(
        itemFactory.getRowWidget(
            _('Fine Tune Secondary Workspaces Thumbnails Position'),
            _('Adjusts secondary monitors workspaces thumbnails vertical position.'),
            SecWstPositionScale,
            'SecWsTmbPositionAdjust'
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
            _('Workspaces Thumbnails Max Scale'),
            _('Adjusts maximum size of the workspaces thumbnails (% relative to display width).'),
            wsThumbnailScale,
            'wsThumbnailScale'
        )
    );


    optionList.push(
        itemFactory.getRowWidget(
            _('Workspace Preview'),
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
            _('Scales down workspaces preview so you can fit more of the adjacent workspaces on the screen. Default size is calculated to use all available space.'),
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
            _('Adjusts spacing between workspaces previews so you can control how much of the adjacent workspaces overlap to the current workspace overview. Default value should set the adjacent workspaces out of the screen.'),
            wsSpacingScale,
            'wsMaxSpacing'
        )
    );


    optionList.push(
        itemFactory.getRowWidget(
            _('App Grid'),
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Center App Grid'),
            _('App grid in app view page will be centered to the display instead of the available space. This option may have impact on the size of the grid, more for narrower and small resolution displays, especially if workspaces thumbnails are bigger.'),
            itemFactory.newSwitch(),
            'centerAppGrid',
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Icon Size'),
            _('Allows to force fixed icon size and bypass the default adaptive algorithm.'),
            itemFactory.newComboBox(),
            //itemFactory.newDropDown(),
            'appGridIconSize',
            [   [_('Adaptive (Default)'), -1],
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

    optionList.push(
        itemFactory.getRowWidget(
            _('Folder Icon Size'),
            _('Allows to disable the default adaptive algorithm and set a fixed size of icons inside folders.'),
            itemFactory.newComboBox(),
            //itemFactory.newDropDown(),
            'appGridFolderIconSize',
            [   [_('Adaptive (Default)'), -1],
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

    const customGridSwitch = itemFactory.newSwitch();
    optionList.push(
        itemFactory.getRowWidget(
            _('Enable Custom Grid Size'),
            _('Apply following grid parameters.'),
            customGridSwitch,
            //itemFactory.newDropDown(),
            'appGridAllowCustom'
        )
    );

    const columnsAdjustment = new Gtk.Adjustment({
        upper: 15,
        lower: 2,
        step_increment: 1,
        page_increment: 1,
    });

    const columnsSpinBtn = itemFactory.newSpinButton(columnsAdjustment);
    optionList.push(itemFactory.getRowWidget(
        _('Columns per Page'),
        _('Number of columns in application grid.'),
        columnsSpinBtn,
        'appGridColumns'
    ));

    const rowsAdjustment = new Gtk.Adjustment({
        upper: 15,
        lower: 2,
        step_increment: 1,
        page_increment: 1,
    });

    const rowsSpinBtn = itemFactory.newSpinButton(rowsAdjustment);
    optionList.push(itemFactory.getRowWidget(
        _('Rows per Page'),
        _('Number of rows in application grid.'),
        rowsSpinBtn,
        'appGridRows'
    ));

    const folderColumnsAdjustment = new Gtk.Adjustment({
        upper: 8,
        lower: 2,
        step_increment: 1,
        page_increment: 1,
    });

    const folderColumnsSpinBtn = itemFactory.newSpinButton(folderColumnsAdjustment);
    optionList.push(itemFactory.getRowWidget(
        _('Folder Columns per Page'),
        _('Number of columns in folder grid.'),
        folderColumnsSpinBtn,
        'appGridFolderColumns'
    ));

    const folderRowsAdjustment = new Gtk.Adjustment({
        upper: 8,
        lower: 2,
        step_increment: 1,
        page_increment: 1,
    });

    const folderRowsSpinBtn = itemFactory.newSpinButton(folderRowsAdjustment);
    optionList.push(itemFactory.getRowWidget(
        _('Folder Rows per Page'),
        _('Number of rows in folder grid.'),
        folderRowsSpinBtn,
        'appGridFolderRows'
    ));

    const _setOptionsSensitivity = () => {
        columnsSpinBtn.sensitive = customGridSwitch.active;
        rowsSpinBtn.sensitive = customGridSwitch.active;
        folderColumnsSpinBtn.sensitive = customGridSwitch.active;
        folderRowsSpinBtn.sensitive = customGridSwitch.active;
    };
    _setOptionsSensitivity();
    customGridSwitch.connect('notify::active', () => {
        _setOptionsSensitivity();
    });


    optionList.push(
        itemFactory.getRowWidget(
            _('Search View'),
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Center Search View'),
            _('Search view will be centered to the display instead of the available space. If needed, workspaces thumbnails will be temporarily scaled down to fit the search box. This option has bigger impact for narrower and small resolution displays.'),
            itemFactory.newSwitch(),
            'centerSearch',
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Always Show Search Entry'),
            _('If disabled, the search entry field will be hidden when not in use, so the workspace preview and app grid may take up more space.'),
            itemFactory.newSwitch(),
            'showSearchEntry',
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
            _('Adjusts maximum width of search results view (% relative to default). This allows you to fit more (or less) app icons into app search result.'),
            searchViewScale,
            'searchViewScale'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('App Search Icon Size'),
            _('Size of results provided by the App Search Provider.'),
            itemFactory.newComboBox(),
            //itemFactory.newDropDown(),
            'searchIconSize',
            [[_('128'), 128],
             [_('112'), 112],
             [_('96'), 96],
             [_('80'), 80],
             [_('64'), 64],
             [_('48'), 48],
             [_('32'), 32],]
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Panel'),
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Main Panel Position'),
            _('Allows you to place the main panel at the bottom of your monitor.'),
            itemFactory.newComboBox(),
            //itemFactory.newDropDown(),
            'panelPosition',
            [   [_('Top (Default)'), 0],
                [_('Bottom'), 1],
            ]
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Main Panel Visibility'),
            _('Main panel can be visible always, only in the overview or never.'),
            itemFactory.newComboBox(),
            //itemFactory.newDropDown(),
            'panelVisibility',
            [   [_('Always Visible (Default)'), 0],
                [_('Always Hidden'), 1],
                [_('Overview Only'), 2],
                //[_('Desktop View Only'), 3],
            ]
        )
    );

    return optionList;
}

function _getAppearanceOptionList() {
    const optionList = [];
    // options item format:
    // [text, caption, widget, settings-variable, options for combo]

    //----------------------------------------------------------------
    optionList.push(
        itemFactory.getRowWidget(
            _('Dash'),
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
            _('Adjusts the border radius of the dash background in pixels. 0 means default value.'),
            dashBgRadiusScale,
            'dashBgRadius'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Workspaces Thumbnails'),
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Show Workspaces Thumbnails Labels'),
            _('Each workspace thumbnails can show its index and name (if defined in the system settings) or name/title of its most recently used app/window.'),
            itemFactory.newComboBox(),
            //itemFactory.newDropDown(),
            'showWsTmbLabels',
            [   [_('Disable'), 0],
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
            'showWsTmbLabelsOnHover',
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Show Wallpaper in Workspaces Thumbnails'),
            _('All workspace thumbnails will include the current desktop background.'),
            itemFactory.newSwitch(),
            'showWsSwitcherBg',
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Window Preview'),
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Window Preview App Icon Size'),
            _('Default size is 64.'),
            itemFactory.newComboBox(),
            //itemFactory.newDropDown(),
            'winPreviewIconSize',
            [   [_('64'), 0],
                [_('48'), 1],
                [_('32'), 2],
                [_('22'), 3],
                [_('Disable'), 4]
            ]
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Always Show Window Titles'),
            _('All windows on the workspace preview will show their titles, not only the one with the mouse pointer.'),
            itemFactory.newSwitch(),
            'alwaysShowWinTitles',
        )
    );


    optionList.push(
        itemFactory.getRowWidget(
            _('Workspace Preview'),
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Show Workspace Preview Background'),
            _('Allows you to hide the scaling background of the workspace preview.'),
            itemFactory.newSwitch(),
            'showWsPreviewBg',
        )
    );


    optionList.push(
        itemFactory.getRowWidget(
            _('Overview Background'),
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Show Static Background'),
            _('Show static background wallpaper instead of the solid grey color.'),
            itemFactory.newSwitch(),
            'showBgInOverview',
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
            'smoothBlurTransitions',
        )
    );

    return optionList;
}
    //----------------------------------------------------------------

function _getBehaviorOptionList() {
    const optionList = [];

    optionList.push(
        itemFactory.getRowWidget(
            _('Overview'),
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Overview Mode'),
            _('The Expose Windows on Hover mode do not expose the workspace preview windows until the mouse pointer enters any window.\nThe Static Workspace mode does not scale the workspace preview, it only shows Dash and workspaces thumbnails over the desktop. Clicking on a workspace thumbnail scales the ws preview and exposes its windows like in the default overview mode.'),
            itemFactory.newComboBox(),
            //itemFactory.newDropDown(),
            'overviewMode',
            [   [_('Default'), 0],
                [_('Expose Windows on Hover'), 1],
                [_('Static Workspace'), 2]
            ]
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Startup State'),
            _('Allows to change the state in which GNOME Shell starts a session.'),
            itemFactory.newComboBox(),
            //itemFactory.newDropDown(),
            'startupState',
            [   [_('Overview'), 0],
                [_('Desktop'), 1],
                [_('App Grid'), 2],
            ]
        )
    );


    optionList.push(
        itemFactory.getRowWidget(
            _('Dash'),
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Dash Icon Click'),
            _('if the app you clicked on has more than one window and the recently used window is not on the current workspace, the overview can switch to the workspace with the recent window.'),
            itemFactory.newComboBox(),
            //itemFactory.newDropDown(),
            'dashShowWindowsBeforeActivation',
            [   [_('Activate Last Used Window Immediately'), 0],
                [_('Switch to Workspace with Recently Used Window'), 1],
            ]
        )
    );


    optionList.push(
        itemFactory.getRowWidget(
            _('App Grid'),
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Apps Order'),
            _('Choose sorting method for the app grid. Note that sorting by alphabet and usage ignores folders.'),
            itemFactory.newComboBox(),
            //itemFactory.newDropDown(),
            'appGridOrder',
            [   [_('Default'), 0],
                [_('Alphabet'), 1],
                [_('Usage'), 2],
            ]
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Include Dash Items'),
            _('Include favorite / running apps currently present in the Dash in the app grid.'),
            itemFactory.newComboBox(),
            //itemFactory.newDropDown(),
            'appGridIncludeDash',
            [   [_('Disable'), 0],
                [_('Enable'), 1],
                [_('Enable - Sort First'), 2],
            ]
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Allow Incomplete Pages'),
            _('If disabled, icons from the next page (if any) are automatically moved to fill any empty slot left after an icon was (re)moved (to a folder for example).'),
            itemFactory.newSwitch(),
            //itemFactory.newDropDown(),
            'appGridIncompletePages'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Search'),
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
            _('Window Search Provider'),
        )
    );

    const wspSwitch = itemFactory.newSwitch();
    optionList.push(
        itemFactory.getRowWidget(
            _('Enable Window Search Provider'),
            _('Activates a window search provider that adds open windows to the search results. You can search app names and window titles. You can also use "wq/" prefix to suppress results from other search providers.'),
            wspSwitch,
            'searchWindowsEnable'
        )
    );

    const wspFuzzySwitch = itemFactory.newSwitch();
    optionList.push(
        itemFactory.getRowWidget(
            _('Enable Fuzzy Match'),
            _('Fuzzy match allows you to find "Firefox" even if you type "ffx". If fuzzy match is disabled, you need to enter exact patterns separated by a space, but in arbitrary order.'),
            wspFuzzySwitch,
            'searchWindowsFuzzy'
        )
    );

    /*const wspCommandSwitch = itemFactory.newSwitch();
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
            _('Animations'),
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('App Grid Animation'),
            _(`When entering the App Grid view, the app grid animates from the edge of the screen. You can choose direction, keep it Default (direction will be chosen automatically) or disable the animation if you don't like it.`),
            itemFactory.newComboBox(),
            //itemFactory.newDropDown(),
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
            _('Workspace Preview Animation'),
            _(`When entering / leaving the App Grid / Search view, the workspace preview can animate to/from workspace thumbnail.`),
            itemFactory.newComboBox(),
            //itemFactory.newDropDown(),
            'workspaceAnimation',
            [   [_('Disable'), 0],
                [_('Enable'), 1],
            ]
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Workspace Switcher Animation'),
            _('Allows you to disable movement of the desktop background during workspace switcher animation outside of the overview.'),
            itemFactory.newComboBox(),
            //itemFactory.newDropDown(),
            'workspaceSwitcherAnimation',
            [   [_('Default'), 0],
                [_('Static Background'), 1],
            ]
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

    return optionList;
}

function _getMiscOptionList() {
    const optionList = [];
    // options item format:
    // [text, caption, widget, settings-variable, options for combo]

    optionList.push(
       itemFactory.getRowWidget(
            _('Keyboard'),
        )
    );

    optionList.push(
       itemFactory.getRowWidget(
            _('Override Page Up/Down Shortcuts'),
            _('This option automatically overrides the (Shift +) Super + Page Up/Down keyboard shortcuts for the current workspace orientation. If you encounter any issues, check the configuration in the dconf editor.'),
            itemFactory.newSwitch(),
            'enablePageShortcuts',
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
             _('App Grid'),
         )
     );

    optionList.push(itemFactory.getRowWidget(
        _('Reset App Grid Layout'),
        _('Removes all stored app grid icons positions, after the reset icons will be ordered alphabetically.'),
        itemFactory.newResetButton(() => {
            const settings = ExtensionUtils.getSettings('org.gnome.shell');
            settings.set_value('app-picker-layout', new GLib.Variant('aa{sv}', []));
        }),
    ));

    optionList.push(itemFactory.getRowWidget(
        _('Remove App Grid Folders'),
        _('Removes all folders, folder apps move to root grid.'),
        itemFactory.newResetButton(() => {
            const settings = ExtensionUtils.getSettings('org.gnome.desktop.app-folders');
            settings.set_strv('folder-children', []);
        }),
    ));

    optionList.push(
       itemFactory.getRowWidget(
            _('Compatibility'),
        )
    );

    optionList.push(
       itemFactory.getRowWidget(
            _('Fix for Dash to Dock'),
            _('With the default Ubuntu Dock and other Dash To Dock forks, you may experience issues with Activities overview after you change Dock position or change monitors configuration. If you are experiencing such issues, try to enable this option, or disable/replace the dock extension.'),
            itemFactory.newSwitch(),
            'fixUbuntuDock',
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
        itemFactory.newLabel(Me.metadata.version.toString()),
    ));

    optionList.push(itemFactory.getRowWidget(
        _('Reset all options'),
        _('Set all options to default values.'),
        itemFactory.newOptionsResetButton(),
    ));


    optionList.push(itemFactory.getRowWidget(
        _('Links')
    ));

    optionList.push(itemFactory.getRowWidget(
        _('Homepage'),
        _('Source code and more info about this extension'),
        itemFactory.newLinkButton('https://github.com/G-dH/vertical-workspaces'),
    ));

    optionList.push(itemFactory.getRowWidget(
        _('Changelog'),
        _("See what's changed."),
        itemFactory.newLinkButton('https://github.com/G-dH/vertical-workspaces/blob/main/CHANGELOG.md'),
    ));

    optionList.push(itemFactory.getRowWidget(
        _('GNOME Extensions'),
        _('Rate and comment the extension on GNOME Extensions site.'),
        itemFactory.newLinkButton('https://extensions.gnome.org/extension/5177'),
    ));

    optionList.push(itemFactory.getRowWidget(
        _('Report a bug or suggest new feature'),
        null,
        itemFactory.newLinkButton('https://github.com/G-dH/vertical-workspaces/issues'),
    ));

    optionList.push(itemFactory.getRowWidget(
        _('Buy Me a Coffee'),
        _('If you like this extension, you can help me with my coffee expenses.'),
        itemFactory.newLinkButton('https://buymeacoffee.com/georgdh'),
    ));

    return optionList;
}
