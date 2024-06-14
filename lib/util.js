/**
 * V-Shell (Vertical Workspaces)
 * util.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2024
 * @license    GPL-3.0
 *
 */

'use strict';

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { InjectionManager } from  'resource:///org/gnome/shell/extensions/extension.js';

let Me;
let _installedExtensions;

export function init(me) {
    Me = me;
}

export function cleanGlobals() {
    Me = null;
    _installedExtensions = null;
}

export class Overrides extends InjectionManager {
    constructor() {
        super();
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

        this.overrideProto(override.prototype, override.originals, name);
        delete this._overrides[name];
        return true;
    }

    removeAll() {
        for (let name in this._overrides) {
            this.removeOverride(name);
            delete this._overrides[name];
        }
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
            } else if (overrides[symbol] !== null) {
                backup[symbol] = proto[symbol];
                this._installMethod(proto, symbol, overrides[symbol]);
            }
        }
        return backup;
    }
}

export function openPreferences(metadata) {
    if (!metadata)
        metadata = Me.metadata;
    const windows = global.display.get_tab_list(Meta.TabList.NORMAL_ALL, null);
    let tracker = Shell.WindowTracker.get_default();
    let metaWin, isMe = null;

    for (let win of windows) {
        const app = tracker.get_window_app(win);
        if (win.get_title()?.includes(metadata.name) && app.get_name() === 'Extensions') {
            // this is our existing window
            metaWin = win;
            isMe = true;
            break;
        } else if (win.wm_class?.includes('org.gnome.Shell.Extensions')) {
            // this is prefs window of another extension
            metaWin = win;
            isMe = false;
        }
    }

    if (metaWin && !isMe) {
        // other prefs window blocks opening another prefs window, so close it
        metaWin.delete(global.get_current_time());
    } else if (metaWin && isMe) {
        // if prefs window already exist, move it to the current WS and activate it
        metaWin.change_workspace(global.workspace_manager.get_active_workspace());
        metaWin.activate(global.get_current_time());
    }

    if (!metaWin || (metaWin && !isMe)) {
        // delay to avoid errors if previous prefs window has been colsed
        GLib.idle_add(GLib.PRIORITY_LOW, () => {
            try {
                Main.extensionManager.openExtensionPrefs(metadata.uuid, '', {});
            } catch (e) {
                console.error(e);
            }
        });
    }
}

export function activateSearchProvider(prefix = '') {
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

export  function dashNotDefault() {
    return Main.overview.dash !== Main.overview._overview._controls.layoutManager._dash;
}

export function dashIsDashToDock() {
    return Main.overview.dash._isHorizontal !== undefined;
}

// Reorder Workspaces - callback for Dash and workspacesDisplay
export function reorderWorkspace(direction = 0) {
    let activeWs = global.workspace_manager.get_active_workspace();
    let activeWsIdx = activeWs.index();
    let targetIdx = activeWsIdx + direction;
    if (targetIdx > -1 && targetIdx < global.workspace_manager.get_n_workspaces())
        global.workspace_manager.reorder_workspace(activeWs, targetIdx);
}

export function activateKeyboardForWorkspaceView() {
    Main.ctrlAltTabManager._items.forEach(i => {
        if (i.sortGroup === 1 && i.name === 'Windows')
            Main.ctrlAltTabManager.focusGroup(i);
    });
}

export function exposeWindows(adjustment, activateKeyboard) {
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

export function isShiftPressed(state = null) {
    if (state === null)
        [,, state] = global.get_pointer();
    return (state & Clutter.ModifierType.SHIFT_MASK) !== 0;
}

export function isCtrlPressed(state = null) {
    if (state === null)
        [,, state] = global.get_pointer();
    return (state & Clutter.ModifierType.CONTROL_MASK) !== 0;
}

export function isAltPressed(state = null) {
    if (state === null)
        [,, state] = global.get_pointer();
    return (state & Clutter.ModifierType.MOD1_MASK) !== 0;
}

export function fuzzyMatch(term, text) {
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

export function strictMatch(term, text) {
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

export function isMoreRelevant(stringA, stringB, pattern) {
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

export function getEnabledExtensions(pattern = '') {
    let result = [];
    // extensionManager is unreliable at startup because it is uncertain whether all extensions have been loaded
    // also gsettings key can contain already removed extensions (user deleted them without disabling them first)
    // therefore we have to check what's really installed in the filesystem
    if (!_installedExtensions) {
        const extensionFiles = [...collectFromDatadirs('extensions', true)];
        _installedExtensions = extensionFiles.map(({ info }) => {
            let fileType = info.get_file_type();
            if (fileType !== Gio.FileType.DIRECTORY)
                return null;
            const uuid = info.get_name();
            return uuid;
        });
    }
    // _enabledExtensions contains content of the enabled-extensions key from gsettings, not actual state
    const enabled = Main.extensionManager._enabledExtensions;
    result = _installedExtensions.filter(ext => enabled.includes(ext));
    // _extensions contains already loaded extensions, so we can try to filter out broken or incompatible extensions
    const active = Main.extensionManager._extensions;
    result = result.filter(ext => {
        const extension = active.get(ext);
        if (extension)
            return ![3, 4].includes(extension.state); // 3 - ERROR, 4 - OUT_OF_TIME (not supported by shell-version in metadata)
        // extension can be enabled but not yet loaded, we just cannot see its state at this moment, so let it pass as enabled
        return true;
    });
    // return only extensions matching the search pattern
    return result.filter(uuid => uuid !== null && uuid.includes(pattern));
}

function* collectFromDatadirs(subdir, includeUserDir) {
    let dataDirs = GLib.get_system_data_dirs();
    if (includeUserDir)
        dataDirs.unshift(GLib.get_user_data_dir());

    for (let i = 0; i < dataDirs.length; i++) {
        let path = GLib.build_filenamev([dataDirs[i], 'gnome-shell', subdir]);
        let dir = Gio.File.new_for_path(path);

        let fileEnum;
        try {
            fileEnum = dir.enumerate_children('standard::name,standard::type',
                Gio.FileQueryInfoFlags.NONE, null);
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

export function getScrollDirection(event) {
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

export function getWindows(workspace) {
    // We ignore skip-taskbar windows in switchers, but if they are attached
    // to their parent, their position in the MRU list may be more appropriate
    // than the parent; so start with the complete list ...
    let windows = global.display.get_tab_list(Meta.TabList.NORMAL_ALL, workspace);
    // ... map windows to their parent where appropriate ...
    return windows.map(w => {
        return w.is_attached_dialog() ? w.get_transient_for() : w;
    // ... and filter out skip-taskbar windows and duplicates
    }).filter((w, i, a) => !w.skip_taskbar && a.indexOf(w) === i);
}

export function monitorHasLowResolution(monitorIndex, resolutionLimit) {
    resolutionLimit = resolutionLimit ?? 1200000;
    monitorIndex = monitorIndex ?? global.display.get_primary_monitor();
    const monitorGeometry = global.display.get_monitor_geometry(monitorIndex);
    const { scaleFactor } = St.ThemeContext.get_for_stage(global.stage);
    const monitorResolution = monitorGeometry.width * monitorGeometry.height;
    return (monitorResolution / scaleFactor) < resolutionLimit;
}
