/**
 * Vertical Workspaces
 * windowAttentionHandler.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2023
 * @license    GPL-3.0
 *
 */

'use strict';

const Main = imports.ui.main;
const WindowAttentionHandler = imports.ui.windowAttentionHandler;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const _Util = Me.imports.util;

let opt;


function update(reset = false) {
    if (reset) {
        _updateConnections(reset);
        opt = null;
        return;
    }

    opt = Me.imports.settings.opt;
    _updateConnections();
}

function _updateConnections(reset) {
    global.display.disconnectObject(Main.windowAttentionHandler);

    const handlerFnc = reset
        ? WindowAttentionHandler.WindowAttentionHandler.prototype._onWindowDemandsAttention
        : _onWindowDemandsAttention;

    global.display.connectObject(
        'window-demands-attention', handlerFnc.bind(Main.windowAttentionHandler),
        'window-marked-urgent', handlerFnc.bind(Main.windowAttentionHandler),
        Main.windowAttentionHandler);
}

function _onWindowDemandsAttention(display, window) {
    if (opt.WINDOW_ATTENTION_FOCUS_IMMEDIATELY)
        Main.activateWindow(window);
    // Deny attention notifications if the App Grid is open, to avoid notification spree when opening a folder
    // or if user disabled them
    else if (!((Main.overview._shown && Main.overview.dash.showAppsButton.checked) || opt.WINDOW_ATTENTION_DISABLE_NOTIFICATIONS))
        Main.windowAttentionHandler._onWindowDemandsAttention(display, window);
}
