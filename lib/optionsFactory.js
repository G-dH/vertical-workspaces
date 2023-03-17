/**
 * V-Shell (Vertical Workspaces)
 * optionsFactory.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2023
 * @license    GPL-3.0
 */

'use strict';

const { Gtk, Gio, GObject } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me             = ExtensionUtils.getCurrentExtension();
const Settings       = Me.imports.settings;

const shellVersion   = Settings.shellVersion;

// gettext
const _  = Settings._;

// libadwaita is available starting with GNOME Shell 42.
let Adw = null;
try {
    Adw = imports.gi.Adw;
} catch (e) {}

function _newImageFromIconName(name) {
    return Gtk.Image.new_from_icon_name(name);
}

var ItemFactory = class ItemFactory {
    constructor(gOptions) {
        this._gOptions = gOptions;
        this._settings = this._gOptions._gsettings;
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
                    /* width_chars: 80, */
                    xalign: 0,
                });
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

        if (variable && this._gOptions.options[variable]) {
            const opt = this._gOptions.options[variable];
            key = opt[1];
        }

        if (widget) {
            if (widget._isSwitch)
                this._connectSwitch(widget, key, variable);
            else if (widget._isSpinButton || widget._isScale)
                this._connectSpinButton(widget, key, variable);
            else if (widget._isComboBox)
                this._connectComboBox(widget, key, variable, options);
            else if (widget._isDropDown)
                this._connectDropDown(widget, key, variable, options);
        }

        return item;
    }

    _connectSwitch(widget, key /* , variable */) {
        this._settings.bind(key, widget, 'active', Gio.SettingsBindFlags.DEFAULT);
    }

    _connectSpinButton(widget, key /* , variable */) {
        this._settings.bind(key, widget.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
    }

    _connectComboBox(widget, key, variable, options) {
        let model = widget.get_model();
        widget._comboMap = {};
        const currentValue = this._gOptions.get(variable);
        for (const [label, value] of options) {
            let iter;
            model.set(iter = model.append(), [0, 1], [label, value]);
            if (value === currentValue)
                widget.set_active_iter(iter);

            widget._comboMap[value] = iter;
        }
        this._gOptions.connect(`changed::${key}`, () => {
            widget.set_active_iter(widget._comboMap[this._gOptions.get(variable, true)]);
        });
        widget.connect('changed', () => {
            const [success, iter] = widget.get_active_iter();

            if (!success)
                return;

            this._gOptions.set(variable, model.get_value(iter, 1));
        });
    }

    _connectDropDown(widget, key, variable, options) {
        const model = widget.get_model();
        const currentValue = this._gOptions.get(variable);
        for (let i = 0; i < options.length; i++) {
            const text = options[i][0];
            const id = options[i][1];
            model.append(new DropDownItem({ text, id }));
            if (id === currentValue)
                widget.set_selected(i);
        }

        const factory = new Gtk.SignalListItemFactory();
        factory.connect('setup', (fact, listItem) => {
            const label = new Gtk.Label({ xalign: 0 });
            listItem.set_child(label);
        });
        factory.connect('bind', (fact, listItem) => {
            const label = listItem.get_child();
            const item = listItem.get_item();
            label.set_text(item.text);
        });

        widget.connect('notify::selected-item', dropDown => {
            const item = dropDown.get_selected_item();
            this._gOptions.set(variable, item.id);
        });

        this._gOptions.connect(`changed::${key}`, () => {
            const newId = this._gOptions.get(variable, true);
            for (let i = 0; i < options.length; i++) {
                const id = options[i][1];
                if (id === newId)
                    widget.set_selected(i);
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
        sw._isSwitch = true;
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
        spinButton._isSpinButton = true;
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
        comboBox._isComboBox = true;
        return comboBox;
    }

    newDropDown() {
        const dropDown = new Gtk.DropDown({
            model: new Gio.ListStore({
                item_type: DropDownItem,
            }),
            halign: Gtk.Align.END,
            valign: Gtk.Align.CENTER,
            hexpand: true,
        });
        dropDown._isDropDown = true;
        return dropDown;
    }

    newScale(adjustment) {
        const scale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            draw_value:  true,
            has_origin:  false,
            value_pos:   Gtk.PositionType.LEFT,
            digits:      0,
            halign:      Gtk.Align.END,
            valign:      Gtk.Align.CENTER,
            hexpand:     true,
            vexpand:     false,
        });
        scale.set_size_request(300, -1);
        scale.set_adjustment(adjustment);
        scale._isScale = true;
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

    newButton() {
        const btn = new Gtk.Button({
            halign: Gtk.Align.END,
            valign: Gtk.Align.CENTER,
            hexpand: true,
        });

        btn._activatable = true;
        return btn;
    }

    newPresetButton(opt, profileIndex) {
        const load = opt.loadProfile.bind(opt);
        const save = opt.storeProfile.bind(opt);
        const reset = opt.resetProfile.bind(opt);

        const box = new Gtk.Box({
            halign: Gtk.Align.END,
            valign: Gtk.Align.CENTER,
            hexpand: true,
            spacing: 8,
        });
        box.is_profile_box = true;

        const entry = new Gtk.Entry({
            width_chars: 40,
            halign: Gtk.Align.END,
            valign: Gtk.Align.CENTER,
            hexpand: true,
            xalign: 0,
        });
        entry.set_text(opt.get(`profileName${profileIndex}`));
        entry.set_icon_from_icon_name(Gtk.EntryIconPosition.SECONDARY, 'edit-clear-symbolic');
        entry.set_icon_activatable(Gtk.EntryIconPosition.SECONDARY, true);
        entry.connect('icon-press', e => e.set_text(''));
        entry.connect('changed', e => opt.set(`profileName${profileIndex}`, e.get_text()));

        const resetProfile = this.newButton();
        resetProfile.set({
            tooltip_text: _('Reset profile to defaults'),
            icon_name: 'edit-clear-symbolic',
            hexpand: false,
        });
        resetProfile.connect('clicked', () => {
            reset(profileIndex);
            entry.set_text(opt.get(`profileName${profileIndex}`, true));
        });
        resetProfile._activatable = false;

        const loadProfile = this.newButton();
        loadProfile.set({
            tooltip_text: _('Load profile'),
            icon_name: 'view-refresh-symbolic',
            hexpand: false,
        });
        loadProfile.connect('clicked', () => load(profileIndex));
        loadProfile._activatable = false;

        const saveProfile = this.newButton();
        saveProfile.set({
            tooltip_text: _('Save current settings into this profile'),
            icon_name: 'document-save-symbolic',
            hexpand: false,
        });
        saveProfile.connect('clicked', () => save(profileIndex));
        saveProfile._activatable = false;

        box.append(saveProfile);
        box.append(resetProfile);
        box.append(entry);
        box.append(loadProfile);
        return box;
    }

    newResetButton(callback) {
        const btn = this.newButton();
        btn.set({
            css_classes: ['destructive-action'],
            icon_name: 'view-refresh-symbolic',
        });

        btn.connect('clicked', callback);
        btn._activatable = false;
        return btn;
    }

    newOptionsResetButton() {
        const btn = new Gtk.Button({
            halign: Gtk.Align.END,
            valign: Gtk.Align.CENTER,
            hexpand: true,
            css_classes: ['destructive-action'],
            icon_name: 'view-refresh-symbolic',
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
};

var AdwPrefs = class {
    constructor(gOptions) {
        this._gOptions = gOptions;
    }

    getFilledWindow(window, pages) {
        for (let page of pages) {
            const title = page.title;
            const iconName = page.iconName;
            const optionList = page.optionList;

            window.add(
                this._getAdwPage(optionList, {
                    title,
                    icon_name: iconName,
                })
            );
        }

        window.set_search_enabled(true);

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
                if (group)
                    page.add(group);

                group = new Adw.PreferencesGroup({
                    title: option,
                    hexpand: true,
                    width_request: 700,
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
            });
            /* for (let i of item) {
                box.append(i);*/
            grid.attach(option, 0, 0, 1, 1);
            if (widget)
                grid.attach(widget, 1, 0, 1, 1);

            row.set_child(grid);
            if (widget._activatable === false)
                row.activatable = false;
            else
                row.activatable_widget = widget;

            group.add(row);
        }
        page.add(group);
        return page;
    }
};

var LegacyPrefs = class {
    constructor(gOptions) {
        this._gOptions = gOptions;
    }

    getPrefsWidget(pages) {
        const prefsWidget = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
        });
        const stack = new Gtk.Stack({
            hexpand: true,
        });
        const stackSwitcher = new Gtk.StackSwitcher({
            halign: Gtk.Align.CENTER,
            hexpand: true,
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
            visible: true,
        };

        const pagesBtns = [];

        for (let page of pages) {
            const name = page.name;
            const title = page.title;
            const iconName = page.iconName;
            const optionList = page.optionList;

            stack.add_named(this._getLegacyPage(optionList, pageProperties), name);
            pagesBtns.push(
                [new Gtk.Label({ label: title }), _newImageFromIconName(iconName, Gtk.IconSize.BUTTON)]
            );
        }

        let stBtn = stackSwitcher.get_first_child ? stackSwitcher.get_first_child() : null;
        for (let i = 0; i < pagesBtns.length; i++) {
            const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6, visible: true });
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

        if (stack.show_all)
            stack.show_all();
        if (stackSwitcher.show_all)
            stackSwitcher.show_all();

        prefsWidget.append(stack);

        if (prefsWidget.show_all)
            prefsWidget.show_all();

        prefsWidget._stackSwitcher = stackSwitcher;

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

        let context = page.get_style_context();
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
                    margin_bottom: 4,
                });

                context = lbl.get_style_context();
                context.add_class('heading');

                mainBox.append(lbl);

                frame = new Gtk.Frame({
                    margin_bottom: 16,
                });

                frameBox = new Gtk.ListBox({
                    selection_mode: null,
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
                hexpand: true,
            });

            grid.attach(option, 0, 0, 5, 1);

            if (widget)
                grid.attach(widget, 5, 0, 2, 1);

            frameBox.append(grid);
        }
        page.set_child(mainBox);

        return page;
    }
};

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
