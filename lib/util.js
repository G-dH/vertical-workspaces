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

let Gi;
let Ui;
let Misc;
let Me;

let _installedExtensions;

function init(gi, ui, misc, me) {
    Gi = gi;
    Ui = ui;
    Misc = misc;
    Me = me;
}

function cleanGlobals() {
    Gi = null;
    Ui = null;
    Misc = null;
    Me = null;
    _installedExtensions = null;
}

var Overrides = class {
    constructor() {
        this._overrides = {};
    }

    addOverride(name, prototype, overrideList) {
        const backup = this.overrideProto(prototype, overrideList, name);
        // don't update originals when override's just refreshing, keep initial content
        let originals = this._overrides[name]?.originals;
        if (!originals)
            originals = backup;
        this._overrides[name] = {
            originals,
            prototype,
        };
    }

    removeOverride(name) {
        const override = this._overrides[name];
        if (!override)
            return false;

        this.overrideProto(override.prototype, override.originals);
        delete this._overrides[name];
        return true;
    }

    removeAll() {
        for (let name in this._overrides) {
            this.removeOverride(name);
            delete this._overrides[name];
        }
    }

    hookVfunc(proto, symbol, func) {
        proto[Gi._Gi.hook_up_vfunc_symbol](symbol, func);
    }

    overrideProto(proto, overrides, name) {
        const backup = {};
        const originals = this._overrides[name]?.originals;
        for (let symbol in overrides) {
            if (symbol.startsWith('after_')) {
                const actualSymbol = symbol.slice('after_'.length);
                let fn;
                if (originals && originals[actualSymbol])
                    fn = originals[actualSymbol];
                else
                    fn = proto[actualSymbol];
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
                    if (Misc.shellVersion < 42)
                        this.hookVfunc(proto, symbol.slice(6), overrides[symbol]);
                    else
                        this.hookVfunc(proto[Gi._Gi.gobject_prototype_symbol], symbol.slice(6), overrides[symbol]);
                } else if (overrides[symbol] !== null) {
                    proto[symbol] = overrides[symbol];
                }
            }
        }
        return backup;
    }
};

function openPreferences() {
    const windows = global.display.get_tab_list(Gi.Meta.TabList.NORMAL_ALL, null);
    let tracker = Gi.Shell.WindowTracker.get_default();
    let metaWin, isVW = null;

    for (let win of windows) {
        const app = tracker.get_window_app(win);
        if (win.get_title()?.includes(Me.metadata.name) && app.get_name() === 'Extensions') {
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
            Ui.Main.extensionManager.openExtensionPrefs(Me.metadata.uuid, '', {});
        } catch (e) {
            log(e);
        }
    }
}

function activateSearchProvider(prefix = '') {
    const searchEntry = Ui.Main.overview.searchEntry;
    const searchEntryText = searchEntry.get_text();
    if (!searchEntryText || (searchEntryText && !searchEntry.get_text().startsWith(prefix))) {
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
    return Ui.Main.overview.dash !== Ui.Main.overview._overview._controls.layoutManager._dash;
}

function dashIsDashToDock() {
    return Ui.Main.overview.dash._isHorizontal !== undefined;
}

// Reorder Workspaces - callback for Dash and workspacesDisplay
function reorderWorkspace(direction = 0) {
    let activeWs = global.workspace_manager.get_active_workspace();
    let activeWsIdx = activeWs.index();
    let targetIdx = activeWsIdx + direction;
    if (targetIdx > -1 && targetIdx < global.workspace_manager.get_n_workspaces())
        global.workspace_manager.reorder_workspace(activeWs, targetIdx);
}

function activateKeyboardForWorkspaceView() {
    Ui.Main.ctrlAltTabManager._items.forEach(i => {
        if (i.sortGroup === 1 && i.name === 'Windows')
            Ui.Main.ctrlAltTabManager.focusGroup(i);
    });
}

function exposeWindows(adjustment, activateKeyboard) {
    // expose windows for static overview modes
    if (!adjustment.value/* && !Ui.Main.overview._animationInProgress*/) {
        if (adjustment.value === 0) {
            adjustment.value = 0;
            adjustment.ease(1, {
                duration: 200,
                mode: Gi.Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    if (activateKeyboard) {
                        Ui.Main.ctrlAltTabManager._items.forEach(i => {
                            if (i.sortGroup === 1 && i.name === 'Windows')
                                Ui.Main.ctrlAltTabManager.focusGroup(i);
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
    return (state & Gi.Clutter.ModifierType.SHIFT_MASK) !== 0;
}

function isCtrlPressed(state = null) {
    if (state === null)
        [,, state] = global.get_pointer();
    return (state & Gi.Clutter.ModifierType.CONTROL_MASK) !== 0;
}

function isAltPressed(state = null) {
    if (state === null)
        [,, state] = global.get_pointer();
    return (state & Gi.Clutter.ModifierType.MOD1_MASK) !== 0;
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

function getEnabledExtensions(pattern = '') {
    let result = [];
    // extensionManager is unreliable at startup (if not all extensions were loaded)
    // but gsettings key can contain removed extensions...
    // therefore we have to look into filesystem, what's really installed
    if (!_installedExtensions) {
        const extensionFiles = [...collectFromDatadirs('extensions', true)];
        _installedExtensions = extensionFiles.map(({ info }) => {
            let fileType = info.get_file_type();
            if (fileType !== Gi.Gio.FileType.DIRECTORY)
                return null;
            const uuid = info.get_name();
            return uuid;
        });
    }
    const enabled = Ui.Main.extensionManager._enabledExtensions;
    result = _installedExtensions.filter(ext => enabled.includes(ext));
    return result.filter(uuid => uuid !== null && uuid.includes(pattern));
}

function* collectFromDatadirs(subdir, includeUserDir) {
    let dataDirs = Gi.GLib.get_system_data_dirs();
    if (includeUserDir)
        dataDirs.unshift(Gi.GLib.get_user_data_dir());

    for (let i = 0; i < dataDirs.length; i++) {
        let path = Gi.GLib.build_filenamev([dataDirs[i], 'gnome-shell', subdir]);
        let dir = Gi.Gio.File.new_for_path(path);

        let fileEnum;
        try {
            fileEnum = dir.enumerate_children('standard::name,standard::type',
                Gi.Gio.FileQueryInfoFlags.NONE, null);
        } catch (e) {
            fileEnum = null;
        }
        if (fileEnum !== null) {
            let info;
            while ((info = fileEnum.next_file(null)))
                yield { dir: fileEnum.get_child(info), info };
        }
    }
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

    if (direction !== Gi.Clutter.ScrollDirection.SMOOTH)
        return direction;

    let [, delta] = event.get_scroll_delta();

    if (!delta)
        return null;

    direction = delta > 0 ? Gi.Clutter.ScrollDirection.DOWN : Gi.Clutter.ScrollDirection.UP;

    return direction;
}
