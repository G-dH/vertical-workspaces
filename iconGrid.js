/**
 * Vertical Workspaces
 * iconGrid.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2023
 * @license    GPL-3.0
 *
 */

'use strict';

// ------------------ IconGrid - override -------------------------------------------------------------------------

// workaround - silence page -2 error on gnome 43 during cleaning appgrid

var IconGrid = {
    getItemsAtPage(page) {
        if (page < 0 || page > this.nPages)
            return [];
            // throw new Error(`Page ${page} does not exist at IconGrid`);

        const layoutManager = this.layout_manager;
        return layoutManager.getItemsAtPage(page);
    },
};
