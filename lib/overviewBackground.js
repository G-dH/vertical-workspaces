/**
 * V-Shell (Vertical Workspaces)
 * overviewBackground.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2025
 * @license    GPL-3.0
 *
 */

'use strict';

import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Background from 'resource:///org/gnome/shell/ui/background.js';
import { ControlsState } from 'resource:///org/gnome/shell/ui/overviewControls.js';

import * as Util from 'resource:///org/gnome/shell/misc/util.js';

let Me;
let opt;

const VSHELL_GROUP_NAME = 'VShell-Background-Group';
const BMS_GROUP_NAME = 'bms-overview-backgroundgroup';

export const OverviewBackgroundModule = class {
    constructor(me) {
        Me = me;
        opt = Me.opt;

        this._firstActivation = true;
        this.moduleEnabled = false;
        this._overrides = null;
        this._originalUpdateHotCorners = null;
    }

    cleanGlobals() {
        Me = null;
        opt = null;
    }

    update(reset) {
        this.moduleEnabled = true;
        const conflict = false;

        if (conflict && !reset)
            console.warn(`[${Me.metadata.name}] Warning: "OverviewBackground" module disabled due to potential conflict with another extension`);

        reset = reset || !this.moduleEnabled || conflict;

        // don't touch the original code if module disabled
        if (reset && !this._firstActivation) {
            this._disableModule();
        } else if (!reset) {
            this._firstActivation = false;
            this._activateModule();
        }
        if (reset && this._firstActivation)
            console.debug('  OverviewBackground - Keeping untouched');
    }

    _activateModule() {
        this.moduleEnabled = true;
        const controlsManager = Main.overview._overview.controls;
        if (!this._backgroundController)
            this._backgroundController = new OverviewBackgroundController();
        controlsManager._overviewBackgroundController = this._backgroundController;

        // update overview background wallpaper if enabled, but don't set it too early on the session startup
        // because it can crash wayland
        if (!Main.layoutManager._startingUp || Meta.is_restart()) {
            this._backgroundController.setBackground();
        } else {
            // The "showing" signal is emitted during the session startup
            // so we can use it to initiate the background controller
            this._backgroundController._connectShell();
        }

        console.debug('  OverviewBackground - Activated');
    }

    _disableModule() {
        this.moduleEnabled = false;
        const controlsManager = Main.overview._overview.controls;

        this._backgroundController.destroy();
        this._backgroundController = null;

        delete controlsManager._overviewBackgroundController;

        console.debug('  OverviewBackground - Disabled');
    }
};

export class OverviewBackgroundController {
    constructor() {
        // Shell.ShaderEffect used to have a bug causing memory leaks
        // Workaround is reusing one effect
        // instead of destroying it and creating another one
        this._unusedBlurEffects = [];
        this._controls = Main.overview._overview.controls;
        this._stateAdjustment = this._controls._stateAdjustment;
    }

    _connectShell() {
        const controlsManager = Main.overview._overview.controls;

        if (!this._monitorsChangedConId) {
            this._monitorsChangedConId = Main.layoutManager.connect(
                'monitors-changed', () => controlsManager._overviewBackgroundController?.setBackground()
            );
        }

        // Ensure that background is ready when entering overview
        // This is also the trigger that initializes the background when session starts
        if (!this._showingOverviewConId) {
            this._showingOverviewConId = Main.overview.connect('showing', () =>
                controlsManager._overviewBackgroundController?.updateBackgroundsConfiguration()
            );
        }
    }

    _disconnectShell() {
        if (this._monitorsChangedConId) {
            Main.layoutManager.disconnect(this._monitorsChangedConId);
            this._monitorsChangedConId = 0;
        }

        if (this._showingOverviewConId) {
            Main.overview.disconnect(this._showingOverviewConId);
            this._showingOverviewConId = 0;
        }
    }

    destroy() {
        this._destroyBackgroundGroup();
        this._disconnectShell();
        this._destroyEffects();
    }

    _destroyBackgroundGroup() {
        this._destroyBgManagers();
        this._vshellBackgroundGroup?.destroy();
        delete this._vshellBackgroundGroup;
    }

    _destroyBgManagers() {
        if (this._bgManagers) {
            this._bgManagers.forEach(bg => {
                if (bg._overviewStateConId)
                    this._stateAdjustment.disconnect(bg._overviewStateConId);
                if (bg._bgChangedId)
                    bg.disconnect(bg._bgChangedId);
                bg.destroy();
            });
        }
        delete this._bgManagers;
        delete this._bgManagerMain;
    }

    _destroyEffects() {
        this._unusedBlurEffects = [];
    }

    // Even if the overview wallpaper is disabled, we may still need it in certain situations:
    // - Workspace preview background is disabled - we need a transition between the desktop and the overview
    // - Workspace preview background is enabled, the static workspace overview is active,
    //   and the workspace switcher animation is set to "Static Background":
    //     - We need the wallpaper to keep the background static when switching workspaces
    //       in the static workspace overview
    _shouldCreateBackground() {
        return opt.SHOW_BG_IN_OVERVIEW || !opt.SHOW_WS_PREVIEW_BG || (opt.OVERVIEW_MODE2 && opt.SHOW_WS_PREVIEW_BG && opt.STATIC_WS_SWITCHER_BG);
    }

    updateBackgroundsConfiguration() {
        // Ensure that overview backgrounds are ready when needed
        const bgManagerNeeded = this._shouldCreateBackground();
        if (!this._vshellBackgroundGroup && bgManagerNeeded) {
            this.setBackground();
        } else if (this._bgManagers && !bgManagerNeeded) {
            this._destroyBackgroundGroup();
            return;
        }

        this._restackOverviewGroup();
        if (!Main.layoutManager._startingUp && this._vshellBackgroundGroup.opacity !== 255)
            this._vshellBackgroundGroup.opacity = 255;
    }

    _restackOverviewGroup() {
        if (!this._vshellBackgroundGroup)
            return;

        const overviewGroup = Main.layoutManager.overviewGroup;
        overviewGroup.set_child_below_sibling(this._vshellBackgroundGroup, Main.overview._overview);

        if (!this._vshellBackgroundGroup)
            return;

        // Keep the background actors
        // at the bottom of the overviewGroup stack
        overviewGroup.get_children().forEach(w => {
            if (w.name === VSHELL_GROUP_NAME)
                Main.layoutManager.overviewGroup.set_child_at_index(w, 0);
        });
        overviewGroup.get_children().forEach(w => {
            // If Blur My Shell extension is enabled, move its background actors bellow our background actors
            // so the BMS could benefit from our workspace transition if ws preview background is disabled
            if (w.name === BMS_GROUP_NAME)
                overviewGroup.set_child_at_index(w, 0);
        });
    }

    setBackground() {
        this._destroyBackgroundGroup();
        if (!this._shouldCreateBackground())
            return;

        this._createBackgroundGroup();
        this._bgManagers = this._initializeBackgroundManagers();
        this._sortBgActorsStack();
    }

    _createBackgroundGroup() {
        const overviewGroup = Main.layoutManager.overviewGroup;
        this._vshellBackgroundGroup = new Meta.BackgroundGroup({
            name: VSHELL_GROUP_NAME,
            opacity: Main.layoutManager._startingUp ? 0 : 255,
        });
        overviewGroup.add_child(this._vshellBackgroundGroup);
        this._connectShell();
        this._restackOverviewGroup();
    }

    _initializeBackgroundManagers() {
        return Main.layoutManager.monitors.flatMap(monitor => this._createMonitorBackgrounds(monitor));
    }

    _getBaseBgManager(monitor) {
        let bgManagerBase = null;
        const baseBgManagerNeeded = !opt.SHOW_WS_PREVIEW_BG && opt.FAKE_BLUR_TRANSITION;
        if (baseBgManagerNeeded) {
            bgManagerBase = this._getNewBgManagerWithEffect(monitor);
            bgManagerBase._name = 'Base';
            bgManagerBase.backgroundActor.content.brightness = 1;
        }

        return bgManagerBase;
    }

    _getMainBgManager(monitor) {
        const manager = this._getNewBgManagerWithEffect(monitor);
        manager._name = opt.FAKE_BLUR_TRANSITION ? 'Window-Picker' : 'Overview Wallpaper';

        manager._overviewStateConId = this._stateAdjustment.connect('notify::value', stateAdjustment =>
            this._updateBackground(manager, stateAdjustment));

        manager._bgChangedId = manager.connect('changed', bgManager => {
            // Wait until the background image is fully replaced
            GLib.idle_add(GLib.PRIORITY_LOW, () => {
                this._sortBgActorsStack();
                this._updateBackground(bgManager, this._stateAdjustment);
            });
        });

        return manager;
    }

    _getAppGridBgManager(monitor, primary) {
        let bgManager = null;
        // If opt.APP_GRID_BG_BLUR_SIGMA === opt.OVERVIEW_BG_BLUR_SIGMA
        // we don't need another background actor
        if (opt.FAKE_BLUR_TRANSITION && (opt.APP_GRID_BG_BLUR_SIGMA !== opt.OVERVIEW_BG_BLUR_SIGMA || opt.OVERVIEW_MODE2)) {
            bgManager = this._getNewBgManagerWithEffect(monitor);
            bgManager._name = 'App-Grid';
            bgManager._primary = primary;
        }

        return bgManager;
    }

    _getNewBgManagerWithEffect(monitor) {
        const bgManager = new Background.BackgroundManager({
            monitorIndex: monitor.index,
            container: this._vshellBackgroundGroup,
            vignette: true,
        });
        bgManager.backgroundActor.content.brightness = 1;
        bgManager.backgroundActor.content.vignette_sharpness = 0;
        bgManager.backgroundActor.connect('destroy', actor => {
            const blurEffect = actor.get_effect('blur');
            if (blurEffect) {
                actor.remove_effect(blurEffect);
                this._unusedBlurEffects.push(blurEffect);
            }
        });

        return bgManager;
    }

    _createMonitorBackgrounds(monitor) {
        const isPrimary = monitor.index === global.display.get_primary_monitor();

        // Applying a single blur effect with varying blur radius can be resource-intensive,
        // causing stuttering in overview animations.
        // To optimize performance, we create multiple differently blurred background layers
        // and use opacity transitions between them. This approach is more efficient
        // for the graphics card, resulting in smoother animations.
        // But we still support direct radius control as an option
        const bgManagerMain = this._getMainBgManager(monitor);
        const bgManagerBase = this._getBaseBgManager(monitor);
        const bgManagerAppGrid = this._getAppGridBgManager(monitor, isPrimary);

        bgManagerMain._primary = isPrimary;
        bgManagerMain._bgManagerBase = bgManagerBase;
        bgManagerMain._bgManagerAppGrid = bgManagerAppGrid;

        let bgManagers = [bgManagerBase, bgManagerMain, bgManagerAppGrid].filter(bgm => !!bgm);

        this._updateBackground(bgManagerMain, this._stateAdjustment);
        if (isPrimary) { // Needed when switching search from the app grid
            this._bgManagerMain = bgManagerMain;
            bgManagerMain.connect('destroy', () => {
                delete this._bgManagerMain;
            });
        }
        return bgManagers;
    }

    _sortBgActorsStack() {
        // Set background actors name
        // every time the actors are replaced
        this._bgManagers.forEach(bgManager => {
            bgManager.backgroundActor.name = bgManager._name;
        });

        // Sort background actors
        // every time the actors are replaced
        this._vshellBackgroundGroup.get_children().forEach(actor => {
            if (actor?.name === 'App-Grid')
                this._vshellBackgroundGroup.set_child_above_sibling(actor, null);
            else if (actor?.name === 'Base')
                this._vshellBackgroundGroup.set_child_below_sibling(actor, null);
        });
    }

    _updateBackground(bgManager, stateAdjustment, resetWindowPicker) {
        const staticWorkspace = opt.OVERVIEW_MODE2 && !opt.WORKSPACE_MODE;
        const searchActive = this._controls._searchInProgress;
        const { currentState, initialState, finalState } = stateAdjustment.getStateTransitionParams();
        const fullTransition = Math.abs(finalState - initialState) > 1;

        // In case when we only need the background for the Static Workspace overview
        // (SHOW_WS_PREVIEW_BG && STATIC_WS_SWITCHER_BG),
        // it needs to be hidden immediately when we leave the state
        if (!opt.SHOW_BG_IN_OVERVIEW && opt.SHOW_WS_PREVIEW_BG && (opt.WORKSPACE_MODE || currentState > 1 || fullTransition)) {
            this._vshellBackgroundGroup.visible = false;
            return;
        } else {
            this._vshellBackgroundGroup.visible = true;
        }

        const stateValue =
            opt.FAKE_BLUR_TRANSITION ||
            (opt.SHOW_WS_PREVIEW_BG && currentState < ControlsState.WINDOW_PICKER)
                ? Math.ceil(currentState)
                : currentState;

        if (!opt.SHOW_BG_IN_OVERVIEW && !opt.SHOW_WS_PREVIEW_BG) {
            if (!(staticWorkspace && stateValue <= 1))
                this._fadeWallpaper(bgManager, stateValue, staticWorkspace);
        } else {
            const targetBg = currentState > 1 && bgManager._bgManagerAppGrid ? bgManager._bgManagerAppGrid : bgManager;
            this._setBgBrightness(targetBg, currentState, staticWorkspace, searchActive, fullTransition);

            if (opt.OVERVIEW_BG_BLUR_SIGMA || opt.APP_GRID_BG_BLUR_SIGMA)
                this._setBlurEffect(targetBg, stateValue, staticWorkspace, searchActive, fullTransition);

            let progress = opt.SHOW_WS_PREVIEW_BG && currentState <= 1 ? 1 : currentState;
            if (opt.FAKE_BLUR_TRANSITION) {
                bgManager.backgroundActor.opacity = Math.min(progress, 1) * 255;
                bgManager._bgManagerAppGrid?.backgroundActor.set_opacity(Math.max(progress - 1, 0) * 255);
            }

            // Reset the overview layer effects when transition between the static workspace and app grid states
            if (opt.FAKE_BLUR_TRANSITION && opt.SHOW_BG_IN_OVERVIEW && opt.SHOW_WS_PREVIEW_BG &&
                staticWorkspace && stateValue > ControlsState.WINDOW_PICKER && !fullTransition
            ) {
                this._setBgBrightness(bgManager, currentState, staticWorkspace, searchActive, fullTransition);
                this._setBlurEffect(bgManager, stateValue, staticWorkspace, searchActive, fullTransition);
            } else if (resetWindowPicker || (opt.FAKE_BLUR_TRANSITION && opt.SHOW_BG_IN_OVERVIEW &&
                !opt.SHOW_WS_PREVIEW_BG && staticWorkspace && stateValue > ControlsState.WINDOW_PICKER && !fullTransition)
            ) {
                this._setBgBrightness(bgManager, 1, staticWorkspace, searchActive, fullTransition);
                this._setBlurEffect(bgManager, 1, staticWorkspace, searchActive, fullTransition);
            }
        }
    }

    _setBgBrightness(bgManager, stateValue, staticWorkspace, searchActive, fullTransition) {
        if (!opt.SHOW_BG_IN_OVERVIEW) {
            bgManager.backgroundActor.content.brightness = 1;
            return;
        }
        let overviewBrightness =
            staticWorkspace && ((!opt.FAKE_BLUR_TRANSITION && !opt.SHOW_WS_PREVIEW_BG) ||
            (stateValue <= ControlsState.WINDOW_PICKER) && (!fullTransition || !opt.SHOW_WS_PREVIEW_BG))
                ? 1
                : opt.OVERVIEW_BG_BRIGHTNESS;

        // If search is triggered during the overview show animation,
        // apply the search brightness instead of the window picker brightness.
        //
        // Issue:
        //     When using fast transitions between different layers, the brightness will be applied
        //     to the wrong background layer, which will affect the reversed transition.
        // Fixed:
        //     Reset the layer brightness in _updateBackground() when called from _onSearchChanged() with the resetWindowPicker argument
        if (bgManager._primary && !staticWorkspace && searchActive && stateValue <= ControlsState.WINDOW_PICKER)
            overviewBrightness = opt.SEARCH_BG_BRIGHTNESS;

        let secBrightness = searchActive && !opt.SEARCH_RESULTS_BG_STYLE ? opt.SEARCH_BG_BRIGHTNESS : opt.APP_GRID_BG_BRIGHTNESS;
        if ((staticWorkspace && !Main.overview._overview.controls._appDisplay.visible && !searchActive) ||
            (searchActive && opt.SEARCH_RESULTS_BG_STYLE && !Main.overview.dash.showAppsButton.checked))
            secBrightness = overviewBrightness;

        let brightness = 1;

        if (stateValue > 0 && stateValue <= 1 && opt.SHOW_WS_PREVIEW_BG/* && !staticWorkspace*/)
            brightness = overviewBrightness;
        else if (stateValue === 1 || (stateValue > 1 && !bgManager._primary))
            brightness = overviewBrightness;
        else if (stateValue === 0)
            brightness = 1;
        else if (stateValue < 1)
            brightness = Util.lerp(1, overviewBrightness, stateValue);
        else if (stateValue > 1 && bgManager._primary)
            brightness = Util.lerp(overviewBrightness, secBrightness, stateValue - 1);

        bgManager.backgroundActor.content.brightness = brightness;
    }

    _getRadiusProperty(blurEffect) {
        return blurEffect.sigma === undefined ? 'radius' : 'sigma';
    }

    _setBlurEffect(bgManager, stateValue, staticWorkspace, searchActive, fullTransition) {
        const blurEffect = this._getBlurEffect(bgManager);
        const radiusProperty = this._getRadiusProperty(blurEffect);

        let overviewBlurRadius =
            staticWorkspace && ((!opt.FAKE_BLUR_TRANSITION && !opt.SHOW_WS_PREVIEW_BG) ||
            (stateValue <= ControlsState.WINDOW_PICKER) && (!fullTransition || !opt.SHOW_WS_PREVIEW_BG))
                ? 0
                : opt.OVERVIEW_BG_BLUR_SIGMA;

        // If search is triggered during the overview show animation,
        // apply the search/appGrid blur instead of the window picker blur.
        //
        // Issue:
        //     When using fast transitions between different layers, the blur will be applied
        //     to the wrong background layer, which will affect the reversed transition.
        // Fixed:
        //     Reset the layer blur in _updateBackground()
        //     when called from _onSearchChanged() with the resetWindowPicker argument
        if (bgManager._primary && !staticWorkspace && searchActive && stateValue <= ControlsState.WINDOW_PICKER)
            overviewBlurRadius = opt.APP_GRID_BG_BLUR_SIGMA;

        const appGridBlurRadius =
            (searchActive && opt.SEARCH_RESULTS_BG_STYLE && !Main.overview.dash.showAppsButton.checked) ||
            (staticWorkspace && !blurEffect[radiusProperty] && !Main.overview._overview.controls._appDisplay.visible)
                ? overviewBlurRadius
                : opt.APP_GRID_BG_BLUR_SIGMA;

        let radius;
        if (stateValue < 1)
            radius = Math.round(Util.lerp(0, overviewBlurRadius, stateValue));
        else if (stateValue > 1 && bgManager._primary)
            radius = Math.round(Util.lerp(overviewBlurRadius, appGridBlurRadius, stateValue - 1));
        else
            radius = overviewBlurRadius;

        if (blurEffect[radiusProperty] !== radius)
            blurEffect[radiusProperty] = radius;

        // Setting the blurred background actors' z_position above 0 seems to fix
        // the glitching issue that occurs when the blur effect is applied
        // while multiple monitors are connected
        bgManager.backgroundActor.z_position = radius ? 0.1 : 0;
    }

    _fadeWallpaper(bgManager, stateValue, staticWorkspace) {
        let value = staticWorkspace && stateValue > 1 ? stateValue - 1 : stateValue;
        bgManager.backgroundActor.opacity = 0;
        bgManager._bgManagerAppGrid?.backgroundActor.set_opacity(0);
        bgManager = opt.FAKE_BLUR_TRANSITION ? bgManager._bgManagerBase : bgManager;
        bgManager.backgroundActor.set_opacity(Util.lerp(255, 0, Math.min(value, 1)));
    }

    _getBlurEffect(bgManager) {
        let blurEffect = bgManager.backgroundActor.get_effect('blur');
        if (!blurEffect) {
            if (this._unusedBlurEffects.length) {
                blurEffect = this._unusedBlurEffects[0];
                blurEffect[this._getRadiusProperty(blurEffect)] = 0;
                this._unusedBlurEffects.shift();
            } else {
                blurEffect = new Shell.BlurEffect({ brightness: 1, mode: Shell.BlurMode.ACTOR });
            }
            bgManager.backgroundActor.add_effect_with_name('blur', blurEffect);
        }
        return blurEffect;
    }

    resetMainBackground(searchActive) {
        if (this._bgManagerMain)
            this._updateBackground(this._bgManagerMain, this._stateAdjustment, !searchActive && opt.FAKE_BLUR_TRANSITION);
    }

    runStartupAnimation() {
        if (!this._vshellBackgroundGroup)
            return;

        this._vshellBackgroundGroup.ease({
            duration: 500,
            opacity: 255,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onStopped: () => {
                this._vshellBackgroundGroup.opacity = 255;
            },
        });
    }
}
