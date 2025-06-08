/**
 * V-Shell (Vertical Workspaces)
 * search.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2025
 * @license    GPL-3.0
 *
 */

'use strict';

import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import Shell from 'gi://Shell';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Search from 'resource:///org/gnome/shell/ui/search.js';
import * as AppDisplay from 'resource:///org/gnome/shell/ui/appDisplay.js';

import * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';
import { Highlighter } from 'resource:///org/gnome/shell/misc/util.js';

let Me;
// gettext
let _;
let opt;

const SEARCH_MAX_WIDTH = 1104;
const SEARCH_RESULTS_PADDING = 32;

export const SearchModule = class {
    constructor(me) {
        Me = me;
        opt = Me.opt;
        _  = Me.gettext;

        this._firstActivation = true;
        this.moduleEnabled = false;
        this._overrides = null;
    }

    cleanGlobals() {
        Me = null;
        opt = null;
        _ = null;
    }

    update(reset) {
        this.moduleEnabled = opt.get('searchModule');
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
            console.debug('  SearchModule - Keeping untouched');
    }

    _activateModule() {
        this._updateSearchViewWidth();

        if (!this._overrides)
            this._overrides = new Me.Util.Overrides();

        this._overrides.addOverride('AppSearchProvider', AppDisplay.AppSearchProvider.prototype, AppSearchProvider);
        this._overrides.addOverride('SearchResult', Search.SearchResult.prototype, SearchResult);
        this._overrides.addOverride('SearchResultsView', Search.SearchResultsView.prototype, SearchResultsView);
        this._overrides.addOverride('ListSearchResults', Search.ListSearchResults.prototype, ListSearchResults);
        this._overrides.addOverride('ListSearchResult', Search.ListSearchResult.prototype, ListSearchResultOverride);
        this._overrides.addOverride('Highlighter', Highlighter.prototype, HighlighterOverride);

        // Don't expand the search view vertically and align it to the top
        // this is important in the static workspace mode when the search view bg is not transparent
        // also the "Searching..." and "No Results" notifications will be closer to the search entry, with the distance given by margin-top in the stylesheet
        Main.overview.searchController.y_align = Clutter.ActorAlign.START;
        // Increase the maxResults for app search so that it can show more results in case the user decreases the size of the result icon
        const appSearchDisplay = Main.overview.searchController._searchResults._providers.filter(p => p.id === 'applications')[0]?.display;
        if (appSearchDisplay)
            appSearchDisplay._maxResults = 12;
        console.debug('  SearchModule - Activated');
    }

    _disableModule() {
        const reset = true;

        const searchResults = Main.overview.searchController._searchResults;
        if (searchResults?._searchTimeoutId) {
            GLib.source_remove(searchResults._searchTimeoutId);
            searchResults._searchTimeoutId = 0;
        }

        this._updateSearchViewWidth(reset);

        if (this._overrides)
            this._overrides.removeAll();
        this._overrides = null;

        Main.overview.searchController.y_align = Clutter.ActorAlign.FILL;

        console.debug('  WorkspaceSwitcherPopupModule - Disabled');
    }

    _updateSearchViewWidth(reset = false) {
        const searchResults = Main.overview.searchController._searchResults;
        const searchContent = searchResults._content;

        if (reset) {
            searchContent.set_style('');
            searchResults.set_style('');
        } else {
            let width = SEARCH_MAX_WIDTH;
            if (Me.Util.monitorHasLowResolution())
                width = Math.round(width * 0.8);
            width = Math.round(width * opt.SEARCH_VIEW_SCALE);
            searchContent.set_style(`max-width: ${width}px;`);
            // Since we added a background style controller to searchResults,
            // we also need to control its width.
            // The maximum width is managed by searchResults.vfunc_allocate().
            searchResults.set_style(`max-width: ${width + SEARCH_RESULTS_PADDING}px;`);
        }
    }
};

const ListSearchResults = {
    _getMaxDisplayedResults() {
        return opt.SEARCH_MAX_ROWS;
    },
};

// AppDisplay.AppSearchProvider
const AppSearchProvider = {
    getInitialResultSet(terms, cancellable) {
        // Defer until the parental controls manager is initialized, so the
        // results can be filtered correctly.
        if (!this._parentalControlsManager.initialized) {
            return new Promise(resolve => {
                let initializedId = this._parentalControlsManager.connect('app-filter-changed', async () => {
                    if (this._parentalControlsManager.initialized) {
                        this._parentalControlsManager.disconnect(initializedId);
                        resolve(await this.getInitialResultSet(terms, cancellable));
                    }
                });
            });
        }

        let pattern = terms.join(' ');

        let appInfoList = Shell.AppSystem.get_default().get_installed();

        let weightList = {};
        appInfoList = appInfoList.filter(appInfo => {
            try {
                appInfo.get_id(); // catch invalid file encodings
            } catch {
                return false;
            }

            let string = '';
            let name;
            let shouldShow = false;
            if (appInfo.get_display_name) {
                const cmd = appInfo.get_commandline();
                const isSettingsLauncher = cmd?.includes('gnome-control-center');
                // show only launchers that should be visible in this DE and Settings sections launchers if enabled
                shouldShow = (appInfo.should_show() && this._parentalControlsManager.shouldShowApp(appInfo)) ||
                    (opt.SEARCH_INCLUDE_SETTINGS && isSettingsLauncher);
                if (shouldShow) {
                    let id = appInfo.get_id().split('.');
                    id = id[id.length - 2] || '';
                    let baseName = appInfo.get_string('Name') || '';
                    let dispName = appInfo.get_display_name() || '';
                    let gName = appInfo.get_generic_name() || '';
                    let description = appInfo.get_description() || '';
                    let categories = appInfo.get_string('Categories')?.replace(/;/g, ' ') || '';
                    let keywords = appInfo.get_string('Keywords')?.replace(/;/g, ' ') || '';
                    name = `${dispName} ${id}`;
                    let packageType = '';
                    if (cmd?.includes('snapd'))
                        packageType += ' !Snap!';
                    else if (cmd?.includes('flatpak'))
                        packageType += ' !Flatpak!';
                    else if (cmd?.toLowerCase().includes('.appimage'))
                        packageType += ' !AppImage!';
                    string = `${dispName} ${gName} ${baseName} ${description} ${categories} ${keywords} ${id} ${packageType}`;
                }
            }

            let m = -1;
            if (shouldShow && opt.SEARCH_FUZZY) {
                m = Me.Util.fuzzyMatch(pattern, name);
                m = (m + Me.Util.strictMatch(pattern, string)) / 2;
            } else if (shouldShow) {
                m = Me.Util.strictMatch(pattern, string);
            }

            if (m !== -1)
                weightList[appInfo.get_id()] = m;

            return shouldShow && (m !== -1);
        });

        appInfoList.sort((a, b) => weightList[a.get_id()] > weightList[b.get_id()]);

        const usage = Shell.AppUsage.get_default();
        // sort apps by usage list
        appInfoList.sort((a, b) => usage.compare(a.get_id(), b.get_id()));
        // prefer apps where any word in their name starts with the pattern
        appInfoList.sort((a, b) => Me.Util.isMoreRelevant(a.get_display_name(), b.get_display_name(), pattern));

        let results = appInfoList.map(app => app.get_id());

        if (opt.SEARCH_APP_GRID_MODE && Main.overview.dash.showAppsButton.checked)
            this._filterAppGrid(results);

        let sysActionList = Array.from(this._systemActions._actions.keys());
        const match = opt.SEARCH_FUZZY ? Me.Util.fuzzyMatch : Me.Util.strictMatch;
        pattern = pattern.replace(/^\.\./, '');
        sysActionList = sysActionList.filter(id =>
            match(pattern, `${this._systemActions.getName(id)} ${this._systemActions._actions.get(id).keywords.join(' ')}`) > -1
        );
        sysActionList.sort((a, b) => Me.Util.isMoreRelevant(
            `${this._systemActions.getName(a)} ${this._systemActions._actions.get(a).keywords.join(' ')}`,
            `${this._systemActions.getName(b)} ${this._systemActions._actions.get(a).keywords.join(' ')}`,
            pattern)
        );

        results = results.concat(sysActionList);
        return new Promise(resolve => resolve(results));
    },

    _filterAppGrid(results) {
        const appDisplay = Main.overview._overview.controls._appDisplay;
        let icons = appDisplay._orderedItems;
        icons.forEach(icon => {
            icon.visible = true;
        });
        appDisplay._redisplay(results);
        icons = appDisplay._orderedItems;
        icons.forEach(icon => {
            icon.visible = results.includes(icon.id);
        });
    },

    // App search result size
    createResultObject(resultMeta) {
        let iconSize = opt.SEARCH_ICON_SIZE;
        if (!iconSize) {
            iconSize = Me.Util.monitorHasLowResolution()
                ? 64
                : 96;
        }

        if (resultMeta.id.endsWith('.desktop')) {
            const icon = new AppDisplay.AppIcon(this._appSys.lookup_app(resultMeta['id']), {
                expandTitleOnHover: false,
            });
            icon.icon.setIconSize(iconSize);
            return icon;
        } else {
            this._iconSize = iconSize;
            return new SystemActionIcon(this, resultMeta);
        }
    },
};

const SystemActionIcon = GObject.registerClass({
    // Registered name should be unique
    GTypeName: `SystemAction${Math.floor(Math.random() * 1000)}`,
}, class SystemActionIcon extends Search.GridSearchResult {
    _init(provider, metaInfo, resultsView) {
        super._init(provider, metaInfo, resultsView);
        this.icon._setSizeManually = true;
        this.icon.setIconSize(provider._iconSize);
    }

    activate() {
        SystemActions.getDefault().activateAction(this.metaInfo['id']);
        Main.overview.hide();
    }
});

const SearchResult = {
    activate() {
        this.provider.activateResult(this.metaInfo.id, this._resultsView.terms);

        if (this.metaInfo.clipboardText) {
            St.Clipboard.get_default().set_text(
                St.ClipboardType.CLIPBOARD, this.metaInfo.clipboardText);
        }
        // don't close overview if Shift key is pressed - Shift moves windows to the workspace
        if (!Me.Util.isShiftPressed())
            Main.overview.toggle();
    },
};

const SearchResultsView = {
    setTerms(terms) {
        // Check for the case of making a duplicate previous search before
        // setting state of the current search or cancelling the search.
        // This will prevent incorrect state being as a result of a duplicate
        // search while the previous search is still active.
        let searchString = terms.join(' ');
        let previousSearchString = this._terms.join(' ');
        if (searchString === previousSearchString)
            return;

        this._startingSearch = true;

        this._cancellable.cancel();
        this._cancellable.reset();

        if (terms.length === 0) {
            this._reset();
            return;
        }

        let isSubSearch = false;
        if (this._terms.length > 0)
            isSubSearch = searchString.indexOf(previousSearchString) === 0;

        this._terms = terms;
        this._isSubSearch = isSubSearch;
        this._updateSearchProgress();

        if (!this._searchTimeoutId)
            this._searchTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, opt.SEARCH_DELAY, this._onSearchTimeout.bind(this));

        this._highlighter = new Highlighter(this._terms);

        this.emit('terms-changed');
    },

    _doSearch() {
        this._startingSearch = false;

        let previousResults = this._results;
        this._results = {};

        const term0 = this._terms[0];
        const onlySupportedProviders = term0.startsWith(Me.WSP_PREFIX) || term0.startsWith(Me.ESP_PREFIX) || term0.startsWith(Me.RFSP_PREFIX);

        this._providers.forEach(provider => {
            const supportedProvider = ['open-windows', 'extensions', 'recent-files'].includes(provider.id);
            if (!onlySupportedProviders || (onlySupportedProviders && supportedProvider)) {
                let previousProviderResults = previousResults[provider.id];
                this._doProviderSearch(provider, previousProviderResults);
            } else {
                // hide unwanted providers, they will show() automatically when needed
                provider.display.visible = false;
            }
        });

        this._updateSearchProgress();
        this._clearSearchTimeout();
    },

    _updateSearchProgress() {
        let haveResults = this._providers.some(provider => {
            let display = provider.display;
            return display.getFirstResult() !== null;
        });

        this._scrollView.visible = haveResults;
        this._statusBin.visible = !haveResults;

        if (!haveResults) {
            if (this.searchInProgress)
                this._statusText.set_text(_('Searching…'));
            else
                this._statusText.set_text(_('No results.'));
        }
    },

    _setSelectedAppGridIcon() {
        const appDisplay = Main.overview._overview.controls._appDisplay;
        // Remove the "selected" style from the previously selected icon, without knowing which one it is
        appDisplay._orderedItems.forEach(icon => icon.remove_style_pseudo_class('selected'));

        // Ignore System and GNOME Settings results
        const filteredResults = this._providers[0].display._grid?.get_children().filter(result =>
            result.app?.app_info.get_executable() !== 'gnome-control-center'
        );
        const firstResultId = filteredResults[0]?.id;
        // Find icon which should be selected
        for (const icon of appDisplay._orderedItems) {
            if (icon.id === firstResultId) {
                // Add the "selected" style to the current default search result
                icon.add_style_pseudo_class('selected');
                this._defaultResult = icon;
                break;
            }
        }
    },

    _maybeSetInitialSelection() {
        let newDefaultResult = null;

        let providers = this._providers;
        for (let i = 0; i < providers.length; i++) {
            let provider = providers[i];
            let display = provider.display;

            if (!display.visible)
                continue;

            let firstResult = display.getFirstResult();
            if (firstResult) {
                newDefaultResult = firstResult;
                break; // select this one!
            }
        }

        if (newDefaultResult !== this._defaultResult) {
            if (opt.SEARCH_APP_GRID_MODE && Main.overview.dash.showAppsButton.checked) {
                this._setSelectedAppGridIcon();
            } else {
                this._setSelected(this._defaultResult, false);
                this._setSelected(newDefaultResult, this._highlightDefault);

                this._defaultResult = newDefaultResult;
            }
        }
    },

    highlightDefault(highlight) {
        if (opt.SEARCH_APP_GRID_MODE && Main.overview.dash.showAppsButton.checked) {
            if (this._results.applications && highlight)
                this._setSelectedAppGridIcon();
        } else {
            this._highlightDefault = highlight;
            this._setSelected(this._defaultResult, highlight);
        }
    },

    navigateFocus(direction) {
        const searchResults = opt.SEARCH_APP_GRID_MODE && Main.overview.dash.showAppsButton.checked
            ? Main.overview._overview.controls._appDisplay
            : this;
        if (searchResults !== this)
            this._defaultResult.remove_style_pseudo_class('selected');
        let rtl = this.get_text_direction() === Clutter.TextDirection.RTL;
        if (direction === St.DirectionType.TAB_BACKWARD ||
            direction === (rtl
                ? St.DirectionType.RIGHT
                : St.DirectionType.LEFT) ||
            direction === St.DirectionType.UP) {
            searchResults.navigate_focus(null, direction, false);
            return;
        }

        const from = this._defaultResult ?? null;
        searchResults.navigate_focus(from, direction, false);
    },

    // Control the width of searchResults via CSS
    // so we can style its background using this widget
    vfunc_allocate(box) {
        let themeNode = this.get_theme_node();
        let maxWidth = themeNode.get_max_width();
        let availWidth = box.x2 - box.x1;
        let adjustedBox = box;

        if (availWidth > maxWidth) {
            let excessWidth = availWidth - maxWidth;
            adjustedBox.x1 += Math.floor(excessWidth / 2);
            adjustedBox.x2 -= Math.floor(excessWidth / 2);
        }

        St.BoxLayout.prototype.vfunc_allocate.bind(this)(adjustedBox);
    },
};

// Add highlighting of the "name" part of the result for all providers
const ListSearchResultOverride = {
    _highlightTerms() {
        let markup = this._resultsView.highlightTerms(this.metaInfo['name']);
        this.label_actor.clutter_text.set_markup(markup);
        markup = this._resultsView.highlightTerms(this.metaInfo['description'].split('\n')[0]);
        this._descriptionLabel.clutter_text.set_markup(markup);
    },
};

const  HighlighterOverride = {
    /**
     * @param {?string[]} terms - list of terms to highlight
     */
    /* constructor(terms) {
        if (!terms)
            return;

        const escapedTerms = terms
            .map(term => Shell.util_regex_escape(term))
            .filter(term => term.length > 0);

        if (escapedTerms.length === 0)
            return;

        this._highlightRegex = new RegExp(
            `(${escapedTerms.join('|')})`, 'gi');
    },*/

    /**
     * Highlight all occurences of the terms defined for this
     * highlighter in the provided text using markup.
     *
     * @param {string} text - text to highlight the defined terms in
     * @returns {string}
     */
    highlight(text, options) {
        if (!this._highlightRegex)
            return GLib.markup_escape_text(text, -1);

        // force use local settings if the class is overridden by another extension (WSP, ESP)
        const o = options || opt;
        let escaped = [];
        let lastMatchEnd = 0;
        let match;
        let style = ['', ''];
        if (o.HIGHLIGHT_DEFAULT)
            style = ['<b>', '</b>'];
        // The default highlighting by the bold style causes text to be "randomly" ellipsized in cases where it's not necessary
        // and also blurry
        // Underscore doesn't affect label size and all looks better
        else if (o.HIGHLIGHT_UNDERLINE)
            style = ['<u>', '</u>'];

        while ((match = this._highlightRegex.exec(text))) {
            if (match.index > lastMatchEnd) {
                let unmatched = GLib.markup_escape_text(
                    text.slice(lastMatchEnd, match.index), -1);
                escaped.push(unmatched);
            }
            let matched = GLib.markup_escape_text(match[0], -1);
            escaped.push(`${style[0]}${matched}${style[1]}`);
            lastMatchEnd = match.index + match[0].length;
        }
        let unmatched = GLib.markup_escape_text(
            text.slice(lastMatchEnd), -1);
        escaped.push(unmatched);
        return escaped.join('');
    },
};
