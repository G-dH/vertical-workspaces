/**
 * V-Shell (Vertical Workspaces)
 * dash.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022-2025
 * @license    GPL-3.0
  */

'use strict';

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Dash from 'resource:///org/gnome/shell/ui/dash.js';
import * as AppDisplay from 'resource:///org/gnome/shell/ui/appDisplay.js';
import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as AppMenu from 'resource:///org/gnome/shell/ui/appMenu.js';
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

let Me;
let opt;
// gettext
let _;

let _moduleEnabled;
let _timeouts;

// added values to achieve a better ability to scale down according to available space
export const BaseIconSizes = [16, 24, 32, 40, 44, 48, 56, 64, 72, 80, 96, 112, 128];

const DASH_ITEM_LABEL_SHOW_TIME = 150;

const shellVersion46 = !Clutter.Container; // Container has been removed in 46

export const DashModule = class {
    constructor(me) {
        Me = me;
        opt = Me.opt;
        _  = Me.gettext;

        this._firstActivation = true;
        this.moduleEnabled = false;
        this._overrides = null;
        this._originalWorkId = null;
        this._customWorkId = null;
        this._showAppsIconBtnPressId = 0;
    }

    cleanGlobals() {
        Me = null;
        opt = null;
        _ = null;
    }

    update(reset) {
        this._removeTimeouts();

        this.moduleEnabled = opt.get('dashModule');
        const conflict = !!(Me.Util.getEnabledExtensions('dash-to-dock').length ||
                         Me.Util.getEnabledExtensions('dash2dock').length ||
                         Me.Util.getEnabledExtensions('ubuntu-dock').length ||
                         Me.Util.getEnabledExtensions('dash-to-panel').length);

        if (conflict && !reset)
            console.warn(`[${Me.metadata.name}] Warning: "Dash" module disabled due to potential conflict with another extension`);

        reset = reset || !this.moduleEnabled || conflict;
        this._conflict = conflict;

        // don't touch the original code if module disabled
        if (reset && !this._firstActivation) {
            this._disableModule();
        } else if (!reset) {
            this._firstActivation = false;
            this._activateModule();
        }
        if (reset && this._firstActivation)
            console.debug('  DashModule - Keeping untouched');
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
        _moduleEnabled = true;
        _timeouts = {};
        const dash = Main.overview._overview._controls.layoutManager._dash;

        if (!this._originalWorkId)
            this._originalWorkId = dash._workId;

        if (!this._overrides)
            this._overrides = new Me.Util.Overrides();

        this._resetStyle(dash);
        this.updateStyle(dash);

        this._overrides.addOverride('DashItemContainer', Dash.DashItemContainer.prototype, DashItemContainerCommon);
        this._overrides.addOverride('DashCommon', Dash.Dash.prototype, DashCommon);
        this._overrides.addOverride('AppIcon', AppDisplay.AppIcon.prototype, AppIconCommon);
        this._overrides.addOverride('DashIcon', Dash.DashIcon.prototype, DashIconCommon);
        this._overrides.addOverride('AppMenu', AppMenu.AppMenu.prototype, AppMenuCommon);

        if (shellVersion46)
            dash.add_style_class_name('dash-46');

        if (opt.DASH_VERTICAL) {
            // this._overrides.addOverride('Dash', Dash.Dash.prototype, DashVerticalOverride);
            dash.add_style_class_name(shellVersion46
                ? 'vertical-46'
                : 'vertical'
            );

            this._setOrientation(Clutter.Orientation.VERTICAL);
        } else {
            this._setOrientation(Clutter.Orientation.HORIZONTAL);
        }

        if (opt.DASH_VERTICAL && opt.DASH_BG_GS3_STYLE) {
            if (opt.DASH_LEFT) {
                dash.add_style_class_name(shellVersion46
                    ? 'vertical-46-gs3-left'
                    : 'vertical-gs3-left');
            } else if (opt.DASH_RIGHT) {
                dash.add_style_class_name(shellVersion46
                    ? 'vertical-46-gs3-right'
                    : 'vertical-gs3-right');
            }
        } else {
            dash.remove_style_class_name('vertical-gs3-left');
            dash.remove_style_class_name('vertical-gs3-right');
            dash.remove_style_class_name('vertical-46-gs3-left');
            dash.remove_style_class_name('vertical-46-gs3-right');
        }

        if (!this._customWorkId)
            this._customWorkId = Main.initializeDeferredWork(dash._box, dash._redisplay.bind(dash));
        dash._workId = this._customWorkId;

        this._moveDashAppGridIcon();
        this._connectShowAppsIcon();

        dash.visible = opt.DASH_VISIBLE;
        // dash._background.add_style_class_name('dash-background-reduced');
        dash._queueRedisplay();

        if (opt.DASH_ISOLATE_WS && !this._wmSwitchWsConId) {
            this._wmSwitchWsConId = global.windowManager.connect('switch-workspace', () => dash._queueRedisplay());
            this._newWindowConId = global.display.connect_after('window-created', () => dash._queueRedisplay());
        }

        console.debug('  DashModule - Activated');
    }

    _disableModule() {
        const dash = Main.overview._overview._controls.layoutManager._dash;

        if (this._overrides)
            this._overrides.removeAll();
        this._overrides = null;

        dash._workId = this._originalWorkId;

        if (this._wmSwitchWsConId) {
            global.windowManager.disconnect(this._wmSwitchWsConId);
            this._wmSwitchWsConId = 0;
        }
        if (this._newWindowConId) {
            global.windowManager.disconnect(this._newWindowConId);
            this._newWindowConId = 0;
        }

        const reset = true;
        this._setOrientation(Clutter.Orientation.HORIZONTAL);
        this._moveDashAppGridIcon(reset);
        this._connectShowAppsIcon(reset);

        this._resetStyle(dash);
        dash.visible = !this._conflict;
        dash._background.opacity = 255;

        _moduleEnabled = false;
        console.debug('  DashModule - Disabled');
    }

    _resetStyle(dash) {
        dash.remove_style_class_name('dash-46');
        dash.remove_style_class_name('vertical');
        dash.remove_style_class_name('vertical-46');
        dash.remove_style_class_name('vertical-gs3-left');
        dash.remove_style_class_name('vertical-gs3-right');
        dash.remove_style_class_name('vertical-46-gs3-left');
        dash.remove_style_class_name('vertical-46-gs3-right');
        dash.remove_style_class_name('vertical-left');
        dash.remove_style_class_name('vertical-right');
        dash._background.remove_style_class_name('dash-background-light');
        dash._background.remove_style_class_name('dash-background-reduced');
        dash._background.set_style('');
    }

    _removeTimeouts() {
        if (_timeouts) {
            Object.values(_timeouts).forEach(t => {
                if (t)
                    GLib.source_remove(t);
            });
            _timeouts = null;
        }
    }

    _setOrientation(orientation, dash) {
        dash = dash ?? Main.overview._overview._controls.layoutManager._dash;

        dash._box.layout_manager.orientation = orientation;
        dash._dashContainer.layout_manager.orientation = orientation;
        dash._dashContainer.y_expand = !orientation;
        dash._dashContainer.x_expand = !!orientation;
        dash.x_align = orientation ? Clutter.ActorAlign.START : Clutter.ActorAlign.CENTER;
        dash.y_align = orientation ? Clutter.ActorAlign.CENTER : Clutter.ActorAlign.FILL;

        let sizerBox = dash._background.get_children()[0];
        sizerBox.clear_constraints();
        sizerBox.add_constraint(new Clutter.BindConstraint({
            source: dash._showAppsIcon.icon,
            coordinate: orientation ? Clutter.BindCoordinate.WIDTH : Clutter.BindCoordinate.HEIGHT,
        }));
        sizerBox.add_constraint(new Clutter.BindConstraint({
            source: dash._dashContainer,
            coordinate: orientation ? Clutter.BindCoordinate.HEIGHT : Clutter.BindCoordinate.WIDTH,
        }));
        dash._box.remove_all_children();
        dash._separator = null;
        dash._queueRedisplay();
        dash._adjustIconSize();
    }

    _moveDashAppGridIcon(reset = false) {
        // move dash app grid icon to the front
        const dash = Main.overview._overview._controls.layoutManager._dash;

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
        dash = dash ?? Main.overview._overview._controls.layoutManager._dash;
        if (!reset) {
            if (this._showAppsIconBtnPressId || Me.Util.dashIsDashToDock()) {
                // button is already connected || dash is Dash to Dock
                return;
            }
            dash._showAppsIcon.reactive = true;
            this._showAppsIconBtnPressId = dash._showAppsIcon.connect('button-press-event', (actor, event) => {
                const button = event.get_button();
                if (button === Clutter.BUTTON_MIDDLE)
                    Me.Util.openPreferences();
                /* else if (button === Clutter.BUTTON_SECONDARY)
                    Me.Util.activateSearchProvider(Me.WSP_PREFIX);*/
                else
                    return Clutter.EVENT_PROPAGATE;
                return Clutter.EVENT_STOP;
            });
        } else if (this._showAppsIconBtnPressId) {
            dash._showAppsIcon.disconnect(this._showAppsIconBtnPressId);
            this._showAppsIconBtnPressId = 0;
            dash._showAppsIcon.reactive = false;
        }
    }
};

function getAppFromSource(source) {
    if (source instanceof AppDisplay.AppIcon)
        return source.app;
    else
        return null;
}

const DashItemContainerCommon = {
    // move labels according dash position
    showLabel() {
        if (!this._labelText)
            return;

        const windows = this.child.app?.get_windows();
        const recentWindowTitle = windows && windows.length ? windows[0].get_title() : '';
        const windowCount = this.child.app?.get_windows().length;
        let labelSuffix = '';
        if (windowCount > 1)
            labelSuffix = ` (${windowCount})`;
        if (recentWindowTitle && recentWindowTitle !== this._labelText)
            labelSuffix += `\n ${recentWindowTitle}`;

        this.label.set_text(this._labelText + labelSuffix);

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
            const yOffset = itemHeight + (shellVersion46 ? 0 : -3);
            y = stageY + yOffset;
        } else  if (opt.DASH_BOTTOM) {
            const yOffset = node.get_length('-y-offset');
            y = stageY - this.label.height - yOffset;
        } else if (opt.DASH_RIGHT) {
            const yOffset = Math.floor((itemHeight - labelHeight) / 2);
            xOffset = shellVersion46 && opt.DASH_BG_GS3_STYLE ? 12 : 0;

            x = stageX - xOffset - this.label.width;
            y = Math.clamp(stageY + yOffset, 0, global.stage.height - labelHeight);
        } else if (opt.DASH_LEFT) {
            const yOffset = Math.floor((itemHeight - labelHeight) / 2);
            xOffset = shellVersion46 && opt.DASH_BG_GS3_STYLE ? 12 : 0;

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
    _redisplay() {
        // After disabling V-Shell queueRedisplay() may call this function
        // In that case redirect the call to the current _redisplay()
        if (!_moduleEnabled) {
            this._redisplay();
            return;
        }

        let favorites = AppFavorites.getAppFavorites().getFavoriteMap();

        let running = this._appSystem.get_running();

        if (opt.DASH_ISOLATE_WS) {
            const currentWs = global.workspace_manager.get_active_workspace();
            running = running.filter(app => {
                return app.get_windows().filter(w => w.get_workspace() === currentWs).length;
            });
            this._box.get_children().forEach(a => a.child?._updateRunningStyle());
        }

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
        let appIcon = new Dash.DashIcon(app);

        let indicator = appIcon._dot;
        if (opt.DASH_VERTICAL) {
            indicator.x_align = opt.DASH_LEFT ? Clutter.ActorAlign.START : Clutter.ActorAlign.END;
            indicator.y_align = Clutter.ActorAlign.CENTER;
        } else {
            indicator.x_align = Clutter.ActorAlign.CENTER;
            indicator.y_align = Clutter.ActorAlign.END;
        }

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


        // showWindowsIcon and extensionsIcon can be provided by the WSP and ESP extensions
        if (this._showWindowsIcon)
            iconChildren.push(this._showWindowsIcon);

        if (this._extensionsIcon)
            iconChildren.push(this._extensionsIcon);


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
        let scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;

        let maxIconSize = opt.MAX_ICON_SIZE;
        if (!maxIconSize) {
            maxIconSize = Me.Util.monitorHasLowResolution()
                ? 48
                : 64;
        }

        let availWidth, availHeight;
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

            maxIconSize = Math.min(availWidth / iconChildren.length, availHeight, maxIconSize * scaleFactor);
        } else {
            availWidth = this._maxWidth;
            availWidth -= this._background.get_theme_node().get_horizontal_padding();
            availWidth -= themeNode.get_horizontal_padding();
            availWidth -= buttonWidth - iconWidth;

            availHeight = maxContent.y2 - maxContent.y1;
            availHeight -= iconChildren.length * (buttonHeight - iconHeight) +
                            (iconChildren.length - 1) * spacing +
                            2 * this._background.get_theme_node().get_vertical_padding();

            maxIconSize = Math.min(availWidth, availHeight / iconChildren.length, maxIconSize * scaleFactor);
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

    handleDragOver(source, actor, x, y, _time) {
        let app = getAppFromSource(source);

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
        else if (this.text_direction === Clutter.TextDirection.RTL)
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

            // this._dragPlaceholder = new Dash.DragPlaceholderItem(); // not exported in 45
            this._dragPlaceholder = new Dash.DashItemContainer();
            this._dragPlaceholder.setChild(new St.Bin({ style_class: 'placeholder' }));
            this._dragPlaceholder.child.set_width(this.iconSize / (opt.DASH_VERTICAL ? 2 : 1));
            this._dragPlaceholder.child.set_height(this.iconSize / (opt.DASH_VERTICAL ? 1 : 2));
            this._box.insert_child_at_index(
                this._dragPlaceholder,
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
};

const AppIconCommon = {
    after__init() {
        if (this._updateRunningDotStyle)
            this._updateRunningDotStyle();
    },

    _updateRunningDotStyle() {
        if (opt.RUNNING_DOT_STYLE)
            this._dot.add_style_class_name('app-grid-running-dot-custom');
        else
            this._dot.remove_style_class_name('app-grid-running-dot-custom');
    },

    activate(button) {
        opt.CANCEL_ALWAYS_ACTIVATE_SELECTED = true;
        const event = Clutter.get_current_event();
        const state = event ? event.get_state() : 0;
        const isShiftPressed = Me.Util.isShiftPressed(state);
        const isCtrlPressed = Me.Util.isCtrlPressed(state);
        const appIsRunning = this.app.state === Shell.AppState.RUNNING;
        const appRecentWorkspace = this._getAppRecentWorkspace(this.app);
        const targetWindowOnCurrentWs = this._isTargetWindowOnCurrentWs(appRecentWorkspace);

        const openNewWindow = this._shouldOpenNewWindow(appIsRunning, button, isShiftPressed, isCtrlPressed, targetWindowOnCurrentWs);
        const staticWorkspace = !opt.WORKSPACE_MODE;
        const nWindows = appIsRunning ? this.app.get_n_windows() : 0;
        // This feature shouldn't affect search results. Dash icons lack labels, so their absence is used as a condition
        const showWidowsBeforeActivation =
            opt.DASH_CLICK_ACTION === 1 && !this.icon.label &&
            !isShiftPressed && nWindows > 1;/* &&
            !(opt.DASH_ISOLATE_WS || opt.DASH_CLICK_OPEN_NEW_WIN || opt.DASH_CLICK_PREFER_WORKSPACE);*/

        if ((!appIsRunning || openNewWindow) && !isShiftPressed)
            this.animateLaunch();

        if (openNewWindow) {
            this.app.open_new_window(-1);
        } else if (this._selectedMetaWin) {
            this._selectedMetaWin.activate(global.get_current_time());
        // if DASH_CLICK_ACTION == "SHOW_WINS_BEFORE", the app has more than one window and has no window on the current workspace,
        // don't activate the app immediately, only move the overview to the workspace with the app's recent window
        } else if (showWidowsBeforeActivation) {
            if (!targetWindowOnCurrentWs) {
                Main.wm.actionMoveWorkspace(appRecentWorkspace);
                Main.overview.dash.showAppsButton.checked = false;
                // Activate the app to ensure it appears above all other apps in static workspace mode
                this.app.activate();
                return;
            } else if (staticWorkspace) {
                // spread windows
                Me.Util.exposeWindows();
                return;
            } else {
                this.app.activate();
            }
        } else if (this._shouldMoveToCurrentWorkspace(isShiftPressed, openNewWindow, targetWindowOnCurrentWs, nWindows)) {
            this._moveAppToCurrentWorkspace();
            if ((opt.DASH_ISOLATE_WS || opt.DASH_CLICK_PREFER_WORKSPACE) && !isShiftPressed) {
                this.app.activate();
                // hide the overview after the window is re-created
                GLib.idle_add(GLib.PRIORITY_LOW, () => Main.overview.hide());
                return;
            }
            return;
        } else {
            this.app.activate();
        }

        Main.overview.hide();
    },

    _shouldOpenNewWindow(appIsRunning, button, isShiftPressed, isCtrlPressed, targetWindowOnCurrentWs) {
        const isMiddleButton = button && button === Clutter.BUTTON_MIDDLE;
        return this.app.can_open_new_window() &&
                appIsRunning && !isShiftPressed &&
                (((isCtrlPressed || isMiddleButton) && !opt.DASH_CLICK_OPEN_NEW_WIN) ||
                (opt.DASH_CLICK_OPEN_NEW_WIN && !isMiddleButton) ||
                ((opt.DASH_CLICK_PREFER_WORKSPACE || opt.DASH_ISOLATE_WS) && !targetWindowOnCurrentWs));
    },

    _isTargetWindowOnCurrentWs(appRecentWorkspace) {
        const currentWS = global.workspace_manager.get_active_workspace();
        if (opt.DASH_FOLLOW_RECENT_WIN)
            return appRecentWorkspace === currentWS;

        let targetWindowOnCurrentWs = false;
        this.app.get_windows().forEach(
            w => {
                targetWindowOnCurrentWs = targetWindowOnCurrentWs || (w.get_workspace() === currentWS);
            }
        );
        return targetWindowOnCurrentWs;
    },

    _shouldMoveToCurrentWorkspace(isShiftPressed, openNewWindow, targetWindowOnCurrentWs, nWindows) {
        return ((opt.DASH_SHIFT_CLICK_MV && isShiftPressed) ||
                ((opt.DASH_CLICK_PREFER_WORKSPACE || opt.DASH_ISOLATE_WS) && !openNewWindow && !targetWindowOnCurrentWs)) &&
                nWindows > 0;
    },

    _moveAppToCurrentWorkspace() {
        this.app.get_windows().forEach(w => w.change_workspace(global.workspace_manager.get_active_workspace()));
    },

    popupMenu(side = St.Side.LEFT) {
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
            this._menu = new AppMenu.AppMenu(this, side, {
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

            Main.uiGroup.add_child(this._menu.actor);
            this._menuManager.addMenu(this._menu);
        }

        // once the menu is created, it stays unchanged and we need to modify our items based on current situation
        if (this._addedMenuItems && this._addedMenuItems.length)
            this._addedMenuItems.forEach(i => i.destroy());

        this._addedMenuItems = [];

        if (this.app.get_n_windows()) {
            if (opt.APP_MENU_FORCE_QUIT) {
                const item = new PopupMenu.PopupMenuItem(_('Force Quit'));
                item.connect('activate', () => this.app.get_windows()[0].kill());
                this._menu.addMenuItem(item);
                this._addedMenuItems.push(item);
            }

            if (opt.APP_MENU_CLOSE_WINS_WS) {
                const nWin = this._getWindowsOnCurrentWs().length;
                if (nWin) {
                    const item = new PopupMenu.PopupMenuItem(_('Close %d Windows on Current Workspace').format(nWin));
                    item.connect('activate', () => {
                        const windows = this._getWindowsOnCurrentWs();
                        let time = global.get_current_time();
                        for (let win of windows) {
                        // increase time by 1 ms for each window to avoid errors from GS
                            win.delete(time++);
                        }
                    });
                    this._menu.addMenuItem(item);
                    this._addedMenuItems.push(item);
                }
            }

            const separator = new PopupMenu.PopupSeparatorMenuItem();
            this._menu.addMenuItem(separator);
            this._addedMenuItems.push(separator);

            if (opt.APP_MENU_MOVE_APP) {
                const item = new PopupMenu.PopupMenuItem(_('Move App to Current Workspace [Shift + Click]'));
                item.connect('activate', this._moveAppToCurrentWorkspace.bind(this));
                this._menu.addMenuItem(item);
                this._addedMenuItems.push(item);
                if (!this._windowsOnOtherWs())
                    item.setSensitive(false);
            }

            // WTMB (Windows Thumbnails) extension required
            if (opt.APP_MENU_WINDOW_TMB && global.windowThumbnails) {
                const item = new PopupMenu.PopupMenuItem(_('Create Window Thumbnail (PiP)'));
                item.connect('activate', () => global.windowThumbnails?.createThumbnail(this.app.get_windows()[0]));
                this._menu.addMenuItem(item);
                this._addedMenuItems.push(item);
            }
        }

        this.emit('menu-state-changed', true);

        this._menu.open(BoxPointer.PopupAnimation.FULL);
        this._menuManager.ignoreRelease();
        this.emit('sync-tooltip');

        return false;
    },

    _getWindowApp(metaWin) {
        const tracker = Shell.WindowTracker.get_default();
        return tracker.get_window_app(metaWin);
    },

    _getAppLastUsedWindow(app) {
        let recentWin;
        global.display.get_tab_list(Meta.TabList.NORMAL_ALL, null).forEach(metaWin => {
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

const DashIconCommon = {
    after__init() {
        if (opt.DASH_ICON_SCROLL && !Me.Util.dashNotDefault()) {
            this._scrollConId = this.connect('scroll-event', DashExtensions.onScrollEvent.bind(this));
            this._leaveConId = this.connect('leave-event', DashExtensions.onLeaveEvent.bind(this));
        }
    },

    popupMenu() {
        const side = opt.DASH_VERTICAL ? St.Side.LEFT : St.Side.BOTTOM;
        AppIconCommon.popupMenu.bind(this)(side);
    },

    _updateRunningDotStyle() {
        if (opt.RUNNING_DOT_STYLE)
            this._dot.add_style_class_name('app-grid-running-dot-custom');
        else
            this._dot.remove_style_class_name('app-grid-running-dot-custom');

        this._dot.translation_x = 0;
        // _updateDotStyle() has been added in GS 46.2 to apply translation_y value from the CSS on style change
        if (shellVersion46 && !this._updateDotStyle && !opt.DASH_VERTICAL)
            this._dot.translation_y = 8;

        // GS 46.0 (Ubuntu) only
        if (opt.DASH_VERTICAL)
            this._dot.translationY = 0;
    },

    _updateRunningStyle() {
        const currentWs = global.workspace_manager.get_active_workspace();
        const show = opt.DASH_ISOLATE_WS
            ? this.app.get_windows().filter(w => w.get_workspace() === currentWs).length
            : this.app.state !== Shell.AppState.STOPPED;

        if (show)
            this._dot.show();
        else
            this._dot.hide();
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
            return Clutter.EVENT_PROPAGATE;
        }

        if (Main.overview._overview.controls._stateAdjustment.value > 1)
            return Clutter.EVENT_PROPAGATE;

        let direction = Me.Util.getScrollDirection(event);
        if (direction === Clutter.ScrollDirection.UP)
            direction = 1;
        else if (direction === Clutter.ScrollDirection.DOWN)
            direction = -1;
        else
            return Clutter.EVENT_STOP;

        // avoid uncontrollable switching if smooth scroll wheel or trackpad is used
        if (this._lastScroll && Date.now() - this._lastScroll < 160)
            return Clutter.EVENT_STOP;

        this._lastScroll = Date.now();

        DashExtensions.switchWindow.bind(this)(direction);
        return Clutter.EVENT_STOP;
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
                if (opt.DASH_ISOLATE_WS) {
                    const currentWs = global.workspaceManager.get_active_workspace();
                    this._scrolledWindows = this._scrolledWindows.filter(w => w.get_workspace() === currentWs);
                }

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
                    this._scrolledWindows = Me.Util.getWindows(null);
                else
                    this._scrolledWindows = Me.Util.getWindows(global.workspace_manager.get_active_workspace());
            }
        }

        let windows = this._scrolledWindows;

        if (!windows.length)
            return;

        // if window selection is in the process, the previewed window must be the current one
        let currentWin  = this._selectedMetaWin ? this._selectedMetaWin : windows[0];

        const currentIdx = windows.indexOf(currentWin);
        let targetIdx = currentIdx;
        // const focusWindow = Me.Util.getWindows(null)[0]; // incompatible 45
        const focusWindow = Me.Util.getWindows(null)[0];
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
                            Main.wm.actionMoveWorkspace(metaWin.get_workspace());
                            if (_timeouts.wsSwitcherAnimation)
                                GLib.source_remove(_timeouts.wsSwitcherAnimation);
                            // setting window preview above siblings before workspace switcher animation has no effect
                            // we need to set the window above after the ws preview become visible on the screen
                            // the default switcher animation time is 250, 200 ms delay should be enough
                            _timeouts.wsSwitcherAnimation = GLib.timeout_add(0, 200 * St.Settings.get().slow_down_factor, () => {
                                windowPreview.get_parent().set_child_above_sibling(windowPreview, null);
                                _timeouts.wsSwitcherAnimation = 0;
                                return GLib.SOURCE_REMOVE;
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
                            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                        });
                    }
                });
            });
        });
    },
};

const AppMenuCommon = {
    _updateWindowsSection() {
        if (global.compositor) {
            if (this._updateWindowsLaterId) {
                const laters = global.compositor.get_laters();
                laters.remove(this._updateWindowsLaterId);
            }
        } else if (this._updateWindowsLaterId) {
            Meta.later_remove(this._updateWindowsLaterId);
        }

        this._updateWindowsLaterId = 0;

        this._windowSection.removeAll();
        this._openWindowsHeader.hide();

        if (!this._app)
            return;

        const minWindows = this._showSingleWindows ? 1 : 2;
        const currentWs = global.workspaceManager.get_active_workspace();
        const isolateWs = opt.DASH_ISOLATE_WS && !Main.overview.dash.showAppsButton.checked;
        const windows = this._app.get_windows().filter(w => !w.skip_taskbar && (isolateWs ? w.get_workspace() === currentWs : true));
        if (windows.length < minWindows)
            return;

        this._openWindowsHeader.show();

        windows.forEach(window => {
            const title = window.title || this._app.get_name();
            const item = this._windowSection.addAction(title, event => {
                Main.activateWindow(window, event.get_time());
            });
            window.connectObject('notify::title', () => {
                item.label.text = window.title || this._app.get_name();
            }, item);
        });
    },
};
