/**
 * Vertical Workspaces
 * workspaceThumbnail.js
 * 
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2023
 * @license    GPL-3.0
 *
 */

'use strict';

const { Clutter, Graphene, Meta, Shell, St } = imports.gi;
const DND = imports.ui.dnd;
const Main = imports.ui.main;
const Background = imports.ui.background;
const WorkspaceThumbnail = imports.ui.workspaceThumbnail;
const ThumbnailState = WorkspaceThumbnail.ThumbnailState;

const ControlsState = imports.ui.overviewControls.ControlsState;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const _Util = Me.imports.util;
let _overrides;

const WORKSPACE_CUT_SIZE = 10;
const original_MAX_THUMBNAIL_SCALE = WorkspaceThumbnail.MAX_THUMBNAIL_SCALE;
let MAX_THUMBNAIL_SCALE;

var opt = null;


function update(reset = false) {
    if (_overrides) {
        _overrides.removeAll();
    }

    if (reset) {
        if (original_MAX_THUMBNAIL_SCALE)
            WorkspaceThumbnail.MAX_THUMBNAIL_SCALE = original_MAX_THUMBNAIL_SCALE;
        _overrides = null;
        opt = null;
        return;
    }

    opt = Me.imports.settings.opt;

    MAX_THUMBNAIL_SCALE = opt.MAX_THUMBNAIL_SCALE;
    WorkspaceThumbnail.MAX_THUMBNAIL_SCALE = MAX_THUMBNAIL_SCALE;

    _overrides = new _Util.Overrides();

    _overrides.addOverride('WorkspaceThumbnail', WorkspaceThumbnail.WorkspaceThumbnail.prototype, WorkspaceThumbnailCommon);
    _overrides.addOverride('ThumbnailsBoxCommon', WorkspaceThumbnail.ThumbnailsBox.prototype, ThumbnailsBoxCommon);

    if (opt.ORIENTATION === Clutter.Orientation.VERTICAL) {
        _overrides.addOverride('ThumbnailsBox', WorkspaceThumbnail.ThumbnailsBox.prototype, ThumbnailsBoxVertical);
    } else {
        _overrides.addOverride('ThumbnailsBox', WorkspaceThumbnail.ThumbnailsBox.prototype, ThumbnailsBoxHorizontal);
    }
}


var WorkspaceThumbnailCommon = {
    after__init: function () {

        //radius of ws thumbnail background
        this.add_style_class_name('ws-tmb');

        // add workspace thumbnails labels if enabled
        if (opt.SHOW_WST_LABELS) { // 0 - disable
            // layout manager allows aligning widget children
            this.layout_manager = new Clutter.BinLayout();
            // adding layout manager to tmb widget breaks wallpaper background aligning and rounded corners
            // unless border is removed
            if (opt.SHOW_WS_TMB_BG)
                this.add_style_class_name('ws-tmb-labeled');

            const getLabel = function() {
                const wsIndex = this.metaWorkspace.index();
                let label = `${wsIndex + 1}`;
                if (opt.SHOW_WST_LABELS === 2) { // 2 - index + workspace name
                    const settings = ExtensionUtils.getSettings('org.gnome.desktop.wm.preferences');
                    const wsLabels = settings.get_strv('workspace-names');
                    if (wsLabels.length > wsIndex && wsLabels[wsIndex]) {
                        label += `: ${wsLabels[wsIndex]}`;
                    }
                } else if (opt.SHOW_WST_LABELS === 3) { // 3- index + app name
                    // global.display.get_tab_list offers workspace filtering using the second argument, but...
                    // ... it sometimes includes windows from other workspaces, like minimized VBox machines, after Shell restarts
                    const metaWin = global.display.get_tab_list(0, null).filter(
                        w => w.get_monitor() === this.monitorIndex && w.get_workspace().index() === wsIndex)[0];

                    if (metaWin) {
                        let tracker = Shell.WindowTracker.get_default();
                        label += `: ${tracker.get_window_app(metaWin).get_name()}`;
                    }
                } else if (opt.SHOW_WST_LABELS === 4) {
                    const metaWin = global.display.get_tab_list(0, null).filter(
                        w => w.get_monitor() === this.monitorIndex && w.get_workspace().index() === wsIndex)[0];

                    if (metaWin) {
                        label += `: ${metaWin.title}`;
                    }
                }
                return label;
            }.bind(this);

            const label = getLabel();

            this._wsLabel = new St.Label({
                text: label,
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

            this._wsIndexSigId = this.metaWorkspace.connect('notify::workspace-index', () => {
                const newLabel = getLabel();
                this._wsLabel.text = newLabel;
            });

            this.connect('destroy', () => this.metaWorkspace.disconnect(this._wsIndexSigId));

            if (opt.SHOW_WST_LABELS_ON_HOVER) {
                this._wsLabel.opacity = 0;
                this.reactive = true;
                this.connect('enter-event', ()=> this._wsLabel.ease({
                    duration: 100,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    opacity: this._wsLabel._maxOpacity
                }));
                this.connect('leave-event', ()=> this._wsLabel.ease({
                    duration: 100,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    opacity: 0
                }));
            }
        }

        if (opt.SHOW_WS_TMB_BG) {
            this._bgManager = new Background.BackgroundManager({
                monitorIndex: this.monitorIndex,
                container: this._viewport,
                vignette: false,
                controlPosition: false,
            });

            this._viewport.set_child_below_sibling(this._bgManager.backgroundActor, null);

            this.connect('destroy', function () {
                if (this._bgManager)
                    this._bgManager.destroy();
                this._bgManager = null;
            }.bind(this));

            this._bgManager.backgroundActor.opacity = 220;

            // this all is just for the small border radius...
            /*const { scaleFactor } = St.ThemeContext.get_for_stage(global.stage);
            const cornerRadius = scaleFactor * BACKGROUND_CORNER_RADIUS_PIXELS;
            const backgroundContent = this._bgManager.backgroundActor.content;
            backgroundContent.rounded_clip_radius = cornerRadius;

            // the original clip has some addition at the bottom
            const rect = new Graphene.Rect();
            rect.origin.x = this._viewport.x;
            rect.origin.y = this._viewport.y;
            rect.size.width = this._viewport.width;
            rect.size.height = this._viewport.height;

            this._bgManager.backgroundActor.content.set_rounded_clip_bounds(rect);*/
        }
    },

    activate: function(time) {
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
        } else {
            if (opt.OVERVIEW_MODE2 && !opt.WORKSPACE_MODE && wsIndex < lastWsIndex) {
                if (stateAdjustment.value > 1) {
                    stateAdjustment.value = 1;
                }

                // spread windows
                // in OVERVIEW MODE 2 windows are not spread and workspace is not scaled
                // we need to repeat transition to the overview state 1 (window picker), but with spreading windows animation
                if (this.metaWorkspace.active) {
                    opt.WORKSPACE_MODE = 1;
                    const stateAdjustment = Main.overview._overview.controls._stateAdjustment
                    // setting value to 0 would reset WORKSPACE_MODE
                    stateAdjustment.value = 0.01;
                    stateAdjustment.ease(1, {
                        duration: 200,
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    });

                    /*const adjustment = Main.overview._overview.controls._workspacesDisplay._workspacesViews[0]._workspaces[wsIndex].stateAdjustment;
                    adjustment.value = 0;
                    adjustment.ease(1, {
                        duration: 200,
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    });*/
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
        }
    }
}

const ThumbnailsBoxCommon = {
    _activateThumbnailAtPoint: function(stageX, stageY, time, activateCurrent = false) {
        if (activateCurrent) {
            const thumbnail = this._thumbnails.find(t => t.metaWorkspace.active);
            if (thumbnail)
                thumbnail.activate(time);
            return;
        }
        const [r_, x, y] = this.transform_stage_point(stageX, stageY);

        let thumbnail;

        if (opt.ORIENTATION) {
            thumbnail = this._thumbnails.find(t => y >= t.y && y <= t.y + t.height);
        } else {
            thumbnail = this._thumbnails.find(t => x >= t.x && x <= t.x + t.width);
        }
        if (thumbnail) {
            thumbnail.activate(time);
        }
    },
}

var ThumbnailsBoxVertical = {
    _getPlaceholderTarget: function(index, spacing, rtl) {
        const workspace = this._thumbnails[index];

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

     _withinWorkspace: function(y, index, rtl) {
        const length = this._thumbnails.length;
        const workspace = this._thumbnails[index];

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

    handleDragOver: function(source, actor, x, y, time) {
        if (!source.metaWindow &&
            (!source.app || !source.app.can_open_new_window()) &&
            (source.app || !source.shellWorkspaceLaunch) &&
            source != Main.xdndHandler)
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

                if (y > targetStart && y <= targetEnd) {
                    placeholderPos = index;
                    break;
                }
            }

            if (this._withinWorkspace(y, index, rtl)) {
                this._dropWorkspace = index;
                break;
            }
        }

        if (this._dropPlaceholderPos != placeholderPos) {
            this._dropPlaceholderPos = placeholderPos;
            this.queue_relayout();
        }

        if (this._dropWorkspace != -1)
            return this._thumbnails[this._dropWorkspace].handleDragOverInternal(source, actor, time);
        else if (this._dropPlaceholderPos != -1)
            return source.metaWindow ? DND.DragMotionResult.MOVE_DROP : DND.DragMotionResult.COPY_DROP;
        else
            return DND.DragMotionResult.CONTINUE;
    },

    //vfunc_get_preferred_width: function(forHeight) {
    // override of this vfunc doesn't work for some reason (tested on Ubuntu and Fedora), it's not reachable
    get_preferred_custom_width: function(forHeight) {
        if (!this.visible) {
            return [0, 0];
        }

        if (forHeight === -1)
            return this.get_preferred_custom_height(forHeight);

        let themeNode = this.get_theme_node();

        forHeight = themeNode.adjust_for_width(forHeight);

        let spacing = themeNode.get_length('spacing');
        let nWorkspaces = this._thumbnails.length;
        let totalSpacing = (nWorkspaces - 1) * spacing;

        const avail = forHeight - totalSpacing;

        let scale = (avail / nWorkspaces) / this._porthole.height;
        scale = Math.min(scale, MAX_THUMBNAIL_SCALE);

        const width = Math.round(this._porthole.width * scale);

        return themeNode.adjust_preferred_width(width, width);
    },

    get_preferred_custom_height: function(_forWidth) {
        if (!this.visible) {
            return [0, 0];
        }

        // Note that for getPreferredHeight/Width we cheat a bit and skip propagating
        // the size request to our children because we know how big they are and know
        // that the actors aren't depending on the virtual functions being called.
        let themeNode = this.get_theme_node();

        let spacing = themeNode.get_length('spacing');
        let nWorkspaces = this._thumbnails.length;

        let totalSpacing = (nWorkspaces - 1) * spacing;

        const ratio = this._porthole.width / this._porthole.height;
        const tmbHeight = _forWidth / ratio;

        const naturalheight = this._thumbnails.reduce((accumulator, thumbnail, index) => {
            //let workspaceSpacing = 0;

            const progress = 1 - thumbnail.collapse_fraction;
            //const height = (this._porthole.height * MAX_THUMBNAIL_SCALE + workspaceSpacing) * progress;
            const height = (tmbHeight) * progress;
            return accumulator + height;
        }, 0);

        //return themeNode.adjust_preferred_height(totalSpacing, naturalheight);
        // we need to calculate the height precisely as it need to align with the workspacesDisplay because of transition animation
        // This works perfectly for fullHD monitor, for some reason 5:4 aspect ratio monitor adds unnecessary pixels to the final height of the thumbnailsBox
        return [totalSpacing, naturalheight];
    },

    // removes extra space (extraWidth in the original function), we need the box as accurate as possible
    // for precise app grid transition animation
    vfunc_allocate: function(box) {
        this.set_allocation(box);

        let rtl = Clutter.get_default_text_direction() == Clutter.TextDirection.RTL;

        if (this._thumbnails.length == 0) // not visible
            return;

        let themeNode = this.get_theme_node();
        box = themeNode.get_content_box(box);

        const portholeWidth = this._porthole.width;
        const portholeHeight = this._porthole.height;
        const spacing = themeNode.get_length('spacing');

        const nWorkspaces = this._thumbnails.length;

        // Compute the scale we'll need once everything is updated,
        // unless we are currently transitioning
        if (this._expandFraction === 1) {
            const totalSpacing = (nWorkspaces - 1) * spacing;
            const availableHeight = (box.get_height() - totalSpacing) / nWorkspaces;

            const hScale = box.get_width() / portholeWidth;
            const vScale = availableHeight / portholeHeight;
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
        }

        const ratio = portholeWidth / portholeHeight;
        const thumbnailFullHeight = Math.round(portholeHeight * this._scale);
        const thumbnailWidth = Math.round(thumbnailFullHeight * ratio);
        const thumbnailHeight = thumbnailFullHeight * this._expandFraction;
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

        if (this._dropPlaceholderPos == -1) {
            this._dropPlaceholder.allocate_preferred_size(
                ...this._dropPlaceholder.get_position());

            Meta.later_add(Meta.LaterType.BEFORE_REDRAW, () => {
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
                let [, placeholderHeight] = this._dropPlaceholder.get_preferred_height(-1);
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

                Meta.later_add(Meta.LaterType.BEFORE_REDRAW, () => {
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

    _updateShouldShow: function() {
        // set current workspace indicator border radius
        // here just 'cause it's easier than adding to init
        this._indicator.add_style_class_name('ws-tmb');

        const shouldShow = opt.SHOW_WS_TMB;
        if (this._shouldShow === shouldShow)
            return;

        this._shouldShow = shouldShow;
        this.notify('should-show');
    }
}

// ThumbnailsBox Horizontal

var ThumbnailsBoxHorizontal = {
    get_preferred_custom_width: function(_forHeight) {
        // Note that for getPreferredHeight/Width we cheat a bit and skip propagating
        // the size request to our children because we know how big they are and know
        // that the actors aren't depending on the virtual functions being called.
        if (!this.visible) {
            return [0, 0];
        }

        let themeNode = this.get_theme_node();

        let spacing = themeNode.get_length('spacing');
        let nWorkspaces = this._thumbnails.length;
        let totalSpacing = (nWorkspaces - 1) * spacing;

        const ratio = this._porthole.height / this._porthole.width;
        const tmbWidth = (_forHeight - 2 * spacing) / ratio;

        const naturalWidth = this._thumbnails.reduce((accumulator, thumbnail, index) => {
            const progress = 1 - thumbnail.collapse_fraction;
            const width = tmbWidth * progress;
            return accumulator + width;
        }, 0);

        return themeNode.adjust_preferred_width(totalSpacing, naturalWidth);
    },

    vfunc_allocate(box) {
        this.set_allocation(box);

        let rtl = Clutter.get_default_text_direction() == Clutter.TextDirection.RTL;

        if (this._thumbnails.length == 0) // not visible
            return;

        let themeNode = this.get_theme_node();
        box = themeNode.get_content_box(box);

        const portholeWidth = this._porthole.width;
        const portholeHeight = this._porthole.height;
        const spacing = themeNode.get_length('spacing');

        const nWorkspaces = this._thumbnails.length;

        // Compute the scale we'll need once everything is updated,
        // unless we are currently transitioning
        if (this._expandFraction === 1) {
            const totalSpacing = (nWorkspaces - 1) * spacing;
            const availableWidth = (box.get_width() - totalSpacing) / nWorkspaces;

            const hScale = availableWidth / portholeWidth;
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
        }

        const ratio = portholeWidth / portholeHeight;
        const thumbnailFullHeight = Math.round(portholeHeight * this._scale);
        const thumbnailWidth = Math.round(thumbnailFullHeight * ratio);
        const thumbnailHeight = thumbnailFullHeight * this._expandFraction;
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

        if (this._dropPlaceholderPos == -1) {
            this._dropPlaceholder.allocate_preferred_size(
                ...this._dropPlaceholder.get_position());

            Meta.later_add(Meta.LaterType.BEFORE_REDRAW, () => {
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

                Meta.later_add(Meta.LaterType.BEFORE_REDRAW, () => {
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

    _updateShouldShow: ThumbnailsBoxVertical._updateShouldShow
}
