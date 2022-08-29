// Vertical Workspaces
// GPL v3 ©G-dH@Github.com
'use strict';

const { Gtk, GLib, Gio, GObject } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me             = ExtensionUtils.getCurrentExtension();
const Settings       = Me.imports.settings;

const shellVersion   = Settings.shellVersion;

// gettext
const _  = Settings._;

// libadwaita is available starting with GNOME Shell 42.
let Adw = null;
try { Adw = imports.gi.Adw; } catch (e) {}

let gOptions;
let itemFactory;
let pageList;


function _newImageFromIconName(name) {
    const args = [name];
    return Gtk.Image.new_from_icon_name(...args);
}

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
            name: 'adjustments',
            title: _('Adjustments'),
            iconName: 'preferences-other-symbolic',
            optionList: _getAdjustmentsOptionList()
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
    return new AdwPrefs().getFilledWindow(window, pageList);
}

function buildPrefsWidget() {
    return new LegacyPrefs().getPrefsWidget(pageList);
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
            //itemFactory.newComboBox(),
            itemFactory.newDropDown(),
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
            _('If position Top or Bottom is selected, Dash position will be calculated relative to the workspace preview instead of the screen. Works only with default Dash.'),
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
            _('Adjust position of the dock on chosen axis. Works only with default Dash.'),
            dashPositionScale,
            'dashPositionAdjust'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Show Apps Icon Position'),
            _('The Apps icon in Dash'),
            //itemFactory.newComboBox(),
            itemFactory.newDropDown(),
            'showAppsIconPosition',
            [   [_('Start'), 0],
                [_('End'), 1],
            ]
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Dash Max Icon Size'),
            _('Maximum size of Dash icons in pixels. Works only with default Dash.'),
            //itemFactory.newComboBox(),
            itemFactory.newDropDown(),
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
        itemFactory.getRowWidget(
            _('Workspace Thumbnails'),
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Workspace Thumbnails Position and Max Height'),
            _('Position of the workspace thumbnails on the screen. Full-Height options allow the workspace thumbnails to use the full height of the screen at the expense of the space available for Dash.'),
            //itemFactory.newComboBox(),
            itemFactory.newDropDown(),
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

    const wstPositionScale = itemFactory.newScale(wstPositionAdjustment);
    wstPositionScale.add_mark(0, Gtk.PositionType.TOP, null);
    optionList.push(
        itemFactory.getRowWidget(
            _('Fine Tune Workspace Thumbnails Position'),
            _('Adjusts workspace thumbnails vertical position.'),
            wstPositionScale,
            'wsTmbPositionAdjust'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Workspace Thumbnails Position on Secondary Monitor'),
            _('Allows you to place workspace thumbnails of the secondary monitor closer to the one on the primary monitor. "Default" option follows position of the primary workspace thumbnails.'),
            //itemFactory.newComboBox(),
            itemFactory.newDropDown(),
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

    const SecWstPositionScale = itemFactory.newScale(SecWstPositionAdjustment);
    SecWstPositionScale.add_mark(0, Gtk.PositionType.TOP, null);
    optionList.push(
        itemFactory.getRowWidget(
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

    const wsThumbnailScale = itemFactory.newScale(wsThumbnailScaleAdjustment);
    wsThumbnailScale.add_mark(13, Gtk.PositionType.TOP, null);
    optionList.push(
        itemFactory.getRowWidget(
            _('Workspace Thumbnails Max Scale'),
            _('Adjusts maximum size of the workspace thumbnails (% relative to display width).'),
            wsThumbnailScale,
            'wsThumbnailScale'
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
            _('App grid in app view page will be centered to the display instead of the available space. This option may have impact on the size of the grid, more for narrower and small resolution displays, especially if workspace thumbnails are bigger.'),
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
            _('Search view will be centered to the display instead of the available space. If needed workspace thumbnails will be temporarilly scaled down to fit the search box. This option has bigger impact for narrower and small resolution displays.'),
            itemFactory.newSwitch(),
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
        itemFactory.getRowWidget(
            _('Appearance'),
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
            _('Adjusts opacity of the default background (%).'),
            dashBgOpacityScale,
            'dashBgOpacity'
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Show Workspace Thumbnails Labels'),
            _('Each workspace thumbnail can show its index and name (if defined in the system settings) or name of its most recently used app.'),
            //itemFactory.newComboBox(),
            itemFactory.newDropDown(),
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
            _('Show Wallpaper in Workspace Thumbnails'),
            _('Workspace thumbnails will include the current desktop backgroud.'),
            itemFactory.newSwitch(),
            'showWsSwitcherBg',
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Show Workspace Preview Background'),
            _('Allows you to hide workspace preview background wallpaper in the Activities overview.'),
            itemFactory.newSwitch(),
            'showWsPreviewBg',
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('Window Preview App Icon Size'),
            _('Default size is 64.'),
            //itemFactory.newComboBox(),
            itemFactory.newDropDown(),
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
        itemFactory.getRowWidget(
            _('Behavior'),
        )
    );

    optionList.push(
        itemFactory.getRowWidget(
            _('App Grid Animation'),
            _(`When entering the App Grid view, the app grid animates from the edge of the screen (defaultly from the right edge to follow the three fingers trackpad gesture). You can choose other direction or disable the animation if you don't like it.`),
            //itemFactory.newComboBox(),
            itemFactory.newDropDown(),
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
        itemFactory.getRowWidget(
            _('Workspace Animation'),
            _(`When entering / leaving the App Grid view, the workspace can animate to/from workspace thumbnails. The animation can be choppy if you have many workspaces with many windows and weak hw.`),
            //itemFactory.newComboBox(),
            itemFactory.newDropDown(),
            'workspaceAnimation',
            [   [_('Disable'), 0],
                [_('Enable'), 1],
            ]
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
            _('This option automatically overrides the (Sift +) Super + Page Up/Down keyboard shortcuts for the current workspace orientation. If you encounter any issues, check the configuration in the dconf editor.'),
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
        _('Gome Extensions'),
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


//----------------------------------------------------------

const ItemFactory = class ItemFactory {
    constructor(options) {
        this._options = options;
        this._settings = this._options._gsettings;
    }

    getRowWidget(text, caption, widget, variable, options = []) {

        let item = [];
        let label;
        if (widget) {
            label = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 4,
                halign: Gtk.Align.START,
                valign: Gtk.Align.CENTER,
            });
            const option = new Gtk.Label({
                halign: Gtk.Align.START,
            });
            option.set_text(text);
            label.append(option);

            if (caption) {
                const captionLabel = new Gtk.Label({
                    halign: Gtk.Align.START,
                    wrap: true,
                    /*width_chars: 80,*/
                    xalign: 0
                })
                const context = captionLabel.get_style_context();
                context.add_class('dim-label');
                context.add_class('caption');
                captionLabel.set_text(caption);
                label.append(captionLabel);
            }
            label._title = text;
        } else {
            label = text;
        }
        item.push(label);
        item.push(widget);

        let key;

        if (variable && this._options.options[variable]) {
            const opt = this._options.options[variable];
            key = opt[1];
        }

        if (widget) {
            if (widget._is_switch) {
                this._connectSwitch(widget, key, variable);
            } else if (widget._is_spinbutton || widget._is_scale) {
                this._connectSpinButton(widget, key, variable);
            } else if (widget._is_combo_box) {
                this._connectComboBox(widget, key, variable, options);
            } else if (widget._is_drop_down) {
                this._connectDropDown(widget, key, variable, options);
            }
        }

        return item;
    }

    _connectSwitch(widget, key, variable) {
        this._settings.bind(key, widget, 'active', Gio.SettingsBindFlags.DEFAULT);
    }

    _connectSpinButton(widget, key, variable) {
        this._settings.bind(key, widget.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
    }

    _connectComboBox(widget, key, variable, options) {
        let model = widget.get_model();
        widget._comboMap = {};
        const currentValue = gOptions.get(variable);
        for (const [label, value] of options) {
            let iter;
            model.set(iter = model.append(), [0, 1], [label, value]);
            if (value === currentValue) {
                widget.set_active_iter(iter);
            }
            widget._comboMap[value] = iter;
        }
        gOptions.connect(`changed::${key}`, () => {
            widget.set_active_iter(widget._comboMap[gOptions.get(variable, true)]);
        });
        widget.connect('changed', () => {
            const [success, iter] = widget.get_active_iter();

            if (!success) return;

            gOptions.set(variable, model.get_value(iter, 1));
        });
    }

    _connectDropDown(widget, key, variable, options) {
        const model = widget.get_model();
        const currentValue = gOptions.get(variable);
        for (let i = 0; i < options.length; i++) {
            const text = options[i][0];
            const id = options[i][1];
            model.append(new DropDownItem(text, id));
            if (id === currentValue) {
                widget.set_selected(i);
            }
        }

        const factory = new Gtk.SignalListItemFactory();
        factory.connect("setup", (factory, list_item) => {
            const label = new Gtk.Label({xalign: 0});
            list_item.set_child(label);
        });
        factory.connect("bind", (factory, list_item) => {
            const label = list_item.get_child();
            const item = list_item.get_item();
            label.set_text(item.text);
        });

        widget.connect("notify::selected-item", (dropDown) => {
            const item = dropDown.get_selected_item();
            gOptions.set(variable, item.id);
        });

        gOptions.connect(`changed::${key}`, () => {
            const newId = gOptions.get(variable, true);
            for (let i = 0; i < options.length; i++) {
                const id = options[i][1];
                if (id === newId) {
                    widget.set_selected(i);
                }
            }
        });

        widget.set_factory(factory);
    }

    newSwitch() {
        let sw = new Gtk.Switch({
            halign: Gtk.Align.END,
            valign: Gtk.Align.CENTER,
            hexpand: true,
        });
        sw._is_switch = true;
        return sw;
    }

    newSpinButton(adjustment) {
        let spinButton = new Gtk.SpinButton({
            halign: Gtk.Align.END,
            valign: Gtk.Align.CENTER,
            hexpand: true,
            vexpand: false,
            xalign: 0.5,
        });
        spinButton.set_adjustment(adjustment);
        spinButton._is_spinbutton = true;
        return spinButton;
    }

    newComboBox() {
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
        comboBox._is_combo_box = true;
        return comboBox;
    }

    newDropDown() {
        const dropDown = new Gtk.DropDown({
            model: new Gio.ListStore({
                item_type: DropDownItem
            }),
            halign: Gtk.Align.END,
            valign: Gtk.Align.CENTER,
            hexpand: true,
        });
        dropDown._is_drop_down = true;
        return dropDown;
    }

    newScale(adjustment) {
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
        scale._is_scale = true;
        return scale;
    }

    newLabel(text = '') {
        const label = new Gtk.Label({
            label: text,
            halign: Gtk.Align.END,
            valign: Gtk.Align.CENTER,
            hexpand: true,
        });
        label._activatable = false;
        return label;
    }

    newLinkButton(uri) {
        const linkBtn = new Gtk.LinkButton({
            label: shellVersion < 42 ? 'Click Me!' : '',
            uri,
            halign: Gtk.Align.END,
            valign: Gtk.Align.CENTER,
            hexpand: true,
        });
        return linkBtn;
    }

    newOptionsResetButton() {
        const btn = new Gtk.Button({
            halign: Gtk.Align.END,
            valign: Gtk.Align.CENTER,
            hexpand: true,
            css_classes: ['destructive-action'],
            icon_name: 'view-refresh-symbolic'
        });

        btn.connect('clicked', () => {
            const settings = this._settings;
            settings.list_keys().forEach(
                key => settings.reset(key)
            );
        });
        btn._activatable = false;
        return btn;
    }
}

const AdwPrefs = class {
    constructor() {
    }

    getFilledWindow(window, pages) {
        for (let page of pages) {
            const title = page.title;
            const icon_name = page.iconName;
            const optionList = page.optionList;

            window.add(
                this._getAdwPage(optionList, {
                    title,
                    icon_name
                })
            );
        }

        window.set_search_enabled(true);

        window.connect('close-request', () => {
            gOptions.destroy();
            gOptions = null;
            itemFactory = null;
            pageList = null;
        });

        window.set_default_size(800, 800);

        return window;
    }

    _getAdwPage(optionList, pageProperties = {}) {
        pageProperties.width_request = 840;
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
                    width_request: 700
                });
                continue;
            }

            const row = new Adw.ActionRow({
                title: option._title,
            });

            const grid = new Gtk.Grid({
                column_homogeneous: false,
                column_spacing: 20,
                margin_start: 8,
                margin_end: 8,
                margin_top: 8,
                margin_bottom: 8,
                hexpand: true,
            })
            /*for (let i of item) {
                box.append(i);*/
            grid.attach(option, 0, 0, 1, 1);
            if (widget) {
                grid.attach(widget, 1, 0, 1, 1);
            }
            row.set_child(grid);
            if (widget._activatable === false) {
                row.activatable = false;
            } else {
                row.activatable_widget = widget;
            }
            group.add(row);
        }
        page.add(group);
        return page;
    }
}

const LegacyPrefs = class {
    constructor() {
    }

    getPrefsWidget(pages) {
        const prefsWidget = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL
        });
        const stack = new Gtk.Stack({
            hexpand: true
        });
        const stackSwitcher = new Gtk.StackSwitcher({
            halign: Gtk.Align.CENTER,
            hexpand: true
        });

        const context = stackSwitcher.get_style_context();
        context.add_class('caption');

        stackSwitcher.set_stack(stack);
        stack.set_transition_duration(300);
        stack.set_transition_type(Gtk.StackTransitionType.SLIDE_LEFT_RIGHT);

        const pageProperties = {
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
            vexpand: true,
            hexpand: true,
            visible: true
        };

        const pagesBtns = [];

        for (let page of pages) {
            const name = page.name;
            const title = page.title;
            const iconName = page.iconName;
            const optionList = page.optionList;

            stack.add_named(this._getLegacyPage(optionList, pageProperties), name);
            pagesBtns.push(
                [new Gtk.Label({ label: title}), _newImageFromIconName(iconName, Gtk.IconSize.BUTTON)]
            );
        }

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

        prefsWidget.append(stack);
        prefsWidget.connect('realize', (widget) => {
            const window = widget.get_root ? widget.get_root() : widget.get_toplevel();
            const width = 800;
            const height = 800;
            window.set_default_size(width, height);
            const headerbar = window.get_titlebar();
            headerbar.title_widget = stackSwitcher;

            const signal = Gtk.get_major_version() === 3 ? 'destroy' : 'close-request';
            window.connect(signal, () => {
                gOptions.destroy();
                gOptions = null;
            });
        });

        prefsWidget.show_all && prefsWidget.show_all();

        return prefsWidget;
    }

    _getLegacyPage(optionList, pageProperties) {
        const page = new Gtk.ScrolledWindow(pageProperties);
        const mainBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 5,
            homogeneous: false,
            margin_start: 30,
            margin_end: 30,
            margin_top: 12,
            margin_bottom: 12,
        });

        const context = page.get_style_context();
        context.add_class('background');

        let frame;
        let frameBox;
        for (let item of optionList) {
            // label can be plain text for Section Title
            // or GtkBox for Option
            const option = item[0];
            const widget = item[1];

            if (!widget) {
                const lbl = new Gtk.Label({
                    label: option,
                    xalign: 0,
                    margin_bottom: 4
                });

                const context = lbl.get_style_context();
                context.add_class('heading');

                mainBox.append(lbl);

                frame = new Gtk.Frame({
                    margin_bottom: 16
                });

                frameBox = new Gtk.ListBox({
                    selection_mode: null
                });

                mainBox.append(frame);
                frame.set_child(frameBox);
                continue;
            }

            const grid = new Gtk.Grid({
                column_homogeneous: false,
                column_spacing: 20,
                margin_start: 8,
                margin_end: 8,
                margin_top: 8,
                margin_bottom: 8,
                hexpand: true
            })

            grid.attach(option, 0, 0, 5, 1);

            if (widget) {
                grid.attach(widget, 5, 0, 2, 1);
            }
            frameBox.append(grid);
        }
        page.set_child(mainBox);

        return page;
    }
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
            0
        ),
    },
}, class DropDownItem extends GObject.Object {
    constructor(text, id, constructProperties = {}) {
        super(constructProperties);
        this._text = text;
        this._id = id;
    }

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