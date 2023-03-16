/**
 * V-Shell (Vertical Workspaces)
 * dash.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022-2023
 * @license    GPL-3.0
 * modified dash module of https://github.com/RensAlthuis/vertical-overview extension
 */

const { Clutter, GObject, St, Shell, Meta } = imports.gi;
const AppDisplay = imports.ui.appDisplay;
const AppFavorites = imports.ui.appFavorites;
const DND = imports.ui.dnd;
const IconGrid = imports.ui.iconGrid;
const Main = imports.ui.main;
const Overview = imports.ui.overview;
const Dash = imports.ui.dash;
const PopupMenu = imports.ui.popupMenu;
const { AppMenu } = imports.ui.appMenu;
const BoxPointer = imports.ui.boxpointer;
const AltTab = imports.ui.altTab;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Util = Me.imports.util;
const _ = Me.imports.settings._;

const shellVersion = Util.shellVersion;
let _origWorkId;
let _newWorkId;
let _showAppsIconBtnPressId;

// added values to achieve a better ability to scale down according to available space
var BaseIconSizes = [16, 24, 32, 40, 44, 48, 56, 64, 72, 80, 96, 112, 128];

const RecentFilesSearchProviderPrefix = Me.imports.recentFilesSearchProvider.prefix;
const WindowSearchProviderPrefix = Me.imports.windowSearchProvider.prefix;

let _overrides;
let opt;
let _firstRun = true;

const DASH_ITEM_LABEL_SHOW_TIME = 150;

function update(reset = false) {
    opt = Me.imports.settings.opt;
    const moduleEnabled = opt.get('dashModule', true);

    // don't even touch this module if disabled
    if (_firstRun && !moduleEnabled)
        return;

    _firstRun = false;

    if (_overrides)
        _overrides.removeAll();


    const dash = Main.overview._overview._controls.layoutManager._dash;

    setToHorizontal();

    dash.remove_style_class_name('vertical');
    dash.remove_style_class_name('vertical-left');
    dash.remove_style_class_name('vertical-right');

    if (reset || !moduleEnabled) {
        reset = true;
        _moveDashAppGridIcon(reset);
        _connectShowAppsIcon(reset);
        _updateSearchWindowsIcon(false);
        _updateRecentFilesIcon(false);
        dash.visible = true;
        dash._background.opacity = 255;
        dash._background.remove_style_class_name('v-shell-dash-background');
        _overrides = null;
        opt = null;
        return;
    }

    _overrides = new Util.Overrides();

    _overrides.addOverride('DashItemContainer', Dash.DashItemContainer.prototype, DashItemContainerCommon);
    _overrides.addOverride('DashCommon', Dash.Dash.prototype, DashCommon);
    _overrides.addOverride('AppIcon', AppDisplay.AppIcon.prototype, AppIconCommon);
    _overrides.addOverride('DashIcon', Dash.DashIcon.prototype, DashIconCommon);

    if (opt.DASH_VERTICAL) {
        _overrides.addOverride('Dash', Dash.Dash.prototype, DashOverride);
        setToVertical();
        dash.add_style_class_name('vertical');

        if (!_newWorkId) {
            _origWorkId = dash._workId;
            dash._workId = Main.initializeDeferredWork(dash._box, dash._redisplay.bind(dash));
            _newWorkId = dash._workId;
        } else {
            dash._workId = _newWorkId;
        }
    } else {
        setToHorizontal();
        if (_origWorkId)
            dash._workId = _origWorkId;
    }

    _updateSearchWindowsIcon();
    _updateRecentFilesIcon();
    _moveDashAppGridIcon();
    _connectShowAppsIcon();

    if (dash._showWindowsIcon && !dash._showWindowsIconClickedId)
        dash._showWindowsIconClickedId = dash._showWindowsIcon.toggleButton.connect('clicked', (a, c) => c && Util.activateSearchProvider(WindowSearchProviderPrefix));

    if (dash._recentFilesIcon && !dash._recentFilesIconClickedId)
        dash._recentFilesIconClickedId = dash._recentFilesIcon.toggleButton.connect('clicked', (a, c) => c && Util.activateSearchProvider(RecentFilesSearchProviderPrefix));

    dash.visible = opt.DASH_VISIBLE;
    dash._background.add_style_class_name('v-shell-dash-background');
    dash._redisplay();
}

function setToVertical() {
    let dash = Main.overview._overview._controls.layoutManager._dash;

    dash._box.layout_manager.orientation = Clutter.Orientation.VERTICAL;
    dash._dashContainer.layout_manager.orientation = Clutter.Orientation.VERTICAL;
    dash._dashContainer.y_expand = false;
    dash._dashContainer.x_expand = true;
    dash.x_align = Clutter.ActorAlign.START;
    dash.y_align = Clutter.ActorAlign.CENTER;

    let sizerBox = dash._background.get_children()[0];
    sizerBox.clear_constraints();
    sizerBox.add_constraint(new Clutter.BindConstraint({
        source: dash._showAppsIcon.icon,
        coordinate: Clutter.BindCoordinate.WIDTH,
    }));
    sizerBox.add_constraint(new Clutter.BindConstraint({
        source: dash._dashContainer,
        coordinate: Clutter.BindCoordinate.HEIGHT,
    }));
    dash._box.remove_all_children();
    dash._separator = null;
    dash._queueRedisplay();
    dash._adjustIconSize();

    dash.add_style_class_name(opt.DASH_LEFT ? 'vertical-left' : 'vertical-right');
}

function setToHorizontal() {
    let dash = Main.overview._overview._controls.layoutManager._dash;
    if (_origWorkId)
        dash._workId = _origWorkId; // pretty sure this is a leak, but there no provided way to disconnect these...
    dash._box.layout_manager.orientation = Clutter.Orientation.HORIZONTAL;
    dash._dashContainer.layout_manager.orientation = Clutter.Orientation.HORIZONTAL;
    dash._dashContainer.y_expand = true;
    dash._dashContainer.x_expand = false;
    dash.x_align = Clutter.ActorAlign.CENTER;
    dash.y_align = 0;

    let sizerBox = dash._background.get_children()[0];
    sizerBox.clear_constraints();
    sizerBox.add_constraint(new Clutter.BindConstraint({
        source: dash._showAppsIcon.icon,
        coordinate: Clutter.BindCoordinate.HEIGHT,
    }));
    sizerBox.add_constraint(new Clutter.BindConstraint({
        source: dash._dashContainer,
        coordinate: Clutter.BindCoordinate.WIDTH,
    }));

    dash._box.remove_all_children();
    dash._separator = null;
    dash._queueRedisplay();
    dash._adjustIconSize();
}

function _moveDashAppGridIcon(reset = false) {
    // move dash app grid icon to the front
    const dash = Main.overview._overview._controls.layoutManager._dash;

    const appIconPosition = opt.get('showAppsIconPosition', true);
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

function _connectShowAppsIcon(reset = false) {
    if (!reset) {
        if (_showAppsIconBtnPressId || Util.dashIsDashToDock()) {
            // button is already connected || dash is Dash to Dock
            return;
        }

        Main.overview.dash._showAppsIcon.reactive = true;
        _showAppsIconBtnPressId = Main.overview.dash._showAppsIcon.connect('button-press-event', (actor, event) => {
            const button = event.get_button();
            if (button === Clutter.BUTTON_MIDDLE)
                Util.openPreferences();
            else if (button === Clutter.BUTTON_SECONDARY)
                Util.activateSearchProvider(WindowSearchProviderPrefix);
            else
                return Clutter.EVENT_PROPAGATE;
            return Clutter.EVENT_STOP;
        });
    } else if (_showAppsIconBtnPressId) {
        Main.overview.dash._showAppsIcon.disconnect(_showAppsIconBtnPressId);
        _showAppsIconBtnPressId = 0;
        Main.overview.dash._showAppsIcon.reactive = false;
    }
}

const DashOverride = {
    handleDragOver(source, actor, _x, y, _time) {
        let app = Dash.getAppFromSource(source);

        // Don't allow favoriting of transient apps
        if (app === null || app.is_window_backed())
            return DND.DragMotionResult.NO_DROP;

        if (!global.settings.is_writable('favorite-apps'))
            return DND.DragMotionResult.NO_DROP;

        let favorites = AppFavorites.getAppFavorites().getFavorites();
        let numFavorites = favorites.length;

        let favPos = favorites.indexOf(app);

        let children = this._box.get_children();
        let numChildren = children.length;
        let boxHeight = this._box.height;

        // Keep the placeholder out of the index calculation; assuming that
        // the remove target has the same size as "normal" items, we don't
        // need to do the same adjustment there.
        if (this._dragPlaceholder) {
            boxHeight -= this._dragPlaceholder.height;
            numChildren--;
        }

        // Same with the separator
        if (this._separator) {
            boxHeight -= this._separator.height;
            numChildren--;
        }

        let pos;
        if (!this._emptyDropTarget)
            pos = Math.floor(y * numChildren / boxHeight);
        else
            pos = 0; // always insert at the top when dash is empty

        // Put the placeholder after the last favorite if we are not
        // in the favorites zone
        if (pos > numFavorites)
            pos = numFavorites;

        if (pos !== this._dragPlaceholderPos && this._animatingPlaceholdersCount === 0) {
            this._dragPlaceholderPos = pos;

            // Don't allow positioning before or after self
            if (favPos !== -1 && (pos === favPos || pos === favPos + 1)) {
                this._clearDragPlaceholder();
                return DND.DragMotionResult.CONTINUE;
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

            this._dragPlaceholder = new Dash.DragPlaceholderItem();
            this._dragPlaceholder.child.set_width(this.iconSize / 2);
            this._dragPlaceholder.child.set_height(this.iconSize);
            this._box.insert_child_at_index(this._dragPlaceholder,
                this._dragPlaceholderPos);
            this._dragPlaceholder.show(fadeIn);
        }

        if (!this._dragPlaceholder)
            return DND.DragMotionResult.NO_DROP;

        let srcIsFavorite = favPos !== -1;

        if (srcIsFavorite)
            return DND.DragMotionResult.MOVE_DROP;

        return DND.DragMotionResult.COPY_DROP;
    },

    _redisplay() {
        let favorites = AppFavorites.getAppFavorites().getFavoriteMap();

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
            this._box.insert_child_at_index(addedItems[i].item,
                addedItems[i].pos);
        }

        for (let i = 0; i < removedActors.length; i++) {
            let item = removedActors[i];

            // Don't animate item removal when the overview is transitioning
            // or hidden
            if (Main.overview.visible && !Main.overview.animationInProgress)
                item.animateOutAndDestroy();
            else
                item.destroy();
        }

        this._adjustIconSize();

        // Skip animations on first run when adding the initial set
        // of items, to avoid all items zooming in at once

        let animate = this._shownInitially && Main.overview.visible &&
            !Main.overview.animationInProgress;

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
                this._separator = new St.Widget({
                    style_class: 'dash-separator',
                    x_align: Clutter.ActorAlign.CENTER,
                    y_align: Clutter.ActorAlign.CENTER,
                    width: this.iconSize,
                    height: 1,
                });
                this._box.add_child(this._separator);
            }

            // FIXME: separator placement is broken (also in original dash)
            let pos = nFavorites;
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
        let appIcon = new Dash.DashIcon(app);

        let indicator = appIcon._dot;
        indicator.x_align = opt.DASH_LEFT ? Clutter.ActorAlign.START : Clutter.ActorAlign.END;
        indicator.y_align = Clutter.ActorAlign.CENTER;

        appIcon.connect('menu-state-changed',
            (o, opened) => {
                this._itemMenuStateChanged(item, opened);
            });

        let item = new Dash.DashItemContainer();
        item.setChild(appIcon);

        // Override default AppIcon label_actor, now the
        // accessible_name is set at DashItemContainer.setLabelText
        appIcon.label_actor = null;
        item.setLabelText(app.get_name());

        appIcon.icon.setIconSize(this.iconSize);
        this._hookUpLabel(item, appIcon);

        return item;
    },
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
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });

        this.label.set_position(x, y);
        this.label.ease({
            opacity: 255,
            duration: DASH_ITEM_LABEL_SHOW_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    },
};

const DashCommon = {
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
        const maxAllocation = new Clutter.ActorBox({
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

            maxIconSize = Math.min(availWidth / iconChildren.length, availHeight, opt.MAX_ICON_SIZE);
        } else {
            availWidth = this._maxWidth;
            availWidth -= this._background.get_theme_node().get_horizontal_padding();
            availWidth -= themeNode.get_horizontal_padding();
            availWidth -= buttonWidth - iconWidth;

            availHeight = maxContent.y2 - maxContent.y1;
            availHeight -= iconChildren.length * (buttonHeight - iconHeight) +
                            (iconChildren.length - 1) * spacing +
                            2 * this._background.get_theme_node().get_vertical_padding();

            maxIconSize = Math.min(availWidth, availHeight / iconChildren.length, opt.MAX_ICON_SIZE);
        }

        let scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
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
            if (!Main.overview.visible || Main.overview.animationInProgress ||
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
                duration: Dash.DASH_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }

        if (this._separator) {
            this._separator.ease({
                width: dashHorizontal ? 1 : this.iconSize,
                height: dashHorizontal ? this.iconSize : 1,
                duration: Dash.DASH_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }

        this._adjustingInProgress = false;
    },
};

const DashIconCommon = {
    after__init() {
        if (opt.OVERVIEW_MODE2) {
            this._scrollConId = this.connect('scroll-event', this._onScrollEvent.bind(this));
            this._leaveConId = this.connect('leave-event', this._onLeaveEvent.bind(this));
        }
    },

    _onScrollEvent(source, event) {
        if (!opt.OVERVIEW_MODE2) {
            if (this._scrollConId)
                this.disconnect(this._scrollConId);
            if (this._leaveConId)
                this.disconnect(this._leaveConId);
        }
        if (opt.WORKSPACE_MODE)
            return Clutter.EVENT_PROPAGATE;

        // avoid uncontrollable switching if smooth scroll wheel or trackpad is used
        if (Date.now() - this._lastScroll < 120)
            return Clutter.EVENT_STOP;

        this._lastScroll = Date.now();

        let direction = Util.getScrollDirection(event);
        if (direction === Clutter.ScrollDirection.UP)
            direction = 1;
        else if (direction === Clutter.ScrollDirection.DOWN)
            direction = -1;
        else
            return Clutter.EVENT_STOP;

        this._switchWindow(direction);
        return Clutter.EVENT_STOP;
    },

    _onLeaveEvent() {
        if (!this._selectedMetaWin || this._ignoreLeave) {
            this._ignoreLeave = false;
            return;
        }

        this._selectedMetaWin = null;
        this._scrolledWindows = null;
    },

    _switchWindow(direction, wsOnly = false) {
        if (!this._scrolledWindows)
            this._scrolledWindows = this.app.get_windows();

        let windows = this._scrolledWindows;

        if (!windows.length)
            return;

        // if window selection is in the process, the previewed window must be the current one
        let currentWin  = this._selectedMetaWin ? this._selectedMetaWin : windows[0];

        const currentIdx = windows.indexOf(currentWin);
        let targetIdx = currentIdx +  -direction; // reverse the direction to follow MRU ordered list

        if (targetIdx > windows.length - 1)
            targetIdx = 0;
        else if (targetIdx < 0)
            targetIdx = windows.length - 1;

        const metaWin = windows[targetIdx];
        this._showWindowPreview(metaWin);
        this._selectedMetaWin = metaWin;
    },

    _showWindowPreview(metaWin) {
        if (!metaWin)
            return;
        const views = Main.overview._overview.controls._workspacesDisplay._workspacesViews;
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
                    if (windowPreview.metaWindow === metaWin) {
                        if (metaWin.get_workspace() !== global.workspace_manager.get_active_workspace()) {
                            this._ignoreLeave = true;
                            Main.wm.actionMoveWorkspace(metaWin.get_workspace());
                        }
                        windowPreview.get_parent().set_child_above_sibling(windowPreview, null);
                    }
                });
            });
        });
    },
};

const AppIconCommon = {
    activate(button) {
        const event = Clutter.get_current_event();
        const state = event ? event.get_state() : 0;
        const isMiddleButton = button && button === Clutter.BUTTON_MIDDLE;
        const isCtrlPressed = Util.isCtrlPressed(state);
        const isShiftPressed = Util.isShiftPressed(state);
        const openNewWindow = this.app.can_open_new_window() &&
                            this.app.state === Shell.AppState.RUNNING &&
                            (isCtrlPressed || isMiddleButton);

        const currentWS = global.workspace_manager.get_active_workspace();
        const appRecentWorkspace = _getAppRecentWorkspace(this.app);
        // this feature shouldn't affect search results, dash icons don't have labels, so we use them as a condition
        const showWidowsBeforeActivation = opt.DASH_SHOW_WINS_BEFORE && !this.icon.label;

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

        if ((this.app.state === Shell.AppState.STOPPED || openNewWindow) && !isShiftPressed)
            this.animateLaunch();

        if (openNewWindow) {
            this.app.open_new_window(-1);
        // if DASH_SHOW_WINS_BEFORE, the app has more than one window and has no window on the current workspace,
        // don't activate the app immediately, only move the overview to the workspace with the app's recent window
        } else if (showWidowsBeforeActivation && !isShiftPressed && this.app.get_n_windows() > 1 && !targetWindowOnCurrentWs/* && !(opt.OVERVIEW_MODE && !opt.WORKSPACE_MODE)*/) {
            // this._scroll = true;
            // this._scrollTime = Date.now();
            Main.wm.actionMoveWorkspace(appRecentWorkspace);
            Main.overview.dash.showAppsButton.checked = false;
            return;
        } else if (showWidowsBeforeActivation && opt.OVERVIEW_MODE2 && !opt.WORKSPACE_MODE && !isShiftPressed && this.app.get_n_windows() > 1) {
            // expose windows
            Main.overview._overview._controls._thumbnailsBox._activateThumbnailAtPoint(0, 0, global.get_current_time(), true);
            return;
        } else if (opt.DASH_SHIFT_CLICK_MV && isShiftPressed && this.app.get_windows().length) {
            this._moveAppToCurrentWorkspace();
            return;
        } else if (isShiftPressed) {
            return;
        } else {
            this.app.activate();
        }

        Main.overview.hide();
    },

    _moveAppToCurrentWorkspace() {
        this.app.get_windows().forEach(w => w.change_workspace(global.workspace_manager.get_active_workspace()));
    },

    popupMenu(side = St.Side.LEFT) {
        if (shellVersion >= 42)
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
            this._menu = new AppMenu(this, side, {
                favoritesSection: true,
                showSingleWindows: true,
            });

            this._menu.setApp(this.app);
            this._openSigId = this._menu.connect('open-state-changed', (menu, isPoppedUp) => {
                if (!isPoppedUp)
                    this._onMenuPoppedDown();
            });
            // Main.overview.connectObject('hiding',
            this._hidingSigId = Main.overview.connect('hiding',
                () => this._menu.close(), this);

            Main.uiGroup.add_actor(this._menu.actor);
            this._menuManager.addMenu(this._menu);
        }

        // once the menu is created, it stays unchanged and we need to modify our items based on current situation
        if (this._addedMenuItems && this._addedMenuItems.length)
            this._addedMenuItems.forEach(i => i.destroy());


        const popupItems = [];

        const separator = new PopupMenu.PopupSeparatorMenuItem();
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

            if (/* opt.APP_MENU_MV_TO_WS && */this._windowsOnOtherWs())
                popupItems.push([_('Move App to Current Workspace ( Shift + Click )'), this._moveAppToCurrentWorkspace]);
        }

        this._addedMenuItems = [];
        this._addedMenuItems.push(separator);
        popupItems.forEach(i => {
            let item = new PopupMenu.PopupMenuItem(i[0]);
            this._menu.addMenuItem(item);
            item.connect('activate', i[1].bind(this));
            this._addedMenuItems.push(item);
        });

        this.emit('menu-state-changed', true);

        this._menu.open(BoxPointer.PopupAnimation.FULL);
        this._menuManager.ignoreRelease();
        this.emit('sync-tooltip');

        return false;
    },
};

function _getWindowApp(metaWin) {
    const tracker = Shell.WindowTracker.get_default();
    return tracker.get_window_app(metaWin);
}

function _getAppLastUsedWindow(app) {
    let recentWin;
    global.display.get_tab_list(Meta.TabList.NORMAL_ALL, null).forEach(metaWin => {
        const winApp = _getWindowApp(metaWin);
        if (!recentWin && winApp === app)
            recentWin = metaWin;
    });
    return recentWin;
}

function _getAppRecentWorkspace(app) {
    const recentWin = _getAppLastUsedWindow(app);
    if (recentWin)
        return recentWin.get_workspace();

    return null;
}

function _updateSearchWindowsIcon(show = opt.SHOW_WINDOWS_ICON) {
    const dash = Main.overview._overview._controls.layoutManager._dash;
    const dashContainer = dash._dashContainer;

    if (dash._showWindowsIcon) {
        dashContainer.remove_child(dash._showWindowsIcon);
        if (dash._showWindowsIconClickedId)
            dash._showWindowsIcon.toggleButton.disconnect(dash._showWindowsIconClickedId);
        dash._showWindowsIconClickedId = undefined;
        if (dash._showWindowsIcon)
            dash._showWindowsIcon.destroy();
        dash._showWindowsIcon = undefined;
    }

    if (!show || !opt.WINDOW_SEARCH_PROVIDER_ENABLED)
        return;

    if (!dash._showWindowsIcon) {
        dash._showWindowsIcon = new ShowWindowsIcon();
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

    Main.overview._overview._controls.layoutManager._dash._adjustIconSize();
}

const ShowWindowsIcon = GObject.registerClass(
class ShowWindowsIcon extends Dash.DashItemContainer {
    _init() {
        super._init();

        this._labelText = _('Search Open Windows (Hotkey: Space)');
        this.toggleButton = new St.Button({
            style_class: 'show-apps',
            track_hover: true,
            can_focus: true,
            toggle_mode: false,
        });

        this._iconActor = null;
        this.icon = new IconGrid.BaseIcon(this.labelText, {
            setSizeManually: true,
            showLabel: false,
            createIcon: this._createIcon.bind(this),
        });
        this.icon.y_align = Clutter.ActorAlign.CENTER;

        this.toggleButton.add_actor(this.icon);
        this.toggleButton._delegate = this;

        this.setChild(this.toggleButton);
    }

    _createIcon(size) {
        this._iconActor = new St.Icon({
            icon_name: 'focus-windows-symbolic',
            icon_size: size,
            style_class: 'show-apps-icon',
            track_hover: true,
        });
        return this._iconActor;
    }
});

function _updateRecentFilesIcon(show = opt.SHOW_RECENT_FILES_ICON) {
    const dash = Main.overview._overview._controls.layoutManager._dash;
    const dashContainer = dash._dashContainer;

    if (dash._recentFilesIcon) {
        dashContainer.remove_child(dash._recentFilesIcon);
        if (dash._recentFilesIconClickedId)
            dash._recentFilesIcon.toggleButton.disconnect(dash._recentFilesIconClickedId);
        dash._recentFilesIconClickedId = undefined;
        if (dash._recentFilesIcon)
            dash._recentFilesIcon.destroy();
        dash._recentFilesIcon = undefined;
    }

    if (!show || !opt.RECENT_FILES_SEARCH_PROVIDER_ENABLED)
        return;

    if (!dash._recentFilesIcon) {
        dash._recentFilesIcon = new ShowRecentFilesIcon();
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

    Main.overview._overview._controls.layoutManager._dash._adjustIconSize();
}

const ShowRecentFilesIcon = GObject.registerClass(
class ShowRecentFilesIcon extends Dash.DashItemContainer {
    _init() {
        super._init();

        this._labelText = _('Search Recent Files (Hotkey: Ctrl + Space)');
        this.toggleButton = new St.Button({
            style_class: 'show-apps',
            track_hover: true,
            can_focus: true,
            toggle_mode: false,
        });

        this._iconActor = null;
        this.icon = new IconGrid.BaseIcon(this.labelText, {
            setSizeManually: true,
            showLabel: false,
            createIcon: this._createIcon.bind(this),
        });
        this.icon.y_align = Clutter.ActorAlign.CENTER;

        this.toggleButton.add_actor(this.icon);
        this.toggleButton._delegate = this;

        this.setChild(this.toggleButton);
    }

    _createIcon(size) {
        this._iconActor = new St.Icon({
            icon_name: 'document-open-recent-symbolic',
            icon_size: size,
            style_class: 'show-apps-icon',
            track_hover: true,
        });
        return this._iconActor;
    }
});
