/**
 * V-Shell (Vertical Workspaces)
 * util.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2025
 * @license    GPL-3.0
 *
 */

'use strict';

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import { InjectionManager } from  'resource:///org/gnome/shell/extensions/extension.js';

let Me;
let _;
let _installedExtensions;

export function init(me) {
    Me = me;
    _ = Me.gettext;
}

export function cleanGlobals() {
    _removeMoveWinPreviewTimeout();

    Me = null;
    _ = null;
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

        if (name.startsWith('property_')) {
            const propertyName = name.slice('property_'.length);
            Object.defineProperty(override.prototype, propertyName, override);
        } else {
            this.overrideProto(override.prototype, override.originals, name);
        }

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
            } else if (symbol.startsWith('property_')) {
                const propertyName = symbol.slice('property_'.length);
                const fnName = Object.getOwnPropertyNames(overrides[symbol])[0];
                if (originals && originals[symbol])
                    backup[symbol] = originals[symbol];
                else
                    backup[symbol] = { [fnName]: Object.getOwnPropertyDescriptor(proto, propertyName)[fnName] };

                Object.defineProperty(proto, propertyName, overrides[symbol]);
            } else if (overrides[symbol] !== null) {
                backup[symbol] = proto[symbol];
                this._installMethod(proto, symbol, overrides[symbol]);
            }
        }
        return backup;
    }
}

// ///////////////////////////////////////////////////////////////////////////////////////////////////////////////

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
        // delay to avoid errors if previous prefs window has been closed
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
    const searchEntryText = searchEntry.get_text();
    if (!searchEntryText || (searchEntryText && !searchEntry.get_text().startsWith(prefix))) {
        prefix = `${prefix} `;
        const position = prefix.length;
        searchEntry.set_text(prefix);
        searchEntry.get_first_child().set_cursor_position(position);
        searchEntry.get_first_child().set_selection(position, position);
        searchEntry.grab_key_focus();
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
    // update scale and visibility of all workspace previews
    const workspacesViews = Main.overview._overview.controls._workspacesDisplay._workspacesViews;
    workspacesViews.forEach(v => {
        if (v._workspacesView) { // test whether it's a secondary monitor
            if (v._workspacesView._updateWorkspacesState) // which supports workspaces
                v._workspacesView._updateWorkspacesState(); // update workspace previews of the secondary monitor
        } else { // update workspace previews of the primary monitor
            v._updateWorkspacesState();
        }
    });
}

export function moveWindowsToMonitor(metaWindow, allAppWindows = false) {
    let windows;
    if (allAppWindows) {
        const tracker = Shell.WindowTracker.get_default();
        const app = tracker.get_window_app(metaWindow);
        windows = app.get_windows();
    } else {
        windows = [metaWindow];
    }
    if (!windows)
        return;

    const windowMonitor = metaWindow.get_monitor();
    // Priority is moving the windows to the monitor with the mouse pointer
    // but if it's the same as the current window monitor, move them to the next monitor
    const currentMonitor = global.display.get_current_monitor();
    const targetMonitor = windowMonitor !== currentMonitor
        ? currentMonitor
        : (windowMonitor + 1) % global.display.get_n_monitors();

    windows.forEach(win => {
        if (win.get_monitor() !== targetMonitor) {
            // some windows ignore this action if executed immediately after they are created
            GLib.idle_add(GLib.PRIORITY_LOW, () => {
                win.move_to_monitor(targetMonitor);
                // Some windows move slower than others so give it some time
                _removeMoveWinPreviewTimeout();
                Me.opt._moveWindowPreviewTimeout = GLib.timeout_add(GLib.PRIORITY_LOW, 100, () => {
                    selectWindowPreview(metaWindow.get_compositor_private(), targetMonitor);
                    Me.opt._moveWindowPreviewTimeout = 0;
                    return GLib.SOURCE_REMOVE;
                });
                return GLib.SOURCE_REMOVE;
            });
        }
    });
}

function _removeMoveWinPreviewTimeout() {
    if (Me.opt._moveWindowPreviewTimeout)
        GLib.source_remove(Me.opt._moveWindowPreviewTimeout);
    Me.opt._moveWindowPreviewTimeout = 0;
}

// Handle common actions for WorkspacesView and WindowPreview
export function handleOverviewTabKeyPress(event) {
    if (
        (isSuperPressed() && global.display.get_n_monitors() === 1) ||
        isCtrlPressed()
    ) {
        switchToNextWorkspace(event);
        return Clutter.EVENT_STOP;
    } else if (isAltPressed()) {
        focusDash();
        return Clutter.EVENT_STOP;
    }
    return Clutter.EVENT_PROPAGATE;
}

// In WINDOW_PICKER mode, enable keyboard navigation
// by focusing on the active window's preview
export function activateKeyboardForWorkspaceView(monitorIndex = Me.opt._activeMonitor) {
    if (!Main.overview._shown || !Me.opt.WORKSPACE_MODE)
        return;

    // Me.opt._activeMonitor is set to undefined when overview is closed
    const initialSelection = monitorIndex === undefined;
    const activeWorkspace = global.workspace_manager.get_active_workspace();
    const activeWorkspaceIndex = activeWorkspace.index();
    const selectFirst =
            !Me.opt.OVERVIEW_SELECT_WINDOW ||
            Me.opt.OVERVIEW_SELECT_FIRST_WINDOW;

    // Get meta windows for the current workspace in the MRU order
    let wsWindows = global.display.get_tab_list(0, activeWorkspace);

    // If monitorIndex is undefined, set it to the monitor of the last used window
    monitorIndex = monitorIndex ?? wsWindows[0]?.get_monitor();

    // Keep only windows from the current monitor
    wsWindows = wsWindows.filter(win => win.get_monitor() === monitorIndex);

    // Define function that sets windowActor for the first window of the particular monitor
    const setFirstWindowActorForMonitor = monitor => {
        const windows = getMonitorWindowPreviews(monitor, activeWorkspaceIndex);
        // The window list is reversed
        windowActor = windows[windows.length - 1]?._windowActor;
    };

    // Find actor of the window that should be selected
    let windowActor;
    if (wsWindows.length && !selectFirst) {
        if (!initialSelection || Me.opt.OVERVIEW_SELECT_CURRENT_WINDOW || (Me.opt.OVERVIEW_SELECT_PREVIOUS_WINDOW && !wsWindows[1]))
            windowActor = wsWindows[0].get_compositor_private();
        else if (Me.opt.OVERVIEW_SELECT_PREVIOUS_WINDOW && wsWindows[1])
            windowActor = wsWindows[1].get_compositor_private();
    } else if (selectFirst) {
        setFirstWindowActorForMonitor(monitorIndex);
    }

    if (selectWindowPreview(windowActor, monitorIndex)) {
        // Store the current monitor to opt
        // so we can prefer this monitor
        // after the workspace is switched
        Me.opt._activeMonitor = monitorIndex;
        return;
    }

    // If no window found on the current monitor, try to find window on another one
    const nMonitors = global.display.get_n_monitors();
    for (let monitor = 0; monitor < nMonitors; monitor++) {
        setFirstWindowActorForMonitor(monitor);
        if (selectWindowPreview(windowActor, monitor))
            return;
    }
}

// Get window previews for the monitor
export function getMonitorWindowPreviews(monitor, workspaceIndex) {
    let windows;
    const workspacesView = Main.overview._overview.controls._workspacesDisplay._workspacesViews[monitor];
    if (workspacesView._workspaces) // secondary monitor workspaces
        windows = workspacesView._workspaces[workspaceIndex]._windows;
    else if (workspacesView._workspacesView._workspace) // secondary monitor no workspaces
        windows = workspacesView._workspacesView._workspace._windows;
    else // primary monitor workspaces
        windows = workspacesView._workspacesView._workspaces[workspaceIndex]._windows;

    return windows;
};

// Find and select window preview on the current workspace overview
export function selectWindowPreview(windowActor, monitor) {
    if (!windowActor)
        return false;

    const workspaceIndex = global.workspace_manager.get_active_workspace().index();
    const windows = getMonitorWindowPreviews(monitor, workspaceIndex);
    for (const win of windows) {
        if (win._windowActor === windowActor) {
            win.grab_key_focus();
            win.showOverlay(true);
            win.removeOverlayTimeout();
            return true;
        }
    }
    return false;
}

export function switchToNextWorkspace(event) {
    resetInitialPointerX();

    let direction;
    if  (Me.Util.isShiftPressed(event.get_state()))
        direction = Me.opt.ORIENTATION ? Meta.MotionDirection.UP : Meta.MotionDirection.LEFT;
    else
        direction = Me.opt.ORIENTATION ? Meta.MotionDirection.DOWN : Meta.MotionDirection.RIGHT;
    const wsWrapAround = Me.opt.WS_WRAPAROUND;
    Me.opt.WS_WRAPAROUND = true;
    Me.opt.forceIgnoreLast = true;
    const currentWorkspace = global.workspace_manager.get_active_workspace();
    const nextWorkspace = currentWorkspace.get_neighbor(direction);
    nextWorkspace.activate(global.get_current_time());
    activateKeyboardForWorkspaceView();
    Me.opt.WS_WRAPAROUND = wsWrapAround;
    Me.opt.forceIgnoreLast = false;
}

export function resetInitialPointerX() {
    if (Me.opt.OVERVIEW_SELECT_WINDOW || Me.opt.OVERVIEW_MODE)
        Me.opt.initialPointerX = global.get_pointer()[0];
}

export function moveWindowToMonitorAndWorkspace(metaWindow, monitorIndex, wsIndex, insertNewWs, append = false) {
    resetInitialPointerX();
    const currentWs = global.workspaceManager.get_active_workspace();
    let workspace = global.workspaceManager.get_workspace_by_index(wsIndex);
    if (insertNewWs) {
        // If we insert a new workspace before the current, the target workspace needs to be updated
        wsIndex += metaWindow.get_workspace().index() > wsIndex ? 1 : 0;
        Main.wm.insertWorkspace(wsIndex);
        // Keep the affected workspaces alive until the window transfer is finished
        // because they could be automatically removed as empty
        workspace = global.workspaceManager.get_workspace_by_index(wsIndex);
        // Make the timeout longer and remove it manually when not needed
        Main.wm.keepWorkspaceAlive(workspace, 1000);
        Main.wm.keepWorkspaceAlive(currentWs, 1000);
    }

    // Wait for the new workspace allocation to prevent errors
    GLib.idle_add(GLib.PRIORITY_LOW, () => {
        if (!workspace)
            return;

        Main.moveWindowToMonitorAndWorkspace(
            metaWindow,
            monitorIndex,
            wsIndex,
            append // if true and the workspace doesn't exist, create it despite the fixed number of workspaces setting
        );
        GLib.idle_add(GLib.PRIORITY_LOW, () => {
            workspace.activate(global.get_current_time());
            GLib.idle_add(GLib.PRIORITY_LOW, () => {
                // Release the keep-alive lock
                _removeWorkspaceKeepAliveTimeout(currentWs);
                _removeWorkspaceKeepAliveTimeout(workspace);
                activateKeyboardForWorkspaceView();
            });
        });
    });
}

function _removeWorkspaceKeepAliveTimeout(workspace) {
    if (workspace._keepAliveId) {
        GLib.source_remove(workspace._keepAliveId);
        workspace._keepAliveId = 0;
    }
}

export function exposeWindows() {
    Main.overview._overview.controls._workspacesDisplay._workspacesViews.forEach(
        view => {
            view.exposeWindows();
        }
    );
}

export function exposeWindowsWithOverviewTransition() {
    // in OVERVIEW MODE 2 windows are not spread and workspace is not scaled
    // we need to repeat transition to the overview state 1 (window picker), but with spreading windows animation
    const stateAdjustment = Main.overview._overview.controls._stateAdjustment;
    Me.opt.WORKSPACE_MODE = 1;
    // setting value to 0 would reset WORKSPACE_MODE
    stateAdjustment.value = 0.01;
    stateAdjustment.ease(1, {
        duration: 200,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        onComplete: () => activateKeyboardForWorkspaceView(),
    });
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

export function isSuperPressed(state = null) {
    if (state === null)
        [,, state] = global.get_pointer();
    return (state & Clutter.ModifierType.MOD4_MASK) !== 0;
}

export function focusDash() {
    Main.ctrlAltTabManager._items.forEach(i => {
        if (i.sortGroup === 1 && i.name === 'Dash')
            Main.ctrlAltTabManager.focusGroup(i);
    });
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
        } catch {
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

// Untouched function from the original IconGrid module, unfortunately not exported
const APPICON_ANIMATION_OUT_SCALE = 3;
const APPICON_ANIMATION_OUT_TIME = 250;
export function zoomOutActorAtPos(actor, x, y) {
    const monitor = Main.layoutManager.findMonitorForActor(actor);
    if (!monitor)
        return;

    const actorClone = new Clutter.Clone({
        source: actor,
        reactive: false,
    });
    let [width, height] = actor.get_transformed_size();

    actorClone.set_size(width, height);
    actorClone.set_position(x, y);
    actorClone.opacity = 255;
    actorClone.set_pivot_point(0.5, 0.5);

    Main.uiGroup.add_child(actorClone);

    // Avoid monitor edges to not zoom outside the current monitor
    let scaledWidth = width * APPICON_ANIMATION_OUT_SCALE;
    let scaledHeight = height * APPICON_ANIMATION_OUT_SCALE;
    let scaledX = x - (scaledWidth - width) / 2;
    let scaledY = y - (scaledHeight - height) / 2;
    let containedX = Math.clamp(scaledX, monitor.x, monitor.x + monitor.width - scaledWidth);
    let containedY = Math.clamp(scaledY, monitor.y, monitor.y + monitor.height - scaledHeight);

    actorClone.ease({
        scale_x: APPICON_ANIMATION_OUT_SCALE,
        scale_y: APPICON_ANIMATION_OUT_SCALE,
        translation_x: containedX - scaledX,
        translation_y: containedY - scaledY,
        opacity: 0,
        duration: APPICON_ANIMATION_OUT_TIME,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        onComplete: () => actorClone.destroy(),
    });
}

// Close all windows on the given workspace and monitor
export function closeWorkspace(metaWorkspace, monitorIndex) {
    let windows = global.display.get_tab_list(0, metaWorkspace);
    // Remove windows from other monitors if monitorIndex is defined
    if (monitorIndex !== undefined) {
        windows = windows.filter(
            w => w.get_monitor() === monitorIndex
        );
    }

    for (let i = 0; i < windows.length; i++) {
        // Skip windows set as Always on Visible Workspace
        if (!windows[i].is_on_all_workspaces())
            windows[i].delete(global.get_current_time() + i);
    }
}

// /////////////////////////////////////////////////////////////////////////////////////////////
// Status dialog that appears during updating V-Shell configuration and blocks inputs

export const RestartMessage = GObject.registerClass({
    // Registered name should be unique
    GTypeName: `RestartMessage${Math.floor(Math.random() * 1000)}`,
}, class RestartMessage extends ModalDialog.ModalDialog {
    _init() {
        super._init({
            shellReactive: false,
            styleClass: 'restart-message headline update-message',
            shouldFadeIn: false,
            destroyOnClose: false,
        });

        const label = new St.Label({
            text: _('Updating V-Shell'),
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this.contentLayout.add_child(label);
        this.buttonLayout.hide();
        this.connect('destroy', () => this.removeMessage());
    }

    showMessage(timeout = 500) {
        if (this._timeoutId || Me._resetInProgress || Main.layoutManager._startingUp)
            return;
        this._removeTimeout();
        this.open();
        this._timeoutId = GLib.timeout_add(
            GLib.PRIORITY_LOW,
            timeout,
            () => {
                this._timeoutId = 0;
                this.removeMessage();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _removeTimeout() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }
    }

    removeMessage() {
        this._removeTimeout();
        this.close();
    }
});
