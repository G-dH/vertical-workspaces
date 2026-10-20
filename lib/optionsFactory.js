/**
 * V-Shell (Vertical Workspaces)
 * optionsFactory.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2026
 * @license    GPL-3.0
 */

'use strict';

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

let Me;

// gettext
let _;

export function init(me) {
    Me = me;
    _ = Me.gettext;
}

export const ItemFactory = class ItemFactory {
    constructor() {
        this._settings = Me.Opt._gsettings;
    }

    getRowWidget(text, caption, widget, variable, options = [], dependsOn) {
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

        if (variable && Me.Opt.options[variable]) {
            const opt = Me.Opt.options[variable];
            key = opt[1];
        }

        if (widget) {
            if (widget._isSwitch)
                this._connectSwitch(widget, key, variable);
            else if (widget._isSpinButton || widget._isScale)
                this._connectSpinButton(widget, key, variable);
            else if (widget._isDropDown)
                this._connectDropDown(widget, key, variable, options);

            if (dependsOn) {
                const dKey = Me.Opt.options[dependsOn][1];
                Me.Opt.connect(`changed::${dKey}`, () => {
                    widget.set_sensitive(!!Me.Opt.get(dependsOn, true));
                });
            }
        }

        return item;
    }

    _connectSwitch(widget, key /* , variable */) {
        this._settings.bind(key, widget, 'active', Gio.SettingsBindFlags.DEFAULT);
    }

    _connectSpinButton(widget, key /* , variable */) {
        this._settings.bind(key, widget.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
    }

    _connectDropDown(widget, key, variable, options) {
        const model = widget.get_model();
        const currentValue = Me.Opt.get(variable);
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
            Me.Opt.set(variable, item.id);
        });

        Me.Opt.connect(`changed::${key}`, () => {
            const newId = Me.Opt.get(variable, true);
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

    newDropDown() {
        const model = new Gio.ListStore({
            item_type: DropDownItem,
        });

        const dropDown = new Gtk.DropDown({
            model,
            halign: Gtk.Align.END,
            valign: Gtk.Align.CENTER,
            hexpand: true,
        });

        const boundItems = new Set();

        // Factory for items in the dropdown list
        const listFactory = new Gtk.SignalListItemFactory();

        listFactory.connect('setup', (factory, listItem) => {
            const row = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 8,
            });

            const label = new Gtk.Label({
                xalign: 0,
                hexpand: true,
            });

            const check = new Gtk.Image({
                icon_name: 'object-select-symbolic',
            });

            listItem._check = check;

            row.append(label);
            row.append(check);

            listItem.set_child(row);
            listItem._label = label;
            listItem._check = check;
        });

        listFactory.connect('bind', (factory, listItem) => {
            const item = listItem.get_item();
            const selectedItem = dropDown.selected_item;

            listItem._label.label = item.text;

            // Show the check emblem only for the selected item
            listItem._check.visible = item === selectedItem;

            boundItems.add(listItem);

            const updateCheck = () => {
                listItem._check.visible =
            listItem.get_item() === dropDown.selected_item;
            };

            listItem._updateCheck = updateCheck;
            updateCheck();
        });

        dropDown.set_factory(listFactory);
        dropDown.set_list_factory(listFactory);

        dropDown.connect('notify::selected', () => {
            for (const listItem of boundItems)
                listItem._updateCheck();
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
            uri,
            halign: Gtk.Align.END,
            valign: Gtk.Align.CENTER,
            hexpand: true,
            icon_name: 'emblem-symbolic-link',
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
            width_chars: 45,
            halign: Gtk.Align.END,
            valign: Gtk.Align.CENTER,
            hexpand: true,
            xalign: 0,
        });
        entry.set_text(opt.get(`profileName${profileIndex}`));
        entry.set_icon_from_icon_name(Gtk.EntryIconPosition.SECONDARY, 'edit-clear-symbolic');
        entry.set_icon_activatable(Gtk.EntryIconPosition.SECONDARY, true);

        const resetProfile = this.newButton();
        resetProfile.set({
            icon_name: 'document-revert-symbolic',
            hexpand: false,
            css_classes: ['destructive-action'],
        });

        function setNameAndTooltip() {
            const ProfileNames = [
                _('GNOME 3 Layout (Vertical WS)'),
                _('GNOME 4x Layout, Bottom Hot Edge (Horizontal WS)'),
                _('Top Left Hot Corner Centric (Vertical WS)'),
                _('Static Overview, Bottom Hot Edge (Horizontal WS)'),
                _('GNOME 4x as close to vanilla as currently possible'),
            ];

            let name = opt.get(`profileName${profileIndex}`, true);
            if (!name)
                name = ProfileNames[profileIndex - 1];
            entry.set_text(name);
            resetProfile.tooltip_text = `${_('Reset profile to defaults')}:\n${ProfileNames[profileIndex - 1]}`;
        }

        setNameAndTooltip();

        entry.connect('icon-press', e => e.set_text(''));
        entry.connect('changed', e => opt.set(`profileName${profileIndex}`, e.get_text()));

        resetProfile.connect('clicked', () => {
            reset(profileIndex);
            setNameAndTooltip();
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

        box.append(resetProfile);
        box.append(entry);
        box.append(saveProfile);
        box.append(loadProfile);
        return box;
    }

    newResetButton(callback) {
        const btn = this.newButton();
        btn.set({
            css_classes: ['destructive-action'],
            icon_name: 'edit-delete-symbolic',
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
            icon_name: 'document-revert-symbolic',
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

export const AdwPrefs = class {
    constructor(gOptions) {
        Me.Opt = gOptions;
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
        // pageProperties.width_request = 740;
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

const DropDownItem = GObject.registerClass({
    // Registered name should be unique
    GTypeName: `DropDownItem${Math.floor(Math.random() * 100000)}`,
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
            // min, max, default
            -2147483648, 2147483647, 0
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
});
