/**
 * Vertical Workspaces
 * prefs.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022
 * @license    GPL-3.0
 */

'use strict';

const { Gtk } = imports.gi;

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
                [_('Disable'), 4],
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
            [   [_('Start'), 0],
                [_('End'), 1],
                [_('Hide'), 2],
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
            [   [_('16'), 0],
                [_('24'), 1],
                [_('32'), 2],
                [_('48'), 3],
                [_('64'), 4],
                [_('80'), 5],
                [_('96'), 6],
                [_('128'), 7],
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
            [   [_('Left       \t Vertical Orientation'), 0],
                [_('Right      \t Vertical Orientation'), 1],
                [_('Disable    \t Set Vertical Orientation'), 4],
                [_('Top        \t Horizontal Orientation'), 5],
                [_('Bottom     \t Horizontal Orientation'), 6],
                [_('Disable    \t Set Horizontal Orientation'), 9],
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
             [_('96'), 96],
             [_('80'), 80],
             [_('64'), 64],
             [_('48'), 48],
             [_('32'), 32],]
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
            _('Each workspace thumbnails can show its index and name (if defined in the system settings) or name of its most recently used app.'),
            itemFactory.newComboBox(),
            //itemFactory.newDropDown(),
            'showWsTmbLabels',
            [   [_('Disable'), 0],
                [_('Index'), 1],
                [_('Index + WS Name'), 2],
                [_('Index + App Name'), 3],
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
            _('Background'),
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
            _('Blur Apps/Search Background'),
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
            _(`When entering / leaving the App Grid view, the workspace preview can animate to/from workspace thumbnail.`),
            itemFactory.newComboBox(),
            //itemFactory.newDropDown(),
            'workspaceAnimation',
            [   [_('Disable'), 0],
                [_('Enable'), 1],
            ]
        )
    );

    const animationSpeedAdjustment = new Gtk.Adjustment({
        upper: 500,
        lower: 1,
        step_increment: 10,
        page_increment: 100,
    });

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
