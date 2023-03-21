/**
 * V-Shell (Vertical Workspaces)
 * search.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2023
 * @license    GPL-3.0
 *
 */

'use strict';
const { Shell, Gio, St, Clutter } = imports.gi;
const Main = imports.ui.main;

const AppDisplay = imports.ui.appDisplay;
const Search = imports.ui.search;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const _Util = Me.imports.lib.util;

const _ = Me.imports.lib.settings._;
const shellVersion = _Util.shellVersion;

let opt;
let _overrides;
let _firstRun = true;

let SEARCH_MAX_WIDTH;

function update(reset = false) {
    opt = Me.imports.lib.settings.opt;
    const moduleEnabled = opt.get('searchModule', true);
    reset = reset || !moduleEnabled;

    // don't even touch this module if disabled
    if (_firstRun && reset)
        return;

    _firstRun = false;

    if (_overrides)
        _overrides.removeAll();

    _updateSearchViewWidth(reset);

    if (reset) {
        Main.overview.searchEntry.visible = true;
        Main.overview.searchEntry.opacity = 255;
        opt = null;
        _overrides = null;
        return;
    }

    _overrides = new _Util.Overrides();

    _overrides.addOverride('AppSearchProvider', AppDisplay.AppSearchProvider.prototype, AppSearchProvider);
    _overrides.addOverride('SearchResult', Search.SearchResult.prototype, SearchResult);
    _overrides.addOverride('SearchResultsView', Search.SearchResultsView.prototype, SearchResultsView);
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

// AppDisplay.AppSearchProvider
const AppSearchProvider = {
    getInitialResultSet(terms, callback, _cancellable) {
        // Defer until the parental controls manager is initialized, so the
        // results can be filtered correctly.
        if (!this._parentalControlsManager.initialized) {
            let initializedId = this._parentalControlsManager.connect('app-filter-changed', () => {
                if (this._parentalControlsManager.initialized) {
                    this._parentalControlsManager.disconnect(initializedId);
                    this.getInitialResultSet(terms, callback, _cancellable);
                }
            });
            return;
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
                    let dispName = appInfo.get_display_name() || '';
                    let gName = appInfo.get_generic_name() || '';
                    let description = appInfo.get_description() || '';
                    let categories = appInfo.get_string('Categories') || '';
                    let keywords = appInfo.get_string('Keywords') || '';
                    name = dispName;
                    string = `${dispName} ${gName} ${description} ${categories} ${keywords}`;
                }
            }

            let m = -1;
            if (shouldShow && opt.SEARCH_FUZZY) {
                m = _Util.fuzzyMatch(pattern, name);
                m = (m + _Util.strictMatch(pattern, string)) / 2;
            } else if (shouldShow) {
                m = _Util.strictMatch(pattern, string);
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
        appInfoList.sort((a, b) => _Util.isMoreRelevant(a.get_display_name(), b.get_display_name(), pattern));

        let results = appInfoList.map(app => app.get_id());

        results = results.concat(this._systemActions.getMatchingActions(terms));

        if (shellVersion < 43)
            callback(results);
        else
            return new Promise(resolve => resolve(results));
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
        if (!_Util.isShiftPressed())
            Main.overview.toggle();
    },
};

const SearchResultsView = {
    _updateSearchProgress() {
        let haveResults = this._providers.some(provider => {
            let display = provider.display;
            return display.getFirstResult() !== null;
        });

        this._scrollView.visible = haveResults;
        this._statusBin.visible = !haveResults;
        this._statusBin.y_align = Clutter.ActorAlign.CENTER;
        this.get_parent().y_align = Clutter.ActorAlign.START;

        const staticWorkspace = opt.OVERVIEW_MODE2 && !(opt.WORKSPACE_MODE || Main.overview._overview.controls._stateAdjustment.value === 2);
        if (!haveResults) {
            this.get_parent().y_align = Clutter.ActorAlign.CENTER;
            if (this.searchInProgress)
                this._statusText.set_text(_('Searching…'));
            else
                this._statusText.set_text(_('No results.'));
        } else {
            this._scrollView.y_expand = !staticWorkspace;
        }
    },
};
