/**
 * V-Shell (Vertical Workspaces)
 * workspaceThumbnail.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2025
 * @license    GPL-3.0
 *
 */

'use strict';

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as AppDisplay from 'resource:///org/gnome/shell/ui/appDisplay.js';
import * as OverviewControls from 'resource:///org/gnome/shell/ui/overviewControls.js';
import * as WorkspaceThumbnail from 'resource:///org/gnome/shell/ui/workspaceThumbnail.js';
import * as Background from 'resource:///org/gnome/shell/ui/background.js';
import { TransientSignalHolder } from 'resource:///org/gnome/shell/misc/signalTracker.js';

let Me;
let opt;

const ThumbnailState = {
    NEW:            0,
    EXPANDING:      1,
    EXPANDED:       2,
    ANIMATING_IN:   3,
    NORMAL:         4,
    REMOVING:       5,
    ANIMATING_OUT:  6,
    ANIMATED_OUT:   7,
    COLLAPSING:     8,
    DESTROYED:      9,
};

const ControlsState = OverviewControls.ControlsState;

const WORKSPACE_CUT_SCALE = 0.15;
const WORKSPACE_KEEP_ALIVE_TIME = 100;

export const WorkspaceThumbnailModule = class {
    constructor(me) {
        Me = me;
        opt = Me.opt;

        this._firstActivation = true;
        this.moduleEnabled = false;
        this._overrides = null;
    }

    cleanGlobals() {
        Me = null;
        opt = null;
    }

    update(reset) {
        this.moduleEnabled = true;
        const conflict = false;

        reset = reset || !this.moduleEnabled || conflict;

        // don't touch the original code if module disabled
        if (reset && !this._firstActivation) {
            this._disableModule();
        } else if (!reset) {
            this._firstActivation = false;
            this._activateModule();
        }
        if (reset && this._firstActivation)
            console.debug('  WorkspaceThumbnailModule - Keeping untouched');
    }

    _activateModule() {
        if (!this._overrides)
            this._overrides = new Me.Util.Overrides();

        // don't limit max thumbnail scale for other clients than overview, specifically AATWS.
        // this variable is not yet implemented in 45.beta.1

        this._overrides.addOverride('WorkspaceThumbnail', WorkspaceThumbnail.WorkspaceThumbnail.prototype, WorkspaceThumbnailCommon);
        this._overrides.addOverride('ThumbnailsBoxCommon', WorkspaceThumbnail.ThumbnailsBox.prototype, ThumbnailsBoxCommon);
        this._overrides.addOverride('WindowClone', WorkspaceThumbnail.WindowClone.prototype, WindowClone);

        // replacing opt.ORIENTATION local constant with boxOrientation internal variable allows external customers such as the AATWS extension to control the box orientation.
        Main.overview._overview.controls._thumbnailsBox._boxOrientation = opt.ORIENTATION;

        console.debug('  WorkspaceThumbnailModule - Activated');
    }

    _disableModule() {
        if (this._overrides)
            this._overrides.removeAll();
        this._overrides = null;

        console.debug('  WorkspaceThumbnailModule - Disabled');
    }
};

const WorkspaceThumbnailCommon = {
    // Injection to _init()
    after__init() {
        // layout manager allows aligning widget children
        this.layout_manager = new Clutter.BinLayout();
        // Adding layout manager to tmb widget breaks wallpaper background aligning and rounded corners
        // unless border is removed

        this.add_style_class_name(opt.SHOW_WS_TMB_BG
            ? 'ws-tmb-labeled'
            : 'ws-tmb-transparent'
        );

        // Add workspace thumbnails labels if enabled
        if (opt.SHOW_WST_LABELS)
            this._addLabel();

        if (opt.CLOSE_WS_BUTTON_MODE) {
            const closeButton = new St.Icon({
                style_class: 'workspace-close-button',
                icon_name: 'window-close-symbolic',
                x_align: Clutter.ActorAlign.END,
                y_align: Clutter.ActorAlign.START,
                x_expand: true,
                y_expand: true,
                reactive: true,
                opacity: 0,
            });

            closeButton.connect('button-release-event', () => {
                if (opt.CLOSE_WS_BUTTON_MODE) {
                    this._closeWorkspace();
                    return Clutter.EVENT_STOP;
                } else {
                    return Clutter.EVENT_PROPAGATE;
                }
            });

            closeButton.connect('button-press-event', () => {
                return Clutter.EVENT_STOP;
            });

            closeButton.connect('enter-event', () => {
                closeButton.opacity = 255;
                if (!Meta.prefs_get_dynamic_workspaces() || (Meta.prefs_get_dynamic_workspaces() && global.workspace_manager.get_n_workspaces() - 1 !== this.metaWorkspace.index())) {
                    // color the button red if ready to react on clicks
                    if (opt.CLOSE_WS_BUTTON_MODE < 3 || (opt.CLOSE_WS_BUTTON_MODE === 3 && Me.Util.isCtrlPressed()))
                        closeButton.add_style_class_name('workspace-close-button-hover');
                }
            });

            closeButton.connect('leave-event', () => {
                closeButton.remove_style_class_name('workspace-close-button-hover');
            });

            this.add_child(closeButton);
            this._closeButton = closeButton;

            this.reactive = true;
            this._lastCloseClickTime = 0;
        }

        this.connect('enter-event', () => {
            if (opt.CLOSE_WS_BUTTON_MODE && (!Meta.prefs_get_dynamic_workspaces() || (Meta.prefs_get_dynamic_workspaces() && global.workspace_manager.get_n_workspaces() - 1 !== this.metaWorkspace.index())))
                this._closeButton.opacity = 200;
            if (opt.SHOW_WST_LABELS_ON_HOVER) {
                this._wsLabel.ease({
                    duration: 100,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    opacity: this._wsLabel._maxOpacity,
                });
            }
        });

        this.connect('leave-event', () => {
            this._closeButton.opacity = 0;
            if (opt.SHOW_WST_LABELS_ON_HOVER) {
                this._wsLabel.ease({
                    duration: 100,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    opacity: 0,
                });
            }
        });

        if (opt.SHOW_WS_TMB_BG) {
            const backgroundGroup = new Meta.BackgroundGroup();
            this._bgManager = new Background.BackgroundManager({
                monitorIndex: this.monitorIndex,
                container: backgroundGroup,
                vignette: false,
                controlPosition: false,
            });

            this._viewport.add_child(backgroundGroup);
            this._viewport.set_child_below_sibling(backgroundGroup, null);

            // full brightness of the thumbnail bg draws unnecessary attention
            // there is a grey bg under the wallpaper
            // this._bgManager.backgroundActor.opacity = 220;
        }

        this.connect('destroy', () => {
            if (this._wsIndexConId)
                this.metaWorkspace.disconnect(this._wsIndexConId);

            if (this._nWindowsConId)
                this.metaWorkspace.disconnect(this._nWindowsConId);

            this._removeLabelTimeout();
            this._bgManager?.destroy();
        });
    },

    _addLabel() {
        this._wsLabel = new St.Label({
            style_class: 'ws-tmb-label',
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.END,
            x_expand: true,
            y_expand: true,
        });

        this._wsLabel._maxOpacity = 255;
        this._wsLabel.opacity = this._wsLabel._maxOpacity;

        this.add_child(this._wsLabel);
        this.set_child_above_sibling(this._wsLabel, null);

        this._wsIndexConId = this.metaWorkspace.connect('notify::workspace-index',
            () => this._updateLabel()
        );
        this._nWindowsConId = this.metaWorkspace.connect('notify::n-windows',
            () => this._updateLabel()
        );

        this._updateLabel(1);

        if (opt.SHOW_WST_LABELS_ON_HOVER)
            this._wsLabel.opacity = 0;
    },

    _updateLabel(delay = 300) {
        // Ignore if the thumbnail is being destroyed
        if (this.state > ThumbnailState.NORMAL)
            return;

        this._removeLabelTimeout();

        this._updateLabelTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            // Wait until the thumbnail is ready
            if (this.state !== ThumbnailState.NORMAL)
                return GLib.SOURCE_CONTINUE;

            this._setLabel();

            this._updateLabelTimeout = 0;
            return GLib.SOURCE_REMOVE;
        });
    },

    _removeLabelTimeout() {
        if (this._updateLabelTimeout)
            GLib.source_remove(this._updateLabelTimeout);
        this._updateLabelTimeout = 0;
    },

    _setLabel() {
        const wsIndex = this.metaWorkspace.index();
        let label = `${wsIndex + 1}`;
        if (opt.SHOW_WST_LABELS === 2) { // 2 - index + workspace name
            const settings = new Gio.Settings({ schema_id: 'org.gnome.desktop.wm.preferences' });
            const wsLabels = settings.get_strv('workspace-names');
            if (wsLabels.length > wsIndex && wsLabels[wsIndex])
                label += `: ${wsLabels[wsIndex]}`;
        } else if (opt.SHOW_WST_LABELS === 3) { // 3- index + app name
            // global.display.get_tab_list offers workspace filtering using the second argument, but...
            // ... it sometimes includes windows from other workspaces, like minimized VBox machines, after Shell restarts
            const metaWin = global.display.get_tab_list(0, null).filter(
                w => w.get_monitor() === this.monitorIndex && w.get_workspace().index() === wsIndex)[0];

            if (metaWin) {
                const tracker = Shell.WindowTracker.get_default();
                const app = tracker.get_window_app(metaWin);
                label += `: ${app ? app.get_name() : ''}`;
            }
        } else if (opt.SHOW_WST_LABELS === 4) {
            const metaWin = global.display.get_tab_list(0, null).filter(
                w => w.get_monitor() === this.monitorIndex && w.get_workspace().index() === wsIndex)[0];

            if (metaWin)
                label += `: ${metaWin.title}`;
        }

        this._wsLabel.text = label;
    },

    _closeWorkspace() {
        // CLOSE_WS_BUTTON_MODE 1: single click, 2: double-click, 3: Ctrl
        if (opt.CLOSE_WS_BUTTON_MODE === 2) {
            const doubleClickTime = Clutter.Settings.get_default().double_click_time;
            const clickDelay = Date.now() - this._lastCloseClickTime;
            if (clickDelay > doubleClickTime) {
                this._lastCloseClickTime = Date.now();
                return;
            }
        } else if (opt.CLOSE_WS_BUTTON_MODE === 3 && !Me.Util.isCtrlPressed()) {
            return;
        }

        Me.Util.closeWorkspace(this.metaWorkspace, this.monitorIndex);
    },

    activate(time) {
        if (this.state > ThumbnailState.NORMAL)
            return;

        // if Static Workspace overview mode active, a click on the already active workspace should activate the window picker mode
        const wsIndex = this.metaWorkspace.index();
        const lastWsIndex = global.display.get_workspace_manager().get_n_workspaces() - 1;
        const stateAdjustment = Main.overview._overview.controls._stateAdjustment;

        if (stateAdjustment.value === ControlsState.APP_GRID) {
            if (this.metaWorkspace.active) {
                Main.overview._overview.controls._shiftState(Meta.MotionDirection.DOWN);
                // if searchActive, hide it immediately
                Main.overview.searchEntry.set_text('');
            } else {
                this.metaWorkspace.activate(time);
            }
        } else if (opt.OVERVIEW_MODE2 && !opt.WORKSPACE_MODE && wsIndex <= lastWsIndex) {
            if (stateAdjustment.value > 1)
                stateAdjustment.value = 1;

            if (this.metaWorkspace.active) {
                Me.Util.exposeWindowsWithOverviewTransition();
            } else {
                // switch ws
                this.metaWorkspace.activate(time);
            }
            // a click on the current workspace should go back to the main view
        } else if (this.metaWorkspace.active) {
            Main.overview.hide();
        } else {
            this.metaWorkspace.activate(time);
        }
    },

    // Draggable target interface used only by ThumbnailsBox
    handleDragOverInternal(source, actor, time) {
        if (source === Main.xdndHandler) {
            this.metaWorkspace.activate(time);
            return DND.DragMotionResult.CONTINUE;
        }

        if (this.state > ThumbnailState.NORMAL)
            return DND.DragMotionResult.CONTINUE;

        if (source.metaWindow &&
                !this._isMyWindow(source.metaWindow.get_compositor_private()))
            return DND.DragMotionResult.MOVE_DROP;
        if (source.app && source.app.can_open_new_window())
            return DND.DragMotionResult.COPY_DROP;
        if (!source.app && source.shellWorkspaceLaunch)
            return DND.DragMotionResult.COPY_DROP;

        if (source instanceof AppDisplay.FolderIcon)
            return DND.DragMotionResult.COPY_DROP;


        return DND.DragMotionResult.CONTINUE;
    },

    acceptDropInternal(source, actor, time) {
        if (this.state > ThumbnailState.NORMAL)
            return false;

        if (source.metaWindow) {
            let win = source.metaWindow.get_compositor_private();
            if (this._isMyWindow(win))
                return false;

            let metaWindow = win.get_meta_window();
            Main.moveWindowToMonitorAndWorkspace(metaWindow,
                this.monitorIndex, this.metaWorkspace.index());
            return true;
        } else if (source.app && source.app.can_open_new_window()) {
            if (source.animateLaunchAtPos)
                source.animateLaunchAtPos(actor.x, actor.y);

            source.app.open_new_window(this.metaWorkspace.index());
            return true;
        } else if (!source.app && source.shellWorkspaceLaunch) {
            // While unused in our own drag sources, shellWorkspaceLaunch allows
            // extensions to define custom actions for their drag sources.
            // V-Shell only adds actor to the dictionary
            // so the shellWorkspaceLaunch() can get the position of the dragged clone
            source.shellWorkspaceLaunch({
                workspace: this.metaWorkspace.index(),
                timestamp: time,
                actor,
            });
            return true;
        }

        return false;
    },
};

const ThumbnailsBoxCommon = {
    after__init(scrollAdjustment, monitorIndex, orientation = opt.ORIENTATION) {
        this._boxOrientation = orientation;
        // Block propagation of the button-release-event
        this.connect('button-release-event', () => Clutter.EVENT_STOP);
    },

    fixThumbnailsIfNeeded(force = false) {
        let thumbnailsBroken = false;
        this._thumbnails.forEach(t => {
            // Corrupted thumbnails has workspace index set to -1
            if (t.metaWorkspace.index() < 0)
                thumbnailsBroken = true;
        });

        if (!force && !thumbnailsBroken)
            return;

        this._destroyThumbnails();
        this._createThumbnails();
    },

    _activateThumbnailAtPoint(stageX, stageY, time, activateCurrent = false) {
        if (activateCurrent) {
            const thumbnail = this._thumbnails.find(t => t.metaWorkspace.active);
            if (thumbnail)
                thumbnail.activate(time);
            return;
        }
        const [r_, x, y] = this.transform_stage_point(stageX, stageY);

        let thumbnail;

        if (this._boxOrientation)
            thumbnail = this._thumbnails.find(t => y >= t.y && y <= t.y + t.height);
        else
            thumbnail = this._thumbnails.find(t => x >= t.x && x <= t.x + t.width);

        if (thumbnail)
            thumbnail.activate(time);
    },

    acceptDrop(source, actor, x, y, time) {
        if (this._dropWorkspace !== -1) {
            return this._thumbnails[this._dropWorkspace].acceptDropInternal(source, actor, time);
        } else if (this._dropPlaceholderPos !== -1) {
            if (!source.metaWindow &&
                (!source.app || !source.app.can_open_new_window()) &&
                (source.app || !source.shellWorkspaceLaunch) &&
                !(source instanceof AppDisplay.FolderIcon))
                return false;

            let isWindow = !!source.metaWindow;

            let newWorkspaceIndex;
            [newWorkspaceIndex, this._dropPlaceholderPos] = [this._dropPlaceholderPos, -1];
            this._spliceIndex = newWorkspaceIndex;

            Main.wm.insertWorkspace(newWorkspaceIndex);

            if (isWindow) {
                // Move the window to our monitor first if necessary.
                let thumbMonitor = this._thumbnails[newWorkspaceIndex].monitorIndex;
                Main.moveWindowToMonitorAndWorkspace(source.metaWindow,
                    thumbMonitor, newWorkspaceIndex, true);
            } else if (source.app && source.app.can_open_new_window()) {
                if (source.animateLaunchAtPos)
                    source.animateLaunchAtPos(actor.x, actor.y);

                source.app.open_new_window(newWorkspaceIndex);
            } else if (!source.app && source.shellWorkspaceLaunch) {
                // While unused in our own drag sources, shellWorkspaceLaunch allows
                // extensions to define custom actions for their drag sources.
                // V-Shell only adds actor to the dictionary
                // so the shellWorkspaceLaunch() can get the position of the dragged clone
                source.shellWorkspaceLaunch({
                    workspace: newWorkspaceIndex,
                    timestamp: time,
                    actor,
                });
            }

            if (source.app || (!source.app && source.shellWorkspaceLaunch)) {
                // This new workspace will be automatically removed if the application fails
                // to open its first window within some time, as tracked by Shell.WindowTracker.
                // Here, we only add a very brief timeout to avoid the _immediate_ removal of the
                // workspace while we wait for the startup sequence to load.
                let workspaceManager = global.workspace_manager;
                Main.wm.keepWorkspaceAlive(workspaceManager.get_workspace_by_index(newWorkspaceIndex),
                    WORKSPACE_KEEP_ALIVE_TIME);
            }

            // Start the animation on the workspace (which is actually
            // an old one which just became empty)
            let thumbnail = this._thumbnails[newWorkspaceIndex];
            this._setThumbnailState(thumbnail, ThumbnailState.NEW);
            thumbnail.slide_position = 1;
            thumbnail.collapse_fraction = 1;

            this._queueUpdateStates();

            return true;
        } else {
            return false;
        }
    },

    handleDragOver(source, actor, x, y, time) {
        // switch axis for vertical orientation
        if (this._boxOrientation)
            x = y;

        if (!source.metaWindow &&
            (!source.app || !source.app.can_open_new_window()) &&
            (source.app || !source.shellWorkspaceLaunch) &&
            source !== Main.xdndHandler && !(source instanceof AppDisplay.FolderIcon))
            return DND.DragMotionResult.CONTINUE;

        const rtl = Clutter.get_default_text_direction() === Clutter.TextDirection.RTL;
        let canCreateWorkspaces = Meta.prefs_get_dynamic_workspaces();
        let spacing = this.get_theme_node().get_length('spacing');

        this._dropWorkspace = -1;
        let placeholderPos = -1;
        let length = this._thumbnails.length;
        for (let i = 0; i < length; i++) {
            const index = rtl ? length - i - 1 : i;

            if (canCreateWorkspaces && source !== Main.xdndHandler) {
                const [targetStart, targetEnd] =
                    this._getPlaceholderTarget(index, spacing, rtl);

                if (x > targetStart && x <= targetEnd) {
                    placeholderPos = index;
                    break;
                }
            }

            if (this._withinWorkspace(x, index, rtl)) {
                this._dropWorkspace = index;
                break;
            }
        }

        if (this._dropPlaceholderPos !== placeholderPos) {
            this._dropPlaceholderPos = placeholderPos;
            this.queue_relayout();
        }

        if (this._dropWorkspace !== -1)
            return this._thumbnails[this._dropWorkspace].handleDragOverInternal(source, actor, time);
        else if (this._dropPlaceholderPos !== -1)
            return source.metaWindow ? DND.DragMotionResult.MOVE_DROP : DND.DragMotionResult.COPY_DROP;
        else
            return DND.DragMotionResult.CONTINUE;
    },

    _createThumbnails() {
        if (this._thumbnails.length > 0)
            return;

        const { workspaceManager } = global;
        this._transientSignalHolder = new TransientSignalHolder(this);
        workspaceManager.connectObject(
            'notify::n-workspaces', this._workspacesChanged.bind(this),
            'active-workspace-changed', () => this._updateIndicator(),
            'workspaces-reordered', () => {
                this._animateReorder();
            }, this._transientSignalHolder);
        Main.overview.connectObject('windows-restacked',
            this._syncStacking.bind(this), this._transientSignalHolder);

        this._targetScale = 0;
        this._scale = 0;
        this._pendingScaleUpdate = false;
        this._unqueueUpdateStates();

        this._stateCounts = {};
        for (let key in ThumbnailState)
            this._stateCounts[ThumbnailState[key]] = 0;

        this.addThumbnails(0, workspaceManager.n_workspaces);

        this._updateShouldShow();
    },

    _animateReorder() {
        // Store the original position of each thumbnail
        // so it can be used while thumbnails are still transitioning
        // from the previous reorder.
        if (!this._thumbnailsPositionMap) {
            this._thumbnailsPositionMap = [];
            this._thumbnails.forEach(tmb =>
                // For some reason the affected thumbnails returns zero position in the thumbnailsBox.
                // Therefore we have to get absolute position on the screen.
                this._thumbnailsPositionMap.push(tmb.get_transformed_position())
            );
        }

        this._thumbnails.forEach((tmb, index, thumbnails) => {
            const newPosition = tmb.metaWorkspace.index();
            // The thumbnail of the workspace being reordered should remain on top during the transition.
            if (tmb.metaWorkspace.active)
                tmb.get_parent().set_child_below_sibling(tmb, this._indicator);
            if (index !== newPosition) {
                let [newX, newY] = this._thumbnailsPositionMap[newPosition];
                let [x, y] = this._thumbnailsPositionMap[index];
                tmb.ease({
                    duration: 250,
                    translation_x: newX - x,
                    translation_y: newY - y,
                    onComplete: () => {
                        delete this._thumbnailsPositionMap;
                        this._thumbnails.forEach(t => {
                            thumbnails[newPosition].translation_x = 0;
                            thumbnails[newPosition].translation_y = 0;
                            t.translation_x = 0;
                            t.translation_y = 0;
                        });
                        this._thumbnails.sort((a, b) => {
                            return a.metaWorkspace.index() - b.metaWorkspace.index();
                        });
                        this.queue_relayout();
                    },
                });
            }
        });
    },

    _updateStates() {
        const controlsManager = Main.overview._overview.controls;
        const { currentState } = controlsManager._stateAdjustment.getStateTransitionParams();
        this.SLIDE_ANIMATION_TIME = 200;
        this.RESCALE_ANIMATION_TIME = 200;
        // remove rescale animation during this scale transition, it is redundant and delayed
        if ((currentState < 2 && currentState > 1) || controlsManager._searchController.searchActive)
            this.RESCALE_ANIMATION_TIME = 0;

        this._updateStateId = 0;

        // If we are animating the indicator, wait
        if (this._animatingIndicator)
            return;

        // Likewise if we are in the process of hiding
        if (!this._shouldShow && this.visible)
            return;

        // Then slide out any thumbnails that have been destroyed
        this._iterateStateThumbnails(ThumbnailState.REMOVING, thumbnail => {
            this._setThumbnailState(thumbnail, ThumbnailState.ANIMATING_OUT);

            thumbnail.ease_property('slide-position', 1, {
                duration: this.SLIDE_ANIMATION_TIME,
                mode: Clutter.AnimationMode.LINEAR,
                onComplete: () => {
                    this._setThumbnailState(thumbnail, ThumbnailState.ANIMATED_OUT);
                    this._queueUpdateStates();
                },
            });
        });

        // As long as things are sliding out, don't proceed
        if (this._stateCounts[ThumbnailState.ANIMATING_OUT] > 0)
            return;

        // Once that's complete, we can start scaling to the new size,
        // collapse any removed thumbnails and expand added ones
        this._iterateStateThumbnails(ThumbnailState.ANIMATED_OUT, thumbnail => {
            this._setThumbnailState(thumbnail, ThumbnailState.COLLAPSING);
            thumbnail.ease_property('collapse-fraction', 1, {
                duration: this.RESCALE_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    this._stateCounts[thumbnail.state]--;
                    thumbnail.state = ThumbnailState.DESTROYED;

                    let index = this._thumbnails.indexOf(thumbnail);
                    this._thumbnails.splice(index, 1);
                    thumbnail.destroy();

                    this._queueUpdateStates();
                },
            });
        });

        this._iterateStateThumbnails(ThumbnailState.NEW, thumbnail => {
            this._setThumbnailState(thumbnail, ThumbnailState.EXPANDING);
            thumbnail.ease_property('collapse-fraction', 0, {
                duration: this.SLIDE_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    this._setThumbnailState(thumbnail, ThumbnailState.EXPANDED);
                    this._queueUpdateStates();
                },
            });
        });

        if (this._pendingScaleUpdate) {
            this.ease_property('scale', this._targetScale, {
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                duration: this.RESCALE_ANIMATION_TIME,
                onComplete: () => this._queueUpdateStates(),
            });
            this._queueUpdateStates();
            this._pendingScaleUpdate = false;
        }

        // Wait until that's done
        if (this._scale !== this._targetScale ||
            this._stateCounts[ThumbnailState.COLLAPSING] > 0 ||
            this._stateCounts[ThumbnailState.EXPANDING] > 0)
            return;

        // And then slide in any new thumbnails
        this._iterateStateThumbnails(ThumbnailState.EXPANDED, thumbnail => {
            this._setThumbnailState(thumbnail, ThumbnailState.ANIMATING_IN);
            thumbnail.ease_property('slide-position', 0, {
                duration: this.SLIDE_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    this._setThumbnailState(thumbnail, ThumbnailState.NORMAL);
                },
            });
        });
    },

    _getPlaceholderTarget(...args) {
        if (this._boxOrientation)
            return ThumbnailsBoxVertical._getPlaceholderTarget.bind(this)(...args);
        else
            return ThumbnailsBoxHorizontal._getPlaceholderTarget.bind(this)(...args);
    },

    _withinWorkspace(...args) {
        if (this._boxOrientation)
            return ThumbnailsBoxVertical._withinWorkspace.bind(this)(...args);
        else
            return ThumbnailsBoxHorizontal._withinWorkspace.bind(this)(...args);
    },

    vfunc_get_preferred_width(...args) {
        if (this._boxOrientation)
            return ThumbnailsBoxVertical.vfunc_get_preferred_width.bind(this)(...args);
        else
            return ThumbnailsBoxHorizontal.vfunc_get_preferred_width.bind(this)(...args);
    },

    vfunc_get_preferred_height(...args) {
        if (this._boxOrientation)
            return ThumbnailsBoxVertical.vfunc_get_preferred_height.bind(this)(...args);
        else
            return ThumbnailsBoxHorizontal.vfunc_get_preferred_height.bind(this)(...args);
    },

    vfunc_allocate(...args) {
        if (this._boxOrientation)
            return ThumbnailsBoxVertical.vfunc_allocate.bind(this)(...args);
        else
            return ThumbnailsBoxHorizontal.vfunc_allocate.bind(this)(...args);
    },

    _updateShouldShow(...args) {
        if (this._boxOrientation)
            return ThumbnailsBoxVertical._updateShouldShow.bind(this)(...args);
        else
            return ThumbnailsBoxHorizontal._updateShouldShow.bind(this)(...args);
    },
};

function _getWorkspaceCutSize(tmbSize, index) {
    let cutSize = WORKSPACE_CUT_SCALE * tmbSize;
    // Compensate for the missing thumbnail in front of the first one
    if (index === 0)
        cutSize *= 1.5;
    return Math.floor(cutSize);
}

const ThumbnailsBoxVertical = {
    _getPlaceholderTarget(index, spacing, rtl) {
        this._dropPlaceholder.add_style_class_name('placeholder-vertical');
        const workspace = this._thumbnails[index];
        const WORKSPACE_CUT_SIZE = _getWorkspaceCutSize(workspace.height, index);

        let targetY1;
        let targetY2;

        if (rtl) {
            const baseY = workspace.y + workspace.height;
            targetY1 = baseY - WORKSPACE_CUT_SIZE;
            targetY2 = baseY + spacing + WORKSPACE_CUT_SIZE;
        } else {
            targetY1 = workspace.y - spacing - WORKSPACE_CUT_SIZE;
            targetY2 = workspace.y + WORKSPACE_CUT_SIZE;
        }

        if (index === 0) {
            if (rtl)
                targetY2 -= spacing + WORKSPACE_CUT_SIZE;
            else
                targetY1 += spacing + WORKSPACE_CUT_SIZE;
        }

        if (index === this._dropPlaceholderPos) {
            const placeholderHeight = this._dropPlaceholder.get_height() + spacing;
            if (rtl)
                targetY2 += placeholderHeight;
            else
                targetY1 -= placeholderHeight;
        }

        return [targetY1, targetY2];
    },

    _withinWorkspace(y, index, rtl) {
        const length = this._thumbnails.length;
        const workspace = this._thumbnails[index];
        const WORKSPACE_CUT_SIZE = _getWorkspaceCutSize(workspace.height, index);

        let workspaceY1 = workspace.y + WORKSPACE_CUT_SIZE;
        let workspaceY2 = workspace.y + workspace.height - WORKSPACE_CUT_SIZE;

        if (index === length - 1) {
            if (rtl)
                workspaceY1 -= WORKSPACE_CUT_SIZE;
            else
                workspaceY2 += WORKSPACE_CUT_SIZE;
        }

        return y > workspaceY1 && y <= workspaceY2;
    },

    vfunc_get_preferred_width(forHeight) {
        if (forHeight < 10)
            return [this._porthole.width, this._porthole.width];

        let themeNode = this.get_theme_node();

        forHeight = themeNode.adjust_for_width(forHeight);

        let spacing = themeNode.get_length('spacing');
        let nWorkspaces = this._thumbnails.length;
        let totalSpacing = (nWorkspaces - 1) * spacing;

        const avail = forHeight - totalSpacing;

        let scale = (avail / nWorkspaces) / this._porthole.height;

        const width = Math.round(this._porthole.width * scale);
        return themeNode.adjust_preferred_height(width, width);
    },

    vfunc_get_preferred_height(forWidth) {
        if (forWidth < 10)
            return [0, this._porthole.height];
        let themeNode = this.get_theme_node();

        let spacing = themeNode.get_length('spacing');
        let nWorkspaces = this._thumbnails.length;

        // remove also top/bottom box padding
        let totalSpacing = (nWorkspaces - 3) * spacing;

        const ratio = this._porthole.width / this._porthole.height;
        const tmbHeight = themeNode.adjust_for_width(forWidth) / ratio;

        const naturalHeight = Math.round(
            this._thumbnails.reduce((accumulator, thumbnail/* , index*/) => {
                const progress = 1 - thumbnail.collapse_fraction;
                const height = tmbHeight * progress;
                return accumulator + height;
            }, 0)
        );
        return themeNode.adjust_preferred_width(totalSpacing, naturalHeight);
    },

    // removes extra space (extraWidth in the original function), we need the box as accurate as possible
    // for precise app grid transition animation
    vfunc_allocate(box) {
        this.set_allocation(box);

        let rtl = Clutter.get_default_text_direction() === Clutter.TextDirection.RTL;

        if (this._thumbnails.length === 0) // not visible
            return;

        let themeNode = this.get_theme_node();
        box = themeNode.get_content_box(box);

        const portholeWidth = this._porthole.width;
        const portholeHeight = this._porthole.height;
        const spacing = themeNode.get_length('spacing');

        /* const nWorkspaces = this._thumbnails.length;*/

        // Compute the scale we'll need once everything is updated,
        // unless we are currently transitioning
        // if (this._expandFraction === 0 || this._expandFraction === 1) {
        // remove size "breathing" during adding/removing workspaces

        /* const totalSpacing = (nWorkspaces - 1) * spacing;
            const availableHeight = (box.get_height() - totalSpacing) / nWorkspaces; */

        const hScale = box.get_width() / portholeWidth;
        /* const vScale = availableHeight / portholeHeight;*/
        const vScale = box.get_height() / portholeHeight;
        const newScale = Math.min(hScale, vScale);

        if (newScale !== this._targetScale) {
            if (this._targetScale > 0) {
                // We don't ease immediately because we need to observe the
                // ordering in queueUpdateStates - if workspaces have been
                // removed we need to slide them out as the first thing.
                this._targetScale = newScale;
                this._pendingScaleUpdate = true;
            } else {
                this._targetScale = this._scale = newScale;
            }

            this._queueUpdateStates();
        }
        // }

        const ratio = portholeWidth / portholeHeight;
        const thumbnailFullHeight = Math.round(portholeHeight * this._scale);
        const thumbnailWidth = Math.round(thumbnailFullHeight * ratio);
        const thumbnailHeight = thumbnailFullHeight; //* this._expandFraction;
        const roundedVScale = thumbnailHeight / portholeHeight;

        let indicatorValue = this._scrollAdjustment.value;
        let indicatorUpperWs = Math.ceil(indicatorValue);
        let indicatorLowerWs = Math.floor(indicatorValue);

        let indicatorLowerY1 = 0;
        let indicatorLowerY2 = 0;
        let indicatorUpperY1 = 0;
        let indicatorUpperY2 = 0;

        let indicatorThemeNode = this._indicator.get_theme_node();
        let indicatorTopFullBorder = indicatorThemeNode.get_padding(St.Side.TOP) + indicatorThemeNode.get_border_width(St.Side.TOP);
        let indicatorBottomFullBorder = indicatorThemeNode.get_padding(St.Side.BOTTOM) + indicatorThemeNode.get_border_width(St.Side.BOTTOM);
        let indicatorLeftFullBorder = indicatorThemeNode.get_padding(St.Side.LEFT) + indicatorThemeNode.get_border_width(St.Side.LEFT);
        let indicatorRightFullBorder = indicatorThemeNode.get_padding(St.Side.RIGHT) + indicatorThemeNode.get_border_width(St.Side.RIGHT);

        let y = box.y1;

        if (this._dropPlaceholderPos === -1) {
            this._dropPlaceholder.allocate_preferred_size(
                ...this._dropPlaceholder.get_position());

            const laters = global.compositor.get_laters();
            laters.add(Meta.LaterType.BEFORE_REDRAW, () => {
                this._dropPlaceholder.hide();
            });
        }

        let childBox = new Clutter.ActorBox();

        for (let i = 0; i < this._thumbnails.length; i++) {
            const thumbnail = this._thumbnails[i];
            if (i > 0)
                y += spacing - Math.round(thumbnail.collapse_fraction * spacing);

            const x1 = box.x1;
            const x2 = x1 + thumbnailWidth;

            if (i === this._dropPlaceholderPos) {
                let [, placeholderHeight] = this._dropPlaceholder.get_preferred_width(-1);
                childBox.x1 = x1;
                childBox.x2 = x2;

                if (rtl) {
                    childBox.y2 = box.y2 - Math.round(y);
                    childBox.y1 = box.y2 - Math.round(y + placeholderHeight);
                } else {
                    childBox.y1 = Math.round(y);
                    childBox.y2 = Math.round(y + placeholderHeight);
                }

                this._dropPlaceholder.allocate(childBox);

                const laters = global.compositor.get_laters();
                laters.add(Meta.LaterType.BEFORE_REDRAW, () => {
                    this._dropPlaceholder.show();
                });
                y += placeholderHeight + spacing;
            }

            // We might end up with thumbnailWidth being something like 99.33
            // pixels. To make this work and not end up with a gap at the end,
            // we need some thumbnails to be 99 pixels and some 100 pixels width;
            // we compute an actual scale separately for each thumbnail.
            const y1 = Math.round(y);
            const y2 = Math.round(y + thumbnailHeight);
            const roundedHScale = (y2 - y1) / portholeHeight;

            // Allocating a scaled actor is funny - x1/y1 correspond to the origin
            // of the actor, but x2/y2 are increased by the *unscaled* size.
            if (rtl) {
                childBox.y2 = box.y2 - y1;
                childBox.y1 = box.y2 - (y1 + thumbnailHeight);
            } else {
                childBox.y1 = y1;
                childBox.y2 = y1 + thumbnailHeight;
            }
            childBox.x1 = x1;
            childBox.x2 = x1 + thumbnailWidth;

            thumbnail.setScale(roundedHScale, roundedVScale);
            thumbnail.allocate(childBox);

            if (i === indicatorUpperWs) {
                indicatorUpperY1 = childBox.y1;
                indicatorUpperY2 = childBox.y2;
            }
            if (i === indicatorLowerWs) {
                indicatorLowerY1 = childBox.y1;
                indicatorLowerY2 = childBox.y2;
            }

            // We round the collapsing portion so that we don't get thumbnails resizing
            // during an animation due to differences in rounded, but leave the uncollapsed
            // portion unrounded so that non-animating we end up with the right total
            y += thumbnailHeight - Math.round(thumbnailHeight * thumbnail.collapse_fraction);
        }

        childBox.x1 = box.x1;
        childBox.x2 = box.x1 + thumbnailWidth;

        const indicatorY1 = indicatorLowerY1 +
            (indicatorUpperY1 - indicatorLowerY1) * (indicatorValue % 1);
        const indicatorY2 = indicatorLowerY2 +
            (indicatorUpperY2 - indicatorLowerY2) * (indicatorValue % 1);

        childBox.y1 = indicatorY1 - indicatorTopFullBorder;
        childBox.y2 = indicatorY2 + indicatorBottomFullBorder;
        childBox.x1 -= indicatorLeftFullBorder;
        childBox.x2 += indicatorRightFullBorder;
        this._indicator.allocate(childBox);
    },

    _updateShouldShow() {
        const shouldShow = opt.SHOW_WS_TMB;
        if (this._shouldShow === shouldShow)
            return;

        this._shouldShow = shouldShow;
        this.notify('should-show');
    },
};

// ThumbnailsBox Horizontal

const ThumbnailsBoxHorizontal = {
    _getPlaceholderTarget(index, spacing, rtl) {
        const workspace = this._thumbnails[index];
        const WORKSPACE_CUT_SIZE = _getWorkspaceCutSize(workspace.width, index);

        let targetX1;
        let targetX2;

        if (rtl) {
            const baseX = workspace.x + workspace.width;
            targetX1 = baseX - WORKSPACE_CUT_SIZE;
            targetX2 = baseX + spacing + WORKSPACE_CUT_SIZE;
        } else {
            targetX1 = workspace.x - spacing - WORKSPACE_CUT_SIZE;
            targetX2 = workspace.x + WORKSPACE_CUT_SIZE;
        }

        if (index === 0) {
            if (rtl)
                targetX2 -= spacing + WORKSPACE_CUT_SIZE;
            else
                targetX1 += spacing + WORKSPACE_CUT_SIZE;
        }

        if (index === this._dropPlaceholderPos) {
            const placeholderWidth = this._dropPlaceholder.get_width() + spacing;
            if (rtl)
                targetX2 += placeholderWidth;
            else
                targetX1 -= placeholderWidth;
        }

        return [targetX1, targetX2];
    },

    _withinWorkspace(x, index, rtl) {
        const length = this._thumbnails.length;
        const workspace = this._thumbnails[index];
        const WORKSPACE_CUT_SIZE = _getWorkspaceCutSize(workspace.width, index);

        let workspaceX1 = workspace.x + WORKSPACE_CUT_SIZE;
        let workspaceX2 = workspace.x + workspace.width - WORKSPACE_CUT_SIZE;

        if (index === length - 1) {
            if (rtl)
                workspaceX1 -= WORKSPACE_CUT_SIZE;
            else
                workspaceX2 += WORKSPACE_CUT_SIZE;
        }

        return x > workspaceX1 && x <= workspaceX2;
    },

    vfunc_get_preferred_height(forWidth) {
        if (forWidth < 10)
            return [this._porthole.height, this._porthole.height];

        let themeNode = this.get_theme_node();

        forWidth = themeNode.adjust_for_width(forWidth);

        let spacing = themeNode.get_length('spacing');
        let nWorkspaces = this._thumbnails.length;
        let totalSpacing = (nWorkspaces - 1) * spacing;

        const avail = forWidth - totalSpacing;

        let scale = (avail / nWorkspaces) / this._porthole.width;

        const height = Math.round(this._porthole.height * scale);

        return themeNode.adjust_preferred_height(height, height);
    },

    vfunc_get_preferred_width(forHeight) {
        if (forHeight < 10)
            return [0, this._porthole.width];

        let themeNode = this.get_theme_node();

        let spacing = themeNode.get_length('spacing');
        let nWorkspaces = this._thumbnails.length;
        // remove also left/right box padding from the total spacing
        let totalSpacing = (nWorkspaces - 3) * spacing;

        const ratio = this._porthole.height / this._porthole.width;

        const tmbWidth = themeNode.adjust_for_height(forHeight) / ratio;

        const naturalWidth = Math.round(
            this._thumbnails.reduce((accumulator, thumbnail) => {
                const progress = 1 - thumbnail.collapse_fraction;
                const width = tmbWidth * progress;
                return accumulator + width;
            }, 0)
        );

        return themeNode.adjust_preferred_width(totalSpacing, naturalWidth);
    },

    vfunc_allocate(box) {
        this.set_allocation(box);

        let rtl = Clutter.get_default_text_direction() === Clutter.TextDirection.RTL;

        if (this._thumbnails.length === 0) // not visible
            return;

        let themeNode = this.get_theme_node();
        box = themeNode.get_content_box(box);

        const portholeWidth = this._porthole.width;
        const portholeHeight = this._porthole.height;
        const spacing = themeNode.get_length('spacing');

        /* const nWorkspaces = this._thumbnails.length; */

        // Compute the scale we'll need once everything is updated,
        // unless we are currently transitioning
        // if (this._expandFraction === 0 || this._expandFraction === 1) {
        // remove size "breathing" during adding/removing workspaces

        /* const totalSpacing = (nWorkspaces - 1) * spacing;
            const availableWidth = (box.get_width() - totalSpacing) / nWorkspaces;

            const hScale = availableWidth / portholeWidth; */
        const hScale = box.get_width() / portholeWidth;
        const vScale = box.get_height() / portholeHeight;
        const newScale = Math.min(hScale, vScale);

        if (newScale !== this._targetScale) {
            if (this._targetScale > 0) {
                // We don't ease immediately because we need to observe the
                // ordering in queueUpdateStates - if workspaces have been
                // removed we need to slide them out as the first thing.
                this._targetScale = newScale;
                this._pendingScaleUpdate = true;
            } else {
                this._targetScale = this._scale = newScale;
            }

            this._queueUpdateStates();
        }
        // }

        const ratio = portholeWidth / portholeHeight;
        const thumbnailFullHeight = Math.round(portholeHeight * this._scale);
        const thumbnailWidth = Math.round(thumbnailFullHeight * ratio);
        const thumbnailHeight = thumbnailFullHeight; //* this._expandFraction;
        const roundedVScale = thumbnailHeight / portholeHeight;

        let indicatorValue = this._scrollAdjustment.value;
        let indicatorUpperWs = Math.ceil(indicatorValue);
        let indicatorLowerWs = Math.floor(indicatorValue);

        let indicatorLowerX1 = 0;
        let indicatorLowerX2 = 0;
        let indicatorUpperX1 = 0;
        let indicatorUpperX2 = 0;

        let indicatorThemeNode = this._indicator.get_theme_node();
        let indicatorTopFullBorder = indicatorThemeNode.get_padding(St.Side.TOP) + indicatorThemeNode.get_border_width(St.Side.TOP);
        let indicatorBottomFullBorder = indicatorThemeNode.get_padding(St.Side.BOTTOM) + indicatorThemeNode.get_border_width(St.Side.BOTTOM);
        let indicatorLeftFullBorder = indicatorThemeNode.get_padding(St.Side.LEFT) + indicatorThemeNode.get_border_width(St.Side.LEFT);
        let indicatorRightFullBorder = indicatorThemeNode.get_padding(St.Side.RIGHT) + indicatorThemeNode.get_border_width(St.Side.RIGHT);

        let x = box.x1;

        if (this._dropPlaceholderPos === -1) {
            this._dropPlaceholder.allocate_preferred_size(
                ...this._dropPlaceholder.get_position());

            const laters = global.compositor.get_laters();
            laters.add(Meta.LaterType.BEFORE_REDRAW, () => {
                this._dropPlaceholder.hide();
            });
        }

        let childBox = new Clutter.ActorBox();

        for (let i = 0; i < this._thumbnails.length; i++) {
            const thumbnail = this._thumbnails[i];
            if (i > 0)
                x += spacing - Math.round(thumbnail.collapse_fraction * spacing);

            const y1 = box.y1;
            const y2 = y1 + thumbnailHeight;

            if (i === this._dropPlaceholderPos) {
                const [, placeholderWidth] = this._dropPlaceholder.get_preferred_width(-1);
                childBox.y1 = y1;
                childBox.y2 = y2;

                if (rtl) {
                    childBox.x2 = box.x2 - Math.round(x);
                    childBox.x1 = box.x2 - Math.round(x + placeholderWidth);
                } else {
                    childBox.x1 = Math.round(x);
                    childBox.x2 = Math.round(x + placeholderWidth);
                }

                this._dropPlaceholder.allocate(childBox);

                const laters = global.compositor.get_laters();
                laters.add(Meta.LaterType.BEFORE_REDRAW, () => {
                    this._dropPlaceholder.show();
                });
                x += placeholderWidth + spacing;
            }

            // We might end up with thumbnailWidth being something like 99.33
            // pixels. To make this work and not end up with a gap at the end,
            // we need some thumbnails to be 99 pixels and some 100 pixels width;
            // we compute an actual scale separately for each thumbnail.
            const x1 = Math.round(x);
            const x2 = Math.round(x + thumbnailWidth);
            const roundedHScale = (x2 - x1) / portholeWidth;

            // Allocating a scaled actor is funny - x1/y1 correspond to the origin
            // of the actor, but x2/y2 are increased by the *unscaled* size.
            if (rtl) {
                childBox.x2 = box.x2 - x1;
                childBox.x1 = box.x2 - (x1 + thumbnailWidth);
            } else {
                childBox.x1 = x1;
                childBox.x2 = x1 + thumbnailWidth;
            }
            childBox.y1 = y1;
            childBox.y2 = y1 + thumbnailHeight;

            thumbnail.setScale(roundedHScale, roundedVScale);
            thumbnail.allocate(childBox);

            if (i === indicatorUpperWs) {
                indicatorUpperX1 = childBox.x1;
                indicatorUpperX2 = childBox.x2;
            }
            if (i === indicatorLowerWs) {
                indicatorLowerX1 = childBox.x1;
                indicatorLowerX2 = childBox.x2;
            }

            // We round the collapsing portion so that we don't get thumbnails resizing
            // during an animation due to differences in rounded, but leave the uncollapsed
            // portion unrounded so that non-animating we end up with the right total
            x += thumbnailWidth - Math.round(thumbnailWidth * thumbnail.collapse_fraction);
        }

        childBox.y1 = box.y1;
        childBox.y2 = box.y1 + thumbnailHeight;

        const indicatorX1 = indicatorLowerX1 +
            (indicatorUpperX1 - indicatorLowerX1) * (indicatorValue % 1);
        const indicatorX2 = indicatorLowerX2 +
            (indicatorUpperX2 - indicatorLowerX2) * (indicatorValue % 1);

        childBox.x1 = indicatorX1 - indicatorLeftFullBorder;
        childBox.x2 = indicatorX2 + indicatorRightFullBorder;
        childBox.y1 -= indicatorTopFullBorder;
        childBox.y2 += indicatorBottomFullBorder;
        this._indicator.allocate(childBox);
    },

    _updateShouldShow: ThumbnailsBoxVertical._updateShouldShow,
};

const WindowClone = {
    after__init() {
        // Make it transparent and smaller than usual  while dragging
        this._draggable._dragActorOpacity = 200;
        this._draggable._dragActorMaxSize = 150;
    },
};
