/**
 * V-Shell (Vertical Workspaces)
 * search.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2024
 * @license    GPL-3.0
 *
 */

'use strict';

const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
const Shell = imports.gi.Shell;
const St = imports.gi.St;

const AppDisplay = imports.ui.appDisplay;
const IconGrid = imports.ui.iconGrid;
const Main = imports.ui.main;
const Search = imports.ui.search;
const { Highlighter } = imports.misc.util;

let Me;
// gettext
let _;
let opt;


let SEARCH_MAX_WIDTH;

var SearchModule = class {
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
        this._overrides.addOverride('ListSearchResult', Search.ListSearchResult.prototype, ListSearchResultOverride);
        this._overrides.addOverride('Highlighter', Highlighter.prototype, HighlighterOverride);
        // Don't expand the search view vertically and align it to the top
        // this is important in the static workspace mode when the search view bg is not transparent
        // also the "Searching..." and "No Results" notifications will be closer to the search entry, with the distance given by margin-top in the stylesheet
        Main.overview._overview._controls._searchController.y_align = Clutter.ActorAlign.START;
        console.debug('  SearchModule - Activated');
    }

    _disableModule() {
        const reset = true;

        const searchResults = Main.overview._overview.controls._searchController._searchResults;
        if (searchResults?._searchTimeoutId) {
            GLib.source_remove(searchResults._searchTimeoutId);
            searchResults._searchTimeoutId = 0;
        }

        this._updateSearchViewWidth(reset);

        if (this._overrides)
            this._overrides.removeAll();
        this._overrides = null;

        Main.overview._overview._controls._searchController.y_align = Clutter.ActorAlign.FILL;


        console.debug('  WorkspaceSwitcherPopupModule - Disabled');
    }

    _updateSearchViewWidth(reset = false) {
        const searchContent = Main.overview._overview._controls._searchController._searchResults._content;
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
};

// AppDisplay.AppSearchProvider
const AppSearchProvider = {
    getInitialResultSet(terms, callback, cancellable) {
        // Defer until the parental controls manager is initialized, so the
        // results can be filtered correctly.
        if (!this._parentalControlsManager.initialized) {
            if (Me.shellVersion < 43) {
                let initializedId = this._parentalControlsManager.connect('app-filter-changed', () => {
                    if (this._parentalControlsManager.initialized) {
                        this._parentalControlsManager.disconnect(initializedId);
                        this.getInitialResultSet(terms, callback, cancellable);
                    }
                });
                return null;
            } else {
                // callback has been removed in 43
                cancellable = callback;
                return new Promise(resolve => {
                    let initializedId = this._parentalControlsManager.connect('app-filter-changed', async () => {
                        if (this._parentalControlsManager.initialized) {
                            this._parentalControlsManager.disconnect(initializedId);
                            resolve(await this.getInitialResultSet(terms, cancellable));
                        }
                    });
                });
            }
        }

        const pattern = terms.join(' ');

        let appInfoList = Shell.AppSystem.get_default().get_installed();

        let weightList = {};
        appInfoList = appInfoList.filter(appInfo => {
            try {
                appInfo.get_id(); // catch invalid file encodings
            } catch (e) {
                return false;
            }

            let string = '';
            let name;
            let shouldShow = false;
            if (appInfo.get_display_name) {
                // show only launchers that should be visible in this DE
                shouldShow = appInfo.should_show() && this._parentalControlsManager.shouldShowApp(appInfo);

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
                    string = `${dispName} ${gName} ${baseName} ${description} ${categories} ${keywords} ${id}`;
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

        results = results.concat(this._systemActions.getMatchingActions(terms));

        if (Me.shellVersion < 43) {
            callback(results);
            return null;
        } else {
            return new Promise(resolve => resolve(results));
        }
    },

    // App search result size
    createResultObject(resultMeta) {
        if (resultMeta.id.endsWith('.desktop')) {
            const icon = new AppDisplay.AppIcon(this._appSys.lookup_app(resultMeta['id']), {
                expandTitleOnHover: false,
            });
            icon.icon.setIconSize(opt.SEARCH_ICON_SIZE);
            return icon;
        } else {
            const icon = new AppDisplay.SystemActionIcon(this, resultMeta);
            icon.icon._setSizeManually = true;
            icon.icon.setIconSize(opt.SEARCH_ICON_SIZE);
            return icon;
        }
    },
};

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
        // for GS42
        if (!this._doProviderSearch) {
            this._doSearchLegacy();
            return;
        }
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

    _doSearchLegacy() {
        this._startingSearch = false;

        let previousResults = this._results;
        this._results = {};

        const term0 = this._terms[0];
        const onlySupportedProviders = term0.startsWith(Me.WSP_PREFIX) || term0.startsWith(Me.ESP_PREFIX) || term0.startsWith(Me.RFSP_PREFIX);

        this._providers.forEach(provider => {
            const supportedProvider = ['open-windows', 'extensions', 'recent-files'].includes(provider.id);
            // if terms starts with search provider prefix, block all other providers
            if (!onlySupportedProviders || (onlySupportedProviders && supportedProvider)) {
                provider.searchInProgress = true;

                let previousProviderResults = previousResults[provider.id];
                if (this._isSubSearch && previousProviderResults) {
                    provider.getSubsearchResultSet(previousProviderResults,
                        this._terms,
                        results => {
                            this._gotResults(results, provider);
                        },
                        this._cancellable);
                } else {
                    provider.getInitialResultSet(this._terms,
                        results => {
                            this._gotResults(results, provider);
                        },
                        this._cancellable);
                }
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
