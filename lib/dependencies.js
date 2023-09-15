/**
 * V-Shell (Vertical Workspaces)
 * dependencies.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2023
 * @license    GPL-3.0
 *
 */

'use strict';

var Dependencies = class {
    constructor(prefs = false) {
        this.importGi(prefs);
        this.importMisc(prefs);
        this.importMe(prefs);
        this.importUi(prefs);

        this.Me.opt = new this.Me.Settings.Options(this.Gi, this.Misc, this.Me);
    }

    importGi(prefs = false) {
        this.Gi = {
            Gio:         imports.gi.Gio,
            GLib:        imports.gi.GLib,
            GObject:     imports.gi.GObject,
            Gdk:         imports.gi.Gdk,
            Gtk:         imports.gi.Gtk,
            Pango:       imports.gi.Pango,
        };

        if (!prefs) {
            this.Gi._Gi =        imports._gi;
            this.Gi.Atk =        imports.gi.Atk;
            this.Gi.Clutter =    imports.gi.Clutter;
            this.Gi.Graphene =   imports.gi.Graphene;
            this.Gi.Meta =       imports.gi.Meta;
            this.Gi.Shell =      imports.gi.Shell;
            this.Gi.St =         imports.gi.St;
        } else {
            this.Gi.Adw =         imports.gi.Adw;
        }
    }

    importUi(prefs) {
        // ui files cannot be imported in prefs
        if (prefs)
            return;

        this.Ui = {
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

    importMisc(prefs) {
        this.Misc = {};
        this.Misc.Config = imports.misc.config;
        this.Misc.shellVersion = parseFloat(this.Misc.Config.PACKAGE_VERSION);
        this.Misc.ExtensionUtils = imports.misc.extensionUtils;
        if (!prefs)
            this.Misc.Util = imports.misc.util;
    }

    importMe(prefs) {
        const ExtensionUtils = imports.misc.extensionUtils;
        const MyEx = ExtensionUtils.getCurrentExtension();
        this.Me = {};
        this.Me.imports = MyEx.imports;
        this.Me.metadata = MyEx.metadata;
        this.Me.gSettings = ExtensionUtils.getSettings(this.Me.metadata['settings-schema']);
        this.Me.Settings = MyEx.imports.lib.settings;
        this.Me.gettext = imports.gettext.domain(this.Me.metadata['gettext-domain']).gettext;
        this.Me.Util = MyEx.imports.lib.util;
        if (prefs) {
            this.Me.OptionsFactory = MyEx.imports.lib.optionsFactory;
            this.Me.AppDisplayOverride = MyEx.imports.lib.appDisplay;
        } else {
            this.Me.Modules = this._importModules();
            this.Me.moduleList = this._getModuleList();
            this.Me.WSP_PREFIX = this.Me.Modules.windowSearchProviderModule._PREFIX;
            // this.Me.RFSP_PREFIX = Me.Modules.recentFilesSearchProviderModule._PREFIX;
        }
    }

    _importModules() {
        return {
            appDisplayModule:                   this.Me.imports.lib.appDisplay.AppDisplayModule,
            appFavoritesModule:                 this.Me.imports.lib.appFavorites.AppFavoritesModule,
            dashModule:                         this.Me.imports.lib.dash.DashModule,
            iconGridModule:                     this.Me.imports.lib.iconGrid.IconGridModule,
            layoutModule:                       this.Me.imports.lib.layout.LayoutModule,
            messageTrayModule:                  this.Me.imports.lib.messageTray.MessageTrayModule,
            osdWindowModule:                    this.Me.imports.lib.osdWindow.OsdWindowModule,
            overviewModule:                     this.Me.imports.lib.overview.OverviewModule,
            overlayKeyModule:                   this.Me.imports.lib.overlayKey.OverlayKeyModule,
            overviewControlsModule:             this.Me.imports.lib.overviewControls.OverviewControlsModule,
            panelModule:                        this.Me.imports.lib.panel.PanelModule,
            searchModule:                       this.Me.imports.lib.search.SearchModule,
            searchControllerModule:             this.Me.imports.lib.searchController.SearchControllerModule,
            swipeTrackerModule:                 this.Me.imports.lib.swipeTracker.SwipeTrackerModule,
            windowAttentionHandlerModule:       this.Me.imports.lib.windowAttentionHandler.WindowAttentionHandlerModule,
            windowManagerModule:                this.Me.imports.lib.windowManager.WindowManagerModule,
            windowPreviewModule:                this.Me.imports.lib.windowPreview.WindowPreviewModule,
            workspaceAnimationModule:           this.Me.imports.lib.workspaceAnimation.WorkspaceAnimationModule,
            workspaceModule:                    this.Me.imports.lib.workspace.WorkspaceModule,
            workspaceSwitcherPopupModule:       this.Me.imports.lib.workspaceSwitcherPopup.WorkspaceSwitcherPopupModule,
            workspaceThumbnailModule:           this.Me.imports.lib.workspaceThumbnail.WorkspaceThumbnailModule,
            workspacesViewModule:               this.Me.imports.lib.workspacesView.WorkspacesViewModule,
            windowSearchProviderModule:         this.Me.imports.lib.windowSearchProvider.WindowSearchProviderModule,
            winTmbModule:                       this.Me.imports.lib.winTmb.WinTmbModule,
            // recentFilesSearchProviderModule:    this.Me.imports.lib.recentFilesSearchProvider.RecentFilesSearchProviderModule,
        };
    }

    _getModuleList() {
        return Object.keys(this.Me.Modules);
    }
};


