// Workspace Switcher Manager
// GPL v3 ©G-dH@Github.com
'use strict';

const { GLib } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const VerticalWorkspaces = Me.imports.verticalWorkspaces;

let enableTimeoutId = 0;

function init() {
    ExtensionUtils.initTranslations();
}

function enable() {
    VerticalWorkspaces.activate();
}

function disable() {
    VerticalWorkspaces.reset();
}
