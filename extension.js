// Vertical Workpaces
// GPL v3 ©G-dH@Github.com
'use strict';

const { GLib } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const VerticalWorkspaces = Me.imports.verticalWorkspaces;

let _enableTimeoutId = 0;

function init() {
    ExtensionUtils.initTranslations();
}

function enable() {
    _enableTimeoutId = GLib.timeout_add(
        GLib.PRIORITY_DEFAULT,
        700,
        () => {
            VerticalWorkspaces.activate();
            _enableTimeoutId = 0;
            return GLib.SOURCE_REMOVE;
        }
    );
}

function disable() {
    VerticalWorkspaces.reset();
    if (_enableTimeoutId) {
        GLib.source_remove(_enableTimeoutId);
        _enableTimeoutId = 0;
    }
}
