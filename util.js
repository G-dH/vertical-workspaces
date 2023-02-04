/**
 * Vertical Workspaces
 * util.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2023
 * @license    GPL-3.0
 * 
 */

'use strict';

const Gi = imports._gi;
const { Shell, Meta } = imports.gi;

const Config = imports.misc.config;
const Main =  imports.ui.main;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

var shellVersion = parseFloat(Config.PACKAGE_VERSION);

var Overrides = class {
    constructor() {
        this._overrides = {};
        this._injections = {};
    }

    addOverride(name, prototype, overrideList) {
        this._overrides[name] = {
            originals: this.overrideProto(prototype, overrideList),
            prototype,
        };
    }

    removeOverride(name) {
        const override = this._overrides[name];
        if (!override)
            return false;

        this.overrideProto(override.prototype, override.originals);
        this._overrides[name] = undefined;
        return true;
    }

    /*
    className.prototype
             .injections.funcName1
                        .funcName2
    */
    addInjection(className, prototype, injections) {
        if (!this._injections[className])
            this._injections[className] = {
                prototype,
                injections: {},
            };

        for (let name in injections) {
            this._injections[className].injections[name] = {
                original: this.injectToFunction(prototype, name, injections[name]),
            }
        }
    }

    removeInjection(className, funcName) {
        if (this._injections[className]) return false;
        const prototype = this._injections[className].prototype;

        const injection = this._injections[className].injections[funcName];
        if (!injection) return false;

        prototype[funcName] = injection.original;
        this._injections[funcName] = undefined;
        return true;
    }

    removeAll() {
        for (let name in this._overrides) {
            this.removeOverride(name);
            this._overrides[name] = undefined;
        }

        for (let className in this._injections) {
            const injt = this._injections[className];
            const prototype = injt.prototype;
            for (let funcName in injt.injections) {
                prototype[funcName] = injt.injections[funcName].original;
            }
            this._injections[className] = undefined;
        }
    }

    hookVfunc(proto, symbol, func) {
        proto[Gi.hook_up_vfunc_symbol](symbol, func);
    }

    overrideProto(proto, overrides) {
        const backup = {};

        for (let symbol in overrides) {
            if (symbol.startsWith('after_')) {
                const actualSymbol = symbol.slice('after_'.length);
                const fn = proto[actualSymbol];
                const afterFn = overrides[symbol]
                proto[actualSymbol] = function() {
                    const args = Array.prototype.slice.call(arguments);
                    const res = fn.apply(this, args);
                    afterFn.apply(this, args);
                    return res;
                };
                backup[actualSymbol] = fn;
            }
            else {
                backup[symbol] = proto[symbol];
                if (symbol.startsWith('vfunc')) {
                    if (shellVersion < 42) {
                        this.hookVfunc(proto, symbol.slice(6), overrides[symbol]);
                    } else {
                        this.hookVfunc(proto[Gi.gobject_prototype_symbol], symbol.slice(6), overrides[symbol]);
                    }
                }
                else {
                    proto[symbol] = overrides[symbol];
                }
            }
        }
        return backup;
    }

    injectToFunction(parent, name, func) {
        let origin = parent[name];
        parent[name] = function() {
            let ret;
            ret = origin.apply(this, arguments);
            func.apply(this, arguments);
            return ret;
        }

        return origin;
    }
}

//------- Common functions -----------------------------------------------------------------------

function getOverviewTranslations(opt, dash, tmbBox, searchEntryBin) {
    //const tmbBox = Main.overview._overview._controls._thumbnailsBox;
    let searchTranslation_y = 0;
    if (searchEntryBin.visible) {
        const offset = (dash.visible && (!opt.DASH_VERTICAL ? dash.height + 12 : 0))
            + (opt.WS_TMB_TOP ? tmbBox.height + 12 : 0);
        searchTranslation_y = - searchEntryBin.height - offset - 30;
    }

    let tmbTranslation_x = 0;
    let tmbTranslation_y = 0;
    let offset;
    if (tmbBox.visible) {
        switch (opt.WS_TMB_POSITION) {
            case 3: // left
                offset = 10 + ((dash?.visible && opt.DASH_LEFT) ? dash.width : 0);
                tmbTranslation_x = - tmbBox.width - offset;
                tmbTranslation_y = 0;
                break;
            case 1: // right
                offset = 10 + ((dash?.visible && opt.DASH_RIGHT) ? dash.width : 0);
                tmbTranslation_x = tmbBox.width + offset;
                tmbTranslation_y = 0;
                break;
            case 0: // top
                offset = 10 + ((dash?.visible && opt.DASH_TOP) ? dash.height : 0) + Main.panel.height;
                tmbTranslation_x = 0;
                tmbTranslation_y = - tmbBox.height - offset;
                break;
            case 2: // bottom
                offset = 10 + ((dash?.visible && opt.DASH_BOTTOM) ? dash.height : 0) + Main.panel.height;  // just for case the panel is at bottom
                tmbTranslation_x = 0;
                tmbTranslation_y = tmbBox.height + offset;
                break;
        }
    }

    let dashTranslation_x = 0;
    let dashTranslation_y = 0;
    let position = opt.DASH_POSITION;
    // if DtD replaced the original Dash, read its position
    if (dashIsDashToDock()) {
        position = dash._position;
    }
    if (dash?.visible) {
        switch (position) {
            case 0: // top
                dashTranslation_x = 0;
                dashTranslation_y = - dash.height - dash.margin_bottom - Main.panel.height;
                break;
            case 1: // right
                dashTranslation_x = dash.width;
                dashTranslation_y = 0;
                break;
            case 2: // bottom
                dashTranslation_x = 0;
                dashTranslation_y = dash.height + dash.margin_bottom + Main.panel.height;
                break;
            case 3: // left
                dashTranslation_x = - dash.width;
                dashTranslation_y = 0;
                break;
        }
    }

    return [tmbTranslation_x, tmbTranslation_y, dashTranslation_x, dashTranslation_y, searchTranslation_y];
}

function openPreferences() {
    const windows = global.display.get_tab_list(Meta.TabList.NORMAL_ALL, null);
    let tracker = Shell.WindowTracker.get_default();
    let metaWin, isVW = null;

    for (let win of windows) {
        const app = tracker.get_window_app(win);
        if (win.get_title().includes(Me.metadata.name) && app.get_name() === 'Extensions') {
            // this is our existing window
            metaWin = win;
            isVW = true;
            break;
        } else if (win.wm_class.includes('org.gnome.Shell.Extensions')) {
            // this is prefs window of another extension
            metaWin = win;
            isVW = false;
        }
    }

    if (metaWin && !isVW) {
        // other prefs window blocks opening another prefs window, so close it
        metaWin.delete(global.get_current_time());
    } else if (metaWin && isVW) {
        // if prefs window already exist, move it to the current WS and activate it
        metaWin.change_workspace(global.workspace_manager.get_active_workspace());
        metaWin.activate(global.get_current_time());
    }

    if (!metaWin || (metaWin && !isVW)) {
        try {
            Main.extensionManager.openExtensionPrefs(Me.metadata.uuid, '', {});
        } catch (e) {
            log(e);
        }
    }
}

function activateSearchProvider(prefix = '') {
    const searchEntry = Main.overview.searchEntry;
    if (!searchEntry.get_text() || !searchEntry.get_text().startsWith(prefix)) {
        prefix = _(prefix + ' ');
        const position = prefix.length;
        searchEntry.set_text(prefix);
        searchEntry.get_first_child().set_cursor_position(position);
        searchEntry.get_first_child().set_selection(position, position);
    } else {
        searchEntry.set_text('');
    }
}

function dashNotDefault() {
    return Main.overview.dash !== Main.overview._overview._controls.layoutManager._dash;
}

function dashIsDashToDock() {
    return Main.overview.dash._isHorizontal !== undefined;
}
