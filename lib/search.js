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

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import Shell from 'gi://Shell';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Search from 'resource:///org/gnome/shell/ui/search.js';
import * as AppDisplay from 'resource:///org/gnome/shell/ui/appDisplay.js';

import * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';

let Me;
// gettext
let _;
let opt;

let SEARCH_MAX_WIDTH;

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
        // this._overrides.addOverride('ProviderInfo', Search.ProviderInfo.prototype, ProviderInfo);

        // Don't expand the search view vertically and align it to the top
        // this is important in the static workspace mode when the search view bg is not transparent
        // also the "Searching..." and "No Results" notifications will be closer to the search entry, with the distance given by margin-top in the stylesheet
        Main.overview._overview._controls.layoutManager._searchController.y_align = Clutter.ActorAlign.START;
        console.debug('  SearchModule - Activated');
    }

    _disableModule() {
        const reset = true;
        this._updateSearchViewWidth(reset);

        if (this._overrides)
            this._overrides.removeAll();
        this._overrides = null;

        Main.overview._overview._controls.layoutManager._searchController.y_align = Clutter.ActorAlign.FILL;


        console.debug('  WorkspaceSwitcherPopupModule - Disabled');
    }

    _updateSearchViewWidth(reset = false) {
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
                    let categories = appInfo.get_string('Categories') || '';
                    let keywords = appInfo.get_string('Keywords') || '';
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
            return new SystemActionIcon(this, resultMeta);
            // icon.icon._setSizeManually = true;
            // icon.icon.setIconSize(opt.SEARCH_ICON_SIZE);
            // return icon;
        }
    },
};

const SystemActionIcon = GObject.registerClass(
class SystemActionIcon extends Search.GridSearchResult {
    _init(provider, metaInfo, resultsView) {
        super._init(provider, metaInfo, resultsView);
        this.icon._setSizeManually = true;
        this.icon.setIconSize(opt.SEARCH_ICON_SIZE);
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
    _doSearch() {
        this._startingSearch = false;

        let previousResults = this._results;
        this._results = {};

        this._providers.forEach(provider => {
            const onlyVShellProviders = this._terms.includes('wq//') || this._terms.includes('fq//');
            if (!onlyVShellProviders || (onlyVShellProviders && (provider.id.includes('open-windows') || provider.id.includes('recent-files')))) {
                let previousProviderResults = previousResults[provider.id];
                this._doProviderSearch(provider, previousProviderResults);
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

// fixes app is null error if search provider id is not a desktop app id.
// is not accessible in 45
/* const ProviderInfo = {
    animateLaunch() {
        let appSys = Shell.AppSystem.get_default();
        let app = appSys.lookup_app(this.provider.appInfo.get_id());
        if (app && app.state === Shell.AppState.STOPPED)
            IconGrid.zoomOutActor(this._content);
    },
};*/
