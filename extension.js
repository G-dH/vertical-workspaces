/**
 * Vertical Workspaces
 * extension.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022
 * @license    GPL-3.0
 * used parts of https://github.com/RensAlthuis/vertical-overview extension
 */

'use strict';

const { GLib } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const VerticalWorkspaces = Me.imports.verticalWorkspaces;

let _enableTimeoutId = 0;

function init() {
    ExtensionUtils.initTranslations();
    // correct the view only after restart
    VerticalWorkspaces._correctInitialOverviewWsBug = true;
}

function enable() {
    // globally readable flag for other extensions
    global.verticalWorkspacesEnabled = true;

    _enableTimeoutId = GLib.timeout_add(
        GLib.PRIORITY_DEFAULT,
        200,
        () => {
            VerticalWorkspaces.activate();
            log(`${Me.metadata.name}: enabled`);
            _enableTimeoutId = 0;
            return GLib.SOURCE_REMOVE;
        }
    );
}

function disable() {
    if (_enableTimeoutId) {
        GLib.source_remove(_enableTimeoutId);
        _enableTimeoutId = 0;
    } else {
        VerticalWorkspaces.reset();
    }
    global.verticalWorkspacesEnabled = undefined;
    log(`${Me.metadata.name}: disabled`);
}
