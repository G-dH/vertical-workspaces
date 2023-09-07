/**
 * V-Shell (Vertical Workspaces)
 * dash.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022-2023
 * @license    GPL-3.0
 * modified dash module of https://github.com/RensAlthuis/vertical-overview extension
 */

'use strict';

let Gi;
let Ui;
let Misc;
let Me;

let opt;
// gettext
let _;

let _timeouts;

// added values to achieve a better ability to scale down according to available space
var BaseIconSizes = [16, 24, 32, 40, 44, 48, 56, 64, 72, 80, 96, 112, 128];

const DASH_ITEM_LABEL_SHOW_TIME = 150;

var DashModule = class {
    constructor(gi, ui, misc, me) {
        Gi = gi;
        Ui = ui;
        Misc = misc;
        Me = me;

        _  = Me.gettext;

        opt = Me.Opt;
        this._firstActivation = true;
        this._moduleEnabled = false;
        this._overrides = null;
        this._originalWorkId = null;
        this._customWorkId = null;
        this._showAppsIconBtnPressId = 0;
    }

    cleanGlobals() {
        Gi = null;
        Ui = null;
        Misc = null;
        Me = null;
        opt = null;
        _ = null;
    }

    update(reset) {
        this._removeTimeouts();

        this._moduleEnabled = opt.get('dashModule');
        const conflict = !!(Me.Util.getEnabledExtensions('dash-to-dock').length ||
                         Me.Util.getEnabledExtensions('ubuntu-dock').length ||
                         Me.Util.getEnabledExtensions('dash-to-panel').length);

        if (conflict && !reset)
            log(`[${Me.metadata.name}] Warning: "Dash" module disabled due to potential conflict with another extension`);

        reset = reset || !this._moduleEnabled || conflict;
        this._conflict = conflict;

        // don't touch the original code if module disabled
        if (reset && !this._firstActivation) {
            this._disableModule();
        } else if (!reset) {
            this._firstActivation = false;
            this._activateModule();
        }
    }

    updateStyle(dash) {
        if (opt.DASH_BG_LIGHT)
            dash._background.add_style_class_name('dash-background-light');
        else
            dash._background.remove_style_class_name('dash-background-light');

        dash._background.opacity = opt.DASH_BG_OPACITY;
        let radius = opt.DASH_BG_RADIUS;
        if (radius) {
            let style;
            switch (opt.DASH_POSITION) {
            case 1:
                style = opt.DASH_BG_GS3_STYLE ? `border-radius: ${radius}px 0 0 ${radius}px;` : `border-radius: ${radius}px;`;
                break;
            case 3:
                style = opt.DASH_BG_GS3_STYLE ? `border-radius: 0 ${radius}px ${radius}px 0;` : `border-radius: ${radius}px;`;
                break;
            default:
                style = `border-radius: ${radius}px;`;
            }
            dash._background.set_style(style);
        } else {
            dash._background.set_style('');
        }
    }

    _activateModule() {
        _timeouts = {};
        const dash = Ui.Main.overview._overview._controls.layoutManager._dash;

        if (!this._originalWorkId)
            this._originalWorkId = dash._workId;

        if (!this._overrides)
            this._overrides = new Me.Util.Overrides();

        this._resetStyle(dash);
        this.updateStyle(dash);

        this._overrides.addOverride('DashItemContainer', Ui.Dash.DashItemContainer.prototype, DashItemContainerCommon);
        this._overrides.addOverride('DashCommon', Ui.Dash.Dash.prototype, DashCommon);
        this._overrides.addOverride('AppIcon', Ui.AppDisplay.AppIcon.prototype, AppIconCommon);
        this._overrides.addOverride('DashIcon', Ui.Dash.DashIcon.prototype, DashIconCommon);

        if (opt.DASH_VERTICAL) {
            this._setOrientation(Gi.Clutter.Orientation.VERTICAL);
            dash.add_style_class_name('vertical');
        } else {
            this._setOrientation(Gi.Clutter.Orientation.HORIZONTAL);
        }

        if (!this._customWorkId)
            this._customWorkId = Ui.Main.initializeDeferredWork(dash._box, dash._redisplay.bind(dash));
        dash._workId = this._customWorkId;

        this._updateSearchWindowsIcon();
        // this._updateRecentFilesIcon();
        this._moveDashAppGridIcon();
        this._connectShowAppsIcon();

        dash.visible = opt.DASH_VISIBLE;
        dash._background.add_style_class_name('dash-background-reduced');
        dash._redisplay();
    }

    _disableModule() {
        const dash = Ui.Main.overview._overview._controls.layoutManager._dash;
        this._resetStyle(dash);

        if (this._overrides)
            this._overrides.removeAll();
        this._overrides = null;

        dash._workId = this._originalWorkId;

        const reset = true;
        this._setOrientation(Gi.Clutter.Orientation.HORIZONTAL);
        this._moveDashAppGridIcon(reset);
        this._connectShowAppsIcon(reset);
        this._updateSearchWindowsIcon(false);
        // this._updateRecentFilesIcon(false);
        dash.visible = !this._conflict;
        dash._background.opacity = 255;
    }

    _resetStyle(dash) {
        dash.remove_style_class_name('vertical');
        dash.remove_style_class_name('vertical-gs3');
        dash.remove_style_class_name('vertical-left');
        dash.remove_style_class_name('vertical-right');
        dash._background.remove_style_class_name('dash-background-light');
        dash._background.remove_style_class_name('dash-background-reduced');
    }

    _removeTimeouts() {
        if (_timeouts) {
            Object.values(_timeouts).forEach(t => {
                if (t)
                    Gi.GLib.source_remove(t);
            });
            _timeouts = null;
        }
    }

    _setOrientation(orientation, dash) {
        dash = dash ?? Ui.Main.overview._overview._controls.layoutManager._dash;

        dash._box.layout_manager.orientation = orientation;
        dash._dashContainer.layout_manager.orientation = orientation;
        dash._dashContainer.y_expand = !orientation;
        dash._dashContainer.x_expand = !!orientation;
        dash.x_align = orientation ? Gi.Clutter.ActorAlign.START : Gi.Clutter.ActorAlign.CENTER;
        dash.y_align = orientation ? Gi.Clutter.ActorAlign.CENTER : Gi.Clutter.ActorAlign.FILL;

        let sizerBox = dash._background.get_children()[0];
        sizerBox.clear_constraints();
        sizerBox.add_constraint(new Gi.Clutter.BindConstraint({
            source: dash._showAppsIcon.icon,
            coordinate: orientation ? Gi.Clutter.BindCoordinate.WIDTH : Gi.Clutter.BindCoordinate.HEIGHT,
        }));
        sizerBox.add_constraint(new Gi.Clutter.BindConstraint({
            source: dash._dashContainer,
            coordinate: orientation ? Gi.Clutter.BindCoordinate.HEIGHT : Gi.Clutter.BindCoordinate.WIDTH,
        }));
        dash._box.remove_all_children();
        dash._separator = null;
        dash._queueRedisplay();
        dash._adjustIconSize();

        if (orientation && opt.DASH_BG_GS3_STYLE) {
            dash.add_style_class_name(opt.DASH_LEFT ? 'vertical-left' : 'vertical-right');
            dash.add_style_class_name('vertical-gs3');
        } else {
            dash.remove_style_class_name('vertical-gs3');
        }
    }

    _moveDashAppGridIcon(reset = false, dash) {
        // move dash app grid icon to the front
        dash = dash ?? Ui.Main.overview._overview._controls.layoutManager._dash;

        const appIconPosition = opt.get('showAppsIconPosition');
        dash._showAppsIcon.remove_style_class_name('show-apps-icon-vertical-hide');
        dash._showAppsIcon.remove_style_class_name('show-apps-icon-horizontal-hide');
        dash._showAppsIcon.opacity = 255;
        if (!reset && appIconPosition === 0) // 0 - start
            dash._dashContainer.set_child_at_index(dash._showAppsIcon, 0);
        if (reset || appIconPosition === 1) { // 1 - end
            const index = dash._dashContainer.get_children().length - 1;
            dash._dashContainer.set_child_at_index(dash._showAppsIcon, index);
        }
        if (!reset && appIconPosition === 2) { // 2 - hide
            const style = opt.DASH_VERTICAL ? 'show-apps-icon-vertical-hide' : 'show-apps-icon-horizontal-hide';
            dash._showAppsIcon.add_style_class_name(style);
            // for some reason even if the icon height in vertical mode should be set to 0 by the style, it stays visible in full size returning height 1px
            dash._showAppsIcon.opacity = 0;
        }
    }

    _connectShowAppsIcon(reset = false, dash) {
        dash = dash ?? Ui.Main.overview._overview._controls.layoutManager._dash;
        if (!reset) {
            if (this._showAppsIconBtnPressId || Me.Util.dashIsDashToDock()) {
                // button is already connected || dash is Dash to Dock
                return;
            }
            dash._showAppsIcon.reactive = true;
            this._showAppsIconBtnPressId = dash._showAppsIcon.connect('button-press-event', (actor, event) => {
                const button = event.get_button();
                if (button === Gi.Clutter.BUTTON_MIDDLE)
                    Me.Util.openPreferences();
                else if (button === Gi.Clutter.BUTTON_SECONDARY)
                    Me.Util.activateSearchProvider(Me.WSP_PREFIX);
                else
                    return Gi.Clutter.EVENT_PROPAGATE;
                return Gi.Clutter.EVENT_STOP;
            });
        } else if (this._showAppsIconBtnPressId) {
            dash._showAppsIcon.disconnect(this._showAppsIconBtnPressId);
            this._showAppsIconBtnPressId = 0;
            dash._showAppsIcon.reactive = false;
        }
    }

    _updateSearchWindowsIcon(show = opt.SHOW_WINDOWS_ICON, dash) {
        dash = dash ?? Ui.Main.overview._overview._controls.layoutManager._dash;
        const dashContainer = dash._dashContainer;

        if (dash._showWindowsIcon) {
            dashContainer.remove_child(dash._showWindowsIcon);
            if (dash._showWindowsIconClickedId) {
                dash._showWindowsIcon.toggleButton.disconnect(dash._showWindowsIconClickedId);
                dash._showWindowsIconClickedId = 0;
            }
            delete  dash._showWindowsIconClickedId;
            if (dash._showWindowsIcon)
                dash._showWindowsIcon.destroy();
            delete dash._showWindowsIcon;
        }

        if (!show || !opt.get('windowSearchProviderModule'))
            return;

        if (!dash._showWindowsIcon) {
            dash._showWindowsIcon = new Ui.Dash.DashItemContainer();
            new Me.Util.Overrides().addOverride('showWindowsIcon', dash._showWindowsIcon, ShowWindowsIcon);
            dash._showWindowsIcon._afterInit();
            dash._showWindowsIcon.show(false);
            dashContainer.add_child(dash._showWindowsIcon);
            dash._hookUpLabel(dash._showWindowsIcon);
        }

        dash._showWindowsIcon.icon.setIconSize(dash.iconSize);
        if (opt.SHOW_WINDOWS_ICON === 1) {
            dashContainer.set_child_at_index(dash._showWindowsIcon, 0);
        } else if (opt.SHOW_WINDOWS_ICON === 2) {
            const index = dashContainer.get_children().length - 1;
            dashContainer.set_child_at_index(dash._showWindowsIcon, index);
        }

        Ui.Main.overview._overview._controls.layoutManager._dash._adjustIconSize();

        if (dash._showWindowsIcon && !dash._showWindowsIconClickedId) {
            dash._showWindowsIconClickedId = dash._showWindowsIcon.toggleButton.connect('clicked', () => {
                Me.Util.activateSearchProvider(Me.WSP_PREFIX);
            });
        }
    }

    _updateRecentFilesIcon(show = opt.SHOW_RECENT_FILES_ICON, dash) {
        dash = dash ?? Ui.Main.overview._overview._controls.layoutManager._dash;
        const dashContainer = dash._dashContainer;

        if (dash._recentFilesIcon) {
            dashContainer.remove_child(dash._recentFilesIcon);
            if (dash._recentFilesIconClickedId) {
                dash._recentFilesIcon.toggleButton.disconnect(dash._recentFilesIconClickedId);
                dash._recentFilesIconClickedId = 0;
            }
            delete dash._recentFilesIconClickedId;
            if (dash._recentFilesIcon)
                dash._recentFilesIcon.destroy();
            delete dash._recentFilesIcon;
        }

        if (!show || !opt.get('recentFilesSearchProviderModule'))
            return;

        if (!dash._recentFilesIcon) {
            dash._recentFilesIcon = new Ui.Dash.DashItemContainer();
            new Me.Util.Overrides().addOverride('recentFilesIcon', dash._recentFilesIcon, ShowRecentFilesIcon);
            dash._recentFilesIcon._afterInit();
            dash._recentFilesIcon.show(false);
            dashContainer.add_child(dash._recentFilesIcon);
            dash._hookUpLabel(dash._recentFilesIcon);
        }

        dash._recentFilesIcon.icon.setIconSize(dash.iconSize);
        if (opt.SHOW_RECENT_FILES_ICON === 1) {
            dashContainer.set_child_at_index(dash._recentFilesIcon, 0);
        } else if (opt.SHOW_RECENT_FILES_ICON === 2) {
            const index = dashContainer.get_children().length - 1;
            dashContainer.set_child_at_index(dash._recentFilesIcon, index);
        }

        Ui.Main.overview._overview._controls.layoutManager._dash._adjustIconSize();

        if (dash._recentFilesIcon && !dash._recentFilesIconClickedId) {
            dash._recentFilesIconClickedId = dash._recentFilesIcon.toggleButton.connect('clicked', () => {
                Me.Util.activateSearchProvider(Me.RFSP_PREFIX);
            });
        }
    }
};

const DashItemContainerCommon = {
    // move labels according dash position
    showLabel() {
        if (!this._labelText)
            return;

        this.label.set_text(this._labelText);
        this.label.opacity = 0;
        this.label.show();

        let [stageX, stageY] = this.get_transformed_position();

        const itemWidth = this.allocation.get_width();
        const itemHeight = this.allocation.get_height();

        const labelWidth = this.label.get_width();
        const labelHeight = this.label.get_height();
        let xOffset = Math.floor((itemWidth - labelWidth) / 2);
        let x = Math.clamp(stageX + xOffset, 0, global.stage.width - labelWidth);
        const primaryMonitor = global.display.get_monitor_geometry(global.display.get_primary_monitor());
        x = Math.clamp(x, primaryMonitor.x, primaryMonitor.x + primaryMonitor.width - labelWidth);

        let node = this.label.get_theme_node();
        let y;

        if (opt.DASH_TOP) {
            const yOffset = itemHeight - labelHeight + 3 * node.get_length('-y-offset');
            y = stageY + yOffset;
        } else  if (opt.DASH_BOTTOM) {
            const yOffset = node.get_length('-y-offset');
            y = stageY - this.label.height - yOffset;
        } else if (opt.DASH_RIGHT) {
            const yOffset = Math.floor((itemHeight - labelHeight) / 2);
            xOffset = 4;

            x = stageX - xOffset - this.label.width;
            y = Math.clamp(stageY + yOffset, 0, global.stage.height - labelHeight);
        } else if (opt.DASH_LEFT) {
            const yOffset = Math.floor((itemHeight - labelHeight) / 2);
            xOffset = 4;

            x = stageX + this.width + xOffset;
            y = Math.clamp(stageY + yOffset, 0, global.stage.height - labelHeight);
        }

        this.label.set_position(x, y);
        this.label.ease({
            opacity: 255,
            duration: DASH_ITEM_LABEL_SHOW_TIME,
            mode: Gi.Clutter.AnimationMode.EASE_OUT_QUAD,
        });

        this.label.set_position(x, y);
        this.label.ease({
            opacity: 255,
            duration: DASH_ITEM_LABEL_SHOW_TIME,
            mode: Gi.Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    },
};

const DashCommon = {
    _redisplay() {
        let favorites = Ui.AppFavorites.getAppFavorites().getFavoriteMap();

        let running = this._appSystem.get_running();

        let children = this._box.get_children().filter(actor => {
            return actor.child &&
                actor.child._delegate &&
                actor.child._delegate.app;
        });
        // Apps currently in the dash
        let oldApps = children.map(actor => actor.child._delegate.app);
        // Apps supposed to be in the dash
        let newApps = [];

        for (let id in favorites)
            newApps.push(favorites[id]);

        for (let i = 0; i < running.length; i++) {
            let app = running[i];
            if (app.get_id() in favorites)
                continue;
            newApps.push(app);
        }

        // Figure out the actual changes to the list of items; we iterate
        // over both the list of items currently in the dash and the list
        // of items expected there, and collect additions and removals.
        // Moves are both an addition and a removal, where the order of
        // the operations depends on whether we encounter the position
        // where the item has been added first or the one from where it
        // was removed.
        // There is an assumption that only one item is moved at a given
        // time; when moving several items at once, everything will still
        // end up at the right position, but there might be additional
        // additions/removals (e.g. it might remove all the launchers
        // and add them back in the new order even if a smaller set of
        // additions and removals is possible).
        // If above assumptions turns out to be a problem, we might need
        // to use a more sophisticated algorithm, e.g. Longest Common
        // Subsequence as used by diff.
        let addedItems = [];
        let removedActors = [];

        let newIndex = 0;
        let oldIndex = 0;
        while (newIndex < newApps.length || oldIndex < oldApps.length) {
            let oldApp = oldApps.length > oldIndex ? oldApps[oldIndex] : null;
            let newApp = newApps.length > newIndex ? newApps[newIndex] : null;

            // No change at oldIndex/newIndex
            if (oldApp === newApp) {
                oldIndex++;
                newIndex++;
                continue;
            }

            // App removed at oldIndex
            if (oldApp && !newApps.includes(oldApp)) {
                removedActors.push(children[oldIndex]);
                oldIndex++;
                continue;
            }

            // App added at newIndex
            if (newApp && !oldApps.includes(newApp)) {
                addedItems.push({
                    app: newApp,
                    item: this._createAppItem(newApp),
                    pos: newIndex,
                });
                newIndex++;
                continue;
            }

            // App moved
            let nextApp = newApps.length > newIndex + 1
                ? newApps[newIndex + 1] : null;
            let insertHere = nextApp && nextApp === oldApp;
            let alreadyRemoved = removedActors.reduce((result, actor) => {
                let removedApp = actor.child._delegate.app;
                return result || removedApp === newApp;
            }, false);

            if (insertHere || alreadyRemoved) {
                let newItem = this._createAppItem(newApp);
                addedItems.push({
                    app: newApp,
                    item: newItem,
                    pos: newIndex + removedActors.length,
                });
                newIndex++;
            } else {
                removedActors.push(children[oldIndex]);
                oldIndex++;
            }
        }

        for (let i = 0; i < addedItems.length; i++) {
            this._box.insert_child_at_index(
                addedItems[i].item,
                addedItems[i].pos);
        }

        for (let i = 0; i < removedActors.length; i++) {
            let item = removedActors[i];

            // Don't animate item removal when the overview is transitioning
            // or hidden
            if (Ui.Main.overview.visible && !Ui.Main.overview.animationInProgress)
                item.animateOutAndDestroy();
            else
                item.destroy();
        }

        this._adjustIconSize();

        // Skip animations on first run when adding the initial set
        // of items, to avoid all items zooming in at once

        let animate = this._shownInitially && Ui.Main.overview.visible &&
            !Ui.Main.overview.animationInProgress;

        if (!this._shownInitially)
            this._shownInitially = true;

        for (let i = 0; i < addedItems.length; i++)
            addedItems[i].item.show(animate);

        // Update separator
        const nFavorites = Object.keys(favorites).length;
        const nIcons = children.length + addedItems.length - removedActors.length;
        if (nFavorites > 0 && nFavorites < nIcons) {
            // destroy the horizontal separator if it exists.
            // this is incredibly janky, but I can't think of a better way atm.
            if (this._separator && this._separator.height !== 1) {
                this._separator.destroy();
                this._separator = null;
            }

            if (!this._separator) {
                this._separator = new Gi.St.Widget({
                    style_class: 'dash-separator',
                    x_align: Gi.Clutter.ActorAlign.CENTER,
                    y_align: Gi.Clutter.ActorAlign.CENTER,
                    width: opt.DASH_VERTICAL ? this.iconSize : 1,
                    height: opt.DASH_VERTICAL ? 1 : this.iconSize,
                });
                this._box.add_child(this._separator);
            }

            // FIXME: separator placement is broken (also in original dash)
            let pos = nFavorites + this._animatingPlaceholdersCount;
            if (this._dragPlaceholder)
                pos++;
            this._box.set_child_at_index(this._separator, pos);
        } else if (this._separator) {
            this._separator.destroy();
            this._separator = null;
        }
        // Workaround for https://bugzilla.gnome.org/show_bug.cgi?id=692744
        // Without it, StBoxLayout may use a stale size cache
        this._box.queue_relayout();
    },

    _createAppItem(app) {
        let appIcon = new Ui.Dash.DashIcon(app);

        let indicator = appIcon._dot;
        if (opt.DASH_VERTICAL) {
            indicator.x_align = opt.DASH_LEFT ? Gi.Clutter.ActorAlign.START : Gi.Clutter.ActorAlign.END;
            indicator.y_align = Gi.Clutter.ActorAlign.CENTER;
        } else {
            indicator.x_align = Gi.Clutter.ActorAlign.CENTER;
            indicator.y_align = Gi.Clutter.ActorAlign.END;
        }

        appIcon.connect('menu-state-changed',
            (o, opened) => {
                this._itemMenuStateChanged(item, opened);
            });

        let item = new Ui.Dash.DashItemContainer();
        item.setChild(appIcon);

        // Override default AppIcon label_actor, now the
        // accessible_name is set at DashItemContainer.setLabelText
        appIcon.label_actor = null;
        item.setLabelText(app.get_name());

        appIcon.icon.setIconSize(this.iconSize);
        this._hookUpLabel(item, appIcon);

        return item;
    },

    // use custom BaseIconSizes and add support for custom icons
    _adjustIconSize() {
        // if a user launches multiple apps at once, this function may be called again before the previous call has finished
        // as a result, new icons will not reach their full size, or will be missing, if adding a new icon and changing the dash size due to lack of space at the same time
        if (this._adjustingInProgress)
            return;

        // For the icon size, we only consider children which are "proper"
        // icons (i.e. ignoring drag placeholders) and which are not
        // animating out (which means they will be destroyed at the end of
        // the animation)
        let iconChildren = this._box.get_children().filter(actor => {
            return actor.child &&
                actor.child._delegate &&
                actor.child._delegate.icon &&
                !actor.animatingOut;
        });

        // add new custom icons to the list
        if (this._showAppsIcon.visible)
            iconChildren.push(this._showAppsIcon);

        if (this._showWindowsIcon)
            iconChildren.push(this._showWindowsIcon);

        if (this._recentFilesIcon)
            iconChildren.push(this._recentFilesIcon);


        if (!iconChildren.length)
            return;

        if (this._maxWidth === -1 || this._maxHeight === -1)
            return;

        const dashHorizontal = !opt.DASH_VERTICAL;

        const themeNode = this.get_theme_node();
        const maxAllocation = new Gi.Clutter.ActorBox({
            x1: 0,
            y1: 0,
            x2: dashHorizontal ? this._maxWidth :  42, // not whatever
            y2: dashHorizontal ? 42 : this._maxHeight,
        });

        let maxContent = themeNode.get_content_box(maxAllocation);

        let spacing = themeNode.get_length('spacing');

        let firstButton = iconChildren[0].child;
        let firstIcon = firstButton._delegate.icon;

        if (!firstIcon.icon)
            return;

        // Enforce valid spacings during the size request
        firstIcon.icon.ensure_style();
        const [, , iconWidth, iconHeight] = firstIcon.icon.get_preferred_size();
        const [, , buttonWidth, buttonHeight] = firstButton.get_preferred_size();
        let scaleFactor = Gi.St.ThemeContext.get_for_stage(global.stage).scale_factor;

        let availWidth, availHeight, maxIconSize;
        if (dashHorizontal) {
            availWidth = maxContent.x2 - maxContent.x1;
            // Subtract icon padding and box spacing from the available width
            availWidth -= iconChildren.length * (buttonWidth - iconWidth) +
                           (iconChildren.length - 1) * spacing +
                           2 * this._background.get_theme_node().get_horizontal_padding();

            availHeight = this._maxHeight;
            availHeight -= this.margin_top + this.margin_bottom;
            availHeight -= this._background.get_theme_node().get_vertical_padding();
            availHeight -= themeNode.get_vertical_padding();
            availHeight -= buttonHeight - iconHeight;

            maxIconSize = Math.min(availWidth / iconChildren.length, availHeight, opt.MAX_ICON_SIZE * scaleFactor);
        } else {
            availWidth = this._maxWidth;
            availWidth -= this._background.get_theme_node().get_horizontal_padding();
            availWidth -= themeNode.get_horizontal_padding();
            availWidth -= buttonWidth - iconWidth;

            availHeight = maxContent.y2 - maxContent.y1;
            availHeight -= iconChildren.length * (buttonHeight - iconHeight) +
                            (iconChildren.length - 1) * spacing +
                            2 * this._background.get_theme_node().get_vertical_padding();

            maxIconSize = Math.min(availWidth, availHeight / iconChildren.length, opt.MAX_ICON_SIZE * scaleFactor);
        }

        let iconSizes = BaseIconSizes.map(s => s * scaleFactor);

        let newIconSize = BaseIconSizes[0];
        for (let i = 0; i < iconSizes.length; i++) {
            if (iconSizes[i] <= maxIconSize)
                newIconSize = BaseIconSizes[i];
        }

        if (newIconSize === this.iconSize)
            return;

        // set the in-progress state here after all the possible cancels
        this._adjustingInProgress = true;

        let oldIconSize = this.iconSize;
        this.iconSize = newIconSize;
        this.emit('icon-size-changed');

        let scale = oldIconSize / newIconSize;
        for (let i = 0; i < iconChildren.length; i++) {
            let icon = iconChildren[i].child._delegate.icon;

            // Set the new size immediately, to keep the icons' sizes
            // in sync with this.iconSize
            icon.setIconSize(this.iconSize);

            // Don't animate the icon size change when the overview
            // is transitioning, not visible or when initially filling
            // the dash
            if (!Ui.Main.overview.visible || Ui.Main.overview.animationInProgress ||
                !this._shownInitially)
                continue;

            let [targetWidth, targetHeight] = icon.icon.get_size();

            // Scale the icon's texture to the previous size and
            // tween to the new size
            icon.icon.set_size(icon.icon.width * scale,
                icon.icon.height * scale);

            icon.icon.ease({
                width: targetWidth,
                height: targetHeight,
                duration: Ui.Dash.DASH_ANIMATION_TIME,
                mode: Gi.Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }

        if (this._separator) {
            this._separator.ease({
                width: dashHorizontal ? 1 : this.iconSize,
                height: dashHorizontal ? this.iconSize : 1,
                duration: Ui.Dash.DASH_ANIMATION_TIME,
                mode: Gi.Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }

        this._adjustingInProgress = false;
    },

    handleDragOver(source, actor, x, y, _time) {
        let app = Ui.Dash.getAppFromSource(source);

        // Don't allow favoriting of transient apps
        if (app === null || app.is_window_backed())
            return Ui.DND.DragMotionResult.NO_DROP;
        if (!global.settings.is_writable('favorite-apps'))
            return Ui.DND.DragMotionResult.NO_DROP;
        let favorites = Ui.AppFavorites.getAppFavorites().getFavorites();
        let numFavorites = favorites.length;

        let favPos = favorites.indexOf(app);

        let children = this._box.get_children();
        let numChildren = children.length;
        let boxSize = opt.DASH_VERTICAL ? this._box.height : this._box.width;

        // Keep the placeholder out of the index calculation; assuming that
        // the remove target has the same size as "normal" items, we don't
        // need to do the same adjustment there.
        if (this._dragPlaceholder) {
            boxSize -= opt.DASH_VERTICAL ? this._dragPlaceholder.height : this._dragPlaceholder.width;
            numChildren--;
        }

        // Same with the separator
        if (this._separator) {
            boxSize -= opt.DASH_VERTICAL ? this._separator.height : this._separator.width;
            numChildren--;
        }

        let pos;
        if (this._emptyDropTarget)
            pos = 0; // always insert at the start when dash is empty
        else if (this.text_direction === Gi.Clutter.TextDirection.RTL)
            pos = numChildren - Math.floor((opt.DASH_VERTICAL ? y : x) * numChildren / boxSize);
        else
            pos = Math.floor((opt.DASH_VERTICAL ? y : x) * numChildren / boxSize);

        // Put the placeholder after the last favorite if we are not
        // in the favorites zone
        if (pos > numFavorites)
            pos = numFavorites;

        if (pos !== this._dragPlaceholderPos && this._animatingPlaceholdersCount === 0) {
            this._dragPlaceholderPos = pos;

            // Don't allow positioning before or after self
            if (favPos !== -1 && (pos === favPos || pos === favPos + 1)) {
                this._clearDragPlaceholder();
                return Ui.DND.DragMotionResult.CONTINUE;
            }

            // If the placeholder already exists, we just move
            // it, but if we are adding it, expand its size in
            // an animation
            let fadeIn;
            if (this._dragPlaceholder) {
                this._dragPlaceholder.destroy();
                fadeIn = false;
            } else {
                fadeIn = true;
            }

            this._dragPlaceholder = new Ui.Dash.DragPlaceholderItem();
            this._dragPlaceholder.child.set_width(this.iconSize / (opt.DASH_VERTICAL ? 2 : 1));
            this._dragPlaceholder.child.set_height(this.iconSize / (opt.DASH_VERTICAL ? 1 : 2));
            this._box.insert_child_at_index(
                this._dragPlaceholder,
                this._dragPlaceholderPos);
            this._dragPlaceholder.show(fadeIn);
        }

        if (!this._dragPlaceholder)
            return Ui.DND.DragMotionResult.NO_DROP;

        let srcIsFavorite = favPos !== -1;

        if (srcIsFavorite)
            return Ui.DND.DragMotionResult.MOVE_DROP;

        return Ui.DND.DragMotionResult.COPY_DROP;
    },
};

const DashIconCommon = {
    after__init() {
        if (opt.DASH_ICON_SCROLL && !Me.Util.dashNotDefault()) {
            this._scrollConId = this.connect('scroll-event', DashExtensions.onScrollEvent.bind(this));
            this._leaveConId = this.connect('leave-event', DashExtensions.onLeaveEvent.bind(this));
        }
    },

    popupMenu() {
        const side = opt.DASH_VERTICAL ? Gi.St.Side.LEFT : Gi.St.Side.BOTTOM;
        AppIconCommon.popupMenu.bind(this)(side);
    },
};

const DashExtensions = {
    onScrollEvent(source, event) {
        if ((this.app && !opt.DASH_ICON_SCROLL) || (this._isSearchWindowsIcon && !opt.SEARCH_WINDOWS_ICON_SCROLL)) {
            if (this._scrollConId) {
                this.disconnect(this._scrollConId);
                this._scrollConId = 0;
            }
            if (this._leaveConId) {
                this.disconnect(this._leaveConId);
                this._leaveConId = 0;
            }
            return Gi.Clutter.EVENT_PROPAGATE;
        }

        if (Ui.Main.overview._overview.controls._stateAdjustment.value > 1)
            return Gi.Clutter.EVENT_PROPAGATE;

        let direction = Me.Util.getScrollDirection(event);
        if (direction === Gi.Clutter.ScrollDirection.UP)
            direction = 1;
        else if (direction === Gi.Clutter.ScrollDirection.DOWN)
            direction = -1;
        else
            return Gi.Clutter.EVENT_STOP;

        // avoid uncontrollable switching if smooth scroll wheel or trackpad is used
        if (this._lastScroll && Date.now() - this._lastScroll < 160)
            return Gi.Clutter.EVENT_STOP;

        this._lastScroll = Date.now();

        DashExtensions.switchWindow.bind(this)(direction);
        return Gi.Clutter.EVENT_STOP;
    },

    onLeaveEvent() {
        if (!this._selectedMetaWin || this.has_pointer || this.toggleButton?.has_pointer)
            return;

        this._selectedPreview._activateSelected = false;
        this._selectedMetaWin = null;
        this._scrolledWindows = null;
        DashExtensions.showWindowPreview.bind(this)(null);
    },


    switchWindow(direction) {
        if (!this._scrolledWindows) {
            this._initialSelection = true;
            // source is app icon
            if (this.app) {
                this._scrolledWindows = this.app.get_windows();
                const wsList = [];
                this._scrolledWindows.forEach(w => {
                    const ws = w.get_workspace();
                    if (!wsList.includes(ws))
                        wsList.push(ws);
                });
                // sort windows by workspaces in MRU order
                this._scrolledWindows.sort((a, b) => wsList.indexOf(a.get_workspace()) > wsList.indexOf(b.get_workspace()));
                // source is Search Windows icon
            } else if (this._isSearchWindowsIcon) {
                if (opt.SEARCH_WINDOWS_ICON_SCROLL === 1) // all windows
                    this._scrolledWindows = Ui.AltTab.getWindows(null);
                else
                    this._scrolledWindows = Ui.AltTab.getWindows(global.workspace_manager.get_active_workspace());
            }
        }

        let windows = this._scrolledWindows;

        if (!windows.length)
            return;

        // if window selection is in the process, the previewed window must be the current one
        let currentWin  = this._selectedMetaWin ? this._selectedMetaWin : windows[0];

        const currentIdx = windows.indexOf(currentWin);
        let targetIdx = currentIdx;
        const focusWindow = Ui.AltTab.getWindows(null)[0];
        const appFocused = this._scrolledWindows[0] === focusWindow && this._scrolledWindows[0].get_workspace() === global.workspace_manager.get_active_workspace();
        // only if the app has focus, immediately switch to the previous window
        // otherwise just set the current window above others
        if (!this._initialSelection || appFocused)
            targetIdx += direction;
        else
            this._initialSelection = false;

        if (targetIdx > windows.length - 1)
            targetIdx = 0;
        else if (targetIdx < 0)
            targetIdx = windows.length - 1;

        const metaWin = windows[targetIdx];
        DashExtensions.showWindowPreview.bind(this)(metaWin);
        this._selectedMetaWin = metaWin;
    },

    showWindowPreview(metaWin) {
        const views = Ui.Main.overview._overview.controls._workspacesDisplay._workspacesViews;
        const viewsIter = [views[0]];
        // secondary monitors use different structure
        views.forEach(v => {
            if (v._workspacesView)
                viewsIter.push(v._workspacesView);
        });

        viewsIter.forEach(view => {
        // if workspaces are on primary monitor only
            if (!view || !view._workspaces)
                return;

            view._workspaces.forEach(ws => {
                ws._windows.forEach(windowPreview => {
                // metaWin === null resets opacity
                    let opacity = metaWin ? 50 : 255;
                    windowPreview._activateSelected = false;

                    // minimized windows are invisible if windows are not exposed (WORKSPACE_MODE === 0)
                    if (!windowPreview.opacity)
                        windowPreview.opacity = 255;

                    // app windows set to lower opacity, so they can be recognized
                    if (this._scrolledWindows && this._scrolledWindows.includes(windowPreview.metaWindow)) {
                        if (opt.DASH_ICON_SCROLL === 2)
                            opacity = 254;
                    }
                    if (windowPreview.metaWindow === metaWin) {
                        if (metaWin && metaWin.get_workspace() !== global.workspace_manager.get_active_workspace()) {
                            Ui.Main.wm.actionMoveWorkspace(metaWin.get_workspace());
                            if (_timeouts.wsSwitcherAnimation)
                                Gi.GLib.source_remove(_timeouts.wsSwitcherAnimation);
                            // setting window preview above siblings before workspace switcher animation has no effect
                            // we need to set the window above after the ws preview become visible on the screen
                            // the default switcher animation time is 250, 200 ms delay should be enough
                            _timeouts.wsSwitcherAnimation = Gi.GLib.timeout_add(0, 200 * Gi.St.Settings.get().slow_down_factor, () => {
                                windowPreview.get_parent().set_child_above_sibling(windowPreview, null);
                                _timeouts.wsSwitcherAnimation = 0;
                                return Gi.GLib.SOURCE_REMOVE;
                            });
                        } else {
                            windowPreview.get_parent().set_child_above_sibling(windowPreview, null);
                        }

                        opacity = 255;
                        this._selectedPreview = windowPreview;
                        windowPreview._activateSelected = true;
                    }

                    // if windows are exposed, highlight selected using opacity
                    if ((opt.OVERVIEW_MODE && opt.WORKSPACE_MODE) || !opt.OVERVIEW_MODE) {
                        if (metaWin && opacity === 255)
                            windowPreview.showOverlay(true);
                        else
                            windowPreview.hideOverlay(true);
                        windowPreview.ease({
                            duration: 200,
                            opacity,
                            mode: Gi.Clutter.AnimationMode.EASE_OUT_QUAD,
                        });
                    }
                });
            });
        });
    },
};

const AppIconCommon = {
    activate(button) {
        const event = Gi.Clutter.get_current_event();
        const state = event ? event.get_state() : 0;
        const isMiddleButton = button && button === Gi.Clutter.BUTTON_MIDDLE;
        const isCtrlPressed = Me.Util.isCtrlPressed(state);
        const isShiftPressed = Me.Util.isShiftPressed(state);

        const currentWS = global.workspace_manager.get_active_workspace();
        const appRecentWorkspace = this._getAppRecentWorkspace(this.app);
        // this feature shouldn't affect search results, dash icons don't have labels, so we use them as a condition
        const showWidowsBeforeActivation = opt.DASH_CLICK_ACTION === 1 && !this.icon.label;

        let targetWindowOnCurrentWs = false;
        if (opt.DASH_FOLLOW_RECENT_WIN) {
            targetWindowOnCurrentWs = appRecentWorkspace === currentWS;
        } else {
            this.app.get_windows().forEach(
                w => {
                    targetWindowOnCurrentWs = targetWindowOnCurrentWs || (w.get_workspace() === currentWS);
                }
            );
        }

        const openNewWindow = this.app.can_open_new_window() &&
                            this.app.state === Gi.Shell.AppState.RUNNING &&
                            (((isCtrlPressed || isMiddleButton) && !(opt.DASH_CLICK_ACTION === 2)) ||
                            (opt.DASH_CLICK_ACTION === 2 && !this._selectedMetaWin && !isMiddleButton) ||
                            (opt.DASH_CLICK_ACTION === 3 && !targetWindowOnCurrentWs));

        if ((this.app.state === Gi.Shell.AppState.STOPPED || openNewWindow) && !isShiftPressed)
            this.animateLaunch();

        if (openNewWindow) {
            this.app.open_new_window(-1);
        // if DASH_CLICK_ACTION == "SHOW_WINS_BEFORE", the app has more than one window and has no window on the current workspace,
        // don't activate the app immediately, only move the overview to the workspace with the app's recent window
        } else if (showWidowsBeforeActivation && !isShiftPressed && this.app.get_n_windows() > 1 && !targetWindowOnCurrentWs/* && !(opt.OVERVIEW_MODE && !opt.WORKSPACE_MODE)*/) {

            Ui.Main.wm.actionMoveWorkspace(appRecentWorkspace);
            Ui.Main.overview.dash.showAppsButton.checked = false;
            return;
        } else if (this._selectedMetaWin) {
            this._selectedMetaWin.activate(global.get_current_time());
        } else if (showWidowsBeforeActivation && opt.OVERVIEW_MODE2 && !opt.WORKSPACE_MODE && !isShiftPressed && this.app.get_n_windows() > 1) {
            // expose windows
            Ui.Main.overview._overview._controls._thumbnailsBox._activateThumbnailAtPoint(0, 0, global.get_current_time(), true);
            return;
        } else if (opt.DASH_SHIFT_CLICK_MV && isShiftPressed && this.app.get_windows().length) {
            this._moveAppToCurrentWorkspace();
            return;
        } else if (isShiftPressed) {
            return;
        } else {
            this.app.activate();
        }

        Ui.Main.overview.hide();
    },

    _moveAppToCurrentWorkspace() {
        this.app.get_windows().forEach(w => w.change_workspace(global.workspace_manager.get_active_workspace()));
    },

    popupMenu(side = Gi.St.Side.LEFT) {
        this.setForcedHighlight(true);
        this._removeMenuTimeout();
        this.fake_release();

        if (!this._getWindowsOnCurrentWs) {
            this._getWindowsOnCurrentWs = function () {
                const winList = [];
                this.app.get_windows().forEach(w => {
                    if (w.get_workspace() === global.workspace_manager.get_active_workspace())
                        winList.push(w);
                });
                return winList;
            };

            this._windowsOnOtherWs = function () {
                return (this.app.get_windows().length - this._getWindowsOnCurrentWs().length) > 0;
            };
        }

        if (!this._menu) {
            this._menu = new Ui.AppMenu.AppMenu(this, side, {
                favoritesSection: true,
                showSingleWindows: true,
            });

            this._menu.setApp(this.app);
            this._openSigId = this._menu.connect('open-state-changed', (menu, isPoppedUp) => {
                if (!isPoppedUp)
                    this._onMenuPoppedDown();
            });
            // Ui.Main.overview.connectObject('hiding',
            this._hidingSigId = Ui.Main.overview.connect('hiding',
                () => this._menu.close(), this);

            Ui.Main.uiGroup.add_actor(this._menu.actor);
            this._menuManager.addMenu(this._menu);
        }

        // once the menu is created, it stays unchanged and we need to modify our items based on current situation
        if (this._addedMenuItems && this._addedMenuItems.length)
            this._addedMenuItems.forEach(i => i.destroy());


        const popupItems = [];

        const separator = new Ui.PopupMenu.PopupSeparatorMenuItem();
        this._menu.addMenuItem(separator);

        if (this.app.get_n_windows()) {
            // if (/* opt.APP_MENU_FORCE_QUIT*/true) {}
            popupItems.push([_('Force Quit'), () => {
                this.app.get_windows()[0].kill();
            }]);

            // if (opt.APP_MENU_CLOSE_WS) {}
            const nWin = this._getWindowsOnCurrentWs().length;
            if (nWin) {
                popupItems.push([_(`Close ${nWin} Windows on Current Workspace`), () => {
                    const windows = this._getWindowsOnCurrentWs();
                    let time = global.get_current_time();
                    for (let win of windows) {
                    // increase time by 1 ms for each window to avoid errors from GS
                        win.delete(time++);
                    }
                }]);
            }

            popupItems.push([_('Move App to Current Workspace ( Shift + Click )'), this._moveAppToCurrentWorkspace]);
        }

        this._addedMenuItems = [];
        this._addedMenuItems.push(separator);
        popupItems.forEach(i => {
            let item = new Ui.PopupMenu.PopupMenuItem(i[0]);
            this._menu.addMenuItem(item);
            item.connect('activate', i[1].bind(this));
            if (i[1] === this._moveAppToCurrentWorkspace && !this._windowsOnOtherWs())
                item.setSensitive(false);
            this._addedMenuItems.push(item);
        });

        this.emit('menu-state-changed', true);

        this._menu.open(Ui.BoxPointer.PopupAnimation.FULL);
        this._menuManager.ignoreRelease();
        this.emit('sync-tooltip');

        return false;
    },

    _getWindowApp(metaWin) {
        const tracker = Gi.Shell.WindowTracker.get_default();
        return tracker.get_window_app(metaWin);
    },

    _getAppLastUsedWindow(app) {
        let recentWin;
        global.display.get_tab_list(Gi.Meta.TabList.NORMAL_ALL, null).forEach(metaWin => {
            const winApp = this._getWindowApp(metaWin);
            if (!recentWin && winApp === app)
                recentWin = metaWin;
        });
        return recentWin;
    },

    _getAppRecentWorkspace(app) {
        const recentWin = this._getAppLastUsedWindow(app);
        if (recentWin)
            return recentWin.get_workspace();

        return null;
    },
};

const ShowWindowsIcon = {
    _afterInit() {
        this._isSearchWindowsIcon = true;
        this._labelText = _('Search Open Windows (Hotkey: Space)');
        this.toggleButton = new Gi.St.Button({
            style_class: 'show-apps',
            track_hover: true,
            can_focus: true,
            toggle_mode: false,
        });

        this._iconActor = null;
        this.icon = new Ui.IconGrid.BaseIcon(this.labelText, {
            setSizeManually: true,
            showLabel: false,
            createIcon: this._createIcon.bind(this),
        });
        this.icon.y_align = Gi.Clutter.ActorAlign.CENTER;

        this.toggleButton.add_actor(this.icon);
        this.toggleButton._delegate = this;

        this.setChild(this.toggleButton);

        if (opt.SEARCH_WINDOWS_ICON_SCROLL) {
            this.reactive = true;
            this._scrollConId = this.connect('scroll-event', DashExtensions.onScrollEvent.bind(this));
            this._leaveConId = this.connect('leave-event', DashExtensions.onLeaveEvent.bind(this));
        }
    },

    _createIcon(size) {
        this._iconActor = new Gi.St.Icon({
            icon_name: 'focus-windows-symbolic',
            icon_size: size,
            style_class: 'show-apps-icon',
            track_hover: true,
        });
        return this._iconActor;
    },
};

const ShowRecentFilesIcon = {
    _afterInit() {
        this._labelText = _('Search Recent Files (Hotkey: Ctrl + Space)');
        this.toggleButton = new Gi.St.Button({
            style_class: 'show-apps',
            track_hover: true,
            can_focus: true,
            toggle_mode: false,
        });

        this._iconActor = null;
        this.icon = new Ui.IconGrid.BaseIcon(this.labelText, {
            setSizeManually: true,
            showLabel: false,
            createIcon: this._createIcon.bind(this),
        });
        this.icon.y_align = Gi.Clutter.ActorAlign.CENTER;

        this.toggleButton.add_actor(this.icon);
        this.toggleButton._delegate = this;

        this.setChild(this.toggleButton);
    },

    _createIcon(size) {
        this._iconActor = new Gi.St.Icon({
            icon_name: 'document-open-recent-symbolic',
            icon_size: size,
            style_class: 'show-apps-icon',
            track_hover: true,
        });
        return this._iconActor;
    },
};
