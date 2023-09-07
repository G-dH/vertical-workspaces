/**
 * V-Shell (Vertical Workspaces)
 * import.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2023
 * @license    GPL-3.0
 *
 */

'use strict';

var Gi;
var Ui;
var Misc;
var Me;
// gettext
var _;

function init(prefs = false) {
    importGi(prefs);
    importMisc(prefs);
    importMe(prefs);
    importUi(prefs);

    _ = Me.gettext;
    Me.Opt = new Me.Settings.Options(Gi, Misc, Me);
}

function cleanGlobals() {
    Gi      = null;
    Ui      = null;
    Misc    = null;
    Me      = null;
    _       = null;
}

function importGi(prefs = false) {
    Gi = {
        Gio:         imports.gi.Gio,
        GLib:        imports.gi.GLib,
        GObject:     imports.gi.GObject,
        Gdk:         imports.gi.Gdk,
        Gtk:         imports.gi.Gtk,
        Pango:       imports.gi.Pango,
    };

    if (!prefs) {
        Gi._Gi =        imports._gi;
        Gi.Atk =        imports.gi.Atk;
        Gi.Clutter =    imports.gi.Clutter;
        Gi.Graphene =   imports.gi.Graphene;
        Gi.Meta =       imports.gi.Meta;
        Gi.Shell =      imports.gi.Shell;
        Gi.St =         imports.gi.St;
    } else {
        Gi.Adw =         imports.gi.Adw;
    }
}

function importUi(prefs) {
    // ui files cannot be imported in prefs
    if (prefs)
        return;

    Ui = {
        AltTab:                  imports.ui.altTab,
        AppFavorites:            imports.ui.appFavorites,
        AppDisplay:              imports.ui.appDisplay,
        AppMenu:                 imports.ui.appMenu,
        Background:              imports.ui.background,
        BoxPointer:              imports.ui.boxpointer,
        Dash:                    imports.ui.dash,
        DND:                     imports.ui.dnd,
        IconGrid:                imports.ui.iconGrid,
        Layout:                  imports.ui.layout,
        Main:                    imports.ui.main,
        MessageTray:             imports.ui.messageTray,
        OsdWindow:               imports.ui.osdWindow,
        Overview:                imports.ui.overview,
        OverviewControls:        imports.ui.overviewControls,
        Panel:                   imports.ui.panel,
        PopupMenu:               imports.ui.popupMenu,
        Search:                  imports.ui.search,
        SwipeTracker:            imports.ui.swipeTracker,
        WindowAttentionHandler:  imports.ui.windowAttentionHandler,
        WindowManager:           imports.ui.windowManager,
        WindowPreview:           imports.ui.windowPreview,
        Workspace:               imports.ui.workspace,
        WorkspaceAnimation:      imports.ui.workspaceAnimation,
        WorkspaceSwitcherPopup:  imports.ui.workspaceSwitcherPopup,
        WorkspaceThumbnail:      imports.ui.workspaceThumbnail,
        WorkspacesView:          imports.ui.workspacesView,
    };
}

function importMisc(prefs) {
    Misc = {};
    Misc.Config = imports.misc.config;
    Misc.shellVersion = parseFloat(Misc.Config.PACKAGE_VERSION);
    Misc.ExtensionUtils = imports.misc.extensionUtils;
    if (!prefs)
        Misc.Util = imports.misc.util;
}

function importMe(prefs) {
    const ExtensionUtils = imports.misc.extensionUtils;
    const MyEx = ExtensionUtils.getCurrentExtension();
    Me = {};
    Me.imports = MyEx.imports;
    Me.metadata = MyEx.metadata;
    Me.gSettings = ExtensionUtils.getSettings(Me.metadata['settings-schema']);
    Me.Settings = MyEx.imports.lib.settings;
    Me.gettext = imports.gettext.domain(Me.metadata['gettext-domain']).gettext;
    Me.Util = MyEx.imports.lib.util;
    if (prefs) {
        Me.OptionsFactory = MyEx.imports.lib.optionsFactory;
        Me.AppDisplayOverride = MyEx.imports.lib.appDisplay;
    } else {
        Me.Modules = _importModules();
        Me.moduleList = _getModuleList();
        Me.WSP_PREFIX = Me.Modules.windowSearchProviderModule._PREFIX;
        // Me.RFSP_PREFIX = Me.Modules.recentFilesSearchProviderModule._PREFIX;
    }
}

function _importModules() {
    return {
        appDisplayModule:                   Me.imports.lib.appDisplay.AppDisplayModule,
        appFavoritesModule:                 Me.imports.lib.appFavorites.AppFavoritesModule,
        dashModule:                         Me.imports.lib.dash.DashModule,
        iconGridModule:                     Me.imports.lib.iconGrid.IconGridModule,
        layoutModule:                       Me.imports.lib.layout.LayoutModule,
        messageTrayModule:                  Me.imports.lib.messageTray.MessageTrayModule,
        osdWindowModule:                    Me.imports.lib.osdWindow.OsdWindowModule,
        overviewModule:                     Me.imports.lib.overview.OverviewModule,
        overlayKeyModule:                   Me.imports.lib.overlayKey.OverlayKeyModule,
        overviewControlsModule:             Me.imports.lib.overviewControls.OverviewControlsModule,
        panelModule:                        Me.imports.lib.panel.PanelModule,
        searchModule:                       Me.imports.lib.search.SearchModule,
        searchControllerModule:             Me.imports.lib.searchController.SearchControllerModule,
        swipeTrackerModule:                 Me.imports.lib.swipeTracker.SwipeTrackerModule,
        windowAttentionHandlerModule:       Me.imports.lib.windowAttentionHandler.WindowAttentionHandlerModule,
        windowManagerModule:                Me.imports.lib.windowManager.WindowManagerModule,
        windowPreviewModule:                Me.imports.lib.windowPreview.WindowPreviewModule,
        workspaceAnimationModule:           Me.imports.lib.workspaceAnimation.WorkspaceAnimationModule,
        workspaceModule:                    Me.imports.lib.workspace.WorkspaceModule,
        workspaceSwitcherPopupModule:       Me.imports.lib.workspaceSwitcherPopup.WorkspaceSwitcherPopupModule,
        workspaceThumbnailModule:           Me.imports.lib.workspaceThumbnail.WorkspaceThumbnailModule,
        workspacesViewModule:               Me.imports.lib.workspacesView.WorkspacesViewModule,
        windowSearchProviderModule:         Me.imports.lib.windowSearchProvider.WindowSearchProviderModule,
        // recentFilesSearchProviderModule:    Me.imports.lib.recentFilesSearchProvider.RecentFilesSearchProviderModule,
    };
}

function _getModuleList() {
    return Object.keys(Me.Modules);
}
