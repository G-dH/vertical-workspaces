/**
 * V-Shell (Vertical Workspaces)
 * util.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2023
 * @license    GPL-3.0
 *
 */

'use strict';

const Gi = imports._gi;
const { Shell, Meta, Clutter, St } = imports.gi;

const Config = imports.misc.config;
const Main =  imports.ui.main;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

var shellVersion = parseFloat(Config.PACKAGE_VERSION);

var Overrides = class {
    constructor() {
        this._overrides = {};
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

    removeAll() {
        for (let name in this._overrides) {
            this.removeOverride(name);
            this._overrides[name] = undefined;
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
                const afterFn = overrides[symbol];
                proto[actualSymbol] = function (...args) {
                    args = Array.prototype.slice.call(args);
                    const res = fn.apply(this, args);
                    afterFn.apply(this, args);
                    return res;
                };
                backup[actualSymbol] = fn;
            } else {
                backup[symbol] = proto[symbol];
                if (symbol.startsWith('vfunc')) {
                    if (shellVersion < 42)
                        this.hookVfunc(proto, symbol.slice(6), overrides[symbol]);
                    else
                        this.hookVfunc(proto[Gi.gobject_prototype_symbol], symbol.slice(6), overrides[symbol]);
                } else {
                    proto[symbol] = overrides[symbol];
                }
            }
        }
        return backup;
    }
};

function getOverviewTranslations(opt, dash, tmbBox, searchEntryBin) {
    // const tmbBox = Main.overview._overview._controls._thumbnailsBox;
    const animationsDisabled = !St.Settings.get().enable_animations || (opt.SHOW_WS_PREVIEW_BG && !opt.OVERVIEW_MODE2);
    if (animationsDisabled)
        return [0, 0, 0, 0, 0];

    let searchTranslationY = 0;
    if (searchEntryBin.visible) {
        const offset = (dash.visible && (!opt.DASH_VERTICAL ? dash.height + 12 : 0)) +
            (opt.WS_TMB_TOP ? tmbBox.height + 12 : 0);
        searchTranslationY = -searchEntryBin.height - offset - 30;
    }

    let tmbTranslationX = 0;
    let tmbTranslationY = 0;
    let offset;
    if (tmbBox.visible) {
        switch (opt.WS_TMB_POSITION) {
        case 3: // left
            offset = 10 + (dash?.visible && opt.DASH_LEFT ? dash.width : 0);
            tmbTranslationX = -tmbBox.width - offset;
            tmbTranslationY = 0;
            break;
        case 1: // right
            offset = 10 + (dash?.visible && opt.DASH_RIGHT ? dash.width : 0);
            tmbTranslationX = tmbBox.width + offset;
            tmbTranslationY = 0;
            break;
        case 0: // top
            offset = 10 + (dash?.visible && opt.DASH_TOP ? dash.height : 0) + Main.panel.height;
            tmbTranslationX = 0;
            tmbTranslationY = -tmbBox.height - offset;
            break;
        case 2: // bottom
            offset = 10 + (dash?.visible && opt.DASH_BOTTOM ? dash.height : 0) + Main.panel.height;  // just for case the panel is at bottom
            tmbTranslationX = 0;
            tmbTranslationY = tmbBox.height + offset;
            break;
        }
    }

    let dashTranslationX = 0;
    let dashTranslationY = 0;
    let position = opt.DASH_POSITION;
    // if DtD replaced the original Dash, read its position
    if (dashIsDashToDock())
        position = dash._position;

    if (dash?.visible) {
        switch (position) {
        case 0: // top
            dashTranslationX = 0;
            dashTranslationY = -dash.height - dash.margin_bottom - Main.panel.height;
            break;
        case 1: // right
            dashTranslationX = dash.width;
            dashTranslationY = 0;
            break;
        case 2: // bottom
            dashTranslationX = 0;
            dashTranslationY = dash.height + dash.margin_bottom + Main.panel.height;
            break;
        case 3: // left
            dashTranslationX = -dash.width;
            dashTranslationY = 0;
            break;
        }
    }

    return [dashTranslationX, dashTranslationY, tmbTranslationX, tmbTranslationY, searchTranslationY];
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
        } else if (win.wm_class?.includes('org.gnome.Shell.Extensions')) {
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
        prefix = `${prefix} `;
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

// Reorder Workspaces - callback for Dash and workspacesDisplay
function reorderWorkspace(direction = 0) {
    let activeWs = global.workspace_manager.get_active_workspace();
    let activeWsIdx = activeWs.index();
    let targetIdx = activeWsIdx + direction;
    if (targetIdx > -1 && targetIdx < global.workspace_manager.get_n_workspaces())
        global.workspace_manager.reorder_workspace(activeWs, targetIdx);
}

function exposeWindows(adjustment, activateKeyboard) {
    // expose windows for static overview modes
    if (!adjustment.value && !Main.overview._animationInProgress) {
        if (adjustment.value === 0) {
            adjustment.value = 0;
            adjustment.ease(1, {
                duration: 200,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    if (activateKeyboard) {
                        Main.ctrlAltTabManager._items.forEach(i => {
                            if (i.sortGroup === 1 && i.name === 'Windows')
                                Main.ctrlAltTabManager.focusGroup(i);
                        });
                    }
                },
            });
        }
    }
}

function isShiftPressed(state = null) {
    if (state === null)
        [,, state] = global.get_pointer();
    return (state & Clutter.ModifierType.SHIFT_MASK) !== 0;
}

function isCtrlPressed(state = null) {
    if (state === null)
        [,, state] = global.get_pointer();
    return (state & Clutter.ModifierType.CONTROL_MASK) !== 0;
}

function isAltPressed(state = null) {
    if (state === null)
        [,, state] = global.get_pointer();
    return (state & Clutter.ModifierType.MOD1_MASK) !== 0;
}

function fuzzyMatch(term, text) {
    let pos = -1;
    const matches = [];
    // convert all accented chars to their basic form and to lower case
    const _text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const _term =  term.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    // if term matches the substring exactly, gains the highest weight
    if (_text.includes(_term))
        return 0;

    for (let i = 0; i < _term.length; i++) {
        let c = _term[i];
        let p;
        if (pos > 0)
            p = _term[i - 1];
        while (true) {
            pos += 1;
            if (pos >= _text.length)
                return -1;

            if (_text[pos] === c) {
                matches.push(pos);
                break;
            } else if (_text[pos] === p) {
                matches.pop();
                matches.push(pos);
            }
        }
    }

    // add all position to get a weight of the result
    // results closer to the beginning of the text and term characters closer to each other will gain more weight.
    return matches.reduce((r, p) => r + p) - matches.length * matches[0] + matches[0];
}

function strictMatch(term, text) {
    // remove diacritics and accents from letters
    let s = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    let p = term.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    let ps = p.split(/ +/);

    // allows to use multiple exact patterns separated by a space in arbitrary order
    for (let w of ps) {  // escape regex control chars
        if (!s.match(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
            return -1;
    }
    return 0;
}

function isMoreRelevant(stringA, stringB, pattern) {
    let regex = /[^a-zA-Z\d]/;
    let strSplitA = stringA.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(regex);
    let strSplitB = stringB.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(regex);
    let aAny = false;
    strSplitA.forEach(w => {
        aAny = aAny || w.startsWith(pattern);
    });
    let bAny = false;
    strSplitB.forEach(w => {
        bAny = bAny || w.startsWith(pattern);
    });

    // if both strings contain a word that starts with the pattern
    // prefer the one whose first word starts with the pattern
    if (aAny && bAny)
        return !strSplitA[0].startsWith(pattern) && strSplitB[0].startsWith(pattern);
    else
        return !aAny && bAny;
}

function getEnabledExtensions(uuid = '') {
    let extensions = [];
    // extensionManager is unreliable on startup
    // but settings key can contain removed extensions...
    // Main.extensionManager._extensions.forEach(e => {
    global.settings.get_strv('enabled-extensions').forEach(e => {
        // if (e.state === 1 && e.uuid.includes(uuid))
        if (e.includes(uuid))
            extensions.push(e);
    });
    return extensions;
}

function getScrollDirection(event) {
    // scroll wheel provides two types of direction information:
    // 1. Clutter.ScrollDirection.DOWN / Clutter.ScrollDirection.UP
    // 2. Clutter.ScrollDirection.SMOOTH + event.get_scroll_delta()
    // first SMOOTH event returns 0 delta,
    //  so we need to always read event.direction
    //  since mouse without smooth scrolling provides exactly one SMOOTH event on one wheel rotation click
    // on the other hand, under X11, one wheel rotation click sometimes doesn't send direction event, only several SMOOTH events
    // so we also need to convert the delta to direction
    let direction = event.get_scroll_direction();

    if (direction !== Clutter.ScrollDirection.SMOOTH)
        return direction;

    let [, delta] = event.get_scroll_delta();

    if (!delta)
        return null;

    direction = delta > 0 ? Clutter.ScrollDirection.DOWN : Clutter.ScrollDirection.UP;

    return direction;
}
