// Vertical Workspaces
// GPL v3 ©G-dH@Github.com
'use strict';

const { Gtk, GLib, Gio, GObject } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me             = ExtensionUtils.getCurrentExtension();
const Settings       = Me.imports.settings;

// gettext
const _  = Settings._;

// libadwaita is available starting with GNOME Shell 42.
let Adw = null;
try { Adw = imports.gi.Adw; } catch (e) {}

let gOptions;
let stackSwitcher;
let stack;

const LAYOUT_TITLE = _('Layout');
const LAYOUT_ICON = 'view-grid-symbolic';
const ADJUSTMENTS_TITLE = _('Adjustments');
const ADJUSTMENTS_ICON = 'preferences-other-symbolic';
//const CONTENT_TITLE = _('Content');
//const CONTENT_ICON = 'view-reveal-symbolic';
const MISC_TITLE = _('Misc');
const MISC_ICON = 'applications-utilities-symbolic';
const ABOUT_TITLE = _('About');
const ABOUT_ICON = 'preferences-system-details-symbolic';

function _newImageFromIconName(name, size = null) {
    const args = [name];
    return Gtk.Image.new_from_icon_name(...args);
}

function init() {
    ExtensionUtils.initTranslations(Me.metadata['gettext-domain']);
    gOptions = new Settings.Options();
}

// this function is called by GS42 if available and returns libadwaita prefes window
function fillPreferencesWindow(window) {
    const layoutOptionsPage = getAdwPage(_getLayoutOptionList(), {
        title: LAYOUT_TITLE,
        icon_name: LAYOUT_ICON
    });
    const adjustmentOptionsPage = getAdwPage(_getAdjustmentsOptionList(), {
        title: ADJUSTMENTS_TITLE,
        icon_name: ADJUSTMENTS_ICON
    });

    /*const contentOptionsPage = getAdwPage(_geContentOptionList(), {
        title: CONTENT_TITLE,
        icon_name: CONTENT_ICON
    });*/

    const miscOptionsPage = getAdwPage(_geMiscOptionList(), {
        title: MISC_TITLE,
        icon_name: MISC_ICON
    });

    const aboutPage = _getAboutPage({
        title: ABOUT_TITLE,
        icon_name: ABOUT_ICON
    });

    window.add(layoutOptionsPage);
    window.add(adjustmentOptionsPage);
    //window.add(contentOptionsPage);
    window.add(miscOptionsPage);
    window.add(aboutPage);

    window.set_search_enabled(true);
    window.connect('close-request', _onDestroy);

    const width = 700;
    const height = 700;
    window.set_default_size(width, height);

    return window;
}

function _onDestroy() {
    gOptions.destroy();
    gOptions = null;
}


// this function is called by GS prior to 42 and also by 42 if fillPreferencesWindow not available
function buildPrefsWidget() {
    const prefsWidget = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
    });

    stack = new Gtk.Stack({
        hexpand: true
    });

    stackSwitcher = new Gtk.StackSwitcher({
        halign: Gtk.Align.CENTER,
        hexpand: true,
    });

    const context = stackSwitcher.get_style_context();
    context.add_class('caption');

    stackSwitcher.set_stack(stack);
    stack.set_transition_duration(300);
    stack.set_transition_type(Gtk.StackTransitionType.SLIDE_LEFT_RIGHT);

    stack.add_named(getLegacyPage(_getLayoutOptionList()), 'layout');
    stack.add_named(getLegacyPage(_getAdjustmentsOptionList()), 'adjustments');
    //stack.add_named(getLegacyPage(_geContentOptionList()), 'content');
    stack.add_named(getLegacyPage(_geMiscOptionList()), 'misc');

    const pagesBtns = [
        [new Gtk.Label({ label: LAYOUT_TITLE}), _newImageFromIconName(LAYOUT_ICON, Gtk.IconSize.BUTTON)],
        [new Gtk.Label({ label: ADJUSTMENTS_TITLE}), _newImageFromIconName(ADJUSTMENTS_ICON, Gtk.IconSize.BUTTON)],
        //[new Gtk.Label({ label: CONTENT_TITLE}), _newImageFromIconName(CONTENT_ICON, Gtk.IconSize.BUTTON)],
        [new Gtk.Label({ label: MISC_TITLE}), _newImageFromIconName(MISC_ICON, Gtk.IconSize.BUTTON)]
    ];

    let stBtn = stackSwitcher.get_first_child ? stackSwitcher.get_first_child() : null;
    for (let i = 0; i < pagesBtns.length; i++) {
        const box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 6, visible: true});
        const icon = pagesBtns[i][1];
        icon.margin_start = 30;
        icon.margin_end = 30;
        box.append(icon);
        box.append(pagesBtns[i][0]);
        if (stackSwitcher.get_children) {
            stBtn = stackSwitcher.get_children()[i];
            stBtn.add(box);
        } else {
            stBtn.set_child(box);
            stBtn.visible = true;
            stBtn = stBtn.get_next_sibling();
        }
    }

    stack.show_all && stack.show_all();
    stackSwitcher.show_all && stackSwitcher.show_all();

    prefsWidget[prefsWidget.add ? 'add' : 'append'](stack);
    prefsWidget.show_all && prefsWidget.show_all();

    prefsWidget.connect('realize', (widget) => {
        const window = widget.get_root ? widget.get_root() : widget.get_toplevel();
        const width = 700;
        const height = 700;
        window.set_default_size(width, height);

        const headerbar = window.get_titlebar();
        headerbar.title_widget = stackSwitcher;

        window.connect('close-request', _onDestroy);
    });

    return prefsWidget;
}

///////////////////////////////////////////////////
function getAdwPage(optionList, pageProperties = {width_request: 800}) {
    const page = new Adw.PreferencesPage(pageProperties);
    let group;
    for (let item of optionList) {
        // label can be plain text for Section Title
        // or GtkBox for Option
        const option = item[0];
        const widget = item[1];

        if (!widget) {
            if (group) {
                page.add(group);
            }
            group = new Adw.PreferencesGroup({
                title: option,
                hexpand: true,
            });
            continue;
        }

        const row = new Adw.PreferencesRow({
            title: option._title,
        });

        const grid = new Gtk.Grid({
            column_homogeneous: true,
            column_spacing: 10,
            margin_start: 8,
            margin_end: 8,
            margin_top: 8,
            margin_bottom: 8,
            hexpand: true,
        })

        grid.attach(option, 0, 0, 6, 1);
        if (widget) {
            grid.attach(widget, 6, 0, 3, 1);
        }
        row.set_child(grid);
        group.add(row);
    }
    page.add(group);
    return page;
}

function getLegacyPage(optionList) {
    const page = new Gtk.ScrolledWindow({
        hscrollbar_policy: Gtk.PolicyType.NEVER,
        vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
        vexpand: true,
        hexpand: true,
    });

    const context = page.get_style_context();
    context.add_class('background');

    const mainBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 5,
        homogeneous: false,
        margin_start: 16,
        margin_end: 16,
        margin_top: 16,
        margin_bottom: 16,
    });

    let frame;
    let frameBox;

    for (let item of optionList) {
        // item structure: [labelBox, control widget]
        const option = item[0];
        const widget = item[1];
        if (!widget) {
            // new section
            let lbl = new Gtk.Label({
                xalign: 0,
                margin_top: 4,
                margin_bottom: 2
            });
            lbl.set_markup(option); // option is plain text if item is section title
            const context = lbl.get_style_context();
            context.add_class('heading');
            mainBox.append(lbl);
            frame = new Gtk.Frame({
                margin_bottom: 10,
            });
            frameBox = new Gtk.ListBox({
                selection_mode: null,
            });
            mainBox.append(frame);
            frame.set_child(frameBox);
            continue;
        }
        const grid = new Gtk.Grid({
            column_homogeneous: true,
            column_spacing: 10,
            margin_start: 8,
            margin_end: 8,
            margin_top: 8,
            margin_bottom: 8,
            hexpand: true,
        })

        grid.attach(option, 0, 0, 6, 1);
        if (widget) {
            grid.attach(widget, 6, 0, 3, 1);
        }

        frameBox.append(grid);
    }

    page.set_child(mainBox);
    page.show_all && page.show_all();

    return page;
}

/////////////////////////////////////////////////////////////////////

function _newSwitch() {
    let sw = new Gtk.Switch({
        halign: Gtk.Align.END,
        valign: Gtk.Align.CENTER,
        hexpand: true,
    });
    sw.is_switch = true;
    return sw;
}

function _newSpinButton(adjustment) {
    let spinButton = new Gtk.SpinButton({
        halign: Gtk.Align.END,
        hexpand: true,
        xalign: 0.5,
    });
    spinButton.set_adjustment(adjustment);
    spinButton.is_spinbutton = true;
    return spinButton;
}

function _newComboBox() {
    const model = new Gtk.ListStore();
    model.set_column_types([GObject.TYPE_STRING, GObject.TYPE_INT]);
    const comboBox = new Gtk.ComboBox({
        model,
        halign: Gtk.Align.END,
        valign: Gtk.Align.CENTER,
        hexpand: true,
    });
    const renderer = new Gtk.CellRendererText();
    comboBox.pack_start(renderer, true);
    comboBox.add_attribute(renderer, 'text', 0);
    comboBox.is_combo_box = true;
    return comboBox;
}

function _newDropDown() {
    const dropDown = new Gtk.DropDown({
        model: new Gtk.StringList(),
        halign: Gtk.Align.END,
        valign: Gtk.Align.CENTER,
        hexpand: true,
    });
    dropDown.is_dropDown = true;
    return dropDown;
}

function _newEntry() {
    const entry = new Gtk.Entry({
        width_chars: 25,
        halign: Gtk.Align.END,
        valign: Gtk.Align.CENTER,
        hexpand: true,
        xalign: 0,
    });
    entry.set_icon_from_icon_name(Gtk.EntryIconPosition.SECONDARY, 'edit-clear-symbolic');
    entry.set_icon_activatable(Gtk.EntryIconPosition.SECONDARY, true);
    entry.connect('icon-press', (e) => e.set_text(''));
    entry.is_entry = true;
    return entry;
}

function _newScale(adjustment) {
    const scale = new Gtk.Scale({
        orientation: Gtk.Orientation.HORIZONTAL,
        draw_value:  true,
        has_origin:  false,
        value_pos:   Gtk.PositionType.LEFT,
        digits:      0,
        halign:      Gtk.Align.FILL,
        valign:      Gtk.Align.CENTER,
        hexpand:     true,
        vexpand:     false,
    });
    scale.set_adjustment(adjustment);
    scale.is_scale = true;
    return scale;
}

/*--------------------------------------------------------------------------------------- */
function _optionsItem(text, caption, widget, variable, options = []) {
    let item = [];
    let label;
    if (widget) {
        label = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 4,
            halign: Gtk.Align.START,
            valign: Gtk.Align.CENTER,
        });

        label._title = text;
        const option = new Gtk.Label({
            halign: Gtk.Align.START,
        });
        option.set_markup(text);

        label.append(option);

        if (caption) {
            const captionLbl = new Gtk.Label({
                halign: Gtk.Align.START,
                wrap: true,
                xalign: 0
            })
            const context = captionLbl.get_style_context();
            context.add_class('dim-label');
            context.add_class('caption');
            captionLbl.set_text(caption);
            label.append(captionLbl);
        }

    } else {
        label = text;
    }
    item.push(label);
    item.push(widget);

    let settings;
    let key;
    if (variable && gOptions.options[variable]) {
        const opt = gOptions.options[variable];
        key = opt[1];
        settings = opt[2] ? opt[2]() : gOptions._gsettings;
    }
    if (widget && widget.is_switch) {
        settings.bind(key, widget, 'active', Gio.SettingsBindFlags.DEFAULT);

    } else if (widget && widget.is_combo_box) {
        let model = widget.get_model();
        for (const [label, value] of options) {
            let iter;
            model.set(iter = model.append(), [0, 1], [label, value]);
        }
        widget.set_active(gOptions.get(variable));
        settings.bind(key, widget, 'active', Gio.SettingsBindFlags.DEFAULT);

    } else if (widget && widget.is_dropDown) {
        const model = widget.get_model();
        for (const [label, value] of options) {
            model.append(label);
        }
        //widget.set_selected(gOptions.get(variable));
        settings.bind(key, widget, 'selected', Gio.SettingsBindFlags.DEFAULT);
    } else if (widget && widget.is_entry) {
        if (options) {
            const names = gOptions.get(variable);
            if (names[options - 1])
                widget.set_text(names[options - 1]);

            widget.set_placeholder_text(_('Workspace') + ` ${options}`);

            widget.connect('changed', () => {
                const names = [];
                wsEntries.forEach(e => {
                if (e.get_text())
                    names.push(e.get_text());
                })
                gOptions.set('wsNames', names);
            });

            wsEntries.push(widget);
        }

    } else if (widget && widget.is_scale) {
        settings.bind(key, widget.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
    }

    return item;
}

//////////////////////////////////////////////////////////////////////
function _getLayoutOptionList() {
    const optionList = [];
    // options item format:
    // [text, caption, widget, settings-variable, options for combo]

    optionList.push(
        _optionsItem(
            _('Dash'),
        )
    );

    optionList.push(
        _optionsItem(
            _('Dash Position'),
            null,
            _newComboBox(),
            //_newDropDown(),
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
        _optionsItem(
            _('Center Horizontal Dash to Workspace'),
            _('If position Top or Bottom is selected, Dash position will be calculated relative to the workspace preview instead of the screen. Works only with default Dash.'),
            _newSwitch(),
            'centerDashToWs',
        )
    );

    const dashPositionAdjustment = new Gtk.Adjustment({
        upper: 100,
        lower: -100,
        step_increment: 1,
        page_increment: 10,
    });

    const dashPositionScale = _newScale(dashPositionAdjustment);
    dashPositionScale.add_mark(0, Gtk.PositionType.TOP, null);
    optionList.push(
        _optionsItem(
            _('Fine Tune Dash Position'),
            _('Adjust position of the dock on chosen axis. Works only with default Dash.'),
            dashPositionScale,
            'dashPositionAdjust'
        )
    );

    optionList.push(
        _optionsItem(
            _('Show Apps Icon Position'),
            _('The Apps icon in Dash'),
            _newComboBox(),
            //_newDropDown(),
            'showAppsIconPosition',
            [   [_('Start'), 0],
                [_('End'), 1],
            ]
        )
    );

    optionList.push(
        _optionsItem(
            _('Dash Max Icon Size'),
            _('Maximum size of Dash icons in pixels. Works only with default Dash.'),
            _newComboBox(),
            //_newDropDown(),
            'dashMaxIconSize',
            [   [_('16'), 0],
                [_('24'), 1],
                [_('32'), 2],
                [_('48'), 3],
                [_('64'), 4],
            ]
        )
    );

    optionList.push(
        _optionsItem(
            _('Workspace Thumbnails'),
        )
    );

    optionList.push(
        _optionsItem(
            _('Workspace Thumbnails Position and Max Height'),
            _('Position of the workspace thumbnails on the screen. Full-Height options allow the workspace thumbnails to use the full height of the screen at the expense of the space available for Dash.'),
            _newComboBox(),
            //_newDropDown(),
            'workspaceThumbnailsPosition',
            [   [_('Left'), 0],
                [_('Right'), 1],
                [_('Left - Full-Height'), 2],
                [_('Right - Full-Height'), 3],
                [_('Disable'), 4],
            ]
        )
    );

    const wstPositionAdjustment = new Gtk.Adjustment({
        upper: 100,
        lower: -100,
        step_increment: 1,
        page_increment: 10,
    });

    const wstPositionScale = _newScale(wstPositionAdjustment);
    wstPositionScale.add_mark(0, Gtk.PositionType.TOP, null);
    optionList.push(
        _optionsItem(
            _('Fine Tune Workspace Thumbnails Position'),
            _('Adjusts workspace thumbnails vertical position.'),
            wstPositionScale,
            'wsTmbPositionAdjust'
        )
    );

    optionList.push(
        _optionsItem(
            _('Workspace Thumbnails Position on Secondary Monitor'),
            _('Allows you to place workspace thumbnails of the secondary monitor closer to the one on the primary monitor. "Default" option follows position of the primary workspace thumbnails.'),
            _newComboBox(),
            //_newDropDown(),
            'secondaryWsThumbnailsPosition',
            [   [_('Left'), 0],
                [_('Right'), 1],
                [_('Default'), 2],
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

    const SecWstPositionScale = _newScale(SecWstPositionAdjustment);
    SecWstPositionScale.add_mark(0, Gtk.PositionType.TOP, null);
    optionList.push(
        _optionsItem(
            _('Fine Tune Secondary Workspace Thumbnails Position'),
            _('Adjusts secondary monitors workspace thumbnails vertical position.'),
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

    const wsThumbnailScale = _newScale(wsThumbnailScaleAdjustment);
    wsThumbnailScale.add_mark(13, Gtk.PositionType.TOP, null);
    optionList.push(
        _optionsItem(
            _('Workspace Thumbnails Max Scale'),
            _('Adjusts maximum size of the workspace thumbnails (% relative to display width).'),
            wsThumbnailScale,
            'wsThumbnailScale'
        )
    );

    optionList.push(
        _optionsItem(
            _('App Grid'),
        )
    );

    optionList.push(
        _optionsItem(
            _('Center App Grid'),
            _('App grid in app view page will be centered to the display instead of the available space. This option may have impact on the size of the grid, more for narrower and small resolution displays, especially if workspace thumbnails are bigger.'),
            _newSwitch(),
            'centerAppGrid',
        )
    );

    optionList.push(
        _optionsItem(
            _('Search View'),
        )
    );

    optionList.push(
        _optionsItem(
            _('Center Search View'),
            _('Search view will be centered to the display instead of the available space. If needed workspace thumbnails will be temporarilly scaled down to fit the search box. This option has bigger impact for narrower and small resolution displays.'),
            _newSwitch(),
            'centerSearch',
        )
    );

    return optionList;
}

function _getAdjustmentsOptionList() {
    const optionList = [];
    // options item format:
    // [text, caption, widget, settings-variable, options for combo]

    //----------------------------------------------------------------
    optionList.push(
        _optionsItem(
            _('Appearance'),
        )
    );

    const dashBgAdjustment = new Gtk.Adjustment({
        upper: 100,
        lower: 0,
        step_increment: 1,
        page_increment: 10,
    });

    const dashBgOpacityScale = _newScale(dashBgAdjustment);
    optionList.push(
        _optionsItem(
            _('Dash Background Opacity'),
            _('Adjusts opacity of the default background (%).'),
            dashBgOpacityScale,
            'dashBgOpacity'
        )
    );

    optionList.push(
        _optionsItem(
            _('Show Workspace Thumbnails Labels'),
            _('Each workspace thumbnail can show its index and name (if defined in the system settings) or name of its most recently used app.'),
            _newComboBox(),
            //_newDropDown(),
            'showWsTmbLabels',
            [   [_('Disable'), 0],
                [_('Index'), 1],
                [_('Index + WS Name'), 2],
                [_('Index + App Name'), 3],
            ]
        )
    );

    optionList.push(
        _optionsItem(
            _('Show WS Thumbnail Label on Hover'),
            _('Show label only when the mouse pointer hovers over a thumbnail'),
            _newSwitch(),
            'showWsTmbLabelsOnHover',
        )
    );

    optionList.push(
        _optionsItem(
            _('Show Wallpaper in Workspace Thumbnails'),
            _('Workspace thumbnails will include the current desktop backgroud.'),
            _newSwitch(),
            'showWsSwitcherBg',
        )
    );

    optionList.push(
        _optionsItem(
            _('Show Workspace Preview Background'),
            _('Allows you to hide workspace preview background wallpaper in the Activities overview.'),
            _newSwitch(),
            'showWsPreviewBg',
        )
    );

    optionList.push(
        _optionsItem(
            _('Window Preview App Icon Size'),
            _('Default size is 64.'),
            _newComboBox(),
            //_newDropDown(),
            'winPreviewIconSize',
            [   [_('64'), 0],
                [_('48'), 1],
                [_('32'), 2],
                [_('22'), 3],
                [_('Disable'), 4]
            ]
        )
    );

    //----------------------------------------------------------------

    optionList.push(
        _optionsItem(
            _('Behavior'),
        )
    );

    optionList.push(
        _optionsItem(
            _('App Grid Animation'),
            _(`When entering the App Grid view, the app grid animates from the edge of the screen (defaultly from the right edge to follow the three fingers trackpad gesture). You can choose other direction or disable the animation if you don't like it.`),
            _newComboBox(),
            //_newDropDown(),
            'appGridAnimation',
            [   [_('Disable'), 0],
                [_('From Right'), 1],
                [_('From Left'), 2],
                [_('From Bottom'), 3],
                [_('Auto'), 4]
            ]
        )
    );

    optionList.push(
        _optionsItem(
            _('Workspace Animation'),
            _(`When entering / leaving the App Grid view, the workspace can animate to/from workspace thumbnails. The animation can be choppy if you have many workspaces with many windows and weak hw.`),
            _newComboBox(),
            //_newDropDown(),
            'workspaceAnimation',
            [   [_('Disable'), 0],
                [_('Enable'), 1],
            ]
        )
    );

    return optionList;
}

// ------------------------------------------------------------------------------

function _geContentOptionList() {
    const optionList = [];
    // options item format:
    // [text, caption, widget, settings-variable, options for combo]

    optionList.push(
        _optionsItem(
            _('Content of the Overview'),
        )
    );

    optionList.push(
        _optionsItem(
            _('Show Dash'),
            _('Disable to remove Dash from Activities Overview.'),
            _newSwitch(),
            'showDash',
        )
    );

    optionList.push(
        _optionsItem(
            _('Show Workspace Thumbnails'),
            _('Disable to remove workspace thumbnails from Activities Overview.'),
            _newSwitch(),
            'showWsSwitcher',
        )
    );

    return optionList;
}

function _geMiscOptionList() {
    const optionList = [];
    // options item format:
    // [text, caption, widget, settings-variable, options for combo]

    optionList.push(
        _optionsItem(
            _('Keyboard'),
        )
    );

    optionList.push(
        _optionsItem(
            _('Override Page Up/Down Shortcuts'),
            _('This option automatically overrides the (Sift +) Super + Page Up/Down keyboard shortcuts for the current workspace orientation. If you encounter any issues, check the configuration in the dconf editor.'),
            _newSwitch(),
            'enablePageShortcuts',
        )
    );

    optionList.push(
        _optionsItem(
            _('Compatibility'),
        )
    );

    optionList.push(
        _optionsItem(
            _('Fix for Dash to Dock'),
            _('With the default Ubuntu Dock and other Dash To Dock forks, you may experience issues with Activities overview after you change Dock position or change monitors configuration. If you are experiencing such issues, try to enable this option, or disable/replace the dock extension.'),
            _newSwitch(),
            'fixUbuntuDock',
        )
    );

    return optionList;
}

/////////////////////////////////////////////////

function _getAboutPage(pageProperties) {
    const page = new Adw.PreferencesPage(pageProperties);

    const aboutGroup = new Adw.PreferencesGroup({
        title: Me.metadata.name,
        hexpand: true,
    });
    
    const linksGroup = new Adw.PreferencesGroup({
        title: _('Links'),
        hexpand: true,
    });

    page.add(aboutGroup);
    page.add(linksGroup);

////////////////////////////////////////////////////

    aboutGroup.add(_newAdwLabelRow({
        title: _('Version'),
        subtitle: _(''),
        label: Me.metadata.version.toString()
    }));

    aboutGroup.add(_newResetRow({
        title: _('Reset all options'),
        subtitle: _('Set all options to default values.'),
    }));
    

    linksGroup.add(_newAdwLinkRow({
        title: _('Homepage'),
        subtitle: _('Source code and more info about this extension'),
        uri: 'https://github.com/G-dH/vertical-workspaces'
    }));

    linksGroup.add(_newAdwLinkRow({
        title: _('Gome Extensions'),
        subtitle: _('Rate and comment the extension on GNOME Extensions site.'),
        uri: 'https://extensions.gnome.org/extension/5177',
    }));

    linksGroup.add(_newAdwLinkRow({
        title: _('Report a bug or suggest new feature'),
        subtitle: _(''),
        uri: 'https://github.com/G-dH/vertical-workspaces/issues',
    }));

    linksGroup.add(_newAdwLinkRow({
        title: _('Buy Me a Coffee'),
        subtitle: _('If you like this extension, you can help me with coffee expenses.'),
        uri: 'https://buymeacoffee.com/georgdh'
    }));

    return page;
}

function _newAdwLabelRow(params) {
    const label = new Gtk.Label({
        label: params.label
    });

    const actionRow = new Adw.ActionRow({
        title: params.title,
        subtitle: params.subtitle,
    });

    actionRow.add_suffix(label);

    return actionRow;
}

function _newAdwLinkRow(params) {
    const linkBtn = new Gtk.LinkButton({
        uri: params.uri,
        halign: Gtk.Align.END,
        valign: Gtk.Align.CENTER,
    });

    const actionRow = new Adw.ActionRow({
        title: params.title,
        subtitle: params.subtitle,
        activatable_widget: linkBtn
    });

    actionRow.add_suffix(linkBtn);

    return actionRow;
}

function _newResetRow(params) {
    const btn = new Gtk.Button({
        icon_name: 'view-refresh-symbolic',
        halign: Gtk.Align.END,
        valign: Gtk.Align.CENTER,
    });
    btn.connect('clicked', () => {
        Object.keys(gOptions.options).forEach(key => {
            gOptions.set(key, gOptions.getDefault(key));
        });
    });

    const actionRow = new Adw.ActionRow({
        title: params.title,
        subtitle: params.subtitle,
    });

    actionRow.add_suffix(btn);

    return actionRow;
}