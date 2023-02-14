/**
 * Vertical Workspaces
 * search.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2023
 * @license    GPL-3.0
 *
 */

'use strict';

const Main = imports.ui.main;

const Me = imports.misc.extensionUtils.getCurrentExtension();

let opt;

let SEARCH_MAX_WIDTH;

function update(reset = false) {
    opt = Me.imports.settings.opt;
    _updateSearchViewWidth(reset);

    if (reset) {
        Main.overview.searchEntry.visible = true;
        Main.overview.searchEntry.opacity = 255;
        opt = null;
    }
}

function _updateSearchViewWidth(reset = false) {
    const searchContent = Main.overview._overview._controls.layoutManager._searchController._searchResults._content;
    if (!SEARCH_MAX_WIDTH) { // just store original value;
        const themeNode = searchContent.get_theme_node();
        const width = themeNode.get_max_width();
        SEARCH_MAX_WIDTH = width;
    }

    if (reset) {
        searchContent.set_style('');
    } else {
        let width = Math.round(SEARCH_MAX_WIDTH * opt.SEARCH_VIEW_SCALE);
        searchContent.set_style(`max-width: ${width}px;`);
    }
}
